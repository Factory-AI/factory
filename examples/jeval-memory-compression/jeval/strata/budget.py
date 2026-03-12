from dataclasses import dataclass
from jeval.strata.classifier import ContentType
from jeval.epe.decomposer import RISK_WEIGHTS


@dataclass
class SegmentPlan:
    """
    The compression decision for one memory segment.

    budget is the fraction of tokens to keep:
      1.0 = keep verbatim, do not compress
      0.7 = light abstractive compression
      0.3 = aggressive abstractive compression

    This is what the PreCompact hook reads to decide
    how to treat each segment before passing it to Droid's
    native compressor.
    """
    segment: str
    content_type: ContentType
    epe: float
    weighted_risk: float
    budget: float


class BudgetAllocator:
    """
    Maps weighted_risk → compression budget per segment.

    Three tiers:

      weighted_risk > high_thresh  →  1.0  (verbatim — protect this)
      weighted_risk > low_thresh   →  0.7  (light compression ok)
      else                         →  0.3  (compress aggressively)

    The thresholds are calibrated from RQ1 results.
    Default values are conservative priors — err on the side of
    protecting more until you have empirical data saying otherwise.

    Concrete example for a Droid memory file:
      '- modified src/auth/refresh.ts to fix 401 on /api/login'
       → ENTITY, epe=0.42, weighted_risk=0.36 → budget=1.0 (verbatim)

      '- decided to use Zustand because Redux felt too heavy'
       → CAUSAL, epe=0.28, weighted_risk=0.27 → budget=0.7 (light)

      '- the afternoon was quiet, good time to refactor'
       → BACKGROUND, epe=0.15, weighted_risk=0.03 → budget=0.3 (aggressive)
    """

    def __init__(self, high_thresh: float = 0.35, low_thresh: float = 0.10):
        self.high = high_thresh
        self.low = low_thresh

    def plan(
        self,
        segments: list[str],
        epe_results,      # list[EPEResult]
        classifications,  # list[Classification]
    ) -> list[SegmentPlan]:
        plans = []
        for seg, epe_r, clf in zip(segments, epe_results, classifications):
            w_risk = epe_r.epe * RISK_WEIGHTS.get(clf.content_type, 1.0)

            if w_risk > self.high:
                budget = 1.0   # verbatim — too risky to touch
            elif w_risk > self.low:
                budget = 0.7   # light compression ok
            else:
                budget = 0.3   # background noise — compress hard

            plans.append(SegmentPlan(
                segment=seg,
                content_type=clf.content_type,
                epe=epe_r.epe,
                weighted_risk=w_risk,
                budget=budget,
            ))
        return plans
