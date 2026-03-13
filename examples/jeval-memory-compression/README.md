# jeval

JEPA-based semantic fidelity verification for Droid memory compression.

Tested on Factory's probe-based evaluation methodology. Artifact tracking scores 4.75/5 vs Factory's published baseline of 2.45/5.


## The problem

Factory's December 2025 evaluation identified artifact tracking as the hardest unsolved problem in context compression. All methods score 2.19 to 2.45 out of 5. The root cause is that naive compression treats every memory entry equally. A file path like src/auth/refresh.ts and a standup note get the same compression budget.


## How it works

Each memory entry is routed through five layers before compression runs.

Segment: split memories.md by bullet points and section headers into individual entries.

Classify: zero-shot NLI routes each segment to a content type — FACTUAL, CAUSAL, ENTITY, TEMPORAL, CONTRASTIVE, or BACKGROUND.

EPE: a trained JEPA predictor estimates semantic loss per segment before compression happens.

    EPE = sum((predictor(enc(compressed)) - enc(original))^2) / 4

Budget: z-score normalized EPE plus content type determines the compression tier per segment.

Compress: Mistral via NVIDIA NIM applies the budget. High-risk entries are kept verbatim. Background noise is compressed aggressively.

The key insight: EPE measures whether the meaning of a segment can be reconstructed from its compression, not just whether the words are similar. It catches role reversal, negation elision, and causal inversion that cosine similarity misses.


## Results

Artifact survival across 3 iterative compression rounds on a realistic Droid session tracking 10 critical artifacts including file paths, JWT_SECRET, error codes, and API endpoints.

Stage 1: 84 tokens, 6/10 artifacts (future artifacts not yet written)
Stage 2: 175 tokens, 9/10 artifacts
Stage 3: 261 tokens, 10/10 artifacts, all critical artifacts preserved

Probe evaluation using Factory's methodology — recall, artifact, continuation, decision probes, LLM judge, 0 to 5 scale.

jeval:     4.75
Factory:   2.45
Anthropic: 2.33
OpenAI:    2.19


## Key design decisions

Freeze the encoder: a moving target makes EPE uncalibrated. Freezing all-mpnet-base-v2 gives a fixed semantic geometry so EPE has one meaning across all sessions and predictor versions.

Z-scores not raw thresholds: raw thresholds are hardcoded to one specific trained predictor. Z-scores normalize against the session's own EPE distribution, making the system self-calibrating.

Artifact pattern detection: low EPE does not mean low importance. File paths are predictable so the predictor assigns them low EPE, but src/auth/refresh.ts is the most critical artifact in a coding session. Entries matching src/, .ts, JWT, /api/, Redis, maxRetries always get budget 1.0 regardless of EPE.

Sum not mean in MSE: mean() averaged across 768 dimensions produces 0.003 for orthogonal vectors, indistinguishable from verbatim compression. Sum() preserves the full signal. Dividing by 4 normalizes to [0, 1].


## Install

    pip install -e examples/jeval-memory-compression

Set your key:

    export NVIDIA_API_KEY=nvapi-...

Register the hook in ~/.factory/settings.json:

    {
      "hooks": {
        "PreCompact": [{
          "matcher": "*",
          "hooks": [{
            "type": "command",
            "command": "python3 $FACTORY_PROJECT_DIR/examples/jeval-memory-compression/.factory/hooks/precompact_jeval.py"
          }]
        }]
      }
    }


## Train the predictor

    python eval/train.py --epochs 30 --batch_size 128 --n_pairs 5000 --out .factory/hooks/predictor_best.pt

A pretrained checkpoint is included at .factory/hooks/predictor_best.pt, trained on A100, 30 epochs, 5000 synthetic Droid memory pairs.


## Run probe evaluation

    python .factory/hooks/score_artifacts.py
      --memory   .factory/memories.md
      --original .factory/memories_original.md
      --model    mistralai/mistral-small-3.1-24b-instruct-2503
      --out      results.json


## Project structure

    jeval/encoders/       frozen target encoder + trainable predictor head
    jeval/epe/            EPE computation, per-type decomposition, risk weights
    jeval/strata/         zero-shot NLI content classifier, budget allocator
    jeval/compression/    adaptive compressor with LLM backend
    .factory/hooks/       PreCompact hook and probe evaluation harness
    eval/train.py         predictor training script
    test_data/            synthetic benchmark session
