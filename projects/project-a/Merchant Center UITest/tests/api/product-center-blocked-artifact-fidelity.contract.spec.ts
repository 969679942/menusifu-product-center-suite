import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { buildProductCenterExecutionRepairQueue, runProductCenterExecutionRepairQueue } from '../../scripts/build-product-center-execution-repair-queue';
import { projectConversionClassification } from '../../scripts/run-product-center-item-formal-full-conversion';
import { buildProductCenterCanonicalAutomationContractBatchArtifacts } from '../../scripts/build-product-center-canonical-automation-contract-batch';
import { buildProductCenterCanonicalAutomationContractBatch, type ProductCenterCanonicalReviewEntry } from '../../utils/product-center-canonical-automation-contract-batch';
import type { AutomationRecipe } from '../../automation/recipe/automation-recipe';

test('缺失执行结果必须抛出前置阻断而非返回零失败队列', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'repair-missing-'));
  try {
    expect(() => buildProductCenterExecutionRepairQueue({ sourcePath: path.join(root, 'missing.json') }))
      .toThrow('EXECUTION_RESULT_MISSING');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('缺失输入返回非零并写独立诊断，已有逐案队列字节保持不变', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'repair-preserve-'));
  try {
    const queuePath = path.join(root, 'product-center-execution-repair-queue.json');
    const priorQueue = JSON.stringify({ items: [{ caseId: 'CASE-1', classification: 'product-behavior' }] });
    fs.writeFileSync(queuePath, priorQueue);
    expect(runProductCenterExecutionRepairQueue({ sourcePath: path.join(root, 'missing.json'), outputRoot: root })).toBe(1);
    expect(fs.readFileSync(queuePath, 'utf8')).toBe(priorQueue);
    const diagnostic = JSON.parse(fs.readFileSync(path.join(root, 'product-center-execution-repair-queue.blocked.json'), 'utf8'));
    expect(diagnostic).toMatchObject({ status: 'blocked', code: 'EXECUTION_RESULT_MISSING', queueWritten: false, businessExecution: false });
    expect(diagnostic.items).toBeUndefined();
    expect(diagnostic.summary).toBeUndefined();
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('缺失合同时只有分类诊断，不得生成批准、收据或技术合同字段', () => {
  expect(projectConversionClassification()).toEqual({
    classification: 'blocked', recipeId: null, blockingReasons: ['AUTOMATION_CONTRACT_MISSING'],
  });
});

test('评审快照和计划指纹错配时必须拒绝构建合同', () => {
  expect(() => buildProductCenterCanonicalAutomationContractBatchArtifacts({
    write: false,
    snapshot: { plan: { fingerprint: 'new-plan', cases: [] }, review: { sourcePlanFingerprint: 'old-plan', entries: [] } },
  })).toThrow('REVIEW_PLAN_FINGERPRINT_MISMATCH');
});

test('完整技术绑定也不得放行未批准的当前评审', () => {
  const recipe: AutomationRecipe = {
    schemaVersion: '1.0.0', id: 'sample-read', caseId: 'CASE-1', title: '读取示例数据',
    tags: [], route: '/sample', action: 'read', traceabilityId: 'trace:sop:sample',
    sourceIds: ['source-1'], coverageIds: ['coverage-1'], generationAllowed: true,
    capabilities: [{ id: 'sample-read' }], assertions: [{ adapterId: 'sample-assert' }],
    semanticBindings: { testCaseIrId: 'CASE-1', obligationIds: ['obligation-1'], assertionContractIds: ['assertion-1'], factoryContractIds: [], cleanupContractIds: [] },
  };
  const build = (decision: ProductCenterCanonicalReviewEntry['decision']) => buildProductCenterCanonicalAutomationContractBatch({
    generatedAt: '2026-09-06T00:00:00Z',
    canonicalReview: [{ caseId: 'CASE-1', title: '读取示例数据', priority: 'P1', decision, automationDisposition: 'eligible-for-technical-binding-review' }],
    testCaseIr: [{ id: 'CASE-1' }], recipes: [recipe],
    runtimeDecisions: [{ recipeId: recipe.id, decision: 'retain', evidenceIds: ['isolated-test-evidence'] }],
    factoryContracts: [], cleanupContracts: [],
  }).entries[0];
  expect(build('approved').classification).toBe('strict-generatable');
  for (const decision of ['revision-required', 'source-confirmation-required'] as const) {
    expect(build(decision)).toMatchObject({ classification: 'blocked', reviewDecision: decision, blockingReasons: ['REVIEW_NOT_APPROVED'] });
  }
});
