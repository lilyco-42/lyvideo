import {NextResponse} from 'next/server';

import {
  findProjectRoot,
  recommendedFontPath,
  resolveFfmpeg,
  resolvePython,
  tempRoot,
} from '@/lib/lyvideo-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const root = findProjectRoot();
  let python: any = null;
  let ffmpeg: any = null;
  let error = '';
  try {
    python = await resolvePython(root);
  } catch (e: any) {
    error += String(e?.message || e);
  }
  try {
    ffmpeg = await resolveFfmpeg();
  } catch (e: any) {
    error += (error ? '；' : '') + String(e?.message || e);
  }
  return NextResponse.json({
    platform: process.platform,
    arch: process.arch,
    node: process.version,
    project_root: root,
    temp_root: tempRoot(),
    python: python ? {ok: true, source: python.source, version: python.version, cmd: python.cmd} : {ok: false},
    ffmpeg: ffmpeg ? {ok: true, version: ffmpeg.version, cmd: ffmpeg.cmd} : {ok: false},
    font: recommendedFontPath(),
    ready: Boolean(python && ffmpeg),
    error,
  });
}