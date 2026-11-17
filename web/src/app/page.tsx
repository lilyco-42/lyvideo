import {Button} from '@/components/ui/button';
import {Card,CardTitle} from '@/components/ui/card';
import {Input} from '@/components/ui/input';

export default function Page() {
  return (
    <main className="mx-auto max-w-5xl p-8">
      <div className="mb-8 flex items-center justify-between">
        <div><h1 className="text-3xl font-bold">lyvideo</h1><p className="text-slate-400">视频处理 → ASR 简体字幕 → 烧录 → 发布dry-run 全流程</p></div>
        <Button>连接 MCP</Button>
      </div>
      <div className="grid gap-5 md:grid-cols-2">
        <Card><CardTitle>新建任务</CardTitle>
          <div className="mt-4 space-y-3">
            <label className="block text-sm text-slate-400">视频路径</label><Input defaultValue="/path/to/video.mp4" />
            <label className="block text-sm text-slate-400">音乐路径（可选）</label><Input placeholder="/path/to/music.mp3" />
            <label className="block text-sm text-slate-400">人声高于音乐 dB</label><Input defaultValue="10" type="number" />
            <div className="flex flex-wrap gap-2 pt-2"><Button>生成简体字幕成片</Button><Button variant="outline">发布 Dry Run</Button></div>
          </div>
        </Card>
        <Card><CardTitle>流水线</CardTitle>
          <ol className="mt-4 space-y-2 text-sm text-slate-300"><li>① ffmpeg 音频混合</li><li>② faster-whisper ASR</li><li>③ OpenCC 简体转换</li><li>④ ffmpeg 字幕烧录</li><li>⑤ publisher adapters（默认人工确认）</li></ol>
        </Card>
      </div>
    </main>
  );
}
