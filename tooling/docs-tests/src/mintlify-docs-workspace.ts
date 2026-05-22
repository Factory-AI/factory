import {
  cpSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative, resolve, sep } from 'node:path';

export type MintlifyDocsWorkspace = {
  cleanup: () => void;
  docsRoot: string;
  sourceDocsRoot: string;
  workspaceRoot: string;
};

type JsonRecord = Record<string, unknown>;

const isRecord = (value: unknown): value is JsonRecord =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const toPosixPath = (filePath: string): string => filePath.split(sep).join('/');

const normalizeRoute = (value: string): string => value.replaceAll('\\', '/');

const isJpRelativePath = (filePath: string, docsRoot: string): boolean => {
  const relativePath = toPosixPath(relative(docsRoot, filePath));

  return relativePath === 'jp' || relativePath.startsWith('jp/');
};

const isJpRoute = (value: unknown): boolean => {
  if (typeof value !== 'string') {
    return false;
  }

  const route = normalizeRoute(value);

  return (
    route === 'jp' ||
    route.startsWith('jp/') ||
    route === '/jp' ||
    route.startsWith('/jp/')
  );
};

export const sanitizeDocsJsonForMintlifyChecks = (
  docsJson: unknown
): unknown => {
  if (!isRecord(docsJson)) {
    return docsJson;
  }

  const sanitized = JSON.parse(JSON.stringify(docsJson)) as JsonRecord;
  const navigation = sanitized.navigation;

  if (isRecord(navigation) && Array.isArray(navigation.languages)) {
    navigation.languages = navigation.languages.filter((languageEntry) => {
      if (!isRecord(languageEntry)) {
        return true;
      }

      return languageEntry.language !== 'jp';
    });
  }

  if (Array.isArray(sanitized.redirects)) {
    sanitized.redirects = sanitized.redirects.filter((redirect) => {
      if (!isRecord(redirect)) {
        return true;
      }

      return !isJpRoute(redirect.source) && !isJpRoute(redirect.destination);
    });
  }

  return sanitized;
};

export const prepareMintlifyDocsWorkspace = (
  docsRoot: string
): MintlifyDocsWorkspace => {
  const sourceDocsRoot = resolve(docsRoot);
  const workspaceRoot = mkdtempSync(join(tmpdir(), 'factory-mintlify-docs-'));
  const preparedDocsRoot = join(workspaceRoot, 'docs');

  cpSync(sourceDocsRoot, preparedDocsRoot, {
    dereference: false,
    filter: (sourcePath) =>
      !isJpRelativePath(resolve(sourcePath), sourceDocsRoot),
    recursive: true,
  });

  const docsJsonPath = join(preparedDocsRoot, 'docs.json');

  if (existsSync(docsJsonPath)) {
    const docsJson = JSON.parse(readFileSync(docsJsonPath, 'utf8')) as unknown;
    writeFileSync(
      docsJsonPath,
      `${JSON.stringify(sanitizeDocsJsonForMintlifyChecks(docsJson), null, 2)}\n`,
      'utf8'
    );
  }

  return {
    cleanup: () => rmSync(workspaceRoot, { force: true, recursive: true }),
    docsRoot: preparedDocsRoot,
    sourceDocsRoot,
    workspaceRoot,
  };
};
