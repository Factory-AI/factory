from jeval.epe.core import EPEComputer
from jeval.epe.decomposer import EPEDecomposer
from jeval.strata.classifier import ContentClassifier
from jeval.strata.budget import BudgetAllocator, SegmentPlan


def _segment(text: str, words_per_seg: int = 80) -> list[str]:
    """
    Split a memory file into segments of ~80 words each.

    80 words is roughly one memory entry in a Droid memories.md.
    Each bullet point or decision block becomes one segment.
    This means EPE is computed at the granularity of individual
    memory entries — which is exactly what we want.
    """
    words = text.split()
    return [
        " ".join(words[i:i+words_per_seg])
        for i in range(0, len(words), words_per_seg)
    ]


def _apply_budget(segment: str, budget: float) -> str:
    """
    Apply a compression budget to one segment.

    budget=1.0 → return verbatim, no changes
    budget=0.7 → truncate to 70% of words (light)
    budget=0.3 → truncate to 30% of words (aggressive)

    NOTE: this is a simple word-truncation placeholder.
    In production you would swap this for an LLM summarizer
    that respects the budget as a token target.
    The interface (segment + budget → compressed string) stays
    identical regardless of the compression backend.
    """
    if budget >= 1.0:
        return segment

    words = segment.split()
    keep = max(1, int(len(words) * budget))
    return " ".join(words[:keep])


class AdaptiveCompressor:
    """
    EPE-guided adaptive compressor for Droid memory files.

    This is what the PreCompact hook calls. Full pipeline:

      1. Segment the memory file into ~80-word chunks
      2. Classify each segment by content type (Strata)
      3. Compute EPE for each segment vs a light compression
      4. Build a per-segment compression plan (budget allocator)
      5. Apply the plan — high risk segments kept verbatim,
         low risk segments compressed aggressively
      6. Return compressed text + the plan for audit logging

    Why step 3 uses a light compression as the 'compressed' input:
      We don't have the actual compression yet — that's what we're
      trying to guide. So we apply a quick 80% truncation as a proxy
      to get EPE estimates, then use those estimates to decide the
      real compression budget. This is the pre-hoc oracle pattern.
    """

    def __init__(
        self,
        computer: EPEComputer,
        classifier: ContentClassifier,
        allocator: BudgetAllocator,
    ):
        self.decomposer = EPEDecomposer(computer, classifier)
        self.allocator  = allocator

    def compress(
        self,
        memory_text: str,
        segments: list[str] | None = None,
    ) -> tuple[str, list[SegmentPlan]]:
        """
        Compress a Droid memory file using EPE-guided budgets.

        Args:
            memory_text: full contents of memories.md
            segments: pre-split segments, or None to auto-split

        Returns:
            (compressed_text, plan)
            compressed_text: the verified compressed memory
            plan: per-segment decisions for audit logging
        """
        if segments is None:
            segments = _segment(memory_text)

        # proxy compression at 80% to get EPE estimates
        # this is cheap — just word truncation, not an LLM call
        proxy_compressed = [_apply_budget(s, 0.8) for s in segments]

        # decompose EPE across content types
        decomposed = self.decomposer.decompose(segments, proxy_compressed)

        # flatten all segment results back into order
        # by_type buckets them — we need them in original order
        all_results = []
        all_clfs = []
        for ct in decomposed.by_type.values():
            for epe_r, clf in zip(ct.results, ct.results):
                all_results.append(epe_r)
                all_clfs.append(clf)

        # build compression plan
        plan = self.allocator.plan(segments, all_results, all_clfs)

        # apply budgets per segment
        compressed_parts = [_apply_budget(p.segment, p.budget) for p in plan]
        compressed_text  = "\n".join(compressed_parts)

        return compressed_text, plan
