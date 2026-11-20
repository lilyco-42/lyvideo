from __future__ import annotations

import argparse
import json

from .models import PipelineRequest
from .pipeline import run_pipeline


def main() -> None:
    ap = argparse.ArgumentParser(prog="lyvideo", description="lyvideo - AI video pipeline")
    ap.add_argument("command", choices=["run", "publishers", "version"])
    ap.add_argument("--video")
    ap.add_argument("--music")
    ap.add_argument("--voice-gain-db", type=float, default=10.0)
    ap.add_argument("--no-subtitles", action="store_true")
    ap.add_argument("--no-render", action="store_true")
    ap.add_argument("--publish", action="append", default=[])
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--workspace", default="./.lyvideo")
    a = ap.parse_args()

    if a.command == "version":
        from . import __version__
        print(__version__)
        return
    if a.command == "publishers":
        from .publishers import registry
        print(" ".join(sorted(registry)))
        return
    if not a.video:
        ap.error("--video required")

    req = PipelineRequest(
        video=a.video,
        music=a.music,
        voice_gain_db=a.voice_gain_db,
        subtitles=not a.no_subtitles,
        render=not a.no_render,
        publish=a.publish,
        dry_run=a.dry_run,
    )
    result = run_pipeline(req, a.workspace)
    print(json.dumps(result.model_dump(), ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()