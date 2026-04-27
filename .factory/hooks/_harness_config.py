#!/usr/bin/env python3
from __future__ import annotations

import json
from pathlib import Path


def load_policy(repo_root: Path) -> dict:
    policy_path = repo_root / ".factory" / "policy.json"
    if not policy_path.exists():
        return {}
    return json.loads(policy_path.read_text())
