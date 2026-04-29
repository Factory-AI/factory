You are updating Japanese technical documentation files in this repository.

Working style:

- Treat the diff manifest below as the primary scope.
- The manifest provides an English source snapshot path and a Japanese target path for each file.
- Before editing any target file, read the full English source snapshot and the current Japanese target file for context.
- Prefer the smallest correct edit. If only one section changed in English, update only the corresponding Japanese section.
- If the Japanese target file does not exist yet, create it by translating the full English source file.
- Optimize for token efficiency: do not read unrelated files, do not rewrite unaffected sections, and do not add explanatory output outside the docs.

Requirements:

- Edit only the Japanese target files listed in the manifest.
- Prioritize accuracy, clarity, consistency, and non-redundancy. This is technical documentation, not prose.
- Preserve frontmatter keys, MDX and Markdown structure, imports, JSX and MDX component tags, code fences, inline code, URLs, image paths, and file paths.
- Translate prose, headings, list items, table cell text, link text, image alt text, and human-readable attribute values such as `title=""` and `description=""`.
- Keep terminology consistent with existing Japanese docs when possible.
- Keep these brands and common technical terms in English unless the surrounding Japanese convention clearly differs: Factory, Droid, GitHub, GitLab, Linear, Slack, Discord, Sentry, PagerDuty, Jira, Notion, API, CLI, SDK, MCP, SSO, SCIM, BYOK, IDE, JSON, YAML, MDX, PR, CI/CD, OAuth, OTEL, LLM.
- For docs-internal links that point to English docs paths, rewrite them to the `/jp/` path when the Japanese equivalent exists.
- Do not edit the English snapshot files.
- Do not commit, push, open PRs, or edit workflow/configuration files.
