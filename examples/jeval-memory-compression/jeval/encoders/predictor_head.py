import torch
import torch.nn as nn
from torch import Tensor


class PredictorHead(nn.Module):
    """
    The trainable half of the JEPA setup.
    Input:  enc(compressed memory entry)  — shape (batch, d_in)
    Output: predicted enc(original entry) — shape (batch, d_in)
    The gap between output and reality = EPE.
    """

    def __init__(
        self,
        d_in: int = 768,
        d_hidden: int = 512,
        n_layers: int = 3,
        n_heads: int = 8,
        dropout: float = 0.1,
    ):
        super().__init__()
        self.in_proj = nn.Linear(d_in, d_hidden)
        layer = nn.TransformerEncoderLayer(
            d_model=d_hidden,
            nhead=n_heads,
            dim_feedforward=d_hidden * 4,
            dropout=dropout,
            batch_first=True,
            norm_first=True,
        )
        self.transformer = nn.TransformerEncoder(layer, num_layers=n_layers)
        self.out_proj = nn.Linear(d_hidden, d_in)
        self._init_weights()

    def _init_weights(self):
        for m in self.modules():
            if isinstance(m, nn.Linear):
                nn.init.xavier_uniform_(m.weight)
                if m.bias is not None:
                    nn.init.zeros_(m.bias)

    def forward(self, x: Tensor) -> Tensor:
        x = self.in_proj(x).unsqueeze(1)
        x = self.transformer(x).squeeze(1)
        x = self.out_proj(x)
        return nn.functional.normalize(x, p=2, dim=-1)
