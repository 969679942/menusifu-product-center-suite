import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { loadCurrentProductCenterBusinessRuleLifecycleSnapshot } from '../../scripts/build-product-center-business-rule-lifecycle-snapshot';

const projectRoot = path.resolve(__dirname, '../..');
const workspaceRoot = path.resolve(projectRoot, '..');

test.describe('商品中心业务规则统一审计接入合同', () => {
  test('规则触发器在基线晋级后必须收敛且 legacy/run-only 收据不得伪造当前通过', () => {
    const trigger = readJson<{
      status: string;
      changedRuleIds: string[];
      rerunCaseIds: string[];
      revalidatedCaseIds: string[];
      preservedPassedCaseIds: string[];
      diagnostics: string[];
    }>('contracts/product-center/business-rules/generated/product-center-business-rule-change-trigger.json');
    const closure = readJson<{
      source: { businessRuleChangedRuleIds: string[] };
      summary: { 'change-revalidation-required': number };
      incrementalSelection: { recommendedCaseIds: string[]; evidenceReconciliationCaseIds: string[]; approvedCaseIds: string[] };
    }>(
      path.join(workspaceRoot, 'deliverables/test-plan-governance/product-center-closure-audit.json'),
      true,
    );
    expect(trigger).toMatchObject({
      status: 'unchanged',
      changedRuleIds: [],
      revalidatedCaseIds: [],
      diagnostics: [],
    });
    expect(trigger.rerunCaseIds).toHaveLength(0);
    expect(trigger.preservedPassedCaseIds).toEqual(expect.arrayContaining([
      'TC-ITEM-PKG-046', 'TC-ITEM-STD-006', 'TC-ITEM-STD-007', 'TC-ITEM-STD-037',
    ]));
    expect(new Set(trigger.preservedPassedCaseIds).size).toBe(trigger.preservedPassedCaseIds.length);
    // 语义基线本身未漂移；闭环审计仍应保留已批准但尚未取得当前收据的规则，
    // 其来源是批准收据中的 revalidation-required，而不是触发器误报。
    const lifecycle = loadCurrentProductCenterBusinessRuleLifecycleSnapshot();
    const revalidationRuleIds = lifecycle.rules
      .filter((rule) => rule.verificationStatus === 'revalidation-required')
      .map((rule) => rule.ruleId)
      .sort();
    expect(closure.source.businessRuleChangedRuleIds.sort()).toEqual(revalidationRuleIds);
    expect(closure.summary['change-revalidation-required'])
      .toBe(closure.incrementalSelection.recommendedCaseIds.length);
    expect(closure.summary['change-revalidation-required']).toBeGreaterThan(0);
    expect(closure.incrementalSelection.approvedCaseIds).toEqual([]);
  });

  test('验证基线已晋级后重复审计保持幂等且不改写正式语义', () => {
    const receipt = readJson<{
      status: string;
      promotedRuleIds: string[];
      revalidatedCaseIds: string[];
      formalRuleSemanticsModified: boolean;
      beforeFingerprint: string;
      afterFingerprint: string;
    }>('contracts/product-center/business-rules/generated/product-center-business-rule-baseline-promotion.json');
    expect(receipt).toEqual(expect.objectContaining({
      status: 'unchanged',
      promotedRuleIds: [],
      revalidatedCaseIds: [],
      formalRuleSemanticsModified: false,
    }));
    expect(receipt.afterFingerprint).toBe(receipt.beforeFingerprint);
  });

  test('统一审计入口必须包含生命周期、规则触发、基线晋级和闭环阶段', () => {
    const packageJson = readJson<{ scripts: Record<string, string> }>('package.json');
    const checkpoint = readJson<{ stages: Record<string, { status: string }> }>(
      path.join(workspaceRoot, 'deliverables/test-plan-governance/product-center-business-rule-audit.checkpoint.json'),
      true,
    );
    expect(packageJson.scripts['audit:test-plan:closure']).toBe('tsx scripts/run-product-center-business-rule-audit.ts');
    expect(Object.keys(checkpoint.stages).sort()).toEqual([
      'business-rule-lifecycle',
      'landing-audit',
      'business-rule-change-trigger',
      'business-rule-baseline-promotion',
      'business-rule-change-trigger-after-promotion',
      'business-rule-review',
      'closure-audit',
      'business-rule-evaluation-events',
      'business-rule-observation',
      'business-rule-coverage',
      'business-rule-governance-catalog',
      'business-rule-governance-operations',
      'document-rule-promotion-plan',
      'document-rule-evidence-recovery-plan',
      'delegated-rule-approval-plan',
      'document-rule-closure-refresh',
      'business-rule-language-audit',
      'business-rule-time-context-review',
      'business-rule-scenario-coverage',
      'business-rule-confirmation-queue',
      'business-rule-promotion-readiness',
      'business-rule-promotion-batch-plan',
      'business-rule-review-workbench',
      'governance-optimization-readiness',
      'business-rule-post-optimization-analysis',
    ].sort());
    expect(Object.values(checkpoint.stages).every((stage) => stage.status === 'completed')).toBe(true);
    const source = fs.readFileSync(path.join(projectRoot, 'scripts/run-product-center-business-rule-audit.ts'), 'utf8');
    const stageOrder = [
      "id: 'business-rule-lifecycle'",
      "id: 'landing-audit'",
      "id: 'business-rule-change-trigger'",
      "id: 'business-rule-baseline-promotion'",
      "id: 'business-rule-change-trigger-after-promotion'",
      "id: 'business-rule-review'",
      "id: 'closure-audit'",
      "id: 'business-rule-evaluation-events'",
      "id: 'business-rule-observation'",
      "id: 'business-rule-coverage'",
      "id: 'business-rule-governance-catalog'",
      "id: 'business-rule-governance-operations'",
      "id: 'document-rule-promotion-plan'",
      "id: 'document-rule-evidence-recovery-plan'",
      "id: 'delegated-rule-approval-plan'",
      "id: 'document-rule-closure-refresh'",
      "id: 'business-rule-time-context-review'",
      "id: 'business-rule-scenario-coverage'",
      "id: 'business-rule-confirmation-queue'",
      "id: 'business-rule-promotion-readiness'",
      "id: 'business-rule-promotion-batch-plan'",
      "id: 'business-rule-review-workbench'",
      "id: 'governance-optimization-readiness'",
      "id: 'business-rule-post-optimization-analysis'",
    ].map((marker) => source.indexOf(marker));
    expect(stageOrder.every((index) => index >= 0)).toBe(true);
    expect(stageOrder).toEqual([...stageOrder].sort((left, right) => left - right));
  });
});

function readJson<T>(filePath: string, absolute = false): T {
  return JSON.parse(fs.readFileSync(absolute ? filePath : path.join(projectRoot, filePath), 'utf8')) as T;
}
