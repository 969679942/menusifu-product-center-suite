import { test, expect } from '@playwright/test';
import {
  isInfrastructureOnlyPlaywrightRun,
  resolveRequestedPlaywrightProjects,
} from '../../utils/playwright-project-scope';

test.describe('Playwright 项目级清理范围合同', () => {
  test('API 与认证 setup 不得触发业务检查点或资源锁全局清理', () => {
    expect(isInfrastructureOnlyPlaywrightRun(['test', '--project=api'])).toBe(true);
    expect(isInfrastructureOnlyPlaywrightRun(['test', '--project', 'setup'])).toBe(true);
    expect(isInfrastructureOnlyPlaywrightRun(['test', '-p', 'api,setup'])).toBe(true);
  });

  test('业务项目和未显式限定项目时保留业务清理', () => {
    expect(isInfrastructureOnlyPlaywrightRun(['test', '--project=chrome'])).toBe(false);
    expect(isInfrastructureOnlyPlaywrightRun(['test'])).toBe(false);
    expect(resolveRequestedPlaywrightProjects(['test', '--project=api', '--project', 'setup']))
      .toEqual(['api', 'setup']);
  });
});
