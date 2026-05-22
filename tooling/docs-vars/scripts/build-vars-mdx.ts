import { mkdirSync, watch, writeFileSync, type FSWatcher } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { renderVarsMdx, type DocsVars } from '../src/render';
import { VarsSchema } from '../src/schema';

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const packageRoot = resolve(scriptDirectory, '..');
const repoRoot = resolve(packageRoot, '../..');
const varsSourcePath = resolve(packageRoot, 'src/vars.ts');
const outputPath = resolve(repoRoot, 'docs/snippets/vars.mdx');
const watchMode = process.argv.includes('--watch');

const loadVars = async (): Promise<DocsVars> => {
  const cacheBustedVarsUrl = `${pathToFileURL(varsSourcePath).href}?t=${Date.now()}`;
  const varsModule = (await import(cacheBustedVarsUrl)) as { vars: unknown };

  return VarsSchema.parse(varsModule.vars) as DocsVars;
};

const writeVarsMdx = async (): Promise<void> => {
  const docsVars = await loadVars();
  const renderedMdx = renderVarsMdx(docsVars);

  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, renderedMdx, 'utf8');
  console.log(`wrote ${relative(repoRoot, outputPath)}`);
};

const reportError = (error: unknown): void => {
  const message = error instanceof Error ? error.stack || error.message : error;

  console.error(message);
};

const runOnce = async (): Promise<void> => {
  try {
    await writeVarsMdx();
  } catch (error) {
    reportError(error);
    process.exitCode = 1;
  }
};

const runWatch = async (): Promise<void> => {
  await writeVarsMdx();
  console.log(`watching ${relative(repoRoot, varsSourcePath)}`);

  let debounceTimer: NodeJS.Timeout | undefined;
  let watcher: FSWatcher | undefined;

  const scheduleRebuild = (): void => {
    if (debounceTimer) {
      clearTimeout(debounceTimer);
    }

    debounceTimer = setTimeout(() => {
      void writeVarsMdx().catch(reportError);
    }, 50);
  };

  const closeWatcher = (): void => {
    if (debounceTimer) {
      clearTimeout(debounceTimer);
    }

    watcher?.close();
  };

  watcher = watch(varsSourcePath, { persistent: true }, scheduleRebuild);
  process.once('SIGINT', () => {
    closeWatcher();
    process.exit(0);
  });
  process.once('SIGTERM', () => {
    closeWatcher();
    process.exit(0);
  });
};

if (watchMode) {
  await runWatch().catch((error) => {
    reportError(error);
    process.exit(1);
  });
} else {
  await runOnce();
}
