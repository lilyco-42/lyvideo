import json
import shutil

import pytest

from lyvideo.models import PipelineRequest
from lyvideo.pipeline import run_pipeline
from lyvideo.steps.ffmpeg_steps import mix_audio
from lyvideo.steps.render_steps import _ass_style, pick_font


def test_ass_style_scales_with_video_size():
    style_1080 = _ass_style(1920, 1080, "Test Font")
    assert "Test Font,45," in style_1080
    assert ",96,96,65,1" in style_1080
    style_720 = _ass_style(1280, 720, "Test Font")
    assert "Test Font,30," in style_720


def test_font_detection_returns_family():
    family, _ = pick_font()
    assert family


def test_pipeline_writes_progress_file(tmp_path):
    req = PipelineRequest(video=str(tmp_path / "missing.mp4"), subtitles=False, render=False)
    result = run_pipeline(req, workspace=str(tmp_path))
    assert result.ok is False
    payload = json.loads((tmp_path / "progress.json").read_text(encoding="utf-8"))
    assert payload["state"] == "error"
    assert payload["ok"] is False
    assert any(step["name"] == "mix_audio" for step in payload["steps"])


def test_mix_without_music_reuses_source(tmp_path):
    if not shutil.which("ffmpeg"):
        pytest.skip("ffmpeg not installed")
    video = tmp_path / "source.mp4"
    video.write_bytes(b"not a real video")
    output = tmp_path / "mixed.mp4"
    result = mix_audio(str(video), None, str(output))
    assert result.ok is True
    assert result.output == str(video)
    assert not output.exists()