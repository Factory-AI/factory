import { spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

export type ExternalLinkAllowlistEntry = {
  pattern: string;
  reason: string;
};

export type ExternalLinkFinding = {
  code: 'lychee' | 'tool';
  column: number;
  filePath: string;
  line: number;
  message: string;
  target: string;
};

export type ExternalLinksLycheeStats = {
  errors: number;
  excludes: number;
  successful: number;
  total: number;
  unique: number;
};

export type ExternalLinksReportStatus = 'ok' | 'broken' | 'tool-error';

export type ExternalLinksReport = {
  allowlist: ExternalLinkAllowlistEntry[];
  allowlistedLinks: ExternalLinkFinding[];
  brokenLinks: ExternalLinkFinding[];
  checkedFiles: number;
  docsRoot: string;
  generatedAt: string;
  lychee: ExternalLinksLycheeStats;
  status: ExternalLinksReportStatus;
  summary: {
    allowlisted: number;
    broken: number;
    checkedFiles: number;
  };
};

export type CheckExternalLinksOptions = {
  allowlist?: readonly ExternalLinkAllowlistEntry[];
  docsRoot?: string;
  runLychee?: RunLychee;
};

type RunLychee = (
  filePaths: string[],
  docsRoot: string,
  allowlist: readonly ExternalLinkAllowlistEntry[]
) => { findings: ExternalLinkFinding[]; stats: ExternalLinksLycheeStats };

type FormatOptions = {
  cwd?: string;
};

type LinkReference = {
  column: number;
  line: number;
  target: string;
};

type LycheeIssue = {
  span?: {
    column?: unknown;
    line?: unknown;
  };
  status?: {
    details?: unknown;
    text?: unknown;
  };
  url?: unknown;
};

type LycheeJson = Partial<ExternalLinksLycheeStats> & {
  error_map?: unknown;
  excluded_map?: unknown;
  timeout_map?: unknown;
};

type CliOptions = CheckExternalLinksOptions & {
  allowlistPath?: string;
  reportPath?: string;
};

type ParsedCliArgs = {
  allowlistPath?: string;
  inputPaths: string[];
  reportPath: string;
};

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = resolve(packageRoot, '../..');
const defaultDocsRoot = resolve(repoRoot, 'docs');

export const DEFAULT_EXTERNAL_LINK_ALLOWLIST_PATH = resolve(
  packageRoot,
  'external-links.allowlist.json'
);

export const DEFAULT_EXTERNAL_LINK_REPORT_PATH = resolve(
  repoRoot,
  'validation/external-links/report.json'
);

const emptyLycheeStats = (): ExternalLinksLycheeStats => ({
  errors: 0,
  excludes: 0,
  successful: 0,
  total: 0,
  unique: 0,
});

const toPosixPath = (filePath: string): string => filePath.split(sep).join('/');

const normalizePathForMatching = (filePath: string): string =>
  filePath.replaceAll('\\', '/');

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isWithinDirectory = (
  filePath: string,
  directoryPath: string
): boolean => {
  const relativePath = relative(directoryPath, filePath);

  return (
    relativePath === '' ||
    (!relativePath.startsWith('..') && !isAbsolute(relativePath))
  );
};

const resolveDocsRoot = (docsRoot?: string): string =>
  resolve(docsRoot ?? defaultDocsRoot);

const getTopLevelDirectory = (filePath: string, docsRoot: string): string =>
  toPosixPath(relative(docsRoot, filePath)).split('/')[0] ?? '';

const isSkippedDocsPath = (filePath: string, docsRoot: string): boolean =>
  getTopLevelDirectory(resolve(filePath), resolveDocsRoot(docsRoot)) === 'jp';

const isMdxFile = (filePath: string): boolean => filePath.endsWith('.mdx');

const walkMdxFiles = (directoryPath: string, docsRoot: string): string[] => {
  if (isSkippedDocsPath(directoryPath, docsRoot)) {
    return [];
  }

  return readdirSync(directoryPath, { withFileTypes: true })
    .sort((left, right) => left.name.localeCompare(right.name))
    .flatMap((entry) => {
      const entryPath = resolve(directoryPath, entry.name);

      if (entry.isDirectory()) {
        return walkMdxFiles(entryPath, docsRoot);
      }

      if (entry.isFile() && isMdxFile(entryPath)) {
        return [entryPath];
      }

      return [];
    });
};

export const collectExternalLinkMdxFiles = (
  inputPaths: string[] = [defaultDocsRoot],
  options: CheckExternalLinksOptions = {}
): string[] => {
  const docsRoot = resolveDocsRoot(options.docsRoot);
  const collectedPaths = new Set<string>();

  for (const inputPath of inputPaths.map((path) => resolve(path))) {
    if (!existsSync(inputPath)) {
      continue;
    }

    const inputStat = statSync(inputPath);

    if (inputStat.isDirectory()) {
      for (const filePath of walkMdxFiles(inputPath, docsRoot)) {
        if (!isSkippedDocsPath(filePath, docsRoot)) {
          collectedPaths.add(filePath);
        }
      }
      continue;
    }

    if (
      inputStat.isFile() &&
      isMdxFile(inputPath) &&
      !isSkippedDocsPath(inputPath, docsRoot)
    ) {
      collectedPaths.add(inputPath);
    }
  }

  return [...collectedPaths].sort((left, right) => left.localeCompare(right));
};

const getNumber = (value: unknown): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : 0;

const parseLycheeJson = (stdout: string): LycheeJson | undefined => {
  const jsonStart = stdout.indexOf('{');

  if (jsonStart === -1) {
    return undefined;
  }

  try {
    const parsed = JSON.parse(stdout.slice(jsonStart));

    return isRecord(parsed) ? (parsed as LycheeJson) : undefined;
  } catch {
    return undefined;
  }
};

const getFencedCodeLines = (content: string): Set<number> => {
  const fencedCodeLines = new Set<number>();
  const lines = content.split(/\r?\n/);
  let activeFence: string | undefined;

  for (const [index, line] of lines.entries()) {
    const lineNumber = index + 1;
    const fenceMatch = /^(?: {0,3})(`{3,}|~{3,})/.exec(line);

    if (activeFence !== undefined) {
      fencedCodeLines.add(lineNumber);

      if (fenceMatch?.[1]?.startsWith(activeFence)) {
        activeFence = undefined;
      }

      continue;
    }

    if (fenceMatch !== null) {
      activeFence = fenceMatch[1][0];
      fencedCodeLines.add(lineNumber);
    }
  }

  return fencedCodeLines;
};

const isExternalTarget = (target: string): boolean =>
  /^https?:\/\//i.test(target);

const collectLinkReferences = (content: string): LinkReference[] => {
  const fencedCodeLines = getFencedCodeLines(content);
  const links: LinkReference[] = [];
  const markdownLinkPattern = /!?\[[^\]\n]*\]\(([^)\s]+)(?:\s+(['"]).*?\2)?\)/g;
  const jsxUrlAttributePattern =
    /\b(?:href|src)\s*=\s*(?:"([^"]+)"|'([^']+)')/g;

  for (const [lineIndex, line] of content.split(/\r?\n/).entries()) {
    const lineNumber = lineIndex + 1;

    if (fencedCodeLines.has(lineNumber)) {
      continue;
    }

    for (const pattern of [markdownLinkPattern, jsxUrlAttributePattern]) {
      pattern.lastIndex = 0;
      let match: RegExpExecArray | null;

      while ((match = pattern.exec(line)) !== null) {
        const target = match[1] ?? match[3];

        if (target === undefined || !isExternalTarget(target)) {
          continue;
        }

        links.push({
          column: match.index + 1,
          line: lineNumber,
          target,
        });
      }
    }
  }

  return links.sort((left, right) => {
    if (left.line !== right.line) {
      return left.line - right.line;
    }

    return left.column - right.column;
  });
};

const readLine = (filePath: string, lineNumber: number): string => {
  if (!existsSync(filePath)) {
    return '';
  }

  return readFileSync(filePath, 'utf8').split(/\r?\n/)[lineNumber - 1] ?? '';
};

const getOriginalTargetAtLocation = (
  filePath: string,
  line: number,
  column: number,
  fallbackTarget: string
): string => {
  const lineContent = readLine(filePath, line);
  const linksOnLine = collectLinkReferences(lineContent);

  if (linksOnLine.length === 1) {
    return linksOnLine[0].target;
  }

  const linkAtColumn = linksOnLine.find((link) => {
    const linkEndColumn = link.column + link.target.length;

    return column >= link.column && column <= linkEndColumn;
  });

  return linkAtColumn?.target ?? fallbackTarget;
};

const getLycheeStatusMessage = (issue: LycheeIssue): string => {
  const status = isRecord(issue.status) ? issue.status : {};
  const text = status.text;
  const details = status.details;

  if (typeof text === 'string' && text !== '') {
    return text;
  }

  if (typeof details === 'string' && details !== '') {
    return details;
  }

  return 'lychee reported an external link error';
};

const lycheeIssueToFinding = (
  filePath: string,
  issue: LycheeIssue
): ExternalLinkFinding => {
  const line = getNumber(issue.span?.line) || 1;
  const column = getNumber(issue.span?.column) || 1;
  const fallbackTarget = typeof issue.url === 'string' ? issue.url : 'unknown';

  return {
    code: 'lychee',
    column,
    filePath,
    line,
    message: getLycheeStatusMessage(issue),
    target: getOriginalTargetAtLocation(filePath, line, column, fallbackTarget),
  };
};

const collectFindingsFromIssueMap = (
  issueMap: unknown
): ExternalLinkFinding[] => {
  if (!isRecord(issueMap)) {
    return [];
  }

  const findings: ExternalLinkFinding[] = [];

  for (const [filePath, issues] of Object.entries(issueMap)) {
    if (!Array.isArray(issues)) {
      continue;
    }

    for (const issue of issues) {
      if (!isRecord(issue)) {
        continue;
      }

      findings.push(lycheeIssueToFinding(filePath, issue as LycheeIssue));
    }
  }

  return findings;
};

const collectLycheeFindings = (
  lycheeJson: LycheeJson
): ExternalLinkFinding[] => [
  ...collectFindingsFromIssueMap(lycheeJson.error_map),
  ...collectFindingsFromIssueMap(lycheeJson.timeout_map),
];

const collectAllowlistedExcludedFindings = (
  lycheeJson: LycheeJson,
  allowlist: readonly ExternalLinkAllowlistEntry[]
): ExternalLinkFinding[] =>
  collectFindingsFromIssueMap(lycheeJson.excluded_map).filter((finding) =>
    isExternalLinkAllowlisted(finding.target, allowlist)
  );

const sortFindings = (
  findings: readonly ExternalLinkFinding[]
): ExternalLinkFinding[] =>
  [...findings].sort((left, right) => {
    const fileComparison = left.filePath.localeCompare(right.filePath);

    if (fileComparison !== 0) {
      return fileComparison;
    }

    if (left.line !== right.line) {
      return left.line - right.line;
    }

    return left.column - right.column;
  });

const safeRegExp = (pattern: string): RegExp | undefined => {
  try {
    return new RegExp(pattern);
  } catch {
    return undefined;
  }
};

export const isExternalLinkAllowlisted = (
  target: string,
  allowlist: readonly ExternalLinkAllowlistEntry[]
): boolean =>
  allowlist.some((entry) => {
    const regexp = safeRegExp(entry.pattern);

    return regexp?.test(target) ?? false;
  });

const validateAllowlistEntry = (entry: unknown): ExternalLinkAllowlistEntry => {
  if (!isRecord(entry)) {
    throw new Error('allowlist entries must be objects');
  }

  const { pattern, reason } = entry;

  if (typeof pattern !== 'string' || pattern === '') {
    throw new Error('allowlist entry pattern must be a non-empty string');
  }

  if (typeof reason !== 'string' || reason === '') {
    throw new Error('allowlist entry reason must be a non-empty string');
  }

  if (safeRegExp(pattern) === undefined) {
    throw new Error(`allowlist entry pattern is not valid RegExp: ${pattern}`);
  }

  return { pattern, reason };
};

export const loadExternalLinkAllowlist = (
  allowlistPath: string = DEFAULT_EXTERNAL_LINK_ALLOWLIST_PATH
): ExternalLinkAllowlistEntry[] => {
  const parsed = JSON.parse(readFileSync(allowlistPath, 'utf8')) as unknown;

  if (!Array.isArray(parsed)) {
    throw new Error('external link allowlist must be a JSON array');
  }

  return parsed.map(validateAllowlistEntry);
};

export const DEFAULT_EXTERNAL_LINK_ALLOWLIST = loadExternalLinkAllowlist();

const buildLycheeArgs = (
  docsRoot: string,
  filesFromPath: string,
  allowlist: readonly ExternalLinkAllowlistEntry[]
): string[] => [
  '--no-progress',
  '--mode',
  'plain',
  '--root-dir',
  docsRoot,
  '--fallback-extensions',
  'mdx',
  '--index-files',
  'index.mdx',
  '--exclude',
  '^file://',
  '--exclude',
  '%7B.*%7D',
  '--timeout',
  '10',
  '--max-retries',
  '1',
  '--user-agent',
  'factory-docs-external-link-checker/1.0',
  ...allowlist.flatMap((entry) => ['--exclude', entry.pattern]),
  '--format',
  'json',
  '--files-from',
  filesFromPath,
];

const runLychee: RunLychee = (filePaths, docsRoot, allowlist) => {
  if (filePaths.length === 0) {
    return { findings: [], stats: emptyLycheeStats() };
  }

  const tempDirectory = mkdtempSync(join(tmpdir(), 'factory-external-lychee-'));
  const filesFromPath = join(tempDirectory, 'inputs.txt');

  try {
    writeFileSync(filesFromPath, `${filePaths.join('\n')}\n`, 'utf8');

    const lycheeResult = spawnSync(
      'lychee',
      buildLycheeArgs(docsRoot, filesFromPath, allowlist),
      {
        encoding: 'utf8',
      }
    );

    if (lycheeResult.error !== undefined) {
      return {
        findings: [
          {
            code: 'tool',
            column: 1,
            filePath: repoRoot,
            line: 1,
            message: `could not run lychee: ${lycheeResult.error.message}`,
            target: 'lychee',
          },
        ],
        stats: emptyLycheeStats(),
      };
    }

    const lycheeJson = parseLycheeJson(lycheeResult.stdout);

    if (lycheeJson === undefined) {
      const output = `${lycheeResult.stderr}\n${lycheeResult.stdout}`.trim();

      return {
        findings: [
          {
            code: 'tool',
            column: 1,
            filePath: repoRoot,
            line: 1,
            message:
              output === ''
                ? 'lychee did not produce parseable JSON output'
                : `lychee did not produce parseable JSON output: ${output}`,
            target: 'lychee',
          },
        ],
        stats: emptyLycheeStats(),
      };
    }

    return {
      findings: [
        ...collectLycheeFindings(lycheeJson),
        ...collectAllowlistedExcludedFindings(lycheeJson, allowlist),
      ],
      stats: {
        errors: getNumber(lycheeJson.errors),
        excludes: getNumber(lycheeJson.excludes),
        successful: getNumber(lycheeJson.successful),
        total: getNumber(lycheeJson.total),
        unique: getNumber(lycheeJson.unique),
      },
    };
  } finally {
    rmSync(tempDirectory, { force: true, recursive: true });
  }
};

const createReport = (
  checkedFiles: number,
  docsRoot: string,
  findings: ExternalLinkFinding[],
  stats: ExternalLinksLycheeStats,
  allowlist: readonly ExternalLinkAllowlistEntry[]
): ExternalLinksReport => {
  const allowlistedLinks = sortFindings(
    findings.filter((finding) =>
      isExternalLinkAllowlisted(finding.target, allowlist)
    )
  );
  const brokenLinks = sortFindings(
    findings.filter(
      (finding) => !isExternalLinkAllowlisted(finding.target, allowlist)
    )
  );

  return {
    allowlist: [...allowlist],
    allowlistedLinks,
    brokenLinks,
    checkedFiles,
    docsRoot,
    generatedAt: new Date().toISOString(),
    lychee: stats,
    status:
      brokenLinks.length === 0
        ? 'ok'
        : brokenLinks.some((finding) => finding.code === 'tool')
          ? 'tool-error'
          : 'broken',
    summary: {
      allowlisted: allowlistedLinks.length,
      broken: brokenLinks.length,
      checkedFiles,
    },
  };
};

export const checkExternalLinks = (
  inputPaths: string[] = [defaultDocsRoot],
  options: CheckExternalLinksOptions = {}
): ExternalLinksReport => {
  const docsRoot = resolveDocsRoot(options.docsRoot);
  const allowlist = options.allowlist ?? DEFAULT_EXTERNAL_LINK_ALLOWLIST;
  const mdxFiles = collectExternalLinkMdxFiles(inputPaths, { docsRoot });
  const lycheeResult = (options.runLychee ?? runLychee)(
    mdxFiles,
    docsRoot,
    allowlist
  );

  return createReport(
    mdxFiles.length,
    docsRoot,
    lycheeResult.findings,
    lycheeResult.stats,
    allowlist
  );
};

const formatFilePath = (
  filePath: string,
  cwd: string = process.cwd()
): string => {
  const relativePath = relative(cwd, filePath);

  if (relativePath === '' || relativePath.startsWith('..')) {
    return normalizePathForMatching(filePath);
  }

  return normalizePathForMatching(relativePath);
};

export const formatExternalLinkFinding = (
  finding: ExternalLinkFinding,
  options: FormatOptions = {}
): string =>
  `${formatFilePath(finding.filePath, options.cwd)}:${finding.line}:${
    finding.column
  } warning external-links.${finding.code} ${finding.target} ${
    finding.message
  }`;

export const writeExternalLinksReport = (
  report: ExternalLinksReport,
  reportPath: string = DEFAULT_EXTERNAL_LINK_REPORT_PATH
): void => {
  mkdirSync(dirname(reportPath), { recursive: true });
  writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
};

const resolveCliPath = (inputPath: string): string => {
  if (isAbsolute(inputPath)) {
    return inputPath;
  }

  const cwdPath = resolve(process.cwd(), inputPath);

  if (existsSync(cwdPath)) {
    return cwdPath;
  }

  return resolve(repoRoot, inputPath);
};

const resolveOutputPath = (outputPath: string): string =>
  isAbsolute(outputPath) ? outputPath : resolve(process.cwd(), outputPath);

const parseCliArgs = (
  args: string[],
  options: CliOptions = {}
): ParsedCliArgs => {
  const inputArgs: string[] = [];
  let reportPath = options.reportPath ?? DEFAULT_EXTERNAL_LINK_REPORT_PATH;
  let allowlistPath = options.allowlistPath;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === '--') {
      continue;
    }

    if (arg === '--report') {
      index += 1;
      reportPath = args[index] ?? reportPath;
      continue;
    }

    if (arg.startsWith('--report=')) {
      reportPath = arg.slice('--report='.length);
      continue;
    }

    if (arg === '--allowlist') {
      index += 1;
      allowlistPath = args[index] ?? allowlistPath;
      continue;
    }

    if (arg.startsWith('--allowlist=')) {
      allowlistPath = arg.slice('--allowlist='.length);
      continue;
    }

    inputArgs.push(arg);
  }

  return {
    allowlistPath:
      allowlistPath === undefined
        ? undefined
        : resolveOutputPath(allowlistPath),
    inputPaths:
      inputArgs.length > 0
        ? inputArgs.map(resolveCliPath)
        : [options.docsRoot ?? defaultDocsRoot],
    reportPath: resolveOutputPath(reportPath),
  };
};

const reportForToolFindings = (
  findings: ExternalLinkFinding[],
  docsRoot: string,
  allowlist: readonly ExternalLinkAllowlistEntry[]
): ExternalLinksReport =>
  createReport(0, docsRoot, findings, emptyLycheeStats(), allowlist);

export const runExternalLinksCli = (
  args: string[] = process.argv.slice(2),
  options: CliOptions = {}
): number => {
  const parsedArgs = parseCliArgs(args, options);
  let report: ExternalLinksReport;

  try {
    const docsRoot = resolveDocsRoot(options.docsRoot);
    const allowlist =
      options.allowlist ??
      loadExternalLinkAllowlist(
        parsedArgs.allowlistPath ?? DEFAULT_EXTERNAL_LINK_ALLOWLIST_PATH
      );
    const missingInputPaths = parsedArgs.inputPaths.filter(
      (inputPath) => !existsSync(inputPath)
    );

    if (missingInputPaths.length > 0) {
      report = reportForToolFindings(
        missingInputPaths.map((inputPath) => ({
          code: 'tool',
          column: 1,
          filePath: inputPath,
          line: 1,
          message: 'input path does not exist',
          target: inputPath,
        })),
        docsRoot,
        allowlist
      );
    } else {
      report = checkExternalLinks(parsedArgs.inputPaths, {
        allowlist,
        docsRoot,
        runLychee: options.runLychee,
      });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    report = reportForToolFindings(
      [
        {
          code: 'tool',
          column: 1,
          filePath: repoRoot,
          line: 1,
          message,
          target: 'check-external-links',
        },
      ],
      resolveDocsRoot(options.docsRoot),
      options.allowlist ?? []
    );
  }

  writeExternalLinksReport(report, parsedArgs.reportPath);
  console.log(
    `External link report written to ${formatFilePath(
      parsedArgs.reportPath,
      repoRoot
    )}.`
  );
  console.log(
    `External link check completed as informational: ${report.checkedFiles} MDX file(s), ${report.summary.broken} broken link(s), ${report.summary.allowlisted} allowlisted link(s).`
  );

  return 0;
};

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  process.exitCode = runExternalLinksCli();
}
