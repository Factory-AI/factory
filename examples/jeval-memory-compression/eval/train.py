#!/usr/bin/env python3
"""
eval/train.py

Trains the JEPA predictor head on synthetic Droid memory compression pairs.

Generates (original, compressed) pairs by:
  1. Taking realistic Droid memory entries
  2. Applying word-dropout and truncation as the "compressed" version
  3. Training predictor to map enc(compressed) → enc(original)

After training, EPE becomes a calibrated signal:
  high EPE = this compression destroyed semantic content
  low EPE  = this compression preserved semantic content

Usage:
  python eval/train.py --epochs 20 --out jeval/encoders/predictor_best.pt
"""

import argparse
import random
import logging
from pathlib import Path

import torch
import numpy as np
from torch.optim import AdamW
from torch.optim.lr_scheduler import CosineAnnealingLR

from jeval.encoders.sentence_encoder import FrozenEncoder
from jeval.encoders.predictor_head import PredictorHead
from jeval.epe.core import EPEComputer

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(message)s")
log = logging.getLogger("jeval.train")

# ── Synthetic training data ────────────────────────────────────────────────────
# Realistic Droid memory entries covering all content types.
# We generate compressed versions via word dropout and truncation.

MEMORY_ENTRIES = [
    # ENTITY / FACTUAL — file paths, endpoints, error codes
    "modified src/middleware/auth.ts to add JWT verification middleware",
    "created src/config/redis.ts with connection pool settings and retry logic",
    "fixed 401 error on POST /api/login caused by missing Authorization header",
    "modified src/routes/api.ts to protect GET /api/users with auth middleware",
    "created tests/auth.test.ts with 14 unit tests for JWT verification",
    "fixed JWT_SECRET env var mismatch, was JWT_KEY in production",
    "modified src/server.ts to register cors middleware before route handlers",
    "created src/monitoring/auth-metrics.ts to track login success rates",
    "fixed Redis connection timeout by setting maxRetriesPerRequest to 10",
    "modified src/config/env.ts to consolidate all environment variable names",
    "created src/middleware/rate-limit.ts with 5 requests per minute on /api/login",
    "fixed CORS error on /api/login by moving cors() before router in src/server.ts",
    "modified src/routes/api.ts to add POST /api/refresh for token renewal",
    "created src/utils/jwt.ts with sign and verify helper functions",
    "fixed memory leak in src/middleware/auth.ts by clearing expired tokens",

    # CAUSAL — decisions with reasoning
    "decided to use Redis over Postgres for session storage because connection pool was exhausted under load",
    "rejected storing JWT in localStorage because of XSS vulnerability risk, using httpOnly cookies instead",
    "decided to use jsonwebtoken over passport.js because we only need JWT and passport adds complexity",
    "chose Prometheus over Datadog because we already have a Prometheus instance running in staging",
    "decided to set token expiry to 24 hours because users complained about being logged out too frequently",
    "rejected symmetric encryption for tokens because key rotation would invalidate all active sessions",
    "decided to add rate limiting before deploying to production because of brute force attack risk",
    "chose Redis pub/sub over WebSockets because the existing infrastructure already supports it",
    "decided to use refresh tokens because access token expiry was causing poor user experience",
    "rejected storing session state in memory because it would not survive server restarts",

    # TEMPORAL — next steps, ordering
    "rotate JWT_SECRET in production before go-live scheduled for Friday",
    "deploy authentication changes to staging and run smoke tests against /api/login",
    "PR review needed on src/monitoring/auth-metrics.ts before merge to main",
    "enable Prometheus scrape target for auth-metrics before enabling alerts",
    "run load test against /api/login after rate limiting is deployed",
    "update API documentation to reflect new Authorization header requirement",
    "schedule security audit of JWT implementation before production release",

    # BACKGROUND — low value ambient content
    "the afternoon standup went well and the team is aligned on the approach",
    "all 14 tests are passing in the current build",
    "the session was productive and good progress was made on authentication",
    "authentication flow is working end to end in the development environment",
    "CORS is fixed and the frontend can now reach the login endpoint",
    "the team agreed to do a code review before merging the auth changes",
    "staging environment is ready for the authentication deployment",
]


def make_compressed(text: str, strategy: str) -> str:
    """
    Generate a compressed version of a memory entry.

    Three strategies mirror real compression failure modes:
      truncate:     cut the end (loses file paths at end of entry)
      word_dropout: randomly drop words (loses specific identifiers)
      abstractify:  replace specific terms with generic ones
    """
    words = text.split()

    if strategy == "truncate":
        # keep 40-70% of words from the start
        keep = max(3, int(len(words) * random.uniform(0.4, 0.7)))
        return " ".join(words[:keep])

    elif strategy == "word_dropout":
        # randomly drop 30-50% of words
        keep_prob = random.uniform(0.5, 0.7)
        kept = [w for w in words if random.random() < keep_prob]
        return " ".join(kept) if kept else words[0]

    elif strategy == "abstractify":
        # replace specific identifiers with generic terms
        replacements = {
            "src/middleware/auth.ts": "the auth file",
            "src/config/redis.ts": "the config file",
            "src/routes/api.ts": "the routes file",
            "src/server.ts": "the server file",
            "JWT_SECRET": "the secret",
            "/api/login": "the endpoint",
            "maxRetriesPerRequest": "the retry setting",
            "httpOnly": "the cookie flag",
            "401": "an error code",
            "Redis": "the cache",
            "Postgres": "the database",
        }
        result = text
        for specific, generic in replacements.items():
            result = result.replace(specific, generic)
        return result

    return text


def generate_pairs(n_pairs: int = 2000) -> list[tuple[str, str]]:
    """
    Generate (original, compressed) training pairs.

    Mix of strategies to teach the predictor to detect
    all compression failure modes.
    """
    pairs = []
    strategies = ["truncate", "word_dropout", "abstractify"]

    for _ in range(n_pairs):
        original   = random.choice(MEMORY_ENTRIES)
        strategy   = random.choice(strategies)
        compressed = make_compressed(original, strategy)
        pairs.append((original, compressed))

    # also add verbatim pairs (EPE should be low for these)
    for entry in MEMORY_ENTRIES:
        pairs.append((entry, entry))

    random.shuffle(pairs)
    return pairs


# ── Training loop ──────────────────────────────────────────────────────────────

def train(args):
    random.seed(42)
    np.random.seed(42)
    torch.manual_seed(42)

    device = "cuda" if torch.cuda.is_available() else "cpu"
    log.info("training on %s", device)

    encoder   = FrozenEncoder(device=device)
    predictor = PredictorHead(d_in=encoder.dim()).to(device)
    computer  = EPEComputer(encoder, predictor, device=device)

    # generate pairs and split
    all_pairs  = generate_pairs(n_pairs=args.n_pairs)
    split      = int(len(all_pairs) * 0.9)
    train_pairs = all_pairs[:split]
    val_pairs   = all_pairs[split:]
    log.info("train=%d  val=%d", len(train_pairs), len(val_pairs))

    opt   = AdamW(predictor.parameters(), lr=args.lr, weight_decay=1e-4)
    sched = CosineAnnealingLR(opt, T_max=args.epochs)

    best_val  = float("inf")
    patience  = 0
    out_path  = Path(args.out)
    out_path.parent.mkdir(parents=True, exist_ok=True)

    for epoch in range(args.epochs):
        # ── train ──
        predictor.train()
        train_loss, n = 0.0, 0
        for i in range(0, len(train_pairs), args.batch_size):
            batch = train_pairs[i:i+args.batch_size]
            origs = [p[0] for p in batch]
            comps = [p[1] for p in batch]
            opt.zero_grad()
            loss = computer.training_loss(origs, comps)
            loss.backward()
            torch.nn.utils.clip_grad_norm_(predictor.parameters(), 1.0)
            opt.step()
            train_loss += loss.item()
            n += 1

        # ── validate ──
        predictor.eval()
        val_loss, vn = 0.0, 0
        with torch.no_grad():
            for i in range(0, len(val_pairs), args.batch_size):
                batch = val_pairs[i:i+args.batch_size]
                val_loss += computer.training_loss(
                    [p[0] for p in batch], [p[1] for p in batch]
                ).item()
                vn += 1

        avg_train = train_loss / max(n, 1)
        avg_val   = val_loss   / max(vn, 1)
        sched.step()

        log.info("epoch %2d/%d  train=%.2f  val=%.2f", epoch+1, args.epochs, avg_train, avg_val)

        if avg_val < best_val:
            best_val  = avg_val
            patience  = 0
            torch.save(predictor.state_dict(), out_path)
            log.info("  saved checkpoint → %s", out_path)
        else:
            patience += 1
            if patience >= args.patience:
                log.info("early stopping at epoch %d", epoch+1)
                break

    log.info("training complete. best val loss=%.4f", best_val)
    log.info("checkpoint saved to %s", out_path)

    # ── quick sanity check ──
    predictor.load_state_dict(torch.load(out_path, map_location=device))
    predictor.eval()

    log.info("\n── Sanity Check ──")
    test_cases = [
        ("modified src/middleware/auth.ts to add JWT verification",
         "modified the auth file",
         "abstractify — should have HIGH EPE"),
        ("modified src/middleware/auth.ts to add JWT verification",
         "modified src/middleware/auth.ts to add JWT verification",
         "verbatim — should have LOW EPE"),
        ("fixed 401 error on /api/login caused by missing Authorization header",
         "fixed error on the endpoint",
         "abstractify — should have HIGH EPE"),
    ]

    computer2 = EPEComputer(encoder, predictor, device=device)
    for orig, comp, label in test_cases:
        r = computer2.compute(orig, comp)
        log.info("EPE=%.4f  %s", r.epe, label)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--epochs",     type=int,   default=20)
    parser.add_argument("--batch_size", type=int,   default=64)
    parser.add_argument("--lr",         type=float, default=3e-4)
    parser.add_argument("--n_pairs",    type=int,   default=2000)
    parser.add_argument("--patience",   type=int,   default=4)
    parser.add_argument("--out",        type=str,   default=".factory/hooks/predictor_best.pt")
    args = parser.parse_args()
    train(args)
