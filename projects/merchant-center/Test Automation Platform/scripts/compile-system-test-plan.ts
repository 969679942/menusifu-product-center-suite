import fs from 'node:fs';
import path from 'node:path';
import { compileSystemTestPlan, type SystemTestPlan } from '../src/automation/system-test/system-test-plan-compiler';
import {
  fingerprintSystemTestImplementationSource,
  type SystemTestManifest,
} from '../src/automation/system-test/system-test-contract';
import type { SystemTestAdapterCatalog } from '../src/automation/system-test/system-test-contract';
import type { RuntimeAuditCorrectionDocument } from '../src/utils/test-plan-runtime-audit-correction';
import { fingerprintSystemTestValue } from '../src/automation/system-test/system-test-contract';

export function compileSystemTestPlanFiles(input: {
  rootDir?: string;
  planPath: string;
  manifestPath: string;
  selectionCaseIds?: readonly string[];
}) {
  const rootDir = path.resolve(input.rootDir ?? process.cwd());
  const planPath = path.resolve(rootDir, input.planPath);
  const manifestPath = path.resolve(rootDir, input.manifestPath);
  const sourcePlan = readJson<SystemTestPlan>(planPath);
  if (sourcePlan.runtimeAudit && sourcePlan.runtimeAuditPath) {
    throw new Error('RUNTIME_AUDIT_SOURCE_AMBIGUOUS');
  }
  const plan: SystemTestPlan = sourcePlan.runtimeAuditPath
    ? loadRuntimeAuditPlan(rootDir, sourcePlan)
    : sourcePlan;
  const manifest = readJson<SystemTestManifest>(manifestPath);
  if (plan.systemId !== manifest.system.systemId) {
    throw new Error(`SYSTEM_ID_MISMATCH:${plan.systemId}:${manifest.system.systemId}`);
  }
  const compiled = compileSystemTestPlan({ plan, dataProfiles: manifest.dataProfiles, rootDir });
  if (compiled.errors.length > 0) throw new Error(compiled.errors.join('\n'));
  const recipePath = path.resolve(rootDir, manifest.sources.recipeCollectionPath);
  const adapterPath = path.resolve(rootDir, manifest.sources.adapterCatalogPath);
  const adapters = refreshSystemTestAdapterImplementationFingerprints(rootDir, readJson<SystemTestAdapterCatalog>(adapterPath));
  const compilerStatePath = path.join(path.dirname(manifestPath), 'compiler-state.json');
  const previousCompilerState = fs.existsSync(compilerStatePath)
    ? readJson<CompilerState>(compilerStatePath)
    : undefined;
  const previousRecipes = fs.existsSync(recipePath)
    ? readJson<{ recipes?: unknown[] }>(recipePath).recipes ?? []
    : [];
  const previousRecipesByCaseId = new Map(previousRecipes.flatMap((recipe) => {
    const caseId = recipe && typeof recipe === 'object' && 'caseId' in recipe
      ? String((recipe as { caseId: unknown }).caseId)
      : '';
    return caseId ? [[caseId, recipe] as const] : [];
  }));
  const changedRecipeCaseIds = compiled.recipeCollection.recipes
    .filter((recipe) => recipeRequiresExecution(previousRecipesByCaseId.get(recipe.caseId), recipe))
    .map((recipe) => recipe.caseId);
  const changedAdapterIds = resolveChangedAdapterIds(previousCompilerState, adapters);
  const impactedByAdapterCaseIds = compiled.recipeCollection.recipes
    .filter((recipe) => recipeUsesAnyAdapter(recipe, changedAdapterIds))
    .map((recipe) => recipe.caseId);
  const changedExecutableCaseIds = [...new Set([...changedRecipeCaseIds, ...impactedByAdapterCaseIds])];
  const updatedManifest: SystemTestManifest = {
    ...manifest,
    sources: {
      ...manifest.sources,
      recipeCollectionFingerprint: compiled.recipeCollection.fingerprint,
      ruleLedgerFingerprint: compiled.ruleLedger.fingerprint,
      adapterCatalogFingerprint: fingerprintSystemTestValue(adapters),
    },
    cases: compiled.bindings,
  };
  const rulePath = path.resolve(rootDir, manifest.sources.ruleLedgerPath);
  const executionSelectionPath = path.join(path.dirname(manifestPath), 'execution-selection.json');
  const classificationLedgerPath = path.join(path.dirname(manifestPath), 'classification-ledger.json');
  writeJson(recipePath, compiled.recipeCollection);
  writeJson(rulePath, compiled.ruleLedger);
  writeJson(adapterPath, adapters);
  writeJson(manifestPath, updatedManifest);
  writeJson(classificationLedgerPath, compiled.classificationLedger);
  writeJson(compilerStatePath, buildCompilerState(adapters));
  const selection = resolveCompilationSelection({
    policy: sourcePlan.executionSelection,
    changedExecutableCaseIds,
    legacyInitialCaseIds: sourcePlan.initialExecutionCaseIds ?? [],
    rerunCaseIds: compiled.rerunCaseIds,
    explicitCaseIds: input.selectionCaseIds,
    availableCaseIds: compiled.bindings.map((item) => item.caseId),
  });
  writeJson(executionSelectionPath, {
    schemaVersion: '1.0.0',
    planId: plan.systemId,
    generatedAt: new Date().toISOString(),
    reason: selection.reason,
    strategy: selection.strategy,
    selectedCaseIds: selection.selectedCaseIds,
  });
  return {
    planPath,
    manifestPath,
    recipePath,
    rulePath,
    executionSelectionPath,
    classificationLedgerPath,
    cases: compiled.bindings.length,
    plannedCases: compiled.classificationLedger.summary.planned,
  };
}

export function refreshSystemTestAdapterImplementationFingerprints(
  rootDir: string,
  catalog: SystemTestAdapterCatalog,
): SystemTestAdapterCatalog {
  const absoluteRoot = path.resolve(rootDir);
  return {
    ...catalog,
    adapters: catalog.adapters.map((adapter) => ({
      ...adapter,
      implementation: {
        ...adapter.implementation,
        sha256: fingerprintSystemTestImplementationSource(absoluteRoot, adapter.implementation),
        ...(adapter.implementation.dependencies ? {
          dependencies: adapter.implementation.dependencies.map((dependency) => ({
            ...dependency,
            sha256: fingerprintSystemTestImplementationSource(absoluteRoot, dependency),
          })),
        } : {}),
      },
    })),
  };
}

export type CompilerState = {
  schemaVersion: '1.0.0';
  adapters: Record<string, string>;
};

function buildCompilerState(adapters: SystemTestAdapterCatalog): CompilerState {
  return {
    schemaVersion: '1.0.0',
    adapters: Object.fromEntries(adapters.adapters.map((adapter) => [
      adapter.id,
      fingerprintSystemTestValue(adapter.implementation),
    ])),
  };
}

export function resolveChangedAdapterIds(previous: CompilerState | undefined, current: SystemTestAdapterCatalog): Set<string> {
  if (!previous || previous.schemaVersion !== '1.0.0') return new Set();
  const next = buildCompilerState(current).adapters;
  return new Set(Object.keys(next).filter((id) => previous.adapters[id] !== next[id])
    .concat(Object.keys(previous.adapters).filter((id) => next[id] === undefined)));
}

export function recipeUsesAnyAdapter(recipe: unknown, changed: ReadonlySet<string>): boolean {
  if (changed.size === 0 || !recipe || typeof recipe !== 'object') return false;
  const value = recipe as Record<string, unknown>;
  const ids: string[] = [];
  const collect = (items: unknown): void => {
    if (!Array.isArray(items)) return;
    for (const item of items) {
      if (item && typeof item === 'object') {
        const adapterId = (item as { adapterId?: unknown }).adapterId;
        const id = (item as { id?: unknown }).id;
        if (typeof adapterId === 'string') ids.push(adapterId);
        if (typeof id === 'string') ids.push(id);
      }
    }
  };
  collect(value.contextGuards);
  collect(value.capabilities);
  collect(value.assertions);
  const actionReadiness = value.actionReadiness;
  if (actionReadiness && typeof actionReadiness === 'object'
    && typeof (actionReadiness as { adapterId?: unknown }).adapterId === 'string') {
    ids.push((actionReadiness as { adapterId: string }).adapterId);
  }
  for (const key of ['seed', 'cleanup']) {
    const item = value[key];
    if (item && typeof item === 'object' && typeof (item as { adapterId?: unknown }).adapterId === 'string') {
      ids.push((item as { adapterId: string }).adapterId);
    }
  }
  return ids.some((id) => changed.has(id));
}

export function recipeRequiresExecution(previous: unknown, current: unknown): boolean {
  if (!previous) return true;
  if (fingerprintSystemTestValue(previous) === fingerprintSystemTestValue(current)) return false;
  if (current && typeof current === 'object'
    && previous && typeof previous === 'object'
    && (current as { provenanceScope?: unknown }).provenanceScope === 'case-scoped-v1'
    && (previous as { provenanceScope?: unknown }).provenanceScope === 'case-scoped-v1') {
    const omitProvenance = (value: unknown) => {
      const clone = structuredClone(value as Record<string, unknown>);
      delete clone.provenanceFingerprint;
      delete clone.provenanceScope;
      return clone;
    };
    return fingerprintSystemTestValue(omitProvenance(previous)) !== fingerprintSystemTestValue(omitProvenance(current));
  }
  return true;
}

function loadRuntimeAuditPlan(rootDir: string, sourcePlan: SystemTestPlan): SystemTestPlan {
  const runtimeAuditPath = sourcePlan.runtimeAuditPath;
  if (!runtimeAuditPath) return sourcePlan;
  const { runtimeAuditPath: _runtimeAuditPath, ...planWithoutAuditPath } = sourcePlan;
  return {
    ...planWithoutAuditPath,
    runtimeAudit: readJson<RuntimeAuditCorrectionDocument>(path.resolve(rootDir, runtimeAuditPath)),
  };
}

export function resolveCompilationSelection(
  input: {
    policy?: SystemTestPlan['executionSelection'];
    changedExecutableCaseIds: readonly string[];
    legacyInitialCaseIds: readonly string[];
    rerunCaseIds: readonly string[];
    explicitCaseIds?: readonly string[];
    availableCaseIds?: readonly string[];
  },
): { reason: string; strategy: 'new-or-changed-executable-bindings' | 'legacy-initial-case-ids' | 'runtime-audit-only'; selectedCaseIds: string[] } {
  const explicit = [...new Set((input.explicitCaseIds ?? []).map((caseId) => caseId.trim()).filter(Boolean))].sort();
  if (explicit.length > 0) {
    const available = new Set(input.availableCaseIds ?? []);
    const unknown = explicit.filter((caseId) => !available.has(caseId));
    if (unknown.length > 0) throw new Error(`EXECUTION_SELECTION_UNKNOWN_CASE_IDS:${unknown.join(',')}`);
    return { reason: 'explicit-directed-rerun', strategy: 'new-or-changed-executable-bindings', selectedCaseIds: explicit };
  }
  const changed = [...new Set(input.changedExecutableCaseIds.map((caseId) => caseId.trim()).filter(Boolean))].sort();
  const initial = [...new Set(input.legacyInitialCaseIds.map((caseId) => caseId.trim()).filter(Boolean))].sort();
  const rerun = [...new Set(input.rerunCaseIds.map((caseId) => caseId.trim()).filter(Boolean))].sort();
  if (input.policy?.strategy === 'new-or-changed-executable-bindings') {
    return {
      reason: changed.length > 0 && rerun.length > 0
        ? 'evidence-driven-binding-change-and-runtime-audit-change'
        : changed.length > 0
          ? 'evidence-driven-new-or-changed-bindings'
          : rerun.length > 0
            ? 'runtime-audit-semantic-change'
            : 'no-new-or-changed-executable-bindings',
      strategy: 'new-or-changed-executable-bindings',
      selectedCaseIds: [...new Set([...changed, ...rerun])].sort(),
    };
  }
  const selectedCaseIds = [...new Set([...initial, ...rerun])].sort();
  if (initial.length > 0 && rerun.length > 0) {
    return { reason: 'initial-intake-and-runtime-audit-change', strategy: 'legacy-initial-case-ids', selectedCaseIds };
  }
  if (initial.length > 0) return { reason: 'initial-intake', strategy: 'legacy-initial-case-ids', selectedCaseIds };
  if (rerun.length > 0) return { reason: 'runtime-audit-semantic-change', strategy: 'runtime-audit-only', selectedCaseIds };
  return { reason: 'no-governed-change', strategy: 'runtime-audit-only', selectedCaseIds };
}

function readJson<T>(filePath: string): T {
  return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T;
}

function writeJson(filePath: string, value: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.tmp`;
  fs.writeFileSync(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  fs.renameSync(temporaryPath, filePath);
}

function argument(name: string): string | undefined {
  return process.argv.find((item) => item.startsWith(`--${name}=`))?.slice(name.length + 3);
}

if (require.main === module) {
  const planPath = argument('plan');
  const manifestPath = argument('manifest');
  if (!planPath || !manifestPath) throw new Error('用法：--plan=<path> --manifest=<path>');
  const selectionCaseIds = argument('select-case-ids')?.split(',').map((item) => item.trim()).filter(Boolean);
  const result = compileSystemTestPlanFiles({ planPath, manifestPath, selectionCaseIds });
  process.stdout.write(`标准化测试方案已编译：计划 ${result.plannedCases} 条，可执行绑定 ${result.cases} 条，${result.manifestPath}\n`);
}
