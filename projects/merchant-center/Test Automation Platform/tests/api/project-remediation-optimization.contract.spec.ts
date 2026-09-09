import { expect, test } from '@playwright/test';
import { buildProjectRemediationOptimizationPlan } from '../../src/governance/project-remediation-optimization';
import { buildProjectRemediationScope } from '../../src/governance/project-remediation-scope';

const scope = buildProjectRemediationScope({
  scopeId: 'all-landed',
  applicationId: 'application-a',
  projectId: 'project-a',
  expectedLandedByModule: { item: 1, group: 1 },
  expectedExclusionsByStatus: {},
  cases: [
    { caseId: 'CASE-ITEM', module: 'item', canonicalPath: 'item.md', ownerPath: 'item.spec.ts', runnerId: 'item' },
    { caseId: 'CASE-GROUP', module: 'group', canonicalPath: 'group.md', ownerPath: 'group.spec.ts', runnerId: 'group' },
  ],
  exclusions: [],
  sourceFingerprints: { source: 'fingerprint' },
  ownerRegistration: { 'CASE-ITEM': true, 'CASE-GROUP': true },
  generatedAt: '2026-08-29T00:00:00.000Z',
});

function optimizationCase(caseId: string, module: string) {
  return {
    caseId,
    module,
    groupKey: `${module}:group`,
    caseFingerprint: `${caseId}:case`,
    implementationFingerprint: `${caseId}:implementation`,
    mutationMode: 'none' as const,
    requiredOperationKeys: [`${caseId}:operation`],
    expectationClaimIds: [`${caseId}:assertion`],
    contextGuardPhases: ['before-action', 'before-assertion'] as ('before-action' | 'before-assertion')[],
    cleanupRequired: false,
  };
}

test('项目整改计划覆盖全部模块且不自动生成结构金样本', () => {
  const plan = buildProjectRemediationOptimizationPlan({
    planId: 'project-a:all-landed',
    scope,
    cases: [optimizationCase('CASE-ITEM', 'item'), optimizationCase('CASE-GROUP', 'group')],
    maxBatchSize: 20,
    impactedCaseIds: ['CASE-ITEM'],
    generatedAt: '2026-08-29T00:00:00.000Z',
  });
  expect(plan.status).toBe('canary-required');
  expect(plan.canaryCaseIds).toEqual(['CASE-ITEM']);
  expect(plan.moduleSummary).toEqual({
    group: { totalCases: 1, groupCount: 1, canaryCaseCount: 0 },
    item: { totalCases: 1, groupCount: 1, canaryCaseCount: 1 },
  });
});

test('单模块计划不能冒充项目级整改计划', () => {
  expect(() => buildProjectRemediationOptimizationPlan({
    planId: 'project-a:invalid',
    scope,
    cases: [optimizationCase('CASE-ITEM', 'item')],
    maxBatchSize: 20,
  })).toThrow(/PROJECT_REMEDIATION_SCOPE_INCOMPLETE:CASE-GROUP/);
});

test('显式定向选择不被同模块已分类静态阻断项污染', () => {
  const blockedGroupCase = {
    ...optimizationCase('CASE-GROUP', 'group'),
    staticIssueCodes: ['EXECUTION_NOT_ALLOWED'],
  };
  const plan = buildProjectRemediationOptimizationPlan({
    planId: 'project-a:targeted-item',
    scope,
    cases: [optimizationCase('CASE-ITEM', 'item'), blockedGroupCase],
    maxBatchSize: 20,
    includedModules: ['item', 'group'],
    executionCaseIds: ['CASE-ITEM'],
    impactedCaseIds: ['CASE-ITEM'],
    impactTypes: { 'CASE-ITEM': 'business-implementation', 'CASE-GROUP': 'platform-only' },
    generatedAt: '2026-08-29T00:00:00.000Z',
  });
  expect(plan.executionCaseIds).toEqual(['CASE-ITEM']);
  expect(plan.staticIssues).toEqual([]);
  expect(plan.targetedCaseIds).toEqual(['CASE-ITEM']);
  expect(plan.batches.flatMap((batch) => batch.caseIds)).toEqual(['CASE-ITEM']);
});

test('显式选择不得越过模块边界', () => {
  expect(() => buildProjectRemediationOptimizationPlan({
    planId: 'project-a:invalid-target',
    scope,
    cases: [optimizationCase('CASE-ITEM', 'item'), optimizationCase('CASE-GROUP', 'group')],
    maxBatchSize: 20,
    includedModules: ['item'],
    executionCaseIds: ['CASE-GROUP'],
  })).toThrow('PROJECT_OPTIMIZATION_EXECUTION_CASE_OUTSIDE_MODULES:CASE-GROUP');
});
