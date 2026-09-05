import { expect, test } from '../../fixtures/product-center.fixture';
import { extractCreatedRecord } from '../../api/product-center/created-record';
import { createCombosPage } from '../../pages/product-management/group-list.factory';
import { ProductCenterItemCreateDataFactory } from '../../test-data/product-center/product-center-item-create-data.factory';

test('套餐组行操作菜单合同', async ({ page, productCenterApi, cleanupRegistry }, testInfo) => {
  const timestamp = Date.now();
  const groupIdentity = `AUTO_AUDIT_COMBO_MENU_${timestamp}`;
  const productIdentity = `AUTO_AUDIT_COMBO_MENU_PRODUCT_${timestamp}`;
  const itemFactory = new ProductCenterItemCreateDataFactory(productCenterApi);
  const productBody = await productCenterApi.createBomProduct(productIdentity, 142);
  const product = await itemFactory.registerCreated({
    entityKey: 'item',
    productType: 'standard',
    originalIdentity: productIdentity,
    price: '1.00',
    minimumOrderQuantity: '1',
  }, productBody, cleanupRegistry);
  const skuId = readFirstSkuId(await productCenterApi.productDetail(product.id));
  if (skuId === undefined) throw new Error('套餐菜单审计商品缺少 SKU ID');
  const groupBody = await productCenterApi.createComboGroup({
    name: groupIdentity,
    itemId: product.id,
    skuId,
    sectionType: 2,
  });
  await itemFactory.registerComboGroupCreated(groupIdentity, groupBody, cleanupRegistry);

  const pageObject = createCombosPage(page);
  await pageObject.open();
  await pageObject.searchAndWait(groupIdentity);
  const row = await pageObject.rowByIdentity(groupIdentity);
  const triggers = row.locator('button:visible, [role=button]:visible, .ant-dropdown-trigger:visible, a:visible');
  const triggerContract = await triggers.evaluateAll((elements) => elements.map((element) => ({
    tag: element.tagName,
    text: (element.textContent ?? '').trim(),
    role: element.getAttribute('role'),
    ariaLabel: element.getAttribute('aria-label'),
    title: element.getAttribute('title'),
    className: element.getAttribute('class'),
  })));
  await testInfo.attach('combo-row-trigger-contract', {
    body: Buffer.from(JSON.stringify({ groupIdentity, triggerContract }, null, 2)),
    contentType: 'application/json',
  });
  expect(triggerContract.length).toBeGreaterThan(0);
  await triggers.last().click();
  const menu = page.getByRole('menu').filter({ has: page.getByRole('menuitem', { name: /Delete$/i }) });
  await expect(menu).toHaveCount(1);
  const overlayContract = await menu.evaluateAll((elements) => elements.map((element) => ({
    text: (element.textContent ?? '').trim(),
    html: element.outerHTML,
  })));
  await testInfo.attach('combo-row-menu-contract', {
    body: Buffer.from(JSON.stringify({ groupIdentity, overlayContract }, null, 2)),
    contentType: 'application/json',
  });
  await expect(menu.getByRole('menuitem', { name: /Delete$/i })).toHaveCount(1);
  await expect(menu.getByRole('menuitem', { name: /Edit$/i })).toHaveCount(0);
});

function readFirstSkuId(value: unknown): number | undefined {
  if (Array.isArray(value)) {
    for (const item of value) {
      const skuId = readFirstSkuId(item);
      if (skuId !== undefined) return skuId;
    }
    return undefined;
  }
  if (!value || typeof value !== 'object') return undefined;
  const record = value as Record<string, unknown>;
  if (Array.isArray(record.skuList)) {
    const sku = record.skuList.find((item) => item && typeof item === 'object') as Record<string, unknown> | undefined;
    const candidate = sku?.skuId ?? sku?.id;
    if (Number(candidate) > 0) return Number(candidate);
  }
  for (const child of Object.values(record)) {
    const skuId = readFirstSkuId(child);
    if (skuId !== undefined) return skuId;
  }
  return undefined;
}
