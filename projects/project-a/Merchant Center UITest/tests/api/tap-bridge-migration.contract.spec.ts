import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';

const projectRoot = path.resolve(__dirname, '../..');
const bridgeRoot = path.resolve(projectRoot, '..', 'Test Automation Platform');
const sourceRoot = 'D:/Menusifu/Merchant Center';

test.describe('商品中心 TAP 桥接迁移合同', () => {
  test('桥接目录必须包含当前公共源码和执行脚本', () => {
    for (const relativePath of [
      'src/automation/system-test/system-test-contract.ts',
      'src/automation/system-test/system-test-recipe-executor.ts',
      'src/governance/optimization-completion-gate.ts',
      'scripts/run-system-test-flow.ts',
      'scripts/check-ui-architecture.ts',
      'scripts/build-system-test-contract.ts',
    ]) {
      expect(fs.existsSync(path.join(bridgeRoot, relativePath)), relativePath).toBe(true);
    }
  });

  test('治理资产与 package 命令必须覆盖源工作区的迁移闭环', () => {
    const packageJson = JSON.parse(fs.readFileSync(path.join(projectRoot, 'package.json'), 'utf8')) as {
      scripts?: Record<string, string>;
    };
    for (const command of [
      'audit:product-center:git-jenkins',
      'build:product-center:governance-execution-queue',
      'build:product-center:business-rule-optimization-completion',
    ]) expect(packageJson.scripts?.[command]).toBeTruthy();
    for (const relativePath of [
      'scripts/audit-product-center-git-jenkins.ts',
      'scripts/build-product-center-governance-execution-task-queue.ts',
      'scripts/build-product-center-business-rule-optimization-completion.ts',
      'utils/product-center-legacy-case-fingerprint.ts',
    ]) {
      expect(fs.existsSync(path.join(projectRoot, relativePath)), relativePath).toBe(true);
      expect(fs.existsSync(path.join(sourceRoot, 'Merchant Center UITest', relativePath)), `source:${relativePath}`).toBe(true);
    }
  });

  test('source-governed 计划必须保留历史用例指纹链路', () => {
    const source = fs.readFileSync(path.join(projectRoot, 'scripts/build-product-center-source-governed-execution-plan.ts'), 'utf8');
    expect(source).toContain("product-center-legacy-case-fingerprint");
    expect(source).toContain('fingerprintProductCenterLegacyCaseById');
  });

  test('Jenkins认证预检必须只输出脱敏配置状态并禁止业务执行', () => {
    const script = fs.readFileSync(path.join(projectRoot, 'scripts/audit-product-center-jenkins-auth-preflight.ts'), 'utf8');
    expect(script).toContain('businessExecutionStarted: false');
    expect(script).toContain('loginAttempted: false');
    expect(script).toContain('secretsPersisted: false');
    expect(script).toContain('configured');
    expect(script).not.toContain('process.env.MC_PASSWORD,');
    expect(script).not.toContain('console.log(process.env');
  });
});
