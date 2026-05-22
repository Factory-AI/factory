import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  BROWSER_RENDER_BROWSERS,
  BROWSER_RENDER_PAGES,
  classifyConsoleEntry,
  normalizeVisibleText,
  runBrowserRenderCheck,
} from '../src/check-browser-render';

describe('browser render validator', () => {
  it('defines the required browser engines and representative page set', () => {
    expect(BROWSER_RENDER_BROWSERS).toEqual(['chromium', 'firefox']);
    expect(BROWSER_RENDER_PAGES.map((page) => page.path)).toEqual([
      '/',
      '/cli/getting-started/quickstart',
      '/cli/getting-started/overview',
      '/pricing',
      '/enterprise',
    ]);
  });

  it('normalizes visible text for cross-browser parity comparisons', () => {
    expect(normalizeVisibleText('Factory\n\n  Droid\tCLI')).toBe(
      'Factory Droid CLI'
    );
  });

  it('classifies console errors and Mintlify hydration warnings', () => {
    expect(
      classifyConsoleEntry({
        text: 'Error: failed to render',
        type: 'error',
      })
    ).toBe('console-error');
    expect(
      classifyConsoleEntry({
        text: 'Warning: Text content did not match. Server: "A" Client: "B"',
        type: 'warning',
      })
    ).toBe('hydration-warning');
    expect(
      classifyConsoleEntry({
        text: 'ordinary debug message',
        type: 'log',
      })
    ).toBeUndefined();
  });

  it('loads all pages in both browsers and writes a clean parity report', async () => {
    const outputDir = mkdtempSync(join(tmpdir(), 'factory-browser-report-'));
    const visited: string[] = [];

    try {
      const result = await runBrowserRenderCheck({
        outputDir,
        runBrowserPage: async (browserName, page) => {
          visited.push(`${browserName}:${page.path}`);

          return {
            browserName,
            consoleErrors: [],
            hydrationWarnings: [],
            page,
            screenshotPath: join(outputDir, `${browserName}-${page.id}.png`),
            status: 200,
            url: `http://127.0.0.1:3333${page.path}`,
            visibleText:
              browserName === 'firefox'
                ? `  ${page.expectedText}\nShared content  `
                : `${page.expectedText} Shared content`,
          };
        },
        startDevServer: async () => ({
          baseUrl: 'http://127.0.0.1:3333',
          logs: () => '',
          pid: 1234,
          stop: async () => undefined,
        }),
      });

      expect(result.success).toBe(true);
      expect(visited).toHaveLength(
        BROWSER_RENDER_BROWSERS.length * BROWSER_RENDER_PAGES.length
      );
      expect(result.report.pages).toHaveLength(BROWSER_RENDER_PAGES.length);
      expect(result.report.pages.every((page) => page.parity.matches)).toBe(
        true
      );

      const report = JSON.parse(
        readFileSync(join(outputDir, 'parity-report.json'), 'utf8')
      ) as { pages: Array<{ parity: { matches: boolean } }> };
      expect(report.pages.every((page) => page.parity.matches)).toBe(true);
    } finally {
      rmSync(outputDir, { force: true, recursive: true });
    }
  });

  it('fails when normalized visible text differs between browsers', async () => {
    const outputDir = mkdtempSync(join(tmpdir(), 'factory-browser-report-'));

    try {
      const result = await runBrowserRenderCheck({
        outputDir,
        pages: [
          {
            expectedText: 'Factory',
            id: 'home',
            label: 'Home',
            path: '/',
          },
        ],
        runBrowserPage: async (browserName, page) => ({
          browserName,
          consoleErrors: [],
          hydrationWarnings: [],
          page,
          screenshotPath: join(outputDir, `${browserName}-${page.id}.png`),
          status: 200,
          url: `http://127.0.0.1:3333${page.path}`,
          visibleText:
            browserName === 'firefox'
              ? 'Factory Firefox-only text'
              : 'Factory Chromium-only text',
        }),
        startDevServer: async () => ({
          baseUrl: 'http://127.0.0.1:3333',
          logs: () => '',
          pid: 1234,
          stop: async () => undefined,
        }),
      });

      expect(result.success).toBe(false);
      expect(result.failures.join('\n')).toContain('visible-text parity');
    } finally {
      rmSync(outputDir, { force: true, recursive: true });
    }
  });
});
