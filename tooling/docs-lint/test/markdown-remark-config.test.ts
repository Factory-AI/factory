import { readFile } from 'node:fs/promises';

import { describe, expect, it } from 'vitest';

import markdownlintConfig from '../markdownlint.config.mjs';
import remarkConfig from '../remark.config.mjs';
import remarkFrontmatter from 'remark-frontmatter';
import remarkGfm from 'remark-gfm';
import remarkLintHeadingIncrement from 'remark-lint-heading-increment';
import remarkLintNoUndefinedReferences from 'remark-lint-no-undefined-references';
import remarkMdx from 'remark-mdx';
import remarkPresetLintConsistent from 'remark-preset-lint-consistent';
import remarkPresetLintRecommended from 'remark-preset-lint-recommended';

const rootPackageJsonUrl = new URL('../../../package.json', import.meta.url);
const markdownlintIgnoreUrl = new URL(
  '../../../.markdownlintignore',
  import.meta.url
);

describe('Markdown and MDX lint config', () => {
  it('configures markdownlint-cli2 for repo Markdown while ignoring JP docs', () => {
    expect(markdownlintConfig.globs).toEqual(['*.md', 'docs/**/*.md']);
    expect(markdownlintConfig.ignores).toContain('docs/jp/**');
    expect(markdownlintConfig.config).toMatchObject({
      default: true,
      MD001: false,
      MD013: false,
      MD033: false,
      MD040: false,
    });
    expect(markdownlintConfig.config).not.toMatchObject({
      MD009: false,
      MD012: false,
      MD025: false,
      MD041: false,
    });
  });

  it('declares all required remark plugins and lint rules', () => {
    expect(remarkConfig.plugins).toEqual(
      expect.arrayContaining([
        remarkMdx,
        remarkFrontmatter,
        remarkGfm,
        remarkPresetLintRecommended,
        remarkPresetLintConsistent,
      ])
    );
    expect(remarkConfig.plugins).toContain(remarkLintHeadingIncrement);
    expect(
      remarkConfig.plugins.some(
        (plugin) =>
          Array.isArray(plugin) && plugin[0] === remarkLintNoUndefinedReferences
      )
    ).toBe(true);
  });

  it('wires root markdown and remark scripts with required ignores', async () => {
    const rootPackageJson = JSON.parse(
      await readFile(rootPackageJsonUrl, 'utf8')
    ) as { scripts: Record<string, string> };

    expect(rootPackageJson.scripts.lint).toContain('lint:markdownlint');
    expect(rootPackageJson.scripts.lint).toContain('lint:remark');
    expect(rootPackageJson.scripts['lint:markdownlint']).toContain(
      'markdownlint-cli2 --config tooling/docs-lint/markdownlint.config.mjs'
    );
    expect(rootPackageJson.scripts['lint:remark']).toContain(
      'remark --rc-path tooling/docs-lint/remark.config.mjs'
    );
    expect(rootPackageJson.scripts['lint:remark']).toContain(
      '--report ./tooling/docs-lint/remark-reporter.mjs'
    );
    expect(rootPackageJson.scripts['lint:remark']).toContain(
      '--ignore-pattern "docs/jp/**"'
    );
    expect(rootPackageJson.scripts['lint:remark']).toContain(
      '--ignore-pattern "docs/snippets/**"'
    );
    expect(rootPackageJson.scripts['lint:remark']).toContain('"docs/**/*.mdx"');
  });

  it('documents the generated JP docs mirror in markdownlint ignores', async () => {
    const markdownlintIgnore = await readFile(markdownlintIgnoreUrl, 'utf8');

    expect(markdownlintIgnore).toMatch(/^docs\/jp\/$/m);
  });
});
