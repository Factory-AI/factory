import { spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = resolve(packageRoot, '../..');
const docsRoot = resolve(repoRoot, 'docs');
const generatedVarsMdxPath = resolve(docsRoot, 'snippets/vars.mdx');

const runVarsCheck = (args: string[] = []) => {
  const result = spawnSync('pnpm', ['vars:check', ...args], {
    cwd: repoRoot,
    encoding: 'utf8',
    env: {
      ...process.env,
      FORCE_COLOR: '0',
    },
  });

  return {
    status: result.status ?? 1,
    output: `${result.stdout}\n${result.stderr}`,
  };
};

const writeTempMdx = (relativePath: string, content: string): string => {
  const filePath = resolve(repoRoot, relativePath);

  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, content, 'utf8');

  return filePath;
};

const removeFileIfExists = (filePath: string): void => {
  if (existsSync(filePath)) {
    unlinkSync(filePath);
  }
};

describe('vars usage validator', () => {
  it('fails on an undefined vars reference with file location and suggestion', () => {
    const tempPath = writeTempMdx(
      'docs/_tmp-undef.mdx',
      '{vars.does.not.exist}\n'
    );

    try {
      const result = runVarsCheck();

      expect(result.status).not.toBe(0);
      expect(result.output).toContain('undefined-reference');
      expect(result.output).toContain('docs/_tmp-undef.mdx:1:2');
      expect(result.output).toContain('vars.does.not.exist');
      expect(result.output).toMatch(/did you mean vars\.[\w.]+/);
    } finally {
      removeFileIfExists(tempPath);
    }
  });

  it('fails on a raw vars URL drift outside a safelisted context', () => {
    const tempPath = writeTempMdx(
      'docs/_tmp-drift.mdx',
      'This page points at https://app.factory.ai/cli directly.\n'
    );

    try {
      const result = runVarsCheck();

      expect(result.status).not.toBe(0);
      expect(result.output).toContain('drift');
      expect(result.output).toContain('docs/_tmp-drift.mdx:1:21');
      expect(result.output).toContain('https://app.factory.ai/cli');
      expect(result.output).toMatch(/vars\.(install\.macos|urls\.app)/);
    } finally {
      removeFileIfExists(tempPath);
    }
  });

  it('fails on a raw vars email drift outside a safelisted context', () => {
    const tempPath = writeTempMdx(
      'docs/_tmp-email-drift.mdx',
      'Email support@factory.ai directly.\n'
    );

    try {
      const result = runVarsCheck(['docs/_tmp-email-drift.mdx']);

      expect(result.status).not.toBe(0);
      expect(result.output).toContain('drift');
      expect(result.output).toContain('docs/_tmp-email-drift.mdx:1:7');
      expect(result.output).toContain('support@factory.ai');
      expect(result.output).toContain('vars.emails.support');
    } finally {
      removeFileIfExists(tempPath);
    }
  });

  it('fails on Factory AI body-copy inconsistency with canonical form', () => {
    const tempPath = writeTempMdx(
      'docs/_tmp-space.mdx',
      'Welcome to Factory AI.\n'
    );

    try {
      const result = runVarsCheck();

      expect(result.status).not.toBe(0);
      expect(result.output).toContain('inconsistency');
      expect(result.output).toContain('docs/_tmp-space.mdx:1:12');
      expect(result.output).toContain('Factory AI');
      expect(result.output).toContain('canonical form: Factory');
    } finally {
      removeFileIfExists(tempPath);
    }
  });

  it('fails on an undefined vars reference inside a JSX attribute expression', () => {
    const tempPath = writeTempMdx(
      'docs/_tmp-jsx-attr-undef.mdx',
      '<a href={vars.urls.docs.extra}>x</a>\n'
    );

    try {
      const result = runVarsCheck(['docs/_tmp-jsx-attr-undef.mdx']);

      expect(result.status).not.toBe(0);
      expect(result.output).toContain('undefined-reference');
      expect(result.output).toContain('docs/_tmp-jsx-attr-undef.mdx');
      expect(result.output).toContain('vars.urls.docs.extra');
      expect(result.output).toMatch(/did you mean vars\.urls\.docs/);
    } finally {
      removeFileIfExists(tempPath);
    }
  });

  it('fails on a raw vars URL drift inside a JSX string attribute', () => {
    const tempPath = writeTempMdx(
      'docs/_tmp-jsx-attr-string-drift.mdx',
      '<Link href="https://app.factory.ai/cli">x</Link>\n'
    );

    try {
      const result = runVarsCheck(['docs/_tmp-jsx-attr-string-drift.mdx']);

      expect(result.status).not.toBe(0);
      expect(result.output).toContain('drift');
      expect(result.output).toContain('docs/_tmp-jsx-attr-string-drift.mdx');
      expect(result.output).toContain('https://app.factory.ai/cli');
      expect(result.output).toMatch(/vars\.(install\.macos|urls\.app)/);
    } finally {
      removeFileIfExists(tempPath);
    }
  });

  it('fails on a raw vars URL drift inside a JSX expression string attribute', () => {
    const tempPath = writeTempMdx(
      'docs/_tmp-jsx-attr-expression-drift.mdx',
      '<Link href={"https://app.factory.ai/cli"}>x</Link>\n'
    );

    try {
      const result = runVarsCheck(['docs/_tmp-jsx-attr-expression-drift.mdx']);

      expect(result.status).not.toBe(0);
      expect(result.output).toContain('drift');
      expect(result.output).toContain(
        'docs/_tmp-jsx-attr-expression-drift.mdx'
      );
      expect(result.output).toContain('https://app.factory.ai/cli');
      expect(result.output).toMatch(/vars\.(install\.macos|urls\.app)/);
    } finally {
      removeFileIfExists(tempPath);
    }
  });

  it('fails on a raw vars URL drift inside a Markdown link URL', () => {
    const tempPath = writeTempMdx(
      'docs/_tmp-md-link-drift.mdx',
      '[install](https://app.factory.ai/cli)\n'
    );

    try {
      const result = runVarsCheck(['docs/_tmp-md-link-drift.mdx']);

      expect(result.status).not.toBe(0);
      expect(result.output).toContain('drift');
      expect(result.output).toContain('docs/_tmp-md-link-drift.mdx');
      expect(result.output).toContain('https://app.factory.ai/cli');
      expect(result.output).toMatch(/vars\.(install\.macos|urls\.app)/);
    } finally {
      removeFileIfExists(tempPath);
    }
  });

  it('fails on Markdown image URL drift and title inconsistency', () => {
    const tempPath = writeTempMdx(
      'docs/_tmp-md-image-drift.mdx',
      '![logo](https://downloads.factory.ai/logo.png "Factory AI")\n'
    );

    try {
      const result = runVarsCheck(['docs/_tmp-md-image-drift.mdx']);

      expect(result.status).not.toBe(0);
      expect(result.output).toContain('drift');
      expect(result.output).toContain('inconsistency');
      expect(result.output).toContain('docs/_tmp-md-image-drift.mdx');
      expect(result.output).toContain('https://downloads.factory.ai');
      expect(result.output).toContain('vars.urls.downloads');
      expect(result.output).toContain('Factory AI');
      expect(result.output).toContain('canonical form: Factory');
    } finally {
      removeFileIfExists(tempPath);
    }
  });

  it('fails on Factory AI inconsistency inside JSX text children', () => {
    const tempPath = writeTempMdx(
      'docs/_tmp-jsx-text-inconsistency.mdx',
      '<Card>Use Factory AI today</Card>\n'
    );

    try {
      const result = runVarsCheck(['docs/_tmp-jsx-text-inconsistency.mdx']);

      expect(result.status).not.toBe(0);
      expect(result.output).toContain('inconsistency');
      expect(result.output).toContain('docs/_tmp-jsx-text-inconsistency.mdx');
      expect(result.output).toContain('Factory AI');
      expect(result.output).toContain('canonical form: Factory');
    } finally {
      removeFileIfExists(tempPath);
    }
  });

  it('fails on Markdown definition URL drift and title inconsistency', () => {
    const tempPath = writeTempMdx(
      'docs/_tmp-md-definition-drift.mdx',
      '[install][factory-cli]\n\n[factory-cli]: https://app.factory.ai/cli "Factory AI"\n'
    );

    try {
      const result = runVarsCheck(['docs/_tmp-md-definition-drift.mdx']);

      expect(result.status).not.toBe(0);
      expect(result.output).toContain('drift');
      expect(result.output).toContain('inconsistency');
      expect(result.output).toContain('docs/_tmp-md-definition-drift.mdx');
      expect(result.output).toContain('https://app.factory.ai/cli');
      expect(result.output).toMatch(/vars\.(install\.macos|urls\.app)/);
      expect(result.output).toContain('Factory AI');
    } finally {
      removeFileIfExists(tempPath);
    }
  });

  it('fails on Markdown image-reference alt inconsistency', () => {
    const tempPath = writeTempMdx(
      'docs/_tmp-md-image-reference-inconsistency.mdx',
      '![Factory AI][logo]\n\n[logo]: /images/droid_ascii.gif\n'
    );

    try {
      const result = runVarsCheck([
        'docs/_tmp-md-image-reference-inconsistency.mdx',
      ]);

      expect(result.status).not.toBe(0);
      expect(result.output).toContain('inconsistency');
      expect(result.output).toContain(
        'docs/_tmp-md-image-reference-inconsistency.mdx'
      );
      expect(result.output).toContain('Factory AI');
      expect(result.output).toContain('canonical form: Factory');
    } finally {
      removeFileIfExists(tempPath);
    }
  });

  it('fails on stale generated vars.mdx and restores the fixture byte-for-byte', () => {
    const originalGeneratedVarsMdx = readFileSync(generatedVarsMdxPath, 'utf8');

    try {
      writeFileSync(
        generatedVarsMdxPath,
        `${originalGeneratedVarsMdx}\n{/* drift marker */}\n`,
        'utf8'
      );

      const result = runVarsCheck();

      expect(result.status).not.toBe(0);
      expect(result.output).toContain('codegen-staleness');
      expect(result.output).toContain('docs/snippets/vars.mdx');
      expect(result.output).toContain('pnpm vars:build');
    } finally {
      writeFileSync(generatedVarsMdxPath, originalGeneratedVarsMdx, 'utf8');
      expect(readFileSync(generatedVarsMdxPath, 'utf8')).toBe(
        originalGeneratedVarsMdx
      );
    }
  });

  it('passes cleanly on the real repo state', () => {
    const result = runVarsCheck();

    expect(result.status).toBe(0);
    expect(result.output).toContain(
      '0 undefined refs, 0 drift hits, 0 inconsistencies, 0 staleness'
    );
  });

  it('does not scan docs/jp', () => {
    const tempPath = writeTempMdx(
      'docs/jp/_tmp-jsx-and-md-surfaces.mdx',
      [
        '<a href={vars.urls.docs.extra}>x</a>',
        '<Link href="https://app.factory.ai/cli">x</Link>',
        '[install](https://app.factory.ai/cli)',
        '![logo](https://downloads.factory.ai/logo.png "Factory AI")',
        '<Card>Use Factory AI today</Card>',
        '',
      ].join('\n')
    );

    try {
      const result = runVarsCheck();

      expect(result.status).toBe(0);
      expect(result.output).toContain('0 undefined refs');
      expect(result.output).toContain('0 drift hits');
      expect(result.output).toContain('0 inconsistencies');
    } finally {
      removeFileIfExists(tempPath);
    }
  });

  it('does not scan docs/snippets/leaderboards', () => {
    const tempPath = writeTempMdx(
      'docs/snippets/leaderboards/_tmp-jsx-and-md-surfaces.mdx',
      [
        'export const FOO = 1;',
        '',
        '<a href={vars.urls.docs.extra}>x</a>',
        '<Link href="https://app.factory.ai/cli">x</Link>',
        '[install](https://app.factory.ai/cli)',
        '![logo](https://downloads.factory.ai/logo.png "Factory AI")',
        '<Card>Use Factory AI today</Card>',
        '',
      ].join('\n')
    );

    try {
      const result = runVarsCheck();

      expect(result.status).toBe(0);
      expect(result.output).toContain('0 undefined refs');
      expect(result.output).toContain('0 drift hits');
      expect(result.output).toContain('0 inconsistencies');
    } finally {
      removeFileIfExists(tempPath);
    }
  });

  it('validates arbitrary-depth refs for staged-files-scoped invocations', () => {
    const tempPath = writeTempMdx(
      'docs/_tmp-staged-scope.mdx',
      '{vars.urls.docs.extra}\n'
    );

    try {
      const result = runVarsCheck(['docs/_tmp-staged-scope.mdx']);

      expect(result.status).not.toBe(0);
      expect(result.output).toContain('undefined-reference');
      expect(result.output).toContain('vars.urls.docs.extra');
      expect(result.output).toMatch(/did you mean vars\.urls\.docs/);
    } finally {
      removeFileIfExists(tempPath);
    }
  });
});
