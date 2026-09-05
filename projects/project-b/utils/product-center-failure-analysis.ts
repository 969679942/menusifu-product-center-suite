import { createHash } from 'node:crypto';

export type ProductCenterFailureCategory =
  | 'execution-platform-transient'
  | 'environment'
  | 'test-data'
  | 'locator-drift'
  | 'product-behavior'
  | 'cleanup-residue'
  | 'automation-defect'
  | 'unknown';

export type ProductCenterFailureStatus = 'failed' | 'timedOut' | 'interrupted' | 'skipped';
export type ProductCenterCleanupStatus = 'verified-clean' | 'residue-detected' | 'not-applicable' | 'unknown';
export type ProductCenterPageContractStatus = 'clean' | 'review-required' | 'unknown';

export type ProductCenterFailureSignals = {
  status: ProductCenterFailureStatus | string;
  statusCode?: number;
  diagnostic?: string;
  assertion?: boolean;
  cleanupStatus?: ProductCenterCleanupStatus;
  claimCoverageComplete?: boolean;
  sidebarEntryVerified?: boolean;
  environmentVerified?: boolean;
  testDataVerified?: boolean;
  pageContractStatus?: ProductCenterPageContractStatus;
};

export type ProductCenterFailureAnalysisInput = {
  id?: string;
  input: ProductCenterFailureSignals;
  expectedCategory?: ProductCenterFailureCategory;
  expectedProductFailure?: boolean;
};

export type ProductCenterFailureFeedbackEntry = ProductCenterFailureSignals & {
  recipeId?: string;
  caseId?: string;
  title?: string;
  classification?: string;
};

export type ProductCenterFailureAnalysisBuildInput = {
  generatedAt?: string;
  feedbackSources: readonly {
    collectionId?: string;
    path: string;
    document: { fingerprint?: string; entries?: readonly ProductCenterFailureFeedbackEntry[] };
  }[];
  evidenceSources: readonly {
    path: string;
    document: { entries?: readonly ProductCenterFailureEvidenceEntry[] };
  }[];
  timingSources?: readonly {
    path: string;
    document: { cases?: readonly ProductCenterFailureTimingCase[] };
  }[];
  acceptanceSources?: readonly {
    collectionId: string;
    path: string;
    document: { fingerprint?: string; accepted?: boolean; issues?: readonly unknown[] };
  }[];
  cleanup: { status: ProductCenterCleanupStatus; evidenceRefs: readonly string[] };
  environmentVerified: boolean;
  testDataVerified: boolean;
  pageContract: { status: ProductCenterPageContractStatus; evidenceRef?: string };
};

export type ProductCenterFailureEvidenceEntry = {
  recipeId?: string;
  caseId?: string;
  claimCoverageComplete?: boolean;
  sidebarEntryVerified?: boolean;
  execution?: Record<string, unknown>;
};

export type ProductCenterFailureTimingCase = {
  title?: string;
  status?: string;
  diagnostic?: string;
  diagnosticFingerprint?: string;
  steps?: readonly ProductCenterFailureTimingStep[];
};

export type ProductCenterFailureTimingStep = {
  title?: string;
  durationMs?: number;
  children?: readonly ProductCenterFailureTimingStep[];
};

export type ProductCenterFailureAnalysisEntry = {
  recipeId?: string;
  caseId?: string;
  title?: string;
  status: string;
  category: ProductCenterFailureCategory;
  retryable: boolean;
  productFailure: boolean;
  unresolved: boolean;
  confidence: 'high' | 'medium' | 'low';
  diagnosticFingerprint: string;
  evidenceRefs: string[];
  stateVerification: {
    cleanup: ProductCenterCleanupStatus;
    environment: 'verified' | 'unverified';
    testData: 'verified' | 'unverified';
    pageContract: ProductCenterPageContractStatus;
    runtimeAcceptance: 'accepted' | 'rejected' | 'unavailable';
  };
  pendingConfirmations: string[];
};

export type ProductCenterFailureAnalysis = {
  schemaVersion: '1.0.0';
  generatedAt: string;
  sources: { feedback: string[]; evidence: string[]; timing: string[]; acceptance: string[]; cleanup: string[]; pageContract?: string };
  summary: {
    failedCases: number;
    unresolvedFailures: number;
    productFailures: number;
    transientFailures: number;
    falseProductPromotions: number;
    categoryCounts: Record<ProductCenterFailureCategory, number>;
  };
  baseline?: { total: number; correct: number; accuracy: number; falseProductPromotions: number; categories: ProductCenterFailureCategory[] };
  entries: ProductCenterFailureAnalysisEntry[];
};

export function classifyProductCenterFailureSignals(input: ProductCenterFailureSignals): {
  category: ProductCenterFailureCategory;
  retryable: boolean;
  productFailure: boolean;
  unresolved: boolean;
  confidence: 'high' | 'medium' | 'low';
  pendingConfirmations: string[];
} {
  const diagnostic = input.diagnostic ?? '';
  const normalized = diagnostic.toLowerCase();
  if (input.cleanupStatus === 'residue-detected' || /cleanup|residue|残留/.test(normalized)) {
    return classified('cleanup-residue', false, false, false, 'high');
  }
  if (/(?:system|server) error|系统异常|环境页面异常/.test(normalized)) {
    return classified('environment', false, false, false, 'high');
  }
  if (/wait_until_condition_timeout/.test(normalized)) {
    return classified('unknown', false, false, true, 'high', ['observation-timeout-review']);
  }
  if (/wait_until_probe_timeout/.test(normalized)) {
    return classified('execution-platform-transient', true, false, false, 'high');
  }
  if (/strict mode violation|locator|selector|xpath|css selector|element not found|no element|侧边栏未进入目标路径|目标路径.*未.*侧边栏/.test(normalized)) {
    return classified('locator-drift', false, false, false, 'high');
  }
  if (input.statusCode === 429 || [408, 502, 503, 504].includes(input.statusCode ?? 0)
    || /too many requests|exceeded retry limit|connection reset|reconnect|econnreset|etimedout|err_timed_out|execution platform|upstream.*(?:timeout|unavailable)|timed out|timeout|超时/.test(normalized)) {
    return classified('execution-platform-transient', true, false, false, 'high');
  }
  if ([401, 403].includes(input.statusCode ?? 0) || /unauthorized|forbidden|authentication|authenticated merchant|login|auth context|dns|baseurl/.test(normalized)) {
    return classified('environment', false, false, false, 'high');
  }
  if (/seed|prerequisite|test data|fixture data|not found.*data|前置数据|测试数据/.test(normalized)) {
    return classified('test-data', false, false, false, 'high');
  }
  if (/typeerror|referenceerror|rangeerror|maximum call stack|cannot read properties|undefined|not a function|unknown capability|automation defect/.test(normalized)) {
    return classified('automation-defect', false, false, false, 'high');
  }
  const observableMismatch = Boolean(input.assertion)
    && input.claimCoverageComplete === true
    && input.sidebarEntryVerified === true
    && input.environmentVerified === true
    && input.testDataVerified === true
    && input.pageContractStatus === 'clean';
  if (observableMismatch || (input.assertion === true && /expected .* received|expect\(/.test(normalized)
    && input.claimCoverageComplete === true && input.sidebarEntryVerified === true
    && input.environmentVerified === true && input.testDataVerified === true)) {
    return classified('product-behavior', false, true, false, 'high');
  }
  const pending = input.assertion ? ['claim-runtime-verification-required'] : ['failure-cause-confirmation'];
  return classified('unknown', false, false, true, 'low', pending);
}

function classified(
  category: ProductCenterFailureCategory,
  retryable: boolean,
  productFailure: boolean,
  unresolved: boolean,
  confidence: 'high' | 'medium' | 'low',
  pendingConfirmations: string[] = [],
) {
  return { category, retryable, productFailure, unresolved, confidence, pendingConfirmations };
}

export function sanitizeFailureDiagnostic(value: string): string {
  return value
    .replace(/bearer\s+[^\s,;]+/gi, 'Bearer <redacted>')
    .replace(/(authorization|password|cookie|set-cookie|token|access[_-]?token|refresh[_-]?token)\s*[:=]\s*[^\s,;]+/gi, '$1=<redacted>')
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '<redacted-email>')
    .replace(/eyJ[a-z0-9_-]{10,}\.[a-z0-9_-]{10,}\.[a-z0-9_-]{10,}/gi, '<redacted-jwt>')
    .slice(0, 2_000);
}

export function fingerprintFailureDiagnostic(value: string): string {
  return createHash('sha256').update(sanitizeFailureDiagnostic(value)).digest('hex');
}

export function analyzeProductCenterFailures(input: ProductCenterFailureAnalysisBuildInput): ProductCenterFailureAnalysis {
  const evidenceByRecipe = new Map<string, { entry: ProductCenterFailureEvidenceEntry; path: string }>();
  for (const source of input.evidenceSources) {
    for (const entry of source.document.entries ?? []) {
      if (entry.recipeId) evidenceByRecipe.set(entry.recipeId, { entry, path: source.path });
    }
  }
  const timingByTitle = new Map<string, { entry: ProductCenterFailureTimingCase; path: string }>();
  for (const source of input.timingSources ?? []) {
    for (const entry of source.document.cases ?? []) {
      if (entry.title) timingByTitle.set(entry.title, { entry, path: source.path });
    }
  }
  const entries: ProductCenterFailureAnalysisEntry[] = [];
  const acceptanceByCollection = new Map(
    (input.acceptanceSources ?? []).map((source) => [source.collectionId, source]),
  );
  for (const source of input.feedbackSources) {
    const acceptance = source.collectionId ? acceptanceByCollection.get(source.collectionId) : undefined;
    const acceptanceCurrent = Boolean(acceptance)
      && (!source.document.fingerprint || acceptance?.document.fingerprint === source.document.fingerprint);
    for (const feedback of source.document.entries ?? []) {
      if (!['failed', 'timedOut', 'interrupted'].includes(feedback.status)) continue;
      const evidence = feedback.recipeId ? evidenceByRecipe.get(feedback.recipeId) : undefined;
      const timing = feedback.title ? timingByTitle.get(feedback.title) : undefined;
      const timingSignals = collectLongTimingStepTitles(timing?.entry.steps ?? []);
      const diagnostic = [feedback.diagnostic ?? timing?.entry.diagnostic, ...timingSignals]
        .filter((value): value is string => Boolean(value))
        .join('\n');
      const signals: ProductCenterFailureSignals = {
        ...feedback,
        assertion: feedback.assertion ?? feedback.classification === 'assertion',
        claimCoverageComplete: evidence?.entry.claimCoverageComplete,
        sidebarEntryVerified: evidence?.entry.sidebarEntryVerified,
        environmentVerified: input.environmentVerified,
        testDataVerified: input.testDataVerified,
        cleanupStatus: input.cleanup.status,
        pageContractStatus: input.pageContract.status,
        diagnostic,
      };
      const classification = classifyProductCenterFailureSignals(signals);
      const refs = [source.path, ...(evidence ? [evidence.path] : []), ...(timing ? [timing.path] : []), ...input.cleanup.evidenceRefs];
      if (acceptance) refs.push(acceptance.path);
      if (input.pageContract.evidenceRef) refs.push(input.pageContract.evidenceRef);
      entries.push({
        recipeId: feedback.recipeId,
        caseId: feedback.caseId,
        title: feedback.title,
        status: feedback.status,
        ...classification,
        diagnosticFingerprint: fingerprintFailureDiagnostic(signals.diagnostic ?? `${feedback.recipeId ?? ''}:${feedback.caseId ?? ''}`),
        evidenceRefs: [...new Set(refs)],
        stateVerification: {
          cleanup: input.cleanup.status,
          environment: input.environmentVerified ? 'verified' : 'unverified',
          testData: input.testDataVerified ? 'verified' : 'unverified',
          pageContract: input.pageContract.status,
          runtimeAcceptance: !acceptanceCurrent
            ? 'unavailable'
            : acceptance?.document.accepted ? 'accepted' : 'rejected',
        },
        pendingConfirmations: [
          ...classification.pendingConfirmations,
          ...(!acceptanceCurrent && acceptance ? ['runtime-acceptance-fingerprint-match-required'] : []),
        ],
      });
    }
  }
  const categoryCounts = emptyCategoryCounts();
  for (const entry of entries) categoryCounts[entry.category] += 1;
  const falseProductPromotions = entries.filter((entry) => entry.productFailure
    && (entry.category === 'execution-platform-transient' || entry.category === 'unknown')).length;
  return {
    schemaVersion: '1.0.0',
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    sources: {
      feedback: input.feedbackSources.map((source) => source.path),
      evidence: input.evidenceSources.map((source) => source.path),
      timing: (input.timingSources ?? []).map((source) => source.path),
      acceptance: (input.acceptanceSources ?? []).map((source) => source.path),
      cleanup: [...input.cleanup.evidenceRefs],
      ...(input.pageContract.evidenceRef ? { pageContract: input.pageContract.evidenceRef } : {}),
    },
    summary: {
      failedCases: entries.length,
      unresolvedFailures: entries.filter((entry) => entry.unresolved).length,
      productFailures: entries.filter((entry) => entry.productFailure).length,
      transientFailures: entries.filter((entry) => entry.category === 'execution-platform-transient').length,
      falseProductPromotions,
      categoryCounts,
    },
    entries,
  };
}

function collectLongTimingStepTitles(steps: readonly ProductCenterFailureTimingStep[]): string[] {
  return steps.flatMap((step) => [
    ...(step.title && (step.durationMs ?? 0) >= 30_000 ? [step.title] : []),
    ...collectLongTimingStepTitles(step.children ?? []),
  ]);
}

export function evaluateFailureClassificationBaseline(samples: readonly ProductCenterFailureAnalysisInput[]) {
  const results = samples.map((sample) => ({
    expectedCategory: sample.expectedCategory,
    expectedProductFailure: sample.expectedProductFailure,
    actual: classifyProductCenterFailureSignals(sample.input),
  }));
  const correct = results.filter((result) => result.actual.category === result.expectedCategory
    && result.actual.productFailure === result.expectedProductFailure).length;
  const falseProductPromotions = results.filter((result) => result.actual.productFailure
    && (result.actual.category === 'execution-platform-transient' || result.actual.category === 'unknown')).length;
  return {
    total: results.length,
    correct,
    accuracy: results.length === 0 ? 1 : correct / results.length,
    falseProductPromotions,
    categories: [...new Set(results.map((result) => result.actual.category))].sort() as ProductCenterFailureCategory[],
  };
}

export function summarizeFailureAnalysisForPipeline(input: {
  summary: { failedCases: number; unresolvedFailures: number; productFailures: number };
  entries: readonly { category: ProductCenterFailureCategory; retryable: boolean }[];
}): { category: string; retryable: boolean; diagnostic: string } | undefined {
  if (input.entries.length === 0) return undefined;
  const categories = [...new Set(input.entries.map((entry) => entry.category))].sort();
  return {
    category: categories.join(','),
    retryable: input.entries.every((entry) => entry.retryable),
    diagnostic: `failure-analysis:categories=${categories.join(',')};failed=${input.summary.failedCases};unresolved=${input.summary.unresolvedFailures};product=${input.summary.productFailures}`,
  };
}

function emptyCategoryCounts(): Record<ProductCenterFailureCategory, number> {
  return {
    'execution-platform-transient': 0,
    environment: 0,
    'test-data': 0,
    'locator-drift': 0,
    'product-behavior': 0,
    'cleanup-residue': 0,
    'automation-defect': 0,
    unknown: 0,
  };
}
