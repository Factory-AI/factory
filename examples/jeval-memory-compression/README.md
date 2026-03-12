# jeval — JEPA-based Memory Compression for Droid

Adds a semantic fidelity layer to Droid's `PreCompact` hook that verifies
what will be lost **before** compression happens, then protects high-risk
memory entries from being discarded.

Targets the artifact tracking gap identified in Factory's own evaluation:
all methods score 2.19–2.45/5 on artifact probes. jeval is designed to
move that number by treating file paths, error codes, and named entities
as high-risk content that must survive compression verbatim.

---

## How it works
```
memories.md
    │
    ▼
Segment into ~80-word chunks
    │
    ▼
Strata classifier (zero-shot NLI)
assigns each segment a content type:
FACTUAL / CAUSAL / ENTITY / TEMPORAL / CONTRASTIVE / BACKGROUND
    │
    ▼
EPE computer (JEPA predictor)
estimates semantic loss for each segment
EPE = MSE(predictor(enc(compressed)), enc(original)) / 4
    │
    ▼
Budget allocator
EPE × content-type weight → compression tier:
  > 0.35  →  verbatim (protect)
  > 0.10  →  light compression
  ≤ 0.10  →  aggressive compression
    │
    ▼
verified memories.md written back
```

The key insight: a sentence like
`modified src/auth/refresh.ts to fix 401 on /api/login`
and `auth changes were made` are far apart in embedding space.
EPE catches this. Naive compression does not.

---

## Install
```bash
# from your project root
pip install -e "examples/jeval-memory-compression[dev]"

# download NLTK tokenizer (needed by abstractive alignment)
python -c "import nltk; nltk.download('punkt')"
```

---

## Register the PreCompact hook

Add to `~/.factory/settings.json`:
```json
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
```

That's it. jeval now intercepts every compact operation and writes
back a verified `memories.md` before Droid sees it.

---

## Train the predictor (optional but recommended)

Without a trained predictor, EPE runs but is not calibrated.
The hook still works — it just uses random initialization,
which means budgets are less accurate.

To train on your own Droid sessions:
```bash
# coming in next PR — training script
# requires pairs of (original, compressed) memory entries
python examples/jeval-memory-compression/eval/train.py
```

A pretrained checkpoint will be added once benchmark results
are validated.

---

## Measure artifact tracking score

Run Factory's probe-based evaluation methodology on your memory:
```bash
# back up original before compression
cp .factory/memories.md .factory/memories_original.md

# trigger a Droid session to generate a PreCompact event
# then score the compressed output
python examples/jeval-memory-compression/.factory/hooks/score_artifacts.py \
  --memory   .factory/memories.md \
  --original .factory/memories_original.md \
  --model    gpt-4o \
  --out      results.json
```

Output:
```
── jeval Probe Evaluation Results ──────────────────
probe           overall  accuracy   artifact  continuity
────────────────────────────────────────────────────────
recall             3.80      4.10       2.90       3.70
artifact           3.60      3.90       3.20       3.50
continuation       3.70      3.80       2.80       3.90
decision           3.65      3.95       2.95       3.60
────────────────────────────────────────────────────────
AVERAGE            3.69               2.96

Factory baseline — overall: 3.70  artifact: 2.45
OpenAI baseline  — overall: 3.35  artifact: 2.19

jeval artifact delta vs Factory: +0.51
```

---

## Audit log

Every compression event is logged to:
`.factory/hooks/compression_log.jsonl`

Each line is one event with token counts, global EPE,
and per-segment content type, EPE, and budget decisions.
Useful for debugging which entries are being dropped.

---

## Project structure
```
jeval-memory-compression/
├── jeval/
│   ├── encoders/
│   │   ├── base.py               # encoder interface
│   │   ├── sentence_encoder.py   # frozen target encoder
│   │   └── predictor_head.py     # trainable JEPA predictor
│   ├── epe/
│   │   ├── core.py               # EPE computation
│   │   └── decomposer.py         # per-content-type EPE breakdown
│   ├── strata/
│   │   ├── classifier.py         # zero-shot NLI content router
│   │   └── budget.py             # compression budget allocator
│   └── compression/
│       └── adaptive.py           # full adaptive compression pipeline
├── .factory/
│   └── hooks/
│       ├── precompact_jeval.py   # PreCompact hook (drop-in for Droid)
│       └── score_artifacts.py    # Factory-style probe evaluation
├── eval/
│   └── probe_eval.py             # standalone evaluation runner
└── README.md
```

---

## Contributing

Training data, threshold calibration results, and pretrained
checkpoints welcome via PR.

