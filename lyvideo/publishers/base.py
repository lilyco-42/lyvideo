from __future__ import annotations
from typing import Dict, Type, Any
from ..models import StepResult

class Publisher:
    name = 'base'
    def publish(self, video: str, metadata: dict[str, Any], dry_run: bool = True) -> StepResult:
        raise NotImplementedError

registry: Dict[str, Type[Publisher]] = {}

def register(cls: Type[Publisher]) -> Type[Publisher]:
    registry[cls.name] = cls
    return cls

def get_publisher(name: str) -> Publisher | None:
    cls = registry.get(name)
    return cls() if cls else None
