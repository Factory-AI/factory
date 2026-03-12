from enum import Enum
from dataclasses import dataclass
from transformers import pipeline
import torch


class ContentType(str, Enum):
    """
    The six semantic content classes jeval tracks.

    These map directly to Factory's failure modes:
    - FACTUAL   → file paths, error codes, endpoints (artifact probes)
    - CAUSAL    → why decisions were made (decision probes)
    - ENTITY    → named files, functions, people (artifact probes)
    - TEMPORAL  → what happened when, what's next (continuation probes)
    - CONTRASTIVE → what we tried and rejected (decision probes)
    - BACKGROUND → ambient context, low risk (all probes, low weight)
    """
    FACTUAL      = "factual_claim"
    CAUSAL       = "causal_chain"
    ENTITY       = "entity_role"
    TEMPORAL     = "temporal_anchor"
    CONTRASTIVE  = "contrastive"
    BACKGROUND   = "background"


# Natural language hypotheses for zero-shot NLI.
# These are a hyperparameter — the exact phrasing affects
# classification accuracy. treat these as tunable.
_HYPOTHESES = {
    ContentType.FACTUAL:     "This sentence states a specific verifiable fact.",
    ContentType.CAUSAL:      "This sentence describes a cause-and-effect relationship.",
    ContentType.ENTITY:      "This sentence assigns a role or attribute to a named entity.",
    ContentType.TEMPORAL:    "This sentence contains a specific time reference or ordering.",
    ContentType.CONTRASTIVE: "This sentence contrasts or negates a previous statement.",
    ContentType.BACKGROUND:  "This sentence provides general context or background.",
}


@dataclass
class Classification:
    text: str
    content_type: ContentType
    confidence: float  # NLI score for the winning label, in [0, 1]


class ContentClassifier:
    """
    Zero-shot NLI classifier that routes memory segments to content types.

    Why zero-shot NLI?
      No labeled training data needed — the classifier works out of
      the box on any Droid memory file.
      DeBERTa-v3-large is the strongest publicly available NLI model
      for short-text classification with high label precision.

    Why not a fine-tuned classifier?
      We don't have labeled memory entries. Zero-shot lets us ship
      without a training set and still get clean routing.
      If classification accuracy becomes a bottleneck, fine-tuning
      on a small labeled set of Droid memory entries is the upgrade path.

    batch_size=32 means 32 segments are classified in one forward pass.
    Reduce this if you hit OOM on CPU.
    """

    def __init__(self, device: int = -1, batch_size: int = 32):
        # device=-1 means CPU. set to 0 for first GPU.
        self._pipe = pipeline(
            "zero-shot-classification",
            model="cross-encoder/nli-deberta-v3-large",
            device=device,
            torch_dtype=torch.float16,  # half precision — fast enough, accurate enough
        )
        self._labels = [ct.value for ct in ContentType]
        self._label_map = {ct.value: ct for ct in ContentType}
        self.batch_size = batch_size

    def classify(self, text: str) -> Classification:
        res = self._pipe(text, candidate_labels=self._labels, multi_label=False)
        return Classification(
            text=text,
            content_type=self._label_map[res["labels"][0]],
            confidence=res["scores"][0],
        )

    def classify_batch(self, texts: list[str]) -> list[Classification]:
        # pipeline returns a dict when input is a single string,
        # a list when input is a list — normalize to list here.
        raw = self._pipe(
            texts,
            candidate_labels=self._labels,
            multi_label=False,
            batch_size=self.batch_size,
        )
        if isinstance(raw, dict):
            raw = [raw]

        return [
            Classification(
                text=t,
                content_type=self._label_map[r["labels"][0]],
                confidence=r["scores"][0],
            )
            for t, r in zip(texts, raw)
        ]
