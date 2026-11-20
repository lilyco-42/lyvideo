import {NextRequest, NextResponse} from 'next/server';
import {createWriteStream} from 'node:fs';
import {mkdir, rm, writeFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import path from 'node:path';
import {Readable, Transform} from 'node:stream';
import {pipeline} from 'node:stream/promises';

import {safeUploadName, uploadsRoot} from '@/lib/lyvideo-server';
import {store, type UploadMeta} from '@/lib/jobs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 3600;

const MAX_BYTES = 8 * 1024 * 1024 * 1024;

export async function POST(req: NextRequest) {
  const kind = req.nextUrl.searchParams.get('kind') === 'music' ? 'music' : 'video';
  const originalName = req.nextUrl.searchParams.get('name') || (kind === 'video' ? 'video.mp4' : 'audio.mp3');
  const storedName = safeUploadName(originalName);
  const declared = Number(req.headers.get('content-length') || 0);
  if (declared > MAX_BYTES) {
    return NextResponse.json({detail: '文件超过 8GB 上限'}, {status: 413});
  }
  if (!req.body) {
    return NextResponse.json({detail: '请求体为空'}, {status: 400});
  }

  const id = randomUUID();
  const dir = path.join(uploadsRoot(), id);
  const file = path.join(dir, storedName);
  let bytes = 0;
  try {
    await mkdir(dir, {recursive: true});
    const counter = new Transform({
      transform(chunk: Buffer, _enc, cb) {
        bytes += chunk.length;
        if (bytes > MAX_BYTES) {
          cb(new Error('文件超过 8GB 上限'));
          return;
        }
        cb(null, chunk);
      },
    });
    await pipeline(
      Readable.fromWeb(req.body as unknown as import('node:stream/web').ReadableStream),
      counter,
      createWriteStream(file),
    );
    if (bytes <= 0) throw new Error('上传文件为空');
    const meta: UploadMeta = {
      id,
      kind,
      originalName,
      storedName,
      size: bytes,
      createdAt: Date.now(),
    };
    await writeFile(path.join(dir, 'meta.json'), JSON.stringify(meta, null, 2), 'utf-8');
    store.uploads.set(id, meta);
    return NextResponse.json({upload_id: id, name: storedName, original_name: originalName, size: bytes});
  } catch (e: any) {
    await rm(dir, {recursive: true, force: true}).catch(() => {});
    return NextResponse.json({detail: String(e?.message || e).slice(0, 500)}, {status: 400});
  }
}