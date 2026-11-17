from __future__ import annotations
import subprocess, shutil
from pathlib import Path
from ..models import StepResult

def run_cmd(cmd: list[str], cwd: str | None = None) -> tuple[int, str]:
    p = subprocess.run(cmd, cwd=cwd, text=True, capture_output=True)
    out = (p.stdout or '') + ('\n' + p.stderr if p.stderr else '')
    return p.returncode, out.strip()

def require_tools(tools: list[str]) -> tuple[bool, str]:
    missing = [t for t in tools if shutil.which(t) is None]
    if missing:
        return False, 'missing tools: ' + ', '.join(missing)
    return True, 'ok'

def step(name: str, ok: bool, output: str | None = None, detail: str | None = None) -> StepResult:
    return StepResult(name=name, ok=ok, output=output, detail=detail)
