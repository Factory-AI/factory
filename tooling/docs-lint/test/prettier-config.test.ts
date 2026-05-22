import { readFile } from 'node:fs/promises';

import { describe, expect, it } from 'vitest';

import prettierConfig from '../prettier.config.mjs';

const rootPackageJsonUrl = new URL('../../../package.json', import.meta.url);
const prettierIgnoreUrl = new URL('../../../.prettierignore', import.meta.url);

describe('Prettier config', () => {
  it('exports the factory-mono Prettier shape without printWidth', () => {
    expect(prettierConfig).toEqual({
      trailingComma: 'es5',
      semi: true,
      tabWidth: 2,
      singleQuote: true,
      jsxSingleQuote: false,
      arrowParens: 'always',
    });
    expect(prettierConfig).not.toHaveProperty('printWidth');
  });

  it('wires root format scripts to safe non-MDX extensions', async () => {
    const rootPackageJson = JSON.parse(
      await readFile(rootPackageJsonUrl, 'utf8')
    ) as { scripts: Record<string, string> };

    for (const scriptName of ['format', 'format:check']) {
      const script = rootPackageJson.scripts[scriptName];
      expect(script).toContain('prettier');
      expect(script).toContain('tooling/docs-lint/prettier.config.mjs');
      expect(script).toContain('ts,js,json,yml,md');
      expect(script).not.toMatch(/mdx/i);
    }
  });

  it('ignores MDX and the generated JP docs mirror', async () => {
    const prettierIgnore = await readFile(prettierIgnoreUrl, 'utf8');

    expect(prettierIgnore).toMatch(/^\*\.mdx$/m);
    expect(prettierIgnore).toMatch(/^docs\/jp\/$/m);
  });
});
