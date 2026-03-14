from dataclasses import dataclass
import re
import numpy as np
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


# content types that must survive compression verbatim
_PROTECT  = {ContentType.ENTITY, ContentType.FACTUAL, ContentType.CAUSAL}
_COMPRESS = {ContentType.BACKGROUND}

# patterns that indicate artifact content — always protect regardless of EPE
_ARTIFACT_PATTERNS = re.compile(
    r'src/|\.ts|\.js|\.py|\.go|/api/|JWT|Redis|Postgres|maxRetries|httpOnly',
    re.IGNORECASE
)


class BudgetAllocator:
    """
    Maps (content_type, EPE z-score, confidence) -> compression budget.

    Key insight: low EPE != low importance.
    Low EPE means the predictor thinks the content is easy to reconstruct.
    But file paths, error codes, and variable names are predictable AND critical.
    We protect them via artifact pattern detection regardless of EPE.

    Decision hierarchy:
      1. Contains artifact pattern -> 1.0 (always protect)
      2. z > +high_z -> 1.0 (high EPE = fragile content)
      3. z < -low_z AND BACKGROUND type -> 0.3 (low EPE + low value)
      4. Content type + confidence -> type-based decision
      5. Default -> 0.7 (light compression)
    """

    def __init__(
        self,
        high_z: float = 0.5,
        low_z: float = -0.5,
        confidence_threshold: float = 0.35,
    ):
        self.high_z       = high_z
        self.low_z        = low_z
        self.conf_thresh  = confidence_threshold

    def plan(self, segments, epe_results, classifications) -> list[SegmentPlan]:
        epe_vals = np.array([r.epe for r in epe_results])
        mean_epe = float(np.mean(epe_vals))
        std_epe  = float(np.std(epe_vals)) or 1e-6

        plans = []
        for seg, epe_r, clf in zip(segments, epe_results, classifications):
            w_risk = epe_r.epe * RISK_WEIGHTS.get(clf.content_type.value, 1.0)
            z      = (epe_r.epe - mean_epe) / std_epe
            budget = self._budget(seg, clf, z)
            plans.append(SegmentPlan(
                segment=seg,
                content_type=clf.content_type,
                confidence=clf.confidence,
                epe=epe_r.epe,
                weighted_risk=w_risk,
                budget=budget,
            ))
        return plans

    def _budget(self, segment: str, clf: Classification, z: float) -> float:
        # Rule 1: artifact pattern detected -> always verbatim
        # this is the fix for "low EPE != low importance"
        if _ARTIFACT_PATTERNS.search(segment):
            return 1.0

        # Rule 2: high z-score -> content is fragile -> protect
        if z > self.high_z:
            return 1.0

        # Rule 3: low z-score + background type -> safe to compress aggressively
        if z < self.low_z and clf.content_type in _COMPRESS:
            return 0.3

        # Rule 4: content type + confidence for ambiguous zone
        if clf.confidence >= self.conf_thresh:
            if clf.content_type in _PROTECT:
                return 1.0
            if clf.content_type in _COMPRESS:
                return 0.3

        # Rule 5: default light compression
        return 0.7
