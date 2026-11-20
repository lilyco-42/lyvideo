'use client';

import {useCallback, useEffect, useMemo, useRef, useState, type DragEvent} from 'react';
import {Button} from '@/components/ui/button';
import {Card, CardTitle} from '@/components/ui/card';
import {Input} from '@/components/ui/input';

type UiState =
  | 'idle'
  | 'uploading'
  | 'queued'
  | 'preparing'
  | 'subtitles'
  | 'burning'
  | 'done'
  | 'error'
  | 'cancelled';

interface PickedFile {
  name: string;
  size: number;
  file: File;
}

interface EnvInfo {
  platform?: string;
  arch?: string;
  node?: string;
  ready?: boolean;
  error?: string;
  python?: {ok: boolean; source?: string; version?: string; cmd?: string};
  ffmpeg?: {ok: boolean; version?: string; cmd?: string};
  font?: string | null;
}

interface JobStep {
  name: string;
  ok: boolean;
  detail: string;
}

interface JobStatus {
  id: string;
  state: UiState;
  percent: number;
  steps: JobStep[];
  error: string;
  log_tail: string;
  download_url: string | null;
  download_name: string;
  elapsed_ms: number;
}

interface UploadResult {
  upload_id: string;
  name: string;
  size: number;
}

const VIDEO_RE = /\.(mp4|mov|mkv|webm|avi|m4v)$/i;
const AUDIO_RE = /\.(mp3|wav|m4a|aac|flac|ogg|opus)$/i;

function formatSize(size: number): string {
  if (size < 1024) return size + ' B';
  if (size < 1024 * 1024) return (size / 1024).toFixed(1) + ' KB';
  if (size < 1024 * 1024 * 1024) return (size / 1024 / 1024).toFixed(1) + ' MB';
  return (size / 1024 / 1024 / 1024).toFixed(2) + ' GB';
}

function isVideoFile(file: File): boolean {
  return file.type.startsWith('video/') || VIDEO_RE.test(file.name);
}

function isAudioFile(file: File): boolean {
  return file.type.startsWith('audio/') || AUDIO_RE.test(file.name);
}

function uploadFile(
  file: File,
  kind: 'video' | 'music',
  onProgress: (percent: number) => void,
  onXhr: (xhr: XMLHttpRequest | null) => void,
): Promise<UploadResult> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    onXhr(xhr);
    xhr.open('POST', `/api/subtitle-video/upload?kind=${kind}&name=${encodeURIComponent(file.name)}`);
    xhr.responseType = 'text';
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(Math.round((event.loaded / event.total) * 100));
    };
    xhr.onload = () => {
      onXhr(null);
      let data: any = {};
      try {
        data = JSON.parse(xhr.responseText || '{}');
      } catch {}
      if (xhr.status >= 200 && xhr.status < 300 && data.upload_id) {
        resolve(data as UploadResult);
      } else {
        reject(new Error(data.detail || `上传失败（HTTP ${xhr.status}）`));
      }
    };
    xhr.onerror = () => {
      onXhr(null);
      reject(new Error('网络错误，上传失败'));
    };
    xhr.onabort = () => {
      onXhr(null);
      reject(new Error('已取消'));
    };
    xhr.send(file);
  });
}

const STATE_TEXT: Record<UiState, string> = {
  idle: '等待视频',
  uploading: '正在上传视频…',
  queued: '已排队，等待处理…',
  preparing: '准备素材与混音…',
  subtitles: '正在识别并生成简体字幕…',
  burning: '正在把字幕烧录进视频…',
  done: '完成，可以下载字幕视频',
  error: '出错了',
  cancelled: '已取消',
};

const STEPS = [
  {id: 'preparing', label: '准备素材'},
  {id: 'subtitles', label: '识别字幕'},
  {id: 'burning', label: '烧录成片'},
  {id: 'done', label: '完成'},
] as const;

function stepIndex(state: UiState): number {
  if (state === 'queued' || state === 'uploading') return 0;
  if (state === 'preparing') return 0;
  if (state === 'subtitles') return 1;
  if (state === 'burning') return 2;
  if (state === 'done') return 4;
  return 0;
}

export default function Page() {
  const [video, setVideo] = useState<PickedFile | null>(null);
  const [music, setMusic] = useState<PickedFile | null>(null);
  const [dragging, setDragging] = useState(false);
  const [gain, setGain] = useState('10');
  const [state, setState] = useState<UiState>('idle');
  const [uploadPct, setUploadPct] = useState(0);
  const [jobId, setJobId] = useState('');
  const [job, setJob] = useState<JobStatus | null>(null);
  const [error, setError] = useState('');
  const [env, setEnv] = useState<EnvInfo | null>(null);

  const videoInput = useRef<HTMLInputElement>(null);
  const musicInput = useRef<HTMLInputElement>(null);
  const xhrRef = useRef<XMLHttpRequest | null>(null);
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollErrors = useRef(0);
  const cancelRef = useRef(false);

  const busy = state === 'uploading' || state === 'queued' || state === 'preparing' ||
    state === 'subtitles' || state === 'burning';

  useEffect(() => {
    let alive = true;
    fetch('/api/subtitle-video/env', {cache: 'no-store'})
      .then((r) => r.json())
      .then((data) => { if (alive) setEnv(data); })
      .catch(() => { if (alive) setEnv({ready: false}); });
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    const prevent = (event: globalThis.DragEvent) => event.preventDefault();
    window.addEventListener('dragover', prevent);
    window.addEventListener('drop', prevent);
    return () => {
      window.removeEventListener('dragover', prevent);
      window.removeEventListener('drop', prevent);
    };
  }, []);

  useEffect(() => {
    return () => {
      if (pollRef.current) clearTimeout(pollRef.current);
      xhrRef.current?.abort();
    };
  }, []);

  const acceptVideo = useCallback((file?: File | null) => {
    if (!file) return;
    if (!isVideoFile(file)) {
      setError('请拖入视频文件（mp4 / mov / mkv / webm / avi / m4v）。');
      return;
    }
    setError('');
    setVideo({name: file.name, size: file.size, file});
    setJob(null);
    setState('idle');
    setUploadPct(0);
  }, []);

  const acceptMusic = useCallback((file?: File | null) => {
    if (!file) return;
    if (!isAudioFile(file)) {
      setError('背景音乐请拖入音频文件（mp3 / wav / m4a / aac / flac / ogg / opus）。');
      return;
    }
    setError('');
    setMusic({name: file.name, size: file.size, file});
    setJob(null);
    setState('idle');
  }, []);

  const onDrop = useCallback((event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragging(false);
    const files = Array.from(event.dataTransfer.files || []);
    const videoFile = files.find(isVideoFile);
    const audioFile = files.find(isAudioFile);
    if (videoFile) acceptVideo(videoFile);
    if (audioFile) acceptMusic(audioFile);
    if (!videoFile && !audioFile) setError('没有识别到可用的视频或音频文件。');
  }, [acceptVideo, acceptMusic]);

  const poll = useCallback(async (id: string) => {
    if (cancelRef.current) return;
    try {
      const response = await fetch(`/api/subtitle-video/status?id=${encodeURIComponent(id)}`, {cache: 'no-store'});
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.detail || `状态查询失败（HTTP ${response.status}）`);
      pollErrors.current = 0;
      setJob(data);
      setState(data.state);
      if (data.error) setError(data.error);
      if (data.state !== 'done' && data.state !== 'error' && data.state !== 'cancelled') {
        pollRef.current = setTimeout(() => poll(id), 1500);
      }
    } catch (e: any) {
      pollErrors.current += 1;
      if (pollErrors.current >= 4) {
        setState('error');
        setError(e?.message || '状态查询失败');
        return;
      }
      pollRef.current = setTimeout(() => poll(id), 2500);
    }
  }, []);

  const run = async () => {
    if (!video) {
      setError('请先拖入视频，再点击生成。');
      return;
    }
    cancelRef.current = false;
    pollErrors.current = 0;
    setError('');
    setJob(null);
    setJobId('');
    setUploadPct(0);
    setState('uploading');
    try {
      const videoUpload = await uploadFile(
        video.file, 'video',
        (p) => setUploadPct(music ? Math.round(p * 0.55) : p),
        (xhr) => { xhrRef.current = xhr; },
      );
      let musicUpload: UploadResult | null = null;
      if (music) {
        musicUpload = await uploadFile(
          music.file, 'music',
          (p) => setUploadPct(55 + Math.round(p * 0.45)),
          (xhr) => { xhrRef.current = xhr; },
        );
      } else {
        setUploadPct(100);
      }
      if (cancelRef.current) return;

      const response = await fetch('/api/subtitle-video', {
        method: 'POST',
        headers: {'content-type': 'application/json'},
        body: JSON.stringify({
          video_upload_id: videoUpload.upload_id,
          music_upload_id: musicUpload?.upload_id || null,
          voice_gain_db: Number(gain) || 10,
          output_name: video.name,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.detail || `启动任务失败（HTTP ${response.status}）`);
      if (!data.id) throw new Error('任务启动失败：缺少任务 ID');
      setJobId(data.id);
      setState(data.state === 'queued' ? 'queued' : 'preparing');
      poll(data.id);
    } catch (e: any) {
      if (cancelRef.current) {
        setState('cancelled');
        setError('已取消');
        return;
      }
      setState('error');
      setError(e?.message || String(e));
    }
  };

  const cancel = async () => {
    cancelRef.current = true;
    if (pollRef.current) clearTimeout(pollRef.current);
    xhrRef.current?.abort();
    if (jobId) {
      try {
        await fetch(`/api/subtitle-video?id=${encodeURIComponent(jobId)}`, {method: 'DELETE'});
      } catch {}
    }
    setState('cancelled');
    setError('已取消');
  };

  const percent = state === 'uploading'
    ? uploadPct
    : job?.percent ?? (state === 'done' ? 100 : state === 'error' || state === 'cancelled' ? 100 : 0);
  const statusText = STATE_TEXT[state];
  const currentStep = stepIndex(state);

  const envBadges = useMemo(() => {
    if (!env) return [];
    return [
      {
        label: env.python?.ok ? `Python ${env.python.version || ''}` : 'Python 未就绪',
        ok: Boolean(env.python?.ok),
      },
      {
        label: env.ffmpeg?.ok ? 'ffmpeg 就绪' : 'ffmpeg 未就绪',
        ok: Boolean(env.ffmpeg?.ok),
      },
      {
        label: env.font ? 'CJK 字体就绪' : 'CJK 字体未找到',
        ok: Boolean(env.font),
      },
    ];
  }, [env]);

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
      <header className="mb-6 flex flex-col gap-4 sm:mb-8 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">lyvideo · 添加字幕</h1>
          <p className="mt-1 text-sm text-slate-400 sm:text-base">
            拖入视频，自动生成简体字幕成片并下载。服务端本机处理，不上传云端。
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <a
            className="inline-flex min-h-11 items-center justify-center rounded-md border border-slate-700 px-4 text-sm text-slate-100 hover:bg-slate-800"
            href="https://github.com/lilyco-42/lyvideo"
            target="_blank"
            rel="noreferrer"
          >
            GitHub
          </a>
        </div>
      </header>

      <div className="mb-5 flex flex-wrap gap-2 text-xs" aria-label="运行环境">
        <span className="rounded-full border border-slate-700 px-2.5 py-1 text-slate-300">
          {env?.platform || 'detecting'} / {env?.arch || '—'}
        </span>
        {envBadges.map((badge) => (
          <span
            key={badge.label}
            className={
              'rounded-full border px-2.5 py-1 ' +
              (badge.ok
                ? 'border-emerald-800 bg-emerald-950/40 text-emerald-200'
                : 'border-amber-800 bg-amber-950/40 text-amber-200')
            }
          >
            {badge.label}
          </span>
        ))}
      </div>

      {env && env.ready === false && (
        <div className="mb-5 rounded-lg border border-amber-800 bg-amber-950/30 p-3 text-sm text-amber-100">
          运行环境未就绪。请在项目根目录创建 <code>.venv</code> 并执行 <code>pip install -e .</code>，
          同时确保 ffmpeg 在 PATH 中。Windows 可用 <code>py -3.12 -m venv .venv</code>。
          {env.error ? <div className="mt-1 break-all text-xs text-amber-300/80">{env.error}</div> : null}
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
        <Card className="p-4 sm:p-5">
          <CardTitle>① 拖入视频</CardTitle>
          <div
            className={
              'mt-4 cursor-pointer rounded-xl border-2 border-dashed p-6 text-center transition-colors sm:p-10 ' +
              (dragging
                ? 'border-indigo-400 bg-indigo-950/40'
                : 'border-slate-700 bg-slate-900/40 hover:border-slate-500')
            }
            onDragEnter={(e) => { e.preventDefault(); setDragging(true); }}
            onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; setDragging(true); }}
            onDragLeave={(e) => { e.preventDefault(); setDragging(false); }}
            onDrop={onDrop}
            onClick={() => videoInput.current?.click()}
            role="button"
            tabIndex={0}
            aria-label="选择或拖入视频"
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') videoInput.current?.click(); }}
          >
            <div className="text-4xl" aria-hidden="true">🎬</div>
            <div className="mt-2 break-all font-medium">
              {video ? video.name : '把视频拖到这里，或点击选择'}
            </div>
            <div className="mt-1 text-sm text-slate-400">
              {video ? formatSize(video.size) : 'mp4 / mov / mkv / webm / avi / m4v（支持 4GB+ 大文件）'}
            </div>
          </div>
          <input
            ref={videoInput}
            className="hidden"
            type="file"
            accept="video/*,.mp4,.mov,.mkv,.webm,.avi,.m4v"
            onChange={(e) => { acceptVideo(e.target.files?.[0]); e.currentTarget.value = ''; }}
          />

          <div className="mt-4 rounded-xl border border-slate-800 p-4">
            <div className="text-sm text-slate-400">背景音乐（可选，可一起拖入）</div>
            <Button
              variant="outline"
              className="mt-2 min-h-11 w-full"
              onClick={() => musicInput.current?.click()}
            >
              {music ? '更换：' + music.name : '选择 mp3 / wav / m4a'}
            </Button>
            {music && <div className="mt-1 text-sm text-slate-400">{formatSize(music.size)}</div>}
            <input
              ref={musicInput}
              className="hidden"
              type="file"
              accept="audio/*,.mp3,.wav,.m4a,.aac,.flac,.ogg,.opus"
              onChange={(e) => { acceptMusic(e.target.files?.[0]); e.currentTarget.value = ''; }}
            />
            <label htmlFor="gain" className="mt-3 block text-sm text-slate-400">
              人声高于音乐 dB
            </label>
            <Input
              id="gain"
              className="mt-1 min-h-11"
              value={gain}
              onChange={(e) => setGain(e.target.value)}
              inputMode="decimal"
              type="number"
              min={-30}
              max={30}
              step={1}
            />
          </div>

          <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center">
            <Button
              className="min-h-11 w-full sm:w-auto"
              onClick={run}
              disabled={!video || busy}
            >
              {busy ? '处理中…' : '生成字幕视频'}
            </Button>
            {busy && (
              <Button variant="outline" className="min-h-11 w-full sm:w-auto" onClick={cancel}>
                取消
              </Button>
            )}
            <span className="text-sm text-slate-400" aria-live="polite">{statusText}</span>
          </div>

          {(state === 'uploading' || busy || state === 'done') && (
            <div className="mt-4">
              <div className="mb-1 flex items-center justify-between text-xs text-slate-400">
                <span>进度</span>
                <span>{Math.min(100, Math.max(0, percent))}%</span>
              </div>
              <div
                className="h-2 w-full overflow-hidden rounded-full bg-slate-800"
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.min(100, Math.max(0, percent))}
              >
                <div
                  className="h-full rounded-full bg-indigo-500 transition-[width] duration-300"
                  style={{width: `${Math.min(100, Math.max(0, percent))}%`}}
                />
              </div>
            </div>
          )}

          {error && (
            <div className="mt-3 rounded-md bg-red-950/40 p-3 text-sm text-red-100">
              <div className="font-medium">处理失败</div>
              <pre className="mt-1 max-h-64 overflow-auto whitespace-pre-wrap break-all text-xs text-red-200/90">
                {error}
              </pre>
            </div>
          )}
        </Card>

        <Card className="p-4 sm:p-5">
          <CardTitle>② 处理进度与下载</CardTitle>
          <ol className="mt-4 grid grid-cols-2 gap-2 text-sm sm:grid-cols-4 lg:grid-cols-2">
            {STEPS.map((step, index) => {
              const active = state !== 'idle' && state !== 'error' && state !== 'cancelled' && currentStep >= index;
              const failed = state === 'error' && currentStep === index;
              return (
                <li
                  key={step.id}
                  className={
                    'rounded-lg border px-3 py-2 ' +
                    (failed
                      ? 'border-red-800 bg-red-950/30 text-red-200'
                      : active
                        ? 'border-indigo-700 bg-indigo-950/30 text-indigo-100'
                        : 'border-slate-800 text-slate-400')
                  }
                >
                  <span className="mr-1 font-mono text-xs">{index + 1}</span>
                  {step.label}
                </li>
              );
            })}
          </ol>

          {job?.state === 'done' && job.download_url && (
            <div className="mt-5 rounded-xl border border-indigo-700 bg-indigo-950/30 p-4">
              <div className="text-sm text-slate-300">成片已生成</div>
              <a
                className="mt-3 inline-flex min-h-11 w-full items-center justify-center rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500"
                href={job.download_url}
                download={job.download_name}
              >
                下载字幕视频
              </a>
              <div className="mt-2 break-all text-xs text-slate-400">{job.download_name}</div>
              <div className="mt-1 text-xs text-slate-500">
                用时 {Math.max(1, Math.round((job.elapsed_ms || 0) / 1000))} 秒
              </div>
            </div>
          )}

          {job?.steps?.length ? (
            <details className="mt-5 rounded-lg border border-slate-800 p-3 text-sm">
              <summary className="cursor-pointer text-slate-300">流水线步骤</summary>
              <ul className="mt-2 space-y-1 text-xs">
                {job.steps.map((s, i) => (
                  <li key={s.name + i} className={s.ok ? 'text-emerald-300' : 'text-red-300'}>
                    <span className="mr-1">{s.ok ? '✓' : '✗'}</span>
                    {s.name}
                    {s.detail ? <span className="ml-1 text-slate-500">{s.detail.slice(0, 160)}</span> : null}
                  </li>
                ))}
              </ul>
            </details>
          ) : null}

          {env?.ready && (
            <div className="mt-5 space-y-1 text-xs text-slate-500">
              <div>Python：{env.python?.source} {env.python?.version}</div>
              <div className="break-all">ffmpeg：{env.ffmpeg?.version}</div>
              <div className="break-all">字体：{env.font || '系统回退'}</div>
            </div>
          )}
        </Card>
      </div>

      <footer className="mt-8 text-xs text-slate-500">
        跨平台说明：Windows / macOS / Linux 自动选择 Python、ffmpeg 与中文字体；手机浏览器可上传，
        下载使用服务端流式响应。
      </footer>
    </main>
  );
}