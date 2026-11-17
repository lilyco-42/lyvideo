# lyvideo

全 AI 视频流水线包：视频处理、音频混合、ASR、简体字幕生成与烧录、MCP、CLI、发布适配器、shadcn 风格 Web UI。

## 当前状态

- Python 包：`lyvideo/`
- CLI：`python -m lyvideo.cli run --video <mp4> --music <mp3> --voice-gain-db 10 --publish dryrun --workspace ./.lyvideo`
- MCP server：`python -m lyvideo.mcp_server`（stdio；tools: `lyvideo_run`, `lyvideo_publishers`）
- Web UI：`web/`（Next.js 16 + Tailwind + shadcn-style components；`./node_modules/.bin/next dev -p 3100`）

## 流水线

1. `probe_media`: ffprobe 检查输入
2. `mix_audio`: ffmpeg 混音；默认人声高于音乐 10dB
3. `asr_simplified`: faster-whisper small int8 + OpenCC t2s 生成简体 VTT
4. `render_subtitles`: ffmpeg libass 烧录字幕
5. `publish:*`: 默认 dry-run / manual，避免误发；真实平台 adapter 可后续接入

## 验证结果

- Python compile/import/CLI/MCP 工具列表均通过
- 8 秒样例端到端：probe → mix → ASR 简体 VTT → 字幕烧录 → dryrun 发布，所有步骤 ok=true
- Web UI 生产构建通过（Next.js 16.4.6）

## 发布策略

默认只做 dry-run 或人工确认；`xiaoliangliang/auto-publish` 等现成方案也采用“上传+填表、人工最终点击”，以降低账号安全和平台风控风险。

## 人类易用性工作流

Web UI 已改成“拖入视频 → 自动生成简体字幕成片 → 下载”的单页流程：

1. `cd web && npm run dev`（默认 `http://localhost:3100`），或在生产构建后 `npm run start`。
2. 在“添加字幕”页面把视频拖入虚线框，也可点击选择文件。
3. 可选：同时拖入音频文件，或点击按钮选择背景音乐；设置“人声高于音乐 dB”。
4. 点击“生成字幕视频”，页面显示 preparing / subtitles / burning 状态。
5. 完成后点击“下载字幕视频”；后端会展示各流水线步骤结果。

该流程通过 `web/src/app/api/subtitle-video/route.ts` 接收上传文件，写到临时目录，调用本地 `.venv/bin/python -m lyvideo.cli run`，并把生成的成片通过受控下载接口返回。适合本机或可信内网使用；公网部署时应加登录、限流、大小限制与任务清理。

## GitHub Release

Push a version tag to publish multi-platform release assets via GitHub Actions:

```bash
git tag v0.1.1
git push origin v0.1.1
```

The public repository uses public GitHub Actions quotas. The release workflow builds on Linux, macOS and Windows runners and uploads per-platform zip archives plus SHA256SUMS to the GitHub Release.
