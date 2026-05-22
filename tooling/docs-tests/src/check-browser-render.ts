import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import { withMintlifyCliPath } from './mintlify-cli-env';
import { prepareMintlifyDocsWorkspace } from './mintlify-docs-workspace';

export const BROWSER_RENDER_BROWSERS = ['chromium', 'firefox'] as const;

export type BrowserRenderBrowser = (typeof BROWSER_RENDER_BROWSERS)[number];

export type BrowserRenderPage = {
  expectedText: string;
  id: string;
  label: string;
  path: string;
};

export const BROWSER_RENDER_PAGES = [
  {
    expectedText: 'Factory',
    id: 'home',
    label: 'Home',
    path: '/',
  },
  {
    expectedText: 'Quickstart',
    id: 'quickstart',
    label: 'Quickstart',
    path: '/cli/getting-started/quickstart',
  },
  {
    expectedText: 'Get started in 30 seconds',
    id: 'code-group',
    label: '<CodeGroup> page',
    path: '/cli/getting-started/overview',
  },
  {
    expectedText: 'Pricing Structure',
    id: 'vars-migrated',
    label: 'Vars-migrated page',
    path: '/pricing',
  },
  {
    expectedText: 'Enterprise foundations',
    id: 'enterprise',
    label: 'Enterprise',
    path: '/enterprise',
  },
] as const satisfies readonly BrowserRenderPage[];

export type ConsoleEntry = {
  text: string;
  type: string;
};

export type ConsoleEntryClassification = 'console-error' | 'hydration-warning';

export type BrowserPageResult = {
  browserName: BrowserRenderBrowser;
  consoleErrors: ConsoleEntry[];
  hydrationWarnings: ConsoleEntry[];
  page: BrowserRenderPage;
  screenshotPath: string;
  status: number;
  url: string;
  visibleText: string;
};

export type DevServerHandle = {
  baseUrl: string;
  logs: () => string;
  pid: number;
  stop: () => Promise<void>;
};

export type BrowserPageRunner = (
  browserName: BrowserRenderBrowser,
  page: BrowserRenderPage,
  context: {
    baseUrl: string;
    outputDir: string;
  }
) => Promise<BrowserPageResult>;

export type DevServerStarter = (
  docsRoot: string,
  options: {
    port: number;
  }
) => Promise<DevServerHandle>;

export type BrowserRenderReportPage = {
  browsers: Record<
    BrowserRenderBrowser,
    Omit<BrowserPageResult, 'page' | 'visibleText'> & {
      expectedTextPresent: boolean;
      normalizedTextHash: string;
      normalizedTextLength: number;
    }
  >;
  expectedText: string;
  id: string;
  label: string;
  parity: {
    chromiumHash: string;
    firefoxHash: string;
    matches: boolean;
    message?: string;
  };
  path: string;
};

export type BrowserRenderReport = {
  baseUrl: string;
  failures: string[];
  generatedAt: string;
  pages: BrowserRenderReportPage[];
  processCleanup?: {
    port3333Listeners: number[];
    remainingMintlifyPids: number[];
  };
  success: boolean;
};

export type BrowserRenderCheckResult = {
  failures: string[];
  report: BrowserRenderReport;
  reportPath: string;
  success: boolean;
};

export type BrowserRenderCheckOptions = {
  docsRoot?: string;
  outputDir?: string;
  pages?: readonly BrowserRenderPage[];
  port?: number;
  runBrowserPage?: BrowserPageRunner;
  startDevServer?: DevServerStarter;
};

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = resolve(packageRoot, '../..');
const defaultDocsRoot = resolve(repoRoot, 'docs');
const defaultOutputDir = resolve(repoRoot, 'validation/cross-browser');

const normalizePathForMatching = (filePath: string): string =>
  filePath.replaceAll('\\', '/');

const sleep = (milliseconds: number): Promise<void> =>
  new Promise((resolvePromise) => {
    setTimeout(resolvePromise, milliseconds);
  });

export const normalizeVisibleText = (text: string): string =>
  text.replace(/\s+/g, ' ').trim();

const normalizedHash = (text: string): string =>
  createHash('sha256').update(normalizeVisibleText(text)).digest('hex');

const isHydrationWarningText = (text: string): boolean =>
  /hydration|did not match|server rendered|server-rendered|react-dom|hydrate/i.test(
    text
  );

export const classifyConsoleEntry = (
  entry: ConsoleEntry
): ConsoleEntryClassification | undefined => {
  if (entry.type === 'error') {
    return 'console-error';
  }

  if (isHydrationWarningText(entry.text)) {
    return 'hydration-warning';
  }

  return undefined;
};

const formatFilePath = (
  filePath: string,
  cwd: string = process.cwd()
): string => {
  const relativePath = relative(cwd, filePath);

  if (relativePath === '' || relativePath.startsWith('..')) {
    return normalizePathForMatching(filePath);
  }

  return normalizePathForMatching(relativePath.split(sep).join('/'));
};

const getPortListenerPids = (port: number): number[] => {
  const result = spawnSync('lsof', [`-tiTCP:${port}`, '-sTCP:LISTEN'], {
    encoding: 'utf8',
  });

  return result.stdout
    .split(/\s+/)
    .map((value) => Number.parseInt(value, 10))
    .filter((value) => Number.isInteger(value) && value > 0);
};

const getMintlifyPids = (): number[] => {
  const result = spawnSync('pgrep', ['-f', 'mintlify'], {
    encoding: 'utf8',
  });

  return result.stdout
    .split(/\s+/)
    .map((value) => Number.parseInt(value, 10))
    .filter((value) => Number.isInteger(value) && value > 0);
};

const isPidRunning = (pid: number): boolean => {
  try {
    process.kill(pid, 0);

    return true;
  } catch {
    return false;
  }
};

const killPid = (pid: number, signal: NodeJS.Signals): void => {
  try {
    process.kill(pid, signal);
  } catch {
    // Already exited.
  }
};

const killProcessGroup = (pid: number, signal: NodeJS.Signals): void => {
  try {
    process.kill(-pid, signal);
  } catch {
    killPid(pid, signal);
  }
};

const waitForPortFree = async (
  port: number,
  timeoutMilliseconds = 10_000
): Promise<void> => {
  const deadline = Date.now() + timeoutMilliseconds;

  while (Date.now() < deadline) {
    if (getPortListenerPids(port).length === 0) {
      return;
    }

    await sleep(250);
  }
};

const fetchOk = async (url: string): Promise<boolean> => {
  try {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(2_000),
    });

    return response.ok;
  } catch {
    return false;
  }
};

const waitForDevServer = async (
  baseUrl: string,
  childPid: number,
  logs: () => string,
  timeoutMilliseconds = 120_000
): Promise<void> => {
  const deadline = Date.now() + timeoutMilliseconds;

  while (Date.now() < deadline) {
    if (!isPidRunning(childPid)) {
      throw new Error(`mintlify dev exited before readiness:\n${logs()}`);
    }

    if ((await fetchOk(baseUrl)) || (await fetchOk(`${baseUrl}/welcome`))) {
      return;
    }

    await sleep(1_000);
  }

  throw new Error(`mintlify dev did not become ready:\n${logs()}`);
};

export const startMintlifyDevServer: DevServerStarter = async (
  docsRoot,
  options
) => {
  const port = options.port;
  const existingListeners = getPortListenerPids(port);

  if (existingListeners.length > 0) {
    throw new Error(
      `port ${port} is already in use by PID(s): ${existingListeners.join(
        ', '
      )}`
    );
  }

  const stdoutChunks: string[] = [];
  const stderrChunks: string[] = [];
  const child = spawn(
    'mintlify',
    ['dev', '--port', String(port), '--no-open'],
    {
      cwd: docsRoot,
      detached: true,
      env: withMintlifyCliPath(),
      stdio: ['ignore', 'pipe', 'pipe'],
    }
  );

  child.stdout?.on('data', (chunk: Buffer) => {
    stdoutChunks.push(chunk.toString('utf8'));
  });
  child.stderr?.on('data', (chunk: Buffer) => {
    stderrChunks.push(chunk.toString('utf8'));
  });

  if (child.pid === undefined) {
    throw new Error('mintlify dev did not expose a PID');
  }

  const logs = () => [...stdoutChunks, ...stderrChunks].join('');
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    await waitForDevServer(baseUrl, child.pid, logs);
  } catch (error) {
    killProcessGroup(child.pid, 'SIGTERM');
    await sleep(1_000);
    killProcessGroup(child.pid, 'SIGKILL');
    await waitForPortFree(port);
    throw error;
  }

  const listenerPids = getPortListenerPids(port);

  return {
    baseUrl,
    logs,
    pid: child.pid,
    stop: async () => {
      killProcessGroup(child.pid!, 'SIGTERM');
      for (const listenerPid of listenerPids) {
        killPid(listenerPid, 'SIGTERM');
      }

      await sleep(2_000);

      if (isPidRunning(child.pid!)) {
        killProcessGroup(child.pid!, 'SIGKILL');
      }

      for (const listenerPid of listenerPids) {
        if (isPidRunning(listenerPid)) {
          killPid(listenerPid, 'SIGKILL');
        }
      }

      await waitForPortFree(port);
    },
  };
};

const resolveUrl = (baseUrl: string, pagePath: string): string =>
  new URL(pagePath, baseUrl).toString();

const pushConsoleEntries = (
  entries: ConsoleEntry[],
  consoleErrors: ConsoleEntry[],
  hydrationWarnings: ConsoleEntry[]
): void => {
  for (const entry of entries) {
    if (entry.type === 'error') {
      consoleErrors.push(entry);
    }

    if (isHydrationWarningText(entry.text)) {
      hydrationWarnings.push(entry);
    }
  }
};

export const runPlaywrightBrowserPage: BrowserPageRunner = async (
  browserName,
  page,
  context
) => {
  const playwright = await import('@playwright/test');
  const browserType = playwright[browserName];
  const browser = await browserType.launch({ headless: true });
  const browserPage = await browser.newPage({
    viewport: { height: 900, width: 1440 },
  });
  const consoleEntries: ConsoleEntry[] = [];

  browserPage.on('console', (message) => {
    consoleEntries.push({
      text: message.text(),
      type: message.type(),
    });
  });
  browserPage.on('pageerror', (error) => {
    consoleEntries.push({
      text: error.message,
      type: 'error',
    });
  });

  try {
    const url = resolveUrl(context.baseUrl, page.path);
    const response = await browserPage.goto(url, {
      timeout: 45_000,
      waitUntil: 'domcontentloaded',
    });

    await browserPage
      .waitForLoadState('networkidle', { timeout: 10_000 })
      .catch(() => undefined);
    await browserPage.waitForTimeout(1_000);

    const visibleText = await browserPage.locator('body').innerText({
      timeout: 10_000,
    });
    const screenshotPath = join(
      context.outputDir,
      `${page.id}-${browserName}.png`
    );
    await browserPage.screenshot({
      fullPage: true,
      path: screenshotPath,
    });

    const consoleErrors: ConsoleEntry[] = [];
    const hydrationWarnings: ConsoleEntry[] = [];
    pushConsoleEntries(consoleEntries, consoleErrors, hydrationWarnings);

    return {
      browserName,
      consoleErrors,
      hydrationWarnings,
      page,
      screenshotPath,
      status: response?.status() ?? 0,
      url,
      visibleText,
    };
  } finally {
    await browser.close();
  }
};

const createBrowserReportPage = (
  page: BrowserRenderPage,
  chromium: BrowserPageResult,
  firefox: BrowserPageResult
): BrowserRenderReportPage => {
  const chromiumNormalized = normalizeVisibleText(chromium.visibleText);
  const firefoxNormalized = normalizeVisibleText(firefox.visibleText);
  const expectedText = normalizeVisibleText(page.expectedText).toLowerCase();
  const chromiumHash = normalizedHash(chromium.visibleText);
  const firefoxHash = normalizedHash(firefox.visibleText);
  const matches = chromiumNormalized === firefoxNormalized;

  return {
    browsers: {
      chromium: {
        browserName: chromium.browserName,
        consoleErrors: chromium.consoleErrors,
        expectedTextPresent: chromiumNormalized
          .toLowerCase()
          .includes(expectedText),
        hydrationWarnings: chromium.hydrationWarnings,
        normalizedTextHash: chromiumHash,
        normalizedTextLength: chromiumNormalized.length,
        screenshotPath: chromium.screenshotPath,
        status: chromium.status,
        url: chromium.url,
      },
      firefox: {
        browserName: firefox.browserName,
        consoleErrors: firefox.consoleErrors,
        expectedTextPresent: firefoxNormalized
          .toLowerCase()
          .includes(expectedText),
        hydrationWarnings: firefox.hydrationWarnings,
        normalizedTextHash: firefoxHash,
        normalizedTextLength: firefoxNormalized.length,
        screenshotPath: firefox.screenshotPath,
        status: firefox.status,
        url: firefox.url,
      },
    },
    expectedText: page.expectedText,
    id: page.id,
    label: page.label,
    parity: {
      chromiumHash,
      firefoxHash,
      matches,
      message: matches
        ? undefined
        : `visible-text parity mismatch: Chromium length ${chromiumNormalized.length}, Firefox length ${firefoxNormalized.length}`,
    },
    path: page.path,
  };
};

const collectPageFailures = (page: BrowserRenderReportPage): string[] => {
  const failures: string[] = [];

  for (const browserName of BROWSER_RENDER_BROWSERS) {
    const browserResult = page.browsers[browserName];

    if (browserResult.status !== 200) {
      failures.push(
        `${browserName} ${page.path} returned HTTP ${browserResult.status}`
      );
    }

    if (browserResult.normalizedTextLength === 0) {
      failures.push(`${browserName} ${page.path} rendered no visible content`);
    }

    if (!browserResult.expectedTextPresent) {
      failures.push(
        `${browserName} ${page.path} did not render expected visible text "${page.expectedText}"`
      );
    }

    if (browserResult.consoleErrors.length > 0) {
      failures.push(
        `${browserName} ${page.path} emitted ${browserResult.consoleErrors.length} console error(s)`
      );
    }

    if (browserResult.hydrationWarnings.length > 0) {
      failures.push(
        `${browserName} ${page.path} emitted ${browserResult.hydrationWarnings.length} hydration warning(s)`
      );
    }
  }

  if (
    !page.browsers.chromium.normalizedTextHash ||
    !page.browsers.firefox.normalizedTextHash
  ) {
    failures.push(`${page.path} did not produce visible-text hashes`);
  }

  if (
    !page.browsers.chromium.normalizedTextLength ||
    !page.browsers.firefox.normalizedTextLength
  ) {
    failures.push(`${page.path} did not produce visible text in both browsers`);
  }

  if (!page.parity.matches) {
    failures.push(`${page.path} ${page.parity.message}`);
  }

  return failures;
};

const writeReport = (reportPath: string, report: BrowserRenderReport): void => {
  mkdirSync(dirname(reportPath), { recursive: true });
  writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
};

export const runBrowserRenderCheck = async (
  options: BrowserRenderCheckOptions = {}
): Promise<BrowserRenderCheckResult> => {
  const docsRoot = resolve(options.docsRoot ?? defaultDocsRoot);
  const outputDir = resolve(options.outputDir ?? defaultOutputDir);
  const pages = [...(options.pages ?? BROWSER_RENDER_PAGES)];
  const port = options.port ?? 3333;
  const runBrowserPage = options.runBrowserPage ?? runPlaywrightBrowserPage;
  const startDevServer = options.startDevServer ?? startMintlifyDevServer;
  const shouldVerifyProcessCleanup =
    options.startDevServer === undefined &&
    options.runBrowserPage === undefined;
  const reportPath = join(outputDir, 'parity-report.json');
  const failures: string[] = [];
  const reportPages: BrowserRenderReportPage[] = [];
  const workspace = prepareMintlifyDocsWorkspace(docsRoot);
  let server: DevServerHandle | undefined;
  let baseUrl = `http://127.0.0.1:${port}`;

  mkdirSync(outputDir, { recursive: true });

  try {
    server = await startDevServer(workspace.docsRoot, { port });
    baseUrl = server.baseUrl;

    for (const page of pages) {
      const chromium = await runBrowserPage('chromium', page, {
        baseUrl,
        outputDir,
      });
      const firefox = await runBrowserPage('firefox', page, {
        baseUrl,
        outputDir,
      });
      const reportPage = createBrowserReportPage(page, chromium, firefox);

      reportPages.push(reportPage);
      failures.push(...collectPageFailures(reportPage));
    }
  } catch (error) {
    failures.push(error instanceof Error ? error.message : String(error));
  } finally {
    if (server !== undefined) {
      await server.stop().catch((error: unknown) => {
        failures.push(
          error instanceof Error
            ? `failed to stop mintlify dev: ${error.message}`
            : `failed to stop mintlify dev: ${String(error)}`
        );
      });
    }

    workspace.cleanup();
  }

  const processCleanup = shouldVerifyProcessCleanup
    ? {
        port3333Listeners: getPortListenerPids(port),
        remainingMintlifyPids: getMintlifyPids(),
      }
    : undefined;

  if (processCleanup !== undefined) {
    if (processCleanup.port3333Listeners.length > 0) {
      failures.push(
        `port ${port} still has listener PID(s): ${processCleanup.port3333Listeners.join(
          ', '
        )}`
      );
    }

    if (processCleanup.remainingMintlifyPids.length > 0) {
      failures.push(
        `mintlify process(es) still running: ${processCleanup.remainingMintlifyPids.join(
          ', '
        )}`
      );
    }
  }

  const report: BrowserRenderReport = {
    baseUrl,
    failures,
    generatedAt: new Date().toISOString(),
    pages: reportPages,
    processCleanup,
    success: failures.length === 0,
  };

  writeReport(reportPath, report);

  return {
    failures,
    report,
    reportPath,
    success: report.success,
  };
};

const resolveCliInputPath = (inputPath: string): string => {
  if (isAbsolute(inputPath)) {
    return inputPath;
  }

  const cwdPath = resolve(process.cwd(), inputPath);

  if (existsSync(cwdPath)) {
    return cwdPath;
  }

  return resolve(repoRoot, inputPath);
};

const parseCliArgs = (
  args: string[]
): {
  docsRoot: string;
  outputDir: string;
} => {
  let docsRoot = defaultDocsRoot;
  let outputDir = defaultOutputDir;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === '--') {
      continue;
    }

    if (arg === '--output') {
      index += 1;
      outputDir = resolve(args[index] ?? outputDir);
      continue;
    }

    if (arg.startsWith('--output=')) {
      outputDir = resolve(arg.slice('--output='.length));
      continue;
    }

    docsRoot = resolveCliInputPath(arg);
  }

  return { docsRoot, outputDir };
};

export const runBrowserRenderCli = async (
  args: string[] = process.argv.slice(2)
): Promise<number> => {
  const parsedArgs = parseCliArgs(args);
  const result = await runBrowserRenderCheck(parsedArgs);

  if (result.success) {
    console.log(
      `Browser render check passed: ${BROWSER_RENDER_PAGES.length} page(s) in Chromium and Firefox. Report: ${formatFilePath(
        result.reportPath,
        repoRoot
      )}`
    );

    return 0;
  }

  console.error(
    `Browser render check failed with ${result.failures.length} failure(s). Report: ${formatFilePath(
      result.reportPath,
      repoRoot
    )}`
  );
  for (const failure of result.failures) {
    console.error(`- ${failure}`);
  }

  return 1;
};

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  runBrowserRenderCli()
    .then((exitCode) => {
      process.exitCode = exitCode;
    })
    .catch((error: unknown) => {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    });
}
