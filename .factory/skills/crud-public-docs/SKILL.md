---
name: crud-public-docs
description: >-
  Maintain the public Factory docs repo. Use when editing docs pages, Mintlify
  docs.json navigation or redirects, changelog pages, docs tooling, shared
  harness primitives, workflows, prompts, JP parity, or PR preview readiness.
  NOT for product-code implementation or private internal source analysis.
metadata:
  version: '1.0.0'
user-invocable: true
disable-model-invocation: false
---

# Public docs maintenance

Use this skill for changes to the public Factory documentation site.

## Workflow

1. Read `AGENTS.md` and the relevant page or `docs/docs.json` section.
2. Classify the work as page edit, navigation, redirects, changelog,
   prompt/workflow automation, JP parity, or tooling.
3. Make the smallest durable change that fixes the docs problem without
   inventing product claims.
4. Keep public-safety constraints in mind for every committed file and PR body.
5. Run relevant Mintlify validation or PR-preview checks before handoff when
   docs content changes.

## Page rules

- Lead with what the reader can do, decide, look up, or understand.
- Use concrete product surface names.
- Avoid meta openers and unsupported claims.
- Add redirects when changing public URLs.
- Keep navigation changes deliberate and small.

## References

- [Style guide](references/style-guide.md)
- [IA map](references/ia-map.md)
- [Public-safety rules](references/public-safety.md)
- [Verification](references/verification.md)

## Checklists

- [Change checklist](checklists/change-checklist.md)

## Assets

- [Examples and anti-examples](assets/examples.md)

## Evals

- [Trigger tests](evals/trigger-tests.yaml)
