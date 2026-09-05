import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ProductCenterExecutionLedger, type ProductCenterLedgerEntityKind } from '../../api/product-center/execution-ledger';
import { ProductCenterApiRecoveryAdapter, ProductCenterRecoveryService, type ProductCenterRecoveryAdapter } from '../../api/product-center/recovery-service';

test.describe('商品中心执行台账恢复器', () => {
  test('应先查询再按逆序清理未完成审计数据', async () => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'product-center-recovery-'));
    const ledger = new ProductCenterExecutionLedger({ rootDir, runId: 'AUTO_AUDIT_RECOVERY_001' });
    ledger.recordCreated({
      entryId: 'product-1', entityKind: 'bom-product', entity: '商品依赖', serverId: 1,
      identity: 'AUTO_AUDIT_PRODUCT_001', identityVariants: ['AUTO_AUDIT_PRODUCT_001'], cleanupOrder: 10,
    });
    ledger.recordCreated({
      entryId: 'bom-3', entityKind: 'bom', entity: '配方单', serverId: 3,
      identity: 'AUTO_AUDIT_BOM_001', identityVariants: ['AUTO_AUDIT_BOM_001'], cleanupOrder: 40,
    });

    const calls: string[] = [];
    const existing = new Set(['bom-3', 'product-1']);
    const adapter: ProductCenterRecoveryAdapter = {
      find: async (entry) => {
        calls.push(`find:${entry.entryId}`);
        if (!existing.has(entry.entryId)) return undefined;
        return entry.entryId === 'bom-3' ? { id: 3, name: entry.identity } : { id: 1, name: entry.identity };
      },
      delete: async (entry, record) => {
        calls.push(`delete:${entry.entryId}:${record.id}`);
        existing.delete(entry.entryId);
      },
    };

    const result = await new ProductCenterRecoveryService(ledger, adapter).recoverIncomplete();

    expect(calls).toEqual([
      'find:bom-3', 'delete:bom-3:3', 'find:bom-3',
      'find:product-1', 'delete:product-1:1', 'find:product-1',
    ]);
    expect(result.recoveredEntryIds).toEqual(['bom-3', 'product-1']);
    expect(ledger.incompleteEntries()).toEqual([]);
  });

  test('服务端已不存在时不重放 DELETE 但应完成残留验证', async () => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'product-center-recovery-absent-'));
    const ledger = new ProductCenterExecutionLedger({ rootDir, runId: 'AUTO_AUDIT_RECOVERY_002' });
    ledger.recordCreated({
      entryId: 'category-1', entityKind: 'category', entity: '商品分类', serverId: 1,
      identity: 'AUTO_AUDIT_CATEGORY_001', identityVariants: ['AUTO_AUDIT_CATEGORY_001'], cleanupOrder: 10,
    });
    const adapter: ProductCenterRecoveryAdapter = {
      find: async () => undefined,
      delete: async () => { throw new Error('不应删除已不存在的数据'); },
    };

    const result = await new ProductCenterRecoveryService(ledger, adapter).recoverIncomplete();

    expect(result.alreadyAbsentEntryIds).toEqual(['category-1']);
    expect(ledger.snapshot().entries[0].phase).toBe('residue-verified');
  });
  test('API 恢复适配器应覆盖全部扩展可变实体', async () => {
    const cases: readonly [ProductCenterLedgerEntityKind, string, string][] = [
      ['material-category', 'materialCategoryTree', 'deleteCategory'],
      ['taste', 'tastePage', 'deleteMethod'],
      ['spec', 'specPage', 'deleteSpec'],
      ['addon', 'addonGroupList', 'deleteAddonGroup'],
      ['print-stall', 'printStallPage', 'deletePrintStall'],
      ['tax', 'taxPage', 'deleteTax'],
      ['description-tag', 'tagPage', 'deleteTag'],
      ['statistic-tag', 'tagPage', 'deleteTag'],
      ['tag-group', 'tagGroupList', 'deleteTagGroup'],
      ['menu', 'menuPage', 'deleteMenu'],
      ['menu-block', 'menuBlockSearch', 'deleteMenuBlock'],
      ['printer', 'printerPage', 'deletePrinter'],
      ['combo', 'comboGroupList', 'deleteComboGroup'],
      ['item', 'productPage', 'deleteBomProduct'],
    ];

    for (const [entityKind, queryMethod, deleteMethod] of cases) {
      const identity = `AUTO_AUDIT_RECOVERY_${entityKind.toUpperCase().replace(/-/g, '_')}`;
      const deleted: Array<number | string> = [];
      const api = new Proxy({}, {
        get: (_target, property) => {
          if (property === 'productDetail' && entityKind === 'item') {
            return async () => ({ data: { itemBasic: { id: 91, name: identity } } });
          }
          if (property === queryMethod) return async () => ({ data: [{ id: 91, name: identity }] });
          if (property === deleteMethod) return async (id: number | string) => { deleted.push(id); };
          return undefined;
        },
      });
      const adapter = new ProductCenterApiRecoveryAdapter(api as never);
      const entry = {
        entryId: `${entityKind}-91`, entityKind, entity: entityKind, serverId: 91,
        identity, identityVariants: [identity], cleanupOrder: 40, phase: 'seeded' as const,
        updatedAt: new Date(0).toISOString(),
      };

      const record = await adapter.find(entry);
      expect(record).toEqual({ id: 91, name: identity });
      await adapter.delete(entry, record!);
      expect(deleted).toEqual([entityKind === 'printer' ? '91' : 91]);
    }
  });

  test('商品列表暂时不可见时仍应按服务端 ID 识别残留', async () => {
    const identity = 'AUTO_AUDIT_RECOVERY_ITEM_BY_ID';
    const adapter = new ProductCenterApiRecoveryAdapter({
      productDetail: async () => ({ data: { itemBasic: { id: 34806, name: identity } } }),
      productPage: async () => ({ data: { list: [] } }),
    } as never);
    const record = await adapter.find({
      entryId: 'item-34806', entityKind: 'item', entity: '套餐商品', serverId: 34806,
      identity, identityVariants: [identity], cleanupOrder: 50, phase: 'cleaning',
      updatedAt: new Date(0).toISOString(),
    });
    expect(record).toEqual({ id: 34806, name: identity });
  });
});

