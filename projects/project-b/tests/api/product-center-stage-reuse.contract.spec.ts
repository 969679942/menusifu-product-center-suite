import { expect, test } from '@playwright/test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  evaluateProductCenterStageReuse,
  fingerprintProductCenterStageInputs,
} from '../../utils/product-center-runtime-reuse';
import { buildProductCenterReleaseEvidence } from '../../utils/product-center-release-evidence';

test.describe('商品中心阶段输入指纹与运行证据复用合同', () => {
  test('调味适配器应按目标路由预检并写入可复用阶段收据', () => {
    const preflight = fs.readFileSync(
      path.resolve('systems/merchant-center-product-center-seasoning/tests/preflight.spec.ts'),
      'utf8',
    );
    const setup = fs.readFileSync(
      path.resolve('systems/merchant-center-product-center-seasoning/tests/setup.spec.ts'),
      'utf8',
    );
    expect(preflight).toContain('SYSTEM_TEST_PREFLIGHT_ROUTE');
    expect(preflight).toContain('executeReadOnlyUiWithTransientRetry');
    expect(preflight).toContain('openPreflightRoute(route, executionContextProfile)');
    expect(preflight).toContain('writePassedSystemTestStageReceiptFromEnvironment');
    expect(preflight).not.toContain('openCreate()');
    const pageObject = fs.readFileSync(
      path.resolve('pages/product-center/seasoning-boundary.page.ts'),
      'utf8',
    );
    expect(pageObject).toContain("route === '/pp/brand/seasoning/list'");
    expect(pageObject).toContain("route === '/pp/brand/seasoning/record'");
    expect(pageObject).toContain("route === '/pp/brand/seasoning/template'");
    expect(pageObject).toContain("route === '/poi/location/seasoning'");
    expect(pageObject).toContain("executionContextProfile === 'single-store-000407'");
    expect(pageObject).toContain('terminal.forbidden');
    expect(setup).toContain('writePassedSystemTestStageReceiptFromEnvironment({ storageStatePath })');
  });

  test('调味业务初始化重试覆盖完整页面终态且操作证据保留真实 HTTP 方法', () => {
    const systemSpec = fs.readFileSync(
      path.resolve('systems/merchant-center-product-center-seasoning/tests/system.spec.ts'),
      'utf8',
    );
    expect(systemSpec).toContain('await executeReadOnlyUiWithTransientRetry(async () => {');
    expect(systemSpec).toContain("operationKey.match(/:(GET|POST|PUT|PATCH|DELETE)\\s/)?.[1] ?? 'UI'");
    expect(systemSpec).toContain('restoredIdentity');
  expect(systemSpec).toContain('retainedOptionName');
  expect(systemSpec).toContain('collectTemplateOptionNames');
  });

  test('调味上下文由公共批次 profile 驱动且瞬时认证失败不得删除登录态', () => {
    const context = fs.readFileSync(path.resolve('test-data/seasoning-context.ts'), 'utf8');
    const auth = fs.readFileSync(path.resolve('flows/auth.flow.ts'), 'utf8');
    expect(context).toContain('SYSTEM_TEST_EXECUTION_CONTEXT_PROFILE');
    expect(auth).toContain("result.status === 'transient'");
    expect(auth).toContain('executeReadOnlyUiWithTransientRetry(async () =>');
    expect(auth.indexOf('REUSABLE_SESSION_VERIFICATION_TRANSIENT')).toBeLessThan(auth.indexOf('fs.rmSync(storageStatePath'));
  });

  test('阶段指纹只由稳定输入内容决定，不受 generatedAt 或输出文件影响', async () => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pc-stage-fingerprint-'));
    try {
      writeFixture(rootDir, 'spec.ts', 'export const value = 1;');
      writeFixture(rootDir, 'recipes.json', JSON.stringify({ recipes: [{ caseId: 'case-a' }] }));
      const first = fingerprintProductCenterStageInputs({
        rootDir,
        stage: 'main-ui',
        recipesPath: 'recipes.json',
        specPath: 'spec.ts',
        sourcePaths: ['package.json'],
      });
      writeFixture(rootDir, 'output/generated-at.json', JSON.stringify({ generatedAt: new Date().toISOString() }));
      const second = fingerprintProductCenterStageInputs({
        rootDir,
        stage: 'main-ui',
        recipesPath: 'recipes.json',
        specPath: 'spec.ts',
        sourcePaths: ['package.json'],
      });
      expect(second.fingerprint).toBe(first.fingerprint);
      expect(second.files).not.toContain('output/generated-at.json');

      writeFixture(rootDir, 'spec.ts', 'export const value = 2;');
      const changed = fingerprintProductCenterStageInputs({
        rootDir,
        stage: 'main-ui',
        recipesPath: 'recipes.json',
        specPath: 'spec.ts',
        sourcePaths: ['package.json'],
      });
      expect(changed.fingerprint).not.toBe(first.fingerprint);
    } finally {
      fs.rmSync(rootDir, { recursive: true, force: true });
    }
  });

  test('只有输入指纹、完整 acceptance、路由 release freshness 都通过时才允许复用', async () => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pc-stage-reuse-'));
    try {
      const release = buildProductCenterReleaseEvidence({
        environmentId: 'qa',
        baseURL: 'https://merchant.example.test',
        runId: 'probe-run',
        observedAt: '2026-07-28T12:00:00.000Z',
        pageSignals: {
          title: 'Merchant Center',
          language: 'en',
          meta: { version: 'build-1' },
          resourcePaths: ['/assets/core.js', '/assets/app.js', '/assets/page.js'],
        },
      });
      writeFixture(rootDir, 'recipes.json', JSON.stringify({ recipes: [{
        id: 'recipe:case-a',
        caseId: 'case-a',
        route: '/route/a',
      }] }));
      writeFixture(rootDir, 'spec.ts', 'export const value = 1;');
      writeFixture(rootDir, 'output/evidence.json', JSON.stringify({
        runId: 'runtime-run',
        scope: 'full',
        entries: [{ recipeId: 'recipe:case-a', caseId: 'case-a', release }],
      }));
      writeFixture(rootDir, 'output/acceptance.json', JSON.stringify({
        accepted: true,
        scope: 'full',
        acceptedCaseIds: ['case-a'],
        stageInputFingerprint: fingerprintProductCenterStageInputs({
          rootDir,
          stage: 'main-ui',
          recipesPath: 'recipes.json',
          specPath: 'spec.ts',
          sourcePaths: ['package.json'],
        }).fingerprint,
      }));
      writeFixture(rootDir, 'output/current-release.json', JSON.stringify({
        release,
        routes: [{ route: '/route/a', release }],
      }));

      const reusable = evaluateProductCenterStageReuse({
        rootDir,
        stage: 'main-ui',
        collectionId: 'product-center-pilot',
        recipesPath: 'recipes.json',
        specPath: 'spec.ts',
        acceptancePath: 'output/acceptance.json',
        evidencePath: 'output/evidence.json',
        currentReleaseProbePath: 'output/current-release.json',
        sourcePaths: ['package.json'],
        now: '2026-07-28T12:05:00.000Z',
        maxAgeMs: 60 * 60 * 1000,
      });
      expect(reusable).toMatchObject({ reusable: true, reason: 'stage-input-and-release-freshness-match' });

      writeFixture(rootDir, 'spec.ts', 'export const value = 2;');
      expect(evaluateProductCenterStageReuse({
        rootDir,
        stage: 'main-ui',
        collectionId: 'product-center-pilot',
        recipesPath: 'recipes.json',
        specPath: 'spec.ts',
        acceptancePath: 'output/acceptance.json',
        evidencePath: 'output/evidence.json',
        currentReleaseProbePath: 'output/current-release.json',
        sourcePaths: ['package.json'],
        now: '2026-07-28T12:05:00.000Z',
        maxAgeMs: 60 * 60 * 1000,
      })).toMatchObject({ reusable: false, reason: 'stage-input-fingerprint-mismatch' });
    } finally {
      fs.rmSync(rootDir, { recursive: true, force: true });
    }
  });

  test('运行证据包含路由懒加载资源时应按聚合 application release 判断同一版本', async () => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pc-stage-lineage-'));
    try {
      const base = {
        environmentId: 'qa',
        baseURL: 'https://merchant.example.test',
        runId: 'probe-run',
        observedAt: '2026-07-28T12:00:00.000Z',
        pageSignals: {
          title: 'Merchant Center',
          language: 'en',
          meta: { version: 'build-1' },
        },
      } as const;
      const aggregate = buildProductCenterReleaseEvidence({
        ...base,
        pageSignals: { ...base.pageSignals, resourcePaths: ['/assets/core.js', '/assets/app.js', '/assets/common.js'] },
      });
      const route = buildProductCenterReleaseEvidence({
        ...base,
        pageSignals: { ...base.pageSignals, resourcePaths: ['/assets/core.js', '/assets/app.js', '/assets/common.js', '/assets/route.js'] },
      });
      const runtime = buildProductCenterReleaseEvidence({
        ...base,
        pageSignals: { ...base.pageSignals, resourcePaths: ['/assets/core.js', '/assets/app.js', '/assets/common.js', '/assets/route.js', '/assets/lazy.js'] },
      });
      writeFixture(rootDir, 'recipes.json', JSON.stringify({ recipes: [{ id: 'recipe:case-a', caseId: 'case-a', route: '/route/a' }] }));
      writeFixture(rootDir, 'spec.ts', 'export const value = 1;');
      writeFixture(rootDir, 'output/evidence.json', JSON.stringify({ runId: 'runtime-run', scope: 'full', entries: [{ recipeId: 'recipe:case-a', caseId: 'case-a', release: runtime }] }));
      writeFixture(rootDir, 'output/acceptance.json', JSON.stringify({ accepted: true, scope: 'full', acceptedCaseIds: ['case-a'], stageInputFingerprint: fingerprintProductCenterStageInputs({ rootDir, stage: 'main-ui', recipesPath: 'recipes.json', specPath: 'spec.ts', sourcePaths: ['package.json'] }).fingerprint }));
      writeFixture(rootDir, 'output/current-release.json', JSON.stringify({ release: aggregate, routes: [{ route: '/route/a', release: route }] }));

      expect(evaluateProductCenterStageReuse({
        rootDir,
        stage: 'main-ui',
        collectionId: 'product-center-pilot',
        recipesPath: 'recipes.json',
        specPath: 'spec.ts',
        acceptancePath: 'output/acceptance.json',
        evidencePath: 'output/evidence.json',
        currentReleaseProbePath: 'output/current-release.json',
        sourcePaths: ['package.json'],
        now: '2026-07-28T12:05:00.000Z',
        maxAgeMs: 60 * 60 * 1000,
      })).toMatchObject({ reusable: true });
    } finally {
      fs.rmSync(rootDir, { recursive: true, force: true });
    }
  });

  test('探针与完整运行各自新增懒加载资源但保留公共核心资源时应复用', async () => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pc-stage-symmetric-lineage-'));
    try {
      const base = {
        environmentId: 'qa',
        baseURL: 'https://merchant.example.test',
        runId: 'runtime-run',
        observedAt: '2026-07-28T12:00:00.000Z',
        pageSignals: {
          title: 'Merchant Center',
          language: 'en',
          meta: { version: 'build-1' },
        },
      } as const;
      const runtime = buildProductCenterReleaseEvidence({
        ...base,
        pageSignals: { ...base.pageSignals, resourcePaths: ['/assets/core.js', '/assets/app.js', '/assets/common.js', '/assets/route.js'] },
      });
      const current = buildProductCenterReleaseEvidence({
        ...base,
        runId: 'probe-run',
        pageSignals: { ...base.pageSignals, resourcePaths: ['/assets/core.js', '/assets/app.js', '/assets/common.js', '/assets/probe.js'] },
      });
      writeFixture(rootDir, 'recipes.json', JSON.stringify({ recipes: [{ id: 'recipe:case-a', caseId: 'case-a', route: '/route/a' }] }));
      writeFixture(rootDir, 'spec.ts', 'export const value = 1;');
      writeFixture(rootDir, 'output/evidence.json', JSON.stringify({ runId: 'runtime-run', scope: 'full', entries: [{ recipeId: 'recipe:case-a', caseId: 'case-a', release: runtime }] }));
      writeFixture(rootDir, 'output/acceptance.json', JSON.stringify({ accepted: true, scope: 'full', acceptedCaseIds: ['case-a'], stageInputFingerprint: fingerprintProductCenterStageInputs({ rootDir, stage: 'main-ui', recipesPath: 'recipes.json', specPath: 'spec.ts', sourcePaths: ['package.json'] }).fingerprint }));
      writeFixture(rootDir, 'output/current-release.json', JSON.stringify({ release: current, routes: [{ route: '/route/a', release: current }] }));

      expect(evaluateProductCenterStageReuse({
        rootDir,
        stage: 'main-ui',
        collectionId: 'product-center-pilot',
        recipesPath: 'recipes.json',
        specPath: 'spec.ts',
        acceptancePath: 'output/acceptance.json',
        evidencePath: 'output/evidence.json',
        currentReleaseProbePath: 'output/current-release.json',
        sourcePaths: ['package.json'],
        now: '2026-07-28T12:05:00.000Z',
        maxAgeMs: 60 * 60 * 1000,
      })).toMatchObject({ reusable: true });
    } finally {
      fs.rmSync(rootDir, { recursive: true, force: true });
    }
  });

  test('缺失、过期或路由 release 不一致时必须 fail-closed', async () => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pc-stage-freshness-'));
    try {
      writeFixture(rootDir, 'recipes.json', JSON.stringify({ recipes: [{ id: 'recipe:case-a', caseId: 'case-a', route: '/route/a' }] }));
      writeFixture(rootDir, 'spec.ts', 'export const value = 1;');
      const current = buildProductCenterReleaseEvidence({
        environmentId: 'qa',
        baseURL: 'https://merchant.example.test',
        runId: 'probe-run',
        observedAt: '2026-07-28T12:00:00.000Z',
        pageSignals: { title: 'Merchant Center', language: 'en', meta: { version: 'build-1' }, resourcePaths: ['/a.js', '/b.js', '/c.js'] },
      });
      writeFixture(rootDir, 'output/evidence.json', JSON.stringify({ runId: 'runtime-run', scope: 'full', entries: [{ recipeId: 'recipe:case-a', caseId: 'case-a', release: current }] }));
      writeFixture(rootDir, 'output/acceptance.json', JSON.stringify({ accepted: true, scope: 'full', acceptedCaseIds: ['case-a'], stageInputFingerprint: fingerprintProductCenterStageInputs({ rootDir, stage: 'main-ui', recipesPath: 'recipes.json', specPath: 'spec.ts', sourcePaths: ['package.json'] }).fingerprint }));

      expect(evaluateProductCenterStageReuse({
        rootDir, stage: 'main-ui', collectionId: 'product-center-pilot', recipesPath: 'recipes.json', specPath: 'spec.ts', acceptancePath: 'output/acceptance.json', evidencePath: 'output/evidence.json', currentReleaseProbePath: 'missing.json', sourcePaths: ['package.json'], now: '2026-07-28T12:05:00.000Z', maxAgeMs: 60 * 60 * 1000,
      })).toMatchObject({ reusable: false, reason: 'current-release-probe-missing' });

      writeFixture(rootDir, 'output/current-release.json', JSON.stringify({ release: current, routes: [{ route: '/route/a', release: current }] }));
      expect(evaluateProductCenterStageReuse({
        rootDir, stage: 'main-ui', collectionId: 'product-center-pilot', recipesPath: 'recipes.json', specPath: 'spec.ts', acceptancePath: 'output/acceptance.json', evidencePath: 'output/evidence.json', currentReleaseProbePath: 'output/current-release.json', sourcePaths: ['package.json'], now: '2026-07-28T14:05:00.000Z', maxAgeMs: 60 * 60 * 1000,
      })).toMatchObject({ reusable: false, reason: 'runtime-evidence-not-fresh' });
    } finally {
      fs.rmSync(rootDir, { recursive: true, force: true });
    }
  });
});

function writeFixture(rootDir: string, relativePath: string, value: string): void {
  const filePath = path.join(rootDir, relativePath);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, value, 'utf8');
}
