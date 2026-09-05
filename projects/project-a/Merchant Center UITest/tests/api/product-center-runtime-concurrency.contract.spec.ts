import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import type { AutomationRecipe } from '../../automation/recipe/automation-recipe';
import { productCenterRecipeResourceKeys } from '../../automation/recipe/product-center-gold-run-optimization';
import { resolveMerchantCenterPlaywrightConcurrency } from '../../adapters/test-automation-platform/playwright-concurrency';

test.describe('商品中心运行时并发适配合同', () => {
  test('只读用例不得占用写资源锁，写入用例必须按路由和实体隔离', async () => {
    const readOnly = recipe('case-read');
    const mutation = {
      ...recipe('case-write'),
      mutation: { method: 'POST' as const, operationKey: 'seasoning:create' },
    };

    expect(productCenterRecipeResourceKeys(readOnly)).toEqual([
      'route:/pp/brand/seasoning/list',
    ]);
    expect(productCenterRecipeResourceKeys(mutation)).toEqual([
      'entity:seasoning',
      'route:/pp/brand/seasoning/list',
      'seasoning:write',
    ]);
  });

  test('调味系统必须启用文件级并发并在每条 Recipe 外层持有资源锁', async () => {
    const configSource = fs.readFileSync(path.resolve(
      'systems/merchant-center-product-center-seasoning/playwright.config.ts',
    ), 'utf8');
    const specSource = fs.readFileSync(path.resolve(
      'systems/merchant-center-product-center-seasoning/tests/system.spec.ts',
    ), 'utf8');
    const manifest = JSON.parse(fs.readFileSync(path.resolve(
      'systems/merchant-center-product-center-seasoning/manifest.json',
    ), 'utf8')) as { execution: { workers: number } };

    expect(configSource).toContain('fullyParallel: true');
    expect(specSource).toContain("test.describe.configure({ mode: 'parallel' })");
    expect(specSource).toContain('withProductCenterRecipeResourceLocks(recipe');
    expect(manifest.execution.workers).toBe(2);
  });

  test('商品中心请求值不得突破机器能力和适配器上限', async () => {
    const decision = resolveMerchantCenterPlaywrightConcurrency({
      maxWorkers: 2,
      requestedWorkers: 8,
      selectedCaseCount: 82,
    });

    expect(decision.effectiveWorkers).toBeGreaterThanOrEqual(1);
    expect(decision.effectiveWorkers).toBeLessThanOrEqual(2);
  });
});

function recipe(caseId: string): AutomationRecipe {
  return {
    schemaVersion: '1.0.0',
    id: `recipe:${caseId}`,
    caseId,
    title: caseId,
    tags: ['@contract'],
    route: '/pp/brand/seasoning/list',
    action: 'read',
    traceabilityId: `trace:sop:${caseId}`,
    sourceIds: [`source:${caseId}`],
    claimIds: [`claim:${caseId}`],
    coverageIds: [],
    generationAllowed: true,
    capabilities: [{ id: 'navigation.sidebar.open' }],
    assertions: [{ adapterId: 'verify.read' }],
  };
}

