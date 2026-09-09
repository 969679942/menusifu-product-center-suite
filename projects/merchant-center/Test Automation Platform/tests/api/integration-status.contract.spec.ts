import { expect, test } from '@playwright/test';
import { buildGovernanceIntegrationPrompts, readGovernanceIntegrationSnapshot } from '../../src/governance/integration-status';

test.describe('治理系统接入状态合同', () => {
  test('默认没有Git、Jenkins或PRD系统接入', () => {
    const snapshot = readGovernanceIntegrationSnapshot({});
    expect(snapshot).toMatchObject({
      git: { status: 'not-connected' },
      jenkins: { status: 'not-connected' },
      prd: { sourceMode: 'document-only', connectorConfigured: false },
    });
    expect(buildGovernanceIntegrationPrompts(snapshot)).toEqual([]);
  });

  test('接入完成后只生成优化任务提示，不自动执行用例', () => {
    const snapshot = readGovernanceIntegrationSnapshot({
      TEST_AUTOMATION_PLATFORM_REPOSITORY: 'org/platform',
      TEST_AUTOMATION_PLATFORM_REF: 'a'.repeat(40),
      JENKINS_BASE_URL: 'https://jenkins.example.invalid',
      JENKINS_JOB_NAME: 'governance-job',
      JENKINS_WEBHOOK_URL: 'https://jenkins.example.invalid/hook',
      PRD_SOURCE_CONNECTOR_URL: 'https://prd.example.invalid/events',
    });
    expect(snapshot.git.status).toBe('connected');
    expect(snapshot.jenkins.status).toBe('connected');
    expect(buildGovernanceIntegrationPrompts(snapshot)).toEqual([
      'GIT_CONNECTED_REVIEW-BRG-OPT-004',
      'JENKINS_CONNECTED_REVIEW-BRG-OPT-011',
      'PRD_SYSTEM_CONNECTED_REVIEW-BRG-OPT-005',
    ]);
  });
});
