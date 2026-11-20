import {NextRequest, NextResponse} from 'next/server';

import {cancelJob, cleanupOld, startJob} from '@/lib/jobs';
import {normalizeGain} from '@/lib/lyvideo-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 3600;

export async function POST(req: NextRequest) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({detail: '无效的 JSON 请求'}, {status: 400});
  }
  const videoUploadId = String(body?.video_upload_id || '');
  if (!videoUploadId) {
    return NextResponse.json({detail: '缺少 video_upload_id'}, {status: 400});
  }
  try {
    const job = await startJob({
      videoUploadId,
      musicUploadId: body?.music_upload_id ? String(body.music_upload_id) : null,
      voiceGainDb: normalizeGain(body?.voice_gain_db),
      outputName: body?.output_name ? String(body.output_name) : null,
    });
    await cleanupOld();
    return NextResponse.json({
      id: job.id,
      state: job.state,
      download_name: job.downloadName,
    });
  } catch (e: any) {
    return NextResponse.json({detail: String(e?.message || e).slice(0, 1000)}, {status: 500});
  }
}

export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('id') || '';
  const ok = await cancelJob(id);
  if (!ok) return NextResponse.json({detail: '任务不存在'}, {status: 404});
  return NextResponse.json({ok: true});
}