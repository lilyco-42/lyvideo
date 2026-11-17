from lyvideo.models import PipelineRequest
from lyvideo.pipeline import run_pipeline
from lyvideo.publishers import registry

def test_registry_has_safe_defaults():
    assert 'dryrun' in registry and 'manual' in registry

def test_pipeline_no_subtitles_no_render():
    req = PipelineRequest(video='/tmp/none.mp4', subtitles=False, render=False, dry_run=True)
    result = run_pipeline(req, workspace='/tmp/lyvideo-test')
    assert result.request == req
    assert any(s.name == 'mix_audio' for s in result.steps)
