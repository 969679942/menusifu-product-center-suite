import { expect, test } from '@playwright/test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  calculateRuntimeLifecycleCoverage,
  extractRuntimeLifecycleTimings,
  sanitizeStepTitle,
} from '../../reporters/product-center-timing.reporter';
import {
  sanitizeGeneratedTestReports,
  sanitizeProductCenterTimingReports,
} from '../../scripts/sanitize-product-center-timing-reports';

const projectRoot = path.resolve(__dirname, '../..');
const packageJson = JSON.parse(fs.readFileSync(path.join(projectRoot, 'package.json'), 'utf8')) as { scripts: Record<string, string> };
const authFlow = fs.readFileSync(path.join(projectRoot, 'flows/auth.flow.ts'), 'utf8');
const playwrightConfig = fs.readFileSync(path.join(projectRoot, 'playwright.config.ts'), 'utf8');
const authSetup = fs.readFileSync(path.join(projectRoot, 'tests/setup/auth.setup.ts'), 'utf8');
const authRuntime = `${authFlow}
${authSetup}`;
const globalTeardown = fs.readFileSync(path.join(projectRoot, 'tests/setup/global.teardown.ts'), 'utf8');
const timingReporterPath = path.join(projectRoot, 'reporters/product-center-timing.reporter.ts');
const highDependencyPage = fs.readFileSync(path.join(projectRoot, 'pages/product-center/product-center-high-dependency-sop.page.ts'), 'utf8');
const itemListPage = fs.readFileSync(path.join(projectRoot, 'pages/product-management/item/item-list.page.ts'), 'utf8');
const addonFlow = fs.readFileSync(path.join(projectRoot, 'flows/product-center/item-216/addon-item-216.flow.ts'), 'utf8');

test.describe('商品中心 UI 性能架构合同', () => {
  test('全量套件应单进程运行而不是串行启动五个 npm 子进程', async () => {
    expect(packageJson.scripts['test:product-center:sop:all']).toContain('playwright test');
    expect(packageJson.scripts['test:product-center:sop:all']).not.toMatch(/npm run test:product-center:sop:/);
  });

  test('认证流程不得等待全局 networkidle，而应依赖业务就绪信号', async () => {
    expect(authRuntime).not.toContain('networkidle');
    expect(authRuntime).toContain('waitUntil');
    expect(authFlow).toContain('bootstrapMerchantCenterSession');
  });

  test('应提供 fast full stability 三档执行命令', async () => {
    expect(packageJson.scripts['test:product-center:sop:fast']).toContain('--grep @fast');
    expect(packageJson.scripts['test:product-center:sop:full']).toContain('--workers=1');
    expect(packageJson.scripts['test:product-center:sop:stability']).toContain('--workers=1');
    expect(packageJson.scripts['test:product-center:sop:stability']).not.toContain('--repeat-each');
    expect(packageJson.scripts['test:product-center:sop:stability:soak']).toContain('--workers=1');
    expect(packageJson.scripts['test:product-center:sop:stability:soak']).toContain('--repeat-each=3');
    expect(packageJson.scripts['test:product-center:sop:stability:serial']).toContain('--workers=1');
    expect(packageJson.scripts['test:product-center:sop:stability:serial']).toContain('--repeat-each=3');
  });

  test('商品中心 UI 套件不得使用固定等待且 full 套件应允许并发', async () => {
    const sourceFiles = [
      'tests/e2e/product-center-five-create-sop.spec.ts',
      'tests/e2e/product-center-recipe-core.generated.spec.ts',
      'tests/e2e/product-center-low-dependency-hybrid-sop.spec.ts',
      'tests/e2e/product-center-high-dependency-hybrid-sop.spec.ts',
      'tests/e2e/product-center-negative-sop.spec.ts',
      'pages/product-center/product-center-create-sop.page.ts',
      'pages/product-center/product-center-sop.page.ts',
      'pages/product-center/product-center-low-dependency-sop.page.ts',
      'pages/product-center/product-center-high-dependency-sop.page.ts',
    ].map((file) => fs.readFileSync(path.join(projectRoot, file), 'utf8'));
    expect(sourceFiles.join('\n')).not.toContain('waitForTimeout');
    expect(sourceFiles[3]).not.toContain('probeTimeout: 10_000');
    for (const source of sourceFiles.slice(0, 5)) expect(source).toContain("mode: 'parallel'");
  });

  test('Chrome 项目应支持可配置 worker 并复用 storageState', async () => {
    expect(playwrightConfig).toContain('storageState: appConfig.storageStatePath');
    expect(playwrightConfig).toContain('PW_WORKERS');
    expect(playwrightConfig).toContain('resolveMerchantCenterPlaywrightConcurrency');
    expect(authSetup).toContain('storageStatePath: appConfig.storageStatePath');
    expect(authFlow).toContain('input.browser.newContext({ storageState: storageStatePath })');
  });


  test('系统测试运行证据应识别生命周期附件并计算归因覆盖率', async () => {
    const reporterSource = fs.readFileSync(timingReporterPath, 'utf8');
    expect(reporterSource).toContain("attachment.name === 'system-test-runtime-evidence'");
    const timings = extractRuntimeLifecycleTimings({
      executionTimings: [
        { phase: 'initialize', id: 'initialize', durationMs: 1_000, status: 'passed' },
        { phase: 'capability', id: 'read', durationMs: 2_000, status: 'passed' },
      ],
    });
    expect(timings).toHaveLength(2);
    expect(calculateRuntimeLifecycleCoverage(4_000, timings ?? [])).toEqual({
      observedDurationMs: 3_000,
      unclassifiedDurationMs: 1_000,
      coveragePercent: 75,
    });
  });

  test('应生成逐用例与逐步骤耗时报告', async () => {
    expect(fs.existsSync(timingReporterPath)).toBe(true);
    expect(playwrightConfig).toContain('./reporters/product-center-timing.reporter.ts');
    const reporterSource = fs.readFileSync(timingReporterPath, 'utf8');
    expect(reporterSource).toContain('onTestEnd');
    expect(reporterSource).toContain('steps');
    expect(reporterSource).toContain('durationMs');
    expect(reporterSource).toContain('sanitizeStepTitle');
    expect(reporterSource).toContain('evaluateProductCenterPerformanceBudget');
    expect(reporterSource).toContain('performanceBudget');
    expect(reporterSource).not.toContain('title: step.title,');
  });

  test('业务 UI 运行应为条件等待配置独立脱敏遥测文件', async () => {
    expect(authSetup).toBeTruthy();
    const globalSetupSource = fs.readFileSync(path.join(projectRoot, 'tests/setup/global.setup.ts'), 'utf8');
    expect(globalSetupSource).toContain('TEST_WAIT_TELEMETRY_PATH');
    expect(globalSetupSource).toContain('product-center-waits-');
    expect(globalSetupSource).toContain('{pid}.jsonl');
    expect(globalSetupSource.indexOf('if (!apiOnly)')).toBeLessThan(globalSetupSource.indexOf('TEST_WAIT_TELEMETRY_PATH'));
  });

  test('耗时报告应对不同 Playwright 版本的 Fill 步骤统一脱敏', async () => {
    expect(sanitizeStepTitle('Fill "sensitive-value" getByRole(\'textbox\')')).toBe('Fill <redacted>');
    expect(sanitizeStepTitle('Fill getByLabel(\'名称\') with sensitive-value')).toBe('Fill <redacted>');
  });

  test('历史耗时报告净化命令应递归移除 Fill 输入值', async () => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'product-center-timing-'));
    const reportPath = path.join(rootDir, 'timing.json');
    try {
      fs.writeFileSync(reportPath, JSON.stringify({
        cases: [{ steps: [{
          title: '业务步骤',
          children: [{ title: 'Fill "sensitive-value" getByRole(\'textbox\')', children: [] }],
        }] }],
      }));

      expect(sanitizeProductCenterTimingReports(rootDir)).toBe(1);
      expect(fs.readFileSync(reportPath, 'utf8')).not.toContain('sensitive-value');
      expect(JSON.parse(fs.readFileSync(reportPath, 'utf8')).cases[0].steps[0].children[0].title)
        .toBe('Fill <redacted>');
    } finally {
      fs.rmSync(rootDir, { recursive: true, force: true });
    }
  });

  test('生成测试报告净化命令应递归处理任意 JSON 层级', async () => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'generated-test-report-'));
    const nestedDir = path.join(rootDir, 'nested');
    const reportPath = path.join(nestedDir, 'allure-result.json');
    try {
      fs.mkdirSync(nestedDir);
      fs.writeFileSync(reportPath, JSON.stringify({
        befores: [{ steps: [{ name: 'Fill "sensitive-value" getByLabel(\'Password\')' }] }],
      }));

      expect(sanitizeGeneratedTestReports(rootDir)).toBe(1);
      expect(fs.readFileSync(reportPath, 'utf8')).not.toContain('sensitive-value');
    } finally {
      fs.rmSync(rootDir, { recursive: true, force: true });
    }
  });

  test('生成测试报告净化应只处理本次运行后更新的文件', async () => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'generated-test-report-cutoff-'));
    const oldReportPath = path.join(rootDir, 'old-result.json');
    const currentReportPath = path.join(rootDir, 'current-result.json');
    try {
      fs.writeFileSync(oldReportPath, JSON.stringify({ name: 'Fill "old-value" getByLabel(\'Password\')' }));
      fs.writeFileSync(currentReportPath, JSON.stringify({ name: 'Fill "current-value" getByLabel(\'Password\')' }));
      fs.utimesSync(oldReportPath, new Date(1_000), new Date(1_000));
      fs.utimesSync(currentReportPath, new Date(3_000), new Date(3_000));

      expect(sanitizeGeneratedTestReports(rootDir, { modifiedAfterMs: 2_000 })).toBe(1);
      expect(fs.readFileSync(oldReportPath, 'utf8')).toContain('old-value');
      expect(fs.readFileSync(currentReportPath, 'utf8')).not.toContain('current-value');
    } finally {
      fs.rmSync(rootDir, { recursive: true, force: true });
    }
  });

  test('全局 teardown 应在敏感扫描前净化生成测试报告', async () => {
    expect(globalTeardown).toContain('sanitizeGeneratedTestReports');
    expect(globalTeardown.indexOf('sanitizeGeneratedTestReports'))
      .toBeLessThan(globalTeardown.indexOf('scanGeneratedArtifacts'));
    expect(globalTeardown).toContain('modifiedAfterMs');
    expect(globalTeardown).toContain('allure-playwright');
    expect(globalTeardown).toContain('PW_RUN_STARTED_AT');
  });


  test('高依赖删除 UI 验证不得等待已删除记录重新出现', async () => {
    expect(highDependencyPage).toContain('async openRoute(');
    expect(highDependencyPage).not.toContain('await this.open(sopCase, record).catch');
    expect(highDependencyPage).toContain('await this.openRoute(sopCase);');
  });


  test('登录态复用应等待明确三态而不是固定五秒判失效', async () => {
    expect(authFlow).toContain('waitUntil');
    expect(authFlow).toContain('bootstrapMerchantCenterSession');
    expect(authRuntime).not.toContain("isVisible({ timeout: 5_000 })");
  });

  test('商品列表索引等待应降低重复查询频率', async () => {
    const method = itemListPage.slice(itemListPage.indexOf('async waitForIndexedItem'), itemListPage.indexOf('@step', itemListPage.indexOf('async waitForIndexedItem') + 20));
    expect(method).toContain('createRefreshGatedProbe({');
    expect(method).toContain('refreshInterval: 5_000');
    expect(method).toContain('interval: 250');
  });

  test('菜单下发应按作业编号等待明确终态并记录 API 观测身份', async () => {
    expect(addonFlow).toContain("[3, 4, 5, 6].includes(Number(value?.data?.jobStatus))");
    expect(addonFlow).toContain("waitId: 'menu-sync-job-terminal'");
    expect(addonFlow).toContain("observation: { channel: 'api', operation: 'menu-sync-job-terminal' }");
  });

  test('高依赖页面定位器必须集中且所有动作必须有中文步骤', async () => {
    expect(highDependencyPage).toContain('readonly locators:');
    const actionSource = highDependencyPage.slice(highDependencyPage.indexOf("@step('打开高依赖实体页面"));
    expect(actionSource).not.toMatch(/this\.(?:main|page)\.(?:locator|getByText|getByRole)\(/);
    expect(highDependencyPage).toContain("@step('等待输入状态稳定至少二百毫秒')");
  });

  test('完整合同命令必须包含重试与秘密源合规测试', async () => {
    const contractCommand = packageJson.scripts['test:product-center:sop:contracts'];
    expect(contractCommand).toContain('tests/api/transient-retry.contract.spec.ts');
    expect(contractCommand).toContain('tests/api/secret-source.contract.spec.ts');
  });
});


