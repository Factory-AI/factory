# Factory docs repo guidelines

This repository publishes the public Factory documentation site. Treat every committed file as public.

## Repository map

- `docs/` is the Mintlify documentation root.
- `docs/docs.json` controls navigation, redirects, theme, topbar links, integrations, and OpenAPI tabs.
- `docs/**/*.mdx` are documentation pages.
- `docs/jp/**` mirrors Japanese-language pages.
- `.factory/` contains project-local Droid primitives for this public docs repo, including hook entrypoints under `.factory/hooks/`.

## Validation

Use Mintlify validation and PR previews for docs verification. Do not run `mintlify dev`, `npm run dev`, or other local preview commands autonomously in Droid sessions.

For docs content changes, prefer:

```bash
cd docs
npx -y mintlify@4.2.529 validate
npx -y mintlify@4.2.529 broken-links --check-redirects
```

For shared repo surfaces such as `.factory/**`, workflows, prompts, or repo config, inspect the diff manually for public-safety leaks before handoff or PR creation.

## Public-safety rules

- Do not commit secrets, tokens, customer data, private URLs, internal hostnames, personal home paths, or private repository names.
- Do not reference private source-of-truth paths in public docs or PR text. Rephrase claims so they stand on public product behavior.
- Use placeholder values that are obviously fake: `example.com`, `YOUR_API_KEY`, `org_123`, `user@example.com`, and `repo-name`.
- Before opening or updating a PR, inspect the diff for public-safety leaks.

## Writing conventions

- Lead with the reader action, decision, object, or mechanism.
- Prefer concrete product surface names: `Droid Exec`, `Desktop App`, `MCP servers`, `model access`, `command restrictions`.
- Avoid meta openers such as `This guide walks you through...`, `This page explains...`, and `This section provides...`.
- Back product claims with public evidence. Do not invent customer proof, metrics, certifications, roadmap dates, or shipped behavior.
- Cross-link only when the link changes the reader's next action.
- Avoid placeholder links like `href="#"` or empty card links.
- Images need descriptive alt text that explains the screenshot or diagram, not the filename.

## Navigation and IA

- Add pages to `docs/docs.json` when they are intended to be reachable from the site navigation.
- Add redirects when moving or renaming public URLs.
- Keep hidden support snippets under `docs/snippets/`.
- Avoid new top-level IA unless the change is deliberate and reviewed.
