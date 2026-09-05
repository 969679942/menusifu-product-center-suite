import type {
  ProductCenterClaimKind,
  ProductCenterTestCaseClaim,
  ProductCenterTestCaseInput,
} from './product-center-test-case-ir';

export type ProductCenterSemanticIssueCode =
  | 'CLAIM_REQUIRED'
  | 'CLAIM_SOURCE_REQUIRED'
  | 'SOURCE_TRACE_REQUIRED'
  | 'UNKNOWN_CLAIM_SOURCE'
  | 'UNKNOWN_EXECUTION_EVIDENCE'
  | 'INFERRED_CLAIM'
  | 'INFERENCE_TRACE_REQUIRED'
  | 'SOURCE_TRACE_MISMATCH'
  | 'CONFLICTING_CLAIM'
  | 'VAGUE_ACTION'
  | 'VAGUE_EXPECTATION';

export function auditProductCenterTestCaseSemantics(
  cases: readonly ProductCenterTestCaseInput[],
  options: {
    knownSourceIds?: ReadonlySet<string>;
    requireSourceTrace?: boolean;
  } = {},
) {
  const auditedCases = cases.map((item) => auditCase(
    item,
    options.knownSourceIds,
    options.requireSourceTrace ?? false,
  ));
  const corrections = auditedCases.flatMap((item) => item.corrections);
  return {
    cases: auditedCases,
    corrections,
    summary: {
      total: auditedCases.length,
      passed: auditedCases.filter((item) => item.issues.length === 0).length,
      reviewRequired: auditedCases.filter((item) => item.issues.length > 0).length,
    },
  };
}

function auditCase(
  input: ProductCenterTestCaseInput,
  knownSourceIds: ReadonlySet<string> | undefined,
  requireSourceTrace: boolean,
) {
  const claims = input.claims ?? [];
  const issues: Array<{ code: ProductCenterSemanticIssueCode; claimId?: string; message: string }> = [];
  const corrections: Array<{
    caseId: string;
    claimId: string;
    originalText: string;
    reason: string;
    action: 'confirm-or-rewrite';
  }> = [];

  for (const statement of statements(input)) {
    const matches = claims.filter((claim) => claim.kind === statement.kind && claim.text === statement.text);
    if (matches.length !== 1) {
      issues.push({
        code: 'CLAIM_REQUIRED',
        message: `${statement.kind} 语句必须唯一绑定证据：${statement.text}`,
      });
    }
  }

  for (const claim of claims) {
    if (claim.sourceIds.length === 0) {
      issues.push({ code: 'CLAIM_SOURCE_REQUIRED', claimId: claim.id, message: `语句缺少来源：${claim.id}` });
    }
    const unknownSourceIds = knownSourceIds
      ? claim.sourceIds.filter((sourceId) => !knownSourceIds.has(sourceId))
      : [];
    if (unknownSourceIds.length > 0) {
      issues.push({
        code: 'UNKNOWN_CLAIM_SOURCE',
        claimId: claim.id,
        message: `语句引用未知来源：${unknownSourceIds.join(', ')}`,
      });
    }
    if (requireSourceTrace && !claim.sourceTrace) {
      issues.push({
        code: 'SOURCE_TRACE_REQUIRED',
        claimId: claim.id,
        message: `真实测试方案语句必须声明业务依据和执行证据：${claim.id}`,
      });
    }
    const unknownExecutionEvidence = knownSourceIds
      ? (claim.sourceTrace?.executionEvidence ?? [])
        .flatMap((evidence) => evidence.sourceIds)
        .filter((sourceId) => !knownSourceIds.has(sourceId))
      : [];
    if (unknownExecutionEvidence.length > 0) {
      issues.push({
        code: 'UNKNOWN_EXECUTION_EVIDENCE',
        claimId: claim.id,
        message: `语句引用未知执行证据：${[...new Set(unknownExecutionEvidence)].join(', ')}`,
      });
    }
    if (claim.evidenceLevel === 'inferred' && !isSingleStepInference(claim)) {
      issues.push({
        code: 'INFERENCE_TRACE_REQUIRED',
        claimId: claim.id,
        message: `推导语句必须声明严格一步推导依据：${claim.id}`,
      });
      corrections.push({
        caseId: input.id,
        claimId: claim.id,
        originalText: claim.text,
        reason: 'inference-trace-required',
        action: 'confirm-or-rewrite',
      });
    }
    if (claim.evidenceLevel !== 'inferred'
      && claim.sourceTrace?.businessBasis.kind === 'single-step-inference') {
      issues.push({
        code: 'SOURCE_TRACE_MISMATCH',
        claimId: claim.id,
        message: `一步推导来源必须使用 inferred 证据等级：${claim.id}`,
      });
    }
    if (claim.evidenceLevel === 'conflicting') {
      issues.push({
        code: 'CONFLICTING_CLAIM',
        claimId: claim.id,
        message: `语句证据等级不可生成：${claim.evidenceLevel}`,
      });
      corrections.push({
        caseId: input.id,
        claimId: claim.id,
        originalText: claim.text,
        reason: claim.evidenceLevel,
        action: 'confirm-or-rewrite',
      });
    }
    if (claim.kind === 'action' && isVagueAction(claim.text)) {
      issues.push({
        code: 'VAGUE_ACTION',
        claimId: claim.id,
        message: `动作缺少可执行细节：${claim.text}`,
      });
      corrections.push({
        caseId: input.id,
        claimId: claim.id,
        originalText: claim.text,
        reason: 'vague-action',
        action: 'confirm-or-rewrite',
      });
    }
    if (claim.kind === 'expectation' && isVagueExpectation(claim.text)) {
      issues.push({
        code: 'VAGUE_EXPECTATION',
        claimId: claim.id,
        message: `预期缺少可观测结果：${claim.text}`,
      });
      corrections.push({
        caseId: input.id,
        claimId: claim.id,
        originalText: claim.text,
        reason: 'vague-expectation',
        action: 'confirm-or-rewrite',
      });
    }
  }

  return { caseId: input.id, issues, corrections };
}

function isVagueAction(text: string): boolean {
  const normalized = text.trim().replace(/[。！!]+$/, '');
  return /按(?:用例)?标题(?:描述)?执行/.test(normalized)
    || /核对.*业务规则/.test(normalized);
}

function isVagueExpectation(text: string): boolean {
  const normalized = text.trim().replace(/[。！!]+$/, '');
  return /^(?:正常|符合预期|展示正确|页面展示正确|操作成功)$/.test(normalized)
    || /(?:页面|列表|结果|功能|操作|保存|创建|编辑|删除|查询|展示)(?:均)?正常$/.test(normalized)
    || /成功展示$/.test(normalized);
}

function isSingleStepInference(
  claim: ProductCenterTestCaseClaim,
): boolean {
  return claim.sourceTrace?.businessBasis.kind === 'single-step-inference'
    && claim.sourceTrace.businessBasis.hopCount === 1
    && Boolean(claim.sourceTrace.businessBasis.rationale?.trim())
    && Boolean(claim.sourceTrace.businessBasis.refs.length);
}

function statements(input: ProductCenterTestCaseInput): Array<{ kind: ProductCenterClaimKind; text: string }> {
  return [
    ...input.preconditions.map((text) => ({ kind: 'precondition' as const, text })),
    ...input.actions.map((text) => ({ kind: 'action' as const, text })),
    ...input.expectedResults.map((text) => ({ kind: 'expectation' as const, text })),
  ];
}
