import remarkFrontmatter from 'remark-frontmatter';
import remarkGfm from 'remark-gfm';
import remarkLintHeadingIncrement from 'remark-lint-heading-increment';
import remarkLintNoUndefinedReferences from 'remark-lint-no-undefined-references';
import remarkMdx from 'remark-mdx';
import remarkPresetLintConsistent from 'remark-preset-lint-consistent';
import remarkPresetLintRecommended from 'remark-preset-lint-recommended';

const disablePresetRules = (preset) =>
  preset.plugins.map((plugin) => [
    Array.isArray(plugin) ? plugin[0] : plugin,
    false,
  ]);

export default {
  plugins: [
    remarkMdx,
    remarkFrontmatter,
    remarkGfm,
    remarkPresetLintRecommended,
    remarkPresetLintConsistent,
    ...disablePresetRules(remarkPresetLintRecommended),
    ...disablePresetRules(remarkPresetLintConsistent),
    remarkLintHeadingIncrement,
    [
      remarkLintNoUndefinedReferences,
      { allowShortcutLink: true },
    ],
  ],
};
