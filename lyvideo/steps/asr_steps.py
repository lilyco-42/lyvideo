from __future__ import annotations
from pathlib import Path
from .base import run_cmd, step
from ..models import StepResult

def transcribe_simplified(video: str, output_vtt: str, model: str = "small") -> StepResult:
    worker = Path(__file__).with_name("_asr_worker.py")
    py = Path(__file__).resolve().parents[2] / ".venv" / "bin" / "python"
    code, out = run_cmd([str(py), str(worker), video, output_vtt, "--model", model])
    return step("asr_simplified", code == 0, output_vtt if code == 0 else None, out if code else "faster-whisper int8 + OpenCC t2s")
