---
description: Run public docs validation, fix targeted failures, and summarize status
argument-hint: '[optional focus]'
---

# Docs check

Run the public docs validation workflow for this repository.

Focus, if provided: `$ARGUMENTS`

Steps:

1. Read `AGENTS.md` and
   `.factory/skills/crud-public-docs/checklists/change-checklist.md`.
2. For docs content changes, run Mintlify validation from the docs root:
   - `cd docs && npx -y mintlify@4.2.529 validate`
   - `cd docs && npx -y mintlify@4.2.529 broken-links --check-redirects`
3. For `.factory/**`, workflow, prompt, or repo config changes, inspect the diff
   for public-safety leaks.
4. If a check fails, inspect the failure, fix only the necessary files, and
   rerun the failed check.
5. Summarize the commands run, final status, and any remaining warnings.

Do not run `mintlify dev` autonomously.
