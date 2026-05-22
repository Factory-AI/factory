#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs';
import { relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('../..', import.meta.url));

const allowedVars = new Map([
  ['emails', new Set(['security', 'support'])],
  ['install', new Set(['brew', 'macos', 'npm', 'windows'])],
  ['legal', new Set(['copyright', 'entity'])],
  ['plans', new Set(['Enterprise', 'Max', 'Plus', 'Pro'])],
  [
    'products',
    new Set([
      'droid',
      'droidCli',
      'droidCore',
      'droidExec',
      'droidShield',
      'droidShieldPlus',
      'factory',
      'factoryApp',
      'factoryMissions',
    ]),
  ],
  [
    'urls',
    new Set([
      'api',
      'app',
      'discord',
      'docs',
      'downloads',
      'factory',
      'github',
      'githubOrg',
      'trust',
    ]),
  ],
]);

const ignoredPathParts = [
  ['docs', 'jp'],
  ['docs', 'snippets'],
];

const toRepoRelativeParts = (filePath) =>
  relative(repoRoot, filePath).split(sep).filter(Boolean);

const shouldIgnore = (filePath) => {
  const parts = toRepoRelativeParts(filePath);

  return ignoredPathParts.some((ignoredParts) =>
    ignoredParts.every((part, index) => parts[index] === part)
  );
};

const getLineAndColumn = (content, index) => {
  const preceding = content.slice(0, index);
  const lines = preceding.split('\n');

  return {
    line: lines.length,
    column: lines[lines.length - 1].length + 1,
  };
};

const validateVarPath = (varPath) => {
  const [, category, key] = varPath.split('.');
  const allowedKeys = allowedVars.get(category);

  if (!allowedKeys) {
    return `unknown vars category "${category}"`;
  }

  if (!allowedKeys.has(key)) {
    return `unknown vars.${category} key "${key}"`;
  }

  return undefined;
};

const files = process.argv
  .slice(2)
  .filter((filePath) => filePath.endsWith('.mdx'));
const findings = [];
const varReferencePattern =
  /\{\s*(vars\.[A-Za-z_$][\w$-]*(?:\.[A-Za-z_$][\w$-]*)*)\s*\}/g;

for (const filePath of files) {
  if (shouldIgnore(filePath) || !existsSync(filePath)) {
    continue;
  }

  const content = readFileSync(filePath, 'utf8');
  for (const match of content.matchAll(varReferencePattern)) {
    const varPath = match[1];
    const reason = validateVarPath(varPath);

    if (!reason) {
      continue;
    }

    const { line, column } = getLineAndColumn(content, match.index);
    findings.push(
      `${filePath}:${line}:${column} - Undefined vars reference ${varPath}: ${reason}.`
    );
  }
}

if (findings.length > 0) {
  console.error(findings.join('\n'));
  process.exit(1);
}
