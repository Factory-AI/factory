import re
import os
import json
import urllib.request
from jeval.epe.core import EPEComputer
from jeval.strata.classifier import ContentClassifier
from jeval.strata.budget import BudgetAllocator, SegmentPlan

MIN_WORDS_TO_COMPRESS = 8
NVIDIA_API_URL = "https://integrate.api.nvidia.com/v1/chat/completions"
NVIDIA_MODEL   = "mistralai/mistral-small-3.1-24b-instruct-2503"


def _segment(text: str) -> list[str]:
    segments = []
    for line in text.splitlines():
        line = line.strip()
        if not line:
            continue
        if line.startswith("##") or line.startswith("-"):
            segments.append(line)
        else:
            if segments:
                segments[-1] += " " + line
            else:
                segments.append(line)
    return [s for s in segments if len(s.split()) >= 3]


def _llm_compress(segment: str, budget: float) -> str:
    """
    Use Mistral via NVIDIA NIM to compress a segment to the target budget.
    Falls back to word truncation if API call fails or key is missing.
    """
    api_key = os.environ.get("NVIDIA_API_KEY")
    if not api_key:
        words = segment.split()
        keep  = max(1, int(len(words) * budget))
        return " ".join(words[:keep])

    target_words = max(4, int(len(segment.split()) * budget))
    prompt = (
        f"Summarize the following in at most {target_words} words. "
        f"Preserve any file paths, function names, error codes, and variable names exactly. "
        f"Return only the summary, no explanation.\n\n{segment}"
    )

    payload = json.dumps({
        "model": NVIDIA_MODEL,
        "messages": [{"role": "user", "content": prompt}],
        "max_tokens": 128,
        "temperature": 0.0,
    }).encode()

    req = urllib.request.Request(
        NVIDIA_API_URL,
        data=payload,
        headers={
            "Content-Type":  "application/json",
            "Authorization": f"Bearer {api_key}",
        },
    )

    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            data    = json.loads(resp.read())
            summary = data["choices"][0]["message"]["content"].strip()
            return summary
    except Exception:
        words = segment.split()
        keep  = max(1, int(len(words) * budget))
        return " ".join(words[:keep])


def _apply_budget(segment: str, budget: float) -> str:
    if budget >= 1.0:
        return segment
    if len(segment.split()) < MIN_WORDS_TO_COMPRESS:
        return segment
    return _llm_compress(segment, budget)


class AdaptiveCompressor:
    """
    EPE-guided adaptive compressor for Droid memory files.

    Pipeline:
      1. Segment by bullet points and headers
      2. Classify each segment by content type
      3. Compute EPE vs proxy compression
      4. Build per-segment budget plan (z-score calibrated)
      5. Apply budgets via LLM summarization
    """

    def __init__(
        self,
        computer: EPEComputer,
        classifier: ContentClassifier,
        allocator: BudgetAllocator,
    ):
        self.computer   = computer
        self.classifier = classifier
        self.allocator  = allocator

    def compress(
        self,
        memory_text: str,
        segments: list[str] | None = None,
    ) -> tuple[str, list[SegmentPlan]]:
        if segments is None:
            segments = _segment(memory_text)

        if not segments:
            return memory_text, []

        clf_results = self.classifier.classify_batch(segments)
        proxy       = [_apply_budget(s, 0.8) for s in segments]
        epe_results = self.computer.compute_batch(
            segments, proxy,
            seg_ids=[str(i) for i in range(len(segments))]
        )

        plan = self.allocator.plan(segments, epe_results, clf_results)

        compressed_parts = [_apply_budget(p.segment, p.budget) for p in plan]
        compressed_text  = "\n".join(compressed_parts)

        return compressed_text, plan
