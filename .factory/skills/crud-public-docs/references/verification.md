# Verification

Run commands from the repository root unless noted otherwise. Do not run
`mintlify dev` autonomously in Droid sessions.

## Docs content checks

Use Mintlify validation when local validation is needed:

```bash
cd docs
npx -y mintlify@4.2.529 validate
npx -y mintlify@4.2.529 broken-links --check-redirects
```

Mintlify PR previews remain the preferred human review surface for rendered docs
changes.

## Shared repo surfaces

For `.factory/**`, workflows, prompts, or repo config changes:

1. Inspect `git diff` for secrets, private repo names, internal hostnames, local
   paths, and unsupported claims.
2. Confirm examples use public placeholders such as `example.com`,
   `YOUR_API_KEY`, `org_123`, `user@example.com`, and `repo-name`.
3. Run hook syntax checks when hook files change:

```bash
python3 -m py_compile .factory/hooks/*.py
```

## Extra checks

- Navigation or redirects changed: run Mintlify broken-link checks and inspect
  `docs/docs.json` redirects.
- Changelog changed: confirm release-note redirects still point to public
  changelog pages.
- JP docs changed: compare the English and Japanese pages for matching scope.
