import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  IMAGE_SIZE_WARNING_BYTES,
  checkImages,
  collectImageMdxFiles,
  formatImageFinding,
  formatImageWarning,
  runImagesCli,
} from '../src/check-images';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const docsRoot = resolve(repoRoot, 'docs');

const createFixtureRoot = (): string =>
  mkdtempSync(join(tmpdir(), 'factory-images-'));

const writeFixture = (
  fixtureRoot: string,
  relativePath: string,
  content: string | Buffer
): string => {
  const filePath = join(fixtureRoot, relativePath);
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, content);

  return filePath;
};

const fixturePage = (body: string): string =>
  `---\ntitle: Fixture\ndescription: Fixture page.\n---\n\n${body}\n`;

describe('image validator', () => {
  it('walks docs MDX while excluding JP content', () => {
    const fixtureRoot = createFixtureRoot();
    const fixtureDocsRoot = join(fixtureRoot, 'docs');

    try {
      const pagePath = writeFixture(
        fixtureRoot,
        'docs/page.mdx',
        fixturePage('![Alt text](/images/example.png)')
      );
      writeFixture(
        fixtureRoot,
        'docs/jp/page.mdx',
        fixturePage('![](/images/missing.png)')
      );

      expect(
        collectImageMdxFiles([fixtureDocsRoot], { docsRoot: fixtureDocsRoot })
      ).toEqual([pagePath]);
    } finally {
      rmSync(fixtureRoot, { force: true, recursive: true });
    }
  });

  it('passes the current English MDX baseline', () => {
    const result = checkImages([docsRoot], { docsRoot });

    expect(result.findings).toEqual([]);
    expect(result.checkedFiles).toBeGreaterThan(0);
  });

  it('reports a structured file:line:col error for empty Markdown image alt text', () => {
    const fixtureRoot = createFixtureRoot();
    const fixtureDocsRoot = join(fixtureRoot, 'docs');

    try {
      writeFixture(fixtureRoot, 'docs/images/foo.png', 'fixture');
      const fixturePath = writeFixture(
        fixtureRoot,
        'docs/empty-alt.mdx',
        fixturePage('![](/images/foo.png)')
      );

      const result = checkImages([fixtureDocsRoot], {
        docsRoot: fixtureDocsRoot,
      });

      expect(result.findings).toHaveLength(1);
      expect(result.findings[0]).toMatchObject({
        code: 'empty-alt',
        column: 1,
        filePath: fixturePath,
        line: 6,
        source: '/images/foo.png',
      });
      expect(formatImageFinding(result.findings[0])).toContain(
        `${fixturePath}:6:1`
      );
      expect(formatImageFinding(result.findings[0])).toContain('empty alt');
    } finally {
      rmSync(fixtureRoot, { force: true, recursive: true });
    }
  });

  it('reports a structured file:line:col error for empty JSX img alt text', () => {
    const fixtureRoot = createFixtureRoot();
    const fixtureDocsRoot = join(fixtureRoot, 'docs');

    try {
      writeFixture(fixtureRoot, 'docs/images/foo.png', 'fixture');
      const fixturePath = writeFixture(
        fixtureRoot,
        'docs/empty-jsx-alt.mdx',
        fixturePage('<img src="/images/foo.png" alt="" />')
      );

      const result = checkImages([fixtureDocsRoot], {
        docsRoot: fixtureDocsRoot,
      });

      expect(result.findings).toHaveLength(1);
      expect(result.findings[0]).toMatchObject({
        code: 'empty-alt',
        filePath: fixturePath,
        line: 6,
        source: '/images/foo.png',
      });
      expect(formatImageFinding(result.findings[0])).toContain(
        `${fixturePath}:6:1`
      );
    } finally {
      rmSync(fixtureRoot, { force: true, recursive: true });
    }
  });

  it('reports missing image assets with the missing path named', () => {
    const fixtureRoot = createFixtureRoot();
    const fixtureDocsRoot = join(fixtureRoot, 'docs');

    try {
      const fixturePath = writeFixture(
        fixtureRoot,
        'docs/missing.mdx',
        fixturePage('![Missing](/images/does-not-exist.png)')
      );

      const result = checkImages([fixtureDocsRoot], {
        docsRoot: fixtureDocsRoot,
      });

      expect(result.findings).toHaveLength(1);
      expect(result.findings[0]).toMatchObject({
        code: 'missing-asset',
        filePath: fixturePath,
        line: 6,
        source: '/images/does-not-exist.png',
      });
      expect(formatImageFinding(result.findings[0])).toContain(
        '/images/does-not-exist.png'
      );
    } finally {
      rmSync(fixtureRoot, { force: true, recursive: true });
    }
  });

  it('warns without failing when a referenced image exceeds 500 KB', () => {
    const fixtureRoot = createFixtureRoot();
    const fixtureDocsRoot = join(fixtureRoot, 'docs');

    try {
      writeFixture(
        fixtureRoot,
        'docs/images/large.png',
        Buffer.alloc(IMAGE_SIZE_WARNING_BYTES + 1)
      );
      const fixturePath = writeFixture(
        fixtureRoot,
        'docs/large.mdx',
        fixturePage('![Large](/images/large.png)')
      );

      const result = checkImages([fixtureDocsRoot], {
        docsRoot: fixtureDocsRoot,
      });

      expect(result.findings).toEqual([]);
      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0]).toMatchObject({
        code: 'large-asset',
        filePath: fixturePath,
        line: 6,
        source: '/images/large.png',
      });
      expect(formatImageWarning(result.warnings[0])).toContain('large.png');
      expect(formatImageWarning(result.warnings[0])).toContain('512001 bytes');
      expect(
        runImagesCli([fixtureDocsRoot], { docsRoot: fixtureDocsRoot })
      ).toBe(0);
    } finally {
      rmSync(fixtureRoot, { force: true, recursive: true });
    }
  });

  it('resolves both absolute and relative local image references', () => {
    const fixtureRoot = createFixtureRoot();
    const fixtureDocsRoot = join(fixtureRoot, 'docs');

    try {
      writeFixture(fixtureRoot, 'docs/images/absolute.png', 'fixture');
      writeFixture(fixtureRoot, 'docs/guide/relative.png', 'fixture');
      writeFixture(
        fixtureRoot,
        'docs/guide/images.mdx',
        fixturePage(
          '![Absolute](/images/absolute.png)\n\n<img src="./relative.png" alt="Relative image" />'
        )
      );

      const result = checkImages([fixtureDocsRoot], {
        docsRoot: fixtureDocsRoot,
      });

      expect(result.findings).toEqual([]);
    } finally {
      rmSync(fixtureRoot, { force: true, recursive: true });
    }
  });
});
