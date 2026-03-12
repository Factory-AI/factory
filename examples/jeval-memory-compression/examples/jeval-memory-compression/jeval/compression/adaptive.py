from jeval.epe.core import EPEComputer
from jeval.strata.classifier import ContentClassifier
from jeval.strata.budget import BudgetAllocator, SegmentPlan

# entries shorter than this are kept verbatim regardless of budget
# truncating a 10-word sentence to 7 words destroys meaning
MIN_WORDS_TO_COMPRESS = 15


def _segment(text: str) -> list[str]:
    """
    Split a Droid memories.md into meaningful segments.
    Each bullet point and section header becomes one segment.
    """
    segments = []
    for line in text.splitlines():
        line = line.strip()
        if not line:
            continue
        if line.startswith("##") or line.startswith("-"):
            segments.append(line)
        else:
            if segments:
                segments[-1] += " " + line
            else:
                segments.append(line)
    return [s for s in segments if len(s.split()) >= 3]


def _apply_budget(segment: str, budget: float) -> str:
    """
    Apply compression budget to one segment.

    Short entries (< MIN_WORDS_TO_COMPRESS words) are always kept
    verbatim — truncating a 10-word sentence to 7 words destroys
    meaning without saving meaningful tokens.
    """
    if budget >= 1.0:
        return segment
    words = segment.split()
    if len(words) < MIN_WORDS_TO_COMPRESS:
        return segment
    keep = max(1, int(len(words) * budget))
    return " ".join(words[:keep])


class AdaptiveCompressor:
    """
    EPE-guided adaptive compressor for Droid memory files.

    Pipeline:
      1. Segment by bullet points and headers
      2. Classify each segment by content type
      3. Compute EPE vs proxy compression
      4. Build per-segment budget plan
      5. Apply budgets — short entries always verbatim
    """

    def __init__(
        self,
        computer: EPEComputer,
        classifier: ContentClassifier,
        allocator: BudgetAllocator,
    ):
        self.computer   = computer
        self.classifier = classifier
        self.allocator  = allocator

    def compress(
        self,
        memory_text: str,
        segments: list[str] | None = None,
    ) -> tuple[str, list[SegmentPlan]]:
        if segments is None:
            segments = _segment(memory_text)

        if not segments:
            return memory_text, []

        clf_results = self.classifier.classify_batch(segments)
        proxy       = [_apply_budget(s, 0.8) for s in segments]
        epe_results = self.computer.compute_batch(
            segments, proxy,
            seg_ids=[str(i) for i in range(len(segments))]
        )

        plan = self.allocator.plan(segments, epe_results, clf_results)

        compressed_parts = [_apply_budget(p.segment, p.budget) for p in plan]
        compressed_text  = "\n".join(compressed_parts)

        return compressed_text, plan
