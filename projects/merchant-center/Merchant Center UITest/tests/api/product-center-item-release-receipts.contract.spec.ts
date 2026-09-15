import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { qualifyProductCenterItemReleaseReceipts, ITEM_CURRENT_RECEIPT_CONTRACT_PATH } from '../../adapters/product-center/product-center-item-release-receipts';
import { fingerprintProductCenterItemImplementation, productCenterItemImplementationCheckpoint } from '../../adapters/product-center/product-center-item-implementation';
import { parseProductCenterItemCaseSemanticFingerprints } from '../../utils/product-center-item-case-semantic-fingerprint';
import { fingerprintExecutionContext } from '../../utils/test-execution-state';
import { fingerprintReceiptEvidence } from '../../utils/playwright-execution-receipt';
import { buildProductCenterItemFinalRelease } from '../../scripts/build-product-center-item-final-release';
import { auditProductCenterItemReleaseReadiness } from '../../scripts/audit-product-center-item-release-readiness';
import { fingerprintImplementationCheckpoint } from '../../automation/system-test/system-test-implementation-fingerprint';

function fixture(options: { assertionNumber?: number; cleanupSection?: boolean; duplicateNumber?: boolean } = {}) {
  const assertionNumber = options.assertionNumber ?? 1;
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'item-release-contract-'));
  const projectRoot = path.join(workspace, 'project');
  const write = (relative: string, value: unknown) => {
    const file = path.resolve(projectRoot, relative); fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, typeof value === 'string' ? value : JSON.stringify(value)); return file;
  };
  const caseId = 'TC-ITEM-STD-TEST';
  write('contracts/product-center/reviews/product-center-execution-decisions.json', { decisions: [] });
  const canonical = write('../Merchant Center Info/00-待转换测试方案/用例库/商品中心-商品管理-商品/1.商品中心-商品管理-商品-正式测试用例.md',
    `### 用例编号：${caseId}\n用例标题：模拟创建\n来源：模拟正式来源\n前置条件：\n1. 已进入模拟页\n测试步骤：\n1. 创建模拟对象\n预期结果：\n${assertionNumber}. 显示模拟对象\n${options.duplicateNumber ? `${assertionNumber}. 重复编号\n` : ''}${options.cleanupSection ? '\n清理要求：\n1. 删除并验证UI/API零残留\n' : ''}`);
  for (const entry of productCenterItemImplementationCheckpoint(caseId).entries) write(entry.path, '// synthetic implementation');
  const context = { applicationVersionFingerprint: 'd'.repeat(64), environmentId: 'synthetic', tenantScope: 'tenant', locale: 'en', roleId: 'operator', route: '/items' };
  const contract = { caseId, caseFingerprint: 'a'.repeat(64), semanticCaseFingerprint: parseProductCenterItemCaseSemanticFingerprints(canonical)[0].fingerprint,
    implementationFingerprint: fingerprintProductCenterItemImplementation(projectRoot, caseId), executionContextFingerprint: fingerprintExecutionContext(context),
    requiredOperationKeys: [`${caseId}:action-1`], requiredAssertionIds: [`${caseId}:expectation-${assertionNumber}`], cleanupRequired: true };
  const manifest = { schemaVersion: '1.0.0', canonicalSourceSha256: createHash('sha256').update(fs.readFileSync(canonical)).digest('hex'), cases: [contract], reportPaths: ['output/report.json'] };
  const receipt = { receiptVersion: '4.0.0', caseId, caseFingerprint: contract.caseFingerprint, semanticCaseFingerprint: contract.semanticCaseFingerprint,
    implementationFingerprint: contract.implementationFingerprint, executionContext: context,
    claims: { required: contract.requiredAssertionIds, observed: contract.requiredAssertionIds, verified: contract.requiredAssertionIds },
    operationReceipts: [{ operationKey: `${caseId}:action-1`, method: 'Synthetic.create', observed: true, status: 'passed', startedAt: '2026-09-08T00:00:00Z', finishedAt: '2026-09-08T00:00:01Z' }],
    assertionReceipts: [{ claimId: contract.requiredAssertionIds[0], status: 'verified', expectedValue: 1, actualValue: 1, actualStatus: 'observed', observationChannel: 'ui', authority: 'user-visible', comparison: 'matched' }],
    cleanup: { apiZeroResidue: true, uiZeroResidue: true, apiIdentityCounts: { record: 0 }, uiIdentityCounts: { record: 0 } },
  };
  const attachment = { name: 'test-execution-receipt', contentType: 'application/json', body: Buffer.from(JSON.stringify({ ...receipt, evidenceFingerprint: fingerprintReceiptEvidence(receipt as Parameters<typeof fingerprintReceiptEvidence>[0]) })).toString('base64') };
  const testItem = { annotations: [{ type: 'canonical-case-id', description: caseId }], results: [{ status: 'passed', startTime: '2026-09-08T00:00:00Z', attachments: [attachment] }] };
  const report = { suites: [{ specs: [{ tests: [testItem] }] }] };
  const persist = () => { write(ITEM_CURRENT_RECEIPT_CONTRACT_PATH, manifest); write('output/report.json', report); };
  const qualify = () => qualifyProductCenterItemReleaseReceipts({ projectRoot, cases: [{ caseId, bindingFingerprint: contract.caseFingerprint }] });
  persist();
  return { projectRoot, write, caseId, canonical, manifest, testItem, persist, qualify, cleanup: () => fs.rmSync(workspace, { recursive: true, force: true }) };
}

test('适配器必须以当前源码和详细执行报告验证发布资格并保留报告哈希', () => {
  const f = fixture();
  try {
    const result = f.qualify();
    expect(result.findings).toEqual([]);
    expect(result.accepted.get(f.caseId)).toContain('output/report.json');
    expect(result.sourceArtifacts['receipt:output/report.json'].sha256).toBe(createHash('sha256').update(fs.readFileSync(path.join(f.projectRoot, 'output/report.json'))).digest('hex'));
    fs.appendFileSync(f.canonical, '\n来源补充：新规则\n');
    expect(f.qualify().findings[0].reasons).toContain('CURRENT_CANONICAL_SOURCE_MISMATCH');
  } finally { f.cleanup(); }
});

test('发布准入保留原断言编号，清理分节不增加业务断言，重复编号仍阻断', () => {
  const f = fixture({ assertionNumber: 2, cleanupSection: true });
  const ambiguous = fixture({ duplicateNumber: true });
  try {
    expect(f.qualify().findings).toEqual([]);
    expect(f.qualify().accepted.size).toBe(1);
    expect(ambiguous.qualify().accepted.size).toBe(0);
    expect(ambiguous.qualify().findings[0].reasons).toContain('FORMAL_ASSERTION_NUMBERING_AMBIGUOUS');
  } finally { f.cleanup(); ambiguous.cleanup(); }
});

test('项目操作映射必须绑定当前正式动作，直接路径也不得以整案包装绕过', () => {
  const f = fixture();
  try {
    const sourceStepId = `${f.caseId}:action-1`;
    const mapping = { schemaVersion: '1.0.0', sourceStepIds: [sourceStepId],
      business: [{ operationKey: 'create', sourceStepId, executableOperationKey: 'Synthetic.create', occurrence: 1 }], supporting: [] };
    Object.assign(f.manifest.cases[0], { requiredOperationKeys: ['create'], operationMapping: mapping });
    const attachment = f.testItem.results[0].attachments[0];
    const receipt = JSON.parse(Buffer.from(attachment.body, 'base64').toString('utf8'));
    receipt.operationReceipts[0].operationKey = 'Synthetic.create'; receipt.operationReceipts[0].sequence = 1;
    receipt.evidenceFingerprint = fingerprintReceiptEvidence(receipt);
    attachment.body = Buffer.from(JSON.stringify(receipt)).toString('base64'); f.persist();
    expect(f.qualify().accepted.size).toBe(1);
    mapping.sourceStepIds = [`${f.caseId}:action-2`]; mapping.business[0].sourceStepId = mapping.sourceStepIds[0]; f.persist();
    expect(f.qualify().findings[0].reasons).toContain('CURRENT_SOURCE_OPERATION_SET_MISMATCH');
    delete (f.manifest.cases[0] as { operationMapping?: unknown }).operationMapping; f.persist();
    expect(f.qualify().findings[0].reasons).toContain('CURRENT_SOURCE_OPERATION_SET_MISMATCH');
  } finally { f.cleanup(); }
});

test('最新失败、重复收据或越界路径均不得回退历史成功', () => {
  const f = fixture();
  try {
    f.testItem.results.push({ ...f.testItem.results[0], status: 'failed', startTime: '2026-09-08T01:00:00Z' }); f.persist();
    expect(f.qualify().findings[0].reasons).toContain('LATEST_EXECUTION_NOT_PASSED');
    f.testItem.results.pop(); f.testItem.results[0].attachments.push(f.testItem.results[0].attachments[0]); f.persist();
    expect(f.qualify().accepted.size).toBe(0);
    f.manifest.reportPaths = ['../outside.json']; f.persist();
    expect(f.qualify().findings[0].reasons).toContain('RECEIPT_PATH_OUTSIDE_PROJECT');
  } finally { f.cleanup(); }
});

test('空历史失败名单不能绕过真实最终发布入口的当前收据合同', () => {
  const f = fixture();
  try {
    fs.unlinkSync(path.join(f.projectRoot, ITEM_CURRENT_RECEIPT_CONTRACT_PATH));
    f.write('output/product-center-item-213-conversion.json', {});
    f.write('contracts/product-center/test-cases/canonical/product-center-item-full-review.json', {});
    f.write('contracts/product-center/reviews/product-center-item-failure-manual-decisions.json', {});
    f.write('output/product-center-item-31-remediation-report.json', { remainingFailedCaseIds: [] });
    f.write('output/product-center-item-19-remediation-report.json', { cases: [{ caseId: f.caseId, status: 'runtime-passed' }] });
    expect(() => buildProductCenterItemFinalRelease({ projectRoot: f.projectRoot, outputRoot: f.projectRoot })).toThrow('FINAL_RELEASE_INPUT_MISSING');
    const blocked = JSON.parse(fs.readFileSync(path.join(f.projectRoot, 'output/product-center-item-final-status.blocked.json'), 'utf8'));
    expect(blocked.missingInputs).toEqual([ITEM_CURRENT_RECEIPT_CONTRACT_PATH]);
    expect(fs.existsSync(path.join(f.projectRoot, 'output/product-center-item-final-status.json'))).toBe(false);
  } finally { f.cleanup(); }
});

test('发布准入审计必须保留完整分区，报告输入变化须更新输入指纹', () => {
  const f = fixture();
  try {
    f.write('output/product-center-item-213-conversion.json', { denominator: { formal: 1, notApplicable: 0 }, cases: [{ caseId: f.caseId, bindingFingerprint: f.manifest.cases[0].caseFingerprint }] });
    f.write('contracts/product-center/reviews/product-center-item-failure-manual-decisions.json', { decisions: [] });
    const first = auditProductCenterItemReleaseReadiness(f.projectRoot);
    const before = JSON.parse(fs.readFileSync(first.output, 'utf8'));
    expect(before.cases[0].sourceSurface.status).toBe('incomplete');
    expect(before.cases[0].reasons).toContain('GENERATED_ASSERTION_DECLARATIONS_MISSING');
    expect(before.status).toBe('incomplete');
    const originalBytes = fs.readFileSync(first.output);
    expect(first.summary).toEqual({ formal: 1, notApplicable: 0, executable: 1, classifiedDeferred: 0, receiptContractRequired: 1, currentQualified: 0, incomplete: 1 });
    f.testItem.results[0].status = 'failed'; f.persist();
    const second = auditProductCenterItemReleaseReadiness(f.projectRoot);
    const after = JSON.parse(fs.readFileSync(second.output, 'utf8'));
    expect(second.summary.currentQualified).toBe(0);
    expect(second.summary.incomplete).toBe(1);
    expect(after.inputFingerprint).not.toBe(before.inputFingerprint);
    expect(after.businessExecutionStarted).toBe(false);
    const originalHash = createHash('sha256').update(originalBytes).digest('hex');
    expect(fs.readFileSync(path.join(f.projectRoot, `.artifact-history/objects/${originalHash}.bin`))).toEqual(originalBytes);
  } finally { f.cleanup(); }
});

test('当前不适用及延期裁决排除生成注册和历史成功，已处理决策仍须当前收据', () => {
  const f = fixture();
  try {
    f.write('output/product-center-item-213-conversion.json', { denominator: { formal: 1, notApplicable: 0 },
      cases: [{ caseId: f.caseId, bindingFingerprint: f.manifest.cases[0].caseFingerprint, assertionIds: f.manifest.cases[0].requiredAssertionIds }] });
    f.write('contracts/product-center/reviews/product-center-item-failure-manual-decisions.json', { decisions: [] });
    const decisionPath = 'contracts/product-center/reviews/product-center-execution-decisions.json';
    const baseline = auditProductCenterItemReleaseReadiness(f.projectRoot);
    expect(baseline.summary.currentQualified).toBe(1);
    const baselineFingerprint = JSON.parse(fs.readFileSync(baseline.output, 'utf8')).inputFingerprint;
    f.write(decisionPath, { decisions: [{ caseId: f.caseId, module: 'brand-item', status: 'not-applicable', reason: '模拟功能已移除', evidenceRefs: ['source/audit.json'], resumeWhen: '不再恢复，除非新规则确认' }] });
    const excluded = auditProductCenterItemReleaseReadiness(f.projectRoot);
    expect(excluded.summary).toEqual({ formal: 1, notApplicable: 1, executable: 0, classifiedDeferred: 0, receiptContractRequired: 0, currentQualified: 0, incomplete: 0 });
    const report = JSON.parse(fs.readFileSync(excluded.output, 'utf8'));
    expect(report.cases[0].qualificationStatus).toBe('classified-not-applicable');
    expect(report.inputFingerprint).not.toBe(baselineFingerprint);
    expect(report.businessExecutionStarted).toBe(false);
    f.write(decisionPath, { decisions: [{ caseId: f.caseId, module: 'brand-item', status: 'deferred', reason: '模拟外部能力暂缺', resumeWhen: '外部能力恢复' }] });
    const deferred = auditProductCenterItemReleaseReadiness(f.projectRoot);
    expect(deferred.summary).toEqual({ formal: 1, notApplicable: 0, executable: 1, classifiedDeferred: 1, receiptContractRequired: 0, currentQualified: 0, incomplete: 0 });
    f.write(decisionPath, { decisions: [{ caseId: f.caseId, module: 'brand-item', status: 'handled', reason: '模拟历史已处理', evidenceRefs: ['history/report.json'] }] });
    f.testItem.results[0].status = 'failed'; f.persist();
    const handled = auditProductCenterItemReleaseReadiness(f.projectRoot);
    expect(handled.summary.receiptContractRequired).toBe(1);
    expect(handled.summary.currentQualified).toBe(0);
    expect(handled.summary.incomplete).toBe(1);
    fs.unlinkSync(path.join(f.projectRoot, decisionPath));
    expect(() => auditProductCenterItemReleaseReadiness(f.projectRoot)).toThrow();
  } finally { f.cleanup(); }
});

test('公共纯排版校验保留原收据，实际代码变化和缺失断言仍拒绝', () => {
  const f = fixture();
  try {
    const checkpoint = productCenterItemImplementationCheckpoint(f.caseId);
    const previous = fingerprintImplementationCheckpoint(f.projectRoot, checkpoint);
    const changed = previous.sources.find(s => s.category === 'flow')!;
    const original = fs.readFileSync(path.join(f.projectRoot, changed.path), 'utf8');
    f.write('evidence/original-source.bin', original);
    Object.assign(f.manifest, { implementationFormatBaselines: { [f.caseId]: { schemaVersion: '1.0.0',
      sources: previous.sources.map(s => ({ ...s, ...(s.path === changed.path ? { snapshotPath: 'evidence/original-source.bin' } : {}) })) } } });
    const attachmentBytes = f.testItem.results[0].attachments[0].body;
    f.write(changed.path, original + '\n\n'); f.persist();
    expect(f.qualify().accepted.size).toBe(1);
    expect(f.qualify().sourceArtifacts[`format-equivalence:${f.caseId}`].path).toBe(ITEM_CURRENT_RECEIPT_CONTRACT_PATH);
    expect(f.testItem.results[0].attachments[0].body).toBe(attachmentBytes);
    f.write(changed.path, original + '\nexport const changedBehavior = true;\n');
    expect(f.qualify().findings[0].reasons).toContain('FORMAT_SYNTAX_CHANGED');
    f.write(changed.path, original + '\n\n');
    const receipt = JSON.parse(Buffer.from(attachmentBytes, 'base64').toString('utf8'));
    receipt.assertionReceipts = []; receipt.evidenceFingerprint = fingerprintReceiptEvidence(receipt);
    f.testItem.results[0].attachments[0].body = Buffer.from(JSON.stringify(receipt)).toString('base64'); f.persist();
    expect(f.qualify().accepted.size).toBe(0);
    expect(f.qualify().findings[0].reasons).toContain('ASSERTION_RECEIPT_MISSING');
  } finally { f.cleanup(); }
});
