---
name: factory-docs
description: >-
  Maintain the public Factory docs repo. Use when editing docs pages, docs.json
  navigation or redirects, changelog pages, docs CI, shared prompts, JP parity,
  or repo-local harness files. NOT for product-code implementation or private
  source analysis.
metadata:
  version: '1.0.0'
---

# Factory docs

Use this skill for public documentation work in this repository.

## Workflow

1. Read `AGENTS.md` and the touched files.
2. Classify the change: docs page, navigation/redirects, changelog, JP parity,
   CI/workflow, prompt, or harness.
3. Run only the scripts that match the change.
4. Load references only when the change needs that detail.
5. Use the handoff template when summarizing docs or harness work.

## Scripts

- `scripts/docs-check.py` — Mintlify validation and broken-link checks.
- `scripts/public-safety-check.py` — changed-line public-safety scan.
- `scripts/workflow-check.py` — actionlint for changed workflow files.

## References

- [Public safety](references/public-safety.md)
- [Docs style](references/docs-style.md)
- [Verification](references/docs-verification.md)

## Assets

- [Handoff template](assets/handoff-template.md)
