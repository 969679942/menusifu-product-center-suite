import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { deflateSync } from 'node:zlib';
import type { APIRequestContext } from '@playwright/test';
import type { CleanupRegistry } from '../../../api/product-center/cleanup-registry';
import { extractCreatedRecord } from '../../../api/product-center/created-record';
import type { ProductCenterApi } from '../../../api/product-center/product-center-api';
import { callOperation } from '../../../api/operation-client';
import { runtimeConfig } from '../../../api/runtime-config';
import { nextAuditTimestamp } from '../audit-identity';
import { waitUntil } from '../../../utils/wait';
import {
  ProductCenterItemCreateDataFactory,
  type ProductCenterItemCreateContext,
  type ProductCenterItemCreateRecord,
} from '../product-center-item-create-data.factory';
import {
  readMainImageEvidence,
  type StandardItem216MainImageEvidence,
} from './standard-item-216.factory';

export type AddonItem216Context = ProductCenterItemCreateContext & {
  productType: 'side';
  caseId: string;
};

export type AddonGroup216Record = {
  id: number;
  name: string;
  checkpointEntryId: string;
  itemReferences: readonly AddonGroupItem216Record[];
};

export type AddonGroupItem216Record = {
  id: number;
  groupId: number;
  itemId: number;
  skuId?: number;
};

export type AddonUploadFixture = {
  filePath: string;
  dispose: () => void;
};

export type AddonMenu216Record = {
  menuId: number;
  menuName: string;
  subMenuId: number;
  subMenuName: string;
  blockId: number;
  blockName: string;
};

export type AddonMenuBinding216Record = {
  id: number;
  menuId: number;
  subMenuId: number;
  blockId: number;
  itemId: number;
  identity: string;
};

export type AddonSyncJob216Record = {
  id: number;
  identity: string;
};

export type AddonNamedFixture216Record = {
  id: number;
  name: string;
  checkpointEntryId: string;
};

export type AddonOwnerFixture216Record = ProductCenterItemCreateRecord & {
  operation: 'brand-menu:POST /ops-brand/brand-items/standard';
  payload: Record<string, unknown>;
};

export class AddonItem216Factory {
  private readonly itemFactory: ProductCenterItemCreateDataFactory;

  constructor(
    private readonly api: ProductCenterApi,
    private readonly request?: APIRequestContext,
  ) {
    this.itemFactory = new ProductCenterItemCreateDataFactory(api);
  }

  prepare(caseId: string, timestamp = nextAuditTimestamp()): AddonItem216Context {
    const normalizedCaseId = caseId.replace(/[^A-Z0-9-]/gi, '_');
    const identity = `AUTO_AUDIT_ADDON_216_${normalizedCaseId}_${timestamp}`;
    return {
      entityKey: 'item',
      productType: 'side',
      originalIdentity: identity,
      price: '10.00',
      minimumOrderQuantity: '1',
      caseId,
    };
  }

  async assertItemAbsent(identity: string): Promise<void> {
    const count = await this.itemFactory.itemRecordCount(identity);
    if (count !== 0) throw new Error(`加料商品审计身份已存在：${identity} count=${count}`);
  }

  async registerItem(
    context: ProductCenterItemCreateContext,
    responseBody: unknown,
    cleanupRegistry: CleanupRegistry,
    cleanupOptions: { cleanupOrder?: number; dependencyOf?: string; serverId?: number } = {},
  ): Promise<ProductCenterItemCreateRecord> {
    if (context.originalIdentity.length >= 128) {
      const record = extractCreatedRecord(responseBody, context.originalIdentity);
      if (!record) throw new Error(`长名称加料商品创建响应缺少服务端 ID：${context.originalIdentity}`);
      const checkpointEntryId = `item-${record.id}`;
      cleanupRegistry.register({
        entity: '加料商品',
        identity: context.originalIdentity,
        checkpoint: {
          entryId: checkpointEntryId,
          entityKind: 'item',
          serverId: record.id,
          identityVariants: [context.originalIdentity],
          cleanupOrder: 50,
        },
        execute: async () => {
          const residue = await this.itemRecords(context.originalIdentity);
          if (residue.some((item) => item.id === record.id)) await this.api.deleteBomProduct(record.id);
        },
        verify: async () => !(await this.itemRecords(context.originalIdentity)).some((item) => item.id === record.id),
      });
      return { ...context, id: record.id, checkpointEntryId };
    }
    return this.itemFactory.registerCreated(context, responseBody, cleanupRegistry, cleanupOptions);
  }

  async itemCount(identity: string): Promise<number> {
    return (await this.itemRecords(identity)).length;
  }

  async itemRecords(identity: string): Promise<Array<{ id: number; name: string }>> {
    const queryIdentity = identity.length >= 128 ? identity.slice(0, 100) : identity;
    return findProductRecords(await this.api.productPage(queryIdentity), identity);
  }

  async readMainImageEvidence(itemId: number): Promise<StandardItem216MainImageEvidence> {
    return readMainImageEvidence(await this.api.productDetail(itemId));
  }

  async cleanupAuditItemIds(identity: string, serverIds: readonly number[]): Promise<{ deletedServerIds: number[] }> {
    if (!identity.startsWith('AUTO_AUDIT_')) throw new Error(`拒绝清理非审计身份：${identity}`);
    const deletedServerIds: number[] = [];
    for (const serverId of [...new Set(serverIds)]) {
      const current = await this.itemRecords(identity);
      if (!current.some((record) => record.id === serverId)) continue;
      try {
        await this.api.deleteBomProduct(serverId);
        deletedServerIds.push(serverId);
      } catch (error) {
        const remaining = await this.itemRecords(identity);
        if (remaining.some((record) => record.id === serverId)) throw error;
      }
    }
    return { deletedServerIds };
  }

  async cleanupAuditItemsByIdentity(identity: string): Promise<{ deletedServerIds: number[]; count: 0 }> {
    if (!identity.startsWith('AUTO_AUDIT_')) throw new Error(`拒绝清理非审计身份：${identity}`);
    const records = await this.itemRecords(identity);
    const cleanup = await this.cleanupAuditItemIds(identity, records.map((record) => record.id));
    const count = await this.itemCount(identity);
    if (count !== 0) throw new Error(`审计身份恢复清理后仍有残留：${identity} count=${count}`);
    return { deletedServerIds: cleanup.deletedServerIds, count: 0 };
  }

  async registerAddonGroup(
    name: string,
    responseBody: unknown,
    cleanupRegistry: CleanupRegistry,
    expectedItemId?: number,
  ): Promise<AddonGroup216Record> {
    const responseRecord = extractCreatedRecord(responseBody, name);
    const record = responseRecord ?? findUniqueNamedRecord(await this.api.addonGroupList(name), name);
    const checkpointEntryId = `addon-${record.id}`;
    cleanupRegistry.register({
      entity: '加料组',
      identity: name,
      checkpoint: {
        entryId: checkpointEntryId,
        entityKind: 'addon',
        serverId: record.id,
        identityVariants: [name],
        cleanupOrder: 40,
      },
      execute: async () => {
        try {
          await this.api.deleteAddonGroup(record.id);
        } catch (error) {
          if (await addonGroupExistsById(this.api, record.id)) throw error;
        }
        for (const residue of findNamedRecords(await this.api.addonGroupList(name), name)) {
          if (residue.id !== record.id) await this.api.deleteAddonGroup(residue.id);
        }
      },
      verify: async () => !await addonGroupExistsById(this.api, record.id)
        && findNamedRecords(await this.api.addonGroupList(name), name).length === 0,
    });
    const itemReferences = expectedItemId === undefined
      ? []
      : await this.ensureAddonGroupItem(record.id, expectedItemId, name, cleanupRegistry, checkpointEntryId);
    return { id: record.id, name, checkpointEntryId, itemReferences };
  }

  private async ensureAddonGroupItem(
    groupId: number,
    itemId: number,
    groupName: string,
    cleanupRegistry: CleanupRegistry,
    groupCheckpointEntryId: string,
  ): Promise<AddonGroupItem216Record[]> {
    let references = findAddonGroupItemRecords(await this.api.addonGroupDetail(groupId), groupId, itemId);
    if (references.length === 0) {
      const skuId = findItemSkuId(await this.api.productDetail(itemId));
      const response = await this.api.createAddonGroupItem({ groupId, itemId, ...(skuId === undefined ? {} : { skuId }) });
      const created = extractCreatedAddonGroupItem(response, groupId, itemId);
      references = created ? [created] : findAddonGroupItemRecords(await this.api.addonGroupDetail(groupId), groupId, itemId);
    }
    if (references.length !== 1) {
      throw new Error(`加料组商品关联未形成唯一终态：${JSON.stringify({ groupId, itemId, count: references.length })}`);
    }
    for (const reference of references) {
      const identity = `${groupName}_ITEM_${reference.itemId}`;
      cleanupRegistry.register({
        entity: '审计加料组商品关联',
        identity,
        checkpoint: {
          entryId: `addon-group-item-${reference.id}`,
          entityKind: 'addon',
          serverId: reference.id,
          identityVariants: [identity],
          cleanupOrder: 45,
          dependencyOf: groupCheckpointEntryId,
        },
        execute: async () => {
          try { await this.api.deleteAddonGroupItem(reference.id); } catch {
            const remaining = findAddonGroupItemRecords(await this.api.addonGroupDetail(groupId), groupId, itemId);
            if (remaining.some((item) => item.id === reference.id)) throw new Error(`加料组商品关联删除未确认：${reference.id}`);
          }
        },
        verify: async () => !findAddonGroupItemRecords(await this.api.addonGroupDetail(groupId), groupId, itemId)
          .some((item) => item.id === reference.id),
      });
    }
    return references;
  }

  async addonGroupCount(name: string): Promise<number> {
    return findNamedRecords(await this.api.addonGroupList(name), name).length;
  }

  async readAddonGroupReferenceEvidence(
    groupId: number,
    itemId: number,
  ): Promise<{ groupId: number; itemId: number; referenceIds: number[]; linked: boolean }> {
    const references = findAddonGroupItemRecords(await this.api.addonGroupDetail(groupId), groupId, itemId);
    return {
      groupId,
      itemId,
      referenceIds: references.map((reference) => reference.id),
      linked: references.length === 1,
    };
  }

  async readAddonOwnerReferenceEvidence(
    ownerId: number,
    groupId: number,
    groupItemId: number,
    addonItemId: number,
  ): Promise<{
    ownerId: number;
    groupId: number;
    groupItemId: number;
    addonItemId: number;
    linked: boolean;
  }> {
    return {
      ownerId,
      groupId,
      groupItemId,
      addonItemId,
      linked: hasAddonOwnerReference(
        await this.api.productDetail(ownerId),
        groupId,
        groupItemId,
        ownerId,
        addonItemId,
      ),
    };
  }

  async createStatisticTagFixtures(
    caseId: string,
    count: number,
    cleanupRegistry: CleanupRegistry,
  ): Promise<AddonNamedFixture216Record[]> {
    const suffix = normalizeCaseId(caseId);
    const groupName = `AUTO_AUDIT_${suffix}_STAT_GROUP`;
    const groupResponse = await this.api.createTagGroup({ name: groupName, type: 3 });
    const group = extractCreatedRecord(groupResponse, groupName)
      ?? findUniqueNamedRecord(await this.api.tagGroupList(3), groupName);
    const groupCheckpointEntryId = `addon-stat-group-${group.id}`;
    cleanupRegistry.register({
      entity: '加料商品统计标签组',
      identity: groupName,
      checkpoint: {
        entryId: groupCheckpointEntryId,
        entityKind: 'tag-group',
        serverId: group.id,
        identityVariants: [groupName],
        cleanupOrder: 30,
      },
      execute: async () => {
        for (const residue of findNamedRecords(await this.api.tagGroupList(3), groupName)) {
          await this.api.deleteTagGroup(residue.id);
        }
      },
      verify: async () => findNamedRecords(await this.api.tagGroupList(3), groupName).length === 0,
    });

    const records: AddonNamedFixture216Record[] = [];
    for (let index = 0; index < count; index += 1) {
      const name = `AUTO_AUDIT_${suffix}_STAT_${index + 1}`;
      const response = await this.api.createStatTag({ name, groupId: group.id });
      const record = extractCreatedRecord(response, name)
        ?? findUniqueNamedRecord(await this.api.tagPage(3), name);
      const checkpointEntryId = `addon-stat-tag-${record.id}`;
      cleanupRegistry.register({
        entity: '加料商品统计标签',
        identity: name,
        checkpoint: {
          entryId: checkpointEntryId,
          entityKind: 'statistic-tag',
          serverId: record.id,
          identityVariants: [name],
          cleanupOrder: 35,
          dependencyOf: groupCheckpointEntryId,
        },
        execute: async () => {
          for (const residue of findNamedRecords(await this.api.tagPage(3), name)) {
            await this.api.deleteTag(residue.id);
          }
        },
        verify: async () => findNamedRecords(await this.api.tagPage(3), name).length === 0,
      });
      records.push({ id: record.id, name, checkpointEntryId });
    }
    return records;
  }

  async createMaterialFixture(
    caseId: string,
    cleanupRegistry: CleanupRegistry,
  ): Promise<AddonNamedFixture216Record> {
    const suffix = `${normalizeCaseId(caseId)}_${nextAuditTimestamp()}`;
    const categoryName = `AUTO_AUDIT_${suffix}_MATERIAL_CATEGORY`;
    const categoryResponse = await this.api.createMaterialCategory({
      name: categoryName,
      secondName: `${categoryName}_SECOND`,
    });
    const category = extractCreatedRecord(categoryResponse, categoryName)
      ?? findUniqueNamedRecord(await this.api.materialCategoryTree(), categoryName);
    const categoryCheckpointEntryId = `addon-material-category-${category.id}`;
    cleanupRegistry.register({
      entity: '加料商品原料分类',
      identity: categoryName,
      checkpoint: {
        entryId: categoryCheckpointEntryId,
        entityKind: 'category',
        serverId: category.id,
        identityVariants: [categoryName],
        cleanupOrder: 30,
      },
      execute: async () => {
        for (const residue of findNamedRecords(await this.api.materialCategoryTree(), categoryName)) {
          await this.api.deleteCategory(residue.id);
        }
      },
      verify: async () => findNamedRecords(await this.api.materialCategoryTree(), categoryName).length === 0,
    });

    const name = `AUTO_AUDIT_${suffix}_MATERIAL`;
    const response = await this.api.createMaterial({
      name,
      secondName: `${name}_SECOND`,
      categoryId: category.id,
      code: `A${Date.now().toString().slice(-12)}`,
      description: 'AUTO_AUDIT addon ingredient fixture',
    });
    const record = extractCreatedRecord(response, name)
      ?? findUniqueNamedRecord(await this.api.materialPage(name), name);
    const checkpointEntryId = `addon-material-${record.id}`;
    cleanupRegistry.register({
      entity: '加料商品原料',
      identity: name,
      checkpoint: {
        entryId: checkpointEntryId,
        entityKind: 'material',
        serverId: record.id,
        identityVariants: [name],
        cleanupOrder: 40,
        dependencyOf: categoryCheckpointEntryId,
      },
      execute: async () => {
        for (const residue of findNamedRecords(await this.api.materialPage(name), name)) {
          await this.api.deleteMaterial(residue.id);
        }
      },
      verify: async () => findNamedRecords(await this.api.materialPage(name), name).length === 0,
    });
    return { id: record.id, name, checkpointEntryId };
  }

  async createIngredientInfoFixtures(
    caseId: string,
    cleanupRegistry: CleanupRegistry,
  ): Promise<{
    ingredient: AddonNamedFixture216Record;
    allergen: AddonNamedFixture216Record;
    nutrition: AddonNamedFixture216Record;
  }> {
    const ingredient = await this.createMaterialFixture(caseId, cleanupRegistry);
    const allergen = await this.readExistingNamedBrandResource(
      'brand-menu:GET /ops-brand/brand-allergens/all',
      '加料商品过敏原',
    );
    const nutrition = await this.readExistingNamedBrandResource(
      'brand-menu:GET /ops-brand/brand-nutritions/all',
      '加料商品营养成分',
    );
    return { ingredient, allergen, nutrition };
  }

  private async readExistingNamedBrandResource(
    operation: string,
    entity: string,
  ): Promise<AddonNamedFixture216Record> {
    if (!this.request) throw new Error(`${entity} 只读夹具缺少认证 APIRequestContext`);
    const response = await callOperation(this.request, operation);
    const body = await response.json().catch(() => null);
    if (!response.ok() || body?.success === false) {
      throw new Error(`${entity}只读夹具查询失败 HTTP ${response.status()}：${JSON.stringify(body)}`);
    }
    const record = findFirstEnabledNamedResource(body);
    if (!record) throw new Error(`TEST_DATA_BLOCKED ${entity} 未观察到可选择的启用资源：operation=${operation}`);
    return {
      id: record.id,
      name: record.name,
      checkpointEntryId: `N/A:read-only-${entity}-${record.id}`,
    };
  }

  async createBrandImageFixture(
    name: string,
    imagePath: string,
    cleanupRegistry: CleanupRegistry,
  ): Promise<AddonNamedFixture216Record> {
    if (!this.request) throw new Error('品牌图片夹具缺少认证 APIRequestContext');
    const response = await callOperation(this.request, 'brand-menu:POST /ops-brand/brand-images', {
      body: { name, imagePath },
    });
    const responseBody = await response.json().catch(() => null);
    if (!response.ok() || responseBody?.success === false) {
      throw new Error(`品牌图片夹具创建失败 HTTP ${response.status()}：${JSON.stringify(responseBody)}`);
    }
    return this.itemFactory.registerBrandImageCreated(name, responseBody, cleanupRegistry);
  }

  async registerUploadedBrandImageFixture(
    candidateNames: readonly string[],
    cleanupRegistry: CleanupRegistry,
  ): Promise<AddonNamedFixture216Record> {
    const candidates = [...new Set(candidateNames)];
    const match = await waitUntil(
      async () => {
        for (const name of candidates) {
          const response = await this.api.brandImageList(name);
          const records = findNamedRecords(response, name);
          if (records.length === 1) return { name, response, count: 1 };
          if (records.length > 1) return { name, response, count: records.length };
        }
        return { name: '', response: undefined, count: 0 };
      },
      (state) => state.count === 1,
      { timeout: 15_000, interval: 500, message: `上传图片未形成唯一品牌图片资源：${JSON.stringify(candidates)}` },
    ).catch(() => undefined);
    if (match?.response) {
      return this.itemFactory.registerBrandImageCreated(match.name, match.response, cleanupRegistry);
    }
    throw new Error(`上传 operation 完成后未找到唯一品牌图片：${JSON.stringify(candidateNames)}`);
  }

  async registerUploadedBrandImageFixtures(
    candidateNameGroups: readonly (readonly string[])[],
    cleanupRegistry: CleanupRegistry,
  ): Promise<AddonNamedFixture216Record[]> {
    const records: AddonNamedFixture216Record[] = [];
    for (const candidateNames of candidateNameGroups) {
      records.push(await this.registerUploadedBrandImageFixture(candidateNames, cleanupRegistry));
    }
    return records;
  }

  async createMenuBinding(
    menu: AddonMenu216Record,
    itemId: number,
    itemIdentity: string,
    cleanupRegistry: CleanupRegistry,
  ): Promise<{ binding: AddonMenuBinding216Record; operation: Record<string, unknown> }> {
    const response = await this.api.createMenuBlockItems([{ blockId: menu.blockId, itemId, sortOrder: 0 }]);
    const binding = await this.registerMenuBinding(menu, itemId, itemIdentity, cleanupRegistry);
    return {
      binding,
      operation: {
        method: 'POST',
        path: '/ops-brand/brand-block-item/batchCreate',
        responseObserved: response !== undefined,
        blockId: menu.blockId,
        itemId,
      },
    };
  }

  async createStandardOwnerFixture(
    context: AddonItem216Context,
    ownerIdentity: string,
    group: AddonGroup216Record,
    addonItemId: number,
    cleanupRegistry: CleanupRegistry,
  ): Promise<AddonOwnerFixture216Record> {
    if (!this.request) throw new Error('标准商品 owner 夹具缺少认证 APIRequestContext');
    const groupItem = group.itemReferences.find((item) => item.itemId === addonItemId);
    if (!groupItem) throw new Error(`标准商品 owner 夹具缺少加料组项关联：${JSON.stringify({ groupId: group.id, addonItemId })}`);
    const payload = buildAddonOwnerPayload216(ownerIdentity, group.id, groupItem.id);
    const operation = 'brand-menu:POST /ops-brand/brand-items/standard' as const;
    const response = await callOperation(this.request, operation, { body: payload });
    const responseBody = await response.json().catch(() => null);
    if (!response.ok() || responseBody?.success === false) {
      throw new Error(`标准商品 owner 创建失败 HTTP ${response.status()}：${JSON.stringify(responseBody)}`);
    }
    const record = await this.itemFactory.registerCreated(
      { ...context, productType: 'standard', originalIdentity: ownerIdentity },
      responseBody,
      cleanupRegistry,
      { cleanupOrder: 60 },
    );
    let detail = await waitUntil(
      () => this.api.productDetail(record.id),
      (value) => hasAddonOwnerReference(value, group.id, groupItem.id, record.id, addonItemId),
      { timeout: 3_000, interval: 500, probeTimeout: 5_000, message: `标准商品 owner 加料引用未在创建终态回读：${record.id}` },
    ).catch(() => this.api.productDetail(record.id));
    if (hasAddonOwnerReference(detail, group.id, groupItem.id, record.id, addonItemId)) {
      return { ...record, operation, payload };
    }
    const addonGroup = payload.addGroupList;
    if (!Array.isArray(addonGroup) || addonGroup.length !== 1) {
      throw new Error(`标准商品 owner 属性更新载荷缺少唯一加料组：${ownerIdentity}`);
    }
    const additionList = addonGroup as Record<string, unknown>[];
    const attributeUpdateResponses: unknown[] = [];
    attributeUpdateResponses.push(await this.api.updateItemAddonAttributes({
      itemIds: [record.id],
      addon: {
        operationType: 1,
        additionList,
        removeList: [],
      },
    }));
    detail = undefined;
    try {
      detail = await waitUntil(
        () => this.api.productDetail(record.id),
        (value) => hasAddonOwnerReference(value, group.id, groupItem.id, record.id, addonItemId),
        { timeout: 3_000, interval: 500, probeTimeout: 5_000, message: `标准商品 owner 加料引用未在新增终态回读：${record.id}` },
      );
    } catch {
      attributeUpdateResponses.push(await this.api.updateItemAddonAttributes({
        itemIds: [record.id],
        addon: { operationType: 2, additionList, removeList: [] },
      }));
      detail = await waitUntil(
        () => this.api.productDetail(record.id),
        (value) => hasAddonOwnerReference(value, group.id, groupItem.id, record.id, addonItemId),
        { timeout: 3_000, interval: 500, probeTimeout: 5_000, message: `标准商品 owner 加料引用未在覆盖终态回读：${record.id}` },
      ).catch(() => this.api.productDetail(record.id));
      if (!hasAddonOwnerReference(detail, group.id, groupItem.id, record.id, addonItemId)) {
        const detailData = detail && typeof detail === 'object' && 'data' in detail
          ? (detail as { data?: unknown }).data
          : undefined;
        const currentItemBasic = detailData && typeof detailData === 'object' && 'itemBasic' in detailData
          ? (detailData as { itemBasic?: unknown }).itemBasic
          : undefined;
        const currentVersion = currentItemBasic && typeof currentItemBasic === 'object'
          ? currentItemBasic as Record<string, unknown>
          : {};
        attributeUpdateResponses.push(await this.api.updateStandardItem(record.id, {
          ...payload,
          itemBasic: {
            ...(payload.itemBasic as Record<string, unknown>),
            id: record.id,
            ...(currentVersion.updatedAt === undefined ? {} : { updatedAt: currentVersion.updatedAt }),
            ...(currentVersion.version === undefined ? {} : { version: currentVersion.version }),
          },
        }));
        detail = await waitUntil(
          () => this.api.productDetail(record.id),
          (value) => hasAddonOwnerReference(value, group.id, groupItem.id, record.id, addonItemId),
          { timeout: 3_000, interval: 500, probeTimeout: 5_000, message: `标准商品 owner 加料引用未在完整保存终态回读：${record.id}` },
        ).catch(() => this.api.productDetail(record.id));
      }
    }
    if (!hasAddonOwnerReference(detail, group.id, groupItem.id, record.id, addonItemId)) {
      throw new Error(`标准商品 owner 未回读到真实加料引用：${JSON.stringify({
        ownerId: record.id,
        groupId: group.id,
        groupItemId: groupItem.id,
        addonItemId,
        attributeUpdateResponses,
        observedAddonNodes: collectAddonNodes(detail),
      })}`);
    }
    return { ...record, operation, payload };
  }

  async createMenuFixture(itemIdentity: string, itemId: number, cleanupRegistry: CleanupRegistry): Promise<AddonMenu216Record> {
    const menuName = `${itemIdentity}_MENU`;
    const menuCode = `AUTO${Date.now().toString().slice(-10)}`;
    const menuResponse = await this.api.createMenu({ name: menuName, secondName: `${menuName}_SECOND`, code: menuCode });
    const menu = extractCreatedRecord(menuResponse, menuName) ?? findUniqueNamedRecord(await this.api.menuPage(menuName), menuName);
    const subMenuName = `${menuName}_PAGE_1`;
    const subMenu = findUniqueNamedRecord(await this.api.menuSubMenuList(menu.id), subMenuName);
    const blockName = `${menuName}_BLOCK`;
    const blockResponse = await this.api.createMenuBlock({
      subMenuId: subMenu.id,
      code: `B${Date.now().toString().slice(-11)}`,
      name: blockName,
      secondName: `${blockName}_SECOND`,
    });
    const block = extractCreatedRecord(blockResponse, blockName) ?? findUniqueNamedRecord(await this.api.menuBlockSearch(blockName), blockName);

    cleanupRegistry.register({
      entity: '审计菜单',
      identity: menuName,
      checkpoint: {
        entryId: `addon-menu-${menu.id}`,
        entityKind: 'menu',
        serverId: menu.id,
        identityVariants: [menuName],
        cleanupOrder: 20,
      },
      execute: async () => {
        const residue = findNamedRecords(await this.api.menuPage(menuName), menuName);
        if (residue.length > 0) await this.api.deleteMenu(residue[0].id);
      },
      verify: async () => findNamedRecords(await this.api.menuPage(menuName), menuName).length === 0,
    });
    cleanupRegistry.register({
      entity: '审计菜单区块',
      identity: blockName,
      checkpoint: {
        entryId: `addon-menu-block-${block.id}`,
        entityKind: 'menu',
        serverId: block.id,
        identityVariants: [blockName],
        cleanupOrder: 30,
        dependencyOf: `addon-menu-${menu.id}`,
      },
      execute: async () => {
        const residue = findNamedRecords(await this.api.menuBlockSearch(blockName), blockName);
        if (residue.length > 0) await this.api.deleteMenuBlock(residue[0].id);
      },
      verify: async () => findNamedRecords(await this.api.menuBlockSearch(blockName), blockName).length === 0,
    });

    return { menuId: menu.id, menuName, subMenuId: subMenu.id, subMenuName, blockId: block.id, blockName };
  }

  async registerMenuBinding(
    menu: AddonMenu216Record,
    itemId: number,
    itemIdentity: string,
    cleanupRegistry: CleanupRegistry,
  ): Promise<AddonMenuBinding216Record> {
    const records = findBlockItemRecords(
      await this.api.menuBlockItemStructList({ menuId: menu.menuId, subMenuId: menu.subMenuId, blockId: menu.blockId, itemId }),
      menu.blockId,
      itemId,
    );
    if (records.length !== 1) throw new Error(`菜单区块商品绑定后身份不唯一：${itemIdentity} count=${records.length}`);
    const binding = { ...records[0], menuId: menu.menuId, subMenuId: menu.subMenuId, blockId: menu.blockId, itemId, identity: `${itemIdentity}_MENU_BINDING` };
    cleanupRegistry.register({
      entity: '审计菜单区块商品绑定',
      identity: binding.identity,
      checkpoint: {
        entryId: `addon-menu-binding-${binding.id}`,
        entityKind: 'menu',
        serverId: binding.id,
        identityVariants: [binding.identity],
        cleanupOrder: 60,
        dependencyOf: `addon-menu-block-${menu.blockId}`,
      },
      execute: async () => {
        const residue = findBlockItemRecords(
          await this.api.menuBlockItemStructList({ menuId: menu.menuId, subMenuId: menu.subMenuId, blockId: menu.blockId, itemId }),
          menu.blockId,
          itemId,
        );
        for (const item of residue) await this.api.deleteMenuBlockItem(item.id);
      },
      verify: async () => findBlockItemRecords(
        await this.api.menuBlockItemStructList({ menuId: menu.menuId, subMenuId: menu.subMenuId, blockId: menu.blockId, itemId }),
        menu.blockId,
        itemId,
      ).length === 0,
    });
    return binding;
  }

  async assertMenuFixtureAbsent(menu: AddonMenu216Record): Promise<void> {
    if (findNamedRecords(await this.api.menuPage(menu.menuName), menu.menuName).length !== 0) {
      throw new Error(`审计菜单 API 残留：${menu.menuName}`);
    }
    if (findNamedRecords(await this.api.menuBlockSearch(menu.blockName), menu.blockName).length !== 0) {
      throw new Error(`审计菜单区块 API 残留：${menu.blockName}`);
    }
  }

  async assertMenuBindingAbsent(binding: AddonMenuBinding216Record): Promise<void> {
    const records = findBlockItemRecords(
      await this.api.menuBlockItemStructList({ menuId: binding.menuId, subMenuId: binding.subMenuId, blockId: binding.blockId, itemId: binding.itemId }),
      binding.blockId,
      binding.itemId,
    );
    if (records.length !== 0) throw new Error(`审计菜单区块商品绑定 API 残留：${binding.identity}`);
  }

  async menuBindingCount(menu: AddonMenu216Record, itemId: number): Promise<number> {
    return findBlockItemRecords(
      await this.api.menuBlockItemStructList({ menuId: menu.menuId, subMenuId: menu.subMenuId, blockId: menu.blockId, itemId }),
      menu.blockId,
      itemId,
    ).length;
  }

  async isSyncJobTerminal(id: number): Promise<boolean> {
    const detail = await this.api.menuSyncJobDetail(id);
    return Boolean(detail?.data?.finishedAt) || [3, 4, 5, 6].includes(Number(detail?.data?.jobStatus));
  }

  async registerSyncJob(
    responseBody: unknown,
    identity: string,
    cleanupRegistry: CleanupRegistry,
  ): Promise<AddonSyncJob216Record> {
    const record = extractCreatedRecord(responseBody, identity);
    if (!record) throw new Error(`菜单下发作业响应缺少服务端 ID：${identity}`);
    cleanupRegistry.register({
      entity: '审计菜单下发作业',
      identity,
      checkpoint: {
        entryId: `addon-menu-sync-job-${record.id}`,
        entityKind: 'menu',
        serverId: record.id,
        identityVariants: [identity],
        cleanupOrder: 70,
      },
      execute: async () => {
        try { await this.api.cancelMenuSyncJob(record.id); } catch { /* 已执行或已终态时由状态核验收敛 */ }
      },
      verify: async () => {
        const detail = await this.api.menuSyncJobDetail(record.id);
        return Boolean(detail?.data?.finishedAt) || [3, 4, 5, 6].includes(Number(detail?.data?.jobStatus));
      },
    });
    return { id: record.id, identity };
  }

  observedPoiTarget(): { poiId: string; poiName: string } {
    if (!runtimeConfig.poiId) throw new Error('菜单下发审计缺少已观测 MC_POI_ID');
    return { poiId: runtimeConfig.poiId, poiName: runtimeConfig.poiId };
  }

  createImageFixture(caseId: string): AddonUploadFixture {
    const caseMarker = caseId
      .replace(/^TC-ITEM-/i, '')
      .replace(/[^A-Z0-9]+/gi, '_')
      .slice(0, 16);
    const filePath = path.join(os.tmpdir(), `AUTO_AUDIT_IMG_${caseMarker}_${nextAuditTimestamp()}.png`);
    const png = createAuditPng(caseId);
    fs.writeFileSync(filePath, png, { flag: 'w' });
    return {
      filePath,
      dispose: () => {
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
      },
    };
  }

  async assertZero(identities: readonly string[]): Promise<Record<string, 0>> {
    const result: Record<string, 0> = {};
    for (const identity of identities) {
      const count = await this.itemCount(identity);
      if (count !== 0) throw new Error(`加料商品 API 残留：${identity} count=${count}`);
      result[identity] = 0;
    }
    return result;
  }
}

export function buildAddonOwnerPayload216(
  ownerIdentity: string,
  addonGroupId: number,
  addonGroupItemId: number,
): Record<string, unknown> {
  return {
    itemBasic: {
      name: ownerIdentity,
      secondName: `${ownerIdentity}_SECOND`,
      minOrderQuantity: 1,
      type: 1,
      weightItem: false,
      categoryId: 142,
      specType: 1,
      itemMainImages: [],
      itemDetailImages: [],
    },
    printStallIds: [],
    itemSpecDetail: {
      specList: [],
      skuList: [{ salePrice: 10, costPrice: 0, packageFee: 0 }],
    },
    cookList: [],
    tasteList: [],
    mutexAttrRuleList: [],
    addGroupList: [{
      addonGroupId,
      required: false,
      sortOrder: 0,
      selectionRule: { min: 0, max: 1, mergeDisplay: true, repeatSelect: false },
      pricingRule: { freeQuantity: 0 },
      addList: [{
        addonItemId: addonGroupItemId,
        selectionRule: { quantity: 0, maxQuantity: 1 },
        pricingRule: { additionalPrice: 0 },
        defaultSelected: true,
        sortOrder: 0,
      }],
    }],
    descTagList: [],
    corner: [],
    statisticalsTagList: [],
    flexedSectionList: [],
    fixedSectionList: [],
    allergenList: [],
    nutritionList: [],
    ingredientList: [],
  };
}

export function buildAddonOwnerAttributeUpdatePayload216(
  ownerId: number,
  addonGroupId: number,
  addonGroupItemId: number,
): Record<string, unknown> {
  const ownerPayload = buildAddonOwnerPayload216('AUTO_AUDIT_ADDON_OWNER_ATTRIBUTE_UPDATE', addonGroupId, addonGroupItemId);
  return {
    itemIds: [ownerId],
    addon: {
      operationType: 1,
      additionList: ownerPayload.addGroupList,
      removeList: [],
    },
  };
}

function normalizeCaseId(caseId: string): string {
  return caseId.replace(/^TC-ITEM-ADD-/u, 'ADD_').replace(/[^A-Za-z0-9_-]/g, '_');
}

function findUniqueNamedRecord(value: unknown, name: string): { id: number; name: string } {
  const records = findNamedRecords(value, name);
  if (records.length !== 1) throw new Error(`加料组创建后身份不唯一：${name} count=${records.length}`);
  return records[0];
}

async function addonGroupExistsById(api: ProductCenterApi, id: number): Promise<boolean> {
  return api.addonGroupDetail(id)
    .then((value) => findRecordId(value, id))
    .catch((error: unknown) => {
      if (/not exist|HTTP 404|not found|请求资源不存在/i.test(String(error))) return false;
      throw error;
    });
}

function findRecordId(value: unknown, id: number): boolean {
  if (Array.isArray(value)) return value.some((item) => findRecordId(item, id));
  if (!value || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  if (Number(record.id) === id) return true;
  return Object.values(record).some((child) => findRecordId(child, id));
}

function findAddonGroupItemRecords(
  value: unknown,
  groupId: number,
  itemId: number,
  output: AddonGroupItem216Record[] = [],
): AddonGroupItem216Record[] {
  if (Array.isArray(value)) {
    for (const child of value) findAddonGroupItemRecords(child, groupId, itemId, output);
    return [...new Map(output.map((item) => [item.id, item])).values()];
  }
  if (!value || typeof value !== 'object') return output;
  const record = value as Record<string, unknown>;
  const candidateGroupId = Number(record.groupId ?? record.addonGroupId);
  const candidateItemId = Number(record.itemId ?? record.addonItemId);
  const candidateId = Number(record.id ?? record.brandAddonId);
  if (candidateGroupId === groupId && candidateItemId === itemId && candidateId > 0) {
    const skuId = Number(record.skuId);
    output.push({ id: candidateId, groupId, itemId, ...(skuId > 0 ? { skuId } : {}) });
  }
  for (const child of Object.values(record)) findAddonGroupItemRecords(child, groupId, itemId, output);
  return [...new Map(output.map((item) => [item.id, item])).values()];
}

function extractCreatedAddonGroupItem(value: unknown, groupId: number, itemId: number): AddonGroupItem216Record | undefined {
  return findAddonGroupItemRecords(value, groupId, itemId)[0];
}

function findItemSkuId(value: unknown): number | undefined {
  if (Array.isArray(value)) {
    for (const child of value) {
      const id = findItemSkuId(child);
      if (id !== undefined) return id;
    }
    return undefined;
  }
  if (!value || typeof value !== 'object') return undefined;
  const record = value as Record<string, unknown>;
  if (Array.isArray(record.skuList)) {
    const first = record.skuList.find((item) => item && typeof item === 'object' && Number((item as Record<string, unknown>).id) > 0);
    if (first && typeof first === 'object') return Number((first as Record<string, unknown>).id);
  }
  for (const child of Object.values(record)) {
    const id = findItemSkuId(child);
    if (id !== undefined) return id;
  }
  return undefined;
}

function hasAddonOwnerReference(
  value: unknown,
  groupId: number,
  addonGroupItemId: number,
  ownerId: number,
  addonProductId: number,
): boolean {
  if (Array.isArray(value)) return value.some((child) => hasAddonOwnerReference(child, groupId, addonGroupItemId, ownerId, addonProductId));
  if (!value || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  const itemBasic = record.itemBasic && typeof record.itemBasic === 'object'
    ? record.itemBasic as Record<string, unknown>
    : undefined;
  if (Number(record.id) === addonGroupItemId
    && Number(record.itemId) === ownerId
    && Number(itemBasic?.id ?? record.addonItemId) === addonProductId) return true;
  const candidateGroupId = Number(record.addonGroupId ?? record.groupId);
  if (candidateGroupId === groupId) {
    const nested = [record.addList, record.items, record.addonList, record.itemList];
    if (nested.some((child) => containsAddonIds(child, addonGroupItemId) || containsAddonIds(child, addonProductId))) return true;
  }
  return Object.values(record).some((child) => hasAddonOwnerReference(child, groupId, addonGroupItemId, ownerId, addonProductId));
}

function containsAddonIds(value: unknown, addonItemId: number): boolean {
  if (Array.isArray(value)) return value.some((child) => containsAddonIds(child, addonItemId));
  if (!value || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  if (Number(record.addonItemId) === addonItemId || Number(record.itemId) === addonItemId) return true;
  if (record.itemBasic && typeof record.itemBasic === 'object' && Number((record.itemBasic as Record<string, unknown>).id) === addonItemId) return true;
  return Object.values(record).some((child) => containsAddonIds(child, addonItemId));
}

function collectAddonNodes(value: unknown, output: Array<Record<string, unknown>> = []): Array<Record<string, unknown>> {
  if (Array.isArray(value)) {
    for (const child of value) collectAddonNodes(child, output);
    return output;
  }
  if (!value || typeof value !== 'object') return output;
  const record = value as Record<string, unknown>;
  if (Object.keys(record).some((key) => /addon|addGroup|itemBasic|brandAddon/i.test(key))) {
    const selected: Record<string, unknown> = {};
    for (const key of ['id', 'itemId', 'addonItemId', 'addonGroupId', 'brandAddonId', 'groupId', 'itemBasic', 'addList', 'items', 'addonList']) {
      if (record[key] !== undefined) selected[key] = record[key];
    }
    if (Object.keys(selected).length > 0) output.push(selected);
  }
  for (const child of Object.values(record)) collectAddonNodes(child, output);
  return output.slice(0, 40);
}

function findBlockItemRecords(value: unknown, blockId: number, itemId: number, output: Array<{ id: number }> = []): Array<{ id: number }> {
  if (Array.isArray(value)) {
    for (const child of value) findBlockItemRecords(child, blockId, itemId, output);
    return [...new Map(output.map((item) => [item.id, item])).values()];
  }
  if (!value || typeof value !== 'object') return output;
  const record = value as Record<string, unknown>;
  const itemDetail = record.itemDetail && typeof record.itemDetail === 'object'
    ? record.itemDetail as Record<string, unknown>
    : undefined;
  const itemBasic = itemDetail?.itemBasic && typeof itemDetail.itemBasic === 'object'
    ? itemDetail.itemBasic as Record<string, unknown>
    : undefined;
  if (Number(itemBasic?.id) === itemId && Array.isArray(record.menuStructs)) {
    for (const menuStruct of record.menuStructs) {
      if (!menuStruct || typeof menuStruct !== 'object') continue;
      const struct = menuStruct as Record<string, unknown>;
      if (Number(struct.blockId) === blockId && Number(struct.blockItemId) > 0) {
        output.push({ id: Number(struct.blockItemId) });
      }
    }
  }
  if (Number(record.id) > 0 && Number(record.blockId) === blockId && Number(record.itemId) === itemId) output.push({ id: Number(record.id) });
  for (const child of Object.values(record)) findBlockItemRecords(child, blockId, itemId, output);
  return [...new Map(output.map((item) => [item.id, item])).values()];
}

function findNamedRecords(value: unknown, name: string, output: Array<{ id: number; name: string }> = []): Array<{ id: number; name: string }> {
  if (Array.isArray(value)) {
    for (const child of value) findNamedRecords(child, name, output);
    return output;
  }
  if (!value || typeof value !== 'object') return output;
  const record = value as Record<string, unknown>;
  if (typeof record.id === 'number' && typeof record.name === 'string' && record.name === name) {
    output.push({ id: record.id, name: record.name });
  }
  for (const child of Object.values(record)) findNamedRecords(child, name, output);
  return [...new Map(output.map((item) => [item.id, item])).values()];
}

function findFirstEnabledNamedResource(value: unknown): { id: number; name: string } | undefined {
  if (Array.isArray(value)) {
    for (const child of value) {
      const match = findFirstEnabledNamedResource(child);
      if (match) return match;
    }
    return undefined;
  }
  if (!value || typeof value !== 'object') return undefined;
  const record = value as Record<string, unknown>;
  if (typeof record.id === 'number' && typeof record.name === 'string'
    && record.name.trim() && (record.status === undefined || Number(record.status) !== 0)) {
    return { id: record.id, name: record.name };
  }
  for (const child of Object.values(record)) {
    const match = findFirstEnabledNamedResource(child);
    if (match) return match;
  }
  return undefined;
}

function findProductRecords(value: unknown, name: string): Array<{ id: number; name: string }> {
  if (!value || typeof value !== 'object') return [];
  const data = (value as Record<string, unknown>).data;
  if (!data || typeof data !== 'object') return [];
  const list = (data as Record<string, unknown>).list;
  if (!Array.isArray(list)) return [];
  return list.flatMap((item) => {
    if (!item || typeof item !== 'object') return [];
    const basic = (item as Record<string, unknown>).itemBasic;
    if (!basic || typeof basic !== 'object') return [];
    const record = basic as Record<string, unknown>;
    return typeof record.id === 'number' && record.name === name
      ? [{ id: record.id, name }]
      : [];
  });
}

function createAuditPng(seed: string): Buffer {
  const width = 256;
  const height = 256;
  const hash = [...seed].reduce((value, character) => ((value * 31) + character.charCodeAt(0)) >>> 0, 17);
  const red = hash & 0xff;
  const green = (hash >>> 8) & 0xff;
  const blue = (hash >>> 16) & 0xff;
  const pixels = Buffer.alloc((width * 4 + 1) * height);
  for (let row = 0; row < height; row += 1) {
    const rowOffset = row * (width * 4 + 1);
    pixels[rowOffset] = 0;
    for (let column = 0; column < width; column += 1) {
      const pixelOffset = rowOffset + 1 + column * 4;
      pixels[pixelOffset] = (red + column * 3 + row) & 0xff;
      pixels[pixelOffset + 1] = (green + row * 5 + (hash >>> 24)) & 0xff;
      pixels[pixelOffset + 2] = (blue + ((column ^ row) * 7)) & 0xff;
      pixels[pixelOffset + 3] = 255;
    }
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk('IHDR', header),
    pngChunk('IDAT', deflateSync(pixels)),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

function pngChunk(type: string, data: Buffer): Buffer {
  const typeBytes = Buffer.from(type, 'ascii');
  const payload = Buffer.concat([typeBytes, data]);
  const chunk = Buffer.alloc(12 + data.length);
  chunk.writeUInt32BE(data.length, 0);
  payload.copy(chunk, 4);
  chunk.writeUInt32BE(crc32(payload), 8 + data.length);
  return chunk;
}

function crc32(value: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of value) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
