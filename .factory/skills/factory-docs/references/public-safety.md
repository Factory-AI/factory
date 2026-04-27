# Public safety

Public docs need stricter evidence and examples because repo contents, PR text,
and CI logs can be read outside Factory.

## Block or rewrite

- Secrets, tokens, cookies, private keys, and `.env` values.
- Customer data, account details, internal incident details, and private
  screenshots.
- Personal home paths, internal hostnames, private IPs, and private source paths.
- Claims whose only support is private implementation knowledge.

## Safer replacements

- Replace real values with `example.com`, `user@example.com`, `YOUR_API_KEY`,
  `org_123`, and `repo-name`.
- Convert private implementation evidence into public product behavior.
- Remove claims that cannot be supported publicly.
