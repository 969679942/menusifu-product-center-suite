import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { productCenterRecipeCapabilityContracts } from '../../adapters/product-center/product-center-recipe-capabilities';
import {
  assertProductCenterCategoryLeafCommitted,
  assertProductCenterCategoryParentNotCommitted,
  assertProductCenterItemCategoryLeafProbeExecutionAuthorized,
  buildProductCenterItemCategoryLeafRecipe,
  isProductCenterCategoryProbeMutationRequest,
} from '../../utils/product-center-item-category-leaf-runtime';
import { buildProductCenterItemCategoryLeafRuntimeArtifacts } from '../../scripts/build-product-center-item-category-leaf-runtime';
import { buildProductCenterRuntimeEvidenceBundle } from '../../automation/recipe/product-center-runtime-evidence';

test.describe('商品分类叶子选择只读运行合同', () => {
  test('应从 canonical Claim 构建侧边栏首项且零写入的单用例 Recipe', async () => {
    const canonicalRelease = readJson<any>(
      'contracts/product-center/test-cases/canonical/product-center-item-canonical-release.json',
    );
    const canonicalCase = canonicalRelease.cases.find((item: any) => (
      item.canonicalId === 'TC-ITEM-STD-007'
    ));
    const proposal = readJson<any>(
      'output/test-case-audit/product-center/item-category-leaf-technical-proposal-latest.json',
    );

    const recipe = buildProductCenterItemCategoryLeafRecipe({
      canonicalCase,
      proposal,
      parentName: 'Special Offer(特惠)',
      leafName: 'Special Offer01(特惠1号)',
    });

    expect(recipe).toMatchObject({
      caseId: 'TC-ITEM-STD-007',
      action: 'read',
      route: '/pp/brand/list',
      generationAllowed: true,
    });
    expect(recipe.capabilities.map((item) => item.id)).toEqual([
      'navigation.sidebar.open',
      'item.openStandardCreate',
      'item.category.openCascader',
      'item.category.selectParentWithChildren',
      'item.category.selectLeaf',
    ]);
    expect(recipe.assertions.map((item) => item.adapterId)).toEqual([
      'productCenter.verifyCategoryParentNotCommitted',
      'productCenter.verifyCategoryLeafCommitted',
    ]);
    expect(recipe.claimIds).toEqual(canonicalCase.claimIds);
    expect(recipe).not.toHaveProperty('seed');
    expect(recipe).not.toHaveProperty('mutation');
    expect(recipe).not.toHaveProperty('cleanup');
  });

  test('一级分类提交或二级分类未提交时断言必须失败', async () => {
    expect(() => assertProductCenterCategoryParentNotCommitted({
      parentName: 'Parent',
      locatorCount: 1,
      visibleMenuCount: 2,
      selectedValueBefore: '',
      selectedValueAfter: 'Parent',
      childVisible: true,
    })).toThrow('一级分类不得成为最终已选值');

    expect(() => assertProductCenterCategoryLeafCommitted({
      parentName: 'Parent',
      leafName: 'Leaf',
      locatorCount: 1,
      selectedPath: 'Parent',
      menuClosed: true,
      mutationAttempted: false,
    })).toThrow('二级分类未成为最终已选值');
  });

  test('只读写请求门禁失败时应输出脱敏路径用于根因分析', async () => {
    expect(() => assertProductCenterCategoryLeafCommitted({
      parentName: 'Parent',
      leafName: 'Leaf',
      locatorCount: 1,
      selectedPath: 'Parent / Leaf',
      menuClosed: true,
      mutationAttempted: true,
      mutationRequestCount: 1,
      mutationPaths: ['POST /ops-brand/brand-items/pageQuery'],
    })).toThrow('POST /ops-brand/brand-items/pageQuery');
  });

  test('写请求分类应放行已观察的只读查询和遥测但阻断真实业务写入', async () => {
    expect(isProductCenterCategoryProbeMutationRequest(
      'POST',
      'https://api.example/item/v1/ops-brand/brand-items/pageQuery',
    )).toBe(false);
    expect(isProductCenterCategoryProbeMutationRequest(
      'POST',
      'https://telemetry.example/api/4510402003009537/envelope/',
    )).toBe(false);
    expect(isProductCenterCategoryProbeMutationRequest(
      'POST',
      'https://analytics.example/g/collect',
    )).toBe(false);
    expect(isProductCenterCategoryProbeMutationRequest(
      'POST',
      'https://api.example/item/v1/ops-brand/brand-items',
    )).toBe(true);
    expect(isProductCenterCategoryProbeMutationRequest(
      'PUT',
      'https://api.example/item/v1/ops-brand/brand-items/123',
    )).toBe(true);
    expect(isProductCenterCategoryProbeMutationRequest(
      'DELETE',
      'https://api.example/item/v1/ops-brand/brand-items/123',
    )).toBe(true);
  });

  test('四个只读 capability 必须注册且不接受写动作', async () => {
    const contracts = new Map(productCenterRecipeCapabilityContracts.map((item) => [item.id, item]));
    expect(contracts.get('item.openStandardCreate')).toMatchObject({ actions: ['read'] });
    expect(contracts.get('item.category.openCascader')).toMatchObject({ actions: ['read'] });
    expect(contracts.get('item.category.selectParentWithChildren')).toMatchObject({
      actions: ['read'],
      requiredInputs: ['parentName', 'leafName'],
    });
    expect(contracts.get('item.category.selectLeaf')).toMatchObject({
      actions: ['read'],
      requiredInputs: ['parentName', 'leafName'],
    });
  });

  test('专用 Page 与 Flow 不得使用索引、固定等待或业务路由直达', async () => {
    const pageSource = fs.readFileSync(path.resolve(
      'pages/product-center/product-center-item-category-leaf-probe.page.ts',
    ), 'utf8');
    const flowSource = fs.readFileSync(path.resolve(
      'flows/product-center/product-center-item-category-leaf-probe.flow.ts',
    ), 'utf8');
    for (const source of [pageSource, flowSource]) {
      expect(source).not.toMatch(/\.first\s*\(/);
      expect(source).not.toMatch(/\.nth\s*\(/);
      expect(source).not.toContain('waitForTimeout');
      expect(source).not.toMatch(/page\.goto\s*\(/);
    }
    expect(pageSource).toContain("page.locator('#category')");
    expect(flowSource).toContain("brand-categories\\/treeList");
  });

  test('应从脱敏页面观察合同构建独立单例产物且网络保持运行时待证', async () => {
    const outputRoot = fs.mkdtempSync(path.join(
      process.env.TEMP ?? process.cwd(),
      'item-category-leaf-runtime-',
    ));
    try {
      const result = buildProductCenterItemCategoryLeafRuntimeArtifacts({
        projectRoot: process.cwd(),
        outputRoot,
      });
      const document = JSON.parse(fs.readFileSync(result.recipesPath, 'utf8'));
      const observation = readJson<any>(
        'contracts/product-center/drift/product-center-item-category-leaf-probe-observation.json',
      );
      expect(document.collectionId).toBe('product-center-item-category-leaf-probe');
      expect(document.recipes).toHaveLength(1);
      expect(document.recipes[0].caseId).toBe('TC-ITEM-STD-007');
      expect(observation).toMatchObject({
        status: 'observed-for-runtime-probe',
        network: {
          status: 'runtime-required',
          expectedPath: '/ops-brand/brand-categories/treeList',
        },
        mutation: { attempted: false },
      });
      expect(JSON.stringify(observation)).not.toContain('#category');
      expect(JSON.stringify(document)).not.toMatch(/"(selector|locator|xpath|css)"\s*:/i);
    } finally {
      fs.rmSync(outputRoot, { recursive: true, force: true });
    }
  });

  test('runtime-accepted proposal 必须允许离线重建但拒绝 UI 重放', async () => {
    const proposal = readJson<any>(
      'output/test-case-audit/product-center/item-category-leaf-technical-proposal-latest.json',
    );

    expect(proposal.status).toBe('runtime-accepted');
    expect(() => assertProductCenterItemCategoryLeafProbeExecutionAuthorized(proposal))
      .toThrow('TC-ITEM-STD-007 只读 Probe 已完成并锁止重放');
  });

  test('专用 generated spec、runner 和 acceptance 必须保持单例边界', async () => {
    const specSource = fs.readFileSync(path.resolve(
      'tests/generated/product-center-item-category-leaf-probe.generated.spec.ts',
    ), 'utf8');
    expect(specSource).toContain('attachRuntimeEvidence');
    expect(specSource).toContain('stopProductCenterItemCategoryLeafMutationTracking');
    expect(specSource).not.toMatch(/page\.goto\s*\(/);
    expect(specSource).not.toContain('waitForTimeout');
    expect(specSource).not.toMatch(/\.(locator|getByRole|click|fill)\s*\(/);

    const runnerSource = fs.readFileSync(path.resolve(
      'scripts/run-product-center-item-category-leaf-probe.ts',
    ), 'utf8');
    expect(runnerSource).toContain('assertProductCenterItemCategoryLeafProbeExecutionAuthorized');
    expect(runnerSource).toContain('repeatEach: 1');
    expect(runnerSource).toContain('workers: 1');
    expect(runnerSource).not.toContain('test-plan-gold-set');
    expect(runnerSource).not.toContain('product-center-pilot');

    const acceptanceSource = fs.readFileSync(path.resolve(
      'scripts/build-product-center-item-category-leaf-runtime-acceptance.ts',
    ), 'utf8');
    expect(acceptanceSource).toContain("collectionId: 'product-center-item-category-leaf-probe'");
  });

  test('通用 runtime evidence 应准确提取分类可见性、唯一性、网络和零写入结果', async () => {
    const evidence = buildProductCenterRuntimeEvidenceBundle({
      recipeId: 'product-center:item-category-leaf:TC-ITEM-STD-007',
      caseId: 'TC-ITEM-STD-007',
      environmentId: 'contract-test',
      brandId: 'redacted-brand',
      screenshotAttachmentName: 'visible-ui',
      results: {
        navigation: {
          mode: 'sidebar',
          targetPath: '/pp/brand/list',
          arrivedPath: '/pp/brand/list',
          verifiedPaths: ['/pp/brand/list'],
        },
        standardCreate: {
          responseMethod: 'GET',
          responsePath: '/ops-brand/brand-categories/treeList',
          responseStatus: 200,
          categoryRequestCompleted: true,
          arrivedPath: '/pp/brand/create/standard',
        },
        categoryMenu: {
          fieldLocatorCount: 1,
          cascaderLocatorCount: 1,
          visibleMenuCount: 1,
        },
        categoryParent: {
          parentName: 'Parent',
          locatorCount: 1,
          visibleMenuCount: 2,
          selectedValueBefore: '',
          selectedValueAfter: '',
          childVisible: true,
        },
        categoryLeaf: {
          parentName: 'Parent',
          leafName: 'Leaf',
          locatorCount: 1,
          selectedPath: 'Parent / Leaf',
          menuClosed: true,
          mutationAttempted: false,
          mutationRequestCount: 0,
          mutationPaths: [],
        },
      },
    });

    expect(evidence.visibleUi).toEqual({
      route: '/pp/brand/create/standard',
      categoryFieldVisible: true,
      parentNotCommitted: true,
      leafCommitted: true,
      selectedPath: 'Parent / Leaf',
    });
    expect(evidence.locatorUniqueness).toEqual({
      categoryFieldCount: 1,
      categoryCascaderCount: 1,
      parentNodeCount: 1,
      leafNodeCount: 1,
    });
    expect(evidence.network).toEqual({
      method: 'GET',
      operation: '/ops-brand/brand-categories/treeList',
      status: 200,
      requestCount: 1,
    });
    expect(evidence.api).toEqual({
      responseShape: ['category-tree'],
      beforeEqualsAfter: true,
      mutationRequestCount: 0,
    });
  });
});

function readJson<T>(relativePath: string): T {
  return JSON.parse(fs.readFileSync(path.resolve(relativePath), 'utf8')) as T;
}
