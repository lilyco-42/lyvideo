'use client';

import {useCallback, useMemo, useRef, useState} from 'react';
import {Button} from '@/components/ui/button';
import {Card, CardTitle} from '@/components/ui/card';
import {Input} from '@/components/ui/input';

type JobState = 'idle' | 'preparing' | 'subtitles' | 'burning' | 'done' | 'error';

interface PickedFile {
  name: string;
  size: number;
  file: File;
}

const formatSize = (size: number) => {
  if (size < 1024) return size + ' B';
  if (size < 1024 * 1024) return (size / 1024).toFixed(1) + ' KB';
  return (size / 1024 / 1024).toFixed(1) + ' MB';
};

export default function Page() {
  const [video, setVideo] = useState<PickedFile | null>(null);
  const [music, setMusic] = useState<PickedFile | null>(null);
  const [dragging, setDragging] = useState(false);
  const [gain, setGain] = useState('10');
  const [state, setState] = useState<JobState>('idle');
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState('');
  const videoInput = useRef<HTMLInputElement>(null);
  const musicInput = useRef<HTMLInputElement>(null);

  const acceptVideo = useCallback((file?: File | null) => {
    if (!file) return;
    const ok = file.type.startsWith('video/') || /\.(mp4|mov|mkv|webm|avi|m4v)$/i.test(file.name);
    if (!ok) {
      setError('请拖入视频文件（mp4 / mov / mkv / webm / avi / m4v）。');
      return;
    }
    setError('');
    setVideo({name: file.name, size: file.size, file});
    setState('idle');
    setResult(null);
  }, []);

  const acceptMusic = useCallback((file?: File | null) => {
    if (!file) return;
    const ok = file.type.startsWith('audio/') || /\.(mp3|wav|m4a|aac|flac|ogg)$/i.test(file.name);
    if (!ok) {
      setError('背景音乐请拖入音频文件（mp3 / wav / m4a / aac / flac / ogg）。');
      return;
    }
    setError('');
    setMusic({name: file.name, size: file.size, file});
    setState('idle');
    setResult(null);
  }, []);

  const onDrop = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragging(false);
    const files = Array.from(event.dataTransfer.files || []);
    const videoFile = files.find(f => f.type.startsWith('video/') || /\.(mp4|mov|mkv|webm|avi|m4v)$/i.test(f.name));
    const audioFile = files.find(f => f.type.startsWith('audio/') || /\.(mp3|wav|m4a|aac|flac|ogg)$/i.test(f.name));
    if (videoFile) acceptVideo(videoFile);
    if (audioFile) acceptMusic(audioFile);
    if (!videoFile && !audioFile) setError('没有识别到可用的视频或音频文件。');
  }, [acceptVideo, acceptMusic]);

  const status = useMemo(() => ({
    idle: '等待视频',
    preparing: '准备素材与混音…',
    subtitles: '正在识别并生成简体字幕…',
    burning: '正在把字幕烧录进视频…',
    done: '完成，可以下载字幕视频',
    error: '出错了',
  }[state]), [state]);

  const run = async () => {
    if (!video) { setError('请先拖入视频，再点击生成。'); return; }
    setError('');
    setResult(null);
    const form = new FormData();
    form.append('video', video.file, video.file.name);
    if (music) form.append('music', music.file, music.file.name);
    form.append('voice_gain_db', gain || '10');
    setState('preparing');
    try {
      const response = await fetch('/api/subtitle-video', {method: 'POST', body: form});
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.detail || data.error || ('请求失败: ' + response.status));
      if (data.events) {
        if (data.events.includes('mix_audio')) setState('subtitles');
        if (data.events.includes('asr_simplified')) setState('burning');
      }
      setState(data.ok ? 'done' : 'error');
      setResult(data);
      if (!data.ok) setError(data.detail || '流水线未成功完成。');
    } catch (e: any) {
      setState('error');
      setError(e?.message || String(e));
    }
  };

  return (
    <main className="mx-auto max-w-5xl p-8">
      <div className="mb-8 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">lyvideo · 添加字幕</h1>
          <p className="mt-1 text-slate-400">拖入视频，自动生成简体字幕成片并下载。</p>
        </div>
        <Button variant="outline" onClick={() => window.open('https://github.com/lilyco-42/lyvideo', '_blank')}>GitHub</Button>
      </div>

      <div className="grid gap-5 md:grid-cols-2">
        <Card className="p-5">
          <CardTitle>① 拖入视频</CardTitle>
          <div
            className={'mt-4 rounded-xl border-2 border-dashed p-10 text-center transition-colors ' + (dragging ? 'border-indigo-400 bg-indigo-950/40' : 'border-slate-700 bg-slate-900/40')}
            onDragEnter={e => { e.preventDefault(); setDragging(true); }}
            onDragOver={e => { e.preventDefault(); setDragging(true); }}
            onDragLeave={e => { e.preventDefault(); setDragging(false); }}
            onDrop={onDrop}
            onClick={() => videoInput.current?.click()}
            role="button"
            tabIndex={0}
            onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') videoInput.current?.click(); }}
          >
            <div className="text-4xl">🎬</div>
            <div className="mt-2 font-medium">{video ? video.name : '把视频拖到这里，或点击选择'}</div>
            <div className="mt-1 text-sm text-slate-400">{video ? formatSize(video.size) : 'mp4 / mov / mkv / webm / avi / m4v'}</div>
          </div>
          <input ref={videoInput} className="hidden" type="file" accept="video/*,.mp4,.mov,.mkv,.webm,.avi,.m4v" onChange={e => acceptVideo(e.target.files?.[0])} />

          <div className="mt-4 rounded-xl border border-slate-800 p-4">
            <div className="text-sm text-slate-400">背景音乐（可选，可一起拖入）</div>
            <Button variant="outline" className="mt-2 w-full" onClick={() => musicInput.current?.click()}>{music ? '更换：' + music.name : '选择 mp3 / wav / m4a'}</Button>
            {music && <div className="mt-1 text-sm text-slate-400">{formatSize(music.size)}</div>}
            <input ref={musicInput} className="hidden" type="file" accept="audio/*,.mp3,.wav,.m4a,.aac,.flac,.ogg" onChange={e => acceptMusic(e.target.files?.[0])} />
            <label className="mt-3 block text-sm text-slate-400">人声高于音乐 dB</label>
            <Input className="mt-1" value={gain} onChange={e => setGain(e.target.value)} inputMode="decimal" />
          </div>

          <div className="mt-4 flex items-center gap-3">
            <Button onClick={run} disabled={!video || state === 'preparing' || state === 'subtitles' || state === 'burning'}>{state === 'idle' || state === 'done' || state === 'error' ? '生成字幕视频' : '处理中…'}</Button>
            <span className="text-sm text-slate-400">{status}</span>
          </div>
          {error && <div className="mt-3 rounded-md bg-red-950/40 p-3 text-sm text-red-200">{error}</div>}
        </Card>

        <Card className="p-5">
          <CardTitle>② 下载字幕成片</CardTitle>
          <ol className="mt-4 space-y-2 text-sm text-slate-300">
            <li>① 接收拖入视频</li><li>② ffmpeg 混音</li><li>③ faster-whisper ASR</li><li>④ OpenCC 简体转换</li><li>⑤ ffmpeg 字幕烧录</li>
          </ol>
          {result?.ok && result?.download_url && (
            <div className="mt-5 rounded-xl border border-indigo-700 bg-indigo-950/30 p-4">
              <div className="text-sm text-slate-300">成片已生成</div>
              <Button className="mt-3 w-full" onClick={() => window.open(result.download_url, '_blank')}>下载字幕视频</Button>
              <div className="mt-2 break-all text-xs text-slate-400">{result.download_url}</div>
            </div>
          )}
          {result?.steps && (
            <pre className="mt-5 max-h-64 overflow-auto rounded-lg bg-slate-950 p-3 text-xs text-slate-300">{JSON.stringify(result.steps, null, 2)}</pre>
          )}
        </Card>
      </div>
    </main>
  );
}
