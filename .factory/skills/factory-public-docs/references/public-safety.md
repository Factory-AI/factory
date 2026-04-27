# Public-safety rules

This is a public repository. Assume every file, branch name, PR body, and CI log may be read outside Factory.

## Do not commit

- API keys, access tokens, session cookies, credentials, private keys, or `.env` values.
- Customer data, private account details, internal incident details, or private screenshots.
- Personal home paths, private repository names, internal hostnames, or private source paths.
- PR text that says a claim was verified from a private codebase.

## Safe replacements

- Use `example.com`, `user@example.com`, `YOUR_API_KEY`, `org_123`, and `repo-name`.
- Rephrase private implementation evidence as public product behavior.
- If a claim cannot be supported publicly, remove it or make it conditional.

## Review checklist

Before handoff or PR creation:

1. Run `git diff` and inspect added lines.
2. Search for `API_KEY`, `SECRET`, `TOKEN`, personal names, local paths, and private repo names.
3. Confirm examples use fake values.
4. Confirm screenshots and links are public-safe.
5. Keep PR and issue titles/bodies free of private repo names, local paths, and internal URLs.
