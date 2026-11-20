from __future__ import annotations

import json
import os
import time
from pathlib import Path
from typing import Any, Callable

from .models import PipelineRequest, PipelineResult, StepResult
from .steps.ffmpeg_steps import mix_audio, probe_media
from .steps.asr_steps import transcribe_simplified
from .steps.render_steps import render_subtitled
from .publishers import get_publisher, registry
from .publishers import dryrun, manual  # noqa: F401  register adapters


def _write_progress(ws: Path, result: PipelineResult, state: str) -> None:
    payload: dict[str, Any] = {
        "ok": result.ok,
        "state": state,
        "updated_at": int(time.time() * 1000),
        "steps": [s.model_dump() for s in result.steps],
        "final_video": result.final_video,
    }
    try:
        tmp = ws / "progress.json.tmp"
        tmp.write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")
        os.replace(tmp, ws / "progress.json")
    except OSError:
        pass


def run_pipeline(
    req: PipelineRequest,
    workspace: str = "./.lyvideo",
    on_step: Callable[[StepResult, PipelineResult], None] | None = None,
) -> PipelineResult:
    ws = Path(workspace)
    ws.mkdir(parents=True, exist_ok=True)
    result = PipelineResult(ok=False, request=req)
    state = {"value": "preparing"}

    def emit(item: StepResult, next_state: str | None = None) -> None:
        result.steps.append(item)
        if next_state:
            state["value"] = next_state
        _write_progress(ws, result, state["value"])
        if on_step:
            on_step(item, result)

    try:
        emit(probe_media(req.video), "preparing")
        mixed = str(ws / "mixed.mp4")
        mix_step = mix_audio(req.video, req.music, mixed, req.voice_gain_db)
        emit(mix_step, "preparing")
        current = mix_step.output or mixed
        if not all(s.ok for s in result.steps):
            result.ok = False
            _write_progress(ws, result, "error")
            return result

        if req.subtitles:
            vtt = str(ws / "subtitle.zh.simplified.vtt")
            emit(transcribe_simplified(current, vtt), "subtitles")
            if not result.steps[-1].ok:
                result.ok = False
                _write_progress(ws, result, "error")
                return result
            if req.render:
                rendered = str(ws / "with_subtitles.mp4")
                emit(render_subtitled(current, vtt, rendered), "burning")
                current = rendered

        result.final_video = current if req.render else None
        if not all(s.ok for s in result.steps):
            result.ok = False
            _write_progress(ws, result, "error")
            return result

        for pname in req.publish:
            pub = get_publisher(pname)
            if pub is None:
                emit(StepResult(name="publish:" + pname, ok=False,
                                detail="unknown publisher; available: " + ",".join(registry)))
            else:
                emit(pub.publish(current, {}, dry_run=req.dry_run))

        result.ok = all(s.ok for s in result.steps)
        _write_progress(ws, result, "done" if result.ok else "error")
        return result
    except Exception as exc:
        result.steps.append(StepResult(name="internal", ok=False, detail=str(exc)))
        result.ok = False
        _write_progress(ws, result, "error")
        return result