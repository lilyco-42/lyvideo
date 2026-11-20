import {NextRequest, NextResponse} from 'next/server';

import {cleanupOld, getJob, logTail, progressPercent, readProgress} from '@/lib/jobs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('id') || '';
  const job = await getJob(id);
  if (!job) return NextResponse.json({detail: '任务不存在'}, {status: 404});
  await cleanupOld();

  const progress = await readProgress(job);
  const terminal = job.state === 'done' || job.state === 'error' || job.state === 'cancelled';
  const finalizing = !terminal && progress?.state === 'done';
  const state = terminal ? job.state : finalizing ? 'burning' : (progress?.state || job.state);
  const steps = (progress?.steps || job.steps || []).map((s: any) => ({
    name: String(s?.name || ''),
    ok: Boolean(s?.ok),
    detail: s?.detail ? String(s.detail).slice(0, 1000) : '',
  }));
  const error = job.error || (progress?.state === 'error'
    ? String(progress?.steps?.at?.(-1)?.detail || '处理失败')
    : '');

  return NextResponse.json({
    id: job.id,
    state,
    percent: finalizing ? 95 : progressPercent(state),
    steps,
    error,
    log_tail: state === 'error' ? await logTail(job) : '',
    download_url: job.state === 'done' && job.output
      ? `/api/subtitle-video/download?id=${job.id}`
      : null,
    download_name: job.downloadName,
    elapsed_ms: Date.now() - job.createdAt,
  });
}