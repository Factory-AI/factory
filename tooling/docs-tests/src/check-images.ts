import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

export const IMAGE_SIZE_WARNING_BYTES = 500 * 1024;

export type ImageReferenceKind = 'markdown' | 'jsx-img';

export type ImageFinding = {
  code: 'empty-alt' | 'missing-asset' | 'missing-src';
  column: number;
  filePath: string;
  line: number;
  message: string;
  source: string;
};

export type ImageWarning = {
  assetPath: string;
  code: 'large-asset';
  column: number;
  filePath: string;
  line: number;
  message: string;
  sizeBytes: number;
  source: string;
};

export type ImagesCheckResult = {
  checkedFiles: number;
  findings: ImageFinding[];
  imageReferences: number;
  warnings: ImageWarning[];
};

export type CheckImagesOptions = {
  docsRoot?: string;
  sizeWarningBytes?: number;
};

type ImageReference = {
  alt?: string;
  column: number;
  filePath: string;
  kind: ImageReferenceKind;
  line: number;
  source?: string;
};

type ActiveFence = {
  marker: string;
  minimumLength: number;
};

type Location = {
  column: number;
  line: number;
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

export const collectImageMdxFiles = (
  inputPaths: string[] = [defaultDocsRoot],
  options: CheckImagesOptions = {}
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
): { fence: string; info: string } | undefined => {
  const match = /^(?: {0,3})(`{3,}|~{3,})(.*)$/.exec(line);

  if (match === null) {
    return undefined;
  }

  return {
    fence: match[1],
    info: match[2].trim(),
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

const getFencedCodeLines = (content: string): Set<number> => {
  const fencedCodeLines = new Set<number>();
  const lines = content.split(/\r?\n/);
  let activeFence: ActiveFence | undefined;

  for (const [index, line] of lines.entries()) {
    const lineNumber = index + 1;
    const parsedFence = parseFenceLine(line);

    if (activeFence !== undefined) {
      fencedCodeLines.add(lineNumber);

      if (isClosingFence(parsedFence, activeFence)) {
        activeFence = undefined;
      }

      continue;
    }

    if (parsedFence !== undefined) {
      activeFence = {
        marker: parsedFence.fence[0],
        minimumLength: parsedFence.fence.length,
      };
      fencedCodeLines.add(lineNumber);
    }
  }

  return fencedCodeLines;
};

const getLineColumnAtIndex = (content: string, index: number): Location => {
  const precedingContent = content.slice(0, index);
  const lines = precedingContent.split(/\r?\n/);

  return {
    column: lines[lines.length - 1].length + 1,
    line: lines.length,
  };
};

const collectMarkdownImageReferences = (
  filePath: string,
  content: string
): ImageReference[] => {
  const fencedCodeLines = getFencedCodeLines(content);
  const references: ImageReference[] = [];
  const markdownImagePattern =
    /!\[([^\]\n]*)\]\(([^)\s]+)(?:\s+(['"]).*?\3)?\)/g;

  for (const [lineIndex, line] of content.split(/\r?\n/).entries()) {
    const lineNumber = lineIndex + 1;

    if (fencedCodeLines.has(lineNumber)) {
      continue;
    }

    markdownImagePattern.lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = markdownImagePattern.exec(line)) !== null) {
      references.push({
        alt: match[1],
        column: match.index + 1,
        filePath,
        kind: 'markdown',
        line: lineNumber,
        source: match[2],
      });
    }
  }

  return references;
};

const parseAttributes = (tag: string): Map<string, string | undefined> => {
  const attributes = new Map<string, string | undefined>();
  const attributePattern =
    /\b([A-Za-z_:][-A-Za-z0-9_:.]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|\{([^}]*)\})/g;
  let match: RegExpExecArray | null;

  while ((match = attributePattern.exec(tag)) !== null) {
    const [, rawName, doubleQuoted, singleQuoted, expression] = match;
    attributes.set(
      rawName.toLowerCase(),
      doubleQuoted ?? singleQuoted ?? expression
    );
  }

  return attributes;
};

const collectJsxImageReferences = (
  filePath: string,
  content: string
): ImageReference[] => {
  const fencedCodeLines = getFencedCodeLines(content);
  const references: ImageReference[] = [];
  const imgTagPattern = /<img\b[\s\S]*?>/gi;
  let match: RegExpExecArray | null;

  while ((match = imgTagPattern.exec(content)) !== null) {
    const location = getLineColumnAtIndex(content, match.index);

    if (fencedCodeLines.has(location.line)) {
      continue;
    }

    const attributes = parseAttributes(match[0]);

    references.push({
      alt: attributes.get('alt'),
      column: location.column,
      filePath,
      kind: 'jsx-img',
      line: location.line,
      source: attributes.get('src'),
    });
  }

  return references;
};

const collectImageReferences = (filePath: string): ImageReference[] => {
  const content = readFileSync(filePath, 'utf8');

  return [
    ...collectMarkdownImageReferences(filePath, content),
    ...collectJsxImageReferences(filePath, content),
  ].sort((left, right) => {
    if (left.line !== right.line) {
      return left.line - right.line;
    }

    return left.column - right.column;
  });
};

const decodeUrlPath = (value: string): string => {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
};

const stripQueryAndHash = (value: string): string =>
  value.split('#')[0].split('?')[0];

const isLocalStaticImageSource = (source: string): boolean =>
  !/^(?:https?:|data:|mailto:|tel:)/i.test(source) &&
  !source.includes('{') &&
  !source.includes('}');

const resolveImageAssetPath = (
  sourceFilePath: string,
  source: string,
  docsRoot: string
): string | undefined => {
  const strippedSource = decodeUrlPath(stripQueryAndHash(source.trim()));

  if (strippedSource === '' || !isLocalStaticImageSource(strippedSource)) {
    return undefined;
  }

  const assetPath = strippedSource.startsWith('/')
    ? resolve(docsRoot, `.${strippedSource}`)
    : resolve(dirname(sourceFilePath), strippedSource);

  if (!isWithinDirectory(assetPath, docsRoot)) {
    return assetPath;
  }

  return assetPath;
};

const createEmptyAltFinding = (reference: ImageReference): ImageFinding => ({
  code: 'empty-alt',
  column: reference.column,
  filePath: reference.filePath,
  line: reference.line,
  message:
    reference.kind === 'markdown'
      ? 'Markdown image has empty alt text'
      : '<img> element has empty alt text',
  source: reference.source ?? '',
});

const createMissingSrcFinding = (reference: ImageReference): ImageFinding => ({
  code: 'missing-src',
  column: reference.column,
  filePath: reference.filePath,
  line: reference.line,
  message: '<img> element is missing a src attribute',
  source: '',
});

const createMissingAssetFinding = (
  reference: ImageReference,
  assetPath: string
): ImageFinding => ({
  code: 'missing-asset',
  column: reference.column,
  filePath: reference.filePath,
  line: reference.line,
  message: `referenced image asset "${reference.source}" does not exist on disk at ${formatFilePath(
    assetPath,
    repoRoot
  )}`,
  source: reference.source ?? '',
});

const createLargeAssetWarning = (
  reference: ImageReference,
  assetPath: string,
  sizeBytes: number
): ImageWarning => ({
  assetPath,
  code: 'large-asset',
  column: reference.column,
  filePath: reference.filePath,
  line: reference.line,
  message: `referenced image asset "${reference.source}" is ${sizeBytes} bytes, exceeding the ${IMAGE_SIZE_WARNING_BYTES} byte warning threshold`,
  sizeBytes,
  source: reference.source ?? '',
});

export const checkImages = (
  inputPaths: string[] = [defaultDocsRoot],
  options: CheckImagesOptions = {}
): ImagesCheckResult => {
  const docsRoot = resolveDocsRoot(options.docsRoot);
  const sizeWarningBytes = options.sizeWarningBytes ?? IMAGE_SIZE_WARNING_BYTES;
  const mdxFiles = collectImageMdxFiles(inputPaths, { docsRoot });
  const result: ImagesCheckResult = {
    checkedFiles: mdxFiles.length,
    findings: [],
    imageReferences: 0,
    warnings: [],
  };

  for (const filePath of mdxFiles) {
    const references = collectImageReferences(filePath);
    result.imageReferences += references.length;

    for (const reference of references) {
      if (reference.alt === undefined || reference.alt.trim() === '') {
        result.findings.push(createEmptyAltFinding(reference));
      }

      if (reference.source === undefined || reference.source.trim() === '') {
        if (reference.kind === 'jsx-img') {
          result.findings.push(createMissingSrcFinding(reference));
        }
        continue;
      }

      const assetPath = resolveImageAssetPath(
        reference.filePath,
        reference.source,
        docsRoot
      );

      if (assetPath === undefined) {
        continue;
      }

      if (!existsSync(assetPath) || !statSync(assetPath).isFile()) {
        result.findings.push(createMissingAssetFinding(reference, assetPath));
        continue;
      }

      const sizeBytes = statSync(assetPath).size;

      if (sizeBytes > sizeWarningBytes) {
        result.warnings.push(
          createLargeAssetWarning(reference, assetPath, sizeBytes)
        );
      }
    }
  }

  result.findings.sort(compareDiagnostics);
  result.warnings.sort(compareDiagnostics);

  return result;
};

const compareDiagnostics = (
  left: Pick<ImageFinding | ImageWarning, 'column' | 'filePath' | 'line'>,
  right: Pick<ImageFinding | ImageWarning, 'column' | 'filePath' | 'line'>
): number => {
  const fileComparison = left.filePath.localeCompare(right.filePath);

  if (fileComparison !== 0) {
    return fileComparison;
  }

  if (left.line !== right.line) {
    return left.line - right.line;
  }

  return left.column - right.column;
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

export const formatImageFinding = (
  finding: ImageFinding,
  options: FormatOptions = {}
): string =>
  `${formatFilePath(finding.filePath, options.cwd)}:${finding.line}:${
    finding.column
  } error images.${finding.code} ${finding.message}`;

export const formatImageWarning = (
  warning: ImageWarning,
  options: FormatOptions = {}
): string =>
  `${formatFilePath(warning.filePath, options.cwd)}:${warning.line}:${
    warning.column
  } warning images.${warning.code} ${warning.message} (${formatFilePath(
    warning.assetPath,
    options.cwd
  )})`;

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

export const runImagesCli = (
  args: string[] = process.argv.slice(2),
  options: CheckImagesOptions = {}
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
        )}:1:1 error images.input path does not exist`
      );
    }

    return 1;
  }

  const result = checkImages(inputPaths, {
    docsRoot: options.docsRoot ?? defaultDocsRoot,
    sizeWarningBytes: options.sizeWarningBytes,
  });

  for (const warning of result.warnings) {
    console.warn(formatImageWarning(warning, { cwd: repoRoot }));
  }

  if (result.findings.length > 0) {
    console.error(
      `Image check failed with ${result.findings.length} error(s).`
    );
    for (const finding of result.findings) {
      console.error(formatImageFinding(finding, { cwd: repoRoot }));
    }

    return 1;
  }

  console.log(
    `Image check passed: ${result.checkedFiles} MDX file(s) checked, ${result.imageReferences} image reference(s) checked, ${result.warnings.length} size warning(s).`
  );

  return 0;
};

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  process.exitCode = runImagesCli();
}
