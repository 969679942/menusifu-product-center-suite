import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ProductCenterExecutionLedger } from '../../api/product-center/execution-ledger';
import { CleanupRegistry, CleanupRegistryFailure } from '../../api/product-center/cleanup-registry';

test.describe('商品中心持久化执行台账', () => {
  test('应原子记录服务端 ID 和阶段且不包含敏感字段', async () => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'product-center-ledger-'));
    const ledger = new ProductCenterExecutionLedger({ rootDir, runId: 'AUTO_AUDIT_RUN_001' });

    ledger.recordCreated({
      entryId: 'category-1',
      entityKind: 'category',
      entity: '商品分类',
      serverId: 101,
      identity: 'AUTO_AUDIT_CATEGORY_001',
      identityVariants: ['AUTO_AUDIT_CATEGORY_001', 'AUTO_AUDIT_CATEGORY_001_EDIT'],
      cleanupOrder: 10,
    });
    ledger.markPhase('category-1', 'ui-triggered');
    ledger.markPhase('category-1', 'mutation-observed');
    ledger.addIdentityVariant('category-1', 'AUTO_AUDIT_CATEGORY_001_RENAMED');

    const snapshot = ledger.snapshot();
    expect(snapshot.runId).toBe('AUTO_AUDIT_RUN_001');
    expect(snapshot.entries).toHaveLength(1);
    expect(snapshot.entries[0]).toMatchObject({
      entryId: 'category-1',
      serverId: 101,
      phase: 'mutation-observed',
      identityVariants: [
        'AUTO_AUDIT_CATEGORY_001',
        'AUTO_AUDIT_CATEGORY_001_EDIT',
        'AUTO_AUDIT_CATEGORY_001_RENAMED',
      ],
    });

    const persisted = fs.readFileSync(ledger.filePath, 'utf8');
    expect(persisted).not.toMatch(/password|authorization|cookie|token/i);
    expect(fs.existsSync(`${ledger.filePath}.tmp`)).toBe(false);
  });

  test('应按清理优先级返回未完成工作单元', async () => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'product-center-ledger-order-'));
    const ledger = new ProductCenterExecutionLedger({ rootDir, runId: 'AUTO_AUDIT_RUN_002' });

    ledger.recordCreated({
      entryId: 'product', entityKind: 'bom-product', entity: '配方单商品依赖', serverId: 1,
      identity: 'AUTO_AUDIT_PRODUCT_001', identityVariants: ['AUTO_AUDIT_PRODUCT_001'], cleanupOrder: 10,
    });
    ledger.recordCreated({
      entryId: 'material', entityKind: 'material', entity: '配方单原料依赖', serverId: 2,
      identity: 'AUTO_AUDIT_MATERIAL_001', identityVariants: ['AUTO_AUDIT_MATERIAL_001'], cleanupOrder: 20,
    });
    ledger.recordCreated({
      entryId: 'bom', entityKind: 'bom', entity: '配方单', serverId: 3,
      identity: 'AUTO_AUDIT_BOM_001', identityVariants: ['AUTO_AUDIT_BOM_001', 'AUTO_AUDIT_BOM_001_EDIT'], cleanupOrder: 40,
    });
    ledger.markPhase('bom', 'residue-verified');

    expect(ledger.incompleteEntries().map((entry) => entry.entryId)).toEqual(['material', 'product']);
  });

  test('应拒绝非审计身份和敏感诊断字段', async () => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'product-center-ledger-guard-'));
    const ledger = new ProductCenterExecutionLedger({ rootDir, runId: 'AUTO_AUDIT_RUN_003' });

    expect(() => ledger.recordCreated({
      entryId: 'unsafe', entityKind: 'category', entity: '商品分类', serverId: 1,
      identity: 'Existing Category', identityVariants: ['Existing Category'], cleanupOrder: 1,
    })).toThrow(/非审计数据/);

    expect(() => ledger.markFailed('missing', {
      classification: 'harness-error',
      message: 'authorization: Bearer secret-value',
    })).toThrow(/敏感信息/);
  });

  test('CleanupRegistry 应持久化清理阶段并完成零残留', async () => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'product-center-ledger-cleanup-'));
    const ledger = new ProductCenterExecutionLedger({ rootDir, runId: 'AUTO_AUDIT_RUN_004' });
    const registry = new CleanupRegistry(ledger);
    let exists = true;

    registry.register({
      entity: '商品分类',
      identity: 'AUTO_AUDIT_CATEGORY_004',
      checkpoint: {
        entryId: 'category-4', entityKind: 'category', serverId: 104,
        identityVariants: ['AUTO_AUDIT_CATEGORY_004', 'AUTO_AUDIT_CATEGORY_004_EDIT'], cleanupOrder: 10,
      },
      execute: async () => { exists = false; },
      verify: async () => !exists,
    });

    await registry.cleanupAll();

    expect(ledger.snapshot().entries[0].phase).toBe('residue-verified');
    expect(ledger.incompleteEntries()).toEqual([]);
  });

  test('CleanupRegistry 资源简写应自动登记真实服务端 ID', async () => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'product-center-ledger-resource-'));
    const ledger = new ProductCenterExecutionLedger({ rootDir, runId: 'AUTO_AUDIT_RUN_RESOURCE' });
    const registry = new CleanupRegistry(ledger);
    let exists = true;

    registry.register({
      entity: '商品分类',
      identity: 'AUTO_AUDIT_CATEGORY_RESOURCE',
      resource: {
        entityKind: 'category',
        serverId: 204,
        identityVariants: ['AUTO_AUDIT_CATEGORY_RESOURCE', 'AUTO_AUDIT_CATEGORY_RESOURCE_EDIT'],
      },
      execute: async () => { exists = false; },
      verify: async () => !exists,
    });

    const evidence = await registry.cleanupAll();
    expect(evidence.serverIds).toEqual([204]);
    expect(ledger.snapshot().entries[0]).toMatchObject({ serverId: 204, phase: 'residue-verified' });
  });
  test('CleanupRegistry 应连续确认零残留后才写入终态', async () => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'product-center-ledger-stable-cleanup-'));
    const ledger = new ProductCenterExecutionLedger({ rootDir, runId: 'AUTO_AUDIT_RUN_005' });
    const registry = new CleanupRegistry(ledger);
    const observations = [true, false, true, true];
    let verifyCalls = 0;

    registry.register({
      entity: '加料组',
      identity: 'AUTO_AUDIT_ADDITIONAL_005',
      checkpoint: {
        entryId: 'addon-5', entityKind: 'addon', serverId: 105,
        identityVariants: ['AUTO_AUDIT_ADDITIONAL_005'], cleanupOrder: 40,
      },
      execute: async () => {},
      verify: async () => {
        const result = observations[verifyCalls] ?? true;
        verifyCalls += 1;
        return result;
      },
    });

    await registry.cleanupAll();

    expect(verifyCalls).toBe(4);
    expect(ledger.snapshot().entries[0].phase).toBe('residue-verified');
  });

  test('CleanupRegistry 已成功清理的任务不得在 fixture 收尾时重复执行', async () => {
    const registry = new CleanupRegistry();
    let executeCalls = 0;

    registry.register({
      entity: '商品分类',
      identity: 'AUTO_AUDIT_CATEGORY_006',
      execute: async () => { executeCalls += 1; },
      verify: async () => true,
    });

    await registry.cleanupAll();
    await registry.cleanupAll();

    expect(executeCalls).toBe(1);
  });

  test('CleanupRegistry 应按清理优先级删除商品后再删除品牌图片', async () => {
    const registry = new CleanupRegistry();
    const calls: string[] = [];

    registry.register({
      entity: '标准商品',
      identity: 'AUTO_AUDIT_ITEM_007',
      checkpoint: {
        entryId: 'item-7', entityKind: 'item', serverId: 107,
        identityVariants: ['AUTO_AUDIT_ITEM_007'], cleanupOrder: 40,
      },
      execute: async () => { calls.push('item'); },
      verify: async () => true,
    });
    registry.register({
      entity: '品牌图片',
      identity: 'AUTO_AUDIT_IMAGE_007.png',
      checkpoint: {
        entryId: 'brand-image-7', entityKind: 'brand-image', serverId: 207,
        identityVariants: ['AUTO_AUDIT_IMAGE_007.png'], cleanupOrder: 30,
      },
      execute: async () => { calls.push('brand-image'); },
      verify: async () => true,
    });

    await registry.cleanupAll();

    expect(calls).toEqual(['item', 'brand-image']);
  });

  test('父子分类清理必须先子后父', async () => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'product-center-ledger-category-order-'));
    const ledger = new ProductCenterExecutionLedger({ rootDir, runId: 'AUTO_AUDIT_RUN_CATEGORY_ORDER' });
    const registry = new CleanupRegistry(ledger);
    const order: string[] = [];
    registry.register({
      entity: '父分类', identity: 'AUTO_AUDIT_PARENT',
      checkpoint: { entryId: 'parent', entityKind: 'category', serverId: 1, identityVariants: ['AUTO_AUDIT_PARENT'], cleanupOrder: 30 },
      execute: async () => { order.push('parent'); }, verify: async () => true,
    });
    registry.register({
      entity: '子分类', identity: 'AUTO_AUDIT_CHILD',
      checkpoint: { entryId: 'child', entityKind: 'category', serverId: 2, identityVariants: ['AUTO_AUDIT_CHILD'], cleanupOrder: 40 },
      execute: async () => { order.push('child'); }, verify: async () => true,
    });
    await registry.cleanupAll();
    expect(order).toEqual(['child', 'parent']);
  });

  test('CleanupRegistry 应在写入台账前脱敏清理异常', async () => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'product-center-ledger-redaction-'));
    const ledger = new ProductCenterExecutionLedger({ rootDir, runId: 'AUTO_AUDIT_RUN_006' });
    const registry = new CleanupRegistry(ledger);

    registry.register({
      entity: '套餐组',
      identity: 'AUTO_AUDIT_COMBO_006',
      checkpoint: {
        entryId: 'combo-6', entityKind: 'combo', serverId: 106,
        identityVariants: ['AUTO_AUDIT_COMBO_006'], cleanupOrder: 50,
      },
      execute: async () => {
        throw new Error('locator password failed; authorization=Bearer sample-value; token:sample-token');
      },
      verify: async () => false,
    });

    await expect(registry.cleanupAll()).rejects.toThrow(/<redacted-diagnostic>/);
    const entry = ledger.snapshot().entries[0];
    expect(entry.phase).toBe('failed');
    expect(entry.diagnostic).toContain('<redacted-diagnostic>');
    expect(entry.diagnostic).not.toMatch(/authorization|bearer|password|cookie|token/i);
  });

  test('CleanupRegistry 应返回服务端对象级零残留收据', async () => {
    const registry = new CleanupRegistry();
    registry.register({
      entity: '商品', identity: 'AUTO_AUDIT_OBJECT_001',
      resource: { entityKind: 'item', serverId: 901, cleanupOrder: 10 },
      execute: async () => {}, verify: async () => true,
    });
    const evidence = await registry.cleanupAll();
    expect(evidence.objects).toEqual([expect.objectContaining({
      entityType: 'item', serverId: 901, businessIdentity: 'AUTO_AUDIT_OBJECT_001',
      apiResidueCount: 0, cleanupAttempt: 1, outcome: 'verified-zero',
    })]);
  });

  test('CleanupRegistry 清理失败也应在异常中保留对象级审计证据', async () => {
    const registry = new CleanupRegistry();
    registry.register({
      entity: '商品', identity: 'AUTO_AUDIT_OBJECT_002',
      resource: { entityKind: 'item', serverId: 902, cleanupOrder: 10 },
      execute: async () => { throw new Error('cleanup failed'); }, verify: async () => false,
    });
    const failure = await registry.cleanupAll().catch((error) => error as CleanupRegistryFailure);
    expect(failure).toBeInstanceOf(CleanupRegistryFailure);
    const auditFailure = failure as CleanupRegistryFailure;
    expect(auditFailure.auditEvidence.objects).toEqual([expect.objectContaining({
      entityType: 'item', serverId: 902, businessIdentity: 'AUTO_AUDIT_OBJECT_002',
      apiResidueCount: 1, outcome: 'failed', failureCategory: 'cleanup-error',
    })]);
  });
});
