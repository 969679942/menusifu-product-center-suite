import type {
  ProductCenterBusinessBasisKind,
  ProductCenterTestCaseInput,
} from './product-center-test-case-ir';
import {
  evaluateProductCenterGenerationQuality,
  type ProductCenterGenerationDecision,
} from './product-center-generation-quality';

export type GeneratedSourceCitation = {
  kind: Exclude<ProductCenterBusinessBasisKind, 'legacy-baseline'>;
  citation: string;
};

export type GeneratedProductCenterTestCase = {
  canonicalId: string;
  internalCaseId: string;
  module: string;
  route: string;
  title: string;
  priority: ProductCenterTestCaseInput['priority'];
  sourceCitations: GeneratedSourceCitation[];
  preconditions: string[];
  actions: string[];
  expectedResults: string[];
  cleanup: string[];
  capabilityIds: string[];
};

export type ProductCenterGenerationBlockedDecision = {
  caseId: string;
  module: string;
  owner?: { role?: string };
  sourceFile: string;
  status: string;
  disposition?: string;
  currentGoalBlocking?: boolean;
  citations?: unknown[];
  evidenceFiles?: string[];
  blockCode?: string;
  blockReason?: string;
};

const moduleCodes: Record<string, string> = {
  'brand-item': 'ITEM',
  'brand-group': 'GROUP',
  'brand-seasoning': 'SEASON',
  'brand-tag': 'TAG',
  'brand-material-recipe': 'RECIPE',
  'brand-print': 'PRINT',
  menu: 'MENU',
  'store-operations': 'STOREOPS',
  'store-product': 'STOREPROD',
};

const actionCodes: Record<string, string> = {
  create: 'CREATE',
  edit: 'EDIT',
  delete: 'DELETE',
  negative: 'NEG',
  review: 'BOUNDARY',
  read: 'READ',
};

export function buildProductCenterGeneratedCaseRelease(input: {
  candidates: readonly ProductCenterTestCaseInput[];
  blockedDecisions: readonly ProductCenterGenerationBlockedDecision[];
  existingCases?: readonly Pick<GeneratedProductCenterTestCase, 'canonicalId' | 'internalCaseId'>[];
}) {
  const existingIds = new Map(
    (input.existingCases ?? []).map((item) => [item.internalCaseId, item.canonicalId]),
  );
  const usedIds = new Set(existingIds.values());
  const sequenceByPrefix = new Map<string, number>();
  for (const canonicalId of usedIds) {
    const matched = canonicalId.match(/^(TC-PC-[A-Z0-9]+-[A-Z0-9]+)-(\d{3})$/);
    if (!matched) continue;
    sequenceByPrefix.set(matched[1], Math.max(sequenceByPrefix.get(matched[1]) ?? 0, Number(matched[2])));
  }

  const generated: GeneratedProductCenterTestCase[] = [];
  const reviewRequired: Array<{ internalCaseId: string; issueCodes: string[] }> = [];
  for (const candidate of [...input.candidates].sort((left, right) => left.id.localeCompare(right.id))) {
    const issueCodes = generationIssues(candidate);
    if (issueCodes.length > 0) {
      reviewRequired.push({ internalCaseId: candidate.id, issueCodes });
      continue;
    }
    const prefix = canonicalPrefix(candidate);
    const canonicalId = existingIds.get(candidate.id)
      ?? allocateCanonicalId(prefix, sequenceByPrefix, usedIds);
    generated.push({
      canonicalId,
      internalCaseId: candidate.id,
      module: candidate.module,
      route: candidate.route,
      title: candidate.title.trim(),
      priority: candidate.priority,
      sourceCitations: collectSourceCitations(candidate),
      preconditions: normalizeList(candidate.preconditions),
      actions: normalizeList(candidate.actions),
      expectedResults: normalizeList(candidate.expectedResults),
      cleanup: normalizeList(candidate.cleanup),
      capabilityIds: [...candidate.execution!.capabilityIds],
    });
  }

  const blockedCases = input.blockedDecisions
    .filter((item) => item.status === 'blocked')
    .map((item) => ({
      caseId: item.caseId,
      module: item.module,
      owner: item.owner?.role ?? '待指定',
      sourceFile: item.sourceFile,
      status: 'blocked' as const,
      disposition: 'blocked-source-review' as const,
      currentGoalBlocking: true,
      citations: item.citations ?? [],
      evidenceFiles: item.evidenceFiles ?? [],
      blockCode: item.blockCode ?? 'FORMAL_SOURCE_REQUIRED',
      blockReason: item.blockReason ?? '缺少可精确验证的正式来源。',
    }))
    .sort((left, right) => left.caseId.localeCompare(right.caseId));

  return {
    schemaVersion: '1.0.0' as const,
    collectionId: 'product-center-test-plan-generation-v1' as const,
    namingPolicy: 'TC-PC-<MODULE>-<ACTION>-<NNN>' as const,
    status: reviewRequired.length > 0
      ? 'review-required' as const
      : blockedCases.length > 0
        ? 'passed-with-blocked' as const
        : 'passed' as const,
    summary: {
      candidates: input.candidates.length,
      generated: generated.length,
      reviewRequired: reviewRequired.length,
      blocked: blockedCases.length,
    },
    cases: generated.sort((left, right) => left.canonicalId.localeCompare(right.canonicalId)),
    reviewRequired,
    blockedCases,
  };
}

export function evaluateProductCenterGenerationHoldout(input: {
  samples: ReadonlyArray<{
    candidate: ProductCenterTestCaseInput;
    expectedDecision: ProductCenterGenerationDecision;
    cohort: 'real-source' | 'negative-fixture';
    scenario: string;
    labelSource: 'human-reviewed-holdout';
  }>;
}) {
  const release = buildProductCenterGeneratedCaseRelease({
    candidates: input.samples.map((sample) => sample.candidate),
    blockedDecisions: [],
  });
  const generatedIds = new Set(release.cases.map((item) => item.internalCaseId));
  const reviewIds = new Set(release.reviewRequired.map((item) => item.internalCaseId));
  const actualDecisions = input.samples.map((sample) => {
    const generated = generatedIds.has(sample.candidate.id);
    const reviewRequired = reviewIds.has(sample.candidate.id);
    if (generated === reviewRequired) {
      throw new Error(`Holdout 样本必须形成唯一生成决策：${sample.candidate.id}`);
    }
    return {
      caseId: sample.candidate.id,
      decision: generated ? 'generated' as const : 'review-required' as const,
    };
  });
  const quality = evaluateProductCenterGenerationQuality({
    expectations: input.samples.map((sample) => ({
      caseId: sample.candidate.id,
      expectedDecision: sample.expectedDecision,
    })),
    actualDecisions,
  });
  return {
    policy: {
      participatesInRelease: false as const,
      labelSource: 'human-reviewed-holdout' as const,
    },
    summary: quality.summary,
    samples: input.samples.map((sample) => ({
      caseId: sample.candidate.id,
      module: sample.candidate.module,
      productArchetype: 'productArchetype' in sample ? sample.productArchetype : undefined,
      cohort: sample.cohort,
      scenario: sample.scenario,
      expectedDecision: sample.expectedDecision,
      actualDecision: actualDecisions.find((item) => item.caseId === sample.candidate.id)!.decision,
      issueCodes: release.reviewRequired.find((item) => item.internalCaseId === sample.candidate.id)?.issueCodes ?? [],
      labelSource: sample.labelSource,
    })),
    quality,
  };
}

export function renderGeneratedProductCenterTestCases(
  cases: readonly GeneratedProductCenterTestCase[],
): string {
  return `${cases.map((item) => [
    `### 用例编号：${item.canonicalId}`,
    `用例标题：${item.title}`,
    `所属模块：${item.module}`,
    `优先级：${item.priority}`,
    `来源：${item.sourceCitations.map(renderCitation).join('；')}`,
    '前置条件：',
    ...numbered(item.preconditions),
    '测试步骤：',
    ...numbered(item.actions),
    '预期结果：',
    ...numbered(item.expectedResults),
    '---',
  ].join('\n')).join('\n\n')}\n`;
}

function generationIssues(candidate: ProductCenterTestCaseInput): string[] {
  const issues: string[] = [];
  if (!moduleCodes[candidate.module]) issues.push('UNKNOWN_MODULE_CODE');
  if (!actionCodes[candidate.id.split(':')[0]]) issues.push('UNKNOWN_ACTION_CODE');
  if (!validTitle(candidate.title)) issues.push('INVALID_TITLE');
  if (normalizeList(candidate.preconditions).length === 0) issues.push('PRECONDITION_REQUIRED');
  if (normalizeList(candidate.actions).length === 0) issues.push('ACTION_REQUIRED');
  if (normalizeList(candidate.expectedResults).length === 0) issues.push('EXPECTATION_REQUIRED');
  if (!candidate.claims || candidate.claims.length === 0) issues.push('SOURCE_TRACE_REQUIRED');
  for (const claim of candidate.claims ?? []) {
    const basis = claim.sourceTrace?.businessBasis;
    if (!basis || basis.refs.length === 0) issues.push('SOURCE_TRACE_REQUIRED');
    else if (basis.kind === 'legacy-baseline') issues.push('LEGACY_SOURCE_NOT_GENERATABLE');
    else if (basis.kind === 'single-step-inference'
      && (!basis.rationale || basis.hopCount !== 1)) issues.push('INVALID_INFERENCE');
    if (claim.evidenceLevel === 'conflicting') issues.push('CONFLICTING_SOURCE');
  }
  if (collectSourceCitations(candidate).length === 0) issues.push('FORMAL_SOURCE_REQUIRED');
  if (!candidate.execution || candidate.execution.capabilityIds[0] !== 'navigation.sidebar.open') {
    issues.push('SIDEBAR_ENTRY_REQUIRED');
  }
  if (candidate.mutatesData
    && (candidate.cleanup.length === 0 || candidate.execution?.cleanupAdapterIds.length === 0)) {
    issues.push('CLEANUP_REQUIRED');
  }
  return [...new Set(issues)].sort();
}

function collectSourceCitations(candidate: ProductCenterTestCaseInput): GeneratedSourceCitation[] {
  const citations = new Map<string, GeneratedSourceCitation>();
  for (const claim of candidate.claims ?? []) {
    const basis = claim.sourceTrace?.businessBasis;
    if (!basis || basis.kind === 'legacy-baseline') continue;
    const kind = basis.kind;
    if (basis.kind === 'business-rule-explicit') {
      const ids = basis.refs.join(' ').match(/BR-[A-Z0-9]+(?:-[A-Z0-9]+)*-\d{3}/g) ?? [];
      ids.forEach((citation) => citations.set(`${kind}:${citation}`, { kind, citation }));
      continue;
    }
    const preferredPrefix = basis.kind === 'prd-explicit'
      ? 'PRD:'
      : basis.kind === 'xmind-existing'
        ? 'XMIND:'
        : undefined;
    const refs = preferredPrefix
      ? basis.refs.filter((ref) => ref.startsWith(preferredPrefix))
      : basis.refs;
    for (const citation of refs.length > 0 ? refs : basis.refs) {
      const value = basis.kind === 'single-step-inference'
        ? `${basis.rationale ?? ''} ← ${citation}`.trim()
        : citation;
      citations.set(`${kind}:${value}`, { kind, citation: value });
    }
  }
  return [...citations.values()].sort((left, right) =>
    left.kind.localeCompare(right.kind) || left.citation.localeCompare(right.citation));
}

function canonicalPrefix(candidate: ProductCenterTestCaseInput): string {
  const moduleCode = moduleCodes[candidate.module];
  const actionCode = actionCodes[candidate.id.split(':')[0]];
  if (!moduleCode || !actionCode) throw new Error(`无法生成 canonical ID：${candidate.id}`);
  return `TC-PC-${moduleCode}-${actionCode}`;
}

function allocateCanonicalId(
  prefix: string,
  sequenceByPrefix: Map<string, number>,
  usedIds: Set<string>,
): string {
  let sequence = sequenceByPrefix.get(prefix) ?? 0;
  let candidate = '';
  do {
    sequence += 1;
    candidate = `${prefix}-${String(sequence).padStart(3, '0')}`;
  } while (usedIds.has(candidate));
  sequenceByPrefix.set(prefix, sequence);
  usedIds.add(candidate);
  return candidate;
}

function validTitle(title: string): boolean {
  const normalized = title.trim();
  return normalized.length >= 4
    && normalized.length <= 80
    && !/^(验证|检查|测试|正常|功能测试|页面正常)$/.test(normalized);
}

function normalizeList(items: readonly string[]): string[] {
  return items
    .map((item) => item.trim().replace(/^\d+(?:[.~-]\d+)*[.)、]?\s*/, ''))
    .filter((item) => item.length > 0 && !/^=+$/.test(item));
}

function numbered(items: readonly string[]): string[] {
  return items.map((item, index) => `${index + 1}. ${item}`);
}

function renderCitation(citation: GeneratedSourceCitation): string {
  if (citation.kind === 'prd-explicit') return `PRD明确 ← ${citation.citation}`;
  if (citation.kind === 'xmind-existing') return `XMind已有 ← ${citation.citation}`;
  if (citation.kind === 'business-rule-explicit') return `BR明确 ← ${citation.citation}`;
  return `可推导 ← ${citation.citation}`;
}
