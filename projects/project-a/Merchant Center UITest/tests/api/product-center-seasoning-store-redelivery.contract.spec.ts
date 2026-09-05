import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';

const systemSpecPath = path.resolve(
  process.cwd(),
  'systems/merchant-center-product-center-seasoning/tests/system.spec.ts',
);

test.describe('调味门店恢复适配器合同', () => {
  test('下发夹具保存模板服务端身份并在删除前阻断缺失身份', () => {
    const source = fs.readFileSync(systemSpecPath, 'utf8');
    const restoreBranchStart = source.indexOf("} else if (capability.id === 'merchant-center.seasoning.store-redeliver-restore')");
    const restoreBranch = source.slice(
      restoreBranchStart,
      source.indexOf("await current.page.reload({ waitUntil: 'domcontentloaded' })", restoreBranchStart),
    );

    expect(source).toContain('current.templateSeed = {');
    expect(restoreBranch).toContain("if (!template) throw new Error('门店恢复用例缺少模板身份，禁止执行删除动作')");
    expect(restoreBranch.indexOf("if (!template) throw new Error('门店恢复用例缺少模板身份，禁止执行删除动作')"))
      .toBeLessThan(restoreBranch.indexOf('uiMutation = await current.seasoning.deleteStoreGroup(identity)'));
  });

  test('再次下发后等待门店服务端身份并返回门店调味路由', () => {
    const source = fs.readFileSync(systemSpecPath, 'utf8');

    expect(source).toContain('await waitForStoreRecord(current.distributionApi, identity);');
    expect(source).toContain("await current.page.goto('/poi/location/seasoning', { waitUntil: 'domcontentloaded' });");
    expect(source).toContain("'brand-menu:GET /ops-poi/global-modifier/list'");
    expect(source).toContain('() => current.distributionApi.storeSeasoningList()');
    expect(source).toContain("'brand-menu:DELETE /ops-poi/global-modifier/{id}'");
    expect(source).toContain('() => current.distributionApi.deleteStoreSeasoning(existing.id)');
  });

  test('SEA-042 从品牌调味页执行直接下发且不再用 API 代替 UI 动作', () => {
    const source = fs.readFileSync(systemSpecPath, 'utf8');
    const pageSource = fs.readFileSync(path.resolve(process.cwd(), 'pages/product-center/seasoning-boundary.page.ts'), 'utf8');

    expect(source).toContain('() => current.seasoning.distributeAllSingleStore()');
    expect(source).not.toContain('current.distributionApi.syncAll(');
    expect(pageSource).toContain("this.main.getByRole('button', { name: /下发$/ })");
    expect(pageSource).toContain("new URL(candidate.url()).pathname === '/item/v1/ops-brand/brand-modifier-sync/all'");
  });

  test('门店断言守卫等待正向业务终态而不是把 React 空帧当稳定页面', () => {
    const source = fs.readFileSync(systemSpecPath, 'utf8');

    expect(source).toContain("if (expectedRoute === '/poi/location/seasoning') await waitForStorePageReady(current.page);");
    expect(source).toContain("await expect(page.locator('body')).toContainText(/批量操作|暂无数据|调味名称/");
    expect(source).not.toContain("await expect(current.page.locator('body'))\n            .not.toContainText(/Requesting permissions");
  });

  test('单门店与多门店适配器使用独立源码分段和 seed 身份', () => {
    const manifest = JSON.parse(fs.readFileSync(path.resolve(
      process.cwd(), 'systems/merchant-center-product-center-seasoning/manifest.json',
    ), 'utf8')) as { dataProfiles: Record<string, { seedAdapterId?: string }> };
    const adapters = JSON.parse(fs.readFileSync(path.resolve(
      process.cwd(), 'systems/merchant-center-product-center-seasoning/adapters.json',
    ), 'utf8')) as { adapters: Array<{ id: string; implementation: { sourceSection?: string } }> };
    const byId = new Map(adapters.adapters.map((adapter) => [adapter.id, adapter]));

    expect(manifest.dataProfiles['seasoning-single-store-replace-reversible'].seedAdapterId)
      .toBe('merchant-center.seasoning.seed-single-store-distribution');
    expect(manifest.dataProfiles['seasoning-store-delete-option-reversible'].seedAdapterId)
      .toBe('merchant-center.seasoning.seed-multi-store-distribution');
    expect(byId.get('merchant-center.seasoning.store-replace-distribution')?.implementation.sourceSection)
      .toBe('seasoning-store-replace-distribution');
    expect(byId.get('merchant-center.seasoning.store-delete-option')?.implementation.sourceSection)
      .toBe('seasoning-store-delete-option');
  });

  test('门店单项动作使用真实唯一选项身份且不同弹窗按各自关闭合同处理', () => {
    const source = fs.readFileSync(systemSpecPath, 'utf8');
    const apiSource = fs.readFileSync(path.resolve(process.cwd(), 'api/product-center/product-center-api.ts'), 'utf8');
    const pageSource = fs.readFileSync(path.resolve(process.cwd(), 'pages/product-center/seasoning-boundary.page.ts'), 'utf8');

    expect(source).toMatch(/optionName,\s*\.\.\.\(extraOptionName/);
    expect(apiSource).toContain("const optionNames = input.optionNames?.length ? input.optionNames : [input.optionName ?? 'Vegetable']");
    expect(pageSource).toContain("dialog.getByRole('button', { name: /^取\\s*消$/ })");
    expect(pageSource).toContain("dialog.getByRole('button', { name: /^close$/i })");
  });
});
