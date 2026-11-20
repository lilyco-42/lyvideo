import {existsSync} from 'node:fs';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import path from 'node:path';
import os from 'node:os';

const execFileAsync = promisify(execFile);

export const IS_WIN = process.platform === 'win32';
export const IS_MAC = process.platform === 'darwin';

export type PythonRuntime = {cmd: string; args: string[]; source: string; version?: string};

export function findProjectRoot(): string {
  const explicit = process.env.LYVIDEO_PROJECT_ROOT;
  if (explicit && existsSync(path.join(explicit, 'pyproject.toml'))) return explicit;

  let current = process.cwd();
  for (let depth = 0; depth < 8; depth += 1) {
    if (existsSync(path.join(current, 'pyproject.toml')) &&
        existsSync(path.join(current, 'lyvideo'))) {
      return current;
    }
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return process.cwd();
}

export function pythonCandidates(root: string): PythonRuntime[] {
  const out: PythonRuntime[] = [];
  if (process.env.LYVIDEO_PYTHON) {
    out.push({cmd: process.env.LYVIDEO_PYTHON, args: [], source: 'LYVIDEO_PYTHON'});
  }
  const venv = path.join(root, '.venv');
  out.push({
    cmd: IS_WIN ? path.join(venv, 'Scripts', 'python.exe') : path.join(venv, 'bin', 'python'),
    args: [],
    source: '.venv',
  });
  if (IS_WIN) {
    out.push({cmd: 'py', args: ['-3'], source: 'py -3'});
    out.push({cmd: 'python', args: [], source: 'python'});
  } else {
    out.push({cmd: 'python3', args: [], source: 'python3'});
    out.push({cmd: 'python', args: [], source: 'python'});
  }
  return out;
}

export async function resolvePython(root = findProjectRoot()): Promise<PythonRuntime> {
  for (const candidate of pythonCandidates(root)) {
    if (candidate.cmd.includes(path.sep) && !existsSync(candidate.cmd)) continue;
    try {
      const {stdout} = await execFileAsync(
        candidate.cmd,
        [...candidate.args, '-c', 'import sys; print(sys.version.split()[0])'],
        {timeout: 6000, windowsHide: true},
      );
      return {...candidate, version: stdout.trim()};
    } catch {
      // try next candidate
    }
  }
  throw new Error('未找到可用的 Python。请先创建 .venv，或设置 LYVIDEO_PYTHON。');
}

export async function resolveFfmpeg(): Promise<{cmd: string; version: string}> {
  const cmd = process.env.LYVIDEO_FFMPEG || (IS_WIN ? 'ffmpeg.exe' : 'ffmpeg');
  const {stdout} = await execFileAsync(cmd, ['-version'], {timeout: 6000, windowsHide: true});
  return {cmd, version: stdout.split('\n')[0] || 'ffmpeg'};
}

export function safeUploadName(name: string): string {
  const raw = String(name || 'upload').replace(/\\/g, '/');
  let base = path.basename(raw).replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_');
  base = base.replace(/^[.\s]+|[.\s]+$/g, '');
  if (!base) base = 'upload';
  if (IS_WIN && /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\..*)?$/i.test(base)) base = '_' + base;
  if (base.length > 120) {
    const ext = path.extname(base).slice(0, 12);
    base = base.slice(0, 108) + ext;
  }
  return base;
}

export function sanitizeDownloadName(original: string): string {
  const parsed = path.parse(safeUploadName(original));
  const base = (parsed.name || 'video').slice(0, 100);
  return `${base}.subtitled.mp4`;
}

export function tempRoot(): string {
  return path.join(os.tmpdir(), 'lyvideo-web');
}

export function uploadsRoot(): string {
  return path.join(tempRoot(), 'uploads');
}

export function jobsRoot(): string {
  return path.join(tempRoot(), 'jobs');
}

export function normalizeGain(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return 10;
  return Math.min(30, Math.max(-30, n));
}

export function isInside(parent: string, child: string): boolean {
  const p = path.resolve(parent);
  const c = path.resolve(child);
  const rel = path.relative(IS_WIN ? p.toLowerCase() : p, IS_WIN ? c.toLowerCase() : c);
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}

export function contentTypeFor(file: string): string {
  const ext = path.extname(file).toLowerCase();
  if (ext === '.webm') return 'video/webm';
  if (ext === '.mkv') return 'video/x-matroska';
  if (ext === '.mov') return 'video/quicktime';
  if (ext === '.m4v') return 'video/x-m4v';
  return 'video/mp4';
}

export function contentDisposition(filename: string): string {
  const fallback = filename.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_') || 'download.mp4';
  const encoded = encodeURIComponent(filename).replace(/['()*]/g, (c) =>
    '%' + c.charCodeAt(0).toString(16).toUpperCase());
  return `attachment; filename="${fallback}"; filename*=UTF-8''${encoded}`;
}

export function recommendedFontPath(): string | null {
  const candidates = IS_WIN
    ? [
        path.join(process.env.WINDIR || 'C:\\Windows', 'Fonts', 'msyh.ttc'),
        path.join(process.env.WINDIR || 'C:\\Windows', 'Fonts', 'simhei.ttf'),
      ]
    : IS_MAC
      ? ['/System/Library/Fonts/PingFang.ttc', '/System/Library/Fonts/Hiragino Sans GB.ttc']
      : [
          '/usr/share/fonts/noto-cjk/NotoSansCJK-Regular.ttc',
          '/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc',
        ];
  return candidates.find((p) => existsSync(p)) || null;
}