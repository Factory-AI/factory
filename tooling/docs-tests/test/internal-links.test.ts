import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  checkInternalLinks,
  collectInternalLinkMdxFiles,
  formatInternalLinkFinding,
} from '../src/check-internal-links';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const docsRoot = resolve(repoRoot, 'docs');

const createFixtureRoot = (): string =>
  mkdtempSync(join(tmpdir(), 'factory-internal-links-'));

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

describe('internal links validator', () => {
  it('walks docs MDX while excluding JP content', () => {
    const fixtureRoot = createFixtureRoot();
    const fixtureDocsRoot = join(fixtureRoot, 'docs');

    try {
      const pagePath = writeFixture(
        fixtureRoot,
        'docs/page.mdx',
        fixturePage('# Page')
      );
      writeFixture(
        fixtureRoot,
        'docs/jp/page.mdx',
        fixturePage('[broken](/does/not/exist)')
      );

      expect(
        collectInternalLinkMdxFiles([fixtureDocsRoot], {
          docsRoot: fixtureDocsRoot,
        })
      ).toEqual([pagePath]);
    } finally {
      rmSync(fixtureRoot, { force: true, recursive: true });
    }
  });

  it('passes the current English MDX baseline', () => {
    const result = checkInternalLinks([docsRoot], { docsRoot });

    expect(result.findings).toEqual([]);
    expect(result.checkedFiles).toBeGreaterThan(0);
    expect(result.lychee.total).toBeGreaterThan(0);
  });

  it('reports a lychee-backed file:line error for a broken internal link target', () => {
    const fixtureRoot = createFixtureRoot();
    const fixtureDocsRoot = join(fixtureRoot, 'docs');

    try {
      const fixturePath = writeFixture(
        fixtureRoot,
        'docs/broken.mdx',
        fixturePage('# Page\n\n[broken](/does/not/exist)')
      );

      const result = checkInternalLinks([fixtureDocsRoot], {
        docsRoot: fixtureDocsRoot,
      });

      expect(result.findings).toHaveLength(1);
      expect(result.findings[0]).toMatchObject({
        code: 'lychee',
        column: 1,
        filePath: fixturePath,
        line: 8,
        target: '/does/not/exist',
      });
      expect(formatInternalLinkFinding(result.findings[0])).toContain(
        `${fixturePath}:8:1`
      );
      expect(formatInternalLinkFinding(result.findings[0])).toContain(
        '/does/not/exist'
      );
    } finally {
      rmSync(fixtureRoot, { force: true, recursive: true });
    }
  });

  it('passes anchor-only links when the target heading exists', () => {
    const fixtureRoot = createFixtureRoot();
    const fixtureDocsRoot = join(fixtureRoot, 'docs');

    try {
      writeFixture(
        fixtureRoot,
        'docs/anchors.mdx',
        fixturePage('# Section ID\n\n[link](#section-id)')
      );

      const result = checkInternalLinks([fixtureDocsRoot], {
        docsRoot: fixtureDocsRoot,
      });

      expect(result.findings).toEqual([]);
    } finally {
      rmSync(fixtureRoot, { force: true, recursive: true });
    }
  });

  it('fails anchor-only links when the target heading is missing', () => {
    const fixtureRoot = createFixtureRoot();
    const fixtureDocsRoot = join(fixtureRoot, 'docs');

    try {
      const fixturePath = writeFixture(
        fixtureRoot,
        'docs/anchors.mdx',
        fixturePage('# Section ID\n\n[link](#missing-section)')
      );

      const result = checkInternalLinks([fixtureDocsRoot], {
        docsRoot: fixtureDocsRoot,
      });

      expect(result.findings).toHaveLength(1);
      expect(result.findings[0]).toMatchObject({
        code: 'anchor',
        column: 1,
        filePath: fixturePath,
        line: 8,
        target: '#missing-section',
      });
      expect(formatInternalLinkFinding(result.findings[0])).toContain(
        '#missing-section'
      );
    } finally {
      rmSync(fixtureRoot, { force: true, recursive: true });
    }
  });

  it('validates cross-page anchors against the resolved target MDX heading', () => {
    const fixtureRoot = createFixtureRoot();
    const fixtureDocsRoot = join(fixtureRoot, 'docs');

    try {
      writeFixture(
        fixtureRoot,
        'docs/index.mdx',
        fixturePage('[link](/guide#target-heading)')
      );
      writeFixture(
        fixtureRoot,
        'docs/guide.mdx',
        fixturePage('## Target heading')
      );

      const result = checkInternalLinks([fixtureDocsRoot], {
        docsRoot: fixtureDocsRoot,
      });

      expect(result.findings).toEqual([]);
    } finally {
      rmSync(fixtureRoot, { force: true, recursive: true });
    }
  });
});
