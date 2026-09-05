import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import type { BusinessRuleExecutionReceipt } from '../../../Test Automation Platform/src/automation/system-test/business-rule-lifecycle';
import { fingerprintExecutionContext } from '../../../Test Automation Platform/src/utils/test-execution-state';
import { observeProductCenterRuleExecution, type ProductCenterRuleObservationResult } from '../adapters/product-center/product-center-business-rule-observation-adapter';

const projectRoot = path.resolve(__dirname, '..');
const workspaceRoot = path.resolve(projectRoot, '..');
const lifecyclePath = path.join(projectRoot, 'contracts/product-center/business-rules/generated/product-center-business-rule-lifecycle-snapshot.json');
const landingPath = path.join(workspaceRoot, 'deliverables/test-plan-governance/product-center-item-group-landing-audit.json');
const executionIndexPath = path.join(projectRoot, 'deliverables/system-test-platform/execution-index.json');
const promotionDecisionPath = path.join(workspaceRoot, 'deliverables/test-plan-governance/product-center-document-rule-promotion-decisions.json');
const outputPath = path.join(projectRoot, 'output/governance/product-center-business-rule-observation-ledger.json');
const markdownPath = path.join(projectRoot, 'output/governance/product-center-business-rule-observation-ledger.md');

export function buildProductCenterBusinessRuleObservationLedger() {
  const lifecycle = readJson<any>(lifecyclePath);
  const landing = readJson<any>(landingPath);
  const executionIndex = readJson<any>(executionIndexPath);
  const promotionDecision = fs.existsSync(promotionDecisionPath)
    ? readJson<any>(promotionDecisionPath)
    : { approvedRules: [] };
  const requiredCaseIdsByRuleId = new Map<string, Set<string>>(
    (promotionDecision.approvedRules ?? []).map((rule: any) => [
      rule.ruleId,
      new Set<string>(rule.verificationStatus === 'revalidation-required' ? rule.revalidationCaseIds ?? [] : []),
    ]),
  );
  const observations: ProductCenterRuleObservationResult[] = [];
  const diagnostics: Array<{ ruleId: string; caseId: string; code: string; detail: string }> = [];
  const historicalDiagnostics: Array<{ ruleId: string; caseId: string; code: string; detail: string }> = [];
  const recoveryDiagnostics: Array<{
    ruleId: string;
    caseId: string;
    recoveryStatus: 'recoverable-from-immutable-artifact' | 'rerun-approval-required' | 'index-repair-required';
    expectedEvidenceFingerprint: string | null;
    actualEvidenceFingerprint: string | null;
    nextAction: string;
  }> = [];
  let requiredCaseRelationships = 0;
  let nonRequiredRelationshipsWithoutCurrentReceipt = 0;
  for (const rule of lifecycle.rules ?? []) {
    for (const caseId of rule.linkedCaseIds ?? []) {
      const requiredForCurrentVerification = requiredCaseIdsByRuleId.get(rule.ruleId)?.has(caseId) === true;
      if (requiredForCurrentVerification) requiredCaseRelationships += 1;
      const expected = (landing.modules ?? []).flatMap((module: any) => module.assessment?.cases ?? [])
        .find((item: any) => item.caseId === caseId);
      const receipt = [...(executionIndex.records ?? [])]
        .filter((item: any) => item.caseId === caseId && item.status === 'passed' && item.evidenceStatus === 'complete')
        .sort((a: any, b: any) => String(a.recordedAt).localeCompare(String(b.recordedAt)))
        .at(-1);
      if (!expected || !receipt) {
        if (requiredForCurrentVerification) {
          diagnostics.push({ ruleId: rule.ruleId, caseId, code: 'COMPLETE_RECEIPT_NOT_FOUND', detail: '当前最小重验关系没有与当前用例指纹匹配的完整通过收据。' });
        } else {
          nonRequiredRelationshipsWithoutCurrentReceipt += 1;
        }
        continue;
      }
      const diagnosticTarget = requiredForCurrentVerification ? diagnostics : historicalDiagnostics;
      const attachment = readReceiptAttachment(receipt.evidencePath, caseId);
      const attachmentAssessment = assessEvidenceAttachmentFingerprint(
        receipt.evidenceFileFingerprint,
        attachment.fileFingerprint,
      );
      if (attachmentAssessment.status === 'mismatch') {
        diagnosticTarget.push({
          ruleId: rule.ruleId,
          caseId,
          code: 'EVIDENCE_FILE_FINGERPRINT_MISMATCH',
          detail: `执行索引声明的证据文件指纹为 ${normalizeFingerprint(receipt.evidenceFileFingerprint)}，当前文件指纹为 ${normalizeFingerprint(attachment.fileFingerprint)}；该收据已失去可追溯性，不能参与规则观察。`,
        });
        if (requiredForCurrentVerification) {
          recoveryDiagnostics.push({
            ruleId: rule.ruleId,
            caseId,
            recoveryStatus: 'rerun-approval-required',
            expectedEvidenceFingerprint: attachmentAssessment.expected,
            actualEvidenceFingerprint: attachmentAssessment.actual,
            nextAction: '先按执行索引指纹查找不可变原始证据；找不到时保持历史诊断，并在取得明确执行批准后定向重跑，禁止用当前覆盖文件补录。',
          });
        }
        continue;
      }
      const raw = attachment.receipt;
      if (!raw) {
        diagnosticTarget.push({
          ruleId: rule.ruleId,
          caseId,
          code: attachment.evidencePath ? 'COMPLETE_RECEIPT_NOT_FOUND' : 'EVIDENCE_FILE_NOT_FOUND',
          detail: attachment.evidencePath
            ? '证据文件指纹一致，但文件内没有当前用例的标准执行收据。'
            : '执行索引没有可读取的证据文件路径。',
        });
        continue;
      }
      const businessRuleFingerprint = raw?.businessRuleFingerprint;
      if (typeof businessRuleFingerprint !== 'string' || !/^[a-f0-9]{64}$/i.test(businessRuleFingerprint)) {
        diagnosticTarget.push({ ruleId: rule.ruleId, caseId, code: 'BUSINESS_RULE_RECEIPT_MAPPING_REQUIRED', detail: '现有标准收据只有用例指纹，未声明业务规则指纹、规则断言映射和观察语义；禁止猜测候选规则。' });
        continue;
      }
      const businessReceipt: BusinessRuleExecutionReceipt = {
        receiptId: raw.receiptId ?? `receipt:${caseId}:${receipt.executionEpochId}`,
        ruleId: raw.businessRuleId ?? rule.ruleId,
        ruleFingerprint: businessRuleFingerprint,
        caseId,
        applicationId: rule.scope.applicationId,
        businessDomainId: rule.scope.businessDomainId,
        executionStatus: receipt.status === 'passed' ? 'passed' : receipt.status === 'failed' ? 'failed' : 'blocked',
        evidenceStatus: 'complete',
        assertionIdsRequired: raw.businessRuleAssertionIdsRequired ?? [],
        assertionIdsObserved: raw.businessRuleAssertionIdsObserved ?? [],
        operationReceiptIds: (raw.operationReceipts ?? []).map((item: any) => String(item.operationKey)).filter(Boolean),
        uiEvidenceIds: raw.businessRuleUiEvidenceIds ?? [],
        apiEvidenceIds: raw.businessRuleApiEvidenceIds ?? [],
        downstreamEvidenceIds: raw.businessRuleDownstreamEvidenceIds ?? [],
        cleanup: raw.businessRuleCleanup ?? raw.cleanup ?? receipt.cleanupEvidence ?? { required: false, apiZeroResidue: false, uiZeroResidue: false },
        observedStatement: raw.observedStatement ?? '',
      };
      const receiptContextFingerprint = raw.executionContext
        && typeof raw.executionContext === 'object'
        ? fingerprintExecutionContext(raw.executionContext)
        : null;
      if (!receiptContextFingerprint || !receipt.executionContextFingerprint) {
        diagnosticTarget.push({
          ruleId: rule.ruleId,
          caseId,
          code: 'EXECUTION_CONTEXT_FINGERPRINT_MISSING',
          detail: '标准收据或执行索引未提供可核对的执行上下文指纹；不能声明上下文已匹配。',
        });
        continue;
      }
      if (normalizeFingerprint(receiptContextFingerprint) !== normalizeFingerprint(receipt.executionContextFingerprint)) {
        diagnosticTarget.push({
          ruleId: rule.ruleId,
          caseId,
          code: 'EXECUTION_CONTEXT_FINGERPRINT_MISMATCH',
          detail: `标准收据上下文指纹为 ${normalizeFingerprint(receiptContextFingerprint)}，执行索引声明为 ${normalizeFingerprint(receipt.executionContextFingerprint)}。`,
        });
        continue;
      }
      const result = observeProductCenterRuleExecution({
        rule,
        receipt: businessReceipt,
        caseFingerprint: receipt.caseFingerprint,
        expectedCaseFingerprint: expected.caseFingerprint,
        semanticCaseFingerprint: receipt.semanticCaseFingerprint ?? null,
        expectedSemanticCaseFingerprint: expected.semanticCaseFingerprint ?? null,
        fingerprintMatchMode: expected.fingerprintMatchMode ?? 'effective',
        implementationFingerprint: receipt.implementationFingerprint,
        expectedImplementationFingerprint: expected.implementationFingerprint ?? null,
        implementationFingerprintRequired: expected.implementationFingerprintRequired !== false,
        executionContextFingerprint: receiptContextFingerprint,
        expectedExecutionContextFingerprint: receipt.executionContextFingerprint,
      });
      observations.push(result);
      if (result.blockers.length > 0) {
        diagnosticTarget.push({
          ruleId: rule.ruleId,
          caseId,
          code: 'RECEIPT_IDENTITY_MISMATCH',
          detail: `标准收据未通过当前身份门禁：${result.blockers.join(',')}。`,
        });
      }
    }
  }
  const report = {
    schemaVersion: '1.0.0',
    reportId: 'product-center-business-rule-observation-ledger',
    generatedAt: new Date().toISOString(),
    status: diagnostics.length === 0 && observations.every((item) => item.eligibleForCandidate === false)
      ? 'operational-no-candidate' : 'operational-with-mapping-gaps',
    sourceFingerprints: {
      lifecycle: lifecycle.fingerprint ?? null,
      landing: sha256File(landingPath),
      executionIndex: sha256File(executionIndexPath),
    },
    summary: {
      formalRulesInspected: lifecycle.rules?.length ?? 0,
      linkedCasesInspected: (lifecycle.rules ?? []).reduce((sum: number, rule: any) => sum + (rule.linkedCaseIds?.length ?? 0), 0),
      requiredCaseRelationships,
      nonRequiredRelationshipsWithoutCurrentReceipt,
      completeReceiptsMapped: observations.filter((item) => item.blockers.length === 0).length,
      observationsEligibleForCandidate: observations.filter((item) => item.eligibleForCandidate).length,
      semanticChangesDetected: observations.filter((item) => item.semanticChangeDetected).length,
      diagnostics: diagnostics.length,
      historicalDiagnostics: historicalDiagnostics.length,
    },
    observations,
    diagnostics,
    historicalDiagnostics,
    recoveryDiagnostics,
    executionImpact: { existingPassedCasesInvalidated: false, rerunCaseIds: [], moduleDeliveryBlocked: false },
    guardrails: {
      receiptObservationMayChangeFormalRule: false,
      missingBusinessRuleMappingMayCreateCandidate: false,
      candidateRequiresSemanticDifference: true,
      candidateRequiresCompleteReceipt: true,
      humanApprovalRequired: true,
      overwrittenEvidenceMayNotBeReconstructed: true,
      rerunRequiresExplicitApproval: true,
    },
    fingerprint: sha256(stableStringify({ observations, diagnostics, historicalDiagnostics })),
  };
  writeJson(outputPath, report);
  writeText(markdownPath, renderMarkdown(report));
  return report;
}

export function assessEvidenceAttachmentFingerprint(expected: unknown, actual: unknown): {
  status: 'matched' | 'mismatch' | 'not-verifiable';
  expected: string | null;
  actual: string | null;
  recoveryStatus: 'none' | 'rerun-approval-required';
} {
  const normalizedExpected = normalizeFingerprint(expected);
  const normalizedActual = normalizeFingerprint(actual);
  if (!normalizedExpected || !normalizedActual) {
    return { status: 'not-verifiable', expected: normalizedExpected, actual: normalizedActual, recoveryStatus: 'none' };
  }
  if (normalizedExpected === normalizedActual) {
    return { status: 'matched', expected: normalizedExpected, actual: normalizedActual, recoveryStatus: 'none' };
  }
  return { status: 'mismatch', expected: normalizedExpected, actual: normalizedActual, recoveryStatus: 'rerun-approval-required' };
}

type ReceiptAttachment = {
  receipt: any | null;
  evidencePath: string | null;
  fileFingerprint: string | null;
};

function readReceiptAttachment(evidencePath: string | null | undefined, caseId: string): ReceiptAttachment {
  if (!evidencePath) return { receipt: null, evidencePath: null, fileFingerprint: null };
  const normalized = evidencePath.replace(/\\/g, '/');
  const marker = 'Merchant Center UITest/';
  const absolute = normalized.includes(marker)
    ? path.join(projectRoot, normalized.slice(normalized.indexOf(marker) + marker.length))
    : path.resolve(projectRoot, normalized);
  if (!fs.existsSync(absolute)) return { receipt: null, evidencePath: absolute, fileFingerprint: null };
  let document: any;
  try {
    document = readJson<any>(absolute);
  } catch {
    return { receipt: null, evidencePath: absolute, fileFingerprint: sha256File(absolute) };
  }
  let found: any = null;
  const visit = (value: any) => {
    if (found || value === null || value === undefined) return;
    if (Array.isArray(value)) { value.forEach(visit); return; }
    if (typeof value !== 'object') return;
    if (value.name === 'test-execution-receipt' && typeof value.body === 'string') {
      try {
        const decoded = JSON.parse(Buffer.from(value.body, 'base64').toString('utf8'));
        if (decoded.caseId === caseId) found = decoded;
      } catch { /* malformed attachment remains a mapping gap */ }
    }
    Object.values(value).forEach(visit);
  };
  visit(document);
  return { receipt: found, evidencePath: absolute, fileFingerprint: sha256File(absolute) };
}

function renderMarkdown(report: any): string {
  return [
    '# 商品中心业务规则执行观察账本', '',
    `- 状态：${report.status}`,
    `- 检查规则：${report.summary.formalRulesInspected}；关联用例：${report.summary.linkedCasesInspected}`,
    `- 已映射完整收据：${report.summary.completeReceiptsMapped}；候选资格：${report.summary.observationsEligibleForCandidate}`,
    `- 语义变化：${report.summary.semanticChangesDetected}；当前最小验证关系：${report.summary.requiredCaseRelationships}；验证阻断：${report.summary.diagnostics}`,
    `- 非必需历史关系无当前收据：${report.summary.nonRequiredRelationshipsWithoutCurrentReceipt}；非阻断历史诊断：${report.summary.historicalDiagnostics}`,
    '',
    ...report.diagnostics.map((item: any) => `- ${item.ruleId}/${item.caseId}: ${item.code}，${item.detail}`),
    '', '## 非阻断历史诊断', '',
    ...report.historicalDiagnostics.map((item: any) => `- ${item.ruleId}/${item.caseId}: ${item.code}，${item.detail}`),
    '', '## 证据恢复诊断', '',
    ...report.recoveryDiagnostics.map((item: any) => `- ${item.ruleId}/${item.caseId}: ${item.recoveryStatus}；期望=${item.expectedEvidenceFingerprint ?? '-'}；实际=${item.actualEvidenceFingerprint ?? '-'}；下一步=${item.nextAction}`),
    '', '说明：标准执行收据必须显式携带业务规则指纹、规则断言映射和观察语义；缺失时只登记缺口，不反向生成规则。', '',
  ].join('\n');
}

function readJson<T>(filePath: string): T { return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T; }
function writeJson(filePath: string, value: unknown): void { fs.mkdirSync(path.dirname(filePath), { recursive: true }); fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8'); }
function writeText(filePath: string, value: string): void { fs.mkdirSync(path.dirname(filePath), { recursive: true }); fs.writeFileSync(filePath, value, 'utf8'); }
function sha256File(filePath: string): string { return createHash('sha256').update(fs.readFileSync(filePath)).digest('hex'); }
function sha256(value: string): string { return createHash('sha256').update(value).digest('hex'); }
function normalizeFingerprint(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().replace(/^sha256:/i, '').toLowerCase();
  return /^[a-f0-9]{64}$/.test(normalized) ? normalized : null;
}
function stableStringify(value: unknown): string { if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`; if (value && typeof value === 'object') return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(',')}}`; return JSON.stringify(value); }

if (require.main === module) {
  try { const report = buildProductCenterBusinessRuleObservationLedger(); process.stdout.write(`${JSON.stringify({ status: report.status, summary: report.summary })}\n`); }
  catch (error) { process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`); process.exitCode = 1; }
}
