import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  DEFAULT_CODE_FENCE_LANGUAGE_ALLOWLIST,
  checkCodeFences,
  collectCodeFenceMdxFiles,
  formatCodeFenceFinding,
} from '../src/check-code-fences';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const docsRoot = resolve(repoRoot, 'docs');

const createFixtureRoot = (): string =>
  mkdtempSync(join(tmpdir(), 'factory-code-fences-'));

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

const fixturePage = (body: string): string =>
  `---\ntitle: Fixture\ndescription: Fixture page.\n---\n\n${body}\n`;

describe('code fence validator', () => {
  it('walks docs MDX while excluding JP content', () => {
    const fixtureRoot = createFixtureRoot();
    const fixtureDocsRoot = join(fixtureRoot, 'docs');

    try {
      const pagePath = writeFixture(
        fixtureRoot,
        'docs/page.mdx',
        fixturePage('```bash\necho ok\n```')
      );
      writeFixture(
        fixtureRoot,
        'docs/jp/page.mdx',
        fixturePage('```\necho ignored\n```')
      );

      expect(
        collectCodeFenceMdxFiles([fixtureDocsRoot], {
          docsRoot: fixtureDocsRoot,
        })
      ).toEqual([pagePath]);
    } finally {
      rmSync(fixtureRoot, { force: true, recursive: true });
    }
  });

  it('defines a project language allowlist with existing docs languages', () => {
    expect(DEFAULT_CODE_FENCE_LANGUAGE_ALLOWLIST).toEqual(
      expect.arrayContaining([
        'bash',
        'json',
        'markdown',
        'mermaid',
        'text',
        'typescript',
        'yaml',
      ])
    );
  });

  it('passes the current English MDX baseline', () => {
    const result = checkCodeFences([docsRoot], { docsRoot });

    expect(result.findings).toEqual([]);
    expect(result.checkedFiles).toBeGreaterThan(0);
  });

  it('reports a structured file:line:col error for a bare fence', () => {
    const fixtureRoot = createFixtureRoot();
    const fixtureDocsRoot = join(fixtureRoot, 'docs');

    try {
      const fixturePath = writeFixture(
        fixtureRoot,
        'docs/bare.mdx',
        fixturePage('```\necho missing language\n```')
      );

      const result = checkCodeFences([fixtureDocsRoot], {
        docsRoot: fixtureDocsRoot,
      });

      expect(result.findings).toHaveLength(1);
      expect(result.findings[0]).toMatchObject({
        code: 'missing-language',
        column: 1,
        filePath: fixturePath,
        line: 6,
      });
      expect(formatCodeFenceFinding(result.findings[0])).toContain(
        `${fixturePath}:6:1`
      );
      expect(formatCodeFenceFinding(result.findings[0])).toContain(
        'missing language'
      );
    } finally {
      rmSync(fixtureRoot, { force: true, recursive: true });
    }
  });

  it('reports a structured error when the language is outside the allowlist', () => {
    const fixtureRoot = createFixtureRoot();
    const fixtureDocsRoot = join(fixtureRoot, 'docs');

    try {
      const fixturePath = writeFixture(
        fixtureRoot,
        'docs/unknown.mdx',
        fixturePage('```madeuplang\nexample\n```')
      );

      const result = checkCodeFences([fixtureDocsRoot], {
        docsRoot: fixtureDocsRoot,
      });

      expect(result.findings).toHaveLength(1);
      expect(result.findings[0]).toMatchObject({
        code: 'unknown-language',
        filePath: fixturePath,
        language: 'madeuplang',
        line: 6,
      });
      expect(formatCodeFenceFinding(result.findings[0])).toContain(
        'madeuplang'
      );
    } finally {
      rmSync(fixtureRoot, { force: true, recursive: true });
    }
  });

  it('accepts titled code fence info strings when the first token is allowed', () => {
    const fixtureRoot = createFixtureRoot();
    const fixtureDocsRoot = join(fixtureRoot, 'docs');

    try {
      writeFixture(
        fixtureRoot,
        'docs/titled.mdx',
        fixturePage('```bash macOS/Linux\necho ok\n```')
      );

      const result = checkCodeFences([fixtureDocsRoot], {
        docsRoot: fixtureDocsRoot,
      });

      expect(result.findings).toEqual([]);
    } finally {
      rmSync(fixtureRoot, { force: true, recursive: true });
    }
  });
});
