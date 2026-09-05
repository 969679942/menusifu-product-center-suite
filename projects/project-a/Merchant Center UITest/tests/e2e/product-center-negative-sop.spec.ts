import { expect, test } from '../../fixtures/product-center.fixture';
import { ProductCenterSopPage } from '../../pages/product-center/product-center-sop.page';
import { isTagBoundaryCase, ProductCenterNegativePage } from '../../pages/product-center/product-center-negative.page';
import { productCenterNegativeSopCatalog, type ProductCenterNegativeCase } from '../../sop/product-center/product-center-negative-sop.catalog';
import { productCenterSopCatalog } from '../../sop/product-center/product-center-sop.catalog';
import { generateProductCenterSopCases } from '../../sop/product-center/product-center-sop-generator';
import { ProductCenterSopDataFactory } from '../../test-data/product-center/sop/product-center-sop-data.factory';
import { waitUntil } from '../../utils/wait';

const tagBoundaryCases = (productCenterNegativeSopCatalog as readonly ProductCenterNegativeCase[])
  .filter(isTagBoundaryCase)
  .filter((definition) => definition.route === '/pp/brand/tag/description');

async function openCategoryCreate(page: import('@playwright/test').Page) {
  const list = page.waitForResponse((response) => /brand-categories\/treeList/.test(response.url()) && response.status() === 200, { timeout: 60_000 });
  await page.goto('/pp/brand/category', { waitUntil: 'domcontentloaded' }); await list;
  const entry = page.locator('main:visible span[class^="plusText___"]:visible').filter({ hasText: 'Add Category' });
  await waitUntil(() => entry.count(), (count) => count === 1, { timeout: 30_000, message: '商品分类创建入口未唯一显示' }); await entry.click();
}
async function openMethodCreate(page: import('@playwright/test').Page) {
  const list = page.waitForResponse((response) => /brand-modifiers\/page/.test(response.url()) && response.status() === 200, { timeout: 60_000 });
  await page.goto('/pp/brand/option-group/method', { waitUntil: 'domcontentloaded' }); await list;
  const add = page.locator('main:visible button:visible').filter({ hasText: 'Add' }); await waitUntil(() => add.count(), (count) => count === 1, { timeout: 30_000, message: '做法组创建入口未唯一显示' }); await add.click();
  await waitUntil(() => new URL(page.url()).pathname, (path) => path.endsWith('/create'), { timeout: 30_000, message: '做法组未进入创建页' });
}

test.describe('商品中心反向与边界 SOP', () => {
  test.describe.configure({ mode: 'parallel', timeout: 180_000 });
  test('商品分类空提交应保持保存禁用且不发送创建请求', async ({ page }) => {
    await openCategoryCreate(page); let mutations = 0; page.on('request', (request) => { if (request.method() === 'POST' && /brand-categories$/.test(request.url())) mutations += 1; });
    const save = page.getByRole('button', { name: 'Save', exact: true }); expect(await save.isDisabled()).toBe(true); expect(mutations).toBe(0);
  });
  test('商品分类名称应精确限制为一百字符', async ({ page }) => {
    await openCategoryCreate(page); const input = page.locator('main:visible input[placeholder="Required"]:visible'); await input.fill('A'.repeat(101)); expect((await input.inputValue()).length).toBe(100);
  });
  test('做法组空提交应显示校验且不发送创建请求', async ({ page }) => {
    await openMethodCreate(page); let mutations = 0; page.on('request', (request) => { if (request.method() === 'POST' && /brand-modifiers$/.test(request.url())) mutations += 1; });
    const confirm = page.getByRole('button', { name: 'Confirm', exact: true }); await confirm.click();
    await waitUntil(() => page.locator('.ant-form-item-explain-error:visible').count(), (count) => count > 0, { timeout: 10_000, message: '做法组必填错误未显示' }); expect(mutations).toBe(0);
  });
  test('做法组名称应精确限制为一百字符', async ({ page }) => {
    await openMethodCreate(page); const input = page.locator('input[aria-required="true"]:visible'); await input.fill('B'.repeat(101)); expect((await input.inputValue()).length).toBe(100);
  });
  test('加料组未配置加料项时提交应保持禁用', { tag: ['@fast'] }, async ({ page }) => {
    const list = page.waitForResponse((response) => /brand-addon-group/.test(response.url()) && response.status() === 200, { timeout: 60_000 }); await page.goto('/pp/brand/option-group/additional', { waitUntil: 'domcontentloaded' }); await list;
    const add = page.locator('main:visible button:visible').filter({ hasText: 'Add' }); await waitUntil(() => add.count(), (count) => count === 1, { timeout: 30_000, message: '加料组创建入口未唯一显示' }); await add.click(); await waitUntil(() => new URL(page.url()).pathname, (path) => path.endsWith('/create'), { timeout: 30_000, message: '加料组未进入创建页' });
    expect(await page.getByRole('button', { name: 'Confirm', exact: true }).isDisabled()).toBe(true);
  });
  test('打印机空提交应显示校验且不发送创建请求', { tag: ['@fast'] }, async ({ page }) => {
    await page.goto('/poi/printer-stall/list', { waitUntil: 'domcontentloaded' }); const row = page.locator('main:visible tr:visible').filter({ hasText: '厨房' }); await waitUntil(() => row.count(), (count) => count === 1, { timeout: 60_000, message: '厨房打印档口行未唯一显示' }); await row.locator('.ant-dropdown-trigger:visible').click();
    const related = page.locator('.ant-dropdown:visible [role=menuitem]:visible').filter({ hasText: 'Related Printers' }); await related.click(); await waitUntil(() => new URL(page.url()).pathname, (path) => path.includes('/related-printer'), { timeout: 30_000, message: '关联打印机页面未完成导航' }); const add = page.locator('main:visible button:visible').filter({ hasText: 'Add printer' }); await waitUntil(() => add.count(), (count) => count === 1, { timeout: 30_000, message: '新增打印机入口未唯一显示' }); expect(await add.isVisible()).toBe(true); expect(await add.isEnabled()).toBe(true); await add.click();
    let mutations = 0; page.on('request', (request) => { if (request.method() === 'POST' && /item-printers\/printers$/.test(request.url())) mutations += 1; }); const dialog = page.locator('[role=dialog]:visible'); const confirm = dialog.getByRole('button', { name: 'Confirm', exact: true }); await confirm.click(); await waitUntil(() => dialog.locator('.ant-form-item-explain-error:visible').count(), (count) => count > 0, { timeout: 10_000, message: '打印机必填错误未显示' }); expect(mutations).toBe(0);
  });
  test('取消商品分类删除应保留原记录且不发送删除请求', async ({ page, productCenterApi, cleanupRegistry }) => {
    const definition = generateProductCenterSopCases(productCenterSopCatalog).find((item) => item.entityKey === 'category' && item.action === 'delete')!; const factory = new ProductCenterSopDataFactory(productCenterApi); const record = await factory.seed('category', cleanupRegistry); const target = new ProductCenterSopPage(page); await target.open(definition, record); await target.openActionMenu(definition, record); await target.chooseMenuAction('Delete');
    let mutations = 0; page.on('request', (request) => { if (request.method() === 'DELETE' && request.url().includes(`/brand-categories/${record.id}`)) mutations += 1; }); const dialog = page.locator('[role=dialog]:visible'); await dialog.getByRole('button', { name: 'Cancel', exact: true }).click(); expect(mutations).toBe(0); expect(await factory.verifyAbsent(record)).toBe(false);
  });

  for (const definition of tagBoundaryCases) {
    test(
      definition.testTitle,
      { tag: ['@fast', '@contract-impact'] },
      async ({ page }) => {
        let mutations = 0;
        page.on('request', (request) => {
          if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method()) && /brand-tags|brand-tag-groups/.test(request.url())) {
            mutations += 1;
          }
        });
        const target = new ProductCenterNegativePage(page);

        await target.openTagCreateDialog(definition.route);
        const result = await target.readBoundaryResult(
          definition.boundary.locatorKey,
          definition.boundary.acceptedLength,
          definition.boundary.rejectedLength,
        );

        expect(result.maxLengthAttribute).toBe(String(definition.boundary.maxLength));
        expect(result.acceptedValue).toHaveLength(definition.boundary.acceptedLength);
        expect(result.rejectedValue).toHaveLength(definition.boundary.maxLength);
        expect(mutations).toBe(0);
        await target.closeTagCreateDialog();
      },
    );
  }
});
