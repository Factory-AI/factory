#!/usr/bin/env python3
from __future__ import annotations

import argparse
import subprocess
import sys
from pathlib import Path

MINTLIFY_VERSION = "4.2.529"


def repo_root() -> Path:
    return Path(__file__).resolve().parents[4]


def run(command: list[str], cwd: Path) -> int:
    print("$ " + " ".join(command))
    return subprocess.run(command, cwd=cwd, check=False).returncode


def main() -> int:
    parser = argparse.ArgumentParser(description="Run public docs validation checks")
    group = parser.add_mutually_exclusive_group()
    group.add_argument("--validate", action="store_true", help="Run Mintlify validation")
    group.add_argument("--links", action="store_true", help="Run broken-link and redirect checks")
    group.add_argument("--all", action="store_true", help="Run all docs checks")
    args = parser.parse_args()

    docs_root = repo_root() / "docs"
    if not docs_root.exists():
        print("docs/ directory not found", file=sys.stderr)
        return 1

    run_validate = args.validate or args.all or not (args.validate or args.links)
    run_links = args.links or args.all

    status = 0
    if run_validate:
        status |= run(["npx", "-y", f"mintlify@{MINTLIFY_VERSION}", "validate"], docs_root)
    if run_links:
        status |= run(
            ["npx", "-y", f"mintlify@{MINTLIFY_VERSION}", "broken-links", "--check-redirects"],
            docs_root,
        )
    return 1 if status else 0


if __name__ == "__main__":
    raise SystemExit(main())
