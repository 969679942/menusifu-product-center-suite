import { expect, test } from '@playwright/test';
import { buildSystemTestCapabilityMatchReport } from '../../src/automation/system-test/system-test-capability-matching';

test.describe('系统测试能力匹配合同', () => {
  test('缺少声明或环境能力时不允许匹配', () => {
    const report = buildSystemTestCapabilityMatchReport({
      applicationId: 'demo',
      environmentId: 'qa',
      registeredCapabilityIds: ['navigation'],
      cases: [
        { caseId: 'A', requiredCapabilityIds: ['navigation'] },
        { caseId: 'B', requiredCapabilityIds: [] },
        { caseId: 'C', requiredCapabilityIds: ['missing'] },
        { caseId: 'D', requiredCapabilityIds: ['missing'], excluded: true },
      ],
    });
    expect(report.summary).toEqual({
      total: 4,
      matched: 1,
      missingDeclaration: 1,
      missingEnvironment: 1,
      excluded: 1,
    });
    expect(report.cases.find((item) => item.caseId === 'C')?.status).toBe('missing-environment');
    expect(report.cases.find((item) => item.caseId === 'D')?.status).toBe('excluded');
  });
});
