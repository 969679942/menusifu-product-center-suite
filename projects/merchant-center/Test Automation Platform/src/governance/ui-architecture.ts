import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

export const UI_ARCHITECTURE_METRICS = [
  'hardWaitCalls',
  'locatorFallbackCalls',
  'rawLocatorCallsInFlows',
  'rawLocatorCallsInSpecs',
  'directPageFlowConstructionInFlows',
  'directPageFlowConstructionInSpecs',
  'pageImportsApi',
  'pageImportsTestData',
  'testDataImportsApiOrCleanup',
  'utilityImportsPagesOrFlows',
  'serialSuites',
  'formalSpecsWithEmptyOperationReceipts',
  'formalSpecsWithGeneratedTag',
] as const;

export type UiArchitectureMetric = typeof UI_ARCHITECTURE_METRICS[number];

export type UiArchitectureConfig = {
  version: 1;
  layers: {
    pages: string[];
    flows: string[];
    fixtures: string[];
    testData: string[];
    utils: string[];
    specs: string[];
  };
  formalSpecFiles: string[];
  exclude?: string[];
  hotspots?: Array<{ path: string }>;
};

export type UiArchitectureReport = {
  version: 1;
  projectRoot: string;
  metrics: Record<UiArchitectureMetric, number>;
  fileMetrics: Partial<Record<UiArchitectureMetric, Record<string, number>>>;
  hotspots: Record<string, { lines: number; publicMethods: number; importFanOut: number }>;
};

export type UiArchitectureBaseline = {
  version: 1;
  maximums: Record<UiArchitectureMetric, number>;
  fileMaximums: Partial<Record<UiArchitectureMetric, Record<string, number>>>;
  hotspots: Record<string, { maxLines: number; maxPublicMethods: number; maxImportFanOut: number }>;
};

export function inspectUiArchitecture(input: {
  projectRoot: string;
  config: UiArchitectureConfig;
}): UiArchitectureReport {
  const projectRoot = path.resolve(input.projectRoot);
  const filesByLayer = Object.fromEntries(Object.entries(input.config.layers).map(([layer, roots]) => [
    layer,
    collectTypeScriptFiles(projectRoot, roots, input.config.exclude ?? []),
  ])) as Record<keyof UiArchitectureConfig['layers'], string[]>;
  const allFiles = [...new Set(Object.values(filesByLayer).flat())].sort();
  const formalSpecFiles = new Set(input.config.formalSpecFiles.map((item) => normalizeRelative(item)));
  const metrics = Object.fromEntries(UI_ARCHITECTURE_METRICS.map((metric) => [metric, 0])) as Record<UiArchitectureMetric, number>;
  const fileMetrics: UiArchitectureReport['fileMetrics'] = {};

  const layerMembership = new Map<string, Set<keyof UiArchitectureConfig['layers']>>();
  for (const [layer, files] of Object.entries(filesByLayer) as Array<[keyof UiArchitectureConfig['layers'], string[]]>) {
    for (const file of files) {
      const relative = normalizeRelative(path.relative(projectRoot, file));
      const membership = layerMembership.get(relative) ?? new Set();
      membership.add(layer);
      layerMembership.set(relative, membership);
    }
  }

  for (const file of allFiles) {
    const relative = normalizeRelative(path.relative(projectRoot, file));
    const source = fs.readFileSync(file, 'utf8');
    const sourceFile = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, scriptKind(file));
    const layers = layerMembership.get(relative) ?? new Set();
    const isFormalSpec = formalSpecFiles.has(relative);
    const imports = sourceFile.statements.filter(ts.isImportDeclaration).map((statement) => (
      ts.isStringLiteral(statement.moduleSpecifier) ? statement.moduleSpecifier.text : ''
    ));

    if (layers.has('pages')) {
      addMetricForMatches('pageImportsApi', imports.filter((item) => importTargets(item, 'api')).length, relative);
      addMetricForMatches('pageImportsTestData', imports.filter((item) => importTargets(item, 'test-data')).length, relative);
    }
    if (layers.has('testData')) {
      addMetricForMatches('testDataImportsApiOrCleanup', imports.filter((item) => (
        importTargets(item, 'api') || /cleanup/i.test(item)
      )).length, relative);
    }
    if (layers.has('utils')) {
      addMetricForMatches('utilityImportsPagesOrFlows', imports.filter((item) => (
        importTargets(item, 'pages') || importTargets(item, 'flows')
      )).length, relative);
    }

    let hasEmptyOperationReceipts = false;
    let hasGeneratedTag = false;
    const visit = (node: ts.Node): void => {
      if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
        const method = node.expression.name.text;
        if (method === 'waitForTimeout') addMetricForMatches('hardWaitCalls', 1, relative);
        if (method === 'or') addMetricForMatches('locatorFallbackCalls', 1, relative);
        if (['locator', 'getByRole', 'getByLabel', 'getByText', 'getByTestId', 'getByPlaceholder'].includes(method)) {
          if (layers.has('flows')) addMetricForMatches('rawLocatorCallsInFlows', 1, relative);
          if (layers.has('specs')) addMetricForMatches('rawLocatorCallsInSpecs', 1, relative);
        }
      }
      if (ts.isNewExpression(node) && ts.isIdentifier(node.expression) && /(Page|Flow)$/.test(node.expression.text)) {
        if (layers.has('flows')) addMetricForMatches('directPageFlowConstructionInFlows', 1, relative);
        if (layers.has('specs')) addMetricForMatches('directPageFlowConstructionInSpecs', 1, relative);
      }
      if (layers.has('specs') && ts.isPropertyAssignment(node)
        && propertyName(node.name) === 'mode'
        && ts.isStringLiteral(node.initializer)
        && node.initializer.text === 'serial') {
        addMetricForMatches('serialSuites', 1, relative);
      }
      if (isFormalSpec && ts.isPropertyAssignment(node) && propertyName(node.name) === 'operationReceipts'
        && ts.isArrayLiteralExpression(node.initializer) && node.initializer.elements.length === 0) {
        hasEmptyOperationReceipts = true;
      }
      if (isFormalSpec && ts.isStringLiteralLike(node) && node.text === '@generated') hasGeneratedTag = true;
      ts.forEachChild(node, visit);
    };
    visit(sourceFile);
    if (hasEmptyOperationReceipts) addMetricForMatches('formalSpecsWithEmptyOperationReceipts', 1, relative);
    if (hasGeneratedTag) addMetricForMatches('formalSpecsWithGeneratedTag', 1, relative);
  }

  const hotspots: UiArchitectureReport['hotspots'] = {};
  for (const hotspot of input.config.hotspots ?? []) {
    const relative = normalizeRelative(hotspot.path);
    const absolute = path.resolve(projectRoot, hotspot.path);
    if (!fs.existsSync(absolute)) continue;
    const source = fs.readFileSync(absolute, 'utf8');
    const sourceFile = ts.createSourceFile(absolute, source, ts.ScriptTarget.Latest, true, scriptKind(absolute));
    let publicMethods = 0;
    let importFanOut = 0;
    for (const statement of sourceFile.statements) {
      if (ts.isImportDeclaration(statement)) importFanOut += 1;
    }
    const visit = (node: ts.Node): void => {
      if (ts.isMethodDeclaration(node) && !node.modifiers?.some((modifier) => (
        modifier.kind === ts.SyntaxKind.PrivateKeyword || modifier.kind === ts.SyntaxKind.ProtectedKeyword
      ))) publicMethods += 1;
      ts.forEachChild(node, visit);
    };
    visit(sourceFile);
    hotspots[relative] = {
      lines: source.split(/\r?\n/).length,
      publicMethods,
      importFanOut,
    };
  }

  return { version: 1, projectRoot, metrics, fileMetrics, hotspots };

  function addMetricForMatches(metric: UiArchitectureMetric, count: number, relative: string): void {
    if (count === 0) return;
    metrics[metric] += count;
    fileMetrics[metric] ??= {};
    fileMetrics[metric]![relative] = (fileMetrics[metric]![relative] ?? 0) + count;
  }
}

export function createUiArchitectureBaseline(report: UiArchitectureReport): UiArchitectureBaseline {
  return {
    version: 1,
    maximums: { ...report.metrics },
    fileMaximums: structuredClone(report.fileMetrics),
    hotspots: Object.fromEntries(Object.entries(report.hotspots).map(([file, value]) => [file, {
      maxLines: value.lines,
      maxPublicMethods: value.publicMethods,
      maxImportFanOut: value.importFanOut,
    }])),
  };
}

export function evaluateUiArchitectureBaseline(input: {
  report: UiArchitectureReport;
  baseline: UiArchitectureBaseline;
}): string[] {
  const violations: string[] = [];
  for (const metric of UI_ARCHITECTURE_METRICS) {
    const maximum = input.baseline.maximums[metric] ?? 0;
    const actual = input.report.metrics[metric] ?? 0;
    if (actual > maximum) violations.push(`ARCHITECTURE_METRIC_INCREASE:${metric}:${actual}>${maximum}`);
    const allowedFiles = input.baseline.fileMaximums[metric] ?? {};
    for (const [file, count] of Object.entries(input.report.fileMetrics[metric] ?? {})) {
      const fileMaximum = allowedFiles[file] ?? 0;
      if (count > fileMaximum) violations.push(`ARCHITECTURE_FILE_DEBT_INCREASE:${metric}:${file}:${count}>${fileMaximum}`);
    }
  }
  for (const [file, actual] of Object.entries(input.report.hotspots)) {
    const maximum = input.baseline.hotspots[file];
    if (!maximum) {
      violations.push(`ARCHITECTURE_HOTSPOT_UNREGISTERED:${file}`);
      continue;
    }
    if (actual.lines > maximum.maxLines) violations.push(`ARCHITECTURE_HOTSPOT_LINES_INCREASE:${file}:${actual.lines}>${maximum.maxLines}`);
    if (actual.publicMethods > maximum.maxPublicMethods) violations.push(`ARCHITECTURE_HOTSPOT_METHODS_INCREASE:${file}:${actual.publicMethods}>${maximum.maxPublicMethods}`);
    if (actual.importFanOut > maximum.maxImportFanOut) violations.push(`ARCHITECTURE_HOTSPOT_IMPORTS_INCREASE:${file}:${actual.importFanOut}>${maximum.maxImportFanOut}`);
  }
  return violations.sort();
}

export function baselineDoesNotIncrease(input: {
  previous: UiArchitectureBaseline;
  next: UiArchitectureBaseline;
}): string[] {
  const violations: string[] = [];
  for (const metric of UI_ARCHITECTURE_METRICS) {
    if ((input.next.maximums[metric] ?? 0) > (input.previous.maximums[metric] ?? 0)) {
      violations.push(`ARCHITECTURE_BASELINE_RAISE_FORBIDDEN:${metric}`);
    }
  }
  for (const [file, next] of Object.entries(input.next.hotspots)) {
    const previous = input.previous.hotspots[file];
    if (!previous) continue;
    if (next.maxLines > previous.maxLines || next.maxPublicMethods > previous.maxPublicMethods
      || next.maxImportFanOut > previous.maxImportFanOut) {
      violations.push(`ARCHITECTURE_HOTSPOT_BASELINE_RAISE_FORBIDDEN:${file}`);
    }
  }
  return violations.sort();
}

function collectTypeScriptFiles(projectRoot: string, roots: readonly string[], excludes: readonly string[]): string[] {
  const excluded = excludes.map(normalizeRelative);
  const output: string[] = [];
  for (const root of roots) {
    const absolute = path.resolve(projectRoot, root);
    if (!fs.existsSync(absolute)) continue;
    const stat = fs.statSync(absolute);
    if (stat.isFile()) {
      if (/\.[cm]?[jt]sx?$/.test(absolute)) output.push(absolute);
      continue;
    }
    walk(absolute);
  }
  return output.sort();

  function walk(directory: string): void {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      if (['node_modules', 'output', 'test-results', 'allure-results', 'playwright-report'].includes(entry.name)) continue;
      const absolute = path.join(directory, entry.name);
      const relative = normalizeRelative(path.relative(projectRoot, absolute));
      if (excluded.some((item) => relative === item || relative.startsWith(`${item}/`))) continue;
      if (entry.isDirectory()) walk(absolute);
      else if (/\.[cm]?[jt]sx?$/.test(entry.name)) output.push(absolute);
    }
  }
}

function normalizeRelative(value: string): string {
  return value.replaceAll('\\', '/').replace(/^\.\//, '');
}

function importTargets(specifier: string, segment: string): boolean {
  return normalizeRelative(specifier).split('/').includes(segment);
}

function propertyName(name: ts.PropertyName): string {
  return ts.isIdentifier(name) || ts.isStringLiteralLike(name) ? name.text : name.getText();
}

function scriptKind(file: string): ts.ScriptKind {
  return file.endsWith('.tsx') ? ts.ScriptKind.TSX : file.endsWith('.jsx') ? ts.ScriptKind.JSX : ts.ScriptKind.TS;
}
