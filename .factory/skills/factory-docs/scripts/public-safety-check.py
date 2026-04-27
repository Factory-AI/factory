#!/usr/bin/env python3
from __future__ import annotations

import argparse
import re
import subprocess
import sys
from dataclasses import dataclass
from pathlib import Path

PATTERNS: list[tuple[str, re.Pattern[str]]] = [
    ("local home path", re.compile(r"(?:/Users/[A-Za-z0-9._-]+/|~/dev/[A-Za-z0-9._-]+)")),
    (
        "private hostname",
        re.compile(
            r"https?://[^\s\"'`]*(?:\.internal\b|\.internal\.|\.corp\.|\.local\b|\.local/)[^\s\"'`]*",
            re.IGNORECASE,
        ),
    ),
    (
        "private IP",
        re.compile(
            r"\b(?:10\.\d{1,3}\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3}|172\.(?:1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3})\b"
        ),
    ),
    (
        "possible secret assignment",
        re.compile(r"(?i)\b(api[_-]?key|secret|token|password)\b\s*[:=]\s*['\"]?[A-Za-z0-9_./+=-]{12,}"),
    ),
    ("placeholder link", re.compile(r"href=[\"']#|\]\(#\)")),
]


@dataclass
class Finding:
    path: str
    line: int
    label: str
    text: str


def repo_root() -> Path:
    return Path(__file__).resolve().parents[4]


def changed_lines(base: str) -> list[tuple[str, int, str]]:
    proc = subprocess.run(
        ["git", "diff", "--unified=0", "--no-color", f"{base}...HEAD"],
        cwd=repo_root(),
        text=True,
        capture_output=True,
        check=False,
    )
    if proc.returncode not in (0, 1):
        print(proc.stderr, file=sys.stderr)
        return []

    rows: list[tuple[str, int, str]] = []
    path = ""
    new_line = 0
    for raw in proc.stdout.splitlines():
        if raw.startswith("+++ b/"):
            path = raw[6:]
            continue
        if raw.startswith("@@"):
            match = re.search(r"\+(\d+)(?:,(\d+))?", raw)
            new_line = int(match.group(1)) if match else 0
            continue
        if raw.startswith("+") and not raw.startswith("+++"):
            rows.append((path, new_line, raw[1:]))
            new_line += 1
        elif not raw.startswith("-"):
            new_line += 1
    return rows


def scan(rows: list[tuple[str, int, str]]) -> list[Finding]:
    findings: list[Finding] = []
    for path, line, text in rows:
        for label, pattern in PATTERNS:
            if pattern.search(text):
                findings.append(Finding(path, line, label, text.strip()))
    return findings


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Scan changed public repo text for durable leak patterns"
    )
    parser.add_argument("--base", default="origin/main", help="Base ref for changed-line scan")
    parser.add_argument("--text-file", type=Path, help="Scan a specific text file instead of git diff")
    args = parser.parse_args()

    if args.text_file:
        rows = [
            (str(args.text_file), i, line)
            for i, line in enumerate(args.text_file.read_text().splitlines(), 1)
        ]
    else:
        rows = changed_lines(args.base)

    findings = scan(rows)
    if not findings:
        print("PASS: no public-safety patterns found")
        return 0

    for item in findings:
        print(f"{item.path}:{item.line}: {item.label}: {item.text}")
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
