import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { readFile, stat } from 'node:fs/promises';

import { describe, expect, it } from 'vitest';

const repoRootUrl = new URL('../../../', import.meta.url);
const rootPackageJsonUrl = new URL('../../../package.json', import.meta.url);
const preCommitUrl = new URL('../../../.husky/pre-commit', import.meta.url);

const readJson = async <T>(url: URL): Promise<T> =>
  JSON.parse(await readFile(url, 'utf8')) as T;

describe('pre-commit lint-staged wiring', () => {
  it('runs lint-staged from an executable Husky pre-commit hook', async () => {
    const preCommit = await readFile(preCommitUrl, 'utf8');
    const preCommitStat = await stat(preCommitUrl);

    expect(preCommit).toContain('pnpm exec lint-staged');
    expect(preCommitStat.mode & 0o111).toBeGreaterThan(0);
  });

  it('maps staged formattable files to Prettier and staged MDX to remark, vars, and cspell checks', async () => {
    const rootPackageJson = await readJson<{
      'lint-staged': Record<string, string | string[]>;
    }>(rootPackageJsonUrl);

    expect(rootPackageJson['lint-staged']['*.{ts,js,json,yml,md}']).toBe(
      'prettier --config tooling/docs-lint/prettier.config.mjs --write'
    );

    const mdxTasks = rootPackageJson['lint-staged']['*.mdx'];
    expect(mdxTasks).toEqual(expect.any(Array));
    expect(mdxTasks).toEqual(
      expect.arrayContaining([
        expect.stringContaining('tooling/docs-lint/node_modules/.bin/remark'),
        expect.stringContaining('pnpm vars:check'),
        expect.stringContaining('cspell --config cspell.config.yaml'),
      ])
    );
  });

  it('reports undefined vars references with file, line, column, and path', async () => {
    const tempDir = await mkdtemp(join(tmpdir(), 'factory-docs-mdx-vars-'));
    const fixturePath = join(tempDir, 'bad-vars.mdx');

    await writeFile(
      fixturePath,
      [
        '---',
        'title: Bad vars',
        'description: Bad vars fixture',
        '---',
        '',
        '# Bad vars',
        '',
        'This value is wrong: {vars.urls.dcos}',
        '',
      ].join('\n')
    );

    try {
      const result = spawnSync(
        'node',
        ['tooling/docs-lint/check-mdx-vars.mjs', fixturePath],
        {
          cwd: fileURLToPath(repoRootUrl),
          encoding: 'utf8',
        }
      );

      expect(result.status).toBe(1);
      expect(result.stderr).toContain(`${fixturePath}:8:22`);
      expect(result.stderr).toContain('vars.urls.dcos');
    } finally {
      await rm(tempDir, { force: true, recursive: true });
    }
  });
});
