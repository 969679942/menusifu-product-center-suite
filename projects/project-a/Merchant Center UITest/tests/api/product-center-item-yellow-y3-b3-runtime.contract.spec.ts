import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';

const executorPath = path.resolve('tests/generated/product-center-item-yellow-y3-b3.generated.spec.ts');

const caseIds = [
  'TC-ITEM-STD-025',
  'TC-ITEM-STD-026',
  'TC-ITEM-STD-027',
  'TC-ITEM-ADD-033',
  'TC-ITEM-ADD-039',
  'TC-ITEM-ADD-018',
  'TC-ITEM-ADD-019',
  'TC-ITEM-ADD-020',
  'TC-ITEM-ADD-021',
  'TC-ITEM-ADD-045',
  'TC-ITEM-PKG-036',
  'TC-ITEM-PKG-020',
  'TC-ITEM-PKG-042',
  'TC-ITEM-PKG-043',
  'TC-ITEM-UI-003',
] as const;

test.describe('商品中心黄色 Y3-B3 受控数据批次合同', () => {
  test('应锁定十五条用例并禁止逐条执行', () => {
    expect(fs.existsSync(executorPath)).toBe(true);
    const source = fs.readFileSync(executorPath, 'utf8');
    for (const caseId of caseIds) expect(source).toContain(`'${caseId}'`);
    expect(source).toContain("batchId: 'Y3-B3'");
    expect(source).toContain("executionMode: 'wave-shared-chain'");
    expect(source).toContain('caseLevelRunsClaimed: 0');
    expect(source).toContain('evidenceInheritanceAllowed: false');
  });

  test('应支持通过、规则冲突和环境阻断三类证据', () => {
    const source = fs.readFileSync(executorPath, 'utf8');
    expect(source).toContain("'accepted'");
    expect(source).toContain("'canonical-conflict'");
    expect(source).toContain("'environment-blocked'");
    expect(source).toContain('environmentBlockedCaseIds');
    expect(source).toContain('canonicalConflictCaseIds');
  });

  test('应先恢复对账并在 finally 验证零残留', () => {
    const source = fs.readFileSync(executorPath, 'utf8');
    expect(source).toContain('recoverInterruptedRun');
    expect(source).toContain('reconcileIncompleteIntents');
    expect(source).toContain('finally');
    expect(source).toContain('residueFree');
    expect(source).toContain("'cleanup-complete'");
    expect(source).toContain('credentialsPersisted: false');
  });
});
