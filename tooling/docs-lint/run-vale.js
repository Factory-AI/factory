import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const docsLintDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(docsLintDir, '../..');
const docsLintBin = resolve(repoRoot, 'tooling/docs-lint/node_modules/.bin');

const result = spawnSync(
  'vale',
  [
    '--no-global',
    '--config=.vale.ini',
    '--output=line',
    '--no-wrap',
    '--glob=!docs/jp/**',
    'docs',
  ],
  {
    cwd: repoRoot,
    env: {
      ...process.env,
      PATH: `${docsLintBin}:${process.env.PATH ?? ''}`,
    },
    stdio: 'inherit',
  }
);

process.exit(result.status ?? 1);
