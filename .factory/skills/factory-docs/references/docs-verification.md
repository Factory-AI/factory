# Verification

Choose checks based on the files changed.

- Docs pages or `docs/docs.json`: `scripts/docs-check.py --all`
- Redirects or cross-links: `scripts/docs-check.py --links`
- `.github/workflows/**`: `scripts/workflow-check.py`
- Public docs, prompts, PR text, or harness files:
  `scripts/public-safety-check.py`

Do not run local preview servers autonomously. Use validation output and PR
previews as the review surfaces.
