import type { TestEvidenceStatus } from '../../utils/test-execution-state';
import {
  isValidCaseFingerprintCutoverAuthorization,
  type CaseFingerprintCutoverAuthorization,
} from '../../utils/case-fingerprint-cutover-authorization';

export type ArbiterDisposition =
  | 'ready'
  | 'deferred'
  | 'not-applicable'
  | 'product-defect'
  | 'blocked-source'
  | 'blocked-technical';

export type ArbiterReceipt = {
  caseFingerprint: string;
  semanticCaseFingerprint?: string | null;
  implementationFingerprint?: string | null;
  status: 'passed' | 'failed' | 'skipped' | 'not-run';
  evidenceStatus?: TestEvidenceStatus;
  recordedAt: string;
  evidencePath?: string | null;
  assertionStatuses?: ReadonlyArray<'verified' | 'observed-mismatch'>;
};

export type ArbiterProductDefect = {
  caseFingerprint?: string | null;
  semanticCaseFingerprint?: string | null;
  implementationFingerprint?: string | null;
  evidenceStatus?: TestEvidenceStatus;
  recordedAt?: string | null;
  evidencePath?: string | null;
};

export type ArbiterHandledOutcome = {
  status: 'handled';
  source: string;
  evidenceStatus?: TestEvidenceStatus;
  evidencePath?: string | null;
  recordedAt?: string | null;
  verificationStatus: 'current-verified' | 'legacy-verified';
  reason?: string;
};

export type CaseStateArbiterInput = {
  caseId?: string;
  disposition: ArbiterDisposition;
  currentCaseFingerprint: string | null;
  currentSemanticCaseFingerprint?: string | null;
  fingerprintMatchMode?: 'effective' | 'semantic';
  requireCutoverAuthorization?: boolean;
  cutoverAuthorization?: CaseFingerprintCutoverAuthorization | null;
  currentImplementationFingerprint?: string | null;
  implementationFingerprintRequired?: boolean;
  receipts: readonly ArbiterReceipt[];
  productDefect?: ArbiterProductDefect | null;
  handledOutcome?: ArbiterHandledOutcome | null;
  historicalRuntimeStatus?: string | null;
};

export type CaseStateArbiterResult = {
  status: 'passed' | 'handled' | 'ready' | ArbiterDisposition;
  reason: string;
  receipt: ArbiterReceipt | null;
  staleProductDefect: boolean;
  staleReceipts: number;
  handlingStatus: 'handled' | 'unhandled';
  verificationStatus: 'current-verified' | 'legacy-verified' | 'not-verified';
  actionRequired: boolean;
};

export function matchesCurrentCaseAndImplementationFingerprints(
  observation: { caseFingerprint?: string | null; semanticCaseFingerprint?: string | null; implementationFingerprint?: string | null } | null | undefined,
  currentCaseFingerprint: string | null,
  currentImplementationFingerprint: string | null,
  options: { currentSemanticCaseFingerprint?: string | null; fingerprintMatchMode?: 'effective' | 'semantic' } = {},
): boolean {
  if (!observation) return false;
  if (!matchesCaseFingerprint(observation, currentCaseFingerprint, options.currentSemanticCaseFingerprint, options.fingerprintMatchMode)) return false;
  if (currentImplementationFingerprint === null) return observation.implementationFingerprint == null;
  return observation.implementationFingerprint === currentImplementationFingerprint;
}

function matchesCaseFingerprint(
  observation: { caseFingerprint?: string | null; semanticCaseFingerprint?: string | null } | null | undefined,
  currentEffectiveCaseFingerprint: string | null,
  currentSemanticCaseFingerprint: string | null | undefined,
  mode: 'effective' | 'semantic' = 'effective',
): boolean {
  if (!observation) return false;
  if (mode === 'semantic') {
    return Boolean(currentSemanticCaseFingerprint)
      && observation.semanticCaseFingerprint === currentSemanticCaseFingerprint;
  }
  return Boolean(currentEffectiveCaseFingerprint)
    && observation.caseFingerprint === currentEffectiveCaseFingerprint;
}

function result(
  input: Partial<CaseStateArbiterResult> & Pick<CaseStateArbiterResult, 'status' | 'reason'>,
): CaseStateArbiterResult {
  return {
    receipt: null,
    staleProductDefect: false,
    staleReceipts: 0,
    handlingStatus: input.handlingStatus ?? 'unhandled',
    verificationStatus: input.verificationStatus ?? 'not-verified',
    actionRequired: input.actionRequired ?? true,
    ...input,
  };
}

export function arbitrateCaseState(input: CaseStateArbiterInput): CaseStateArbiterResult {
  if (input.disposition === 'deferred' || input.disposition === 'not-applicable'
    || input.disposition === 'blocked-source' || input.disposition === 'blocked-technical') {
    return result({ status: input.disposition, reason: '正式决策状态优先于运行投影。', actionRequired: false });
  }
  if (input.fingerprintMatchMode === 'semantic' && input.requireCutoverAuthorization
    && (!isValidCaseFingerprintCutoverAuthorization(input.cutoverAuthorization)
      || (input.caseId && input.cutoverAuthorization?.caseId !== input.caseId)
      || input.cutoverAuthorization?.newSemanticFingerprint !== input.currentSemanticCaseFingerprint
      || input.cutoverAuthorization?.oldEffectiveFingerprint !== input.currentCaseFingerprint
      || input.cutoverAuthorization?.implementationFingerprint !== input.currentImplementationFingerprint)) {
    return result({ status: 'ready', reason: '语义指纹切换缺少有效且匹配的授权收据。' });
  }
  const matching = input.receipts
    .filter((receipt) => matchesCaseFingerprint(
      receipt,
      input.currentCaseFingerprint,
      input.currentSemanticCaseFingerprint,
      input.fingerprintMatchMode,
    ))
    .sort((left, right) => left.recordedAt.localeCompare(right.recordedAt));
  if (input.implementationFingerprintRequired === true && !input.currentImplementationFingerprint) {
    return result({ status: 'ready', reason: '当前用例要求自动化实现指纹，但当前实现指纹缺失。' });
  }
  const currentReceipts = matching.filter((receipt) => !input.implementationFingerprintRequired
    || receipt.implementationFingerprint === input.currentImplementationFingerprint);
  const staleReceipts = matching.length - currentReceipts.length;
  const completePass = [...currentReceipts].reverse().find((receipt) => (
    receipt.status === 'passed' && receipt.evidenceStatus === 'complete'
    && isAcceptedSystemTestAssertionOutcome(receipt.assertionStatuses)
  ));
  const defect = input.productDefect;
  if (input.disposition === 'product-defect' && !input.currentImplementationFingerprint && !defect) {
    return result({
      status: 'product-defect',
      reason: '该方案尚未迁移自动化实现指纹，暂保留原产品偏差结论并禁止自动判定通过。',
      staleReceipts,
    });
  }
  const defectMatches = Boolean(defect
    && matchesCurrentCaseAndImplementationFingerprints(
      defect,
      input.currentCaseFingerprint,
      input.currentImplementationFingerprint ?? null,
      {
        currentSemanticCaseFingerprint: input.currentSemanticCaseFingerprint,
        fingerprintMatchMode: input.fingerprintMatchMode,
      },
    )
    && defect.evidenceStatus === 'complete'
    && defect.evidencePath
    && (!input.implementationFingerprintRequired || !input.currentImplementationFingerprint
      || defect.implementationFingerprint === input.currentImplementationFingerprint));
  const defectIsStale = Boolean(defect && !defectMatches);
  if (defectMatches && (!completePass || String(defect?.recordedAt ?? '') > completePass.recordedAt)) {
    return result({
      status: 'product-defect',
      reason: '当前用例指纹与自动化实现指纹均匹配的产品偏差证据仍有效。',
      receipt: completePass ?? null,
      staleProductDefect: false,
      staleReceipts,
    });
  }
  if (completePass) {
    return result({
      status: 'passed',
      reason: '当前用例指纹与自动化实现指纹均匹配，且存在完整标准执行收据。',
      receipt: completePass,
      staleProductDefect: defectIsStale,
      staleReceipts,
      handlingStatus: input.handledOutcome?.status === 'handled' ? 'handled' : 'unhandled',
      verificationStatus: input.handledOutcome?.verificationStatus ?? 'current-verified',
      actionRequired: false,
    });
  }
  if (input.handledOutcome?.status === 'handled' && !defectMatches) {
    return result({
      status: 'handled',
      reason: input.handledOutcome.reason
        ?? '该用例已有逐条整改处理证据；当前标准收据尚未迁移，保留证据协调状态但不得重复执行。',
      receipt: currentReceipts.at(-1) ?? matching.at(-1) ?? null,
      staleProductDefect: defectIsStale,
      staleReceipts,
      handlingStatus: 'handled',
      verificationStatus: input.handledOutcome.verificationStatus,
      actionRequired: false,
    });
  }
  return result({
    status: 'ready',
    reason: defectIsStale
      ? '历史产品偏差或执行收据对应旧自动化实现；代码已变化或缺少实现指纹，必须重新取证，不能继续沿用旧结论。'
      : input.historicalRuntimeStatus === 'runtime-passed'
        ? '历史 runtime-passed 仅为绑定投影，没有当前实现匹配的标准执行收据。'
        : '缺少当前用例与自动化实现指纹匹配的完整标准执行收据。',
    receipt: currentReceipts.at(-1) ?? matching.at(-1) ?? null,
    staleProductDefect: defectIsStale,
    staleReceipts,
  });
}

export function isAcceptedSystemTestAssertionOutcome(
  statuses: ReadonlyArray<'verified' | 'observed-mismatch'> | undefined,
): boolean {
  return Array.isArray(statuses)
    && statuses.length > 0
    && statuses.every((status) => status === 'verified');
}
