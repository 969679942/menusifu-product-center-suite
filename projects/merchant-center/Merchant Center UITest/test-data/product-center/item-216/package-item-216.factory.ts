import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { deflateSync } from 'node:zlib';
import type { CleanupRegistry } from '../../../api/product-center/cleanup-registry';
import type { ProductCenterApi } from '../../../api/product-center/product-center-api';
import { extractCreatedRecord } from '../../../api/product-center/created-record';
import {
  ProductCenterItemCreateDataFactory,
  type ProductCenterItemCreateContext,
  type ProductCenterItemCreateRecord,
} from '../product-center-item-create-data.factory';
import {
  readMainImageEvidence,
  type StandardItem216MainImageEvidence,
} from './standard-item-216.factory';
import { nextAuditTimestamp } from '../audit-identity';
import { waitUntil } from '../../../utils/wait';

export type PackageItem216Seed = {
  primary: ProductCenterItemCreateContext;
  secondary: ProductCenterItemCreateContext;
};

export type PackageItem216ImageFixture = {
  filePath: string;
  imageName: string;
  byteLength: number;
  sha256: string;
  width: 256;
  height: 256;
  dispose: () => void;
};

export type PackageItem216MenuFixture = {
  menuId: number;
  menuName: string;
  subMenuId: number;
  subMenuName: string;
  blockId: number;
  blockName: string;
};

export type PackageItem216StatisticTagFixture = {
  groupId: number;
  groupName: string;
  tagNames: string[];
};

export type PackageItem216MaterialFixture = {
  id: number;
  name: string;
  categoryId: number;
  categoryName: string;
};

export type PackageItem216UnresolvedContract = {
  caseId: string;
  status: 'unresolved';
  route: '/pp/brand/create/combo' | '/pp/brand/list' | '/pp/brand/edit/combo';
  reasonCode:
    | 'NO_OBSERVABLE_PAGE_CONTRACT'
    | 'EXTERNAL_TERMINAL_CONTRACT_REQUIRED'
    | 'UNREGISTERED_GROUP_FIXTURE_REQUIRED'
    | 'UNREGISTERED_MENU_REFERENCE_FIXTURE_REQUIRED'
    | 'UNREGISTERED_MEDIA_FIXTURE_REQUIRED';
  missingContracts: string[];
  observedEvidence: string[];
};

export const packageItem216UnresolvedContracts: readonly PackageItem216UnresolvedContract[] = [
  ...[
    'TC-ITEM-PKG-021', 'TC-ITEM-PKG-022', 'TC-ITEM-PKG-024', 'TC-ITEM-PKG-025',
    'TC-ITEM-PKG-028', 'TC-ITEM-PKG-029', 'TC-ITEM-PKG-030', 'TC-ITEM-PKG-031',
    'TC-ITEM-PKG-032', 'TC-ITEM-PKG-033', 'TC-ITEM-PKG-034', 'TC-ITEM-PKG-035',
    'TC-ITEM-PKG-036', 'TC-ITEM-PKG-037', 'TC-ITEM-PKG-038', 'TC-ITEM-PKG-039',
    'TC-ITEM-PKG-044', 'TC-ITEM-PKG-045',
    'TC-ITEM-PKG-047', 'TC-ITEM-PKG-048', 'TC-ITEM-PKG-050', 'TC-ITEM-PKG-052',
    'TC-ITEM-PKG-053', 'TC-ITEM-PKG-054', 'TC-ITEM-PKG-055', 'TC-ITEM-PKG-056',
    'TC-ITEM-PKG-060', 'TC-ITEM-PKG-061',
    'TC-ITEM-PKG-062', 'TC-ITEM-PKG-063', 'TC-ITEM-PKG-064', 'TC-ITEM-PKG-065',
    'TC-ITEM-PKG-067', 'TC-ITEM-PKG-068', 'TC-ITEM-PKG-069', 'TC-ITEM-PKG-070',
    'TC-ITEM-PKG-071', 'TC-ITEM-PKG-072', 'TC-ITEM-PKG-073', 'TC-ITEM-PKG-074',
    'TC-ITEM-PKG-075',
  ].map((caseId) => ({
    caseId,
    status: 'unresolved' as const,
    route: caseId === 'TC-ITEM-PKG-034' || caseId === 'TC-ITEM-PKG-037'
      || caseId === 'TC-ITEM-PKG-038' || caseId === 'TC-ITEM-PKG-039'
      || caseId === 'TC-ITEM-PKG-047' || caseId === 'TC-ITEM-PKG-048'
      || caseId === 'TC-ITEM-PKG-054' || caseId === 'TC-ITEM-PKG-055'
      || caseId === 'TC-ITEM-PKG-060' || caseId === 'TC-ITEM-PKG-061'
      || caseId === 'TC-ITEM-PKG-062'
      ? '/pp/brand/list' as const
      : caseId === 'TC-ITEM-PKG-035' || caseId === 'TC-ITEM-PKG-036'
        || caseId === 'TC-ITEM-PKG-050' || caseId === 'TC-ITEM-PKG-052'
        || caseId === 'TC-ITEM-PKG-053' || caseId === 'TC-ITEM-PKG-059'
        || caseId === 'TC-ITEM-PKG-063' || caseId === 'TC-ITEM-PKG-064'
        || caseId === 'TC-ITEM-PKG-065' || caseId === 'TC-ITEM-PKG-069'
        || caseId === 'TC-ITEM-PKG-071' || caseId === 'TC-ITEM-PKG-072'
        || caseId === 'TC-ITEM-PKG-073' || caseId === 'TC-ITEM-PKG-074'
        || caseId === 'TC-ITEM-PKG-075'
        ? '/pp/brand/edit/combo' as const
        : '/pp/brand/create/combo' as const,
    reasonCode: caseId === 'TC-ITEM-PKG-060' || caseId === 'TC-ITEM-PKG-070'
      ? 'EXTERNAL_TERMINAL_CONTRACT_REQUIRED' as const
      : caseId === 'TC-ITEM-PKG-024' || caseId === 'TC-ITEM-PKG-025'
        || caseId === 'TC-ITEM-PKG-037' || caseId === 'TC-ITEM-PKG-038'
        || caseId === 'TC-ITEM-PKG-039'
        ? 'UNREGISTERED_MENU_REFERENCE_FIXTURE_REQUIRED' as const
        : caseId === 'TC-ITEM-PKG-028' || caseId === 'TC-ITEM-PKG-033'
          || caseId === 'TC-ITEM-PKG-054' || caseId === 'TC-ITEM-PKG-067'
          || caseId === 'TC-ITEM-PKG-068'
          ? 'UNREGISTERED_MEDIA_FIXTURE_REQUIRED' as const
          : 'NO_OBSERVABLE_PAGE_CONTRACT' as const,
    missingContracts: ['case-specific assertion contract', 'case-specific factory/cleanup contract'],
    observedEvidence: ['authenticated route readiness', '套餐创建页核心结构可读取'],
  })),
];

export class PackageItem216Factory {
  private readonly delegate: ProductCenterItemCreateDataFactory;

  constructor(private readonly api: ProductCenterApi) {
    this.delegate = new ProductCenterItemCreateDataFactory(api);
  }

  async prepareWritable(
    cleanupRegistry: CleanupRegistry,
    options: { includeCustomComboGroup?: boolean } = {},
  ): Promise<PackageItem216Seed> {
    const primary = await this.createWritableSeed(cleanupRegistry);
    const secondary = await this.createWritableSeed(cleanupRegistry);
    if (options.includeCustomComboGroup) {
      await this.createCustomComboFixture(primary, cleanupRegistry);
    }
    return { primary, secondary };
  }

  async prepareSingleWritable(
    cleanupRegistry: CleanupRegistry,
    options: { includeCustomComboGroup?: boolean } = {},
  ): Promise<ProductCenterItemCreateContext> {
    const context = await this.createWritableSeed(cleanupRegistry);
    if (options.includeCustomComboGroup) {
      await this.createCustomComboFixture(context, cleanupRegistry);
    }
    return context;
  }

  private async createCustomComboFixture(
    context: ProductCenterItemCreateContext,
    cleanupRegistry: CleanupRegistry,
  ): Promise<void> {
    if (!context.customComboGroupName || !context.dependencyProductIdentity) {
      throw new Error('套餐搜索夹具缺少 Custom Combo 身份或依赖商品身份');
    }
    const product = requireProductRecord(
      await this.api.productPage(context.dependencyProductIdentity),
      context.dependencyProductIdentity,
    );
    if (!product) throw new Error(`套餐搜索夹具依赖商品未找到：${context.dependencyProductIdentity}`);
    const detail = await this.api.productDetail(product.id);
    const skuId = readFirstSkuId(detail);
    if (skuId === undefined) throw new Error(`套餐搜索夹具依赖商品缺少 SKU：${context.dependencyProductIdentity}`);
    const response = await this.api.createComboGroup({
      name: context.customComboGroupName,
      itemId: product.id,
      skuId,
      sectionType: 2,
    });
    await this.registerComboGroupCreated(
      context.customComboGroupName,
      response,
      cleanupRegistry,
    );
  }

  private async createWritableSeed(cleanupRegistry: CleanupRegistry): Promise<ProductCenterItemCreateContext> {
    const timestamp = nextAuditTimestamp();
    const originalIdentity = `AUTO_AUDIT_ITEM_${timestamp}`;
    const comboGroupName = `AUTO_AUDIT_COMBO_${timestamp}`;
    const dependencyProductIdentity = `AUTO_AUDIT_COMBO_PRODUCT_${timestamp}`;
    if (await this.itemRecordCount(originalIdentity) !== 0) {
      throw new Error(`套餐商品审计身份已存在：${originalIdentity}`);
    }

    const dependencyResponse = await this.api.createBomProduct(dependencyProductIdentity);
    const dependencyProduct = extractCreatedRecord(dependencyResponse, dependencyProductIdentity)
      ?? requireProductRecord(await this.api.productPage(dependencyProductIdentity), dependencyProductIdentity);
    if (!dependencyProduct) throw new Error(`套餐依赖商品创建后未找到：${dependencyProductIdentity}`);
    this.registerItemCleanup(
      cleanupRegistry,
      dependencyProductIdentity,
      dependencyProduct.id,
      '套餐组依赖商品',
      10,
    );

    const detail = await this.api.productDetail(dependencyProduct.id);
    const skuId = readFirstSkuId(detail);
    if (skuId === undefined) throw new Error(`套餐组依赖商品缺少 SKU ID：${dependencyProductIdentity}`);
    const comboResponse = await this.api.createComboGroup({
      name: comboGroupName,
      itemId: dependencyProduct.id,
      skuId,
    });
    await this.registerComboGroupCreated(comboGroupName, comboResponse, cleanupRegistry);

    return {
      entityKey: 'item',
      productType: 'combo',
      originalIdentity,
      price: '10.00',
      minimumOrderQuantity: '1',
      comboGroupName,
      customComboGroupName: `${comboGroupName}_OPTIONAL`,
      dependencyProductIdentity,
    };
  }

  async prepareRequiredProbe(cleanupRegistry: CleanupRegistry): Promise<ProductCenterItemCreateContext> {
    return this.delegate.prepareComboGroupRequiredProbe(cleanupRegistry);
  }

  async registerCreated(
    context: ProductCenterItemCreateContext,
    responseBody: unknown,
    cleanupRegistry: CleanupRegistry,
    observedIdentityVariants: string[] = [],
  ): Promise<ProductCenterItemCreateRecord> {
    const identityVariants = [...new Set([
      context.originalIdentity,
      ...(context.cleanupIdentityVariants ?? []),
    ])];
    let record: { id: number } | undefined = extractCreatedRecord(responseBody, context.originalIdentity);
    for (const identity of observedIdentityVariants) {
      record ??= requireNamedRecord(responseBody, identity);
    }
    for (const identity of identityVariants) {
      record ??= requireProductRecord(await this.api.productPage(identity), identity);
    }
    if (!record) throw new Error(`套餐商品创建后未找到：${identityVariants.join(',')}`);
    this.registerItemCleanup(
      cleanupRegistry,
      context.originalIdentity,
      record.id,
      '套餐商品',
      50,
      identityVariants,
    );
    return { ...context, id: record.id, checkpointEntryId: `item-${record.id}` };
  }

  async registerCreatedByServerId(
    context: ProductCenterItemCreateContext,
    serverId: number,
    cleanupRegistry: CleanupRegistry,
  ): Promise<ProductCenterItemCreateRecord> {
    const entity = context.productType === 'side' ? '加料商品' : context.productType === 'combo' ? '套餐商品' : '标准商品';
    this.registerItemCleanup(
      cleanupRegistry,
      context.originalIdentity,
      serverId,
      entity,
      50,
      [context.originalIdentity],
    );
    return { ...context, id: serverId, checkpointEntryId: `item-${serverId}` };
  }

  async registerAddonCreated(
    context: ProductCenterItemCreateContext,
    responseBody: unknown,
    cleanupRegistry: CleanupRegistry,
  ): Promise<ProductCenterItemCreateRecord> {
    if (context.productType !== 'side') throw new Error(`跨类型同名夹具必须登记为加料商品：${context.originalIdentity}`);
    return this.delegate.registerCreated(context, responseBody, cleanupRegistry);
  }

  async registerComboGroupCreated(
    name: string,
    responseBody: unknown,
    cleanupRegistry: CleanupRegistry,
    intentId?: string,
  ): Promise<{ id: number; name: string; checkpointEntryId: string }> {
    const record = extractCreatedRecord(responseBody, name)
      ?? requireNamedRecord(await this.api.comboGroupList(), name);
    if (!record) throw new Error(`套餐组创建后未找到：${name}`);
    cleanupRegistry.register({
      entity: '套餐组',
      identity: name,
      checkpoint: {
        entryId: `combo-${record.id}`,
        intentId,
        entityKind: 'combo',
        serverId: record.id,
        identityVariants: [name],
        cleanupOrder: 40,
      },
      execute: async () => {
        for (const residue of namedRecords(await this.api.comboGroupList(), name)) {
          try {
            await this.api.deleteComboGroup(residue.id);
          } catch (error) {
            if ((await this.comboGroupRecordCount(name)) !== 0) throw error;
          }
        }
      },
      verify: async () => waitUntil(
        () => this.comboGroupRecordCount(name),
        (count) => count === 0,
        { timeout: 8_000, interval: 250, message: `套餐组清理未收敛：${name}` },
      ).then(() => true).catch(() => false),
    });
    return { id: record.id, name, checkpointEntryId: `combo-${record.id}` };
  }

  private registerItemCleanup(
    cleanupRegistry: CleanupRegistry,
    identity: string,
    id: number,
    entity: string,
    cleanupOrder: number,
    identityVariants: string[] = [identity],
  ): void {
    const searchableIdentities = identityVariants.filter((candidate) => candidate.startsWith('AUTO_AUDIT_'));
    cleanupRegistry.register({
      entity,
      identity,
      checkpoint: {
        entryId: `item-${id}`,
        entityKind: 'item',
        serverId: id,
        identityVariants,
        cleanupOrder,
      },
      execute: async () => {
        try {
          await this.api.deleteBomProduct(id);
        } catch (error) {
          if (await this.itemRecordExistsById(id)) throw error;
        }
        for (const candidate of searchableIdentities) {
          for (const residue of productRecords(await this.api.productPage(candidate), candidate)) {
            try {
              await this.api.deleteBomProduct(residue.id);
            } catch (error) {
              if ((await this.itemRecordCount(candidate)) !== 0) throw error;
            }
          }
        }
      },
      verify: async () => {
        if (await this.itemRecordExistsById(id)) return false;
        for (const candidate of searchableIdentities) {
          if (await this.itemRecordCount(candidate) !== 0) return false;
        }
        return true;
      },
    });
  }

  async itemRecordCount(identity: string): Promise<number> {
    return this.delegate.itemRecordCount(identity);
  }

  async readMainImageEvidence(itemId: number): Promise<StandardItem216MainImageEvidence> {
    return readMainImageEvidence(await this.api.productDetail(itemId));
  }

  private async itemRecordExistsById(id: number): Promise<boolean> {
    return this.api.productDetail(id)
      .then((value) => findProductNameById(value, id) !== undefined)
      .catch((error: unknown) => {
        if (/item id not exist|HTTP 404/i.test(String(error))) return false;
        throw error;
      });
  }

  async comboGroupRecordCount(identity: string): Promise<number> {
    return this.delegate.comboGroupRecordCount(identity);
  }

  createImageFixture(caseId: string): PackageItem216ImageFixture {
    const caseMarker = caseId
      .replace(/^TC-ITEM-/i, '')
      .replace(/[^A-Z0-9]+/gi, '_')
      .slice(0, 16);
    const imageName = `AUTO_AUDIT_IMG_${caseMarker}_${nextAuditTimestamp()}`;
    const filePath = path.join(os.tmpdir(), `${imageName}.png`);
    const content = createPackageAuditPng(caseId);
    fs.writeFileSync(filePath, content, { flag: 'w' });
    return {
      filePath,
      imageName,
      byteLength: content.length,
      sha256: createHash('sha256').update(content).digest('hex'),
      width: 256,
      height: 256,
      dispose: () => { if (fs.existsSync(filePath)) fs.unlinkSync(filePath); },
    };
  }

  async availableDescriptionTagNames(count: number): Promise<string[]> {
    return takeNamedValues(await this.api.tagPage(1), count, '描述标签');
  }

  async availableStatisticTagNames(count: number): Promise<string[]> {
    return takeNamedValues(await this.api.tagPage(3), count, '统计标签');
  }

  async createStatisticTagFixture(
    identity: string,
    count: number,
    cleanupRegistry: CleanupRegistry,
  ): Promise<PackageItem216StatisticTagFixture> {
    const suffix = identity.replace(/[^A-Z0-9_-]/gi, '_');
    const tagNames: string[] = [];
    let firstGroup: { id: number; name: string } | undefined;
    for (let index = 0; index < count; index += 1) {
      const groupName = `AUTO_AUDIT_${suffix}_STAT_GROUP_${index + 1}`;
      const groupResponse = await this.api.createTagGroup({ name: groupName, type: 3 });
      const group = requireNamedRecord(groupResponse, groupName)
        ?? requireNamedRecord(await this.api.tagGroupList(3), groupName);
      if (!group) throw new Error(`套餐统计标签组创建后未找到：${groupName}`);
      firstGroup ??= { id: group.id, name: groupName };
      cleanupRegistry.register({
        entity: '套餐统计标签组',
        identity: groupName,
        checkpoint: {
          entryId: `package-stat-group-${group.id}`,
          entityKind: 'tag-group',
          serverId: group.id,
          identityVariants: [groupName],
          cleanupOrder: 30,
        },
        execute: async () => {
          const residue = requireNamedRecord(await this.api.tagGroupList(3), groupName);
          if (residue) await this.api.deleteTagGroup(residue.id);
        },
        verify: async () => !requireNamedRecord(await this.api.tagGroupList(3), groupName),
      });
      const name = `AUTO_AUDIT_${suffix}_STAT_${index + 1}`;
      const response = await this.api.createStatTag({ name, groupId: group.id });
      const tag = requireNamedRecord(response, name)
        ?? requireNamedRecord(await this.api.tagPage(3), name);
      if (!tag) throw new Error(`套餐统计标签创建后未找到：${name}`);
      cleanupRegistry.register({
        entity: '套餐统计标签',
        identity: name,
        checkpoint: {
          entryId: `package-stat-tag-${tag.id}`,
          entityKind: 'statistic-tag',
          serverId: tag.id,
          identityVariants: [name],
          cleanupOrder: 35,
          dependencyOf: `package-stat-group-${group.id}`,
        },
        execute: async () => {
          const residue = requireNamedRecord(await this.api.tagPage(3), name);
          if (residue) await this.api.deleteTag(residue.id);
        },
        verify: async () => !requireNamedRecord(await this.api.tagPage(3), name),
      });
      tagNames.push(name);
    }
    if (!firstGroup) throw new Error('套餐统计标签夹具数量必须大于 0');
    return { groupId: firstGroup.id, groupName: firstGroup.name, tagNames };
  }

  async createMaterialFixture(
    identity: string,
    cleanupRegistry: CleanupRegistry,
  ): Promise<PackageItem216MaterialFixture> {
    const suffix = identity.replace(/[^A-Z0-9_-]/gi, '_');
    const categoryName = `AUTO_AUDIT_${suffix}_MATERIAL_CATEGORY`;
    const categoryResponse = await this.api.createMaterialCategory({
      name: categoryName,
      secondName: `${categoryName}_SECOND`,
    });
    const category = requireNamedRecord(categoryResponse, categoryName)
      ?? requireNamedRecord(await this.api.materialCategoryTree(), categoryName);
    if (!category) throw new Error(`套餐原料分类创建后未找到：${categoryName}`);
    cleanupRegistry.register({
      entity: '套餐原料分类',
      identity: categoryName,
      checkpoint: {
        entryId: `package-material-category-${category.id}`,
        entityKind: 'material-category',
        serverId: category.id,
        identityVariants: [categoryName],
        cleanupOrder: 30,
      },
      execute: async () => {
        const residue = requireNamedRecord(await this.api.materialCategoryTree(), categoryName);
        if (residue) await this.api.deleteCategory(residue.id);
      },
      verify: async () => !requireNamedRecord(await this.api.materialCategoryTree(), categoryName),
    });
    const name = `AUTO_AUDIT_${suffix}_MATERIAL`;
    const response = await this.api.createMaterial({
      name,
      secondName: `${name}_SECOND`,
      categoryId: category.id,
      code: `P${Date.now().toString().slice(-12)}`,
      description: 'AUTO_AUDIT package ingredient fixture',
    });
    const material = requireNamedRecord(response, name)
      ?? requireNamedRecord(await this.api.materialPage(name), name);
    if (!material) throw new Error(`套餐原料创建后未找到：${name}`);
    cleanupRegistry.register({
      entity: '套餐原料',
      identity: name,
      checkpoint: {
        entryId: `package-material-${material.id}`,
        entityKind: 'material',
        serverId: material.id,
        identityVariants: [name],
        cleanupOrder: 40,
        dependencyOf: `package-material-category-${category.id}`,
      },
      execute: async () => {
        const residue = requireNamedRecord(await this.api.materialPage(name), name);
        if (residue) await this.api.deleteMaterial(residue.id);
      },
      verify: async () => !requireNamedRecord(await this.api.materialPage(name), name),
    });
    return { id: material.id, name, categoryId: category.id, categoryName };
  }

  async registerUploadedBrandImageFixture(
    candidateNames: readonly string[],
    cleanupRegistry: CleanupRegistry,
  ): Promise<{ id: number; name: string; checkpointEntryId: string }> {
    for (const name of candidateNames) {
      const response = await this.api.brandImageList(name);
      if (requireNamedRecord(response, name)) {
        return this.delegate.registerBrandImageCreated(name, response, cleanupRegistry);
      }
    }
    throw new Error(`套餐图片上传后未找到品牌图片夹具：${JSON.stringify(candidateNames)}`);
  }

  async registerUploadedImageFixture(
    fixture: PackageItem216ImageFixture,
    cleanupRegistry: CleanupRegistry,
  ): Promise<{ id: number; name: string; checkpointEntryId: string }> {
    const response = await waitUntil(
      () => this.api.brandImageList(fixture.imageName),
      (value) => Boolean(requireNamedRecord(value, fixture.imageName)),
      { timeout: 5_000, interval: 100, message: `套餐图片上传后未完成图片库登记：${fixture.imageName}` },
    );
    return this.delegate.registerBrandImageCreated(fixture.imageName, response, cleanupRegistry);
  }

  async registerUploadedImageFixtureFromResponse(
    fixture: PackageItem216ImageFixture,
    responseBody: unknown,
    cleanupRegistry: CleanupRegistry,
  ): Promise<{ id: number; name: string; checkpointEntryId: string }> {
    return this.delegate.registerBrandImageCreated(fixture.imageName, responseBody, cleanupRegistry);
  }

  async registerUploadedImageFixtureIfPresent(
    fixture: PackageItem216ImageFixture,
    cleanupRegistry: CleanupRegistry,
  ): Promise<{ id: number; name: string; checkpointEntryId: string } | undefined> {
    const response = await this.api.brandImageList(fixture.imageName);
    if (!requireNamedRecord(response, fixture.imageName)) return undefined;
    return this.delegate.registerBrandImageCreated(fixture.imageName, response, cleanupRegistry);
  }

  async reconcileLegacyUploadedBrandImages(caseIds: readonly string[]): Promise<{
    identities: string[];
    deletedServerIds: number[];
    verifiedZero: true;
  }> {
    const identities = [...new Set(caseIds.map((caseId) => (
      `AUTO_AUDIT_PACKAGE_216_${caseId.replace(/[^A-Z0-9-]/gi, '_')}`
    )))];
    const deletedServerIds: number[] = [];
    for (const identity of identities) {
      const existing = namedRecords(await this.api.brandImageList(identity), identity);
      for (const record of existing) {
        await this.api.deleteBrandImage(record.id);
        deletedServerIds.push(record.id);
      }
      const remaining = namedRecords(await this.api.brandImageList(identity), identity);
      if (remaining.length !== 0) throw new Error(`历史套餐图片残留未清零：${identity}`);
    }
    return { identities, deletedServerIds, verifiedZero: true };
  }

  async availableCornerMarkNames(count: number): Promise<string[]> {
    return takeNamedValues(await this.api.cornerMarkPage(), count, '角标');
  }

  async createTasteFixture(
    identity: string,
    cleanupRegistry: CleanupRegistry,
  ): Promise<{ groupName: string; optionNames: string[] }> {
    const groupName = `AUTO_AUDIT_${identity}_TASTE`;
    const optionNames = [`AUTO_AUDIT_${identity}_TASTE_A`, `AUTO_AUDIT_${identity}_TASTE_B`];
    const body = await this.api.createTaste({ name: groupName, secondName: `${groupName}_SECOND`, optionName: optionNames[0], optionNames });
    const record = requireNamedRecord(body, groupName) ?? requireNamedRecord(await this.api.tastePage(groupName), groupName);
    if (!record) throw new Error(`套餐口味组创建后未找到：${groupName}`);
    registerModifierCleanup(this.api, cleanupRegistry, 'taste', groupName, record.id, () => this.api.deleteMethod(record.id));
    return { groupName, optionNames };
  }

  async createMethodFixture(
    identity: string,
    cleanupRegistry: CleanupRegistry,
  ): Promise<{ groupName: string; optionNames: string[] }> {
    const groupName = `AUTO_AUDIT_${identity}_METHOD`;
    const optionNames = [`AUTO_AUDIT_${identity}_METHOD_A`, `AUTO_AUDIT_${identity}_METHOD_B`];
    const body = await this.api.createMethod({ name: groupName, secondName: `${groupName}_SECOND`, optionName: optionNames[0], optionNames });
    const record = requireNamedRecord(body, groupName) ?? requireNamedRecord(await this.api.methodPage(groupName), groupName);
    if (!record) throw new Error(`套餐做法组创建后未找到：${groupName}`);
    registerModifierCleanup(this.api, cleanupRegistry, 'method', groupName, record.id, () => this.api.deleteMethod(record.id));
    return { groupName, optionNames };
  }

  async createAddonFixture(
    identity: string,
    dependencyIdentity: string,
    cleanupRegistry: CleanupRegistry,
  ): Promise<{ groupName: string; optionNames: string[] }> {
    const groupName = `AUTO_AUDIT_${identity}_ADDON`;
    const product = requireProductRecord(await this.api.productPage(dependencyIdentity), dependencyIdentity);
    if (!product) throw new Error(`套餐加料组依赖商品未找到：${dependencyIdentity}`);
    const body = await this.api.createAddonGroup({ name: groupName, secondName: `${groupName}_SECOND`, itemId: product.id });
    const record = requireNamedRecord(body, groupName) ?? requireNamedRecord(await this.api.addonGroupList(groupName), groupName);
    if (!record) throw new Error(`套餐加料组创建后未找到：${groupName}`);
    registerModifierCleanup(this.api, cleanupRegistry, 'addon', groupName, record.id, () => this.api.deleteAddonGroup(record.id));
    return { groupName, optionNames: [dependencyIdentity] };
  }

  async createMenuFixture(itemIdentity: string, cleanupRegistry: CleanupRegistry): Promise<PackageItem216MenuFixture> {
    const item = requireProductRecord(await this.api.productPage(itemIdentity), itemIdentity);
    if (!item) throw new Error(`套餐菜单夹具商品不存在：${itemIdentity}`);
    const menuName = `AUTO_AUDIT_${itemIdentity}_MENU`;
    const menuResponse = await this.api.createMenu({ name: menuName, secondName: `${menuName}_SECOND`, code: `AUTO${Date.now().toString().slice(-10)}` });
    const menu = extractCreatedRecord(menuResponse, menuName) ?? requireNamedRecord(await this.api.menuPage(menuName), menuName);
    if (!menu) throw new Error(`套餐菜单创建后未找到：${menuName}`);
    const subMenuName = `${menuName}_PAGE_1`;
    const subMenu = requireNamedRecord(await this.api.menuSubMenuList(menu.id), subMenuName);
    if (!subMenu) throw new Error(`套餐菜单子页创建后未找到：${subMenuName}`);
    const blockName = `AUTO_AUDIT_${itemIdentity}_BLOCK`;
    const blockResponse = await this.api.createMenuBlock({ subMenuId: subMenu.id, code: `AUTO${Date.now().toString().slice(-10)}`, name: blockName, secondName: `${blockName}_SECOND` });
    const block = extractCreatedRecord(blockResponse, blockName) ?? requireNamedRecord(await this.api.menuBlockSearch(blockName), blockName);
    if (!block) throw new Error(`套餐菜单区块创建后未找到：${blockName}`);
    cleanupRegistry.register({
      entity: '套餐审计菜单',
      identity: menuName,
      checkpoint: { entryId: `package-menu-${menu.id}`, entityKind: 'menu', serverId: menu.id, identityVariants: [menuName], cleanupOrder: 20 },
      execute: async () => { for (const residue of namedRecords(await this.api.menuPage(menuName), menuName)) await this.api.deleteMenu(residue.id); },
      verify: async () => namedRecords(await this.api.menuPage(menuName), menuName).length === 0,
    });
    cleanupRegistry.register({
      entity: '套餐审计菜单区块',
      identity: blockName,
      checkpoint: { entryId: `package-menu-block-${block.id}`, entityKind: 'menu', serverId: block.id, identityVariants: [blockName], cleanupOrder: 30, dependencyOf: `package-menu-${menu.id}` },
      execute: async () => { for (const residue of namedRecords(await this.api.menuBlockSearch(blockName), blockName)) await this.api.deleteMenuBlock(residue.id); },
      verify: async () => namedRecords(await this.api.menuBlockSearch(blockName), blockName).length === 0,
    });
    return { menuId: menu.id, menuName, subMenuId: subMenu.id, subMenuName, blockId: block.id, blockName };
  }

  async bindMenuItem(menu: PackageItem216MenuFixture, itemId: number, itemIdentity: string, cleanupRegistry: CleanupRegistry): Promise<{ id: number }> {
    const response = await this.api.createMenuBlockItems([{ blockId: menu.blockId, itemId }]);
    const responseRecords = blockItemRecords(response, menu.blockId, itemId);
    const detailRecords = blockItemRecords(await this.api.menuBlockDetail(menu.blockId), menu.blockId, itemId);
    const identity = `AUTO_AUDIT_${itemIdentity}_MENU_BINDING`;
    cleanupRegistry.register({
      entity: '套餐审计菜单商品绑定',
      identity,
      checkpoint: {
        entryId: `package-menu-binding-${menu.blockId}-${itemId}`,
        entityKind: 'menu',
        serverId: responseRecords[0]?.id ?? `${menu.blockId}:${itemId}`,
        identityVariants: [identity],
        cleanupOrder: 60,
        dependencyOf: `package-menu-block-${menu.blockId}`,
      },
      execute: async () => {
        const structRecords = blockItemRecords(
          await this.api.menuBlockItemStructList({ menuId: menu.menuId, subMenuId: menu.subMenuId, blockId: menu.blockId, itemId }),
          menu.blockId,
          itemId,
        );
        const records = structRecords.length > 0
          ? structRecords
          : blockItemRecords(await this.api.menuBlockDetail(menu.blockId), menu.blockId, itemId);
        for (const residue of [...new Map(records.map((record) => [record.id, record])).values()]) {
          await this.api.deleteMenuBlockItem(residue.id);
        }
      },
      verify: async () => {
        const values = await Promise.all([
          this.api.menuBlockItemStructList({ menuId: menu.menuId, subMenuId: menu.subMenuId, blockId: menu.blockId, itemId }),
          this.api.menuBlockDetail(menu.blockId),
        ]);
        return values.every((value) => blockItemRecords(value, menu.blockId, itemId).length === 0);
      },
    });
    const queriedRecords = blockItemRecords(
      await this.api.menuBlockItemStructList({ menuId: menu.menuId, subMenuId: menu.subMenuId, blockId: menu.blockId, itemId }),
      menu.blockId,
      itemId,
    );
    const observedRecords = queriedRecords.length > 0 ? queriedRecords : [...responseRecords, ...detailRecords];
    const candidates = [...new Map(observedRecords.map((record) => [record.id, record])).values()];
    if (candidates.length !== 1) throw new Error(`套餐菜单绑定后身份不唯一：${JSON.stringify({ itemIdentity, response, queriedRecords })}`);
    const binding = candidates[0];
    return { id: binding.id };
  }

  async menuBindingCount(menu: PackageItem216MenuFixture, itemId: number): Promise<number> {
    const structRecords = blockItemRecords(
      await this.api.menuBlockItemStructList({ menuId: menu.menuId, subMenuId: menu.subMenuId, blockId: menu.blockId, itemId }),
      menu.blockId,
      itemId,
    );
    const records = structRecords.length > 0
      ? structRecords
      : blockItemRecords(await this.api.menuBlockDetail(menu.blockId), menu.blockId, itemId);
    return new Set(records.map((record) => record.id)).size;
  }

  async itemId(identity: string): Promise<number> {
    const record = requireNamedRecord(await this.api.productPage(identity), identity);
    if (!record) throw new Error(`套餐商品服务端 ID 不存在：${identity}`);
    return record.id;
  }

  async itemNameById(id: number): Promise<string> {
    const name = findProductNameById(await this.api.productDetail(id), id);
    if (!name) throw new Error(`套餐商品详情缺少名称：serverId=${id}`);
    return name;
  }

  observedPoiTarget(): { poiId: string; poiName: string } {
    const poiId = process.env.MC_POI_ID;
    if (!poiId) throw new Error('套餐菜单下发缺少 MC_POI_ID');
    return { poiId, poiName: poiId };
  }

  unresolved(caseId: string): PackageItem216UnresolvedContract {
    const contract = packageItem216UnresolvedContracts.find((item) => item.caseId === caseId);
    if (!contract) throw new Error(`套餐用例未登记 unresolved 合同：${caseId}`);
    return contract;
  }
}

function takeNamedValues(value: unknown, count: number, label: string): string[] {
  const names = [...new Set(findNamedValues(value))].filter((name) => !name.startsWith('AUTO_AUDIT_'));
  if (names.length < count) throw new Error(`${label}可观察选项不足：需要 ${count}，实际 ${names.length}`);
  return names.slice(0, count);
}

function findNamedValues(value: unknown, output: string[] = []): string[] {
  if (Array.isArray(value)) { for (const item of value) findNamedValues(item, output); return output; }
  if (!value || typeof value !== 'object') return output;
  const record = value as Record<string, unknown>;
  if (typeof record.name === 'string') output.push(record.name);
  for (const child of Object.values(record)) findNamedValues(child, output);
  return output;
}

function requireProductRecord(value: unknown, identity: string): { id: number } | undefined {
  const matches = productRecords(value, identity);
  if (matches.length > 1) throw new Error(`套餐商品夹具身份不唯一：${identity}`);
  return matches[0];
}

function productRecords(value: unknown, identity: string): Array<{ id: number }> {
  if (!value || typeof value !== 'object') return [];
  const response = value as Record<string, unknown>;
  const data = response.data;
  if (!data || typeof data !== 'object') return [];
  const list = (data as Record<string, unknown>).list;
  if (!Array.isArray(list)) return [];
  const matches = list.flatMap((item) => {
    if (!item || typeof item !== 'object') return [];
    const basic = (item as Record<string, unknown>).itemBasic;
    if (!basic || typeof basic !== 'object') return [];
    const record = basic as Record<string, unknown>;
    return record.name === identity && Number(record.id) > 0 ? [{ id: Number(record.id) }] : [];
  });
  return [...new Map(matches.map((item) => [item.id, item])).values()];
}

function requireNamedRecord(value: unknown, name: string): { id: number } | undefined {
  const matches: Array<{ id: number }> = [];
  const visit = (candidate: unknown) => {
    if (Array.isArray(candidate)) { for (const item of candidate) visit(item); return; }
    if (!candidate || typeof candidate !== 'object') return;
    const record = candidate as Record<string, unknown>;
    if (record.name === name && (typeof record.id === 'number' || typeof record.id === 'string')) matches.push({ id: Number(record.id) });
    for (const child of Object.values(record)) visit(child);
  };
  visit(value);
  const unique = [...new Map(matches.map((item) => [item.id, item])).values()];
  if (unique.length > 1) throw new Error(`套餐夹具身份不唯一：${name}`);
  return unique[0];
}

function registerModifierCleanup(
  api: ProductCenterApi,
  cleanupRegistry: CleanupRegistry,
  entityKind: 'taste' | 'method' | 'addon',
  identity: string,
  id: number,
  remove: () => Promise<unknown>,
): void {
  cleanupRegistry.register({
    entity: `套餐${entityKind}夹具`,
    identity,
    checkpoint: { entryId: `package-${entityKind}-${id}`, entityKind, serverId: id, identityVariants: [identity], cleanupOrder: 35 },
    execute: async () => {
      try {
        await remove();
      } catch (error) {
        const value = entityKind === 'addon'
          ? await api.addonGroupList(identity)
          : entityKind === 'taste'
            ? await api.tastePage(identity)
            : await api.methodPage(identity);
        if (findNamedValues(value).includes(identity)) throw error;
      }
    },
    verify: async () => {
      const value = entityKind === 'addon' ? await api.addonGroupList(identity) : entityKind === 'taste' ? await api.tastePage(identity) : await api.methodPage(identity);
      return !findNamedValues(value).includes(identity);
    },
  });
}

function namedRecords(value: unknown, name: string): Array<{ id: number }> {
  const output: Array<{ id: number }> = [];
  const visit = (candidate: unknown) => {
    if (Array.isArray(candidate)) { for (const item of candidate) visit(item); return; }
    if (!candidate || typeof candidate !== 'object') return;
    const record = candidate as Record<string, unknown>;
    if (record.name === name && Number(record.id) > 0) output.push({ id: Number(record.id) });
    for (const child of Object.values(record)) visit(child);
  };
  visit(value);
  return [...new Map(output.map((item) => [item.id, item])).values()];
}

function blockItemRecords(value: unknown, blockId: number, itemId: number): Array<{ id: number }> {
  const output: Array<{ id: number }> = [];
  const visit = (candidate: unknown, inheritedBlockId?: number) => {
    if (Array.isArray(candidate)) { for (const item of candidate) visit(item, inheritedBlockId); return; }
    if (!candidate || typeof candidate !== 'object') return;
    const record = candidate as Record<string, unknown>;
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
    const recordId = record.id ?? record.brandBlockItemId ?? record.blockItemId;
    const recordBlockId = record.blockId ?? record.brandMenuBlockId ?? record.menuBlockId ?? inheritedBlockId;
    const recordItemId = record.itemId
      ?? record.brandItemId
      ?? record.productId
      ?? (record.item && typeof record.item === 'object' ? (record.item as Record<string, unknown>).id : undefined)
      ?? (record.brandItem && typeof record.brandItem === 'object' ? (record.brandItem as Record<string, unknown>).id : undefined);
    if (Number(recordId) > 0 && Number(recordBlockId) === blockId && Number(recordItemId) === itemId) {
      output.push({ id: Number(recordId) });
    }
    for (const child of Object.values(record)) visit(child, Number(recordBlockId) || inheritedBlockId);
  };
  visit(value);
  return [...new Map(output.map((item) => [item.id, item])).values()];
}

function readFirstSkuId(value: unknown): number | undefined {
  if (Array.isArray(value)) {
    for (const item of value) {
      const id = readFirstSkuId(item);
      if (id !== undefined) return id;
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
    const id = readFirstSkuId(child);
    if (id !== undefined) return id;
  }
  return undefined;
}

function findProductNameById(value: unknown, id: number): string | undefined {
  if (Array.isArray(value)) {
    for (const item of value) {
      const name = findProductNameById(item, id);
      if (name) return name;
    }
    return undefined;
  }
  if (!value || typeof value !== 'object') return undefined;
  const record = value as Record<string, unknown>;
  if (Number(record.id) === id && typeof record.name === 'string') return record.name;
  for (const child of Object.values(record)) {
    const name = findProductNameById(child, id);
    if (name) return name;
  }
  return undefined;
}

function createPackageAuditPng(seed: string): Buffer {
  const width = 256;
  const height = 256;
  const hash = [...seed].reduce((value, character) => ((value * 31) + character.charCodeAt(0)) >>> 0, 17);
  const pixels = Buffer.alloc((width * 4 + 1) * height);
  for (let row = 0; row < height; row += 1) {
    const rowOffset = row * (width * 4 + 1);
    pixels[rowOffset] = 0;
    for (let column = 0; column < width; column += 1) {
      const pixelOffset = rowOffset + 1 + column * 4;
      const checker = (Math.floor(row / 32) + Math.floor(column / 32)) % 2;
      pixels[pixelOffset] = checker ? hash & 0xff : 255 - (hash & 0xff);
      pixels[pixelOffset + 1] = checker ? (hash >>> 8) & 0xff : 255 - ((hash >>> 8) & 0xff);
      pixels[pixelOffset + 2] = (column + row + ((hash >>> 16) & 0xff)) % 256;
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
    packagePngChunk('IHDR', header),
    packagePngChunk('IDAT', deflateSync(pixels)),
    packagePngChunk('IEND', Buffer.alloc(0)),
  ]);
}

function packagePngChunk(type: string, data: Buffer): Buffer {
  const typeBytes = Buffer.from(type, 'ascii');
  const payload = Buffer.concat([typeBytes, data]);
  const chunk = Buffer.alloc(12 + data.length);
  chunk.writeUInt32BE(data.length, 0);
  payload.copy(chunk, 4);
  chunk.writeUInt32BE(packagePngCrc32(payload), 8 + data.length);
  return chunk;
}

function packagePngCrc32(value: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of value) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
