import {NextRequest, NextResponse} from 'next/server';
import {readFile, stat} from 'node:fs/promises';
import path from 'node:path';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const file = req.nextUrl.searchParams.get('file') || '';
  if (!file.startsWith('/tmp/lyvideo-web-') || !path.extname(file).match(/^\.(mp4|mkv|mov|webm|m4v)$/i)) {
    return NextResponse.json({detail: 'invalid file'}, {status: 400});
  }
  try {
    const info = await stat(file);
    if (!info.isFile()) return NextResponse.json({detail: 'invalid file'}, {status: 400});
    const data = await readFile(file);
    return new NextResponse(new Uint8Array(data), {
      headers: {
        'Content-Type': 'video/mp4',
        'Content-Disposition': 'attachment; filename="lyvideo-subtitled.mp4"',
        'Cache-Control': 'no-store',
      },
    });
  } catch {
    return NextResponse.json({detail: 'file not found'}, {status: 404});
  }
}
