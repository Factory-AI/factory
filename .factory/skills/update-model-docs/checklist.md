# Model Docs Update Checklist

Use this checklist after making edits. For each file, verify the specific items listed.

## Pre-flight

- [ ] Pulled latest `main` on both `factory` and `factory-mono` repos
- [ ] Read `factory-mono/packages/utils/src/llm/model-registry.ts` for current model data
- [ ] Read `factory-mono/packages/common/src/llm/enums.ts` for ModelID string values
- [ ] Built diff of registry vs current docs and confirmed scope with user

## Tier 1 Files

### `docs/pricing.mdx`
- [ ] All CLI-available models present in pricing table
- [ ] No removed/unavailable models still listed
- [ ] Multipliers match `cost.tokenMultiplier` from registry
- [ ] Promo labels match `cost.promoLabel` from registry
- [ ] Sort order: multiplier ascending, model name alphabetical as tiebreaker
- [ ] Model IDs in backtick code format

### `docs/reference/cli-reference.mdx`
- [ ] Available models table has all CLI models
- [ ] Reasoning support column matches `reasoningEffort.supported` exactly (Off vs None matters)
- [ ] Default reasoning column matches `reasoningEffort.default`
- [ ] Sort order: capability descending (most powerful first)
- [ ] `-m` flag example uses a current model ID

### `docs/cli/user-guides/choosing-your-model.mdx`
- [ ] Stack rank table has correct models with sequential numbering (1, 2, 3... no gaps or duplicates)
- [ ] "Last updated" date in intro paragraph is current
- [ ] Section heading date matches (e.g. "Current stack rank (February 2026)")
- [ ] Task recommendation table mentions new top-tier models where appropriate
- [ ] Reasoning effort settings list matches registry for every model
- [ ] Open-source models section is up to date
- [ ] Tip callout mentions current top model
- [ ] No overly strong quality claims (avoid "same quality", "identical")

## Tier 2 Files

### `docs/cli/droid-exec/overview.mdx`
- [ ] Supported models list includes all CLI-available models
- [ ] Sort order: capability descending

### `docs/cli/configuration/settings.mdx`
- [ ] Settings table `model` row has all model aliases in Options column
- [ ] Model list (under `### Model`) has bullet for each model with description
- [ ] `droid-core` description references correct model name/version

### `docs/cli/configuration/mixed-models.mdx`
- [ ] Provider sections reference current top models
- [ ] No stale model names in examples

## Tier 3 Files

### `docs/guides/power-user/token-efficiency.mdx`
- [ ] Cost multipliers table has correct multipliers
- [ ] Sort order: multiplier ascending, then name
- [ ] Task-based model selection code block uses current model names
- [ ] No stale model entries (check ALL rows, not just ones you're editing)

### `docs/guides/power-user/prompt-crafting.mdx`
- [ ] Model recommendation table uses current model names
- [ ] Reasoning level suggestions match available levels

### `docs/cli/configuration/byok.mdx`
- [ ] BYOK example configs use current model IDs (if model IDs changed)

### `docs/cli/byok/deepinfra.mdx`
- [ ] DeepInfra example uses current model ID and display name

### `docs/guides/building/droid-vps-setup.mdx`
- [ ] `--model` flag values in shell examples are current

### `docs/guides/building/droid-exec-tutorial.mdx`
- [ ] TypeScript code uses current default model ID
- [ ] `.env` example comments reference current model
- [ ] Code comments reference current model names
- [ ] Model list in documentation section is current

## Post-edit Verification

- [ ] Grep for all old/removed model IDs across `docs/` (excluding `docs/changelog/`)
- [ ] Grep for all old/removed model names across `docs/` (excluding `docs/changelog/`)
- [ ] No changelog files were modified
- [ ] `npx mintlify validate` passes (run inside `docs/`, requires node <=24)
- [ ] Dev server starts and pages render without 500 errors
- [ ] PR created with descriptive summary of changes
