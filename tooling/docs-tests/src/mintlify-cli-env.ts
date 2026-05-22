import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const node22Bin = '/opt/homebrew/opt/node@22/bin';
const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = resolve(packageRoot, '../..');
const docsMintlifyBin = resolve(repoRoot, 'docs/node_modules/.bin');

export const withMintlifyCliPath = (
  env: NodeJS.ProcessEnv = process.env
): NodeJS.ProcessEnv & { PATH: string } => ({
  ...env,
  PATH: [node22Bin, docsMintlifyBin, env.PATH ?? ''].join(':'),
});
