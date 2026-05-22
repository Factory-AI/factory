import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import * as generatedVarsMdx from '../../../docs/snippets/vars.mdx';
import { vars } from '../src/vars';

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const requiredExports = [
  'vars',
  'ProductName',
  'InstallCommand',
  'SupportLink',
  'SecurityLink',
  'DiscordInvite',
  'DocsURL',
  'GithubRepo',
] as const;

describe('generated vars.mdx exports', () => {
  it('exports vars and every first-class JSX component', () => {
    for (const exportName of requiredExports) {
      expect(generatedVarsMdx[exportName]).toBeDefined();
    }

    expect(generatedVarsMdx.vars).toEqual(vars);
  });

  it.each(['macos', 'windows', 'npm', 'brew'] as const)(
    'renders the %s install command',
    (platform) => {
      const html = renderToStaticMarkup(
        createElement(generatedVarsMdx.InstallCommand, { platform })
      );

      expect(html).toContain(vars.install[platform]);
    }
  );

  it('rejects unsupported InstallCommand platforms at compile time', () => {
    const result = spawnSync(
      'node_modules/.bin/tsc',
      ['--project', 'fixtures/tsconfig.bad-platform.json', '--noEmit'],
      {
        cwd: packageRoot,
        encoding: 'utf8',
      }
    );

    expect(result.status).not.toBe(0);
    expect(`${result.stdout}\n${result.stderr}`).toContain('invalid');
  });
});
