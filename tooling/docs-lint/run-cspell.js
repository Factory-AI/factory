import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const docsLintDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(docsLintDir, '../..');
const cspellBin = resolve(repoRoot, 'node_modules/.bin/cspell');

const result = spawnSync(
  cspellBin,
  [
    '--config',
    'cspell.config.yaml',
    '--no-progress',
    '--no-summary',
    '--exclude',
    'docs/jp/**',
    'docs/**/*.{md,mdx}',
  ],
  {
    cwd: repoRoot,
    stdio: 'inherit',
  }
);

process.exit(result.status ?? 1);
