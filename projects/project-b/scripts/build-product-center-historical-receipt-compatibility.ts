import fs from 'node:fs';
import path from 'node:path';
import {
  classifyHistoricalReceiptCompatibility,
  type HistoricalReceiptCurrentIdentity,
} from '../utils/historical-receipt-compatibility';
import { TestExecutionIndex } from '../utils/test-execution-index';
import { resolveSystemTestPlatformArtifact } from '../utils/system-test-platform-paths';

type ClosureAudit = {
  generatedAt: string;
  incrementalSelection: { evidenceReconciliationCaseIds: string[] };
  cases: Array<{
    caseId: string;
    currentCaseFingerprint: string | null;
    currentImplementationFingerprint: string | null;
    implementationFingerprintRequired?: boolean;
  }>;
};

const projectRoot = path.resolve(__dirname, '..');
const workspaceRoot = path.resolve(projectRoot, '..');
const governanceRoot = path.join(workspaceRoot, 'deliverables/test-plan-governance');
const closurePath = path.join(governanceRoot, 'product-center-pre-closure-audit.json');
const outputPath = path.join(governanceRoot, 'product-center-historical-receipt-compatibility.json');
const markdownPath = path.join(governanceRoot, 'product-center-historical-receipt-compatibility.md');
const executionIndexPath = resolveSystemTestPlatformArtifact('execution-index.json');

export function buildProductCenterHistoricalReceiptCompatibility(input: {
  closureAudit: ClosureAudit;
  executionIndex?: TestExecutionIndex;
  generatedAt?: string;
}) {
  const index = input.executionIndex ?? new TestExecutionIndex(executionIndexPath);
  const targetIds = new Set(input.closureAudit.incrementalSelection.evidenceReconciliationCaseIds);
  const identities: HistoricalReceiptCurrentIdentity[] = input.closureAudit.cases
    .filter((item) => targetIds.has(item.caseId))
    .map((item) => ({
      caseId: item.caseId,
      caseFingerprint: item.currentCaseFingerprint,
      implementationFingerprint: item.currentImplementationFingerprint,
      implementationFingerprintRequired: item.implementationFingerprintRequired,
    }));
  const compatibility = classifyHistoricalReceiptCompatibility({
    cases: identities,
    receipts: index.snapshot().records,
  });
  const indexChanged = compatibility.importableRecords.length > 0
    ? index.upsert(compatibility.importableRecords)
    : false;
  const duplicateCurrentFingerprints = [...new Map(identities
    .filter((item) => item.caseFingerprint)
    .map((item) => [item.caseFingerprint!, identities.filter((candidate) => (
      candidate.caseFingerprint === item.caseFingerprint
    )).map((candidate) => candidate.caseId)] as const))]
    .filter(([, caseIds]) => caseIds.length > 1)
    .map(([fingerprint, caseIds]) => ({ fingerprint, caseIds }));
  const report = {
    schemaVersion: '1.0.0' as const,
    reportId: 'product-center-historical-receipt-compatibility' as const,
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    sourceClosureAuditGeneratedAt: input.closureAudit.generatedAt,
    scope: {
      applicationId: 'merchant-center',
      businessDomainId: 'product-center',
      targetCaseCount: identities.length,
    },
    policy: {
      pageExecutionTriggered: false,
      automaticPassPromotion: false,
      importExactMatchesOnly: true,
      fingerprintMismatchDoesNotProveBusinessChange: true,
    },
    summary: {
      ...compatibility.summary,
      importedExactMatches: compatibility.importableRecords.length,
      executionIndexChanged: indexChanged,
      fingerprintLineageReviewRequired: compatibility.cases.filter((item) => (
        item.status === 'case-fingerprint-mismatch'
        || item.status === 'implementation-fingerprint-mismatch'
      )).length,
      directRerunCandidates: compatibility.cases.filter((item) => (
        item.status !== 'exact-match-importable'
        && item.status !== 'case-fingerprint-mismatch'
        && item.status !== 'implementation-fingerprint-mismatch'
      )).length,
    },
    fingerprintScopeAudit: {
      status: duplicateCurrentFingerprints.length > 0 ? 'case-scope-defect-detected' : 'passed',
      duplicateCurrentFingerprints,
      diagnostic: duplicateCurrentFingerprints.length > 0
        ? '多个不同 caseId 共用当前指纹；这不能证明业务语义变化，必须先修复逐用例指纹谱系。'
        : null,
    },
    exactMatchImportCaseIds: compatibility.cases
      .filter((item) => item.status === 'exact-match-importable').map((item) => item.caseId),
    fingerprintLineageReviewCaseIds: compatibility.cases
      .filter((item) => item.status === 'case-fingerprint-mismatch'
        || item.status === 'implementation-fingerprint-mismatch')
      .map((item) => item.caseId),
    directRerunCandidateCaseIds: compatibility.cases
      .filter((item) => item.status !== 'exact-match-importable'
        && item.status !== 'case-fingerprint-mismatch'
        && item.status !== 'implementation-fingerprint-mismatch')
      .map((item) => item.caseId),
    cases: compatibility.cases,
  };
  return report;
}

export function runProductCenterHistoricalReceiptCompatibility() {
  if (!fs.existsSync(closurePath)) throw new Error(`缺少前置闭环审计：${closurePath}`);
  const report = buildProductCenterHistoricalReceiptCompatibility({
    closureAudit: JSON.parse(fs.readFileSync(closurePath, 'utf8')) as ClosureAudit,
  });
  writeText(outputPath, `${JSON.stringify(report, null, 2)}\n`);
  writeText(markdownPath, renderMarkdown(report));
  process.stdout.write(`${JSON.stringify(report.summary)}\n`);
  return report;
}

function renderMarkdown(report: ReturnType<typeof buildProductCenterHistoricalReceiptCompatibility>): string {
  const grouped = new Map<string, string[]>();
  for (const item of report.cases) {
    const caseIds = grouped.get(item.status) ?? [];
    caseIds.push(item.caseId);
    grouped.set(item.status, caseIds);
  }
  return [
    '# 商品中心历史收据当前兼容性审计',
    '',
    `- 目标用例：${report.scope.targetCaseCount}`,
    `- 完全匹配并可导入：${report.summary['exact-match-importable']}`,
    `- 用例指纹不匹配：${report.summary['case-fingerprint-mismatch']}`,
    `- 实现指纹不匹配：${report.summary['implementation-fingerprint-mismatch']}`,
    `- 可直接进入重跑审批：${report.summary.directRerunCandidates}`,
    '- 页面执行：0；历史报告、截图和汇总数字不会自动授权通过。',
    '',
    '## 指纹范围结论',
    '',
    report.fingerprintScopeAudit.diagnostic ?? '当前指纹均为逐用例独立身份。',
    '',
    ...[...grouped.entries()].flatMap(([status, caseIds]) => [
      `## ${status}（${caseIds.length}）`,
      '',
      caseIds.map((caseId) => `\`${caseId}\``).join('、'),
      '',
    ]),
  ].join('\n');
}

function writeText(filePath: string, value: string): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.tmp`;
  fs.writeFileSync(temporaryPath, value, 'utf8');
  fs.renameSync(temporaryPath, filePath);
}

if (require.main === module) runProductCenterHistoricalReceiptCompatibility();
