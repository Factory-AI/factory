from dataclasses import dataclass
from jeval.strata.classifier import ContentType, Classification
from jeval.epe.weights import RISK_WEIGHTS


@dataclass
class SegmentPlan:
    segment: str
    content_type: ContentType
    confidence: float
    epe: float
    weighted_risk: float
    budget: float


_PROTECT  = {ContentType.ENTITY, ContentType.FACTUAL, ContentType.CAUSAL}
_COMPRESS = {ContentType.BACKGROUND}


class BudgetAllocator:
    """
    Maps (content_type, EPE, confidence) → compression budget.

    Stage 1 — content type + confidence (works without trained predictor):
      confidence > 0.70 and PROTECT type → budget = 1.0
      confidence > 0.70 and BACKGROUND  → budget = 0.3

    Stage 2 — EPE weighted risk (dominates after predictor is trained):
      w_risk > high_thresh → budget = 1.0
      w_risk < low_thresh  → budget = 0.3
    """

    def __init__(
        self,
        high_thresh: float = 0.45,
        low_thresh: float = 0.35,
        confidence_threshold: float = 0.70,
    ):
        self.high       = high_thresh
        self.low        = low_thresh
        self.conf_thresh = confidence_threshold

    def plan(
        self,
        segments: list[str],
        epe_results,
        classifications,
    ) -> list[SegmentPlan]:
        plans = []
        for seg, epe_r, clf in zip(segments, epe_results, classifications):
            w_risk = epe_r.epe * RISK_WEIGHTS.get(clf.content_type.value, 1.0)
            budget = self._budget(clf, w_risk)
            plans.append(SegmentPlan(
                segment=seg,
                content_type=clf.content_type,
                confidence=clf.confidence,
                epe=epe_r.epe,
                weighted_risk=w_risk,
                budget=budget,
            ))
        return plans

    def _budget(self, clf: Classification, w_risk: float) -> float:
        if w_risk > self.high:
            return 1.0
        if w_risk < self.low:
            return 0.3
        if clf.confidence >= self.conf_thresh:
            if clf.content_type in _PROTECT:
                return 1.0
            if clf.content_type in _COMPRESS:
                return 0.3
        return 0.7
