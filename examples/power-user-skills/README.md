# Power User Skills

Example skills for power users to customize their Droid experience.

## Available Skills

### prompt-refiner-claude
Refine prompts for Claude models (Opus, Sonnet, Haiku) using Anthropic's best practices.

**Location:** `prompt-refiner-claude/SKILL.md`

**Usage:** Invoke when preparing complex tasks for Claude models. The skill helps structure prompts using XML tags, proper ordering, and Claude-specific patterns.

### prompt-refiner-gpt
Refine prompts for GPT models (GPT-5, GPT-5.1, Codex) using OpenAI's best practices.

**Location:** `prompt-refiner-gpt/SKILL.md`

**Usage:** Invoke when preparing complex tasks for GPT models. The skill helps with role framing, numbered procedures, and output specifications.

### memory-capture
Capture and organize memories, decisions, and learnings.

**Location:** `memory-capture/SKILL.md`

**Usage:** Invoke when you want to save decisions, preferences, or learnings for future sessions.

## Installation

Copy any skill you want to use to your personal or project skills directory:

### Personal (applies to all projects)
```bash
mkdir -p ~/.factory/skills/prompt-refiner-claude
cp prompt-refiner-claude/SKILL.md ~/.factory/skills/prompt-refiner-claude/
```

### Project (applies to current project only)
```bash
mkdir -p .factory/skills/prompt-refiner-claude
cp prompt-refiner-claude/SKILL.md .factory/skills/prompt-refiner-claude/
```

## Customization

These skills are starting points. Customize them for your needs:

1. **Add team-specific patterns** to the prompt refiners
2. **Adjust memory categories** to match your workflow
3. **Add model-specific examples** from your actual work
4. **Include project conventions** in the refinement criteria

## Related Documentation

- [Skills Guide](/cli/configuration/skills) - How skills work
- [Power User Setup](/guides/power-user/setup-checklist) - Complete setup guide
- [Prompt Crafting](/guides/power-user/prompt-crafting) - Model-specific prompting
- [Memory Management](/guides/power-user/memory-management) - Building persistent memory
