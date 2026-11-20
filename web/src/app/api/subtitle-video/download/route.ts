import {NextRequest, NextResponse} from 'next/server';
import {createReadStream} from 'node:fs';
import {stat} from 'node:fs/promises';
import {Readable} from 'node:stream';

import {contentDisposition, contentTypeFor} from '@/lib/lyvideo-server';
import {getJob} from '@/lib/jobs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function fileInfo(id: string) {
  const job = await getJob(id);
  if (!job || job.state !== 'done' || !job.output) return null;
  const info = await stat(job.output);
  if (!info.isFile() || info.size <= 0) return null;
  return {job, info};
}

export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('id') || '';
  const data = await fileInfo(id);
  if (!data) return NextResponse.json({detail: '文件不存在或任务未完成'}, {status: 404});

  const {job, info} = data;
  const range = req.headers.get('range');
  let start = 0;
  let end = info.size - 1;
  let status = 200;
  if (range) {
    const match = /^bytes=(\d*)-(\d*)$/.exec(range.trim());
    if (!match) {
      return new NextResponse(null, {
        status: 416,
        headers: {'Content-Range': `bytes */${info.size}`},
      });
    }
    if (match[1]) start = Number(match[1]);
    if (match[2]) end = Number(match[2]);
    if (!match[1] && match[2]) start = Math.max(0, info.size - Number(match[2]));
    if (start > end || start >= info.size) {
      return new NextResponse(null, {
        status: 416,
        headers: {'Content-Range': `bytes */${info.size}`},
      });
    }
    end = Math.min(end, info.size - 1);
    status = 206;
  }

  const stream = createReadStream(job.output, {start, end});
  const headers: Record<string, string> = {
    'Content-Type': contentTypeFor(job.output),
    'Content-Length': String(end - start + 1),
    'Content-Disposition': contentDisposition(job.downloadName),
    'Accept-Ranges': 'bytes',
    'Cache-Control': 'no-store',
  };
  if (status === 206) headers['Content-Range'] = `bytes ${start}-${end}/${info.size}`;

  return new NextResponse(Readable.toWeb(stream) as unknown as ReadableStream, {status, headers});
}

export async function HEAD(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('id') || '';
  const data = await fileInfo(id);
  if (!data) return new NextResponse(null, {status: 404});
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Content-Type': contentTypeFor(data.job.output),
      'Content-Length': String(data.info.size),
      'Content-Disposition': contentDisposition(data.job.downloadName),
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'no-store',
    },
  });
}