import fs from 'node:fs';
import path from 'node:path';
import {
  buildProductCenterGroupCaseFingerprintManifest,
  type ProductCenterGroupCaseFingerprintBinding,
} from '../utils/product-center-group-case-fingerprint';
import {
  buildProductCenterGroupExecutionRefinementLedger,
  renderProductCenterGroupExecutionRefinementMarkdown,
  type ProductCenterGroupExecutionRefinementRuntimeCase,
} from '../utils/product-center-group-execution-refinement';

const projectRoot = path.resolve(__dirname, '..');
const workspaceRoot = path.resolve(projectRoot, '..');
const deliverableRoot = path.join(workspaceRoot, 'deliverables/product-center-group');
const bindingsPath = path.join(projectRoot, 'contracts/product-center/group/product-center-group-bindings.json');
const runtimeReportPath = path.join(deliverableRoot, 'runtime-report.json');

export function buildProductCenterGroupExecutionRefinements(): ReturnType<
  typeof buildProductCenterGroupExecutionRefinementLedger
> {
  const bindings = readJson<{ cases: ProductCenterGroupCaseFingerprintBinding[] }>(bindingsPath).cases;
  const runtimeReport = readJson<{
    runs: Array<{ jsonFile: string }>;
    cases: ProductCenterGroupExecutionRefinementRuntimeCase[];
  }>(runtimeReportPath);
  const observedStepsByCaseId = collectObservedSteps(runtimeReport.runs.map((item) => item.jsonFile));
  const runtimeCases = runtimeReport.cases.map((item) => ({
    ...item,
    observedSteps: observedStepsByCaseId.get(item.caseId) ?? item.observedSteps ?? [],
  }));
  const currentExecution = buildProductCenterGroupCaseFingerprintManifest(projectRoot, bindings);
  const ledger = buildProductCenterGroupExecutionRefinementLedger({
    bindings,
    runtimeCases,
    currentExecutionCases: currentExecution.cases,
  });
  writeJson(path.join(deliverableRoot, 'execution-recipe-refinement-candidates.json'), ledger);
  writeText(
    path.join(deliverableRoot, 'execution-recipe-refinement-candidates.md'),
    renderProductCenterGroupExecutionRefinementMarkdown(ledger),
  );
  return ledger;
}

function collectObservedSteps(runJsonFiles: string[]): Map<string, ProductCenterGroupExecutionRefinementRuntimeCase['observedSteps']> {
  const observedStepsByCaseId = new Map<string, ProductCenterGroupExecutionRefinementRuntimeCase['observedSteps']>();
  for (const workspaceRelativePath of runJsonFiles) {
    const filePath = path.resolve(workspaceRoot, workspaceRelativePath);
    if (!isWithin(workspaceRoot, filePath) || !fs.existsSync(filePath)) continue;
    const document = readJson<{ suites?: unknown[] }>(filePath);
    visitSuites(document.suites ?? [], observedStepsByCaseId);
  }
  return observedStepsByCaseId;
}

function visitSuites(
  suites: any[],
  observedStepsByCaseId: Map<string, ProductCenterGroupExecutionRefinementRuntimeCase['observedSteps']>,
): void {
  for (const suite of suites) {
    for (const spec of suite.specs ?? []) {
      const caseTag = (spec.tags ?? []).find((tag: string) => tag.startsWith('case-'));
      const caseId = caseTag?.slice('case-'.length);
      const result = spec.tests?.[0]?.results?.at(-1);
      if (caseId && result?.status === 'passed') observedStepsByCaseId.set(caseId, flattenSteps(result.steps ?? []));
    }
    visitSuites(suite.suites ?? [], observedStepsByCaseId);
  }
}

function flattenSteps(
  steps: any[],
  depth = 0,
): NonNullable<ProductCenterGroupExecutionRefinementRuntimeCase['observedSteps']> {
  return steps.flatMap((step) => [{
    title: String(step?.title ?? ''),
    durationMs: Math.round(Number(step?.duration ?? 0)),
    depth,
  }, ...flattenSteps(step?.steps ?? [], depth + 1)]);
}

function isWithin(root: string, target: string): boolean {
  const relative = path.relative(path.resolve(root), path.resolve(target));
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function readJson<T>(filePath: string): T {
  return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T;
}

function writeJson(filePath: string, value: unknown): void {
  writeText(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function writeText(filePath: string, value: string): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.tmp`;
  fs.writeFileSync(temporaryPath, value, 'utf8');
  fs.renameSync(temporaryPath, filePath);
}

if (require.main === module) {
  process.stdout.write(`${JSON.stringify(buildProductCenterGroupExecutionRefinements().summary)}\n`);
}
