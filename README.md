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

## 人类易用性工作流（跨平台 Web UI）

Web UI 是“拖入视频 → 自动生成简体字幕成片 → 下载”的单页流程，Windows / macOS / Linux 使用同一套代码。

### 依赖

- Node.js 20.9+（构建使用 Next.js 16）
- Python 3.11 / 3.12（Windows 建议 3.12；部分 3.14 环境可能没有 `ctranslate2` 预编译轮子）
- ffmpeg（需要 `libass` 与 `libx264`；`ffmpeg -filters | grep ass` 可确认）

### 安装

Linux / macOS：

```bash
python3 -m venv .venv
.venv/bin/pip install -e .
cd web
npm ci
npm run build
npm start
```

Windows（PowerShell）：

```powershell
py -3.12 -m venv .venv
.\.venv\Scripts\pip install -e .
cd web
npm ci
npm run build
npm start
```

开发模式：`npm run dev`（`http://localhost:3100`）；局域网/手机访问：`npm run start:lan`。

### 跨平台行为

- **Python**：优先使用项目 `.venv`，Windows 走 `.venv\Scripts\python.exe`，POSIX 走 `.venv/bin/python`；找不到时回退 `py -3` / `python3` / `python`。可用 `LYVIDEO_PYTHON` 指定。
- **ffmpeg**：默认从 PATH 查找，可用 `LYVIDEO_FFMPEG` 指定。
- **中文字幕字体**：Linux 用 Noto Sans CJK / Source Han Sans，macOS 用 PingFang SC，Windows 用 Microsoft YaHei；可用 `LYVIDEO_FONT` 与 `LYVIDEO_FONTS_DIR` 覆盖。
- **字幕烧录**：按视频实际分辨率生成 ASS（1080p 字号 45、720p 字号 30），不再依赖 VTT→ASS 默认的 384×288 缩放。
- **大文件**：上传走原始字节流写盘，不再 `formData()` 读进内存；任务异步执行，页面轮询状态；下载用流式响应并支持 `Range`（Safari/iOS 可断点续传）。
- **无音乐**：`mix_audio` 直接复用源视频，不再复制 4.4GB 临时文件。
- **临时目录**：`os.tmpdir()/lyvideo-web`，上传/任务默认保留 24 小时，可用 `GET /api/subtitle-video/env` 查看当前 Python、ffmpeg 与字体。

可选环境变量：`LYVIDEO_ASR_MODEL`（默认 `small`，可填本地 faster-whisper 模型目录）、`LYVIDEO_ASR_DEVICE`、`LYVIDEO_ASR_COMPUTE`、`LYVIDEO_ASR_THREADS`、`LYVIDEO_VIDEO_CODEC`。

### 浏览器兼容

Chrome / Edge、Firefox、Safari 16+；桌面与手机浏览器均可。上传使用 XHR（带进度），状态使用 `fetch` 轮询，下载使用 `<a download>` + 服务端 `Content-Disposition`，不依赖 `window.open`。

适合本机或可信内网使用；公网部署时应加登录、限流、大小限制与任务清理。

### API

- `POST /api/subtitle-video/upload?kind=video|music&name=<文件名>`：原始字节流上传，返回 `upload_id`
- `POST /api/subtitle-video`：`{video_upload_id, music_upload_id, voice_gain_db, output_name}`，返回任务 `id`
- `GET /api/subtitle-video/status?id=<任务id>`：`state` / `percent` / `steps`
- `DELETE /api/subtitle-video?id=<任务id>`：取消任务（Windows 用 `taskkill /T`，POSIX 杀进程组）
- `GET /api/subtitle-video/download?id=<任务id>`：流式下载，支持 `Range`
- `GET /api/subtitle-video/env`：Python / ffmpeg / 字体诊断

### 验证

- Python 单元测试：`python -m pytest -q`
- Web 构建：`cd web && npm run build`
- 端到端：8 秒样例走“上传 → 异步任务 → 轮询 → 下载”，输出 1080p H.264/AAC，字幕位置在 `y≈981–1008`（1080p）

## GitHub Release

Push a version tag to publish multi-platform release assets via GitHub Actions:

```bash
git tag v0.2.0
git push origin v0.2.0
```

Release 包内包含预构建的 `web/.next/standalone`（已带静态资源）。解压后先安装 Python 依赖，再从项目根目录启动：

```bash
python -m venv .venv
.venv/bin/pip install -e .          # Windows: .\.venv\Scripts\pip install -e .
node web/.next/standalone/server.js # 默认 3000；可加 PORT=3100
```

如果从其它目录启动，设置 `LYVIDEO_PROJECT_ROOT` 指向解压后的项目根目录。

The public repository uses public GitHub Actions quotas. The release workflow builds on Linux, macOS and Windows runners, runs standalone web smoke (Python/ffmpeg detection) and uploads per-platform zip archives plus SHA256SUMS to the GitHub Release.
