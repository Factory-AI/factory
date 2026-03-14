from dataclasses import dataclass
import torch
import torch.nn as nn
from torch import Tensor

from jeval.encoders.sentence_encoder import FrozenEncoder
from jeval.encoders.predictor_head import PredictorHead


@dataclass
class EPEResult:
    epe: float
    orig_emb: Tensor
    comp_emb: Tensor
    pred_emb: Tensor
    ratio: float
    seg_id: str = ""


class EPEComputer:
    """
    Computes EPE = sum((predictor(enc(C)) - enc(T))^2) / 4.0

    sum() keeps the full signal across 768 dims.
    /4.0 normalizes to [0,1] — max sum squared distance between
    unit vectors is 4.0 (perfectly opposite directions).
    """

    def __init__(self, encoder: FrozenEncoder, predictor: PredictorHead, device: str = "cpu"):
        self.enc     = encoder
        self.pred    = predictor
        self.device  = device
        self.loss_fn = nn.MSELoss(reduction="sum")

    def _epe(self, pred_emb: Tensor, orig_emb: Tensor) -> float:
        return self.loss_fn(pred_emb, orig_emb).item() / 4.0

    def compute(self, original: str, compressed: str) -> EPEResult:
        orig_emb = self.enc.encode([original]).squeeze(0)
        comp_emb = self.enc.encode([compressed]).squeeze(0)
        with torch.no_grad():
            pred_emb = self.pred(comp_emb.unsqueeze(0)).squeeze(0)
        epe   = self._epe(pred_emb, orig_emb)
        ratio = len(compressed.split()) / max(len(original.split()), 1)
        return EPEResult(epe, orig_emb.cpu(), comp_emb.cpu(), pred_emb.cpu(), ratio)

    def compute_batch(self, originals, compresseds, seg_ids=None):
        orig_embs = self.enc.encode_chunked(originals)
        comp_embs = self.enc.encode_chunked(compresseds)
        with torch.no_grad():
            pred_embs = self.pred(comp_embs)
        epes   = ((pred_embs - orig_embs) ** 2).sum(dim=-1) / 4.0
        ratios = [len(c.split()) / max(len(o.split()), 1) for o, c in zip(originals, compresseds)]
        return [
            EPEResult(epes[i].item(), orig_embs[i].cpu(), comp_embs[i].cpu(),
                      pred_embs[i].cpu(), ratios[i], seg_ids[i] if seg_ids else "")
            for i in range(len(originals))
        ]

    def training_loss(self, originals, compresseds) -> Tensor:
        with torch.no_grad():
            orig_embs = self.enc.encode_chunked(originals)
            comp_embs = self.enc.encode_chunked(compresseds)
        pred_embs = self.pred(comp_embs)
        return self.loss_fn(pred_embs, orig_embs)
