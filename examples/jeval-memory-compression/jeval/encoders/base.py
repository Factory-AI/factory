from abc import ABC, abstractmethod
import torch
from torch import Tensor


class Encoder(ABC):
    """
    Every encoder in jeval speaks this interface.
    The EPE computer only ever calls .encode() and .dim() —
    it never knows whether it is talking to the frozen sentence
    encoder or anything else. That is the point.
    """

    @abstractmethod
    def encode(self, texts: list[str]) -> Tensor:
        # Returns shape (batch_size, embedding_dim).
        # ALWAYS L2-normalized — every subclass must guarantee this.
        ...

    @abstractmethod
    def dim(self) -> int:
        # Returns the size of the embedding dimension.
        ...

    def normalize(self, x: Tensor) -> Tensor:
        # normalize lives here so every subclass gets it for free.
        # one implementation, one place to fix if the math changes.
        # p=2 = L2 norm. dim=-1 = normalize along embedding dimension.
        return torch.nn.functional.normalize(x, p=2, dim=-1)
