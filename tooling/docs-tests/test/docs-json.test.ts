import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  DOCS_JSON_ORPHAN_ALLOWLIST,
  checkDocsJson,
  formatDocsJsonFinding,
} from '../src/check-docs-json';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const docsRoot = resolve(repoRoot, 'docs');
const docsJsonPath = resolve(docsRoot, 'docs.json');

const createFixtureRoot = (): string =>
  mkdtempSync(join(tmpdir(), 'factory-docs-json-'));

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

const writeDocsJson = (
  fixtureRoot: string,
  docsJson: Record<string, unknown>
): string =>
  writeFixture(
    fixtureRoot,
    'docs/docs.json',
    `${JSON.stringify(docsJson, null, 2)}\n`
  );

const permissiveSchema = {
  type: 'object',
};

const requiredTopLevelSchema = {
  type: 'object',
  required: ['name', 'navigation'],
  properties: {
    name: { type: 'string' },
    navigation: { type: 'object' },
  },
};

const fixtureDocsJson = (pages: unknown[]) => ({
  $schema: 'https://mintlify.com/docs.json',
  theme: 'aspen',
  name: 'Fixture Docs',
  navigation: {
    tabs: [
      {
        tab: 'Docs',
        groups: [
          {
            group: 'Start',
            pages,
          },
        ],
      },
    ],
  },
});

describe('docs.json validator', () => {
  it('keeps the explicit orphan allowlist scoped and includes leaderboards/index', () => {
    expect(DOCS_JSON_ORPHAN_ALLOWLIST).toContain('leaderboards/index');
  });

  it('passes the current docs.json and English MDX baseline', async () => {
    const result = await checkDocsJson({
      docsJsonPath,
      docsRoot,
      schema: permissiveSchema,
    });

    expect(result.findings).toEqual([]);
    expect(result.navPages.length).toBeGreaterThan(0);
    expect(result.diskPages.length).toBeGreaterThan(0);
  });

  it('reports a missing nav page with the unresolved path', async () => {
    const fixtureRoot = createFixtureRoot();
    const fixtureDocsRoot = join(fixtureRoot, 'docs');

    try {
      const fixtureDocsJsonPath = writeDocsJson(
        fixtureRoot,
        fixtureDocsJson(['welcome/index', 'missing/path'])
      );
      writeFixture(
        fixtureRoot,
        'docs/welcome/index.mdx',
        '---\ntitle: Welcome\ndescription: Welcome.\n---\n'
      );

      const result = await checkDocsJson({
        docsJsonPath: fixtureDocsJsonPath,
        docsRoot: fixtureDocsRoot,
        schema: permissiveSchema,
      });

      expect(result.findings).toHaveLength(1);
      expect(result.findings[0]).toMatchObject({
        code: 'missing-nav-page',
        pagePath: 'missing/path',
      });
      expect(formatDocsJsonFinding(result.findings[0])).toContain(
        'missing/path'
      );
    } finally {
      rmSync(fixtureRoot, { force: true, recursive: true });
    }
  });

  it('reports on-disk MDX files that are not in nav or the orphan allowlist', async () => {
    const fixtureRoot = createFixtureRoot();
    const fixtureDocsRoot = join(fixtureRoot, 'docs');

    try {
      const fixtureDocsJsonPath = writeDocsJson(
        fixtureRoot,
        fixtureDocsJson(['welcome/index'])
      );
      writeFixture(
        fixtureRoot,
        'docs/welcome/index.mdx',
        '---\ntitle: Welcome\ndescription: Welcome.\n---\n'
      );
      writeFixture(
        fixtureRoot,
        'docs/area/orphan.mdx',
        '---\ntitle: Orphan\ndescription: Orphan.\n---\n'
      );

      const result = await checkDocsJson({
        docsJsonPath: fixtureDocsJsonPath,
        docsRoot: fixtureDocsRoot,
        schema: permissiveSchema,
      });

      expect(result.findings).toHaveLength(1);
      expect(result.findings[0]).toMatchObject({
        code: 'orphan-mdx',
        pagePath: 'area/orphan',
      });
      expect(formatDocsJsonFinding(result.findings[0])).toContain(
        'area/orphan'
      );
    } finally {
      rmSync(fixtureRoot, { force: true, recursive: true });
    }
  });

  it('ignores JP nav and disk paths for docs parity checks', async () => {
    const fixtureRoot = createFixtureRoot();
    const fixtureDocsRoot = join(fixtureRoot, 'docs');

    try {
      const fixtureDocsJsonPath = writeDocsJson(
        fixtureRoot,
        fixtureDocsJson(['welcome/index', 'jp/missing-page'])
      );
      writeFixture(
        fixtureRoot,
        'docs/welcome/index.mdx',
        '---\ntitle: Welcome\ndescription: Welcome.\n---\n'
      );
      writeFixture(
        fixtureRoot,
        'docs/jp/unlisted.mdx',
        '---\ntitle: JP\ndescription: JP.\n---\n'
      );

      const result = await checkDocsJson({
        docsJsonPath: fixtureDocsJsonPath,
        docsRoot: fixtureDocsRoot,
        schema: permissiveSchema,
      });

      expect(result.findings).toEqual([]);
      expect(result.skippedNavPages).toEqual(['jp/missing-page']);
      expect(result.diskPages).toEqual(['welcome/index']);
    } finally {
      rmSync(fixtureRoot, { force: true, recursive: true });
    }
  });

  it('returns a schema-validation finding for malformed docs.json shape', async () => {
    const fixtureRoot = createFixtureRoot();
    const fixtureDocsRoot = join(fixtureRoot, 'docs');

    try {
      const fixtureDocsJsonPath = writeDocsJson(fixtureRoot, {
        name: 42,
      });

      const result = await checkDocsJson({
        docsJsonPath: fixtureDocsJsonPath,
        docsRoot: fixtureDocsRoot,
        schema: requiredTopLevelSchema,
      });

      expect(result.findings.some((finding) => finding.code === 'schema')).toBe(
        true
      );
      expect(formatDocsJsonFinding(result.findings[0])).toContain(
        'schema validation'
      );
      expect(formatDocsJsonFinding(result.findings[0])).toMatch(
        /navigation|name/
      );
    } finally {
      rmSync(fixtureRoot, { force: true, recursive: true });
    }
  });
});
