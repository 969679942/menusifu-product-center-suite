import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { assessRuntimeAuditFreshness } from './runtime-audit-freshness';

export type RuntimeAuditableTestCase = {
  id?: string;
  caseId?: string;
  canonicalId?: string;
  title: string;
  preconditions: string[];
  actions: string[];
  expectedResults: string[];
  module?: string;
  route?: string;
  sourceIds?: string[];
  sourceRefs?: string[];
  coverageIds?: string[];
  capabilityIds?: string[];
  assertionAdapterIds?: string[];
  verificationSignals?: string[];
  cleanup?: string[];
  cleanupAdapterIds?: string[];
  mutatesData?: boolean;
  execution?: Record<string, unknown>;
  claims?: Array<{
    kind: 'precondition' | 'action' | 'expectation';
    text: string;
    sourceIds?: string[];
    sourceRefs?: string[];
    evidenceLevel?: string;
    sourceTrace?: Record<string, unknown>;
    [key: string]: unknown;
  }>;
  [key: string]: unknown;
};

export type RuntimeAuditObservation = {
  locale?: string;
  route?: string;
  pageMode?: 'create' | 'edit' | 'detail' | 'list' | 'unknown';
  applicationVersionFingerprint?: string;
  environmentId?: string;
  roleId?: string;
  exactUiFeedback?: string[];
  submitButtonState?: 'enabled' | 'disabled' | 'not-present';
  businessWriteRequest?: 'sent' | 'not-sent';
  persisted?: 'yes' | 'no' | 'not-checked';
  uiLookup?: 'found' | 'not-found' | 'not-checked';
  apiLookup?: 'found' | 'not-found' | 'not-checked';
  controls?: Array<{
    id: string;
    state?: 'enabled' | 'disabled' | 'not-present' | 'selected' | 'unselected';
    visible?: boolean;
    required?: boolean;
    label?: string;
  }>;
  fields?: Array<{
    id: string;
    visible?: boolean;
    required?: boolean;
    enabled?: boolean;
    defaultValue?: unknown;
    value?: unknown;
    min?: number | string;
    max?: number | string;
    options?: string[];
  }>;
  typeTransitions?: Array<{
    from: string;
    to: string;
    allowed: boolean;
    visibleFields?: string[];
    hiddenFields?: string[];
  }>;
  network?: Array<{
    method: string;
    path: string;
    operationKey?: string;
    status?: number;
    outcome: 'sent' | 'not-sent';
    requestFingerprint?: string;
  }>;
  cleanup?: {
    required: boolean;
    apiZeroResidue: boolean;
    uiZeroResidue: boolean;
  };
  overlays?: Array<{ id: string; visible: boolean; parentControlId?: string }>;
};

export type RuntimeAuditAssertion = {
  fact: string;
  text: string;
  expectedValue?: unknown;
};

export type RuntimeAuditEvidence = {
  evidenceId: string;
  path: string;
  sha256: string;
  observedAt: string;
  freshUntil?: string;
  disposition: 'consumed' | 'not-applicable' | 'stale' | 'conflict' | 'review-required';
  reason?: string;
  applicationVersionFingerprint?: string;
  environmentId?: string;
  roleId?: string;
  locale?: string;
};

export type RuntimeAuditCoverage = {
  coverageId: string;
  kind: 'route' | 'control' | 'field' | 'dialog' | 'validation' | 'api-operation' | 'state';
  route: string;
  sourceIds: string[];
  disposition: 'required' | 'covered' | 'blocked' | 'not-applicable';
  linkedCaseIds?: string[];
  reason?: string;
};

export type RuntimeAuditCaseImpact = {
  businessRule: 'none' | 'update' | 'conflict';
  technicalBinding: 'none' | 'update' | 'conflict';
  coverage: 'none' | 'update' | 'conflict';
};

export type RuntimeAuditTechnicalBindingChange = {
  caseId: string;
  route?: string;
  capabilityIds?: string[];
  assertionAdapterIds?: string[];
  verificationSignals?: string[];
  seedAdapterIds?: string[];
  cleanupAdapterIds?: string[];
  apiOperations?: Array<{ method: string; path: string; operationKey?: string }>;
};

export type RuntimeAuditBusinessRuleChange = {
  action: 'add' | 'update' | 'deprecate';
  ruleId: string;
  statement: string;
  sourceIds: string[];
};

export type RuntimeAuditResolutionAction =
  | 'correct-case'
  | 'no-change'
  | 'add-case'
  | 'delete-case'
  | 'split-case'
  | 'merge-cases'
  | 'block-case';

export type RuntimeAuditAutoApprovalPolicy = {
  policyId: string;
  enabled: boolean;
  minimumConsumedEvidence: number;
  allowedActions: RuntimeAuditResolutionAction[];
  allowBusinessRuleChanges: boolean;
  allowTechnicalBindingChanges: boolean;
  allowCoverageChanges: boolean;
  requireMutationSafety: boolean;
};

export type RuntimeAuditAutomatedDecision = {
  policyId: string;
  decisionEngine: string;
  decidedAt: string;
  rationale: string;
};

export type RuntimeAuditCorrection = {
  caseId: string;
  reviewedCaseFingerprint?: string;
  reviewedBy?: string;
  reviewedAt?: string;
  automatedDecision?: RuntimeAuditAutomatedDecision;
  evidenceIds?: string[];
  evidencePaths?: string[];
  status: 'auto-confirmed-runtime' | 'human-confirmed-runtime' | 'review-required';
  observation: RuntimeAuditObservation;
  impacts?: RuntimeAuditCaseImpact;
  resolution: {
    action: RuntimeAuditResolutionAction;
    reason: string;
    sourceCaseIds?: string[];
    patches?: Partial<RuntimeAuditableTestCase>;
    replacementCases?: RuntimeAuditableTestCase[];
    businessRuleChanges?: RuntimeAuditBusinessRuleChange[];
    technicalBindingChanges?: RuntimeAuditTechnicalBindingChange[];
    coverageChanges?: RuntimeAuditCoverage[];
    assertions: RuntimeAuditAssertion[];
  };
};

export type RuntimeAuditCorrectionDocument = {
  schemaVersion: '1.0.0' | '2.0.0';
  collectionId: string;
  planId: string;
  generatedAt: string;
  freshUntil?: string;
  planFingerprint?: string;
  context?: {
    applicationVersionFingerprint?: string;
    environmentId?: string;
    roleId?: string;
    locale?: string;
    maxEvidenceAgeDays?: number;
  };
  evidenceDiscovery?: { rootPaths: string[]; extensions?: string[]; strict: boolean };
  evidenceInventory?: RuntimeAuditEvidence[];
  coverageInventory?: RuntimeAuditCoverage[];
  autoApprovalPolicy?: RuntimeAuditAutoApprovalPolicy;
  corrections: RuntimeAuditCorrection[];
};

export type RuntimeAuditIssue = {
  caseId: string;
  code:
    | 'RUNTIME_AUDIT_REQUIRED'
    | 'RUNTIME_AUDIT_CASE_NOT_FOUND'
    | 'RUNTIME_AUDIT_CONFLICT'
    | 'RUNTIME_AUDIT_INVALID'
    | 'RUNTIME_AUDIT_EVIDENCE_UNREGISTERED'
    | 'RUNTIME_AUDIT_EVIDENCE_INVALID'
    | 'RUNTIME_AUDIT_COVERAGE_GAP'
    | 'RUNTIME_AUDIT_FINGERPRINT_MISMATCH'
    | 'RUNTIME_AUDIT_BINDING_REQUIRED'
    | 'RUNTIME_AUDIT_AUTO_APPROVAL_DENIED';
  message: string;
};

export type RuntimeAuditReconciliation<T extends RuntimeAuditableTestCase> = {
  status: 'passed' | 'review-required';
  cases: T[];
  rerunCaseIds: string[];
  corrections: Array<{
    caseId: string;
    action: RuntimeAuditCorrection['resolution']['action'];
    changedFields: string[];
    decision: {
      mode: 'automatic' | 'human';
      decidedBy: string;
      decidedAt: string;
      policyId?: string;
      rationale: string;
    };
  }>;
  businessRuleChanges: RuntimeAuditBusinessRuleChange[];
  technicalBindingChanges: RuntimeAuditTechnicalBindingChange[];
  coverageChanges: RuntimeAuditCoverage[];
  issues: RuntimeAuditIssue[];
  evidence: {
    registered: number;
    consumed: number;
    unregistered: string[];
    invalid: string[];
  };
};

export type RuntimeAuditReconciliationOptions = {
  rootDir?: string;
  expectedPlanId?: string;
  expectedPlanFingerprint?: string;
  applicationVersionFingerprint?: string;
  environmentId?: string;
  roleId?: string;
  now?: Date;
};

export function fingerprintRuntimeAuditableCase(caseItem: RuntimeAuditableTestCase): string {
  return sha256(stableJson(selectFingerprintFields(caseItem)));
}

export function fingerprintRuntimeAuditablePlan(cases: readonly RuntimeAuditableTestCase[]): string {
  return sha256(stableJson(cases.map(selectFingerprintFields).sort((left, right) => (
    String(left.id).localeCompare(String(right.id))
  ))));
}

export function reconcileTestPlanRuntimeAudit<T extends RuntimeAuditableTestCase>(
  cases: readonly T[],
  document: unknown,
  options: RuntimeAuditReconciliationOptions = {},
): RuntimeAuditReconciliation<T> {
  const validation = validateTestPlanRuntimeAuditCorrectionDocument(document);
  const emptyEvidence = { registered: 0, consumed: 0, unregistered: [], invalid: [] };
  if (!validation.valid) return failedResult(cases, validation.issues, emptyEvidence);
  const audit = validation.document;
  const issues: RuntimeAuditIssue[] = [];
  const initialPlanFingerprint = fingerprintRuntimeAuditablePlan(cases);
  if (options.expectedPlanId && audit.planId !== options.expectedPlanId) {
    issues.push(issue('document', 'RUNTIME_AUDIT_INVALID', `审计 planId 不匹配：${audit.planId}`));
  }
  if (audit.schemaVersion === '2.0.0') {
    const currentCasesById = new Map(cases.map((item) => [runtimeCaseId(item), item]));
    const correctionCasesUnchanged = audit.corrections.every((correction) => {
      const current = currentCasesById.get(correction.caseId);
      return current && correction.reviewedCaseFingerprint === fingerprintRuntimeAuditableCase(current);
    });
    if (!audit.planFingerprint
      || ((audit.planFingerprint !== initialPlanFingerprint
        || (options.expectedPlanFingerprint && audit.planFingerprint !== options.expectedPlanFingerprint))
        && !correctionCasesUnchanged)) {
      issues.push(issue(
        'document',
        'RUNTIME_AUDIT_FINGERPRINT_MISMATCH',
        `审计合同与当前方案指纹不一致：audit=${audit.planFingerprint ?? 'missing'} current=${initialPlanFingerprint}`,
      ));
    }
    validateContext(audit, options, issues);
  }
  const evidence = validateEvidence(audit, options, issues);
  const caseIndex = new Map<string, number>();
  cases.forEach((item, index) => {
    const id = runtimeCaseId(item);
    if (id) caseIndex.set(id, index);
  });
  const output = cases.map((item) => structuredClone(item));
  const applied: RuntimeAuditReconciliation<T>['corrections'] = [];
  const rerunCaseIds = new Set<string>();
  const businessRuleChanges: RuntimeAuditBusinessRuleChange[] = [];
  const technicalBindingChanges: RuntimeAuditTechnicalBindingChange[] = [];
  const coverageChanges: RuntimeAuditCoverage[] = [];
  const seen = new Set<string>();

  for (const correction of audit.corrections) {
    if (seen.has(correction.caseId)) {
      issues.push(issue(correction.caseId, 'RUNTIME_AUDIT_INVALID', '同一用例存在重复运行时审计校正记录'));
      continue;
    }
    seen.add(correction.caseId);
    const index = caseIndex.get(correction.caseId);
    const action = correction.resolution.action;
    if (action === 'add-case') {
      if (index !== undefined || !correction.resolution.replacementCases?.length) {
        issues.push(issue(correction.caseId, 'RUNTIME_AUDIT_INVALID', 'add-case 必须针对不存在的用例并提供 replacementCases'));
        continue;
      }
    } else if (index === undefined) {
      issues.push(issue(correction.caseId, 'RUNTIME_AUDIT_CASE_NOT_FOUND', '审计校正目标不在当前测试方案中'));
      continue;
    }
    const issueCountBeforeContext = issues.length;
    validateCorrectionContext(correction, audit, options, cases, issues);
    if (issues.length > issueCountBeforeContext) continue;
    const decision = authorizeCorrection(correction, audit, issues);
    if (!decision) continue;
    const replacement = correction.resolution.replacementCases ?? [];
    if (['split-case', 'merge-cases'].includes(action) && replacement.length === 0) {
      issues.push(issue(correction.caseId, 'RUNTIME_AUDIT_INVALID', `${action} 必须提供 replacementCases`));
      continue;
    }
    if (['correct-case', 'no-change', 'block-case'].includes(action)) {
      const patched = applyPatches(output[index!], correction.resolution.patches, correction);
      if (!assertionsMatch(correction, patched)) {
        issues.push(issue(correction.caseId, 'RUNTIME_AUDIT_CONFLICT', '审计事实未完全进入校正后的用例预期'));
        continue;
      }
      output[index!] = patched;
    } else if (action === 'delete-case') {
      output.splice(index!, 1);
      rebuildCaseIndex(caseIndex, output);
    } else if (action === 'split-case' || action === 'merge-cases') {
      const sourceIds = action === 'merge-cases'
        ? correction.resolution.sourceCaseIds ?? []
        : [correction.caseId];
      const indexes = sourceIds.map((id) => caseIndex.get(id)).filter((value): value is number => value !== undefined);
      if (indexes.length !== sourceIds.length) {
        issues.push(issue(correction.caseId, 'RUNTIME_AUDIT_CASE_NOT_FOUND', `${action} 的 sourceCaseIds 不完整`));
        continue;
      }
      for (const removeIndex of [...indexes].sort((left, right) => right - left)) output.splice(removeIndex, 1);
      output.push(...replacement.map((item) => addEvidenceToCase(structuredClone(item) as T, correction)));
      rebuildCaseIndex(caseIndex, output);
      if (replacement.some((item) => !assertionsMatch(correction, item))) {
        issues.push(issue(correction.caseId, 'RUNTIME_AUDIT_CONFLICT', '拆分/合并后的用例未覆盖审计断言'));
        continue;
      }
    } else if (action === 'add-case') {
      output.push(...replacement.map((item) => addEvidenceToCase(structuredClone(item) as T, correction)));
      rebuildCaseIndex(caseIndex, output);
      if (replacement.some((item) => !assertionsMatch(correction, item))) {
        issues.push(issue(correction.caseId, 'RUNTIME_AUDIT_CONFLICT', '新增用例未覆盖审计断言'));
        continue;
      }
    }
    businessRuleChanges.push(...(correction.resolution.businessRuleChanges ?? []));
    technicalBindingChanges.push(...(correction.resolution.technicalBindingChanges ?? []));
    coverageChanges.push(...(correction.resolution.coverageChanges ?? []));
    const fields = changedFields(correction);
    applied.push({ caseId: correction.caseId, action, changedFields: fields, decision });
    for (const caseId of resolveRerunCaseIds(correction, fields)) rerunCaseIds.add(caseId);
    if (action === 'block-case' || correction.impacts && hasConflict(correction.impacts)) {
      issues.push(issue(correction.caseId, 'RUNTIME_AUDIT_CONFLICT', `审计结论要求阻断：${correction.resolution.reason}`));
    }
  }
  const duplicate = output.map(runtimeCaseId).find((id, index, all) => id && all.indexOf(id) !== index);
  if (duplicate) issues.push(issue(duplicate, 'RUNTIME_AUDIT_INVALID', '校正后产生重复用例 ID'));
  applyTechnicalBindingChanges(output, technicalBindingChanges, issues);
  applyCoverageChanges(output, coverageChanges);
  validateCoverage({
    ...audit,
    coverageInventory: uniqueBy([...(audit.coverageInventory ?? []), ...coverageChanges], (item) => item.coverageId),
  }, output, issues);
  return {
    status: issues.length > 0 ? 'review-required' : 'passed',
    cases: output,
    rerunCaseIds: [...rerunCaseIds].sort(),
    corrections: applied,
    businessRuleChanges: uniqueBy(businessRuleChanges, (item) => item.ruleId),
    technicalBindingChanges: uniqueBy(technicalBindingChanges, (item) => item.caseId),
    coverageChanges: uniqueBy(coverageChanges, (item) => item.coverageId),
    issues,
    evidence,
  };
}

export function validateTestPlanRuntimeAuditCorrectionDocument(input: unknown): {
  valid: boolean;
  document: RuntimeAuditCorrectionDocument;
  issues: RuntimeAuditIssue[];
} {
  const issues: RuntimeAuditIssue[] = [];
  if (!isRecord(input)) return invalidDocument('document', '运行时审计校正文档必须是对象', issues);
  if (input.schemaVersion !== '1.0.0' && input.schemaVersion !== '2.0.0') {
    issues.push(issue('document', 'RUNTIME_AUDIT_INVALID', 'schemaVersion 必须为 1.0.0 或 2.0.0'));
  }
  if (!nonEmpty(input.collectionId) || !nonEmpty(input.planId) || !nonEmpty(input.generatedAt)) {
    issues.push(issue('document', 'RUNTIME_AUDIT_INVALID', 'collectionId、planId、generatedAt 不能为空'));
  }
  if (!Array.isArray(input.corrections)) return invalidDocument('document', 'corrections 必须是数组', issues);
  if (input.schemaVersion === '2.0.0' && (!nonEmpty(input.planFingerprint)
    || !isRecord(input.context) || !Array.isArray(input.evidenceInventory) || !Array.isArray(input.coverageInventory)
    || !isRecord(input.evidenceDiscovery))) {
    issues.push(issue('document', 'RUNTIME_AUDIT_INVALID', 'V2 必须提供 planFingerprint、context、evidenceDiscovery、evidenceInventory、coverageInventory'));
  }
  if (input.schemaVersion === '2.0.0' && isRecord(input.context) && (
    !nonEmpty(input.context.applicationVersionFingerprint)
    || !nonEmpty(input.context.environmentId)
    || !nonEmpty(input.context.roleId)
    || !nonEmpty(input.context.locale)
    || !Number.isFinite(input.context.maxEvidenceAgeDays)
    || Number(input.context.maxEvidenceAgeDays) <= 0
  )) {
    issues.push(issue('document', 'RUNTIME_AUDIT_INVALID', 'V2 context 必须完整声明应用版本、环境、角色、语言和证据有效期'));
  }
  if (input.autoApprovalPolicy !== undefined) validateAutoApprovalPolicy(input.autoApprovalPolicy, issues);
  const corrections = input.corrections.flatMap((value, index): RuntimeAuditCorrection[] => {
    const prefix = `corrections[${index}]`;
    if (!isRecord(value)) {
      issues.push(issue(prefix, 'RUNTIME_AUDIT_INVALID', '校正记录必须是对象'));
      return [];
    }
    const correction = value as Partial<RuntimeAuditCorrection>;
    const caseId = correction.caseId;
    const reviewedBy = correction.reviewedBy;
    const reviewedAt = correction.reviewedAt;
    if (!nonEmpty(caseId) || !isRecord(correction.observation) || !isRecord(correction.resolution)) {
      issues.push(issue(prefix, 'RUNTIME_AUDIT_INVALID', 'caseId、observation、resolution 不能为空'));
      return [];
    }
    if (!['auto-confirmed-runtime', 'human-confirmed-runtime', 'review-required'].includes(String(correction.status))) {
      issues.push(issue(caseId, 'RUNTIME_AUDIT_INVALID', '运行时审计状态无效'));
      return [];
    }
    if (correction.status === 'human-confirmed-runtime' && (!nonEmpty(reviewedBy) || !nonEmpty(reviewedAt))) {
      issues.push(issue(caseId, 'RUNTIME_AUDIT_INVALID', '人工确认必须提供 reviewedBy 和 reviewedAt'));
      return [];
    }
    if (correction.status === 'auto-confirmed-runtime'
      && (input.schemaVersion !== '2.0.0' || !validAutomatedDecision(correction.automatedDecision))) {
      issues.push(issue(caseId, 'RUNTIME_AUDIT_INVALID', '自动确认仅支持 V2，且必须提供完整 automatedDecision'));
      return [];
    }
    const resolution = correction.resolution as RuntimeAuditCorrection['resolution'];
    if (!nonEmpty(resolution.reason) || !Array.isArray(resolution.assertions)
      || !['correct-case', 'no-change', 'add-case', 'delete-case', 'split-case', 'merge-cases', 'block-case'].includes(resolution.action)) {
      issues.push(issue(caseId, 'RUNTIME_AUDIT_INVALID', 'resolution 格式无效'));
      return [];
    }
    const evidenceIds = correction.evidenceIds ?? [];
    const evidencePaths = correction.evidencePaths ?? [];
    if (evidenceIds.length === 0 && evidencePaths.length === 0) {
      issues.push(issue(caseId, 'RUNTIME_AUDIT_INVALID', '必须提供 evidenceIds 或 evidencePaths'));
      return [];
    }
    if (resolution.action === 'correct-case' && !isRecord(resolution.patches)) {
      issues.push(issue(caseId, 'RUNTIME_AUDIT_INVALID', 'correct-case 必须提供 patches'));
      return [];
    }
    if (input.schemaVersion === '2.0.0' && (!nonEmpty(correction.reviewedCaseFingerprint)
      || !isRecord(correction.impacts))) {
      issues.push(issue(caseId, 'RUNTIME_AUDIT_INVALID', 'V2 校正必须提供 reviewedCaseFingerprint 和 impacts'));
      return [];
    }
    const assertions = resolution.assertions.filter((item): item is RuntimeAuditAssertion => (
      isRecord(item) && nonEmpty(item.fact) && nonEmpty(item.text)
    ));
    if (assertions.length !== resolution.assertions.length || assertions.length === 0) {
      issues.push(issue(caseId, 'RUNTIME_AUDIT_INVALID', '每条校正必须至少有一条有效 assertion'));
      return [];
    }
    if ((correction.observation as RuntimeAuditObservation).exactUiFeedback?.length
      && !assertions.some((assertion) => assertion.fact === 'exact-ui-feedback')) {
      issues.push(issue(caseId, 'RUNTIME_AUDIT_INVALID', '精确页面提示必须由 exact-ui-feedback assertion 逐字绑定'));
      return [];
    }
    if (input.schemaVersion === '2.0.0') {
      for (const assertion of assertions) {
        if (assertion.expectedValue === undefined) {
          issues.push(issue(caseId, 'RUNTIME_AUDIT_INVALID', `V2 assertion 缺少 expectedValue：${assertion.fact}`));
        }
      }
    }
    return [{
      caseId,
      reviewedCaseFingerprint: correction.reviewedCaseFingerprint,
      reviewedBy,
      reviewedAt,
      automatedDecision: correction.automatedDecision,
      evidenceIds,
      evidencePaths,
      status: correction.status as RuntimeAuditCorrection['status'],
      observation: correction.observation as RuntimeAuditObservation,
      impacts: correction.impacts as RuntimeAuditCaseImpact | undefined,
      resolution: { ...resolution, assertions },
    }];
  });
  const document = input as RuntimeAuditCorrectionDocument;
  return { valid: issues.length === 0, document: { ...document, corrections }, issues };
}

function validateAutoApprovalPolicy(input: unknown, issues: RuntimeAuditIssue[]): void {
  if (!isRecord(input)
    || !nonEmpty(input.policyId)
    || typeof input.enabled !== 'boolean'
    || !Number.isInteger(input.minimumConsumedEvidence)
    || Number(input.minimumConsumedEvidence) < 1
    || !Array.isArray(input.allowedActions)
    || input.allowedActions.some((item) => !isResolutionAction(item))
    || typeof input.allowBusinessRuleChanges !== 'boolean'
    || typeof input.allowTechnicalBindingChanges !== 'boolean'
    || typeof input.allowCoverageChanges !== 'boolean'
    || typeof input.requireMutationSafety !== 'boolean') {
    issues.push(issue('document', 'RUNTIME_AUDIT_INVALID', 'autoApprovalPolicy 格式无效'));
  }
}

function validAutomatedDecision(input: unknown): input is RuntimeAuditAutomatedDecision {
  return isRecord(input)
    && nonEmpty(input.policyId)
    && nonEmpty(input.decisionEngine)
    && nonEmpty(input.decidedAt)
    && Number.isFinite(Date.parse(input.decidedAt))
    && nonEmpty(input.rationale);
}

function isResolutionAction(value: unknown): value is RuntimeAuditResolutionAction {
  return typeof value === 'string' && [
    'correct-case', 'no-change', 'add-case', 'delete-case', 'split-case', 'merge-cases', 'block-case',
  ].includes(value);
}

function validateContext(
  document: RuntimeAuditCorrectionDocument,
  options: RuntimeAuditReconciliationOptions,
  issues: RuntimeAuditIssue[],
): void {
  const context = document.context!;
  const checks: Array<[string | undefined, string | undefined, string]> = [
    [context.applicationVersionFingerprint, options.applicationVersionFingerprint, '应用版本'],
    [context.environmentId, options.environmentId, '环境'],
    [context.roleId, options.roleId, '角色'],
  ];
  for (const [actual, expected, label] of checks) {
    if (expected && actual !== expected) issues.push(issue('document', 'RUNTIME_AUDIT_FINGERPRINT_MISMATCH', `${label}与审计合同不一致`));
  }
}

function authorizeCorrection(
  correction: RuntimeAuditCorrection,
  document: RuntimeAuditCorrectionDocument,
  issues: RuntimeAuditIssue[],
): RuntimeAuditReconciliation<RuntimeAuditableTestCase>['corrections'][number]['decision'] | undefined {
  if (correction.status === 'review-required') {
    issues.push(issue(correction.caseId, 'RUNTIME_AUDIT_REQUIRED', '运行时审计仍需人工处理异常'));
    return undefined;
  }
  if (correction.status === 'human-confirmed-runtime') {
    return {
      mode: 'human',
      decidedBy: correction.reviewedBy!,
      decidedAt: correction.reviewedAt!,
      rationale: correction.resolution.reason,
    };
  }
  const policy = document.autoApprovalPolicy;
  const automatedDecision = correction.automatedDecision!;
  const reasons: string[] = [];
  if (!policy?.enabled) reasons.push('未启用自动裁决策略');
  if (policy && automatedDecision.policyId !== policy.policyId) reasons.push('AI 决策与策略 ID 不一致');
  if (policy && !policy.allowedActions.includes(correction.resolution.action)) reasons.push('策略未授权该用例结构动作');
  if (correction.resolution.action === 'block-case') reasons.push('阻断结论必须转异常审核');
  if (correction.impacts && hasConflict(correction.impacts)) reasons.push('运行时事实与正式来源存在冲突');
  if (policy && correction.resolution.businessRuleChanges?.length && !policy.allowBusinessRuleChanges) {
    reasons.push('策略未授权业务规则变更');
  }
  if (policy && correction.resolution.technicalBindingChanges?.length && !policy.allowTechnicalBindingChanges) {
    reasons.push('策略未授权技术绑定变更');
  }
  if (policy && correction.resolution.coverageChanges?.length && !policy.allowCoverageChanges) {
    reasons.push('策略未授权覆盖分母变更');
  }
  const evidenceIds = [...new Set(correction.evidenceIds ?? [])];
  const inventory = new Map((document.evidenceInventory ?? []).map((item) => [item.evidenceId, item]));
  if (policy && evidenceIds.length < policy.minimumConsumedEvidence) reasons.push('已消费证据数量不足');
  if (evidenceIds.some((evidenceId) => inventory.get(evidenceId)?.disposition !== 'consumed')) {
    reasons.push('存在未登记或未消费证据');
  }
  if (issues.some((item) => item.caseId === 'document')) reasons.push('方案级证据、指纹或上下文门禁未通过');
  if (policy?.requireMutationSafety && !mutationEvidenceSafe(correction.observation)) {
    reasons.push('写请求缺少操作收据、终态或双端清理证明');
  }
  if (reasons.length > 0) {
    issues.push(issue(
      correction.caseId,
      'RUNTIME_AUDIT_AUTO_APPROVAL_DENIED',
      `AI 自动裁决未通过，转人工异常队列：${[...new Set(reasons)].join('；')}`,
    ));
    return undefined;
  }
  return {
    mode: 'automatic',
    policyId: automatedDecision.policyId,
    decidedBy: automatedDecision.decisionEngine,
    decidedAt: automatedDecision.decidedAt,
    rationale: automatedDecision.rationale,
  };
}

function mutationEvidenceSafe(observation: RuntimeAuditObservation): boolean {
  const sentWrites = (observation.network ?? []).filter((item) => (
    item.outcome === 'sent' && ['POST', 'PUT', 'DELETE'].includes(item.method.toUpperCase())
  ));
  if (observation.businessWriteRequest === 'not-sent') return sentWrites.length === 0;
  if (observation.businessWriteRequest !== 'sent') return sentWrites.length === 0;
  if (sentWrites.length === 0 || sentWrites.some((item) => !nonEmpty(item.operationKey))) return false;
  if (observation.persisted === 'no') {
    return observation.uiLookup === 'not-found' && observation.apiLookup === 'not-found';
  }
  if (observation.persisted !== 'yes') return false;
  return observation.cleanup?.required === true
    && observation.cleanup.apiZeroResidue
    && observation.cleanup.uiZeroResidue;
}

function validateCorrectionContext<T extends RuntimeAuditableTestCase>(
  correction: RuntimeAuditCorrection,
  document: RuntimeAuditCorrectionDocument,
  options: RuntimeAuditReconciliationOptions,
  cases: readonly T[],
  issues: RuntimeAuditIssue[],
): void {
  if (document.schemaVersion !== '2.0.0') return;
  const current = cases.find((item) => runtimeCaseId(item) === correction.caseId);
  if (current && correction.reviewedCaseFingerprint !== fingerprintRuntimeAuditableCase(current)) {
    issues.push(issue(correction.caseId, 'RUNTIME_AUDIT_FINGERPRINT_MISMATCH', '校正基于旧用例版本，禁止套用'));
  }
  const observationContextChecks: Array<[string | undefined, string | undefined, string]> = [
    [correction.observation.applicationVersionFingerprint, document.context?.applicationVersionFingerprint, '应用版本'],
    [correction.observation.environmentId, document.context?.environmentId, '环境'],
    [correction.observation.roleId, document.context?.roleId, '角色'],
    [correction.observation.locale, document.context?.locale, '语言'],
  ];
  for (const [actual, expected, label] of observationContextChecks) {
    if (expected && actual !== expected) {
      issues.push(issue(correction.caseId, 'RUNTIME_AUDIT_EVIDENCE_INVALID', `校正观察${label}与审计合同不一致`));
    }
  }
  if (correction.impacts?.technicalBinding === 'update' && !(correction.resolution.technicalBindingChanges?.length)) {
    issues.push(issue(correction.caseId, 'RUNTIME_AUDIT_BINDING_REQUIRED', '技术绑定发生变化但未提供 technicalBindingChanges'));
  }
  if (correction.impacts?.businessRule === 'update' && !(correction.resolution.businessRuleChanges?.length)) {
    issues.push(issue(correction.caseId, 'RUNTIME_AUDIT_BINDING_REQUIRED', '业务规则发生变化但未提供 businessRuleChanges'));
  }
  if (correction.impacts?.coverage === 'update' && !(correction.resolution.coverageChanges?.length)) {
    issues.push(issue(correction.caseId, 'RUNTIME_AUDIT_COVERAGE_GAP', '覆盖范围发生变化但未提供 coverageChanges'));
  }
}

function validateEvidence(
  document: RuntimeAuditCorrectionDocument,
  options: RuntimeAuditReconciliationOptions,
  issues: RuntimeAuditIssue[],
) {
  const inventory = document.evidenceInventory ?? [];
  const referenced = new Set(document.corrections.flatMap((item) => item.evidenceIds ?? []));
  const inventoryById = new Map(inventory.map((item) => [item.evidenceId, item]));
  const invalid: string[] = [];
  const consumed = inventory.filter((item) => item.disposition === 'consumed');
  for (const item of inventory) {
    const absolute = resolveEvidencePath(item.path, options.rootDir);
    if (!absolute || !fs.existsSync(absolute)) {
      invalid.push(item.evidenceId);
      issues.push(issue('document', 'RUNTIME_AUDIT_EVIDENCE_INVALID', `审计证据不存在：${item.path}`));
      continue;
    }
    if (item.sha256 && sha256File(absolute) !== item.sha256) {
      invalid.push(item.evidenceId);
      issues.push(issue('document', 'RUNTIME_AUDIT_EVIDENCE_INVALID', `审计证据哈希不一致：${item.path}`));
    }
    if (item.disposition === 'consumed' && !referenced.has(item.evidenceId)) {
      issues.push(issue('document', 'RUNTIME_AUDIT_EVIDENCE_UNREGISTERED', `已消费证据未绑定用例：${item.evidenceId}`));
    }
    if (item.disposition !== 'consumed' && !nonEmpty(item.reason)) {
      issues.push(issue('document', 'RUNTIME_AUDIT_EVIDENCE_INVALID', `非消费证据缺少原因：${item.evidenceId}`));
    }
    if (item.disposition === 'stale' || item.disposition === 'conflict' || item.disposition === 'review-required') {
      issues.push(issue('document', 'RUNTIME_AUDIT_REQUIRED', `审计证据尚不可用于生成：${item.evidenceId}:${item.disposition}`));
    }
    const freshness = assessRuntimeAuditFreshness({
      observedAt: item.observedAt,
      freshUntil: item.freshUntil,
      maxAgeDays: document.context?.maxEvidenceAgeDays,
      now: options.now,
    });
    if (freshness.status !== 'fresh') {
      issues.push(issue(
        'document',
        freshness.status === 'stale' ? 'RUNTIME_AUDIT_EVIDENCE_INVALID' : 'RUNTIME_AUDIT_EVIDENCE_INVALID',
        `审计证据新鲜度无效：${item.evidenceId}:${freshness.reasons.join(',')}`,
      ));
    }
    const contextChecks: Array<[string | undefined, string | undefined, string]> = [
      [item.applicationVersionFingerprint, document.context?.applicationVersionFingerprint, '应用版本'],
      [item.environmentId, document.context?.environmentId, '环境'],
      [item.roleId, document.context?.roleId, '角色'],
      [item.locale, document.context?.locale, '语言'],
    ];
    for (const [actual, expected, label] of contextChecks) {
      if (expected && actual !== expected) {
        issues.push(issue('document', 'RUNTIME_AUDIT_EVIDENCE_INVALID', `审计证据${label}不一致：${item.evidenceId}`));
      }
    }
  }
  for (const evidenceId of referenced) {
    const item = inventoryById.get(evidenceId);
    if (!item || item.disposition !== 'consumed') {
      issues.push(issue('document', 'RUNTIME_AUDIT_EVIDENCE_UNREGISTERED', `用例引用了未登记或未消费证据：${evidenceId}`));
    }
  }
  if (document.schemaVersion === '2.0.0') {
    const discovery = document.evidenceDiscovery!;
    const discovered = discoverEvidence(discovery.rootPaths, options.rootDir, discovery.extensions);
    const registeredPaths = new Set(inventory.map((item) => normalizePath(item.path)));
    const unregistered = discovered.filter((item) => !registeredPaths.has(normalizePath(item))).sort();
    for (const filePath of unregistered) {
      issues.push(issue('document', 'RUNTIME_AUDIT_EVIDENCE_UNREGISTERED', `发现未登记审计证据：${filePath}`));
    }
    if (discovery.strict && unregistered.length > 0) invalid.push(...unregistered);
    return {
      registered: inventory.length,
      consumed: consumed.length,
      unregistered,
      invalid,
    };
  }
  return { registered: inventory.length, consumed: consumed.length, unregistered: [], invalid };
}

function validateCoverage(
  document: RuntimeAuditCorrectionDocument,
  cases: readonly RuntimeAuditableTestCase[],
  issues: RuntimeAuditIssue[],
): void {
  if (document.schemaVersion !== '2.0.0') return;
  const ids = new Set(cases.map(runtimeCaseId));
  for (const item of document.coverageInventory ?? []) {
    if (item.disposition === 'required' && !(item.linkedCaseIds ?? []).some((id) => ids.has(id))) {
      issues.push(issue(item.coverageId, 'RUNTIME_AUDIT_COVERAGE_GAP', `必测覆盖项没有关联用例：${item.coverageId}`));
    }
    if (item.disposition !== 'required' && !nonEmpty(item.reason)) {
      issues.push(issue(item.coverageId, 'RUNTIME_AUDIT_COVERAGE_GAP', `非必测覆盖项缺少处置原因：${item.coverageId}`));
    }
  }
}

function assertionsMatch<T extends RuntimeAuditableTestCase>(
  correction: RuntimeAuditCorrection,
  item: T,
): boolean {
  return correction.resolution.assertions.every((assertion) => {
    if (!item.expectedResults.includes(assertion.text)) return false;
    const observed = readFact(correction.observation, assertion.fact);
    if (assertion.expectedValue !== undefined && !deepEqual(observed, assertion.expectedValue)) return false;
    if (assertion.fact === 'exact-ui-feedback') {
      return (correction.observation.exactUiFeedback ?? []).every((message) => assertion.text.includes(message));
    }
    return observed !== undefined;
  });
}

function readFact(observation: RuntimeAuditObservation, fact: string): unknown {
  if (fact === 'locale') return observation.locale;
  if (fact === 'route') return observation.route;
  if (fact === 'page-mode') return observation.pageMode;
  if (fact === 'exact-ui-feedback') return observation.exactUiFeedback;
  if (fact === 'submit-button-state') return observation.submitButtonState;
  if (fact === 'business-write-request') return observation.businessWriteRequest;
  if (fact === 'persisted') return observation.persisted;
  if (fact === 'ui-lookup') return observation.uiLookup;
  if (fact === 'api-lookup') return observation.apiLookup;
  const [kind, id, property] = fact.split(':');
  if (kind === 'control') return observation.controls?.find((item) => item.id === id)?.[property as 'state' | 'visible' | 'required' | 'label'];
  if (kind === 'field') return observation.fields?.find((item) => item.id === id)?.[property as 'visible' | 'required' | 'enabled' | 'defaultValue' | 'value' | 'min' | 'max' | 'options'];
  if (kind === 'network') return observation.network?.find((item) => item.operationKey === id || `${item.method} ${item.path}` === id)?.[property as 'method' | 'path' | 'operationKey' | 'status' | 'outcome'];
  return undefined;
}

function applyPatches<T extends RuntimeAuditableTestCase>(
  item: T,
  patches: Partial<RuntimeAuditableTestCase> | undefined,
  correction: RuntimeAuditCorrection,
): T {
  if (!patches) return addEvidenceToCase(item, correction);
  const patched = { ...item, ...structuredClone(patches) } as T;
  if (item.claims && !patches.claims) {
    patched.claims = syncClaims(item.claims, patched);
  }
  return addEvidenceToCase(patched, correction);
}

function syncClaims<T extends RuntimeAuditableTestCase>(
  claims: NonNullable<T['claims']>,
  item: T,
): NonNullable<T['claims']> {
  const positions = { precondition: 0, action: 0, expectation: 0 };
  const values = { precondition: item.preconditions, action: item.actions, expectation: item.expectedResults };
  return claims.map((claim) => {
    const index = positions[claim.kind]++;
    const text = values[claim.kind][index];
    return text === undefined ? claim : { ...claim, text };
  });
}

function addEvidenceToCase<T extends RuntimeAuditableTestCase>(item: T, correction: RuntimeAuditCorrection): T {
  const evidenceIds = correction.evidenceIds ?? [];
  if (evidenceIds.length === 0) return item;
  return {
    ...item,
    sourceIds: [...new Set([...(item.sourceIds ?? []), ...evidenceIds])],
    claims: item.claims?.map((claim) => ({
      ...claim,
      sourceIds: [...new Set([...(claim.sourceIds ?? []), ...evidenceIds])],
      evidenceLevel: claim.evidenceLevel === 'conflicting' ? claim.evidenceLevel : 'observed',
      sourceTrace: appendRuntimeEvidence(claim.sourceTrace, evidenceIds),
    })),
  };
}

function appendRuntimeEvidence(
  sourceTrace: Record<string, unknown> | undefined,
  evidenceIds: string[],
): Record<string, unknown> | undefined {
  if (!sourceTrace) return undefined;
  const current = Array.isArray(sourceTrace.executionEvidence)
    ? sourceTrace.executionEvidence as Array<Record<string, unknown>>
    : [];
  return {
    ...sourceTrace,
    executionEvidence: [
      ...current,
      { kind: 'runtime-confirmed', sourceIds: [...evidenceIds] },
    ],
  };
}

function applyTechnicalBindingChanges<T extends RuntimeAuditableTestCase>(
  cases: T[],
  changes: readonly RuntimeAuditTechnicalBindingChange[],
  issues: RuntimeAuditIssue[],
): void {
  const byId = new Map(cases.map((item) => [runtimeCaseId(item), item]));
  for (const change of changes) {
    const item = byId.get(change.caseId);
    if (!item) {
      issues.push(issue(change.caseId, 'RUNTIME_AUDIT_CASE_NOT_FOUND', '技术绑定更新目标用例不存在'));
      continue;
    }
    if (change.route !== undefined) item.route = change.route;
    if (change.capabilityIds !== undefined) item.capabilityIds = [...change.capabilityIds];
    if (change.assertionAdapterIds !== undefined) item.assertionAdapterIds = [...change.assertionAdapterIds];
    if (change.verificationSignals !== undefined) item.verificationSignals = [...change.verificationSignals];
    if (change.cleanupAdapterIds !== undefined) item.cleanupAdapterIds = [...change.cleanupAdapterIds];
    if (item.execution && typeof item.execution === 'object') {
      item.execution = {
        ...(item.execution as Record<string, unknown>),
        ...(change.capabilityIds !== undefined ? { capabilityIds: [...change.capabilityIds] } : {}),
        ...(change.verificationSignals !== undefined ? { verificationSignals: [...change.verificationSignals] } : {}),
        ...(change.seedAdapterIds !== undefined ? { seedAdapterIds: [...change.seedAdapterIds] } : {}),
        ...(change.cleanupAdapterIds !== undefined ? { cleanupAdapterIds: [...change.cleanupAdapterIds] } : {}),
      };
    }
  }
}

function applyCoverageChanges<T extends RuntimeAuditableTestCase>(
  cases: T[],
  changes: readonly RuntimeAuditCoverage[],
): void {
  const byId = new Map(cases.map((item) => [runtimeCaseId(item), item]));
  for (const change of changes) {
    for (const caseId of change.linkedCaseIds ?? []) {
      const item = byId.get(caseId);
      if (!item) continue;
      const current = new Set(item.coverageIds ?? []);
      if (change.disposition === 'required' || change.disposition === 'covered') current.add(change.coverageId);
      else current.delete(change.coverageId);
      item.coverageIds = [...current].sort();
    }
  }
}

function validateCaseId(caseItem: RuntimeAuditableTestCase): string {
  const id = runtimeCaseId(caseItem);
  if (!id) throw new Error('运行时审计用例缺少 ID');
  return id;
}

function runtimeCaseId(caseItem: RuntimeAuditableTestCase): string {
  return caseItem.id ?? caseItem.caseId ?? caseItem.canonicalId ?? '';
}

function rebuildCaseIndex<T extends RuntimeAuditableTestCase>(index: Map<string, number>, cases: readonly T[]): void {
  index.clear();
  cases.forEach((item, position) => index.set(validateCaseId(item), position));
}

function changedFields(correction: RuntimeAuditCorrection): string[] {
  const patches = correction.resolution.patches ? Object.keys(correction.resolution.patches) : [];
  return [...new Set([...patches,
    ...(correction.resolution.businessRuleChanges?.length ? ['businessRuleChanges'] : []),
    ...(correction.resolution.technicalBindingChanges?.length ? ['technicalBindingChanges'] : []),
    ...(correction.resolution.coverageChanges?.length ? ['coverageChanges'] : []),
  ])].sort();
}

function resolveRerunCaseIds(correction: RuntimeAuditCorrection, fields: readonly string[]): string[] {
  if (correction.resolution.action === 'delete-case' || correction.resolution.action === 'block-case') return [];
  if (correction.resolution.action === 'no-change'
    && fields.length === 0
    && correction.impacts?.businessRule !== 'update'
    && correction.impacts?.technicalBinding !== 'update'
    && correction.impacts?.coverage !== 'update') return [];
  if (['add-case', 'split-case', 'merge-cases'].includes(correction.resolution.action)) {
    return (correction.resolution.replacementCases ?? []).map(validateCaseId);
  }
  return [correction.caseId];
}

function hasConflict(impact: RuntimeAuditCaseImpact): boolean {
  return impact.businessRule === 'conflict' || impact.technicalBinding === 'conflict' || impact.coverage === 'conflict';
}

function failedResult<T extends RuntimeAuditableTestCase>(
  cases: readonly T[],
  issues: RuntimeAuditIssue[],
  evidence: RuntimeAuditReconciliation<T>['evidence'],
): RuntimeAuditReconciliation<T> {
  return {
    status: 'review-required',
    cases: cases.map((item) => structuredClone(item)),
    rerunCaseIds: [],
    corrections: [],
    businessRuleChanges: [],
    technicalBindingChanges: [],
    coverageChanges: [],
    issues,
    evidence,
  };
}

function invalidDocument(caseId: string, message: string, issues: RuntimeAuditIssue[]) {
  issues.push(issue(caseId, 'RUNTIME_AUDIT_INVALID', message));
  return {
    valid: false,
    document: {
      schemaVersion: '1.0.0' as const,
      collectionId: '',
      planId: '',
      generatedAt: '',
      corrections: [],
    },
    issues,
  };
}

function issue(caseId: string, code: RuntimeAuditIssue['code'], message: string): RuntimeAuditIssue {
  return { caseId, code, message };
}

function selectFingerprintFields(item: RuntimeAuditableTestCase): Record<string, unknown> {
  return {
    id: runtimeCaseId(item),
    title: item.title,
    preconditions: item.preconditions,
    actions: item.actions,
    expectedResults: item.expectedResults,
    module: item.module,
    route: item.route,
    sourceIds: item.sourceIds,
    coverageIds: item.coverageIds,
    capabilityIds: item.capabilityIds,
    assertionAdapterIds: item.assertionAdapterIds,
  };
}

function deepEqual(left: unknown, right: unknown): boolean {
  return stableJson(left) === stableJson(right);
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function sha256File(filePath: string): string {
  return createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function resolveEvidencePath(value: string, rootDir = process.cwd()): string | undefined {
  const normalized = normalizePath(value);
  if (!normalized || normalized.startsWith('/') || /^[A-Z]:\//i.test(normalized) || normalized.split('/').includes('..')) return undefined;
  return path.resolve(rootDir, normalized);
}

function normalizePath(value: string): string {
  return value.trim().replace(/\\/g, '/').replace(/^\.\//, '');
}

function discoverEvidence(rootPaths: readonly string[], rootDir = process.cwd(), extensions?: readonly string[]): string[] {
  const allowed = new Set((extensions ?? ['.json', '.md', '.yaml', '.yml', '.png', '.jpg', '.jpeg', '.mp4', '.webm'])
    .map((value) => value.toLowerCase()));
  const found: string[] = [];
  const visit = (absolute: string) => {
    if (!fs.existsSync(absolute)) return;
    const stat = fs.statSync(absolute);
    if (stat.isFile()) {
      if (allowed.has(path.extname(absolute).toLowerCase())) found.push(path.relative(rootDir, absolute).replace(/\\/g, '/'));
      return;
    }
    for (const child of fs.readdirSync(absolute)) visit(path.join(absolute, child));
  };
  rootPaths.forEach((root) => visit(path.resolve(rootDir, root)));
  return [...new Set(found)];
}

function uniqueBy<T>(items: readonly T[], key: (item: T) => string): T[] {
  return [...new Map(items.map((item) => [key(item), item])).values()];
}

function nonEmpty(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isRecord(value: unknown): value is Record<string, any> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export {
  validateCaseId,
};
