# Factory docs repo guidelines

This repository publishes the public Factory documentation site. Treat every
committed file and PR/issue write as public.

## Repository map

- `docs/` is the Mintlify documentation root.
- `docs/docs.json` is the canonical source for navigation, redirects, theme,
  topbar links, integrations, and OpenAPI tabs.
- `docs/**/*.mdx` are documentation pages.
- `docs/jp/**` mirrors Japanese-language pages where applicable.
- `.factory/skills/factory-docs/` contains the shared Droid skill for public
  docs work.

## Working rules

- Use the `factory-docs` skill for nontrivial docs, navigation, workflow, prompt,
  or harness changes in this repo.
- Do not run local previews such as `mintlify dev` or `npm run dev`
  autonomously. Use validation scripts or PR previews instead.
- Do not commit secrets, tokens, customer data, private URLs, internal hostnames,
  personal home paths, or private repository names.
- Do not cite private source paths in public docs or PR text. Rephrase claims so
  they stand on public product behavior.
- Use obviously fake placeholders: `example.com`, `YOUR_API_KEY`, `org_123`,
  `user@example.com`, and `repo-name`.
- Lead docs with the reader action, decision, object, or product mechanism.
- Prefer exact shipped product names from nearby public docs over generic labels.
- Do not invent customer proof, metrics, certifications, roadmap dates, or
  shipped behavior.
- Add pages to `docs/docs.json` when they are intended to be reachable from the
  site navigation, and add redirects when moving public URLs.
