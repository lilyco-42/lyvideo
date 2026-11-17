from __future__ import annotations
from pathlib import Path
from pathlib import Path
from .base import run_cmd, require_tools, step
from ..models import StepResult

def probe_media(path: str) -> StepResult:
    ok, why = require_tools(['ffprobe'])
    if not ok: return step('probe_media', False, detail=why)
    code, out = run_cmd(['ffprobe','-v','error','-show_entries','format=duration:stream=index,codec_type,codec_name','-of','json', path])
    return step('probe_media', code == 0, detail=out)

def mix_audio(video: str, music: str | None, output: str, voice_gain_db: float = 10.0) -> StepResult:
    ok, why = require_tools(['ffmpeg'])
    if not ok: return step('mix_audio', False, detail=why)
    if not Path(video).exists():
        return step('mix_audio', False, detail=f'video not found: {video}')
    if not music:
        Path(output).write_bytes(Path(video).read_bytes())
        return step('mix_audio', True, output, 'no music: copied source')
    # voice amplitude = 10^(db/20); music normalized to 1/voice for target difference
    voice = 10 ** (voice_gain_db / 20.0)
    music_vol = 1.0 / voice
    cmd = ['ffmpeg','-y','-v','error','-i',video,'-i',music,
           '-filter_complex',f'[0:a]volume={voice:.6f}[v];[1:a]volume={music_vol:.6f}[m];[v][m]amix=inputs=2:duration=first:dropout_transition=0[a]',
           '-map','0:v','-map','[a]','-c:v','copy','-c:a','aac', output]
    code, out = run_cmd(cmd)
    return step('mix_audio', code == 0, output if code == 0 else None, out if code else f'voice +{voice_gain_db}dB vs music')
