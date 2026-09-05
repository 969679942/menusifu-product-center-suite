import {
  diagnoseProductCenterMarkdownTestPlan,
  parseProductCenterMarkdownTestPlan,
  type ProductCenterParsedMarkdownTestCase,
  type ProductCenterTestPlanSourceCitation,
} from './product-center-test-plan-markdown';

export type ProductCenterTestPlanAutomationBinding = {
  canonicalId: string;
  internalCaseId: string;
  module: string;
  route: string;
  sourceBindings: Array<{ ref: string; sourceIds: string[] }>;
  capabilityIds: string[];
  assertionAdapterIds: string[];
  seedAdapterIds: string[];
  cleanupAdapterIds: string[];
  verificationSignals: string[];
  claimIds: string[];
  claims?: Array<{
    id: string;
    kind: 'precondition' | 'action' | 'expectation';
    text: string;
  }>;
  mutatesData: boolean;
  cleanup: string[];
};

export type ProductCenterTestPlanIntakeIssueCode =
  | 'TECHNICAL_BINDING_REQUIRED'
  | 'MODULE_BINDING_MISMATCH'
  | 'UNRESOLVED_SOURCE_CITATION'
  | 'SIDEBAR_ENTRY_REQUIRED'
  | 'ASSERTION_ADAPTER_REQUIRED'
  | 'CLAIM_COVERAGE_MISMATCH'
  | 'CLAIM_TEXT_MISMATCH'
  | 'CLAIM_NUMBERING_MISMATCH'
  | 'VALIDATION_OBJECTIVE_REQUIRED'
  | 'EXPECTATION_NOT_OBSERVABLE'
  | 'FIELD_ACTION_NOT_SPECIFIC'
  | 'UNNECESSARY_EXPECTATION'
  | 'CLEANUP_ADAPTER_REQUIRED';

export type ProductCenterTestPlanIntakeCase = {
  canonicalId: string;
  internalCaseId: string;
  module: string;
  route: string;
  title: string;
  priority: ProductCenterParsedMarkdownTestCase['priority'];
  sourceTrace: Array<{
    kind: ProductCenterTestPlanSourceCitation['kind'];
    citation: string;
    sourceRefs: string[];
    sourceIds: string[];
  }>;
  preconditions: string[];
  actions: string[];
  expectedResults: string[];
  capabilityIds: string[];
  assertionAdapterIds: string[];
  claimIds: string[];
  claims: Array<{
    id: string;
    kind: 'precondition' | 'action' | 'expectation';
    text: string;
  }>;
  verificationSignals: string[];
  mutatesData: boolean;
  cleanup: string[];
  cleanupAdapterIds: string[];
  dataPrerequisites: {
    descriptions: string[];
    seedAdapterIds: string[];
    provisioning: 'automated' | 'external-precondition';
  };
  automationDecision: 'eligible';
};

export function buildProductCenterTestPlanIntake(input: {
  markdown: string;
  bindings: readonly ProductCenterTestPlanAutomationBinding[];
  blockedSources?: number;
  deferredBlocked?: number;
}) {
  const diagnostics = diagnoseProductCenterMarkdownTestPlan(input.markdown);
  if (diagnostics.status !== 'valid') {
    return {
      schemaVersion: '1.0.0' as const,
      status: 'review-required' as const,
      summary: {
        inputCases: diagnostics.caseCount,
        generated: 0,
        reviewRequired: diagnostics.caseCount,
        blockedSources: input.blockedSources ?? input.deferredBlocked ?? 0,
        falsePromotions: 0,
      },
      cases: [] as ProductCenterTestPlanIntakeCase[],
      reviewRequired: diagnostics.issues.map((item) => ({
        canonicalId: item.caseId ?? 'document',
        issueCodes: [item.code],
        issues: [item.message],
      })),
      diagnostics,
    };
  }

  const bindings = new Map(input.bindings.map((item) => [item.canonicalId, item]));
  const generated: ProductCenterTestPlanIntakeCase[] = [];
  const reviewRequired: Array<{
    canonicalId: string;
    issueCodes: ProductCenterTestPlanIntakeIssueCode[];
    issues: string[];
  }> = [];
  for (const parsed of parseProductCenterMarkdownTestPlan(input.markdown)) {
    const binding = bindings.get(parsed.id);
    const issueCodes: ProductCenterTestPlanIntakeIssueCode[] = [];
    const issues: string[] = [];
    if (!binding) {
      appendIssue(issueCodes, issues, 'TECHNICAL_BINDING_REQUIRED', '缺少显式页面与自动化技术绑定');
      reviewRequired.push({ canonicalId: parsed.id, issueCodes, issues });
      continue;
    }
    if (binding.module !== parsed.module) {
      appendIssue(issueCodes, issues, 'MODULE_BINDING_MISMATCH', `方案模块=${parsed.module};绑定模块=${binding.module}`);
    }
    const sourceTrace = parsed.sourceCitations.map((citation) =>
      resolveSourceTrace(citation, binding.sourceBindings));
    if (sourceTrace.some((item) => item.sourceIds.length === 0)) {
      appendIssue(issueCodes, issues, 'UNRESOLVED_SOURCE_CITATION', '至少一条方案来源无法映射到精确 source ID');
    }
    if (binding.capabilityIds[0] !== 'navigation.sidebar.open') {
      appendIssue(issueCodes, issues, 'SIDEBAR_ENTRY_REQUIRED', '第一项 capability 必须为 navigation.sidebar.open');
    }
    if (binding.assertionAdapterIds.length === 0) {
      appendIssue(issueCodes, issues, 'ASSERTION_ADAPTER_REQUIRED', '缺少可执行断言适配器');
    }
    const claimCount = parsed.preconditions.length + parsed.actions.length + parsed.expectedResults.length;
    if (binding.claimIds.length !== claimCount) {
      appendIssue(issueCodes, issues, 'CLAIM_COVERAGE_MISMATCH', `claims=${binding.claimIds.length};steps=${claimCount}`);
    }
    const statements = numberedStatements(parsed);
    const bindingClaims = binding.claims ?? [];
    const claimsById = new Map(bindingClaims.map((claim) => [claim.id, claim]));
    if (bindingClaims.length !== claimCount || binding.claimIds.some((claimId) => !claimsById.has(claimId))) {
      appendIssue(issueCodes, issues, 'CLAIM_COVERAGE_MISMATCH', 'Claim 明细必须完整覆盖全部前置、动作与预期');
    }
    if (statements.some((statement) => {
      const claim = bindingClaims.find((candidate) => (
        candidate.kind === statement.kind && candidate.text === statement.text
      ));
      return !claim;
    })) {
      appendIssue(issueCodes, issues, 'CLAIM_TEXT_MISMATCH', 'Claim 类型与文本必须逐项对应测试方案语句');
    }
    if (statements.some((statement) => !bindingClaims.some((claim) => (
      claim.kind === statement.kind
      && claim.text === statement.text
      && (claim.id.endsWith(`:${statement.kind}-${statement.number}`)
        || claim.id.endsWith(`:${statement.kind}:${statement.number}`))
    )))) {
      appendIssue(issueCodes, issues, 'CLAIM_NUMBERING_MISMATCH', 'Claim 编号必须与章节内语句编号逐项一致');
    }
    if (!parsed.title.trim() || binding.assertionAdapterIds.length === 0 || parsed.expectedResults.length === 0) {
      appendIssue(issueCodes, issues, 'VALIDATION_OBJECTIVE_REQUIRED', '用例必须声明一个明确标题目标及对应断言');
    }
    if (binding.verificationSignals.length === 0
      || parsed.expectedResults.some((expectation) => isVagueExpectation(expectation))) {
      appendIssue(issueCodes, issues, 'EXPECTATION_NOT_OBSERVABLE', '预期必须声明可观测结果与验证信号');
    }
    if (parsed.actions.some((action) => isNonSpecificFieldAction(action))) {
      appendIssue(issueCodes, issues, 'FIELD_ACTION_NOT_SPECIFIC', '字段操作必须写明字段、输入值或选择目标');
    }
    if (new Set(parsed.expectedResults.map(normalizeText)).size !== parsed.expectedResults.length) {
      appendIssue(issueCodes, issues, 'UNNECESSARY_EXPECTATION', '预期结果不得重复或使用无独立验证价值的表述');
    }
    if (binding.mutatesData && binding.cleanupAdapterIds.length === 0) {
      appendIssue(issueCodes, issues, 'CLEANUP_ADAPTER_REQUIRED', '写数据用例缺少清理适配器');
    }
    if (issueCodes.length > 0) {
      reviewRequired.push({ canonicalId: parsed.id, issueCodes, issues });
      continue;
    }
    generated.push({
      canonicalId: parsed.id,
      internalCaseId: binding.internalCaseId,
      module: parsed.module,
      route: binding.route,
      title: parsed.title,
      priority: parsed.priority,
      sourceTrace,
      preconditions: parsed.preconditions,
      actions: parsed.actions,
      expectedResults: parsed.expectedResults,
      capabilityIds: [...binding.capabilityIds],
      assertionAdapterIds: [...binding.assertionAdapterIds],
      claimIds: [...binding.claimIds],
      claims: bindingClaims.map((claim) => ({ ...claim })),
      verificationSignals: [...binding.verificationSignals],
      mutatesData: binding.mutatesData,
      cleanup: [...binding.cleanup],
      cleanupAdapterIds: [...binding.cleanupAdapterIds],
      dataPrerequisites: {
        descriptions: [...parsed.preconditions],
        seedAdapterIds: [...binding.seedAdapterIds],
        provisioning: binding.seedAdapterIds.length > 0 ? 'automated' : 'external-precondition',
      },
      automationDecision: 'eligible',
    });
  }

  const blockedSources = input.blockedSources ?? input.deferredBlocked ?? 0;
  return {
    schemaVersion: '1.0.0' as const,
    status: reviewRequired.length > 0
      ? 'review-required' as const
      : blockedSources > 0
        ? 'passed-with-blocked' as const
        : 'passed' as const,
    summary: {
      inputCases: generated.length + reviewRequired.length,
      generated: generated.length,
      reviewRequired: reviewRequired.length,
      blockedSources,
      falsePromotions: 0,
    },
    cases: generated.sort((left, right) => left.canonicalId.localeCompare(right.canonicalId)),
    reviewRequired: reviewRequired.sort((left, right) => left.canonicalId.localeCompare(right.canonicalId)),
    diagnostics,
  };
}

function numberedStatements(input: ProductCenterParsedMarkdownTestCase) {
  return [
    ...input.preconditions.map((text, index) => ({ kind: 'precondition' as const, number: index + 1, text })),
    ...input.actions.map((text, index) => ({ kind: 'action' as const, number: index + 1, text })),
    ...input.expectedResults.map((text, index) => ({ kind: 'expectation' as const, number: index + 1, text })),
  ];
}

function isVagueExpectation(value: string): boolean {
  const normalized = normalizeText(value).replace(/[。！!]+$/, '');
  return /^(?:正常|符合预期|展示正确|页面展示正确|操作成功|保存成功)$/.test(normalized)
    || /(?:页面|列表|结果|功能|操作|保存|创建|编辑|删除|查询|展示)(?:均)?正常$/.test(normalized);
}

function isNonSpecificFieldAction(value: string): boolean {
  const normalized = normalizeText(value);
  return /^(?:输入|填写|选择)(?:必填)?信息/.test(normalized)
    || /按(?:用例)?标题(?:描述)?执行/.test(normalized)
    || /进行相关操作/.test(normalized);
}

function normalizeText(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function resolveSourceTrace(
  citation: ProductCenterTestPlanSourceCitation,
  bindings: readonly { ref: string; sourceIds: string[] }[],
) {
  const matched = bindings.filter((binding) => citationMatchesRef(citation, binding.ref));
  return {
    kind: citation.kind,
    citation: citation.citation,
    sourceRefs: [...new Set(matched.map((item) => item.ref))].sort(),
    sourceIds: [...new Set(matched.flatMap((item) => item.sourceIds))].sort(),
  };
}

function citationMatchesRef(citation: ProductCenterTestPlanSourceCitation, ref: string): boolean {
  if (citation.kind === 'business-rule-explicit') {
    return ref === citation.citation || ref.endsWith(`#${citation.citation}`);
  }
  return ref === citation.citation;
}

function appendIssue(
  codes: ProductCenterTestPlanIntakeIssueCode[],
  issues: string[],
  code: ProductCenterTestPlanIntakeIssueCode,
  issue: string,
): void {
  if (!codes.includes(code)) codes.push(code);
  issues.push(issue);
}
