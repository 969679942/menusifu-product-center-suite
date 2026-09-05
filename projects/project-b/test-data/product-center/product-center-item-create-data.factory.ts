import type { CleanupRegistry } from '../../api/product-center/cleanup-registry';
import { extractCreatedRecord } from '../../api/product-center/created-record';
import type { ProductCenterApi } from '../../api/product-center/product-center-api';
import { createAuditIdentity, nextAuditTimestamp } from './audit-identity';

// Re-export the deterministic audit clock through the shared data-factory
// boundary so item-family factories do not each add a separate dependency.
export { nextAuditTimestamp } from './audit-identity';

export type ProductCenterItemCreateContext = {
  entityKey: 'item';
  productType: 'standard' | 'combo' | 'side';
  originalIdentity: string;
  price: string;
  minimumOrderQuantity: string;
  comboGroupName?: string;
  customComboGroupName?: string;
  dependencyProductIdentity?: string;
  checkpointEntryId?: string;
  cleanupIdentityVariants?: string[];
  /** Audit-only key for cleanup registration when the business identity is fixed. */
  cleanupRegistrationIdentity?: string;
};

export type ProductCenterItemCreateRecord = ProductCenterItemCreateContext & {
  id: number;
  checkpointEntryId: string;
};

export type BrandProductFixtureRole = 'group-reference-owner' | 'addon-candidate' | 'combo-candidate';

export type BrandProductFixtureRecord = ProductCenterItemCreateRecord & {
  role: BrandProductFixtureRole;
  skuIds: number[];
};

export const brandProductFixtureCleanupOrder: Record<BrandProductFixtureRole, number> = {
  'group-reference-owner': 60,
  'addon-candidate': 20,
  'combo-candidate': 20,
};

type NamedRecord = { id: number; name: string };

export class ProductCenterItemCreateDataFactory {
  constructor(private readonly api: ProductCenterApi) {}

  async createSingleSkuBrandProduct(
    role: BrandProductFixtureRole,
    cleanupRegistry: CleanupRegistry,
    options: {
      identity?: string;
      categoryId?: number;
      price?: number;
      cleanupOrder?: number;
      dependencyOf?: string;
    } = {},
  ): Promise<BrandProductFixtureRecord> {
    const timestamp = nextAuditTimestamp();
    const identity = options.identity ?? `AUTO_AUDIT_${role.replace(/[^A-Z0-9]+/gi, '_').toUpperCase()}_${timestamp}`;
    const response = await this.api.createBomProduct(identity, options.categoryId ?? 142, { price: options.price ?? 1 });
    const record = await this.registerCreated({
      entityKey: 'item',
      productType: 'standard',
      originalIdentity: identity,
      price: String(options.price ?? 1),
      minimumOrderQuantity: '1',
    }, response, cleanupRegistry, {
      cleanupOrder: options.cleanupOrder ?? brandProductFixtureCleanupOrder[role],
      ...(options.dependencyOf ? { dependencyOf: options.dependencyOf } : {}),
    });
    const skuIds = readSkuIds(await this.api.productDetail(record.id));
    if (skuIds.length !== 1) {
      throw new Error(`${role} 单 SKU 品牌商品夹具数量错误：itemId=${record.id} skuIds=${skuIds.join(',')}`);
    }
    return { ...record, role, skuIds };
  }

  async prepare(timestamp = nextAuditTimestamp()): Promise<ProductCenterItemCreateContext> {
    const identity = createAuditIdentity('ITEM', timestamp).marker;
    const existing = findNamedRecords(await this.api.productPage(identity), identity);
    if (existing.length !== 0) throw new Error(`零元商品审计身份已存在：${identity}`);
    return {
      entityKey: 'item',
      productType: 'standard',
      originalIdentity: identity,
      price: '0',
      minimumOrderQuantity: '1',
    };
  }

  async prepareComboRequiredOnly(
    cleanupRegistry: CleanupRegistry,
    timestamp = nextAuditTimestamp(),
  ): Promise<ProductCenterItemCreateContext> {
    const itemIdentity = createAuditIdentity('ITEM', timestamp).marker;
    const comboGroupName = createAuditIdentity('COMBO', timestamp).marker;
    const dependencyProductIdentity = `AUTO_AUDIT_COMBO_PRODUCT_${timestamp}`;
    const existingItem = findNamedRecords(await this.api.productPage(itemIdentity), itemIdentity);
    if (existingItem.length !== 0) throw new Error(`套餐商品审计身份已存在：${itemIdentity}`);

    const dependencyResponse = await this.api.createBomProduct(dependencyProductIdentity);
    const dependencyProduct = extractCreatedRecord(dependencyResponse, dependencyProductIdentity)
      ?? requireUniqueRecord(
        findNamedRecords(await this.api.productPage(dependencyProductIdentity), dependencyProductIdentity),
        dependencyProductIdentity,
      );
    cleanupRegistry.register({
      entity: '套餐组依赖商品',
      identity: dependencyProductIdentity,
      checkpoint: {
        entryId: `bom-product-${dependencyProduct.id}`,
        entityKind: 'bom-product',
        serverId: dependencyProduct.id,
        identityVariants: [dependencyProductIdentity],
        cleanupOrder: 10,
      },
      execute: async () => {
        const residue = findNamedRecords(
          await this.api.productPage(dependencyProductIdentity),
          dependencyProductIdentity,
        )[0];
        if (residue) await this.api.deleteBomProduct(residue.id);
      },
      verify: async () => findNamedRecords(
        await this.api.productPage(dependencyProductIdentity),
        dependencyProductIdentity,
      ).length === 0,
    });

    const detail = await this.api.productDetail(dependencyProduct.id);
    const skuId = readFirstSkuId(detail);
    if (skuId === undefined) throw new Error('套餐组依赖商品缺少 SKU ID');
    const comboResponse = await this.api.createComboGroup({
      name: comboGroupName,
      itemId: dependencyProduct.id,
      skuId,
    });
    const comboGroup = extractCreatedRecord(comboResponse, comboGroupName)
      ?? requireUniqueRecord(findNamedObjects(await this.api.comboGroupList(), comboGroupName), comboGroupName);
    this.registerComboGroupCleanup(
      cleanupRegistry,
      comboGroupName,
      comboGroup.id,
      `bom-product-${dependencyProduct.id}`,
    );

    return {
      entityKey: 'item',
      productType: 'combo',
      originalIdentity: itemIdentity,
      price: '10.00',
      minimumOrderQuantity: '1',
      comboGroupName,
      customComboGroupName: `${comboGroupName}_OPTIONAL`,
      dependencyProductIdentity,
    };
  }

  async prepareComboGroupRequiredProbe(
    cleanupRegistry: CleanupRegistry,
    timestamp = nextAuditTimestamp(),
  ): Promise<ProductCenterItemCreateContext> {
    const identity = createAuditIdentity('ITEM', timestamp).marker;
    const existing = findNamedRecords(await this.api.productPage(identity), identity);
    if (existing.length !== 0) throw new Error(`套餐分组必填审计身份已存在：${identity}`);
    const checkpointEntryId = `item-probe-${timestamp}`;
    cleanupRegistry.register({
      entity: '套餐分组必填负向探测商品',
      identity,
      checkpoint: {
        entryId: checkpointEntryId,
        entityKind: 'item',
        serverId: `pending:${timestamp}`,
        identityVariants: [identity],
        cleanupOrder: 50,
      },
      execute: async () => {
        for (const residue of findNamedRecords(await this.api.productPage(identity), identity)) {
          await this.api.deleteBomProduct(residue.id);
        }
      },
      verify: async () => findNamedRecords(
        await this.api.productPage(identity),
        identity,
      ).length === 0,
    });
    return {
      entityKey: 'item',
      productType: 'combo',
      originalIdentity: identity,
      price: '10.00',
      minimumOrderQuantity: '1',
      checkpointEntryId,
    };
  }

  async prepareComboOptionalBoundaryProbe(
    cleanupRegistry: CleanupRegistry,
    timestamp = nextAuditTimestamp(),
  ): Promise<ProductCenterItemCreateContext> {
    return this.prepareComboRequiredOnly(cleanupRegistry, timestamp);
  }

  async itemRecordCount(identity: string): Promise<number> {
    return findNamedRecords(await this.api.productPage(identity), identity).length;
  }

  async comboGroupRecordCount(identity: string): Promise<number> {
    return findNamedObjects(await this.api.comboGroupList(), identity).length;
  }

  async brandImageRecordCount(identity: string): Promise<number> {
    return findNamedObjects(await this.api.brandImageList(identity), identity).length;
  }

  async registerBrandImageCreated(
    name: string,
    responseBody: unknown,
    cleanupRegistry: CleanupRegistry,
    intentId?: string,
  ): Promise<{ id: number; name: string; checkpointEntryId: string }> {
    const record = extractCreatedRecord(responseBody, name)
      ?? requireUniqueRecord(findNamedObjects(await this.api.brandImageList(name), name), name);
    const checkpointEntryId = `brand-image-${record.id}`;
    cleanupRegistry.register({
      entity: '品牌图片',
      identity: name,
      checkpoint: {
        entryId: checkpointEntryId,
        intentId,
        entityKind: 'brand-image',
        serverId: record.id,
        identityVariants: [name],
        cleanupOrder: 30,
      },
      execute: async () => {
        for (const residue of findNamedObjects(await this.api.brandImageList(name), name)) {
          await this.api.deleteBrandImage(residue.id);
        }
      },
      verify: async () => findNamedObjects(await this.api.brandImageList(name), name).length === 0,
    });
    return { id: record.id, name, checkpointEntryId };
  }

  async registerComboGroupCreated(
    name: string,
    responseBody: unknown,
    cleanupRegistry: CleanupRegistry,
    intentId?: string,
  ): Promise<{ id: number; name: string; checkpointEntryId: string }> {
    const record = extractCreatedRecord(responseBody, name)
      ?? requireUniqueRecord(findNamedObjects(await this.api.comboGroupList(), name), name);
    const checkpointEntryId = `combo-${record.id}`;
    this.registerComboGroupCleanup(cleanupRegistry, name, record.id, undefined, intentId);
    return { id: record.id, name, checkpointEntryId };
  }

  async registerCreated(
    context: ProductCenterItemCreateContext,
    responseBody: unknown,
    cleanupRegistry: CleanupRegistry,
    cleanupOptions: { cleanupOrder?: number; dependencyOf?: string; serverId?: number } = {},
  ): Promise<ProductCenterItemCreateRecord> {
    const responseRecord = extractCreatedRecord(responseBody, context.originalIdentity);
    const records = responseRecord
      ? [responseRecord]
      : findNamedRecords(await this.api.productPage(context.originalIdentity), context.originalIdentity);
    const record = responseRecord
      ?? (cleanupOptions.serverId === undefined
        ? requireUniqueRecord(records, context.originalIdentity)
        : records.find((candidate) => candidate.id === cleanupOptions.serverId)
          ?? requireUniqueRecord(records, context.originalIdentity));
    const checkpointEntryId = `item-${record.id}`;
    const identityVariants = [...new Set([
      context.originalIdentity,
      ...(context.cleanupIdentityVariants ?? []),
    ])];
    cleanupRegistry.register({
      entity: context.productType === 'combo' ? '套餐商品' : context.productType === 'side' ? '加料商品' : '标准商品',
      identity: context.cleanupRegistrationIdentity ?? context.originalIdentity,
      checkpoint: {
        entryId: checkpointEntryId,
        entityKind: 'item',
        serverId: record.id,
        identityVariants,
        cleanupOrder: cleanupOptions.cleanupOrder ?? 50,
        ...(cleanupOptions.dependencyOf ? { dependencyOf: cleanupOptions.dependencyOf } : {}),
      },
      execute: async () => {
        const candidateIds = new Set<number>([record.id]);
        for (const identity of identityVariants) {
          for (const residue of findNamedRecords(await this.api.productPage(identity), identity)) {
            candidateIds.add(residue.id);
          }
        }
        for (const candidateId of candidateIds) {
          let lastError: unknown;
          for (let attempt = 0; attempt < 3; attempt += 1) {
            try {
              await this.api.deleteBomProduct(candidateId);
              lastError = undefined;
            } catch (error) {
              lastError = error;
            }
            await new Promise((resolve) => setTimeout(resolve, 1_000));
            if (!(await this.itemRecordExistsById(candidateId))) break;
          }
          if (await this.itemRecordExistsById(candidateId)) {
            throw lastError ?? new Error(`商品清理后按 ID 仍存在：${candidateId}`);
          }
        }
      },
      verify: async () => {
        if (await this.itemRecordExistsById(record.id)) return false;
        for (const identity of identityVariants) {
          if (findNamedRecords(await this.api.productPage(identity), identity).length !== 0) return false;
        }
        return true;
      },
    });
    return { ...context, id: record.id, checkpointEntryId };
  }

  private async itemRecordExistsById(id: number): Promise<boolean> {
    return this.api.productDetail(id)
      .then((value) => readProductDetailId(value) === id)
      .catch((error: unknown) => {
        if (/item id not exist|HTTP 404/i.test(String(error))) return false;
        throw error;
      });
  }

  private registerComboGroupCleanup(
    cleanupRegistry: CleanupRegistry,
    comboGroupName: string,
    comboGroupId: number,
    dependencyOf?: string,
    intentId?: string,
  ): void {
    cleanupRegistry.register({
      entity: '套餐组',
      identity: comboGroupName,
      checkpoint: {
        entryId: `combo-${comboGroupId}`,
        intentId,
        entityKind: 'combo',
        serverId: comboGroupId,
        identityVariants: [comboGroupName],
        cleanupOrder: 40,
        dependencyOf,
      },
      execute: async () => {
        const residue = findNamedObjects(await this.api.comboGroupList(), comboGroupName)
          .find((record) => record.id === comboGroupId);
        if (residue) await this.api.deleteComboGroup(comboGroupId);
      },
      verify: async () => !findNamedObjects(await this.api.comboGroupList(), comboGroupName)
        .some((record) => record.id === comboGroupId),
    });
  }

  async verifyZeroPrice(record: ProductCenterItemCreateRecord): Promise<{
    recordCount: 1;
    apiPrice: 0;
  } | undefined> {
    const verified = await this.verifyPrice(record, 0);
    return verified ? { recordCount: 1, apiPrice: 0 } : undefined;
  }

  async verifyPrice(record: ProductCenterItemCreateRecord, expectedPrice: number): Promise<{
    recordCount: 1;
    apiPrice: number;
  } | undefined> {
    const matches = findNamedRecords(await this.api.productPage(record.originalIdentity), record.originalIdentity);
    if (matches.length !== 1 || matches[0].id !== record.id) return undefined;
    const detail = await this.api.productDetail(record.id);
    const apiPrice = readFirstSalePrice(detail);
    return apiPrice === expectedPrice ? { recordCount: 1, apiPrice } : undefined;
  }
}

function findNamedObjects(value: unknown, identity: string): NamedRecord[] {
  if (Array.isArray(value)) return value.flatMap((item) => findNamedObjects(item, identity));
  if (!value || typeof value !== 'object') return [];
  const record = value as Record<string, unknown>;
  const matches = typeof record.id === 'number'
    && typeof record.name === 'string'
    && normalizeIdentity(record.name) === normalizeIdentity(identity)
    ? [{ id: record.id, name: identity }]
    : [];
  return [...matches, ...Object.values(record).flatMap((child) => findNamedObjects(child, identity))];
}

function findNamedRecords(value: unknown, identity: string): NamedRecord[] {
  if (!value || typeof value !== 'object') return [];
  const response = value as Record<string, unknown>;
  const data = response.data;
  if (!data || typeof data !== 'object') return [];
  const list = (data as Record<string, unknown>).list;
  if (!Array.isArray(list)) return [];
  return list.flatMap((item) => {
    if (!item || typeof item !== 'object') return [];
    const basic = (item as Record<string, unknown>).itemBasic;
    if (!basic || typeof basic !== 'object') return [];
    const record = basic as Record<string, unknown>;
    return typeof record.id === 'number'
      && typeof record.name === 'string'
      && normalizeIdentity(record.name) === normalizeIdentity(identity)
      ? [{ id: record.id, name: identity }]
      : [];
  });
}

function requireUniqueRecord(records: NamedRecord[], identity: string): NamedRecord {
  if (records.length !== 1) {
    throw new Error(`UI 创建后商品身份不唯一：${identity}，实际数量 ${records.length}`);
  }
  return records[0];
}

function readFirstSalePrice(value: unknown): number | undefined {
  if (Array.isArray(value)) {
    for (const item of value) {
      const price = readFirstSalePrice(item);
      if (price !== undefined) return price;
    }
    return undefined;
  }
  if (!value || typeof value !== 'object') return undefined;
  const record = value as Record<string, unknown>;
  if (typeof record.salePrice === 'number') return record.salePrice;
  if (typeof record.salePrice === 'string' && record.salePrice.trim() !== '') {
    const price = Number(record.salePrice);
    if (Number.isFinite(price)) return price;
  }
  for (const child of Object.values(record)) {
    const price = readFirstSalePrice(child);
    if (price !== undefined) return price;
  }
  return undefined;
}

function readProductDetailId(value: unknown): number | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const response = value as Record<string, unknown>;
  const data = response.data && typeof response.data === 'object'
    ? response.data as Record<string, unknown>
    : undefined;
  const itemBasic = data?.itemBasic && typeof data.itemBasic === 'object'
    ? data.itemBasic as Record<string, unknown>
    : undefined;
  const candidate = itemBasic?.id ?? data?.id ?? response.id;
  const id = Number(candidate);
  return Number.isFinite(id) ? id : undefined;
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
    if (typeof sku?.id === 'number') return sku.id;
  }
  for (const child of Object.values(record)) {
    const id = readFirstSkuId(child);
    if (id !== undefined) return id;
  }
  return undefined;
}

export function readSkuIds(value: unknown): number[] {
  const ids = new Set<number>();
  const visit = (candidate: unknown): void => {
    if (Array.isArray(candidate)) {
      candidate.forEach(visit);
      return;
    }
    if (!candidate || typeof candidate !== 'object') return;
    const record = candidate as Record<string, unknown>;
    const directSkuId = Number(record.skuId);
    if (Number.isFinite(directSkuId) && directSkuId > 0) ids.add(directSkuId);
    if (Array.isArray(record.skuList)) {
      for (const sku of record.skuList) {
        if (!sku || typeof sku !== 'object') continue;
        const skuRecord = sku as Record<string, unknown>;
        const id = Number(skuRecord.skuId ?? skuRecord.id);
        if (Number.isFinite(id) && id > 0) ids.add(id);
      }
    }
    Object.values(record).forEach(visit);
  };
  visit(value);
  return [...ids];
}

function normalizeIdentity(value: string): string {
  return value.replace(/\\_/g, '_');
}
