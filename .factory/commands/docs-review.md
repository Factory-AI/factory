---
description: Review public docs, workflow, prompt, and harness changes for IA, style, links, and public safety
argument-hint: '[base ref or focus]'
---

Review the current public docs repository changes.

Focus, if provided: `$ARGUMENTS`

Checklist:

1. Read `AGENTS.md` and `.factory/skills/factory-public-docs/checklists/change-checklist.md`.
2. Inspect the changed files with `git diff`.
3. Check public safety: no secrets, private repository names, personal home paths, customer data, or private source references.
4. Check docs quality: task-first openings, concrete product names, supported claims, useful links, descriptive image alt text.
5. Check IA: pages are reachable when intended, redirects resolve, and hidden pages are intentionally hidden.
6. Run targeted validators when useful, especially Mintlify validation and broken-link checks from `docs/`.
7. Return blocking findings first, then non-blocking suggestions.

Do not run `mintlify dev` autonomously.
