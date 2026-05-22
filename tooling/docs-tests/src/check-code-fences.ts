import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

export const DEFAULT_CODE_FENCE_LANGUAGE_ALLOWLIST = [
  'bash',
  'cmd',
  'css',
  'diff',
  'dotenv',
  'html',
  'javascript',
  'json',
  'jsonc',
  'markdown',
  'md',
  'mermaid',
  'powershell',
  'python',
  'sh',
  'shell',
  'ssh-config',
  'text',
  'toml',
  'tsx',
  'typescript',
  'yaml',
  'yml',
] as const;

export type CodeFenceLanguage =
  (typeof DEFAULT_CODE_FENCE_LANGUAGE_ALLOWLIST)[number];

export type CodeFenceFinding = {
  code: 'missing-language' | 'unknown-language';
  column: number;
  filePath: string;
  language?: string;
  line: number;
  message: string;
};

export type CodeFencesCheckResult = {
  checkedFiles: number;
  fencedBlocks: number;
  findings: CodeFenceFinding[];
};

export type CheckCodeFencesOptions = {
  allowlist?: readonly string[];
  docsRoot?: string;
};

type ActiveFence = {
  marker: string;
  minimumLength: number;
};

type FormatOptions = {
  cwd?: string;
};

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = resolve(packageRoot, '../..');
const defaultDocsRoot = resolve(repoRoot, 'docs');

const toPosixPath = (filePath: string): string => filePath.split(sep).join('/');

const normalizePathForMatching = (filePath: string): string =>
  filePath.replaceAll('\\', '/');

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
  isWithinDirectory(resolve(filePath), resolveDocsRoot(docsRoot)) &&
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

export const collectCodeFenceMdxFiles = (
  inputPaths: string[] = [defaultDocsRoot],
  options: CheckCodeFencesOptions = {}
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

const parseFenceLine = (
  line: string
): { column: number; fence: string; info: string } | undefined => {
  const match = /^( {0,3})(`{3,}|~{3,})(.*)$/.exec(line);

  if (match === null) {
    return undefined;
  }

  return {
    column: match[1].length + 1,
    fence: match[2],
    info: match[3].trim(),
  };
};

const isClosingFence = (
  parsedFence: { fence: string; info: string } | undefined,
  activeFence: ActiveFence
): boolean =>
  parsedFence !== undefined &&
  parsedFence.fence[0] === activeFence.marker &&
  parsedFence.fence.length >= activeFence.minimumLength &&
  parsedFence.info === '';

const getFenceLanguage = (info: string): string | undefined =>
  info.split(/\s+/)[0]?.trim().toLowerCase() || undefined;

const createMissingLanguageFinding = (
  filePath: string,
  line: number,
  column: number
): CodeFenceFinding => ({
  code: 'missing-language',
  column,
  filePath,
  line,
  message: 'fenced code block is missing language info',
});

const createUnknownLanguageFinding = (
  filePath: string,
  line: number,
  column: number,
  language: string,
  allowlist: readonly string[]
): CodeFenceFinding => ({
  code: 'unknown-language',
  column,
  filePath,
  language,
  line,
  message: `fenced code block language "${language}" is not in the project allowlist (${allowlist.join(
    ', '
  )})`,
});

const checkCodeFenceFile = (
  filePath: string,
  allowlist: readonly string[]
): { fencedBlocks: number; findings: CodeFenceFinding[] } => {
  const allowlistSet = new Set(
    allowlist.map((language) => language.toLowerCase())
  );
  const findings: CodeFenceFinding[] = [];
  const content = readFileSync(filePath, 'utf8');
  const lines = content.split(/\r?\n/);
  let activeFence: ActiveFence | undefined;
  let fencedBlocks = 0;

  for (const [lineIndex, line] of lines.entries()) {
    const parsedFence = parseFenceLine(line);

    if (activeFence !== undefined) {
      if (isClosingFence(parsedFence, activeFence)) {
        activeFence = undefined;
      }
      continue;
    }

    if (parsedFence === undefined) {
      continue;
    }

    fencedBlocks += 1;

    const lineNumber = lineIndex + 1;
    const language = getFenceLanguage(parsedFence.info);

    if (language === undefined) {
      findings.push(
        createMissingLanguageFinding(filePath, lineNumber, parsedFence.column)
      );
    } else if (!allowlistSet.has(language)) {
      findings.push(
        createUnknownLanguageFinding(
          filePath,
          lineNumber,
          parsedFence.column,
          language,
          allowlist
        )
      );
    }

    activeFence = {
      marker: parsedFence.fence[0],
      minimumLength: parsedFence.fence.length,
    };
  }

  return { fencedBlocks, findings };
};

export const checkCodeFences = (
  inputPaths: string[] = [defaultDocsRoot],
  options: CheckCodeFencesOptions = {}
): CodeFencesCheckResult => {
  const docsRoot = resolveDocsRoot(options.docsRoot);
  const allowlist = options.allowlist ?? DEFAULT_CODE_FENCE_LANGUAGE_ALLOWLIST;
  const mdxFiles = collectCodeFenceMdxFiles(inputPaths, { docsRoot });
  const result: CodeFencesCheckResult = {
    checkedFiles: mdxFiles.length,
    fencedBlocks: 0,
    findings: [],
  };

  for (const filePath of mdxFiles) {
    const fileResult = checkCodeFenceFile(filePath, allowlist);
    result.fencedBlocks += fileResult.fencedBlocks;
    result.findings.push(...fileResult.findings);
  }

  result.findings.sort((left, right) => {
    const fileComparison = left.filePath.localeCompare(right.filePath);

    if (fileComparison !== 0) {
      return fileComparison;
    }

    if (left.line !== right.line) {
      return left.line - right.line;
    }

    return left.column - right.column;
  });

  return result;
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

export const formatCodeFenceFinding = (
  finding: CodeFenceFinding,
  options: FormatOptions = {}
): string =>
  `${formatFilePath(finding.filePath, options.cwd)}:${finding.line}:${
    finding.column
  } error code-fences.${finding.code} ${finding.message}`;

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

export const runCodeFencesCli = (
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
        )}:1:1 error code-fences.input path does not exist`
      );
    }

    return 1;
  }

  const result = checkCodeFences(inputPaths, {
    docsRoot: defaultDocsRoot,
  });

  if (result.findings.length > 0) {
    console.error(
      `Code fence check failed with ${result.findings.length} error(s).`
    );
    for (const finding of result.findings) {
      console.error(formatCodeFenceFinding(finding, { cwd: repoRoot }));
    }

    return 1;
  }

  console.log(
    `Code fence check passed: ${result.checkedFiles} MDX file(s) checked, ${result.fencedBlocks} fenced code block(s) checked.`
  );

  return 0;
};

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  process.exitCode = runCodeFencesCli();
}
