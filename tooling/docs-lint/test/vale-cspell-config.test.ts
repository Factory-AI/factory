import { readFile } from 'node:fs/promises';

import { describe, expect, it } from 'vitest';

const rootPackageJsonUrl = new URL('../../../package.json', import.meta.url);
const docsLintPackageJsonUrl = new URL('../package.json', import.meta.url);
const valeConfigUrl = new URL('../../../.vale.ini', import.meta.url);
const cspellConfigUrl = new URL('../../../cspell.config.yaml', import.meta.url);
const cspellWordlistUrl = new URL(
  '../cspell-project-words.txt',
  import.meta.url
);
const valeRunnerUrl = new URL('../run-vale.js', import.meta.url);
const cspellRunnerUrl = new URL('../run-cspell.js', import.meta.url);

const readJson = async <T>(url: URL): Promise<T> =>
  JSON.parse(await readFile(url, 'utf8')) as T;

describe('Vale and cspell config', () => {
  it('wires Vale with mdx2vast and excludes the generated JP docs mirror', async () => {
    const rootPackageJson = await readJson<{
      scripts: Record<string, string>;
    }>(rootPackageJsonUrl);
    const docsLintPackageJson = await readJson<{
      devDependencies: Record<string, string>;
    }>(docsLintPackageJsonUrl);
    const valeConfig = await readFile(valeConfigUrl, 'utf8');
    const valeRunner = await readFile(valeRunnerUrl, 'utf8');

    expect(docsLintPackageJson.devDependencies).toHaveProperty('mdx2vast');
    expect(valeConfig).toMatch(/^\[\*\.mdx\]$/m);
    expect(valeConfig).toMatch(/^\s*Transform\s*=\s*mdx2vast\s*$/m);
    expect(valeConfig).toMatch(/^\s*SkippedScopes\s*=/m);

    const lintValeScript = rootPackageJson.scripts['lint:vale'];
    expect(lintValeScript).toBe('node tooling/docs-lint/run-vale.js');
    expect(valeRunner).toContain('vale');
    expect(valeRunner).toContain('docs');
    expect(valeRunner).toContain('tooling/docs-lint/node_modules/.bin');
    expect(valeRunner).toContain('--glob=!docs/jp/**');
  });

  it('wires cspell dictionaries, a project wordlist, and JP exclusions', async () => {
    const rootPackageJson = await readJson<{
      scripts: Record<string, string>;
    }>(rootPackageJsonUrl);
    const docsLintPackageJson = await readJson<{
      devDependencies: Record<string, string>;
    }>(docsLintPackageJsonUrl);
    const cspellConfig = await readFile(cspellConfigUrl, 'utf8');
    const projectWords = await readFile(cspellWordlistUrl, 'utf8');
    const cspellRunner = await readFile(cspellRunnerUrl, 'utf8');

    expect(docsLintPackageJson.devDependencies).toHaveProperty('cspell');
    expect(docsLintPackageJson.devDependencies).toHaveProperty(
      '@cspell/dict-en_us'
    );
    expect(docsLintPackageJson.devDependencies).toHaveProperty(
      '@cspell/dict-software-terms'
    );
    expect(docsLintPackageJson.devDependencies).toHaveProperty(
      '@cspell/dict-companies'
    );

    expect(cspellConfig).toContain('@cspell/dict-en_us');
    expect(cspellConfig).toContain('@cspell/dict-software-terms');
    expect(cspellConfig).toContain('@cspell/dict-companies');
    expect(cspellConfig).toContain(
      'tooling/docs-lint/cspell-project-words.txt'
    );
    expect(cspellConfig).toMatch(/^\s+- docs\/jp\/\*\*$/m);

    expect(projectWords).toMatch(/^Mintlify$/m);
    expect(projectWords).toMatch(/^Droid$/m);
    expect(projectWords).toMatch(/^Factory$/m);

    const lintCspellScript = rootPackageJson.scripts['lint:cspell'];
    expect(lintCspellScript).toBe('node tooling/docs-lint/run-cspell.js');
    expect(cspellRunner).toContain('cspell');
    expect(cspellRunner).toContain('docs/**/*.{md,mdx}');
    expect(cspellRunner).toContain('docs/jp/**');
  });
});
