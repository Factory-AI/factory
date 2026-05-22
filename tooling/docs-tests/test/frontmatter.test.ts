import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  checkFrontmatterFiles,
  collectMdxFiles,
  formatFrontmatterFinding,
  isFrontmatterExemptPath,
} from '../src/check-frontmatter';
import { frontmatterSchema } from '../src/frontmatter-schema';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const docsRoot = resolve(repoRoot, 'docs');

const createFixtureRoot = (): string =>
  mkdtempSync(join(tmpdir(), 'factory-frontmatter-'));

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

describe('frontmatter schema', () => {
  it('requires title and description while accepting known optional fields', () => {
    expect(
      frontmatterSchema.safeParse({
        title: 'Quickstart',
        description: 'Get started with Factory.',
        keywords: ['factory', 'droid'],
        sidebarTitle: 'Start here',
        rss: true,
      }).success
    ).toBe(true);

    const missingTitle = frontmatterSchema.safeParse({
      description: 'Missing a title.',
    });
    const missingDescription = frontmatterSchema.safeParse({
      title: 'Missing a description',
    });

    expect(missingTitle.success).toBe(false);
    expect(
      missingTitle.success ? [] : missingTitle.error.issues[0].path
    ).toEqual(['title']);
    expect(missingDescription.success).toBe(false);
    expect(
      missingDescription.success ? [] : missingDescription.error.issues[0].path
    ).toEqual(['description']);
  });
});

describe('frontmatter validator', () => {
  it('walks docs MDX while excluding JP and snippets directories', () => {
    const fixtureRoot = createFixtureRoot();
    const fixtureDocsRoot = join(fixtureRoot, 'docs');

    try {
      const pagePath = writeFixture(
        fixtureRoot,
        'docs/page.mdx',
        '---\ntitle: Valid\ndescription: Valid page.\n---\n'
      );
      writeFixture(fixtureRoot, 'docs/jp/page.mdx', 'No frontmatter.\n');
      writeFixture(
        fixtureRoot,
        'docs/snippets/example.mdx',
        'No frontmatter.\n'
      );

      expect(
        collectMdxFiles([fixtureDocsRoot], { docsRoot: fixtureDocsRoot })
      ).toEqual([pagePath]);
    } finally {
      rmSync(fixtureRoot, { force: true, recursive: true });
    }
  });

  it('passes the current English MDX baseline', () => {
    const result = checkFrontmatterFiles([docsRoot], { docsRoot });

    expect(result.findings).toEqual([]);
    expect(result.checkedFiles).toBeGreaterThan(0);
  });

  it('reports a structured file:line:col error for missing title', () => {
    const fixtureRoot = createFixtureRoot();

    try {
      const fixturePath = writeFixture(
        fixtureRoot,
        'docs/missing-title.mdx',
        '---\ndescription: Has only a description.\n---\n\n# Missing title\n'
      );
      const result = checkFrontmatterFiles([fixturePath], {
        docsRoot: join(fixtureRoot, 'docs'),
      });

      expect(result.findings).toHaveLength(1);
      expect(result.findings[0]).toMatchObject({
        column: 1,
        field: 'title',
        line: 1,
      });
      expect(formatFrontmatterFinding(result.findings[0])).toContain(
        `${fixturePath}:1:1`
      );
      expect(formatFrontmatterFinding(result.findings[0])).toContain('title');
    } finally {
      rmSync(fixtureRoot, { force: true, recursive: true });
    }
  });

  it('reports a structured file:line:col error for missing description', () => {
    const fixtureRoot = createFixtureRoot();

    try {
      const fixturePath = writeFixture(
        fixtureRoot,
        'docs/missing-description.mdx',
        '---\ntitle: Has only a title\n---\n\n# Missing description\n'
      );
      const result = checkFrontmatterFiles([fixturePath], {
        docsRoot: join(fixtureRoot, 'docs'),
      });

      expect(result.findings).toHaveLength(1);
      expect(result.findings[0]).toMatchObject({
        column: 1,
        field: 'description',
        line: 1,
      });
      expect(formatFrontmatterFinding(result.findings[0])).toContain(
        `${fixturePath}:1:1`
      );
      expect(formatFrontmatterFinding(result.findings[0])).toContain(
        'description'
      );
    } finally {
      rmSync(fixtureRoot, { force: true, recursive: true });
    }
  });

  it('explicitly exempts frontmatter-less snippet files', () => {
    const fixtureRoot = createFixtureRoot();
    const fixtureDocsRoot = join(fixtureRoot, 'docs');

    try {
      const fixturePath = writeFixture(
        fixtureRoot,
        'docs/snippets/no-frontmatter.mdx',
        'export const Example = () => null;\n'
      );
      const result = checkFrontmatterFiles([fixturePath], {
        docsRoot: fixtureDocsRoot,
      });

      expect(isFrontmatterExemptPath(fixturePath, fixtureDocsRoot)).toBe(true);
      expect(result.findings).toEqual([]);
      expect(result.checkedFiles).toBe(0);
      expect(result.skippedFiles).toBe(1);
    } finally {
      rmSync(fixtureRoot, { force: true, recursive: true });
    }
  });
});
