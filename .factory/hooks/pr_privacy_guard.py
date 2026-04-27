#!/usr/bin/env python3
"""Block public PR/issue writes that leak private context."""

from __future__ import annotations

import json
import os
import re
import shlex
import sys
from pathlib import Path

from _harness_config import load_policy

TRIGGER_RE = re.compile(
    r"\bgh\s+(?:pr\s+(?:create|edit|comment|review)|issue\s+(?:create|edit|comment))\b",
    re.IGNORECASE,
)
FULL_REPO_RE = re.compile(r"\bFactory-AI/(factory-[A-Za-z0-9._-]+)\b", re.IGNORECASE)
BARE_REPO_RE = re.compile(
    r"`(factory-[a-z0-9._-]+)`(?=[^`\n]{0,80}\b(?:repo|repository|リポ)\b)",
    re.IGNORECASE,
)
LOCAL_PATH_RE = re.compile(r"/Users/(?!\.\.\./)[A-Za-z0-9._-]+/|~/dev/[A-Za-z0-9._-]+")
PRIVATE_HOST_RE = re.compile(
    r"https?://[^\s\"'`]*(?:\.internal\b|\.internal\.|\.corp\.|\.local\b|\.local/)[^\s\"'`]*",
    re.IGNORECASE,
)
PRIVATE_IP_RE = re.compile(
    r"\b(?:10\.\d{1,3}\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3}|172\.(?:1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3})\b"
)


def respond(message: str) -> int:
    print(
        json.dumps(
            {
                "systemMessage": message,
                "hookSpecificOutput": {
                    "hookEventName": "PreToolUse",
                    "permissionDecision": "deny",
                    "permissionDecisionReason": message,
                },
            }
        )
    )
    return 2


def try_shlex(command: str) -> list[str] | None:
    try:
        return shlex.split(command, posix=True)
    except ValueError:
        return None


def extract_flag(tokens: list[str], names: tuple[str, ...]) -> str | None:
    for i, token in enumerate(tokens):
        if token == "--":
            break
        for name in names:
            if token == name and i + 1 < len(tokens):
                return tokens[i + 1]
            prefix = f"{name}="
            if token.startswith(prefix):
                return token[len(prefix) :]
    return None


def read_body(tokens: list[str]) -> str:
    body_file = extract_flag(tokens, ("-F", "--body-file"))
    if body_file:
        try:
            return Path(body_file).expanduser().read_text()
        except OSError:
            return ""
    return extract_flag(tokens, ("-b", "--body")) or ""


def read_title(tokens: list[str]) -> str:
    return extract_flag(tokens, ("-t", "--title")) or ""


def find_leaks(text: str, allowed_factory_repo_slugs: set[str]) -> list[str]:
    leaks: list[str] = []
    if not text:
        return leaks

    for regex, label in (
        (LOCAL_PATH_RE, "personal/local path"),
        (PRIVATE_HOST_RE, "private/internal hostname"),
        (PRIVATE_IP_RE, "private IP address"),
    ):
        for match in regex.finditer(text):
            leaks.append(f"{label}: {match.group(0)}")

    for match in FULL_REPO_RE.finditer(text):
        slug = match.group(1).lower()
        if slug in allowed_factory_repo_slugs:
            continue
        leaks.append(f"private/internal repo reference: {match.group(0)}")

    for match in BARE_REPO_RE.finditer(text):
        slug = match.group(1).lower()
        if slug in allowed_factory_repo_slugs:
            continue
        leaks.append(f"private/internal repo reference: {match.group(1)}")

    return leaks


def main() -> int:
    try:
        data = json.load(sys.stdin)
    except json.JSONDecodeError:
        return 0

    if data.get("tool_name") != "Execute":
        return 0

    command = str(data.get("tool_input", {}).get("command", ""))
    if not command or not TRIGGER_RE.search(command):
        return 0

    tokens = try_shlex(command)
    if tokens is None:
        return 0

    text_to_scan = f"{read_title(tokens)}\n{read_body(tokens)}"
    if not text_to_scan.strip():
        return 0

    repo_root = Path(
        os.environ.get("FACTORY_PROJECT_DIR") or Path(__file__).resolve().parents[2]
    )
    policy = load_policy(repo_root)
    allowed_factory_repo_slugs = {
        slug.lower()
        for slug in policy.get("publicSafety", {}).get("allowedFactoryRepoSlugs", [])
    }

    leaks = find_leaks(text_to_scan, allowed_factory_repo_slugs)
    if not leaks:
        return 0

    message = (
        "BLOCKED by pr-privacy-guard: public PR/issue text contains public-safety leaks.\n\n"
        + "\n".join(f"- {leak}" for leak in leaks[:10])
        + "\n\nRemove or paraphrase the private references, then retry."
    )
    return respond(message)


if __name__ == "__main__":
    raise SystemExit(main())
