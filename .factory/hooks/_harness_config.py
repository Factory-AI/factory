#!/usr/bin/env python3
from __future__ import annotations

import json
from pathlib import Path


def load_policy(repo_root: Path) -> dict:
    policy_path = repo_root / ".factory" / "policy.json"
    if not policy_path.exists():
        return {}
    return json.loads(policy_path.read_text())


def session_context_lines(policy: dict) -> list[str]:
    repo_context = policy.get("repoContext", {})
    lines = ["Factory public docs repo context:"]
    for key in ("publicRepoNotice", "previewPolicy", "statusPolicy"):
        value = repo_context.get(key)
        if value:
            lines.append(f"- {value}")
    lines.append("- Public-safety review applies to docs, workflows, prompts, and `.factory/**` files.")
    lines.append("- Use Mintlify validation or PR previews for docs verification; do not launch local previews autonomously.")
    return lines
