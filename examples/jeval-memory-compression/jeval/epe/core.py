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
    Computes EPE(original, compressed) = MSE(predictor(enc(C)), enc(T)) / 4

    Two modes — same class, different methods:

    TRAINING MODE — .training_loss()
      Gradients flow through the predictor only.
      Frozen encoder stays inside torch.no_grad().
      Call loss.backward() after this.

    INFERENCE MODE — .compute() or .compute_batch()
      This is the research contribution.
      No gradients. No backprop.
      EPE is purely a measurement instrument here.

      In real deployment you only have enc(C) — the original T
      is gone. The predictor's output IS your estimate of what
      the original embedding should have been.
      We include enc(T) here only because RQ1 needs it to
      compute the calibration correlation (EPE vs actual task loss).
    """

    def __init__(self, encoder: FrozenEncoder, predictor: PredictorHead, device: str = "cpu"):
        self.enc = encoder
        self.pred = predictor
        self.device = device
        # MSELoss averages across the embedding dimension.
        # on unit vectors this gives values in [0, 4].
        # dividing by 4 normalizes to [0, 1].
        self.mse = nn.MSELoss()

    def compute(self, original: str, compressed: str) -> EPEResult:
        orig_emb = self.enc.encode([original]).squeeze(0)   # (dim,)
        comp_emb = self.enc.encode([compressed]).squeeze(0) # (dim,)

        with torch.no_grad():
            pred_emb = self.pred(comp_emb.unsqueeze(0)).squeeze(0) # (dim,)

        epe = self.mse(pred_emb, orig_emb).item() / 4.0
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
        orig_embs = self.enc.encode_chunked(originals)   # (N, dim)
        comp_embs = self.enc.encode_chunked(compresseds) # (N, dim)

        with torch.no_grad():
            pred_embs = self.pred(comp_embs)             # (N, dim)

        # per-sample MSE: mean across embedding dim, then normalize
        # shape: (N, dim) → (N,)
        epes = ((pred_embs - orig_embs) ** 2).mean(dim=-1) / 4.0

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
        # frozen encoder: no_grad so PyTorch doesn't waste memory
        # building a computation graph for it
        with torch.no_grad():
            orig_embs = self.enc.encode_chunked(originals)
            comp_embs = self.enc.encode_chunked(compresseds)

        # predictor: gradients ARE tracked here — this is what trains
        pred_embs = self.pred(comp_embs)

        # raw MSE (not /4) for training — the scale doesn't matter
        # for gradient direction, only for the reported loss value
        return self.mse(pred_embs, orig_embs)
