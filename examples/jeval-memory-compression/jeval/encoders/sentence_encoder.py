import torch
from torch import Tensor
from sentence_transformers import SentenceTransformer
from .base import Encoder


class FrozenEncoder(Encoder):
    """
    Frozen SentenceTransformer — the JEPA target encoder.
    Its job: define what semantic content is.
    We never touch its weights. Ever.
    """

    def __init__(self, model: str = "all-mpnet-base-v2", device: str = "cpu"):
        self._model = SentenceTransformer(model, device=device)
        for p in self._model.parameters():
            p.requires_grad = False
        self._dim = self._model.get_sentence_embedding_dimension()

    def encode(self, texts: list[str]) -> Tensor:
        with torch.no_grad():
            emb = self._model.encode(
                texts,
                convert_to_tensor=True,
                normalize_embeddings=False,
                show_progress_bar=False,
            )
        return self.normalize(emb)

    def encode_chunked(self, texts: list[str], chunk: int = 32) -> Tensor:
        return torch.cat(
            [self.encode(texts[i:i+chunk]) for i in range(0, len(texts), chunk)]
        )

    def dim(self) -> int:
        return self._dim
