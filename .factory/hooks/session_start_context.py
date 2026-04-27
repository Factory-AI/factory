#!/usr/bin/env python3
from __future__ import annotations

import json
import os
import sys
from pathlib import Path

from _harness_config import load_policy, session_context_lines


def main() -> int:
    try:
        data = json.load(sys.stdin)
    except json.JSONDecodeError as exc:
        print(f"Invalid hook input: {exc}", file=sys.stderr)
        return 1

    if data.get("hook_event_name") != "SessionStart":
        return 0

    source = data.get("source", "")
    if source not in {"startup", "resume", "clear"}:
        return 0

    repo_root = Path(
        os.environ.get("FACTORY_PROJECT_DIR") or Path(__file__).resolve().parents[2]
    )
    policy = load_policy(repo_root)

    print("\n".join(session_context_lines(policy)))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
