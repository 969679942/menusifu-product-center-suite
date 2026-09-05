import { expect, test } from '@playwright/test';
import {
  assessCaseFingerprintLineage,
  fingerprintCaseSemantics,
} from '../../src';

const base = {
  caseId: 'TC-ORDER-001',
  preconditions: ['1. 已登录目标租户'],
  steps: ['1. 创建订单', '2. 查询订单详情'],
  expectedResults: ['1. 创建成功', '2. 详情显示新订单'],
  sources: ['PRD-ORDER-001'],
};

test.describe('系统无关逐用例语义指纹合同', () => {
  test('排版变化不改指纹，单条语义变化只改变该条指纹', () => {
    const first = fingerprintCaseSemantics(base);
    const formattingOnly = fingerprintCaseSemantics({
      ...base,
      preconditions: ['  1）  已登录目标租户  '],
      steps: ['1、创建订单', '2) 查询订单详情'],
    });
    const secondCase = fingerprintCaseSemantics({ ...base, caseId: 'TC-ORDER-002' });
    const changed = fingerprintCaseSemantics({ ...base, expectedResults: ['1. 创建失败', '2. 不生成订单'] });
    expect(formattingOnly).toBe(first);
    expect(secondCase).not.toBe(first);
    expect(changed).not.toBe(first);
  });

  test('共享方案级指纹缺少语义谱系时禁止静默迁移', () => {
    const current = fingerprintCaseSemantics(base);
    expect(assessCaseFingerprintLineage({
      currentSemanticFingerprint: current,
      receipts: [{ caseFingerprint: 'shared-plan-fingerprint', evidenceComplete: true }],
    })).toMatchObject({
      status: 'historical-semantic-evidence-insufficient',
      matchingReceiptFingerprint: null,
    });
  });

  test('只有显式匹配语义指纹的完整收据允许建立谱系', () => {
    const current = fingerprintCaseSemantics(base);
    expect(assessCaseFingerprintLineage({
      currentSemanticFingerprint: current,
      receipts: [{
        caseFingerprint: 'legacy-fingerprint',
        semanticFingerprint: current,
        evidenceComplete: true,
      }],
    }).status).toBe('safe-lineage-mappable');
    expect(assessCaseFingerprintLineage({
      currentSemanticFingerprint: current,
      receipts: [{
        caseFingerprint: 'legacy-fingerprint',
        semanticFingerprint: 'different-semantic-fingerprint',
        evidenceComplete: true,
      }],
    }).status).toBe('semantic-change-detected');
  });
});
