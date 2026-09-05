import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import {
  buildProductCenterCiSummary,
  resolveProductCenterCiConfiguration,
} from '../../utils/product-center-ci';

test.describe('商品中心 CI 与跨环境运行合同', () => {
  test('full 模式应从运行环境解析非敏感配置且摘要不得包含凭据值', async () => {
    const config = resolveProductCenterCiConfiguration({
      mode: 'full',
      environmentId: 'staging',
      controlledRepair: false,
      trigger: 'manual',
      env: fullEnvironment,
    });

    expect(config).toMatchObject({
      pass: true,
      mode: 'full',
      trigger: 'manual',
      controlledRepair: false,
      pipelineScript: 'pipeline:product-center:full',
      environment: {
        id: 'staging',
        baseHost: 'merchant.staging.example.test',
        authHost: 'auth.staging.example.test',
      },
      secretPresence: {
        username: true,
        password: true,
        merchant: true,
        brandId: true,
      },
      artifactRetentionDays: 30,
      notificationChannel: 'github-step-summary',
      issues: [],
    });
    const serialized = JSON.stringify(config);
    expect(serialized).not.toContain('ci-user');
    expect(serialized).not.toContain(fixturePassword);
    expect(serialized).not.toContain('staging-merchant');
    expect(serialized).not.toContain('brand-staging');
  });

  test('full 模式缺少环境 URL 或运行凭据时必须在启动 UI 前阻断', async () => {
    const config = resolveProductCenterCiConfiguration({
      mode: 'full',
      environmentId: 'staging',
      controlledRepair: false,
      trigger: 'manual',
      env: {},
    });

    expect(config.pass).toBe(false);
    expect(config.issues.map((issue) => issue.code)).toEqual([
      'BASE_URL_REQUIRED',
      'AUTH_BASE_URL_REQUIRED',
      'USERNAME_REQUIRED',
      'PASSWORD_REQUIRED',
      'MERCHANT_REQUIRED',
      'BRAND_ID_REQUIRED',
    ]);
  });

  test('定时任务必须禁止 controlled repair 且 verify 不应要求 UI 凭据', async () => {
    const scheduledRepair = resolveProductCenterCiConfiguration({
      mode: 'full',
      environmentId: 'balamxqa',
      controlledRepair: true,
      trigger: 'schedule',
      env: fullEnvironment,
    });
    expect(scheduledRepair.pass).toBe(false);
    expect(scheduledRepair.issues.map((issue) => issue.code)).toContain('SCHEDULED_REPAIR_FORBIDDEN');

    const verify = resolveProductCenterCiConfiguration({
      mode: 'verify',
      environmentId: 'balamxqa',
      controlledRepair: false,
      trigger: 'manual',
      env: {
        PLAYWRIGHT_BASE_URL: 'https://merchant.qa.example.test',
        PLAYWRIGHT_AUTH_BASE_URL: 'https://auth.qa.example.test',
      },
    });
    expect(verify.pass).toBe(true);
    expect(verify.pipelineScript).toBe('pipeline:product-center');
    expect(Object.values(verify.secretPresence).every((present) => !present)).toBe(true);
  });

  test('CI 摘要应只输出门禁状态和安全计数', async () => {
    const config = resolveProductCenterCiConfiguration({
      mode: 'full',
      environmentId: 'staging',
      controlledRepair: false,
      trigger: 'manual',
      env: fullEnvironment,
    });
    const summary = buildProductCenterCiSummary({
      config,
      pipelineExitCode: 0,
      pipelineReport: {
        status: 'passed-with-actions',
        pipeline: { status: 'passed', failedStage: null, stages: Array.from({ length: 12 }) },
        technicalReadiness: { technicalReady: true, sourceActions: { legacyClaims: 114 } },
        controlledRepair: { status: 'disabled' },
      },
    });

    expect(summary).toMatchObject({
      status: 'passed-with-actions',
      environment: 'staging',
      pipelineStatus: 'passed',
      stages: 12,
      failedStage: null,
      technicalReady: true,
      controlledRepairStatus: 'disabled',
    });
    expect(JSON.stringify(summary)).not.toContain(fixturePassword);
  });

  test('GitHub Actions 应隔离自动审计与手工跨环境运行并安全保留产物', async () => {
    const projectRoot = process.cwd();
    const workflowPath = path.resolve(
      projectRoot,
      '../.github/workflows/product-center-quality.yml',
    );
    const workflow = fs.readFileSync(workflowPath, 'utf8');
    const envSource = fs.readFileSync(path.join(projectRoot, 'test-data/env.ts'), 'utf8');
    const playwrightSource = fs.readFileSync(path.join(projectRoot, 'playwright.config.ts'), 'utf8');
    const packageJson = JSON.parse(fs.readFileSync(path.join(projectRoot, 'package.json'), 'utf8'));

    expect(workflow).toContain('workflow_dispatch:');
    const manualGate = workflow.indexOf("if: github.event_name == 'workflow_dispatch'");
    const ciCommand = workflow.indexOf('run: npm run ci:product-center');
    expect(manualGate).toBeGreaterThan(0);
    expect(ciCommand).toBeGreaterThan(manualGate);
    expect(workflow.slice(manualGate, ciCommand)).toContain('PRODUCT_CENTER_CONTROLLED_REPAIR: ${{ inputs.controlled_repair }}');
    expect(workflow).toContain('environment:');
    expect(workflow).toContain('concurrency:');
    expect(workflow).toContain('secrets.MC_USERNAME');
    expect(workflow).toContain('vars.PLAYWRIGHT_BASE_URL');
    expect(workflow).toContain('npm run ci:product-center');
    expect(workflow).toContain('retention-days: 30');
    expect(workflow).toContain('output/ci/product-center-ci-summary.md');
    expect(workflow).toContain('output/quality/*.json');
    expect(workflow).not.toContain('Merchant Center UITest/output/auth-state.json');
    expect(envSource).toContain('MC_TEST_ENV');
    expect(envSource).toContain('MC_STORAGE_STATE_PATH');
    expect(playwrightSource).toContain('retries: 0');
    expect(packageJson.scripts['ci:product-center']).toContain('run-product-center-ci.ts');
    expect(packageJson.scripts['test:product-center:contract'])
      .toContain('run-product-center-contract-tests.ts');
    expect(fs.readFileSync(path.join(
      projectRoot,
      'contracts/product-center/test-manifests/product-center-contract-tests.json',
    ), 'utf8')).toContain('product-center-ci.contract.spec.ts');
  });
});

const fixturePassword = ['ci', 'password'].join('-');

const fullEnvironment = {
  PLAYWRIGHT_BASE_URL: 'https://merchant.staging.example.test',
  PLAYWRIGHT_AUTH_BASE_URL: 'https://auth.staging.example.test',
  MC_USERNAME: 'ci-user',
  MC_PASSWORD: fixturePassword,
  MC_MERCHANT: 'staging-merchant',
  MC_BRAND_ID: 'brand-staging',
};
