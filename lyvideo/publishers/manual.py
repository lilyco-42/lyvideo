from .base import Publisher, register
from ..models import StepResult

@register
class ManualPublisher(Publisher):
    name = 'manual'
    def publish(self, video: str, metadata: dict, dry_run: bool = True) -> StepResult:
        return StepResult(name='publish:'+self.name, ok=True, output=video, detail='manual: upload/fill form in a logged-in browser; final click by human')
