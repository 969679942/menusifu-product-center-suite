import {
  buildProductCenterFormalReviewQueue,
  buildProductCenterRuleRegistry,
  compileProductCenterReviewedFormalRules,
  type ProductCenterCandidateRule,
  type ProductCenterFormalReviewDecision,
  type ProductCenterRuleExecutionEvidence,
  type ProductCenterRuleValidationDimension,
} from './product-center-rule-evidence-ledger';

export type ProductCenterGroupRuleCase = {
  caseId: string;
  title: string;
  module: string;
  route: string;
  sourceIds: string[];
  preconditions: string[];
  steps: string[];
  expectedResults: string[];
  assertionIds: string[];
  classification: string;
  claimCoverageComplete: boolean;
  uiAssertionObserved: boolean;
  apiAssertionObserved: boolean;
  cleanupStatus: string;
  finalRunId: string | null;
  applicationVersionFingerprint?: string | null;
};

export type ProductCenterGroupRuleSource = {
  ruleId: string;
  statement: string;
  sourcePath: string;
  sourceLocator: string;
};

export function buildProductCenterGroupRuleGovernance(input: {
  cases: readonly ProductCenterGroupRuleCase[];
  ruleSources: readonly ProductCenterGroupRuleSource[];
  decisions?: readonly ProductCenterFormalReviewDecision[];
}): {
  registry: ReturnType<typeof buildProductCenterRuleRegistry>;
  reviewQueue: ReturnType<typeof buildProductCenterFormalReviewQueue>;
  formalRules: ReturnType<typeof compileProductCenterReviewedFormalRules>;
  observations: Array<{
    evidenceId: string;
    ruleId: string;
    caseId: string;
    dimension: ProductCenterRuleValidationDimension;
    result: ProductCenterRuleExecutionEvidence['result'];
    applicationVersionFingerprint: string | null;
    eligibleForFormalReviewEvidence: boolean;
  }>;
  candidateSources: Array<ProductCenterGroupRuleSource & { candidateRuleId: string }>;
} {
  const sourceById = new Map(input.ruleSources.map((source) => [source.ruleId, source]));
  const casesByRule = new Map<string, ProductCenterGroupRuleCase[]>();
  for (const item of input.cases) {
    for (const ruleId of item.sourceIds.filter(isGroupBusinessRuleId)) {
      const cases = casesByRule.get(ruleId) ?? [];
      cases.push(item);
      casesByRule.set(ruleId, cases);
    }
  }

  const candidateSources: Array<ProductCenterGroupRuleSource & { candidateRuleId: string }> = [];
  const candidates = [...casesByRule.entries()].sort(([left], [right]) => left.localeCompare(right))
    .map(([sourceRuleId, cases]): ProductCenterCandidateRule => {
      const source = sourceById.get(sourceRuleId);
      if (!source) throw new Error(`组规则候选缺少精确业务规则来源：${sourceRuleId}`);
      const candidateRuleId = `CBR-RUNTIME-${sourceRuleId}`;
      candidateSources.push({ ...source, candidateRuleId });
      const hasConflict = cases.some((item) => item.classification === 'observed-product-drift');
      return {
        ruleId: candidateRuleId,
        module: unique(cases.map((item) => item.module)).join(' / '),
        statement: source.statement,
        conditionClaims: cases.flatMap((item) => item.preconditions.map((_, index) => `${item.caseId}:precondition-${index + 1}`)),
        actionClaims: cases.flatMap((item) => item.steps.map((_, index) => `${item.caseId}:action-${index + 1}`)),
        outcomeClaims: cases.flatMap((item) => item.expectedResults.map((_, index) => `${item.caseId}:expectation-${index + 1}`)),
        sourceIds: unique([sourceRuleId, ...cases.flatMap((item) => item.sourceIds)]),
        scope: unique(cases.flatMap((item) => [item.module, item.route])),
        currentStatus: hasConflict ? 'conflict' : 'provisional',
        formalRuleBindingIds: [],
        legacyRuleBindingIds: [],
        legacyConflictRuleIds: [],
        conflictsWithRuleIds: [],
        requiredValidationDimensions: ['positive', 'negative', 'boundary', 'scope'],
      };
    });

  const observations = [...casesByRule.entries()].flatMap(([sourceRuleId, cases]) => cases.map((item) => {
    const dimension = inferValidationDimension(item);
    const result: ProductCenterRuleExecutionEvidence['result'] = item.classification === 'passed'
      && item.claimCoverageComplete
      ? 'supports'
      : item.classification === 'observed-product-drift'
        ? 'contradicts'
        : 'inconclusive';
    const applicationVersionFingerprint = normalizeFingerprint(item.applicationVersionFingerprint);
    return {
      evidenceId: `runtime-rule:${sourceRuleId}:${item.caseId}`,
      ruleId: `CBR-RUNTIME-${sourceRuleId}`,
      caseId: item.caseId,
      dimension,
      result,
      applicationVersionFingerprint,
      eligibleForFormalReviewEvidence: Boolean(
        result === 'supports'
        && applicationVersionFingerprint
        && item.uiAssertionObserved
        && item.apiAssertionObserved
        && cleanupVerified(item.cleanupStatus),
      ),
    };
  }));
  const evidence: ProductCenterRuleExecutionEvidence[] = observations.map((observation) => {
    const item = input.cases.find((candidate) => candidate.caseId === observation.caseId)!;
    return {
      evidenceId: observation.evidenceId,
      ruleId: observation.ruleId,
      observedAt: 'runtime-report',
      versionFingerprint: observation.applicationVersionFingerprint ?? '',
      environmentId: 'qa',
      roleId: 'merchant-admin',
      dataVariantId: item.caseId,
      dimension: observation.dimension,
      result: observation.result,
      uiEvidenceIds: item.uiAssertionObserved ? item.assertionIds : [],
      apiEvidenceIds: item.apiAssertionObserved ? [`runtime-api:${item.caseId}`] : [],
      cleanupVerified: cleanupVerified(item.cleanupStatus),
    };
  });
  const registry = buildProductCenterRuleRegistry({
    formalBindings: [],
    candidates,
    evidence,
  });
  return {
    registry,
    reviewQueue: buildProductCenterFormalReviewQueue(registry),
    formalRules: compileProductCenterReviewedFormalRules(registry, input.decisions ?? []),
    observations,
    candidateSources,
  };
}

function inferValidationDimension(item: ProductCenterGroupRuleCase): ProductCenterRuleValidationDimension {
  const text = `${item.title} ${item.preconditions.join(' ')} ${item.steps.join(' ')} ${item.expectedResults.join(' ')}`;
  if (/超长|字符|最少|最多|数量|价格|小数|为0|为 0|边界/.test(text)) return 'boundary';
  if (/失败|拒绝|错误|不可|不允许|不保存|不自动|缺失/.test(text)) return 'negative';
  if (/引用|品牌内|大小写|不同|多规格|行业|终端|C端|商户|范围/.test(text)) return 'scope';
  return 'positive';
}

function cleanupVerified(status: string): boolean {
  return status === 'verified-current-run-api-zero-and-ui-zero'
    || status === 'not-needed-no-created-data';
}

function normalizeFingerprint(value: string | null | undefined): string | null {
  return value && /^[a-f0-9]{64}$/i.test(value) ? value : null;
}

function isGroupBusinessRuleId(value: string): boolean {
  return /^BR-(?:GRP|FMT)-/.test(value);
}

function unique<T>(items: readonly T[]): T[] {
  return [...new Set(items)];
}
