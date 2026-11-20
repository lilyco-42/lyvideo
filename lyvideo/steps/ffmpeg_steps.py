from __future__ import annotations

import json
import os
import shutil
from pathlib import Path

from .base import run_cmd, require_tools, step
from ..models import StepResult


def ffmpeg_bin() -> str:
    return os.environ.get("LYVIDEO_FFMPEG") or shutil.which("ffmpeg") or "ffmpeg"


def ffprobe_bin() -> str:
    return os.environ.get("LYVIDEO_FFPROBE") or shutil.which("ffprobe") or "ffprobe"


def probe_media(path: str) -> StepResult:
    ok, why = require_tools([ffprobe_bin()])
    if not ok:
        return step("probe_media", False, detail=why)
    code, out = run_cmd([
        ffprobe_bin(), "-v", "error",
        "-show_entries", "format=duration:stream=index,codec_type,codec_name,width,height,r_frame_rate",
        "-of", "json", path,
    ])
    return step("probe_media", code == 0, detail=out)


def _has_audio(path: str) -> bool:
    code, out = run_cmd([
        ffprobe_bin(), "-v", "error", "-select_streams", "a:0",
        "-show_entries", "stream=index", "-of", "csv=p=0", path,
    ])
    return code == 0 and bool(out.strip())


def mix_audio(video: str, music: str | None, output: str, voice_gain_db: float = 10.0) -> StepResult:
    ok, why = require_tools([ffmpeg_bin()])
    if not ok:
        return step("mix_audio", False, detail=why)
    if not Path(video).is_file():
        return step("mix_audio", False, detail=f"video not found: {video}")
    if not music:
        return step("mix_audio", True, video, "no music: use source directly")
    if not Path(music).is_file():
        return step("mix_audio", False, detail=f"music not found: {music}")

    if not _has_audio(video):
        cmd = [
            ffmpeg_bin(), "-y", "-v", "error", "-i", video, "-i", music,
            "-map", "0:v:0", "-map", "1:a:0", "-c:v", "copy",
            "-c:a", "aac", "-b:a", "192k", "-shortest", output,
        ]
    else:
        voice = 10 ** (voice_gain_db / 20.0)
        music_vol = 1.0 / voice
        cmd = [
            ffmpeg_bin(), "-y", "-v", "error", "-i", video, "-i", music,
            "-filter_complex",
            f"[0:a]volume={voice:.6f}[v];[1:a]volume={music_vol:.6f}[m];"
            f"[v][m]amix=inputs=2:duration=first:dropout_transition=0[a]",
            "-map", "0:v:0", "-map", "[a]", "-c:v", "copy",
            "-c:a", "aac", "-b:a", "192k", output,
        ]
    code, out = run_cmd(cmd)
    return step("mix_audio", code == 0, output if code == 0 else None,
                out if code else f"voice +{voice_gain_db}dB vs music")