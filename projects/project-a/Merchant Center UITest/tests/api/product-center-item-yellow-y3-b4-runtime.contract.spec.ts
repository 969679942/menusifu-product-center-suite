import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';

const executorPath = path.resolve('tests/generated/product-center-item-yellow-y3-b4.generated.spec.ts');
const sidePagePath = path.resolve('pages/product-management/item/item-create-side.page.ts');

const caseIds = ['TC-ITEM-ADD-012', 'TC-ITEM-ADD-013'] as const;

test.describe('商品中心黄色 Y3-B4 规则证据批次合同', () => {
  test('应锁定两条规则证据用例并禁止逐条执行', () => {
    expect(fs.existsSync(executorPath)).toBe(true);
    const source = fs.readFileSync(executorPath, 'utf8');
    for (const caseId of caseIds) expect(source).toContain(`'${caseId}'`);
    expect(source).toContain("batchId: 'Y3-B4'");
    expect(source).toContain("executionMode: 'wave-shared-chain'");
    expect(source).toContain('caseLevelRunsClaimed: 0');
    expect(source).toContain('evidenceInheritanceAllowed: false');
  });

  test('应分别记录输入、提交、回读和规则冲突证据', () => {
    const source = fs.readFileSync(executorPath, 'utf8');
    expect(source).toContain('inputBeforeSubmit');
    expect(source).toContain('validationErrors');
    expect(source).toContain('responseEvidence');
    expect(source).toContain('persistedEvidence');
    expect(source).toContain("'accepted'");
    expect(source).toContain("'canonical-conflict'");
  });

  test('应先恢复对账并在 finally 验证 API 与 UI 零残留', () => {
    const source = fs.readFileSync(executorPath, 'utf8');
    expect(source).toContain('recoverInterruptedRun');
    expect(source).toContain('reconcileIncompleteIntents');
    expect(source).toContain('finally');
    expect(source).toContain('apiItemResidue');
    expect(source).toContain('uiItemResidue');
    expect(source).toContain('residueFree');
    expect(source).toContain("'cleanup-complete'");
    expect(source).toContain('credentialsPersisted: false');
  });

  test('加料商品页面应暴露高级名称字段的填写和读取能力', () => {
    const source = fs.readFileSync(sidePagePath, 'utf8');
    expect(source).toContain('ensureAdvancedSettingsExpanded');
    expect(source).toContain('fillPosName');
    expect(source).toContain('fillKitchenName');
    expect(source).toContain('readPosName');
    expect(source).toContain('readKitchenName');
  });
});
