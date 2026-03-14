from enum import Enum
from dataclasses import dataclass
from transformers import pipeline
import torch


class ContentType(str, Enum):
    FACTUAL      = "factual_claim"
    CAUSAL       = "causal_chain"
    ENTITY       = "entity_role"
    TEMPORAL     = "temporal_anchor"
    CONTRASTIVE  = "contrastive"
    BACKGROUND   = "background"


_LABEL_STRINGS = {
    ContentType.FACTUAL:     "is a specific technical fact, file path, error code, or API endpoint",
    ContentType.CAUSAL:      "explains why a decision was made or what caused a problem",
    ContentType.ENTITY:      "mentions a specific file, function, service, or named component",
    ContentType.TEMPORAL:    "describes what should happen next or records when something occurred",
    ContentType.CONTRASTIVE: "compares two approaches or explains what was rejected",
    ContentType.BACKGROUND:  "is a general status update or ambient note with no specific technical detail",
}

_STRING_TO_TYPE   = {v: k for k, v in _LABEL_STRINGS.items()}
_CANDIDATE_LABELS = list(_LABEL_STRINGS.values())

FAST_MODEL = "cross-encoder/nli-MiniLM2-L6-H768"
PROD_MODEL = "cross-encoder/nli-deberta-v3-large"


@dataclass
class Classification:
    text: str
    content_type: ContentType
    confidence: float


class ContentClassifier:
    """
    Zero-shot NLI classifier that routes memory segments to content types.

    Use FAST_MODEL for development on CPU.
    Use PROD_MODEL for final benchmarks.
    """

    def __init__(
        self,
        model: str = PROD_MODEL,
        device: int = -1,
        batch_size: int = 32,
    ):
        self._pipe = pipeline(
            "zero-shot-classification",
            model=model,
            device=device,
            dtype=torch.float16,
        )
        self.batch_size = batch_size

    def classify(self, text: str) -> Classification:
        res = self._pipe(text, candidate_labels=_CANDIDATE_LABELS, multi_label=False)
        return Classification(
            text=text,
            content_type=_STRING_TO_TYPE[res["labels"][0]],
            confidence=res["scores"][0],
        )

    def classify_batch(self, texts: list[str]) -> list[Classification]:
        raw = self._pipe(
            texts,
            candidate_labels=_CANDIDATE_LABELS,
            multi_label=False,
            batch_size=self.batch_size,
        )
        if isinstance(raw, dict):
            raw = [raw]
        return [
            Classification(
                text=t,
                content_type=_STRING_TO_TYPE[r["labels"][0]],
                confidence=r["scores"][0],
            )
            for t, r in zip(texts, raw)
        ]
