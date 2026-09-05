import fs from 'node:fs';
import path from 'node:path';
import { fingerprintReceiptEvidence } from '../utils/playwright-execution-receipt';
import {
  evaluateSystemTestRuntimeContract,
  type RuntimeAssertionReceipt,
  type RuntimeOperationReceipt,
} from '../automation/system-test/system-test-runtime-contract';

type AllureAttachment = { name?: string; source?: string; type?: string };
type AllureStep = {
  name?: string;
  status?: string;
  steps?: AllureStep[];
  attachments?: AllureAttachment[];
};
type AllureResult = {
  name?: string;
  status?: string;
  statusDetails?: { message?: string };
  labels?: Array<{ name?: string; value?: string }>;
  steps?: AllureStep[];
  attachments?: AllureAttachment[];
};
type CoverageCase = {
  caseId: string;
  title: string;
  module: string;
  executionStatus: string;
  governanceStatus: string;
};
type CoverageAudit = {
  summary: { total: number; actualResultCases: number; notRun: number };
  cases: CoverageCase[];
};
type GovernanceTask = {
  caseId: string;
  action: string;
  reason?: string;
  bindingFingerprint?: string | null;
  blockCode?: string | null;
};
type GovernanceResult = {
  executionCases: Array<{ caseId: string; status: string }>;
  nonExecutionTasks: GovernanceTask[];
};
type OptimizationPlan = {
  caseFingerprints: Record<string, string>;
  implementationFingerprints: Record<string, string>;
  businessImplementationFingerprints?: Record<string, string>;
  caseDecisions?: Record<string, {
    decision?: string;
    impactType?: string;
  }>;
};
type Claims = { required?: string[]; observed?: string[]; verified?: string[] };
type StandardReceipt = {
  receiptVersion?: string;
  caseId?: string;
  caseFingerprint?: string;
  implementationFingerprint?: string;
  executionContext?: Record<string, unknown>;
  claims?: Claims;
  operationReceipts?: RuntimeOperationReceipt[];
  assertionReceipts?: RuntimeAssertionReceipt[];
  cleanup?: { apiZeroResidue?: boolean; uiZeroResidue?: boolean } | null;
  evidenceFingerprint?: string;
};
type ParsedAttachment = AllureAttachment & { filePath: string; data?: unknown };
type Finding = {
  caseId: string;
  severity: 'error' | 'warning';
  code: string;
  message: string;
};
type CaseAudit = {
  caseId: string;
  module: string;
  executionStatus: string;
  closureStatus: 'complete' | 'classified' | 'incomplete';
  receiptContract: 'standard-3.1' | 'seasoning-legacy-compatible' | 'governance-disposition' | 'missing';
  caseFingerprint?: string | null;
  implementationFingerprint?: string | null;
  operationReceiptCount: number;
  assertionReceiptCount: number;
  cleanupVerified: boolean;
  failureClassification?: string | null;
  findings: Finding[];
};

export type ProductCenter420ReceiptClosureReport = {
  schemaVersion: '1.0.0';
  reportId: 'merchant-center-product-center-420-receipt-closure';
  generatedAt: string;
  status: 'pass' | 'incomplete';
  summary: {
    expectedCases: number;
    actualResultCases: number;
    classifiedNotRunCases: number;
    completeCases: number;
    classifiedCases: number;
    incompleteCases: number;
    standardReceiptCases: number;
    seasoningLegacyCompatibleCases: number;
    findings: number;
    errors: number;
    warnings: number;
  };
  rerunPlan: {
    requiredCaseIds: string[];
    historicalEvidenceDebtCaseIds: string[];
    seasoningCaseIdsExcludedByPolicy: string[];
    reasonByCaseId: Record<string, string[]>;
  };
  cases: CaseAudit[];
  findings: Finding[];
};

export function auditProductCenter420ReceiptClosure(input: {
  resultsDir: string;
  coverage: CoverageAudit;
  governance: GovernanceResult;
  optimizationPlan: OptimizationPlan;
}): ProductCenter420ReceiptClosureReport {
  const resultFiles = fs.readdirSync(input.resultsDir)
    .filter((name) => name.endsWith('-result.json'))
    .sort();
  const resultEntries = resultFiles.map((name) => {
    const filePath = path.join(input.resultsDir, name);
    const result = readJson<AllureResult>(filePath);
    return { filePath, result, caseId: findCaseId(result) };
  });
  const resultsByCaseId = new Map<string, typeof resultEntries>();
  for (const entry of resultEntries) {
    if (!entry.caseId) continue;
    const existing = resultsByCaseId.get(entry.caseId) ?? [];
    existing.push(entry);
    resultsByCaseId.set(entry.caseId, existing);
  }
  const executionByCaseId = new Map(input.governance.executionCases.map((item) => [item.caseId, item]));
  const dispositionByCaseId = new Map(input.governance.nonExecutionTasks.map((item) => [item.caseId, item]));
  const cases = input.coverage.cases.map((coverageCase): CaseAudit => {
    const findings: Finding[] = [];
    const matches = resultsByCaseId.get(coverageCase.caseId) ?? [];
    if (coverageCase.executionStatus === 'not-run') {
      const disposition = dispositionByCaseId.get(coverageCase.caseId);
      if (matches.length > 0) add(findings, coverageCase.caseId, 'error', 'NOT_RUN_HAS_RESULT', '治理未运行用例不应同时存在当前 Allure 结果。');
      if (!disposition) add(findings, coverageCase.caseId, 'error', 'GOVERNANCE_DISPOSITION_MISSING', '治理未运行用例缺少正式 disposition。');
      if (disposition && disposition.action !== coverageCase.governanceStatus) {
        add(findings, coverageCase.caseId, 'error', 'GOVERNANCE_DISPOSITION_MISMATCH', `覆盖审计=${coverageCase.governanceStatus}，正式治理=${disposition.action}。`);
      }
      if (!disposition?.reason?.trim()) add(findings, coverageCase.caseId, 'error', 'GOVERNANCE_REASON_MISSING', '治理 disposition 缺少原因。');
      if (disposition?.action === 'product-defect' && !disposition.bindingFingerprint) {
        add(findings, coverageCase.caseId, 'error', 'PRODUCT_DEFECT_FINGERPRINT_MISSING', '产品差异 disposition 缺少用例指纹。');
      }
      return {
        caseId: coverageCase.caseId,
        module: coverageCase.module,
        executionStatus: 'not-run',
        closureStatus: findings.some((item) => item.severity === 'error') ? 'incomplete' : 'classified',
        receiptContract: 'governance-disposition',
        caseFingerprint: disposition?.bindingFingerprint ?? null,
        implementationFingerprint: null,
        operationReceiptCount: 0,
        assertionReceiptCount: 0,
        cleanupVerified: false,
        failureClassification: disposition?.action ?? null,
        findings,
      };
    }
    if (matches.length !== 1) {
      add(findings, coverageCase.caseId, 'error', matches.length === 0 ? 'RESULT_MISSING' : 'RESULT_DUPLICATE', `当前 Allure 结果数量=${matches.length}。`);
      return {
        caseId: coverageCase.caseId,
        module: coverageCase.module,
        executionStatus: coverageCase.executionStatus,
        closureStatus: 'incomplete',
        receiptContract: 'missing',
        operationReceiptCount: 0,
        assertionReceiptCount: 0,
        cleanupVerified: false,
        findings,
      };
    }
    const entry = matches[0];
    if (entry.result.status !== coverageCase.executionStatus) {
      add(findings, coverageCase.caseId, 'error', 'RESULT_STATUS_MISMATCH', `覆盖审计=${coverageCase.executionStatus}，Allure=${entry.result.status ?? 'unknown'}。`);
    }
    auditHierarchy(entry.result, coverageCase.caseId, findings);
    const attachments = parseAttachments(entry.result, input.resultsDir, coverageCase.caseId, findings);
    if (coverageCase.module === 'seasoning') {
      return auditSeasoningCase(coverageCase, entry.result, attachments, findings);
    }
    return auditStandardCase({
      coverageCase,
      result: entry.result,
      attachments,
      currentCaseFingerprint: input.optimizationPlan.caseFingerprints[coverageCase.caseId],
      requireCurrentCaseFingerprint: requiresCurrentCaseFingerprint(
        input.optimizationPlan,
        coverageCase.caseId,
      ),
      currentImplementationFingerprint: expectedImplementationFingerprint(
        input.optimizationPlan,
        coverageCase.caseId,
      ),
      requireCurrentImplementationFingerprint: requiresCurrentImplementationFingerprint(
        input.optimizationPlan,
        coverageCase.caseId,
      ),
      governanceExecutionStatus: executionByCaseId.get(coverageCase.caseId)?.status,
      findings,
    });
  });
  const coverageIds = new Set(input.coverage.cases.map((item) => item.caseId));
  for (const entry of resultEntries) {
    if (!entry.caseId) continue;
    if (!coverageIds.has(entry.caseId)) addGlobalCaseFinding(cases, entry.caseId, 'RESULT_OUTSIDE_COVERAGE', 'Allure 结果不在 420 条覆盖清单中。');
  }
  const duplicateCoverage = input.coverage.cases
    .map((item) => item.caseId)
    .filter((caseId, index, values) => values.indexOf(caseId) !== index);
  for (const caseId of [...new Set(duplicateCoverage)]) addGlobalCaseFinding(cases, caseId, 'COVERAGE_CASE_DUPLICATE', '420 条覆盖清单 caseId 重复。');
  const findings = cases.flatMap((item) => item.findings)
    .sort((left, right) => left.caseId.localeCompare(right.caseId) || left.code.localeCompare(right.code));
  const requiredCaseIds = cases.filter((item) => item.closureStatus === 'incomplete'
      && item.module !== 'seasoning'
      && isExecutionRequiredCase(input.optimizationPlan, item.caseId))
    .map((item) => item.caseId).sort();
  const requiredCaseIdSet = new Set(requiredCaseIds);
  const historicalEvidenceDebtCaseIds = cases.filter((item) => item.closureStatus === 'incomplete'
      && item.module !== 'seasoning'
      && !requiredCaseIdSet.has(item.caseId))
    .map((item) => item.caseId).sort();
  const seasoningCaseIdsExcludedByPolicy = cases.filter((item) => item.closureStatus === 'incomplete' && item.module === 'seasoning')
    .map((item) => item.caseId).sort();
  const report: ProductCenter420ReceiptClosureReport = {
    schemaVersion: '1.0.0',
    reportId: 'merchant-center-product-center-420-receipt-closure',
    generatedAt: new Date().toISOString(),
    status: findings.some((item) => item.severity === 'error') ? 'incomplete' : 'pass',
    summary: {
      expectedCases: input.coverage.summary.total,
      actualResultCases: resultEntries.length,
      classifiedNotRunCases: cases.filter((item) => item.closureStatus === 'classified').length,
      completeCases: cases.filter((item) => item.closureStatus === 'complete').length,
      classifiedCases: cases.filter((item) => item.closureStatus === 'classified').length,
      incompleteCases: cases.filter((item) => item.closureStatus === 'incomplete').length,
      standardReceiptCases: cases.filter((item) => item.receiptContract === 'standard-3.1').length,
      seasoningLegacyCompatibleCases: cases.filter((item) => item.receiptContract === 'seasoning-legacy-compatible').length,
      findings: findings.length,
      errors: findings.filter((item) => item.severity === 'error').length,
      warnings: findings.filter((item) => item.severity === 'warning').length,
    },
    rerunPlan: {
      requiredCaseIds,
      historicalEvidenceDebtCaseIds,
      seasoningCaseIdsExcludedByPolicy,
      reasonByCaseId: Object.fromEntries(cases.filter((item) => item.closureStatus === 'incomplete').map((item) => [
        item.caseId,
        item.findings.filter((finding) => finding.severity === 'error').map((finding) => finding.code),
      ])),
    },
    cases,
    findings,
  };
  if (report.summary.expectedCases !== cases.length) {
    report.status = 'incomplete';
    report.findings.unshift({
      caseId: 'COVERAGE',
      severity: 'error',
      code: 'COVERAGE_TOTAL_MISMATCH',
      message: `声明总数=${report.summary.expectedCases}，逐案数=${cases.length}。`,
    });
    report.summary.findings += 1;
    report.summary.errors += 1;
  }
  return report;
}

function auditStandardCase(input: {
  coverageCase: CoverageCase;
  result: AllureResult;
  attachments: ParsedAttachment[];
  currentCaseFingerprint?: string;
  requireCurrentCaseFingerprint: boolean;
  currentImplementationFingerprint?: string;
  requireCurrentImplementationFingerprint: boolean;
  governanceExecutionStatus?: string;
  findings: Finding[];
}): CaseAudit {
  const { coverageCase, result, attachments, findings } = input;
  const receipts = attachments.map((item) => item.data)
    .filter((value): value is StandardReceipt => isRecord(value) && typeof value.receiptVersion === 'string');
  if (receipts.length !== 1) add(findings, coverageCase.caseId, 'error', receipts.length === 0 ? 'STANDARD_RECEIPT_MISSING' : 'STANDARD_RECEIPT_DUPLICATE', `3.1 标准收据数量=${receipts.length}。`);
  const receipt = receipts[0];
  if (!receipt) {
    return {
      caseId: coverageCase.caseId,
      module: coverageCase.module,
      executionStatus: coverageCase.executionStatus,
      closureStatus: 'incomplete',
      receiptContract: 'missing',
      operationReceiptCount: 0,
      assertionReceiptCount: 0,
      cleanupVerified: false,
      findings,
    };
  }
  if (receipt.receiptVersion !== '3.1.0') add(findings, coverageCase.caseId, 'error', 'STANDARD_RECEIPT_VERSION_UNSUPPORTED', `收据版本=${receipt.receiptVersion ?? 'missing'}。`);
  if (receipt.caseId !== coverageCase.caseId) add(findings, coverageCase.caseId, 'error', 'STANDARD_RECEIPT_CASE_MISMATCH', `收据 caseId=${receipt.caseId ?? 'missing'}。`);
  if (input.requireCurrentCaseFingerprint) {
    if (!input.currentCaseFingerprint) add(findings, coverageCase.caseId, 'error', 'CURRENT_CASE_FINGERPRINT_MISSING', '当前优化计划缺少用例指纹。');
    else if (normalizeFingerprint(receipt.caseFingerprint) !== normalizeFingerprint(input.currentCaseFingerprint)) {
      add(findings, coverageCase.caseId, 'error', 'CASE_FINGERPRINT_STALE', '收据用例指纹与当前优化计划不一致。');
    }
  }
  if (input.requireCurrentImplementationFingerprint) {
    if (!input.currentImplementationFingerprint) add(findings, coverageCase.caseId, 'error', 'CURRENT_IMPLEMENTATION_FINGERPRINT_MISSING', '当前优化计划缺少业务实现指纹。');
    else if (normalizeFingerprint(receipt.implementationFingerprint) !== normalizeFingerprint(input.currentImplementationFingerprint)) {
      add(findings, coverageCase.caseId, 'error', 'IMPLEMENTATION_FINGERPRINT_STALE', '收据实现指纹与当前业务实现指纹不一致。');
    }
  }
  const context = receipt.executionContext ?? {};
  for (const key of ['environmentId', 'tenantScope', 'locale', 'roleId', 'route']) {
    if (!String(context[key] ?? '').trim()) add(findings, coverageCase.caseId, 'error', 'EXECUTION_CONTEXT_INCOMPLETE', `执行上下文缺少 ${key}。`);
  }
  const operations = receipt.operationReceipts ?? [];
  if (operations.length === 0) add(findings, coverageCase.caseId, 'error', 'OPERATION_RECEIPT_MISSING', '缺少业务操作收据。');
  if (operations.some((item) => !item.operationKey?.trim() || !item.method?.trim() || !item.observed || item.status !== 'passed')) {
    add(findings, coverageCase.caseId, 'error', 'OPERATION_RECEIPT_INVALID', '存在未观察、未完成或缺少方法的业务操作收据。');
  }
  const requiredClaims = unique(receipt.claims?.required ?? []);
  const observedClaims = new Set(receipt.claims?.observed ?? []);
  const verifiedClaims = new Set(receipt.claims?.verified ?? []);
  if (requiredClaims.length === 0 || requiredClaims.some((claimId) => !observedClaims.has(claimId))) {
    add(findings, coverageCase.caseId, 'error', 'CLAIM_OBSERVATION_INCOMPLETE', '断言声明为空或存在未观测 claim。');
  }
  const richAssertions = receipt.assertionReceipts ?? [];
  const assertionSteps = assertionLeafSteps(result);
  const passedResult = result.status === 'passed';
  if (passedResult) {
    if (requiredClaims.some((claimId) => !verifiedClaims.has(claimId))) add(findings, coverageCase.caseId, 'error', 'PASSED_CLAIM_NOT_VERIFIED', '通过用例存在未验证 claim。');
    if (richAssertions.some((item) => item.status === 'observed-mismatch') || assertionSteps.some((item) => item.status === 'failed' || /结果：失败|observed-mismatch/.test(item.name ?? ''))) {
      add(findings, coverageCase.caseId, 'error', 'PASSED_RESULT_CONTAINS_MISMATCH', '通过结果包含 mismatch 断言。');
    }
    if (richAssertions.length === 0) {
      if (assertionSteps.length === 0 || assertionSteps.some((item) => !/期望[:：]/.test(item.name ?? '') || !/实际[:：]/.test(item.name ?? '') || item.status !== 'passed')) {
        add(findings, coverageCase.caseId, 'error', 'ASSERTION_OBSERVATION_ATTACHMENT_INCOMPLETE', 'claims 模式未被逐项期望/实际通过步骤交叉证明。');
      }
    }
  } else {
    if (input.governanceExecutionStatus !== 'failed') add(findings, coverageCase.caseId, 'error', 'FAILED_RESULT_GOVERNANCE_MISMATCH', `正式执行结果=${input.governanceExecutionStatus ?? 'missing'}。`);
    if (richAssertions.length === 0 || !richAssertions.some((item) => item.status === 'observed-mismatch')) {
      add(findings, coverageCase.caseId, 'error', 'FAILED_ASSERTION_RECEIPT_MISSING', '失败用例缺少富结构 mismatch 断言收据。');
    }
    const richVerified = new Set(richAssertions.filter((item) => item.status === 'verified').map((item) => item.claimId));
    if (requiredClaims.some((claimId) => !richAssertions.some((item) => item.claimId === claimId))) add(findings, coverageCase.caseId, 'error', 'FAILED_ASSERTION_COVERAGE_INCOMPLETE', '失败用例未逐项覆盖 required claims。');
    if ([...verifiedClaims].some((claimId) => !richVerified.has(claimId)) || [...richVerified].some((claimId) => !verifiedClaims.has(claimId))) {
      add(findings, coverageCase.caseId, 'error', 'FAILED_CLAIM_VERIFICATION_FALSE', 'claims.verified 与富结构断言状态不一致。');
    }
    if (!hasProductFailureClassification(attachments, result)) add(findings, coverageCase.caseId, 'error', 'FAILURE_CLASSIFICATION_MISSING', '失败结果缺少结构化产品差异/失败分类。');
    if (!failedAssertionHasScreenshot(result)) add(findings, coverageCase.caseId, 'error', 'FAILURE_SCREENSHOT_MISSING', '失败截图未绑定到实际失败断言步骤。');
  }
  if (richAssertions.length > 0) {
    const runtimeEvaluation = evaluateSystemTestRuntimeContract({
      caseId: coverageCase.caseId,
      requiredOperationKeys: unique(operations.map((item) => item.operationKey)),
      requiredAssertionIds: requiredClaims,
      operationReceipts: operations,
      assertionReceipts: richAssertions,
    });
    for (const finding of runtimeEvaluation.findings) add(findings, coverageCase.caseId, 'error', `RUNTIME_${finding.code}`, finding.message);
  }
  const cleanupVerified = receipt.cleanup?.apiZeroResidue === true && receipt.cleanup.uiZeroResidue === true;
  if (!cleanupVerified) add(findings, coverageCase.caseId, 'error', 'CLEANUP_NOT_VERIFIED', '缺少 API/UI 双零残留收据。');
  if (!receipt.evidenceFingerprint || receipt.evidenceFingerprint !== fingerprintReceiptEvidence(receipt)) {
    add(findings, coverageCase.caseId, 'error', 'EVIDENCE_FINGERPRINT_MISMATCH', '标准收据证据指纹缺失或不匹配。');
  }
  return {
    caseId: coverageCase.caseId,
    module: coverageCase.module,
    executionStatus: coverageCase.executionStatus,
    closureStatus: findings.some((item) => item.severity === 'error') ? 'incomplete' : 'complete',
    receiptContract: 'standard-3.1',
    caseFingerprint: receipt.caseFingerprint ?? null,
    implementationFingerprint: receipt.implementationFingerprint ?? null,
    operationReceiptCount: operations.length,
    assertionReceiptCount: richAssertions.length || requiredClaims.length,
    cleanupVerified,
    failureClassification: passedResult ? null : resolveFailureClassification(attachments, result),
    findings,
  };
}

function auditSeasoningCase(
  coverageCase: CoverageCase,
  result: AllureResult,
  attachments: ParsedAttachment[],
  findings: Finding[],
): CaseAudit {
  const operationAttachments = attachments.filter((item) => isRecord(item.data)
    && (Array.isArray(item.data.operations) || Array.isArray(item.data.operationReceipts)));
  const assertionSteps = assertionLeafSteps(result);
  if (operationAttachments.length === 0) add(findings, coverageCase.caseId, 'error', 'SEASONING_OPERATION_EVIDENCE_MISSING', '调味既有报告缺少业务操作执行收据。');
  if (assertionSteps.length === 0 || assertionSteps.some((item) => !/期望[:：]/.test(item.name ?? '') || !/实际[:：]/.test(item.name ?? ''))) {
    add(findings, coverageCase.caseId, 'error', 'SEASONING_ASSERTION_EVIDENCE_INCOMPLETE', '调味既有报告未逐项展示期望值与实际值。');
  }
  if (result.status === 'passed' && assertionSteps.some((item) => item.status !== 'passed' || /结果：失败/.test(item.name ?? ''))) {
    add(findings, coverageCase.caseId, 'error', 'SEASONING_FALSE_PASS_RISK', '调味通过结果包含失败断言。');
  }
  if (result.status === 'failed') {
    if (!assertionSteps.some((item) => item.status === 'failed')) add(findings, coverageCase.caseId, 'error', 'SEASONING_FAILED_ASSERTION_MISSING', '调味失败结果缺少实际失败断言步骤。');
    if (!failedAssertionHasScreenshot(result)) add(findings, coverageCase.caseId, 'error', 'SEASONING_FAILURE_SCREENSHOT_MISSING', '调味失败截图未绑定到实际失败断言步骤。');
    if (!resolveFailureClassification(attachments, result)) add(findings, coverageCase.caseId, 'error', 'SEASONING_FAILURE_CLASSIFICATION_MISSING', '调味失败结果缺少可识别分类。');
  }
  const cleanupStep = result.steps?.find((step) => step.name?.startsWith('[清理]'));
  const cleanupVerified = Boolean(cleanupStep && cleanupStep.status === 'passed' && /零残留|无残留|无需清理|未声明需清理/.test(flattenSteps([cleanupStep]).map((item) => item.name ?? '').join(' ')));
  if (!cleanupVerified) add(findings, coverageCase.caseId, 'error', 'SEASONING_CLEANUP_EVIDENCE_INCOMPLETE', '调味既有报告缺少可识别的清理终态。');
  add(findings, coverageCase.caseId, 'warning', 'SEASONING_LEGACY_RECEIPT_CONSUMED', '按“不重跑调味”约束消费既有业务证据；未伪装为 3.1 标准收据。');
  return {
    caseId: coverageCase.caseId,
    module: coverageCase.module,
    executionStatus: coverageCase.executionStatus,
    closureStatus: findings.some((item) => item.severity === 'error') ? 'incomplete' : 'complete',
    receiptContract: 'seasoning-legacy-compatible',
    operationReceiptCount: operationAttachments.length,
    assertionReceiptCount: assertionSteps.length,
    cleanupVerified,
    failureClassification: result.status === 'failed' ? resolveFailureClassification(attachments, result) : null,
    findings,
  };
}

function auditHierarchy(result: AllureResult, caseId: string, findings: Finding[]): void {
  const names = (result.steps ?? []).map((item) => item.name ?? '');
  for (const prefix of ['[环境]', '[业务操作]', '[断言]', '[清理]', '执行结论：']) {
    if (!names.some((name) => name.startsWith(prefix))) add(findings, caseId, 'error', 'REPORT_LAYER_MISSING', `缺少 ${prefix} 层。`);
  }
}

function parseAttachments(result: AllureResult, resultsDir: string, caseId: string, findings: Finding[]): ParsedAttachment[] {
  return collectAttachments(result).map((attachment) => {
    const source = attachment.source ?? '';
    const filePath = path.resolve(resultsDir, source);
    const relative = path.relative(path.resolve(resultsDir), filePath);
    if (!source || relative.startsWith('..') || path.isAbsolute(relative) || !fs.existsSync(filePath)) {
      add(findings, caseId, 'error', 'ATTACHMENT_FILE_MISSING', `附件不存在或路径越界：${source || '<empty>'}。`);
      return { ...attachment, filePath };
    }
    if (attachment.type !== 'application/json') return { ...attachment, filePath };
    try {
      return { ...attachment, filePath, data: readJson<unknown>(filePath) };
    } catch {
      add(findings, caseId, 'error', 'ATTACHMENT_JSON_INVALID', `JSON 附件无法解析：${source}。`);
      return { ...attachment, filePath };
    }
  });
}

function hasProductFailureClassification(attachments: ParsedAttachment[], result: AllureResult): boolean {
  return Boolean(resolveFailureClassification(attachments, result));
}

function resolveFailureClassification(attachments: ParsedAttachment[], result: AllureResult): string | null {
  for (const attachment of attachments) {
    const values = findKeyValues(attachment.data, new Set(['classification', 'failureCategory', 'status']));
    const match = values.find((value) => /product-defect|product-behavior|observed-mismatch|product-difference/i.test(value));
    if (match) return match;
    if (findKeyValues(attachment.data, new Set(['productDifference'])).length > 0) return 'product-difference';
  }
  const message = String(result.statusDetails?.message ?? '');
  if (/ObservedProductDifference|业务断言观察不一致|产品实际行为与权威预期不一致/.test(message)) return 'product-difference';
  if (/timeout|超时/i.test(message)) return 'technical-timeout';
  if (/auth|登录|认证/i.test(message)) return 'environment-authentication';
  return null;
}

function failedAssertionHasScreenshot(result: AllureResult): boolean {
  return flattenSteps(result.steps ?? []).some((step) => step.status === 'failed'
    && (step.attachments ?? []).some((attachment) => /失败截图|screenshot|test-failed/i.test(attachment.name ?? '')));
}

function assertionLeafSteps(result: AllureResult): AllureStep[] {
  const assertionRoots = (result.steps ?? []).filter((step) => step.name?.startsWith('[断言]'));
  return assertionRoots.flatMap((root) => flattenSteps(root.steps ?? []).filter((step) => (step.steps?.length ?? 0) === 0));
}

function collectAttachments(value: unknown): AllureAttachment[] {
  if (Array.isArray(value)) return value.flatMap(collectAttachments);
  if (!isRecord(value)) return [];
  const direct = typeof value.source === 'string' ? [{
    name: typeof value.name === 'string' ? value.name : undefined,
    source: value.source,
    type: typeof value.type === 'string' ? value.type : undefined,
  }] : [];
  return [...direct, ...Object.entries(value).filter(([key]) => key !== 'source').flatMap(([, item]) => collectAttachments(item))];
}

function flattenSteps(steps: readonly AllureStep[]): AllureStep[] {
  return steps.flatMap((step) => [step, ...flattenSteps(step.steps ?? [])]);
}

function findCaseId(result: AllureResult): string | undefined {
  return result.labels?.find((label) => label.name === 'caseId')?.value
    ?? result.labels?.find((label) => label.name === 'tag' && label.value?.startsWith('case-'))?.value?.slice(5);
}

function findKeyValues(value: unknown, keys: ReadonlySet<string>): string[] {
  if (Array.isArray(value)) return value.flatMap((item) => findKeyValues(item, keys));
  if (!isRecord(value)) return [];
  return Object.entries(value).flatMap(([key, item]) => [
    ...(keys.has(key) && (typeof item === 'string' || typeof item === 'number' || typeof item === 'boolean') ? [String(item)] : []),
    ...findKeyValues(item, keys),
  ]);
}

function add(findings: Finding[], caseId: string, severity: Finding['severity'], code: string, message: string): void {
  if (!findings.some((item) => item.caseId === caseId && item.code === code && item.message === message)) findings.push({ caseId, severity, code, message });
}

function addGlobalCaseFinding(cases: CaseAudit[], caseId: string, code: string, message: string): void {
  const item = cases.find((candidate) => candidate.caseId === caseId);
  if (item) {
    add(item.findings, caseId, 'error', code, message);
    item.closureStatus = 'incomplete';
  }
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values.filter((value) => value.trim()))].sort();
}

function normalizeFingerprint(value: unknown): string | null {
  const normalized = String(value ?? '').trim().replace(/^sha256:/i, '').toLowerCase();
  return /^[a-f0-9]{64}$/.test(normalized) ? normalized : null;
}

function requiresCurrentImplementationFingerprint(plan: OptimizationPlan, caseId: string): boolean {
  const decision = plan.caseDecisions?.[caseId];
  if (!plan.caseDecisions) return true;
  if (!decision) return false;
  return decision.impactType === 'business-implementation'
    || decision.decision === 'targeted-execute'
    || decision.decision === 'sentinel-execute';
}

function requiresCurrentCaseFingerprint(plan: OptimizationPlan, caseId: string): boolean {
  return requiresCurrentImplementationFingerprint(plan, caseId);
}

function isExecutionRequiredCase(plan: OptimizationPlan, caseId: string): boolean {
  if (!plan.caseDecisions) return true;
  const decision = plan.caseDecisions[caseId]?.decision;
  return decision === 'targeted-execute' || decision === 'sentinel-execute';
}

function expectedImplementationFingerprint(plan: OptimizationPlan, caseId: string): string | undefined {
  return plan.businessImplementationFingerprints?.[caseId]
    ?? plan.implementationFingerprints[caseId];
}

function isRecord(value: unknown): value is Record<string, any> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function readJson<T>(filePath: string): T {
  return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T;
}

function renderMarkdown(report: ProductCenter420ReceiptClosureReport): string {
  return [
    '# 商品中心 420 条逐案收据闭包审计',
    '',
    `- 状态：${report.status}`,
    `- 逐案完整：${report.summary.completeCases}`,
    `- 正式分类：${report.summary.classifiedCases}`,
    `- 未闭环：${report.summary.incompleteCases}`,
    `- 非调味最小重跑：${report.rerunPlan.requiredCaseIds.length}`,
    `- 非调味历史证据债务：${report.rerunPlan.historicalEvidenceDebtCaseIds.length}`,
    `- 调味按不重跑策略排除：${report.rerunPlan.seasoningCaseIdsExcludedByPolicy.length}`,
    '',
    '## 非调味最小重跑',
    ...(report.rerunPlan.requiredCaseIds.length === 0
      ? ['- 无']
      : report.rerunPlan.requiredCaseIds.map((caseId) => `- ${caseId}: ${(report.rerunPlan.reasonByCaseId[caseId] ?? []).join('、')}`)),
    '',
    '## 非调味历史证据债务（不在本轮授权重跑范围）',
    ...(report.rerunPlan.historicalEvidenceDebtCaseIds.length === 0
      ? ['- 无']
      : report.rerunPlan.historicalEvidenceDebtCaseIds.map((caseId) => `- ${caseId}: ${(report.rerunPlan.reasonByCaseId[caseId] ?? []).join('、')}`)),
    '',
    '## 调味既有证据缺口',
    ...(report.rerunPlan.seasoningCaseIdsExcludedByPolicy.length === 0
      ? ['- 无']
      : report.rerunPlan.seasoningCaseIdsExcludedByPolicy.map((caseId) => `- ${caseId}: ${(report.rerunPlan.reasonByCaseId[caseId] ?? []).join('、')}`)),
    '',
    '## 全部整改项',
    ...(report.findings.length === 0
      ? ['- 无']
      : report.findings.map((finding) => `- ${finding.caseId} | ${finding.severity} | ${finding.code} | ${finding.message}`)),
    '',
  ].join('\n');
}

function readArg(name: string): string {
  const prefix = `${name}=`;
  const value = process.argv.slice(2).find((item) => item.startsWith(prefix))?.slice(prefix.length);
  if (!value) throw new Error(`缺少参数：${name}=...`);
  return path.resolve(value);
}

function main(): void {
  const resultsDir = readArg('--results');
  const coveragePath = readArg('--coverage-audit');
  const governancePath = readArg('--source-governance');
  const optimizationPlanPath = readArg('--optimization-plan');
  const outputPath = readArg('--output');
  const report = auditProductCenter420ReceiptClosure({
    resultsDir,
    coverage: readJson<CoverageAudit>(coveragePath),
    governance: readJson<GovernanceResult>(governancePath),
    optimizationPlan: readJson<OptimizationPlan>(optimizationPlanPath),
  });
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  fs.writeFileSync(outputPath.replace(/\.json$/i, '.md'), renderMarkdown(report), 'utf8');
  process.stdout.write(`${JSON.stringify(report.summary, null, 2)}\n审计结果：${outputPath}\n`);
  if (process.argv.includes('--strict') && report.status !== 'pass') process.exitCode = 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__filename)) main();
