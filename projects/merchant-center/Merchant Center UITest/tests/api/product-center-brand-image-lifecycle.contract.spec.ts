import { expect, test } from '@playwright/test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { CleanupRegistry } from '../../api/product-center/cleanup-registry';
import { ProductCenterExecutionLedger } from '../../api/product-center/execution-ledger';
import type { ProductCenterApi } from '../../api/product-center/product-center-api';
import { BrandPicturePage } from '../../pages/brand-picture.page';
import { ItemCreateStandardPage } from '../../pages/product-management/item/item-create-standard.page';
import { ProductCenterItemCreateDataFactory } from '../../test-data/product-center/product-center-item-create-data.factory';

test.describe('商品主图资源生命周期合同', () => {
  test('应登记品牌图片服务端 ID 并完成零残留清理', async () => {
    const identity = 'AUTO_AUDIT_WAVE_D_MAIN_IMAGE_001.png';
    let records = [{ id: 501, name: identity }];
    const api = {
      brandImageList: async () => ({ data: { list: records } }),
      deleteBrandImage: async (id: number) => {
        records = records.filter((record) => record.id !== id);
      },
    } as unknown as ProductCenterApi;
    const ledger = new ProductCenterExecutionLedger({
      rootDir: fs.mkdtempSync(path.join(os.tmpdir(), 'product-center-brand-image-')),
      runId: 'AUTO_AUDIT_BRAND_IMAGE_001',
    });
    const registry = new CleanupRegistry(ledger);
    const factory = new ProductCenterItemCreateDataFactory(api);

    const record = await factory.registerBrandImageCreated(
      identity,
      { data: { id: 501, name: identity } },
      registry,
      'intent:brand-image-001',
    );

    expect(record).toEqual({ id: 501, name: identity, checkpointEntryId: 'brand-image-501' });
    expect(ledger.snapshot().entries[0]).toMatchObject({
      entityKind: 'brand-image',
      serverId: 501,
      identity,
      cleanupOrder: 30,
    });

    await registry.cleanupAll();

    expect(records).toEqual([]);
    expect(ledger.snapshot().entries[0].phase).toBe('residue-verified');
  });

  test('应按真实图片卡片 DOM 读取主图数量', async ({ page }) => {
    await page.setContent('<section id="section-base"><div class="imageCard___runtime"></div></section>');
    const itemPage = new ItemCreateStandardPage(page);

    expect(await itemPage.readMainImageCardCount()).toBe(1);
  });

  test('应在图片管理页按精确名称读取品牌图片数量', async ({ page }) => {
    const identity = 'AUTO_AUDIT_WAVE_D_MAIN_IMAGE_002.png';
    await page.setContent(`
      <h1>Channel</h1>
      <input placeholder="Image Name" />
      <table><tbody><tr><td>${identity}</td></tr></tbody></table>
    `);
    const picturePage = new BrandPicturePage(page);

    expect(await picturePage.countExactImageName(identity)).toBe(1);
  });
});
