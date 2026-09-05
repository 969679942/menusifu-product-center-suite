import { expect, test } from '@playwright/test';
import {
  assertSystemTestOptimizationGate,
  assertSystemTestOptimizationPlanMetadata,
  buildSystemTestOptimizationPlan,
  type SystemTestOptimizationCase,
} from '../../src/governance/system-test-optimization-gate';

const baseCase = (caseId: string, groupKey = 'route-a|create|profile-a'): SystemTestOptimizationCase => ({
  caseId,
  groupKey,
  caseFingerprint: `case-${caseId}`,
  implementationFingerprint: `implementation-${caseId}`,
  mutationMode: 'reversible',
  requiredOperationKeys: [`operation-${caseId}`],
  expectationClaimIds: [`claim-${caseId}`],
  contextGuardPhases: ['before-action', 'before-assertion'],
  cleanupRequired: true,
});

test.describe('通用测试整改批次效率门禁', () => {
  test('静态合同先阻断，避免整批启动后才发现缺口', () => {
    const invalid = { ...baseCase('CASE-002'), requiredOperationKeys: [], cleanupRequired: false };
    const plan = buildSystemTestOptimizationPlan({ planId: 'plan-1', contractFingerprint: 'contract-1', cases: [invalid], maxBatchSize: 10 });
    expect(plan.status).toBe('blocked');
    expect(plan.staticIssues.map((issue) => issue.code)).toEqual(['MUTATION_CLEANUP_REQUIRED', 'MUTATION_OPERATION_REQUIRED']);
    expect(() => assertSystemTestOptimizationGate({ plan, requestedCaseIds: ['CASE-002'], stage: 'canary' }))
      .toThrow('OPTIMIZATION_CASE_NOT_ELIGIBLE:CASE-002');
  });

  test('适配器声明的静态脚本缺口必须进入计划并阻断放量', () => {
    const plan = buildSystemTestOptimizationPlan({
      planId: 'plan-adapter-static',
      contractFingerprint: 'contract-adapter-static',
      cases: [{ ...baseCase('CASE-STATIC'), staticIssueCodes: ['RECIPE_REQUIRED', 'ASSERTION_CONTRACT_REQUIRED'] }],
      maxBatchSize: 5,
    });
    expect(plan.status).toBe('blocked');
    expect(plan.staticIssues).toEqual([
      { caseId: 'CASE-STATIC', code: 'ASSERTION_CONTRACT_REQUIRED' },
      { caseId: 'CASE-STATIC', code: 'RECIPE_REQUIRED' },
    ]);
  });

  test('静态缺口只阻断所属用例，干净分组仍可先行 canary', () => {
    const plan = buildSystemTestOptimizationPlan({
      planId: 'plan-scoped-static',
      contractFingerprint: 'contract-scoped-static',
      cases: [
        { ...baseCase('CASE-CLEAN') },
        { ...baseCase('CASE-BLOCKED', 'route-b|create|profile-a'), staticIssueCodes: ['RECIPE_REQUIRED'] },
      ],
      maxBatchSize: 5,
    });
    expect(plan.status).toBe('canary-required');
    expect(plan.canaryCaseIds).toEqual(['CASE-CLEAN']);
    expect(plan.executionEligibleCaseIds).toEqual(['CASE-CLEAN']);
    expect(() => assertSystemTestOptimizationGate({ plan, requestedCaseIds: ['CASE-BLOCKED'], stage: 'canary' }))
      .toThrow('OPTIMIZATION_CASE_NOT_ELIGIBLE:CASE-BLOCKED');
  });

  test('执行范围外的静态缺口不得阻断当前模块定向批次', () => {
    const clean = baseCase('CASE-IN-SCOPE');
    const excluded = { ...baseCase('CASE-OUT-OF-SCOPE'), staticIssueCodes: ['EXECUTION_NOT_ALLOWED'] };
    const plan = buildSystemTestOptimizationPlan({
      planId: 'plan-module-isolation',
      contractFingerprint: 'contract-module-isolation',
      cases: [clean, excluded],
      executionCaseIds: [clean.caseId],
      impactedCaseIds: [clean.caseId],
      impactTypes: { [clean.caseId]: 'adapter-only' },
      maxBatchSize: 5,
    });
    expect(plan.status).toBe('ready-for-batch');
    expect(plan.executionEligibleCaseIds).toEqual([clean.caseId]);
    expect(plan.staticIssues).toContainEqual({ caseId: excluded.caseId, code: 'EXECUTION_NOT_ALLOWED' });
  });

  test('显式影响集只执行未复用用例，不自动生成结构金样本', () => {
    const cases = [baseCase('CASE-001'), baseCase('CASE-002'), baseCase('CASE-003', 'route-b|delete|profile-a')];
    const canaryPlan = buildSystemTestOptimizationPlan({ planId: 'plan-2', contractFingerprint: 'contract-2', cases, impactedCaseIds: ['CASE-001', 'CASE-003'], maxBatchSize: 2 });
    expect(canaryPlan.status).toBe('canary-required');
    expect(canaryPlan.canaryCaseIds).toEqual(['CASE-001', 'CASE-003']);
    expect(canaryPlan.executionEligibleCaseIds).toEqual(['CASE-001', 'CASE-003']);
    expect(() => assertSystemTestOptimizationGate({ plan: canaryPlan, requestedCaseIds: ['CASE-001', 'CASE-002'], stage: 'batch' }))
      .toThrow('OPTIMIZATION_CASE_NOT_ELIGIBLE:CASE-002');

    const readyPlan = buildSystemTestOptimizationPlan({
      planId: 'plan-2', contractFingerprint: 'contract-2', cases, impactedCaseIds: ['CASE-001', 'CASE-003'], maxBatchSize: 2,
      canaryReceipts: [
        { caseId: 'CASE-001', caseFingerprint: 'case-CASE-001', implementationFingerprint: 'implementation-CASE-001', status: 'passed', evidenceComplete: true, operationReceiptCount: 1, assertionReceiptCount: 1, cleanupComplete: true, contextReceiptComplete: true },
        { caseId: 'CASE-003', caseFingerprint: 'case-CASE-003', implementationFingerprint: 'implementation-CASE-003', status: 'passed', evidenceComplete: true, operationReceiptCount: 1, assertionReceiptCount: 1, cleanupComplete: true, contextReceiptComplete: true },
      ],
    });
    expect(readyPlan.status).toBe('revalidation-complete');
    expect(readyPlan.reusableCaseIds).toEqual(['CASE-001', 'CASE-003']);
    expect(readyPlan.executionEligibleCaseIds).toEqual([]);
    expect(readyPlan.batches).toEqual([]);
  });

  test('定向收据必须匹配当前用例和实现指纹', () => {
    const plan = buildSystemTestOptimizationPlan({
      planId: 'plan-3', contractFingerprint: 'contract-3', cases: [baseCase('CASE-004')], maxBatchSize: 5,
      canaryReceipts: [{ caseId: 'CASE-004', caseFingerprint: 'old-case', implementationFingerprint: 'old-implementation', status: 'passed', evidenceComplete: true, operationReceiptCount: 1, assertionReceiptCount: 1, cleanupComplete: true, contextReceiptComplete: true }],
    });
    expect(plan.status).toBe('canary-blocked');
    expect(() => assertSystemTestOptimizationGate({ plan, requestedCaseIds: ['CASE-004'], stage: 'batch' }))
      .toThrow('OPTIMIZATION_BATCH_GATE_NOT_READY:canary-blocked');
  });

  test('运行时指纹漂移必须在浏览器启动前拒绝过期计划', () => {
    const current = baseCase('CASE-STALE');
    const plan = buildSystemTestOptimizationPlan({
      planId: 'plan-stale', contractFingerprint: 'contract-stale', cases: [current], maxBatchSize: 5,
    });
    expect(() => assertSystemTestOptimizationGate({
      plan,
      requestedCaseIds: [current.caseId],
      stage: 'canary',
      currentCases: [{ ...current, implementationFingerprint: 'implementation-changed' }],
    })).toThrow('OPTIMIZATION_IMPLEMENTATION_FINGERPRINT_STALE:CASE-STALE');
  });

  test('代码变更用例可被显式加入 sentinel 且仍受公共门禁约束', () => {
    const plan = buildSystemTestOptimizationPlan({
      planId: 'plan-override', contractFingerprint: 'contract-override',
      cases: [baseCase('CASE-010'), baseCase('CASE-011')], maxBatchSize: 5, impactedCaseIds: ['CASE-011'],
      canaryCaseIds: ['CASE-011'],
    });
    expect(plan.canaryCaseIds).toEqual(['CASE-011']);
    expect(plan.executionEligibleCaseIds).toEqual(['CASE-011']);
    expect(() => buildSystemTestOptimizationPlan({
      planId: 'plan-unknown', contractFingerprint: 'contract-unknown',
      cases: [baseCase('CASE-012')], maxBatchSize: 5, impactedCaseIds: [],
      canaryCaseIds: ['CASE-999'],
    })).not.toThrow();
  });

  test('只读用例也必须保留至少一个已执行业务操作收据', () => {
    const plan = buildSystemTestOptimizationPlan({
      planId: 'plan-4', contractFingerprint: 'contract-4', cases: [{ ...baseCase('CASE-005'), mutationMode: 'none', requiredOperationKeys: [], cleanupRequired: false }], maxBatchSize: 5,
      canaryReceipts: [{ caseId: 'CASE-005', caseFingerprint: 'case-CASE-005', implementationFingerprint: 'implementation-CASE-005', status: 'passed', evidenceComplete: true, operationReceiptCount: 0, assertionReceiptCount: 1, cleanupComplete: true, contextReceiptComplete: true }],
    });
    expect(plan.status).toBe('canary-blocked');
  });

  test('证据完整的产品偏差保留失败结论并从后续批量排除', () => {
    const cases = [{ ...baseCase('CASE-101'), requiredCanary: true }, baseCase('CASE-102')];
    const plan = buildSystemTestOptimizationPlan({
      planId: 'plan-product-finding', contractFingerprint: 'contract-product-finding', cases, impactedCaseIds: ['CASE-101'], maxBatchSize: 5,
      canaryReceipts: [{
        caseId: 'CASE-101', caseFingerprint: 'case-CASE-101', implementationFingerprint: 'implementation-CASE-101',
        status: 'failed', failureCategory: 'product-failure', evidenceComplete: true,
        operationReceiptCount: 1, assertionReceiptCount: 1, cleanupComplete: true, contextReceiptComplete: true,
      }],
    });
    expect(plan.status).toBe('revalidation-complete');
    expect(plan.acceptedFindingCaseIds).toEqual(['CASE-101']);
    expect(plan.executionEligibleCaseIds).toEqual([]);
    expect(plan.batches).toEqual([]);
    expect(() => assertSystemTestOptimizationGate({ plan, requestedCaseIds: ['CASE-101'], stage: 'batch' }))
      .toThrow('OPTIMIZATION_CASE_NOT_ELIGIBLE:CASE-101');
  });

  test('适配器要求复核的当前产品发现必须进入 canary', () => {
    const cases = [baseCase('CASE-201'), { ...baseCase('CASE-202'), requiredCanary: true }];
    const plan = buildSystemTestOptimizationPlan({
      planId: 'plan-required-canary', contractFingerprint: 'contract-required-canary', cases, maxBatchSize: 5,
    });
    expect(plan.canaryCaseIds).toEqual(['CASE-201', 'CASE-202']);
  });

  test('平台层影响不会因适配器历史 requiredCanary 自动启动业务执行', () => {
    const plan = buildSystemTestOptimizationPlan({
      planId: 'plan-platform-only-finding', contractFingerprint: 'contract-platform-only-finding',
      cases: [{ ...baseCase('CASE-PLATFORM-ONLY'), requiredCanary: true }], maxBatchSize: 5,
      impactedCaseIds: [], impactTypes: { 'CASE-PLATFORM-ONLY': 'platform-only' },
    });
    expect(plan.candidateCanaryCaseIds).toEqual([]);
    expect(plan.canaryCaseIds).toEqual([]);
    expect(plan.executionEligibleCaseIds).toEqual([]);
    expect(plan.caseDecisions['CASE-PLATFORM-ONLY'].decision).toBe('static-verify');
    expect(plan.status).toBe('revalidation-complete');
  });

  test('已知业务实现影响直接进入批量，只有未知影响才需要 canary', () => {
    const cases = [baseCase('CASE-KNOWN-001'), baseCase('CASE-KNOWN-002')];
    const plan = buildSystemTestOptimizationPlan({
      planId: 'plan-known-business-impact', contractFingerprint: 'contract-known-business-impact',
      cases, maxBatchSize: 1,
      impactedCaseIds: cases.map((item) => item.caseId),
      impactTypes: Object.fromEntries(cases.map((item) => [item.caseId, 'business-implementation'])),
    });
    expect(plan.candidateCanaryCaseIds).toEqual([]);
    expect(plan.canaryCaseIds).toEqual([]);
    expect(plan.status).toBe('ready-for-batch');
    expect(plan.executionEligibleCaseIds).toEqual(cases.map((item) => item.caseId));
    expect(plan.targetedCaseIds).toEqual(cases.map((item) => item.caseId));
    expect(plan.sentinelCaseIds).toEqual([]);
    expect(plan.batches).toHaveLength(2);
  });

  test('缺少当前标准收据必须作为证据缺口定向执行而不是伪装成实现变更', () => {
    const item = baseCase('CASE-EVIDENCE-GAP');
    const plan = buildSystemTestOptimizationPlan({
      planId: 'plan-evidence-gap', contractFingerprint: 'contract-evidence-gap',
      cases: [item], maxBatchSize: 5,
      impactedCaseIds: [item.caseId], impactTypes: { [item.caseId]: 'evidence-gap' },
    });
    expect(plan.status).toBe('ready-for-batch');
    expect(plan.executionEligibleCaseIds).toEqual([item.caseId]);
    expect(plan.caseDecisions[item.caseId]).toMatchObject({
      decision: 'targeted-execute',
      reasonCode: 'NO_CURRENT_COMPLETE_RECEIPT',
      impactType: 'evidence-gap',
      reusable: false,
    });
  });

  test('自动化失败不得借产品偏差通道放量', () => {
    const plan = buildSystemTestOptimizationPlan({
      planId: 'plan-automation-failure', contractFingerprint: 'contract-automation-failure', cases: [baseCase('CASE-103')], maxBatchSize: 5,
      canaryReceipts: [{
        caseId: 'CASE-103', caseFingerprint: 'case-CASE-103', implementationFingerprint: 'implementation-CASE-103',
        status: 'failed', failureCategory: 'automation-gap', evidenceComplete: true,
        operationReceiptCount: 1, assertionReceiptCount: 1, cleanupComplete: true, contextReceiptComplete: true,
      }],
    });
    expect(plan.status).toBe('canary-blocked');
    expect(plan.acceptedFindingCaseIds).toEqual([]);
  });

  test('大批量未复用影响用例超过预算时静态阻断且不生成可执行 sentinel', () => {
    const cases = Array.from({ length: 25 }, (_, index) => baseCase(`CASE-BULK-${String(index).padStart(2, '0')}`, `route-${index}|create|profile-a`));
    const plan = buildSystemTestOptimizationPlan({
      planId: 'plan-bulk-budget', contractFingerprint: 'contract-bulk-budget', cases, maxBatchSize: 5,
      impactedCaseIds: cases.map((item) => item.caseId),
    });
    expect(plan.status).toBe('blocked');
    expect(plan.canaryCaseIds).toEqual([]);
    expect(plan.staticIssues.some((issue) => issue.code.startsWith('CANARY_PARTITION_TOO_LARGE'))).toBe(true);
  });

  test('已有标准完整收据从计划输入消费并标记 reuse', () => {
    const current = baseCase('CASE-STANDARD-REUSE');
    const plan = buildSystemTestOptimizationPlan({
      planId: 'plan-standard-reuse', contractFingerprint: 'contract-standard-reuse', cases: [current], maxBatchSize: 5,
      standardReceipts: [{
        caseId: current.caseId, caseFingerprint: current.caseFingerprint,
        implementationFingerprint: current.implementationFingerprint, status: 'passed', evidenceComplete: true,
        operationReceiptCount: 1, assertionReceiptCount: 1, cleanupComplete: true, contextReceiptComplete: true,
      }],
    });
    expect(plan.reusableCaseIds).toEqual([current.caseId]);
    expect(plan.caseDecisions[current.caseId].decision).toBe('reuse');
    expect(plan.canaryCaseIds).toEqual([]);
  });

  test('混合复用与执行时批次只能包含当前 execution eligible 用例', () => {
    const reusable = baseCase('CASE-MIXED-REUSE');
    const pending = baseCase('CASE-MIXED-PENDING');
    const plan = buildSystemTestOptimizationPlan({
      planId: 'plan-mixed-reuse', contractFingerprint: 'contract-mixed-reuse',
      cases: [reusable, pending], maxBatchSize: 5,
      impactedCaseIds: [reusable.caseId, pending.caseId],
      impactTypes: { [reusable.caseId]: 'business-implementation', [pending.caseId]: 'business-implementation' },
      standardReceipts: [{
        caseId: reusable.caseId, caseFingerprint: reusable.caseFingerprint,
        implementationFingerprint: reusable.implementationFingerprint, status: 'passed', evidenceComplete: true,
        operationReceiptCount: 1, assertionReceiptCount: 1, cleanupComplete: true, contextReceiptComplete: true,
      }],
    });
    expect(plan.status).toBe('ready-for-batch');
    expect(plan.reusableCaseIds).toEqual([reusable.caseId]);
    expect(plan.executionEligibleCaseIds).toEqual([pending.caseId]);
    expect(plan.batches.flatMap((batch) => batch.caseIds)).toEqual([pending.caseId]);
  });

  test('缺少计划身份和范围元数据时拒绝公共 runner 消费', () => {
    const plan = buildSystemTestOptimizationPlan({
      planId: 'plan-metadata', contractFingerprint: 'contract-metadata', cases: [baseCase('CASE-META')], maxBatchSize: 5,
      impactedCaseIds: [], changeId: 'change-metadata',
    });
    expect(() => assertSystemTestOptimizationPlanMetadata(plan)).not.toThrow();
    expect(() => assertSystemTestOptimizationPlanMetadata({ ...plan, changeId: undefined })).toThrow('OPTIMIZATION_PLAN_METADATA_REQUIRED');
    expect(() => assertSystemTestOptimizationPlanMetadata({ ...plan, selectionFingerprint: undefined })).toThrow('OPTIMIZATION_PLAN_METADATA_REQUIRED');
  });
});
