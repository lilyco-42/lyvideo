from __future__ import annotations

import os
import platform
import re
import shutil
import subprocess
from pathlib import Path

from .base import step
from ..models import StepResult


def ffmpeg_bin() -> str:
    return os.environ.get("LYVIDEO_FFMPEG") or shutil.which("ffmpeg") or "ffmpeg"


def ffprobe_bin() -> str:
    return os.environ.get("LYVIDEO_FFPROBE") or shutil.which("ffprobe") or "ffprobe"


def _run(cmd: list[str]) -> tuple[int, str]:
    p = subprocess.run(
        cmd, text=True, capture_output=True, encoding="utf-8", errors="replace",
    )
    out = (p.stdout or "") + ("\n" + p.stderr if p.stderr else "")
    return p.returncode, out.strip()


def _command_ok(cmd: str, probe: str = "-version") -> bool:
    try:
        p = subprocess.run(
            [cmd, probe], text=True, capture_output=True,
            encoding="utf-8", errors="replace",
        )
        return p.returncode == 0
    except OSError:
        return False


def _video_size(source: str) -> tuple[int, int]:
    code, out = _run([
        ffprobe_bin(), "-v", "error", "-select_streams", "v:0",
        "-show_entries", "stream=width,height", "-of", "json", source,
    ])
    if code == 0:
        try:
            import json
            streams = json.loads(out).get("streams") or []
            if streams:
                width = int(streams[0].get("width") or 0)
                height = int(streams[0].get("height") or 0)
                if width > 0 and height > 0:
                    return width, height
        except Exception:
            pass
    return 1920, 1080


def _fc_match_file(family: str) -> str:
    if not shutil.which("fc-match"):
        return ""
    code, out = _run(["fc-match", "-f", "%{file}", family])
    if code == 0 and out and Path(out).is_file():
        return out
    return ""


def pick_font() -> tuple[str, str]:
    override = os.environ.get("LYVIDEO_FONT")
    if override:
        return override, os.environ.get("LYVIDEO_FONTS_DIR", "")

    system = platform.system()
    if system == "Windows":
        windir = os.environ.get("WINDIR", r"C:\Windows")
        fonts = Path(windir) / "Fonts"
        for family, filename in (
            ("Microsoft YaHei", "msyh.ttc"),
            ("Microsoft YaHei", "msyhbd.ttc"),
            ("SimHei", "simhei.ttf"),
        ):
            if (fonts / filename).is_file():
                return family, str(fonts)
        return "Microsoft YaHei", str(fonts)

    if system == "Darwin":
        for family, path in (
            ("PingFang SC", "/System/Library/Fonts/PingFang.ttc"),
            ("Hiragino Sans GB", "/System/Library/Fonts/Hiragino Sans GB.ttc"),
        ):
            if Path(path).is_file():
                return family, str(Path(path).parent)
        return "PingFang SC", "/System/Library/Fonts"

    for family in ("Noto Sans CJK SC", "Source Han Sans SC", "Noto Sans SC", "WenQuanYi Zen Hei"):
        found = _fc_match_file(family)
        if found:
            return family, str(Path(found).parent)
    for candidate in (
        "/usr/share/fonts/noto-cjk",
        "/usr/share/fonts/opentype/noto",
        "/usr/share/fonts",
    ):
        if Path(candidate).is_dir():
            return "Noto Sans CJK SC", candidate
    return "Noto Sans CJK SC", ""


def _ass_style(width: int, height: int, font: str) -> str:
    size = max(16, round(height * 0.042))
    outline = max(1, round(height * 0.0028))
    shadow = max(0, round(height * 0.0010))
    margin_v = max(12, round(height * 0.060))
    margin_lr = max(12, round(width * 0.050))
    return (
        f"Style: Default,{font},{size},&H00FFFFFF,&H000000FF,&H00000000,&H64000000,"
        f"0,0,0,0,100,100,0,0,1,{outline},{shadow},2,{margin_lr},{margin_lr},{margin_v},1"
    )


def build_ass(vtt: str, out_ass: str, width: int, height: int, font: str) -> tuple[bool, str]:
    tmp = str(Path(out_ass).with_suffix(".generated.ass"))
    code, out = _run([ffmpeg_bin(), "-y", "-v", "error", "-i", vtt, tmp])
    if code != 0:
        return False, out
    raw = Path(tmp).read_text(encoding="utf-8")
    style = _ass_style(width, height, font)
    raw = re.sub(r"(?m)^PlayResX:.*$", f"PlayResX: {width}", raw)
    raw = re.sub(r"(?m)^PlayResY:.*$", f"PlayResY: {height}", raw)
    if re.search(r"(?m)^Style: Default,", raw):
        raw = re.sub(r"(?m)^Style: Default,.*$", style, raw)
    else:
        raw = raw.replace("[V4+ Styles]", "[V4+ Styles]\n" + style, 1)
    if "ScaledBorderAndShadow:" not in raw:
        raw = raw.replace("[Script Info]", "[Script Info]\nScaledBorderAndShadow: yes", 1)
    Path(out_ass).write_text(raw, encoding="utf-8")
    try:
        Path(tmp).unlink()
    except OSError:
        pass
    return True, out_ass


def _filter_path(value: str) -> str:
    text = Path(value).resolve().as_posix()
    text = text.replace("\\", "/")
    return (
        text.replace(":", r"\:")
        .replace("'", r"\'")
        .replace(",", r"\,")
        .replace("[", r"\[")
        .replace("]", r"\]")
    )


def _has_encoder(name: str) -> bool:
    code, out = _run([ffmpeg_bin(), "-hide_banner", "-encoders"])
    return code == 0 and re.search(r"\b" + re.escape(name) + r"\b", out) is not None


def render_subtitled(source: str, vtt: str, output: str) -> StepResult:
    if not _command_ok(ffmpeg_bin()):
        return step("render_subtitles", False, detail="ffmpeg missing")
    if not _command_ok(ffprobe_bin()):
        return step("render_subtitles", False, detail="ffprobe missing")
    if not Path(source).is_file():
        return step("render_subtitles", False, detail=f"video not found: {source}")
    if not Path(vtt).is_file():
        return step("render_subtitles", False, detail=f"subtitle not found: {vtt}")

    width, height = _video_size(source)
    font, fonts_dir = pick_font()
    ass_path = str(Path(output).with_suffix(".zh.ass"))
    ok, detail = build_ass(vtt, ass_path, width, height, font)
    if not ok:
        return step("render_subtitles", False, detail=detail)

    vf = f"ass=filename='{_filter_path(ass_path)}'"
    if fonts_dir and Path(fonts_dir).is_dir():
        vf += f":fontsdir='{_filter_path(fonts_dir)}'"

    codec = os.environ.get("LYVIDEO_VIDEO_CODEC", "libx264")
    if codec == "libx264" and not _has_encoder("libx264"):
        codec = "h264"

    cmd = [
        ffmpeg_bin(), "-y", "-v", "error", "-i", source,
        "-map", "0:v:0", "-map", "0:a?",
        "-vf", vf,
    ]
    if codec in ("libx264", "libx265"):
        cmd += ["-c:v", codec, "-preset", "veryfast", "-crf", "22"]
    else:
        cmd += ["-c:v", codec]
    cmd += [
        "-pix_fmt", "yuv420p", "-c:a", "copy", "-map_metadata", "0",
        "-movflags", "+faststart", output,
    ]
    code, out = _run(cmd)
    if code != 0:
        try:
            Path(output).unlink()
        except OSError:
            pass
        return step("render_subtitles", False, detail=out[-4000:])
    return step(
        "render_subtitles", True, output,
        f"ffmpeg ass burn-in {width}x{height} font={font}",
    )