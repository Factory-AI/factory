from dataclasses import dataclass
import torch
import torch.nn as nn
from torch import Tensor

from jeval.encoders.sentence_encoder import FrozenEncoder
from jeval.encoders.predictor_head import PredictorHead


@dataclass
class EPEResult:
    """
    Everything jeval knows about one compression measurement.

    We keep the raw embeddings (not just the scalar) because:
    - calibration in RQ1 needs orig_emb as ground truth
    - the artifact scorer needs them for structural probes
    - visualization needs them for the paper figures
    """
    epe: float        # normalized EPE in [0, 1]. 0 = perfect, 1 = total loss.
    orig_emb: Tensor  # enc(original) — the target we're trying to reconstruct
    comp_emb: Tensor  # enc(compressed) — what we actually have
    pred_emb: Tensor  # predictor(enc(compressed)) — our best guess at original
    ratio: float      # compression ratio: len(compressed) / len(original) tokens
    seg_id: str = ""  # which memory segment this came from


class EPEComputer:
    """
    Computes EPE(original, compressed) = sum((predictor(enc(C)) - enc(T))^2) / 4.0

    Why sum and not mean?
      MSELoss(reduction='mean') averages across all 768 embedding dimensions.
      Two orthogonal unit vectors have total squared distance ~2.0, but
      averaged across 768 dims that becomes 2.0/768 = 0.0026 — near zero
      and indistinguishable from verbatim compression.
      sum() keeps the full signal. /2.0 normalizes to [0, 1] because
      the maximum sum squared distance between two unit vectors is 2.0
      (perfectly opposite directions: ||u - (-u)||^2 = ||2u||^2 = 4,
      but MSE sum on unit sphere max = 2.0 for orthogonal vectors in
      expectation — we use 2.0 as the practical normalization constant).

    Two modes — same class, different methods:

    TRAINING MODE — .training_loss()
      Gradients flow through the predictor only.
      Frozen encoder stays inside torch.no_grad().

    INFERENCE MODE — .compute() or .compute_batch()
      No gradients. EPE is purely a measurement instrument.
      In real deployment you only have enc(C) — the original T
      is gone. We include enc(T) here only because RQ1 needs it
      to compute the calibration correlation.
    """

    def __init__(self, encoder: FrozenEncoder, predictor: PredictorHead, device: str = "cpu"):
        self.enc = encoder
        self.pred = predictor
        self.device = device
        # sum reduction keeps the full signal across all embedding dims
        self.loss_fn = nn.MSELoss(reduction='sum')

    def _epe(self, pred_emb: Tensor, orig_emb: Tensor) -> float:
        # sum squared distance normalized to [0, 1]
        # max sum squared distance between unit vectors ≈ 2.0
        return self.loss_fn(pred_emb, orig_emb).item() / 4.0

    def compute(self, original: str, compressed: str) -> EPEResult:
        orig_emb = self.enc.encode([original]).squeeze(0)
        comp_emb = self.enc.encode([compressed]).squeeze(0)

        with torch.no_grad():
            pred_emb = self.pred(comp_emb.unsqueeze(0)).squeeze(0)

        epe   = self._epe(pred_emb, orig_emb)
        ratio = len(compressed.split()) / max(len(original.split()), 1)

        return EPEResult(
            epe=epe,
            orig_emb=orig_emb.cpu(),
            comp_emb=comp_emb.cpu(),
            pred_emb=pred_emb.cpu(),
            ratio=ratio,
        )

    def compute_batch(
        self,
        originals: list[str],
        compresseds: list[str],
        seg_ids: list[str] | None = None,
    ) -> list[EPEResult]:
        orig_embs = self.enc.encode_chunked(originals)
        comp_embs = self.enc.encode_chunked(compresseds)

        with torch.no_grad():
            pred_embs = self.pred(comp_embs)

        # per-sample sum across embedding dim, normalized
        # (pred - orig)^2 shape: (N, dim) → sum → (N,) → /2.0
        epes = ((pred_embs - orig_embs) ** 2).sum(dim=-1) / 4.0

        ratios = [
            len(c.split()) / max(len(o.split()), 1)
            for o, c in zip(originals, compresseds)
        ]

        return [
            EPEResult(
                epe=epes[i].item(),
                orig_emb=orig_embs[i].cpu(),
                comp_emb=comp_embs[i].cpu(),
                pred_emb=pred_embs[i].cpu(),
                ratio=ratios[i],
                seg_id=seg_ids[i] if seg_ids else "",
            )
            for i in range(len(originals))
        ]

    def training_loss(self, originals: list[str], compresseds: list[str]) -> Tensor:
        with torch.no_grad():
            orig_embs = self.enc.encode_chunked(originals)
            comp_embs = self.enc.encode_chunked(compresseds)
        pred_embs = self.pred(comp_embs)
        # sum reduction for training too — consistent with inference
        return self.loss_fn(pred_embs, orig_embs)
