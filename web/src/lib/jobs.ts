import {spawn, type ChildProcess} from 'node:child_process';
import {createWriteStream} from 'node:fs';
import {copyFile, mkdir, readFile, readdir, rename, rm, stat, writeFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import path from 'node:path';

import {
  findProjectRoot,
  isInside,
  jobsRoot,
  normalizeGain,
  resolvePython,
  safeUploadName,
  sanitizeDownloadName,
  uploadsRoot,
} from './lyvideo-server';

export type JobState =
  | 'queued'
  | 'preparing'
  | 'subtitles'
  | 'burning'
  | 'done'
  | 'error'
  | 'cancelled';

export interface JobStep {
  name: string;
  ok: boolean;
  output?: string | null;
  detail?: string | null;
}

export interface UploadMeta {
  id: string;
  kind: 'video' | 'music';
  originalName: string;
  storedName: string;
  size: number;
  createdAt: number;
}

export interface Job {
  id: string;
  dir: string;
  state: JobState;
  steps: JobStep[];
  error: string;
  output: string;
  downloadName: string;
  createdAt: number;
  updatedAt: number;
  finishedAt?: number;
  child?: ChildProcess;
}

interface Store {
  jobs: Map<string, Job>;
  uploads: Map<string, UploadMeta>;
  lastCleanup: number;
  loaded: boolean;
  loading?: Promise<void>;
}

const globalStore = globalThis as unknown as {__lyvideoStore?: Store};
if (!globalStore.__lyvideoStore) {
  globalStore.__lyvideoStore = {
    jobs: new Map(),
    uploads: new Map(),
    lastCleanup: 0,
    loaded: false,
  };
}
export const store = globalStore.__lyvideoStore;

const JOB_TTL_MS = 24 * 60 * 60 * 1000;
const UPLOAD_TTL_MS = 24 * 60 * 60 * 1000;
const JOB_TIMEOUT_MS = 2 * 60 * 60 * 1000;
const MAX_LOG = 4 * 1024 * 1024;

function killTree(child: ChildProcess): void {
  const pid = child.pid;
  if (!pid) return;
  if (process.platform === 'win32') {
    spawn('taskkill', ['/pid', String(pid), '/T', '/F'], {windowsHide: true, stdio: 'ignore'}).unref?.();
    return;
  }
  try {
    process.kill(-pid, 'SIGTERM');
  } catch {
    try {
      child.kill('SIGTERM');
    } catch {}
  }
}

function jobFile(job: Job): string {
  return path.join(job.dir, 'job.json');
}

async function ensureLoaded(): Promise<void> {
  if (store.loaded) return;
  if (!store.loading) {
    store.loading = (async () => {
      try {
        const entries = await readdir(jobsRoot(), {withFileTypes: true});
        for (const entry of entries) {
          if (!entry.isDirectory()) continue;
          try {
            const raw = await readFile(path.join(jobsRoot(), entry.name, 'job.json'), 'utf-8');
            const job = JSON.parse(raw) as Job;
            delete job.child;
            if (job.state !== 'done' && job.state !== 'error' && job.state !== 'cancelled') {
              job.state = 'error';
              job.error = '服务重启，任务已中断，请重新提交';
            }
            store.jobs.set(job.id, job);
          } catch {}
        }
      } catch {
      } finally {
        store.loaded = true;
        store.loading = undefined;
      }
    })();
  }
  await store.loading;
}

async function writeJob(job: Job): Promise<void> {
  const payload = {...job, child: undefined};
  try {
    const tmp = jobFile(job) + '.tmp';
    await writeFile(tmp, JSON.stringify(payload, null, 2), 'utf-8');
    await rename(tmp, jobFile(job));
  } catch {
    // status endpoint still has the in-memory job
  }
}

export async function getUpload(
  id: string,
  kind: 'video' | 'music',
): Promise<UploadMeta & {path: string}> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new Error('invalid upload id');
  const cached = store.uploads.get(id);
  const dir = path.join(uploadsRoot(), id);
  let meta = cached;
  if (!meta) {
    const raw = await readFile(path.join(dir, 'meta.json'), 'utf-8');
    meta = JSON.parse(raw) as UploadMeta;
  }
  if (meta.kind !== kind) throw new Error(`upload kind mismatch: expected ${kind}`);
  const file = path.join(dir, safeUploadName(meta.storedName));
  if (!isInside(dir, file)) throw new Error('invalid upload path');
  const info = await stat(file);
  if (!info.isFile() || info.size <= 0) throw new Error('upload file is empty');
  return {...meta, path: file};
}

function parseResult(stdout: string): any {
  const match = stdout.match(/\{[\s\S]*\}\s*$/);
  if (!match) throw new Error('pipeline did not return JSON');
  return JSON.parse(match[0]);
}

function appendTail(current: string, chunk: string): string {
  const next = current + chunk;
  return next.length > MAX_LOG ? next.slice(-MAX_LOG) : next;
}

export async function startJob(input: {
  videoUploadId: string;
  musicUploadId?: string | null;
  voiceGainDb?: number;
  outputName?: string | null;
}): Promise<Job> {
  await ensureLoaded();
  const video = await getUpload(input.videoUploadId, 'video');
  const music = input.musicUploadId
    ? await getUpload(input.musicUploadId, 'music')
    : null;

  const root = findProjectRoot();
  const python = await resolvePython(root);

  const id = randomUUID();
  const dir = path.join(jobsRoot(), id);
  await mkdir(path.join(dir, 'out'), {recursive: true});
  const job: Job = {
    id,
    dir,
    state: 'queued',
    steps: [],
    error: '',
    output: '',
    downloadName: sanitizeDownloadName(input.outputName || video.originalName),
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  store.jobs.set(id, job);
  await writeJob(job);

  const outDir = path.join(dir, 'out');
  const args = [
    ...python.args,
    '-m', 'lyvideo.cli', 'run',
    '--video', video.path,
    '--workspace', outDir,
    '--voice-gain-db', String(normalizeGain(input.voiceGainDb)),
  ];
  if (music) args.push('--music', music.path);

  const logStream = createWriteStream(path.join(dir, 'run.log'), {flags: 'a'});
  const env = {
    ...process.env,
    PYTHONPATH: root,
    PYTHONUNBUFFERED: '1',
    PYTHONIOENCODING: 'utf-8',
  };

  let child: ChildProcess;
  try {
    child = spawn(python.cmd, args, {
      cwd: root,
      env,
      windowsHide: true,
      detached: process.platform !== 'win32',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (e: any) {
    job.state = 'error';
    job.error = String(e?.message || e);
    job.updatedAt = Date.now();
    await writeJob(job);
    return job;
  }

  job.child = child;
  job.state = 'preparing';
  job.updatedAt = Date.now();
  await writeJob(job);

  const watchdog = setTimeout(async () => {
    if (!job.child) return;
    job.state = 'error';
    job.error = '任务超时（超过 2 小时），已终止';
    job.updatedAt = Date.now();
    killTree(child);
    await writeJob(job);
  }, JOB_TIMEOUT_MS);
  watchdog.unref?.();

  let stdout = '';
  let stderr = '';
  child.stdout?.on('data', (buf: Buffer) => {
    const text = buf.toString('utf8');
    stdout = appendTail(stdout, text);
    logStream.write(text);
  });
  child.stderr?.on('data', (buf: Buffer) => {
    const text = buf.toString('utf8');
    stderr = appendTail(stderr, text);
    logStream.write(text);
  });

  child.on('error', async (e) => {
    clearTimeout(watchdog);
    job.state = 'error';
    job.error = String(e?.message || e);
    job.updatedAt = Date.now();
    logStream.end(`\n[spawn error] ${job.error}\n`);
    await writeJob(job);
  });

  child.on('close', async (code, signal) => {
    clearTimeout(watchdog);
    job.child = undefined;
    job.updatedAt = Date.now();
    logStream.end();
    if (job.state === 'cancelled') {
      job.finishedAt = Date.now();
      await writeJob(job);
      return;
    }
    if (code === 0) {
      try {
        const result = parseResult(stdout);
        const finalPath = String(result.final_video || '');
        if (!finalPath || !isInside(outDir, finalPath)) {
          throw new Error('pipeline did not produce a valid final_video inside workspace');
        }
        const info = await stat(finalPath);
        if (!info.isFile() || info.size <= 0) throw new Error('final video is empty');
        const target = path.join(dir, job.downloadName);
        await copyFile(finalPath, target);
        job.output = target;
        job.steps = Array.isArray(result.steps) ? result.steps : [];
        job.state = 'done';
        job.finishedAt = Date.now();
      } catch (e: any) {
        job.state = 'error';
        job.error = String(e?.message || e).slice(0, 4000);
      }
    } else {
      job.state = 'error';
      job.error = (stderr.trim() || stdout.trim() ||
        `pipeline exited with code ${code}${signal ? ` (${signal})` : ''}`).slice(-4000);
    }
    await writeJob(job);
  });

  return job;
}

export async function getJob(id: string): Promise<Job | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  await ensureLoaded();
  return store.jobs.get(id) || null;
}

export async function cancelJob(id: string): Promise<boolean> {
  const job = await getJob(id);
  if (!job) return false;
  if (job.state === 'done' || job.state === 'error' || job.state === 'cancelled') return true;
  job.state = 'cancelled';
  job.error = '已取消';
  job.updatedAt = Date.now();
  if (job.child) killTree(job.child);
  setTimeout(() => {
    try {
      if (job.child?.pid) process.kill(-job.child.pid, 'SIGKILL');
    } catch {}
  }, 3000).unref?.();
  await writeJob(job);
  return true;
}

export async function readProgress(job: Job): Promise<any | null> {
  try {
    const raw = await readFile(path.join(job.dir, 'out', 'progress.json'), 'utf-8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export async function logTail(job: Job, max = 4000): Promise<string> {
  try {
    const raw = await readFile(path.join(job.dir, 'run.log'), 'utf-8');
    return raw.length > max ? raw.slice(-max) : raw;
  } catch {
    return '';
  }
}

export function progressPercent(state: JobState): number {
  return {
    queued: 5,
    preparing: 20,
    subtitles: 50,
    burning: 80,
    done: 100,
    error: 100,
    cancelled: 100,
  }[state] ?? 0;
}

export async function cleanupOld(): Promise<void> {
  await ensureLoaded();
  const now = Date.now();
  if (now - store.lastCleanup < 10 * 60 * 1000) return;
  store.lastCleanup = now;

  for (const [id, job] of store.jobs) {
    if (job.child) continue;
    if (now - job.updatedAt < JOB_TTL_MS) continue;
    store.jobs.delete(id);
    await rm(job.dir, {recursive: true, force: true}).catch(() => {});
  }
  for (const [id, meta] of store.uploads) {
    if (now - meta.createdAt < UPLOAD_TTL_MS) continue;
    store.uploads.delete(id);
    await rm(path.join(uploadsRoot(), id), {recursive: true, force: true}).catch(() => {});
  }
}