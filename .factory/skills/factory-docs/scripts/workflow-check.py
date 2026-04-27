#!/usr/bin/env python3
from __future__ import annotations

import argparse
import subprocess
import sys
from pathlib import Path

ACTIONLINT = "github.com/rhysd/actionlint/cmd/actionlint@v1.7.12"


def repo_root() -> Path:
    return Path(__file__).resolve().parents[4]


def changed_workflows(base: str, head: str) -> list[str]:
    proc = subprocess.run(
        [
            "git",
            "diff",
            "--name-only",
            "--diff-filter=ACMR",
            base,
            head,
            "--",
            ".github/workflows/*.yml",
            ".github/workflows/*.yaml",
        ],
        cwd=repo_root(),
        text=True,
        capture_output=True,
        check=False,
    )
    if proc.returncode:
        print(proc.stderr, file=sys.stderr)
        return []
    return [line for line in proc.stdout.splitlines() if line]


def main() -> int:
    parser = argparse.ArgumentParser(description="Run actionlint on changed workflow files")
    parser.add_argument("--base", default="origin/main", help="Base ref or SHA")
    parser.add_argument("--head", default="HEAD", help="Head ref or SHA")
    args = parser.parse_args()

    files = changed_workflows(args.base, args.head)
    if not files:
        print("No workflow files changed.")
        return 0

    command = ["go", "run", ACTIONLINT, *files]
    print("$ " + " ".join(command))
    return subprocess.run(command, cwd=repo_root(), check=False).returncode


if __name__ == "__main__":
    raise SystemExit(main())
