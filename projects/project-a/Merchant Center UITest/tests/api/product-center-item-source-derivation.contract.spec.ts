import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { test, expect } from '@playwright/test';
import { fingerprintSystemTestValue } from '../../../Test Automation Platform/src/automation/system-test/system-test-contract';
import { auditProductCenterItemSourceDerivation } from '../../scripts/audit-product-center-item-source-derivation';

function fixture() {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'source-derivation-'));
  const root = path.join(workspace, 'project');
  const write = (relative: string, value: unknown) => {
    const file = path.resolve(root, relative); fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, typeof value === 'string' ? value : JSON.stringify(value)); return file;
  };
  const canonical = write('../Merchant Center Info/00-待转换测试方案/用例库/商品中心-商品管理-商品/1.商品中心-商品管理-商品-正式测试用例.md',
    '### 用例编号：TC-ITEM-TEST-001\n用例标题：显示字段\n来源：正式来源A\n前置条件：\n1. 已进入页面\n测试步骤：\n1. 打开详情\n预期结果：\n2. 显示字段\n清理要求：\n1. 删除模拟记录\n');
  const item = { id: 'TC-ITEM-TEST-001', title: '显示字段', source: '正式来源A', preconditions: ['已进入页面'], actions: ['打开详情'], expectedResults: ['显示字段'] };
  const planPath = 'contracts/product-center/test-cases/canonical/product-center-item-xmind-rebuild-pilot.json';
  const save = () => {
    const raw = { cases: [item] }; const fingerprint = fingerprintSystemTestValue(raw);
    write(planPath, { ...raw, fingerprint });
    const review = { sourcePlanFingerprint: fingerprint, entries: [{ caseId: item.id, decision: 'approved' }] };
    write('contracts/product-center/test-cases/canonical/product-center-item-full-review.json', { ...review, fingerprint: createHash('sha256').update(JSON.stringify(review)).digest('hex') });
  };
  write('output/product-center-item-213-conversion.json', { cases: [{ caseId: item.id, assertionIds: [`${item.id}:expectation-2`] }] });
  write('contracts/product-center/reviews/product-center-item-rule-confirmations.json', { sourceRole: 'product-confirmed-rule', confirmations: [] });
  save();
  return { root, item, canonical, planPath, save, write, audit: () => auditProductCenterItemSourceDerivation(root), cleanup: () => fs.rmSync(workspace, { recursive: true, force: true }) };
}

test('重建稿内容审核通过不能覆盖不同正式正文，清理不混入断言对账', () => {
  const f = fixture();
  try {
    const original = fs.readFileSync(f.canonical);
    expect(f.audit().report.summary).toMatchObject({ formalCases: 1, aligned: 1, differing: 0 });
    f.item.expectedResults = ['不同字段']; f.save();
    const { report } = f.audit();
    expect(report.status).toBe('incomplete');
    expect(report.cases[0]).toMatchObject({ status: 'derived-content-differs', reviewDecision: 'approved', reviewBoundToDerivedPlan: true, reviewAuthorizesCanonicalRewrite: false });
    expect(report.cases[0].differences).toEqual([{ field: 'expectedResults', canonical: ['显示字段'], candidate: ['不同字段'] }]);
    expect(fs.readFileSync(f.canonical)).toEqual(original);
  } finally { f.cleanup(); }
});

test('变更内容但不更新指纹时不得宣称审核绑定当前派生稿', () => {
  const f = fixture();
  try {
    const plan = JSON.parse(fs.readFileSync(path.join(f.root, f.planPath), 'utf8'));
    plan.cases[0].actions = ['另一个动作']; f.write(f.planPath, plan);
    const report = f.audit().report;
    expect(report.reviewBoundToDerivedPlan).toBe(false);
    expect(report.diagnostics).toContainEqual({ input: 'plan', reason: 'CONTENT_FINGERPRINT_MISMATCH' });
    expect(report.guardrails.businessExecutionStarted).toBe(false);
  } finally { f.cleanup(); }
});

test('缺失输入必须保留逐案缺口，损坏JSON不能伪装审批通过', () => {
  const f = fixture();
  try {
    fs.unlinkSync(path.join(f.root, f.planPath));
    expect(f.audit().report.summary.derivedMissing).toBe(1);
    f.write(f.planPath, '{"password":"synthetic-never-copy",invalid');
    const { report, output } = f.audit();
    expect(report.status).toBe('incomplete');
    expect(report.diagnostics).toContainEqual({ input: 'plan', reason: 'invalid:json-invalid' });
    expect(fs.readFileSync(output, 'utf8')).not.toContain('synthetic-never-copy');
  } finally { f.cleanup(); }
});
