# Public docs style guide

## Openings

Start with the reader's task or the product mechanism.

- Good: `Use Droid Exec to run Droid from CI, scripts, and other non-interactive automation.`
- Bad: `This guide walks you through Droid Exec.`

Avoid these openers unless the document surface itself is the subject:

- `This page explains...`
- `This guide covers...`
- `This section provides...`
- `It covers...`
- `Use this reference...`

## Product language

- Use exact shipped names: `Droid`, `Droid Exec`, `Desktop App`, `MCP servers`, `Droid Shield`, `Factory API key`.
- Say what a control changes. Prefer `restrict commands` over `manage policy`.
- Distinguish admin configuration from end-user behavior.
- Do not invent roadmap claims, metrics, customer proof, or certifications.

## Links

- Cross-link when it changes the reader's next step.
- Do not add repeated `See also` lines after every section.
- Never leave placeholder links such as `href="#"`.

## Images

- Alt text should describe the meaningful UI or diagram content.
- Do not use the filename as alt text.
- Screenshots should support a task or concept, not decorate the page.

## Changelog

- Put the release version where readers can scan it quickly.
- Keep entries factual and product-specific.
- Avoid turning implementation details into vague benefits.
