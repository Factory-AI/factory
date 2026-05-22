import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import { prepareMintlifyDocsWorkspace } from './mintlify-docs-workspace';

export type MintlifyBuildCommand = 'validate' | 'broken-links';

export type MintlifyBuildCommandResult = {
  command: MintlifyBuildCommand;
  exitCode: number;
  stderr: string;
  stdout: string;
};

export type RunMintlifyCommandOptions = {
  cwd: string;
  env: NodeJS.ProcessEnv & { PATH: string };
};

export type RunMintlifyCommand = (
  command: MintlifyBuildCommand,
  options: RunMintlifyCommandOptions
) => MintlifyBuildCommandResult;

export type MintlifyBuildCheckResult = {
  commands: MintlifyBuildCommandResult[];
  docsRoot: string;
  preparedDocsRoot: string;
  success: boolean;
};

export type CheckMintlifyBuildOptions = {
  docsRoot?: string;
  runCommand?: RunMintlifyCommand;
};

type FormatOptions = {
  cwd?: string;
};

const node22Bin = '/opt/homebrew/opt/node@22/bin';
const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = resolve(packageRoot, '../..');
const defaultDocsRoot = resolve(repoRoot, 'docs');

const normalizePathForMatching = (filePath: string): string =>
  filePath.replaceAll('\\', '/');

const withNode22Path = (env: NodeJS.ProcessEnv = process.env) => ({
  ...env,
  PATH: `${node22Bin}:${env.PATH ?? ''}`,
});

const defaultRunMintlifyCommand: RunMintlifyCommand = (command, options) => {
  const result = spawnSync('mintlify', [command], {
    cwd: options.cwd,
    encoding: 'utf8',
    env: options.env,
  });

  return {
    command,
    exitCode:
      typeof result.status === 'number'
        ? result.status
        : result.error === undefined
          ? 1
          : 127,
    stderr:
      result.error === undefined
        ? (result.stderr ?? '')
        : `${result.stderr ?? ''}\n${result.error.message}`.trim(),
    stdout: result.stdout ?? '',
  };
};

export const checkMintlifyBuild = (
  options: CheckMintlifyBuildOptions = {}
): MintlifyBuildCheckResult => {
  const docsRoot = resolve(options.docsRoot ?? defaultDocsRoot);
  const runCommand = options.runCommand ?? defaultRunMintlifyCommand;
  const workspace = prepareMintlifyDocsWorkspace(docsRoot);
  const commands: MintlifyBuildCommandResult[] = [];

  try {
    for (const command of ['validate', 'broken-links'] as const) {
      commands.push(
        runCommand(command, {
          cwd: workspace.docsRoot,
          env: withNode22Path(),
        })
      );
    }

    return {
      commands,
      docsRoot,
      preparedDocsRoot: workspace.docsRoot,
      success: commands.every((command) => command.exitCode === 0),
    };
  } finally {
    workspace.cleanup();
  }
};

const formatFilePath = (
  filePath: string,
  cwd: string = process.cwd()
): string => {
  const relativePath = relative(cwd, filePath);

  if (
    relativePath === '' ||
    relativePath.startsWith('..') ||
    isAbsolute(filePath)
  ) {
    return normalizePathForMatching(
      relativePath.startsWith('..') ? filePath : relativePath || filePath
    );
  }

  return normalizePathForMatching(relativePath.split(sep).join('/'));
};

const trimOutput = (output: string): string => output.trim();

const formatCommandOutput = (command: MintlifyBuildCommandResult): string => {
  const lines = [
    `mintlify ${command.command} ${
      command.exitCode === 0 ? 'passed' : 'failed'
    } (exit ${command.exitCode})`,
  ];
  const stdout = trimOutput(command.stdout);
  const stderr = trimOutput(command.stderr);

  if (stdout !== '') {
    lines.push(stdout);
  }

  if (stderr !== '') {
    lines.push(stderr);
  }

  return lines.join('\n');
};

export const formatMintlifyBuildResult = (
  result: MintlifyBuildCheckResult,
  options: FormatOptions = {}
): string => {
  const lines = [
    `Mintlify build check ${result.success ? 'passed' : 'failed'}.`,
    `Source docs: ${formatFilePath(result.docsRoot, options.cwd ?? repoRoot)}`,
    'Prepared docs copy excludes docs/jp/ for M4 validator boundaries.',
  ];

  for (const command of result.commands) {
    lines.push(formatCommandOutput(command));
  }

  return lines.join('\n');
};

const resolveCliInputPath = (inputPath: string): string => {
  if (isAbsolute(inputPath)) {
    return inputPath;
  }

  const cwdPath = resolve(process.cwd(), inputPath);

  if (existsSync(cwdPath)) {
    return cwdPath;
  }

  return resolve(repoRoot, inputPath);
};

const getCliDocsRoot = (args: string[]): string => {
  const inputArgs = args.filter((arg) => arg !== '--');

  return inputArgs.length > 0
    ? resolveCliInputPath(inputArgs[0]!)
    : defaultDocsRoot;
};

export const runMintlifyBuildCli = (
  args: string[] = process.argv.slice(2)
): number => {
  const docsRoot = getCliDocsRoot(args);
  const result = checkMintlifyBuild({ docsRoot });
  const output = formatMintlifyBuildResult(result, { cwd: repoRoot });

  if (result.success) {
    console.log(output);

    return 0;
  }

  console.error(output);

  return 1;
};

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  process.exitCode = runMintlifyBuildCli();
}
