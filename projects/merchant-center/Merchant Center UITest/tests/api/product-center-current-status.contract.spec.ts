import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { resolveProductCenterCurrentStatus } from '../../adapters/test-automation-platform/product-center-current-status';

type Receipt = {
  caseId: string;
  caseFingerprint: string;
  implementationFingerprint: string;
  receiptFingerprint: string;
  recordedAt: string;
};

const receipt: Receipt = {
  caseId: 'CASE-001',
  caseFingerprint: 'case-v2',
  implementationFingerprint: 'impl-v2',
  receiptFingerprint: 'receipt-v2',
  recordedAt: '2026-09-01T10:00:00.000Z',
};

function writeJson(filePath: string, value: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2), 'utf8');
}

function createWorkspace(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'product-center-current-status-'));
  writeJson(path.join(root, 'deliverables/system-test-platform/execution-index.json'), {
    schemaVersion: '4.0.0',
    records: [{
      caseId: receipt.caseId,
      caseFingerprint: receipt.caseFingerprint,
      implementationFingerprint: receipt.implementationFingerprint,
      receiptEvidenceFingerprint: receipt.receiptFingerprint,
      recordedAt: receipt.recordedAt,
      evidenceStatus: 'complete',
    }],
  });
  fs.mkdirSync(path.join(root, 'output/system-test'), { recursive: true });
  return root;
}

function createReport(
  root: string,
  name: string,
  generatedAt: string,
  receiptFingerprint: string,
  scope = 'current-five',
): string {
  const reportDir = path.join(root, name);
  const resultsDir = path.join(reportDir, 'results');
  fs.mkdirSync(resultsDir, { recursive: true });
  writeJson(path.join(reportDir, 'merge-manifest.json'), {
    schemaVersion: '1.0.0',
    generatedAt,
    scope: scope === 'current-five' ? 'merchant-center-current-five-closure' : 'other-scope',
  });
  writeJson(path.join(reportDir, 'coverage-audit.json'), {
    schemaVersion: '1.0.0',
    generatedAt,
    summary: { total: 1, passed: 1 },
    cases: [{ caseId: receipt.caseId }],
  });
  writeJson(path.join(resultsDir, 'case-result.json'), {
    labels: [{ name: 'caseId', value: receipt.caseId }],
    steps: [{ attachments: [{ source: 'receipt-attachment.json' }] }],
  });
  writeJson(path.join(resultsDir, 'receipt-attachment.json'), {
    receiptVersion: '3.1.0',
    caseId: receipt.caseId,
    caseFingerprint: receipt.caseFingerprint,
    implementationFingerprint: receipt.implementationFingerprint,
    evidenceFingerprint: receiptFingerprint,
  });
  return reportDir;
}

test.describe('商品中心当前报告状态适配合同', () => {
  test('纯文件解析生成唯一当前状态入口且不启动浏览器', () => {
    const root = createWorkspace();
    const reportDir = createReport(root, 'report-current', '2026-09-01T10:05:00.000Z', receipt.receiptFingerprint);
    const artifact = resolveProductCenterCurrentStatus({
      projectRoot: root,
      scope: 'current-five',
      reportDirs: [reportDir],
      resolvedAt: '2026-09-01T11:00:00.000Z',
    });
    expect(artifact.result).toMatchObject({ status: 'current', summary: { total: 1, passed: 1 } });
    expect(fs.existsSync(path.join(root, 'deliverables/system-test-platform/current-status.json'))).toBe(true);
    expect(fs.existsSync(path.join(root, 'deliverables/system-test-platform/current-status-registry.json'))).toBe(true);
    expect(fs.existsSync(path.join(root, 'test-results'))).toBe(false);
  });

  test('旧报告被新报告替代并在登记表保留 supersededBy', () => {
    const root = createWorkspace();
    const oldReport = createReport(root, 'report-old', '2026-09-01T09:00:00.000Z', 'receipt-v1');
    const currentReport = createReport(root, 'report-current', '2026-09-01T10:05:00.000Z', receipt.receiptFingerprint);
    const artifact = resolveProductCenterCurrentStatus({
      projectRoot: root, scope: 'current-five', reportDirs: [oldReport, currentReport],
    });
    expect(artifact.result.status).toBe('current');
    expect(artifact.result.supersededArtifacts).toHaveLength(1);
    const registry = JSON.parse(fs.readFileSync(
      path.join(root, 'deliverables/system-test-platform/current-status-registry.json'), 'utf8',
    )) as { artifacts: Array<{ authorityPath: string; supersededBy: string | null }> };
    expect(registry.artifacts.find((item) => item.authorityPath === oldReport)?.supersededBy)
      .toBe(artifact.result.artifactId);
  });

  test('请求全量范围时不得消费局部报告', () => {
    const root = createWorkspace();
    const reportDir = createReport(root, 'report-current', '2026-09-01T10:05:00.000Z', receipt.receiptFingerprint);
    const artifact = resolveProductCenterCurrentStatus({
      projectRoot: root, scope: 'landed-420', reportDirs: [reportDir],
    });
    expect(artifact.result).toMatchObject({ status: 'unknown', summary: null, authorityPath: null });
    expect(artifact.result.reasons).toContain('REPORT_SCOPE_NOT_FOUND');
  });

  test('报告收据指纹不匹配时关闭数字并标记 stale', () => {
    const root = createWorkspace();
    const reportDir = createReport(root, 'report-wrong', '2026-09-01T10:05:00.000Z', 'wrong');
    const artifact = resolveProductCenterCurrentStatus({
      projectRoot: root, scope: 'current-five', reportDirs: [reportDir],
    });
    expect(artifact.result).toMatchObject({ status: 'stale', summary: null, authorityPath: null });
    expect(artifact.result.reasons).toContain('CURRENT_RECEIPT_FINGERPRINT_MISMATCH');
  });

  test('范围和报告参数缺失时在任何执行前失败', () => {
    const root = createWorkspace();
    expect(() => resolveProductCenterCurrentStatus({ projectRoot: root, scope: '', reportDirs: [] }))
      .toThrow('PRODUCT_CENTER_CURRENT_STATUS_SCOPE_REQUIRED');
    expect(() => resolveProductCenterCurrentStatus({ projectRoot: root, scope: 'current-five', reportDirs: [] }))
      .toThrow('PRODUCT_CENTER_CURRENT_STATUS_REPORT_REQUIRED');
  });
});
