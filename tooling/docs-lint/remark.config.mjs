import remarkFrontmatter from 'remark-frontmatter';
import remarkGfm from 'remark-gfm';
import remarkLintHeadingIncrement from 'remark-lint-heading-increment';
import remarkLintNoUndefinedReferences from 'remark-lint-no-undefined-references';
import remarkMdx from 'remark-mdx';
import remarkPresetLintConsistent from 'remark-preset-lint-consistent';
import remarkPresetLintRecommended from 'remark-preset-lint-recommended';

const getPresetRule = (preset, ruleName) => {
  const plugin = preset.plugins.find((presetPlugin) => {
    const normalizedPlugin = Array.isArray(presetPlugin)
      ? presetPlugin[0]
      : presetPlugin;

    return normalizedPlugin.name === ruleName;
  });

  if (!plugin) {
    throw new Error(`Unable to find remark preset rule: ${ruleName}`);
  }

  return Array.isArray(plugin) ? plugin[0] : plugin;
};

export default {
  plugins: [
    remarkMdx,
    remarkFrontmatter,
    remarkGfm,
    remarkPresetLintRecommended,
    remarkPresetLintConsistent,
    // no-literal-urls: Factory docs intentionally keep support emails and setup URLs visible/copyable in prose.
    [
      getPresetRule(remarkPresetLintRecommended, 'remark-lint:no-literal-urls'),
      false,
    ],
    // table-cell-padding: Existing MDX tables mix compact and aligned styles; enforcing one style creates noisy churn.
    [
      getPresetRule(remarkPresetLintConsistent, 'remark-lint:table-cell-padding'),
      false,
    ],
    remarkLintHeadingIncrement,
    [remarkLintNoUndefinedReferences, { allowShortcutLink: true }],
  ],
};
