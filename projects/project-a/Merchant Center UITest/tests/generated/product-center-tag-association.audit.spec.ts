import { expect } from '@playwright/test';
import type { CleanupRegistry } from '../../api/product-center/cleanup-registry';
import type { ProductCenterApi } from '../../api/product-center/product-center-api';
import { test } from '../../fixtures/product-center.fixture';
import { ItemEditFlow } from '../../flows/item-edit.flow';
import { TagManagementPage } from '../../pages/product-center/tag-management.page';
import { ProductCenterItemCreateDataFactory } from '../../test-data/product-center/product-center-item-create-data.factory';

type NamedRecord = { id: number; name: string };

const badgeStyle = JSON.stringify({
  backgroundColor: '#E6F4FF',
  color: '#1677FF',
  domTpl: '',
  cornerType: 'pillShape',
  domTemplate: '',
});

test.describe('标签与商品关联运行审计', () => {
  test.describe.configure({ mode: 'serial', timeout: 300_000 });

  for (const definition of [
    { kind: 'description' as const, type: 1 as const, code: 'D28' },
    { kind: 'statistic' as const, type: 3 as const, code: 'S28' },
  ]) {
    test(`${definition.kind} 标签改名后引用商品同步审计`, async ({
      page,
      productCenterApi,
      cleanupRegistry,
    }, testInfo) => {
      const suffix = String(Date.now()).slice(-8);
      await deleteTagResidue(productCenterApi, definition.type, `AUTO_AUDIT_${definition.code}_`);
      await deleteGroupResidue(productCenterApi, definition.type, `AUTO_AUDIT_G${definition.code}_`);
      const groupName = `AUTO_AUDIT_G${definition.code}_${suffix}`;
      const originalName = `AUTO_AUDIT_${definition.code}${suffix.slice(-4)}`;
      const editedName = `${originalName}_E`;
      const groupResponse = await productCenterApi.createTagGroup({ name: groupName, type: definition.type });
      const group = findNamedRecord(groupResponse, groupName)
        ?? findNamedRecord(await productCenterApi.tagGroupList(definition.type), groupName);
      expect(group).toBeDefined();
      registerGroupCleanup(productCenterApi, cleanupRegistry, definition.type, group!);
      const tagResponse = definition.type === 1
        ? await productCenterApi.createDescriptionTag({ name: originalName, groupId: group!.id })
        : await productCenterApi.createStatTag({ name: originalName, groupId: group!.id });
      const tag = findNamedRecord(tagResponse, originalName)
        ?? findNamedRecord(await productCenterApi.tagPage(definition.type), originalName);
      expect(tag).toBeDefined();
      registerTagCleanup(productCenterApi, cleanupRegistry, definition.type, tag!, [originalName, editedName]);

      const itemFactory = new ProductCenterItemCreateDataFactory(productCenterApi);
      const items = [];
      for (const index of [1, 2]) {
        const item = await itemFactory.createSingleSkuBrandProduct('group-reference-owner', cleanupRegistry, {
          identity: `AUTO_AUDIT_${definition.code}I${index}_${suffix}`,
          cleanupOrder: 60,
        });
        items.push(item);
        await productCenterApi.bindTagToProduct({ itemId: item.id, groupId: group!.id, tagId: tag!.id });
      }
      const beforeDetails = await Promise.all(items.map((item) => productCenterApi.productDetail(item.id)));
      const tagPage = new TagManagementPage(page);
      await tagPage.open(definition.kind);
      const submission = await tagPage.editNameAndSubmit(originalName, editedName, definition.kind);
      expect(submission.ok).toBe(true);
      const editedTag = findNamedRecord(await productCenterApi.tagPage(definition.type), editedName);
      expect(editedTag?.id).toBe(tag!.id);
      const afterDetails = await Promise.all(items.map((item) => productCenterApi.productDetail(item.id)));
      const editPage = await new ItemEditFlow().openEditByItemName(page, items[0].originalIdentity, 'standard');
      const uiSelected = await editPage.readOtherSettingsSelectedNames([originalName, editedName]);
      const cleanup = await cleanupRegistry.cleanupAll();
      await testInfo.attach(`tag-${definition.code}-association-audit`, {
        body: Buffer.from(JSON.stringify({
          kind: definition.kind,
          group,
          tag,
          items: items.map((item) => ({ id: item.id, name: item.originalIdentity })),
          submission,
          beforeDetails,
          afterDetails,
          uiSelected,
          cleanup,
        }, null, 2)),
        contentType: 'application/json',
      });
    });
  }

  test('角标有效期与商品关联审计', async ({
    page,
    productCenterApi,
    cleanupRegistry,
  }, testInfo) => {
    const suffix = String(Date.now()).slice(-8);
    const validName = `AUTO_AUDIT_B18${suffix.slice(-4)}`;
    const validResponse = await productCenterApi.createCornerMark({
      name: validName,
      startTimeLocal: '2026-08-17 00:00:00',
      endTimeLocal: '2026-08-18 23:59:59',
      styleConfig: badgeStyle,
    });
    const validBadge = findNamedRecord(validResponse, validName)
      ?? findNamedRecord(await productCenterApi.cornerMarkPage(validName), validName);
    expect(validBadge).toBeDefined();
    registerBadgeCleanup(productCenterApi, cleanupRegistry, validBadge!);
    const itemFactory = new ProductCenterItemCreateDataFactory(productCenterApi);
    const item = await itemFactory.createSingleSkuBrandProduct('group-reference-owner', cleanupRegistry, {
      identity: `AUTO_AUDIT_B18I_${suffix}`,
      cleanupOrder: 60,
    });
    const editPage = await new ItemEditFlow().openEditByItemName(page, item.originalIdentity, 'standard');
    const selected = await editPage.selectCornerMarkByName(validName);
    const responsePromise = page.waitForResponse((response) => (
      response.request().method() === 'PUT'
      && new URL(response.url()).pathname.endsWith(`/ops-brand/brand-items/standard/${item.id}`)
    ), { timeout: 60_000 });
    await editPage.clickSave();
    const saveResponse = await responsePromise;
    expect(saveResponse.ok()).toBe(true);
    const reopened = await new ItemEditFlow().openEditByItemName(page, item.originalIdentity, 'standard');
    const replay = await reopened.readSelectedCornerMarks([validName]);
    expect(replay).toEqual([validName]);
    const validProductDetail = await productCenterApi.productDetail(item.id);
    expect(readProductTagNames(validProductDetail, 'cornerList')).toContain(validName);
    const expiryUpdate = await productCenterApi.updateCornerMark(validBadge!.id, {
      name: validName,
      startTimeLocal: '2026-08-15 00:00:00',
      endTimeLocal: '2026-08-16 23:59:59',
      styleConfig: badgeStyle,
    });
    const expiredProductDetail = await productCenterApi.productDetail(item.id);
    const expiredReopened = await new ItemEditFlow().openEditByItemName(page, item.originalIdentity, 'standard');
    const expiredReplay = await expiredReopened.readSelectedCornerMarks([validName]);
    const retainedBadge = findNamedRecord(await productCenterApi.cornerMarkPage(validName), validName);
    const cleanup = await cleanupRegistry.cleanupAll();
    await testInfo.attach('tag-badge-validity-association-audit', {
      body: Buffer.from(JSON.stringify({
        validBadge,
        selected,
        replay,
        validProductDetail,
        expiryUpdate,
        expiredProductDetail,
        expiredReplay,
        retainedBadge,
        cleanup,
      }, null, 2)),
      contentType: 'application/json',
    });
  });
});

function findNamedRecords(value: unknown, name: string): NamedRecord[] {
  const records: NamedRecord[] = [];
  const visit = (candidate: unknown): void => {
    if (Array.isArray(candidate)) {
      candidate.forEach(visit);
      return;
    }
    if (!candidate || typeof candidate !== 'object') return;
    const record = candidate as Record<string, unknown>;
    if (typeof record.id === 'number' && record.name === name) records.push({ id: record.id, name });
    Object.values(record).forEach(visit);
  };
  visit(value);
  return [...new Map(records.map((record) => [record.id, record])).values()];
}

function readProductTagNames(value: unknown, listKey: 'cornerList'): string[] {
  if (!value || typeof value !== 'object') return [];
  const data = (value as Record<string, unknown>).data;
  if (!data || typeof data !== 'object') return [];
  const list = (data as Record<string, unknown>)[listKey];
  if (!Array.isArray(list)) return [];
  return list.flatMap((group) => {
    if (!group || typeof group !== 'object') return [];
    const tags = (group as Record<string, unknown>).brandItemTagList;
    if (!Array.isArray(tags)) return [];
    return tags.flatMap((tag) => (
      tag && typeof tag === 'object' && typeof (tag as Record<string, unknown>).tagName === 'string'
        ? [(tag as Record<string, unknown>).tagName as string]
        : []
    ));
  });
}

function findNamedRecord(value: unknown, name: string): NamedRecord | undefined {
  return findNamedRecords(value, name)[0];
}

function registerGroupCleanup(
  api: ProductCenterApi,
  registry: CleanupRegistry,
  type: 1 | 3,
  record: NamedRecord,
): void {
  registry.register({
    entity: '标签组关联审计',
    identity: record.name,
    checkpoint: { entryId: `tag-group-association-${record.id}`, entityKind: 'tag-group', serverId: record.id, identityVariants: [record.name], cleanupOrder: 20 },
    execute: async () => {
      if (findNamedRecord(await api.tagGroupList(type), record.name)) await api.deleteTagGroup(record.id);
    },
    verify: async () => !findNamedRecord(await api.tagGroupList(type), record.name),
  });
}

function registerTagCleanup(
  api: ProductCenterApi,
  registry: CleanupRegistry,
  type: 1 | 3,
  record: NamedRecord,
  names: string[],
): void {
  registry.register({
    entity: '标签关联审计',
    identity: record.name,
    checkpoint: {
      entryId: `tag-association-${record.id}`,
      entityKind: type === 1 ? 'description-tag' : 'statistic-tag',
      serverId: record.id,
      identityVariants: names,
      cleanupOrder: 40,
    },
    execute: async () => {
      const page = await api.tagPage(type);
      if (findRecordById(page, record.id)) await api.deleteTag(record.id);
    },
    verify: async () => {
      const page = await api.tagPage(type);
      return !findRecordById(page, record.id)
        && names.every((name) => !findNamedRecords(page, name).some((item) => item.id === record.id));
    },
  });
}

function findRecordById(value: unknown, id: number): NamedRecord | undefined {
  let found: NamedRecord | undefined;
  const visit = (candidate: unknown): void => {
    if (found) return;
    if (Array.isArray(candidate)) {
      candidate.forEach(visit);
      return;
    }
    if (!candidate || typeof candidate !== 'object') return;
    const record = candidate as Record<string, unknown>;
    if (record.id === id && typeof record.name === 'string') {
      found = { id, name: record.name };
      return;
    }
    Object.values(record).forEach(visit);
  };
  visit(value);
  return found;
}

async function deleteTagResidue(api: ProductCenterApi, type: 1 | 3, prefix: string): Promise<void> {
  const page = await api.tagPage(type);
  for (const record of findRecordsByPrefix(page, prefix)) await api.deleteTag(record.id);
}

async function deleteGroupResidue(api: ProductCenterApi, type: 1 | 3, prefix: string): Promise<void> {
  const page = await api.tagGroupList(type);
  for (const record of findRecordsByPrefix(page, prefix)) await api.deleteTagGroup(record.id);
}

function findRecordsByPrefix(value: unknown, prefix: string): NamedRecord[] {
  const records: NamedRecord[] = [];
  const visit = (candidate: unknown): void => {
    if (Array.isArray(candidate)) {
      candidate.forEach(visit);
      return;
    }
    if (!candidate || typeof candidate !== 'object') return;
    const record = candidate as Record<string, unknown>;
    if (typeof record.id === 'number' && typeof record.name === 'string' && record.name.startsWith(prefix)) {
      records.push({ id: record.id, name: record.name });
    }
    Object.values(record).forEach(visit);
  };
  visit(value);
  return [...new Map(records.map((record) => [record.id, record])).values()];
}

function registerBadgeCleanup(api: ProductCenterApi, registry: CleanupRegistry, record: NamedRecord): void {
  registry.register({
    entity: '角标关联审计',
    identity: record.name,
    checkpoint: { entryId: `badge-association-${record.id}`, entityKind: 'corner-mark', serverId: record.id, identityVariants: [record.name], cleanupOrder: 40 },
    execute: async () => {
      if (findNamedRecord(await api.cornerMarkPage(record.name), record.name)) await api.deleteCornerMark(record.id);
    },
    verify: async () => !findNamedRecord(await api.cornerMarkPage(record.name), record.name),
  });
}
