#!/usr/bin/env python3
"""
PreCompact hook — intercepts Droid before it compresses memory.

Droid calls this via the PreCompact hook event, passing a JSON
payload on stdin. We read the memory file, run jeval's adaptive
compressor, write back a verified memories.md, then tell Droid
to use our output instead of running its own compression.

Hook registration (add to ~/.factory/settings.json):
{
  "hooks": {
    "PreCompact": [
      {
        "matcher": "*",
        "hooks": [
          {
            "type": "command",
            "command": "python3 $FACTORY_PROJECT_DIR/examples/jeval-memory-compression/.factory/hooks/precompact_jeval.py"
          }
        ]
      }
    ]
  }
}
"""

import json
import sys
import os
import logging
from pathlib import Path

# add the example root to sys.path so jeval imports work
sys.path.insert(0, str(Path(__file__).resolve().parents[3]))

from jeval.encoders.sentence_encoder import FrozenEncoder
from jeval.encoders.predictor_head import PredictorHead
from jeval.epe.core import EPEComputer
from jeval.strata.classifier import ContentClassifier
from jeval.strata.budget import BudgetAllocator
from jeval.compression.adaptive import AdaptiveCompressor

logging.basicConfig(level=logging.INFO, stream=sys.stderr)
log = logging.getLogger("jeval.precompact")

# paths
MEMORY_FILE  = Path(os.environ.get("FACTORY_PROJECT_DIR", ".")) / ".factory/memories.md"
WEIGHTS_FILE = Path(__file__).parent / "predictor_best.pt"
LOG_FILE     = Path(__file__).parent / "compression_log.jsonl"


def load_compressor() -> AdaptiveCompressor:
    """
    Build the jeval pipeline.

    If a trained predictor checkpoint exists at predictor_best.pt,
    load it. Otherwise use the randomly initialized predictor —
    EPE will still run but won't be calibrated yet.
    This lets the hook work immediately on install, before training.
    """
    encoder   = FrozenEncoder(device="cpu")
    predictor = PredictorHead(d_in=encoder.dim())

    if WEIGHTS_FILE.exists():
        import torch
        predictor.load_state_dict(torch.load(WEIGHTS_FILE, map_location="cpu"))
        log.info("loaded trained predictor from %s", WEIGHTS_FILE)
    else:
        log.warning(
            "no trained predictor found at %s — "
            "using untrained predictor. run eval/train.py first.", WEIGHTS_FILE
        )

    computer   = EPEComputer(encoder, predictor, device="cpu")
    classifier = ContentClassifier(device=-1)   # -1 = CPU
    allocator  = BudgetAllocator(high_thresh=0.35, low_thresh=0.10)

    return AdaptiveCompressor(computer, classifier, allocator)


def log_compression_event(original: str, compressed: str, plan: list, global_epe: float):
    """
    Append one compression event to the audit log as JSONL.
    Each line is one compression event — easy to grep and analyze.
    """
    import time
    entry = {
        "timestamp":        time.time(),
        "original_tokens":  len(original.split()),
        "compressed_tokens": len(compressed.split()),
        "compression_ratio": len(compressed.split()) / max(len(original.split()), 1),
        "global_epe":       global_epe,
        "segments": [
            {
                "content_type":  p.content_type.value,
                "epe":           p.epe,
                "weighted_risk": p.weighted_risk,
                "budget":        p.budget,
            }
            for p in plan
        ],
    }
    with open(LOG_FILE, "a") as f:
        f.write(json.dumps(entry) + "\n")


def main():
    # read hook payload from stdin — Droid passes event data as JSON
    try:
        payload = json.load(sys.stdin)
    except json.JSONDecodeError:
        payload = {}

    # read current memory file
    if not MEMORY_FILE.exists():
        log.info("no memory file found at %s — nothing to compress", MEMORY_FILE)
        sys.exit(0)

    original_text = MEMORY_FILE.read_text(encoding="utf-8")

    if not original_text.strip():
        log.info("memory file is empty — nothing to compress")
        sys.exit(0)

    log.info("running jeval on %d tokens", len(original_text.split()))

    # run jeval adaptive compression
    compressor = load_compressor()
    compressed_text, plan = compressor.compress(original_text)

    # compute global EPE for the audit log
    global_epe = sum(p.epe for p in plan) / max(len(plan), 1)

    # write verified compressed memory back to the file
    MEMORY_FILE.write_text(compressed_text, encoding="utf-8")
    log.info(
        "compression complete — %d → %d tokens  global_epe=%.4f",
        len(original_text.split()),
        len(compressed_text.split()),
        global_epe,
    )

    # log the event for later artifact score analysis
    log_compression_event(original_text, compressed_text, plan, global_epe)

    # tell Droid the compression succeeded
    # exit 0 = hook passed, Droid continues normally
    # exit 1 = hook failed, Droid falls back to native compression
    print(json.dumps({
        "systemMessage": (
            f"jeval: compressed memory {len(original_text.split())} → "
            f"{len(compressed_text.split())} tokens  "
            f"EPE={global_epe:.4f}"
        )
    }))
    sys.exit(0)


if __name__ == "__main__":
    main()
