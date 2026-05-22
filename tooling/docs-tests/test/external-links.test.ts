import {
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
  DEFAULT_EXTERNAL_LINK_ALLOWLIST,
  checkExternalLinks,
  collectExternalLinkMdxFiles,
  formatExternalLinkFinding,
  isExternalLinkAllowlisted,
  runExternalLinksCli,
} from '../src/check-external-links';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

const createFixtureRoot = (): string =>
  mkdtempSync(join(tmpdir(), 'factory-external-links-'));

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

const emptyStats = {
  errors: 0,
  excludes: 0,
  successful: 0,
  total: 0,
  unique: 0,
};

describe('external links validator', () => {
  it('walks docs MDX while excluding JP content', () => {
    const fixtureRoot = createFixtureRoot();
    const fixtureDocsRoot = join(fixtureRoot, 'docs');

    try {
      const pagePath = writeFixture(
        fixtureRoot,
        'docs/page.mdx',
        fixturePage('[external](https://factory.ai)')
      );
      writeFixture(
        fixtureRoot,
        'docs/jp/page.mdx',
        fixturePage('[external](https://auth.example.com/private)')
      );

      expect(
        collectExternalLinkMdxFiles([fixtureDocsRoot], {
          docsRoot: fixtureDocsRoot,
        })
      ).toEqual([pagePath]);
    } finally {
      rmSync(fixtureRoot, { force: true, recursive: true });
    }
  });

  it('captures lychee failures in the structured report but keeps the CLI informational', () => {
    const fixtureRoot = createFixtureRoot();
    const fixtureDocsRoot = join(fixtureRoot, 'docs');

    try {
      const fixturePath = writeFixture(
        fixtureRoot,
        'docs/broken.mdx',
        fixturePage('[broken](https://broken-links.factory.invalid/not-found)')
      );
      const reportPath = join(fixtureRoot, 'reports', 'external-links.json');
      const exitCode = runExternalLinksCli(
        ['--', '--report', reportPath, fixtureDocsRoot],
        {
          docsRoot: fixtureDocsRoot,
          runLychee: () => ({
            findings: [
              {
                code: 'lychee',
                column: 1,
                filePath: fixturePath,
                line: 8,
                message: '404 Not Found',
                target: 'https://broken-links.factory.invalid/not-found',
              },
            ],
            stats: { ...emptyStats, errors: 1, total: 1, unique: 1 },
          }),
        }
      );

      expect(exitCode).toBe(0);

      const report = JSON.parse(readFileSync(reportPath, 'utf8')) as {
        brokenLinks: Array<{ target: string }>;
        status: string;
      };

      expect(report.status).toBe('broken');
      expect(report.brokenLinks).toEqual([
        expect.objectContaining({
          target: 'https://broken-links.factory.invalid/not-found',
        }),
      ]);
      expect(
        formatExternalLinkFinding(
          {
            code: 'lychee',
            column: 1,
            filePath: fixturePath,
            line: 8,
            message: '404 Not Found',
            target: 'https://broken-links.factory.invalid/not-found',
          },
          { cwd: repoRoot }
        )
      ).toContain('external-links.lychee');
    } finally {
      rmSync(fixtureRoot, { force: true, recursive: true });
    }
  });

  it('keeps configured allowlisted targets out of the broken report', () => {
    const fixtureRoot = createFixtureRoot();
    const fixtureDocsRoot = join(fixtureRoot, 'docs');

    try {
      const fixturePath = writeFixture(
        fixtureRoot,
        'docs/auth.mdx',
        fixturePage(
          '[auth](https://auth.example.com/private)\n\n[broken](https://broken-links.factory.invalid/not-found)'
        )
      );

      const result = checkExternalLinks([fixtureDocsRoot], {
        allowlist: [
          {
            pattern: '^https://auth\\.example\\.com/.*',
            reason: 'Auth-walled fixture.',
          },
        ],
        docsRoot: fixtureDocsRoot,
        runLychee: () => ({
          findings: [
            {
              code: 'lychee',
              column: 1,
              filePath: fixturePath,
              line: 8,
              message: '401 Unauthorized',
              target: 'https://auth.example.com/private',
            },
            {
              code: 'lychee',
              column: 1,
              filePath: fixturePath,
              line: 10,
              message: '404 Not Found',
              target: 'https://broken-links.factory.invalid/not-found',
            },
          ],
          stats: { ...emptyStats, errors: 2, total: 2, unique: 2 },
        }),
      });

      expect(result.brokenLinks.map((finding) => finding.target)).toEqual([
        'https://broken-links.factory.invalid/not-found',
      ]);
      expect(result.allowlistedLinks.map((finding) => finding.target)).toEqual([
        'https://auth.example.com/private',
      ]);
    } finally {
      rmSync(fixtureRoot, { force: true, recursive: true });
    }
  });

  it('ships an allowlist for Factory auth-walled API targets', () => {
    expect(
      isExternalLinkAllowlisted(
        'https://app.factory.ai/settings/api-keys',
        DEFAULT_EXTERNAL_LINK_ALLOWLIST
      )
    ).toBe(true);
    expect(
      isExternalLinkAllowlisted(
        'https://api.factory.ai/api/v1/analytics/tokens?startDate=2026-01-14',
        DEFAULT_EXTERNAL_LINK_ALLOWLIST
      )
    ).toBe(true);
  });
});
