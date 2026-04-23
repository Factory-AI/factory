Update the existing Japanese documentation under `docs/jp/` so it matches the current English source files under `docs/`.

Rules:

- Only edit files under `docs/jp/`.
- For each Japanese file, use the English source at the same relative path without the `jp/` segment (for example, `docs/jp/guides/foo.mdx` maps to `docs/guides/foo.mdx`).
- If a Japanese file has no English counterpart, leave it unchanged.
- Preserve frontmatter keys, MDX and Markdown structure, imports, JSX and MDX component tags, code fences, inline code, URLs, image paths, and file paths.
- Translate prose, headings, list items, table cell text, link text, image alt text, and human-readable attribute values such as `title=""` and `description=""`.
- Keep these brands and common technical terms in English unless the surrounding Japanese convention clearly differs: Factory, Droid, GitHub, GitLab, Linear, Slack, Discord, Sentry, PagerDuty, Jira, Notion, API, CLI, SDK, MCP, SSO, SCIM, BYOK, IDE, JSON, YAML, MDX, PR, CI/CD, OAuth, OTEL, LLM.
- For docs-internal links that point to English docs paths, rewrite them to the `/jp/` path when the Japanese equivalent exists.
- Update files incrementally; do not rewrite unrelated sections and do not touch files outside `docs/jp/`.
- Do not commit, push, open PRs, or edit workflow/configuration files.
