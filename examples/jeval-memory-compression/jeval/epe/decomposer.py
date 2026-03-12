from dataclasses import dataclass, field
import numpy as np
import torch

from jeval.epe.core import EPEComputer, EPEResult
from jeval.epe.weights import RISK_WEIGHTS
from jeval.strata.classifier import ContentClassifier, ContentType


@dataclass
class TypeStats:
    """Aggregated EPE stats for one content type."""
    ct: ContentType
    results: list[EPEResult] = field(default_factory=list)

    @property
    def mean(self) -> float:
        return float(np.mean([r.epe for r in self.results])) if self.results else 0.0

    @property
    def max(self) -> float:
        return float(np.max([r.epe for r in self.results])) if self.results else 0.0

    @property
    def n(self) -> int:
        return len(self.results)


@dataclass
class DecomposedEPE:
    """
    Full EPE breakdown for one memory file compression event.

    This is the primary output of jeval at runtime.
    The PreCompact hook reads this to decide what to protect.

    weighted_risk is the headline scalar:
      weighted_risk = sum(weight_t * mean_epe_t) across content types
    High weighted_risk = this compression event is dangerous.
    """
    by_type: dict[ContentType, TypeStats]
    global_epe: float
    weighted_risk: float

    def risk_map(self) -> dict[ContentType, float]:
        return {
            ct: s.mean * RISK_WEIGHTS[ct.value]
            for ct, s in self.by_type.items()
            if s.n > 0
        }

    def summary(self) -> str:
        lines = [
            f"global_epe={self.global_epe:.4f}  "
            f"weighted_risk={self.weighted_risk:.4f}"
        ]
        for ct, s in sorted(self.by_type.items(), key=lambda x: -x[1].mean):
            if s.n:
                lines.append(
                    f"  {ct.value:20s}  n={s.n:3d}  "
                    f"mean={s.mean:.4f}  max={s.max:.4f}"
                )
        return "\n".join(lines)


class EPEDecomposer:
    """
    Classifies memory segments by content type, computes EPE per
    segment, then buckets results by type.

    Pipeline:
      segments → classify all → compute EPE all → bucket by type

    The alignment problem:
      Extractive compression keeps 1:1 segment mapping → easy.
      Abstractive compression collapses multiple segments into one
      sentence → use align_abstractive() which does nearest-neighbor
      matching in embedding space to reconstruct a 1:1 alignment.
    """

    def __init__(self, computer: EPEComputer, classifier: ContentClassifier):
        self.computer = computer
        self.classifier = classifier

    def decompose(
        self,
        orig_segs: list[str],
        comp_segs: list[str],
    ) -> DecomposedEPE:
        assert len(orig_segs) == len(comp_segs), (
            "segments must align 1:1 — "
            "use align_abstractive() for non-1:1 compression"
        )

        clf_results = self.classifier.classify_batch(orig_segs)
        epe_results = self.computer.compute_batch(
            orig_segs, comp_segs,
            seg_ids=[str(i) for i in range(len(orig_segs))]
        )

        by_type = {ct: TypeStats(ct) for ct in ContentType}
        for clf, epe in zip(clf_results, epe_results):
            by_type[clf.content_type].results.append(epe)

        all_epes = [r.epe for r in epe_results]
        global_epe = float(np.mean(all_epes)) if all_epes else 0.0
        weighted_risk = sum(
            s.mean * RISK_WEIGHTS[ct.value]
            for ct, s in by_type.items() if s.n
        )

        return DecomposedEPE(
            by_type=by_type,
            global_epe=global_epe,
            weighted_risk=weighted_risk,
        )

    def align_abstractive(
        self,
        orig_segs: list[str],
        compressed_text: str,
    ) -> tuple[list[str], list[str]]:
        """
        For abstractive compression: find the best compressed sentence
        match for each original segment via cosine similarity.

        Both sets of embeddings are L2-normalized so matrix multiply
        gives cosine similarity directly — no division needed.
        """
        import nltk
        comp_sents = nltk.sent_tokenize(compressed_text)

        orig_embs = self.computer.enc.encode_chunked(orig_segs)
        comp_embs = self.computer.enc.encode_chunked(comp_sents)

        # sim[i, j] = cosine similarity between orig_segs[i] and comp_sents[j]
        sim = torch.mm(orig_embs, comp_embs.T)

        best = sim.argmax(dim=1).tolist()
        return orig_segs, [comp_sents[i] for i in best]
