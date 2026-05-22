import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import ts from 'typescript';

import { renderVarsMdx, type DocsVars } from '../src/render';
import { VarsSchema } from '../src/schema';

type Point = {
  line: number;
  column: number;
  offset?: number;
};

type Position = {
  start: Point;
  end: Point;
};

type MdxNode = {
  type: string;
  value?: unknown;
  name?: string;
  children?: MdxNode[];
  attributes?: MdxNode[];
  url?: unknown;
  title?: unknown;
  alt?: unknown;
  position?: Position;
};

type StringSurface = {
  node: MdxNode;
  ancestors: MdxNode[];
  value: string;
};

type FindingKind =
  | 'undefined-reference'
  | 'drift'
  | 'inconsistency'
  | 'codegen-staleness';

type Finding = {
  kind: FindingKind;
  filePath: string;
  line: number;
  column: number;
  message: string;
};

type VarsMetadata = {
  validPaths: Set<string>;
  valueByPath: Map<string, string>;
};

type DriftRule = {
  literal: string;
  varPath: string;
};

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const packageRoot = resolve(scriptDirectory, '..');
const repoRoot = resolve(packageRoot, '../..');
const docsRoot = resolve(repoRoot, 'docs');
const varsSourcePath = resolve(packageRoot, 'src/vars.ts');
const generatedVarsMdxPath = resolve(repoRoot, 'docs/snippets/vars.mdx');

const varReferencePattern = /\bvars(?:\.[A-Za-z_$][\w$]*)+\b/g;
const inconsistencyRules = [
  {
    pattern: /\bFactory AI\b/g,
    canonical: 'Factory',
  },
  {
    pattern: /\bFactoryAI\b/g,
    canonical: 'Factory or Factory-AI',
  },
  {
    pattern: /\bfactoryai\b/g,
    canonical: 'Factory or Factory-AI',
  },
  {
    pattern: /\bdroid@factory\.ai\b/g,
    canonical: 'support@factory.ai',
  },
];
const legalContextPattern =
  /\b(copyright|all rights reserved|legal|liability|liable|warranty|warranties|damages|terms|privacy)\b|©/i;
const skippedTextAncestorTypes = new Set(['code', 'inlineCode']);
const markdownStringPropertiesByNodeType: Record<string, string[]> = {
  definition: ['url', 'title'],
  image: ['url', 'title', 'alt'],
  imageReference: ['alt'],
  link: ['url', 'title'],
  linkReference: ['url', 'title'],
};
const expressionNodeTypes = new Set([
  'mdxFlowExpression',
  'mdxTextExpression',
  'mdxJsxExpressionAttribute',
  'mdxJsxAttributeValueExpression',
]);

const toRepoRelativePath = (filePath: string): string =>
  relative(repoRoot, filePath).split(sep).join('/');

const toDisplayPath = (filePath: string): string =>
  toRepoRelativePath(filePath);

const shouldIgnoreMdxPath = (filePath: string): boolean => {
  const relativePath = toRepoRelativePath(filePath);

  return (
    relativePath === 'docs/jp' ||
    relativePath.startsWith('docs/jp/') ||
    relativePath === 'docs/snippets' ||
    relativePath.startsWith('docs/snippets/')
  );
};

const isMdxPath = (filePath: string): boolean => filePath.endsWith('.mdx');

const collectMdxFiles = (directoryPath: string): string[] => {
  const files: string[] = [];

  for (const entry of readdirSync(directoryPath, { withFileTypes: true })) {
    const entryPath = resolve(directoryPath, entry.name);

    if (entry.isDirectory()) {
      if (!shouldIgnoreMdxPath(entryPath)) {
        files.push(...collectMdxFiles(entryPath));
      }

      continue;
    }

    if (
      entry.isFile() &&
      isMdxPath(entryPath) &&
      !shouldIgnoreMdxPath(entryPath)
    ) {
      files.push(entryPath);
    }
  }

  return files.sort((left, right) =>
    toRepoRelativePath(left).localeCompare(toRepoRelativePath(right))
  );
};

const resolveInputFiles = (args: string[]): string[] => {
  if (args.length === 0) {
    return collectMdxFiles(docsRoot);
  }

  return args
    .filter(isMdxPath)
    .map((filePath) => resolve(repoRoot, filePath))
    .filter(
      (filePath) =>
        existsSync(filePath) &&
        statSync(filePath).isFile() &&
        !shouldIgnoreMdxPath(filePath)
    )
    .sort((left, right) =>
      toRepoRelativePath(left).localeCompare(toRepoRelativePath(right))
    );
};

const unwrapExpression = (expression: ts.Expression): ts.Expression => {
  if (
    ts.isSatisfiesExpression(expression) ||
    ts.isAsExpression(expression) ||
    ts.isParenthesizedExpression(expression)
  ) {
    return unwrapExpression(expression.expression);
  }

  return expression;
};

const getPropertyName = (name: ts.PropertyName): string | undefined => {
  if (
    ts.isIdentifier(name) ||
    ts.isStringLiteral(name) ||
    ts.isNumericLiteral(name)
  ) {
    return name.text;
  }

  return undefined;
};

const collectVarsLeaves = (
  expression: ts.Expression,
  pathSegments: string[],
  valueByPath: Map<string, string>
): void => {
  const unwrappedExpression = unwrapExpression(expression);

  if (ts.isObjectLiteralExpression(unwrappedExpression)) {
    for (const property of unwrappedExpression.properties) {
      if (!ts.isPropertyAssignment(property)) {
        continue;
      }

      const propertyName = getPropertyName(property.name);

      if (!propertyName) {
        continue;
      }

      collectVarsLeaves(
        property.initializer,
        [...pathSegments, propertyName],
        valueByPath
      );
    }

    return;
  }

  if (
    ts.isStringLiteral(unwrappedExpression) ||
    ts.isNoSubstitutionTemplateLiteral(unwrappedExpression)
  ) {
    valueByPath.set(pathSegments.join('.'), unwrappedExpression.text);
  }
};

const parseVarsSource = (): VarsMetadata => {
  const varsSource = readFileSync(varsSourcePath, 'utf8');
  const sourceFile = ts.createSourceFile(
    varsSourcePath,
    varsSource,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS
  );
  const valueByPath = new Map<string, string>();

  sourceFile.forEachChild((node) => {
    if (!ts.isVariableStatement(node)) {
      return;
    }

    for (const declaration of node.declarationList.declarations) {
      if (
        ts.isIdentifier(declaration.name) &&
        declaration.name.text === 'vars' &&
        declaration.initializer
      ) {
        collectVarsLeaves(declaration.initializer, ['vars'], valueByPath);
      }
    }
  });

  if (valueByPath.size === 0) {
    throw new Error(`Unable to AST-parse vars source at ${varsSourcePath}`);
  }

  return {
    validPaths: new Set(valueByPath.keys()),
    valueByPath,
  };
};

const loadRuntimeVars = async (): Promise<DocsVars> => {
  const cacheBustedVarsUrl = `${pathToFileURL(varsSourcePath).href}?t=${Date.now()}`;
  const varsModule = (await import(cacheBustedVarsUrl)) as { vars: unknown };

  return VarsSchema.parse(varsModule.vars) as DocsVars;
};

const buildDriftRules = (metadata: VarsMetadata): DriftRule[] => {
  const rules: DriftRule[] = [
    {
      literal: 'https://app.factory.ai/cli/windows',
      varPath: 'vars.install.windows',
    },
    {
      literal: 'https://app.factory.ai/cli',
      varPath: 'vars.install.macos',
    },
  ];

  for (const [varPath, literal] of metadata.valueByPath) {
    if (
      varPath.startsWith('vars.urls.') ||
      varPath.startsWith('vars.emails.') ||
      varPath.startsWith('vars.install.')
    ) {
      rules.push({ literal, varPath });
    }
  }

  const dedupedRules = new Map<string, DriftRule>();

  for (const rule of rules) {
    const existingRule = dedupedRules.get(rule.literal);

    if (!existingRule || rule.varPath.startsWith('vars.install.')) {
      dedupedRules.set(rule.literal, rule);
    }
  }

  return [...dedupedRules.values()].sort(
    (left, right) => right.literal.length - left.literal.length
  );
};

const pointFromOffset = (content: string, offset: number): Point => {
  const precedingContent = content.slice(0, offset);
  const lines = precedingContent.split('\n');

  return {
    line: lines.length,
    column: lines[lines.length - 1].length + 1,
    offset,
  };
};

const pointForNodeValueIndex = (
  node: MdxNode,
  content: string,
  valueIndex: number
): Point => {
  if (typeof node.position?.start.offset === 'number') {
    return pointFromOffset(content, node.position.start.offset + valueIndex);
  }

  return {
    line: node.position?.start.line ?? 1,
    column: (node.position?.start.column ?? 1) + valueIndex,
  };
};

const pointForNodeStringValueIndex = (
  node: MdxNode,
  content: string,
  value: string,
  valueIndex: number
): Point => {
  const startOffset = node.position?.start.offset;
  const endOffset = node.position?.end.offset;

  if (typeof startOffset === 'number' && typeof endOffset === 'number') {
    const sourceSlice = content.slice(startOffset, endOffset);
    const sourceValueIndex = sourceSlice.indexOf(value);

    if (sourceValueIndex !== -1) {
      return pointFromOffset(
        content,
        startOffset + sourceValueIndex + valueIndex
      );
    }
  }

  return pointForNodeValueIndex(node, content, valueIndex);
};

const pointForStringSurfaceIndex = (
  surface: StringSurface,
  content: string,
  valueIndex: number
): Point =>
  pointForNodeStringValueIndex(
    surface.node,
    content,
    surface.value,
    valueIndex
  );

const createFinding = (
  kind: FindingKind,
  filePath: string,
  point: Point,
  message: string
): Finding => ({
  kind,
  filePath,
  line: point.line,
  column: point.column,
  message,
});

const levenshteinDistance = (left: string, right: string): number => {
  const distances = Array.from(
    { length: left.length + 1 },
    (_, index) => index
  );

  for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
    let previousDistance = rightIndex;

    for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
      const currentDistance = distances[leftIndex - 1];
      const substitutionCost =
        left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1;

      distances[leftIndex - 1] = previousDistance;
      previousDistance = Math.min(
        previousDistance + 1,
        distances[leftIndex] + 1,
        currentDistance + substitutionCost
      );
    }

    distances[left.length] = previousDistance;
  }

  return distances[left.length];
};

const suggestNearestPath = (
  varPath: string,
  validPaths: Set<string>
): string => {
  let nearestPath = 'vars.urls.docs';
  let nearestDistance = Number.POSITIVE_INFINITY;

  for (const validPath of [...validPaths].sort()) {
    const distance = levenshteinDistance(varPath, validPath);

    if (distance < nearestDistance) {
      nearestDistance = distance;
      nearestPath = validPath;
    }
  }

  return nearestPath;
};

const validateExpressionRefs = (
  filePath: string,
  content: string,
  tree: MdxNode,
  metadata: VarsMetadata
): Finding[] => {
  const findings: Finding[] = [];

  walkNodes(tree, [], (node) => {
    if (!expressionNodeTypes.has(node.type) || typeof node.value !== 'string') {
      return;
    }

    const nodeValue = node.value;

    for (const match of nodeValue.matchAll(varReferencePattern)) {
      const varPath = match[0];

      if (metadata.validPaths.has(varPath)) {
        continue;
      }

      const point = pointForNodeStringValueIndex(
        node,
        content,
        nodeValue,
        match.index ?? 0
      );
      const suggestion = suggestNearestPath(varPath, metadata.validPaths);

      findings.push(
        createFinding(
          'undefined-reference',
          filePath,
          point,
          `Undefined vars reference ${varPath}; did you mean ${suggestion}?`
        )
      );
    }
  });

  return findings;
};

const hasSkippedAncestor = (ancestors: MdxNode[]): boolean =>
  ancestors.some((ancestor) =>
    ancestor.type ? skippedTextAncestorTypes.has(ancestor.type) : false
  );

const isMdxNode = (value: unknown): value is MdxNode =>
  typeof value === 'object' &&
  value !== null &&
  typeof (value as { type?: unknown }).type === 'string';

const walkNodes = (
  node: MdxNode,
  ancestors: MdxNode[],
  visitor: (node: MdxNode, ancestors: MdxNode[]) => void
): void => {
  visitor(node, ancestors);

  const childAncestors = [...ancestors, node];

  if (Array.isArray(node.attributes)) {
    for (const attribute of node.attributes) {
      walkNodes(attribute, childAncestors, visitor);
    }
  }

  if (isMdxNode(node.value)) {
    walkNodes(node.value, childAncestors, visitor);
  }

  if (Array.isArray(node.children)) {
    for (const child of node.children) {
      walkNodes(child, childAncestors, visitor);
    }
  }
};

const isRangeCovered = (
  ranges: Array<{ start: number; end: number }>,
  start: number,
  end: number
): boolean => ranges.some((range) => start >= range.start && end <= range.end);

const isPreMigrationDriftContext = (
  relativePath: string,
  literal: string,
  nodeValue: string
): boolean => {
  if (
    literal === 'https://app.factory.ai' &&
    (relativePath === 'docs/integrations/jetbrains.mdx' ||
      relativePath === 'docs/integrations/zed.mdx') &&
    /\b(sign up|API key)\b/i.test(nodeValue)
  ) {
    return true;
  }

  if (
    literal === 'support@factory.ai' &&
    relativePath === 'docs/integrations/ide-integrations.mdx' &&
    /\badditional help\b/i.test(nodeValue)
  ) {
    return true;
  }

  if (
    literal === 'support@factory.ai' &&
    relativePath === 'docs/cli/account/droid-shield.mdx' &&
    /\bfalse positives?\b/i.test(nodeValue)
  ) {
    return true;
  }

  if (
    literal === 'https://factory.ai' &&
    relativePath ===
      'docs/guides/power-user/evaluating-context-compression.mdx' &&
    /\/news\/evaluating-compression\b/i.test(nodeValue)
  ) {
    return true;
  }

  return false;
};

const collectStringSurfaces = (tree: MdxNode): StringSurface[] => {
  const surfaces: StringSurface[] = [];

  walkNodes(tree, [], (node, ancestors) => {
    if (
      node.type === 'text' &&
      typeof node.value === 'string' &&
      !hasSkippedAncestor(ancestors)
    ) {
      surfaces.push({
        node,
        ancestors,
        value: node.value,
      });
    }

    const markdownStringProperties =
      markdownStringPropertiesByNodeType[node.type] ?? [];

    for (const property of markdownStringProperties) {
      const propertyValue = (node as Record<string, unknown>)[property];

      if (typeof propertyValue === 'string' && propertyValue.length > 0) {
        surfaces.push({
          node,
          ancestors,
          value: propertyValue,
        });
      }
    }

    if (node.type === 'mdxJsxAttribute' && typeof node.value === 'string') {
      surfaces.push({
        node,
        ancestors,
        value: node.value,
      });
    }

    if (
      (node.type === 'mdxJsxAttributeValueExpression' ||
        node.type === 'mdxJsxExpressionAttribute') &&
      typeof node.value === 'string'
    ) {
      surfaces.push({
        node,
        ancestors,
        value: node.value,
      });
    }
  });

  return surfaces;
};

const detectDrift = (
  filePath: string,
  content: string,
  tree: MdxNode,
  driftRules: DriftRule[]
): Finding[] => {
  const findings: Finding[] = [];
  const relativePath = toRepoRelativePath(filePath);

  for (const surface of collectStringSurfaces(tree)) {
    const coveredRanges: Array<{ start: number; end: number }> = [];

    for (const rule of driftRules) {
      let searchIndex = surface.value.indexOf(rule.literal);

      while (searchIndex !== -1) {
        const endIndex = searchIndex + rule.literal.length;

        if (
          !isRangeCovered(coveredRanges, searchIndex, endIndex) &&
          !isPreMigrationDriftContext(relativePath, rule.literal, surface.value)
        ) {
          coveredRanges.push({ start: searchIndex, end: endIndex });

          findings.push(
            createFinding(
              'drift',
              filePath,
              pointForStringSurfaceIndex(surface, content, searchIndex),
              `Raw value "${rule.literal}" should use ${rule.varPath}.`
            )
          );
        }

        searchIndex = surface.value.indexOf(rule.literal, searchIndex + 1);
      }
    }
  }

  return findings;
};

const isLegalContext = (surface: StringSurface): boolean => {
  const ancestorNames = [...surface.ancestors, surface.node]
    .map((ancestor) => ancestor.name)
    .filter((name): name is string => Boolean(name))
    .join(' ');

  return legalContextPattern.test(`${surface.value} ${ancestorNames}`);
};

const detectInconsistencies = (
  filePath: string,
  content: string,
  tree: MdxNode
): Finding[] => {
  const findings: Finding[] = [];

  for (const surface of collectStringSurfaces(tree)) {
    for (const rule of inconsistencyRules) {
      for (const match of surface.value.matchAll(rule.pattern)) {
        const matchedText = match[0];

        if (matchedText === 'Factory AI' && isLegalContext(surface)) {
          continue;
        }

        findings.push(
          createFinding(
            'inconsistency',
            filePath,
            pointForStringSurfaceIndex(surface, content, match.index ?? 0),
            `Found "${matchedText}" outside an allowed context; canonical form: ${rule.canonical}.`
          )
        );
      }
    }
  }

  return findings;
};

const checkGeneratedVarsStaleness = async (): Promise<Finding[]> => {
  const docsVars = await loadRuntimeVars();
  const expectedGeneratedMdx = renderVarsMdx(docsVars);
  const actualGeneratedMdx = readFileSync(generatedVarsMdxPath, 'utf8');

  if (actualGeneratedMdx === expectedGeneratedMdx) {
    return [];
  }

  const expectedLines = expectedGeneratedMdx.split('\n');
  const actualLines = actualGeneratedMdx.split('\n');
  const firstDifferentLineIndex = actualLines.findIndex(
    (line, index) => line !== expectedLines[index]
  );
  const line =
    firstDifferentLineIndex === -1
      ? actualLines.length
      : firstDifferentLineIndex + 1;

  return [
    createFinding(
      'codegen-staleness',
      generatedVarsMdxPath,
      { line, column: 1 },
      'Generated vars snippet is stale relative to tooling/docs-vars/src/vars.ts; run pnpm vars:build.'
    ),
  ];
};

const parseMdx = async (content: string): Promise<MdxNode> => {
  const { createProcessor } = await import('@mdx-js/mdx');
  const processor = createProcessor({ format: 'mdx' });

  return processor.parse(content) as MdxNode;
};

const validateMdxFile = async (
  filePath: string,
  metadata: VarsMetadata,
  driftRules: DriftRule[]
): Promise<Finding[]> => {
  const content = readFileSync(filePath, 'utf8');
  const tree = await parseMdx(content);

  return [
    ...validateExpressionRefs(filePath, content, tree, metadata),
    ...detectDrift(filePath, content, tree, driftRules),
    ...detectInconsistencies(filePath, content, tree),
  ];
};

const formatFinding = (finding: Finding): string =>
  `${finding.kind} ${toDisplayPath(finding.filePath)}:${finding.line}:${finding.column} - ${finding.message}`;

const printSummary = (findings: Finding[]): void => {
  const undefinedRefs = findings.filter(
    (finding) => finding.kind === 'undefined-reference'
  ).length;
  const driftHits = findings.filter(
    (finding) => finding.kind === 'drift'
  ).length;
  const inconsistencies = findings.filter(
    (finding) => finding.kind === 'inconsistency'
  ).length;
  const staleness = findings.filter(
    (finding) => finding.kind === 'codegen-staleness'
  ).length;

  console.log(
    `vars:check summary: ${undefinedRefs} undefined refs, ${driftHits} drift hits, ${inconsistencies} inconsistencies, ${staleness} staleness`
  );
};

const run = async (): Promise<void> => {
  const metadata = parseVarsSource();
  const driftRules = buildDriftRules(metadata);
  const files = resolveInputFiles(process.argv.slice(2));
  const findings: Finding[] = [];

  for (const filePath of files) {
    findings.push(...(await validateMdxFile(filePath, metadata, driftRules)));
  }

  findings.push(...(await checkGeneratedVarsStaleness()));

  if (findings.length > 0) {
    console.error(findings.map(formatFinding).join('\n'));
  }

  printSummary(findings);

  if (findings.length > 0) {
    process.exitCode = 1;
  }
};

await run().catch((error: unknown) => {
  const message =
    error instanceof Error ? error.stack || error.message : String(error);

  console.error(message);
  process.exit(1);
});
