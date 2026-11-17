from __future__ import annotations
from .base import step
from ..models import StepResult

def render_subtitled(source: str, vtt: str, output: str) -> StepResult:
    # Burn subtitles with ffmpeg libass/subtitles filter; reliable and dependency-light.
    import subprocess, shutil
    if shutil.which('ffmpeg') is None:
        return step('render_subtitles', False, detail='ffmpeg missing')
    vf = f"subtitles={vtt.replace('\\','/')}:force_style='FontName=Noto Sans CJK SC,FontSize=24,PrimaryColour=&H00FFFFFF,OutlineColour=&H00000000,BorderStyle=1,Outline=2,Shadow=1,Alignment=2'"
    p = subprocess.run(['ffmpeg','-y','-v','error','-i',source,'-vf',vf,'-c:a','copy',output], text=True, capture_output=True)
    out = (p.stdout or '') + '\n' + (p.stderr or '')
    return step('render_subtitles', p.returncode == 0, output if p.returncode == 0 else None, out.strip() if p.returncode else 'ffmpeg subtitles burn-in')
