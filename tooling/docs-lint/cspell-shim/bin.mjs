#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';

const args = process.argv.slice(2);

if (args.includes('--show-config')) {
  const configPath = resolve(process.cwd(), 'cspell.config.yaml');
  const config = readFileSync(configPath, 'utf8');

  console.log(`# Resolved cspell config: ${configPath}`);
  console.log(config);
  console.log('# Imported dictionary packages');
  console.log('@cspell/dict-en_us');
  console.log('@cspell/dict-software-terms');
  console.log('@cspell/dict-companies');
  process.exit(0);
}

const require = createRequire(import.meta.url);
const cspellEntrypoint = require.resolve('cspell-bin');
const cspellPackageRoot = cspellEntrypoint.slice(
  0,
  cspellEntrypoint.indexOf('/dist/')
);
const cspellBin = resolve(cspellPackageRoot, 'bin.mjs');
const result = spawnSync(process.execPath, [cspellBin, ...args], {
  stdio: 'inherit',
});

process.exit(result.status ?? 1);
