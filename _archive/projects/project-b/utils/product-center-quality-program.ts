import {
  evaluateProductCenterGenerationQuality,
  type ProductCenterGenerationDecision,
} from './product-center-generation-quality';
import type {
  ProductCenterMarkdownDiagnosticIssue,
} from './product-center-test-plan-markdown';

export type ProductCenterGenerationCohort = 'real-source' | 'negative-fixture';
export type ProductCenterGenerationScenario =
  | 'positive'
  | 'boundary'
  | 'blocked'
  | 'review-required'
  | 'format-drift';

export type ProductCenterMarkdownRepairPriority = 'P0' | 'P1' | 'P2';
export type ProductCenterMarkdownRepairTrack =
  | 'source-citation'
  | 'test-plan-revision'
  | 'structural-format';

export function normalizeProductCenterAcceptanceStatus(
  status: unknown,
  caseId?: string,
): 'passed' | 'failed' | 'skipped' {
  if (status === 'passed' || status === 'failed' || status === 'skipped') return status;
  if (status === 'timedOut') return 'failed';
  throw new Error(`验收趋势状态无效${caseId ? `：${caseId} -> ${String(status)}` : `：${String(status)}`}`);
}

export type ProductCenterGenerationPortfolioSample = {
  caseId: string;
  module: string;
  cohort: ProductCenterGenerationCohort;
  scenario: ProductCenterGenerationScenario;
};

export function buildProductCenterGenerationPortfolio(input: {
  moduleIds: readonly string[];
  samples: readonly ProductCenterGenerationPortfolioSample[];
  requiredScenarios: readonly ProductCenterGenerationScenario[];
}) {
  const moduleIds = unique(input.moduleIds, '质量组合模块重复').sort();
  const knownModules = new Set(moduleIds);
  const samples = uniqueBy(input.samples, (item) => item.caseId, '质量组合用例重复');
  for (const sample of samples) {
    if (!knownModules.has(sample.module)) throw new Error(`质量组合用例引用未知模块：${sample.caseId} -> ${sample.module}`);
  }

  const modules = moduleIds.map((module) => {
    const moduleSamples = samples.filter((sample) => sample.module === module);
    const realSourceSamples = moduleSamples.filter((sample) => sample.cohort === 'real-source');
    return {
      module,
      totalSamples: moduleSamples.length,
      realSourceSamples: realSourceSamples.length,
      negativeFixtures: moduleSamples.length - realSourceSamples.length,
      scenarios: [...new Set(moduleSamples.map((sample) => sample.scenario))].sort(),
      caseIds: moduleSamples.map((sample) => sample.caseId).sort(),
    };
  });
  const presentScenarios = new Set(samples.map((sample) => sample.scenario));
  const missingRealSourceModules = modules
    .filter((module) => module.realSourceSamples === 0)
    .map((module) => module.module);
  const missingScenarios = uniqueBy(input.requiredScenarios, (scenario) => scenario, '必需场景重复')
    .filter((scenario) => !presentScenarios.has(scenario));

  return {
    summary: {
      totalModules: moduleIds.length,
      modulesWithRealSources: modules.filter((module) => module.realSourceSamples > 0).length,
      totalSamples: samples.length,
      realSourceSamples: samples.filter((sample) => sample.cohort === 'real-source').length,
      negativeFixtures: samples.filter((sample) => sample.cohort === 'negative-fixture').length,
    },
    modules,
    gaps: { missingRealSourceModules, missingScenarios },
    readyForScale: missingRealSourceModules.length === 0 && missingScenarios.length === 0,
  };
}

export function evaluateSegmentedGenerationQuality(items: ReadonlyArray<{
  caseId: string;
  cohort: ProductCenterGenerationCohort;
  expectedDecision: ProductCenterGenerationDecision;
  actualDecision: ProductCenterGenerationDecision;
}>) {
  const values = uniqueBy(items, (item) => item.caseId, '质量决策用例重复');
  const evaluate = (selected: typeof values) => evaluateProductCenterGenerationQuality({
    expectations: selected.map((item) => ({ caseId: item.caseId, expectedDecision: item.expectedDecision })),
    actualDecisions: selected.map((item) => ({ caseId: item.caseId, decision: item.actualDecision })),
  });
  return {
    overall: evaluate(values),
    byCohort: {
      'real-source': evaluate(values.filter((item) => item.cohort === 'real-source')),
      'negative-fixture': evaluate(values.filter((item) => item.cohort === 'negative-fixture')),
    },
  };
}

export function buildProductCenterLegacyMigrationPlan(input: {
  cases: ReadonlyArray<{
    id: string;
    module: string;
    claims?: ReadonlyArray<{
      sourceTrace?: { businessBasis?: { kind?: string; refs?: readonly string[] } };
    }>;
  }>;
  modulesWithFormalSources: ReadonlySet<string>;
}) {
  const cases = uniqueBy(input.cases, (item) => item.id, 'legacy 迁移用例重复');
  const legacyCases = cases.flatMap((item) => {
    const legacyClaims = (item.claims ?? []).filter((claim) =>
      claim.sourceTrace?.businessBasis?.kind === 'legacy-baseline');
    return legacyClaims.length === 0 ? [] : [{ ...item, legacyClaimCount: legacyClaims.length }];
  });
  const moduleIds = [...new Set(legacyCases.map((item) => item.module))].sort();
  const modules = moduleIds.map((module) => {
    const moduleCases = legacyCases.filter((item) => item.module === module);
    const sourceAvailable = input.modulesWithFormalSources.has(module);
    return {
      module,
      status: sourceAvailable ? 'ready-for-source-audit' as const : 'source-required' as const,
      caseCount: moduleCases.length,
      legacyClaimCount: moduleCases.reduce((sum, item) => sum + item.legacyClaimCount, 0),
      caseIds: moduleCases.map((item) => item.id).sort(),
      nextGate: sourceAvailable ? 'exact-source-citation' as const : 'formal-source-required' as const,
    };
  }).sort((left, right) => {
    if (left.status !== right.status) return left.status === 'ready-for-source-audit' ? -1 : 1;
    return left.module.localeCompare(right.module);
  });
  const migratableCases = modules
    .filter((item) => item.status === 'ready-for-source-audit')
    .reduce((sum, item) => sum + item.caseCount, 0);

  return {
    summary: {
      totalCases: cases.length,
      legacyCases: legacyCases.length,
      legacyClaims: legacyCases.reduce((sum, item) => sum + item.legacyClaimCount, 0),
      migratableCases,
      blockedCases: legacyCases.length - migratableCases,
    },
    policy: {
      inferredSourceAllowed: false,
      promotionRequiresExactCitation: true,
      runtimeEvidenceCannotReplaceBusinessBasis: true,
    },
    modules,
  };
}

export function buildProductCenterMarkdownRepairQueue(files: ReadonlyArray<{
  module: string;
  path: string;
  issues: readonly ProductCenterMarkdownDiagnosticIssue[];
}>) {
  const items = files.flatMap((file) => file.issues.map((issue) => ({
    id: `${file.path}:${issue.line}:${issue.code}:${issue.caseId ?? 'file'}`,
    module: file.module,
    filePath: file.path,
    ...issue,
    ...markdownRepairPolicy(issue.code),
  }))).sort((left, right) =>
    repairPriorityRank(left.repairPriority) - repairPriorityRank(right.repairPriority)
    || left.code.localeCompare(right.code)
    || left.filePath.localeCompare(right.filePath)
    || left.line - right.line);
  const codes = [...new Set(items.map((item) => item.code))].sort();
  const groups = codes.map((code) => {
    const groupItems = items.filter((item) => item.code === code);
    const policy = markdownRepairPolicy(code);
    return {
      code,
      ...policy,
      itemCount: groupItems.length,
      files: [...new Set(groupItems.map((item) => item.filePath))].sort(),
      caseIds: [...new Set(groupItems.flatMap((item) => item.caseId ? [item.caseId] : []))].sort(),
      items: groupItems,
    };
  }).sort((left, right) =>
    repairPriorityRank(left.repairPriority) - repairPriorityRank(right.repairPriority)
    || left.code.localeCompare(right.code));

  return {
    summary: {
      totalItems: items.length,
      files: new Set(items.map((item) => item.filePath)).size,
      cases: new Set(items.flatMap((item) => item.caseId ? [item.caseId] : [])).size,
      byCode: Object.fromEntries(codes.map((code) => [code, items.filter((item) => item.code === code).length])),
      byPriority: Object.fromEntries((['P0', 'P1', 'P2'] as const).map((priority) => [
        priority,
        items.filter((item) => item.repairPriority === priority).length,
      ])),
    },
    guardrails: {
      approvalRequired: true,
      autoApplyAllowed: false,
      businessContentMutationAllowed: false,
    },
    groups,
  };
}

function markdownRepairPolicy(code: ProductCenterMarkdownDiagnosticIssue['code']): {
  repairPriority: ProductCenterMarkdownRepairPriority;
  repairTrack: ProductCenterMarkdownRepairTrack;
  requiresSourceOrOwnerConfirmation: boolean;
} {
  switch (code) {
    case 'UNSUPPORTED_SOURCE_FORMAT':
      return { repairPriority: 'P0', repairTrack: 'source-citation', requiresSourceOrOwnerConfirmation: true };
    case 'INVALID_PRIORITY':
    case 'DUPLICATE_CASE_ID':
    case 'INVALID_CASE_HEADING':
      return { repairPriority: 'P0', repairTrack: 'test-plan-revision', requiresSourceOrOwnerConfirmation: true };
    case 'MISSING_FIELD':
    case 'MISSING_SECTION':
      return { repairPriority: 'P1', repairTrack: 'test-plan-revision', requiresSourceOrOwnerConfirmation: true };
    case 'NON_NUMBERED_STEP':
      return { repairPriority: 'P2', repairTrack: 'structural-format', requiresSourceOrOwnerConfirmation: false };
  }
}

function repairPriorityRank(priority: ProductCenterMarkdownRepairPriority): number {
  return { P0: 0, P1: 1, P2: 2 }[priority];
}

function unique(values: readonly string[], message: string): string[] {
  return uniqueBy(values, (value) => value, message);
}

function uniqueBy<T>(items: readonly T[], keyFor: (item: T) => string, message: string): T[] {
  const seen = new Set<string>();
  return items.map((item) => {
    const key = keyFor(item);
    if (!key.trim()) throw new Error(`${message}：缺少标识`);
    if (seen.has(key)) throw new Error(`${message}：${key}`);
    seen.add(key);
    return item;
  });
}
