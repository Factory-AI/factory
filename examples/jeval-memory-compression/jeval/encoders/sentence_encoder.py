import torch
from torch import Tensor
from sentence_transformers import SentenceTransformer
from .base import Encoder


class FrozenEncoder(Encoder):
    """
    Frozen SentenceTransformer — the JEPA target encoder.

    Its job: define what 'semantic content' is.
    We never touch its weights. Ever.

    Why sentence-transformers?
      Trained with contrastive objectives — semantically distinct
      sentences are already pushed apart in embedding space.
      So EPE will be sensitive to MEANING differences, not just
      surface word differences.

      Example: 'modified src/auth/refresh.ts to fix token expiry'
      vs 'auth changes were made' — very different embeddings.
      That gap is exactly what EPE measures.

    Why frozen?
      If this encoder trained alongside the predictor, the predictor
      could cheat — it learns to output whatever the moving target
      outputs rather than learning a real fidelity signal.
      Freezing it means EPE has one fixed meaning: semantic distance
      from the original.
    """

    def __init__(self, model: str = "all-mpnet-base-v2", device: str = "cpu"):
        # cpu default so it runs without a GPU during development.
        # swap to "cuda" when running the full experiment.
        self._model = SentenceTransformer(model, device=device)

        # freeze every parameter — this is non-negotiable
        for p in self._model.parameters():
            p.requires_grad = False

        self._dim = self._model.get_sentence_embedding_dimension()

    def encode(self, texts: list[str]) -> Tensor:
        # torch.no_grad() tells PyTorch: don't track any operations
        # here for backprop. saves memory and is faster at inference.
        with torch.no_grad():
            emb = self._model.encode(
                texts,
                convert_to_tensor=True,
                normalize_embeddings=False,  # we normalize ourselves in base
                show_progress_bar=False,
            )
        return self.normalize(emb)  # → unit sphere, shape (batch, dim)

    def encode_chunked(self, texts: list[str], chunk: int = 32) -> Tensor:
        # encodes in batches of `chunk` to avoid OOM on long memory files.
        # torch.cat joins the list of (chunk, dim) tensors into (N, dim).
        return torch.cat(
            [self.encode(texts[i:i+chunk]) for i in range(0, len(texts), chunk)]
        )

    def dim(self) -> int:
        return self._dim
