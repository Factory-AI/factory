#!/usr/bin/env python3
from __future__ import annotations

import json
import os
import re
import sys
from pathlib import Path

from _harness_config import load_policy


def strip_heredocs(command: str) -> str:
    pattern = re.compile(
        r"<<-?\s*(['\"]?)([A-Za-z_][A-Za-z0-9_]*)\1[^\n]*\n.*?\n\s*\2\b",
        re.DOTALL,
    )
    previous = None
    sanitized = command
    while sanitized != previous:
        previous = sanitized
        sanitized = pattern.sub(" ", sanitized)
    return sanitized


def sanitize_command(command: str) -> str:
    without_heredocs = strip_heredocs(command)
    return re.sub(r"\s+", " ", without_heredocs).strip().lower()


def respond(decision: str, reason: str) -> int:
    print(
        json.dumps(
            {
                "hookSpecificOutput": {
                    "hookEventName": "PreToolUse",
                    "permissionDecision": decision,
                    "permissionDecisionReason": reason,
                }
            }
        )
    )
    return 0


def main() -> int:
    try:
        data = json.load(sys.stdin)
    except json.JSONDecodeError as exc:
        print(f"Invalid hook input: {exc}", file=sys.stderr)
        return 1

    if data.get("hook_event_name") != "PreToolUse":
        return 0
    if data.get("tool_name") != "Execute":
        return 0

    tool_input = data.get("tool_input", {})
    if not isinstance(tool_input, dict):
        return 0

    command = str(tool_input.get("command", ""))
    normalized = sanitize_command(command)
    resolved_repo_root = Path(
        os.environ.get("FACTORY_PROJECT_DIR") or Path(__file__).resolve().parents[2]
    )
    policy = load_policy(resolved_repo_root)

    for rule in policy.get("executePolicy", {}).get("rules", []):
        patterns = rule.get("patterns", [])
        if any(re.search(pattern, normalized) for pattern in patterns):
            return respond(
                rule.get("decision", "ask"),
                rule.get("reason", ""),
            )

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
