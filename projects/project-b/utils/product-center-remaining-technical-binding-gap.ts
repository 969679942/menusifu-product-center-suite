import { createHash } from 'node:crypto';
import type { ProductCenterAuditCandidate } from './product-center-unified-audit-source';
import type {
  ProductCenterCaseStepTrace,
  ProductCenterPageObservationEvidence,
} from './product-center-remaining-scenario-execution';

export type ProductCenterRemainingBindingGapCode =
  | 'STABLE_CASE_ID_REQUIRED'
  | 'SOURCE_STEP_CONTENT_MISSING'
  | 'ACTION_EXPECTATION_COUNT_MISMATCH'
  | 'OBSERVATION_CHANNEL_REQUIRED'
  | 'CASE_EVIDENCE_RECEIPT_REQUIRED'
  | 'PAGE_OBSERVATION_NOT_CASE_SCOPED'
  | 'EXECUTION_CONTEXT_REQUIRED'
  | 'PAGE_CONTRACT_NOT_CLEAN'
  | 'DATA_PROFILE_REQUIRED'
  | 'CLEANUP_ADAPTER_REQUIRED'
  | 'CLEANUP_RECEIPT_REQUIRED'
  | 'EXECUTION_GRANT_REQUIRED';

export type ProductCenterRemainingTechnicalBindingGapEntry = {
  caseId: string;
  stableCaseId: boolean;
  title: string | null;
  module: string | null;
  sourceRefs: string[];
  mutationDetectedFromSource: boolean;
  stepSummary: {
    preconditionCount: number;
    actionCount: number;
    expectationCount: number;
    unboundCount: number;
    traceIssueCodes: string[];
  };
  gapCodes: ProductCenterRemainingBindingGapCode[];
  status: 'review-required' | 'blocked';
  evidenceRefs: string[];
};

export type ProductCenterRemainingTechnicalBindingGapDocument = {
  schemaVersion: '1.0.0';
  collectionId: 'product-center-remaining-technical-binding-gap';
  generatedAt: string;
  scope: 'project-adapter + generated-evidence';
  sourceFingerprint: string;
  pageObservationFingerprint: string | null;
  pageContractStatus: string | null;
  pageContractBlockingFindings: number | null;
  summary: {
    candidateCount: number;
    stableCaseIdCount: number;
    xmindCandidateCount: number;
    traceableCaseCount: number;
    completeTraceCount: number;
    mutationCandidateCount: number;
    reviewRequiredCount: number;
    blockedCount: number;
    byGapCode: Record<string, number>;
  };
  entries: ProductCenterRemainingTechnicalBindingGapEntry[];
  guardrails: {
    sourceInferenceAllowed: false;
    formalBindingGenerationAllowed: false;
    recipeGenerationAllowed: false;
    executionGrantAllowed: false;
    existingResultsRerun: false;
    existingResultsInvalidated: false;
  };
  fingerprint: string;
};

export function buildProductCenterRemainingTechnicalBindingGap(input: {
  candidates: readonly ProductCenterAuditCandidate[];
  traces: readonly ProductCenterCaseStepTrace[];
  pageObservation?: ProductCenterPageObservationEvidence;
  pageContract?: { status?: string; summary?: { blockingFindings?: number }; fingerprint?: string };
  sourceFingerprint: string;
  generatedAt?: string;
}): ProductCenterRemainingTechnicalBindingGapDocument {
  const traceByCaseId = new Map(input.traces.map((trace) => [trace.caseId, trace]));
  const entries = [...input.candidates]
    .sort((left, right) => left.candidateId.localeCompare(right.candidateId))
    .map((candidate) => buildEntry(candidate, traceByCaseId.get(candidate.formalCaseId ?? candidate.candidateId), input));
  const byGapCode: Record<string, number> = {};
  for (const entry of entries) for (const code of entry.gapCodes) byGapCode[code] = (byGapCode[code] ?? 0) + 1;
  const value = {
    schemaVersion: '1.0.0' as const,
    collectionId: 'product-center-remaining-technical-binding-gap' as const,
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    scope: 'project-adapter + generated-evidence' as const,
    sourceFingerprint: input.sourceFingerprint,
    pageObservationFingerprint: input.pageObservation ? fingerprint(input.pageObservation) : null,
    pageContractStatus: input.pageContract?.status ?? null,
    pageContractBlockingFindings: input.pageContract?.summary?.blockingFindings ?? null,
    summary: {
      candidateCount: entries.length,
      stableCaseIdCount: entries.filter((entry) => entry.stableCaseId).length,
      xmindCandidateCount: entries.filter((entry) => !entry.stableCaseId).length,
      traceableCaseCount: entries.filter((entry) => entry.stepSummary.preconditionCount + entry.stepSummary.actionCount + entry.stepSummary.expectationCount > 0).length,
      completeTraceCount: input.traces.filter((trace) => trace.complete).length,
      mutationCandidateCount: entries.filter((entry) => entry.mutationDetectedFromSource).length,
      reviewRequiredCount: entries.filter((entry) => entry.status === 'review-required').length,
      blockedCount: entries.filter((entry) => entry.status === 'blocked').length,
      byGapCode,
    },
    entries,
    guardrails: {
      sourceInferenceAllowed: false as const,
      formalBindingGenerationAllowed: false as const,
      recipeGenerationAllowed: false as const,
      executionGrantAllowed: false as const,
      existingResultsRerun: false as const,
      existingResultsInvalidated: false as const,
    },
  };
  return { ...value, fingerprint: fingerprint(value) };
}

export function renderProductCenterRemainingTechnicalBindingGapMarkdown(
  document: ProductCenterRemainingTechnicalBindingGapDocument,
): string {
  const lines = [
    '# 商品中心剩余场景技术绑定缺口',
    '',
    `- 候选：${document.summary.candidateCount}`,
    `- 稳定 caseId：${document.summary.stableCaseIdCount}`,
    `- XMind 无稳定 caseId：${document.summary.xmindCandidateCount}`,
    `- 可追踪候选：${document.summary.traceableCaseCount}`,
    `- 完整逐步骤追踪：${document.summary.completeTraceCount}`,
    `- 来源识别的写数据候选：${document.summary.mutationCandidateCount}`,
    `- 页面合同：${document.pageContractStatus ?? '未提供'}`,
    `- 页面合同阻断发现：${document.pageContractBlockingFindings ?? '未提供'}`,
    '',
    '## 缺口分布',
    '',
    ...Object.entries(document.summary.byGapCode).sort(([left], [right]) => left.localeCompare(right)).map(([code, count]) => `- ${code}：${count}`),
    '',
    '## 执行结论',
    '',
    '- 当前只完成技术绑定缺口识别，不生成正式绑定、不生成 Recipe、不签发 execution grant。',
    '- 没有完整 dataProfile、cleanup adapter、API/UI 清理收据的写数据用例不得进入业务执行。',
    '- 既有通过结果不重跑、不失效；本报告仅新增 generated-evidence。',
    '',
  ];
  return `${lines.join('\n')}\n`;
}

function buildEntry(
  candidate: ProductCenterAuditCandidate,
  trace: ProductCenterCaseStepTrace | undefined,
  input: Parameters<typeof buildProductCenterRemainingTechnicalBindingGap>[0],
): ProductCenterRemainingTechnicalBindingGapEntry {
  const stableCaseId = Boolean(candidate.formalCaseId);
  const preconditionCount = candidate.preconditions.length;
  const actionCount = candidate.actions.length;
  const expectationCount = candidate.expectedResults.length;
  const traceEntries = trace?.entries ?? [];
  const unboundCount = traceEntries.filter((entry) => entry.status === 'unbound').length;
  const mutationDetectedFromSource = /新增|创建|编辑|修改|删除|保存|提交|上传|导入|启用|停用|复制/.test(
    [...candidate.actions, ...candidate.expectedResults].join('\n'),
  );
  const gapCodes: ProductCenterRemainingBindingGapCode[] = [];
  if (!stableCaseId) gapCodes.push('STABLE_CASE_ID_REQUIRED');
  if (preconditionCount === 0 || actionCount === 0 || expectationCount === 0) gapCodes.push('SOURCE_STEP_CONTENT_MISSING');
  if (trace?.issues.includes('ACTION_EXPECTATION_COUNT_MISMATCH')) gapCodes.push('ACTION_EXPECTATION_COUNT_MISMATCH');
  if (unboundCount > 0 || traceEntries.length === 0) gapCodes.push('OBSERVATION_CHANNEL_REQUIRED', 'CASE_EVIDENCE_RECEIPT_REQUIRED');
  if (!input.pageObservation || !input.pageObservation.context.roleId || !input.pageObservation.context.tenantScope || !input.pageObservation.context.locale || input.pageObservation.context.permissionState !== 'allowed') gapCodes.push('EXECUTION_CONTEXT_REQUIRED');
  if (input.pageContract?.status && input.pageContract.status !== 'clean') gapCodes.push('PAGE_CONTRACT_NOT_CLEAN');
  gapCodes.push('PAGE_OBSERVATION_NOT_CASE_SCOPED');
  if (mutationDetectedFromSource) gapCodes.push('DATA_PROFILE_REQUIRED', 'CLEANUP_ADAPTER_REQUIRED', 'CLEANUP_RECEIPT_REQUIRED');
  gapCodes.push('EXECUTION_GRANT_REQUIRED');
  return {
    caseId: candidate.formalCaseId ?? candidate.candidateId,
    stableCaseId,
    title: candidate.title,
    module: candidate.module,
    sourceRefs: [...candidate.sourceRefs],
    mutationDetectedFromSource,
    stepSummary: { preconditionCount, actionCount, expectationCount, unboundCount, traceIssueCodes: [...(trace?.issues ?? [])] },
    gapCodes: [...new Set(gapCodes)],
    status: stableCaseId && preconditionCount > 0 && actionCount > 0 && expectationCount > 0 ? 'review-required' : 'blocked',
    evidenceRefs: [...new Set([
      ...candidate.sourceRefs,
      ...(input.pageObservation ? ['deliverables/product-center-audit/remaining-scenarios/product-center-page-observation-evidence.json'] : []),
    ])],
  };
}

function fingerprint(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}
