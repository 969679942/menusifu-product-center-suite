import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';

const projectRoot = path.resolve(__dirname, '../..');
const workspaceRoot = path.resolve(projectRoot, '..');
const platformRoot = path.resolve(workspaceRoot, '..', 'Test Automation Platform');

test.describe('商品中心公共测试平台适配合同', () => {
  test('公共实现和公共交付物必须位于商品中心目录外', async () => {
    expect(fs.existsSync(path.join(platformRoot, 'src/index.ts'))).toBe(true);
    expect(fs.existsSync(path.join(platformRoot, 'scripts/run-system-test.ts'))).toBe(true);
    const publicArtifacts = path.join(platformRoot, 'deliverables/system-test-platform');
    expect(!fs.existsSync(publicArtifacts) || fs.readdirSync(publicArtifacts).length === 0).toBe(true);
    expect(fs.existsSync(path.join(projectRoot, 'deliverables/system-test-platform'))).toBe(true);
    expect(fs.existsSync(path.join(projectRoot, 'adapters/test-automation-platform/reports'))).toBe(true);
    expect(fs.existsSync(path.join(workspaceRoot, 'deliverables/system-test-platform'))).toBe(false);
  });

  test('商品中心项目适配描述必须绑定自己的产物身份', async () => {
    const descriptor = JSON.parse(fs.readFileSync(
      path.join(projectRoot, 'adapters/test-automation-platform/project-adapter.json'),
      'utf8',
    ));
    const identity = JSON.parse(fs.readFileSync(
      path.join(projectRoot, 'deliverables/system-test-platform/artifact-manifest.json'),
      'utf8',
    ));
    expect(identity).toMatchObject({
      applicationId: descriptor.applicationId,
      projectId: descriptor.projectId,
      artifactRoot: descriptor.artifactRoot,
    });
    expect(descriptor.lifecycle).toMatchObject({
      schemaVersion: '1.0.0',
      businessDomainId: 'product-center',
      referenceClosureAuditPath: 'deliverables/test-plan-governance/product-center-closure-audit.json',
      referenceModule: '商品管理-组',
    });
    expect(descriptor.lifecycle.governanceFiles).toContainEqual({
      root: 'workspace',
      path: 'Merchant Center API/api-lifecycle-registry.json',
    });
    const packageJson = JSON.parse(fs.readFileSync(path.join(projectRoot, 'package.json'), 'utf8'));
    expect(packageJson.scripts['close:test-platform:migration']).toBe(
      'tsx "../../Test Automation Platform/scripts/run-project-lifecycle.ts" --project-root=. --action=close',
    );
    const pathAdapterSource = fs.readFileSync(
      path.join(projectRoot, 'utils/system-test-platform-paths.ts'),
      'utf8',
    );
    expect(pathAdapterSource).not.toContain('initializeSystemTestArtifactIdentity');
    const lifecycleCommands = {
      'build:system-test:readiness': 'readiness',
      'build:system-test:review-queue': 'review',
      'assert:system-test:final-goal': 'strict',
      'close:test-platform:migration': 'close',
    };
    for (const [command, action] of Object.entries(lifecycleCommands)) {
      expect(packageJson.scripts[command], command).toContain(
        `../../Test Automation Platform/scripts/run-project-lifecycle.ts\" --project-root=. --action=${action}`,
      );
    }
  });

  test('商品中心包命令必须直接调用公共平台入口', async () => {
    const packageJson = JSON.parse(fs.readFileSync(path.join(projectRoot, 'package.json'), 'utf8')) as {
      scripts: Record<string, string>;
    };
    const commands = [
      'scaffold:system-test',
      'compile:system-test-plan',
      'build:system-test',
      'test:system',
      'flow:system-test',
      'verify:system-test-reference',
    ];
    for (const command of commands) {
      expect(packageJson.scripts[command], command).toContain('../../Test Automation Platform/scripts/');
      expect(packageJson.scripts[command], command).toMatch(/^tsx "\.\.\/\.\.\/Test Automation Platform\/scripts\//);
    }
  });

  test('商品中心运行适配器必须把全量回归与整改门禁互斥分流', async () => {
    const source = fs.readFileSync(path.join(projectRoot, 'scripts/run-merchant-system-test.ts'), 'utf8');
    expect(source).toContain('if (fullRegression && (optimizationPlanPath || optimizationStage)) throw new Error(\'FULL_REGRESSION_OPTIMIZATION_MIXED\')');
    expect(source).toContain('if (!fullRegression && !optimizationPlanPath) throw new Error(\'OPTIMIZATION_PLAN_REQUIRED\')');
    expect(source).toContain('optimizationPlanPath: fullRegression ? undefined : optimizationPlanPath');
    expect(source).toContain('optimizationStage: fullRegression ? undefined : optimizationStage');
  });

  test('商品中心保留的 system-test 文件只能是公共实现兼容桥', async () => {
    const bridgeRoot = path.join(projectRoot, 'automation/system-test');
    const violations = fs.readdirSync(bridgeRoot)
      .filter((fileName) => fileName.endsWith('.ts'))
      .filter((fileName) => {
        const source = fs.readFileSync(path.join(bridgeRoot, fileName), 'utf8').trim();
        return !/^export \* from ['"]\.\.\/\.\.\/\.\.\/\.\.\/Test Automation Platform\/src\/automation\/system-test\/[a-z0-9-]+['"];?$/.test(source);
      });
    expect(violations).toEqual([]);
  });

  test('商品中心 Recipe 公共能力必须委托公共平台，领域能力仍留在商品中心', async () => {
    const genericBridges = [
      'automation-recipe.ts',
      'capability-registry.ts',
      'recipe-feedback.ts',
      'recipe-validator.ts',
      'sidebar-navigation-capability.ts',
    ];
    for (const fileName of genericBridges) {
      const source = fs.readFileSync(path.join(projectRoot, 'automation/recipe', fileName), 'utf8');
      expect(source, fileName).toContain('../../../Test Automation Platform/src/automation/recipe/');
      expect(source.trim().split(/\r?\n/).length, fileName).toBe(1);
    }
    expect(fs.existsSync(path.join(projectRoot, 'automation/recipe/product-center-recipe-compiler.ts'))).toBe(true);
    expect(fs.existsSync(path.join(projectRoot, 'adapters/product-center/product-center-recipe-capabilities.ts'))).toBe(true);
  });

  test('验收和流程治理公共能力必须委托公共平台', async () => {
    const acceptanceBridges = [
      'acceptance-manifest.ts',
      'acceptance-orchestrator.ts',
      'playwright-route-probe.ts',
      'redaction.ts',
      'route-residue-scanner.ts',
      'route-scan-checkpoint.ts',
    ];
    for (const fileName of acceptanceBridges) {
      const source = fs.readFileSync(path.join(projectRoot, 'utils/acceptance', fileName), 'utf8').trim();
      expect(source, fileName).toMatch(/^export \* from ['"]\.\.\/\.\.\/\.\.\/\.\.\/Test Automation Platform\/src\/acceptance\/[a-z0-9-]+['"];?$/);
    }

    const processBridges = [
      'api-lifecycle.ts',
      'allure-result-retention.ts',
      'contract-change-impact.ts',
      'incremental-test-plan.ts',
      'review-batch.ts',
      'runtime-audit-correction-from-receipt.ts',
    ];
    for (const fileName of processBridges) {
      const source = fs.readFileSync(path.join(projectRoot, 'utils', fileName), 'utf8').trim();
      if (fileName === 'api-lifecycle.ts') {
        expect(source).toContain('Test Automation Platform/src/governance/api-lifecycle');
        continue;
      }
      expect(source, fileName).toMatch(/^export \* from ['"]\.\.\/\.\.\/\.\.\/Test Automation Platform\/src\/utils\/[a-z0-9-]+['"];?$/);
    }

    const projectType = fs.readFileSync(path.join(projectRoot, 'acceptance/projects/acceptance-project.ts'), 'utf8');
    expect(projectType).toContain('Test Automation Platform/src/acceptance/acceptance-project');
    expect(projectType).toContain('PlatformAcceptanceProject<Browser, BrowserContext>');
  });

  test('公共平台重复副本不得回流商品中心', async () => {
    const removedPaths = [
      'scripts/build-system-test-contract.ts',
      'scripts/compile-system-test-plan.ts',
      'scripts/run-system-test-flow.ts',
      'scripts/run-system-test.ts',
      'scripts/scaffold-system-test.ts',
      'scripts/verify-system-test-reference.ts',
      'reporters/system-test-evidence.reporter.ts',
      'tests/api/system-test-platform.contract.spec.ts',
      'tests/api/test-platform-flow.contract.spec.ts',
      'tests/api/system-test-governance.contract.spec.ts',
      'tests/api/reusable-acceptance-core.contract.spec.ts',
      'tests/api/reusable-route-residue-scanner.contract.spec.ts',
      'scripts/build-system-test-platform-readiness.ts',
      'scripts/build-system-test-platform-review-queue.ts',
      'scripts/assert-system-test-final-goal.ts',
      'scripts/close-test-platform-migration.ts',
    ];
    expect(removedPaths.filter((relativePath) => fs.existsSync(path.join(projectRoot, relativePath)))).toEqual([]);
  });
});
