import {NextRequest, NextResponse} from 'next/server';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {mkdtemp, writeFile, readFile, mkdir, stat} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const execFileAsync = promisify(execFile);

function safeName(name: string): string {
  const base = path.basename(name || 'upload').replace(/[^\w.\-\u4e00-\u9fff]/g, '_');
  return base || 'upload';
}

export async function POST(req: NextRequest) {
  let workdir = '';
  try {
    const form = await req.formData();
    const video = form.get('video');
    if (!(video instanceof File) || video.size === 0) {
      return NextResponse.json({detail: '缺少视频文件'}, {status: 400});
    }
    const music = form.get('music');
    const gain = String(form.get('voice_gain_db') || '10');
    workdir = await mkdtemp(path.join(tmpdir(), 'lyvideo-web-'));
    const incoming = path.join(workdir, 'incoming');
    const output = path.join(workdir, 'out');
    await mkdir(incoming, {recursive: true});
    await mkdir(output, {recursive: true});
    const videoPath = path.join(incoming, safeName(video.name));
    await writeFile(videoPath, Buffer.from(await video.arrayBuffer()));
    const args = ['-m', 'lyvideo.cli', 'run', '--video', videoPath, '--workspace', output, '--voice-gain-db', gain];
    if (music instanceof File && music.size > 0) {
      const musicPath = path.join(incoming, safeName(music.name));
      await writeFile(musicPath, Buffer.from(await music.arrayBuffer()));
      args.push('--music', musicPath);
    }
    const repoRoot = process.cwd();
    const python = path.join(repoRoot, '..', '.venv', 'bin', 'python');
    const {stdout} = await execFileAsync(python, args, {
      cwd: path.join(repoRoot, '..'),
      maxBuffer: 8 * 1024 * 1024,
      timeout: 30 * 60 * 1000,
      env: {...process.env, PYTHONPATH: repoRoot, HOME: process.env.HOME || '/home/lilyco'},
    });
    const result = JSON.parse(stdout.trim());
    const finalPath = result?.final_video || '';
    if (!finalPath || !path.isAbsolute(finalPath) || !finalPath.startsWith(output)) {
      return NextResponse.json({ok: false, detail: '未生成字幕视频', events: (result?.steps || []).map((s: any) => s.name)}, {status: 500});
    }
    const filename = 'lyvideo-subtitled-' + Date.now() + path.extname(finalPath);
    const downloadUrl = '/api/subtitle-video/download?file=' + encodeURIComponent(finalPath);
    return NextResponse.json({...result, download_filename: filename, download_url: downloadUrl});
  } catch (e: any) {
    const detail = String(e?.stderr || e?.message || e || '处理失败').slice(-4000);
    return NextResponse.json({ok: false, detail}, {status: 500});
  }
}

