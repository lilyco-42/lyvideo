from __future__ import annotations
from pathlib import Path
from typing import Any
from .models import PipelineRequest, PipelineResult
from .steps.ffmpeg_steps import mix_audio, probe_media
from .steps.asr_steps import transcribe_simplified
from .steps.render_steps import render_subtitled
from .publishers import get_publisher, registry
from .publishers import dryrun, manual  # noqa: register adapters

def run_pipeline(req: PipelineRequest, workspace: str = './.lyvideo') -> PipelineResult:
    ws = Path(workspace)
    ws.mkdir(parents=True, exist_ok=True)
    result = PipelineResult(ok=False, request=req)
    result.steps.append(probe_media(req.video))
    mixed = str(ws/'mixed.mp4')
    result.steps.append(mix_audio(req.video, req.music, mixed, req.voice_gain_db))
    current = mixed
    if not all(s.ok for s in result.steps):
        result.ok = False
        return result
    if req.subtitles:
        vtt = str(ws/'subtitle.zh.simplified.vtt')
        result.steps.append(transcribe_simplified(current, vtt))
        if not result.steps[-1].ok:
            result.ok = False
            return result
        if req.simplified:
            rendered = str(ws/'with_subtitles.mp4')
            result.steps.append(render_subtitled(current, vtt, rendered))
            current = rendered
    result.final_video = current if req.render else None
    if not all(s.ok for s in result.steps):
        result.ok = False
        return result
    for pname in req.publish:
        pub = get_publisher(pname)
        if pub is None:
            result.steps.append(__import__('lyvideo.models',fromlist=['StepResult']).StepResult(name='publish:'+pname, ok=False, detail='unknown publisher; available: '+','.join(registry)))
        else:
            result.steps.append(pub.publish(current, {}, dry_run=req.dry_run))
    result.ok = all(s.ok for s in result.steps)
    return result
