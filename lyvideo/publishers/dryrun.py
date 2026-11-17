from .base import Publisher, register
from ..models import StepResult

@register
class DryRunPublisher(Publisher):
    name = 'dryrun'
    def publish(self, video: str, metadata: dict, dry_run: bool = True) -> StepResult:
        return StepResult(name='publish:'+self.name, ok=True, output=video, detail='dry-run: no network request')
