from __future__ import annotations

import os
import shutil
import sys
from pathlib import Path

from .base import run_cmd, step
from ..models import StepResult


def transcribe_simplified(video: str, output_vtt: str, model: str | None = None) -> StepResult:
    worker = Path(__file__).with_name("_asr_worker.py")
    python = sys.executable or shutil.which("python3") or shutil.which("python")
    if not python:
        return step("asr_simplified", False, detail="python interpreter not found")
    model = model or os.environ.get("LYVIDEO_ASR_MODEL", "small")
    code, out = run_cmd([python, str(worker), video, output_vtt, "--model", model])
    return step(
        "asr_simplified", code == 0, output_vtt if code == 0 else None,
        out if code else f"faster-whisper {model} + OpenCC t2s",
    )