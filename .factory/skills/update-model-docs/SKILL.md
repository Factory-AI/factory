---
name: update-model-docs
description: |
  Update Factory documentation to match the latest model registry in factory-mono.
  Use when new models are added, existing models are removed, reasoning levels change,
  or pricing multipliers are updated. Triggered by model launches, model deprecations,
  or registry changes.
---

# Update Model Docs

Sync Factory documentation with the model registry source of truth in factory-mono.

## Prerequisites

- The `factory` docs repo is checked out locally
- The `factory-mono` repo is checked out locally at `../factory-mono` (relative to docs repo)
- Both repos are on their latest `main` branch (pull before starting)

## Source of Truth

All model data comes from one file:

```
factory-mono/packages/utils/src/llm/model-registry.ts
```

Read these sections to extract what you need:

| Registry field | What it tells you |
|---|---|
| `ModelID` enum (in `packages/common/src/llm/enums.ts`) | The model ID strings (e.g. `claude-opus-4-6`) |
| `name` / `shortName` | Display names for tables |
| `reasoningEffort.supported` | Available reasoning levels (Off, None, Low, Medium, High, ExtraHigh, Max) |
| `reasoningEffort.default` | Default reasoning level |
| `cost.tokenMultiplier` | Pricing multiplier (e.g. 2.0 = 2x) |
| `cost.promoLabel` | Promo pricing label if any |
| `availableInCLI` | If explicitly `false`, model is NOT available in CLI docs |
| `featureFlag` | Model may be gated behind a feature flag -- ask user before including |
| `CLI_MODEL_ORDER` | Display order in the CLI model selector |

## Workflow

### Step 1: Read the registry and build a diff

1. Pull latest `main` on both repos
2. Read `factory-mono/packages/utils/src/llm/model-registry.ts` and `packages/common/src/llm/enums.ts`
3. Build a table of all CLI-available models with: model ID, display name, reasoning levels, default reasoning, multiplier, promo label
4. Read the current `docs/pricing.mdx` pricing table
5. Compare registry vs docs and produce a diff:
   - **New models**: in registry but not in docs
   - **Removed models**: in docs but not in registry (or `availableInCLI: false`)
   - **Changed models**: reasoning levels, multiplier, or name changed

### Step 2: Confirm scope with user

Present the diff and ask:
- Which new models to add (some may be feature-flagged or not ready for docs)
- Which removed models to actually remove
- Any models to explicitly exclude

Do NOT proceed until the user confirms the list.

### Step 3: Edit files by tier

#### Tier 1 -- Always update (model tables)

**`docs/pricing.mdx`** -- Pricing Table
- Add/remove/update model rows
- Sort order: **multiplier ascending, then model name alphabetical** within same multiplier
- Columns: Model name | Model ID (in backtick code) | Multiplier (with x symbol)
- Include promo labels like "(Promo)" if `cost.promoLabel` exists

**`docs/reference/cli-reference.mdx`** -- Available Models table (under `## Available models`)
- Add/remove/update model rows
- Sort order: **capability descending** (most powerful first, Droid Core last)
- Columns: Model ID | Name | Reasoning support (list levels) | Default reasoning
- Also update the `-m` flag example in the `droid exec` flags table if the default/recommended model changed

**`docs/cli/user-guides/choosing-your-model.mdx`** -- Multiple sections:
- **Stack rank table** (section 1): Update ranks, add/remove models. This is an opinionated ranking -- ask user for rank placement of new models
- **Match the model to the job** (section 2): Update task recommendations if new models are better for certain tasks
- **Reasoning effort settings** (section 4): Update reasoning levels list to match registry exactly
- **Open-source models** (section 5): Update if open-source models changed
- Update the "last updated" date in the intro paragraph

#### Tier 2 -- Usually update (model lists)

**`docs/cli/droid-exec/overview.mdx`** -- Supported models bullet list
- Add/remove model IDs from the list under "Supported models (examples)"
- Sort order: **capability descending** (same as cli-reference)

**`docs/cli/configuration/settings.mdx`** -- Two locations:
- Settings table: update the `model` row's Options column with all model aliases
- Model list section (under `### Model`): add/remove bullet items with descriptions

**`docs/cli/configuration/mixed-models.mdx`** -- Provider compatibility sections
- Update if new models from a provider are added (e.g. new Anthropic model -> update Anthropic Models section)

#### Tier 3 -- Update if model names/IDs changed

**`docs/guides/power-user/token-efficiency.mdx`** -- Two locations:
- Cost Multipliers table: sorted by **multiplier ascending, then name**
- Task-Based Model Selection code block: update model recommendations
- This is a simplified table -- not every model needs a row, but groups (like "GPT-5.1 / GPT-5.1-Codex") are fine

**`docs/guides/power-user/prompt-crafting.mdx`** -- Model recommendation table
- Update if the recommended model for a task type changed

**`docs/cli/configuration/byok.mdx`** -- BYOK example configs
- Only update if a model ID string itself changed (e.g. `zai-org/GLM-4.6` -> `zai-org/GLM-4.7`)

**`docs/cli/byok/deepinfra.mdx`** -- DeepInfra config example
- Same as above, only if model ID changed

**`docs/guides/building/droid-vps-setup.mdx`** -- droid exec shell examples
- Update `--model` flag values if model IDs changed

**`docs/guides/building/droid-exec-tutorial.mdx`** -- Code snippets
- Update model ID defaults in TypeScript code, `.env` examples, and comments

### Step 4: Sweep for stale references

After all edits, grep the entire `docs/` folder for old model IDs/names that should have been replaced:

```bash
# For each removed/renamed model, search for stale references
rg "old-model-id" docs/ --glob '!changelog/**'
rg "Old Model Name" docs/ --glob '!changelog/**'
```

Changelog files (`docs/changelog/`) are historical records -- never edit them.

### Step 5: Validate

1. Run `npx mintlify validate` inside the `docs/` directory (requires node <=24, not node 25+)
2. Start dev server: `npx mintlify dev --no-open` inside `docs/`
3. Verify each changed page loads without errors
4. Spot-check tables render correctly using browser automation or manual review

### Step 6: Commit, push, and create PR

1. Create a feature branch (e.g. `update-models-<date>` or `add-<model-name>`)
2. Stage only docs files (`git add docs/`)
3. Commit with message format: `docs: update model references for <summary>`
4. Push and create PR with a summary listing: new models added, models removed, other changes
5. Review PR comments from auto-reviewer and address feedback

## Rules

- **Never edit changelog files.** Files under `docs/changelog/` are historical.
- **Never make quality claims you can't back up.** Avoid "same quality" or "identical performance" -- use softer language like "tuned for" or "optimized for".
- **Reasoning labels must match the registry exactly.** `Off` and `None` are different values in the codebase. Do not normalize them.
- **Sort orders are per-file conventions.** Pricing = multiplier asc. CLI reference = capability desc. Do not mix them up.
- **Ask before including feature-flagged models.** If `featureFlag` is set, the model may not be generally available yet.
- **Keep Tier 3 files in scope.** The most common mistake is updating the main tables but forgetting the guides, tutorials, and BYOK examples.

## Common Mistakes From Past Sessions

1. **Missing files in sweep**: settings.mdx model list, token-efficiency cost table, and prompt-crafting recommendation table are easy to forget
2. **Wrong sort order**: Pricing table rows must be sorted by multiplier, not by when they were added
3. **Stale pre-existing entries**: Always audit surrounding rows in tables you edit -- there may be old mistakes from previous updates
4. **Broken rank numbering**: When inserting rows into the choosing-your-model stack rank table, re-check all rank numbers are sequential
5. **Mintlify dev server node version**: Requires node <=24 LTS. Node 25+ will error. Use `brew install node@22` if needed
