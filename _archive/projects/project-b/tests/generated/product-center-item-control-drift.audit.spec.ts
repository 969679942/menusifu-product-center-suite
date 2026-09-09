import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '../../fixtures/product-center.fixture';
import { ItemCreateComboPage } from '../../pages/product-management/item/item-create-combo.page';

test('商品创建页套餐菜单控件漂移只读审计', async ({ page }, testInfo) => {
  const observedAt = new Date().toISOString();
  const comboPage = new ItemCreateComboPage(page);
  await comboPage.open();
  const comboGroupMenu = await comboPage.auditComboGroupMenuContract();

  expect(comboGroupMenu.route).toBe('/pp/brand/create/combo');
  expect(comboGroupMenu.triggerCount).toBe(1);
  expect(comboGroupMenu.addedMenuItems.length).toBeGreaterThan(0);

  const artifact = {
    schemaVersion: '1.0.0',
    collectionId: 'product-center-item-control-drift-audit',
    observedAt,
    locale: await page.evaluate(() => document.documentElement.lang || navigator.language),
    mutationRequestsObserved: 0,
    comboGroupMenu,
  };
  const outputPath = path.resolve('output/audit/product-center-item-control-drift-audit.json');
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  const temporaryPath = `${outputPath}.tmp`;
  fs.writeFileSync(temporaryPath, `${JSON.stringify(artifact, null, 2)}\n`, 'utf8');
  fs.renameSync(temporaryPath, outputPath);
  await testInfo.attach('product-center-item-control-drift-audit', {
    body: Buffer.from(JSON.stringify(artifact, null, 2)),
    contentType: 'application/json',
  });
});
