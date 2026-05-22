import {
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import {
  dirname,
  extname,
  isAbsolute,
  join,
  relative,
  resolve,
  sep,
} from 'node:path';
import { fileURLToPath } from 'node:url';

export type InternalLinkFinding =
  | {
      code: 'lychee';
      column: number;
      filePath: string;
      line: number;
      message: string;
      target: string;
    }
  | {
      code: 'anchor';
      column: number;
      filePath: string;
      line: number;
      message: string;
      target: string;
      targetFilePath: string;
    }
  | {
      code: 'tool';
      column: number;
      filePath: string;
      line: number;
      message: string;
      target: string;
    };

export type LycheeStats = {
  errors: number;
  excludes: number;
  successful: number;
  total: number;
  unique: number;
};

export type InternalLinksCheckResult = {
  checkedFiles: number;
  findings: InternalLinkFinding[];
  lychee: LycheeStats;
};

export type CheckInternalLinksOptions = {
  docsRoot?: string;
};

type FormatOptions = {
  cwd?: string;
};

type LinkReference = {
  column: number;
  line: number;
  target: string;
};

type ParsedAnchorTarget = {
  fragment: string;
  targetFilePath: string;
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

type LycheeJson = Partial<LycheeStats> & {
  error_map?: unknown;
};

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = resolve(packageRoot, '../..');
const defaultDocsRoot = resolve(repoRoot, 'docs');

const emptyLycheeStats = (): LycheeStats => ({
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

export const collectInternalLinkMdxFiles = (
  inputPaths: string[] = [defaultDocsRoot],
  options: CheckInternalLinksOptions = {}
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

const collectLinkReferences = (content: string): LinkReference[] => {
  const fencedCodeLines = getFencedCodeLines(content);
  const links: LinkReference[] = [];
  const markdownLinkPattern = /!?\[[^\]\n]*\]\(([^)\s]+)(?:\s+(['"]).*?\2)?\)/g;
  const hrefPattern = /\bhref\s*=\s*(?:"([^"]+)"|'([^']+)')/g;

  for (const [lineIndex, line] of content.split(/\r?\n/).entries()) {
    const lineNumber = lineIndex + 1;

    if (fencedCodeLines.has(lineNumber)) {
      continue;
    }

    for (const pattern of [markdownLinkPattern, hrefPattern]) {
      pattern.lastIndex = 0;
      let match: RegExpExecArray | null;

      while ((match = pattern.exec(line)) !== null) {
        if (pattern === markdownLinkPattern && match[0].startsWith('!')) {
          continue;
        }

        const target = match[1] ?? match[3];

        if (target === undefined) {
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

const decodeUrlComponent = (value: string): string => {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
};

const stripQuery = (value: string): string => value.split('?')[0];

const isExternalOrDynamicTarget = (target: string): boolean =>
  /^(?:https?:|mailto:|tel:|javascript:)/i.test(target) ||
  target.includes('{') ||
  target.includes('}');

const resolveMdxTargetPath = (
  sourceFilePath: string,
  rawPathPart: string,
  docsRoot: string
): string | undefined => {
  const pathPart = decodeUrlComponent(stripQuery(rawPathPart));
  const targetBasePath =
    pathPart === ''
      ? sourceFilePath
      : pathPart.startsWith('/')
        ? resolve(docsRoot, `.${pathPart}`)
        : resolve(dirname(sourceFilePath), pathPart);

  if (!isWithinDirectory(targetBasePath, docsRoot)) {
    return undefined;
  }

  const candidates =
    extname(targetBasePath) === '.mdx'
      ? [targetBasePath]
      : [`${targetBasePath}.mdx`, resolve(targetBasePath, 'index.mdx')];

  return candidates.find(
    (candidate) =>
      existsSync(candidate) &&
      statSync(candidate).isFile() &&
      isWithinDirectory(candidate, docsRoot) &&
      !isSkippedDocsPath(candidate, docsRoot)
  );
};

const parseAnchorTarget = (
  sourceFilePath: string,
  target: string,
  docsRoot: string
): ParsedAnchorTarget | undefined => {
  const trimmedTarget = target.trim();

  if (trimmedTarget === '' || isExternalOrDynamicTarget(trimmedTarget)) {
    return undefined;
  }

  const hashIndex = trimmedTarget.indexOf('#');

  if (hashIndex === -1) {
    return undefined;
  }

  const rawFragment = trimmedTarget.slice(hashIndex + 1);

  if (rawFragment === '' || rawFragment.startsWith(':~:text=')) {
    return undefined;
  }

  const targetFilePath = resolveMdxTargetPath(
    sourceFilePath,
    trimmedTarget.slice(0, hashIndex),
    docsRoot
  );

  if (targetFilePath === undefined) {
    return undefined;
  }

  return {
    fragment: decodeUrlComponent(rawFragment),
    targetFilePath,
  };
};

const stripMdxFromHeading = (value: string): string =>
  value
    .replace(/\{#[A-Za-z0-9_-]+\}\s*$/u, '')
    .replace(/<[^>]+>/g, '')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\{[^}]+\}/g, '')
    .replace(/&amp;/g, 'and');

const slugifyHeading = (value: string): string =>
  stripMdxFromHeading(value)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');

const collectAnchorIds = (filePath: string): Set<string> => {
  const content = readFileSync(filePath, 'utf8');
  const anchors = new Set<string>();
  const usedHeadingSlugs = new Map<string, number>();
  const explicitIdPattern = /\bid\s*=\s*(?:"([^"]+)"|'([^']+)')/g;
  let explicitIdMatch: RegExpExecArray | null;

  while ((explicitIdMatch = explicitIdPattern.exec(content)) !== null) {
    const explicitId = explicitIdMatch[1] ?? explicitIdMatch[2];

    if (explicitId !== undefined && explicitId !== '') {
      anchors.add(explicitId);
    }
  }

  for (const line of content.split(/\r?\n/)) {
    const headingMatch = /^(#{1,6})\s+(.+?)\s*#*\s*$/.exec(line);

    if (headingMatch === null) {
      continue;
    }

    const explicitHeadingId = /\{#([A-Za-z0-9_-]+)\}\s*$/u.exec(
      headingMatch[2]
    )?.[1];

    if (explicitHeadingId !== undefined) {
      anchors.add(explicitHeadingId);
      continue;
    }

    const baseSlug = slugifyHeading(headingMatch[2]);

    if (baseSlug === '') {
      continue;
    }

    const seenCount = usedHeadingSlugs.get(baseSlug) ?? 0;
    const slug = seenCount === 0 ? baseSlug : `${baseSlug}-${seenCount}`;
    usedHeadingSlugs.set(baseSlug, seenCount + 1);
    anchors.add(slug);
  }

  return anchors;
};

const checkAnchorLinks = (
  filePaths: string[],
  docsRoot: string
): InternalLinkFinding[] => {
  const findings: InternalLinkFinding[] = [];
  const anchorCache = new Map<string, Set<string>>();

  const getAnchors = (filePath: string): Set<string> => {
    const cachedAnchors = anchorCache.get(filePath);

    if (cachedAnchors !== undefined) {
      return cachedAnchors;
    }

    const anchors = collectAnchorIds(filePath);
    anchorCache.set(filePath, anchors);

    return anchors;
  };

  for (const filePath of filePaths) {
    const content = readFileSync(filePath, 'utf8');

    for (const link of collectLinkReferences(content)) {
      const parsedTarget = parseAnchorTarget(filePath, link.target, docsRoot);

      if (parsedTarget === undefined) {
        continue;
      }

      if (getAnchors(parsedTarget.targetFilePath).has(parsedTarget.fragment)) {
        continue;
      }

      findings.push({
        code: 'anchor',
        column: link.column,
        filePath,
        line: link.line,
        message: `anchor "${parsedTarget.fragment}" was not found in ${formatFilePath(
          parsedTarget.targetFilePath,
          docsRoot
        )}`,
        target: link.target,
        targetFilePath: parsedTarget.targetFilePath,
      });
    }
  }

  return findings;
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

const readLine = (filePath: string, lineNumber: number): string => {
  if (!existsSync(filePath)) {
    return '';
  }

  return readFileSync(filePath, 'utf8').split(/\r?\n/)[lineNumber - 1] ?? '';
};

const collectLinkReferencesOnLine = (line: string): LinkReference[] =>
  collectLinkReferences(line);

const getOriginalTargetAtLocation = (
  filePath: string,
  line: number,
  column: number,
  fallbackTarget: string
): string => {
  const lineContent = readLine(filePath, line);
  const linksOnLine = collectLinkReferencesOnLine(lineContent);

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

  return 'lychee reported an internal link error';
};

const lycheeIssueToFinding = (
  filePath: string,
  issue: LycheeIssue
): InternalLinkFinding => {
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

const collectLycheeFindings = (
  lycheeJson: LycheeJson
): InternalLinkFinding[] => {
  const errorMap = lycheeJson.error_map;

  if (!isRecord(errorMap)) {
    return [];
  }

  const findings: InternalLinkFinding[] = [];

  for (const [filePath, issues] of Object.entries(errorMap)) {
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

const runLychee = (
  filePaths: string[],
  docsRoot: string
): { findings: InternalLinkFinding[]; stats: LycheeStats } => {
  if (filePaths.length === 0) {
    return { findings: [], stats: emptyLycheeStats() };
  }

  const tempDirectory = mkdtempSync(join(tmpdir(), 'factory-lychee-'));
  const filesFromPath = join(tempDirectory, 'inputs.txt');

  try {
    writeFileSync(filesFromPath, `${filePaths.join('\n')}\n`, 'utf8');

    const lycheeResult = spawnSync(
      'lychee',
      [
        '--no-progress',
        '--mode',
        'plain',
        '--offline',
        '--scheme',
        'file',
        '--root-dir',
        docsRoot,
        '--fallback-extensions',
        'mdx',
        '--index-files',
        'index.mdx',
        '--exclude',
        '%7B.*%7D',
        '--format',
        'json',
        '--files-from',
        filesFromPath,
      ],
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
      findings: collectLycheeFindings(lycheeJson),
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

export const checkInternalLinks = (
  inputPaths: string[] = [defaultDocsRoot],
  options: CheckInternalLinksOptions = {}
): InternalLinksCheckResult => {
  const docsRoot = resolveDocsRoot(options.docsRoot);
  const mdxFiles = collectInternalLinkMdxFiles(inputPaths, { docsRoot });
  const lycheeResult = runLychee(mdxFiles, docsRoot);
  const anchorFindings = checkAnchorLinks(mdxFiles, docsRoot);

  return {
    checkedFiles: mdxFiles.length,
    findings: [...lycheeResult.findings, ...anchorFindings].sort(
      (left, right) => {
        const fileComparison = left.filePath.localeCompare(right.filePath);

        if (fileComparison !== 0) {
          return fileComparison;
        }

        if (left.line !== right.line) {
          return left.line - right.line;
        }

        return left.column - right.column;
      }
    ),
    lychee: lycheeResult.stats,
  };
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

export const formatInternalLinkFinding = (
  finding: InternalLinkFinding,
  options: FormatOptions = {}
): string =>
  `${formatFilePath(finding.filePath, options.cwd)}:${finding.line}:${
    finding.column
  } error internal-links.${finding.code} ${finding.target} ${finding.message}`;

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

const getCliInputPaths = (args: string[]): string[] => {
  const inputArgs = args.filter((arg) => arg !== '--');

  return inputArgs.length > 0
    ? inputArgs.map(resolveCliInputPath)
    : [defaultDocsRoot];
};

export const runInternalLinksCli = (
  args: string[] = process.argv.slice(2)
): number => {
  const inputPaths = getCliInputPaths(args);
  const missingInputPaths = inputPaths.filter(
    (inputPath) => !existsSync(inputPath)
  );

  if (missingInputPaths.length > 0) {
    for (const inputPath of missingInputPaths) {
      console.error(
        `${formatFilePath(
          inputPath,
          repoRoot
        )}:1:1 error internal-links.input path does not exist`
      );
    }

    return 1;
  }

  const result = checkInternalLinks(inputPaths, {
    docsRoot: defaultDocsRoot,
  });

  if (result.findings.length > 0) {
    console.error(
      `Internal link check failed with ${result.findings.length} error(s).`
    );
    for (const finding of result.findings) {
      console.error(formatInternalLinkFinding(finding, { cwd: repoRoot }));
    }
    console.error(
      `Lychee summary: ${result.lychee.total} total, ${result.lychee.unique} unique, ${result.lychee.successful} OK, ${result.lychee.errors} error(s), ${result.lychee.excludes} excluded.`
    );

    return 1;
  }

  console.log(
    `Internal link check passed: ${result.checkedFiles} MDX file(s) checked. Lychee summary: ${result.lychee.total} total, ${result.lychee.unique} unique, ${result.lychee.successful} OK, ${result.lychee.errors} error(s), ${result.lychee.excludes} excluded.`
  );

  return 0;
};

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  process.exitCode = runInternalLinksCli();
}
