import torch
import torch.nn as nn
from torch import Tensor


class PredictorHead(nn.Module):
    """
    The trainable half of the JEPA setup.

    Input:  enc(compressed memory entry)  — shape (batch, d_in)
    Output: predicted enc(original entry) — shape (batch, d_in)
    The gap between output and reality = EPE.

    Why a transformer and not a simple MLP?
      An MLP treats each embedding dimension independently.
      A transformer can learn patterns like:
      'this embedding is missing a file path' or
      'this embedding lost a causal relationship'
      because attention can model interactions across dimensions.

    Why 3 layers?
      Enough to learn non-trivial mappings.
      Not so deep it memorizes the training set
      instead of learning a generalizable fidelity signal.

    Why norm_first=True (Pre-LayerNorm)?
      Standard transformers apply LayerNorm AFTER the attention block.
      Pre-LN applies it BEFORE. When training from scratch against a
      frozen target, Pre-LN gives more stable gradients from step 1.
      Post-LN can cause gradient explosion early in training here.
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
