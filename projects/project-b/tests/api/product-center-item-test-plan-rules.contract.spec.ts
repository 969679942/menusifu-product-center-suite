import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';

const projectRoot = path.resolve(__dirname, '../..');
const ledgerPath = path.join(
  projectRoot,
  'contracts/product-center/business-rules/generated/product-center-item-test-plan-rule-candidates.json',
);
const registryPath = path.join(
  projectRoot,
  'contracts/product-center/business-rules/generated/product-center-item-rule-registry.json',
);
const deliverablePath = path.resolve(
  projectRoot,
  '../deliverables/product-center-item/business-rules.json',
);

test.describe('商品测试方案候选业务规则合同', () => {
  test('232 条结构化用例必须落地为 225 条候选和 3 条废弃排除', () => {
    const ledger = readJson(ledgerPath);

    expect(ledger.summary).toEqual({
      sourceCases: 232,
      activeCandidates: 225,
      deprecatedExcluded: 3,
      runtimeObserved: 202,
      deferredBlocked: 11,
      supplementalReviewed: 16,
      curatedOverrides: 9,
      formalRuleLinked: 5,
    });
    expect(ledger.candidates).toHaveLength(225);
    expect(ledger.excluded.map((item: any) => item.caseId).sort()).toEqual([
      'TC-ITEM-PKG-066',
      'TC-ITEM-STD-040',
      'TC-ITEM-STD-060',
    ]);
  });

  test('每条候选必须保留条件动作结果来源和稳定指纹', () => {
    const ledger = readJson(ledgerPath);
    const ruleIds = ledger.candidates.map((item: any) => item.ruleId);
    const caseIds = ledger.candidates.map((item: any) => item.caseId);

    expect(new Set(ruleIds).size).toBe(225);
    expect(new Set(caseIds).size).toBe(225);
    expect(ledger.fingerprint).toMatch(/^[a-f0-9]{64}$/);
    expect(ledger.candidates.every((item: any) => (
      item.statement.trim().length > 0
      && item.sourceCitation.trim().length > 0
      && /^[a-f0-9]{64}$/i.test(item.sourceCaseFingerprint)
      && item.conditions.length > 0
      && item.actions.length > 0
      && item.outcomes.length > 0
      && item.conditionClaims.length === item.conditions.length
      && item.actionClaims.length === item.actions.length
      && item.outcomeClaims.length === item.outcomes.length
    ))).toBe(true);
  });

  test('运行通过只能形成观察候选且延期用例必须阻断', () => {
    const ledger = readJson(ledgerPath);
    const runtimeObserved = ledger.candidates.filter((item: any) => item.runtimeStatus === 'runtime-passed');
    const deferred = ledger.candidates.filter((item: any) => item.runtimeStatus === 'deferred');

    expect(runtimeObserved).toHaveLength(202);
    expect(runtimeObserved.every((item: any) => (
      item.observedRecommendation === 'observed'
      && item.currentStatus === 'provisional'
      && item.formalPromotionAllowed === false
    ))).toBe(true);
    expect(deferred).toHaveLength(11);
    expect(deferred.every((item: any) => (
      item.observedRecommendation === 'blocked'
      && item.currentStatus === 'blocked'
      && item.formalPromotionAllowed === false
    ))).toBe(true);
    expect(ledger.candidates.some((item: any) => item.currentStatus === 'formal')).toBe(false);
  });

  test('统一 registry 与正式交付包必须复用同一候选账本', () => {
    const ledger = readJson(ledgerPath);
    const registry = readJson(registryPath);
    const deliverable = readJson(deliverablePath);
    const registryByRuleId = new Map(registry.candidates.map((item: any) => [item.ruleId, item]));

    expect(registry.summary).toMatchObject({ candidates: 225, probe: 217, none: 11 });
    expect(registry.candidates).toHaveLength(225);
    expect(ledger.candidates.every((item: any) => registryByRuleId.has(item.ruleId))).toBe(true);
    expect(deliverable.testPlanRuleLedger.fingerprint).toBe(ledger.fingerprint);
    expect(deliverable.candidateRules).toHaveLength(225);
    expect(deliverable.excludedTestPlanCases).toHaveLength(3);
  });
});

function readJson(filePath: string): any {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}
