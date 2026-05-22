import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import matter from 'gray-matter';

import { frontmatterSchema } from './frontmatter-schema';

export { frontmatterSchema } from './frontmatter-schema';

export type FrontmatterFinding = {
  code: 'frontmatter';
  column: number;
  field: string;
  filePath: string;
  line: number;
  message: string;
};

export type FrontmatterCheckResult = {
  checkedFiles: number;
  findings: FrontmatterFinding[];
  skippedFiles: number;
};

type CheckOptions = {
  docsRoot?: string;
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

export const isFrontmatterExemptPath = (
  filePath: string,
  docsRoot: string = defaultDocsRoot
): boolean => {
  const absoluteFilePath = resolve(filePath);
  const absoluteDocsRoot = resolveDocsRoot(docsRoot);

  if (isWithinDirectory(absoluteFilePath, absoluteDocsRoot)) {
    const [topLevelDirectory] = toPosixPath(
      relative(absoluteDocsRoot, absoluteFilePath)
    ).split('/');

    return topLevelDirectory === 'jp' || topLevelDirectory === 'snippets';
  }

  const normalizedPath = normalizePathForMatching(absoluteFilePath);

  return /(^|\/)docs\/(jp|snippets)(\/|$)/.test(normalizedPath);
};

const isMdxFile = (filePath: string): boolean => filePath.endsWith('.mdx');

const shouldSkipDirectory = (
  directoryPath: string,
  docsRoot: string
): boolean => isFrontmatterExemptPath(directoryPath, docsRoot);

const walkMdxFiles = (directoryPath: string, docsRoot: string): string[] => {
  if (shouldSkipDirectory(directoryPath, docsRoot)) {
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

export const collectMdxFiles = (
  inputPaths: string[] = [defaultDocsRoot],
  options: CheckOptions = {}
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
        if (!isFrontmatterExemptPath(filePath, docsRoot)) {
          collectedPaths.add(filePath);
        }
      }
      continue;
    }

    if (inputStat.isFile() && isMdxFile(inputPath)) {
      if (!isFrontmatterExemptPath(inputPath, docsRoot)) {
        collectedPaths.add(inputPath);
      }
    }
  }

  return [...collectedPaths].sort((left, right) => left.localeCompare(right));
};

const collectMdxFilesIncludingExplicitExemptions = (
  inputPaths: string[],
  options: CheckOptions
): string[] => {
  const docsRoot = resolveDocsRoot(options.docsRoot);
  const collectedPaths = new Set<string>();

  for (const inputPath of inputPaths.map((path) => resolve(path))) {
    if (!existsSync(inputPath)) {
      continue;
    }

    const inputStat = statSync(inputPath);

    if (inputStat.isDirectory()) {
      for (const filePath of collectMdxFiles([inputPath], { docsRoot })) {
        collectedPaths.add(filePath);
      }
      continue;
    }

    if (inputStat.isFile() && isMdxFile(inputPath)) {
      collectedPaths.add(inputPath);
    }
  }

  return [...collectedPaths].sort((left, right) => left.localeCompare(right));
};

const escapeRegExp = (value: string): string =>
  value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const findFrontmatterDelimiterLine = (lines: string[]): number | undefined => {
  for (let index = 1; index < lines.length; index += 1) {
    if (lines[index].trim() === '---') {
      return index;
    }
  }

  return undefined;
};

const getFieldLocation = (
  content: string,
  field: string
): { column: number; line: number } => {
  const lines = content.split(/\r?\n/);

  if (lines[0]?.trim() !== '---') {
    return { column: 1, line: 1 };
  }

  const endDelimiterLine = findFrontmatterDelimiterLine(lines);

  if (endDelimiterLine === undefined) {
    return { column: 1, line: 1 };
  }

  const fieldPattern = new RegExp(`^\\s*${escapeRegExp(field)}\\s*:`);

  for (let index = 1; index < endDelimiterLine; index += 1) {
    const line = lines[index];

    if (fieldPattern.test(line)) {
      return {
        column: line.indexOf(field) + 1,
        line: index + 1,
      };
    }
  }

  return { column: 1, line: 1 };
};

export const checkFrontmatterFile = (
  filePath: string,
  options: CheckOptions = {}
): { checked: boolean; findings: FrontmatterFinding[]; skipped: boolean } => {
  const docsRoot = resolveDocsRoot(options.docsRoot);
  const absoluteFilePath = resolve(filePath);

  if (isFrontmatterExemptPath(absoluteFilePath, docsRoot)) {
    return { checked: false, findings: [], skipped: true };
  }

  const content = readFileSync(absoluteFilePath, 'utf8');
  const parsedFrontmatter = matter(content);
  const validationResult = frontmatterSchema.safeParse(parsedFrontmatter.data);

  if (validationResult.success) {
    return { checked: true, findings: [], skipped: false };
  }

  const findings = validationResult.error.issues.map((issue) => {
    const field = issue.path.length > 0 ? issue.path.join('.') : 'frontmatter';
    const topLevelField =
      issue.path.length > 0 && typeof issue.path[0] === 'string'
        ? issue.path[0]
        : field;
    const location = getFieldLocation(content, topLevelField);

    return {
      code: 'frontmatter' as const,
      column: location.column,
      field,
      filePath: absoluteFilePath,
      line: location.line,
      message: issue.message,
    };
  });

  return { checked: true, findings, skipped: false };
};

export const checkFrontmatterFiles = (
  inputPaths: string[] = [defaultDocsRoot],
  options: CheckOptions = {}
): FrontmatterCheckResult => {
  const docsRoot = resolveDocsRoot(options.docsRoot);
  const mdxFiles = collectMdxFilesIncludingExplicitExemptions(inputPaths, {
    docsRoot,
  });
  const result: FrontmatterCheckResult = {
    checkedFiles: 0,
    findings: [],
    skippedFiles: 0,
  };

  for (const filePath of mdxFiles) {
    const fileResult = checkFrontmatterFile(filePath, { docsRoot });

    if (fileResult.skipped) {
      result.skippedFiles += 1;
      continue;
    }

    if (fileResult.checked) {
      result.checkedFiles += 1;
    }

    result.findings.push(...fileResult.findings);
  }

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

export const formatFrontmatterFinding = (
  finding: FrontmatterFinding,
  options: FormatOptions = {}
): string =>
  `${formatFilePath(finding.filePath, options.cwd)}:${finding.line}:${
    finding.column
  } error frontmatter.${finding.field} ${finding.message}`;

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

export const runFrontmatterCli = (args: string[] = process.argv.slice(2)) => {
  const inputPaths = getCliInputPaths(args);
  const missingInputPaths = inputPaths.filter(
    (inputPath) => !existsSync(inputPath)
  );

  if (missingInputPaths.length > 0) {
    for (const inputPath of missingInputPaths) {
      console.error(
        `${formatFilePath(inputPath, repoRoot)}:1:1 error frontmatter.input path does not exist`
      );
    }

    return 1;
  }

  const result = checkFrontmatterFiles(inputPaths, {
    docsRoot: defaultDocsRoot,
  });

  if (result.findings.length > 0) {
    console.error(
      `Frontmatter check failed with ${result.findings.length} error(s).`
    );
    for (const finding of result.findings) {
      console.error(formatFrontmatterFinding(finding, { cwd: repoRoot }));
    }

    return 1;
  }

  console.log(
    `Frontmatter check passed: ${result.checkedFiles} MDX file(s) checked, ${result.skippedFiles} exempt file(s) skipped.`
  );

  return 0;
};

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  process.exitCode = runFrontmatterCli();
}
