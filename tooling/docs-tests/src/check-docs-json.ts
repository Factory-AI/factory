import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import Ajv, { type ErrorObject, type ValidateFunction } from 'ajv';
import addFormats from 'ajv-formats';

export const MINTLIFY_DOCS_JSON_SCHEMA_URL = 'https://mintlify.com/docs.json';

export const DOCS_JSON_ORPHAN_ALLOWLIST = [
  'leaderboards/index',
  'snippets/vars',
  'snippets/leaderboards/agent-arena',
  'snippets/leaderboards/legacy-bench',
  'snippets/leaderboards/nextjs-eval',
  'snippets/leaderboards/review-benchmark',
  'snippets/leaderboards/terminal-bench',
] as const;

export type DocsJsonSchema = Record<string, unknown>;

export type DocsJsonFinding =
  | {
      code: 'schema';
      column: number;
      docsJsonPath: string;
      line: number;
      message: string;
      schemaPath?: string;
    }
  | {
      code: 'missing-nav-page';
      column: number;
      docsJsonPath: string;
      expectedFilePath: string;
      line: number;
      message: string;
      pagePath: string;
    }
  | {
      code: 'orphan-mdx';
      column: number;
      filePath: string;
      line: number;
      message: string;
      pagePath: string;
    };

export type DocsJsonCheckResult = {
  diskPages: string[];
  findings: DocsJsonFinding[];
  navPages: string[];
  orphanAllowlist: string[];
  schemaUrl: string;
  skippedNavPages: string[];
};

export type CheckDocsJsonOptions = {
  docsJsonPath?: string;
  docsRoot?: string;
  orphanAllowlist?: readonly string[];
  schema?: DocsJsonSchema;
  schemaUrl?: string;
};

type JsonRecord = Record<string, unknown>;

type NavPageEntry = {
  pagePath: string;
  rawPagePath: string;
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
const defaultDocsJsonPath = resolve(defaultDocsRoot, 'docs.json');
const schemaFetchTimeoutMs = 15_000;

const toPosixPath = (filePath: string): string => filePath.split(sep).join('/');

const normalizePathForMatching = (filePath: string): string =>
  filePath.replaceAll('\\', '/');

const isRecord = (value: unknown): value is JsonRecord =>
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

const normalizePagePath = (rawPagePath: string): string | undefined => {
  const trimmedPath = rawPagePath.trim();

  if (
    trimmedPath === '' ||
    /^(https?:|mailto:|tel:)/i.test(trimmedPath) ||
    trimmedPath.startsWith('#')
  ) {
    return undefined;
  }

  const withoutFragment = trimmedPath.split('#')[0].split('?')[0];
  const withoutLeadingSlash = withoutFragment.replace(/^\/+/, '');
  const withoutMdxExtension = withoutLeadingSlash.replace(/\.mdx$/i, '');
  const normalizedPath = withoutMdxExtension
    .replace(/\/+$/g, '')
    .replaceAll('\\', '/');

  if (normalizedPath === '') {
    return undefined;
  }

  return normalizedPath;
};

const getTopLevelDirectory = (pagePath: string): string =>
  pagePath.split('/')[0] ?? '';

export const isDocsJsonSkippedPagePath = (pagePath: string): boolean =>
  getTopLevelDirectory(pagePath) === 'jp';

const collectNavPageEntries = (docsJson: unknown): NavPageEntry[] => {
  const entries: NavPageEntry[] = [];

  const visit = (node: unknown): void => {
    if (Array.isArray(node)) {
      for (const item of node) {
        visit(item);
      }

      return;
    }

    if (!isRecord(node)) {
      return;
    }

    const pages = node.pages;

    if (Array.isArray(pages)) {
      for (const page of pages) {
        if (typeof page === 'string') {
          const pagePath = normalizePagePath(page);

          if (pagePath !== undefined) {
            entries.push({ pagePath, rawPagePath: page });
          }

          continue;
        }

        visit(page);
      }
    }

    for (const [key, value] of Object.entries(node)) {
      if (key === 'pages') {
        continue;
      }

      visit(value);
    }
  };

  if (isRecord(docsJson) && 'navigation' in docsJson) {
    visit(docsJson.navigation);
  } else {
    visit(docsJson);
  }

  return entries;
};

export const collectDocsJsonNavPages = (
  docsJson: unknown
): { navPages: string[]; skippedNavPages: string[] } => {
  const navPages = new Set<string>();
  const skippedNavPages = new Set<string>();

  for (const entry of collectNavPageEntries(docsJson)) {
    if (isDocsJsonSkippedPagePath(entry.pagePath)) {
      skippedNavPages.add(entry.pagePath);
      continue;
    }

    navPages.add(entry.pagePath);
  }

  return {
    navPages: [...navPages].sort((left, right) => left.localeCompare(right)),
    skippedNavPages: [...skippedNavPages].sort((left, right) =>
      left.localeCompare(right)
    ),
  };
};

const shouldSkipDiskDirectory = (
  directoryPath: string,
  docsRoot: string
): boolean => {
  const relativePath = toPosixPath(relative(docsRoot, directoryPath));

  return relativePath === 'jp' || relativePath.startsWith('jp/');
};

const isMdxFile = (filePath: string): boolean => filePath.endsWith('.mdx');

const getPagePathForMdxFile = (filePath: string, docsRoot: string): string =>
  toPosixPath(relative(docsRoot, filePath)).replace(/\.mdx$/i, '');

const walkMdxPages = (directoryPath: string, docsRoot: string): string[] => {
  if (shouldSkipDiskDirectory(directoryPath, docsRoot)) {
    return [];
  }

  return readdirSync(directoryPath, { withFileTypes: true })
    .sort((left, right) => left.name.localeCompare(right.name))
    .flatMap((entry) => {
      const entryPath = resolve(directoryPath, entry.name);

      if (entry.isDirectory()) {
        return walkMdxPages(entryPath, docsRoot);
      }

      if (entry.isFile() && isMdxFile(entryPath)) {
        return [getPagePathForMdxFile(entryPath, docsRoot)];
      }

      return [];
    });
};

export const collectDocsMdxPages = (docsRoot: string = defaultDocsRoot) => {
  const absoluteDocsRoot = resolve(docsRoot);

  if (!existsSync(absoluteDocsRoot)) {
    return [];
  }

  return walkMdxPages(absoluteDocsRoot, absoluteDocsRoot).sort((left, right) =>
    left.localeCompare(right)
  );
};

const resolveMdxFilePath = (docsRoot: string, pagePath: string): string =>
  resolve(docsRoot, `${pagePath}.mdx`);

const getLineColumnAtIndex = (content: string, index: number): Location => {
  if (index < 0) {
    return { column: 1, line: 1 };
  }

  const precedingContent = content.slice(0, index);
  const lines = precedingContent.split(/\r?\n/);

  return {
    column: lines[lines.length - 1].length + 1,
    line: lines.length,
  };
};

const getJsonStringLocation = (content: string, value: string): Location =>
  getLineColumnAtIndex(content, content.indexOf(JSON.stringify(value)));

const getRelativeSchemaPath = (error: ErrorObject): string => {
  if (
    error.keyword === 'required' &&
    isRecord(error.params) &&
    typeof error.params.missingProperty === 'string'
  ) {
    return `${error.instancePath}/${error.params.missingProperty}`.replace(
      /\/+/g,
      '/'
    );
  }

  return error.instancePath || '/';
};

const formatAjvErrorMessage = (error: ErrorObject): string => {
  const schemaPath = getRelativeSchemaPath(error);
  const message = error.message ?? 'does not match the schema';

  return `schema validation failed at ${schemaPath}: ${message}`;
};

const buildSchemaFinding = (
  docsJsonPath: string,
  message: string,
  schemaPath?: string
): DocsJsonFinding => ({
  code: 'schema',
  column: 1,
  docsJsonPath,
  line: 1,
  message,
  schemaPath,
});

const validateDocsJsonSchema = (
  docsJson: unknown,
  schema: DocsJsonSchema,
  docsJsonPath: string
): DocsJsonFinding[] => {
  const ajv = new Ajv({
    allErrors: true,
    strict: false,
    unicodeRegExp: false,
  });
  addFormats(ajv);

  let validate: ValidateFunction;

  try {
    validate = ajv.compile(schema);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'unknown schema compile error';

    return [
      buildSchemaFinding(
        docsJsonPath,
        `schema validation failed: could not compile Mintlify schema (${message})`
      ),
    ];
  }

  if (validate(docsJson)) {
    return [];
  }

  const seenMessages = new Set<string>();
  const findings: DocsJsonFinding[] = [];

  for (const error of validate.errors ?? []) {
    const schemaPath = getRelativeSchemaPath(error);
    const message = formatAjvErrorMessage(error);
    const dedupeKey = `${schemaPath}:${message}`;

    if (seenMessages.has(dedupeKey)) {
      continue;
    }

    seenMessages.add(dedupeKey);
    findings.push(buildSchemaFinding(docsJsonPath, message, schemaPath));
  }

  return findings;
};

const fetchMintlifySchema = async (
  schemaUrl: string
): Promise<DocsJsonSchema> => {
  const abortController = new AbortController();
  const timeout = setTimeout(
    () => abortController.abort(),
    schemaFetchTimeoutMs
  );

  try {
    const response = await fetch(schemaUrl, {
      signal: abortController.signal,
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status} ${response.statusText}`);
    }

    const schema = await response.json();

    if (!isRecord(schema)) {
      throw new Error('schema response was not a JSON object');
    }

    return schema;
  } finally {
    clearTimeout(timeout);
  }
};

const addMintlifySchemaCompatibility = (
  schema: DocsJsonSchema
): DocsJsonSchema => {
  const compatibleSchema = structuredClone(schema) as DocsJsonSchema;
  const schemaVariants = Array.isArray(compatibleSchema.anyOf)
    ? compatibleSchema.anyOf
    : [compatibleSchema];

  for (const variant of schemaVariants) {
    if (!isRecord(variant)) {
      continue;
    }

    const properties = variant.properties;

    if (!isRecord(properties) || 'topbarLinks' in properties) {
      continue;
    }

    properties.topbarLinks = {
      items: {
        additionalProperties: true,
        properties: {
          name: { type: 'string' },
          url: { type: 'string' },
        },
        required: ['name', 'url'],
        type: 'object',
      },
      type: 'array',
    };
  }

  for (const variant of schemaVariants) {
    if (!isRecord(variant) || !isRecord(variant.properties)) {
      continue;
    }

    const styling = variant.properties.styling;

    if (
      !isRecord(styling) ||
      !isRecord(styling.properties) ||
      'fonts' in styling.properties
    ) {
      continue;
    }

    styling.properties.fonts = {
      additionalProperties: false,
      properties: {
        body: {
          additionalProperties: false,
          properties: {
            family: { type: 'string' },
          },
          required: ['family'],
          type: 'object',
        },
        heading: {
          additionalProperties: false,
          properties: {
            family: { type: 'string' },
          },
          required: ['family'],
          type: 'object',
        },
        mono: {
          additionalProperties: false,
          properties: {
            family: { type: 'string' },
          },
          required: ['family'],
          type: 'object',
        },
      },
      type: 'object',
    };
  }

  return compatibleSchema;
};

const resolveSchema = async (
  options: CheckDocsJsonOptions,
  schemaUrl: string
): Promise<DocsJsonSchema> => {
  if (options.schema !== undefined) {
    return options.schema;
  }

  return addMintlifySchemaCompatibility(await fetchMintlifySchema(schemaUrl));
};

const uniqueNavEntriesByPagePath = (
  entries: NavPageEntry[]
): NavPageEntry[] => {
  const seenPagePaths = new Set<string>();
  const uniqueEntries: NavPageEntry[] = [];

  for (const entry of entries) {
    if (seenPagePaths.has(entry.pagePath)) {
      continue;
    }

    seenPagePaths.add(entry.pagePath);
    uniqueEntries.push(entry);
  }

  return uniqueEntries;
};

const buildMissingNavPageFinding = (
  docsJsonPath: string,
  docsRoot: string,
  docsJsonContent: string,
  entry: NavPageEntry
): DocsJsonFinding => {
  const expectedFilePath = resolveMdxFilePath(docsRoot, entry.pagePath);
  const location = getJsonStringLocation(docsJsonContent, entry.rawPagePath);

  return {
    code: 'missing-nav-page',
    column: location.column,
    docsJsonPath,
    expectedFilePath,
    line: location.line,
    message: `nav page "${
      entry.pagePath
    }" resolves to missing MDX "${formatFilePath(expectedFilePath, repoRoot)}"`,
    pagePath: entry.pagePath,
  };
};

const buildOrphanMdxFinding = (
  docsRoot: string,
  pagePath: string
): DocsJsonFinding => {
  const filePath = resolveMdxFilePath(docsRoot, pagePath);

  return {
    code: 'orphan-mdx',
    column: 1,
    filePath,
    line: 1,
    message: `on-disk MDX "${pagePath}" is not present in docs.json navigation and is not in the docs-json orphan allowlist`,
    pagePath,
  };
};

export const checkDocsJson = async (
  options: CheckDocsJsonOptions = {}
): Promise<DocsJsonCheckResult> => {
  const docsRoot = resolve(options.docsRoot ?? defaultDocsRoot);
  const docsJsonPath = resolve(options.docsJsonPath ?? defaultDocsJsonPath);
  const schemaUrl = options.schemaUrl ?? MINTLIFY_DOCS_JSON_SCHEMA_URL;
  const orphanAllowlist = [
    ...(options.orphanAllowlist ?? DOCS_JSON_ORPHAN_ALLOWLIST),
  ].sort((left, right) => left.localeCompare(right));

  const docsJsonContent = readFileSync(docsJsonPath, 'utf8');
  let docsJson: unknown;

  try {
    docsJson = JSON.parse(docsJsonContent);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'unknown JSON parse error';

    return {
      diskPages: [],
      findings: [
        buildSchemaFinding(
          docsJsonPath,
          `schema validation failed: docs.json is invalid JSON (${message})`
        ),
      ],
      navPages: [],
      orphanAllowlist,
      schemaUrl,
      skippedNavPages: [],
    };
  }

  let schema: DocsJsonSchema;

  try {
    schema = await resolveSchema(options, schemaUrl);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'unknown schema fetch error';

    return {
      diskPages: [],
      findings: [
        buildSchemaFinding(
          docsJsonPath,
          `schema validation failed: could not load Mintlify schema from ${schemaUrl} (${message})`
        ),
      ],
      navPages: [],
      orphanAllowlist,
      schemaUrl,
      skippedNavPages: [],
    };
  }

  const schemaFindings = validateDocsJsonSchema(docsJson, schema, docsJsonPath);

  if (schemaFindings.length > 0) {
    return {
      diskPages: [],
      findings: schemaFindings,
      navPages: [],
      orphanAllowlist,
      schemaUrl,
      skippedNavPages: [],
    };
  }

  const navEntries = uniqueNavEntriesByPagePath(
    collectNavPageEntries(docsJson).filter(
      (entry) => !isDocsJsonSkippedPagePath(entry.pagePath)
    )
  );
  const skippedNavPages = [
    ...new Set(
      collectNavPageEntries(docsJson)
        .filter((entry) => isDocsJsonSkippedPagePath(entry.pagePath))
        .map((entry) => entry.pagePath)
    ),
  ].sort((left, right) => left.localeCompare(right));
  const navPages = navEntries
    .map((entry) => entry.pagePath)
    .sort((left, right) => left.localeCompare(right));
  const diskPages = collectDocsMdxPages(docsRoot);
  const diskPageSet = new Set(diskPages);
  const navPageSet = new Set(navPages);
  const orphanAllowlistSet = new Set(orphanAllowlist);
  const findings: DocsJsonFinding[] = [];

  for (const entry of navEntries) {
    const expectedFilePath = resolveMdxFilePath(docsRoot, entry.pagePath);

    if (
      !isWithinDirectory(expectedFilePath, docsRoot) ||
      !diskPageSet.has(entry.pagePath)
    ) {
      findings.push(
        buildMissingNavPageFinding(
          docsJsonPath,
          docsRoot,
          docsJsonContent,
          entry
        )
      );
    }
  }

  for (const diskPage of diskPages) {
    if (!navPageSet.has(diskPage) && !orphanAllowlistSet.has(diskPage)) {
      findings.push(buildOrphanMdxFinding(docsRoot, diskPage));
    }
  }

  return {
    diskPages,
    findings,
    navPages,
    orphanAllowlist,
    schemaUrl,
    skippedNavPages,
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

export const formatDocsJsonFinding = (
  finding: DocsJsonFinding,
  options: FormatOptions = {}
): string => {
  if (finding.code === 'orphan-mdx') {
    return `${formatFilePath(finding.filePath, options.cwd)}:${finding.line}:${
      finding.column
    } error docs-json.${finding.code} ${finding.message}`;
  }

  return `${formatFilePath(finding.docsJsonPath, options.cwd)}:${
    finding.line
  }:${finding.column} error docs-json.${finding.code} ${finding.message}`;
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

const getCliInputPaths = (args: string[]) => {
  const inputArgs = args.filter((arg) => arg !== '--');

  return {
    docsJsonPath:
      inputArgs[0] !== undefined
        ? resolveCliInputPath(inputArgs[0])
        : defaultDocsJsonPath,
    docsRoot:
      inputArgs[1] !== undefined
        ? resolveCliInputPath(inputArgs[1])
        : defaultDocsRoot,
  };
};

const formatInputError = (inputPath: string, label: string): string =>
  `${formatFilePath(inputPath, repoRoot)}:1:1 error docs-json.input ${label} path does not exist`;

export const runDocsJsonCli = async (
  args: string[] = process.argv.slice(2)
): Promise<number> => {
  const { docsJsonPath, docsRoot } = getCliInputPaths(args);
  const missingInputErrors: string[] = [];

  if (!existsSync(docsJsonPath)) {
    missingInputErrors.push(formatInputError(docsJsonPath, 'docs.json'));
  }

  if (!existsSync(docsRoot) || !statSync(docsRoot).isDirectory()) {
    missingInputErrors.push(formatInputError(docsRoot, 'docs root'));
  }

  if (missingInputErrors.length > 0) {
    for (const inputError of missingInputErrors) {
      console.error(inputError);
    }

    return 1;
  }

  const result = await checkDocsJson({ docsJsonPath, docsRoot });

  if (result.findings.length > 0) {
    console.error(
      `Docs.json check failed with ${result.findings.length} error(s).`
    );
    for (const finding of result.findings) {
      console.error(formatDocsJsonFinding(finding, { cwd: repoRoot }));
    }

    return 1;
  }

  console.log(
    `Docs.json check passed: ${result.navPages.length} nav page(s) checked, ${result.diskPages.length} MDX file(s) checked, ${result.skippedNavPages.length} JP nav page(s) skipped.`
  );

  return 0;
};

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  process.exitCode = await runDocsJsonCli();
}
