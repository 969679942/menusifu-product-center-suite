import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import {
  generateProductCenterRecipeSpec,
  generateProductCenterTestPlanGoldSetRecipeSpec,
  renderProductCenterRecipeSpec,
} from '../../scripts/generate-product-center-recipe-spec';

test.describe('商品中心 Recipe 薄 Spec 生成器合同', () => {
  test('生成源码应仅参数化调用通用 Flow', async () => {
    const source = renderProductCenterRecipeSpec();

    expect(source).toContain("test.describe('商品中心 Recipe 编译试点'");
    expect(source).toContain('flow.execute(recipe)');
    expect(source).toContain('createProductCenterRecipeFlowPort');
    expect(source).toContain('beforeCleanup');
    expect(source).toContain('collectProductCenterSettledBrowserContractSignals');
    expect(source).toContain("testInfo.attach('product-center-runtime-evidence'");
    expect(source).toContain('capabilityIds: recipe.capabilities.map');
    expect(source).toContain('assertionAdapterIds: recipe.assertions.map');
    expect(source).toContain('verifiedClaimIds: context.verifiedClaimIds');
    expect(source).toContain('claimVerification: context.claimVerification');
    expect(source).not.toMatch(/\.locator\(|getByRole\(|\.click\(|\.fill\(|switch\s*\(|if\s*\(/);
  });

  test('生成文件应确定写入 tests generated 目录', async () => {
    const rootDir = await mkdtemp(path.join(os.tmpdir(), 'product-center-recipe-spec-'));
    try {
      const firstPath = await generateProductCenterRecipeSpec(rootDir);
      const first = await readFile(firstPath, 'utf8');
      const secondPath = await generateProductCenterRecipeSpec(rootDir);
      const second = await readFile(secondPath, 'utf8');

      expect(firstPath).toBe(path.join(rootDir, 'tests', 'generated', 'product-center-recipe-pilot.generated.spec.ts'));
      expect(secondPath).toBe(firstPath);
      expect(second).toBe(first);
    } finally {
      await rm(rootDir, { recursive: true, force: true });
    }
  });

  test('金标集生成文件应复用通用 Flow 并指向金标 Recipe', async () => {
    const rootDir = await mkdtemp(path.join(os.tmpdir(), 'product-center-gold-set-spec-'));
    try {
      const filePath = await generateProductCenterTestPlanGoldSetRecipeSpec(rootDir);
      const source = await readFile(filePath, 'utf8');

      expect(filePath).toBe(path.join(
        rootDir,
        'tests',
        'generated',
        'product-center-test-plan-gold-set.generated.spec.ts',
      ));
      expect(source).toContain("test.describe('商品中心真实测试方案金标集'");
      expect(source).toContain('product-center-test-plan-gold-set-recipes.json');
      expect(source).toContain('flow.execute(recipe)');
      expect(source).toContain('beforeCleanup');
      expect(source).not.toMatch(/\.locator\(|getByRole\(|\.click\(|\.fill\(|page\.goto\(|waitForTimeout\(/);
    } finally {
      await rm(rootDir, { recursive: true, force: true });
    }
  });
});
