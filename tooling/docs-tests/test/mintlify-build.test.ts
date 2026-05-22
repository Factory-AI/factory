import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  checkMintlifyBuild,
  formatMintlifyBuildResult,
} from '../src/check-mintlify-build';
import { withMintlifyCliPath } from '../src/mintlify-cli-env';
import { prepareMintlifyDocsWorkspace } from '../src/mintlify-docs-workspace';

const createFixtureRoot = (): string =>
  mkdtempSync(join(tmpdir(), 'factory-mintlify-build-'));

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

const writeFixture = (
  fixtureRoot: string,
  relativePath: string,
  content: string
): string => {
  const filePath = join(fixtureRoot, relativePath);
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, content, 'utf8');

  return filePath;
};

const docsJson = {
  name: 'Fixture Docs',
  navigation: {
    languages: [
      {
        language: 'en',
        tabs: [{ tab: 'Docs', pages: ['welcome/index'] }],
      },
      {
        language: 'jp',
        tabs: [{ tab: 'ドキュメント', pages: ['jp/welcome/index'] }],
      },
    ],
  },
  redirects: [
    { source: '/jp/old', destination: '/jp/welcome' },
    { source: '/old', destination: '/welcome' },
  ],
};

describe('mintlify build validator', () => {
  it('prepends Node 22 and the docs workspace Mintlify bin to PATH', () => {
    const env = withMintlifyCliPath({ PATH: '/usr/bin' });

    expect(env.PATH.split(':').slice(0, 3)).toEqual([
      '/opt/homebrew/opt/node@22/bin',
      join(repoRoot, 'docs/node_modules/.bin'),
      '/usr/bin',
    ]);
  });

  it('prepares an English-only Mintlify docs workspace that excludes docs/jp', () => {
    const fixtureRoot = createFixtureRoot();
    const fixtureDocsRoot = join(fixtureRoot, 'docs');

    try {
      writeFixture(
        fixtureRoot,
        'docs/docs.json',
        `${JSON.stringify(docsJson, null, 2)}\n`
      );
      writeFixture(fixtureRoot, 'docs/welcome/index.mdx', '# Welcome\n');
      writeFixture(
        fixtureRoot,
        'docs/jp/broken.mdx',
        '[broken](/does/not/exist)\n'
      );

      const workspace = prepareMintlifyDocsWorkspace(fixtureDocsRoot);

      try {
        expect(existsSync(join(workspace.docsRoot, 'welcome/index.mdx'))).toBe(
          true
        );
        expect(existsSync(join(workspace.docsRoot, 'jp/broken.mdx'))).toBe(
          false
        );

        const sanitizedDocsJson = JSON.parse(
          readFileSync(join(workspace.docsRoot, 'docs.json'), 'utf8')
        ) as typeof docsJson;

        expect(sanitizedDocsJson.navigation.languages).toHaveLength(1);
        expect(sanitizedDocsJson.navigation.languages[0]?.language).toBe('en');
        expect(sanitizedDocsJson.redirects).toEqual([
          { source: '/old', destination: '/welcome' },
        ]);
      } finally {
        workspace.cleanup();
      }
    } finally {
      rmSync(fixtureRoot, { force: true, recursive: true });
    }
  });

  it('runs mintlify validate and broken-links under Node 22 PATH', () => {
    const fixtureRoot = createFixtureRoot();
    const fixtureDocsRoot = join(fixtureRoot, 'docs');
    const calls: string[] = [];

    try {
      writeFixture(
        fixtureRoot,
        'docs/docs.json',
        `${JSON.stringify(docsJson, null, 2)}\n`
      );
      writeFixture(fixtureRoot, 'docs/welcome/index.mdx', '# Welcome\n');

      const result = checkMintlifyBuild({
        docsRoot: fixtureDocsRoot,
        runCommand: (command, options) => {
          calls.push(`${command}:${options.cwd}:${options.env.PATH}`);

          return {
            command,
            exitCode: 0,
            stderr: '',
            stdout: `${command} ok`,
          };
        },
      });

      expect(result.success).toBe(true);
      expect(result.commands.map((command) => command.command)).toEqual([
        'validate',
        'broken-links',
      ]);
      expect(calls).toHaveLength(2);
      for (const call of calls) {
        expect(call).toContain('/opt/homebrew/opt/node@22/bin:');
      }
    } finally {
      rmSync(fixtureRoot, { force: true, recursive: true });
    }
  });

  it('attributes a broken link failure to mintlify broken-links', () => {
    const fixtureRoot = createFixtureRoot();
    const fixtureDocsRoot = join(fixtureRoot, 'docs');

    try {
      writeFixture(
        fixtureRoot,
        'docs/docs.json',
        `${JSON.stringify(docsJson, null, 2)}\n`
      );
      writeFixture(
        fixtureRoot,
        'docs/broken.mdx',
        '[broken](/does/not/exist)\n'
      );

      const result = checkMintlifyBuild({
        docsRoot: fixtureDocsRoot,
        runCommand: (command) => ({
          command,
          exitCode: command === 'broken-links' ? 1 : 0,
          stderr:
            command === 'broken-links' ? 'Broken link: /does/not/exist' : '',
          stdout: command === 'validate' ? 'validate ok' : '',
        }),
      });

      expect(result.success).toBe(false);
      expect(result.commands).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ command: 'validate', exitCode: 0 }),
          expect.objectContaining({ command: 'broken-links', exitCode: 1 }),
        ])
      );
      expect(formatMintlifyBuildResult(result)).toContain(
        'mintlify broken-links failed'
      );
      expect(formatMintlifyBuildResult(result)).toContain('/does/not/exist');
    } finally {
      rmSync(fixtureRoot, { force: true, recursive: true });
    }
  });
});
