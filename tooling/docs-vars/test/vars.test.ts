import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { VarsSchema, type VarsSchema as VarsSchemaType } from '../src/schema';
import { vars } from '../src/vars';

type Expect<T extends true> = T;
type IsExact<T, Expected> =
  (<G>() => G extends T ? 1 : 2) extends <G>() => G extends Expected ? 1 : 2
    ? (<G>() => G extends Expected ? 1 : 2) extends <G>() => G extends T ? 1 : 2
      ? true
      : false
    : false;

type _ProductNameIsConstNarrowed = Expect<
  IsExact<typeof vars.products.droid, 'Droid'>
>;
type _PlanKeysAreConstNarrowed = Expect<
  IsExact<keyof typeof vars.plans, 'Pro' | 'Plus' | 'Max' | 'Enterprise'>
>;

const assertSatisfiesVarsSchema = <T extends VarsSchemaType>(value: T): T =>
  value;

const collectKeysAndValues = (value: unknown): string[] => {
  if (Array.isArray(value)) {
    return value.flatMap((item) => collectKeysAndValues(item));
  }

  if (value && typeof value === 'object') {
    return Object.entries(value).flatMap(([key, item]) => [
      key,
      ...collectKeysAndValues(item),
    ]);
  }

  return typeof value === 'string' ? [value] : [];
};

describe('@factory/docs-vars source of truth', () => {
  it('validates vars through the zod schema and keeps vars const-narrowed', () => {
    const narrowedVars = assertSatisfiesVarsSchema(vars);
    const varsSource = readFileSync(
      new URL('../src/vars.ts', import.meta.url),
      'utf8'
    );

    expect(VarsSchema.safeParse(vars).success).toBe(true);
    expect(narrowedVars.products.droid).toBe('Droid');
    expect(varsSource).toContain('as const satisfies VarsSchema');
  });

  it('contains exactly the sanctioned plan tiers and no Ultra references', () => {
    const expectedPlans = ['Pro', 'Plus', 'Max', 'Enterprise'];

    expect(new Set(Object.keys(vars.plans))).toEqual(new Set(expectedPlans));
    expect(Object.keys(vars.plans)).toHaveLength(expectedPlans.length);
    expect(collectKeysAndValues(vars).join('\n')).not.toMatch(/\bUltra\b/i);
  });

  it('contains the sanctioned install commands verbatim', () => {
    expect(vars.install.macos).toBe(
      'curl -fsSL https://app.factory.ai/cli | sh'
    );
    expect(vars.install.windows).toBe(
      'irm https://app.factory.ai/cli/windows | iex'
    );
    expect(vars.install.npm).toBe('npm install -g droid');
    expect(vars.install.brew).toBe('brew install --cask droid');
  });

  it('contains the sanctioned URLs, emails, products, and legal strings', () => {
    expect(vars.urls).toMatchObject({
      factory: 'https://factory.ai',
      app: 'https://app.factory.ai',
      api: 'https://api.factory.ai',
      docs: 'https://docs.factory.ai',
      downloads: 'https://downloads.factory.ai',
      trust: 'https://trust.factory.ai',
      discord: 'https://discord.gg/zuudFXxg69',
      github: {
        org: 'https://github.com/Factory-AI',
        repo: {
          factory: 'https://github.com/Factory-AI/factory',
          action: 'https://github.com/Factory-AI/droid-action',
          sdkTs: 'https://github.com/Factory-AI/droid-sdk-typescript',
          sdkPy: 'https://github.com/Factory-AI/droid-sdk-python',
          plugins: 'https://github.com/Factory-AI/factory-plugins',
          eslint: 'https://github.com/Factory-AI/eslint-plugin',
        },
      },
    });
    expect(Object.keys(vars.urls)).toEqual(
      expect.arrayContaining([
        'factory',
        'app',
        'api',
        'docs',
        'downloads',
        'trust',
        'discord',
        'github',
      ])
    );
    expect(vars.emails.support).toBe('support@factory.ai');
    expect(vars.emails.security).toBe('security@factory.ai');
    expect(Object.values(vars.products).sort()).toEqual(
      [
        'Droid',
        'Droid CLI',
        'Factory App',
        'Droid Exec',
        'Droid Shield',
        'Droid Shield Plus',
        'Droid Core',
        'Factory Missions',
        'Factory',
      ].sort()
    );
    expect(vars.legal.entity).toBe('Factory AI');
    expect(vars.legal.entity).not.toContain('Inc');
    expect(vars.legal.copyright).toBe(
      '© 2025-2026 Factory AI. All rights reserved.'
    );
  });
});
