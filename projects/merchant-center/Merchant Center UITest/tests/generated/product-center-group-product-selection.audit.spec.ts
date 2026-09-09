import { expect, test } from '../../fixtures/product-center.fixture';
import { extractCreatedRecord } from '../../api/product-center/created-record';
import { createAddOnsPage, createCombosPage } from '../../pages/product-management/group-list.factory';
import { ItemCreateFlow } from '../../flows/item-create.flow';
import { ProductCenterItemCreateDataFactory } from '../../test-data/product-center/product-center-item-create-data.factory';

test.describe('商品中心组商品选择弹层可回收审计', () => {
  for (const definition of [
    { name: '加料组', createPage: createAddOnsPage },
    { name: '套餐组', createPage: createCombosPage },
  ] as const) {
    test(`${definition.name}商品选择弹层合同`, async ({ page, productCenterApi, cleanupRegistry }, testInfo) => {
      const timestamp = Date.now();
      const productIdentity = `AUTO_AUDIT_GROUP_SELECTION_PRODUCT_${timestamp}`;
      let comboCategoryName = '';
      let created: { id: number };
      if (definition.name === '加料组') {
        await new ItemCreateFlow().createSideItem(page, { name: productIdentity, price: '10.00' });
        const factory = new ProductCenterItemCreateDataFactory(productCenterApi);
        created = await factory.registerCreated({
          entityKey: 'item',
          productType: 'side',
          originalIdentity: productIdentity,
          price: '10.00',
          minimumOrderQuantity: '1',
        }, null, cleanupRegistry);
      } else {
        const category = findNamedRecord(await productCenterApi.categoryTree(), 'Special Offer');
        if (!category) throw new Error('套餐组商品选择审计缺少弹层可见分类 Special Offer');
        comboCategoryName = category.name;
        const record = extractCreatedRecord(
          await productCenterApi.createBomProduct(productIdentity, category.id),
          productIdentity,
        );
        if (!record) throw new Error(`${definition.name}商品选择审计造数未返回商品 ID`);
        created = record;
        cleanupRegistry.register({
          entity: `${definition.name}商品选择审计商品`,
          identity: productIdentity,
          checkpoint: {
            entryId: `bom-product-${created.id}`,
            entityKind: 'bom-product',
            serverId: created.id,
            identityVariants: [productIdentity],
            cleanupOrder: 10,
          },
          execute: async () => {
            const matches = findProductIds(await productCenterApi.productPage(productIdentity), productIdentity);
            for (const id of matches) await productCenterApi.deleteBomProduct(id);
          },
          verify: async () => findProductIds(await productCenterApi.productPage(productIdentity), productIdentity).length === 0,
        });
      }
      const pageObject = definition.createPage(page);
      await pageObject.open();
      const surface = await pageObject.openCreateSurface();
      if (definition.name === '套餐组') {
        await pageObject.selectComboType('Optional Combo');
      }
      const add = surface.getByRole('button', { name: /Add$/i });
      await expect(add).toHaveCount(1);
      await add.click();
      const overlay = page.locator('[role=dialog]:visible, .ant-drawer:visible').last();
      await expect(overlay).toBeVisible();
      if (definition.name === '加料组') {
        await overlay.getByPlaceholder('Item Name').fill(productIdentity);
      } else {
        const productSearch = overlay.getByPlaceholder('Product Name');
        const categoryNode = overlay.getByRole('treeitem', {
          name: new RegExp(`Select tree node ${escapeRegex(comboCategoryName)}$`),
        });
        await expect(categoryNode).toHaveCount(1);
        const categoryTitle = categoryNode.getByText(comboCategoryName, { exact: true });
        await expect(categoryTitle).toHaveCount(1);
        await categoryTitle.click();
        await productSearch.fill(productIdentity);
      }
      const productRow = overlay.getByText(productIdentity, { exact: true });
      await expect(productRow).toHaveCount(1);
      const productCheckbox = productRow.locator('xpath=ancestor::tr[1]').getByRole('checkbox');
      await expect(productCheckbox).toHaveCount(1);
      await productCheckbox.check();
      const snapshot = await overlay.evaluate((element) => ({
        text: (element.textContent ?? '').trim(),
        inputs: Array.from(element.querySelectorAll('input'))
          .filter((input) => Boolean((input as HTMLElement).offsetParent))
          .map((input) => ({
            placeholder: input.getAttribute('placeholder'),
            type: input.getAttribute('type'),
            role: input.getAttribute('role'),
            ariaLabel: input.getAttribute('aria-label'),
          })),
        buttons: Array.from(element.querySelectorAll('button'))
          .filter((button) => Boolean((button as HTMLElement).offsetParent))
          .map((button) => ({
            text: (button.textContent ?? '').trim(),
            ariaLabel: button.getAttribute('aria-label'),
            title: button.getAttribute('title'),
          })),
        tables: Array.from(element.querySelectorAll('table')).map((table) => ({
          headers: Array.from(table.querySelectorAll('thead th')).map((header) => (header.textContent ?? '').trim()),
          rows: Array.from(table.querySelectorAll('tbody tr')).map((row) => (row.textContent ?? '').trim()),
        })),
        checkboxes: Array.from(element.querySelectorAll('input[type=checkbox]')).map((input) => ({
          checked: (input as HTMLInputElement).checked,
          disabled: (input as HTMLInputElement).disabled,
          rowText: (input.closest('tr')?.textContent ?? '').trim(),
        })),
      }));
      await testInfo.attach(`${definition.name}-product-selection-contract`, {
        body: Buffer.from(JSON.stringify({ productIdentity, snapshot }, null, 2)),
        contentType: 'application/json',
      });
      expect(snapshot.text).toContain(productIdentity);
      const confirmSelection = overlay.getByRole('button', { name: 'Confirm', exact: true });
      await expect(confirmSelection).toBeEnabled();
      await confirmSelection.click();
      await overlay.waitFor({ state: 'hidden', timeout: 10_000 });
      const selectedSurface = await surface.evaluate((element) => ({
        text: (element.textContent ?? '').trim(),
        inputs: Array.from(element.querySelectorAll('input'))
          .filter((input) => Boolean((input as HTMLElement).offsetParent))
          .map((input) => ({
            value: (input as HTMLInputElement).value,
            placeholder: input.getAttribute('placeholder'),
            type: input.getAttribute('type'),
            role: input.getAttribute('role'),
            ariaRequired: input.getAttribute('aria-required'),
          })),
        buttons: Array.from(element.querySelectorAll('button'))
          .filter((button) => Boolean((button as HTMLElement).offsetParent))
          .map((button) => (button.textContent ?? '').trim()),
      }));
      await testInfo.attach(`${definition.name}-selected-surface-contract`, {
        body: Buffer.from(JSON.stringify({ productIdentity, selectedSurface }, null, 2)),
        contentType: 'application/json',
      });
      expect(selectedSurface.text).toContain(productIdentity);
      await pageObject.cancelCurrentSurface();
    });
  }
});

function findProductIds(value: unknown, identity: string): number[] {
  if (!value || typeof value !== 'object') return [];
  const data = (value as Record<string, unknown>).data;
  const list = data && typeof data === 'object' ? (data as Record<string, unknown>).list : undefined;
  if (!Array.isArray(list)) return [];
  return list.flatMap((item) => {
    if (!item || typeof item !== 'object') return [];
    const basic = (item as Record<string, unknown>).itemBasic;
    if (!basic || typeof basic !== 'object') return [];
    const record = basic as Record<string, unknown>;
    return record.name === identity && typeof record.id === 'number' ? [record.id] : [];
  });
}

function findNamedRecord(value: unknown, identity: string): { id: number; name: string } | undefined {
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findNamedRecord(item, identity);
      if (found) return found;
    }
    return undefined;
  }
  if (!value || typeof value !== 'object') return undefined;
  const record = value as Record<string, unknown>;
  if (record.name === identity && typeof record.id === 'number') return { id: record.id, name: identity };
  for (const child of Object.values(record)) {
    const found = findNamedRecord(child, identity);
    if (found) return found;
  }
  return undefined;
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
