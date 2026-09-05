import { expect, test } from '@playwright/test';
import { assertProjectRemediationExecutionScope, buildProjectRemediationScope } from '../../src/governance/project-remediation-scope';

const cases = [
  { caseId: 'ITEM-001', module: 'item', canonicalPath: 'cases/item.md#ITEM-001', ownerPath: 'tests/item.spec.ts', runnerId: 'item' },
  { caseId: 'GROUP-001', module: 'group', canonicalPath: 'cases/group.md#GROUP-001', ownerPath: 'tests/group.spec.ts', runnerId: 'group' },
];

test.describe('项目级全脚本整改范围合同', () => {
  test('目标模块缺失或用例未注册时必须阻断', () => {
    const scope = buildProjectRemediationScope({
      scopeId: 'application-all-landed', applicationId: 'application-a', projectId: 'project-a',
      expectedLandedByModule: { item: 1, group: 2 }, expectedExclusionsByStatus: { unlanded: 1 },
      cases, exclusions: [{ caseId: 'ITEM-999', module: 'item', status: 'unlanded', reason: 'no binding' }],
      ownerRegistration: { 'ITEM-001': true, 'GROUP-001': false }, sourceFingerprints: { index: 'fingerprint' },
    });
    expect(scope.status).toBe('blocked');
    expect(scope.issues.map((item) => item.code)).toContain('LANDED_COUNT_MISMATCH');
    expect(scope.issues).toContainEqual(expect.objectContaining({ code: 'OWNER_REGISTRATION_MISSING', caseId: 'GROUP-001' }));
    expect(() => assertProjectRemediationExecutionScope({ scope, plannedCaseIds: ['ITEM-001'], classifiedExclusionCaseIds: ['GROUP-001'] }))
      .toThrow('PROJECT_REMEDIATION_SCOPE_BLOCKED');
  });

  test('计划必须覆盖全部目标或逐条明确排除', () => {
    const scope = buildProjectRemediationScope({
      scopeId: 'application-all-landed', applicationId: 'application-a', projectId: 'project-a',
      expectedLandedByModule: { item: 1, group: 1 }, expectedExclusionsByStatus: { unlanded: 1 },
      cases, exclusions: [{ caseId: 'ITEM-999', module: 'item', status: 'unlanded', reason: 'no binding' }],
      ownerRegistration: { 'ITEM-001': true, 'GROUP-001': true }, sourceFingerprints: { index: 'fingerprint' },
      generatedAt: '2026-08-29T00:00:00.000Z',
    });
    expect(scope.status).toBe('ready');
    expect(() => assertProjectRemediationExecutionScope({ scope, plannedCaseIds: ['ITEM-001'], classifiedExclusionCaseIds: [] }))
      .toThrow('PROJECT_REMEDIATION_SCOPE_INCOMPLETE:GROUP-001');
    expect(() => assertProjectRemediationExecutionScope({ scope, plannedCaseIds: ['ITEM-001'], classifiedExclusionCaseIds: ['GROUP-001'] }))
      .not.toThrow();
  });
});
