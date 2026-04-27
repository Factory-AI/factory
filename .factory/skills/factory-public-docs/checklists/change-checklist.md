# Change checklist

Use this checklist before handoff for public docs repo work.

## Before editing

- [ ] Classify the change as docs content, navigation, redirects, changelog, workflow, prompt, harness, or config.
- [ ] Read `AGENTS.md` and the relevant page, `docs/docs.json` section, workflow, prompt, or harness file.
- [ ] Confirm every source, example, and screenshot is public-safe.
- [ ] If URLs or IA change, identify the required redirects and reachability updates.
- [ ] If examples include credentials, hostnames, or repo names, replace them with obvious placeholders.

## Before handoff

- [ ] Inspect `git diff` for public-safety leaks on shared repo surfaces or whenever the scope is mixed.
- [ ] Run Mintlify validation and broken-link checks for docs page changes when local validation is needed.
- [ ] For `docs/docs.json`, workflows, prompts, harness files, or config changes, review links, redirects, and public-safety implications explicitly.
- [ ] Inspect `git diff` for secrets, private repo names, internal hostnames, local paths, and unsupported claims.
