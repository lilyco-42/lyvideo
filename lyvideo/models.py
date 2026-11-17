from __future__ import annotations
from pydantic import BaseModel, Field
from typing import List, Optional, Literal

class PipelineRequest(BaseModel):
    video: str
    music: Optional[str] = None
    voice_gain_db: float = 10.0
    subtitles: bool = True
    simplified: bool = True
    render: bool = True
    publish: List[str] = Field(default_factory=list)
    dry_run: bool = True

class StepResult(BaseModel):
    name: str
    ok: bool
    output: Optional[str] = None
    detail: Optional[str] = None

class PipelineResult(BaseModel):
    ok: bool
    request: PipelineRequest
    steps: List[StepResult] = Field(default_factory=list)
    final_video: Optional[str] = None
