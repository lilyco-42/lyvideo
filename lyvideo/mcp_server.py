from __future__ import annotations
from mcp.server.mcpserver import MCPServer
from .models import PipelineRequest
from .pipeline import run_pipeline
from .publishers import registry

mcp = MCPServer('lyvideo')

@mcp.tool()
def lyvideo_run(video: str, music: str = '', voice_gain_db: float = 10.0, subtitles: bool = True, publish: list[str] = [], workspace: str = './.lyvideo') -> str:
    "Run lyvideo pipeline: mix audio, ASR simplified subtitles, burn-in, optional publish adapters."
    req = PipelineRequest(video=video, music=music or None, voice_gain_db=voice_gain_db, subtitles=subtitles, publish=publish, dry_run=True)
    return run_pipeline(req, workspace).model_dump_json(ensure_ascii=False)

@mcp.tool()
def lyvideo_publishers() -> str:
    "List available publisher adapters."
    import json
    return json.dumps(sorted(registry), ensure_ascii=False)

def main() -> None:
    mcp.run(transport='stdio')

if __name__ == '__main__':
    main()
