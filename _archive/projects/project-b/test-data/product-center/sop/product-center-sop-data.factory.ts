import type { CleanupCheckpoint, CleanupRegistry } from '../../../api/product-center/cleanup-registry';
import { extractCreatedRecord } from '../../../api/product-center/created-record';
import type { ProductCenterApi } from '../../../api/product-center/product-center-api';
import type { ProductCenterLedgerEntityKind } from '../../../api/product-center/execution-ledger';
import type { ProductCenterCoreEntityKey } from '../../../sop/product-center/product-center-sop.types';
import {
  createAuditIdentity,
  nextAuditTimestamp,
  type AuditEntity,
} from '../audit-identity';

export type ProductCenterNamedRecord = {
  id: number;
  name: string;
};

export type ProductCenterSopSeedRecord = {
  entityKey: ProductCenterCoreEntityKey;
  id: number;
  originalIdentity: string;
  editedIdentity: string;
  cleanupIdentities: readonly string[];
  checkpointEntryId: string;
  metadata: Readonly<Record<string, number | string>>;
};

const auditEntityByKey: Record<ProductCenterCoreEntityKey, AuditEntity> = {
  category: 'CATEGORY',
  method: 'METHOD',
  material: 'MATERIAL',
  seasoning: 'SEASONING',
  bom: 'BOM',
};

export class ProductCenterSopDataFactory {
  constructor(private readonly api: ProductCenterApi) {}

  async seed(
    entityKey: ProductCenterCoreEntityKey,
    cleanupRegistry: CleanupRegistry,
    timestamp = nextAuditTimestamp(),
  ): Promise<ProductCenterSopSeedRecord> {
    const identity = createAuditIdentity(auditEntityByKey[entityKey], timestamp);
    switch (entityKey) {
      case 'category': return this.seedCategory(identity.marker, identity.editedMarker, timestamp, cleanupRegistry);
      case 'method': return this.seedMethod(identity.marker, identity.editedMarker, timestamp, cleanupRegistry);
      case 'material': return this.seedMaterial(identity.marker, identity.editedMarker, timestamp, cleanupRegistry);
      case 'seasoning': return this.seedSeasoning(identity.marker, identity.editedMarker, cleanupRegistry);
      case 'bom': return this.seedBom(identity.marker, identity.editedMarker, timestamp, cleanupRegistry);
    }
  }

  async find(
    entityKey: ProductCenterCoreEntityKey,
    identity: string,
  ): Promise<ProductCenterNamedRecord | undefined> {
    switch (entityKey) {
      case 'category': return collectNamedRecords(await this.api.categoryTree()).find((record) => record.name === identity);
      case 'method': return findNamedRecord(await this.api.methodPage(identity), identity);
      case 'material': return findNamedRecord(await this.api.materialPage(identity), identity);
      case 'seasoning': return findNamedRecord(await this.api.seasoningList(), identity);
      case 'bom': return findNamedRecord(await this.api.bomPage(identity), identity);
    }
  }

  async verifyEdited(record: ProductCenterSopSeedRecord): Promise<boolean> {
    const [edited, original] = await Promise.all([
      this.find(record.entityKey, record.editedIdentity),
      this.find(record.entityKey, record.originalIdentity),
    ]);
    return edited?.id === record.id && original === undefined;
  }

  async verifyAbsent(record: ProductCenterSopSeedRecord): Promise<boolean> {
    const [original, edited] = await Promise.all([
      this.find(record.entityKey, record.originalIdentity),
      this.find(record.entityKey, record.editedIdentity),
    ]);
    return original === undefined && edited === undefined;
  }

  private async seedCategory(
    originalIdentity: string,
    editedIdentity: string,
    timestamp: number,
    cleanupRegistry: CleanupRegistry,
  ): Promise<ProductCenterSopSeedRecord> {
    const code = `A${String(timestamp).slice(-8)}`;
    const response = await this.api.createCategory({ name: originalIdentity, secondName: '审计分类', code });
    const created = extractCreatedRecord(response, originalIdentity) ?? requireUniqueRecord(
      collectNamedRecords(await this.api.categoryTree()).filter((record) => record.name === originalIdentity),
      originalIdentity,
    );
    cleanupRegistry.register({
      entity: '商品分类',
      identity: originalIdentity,
      checkpoint: createCheckpoint('category', created.id, [originalIdentity, editedIdentity], 10),
      execute: async () => {
        const residues = collectNamedRecords(await this.api.categoryTree()).filter(
          (record) => record.name === originalIdentity || record.name === editedIdentity,
        );
        for (const residue of residues) await this.api.deleteCategory(residue.id);
      },
      verify: async () => !(await this.find('category', originalIdentity)) && !(await this.find('category', editedIdentity)),
    });
    return createSeedRecord('category', created.id, originalIdentity, editedIdentity, [originalIdentity, editedIdentity], { code });
  }

  private async seedMethod(
    originalIdentity: string,
    editedIdentity: string,
    timestamp: number,
    cleanupRegistry: CleanupRegistry,
  ): Promise<ProductCenterSopSeedRecord> {
    const response = await this.api.createMethod({ name: originalIdentity, secondName: '做法审计', optionName: `AUTO_AUDIT_METHOD_OPTION_${timestamp}` });
    const created = requireRecord(
      extractCreatedRecord(response, originalIdentity) ?? await this.find('method', originalIdentity),
      originalIdentity,
    );
    cleanupRegistry.register({
      entity: '做法组', identity: originalIdentity,
      checkpoint: createCheckpoint('method', created.id, [originalIdentity, editedIdentity], 10),
      execute: async () => {
        for (const name of [editedIdentity, originalIdentity]) {
          const residue = await this.find('method', name);
          if (residue) await this.api.deleteMethod(residue.id);
        }
      },
      verify: async () => !(await this.find('method', originalIdentity)) && !(await this.find('method', editedIdentity)),
    });
    return createSeedRecord('method', created.id, originalIdentity, editedIdentity, [originalIdentity, editedIdentity]);
  }

  private async seedMaterial(
    originalIdentity: string,
    editedIdentity: string,
    timestamp: number,
    cleanupRegistry: CleanupRegistry,
  ): Promise<ProductCenterSopSeedRecord> {
    const category = requireMaterialCategory(await this.api.materialCategoryTree());
    const code = `M${String(timestamp).slice(-12)}`;
    const response = await this.api.createMaterial({
      name: originalIdentity,
      secondName: '原料审计',
      categoryId: category.id,
      code,
      description: 'AUTO_AUDIT 原料描述',
    });
    const created = requireRecord(
      extractCreatedRecord(response, originalIdentity) ?? await this.find('material', originalIdentity),
      originalIdentity,
    );
    cleanupRegistry.register({
      entity: '原料', identity: originalIdentity,
      checkpoint: createCheckpoint('material', created.id, [originalIdentity, editedIdentity], 10),
      execute: async () => {
        for (const name of [editedIdentity, originalIdentity]) {
          const residue = await this.find('material', name);
          if (residue) await this.api.deleteMaterial(residue.id);
        }
      },
      verify: async () => !(await this.find('material', originalIdentity)) && !(await this.find('material', editedIdentity)),
    });
    return createSeedRecord('material', created.id, originalIdentity, editedIdentity, [originalIdentity, editedIdentity], {
      categoryId: category.id,
      code,
    });
  }

  private async seedSeasoning(
    originalIdentity: string,
    editedIdentity: string,
    cleanupRegistry: CleanupRegistry,
  ): Promise<ProductCenterSopSeedRecord> {
    const response = await this.api.createSeasoning({ name: originalIdentity, secondName: '调味审计' });
    const created = requireRecord(
      extractCreatedRecord(response, originalIdentity) ?? await this.find('seasoning', originalIdentity),
      originalIdentity,
    );
    cleanupRegistry.register({
      entity: '品牌调味', identity: originalIdentity,
      checkpoint: createCheckpoint('seasoning', created.id, [originalIdentity, editedIdentity], 10),
      execute: async () => {
        for (const name of [editedIdentity, originalIdentity]) {
          const residue = await this.find('seasoning', name);
          if (residue) await this.api.deleteSeasoning(residue.id);
        }
      },
      verify: async () => !(await this.find('seasoning', originalIdentity)) && !(await this.find('seasoning', editedIdentity)),
    });
    return createSeedRecord('seasoning', created.id, originalIdentity, editedIdentity, [originalIdentity, editedIdentity]);
  }

  private async seedBom(
    originalIdentity: string,
    editedIdentity: string,
    timestamp: number,
    cleanupRegistry: CleanupRegistry,
  ): Promise<ProductCenterSopSeedRecord> {
    const productIdentity = `AUTO_AUDIT_BOM_PRODUCT_${timestamp}`;
    const materialIdentity = `AUTO_AUDIT_BOM_MATERIAL_${timestamp}`;
    const materialEditedIdentity = `${materialIdentity}_EDIT`;
    const category = requireMaterialCategory(await this.api.materialCategoryTree());

    const productResponse = await this.api.createBomProduct(productIdentity);
    const productRecord = requireRecord(
      extractCreatedRecord(productResponse, productIdentity) ?? findNamedRecord(await this.api.productPage(productIdentity), productIdentity),
      productIdentity,
    );
    cleanupRegistry.register({
      entity: '配方单商品依赖', identity: productIdentity,
      checkpoint: createCheckpoint('bom-product', productRecord.id, [productIdentity], 10),
      execute: async () => {
        const residue = findNamedRecord(await this.api.productPage(productIdentity), productIdentity);
        if (residue) await this.api.deleteBomProduct(residue.id);
      },
      verify: async () => !findNamedRecord(await this.api.productPage(productIdentity), productIdentity),
    });

    const materialCode = `B${String(timestamp).slice(-12)}`;
    const materialResponse = await this.api.createMaterial({
      name: materialIdentity,
      secondName: '配方原料审计',
      categoryId: category.id,
      code: materialCode,
      description: 'AUTO_AUDIT 配方原料描述',
    });
    const materialRecord = requireRecord(
      extractCreatedRecord(materialResponse, materialIdentity) ?? findNamedRecord(await this.api.materialPage(materialIdentity), materialIdentity),
      materialIdentity,
    );
    cleanupRegistry.register({
      entity: '配方单原料依赖', identity: materialIdentity,
      checkpoint: createCheckpoint('material', materialRecord.id, [materialIdentity, materialEditedIdentity], 20),
      execute: async () => {
        for (const name of [materialEditedIdentity, materialIdentity]) {
          const residue = findNamedRecord(await this.api.materialPage(name), name);
          if (residue) await this.api.deleteMaterial(residue.id);
        }
      },
      verify: async () => !findNamedRecord(await this.api.materialPage(materialIdentity), materialIdentity) &&
        !findNamedRecord(await this.api.materialPage(materialEditedIdentity), materialEditedIdentity),
    });

    const recipeResponse = await this.api.createRecipeIngredient({
      ingredientId: materialRecord.id,
      categoryId: category.id,
      shortName: `A${String(timestamp).slice(-9)}`,
    });
    const recipeRecord = requireRecord(
      extractCreatedRecord(recipeResponse, materialIdentity) ?? findRecipeRecord(await this.api.recipeIngredientList(), materialIdentity),
      materialIdentity,
    );
    cleanupRegistry.register({
      entity: '配方原料依赖', identity: materialIdentity,
      checkpoint: createCheckpoint('recipe-ingredient', recipeRecord.id, [materialIdentity], 30),
      execute: async () => {
        const residue = findRecipeRecord(await this.api.recipeIngredientList(), materialIdentity);
        if (residue) await this.api.deleteRecipeIngredient(residue.id);
      },
      verify: async () => !findRecipeRecord(await this.api.recipeIngredientList(), materialIdentity),
    });

    const productDetail = await this.api.productDetail(productRecord.id);
    const skuId = productDetail?.data?.skuList?.[0]?.id;
    if (typeof skuId !== 'number') throw new Error(`审计商品缺少 SKU ID：${productIdentity}`);

    const bomResponse = await this.api.createBom({
      itemId: productRecord.id,
      groupBoms: [{
        groupName: 'Default Group',
        boms: [{
          name: originalIdentity,
          item: { skuId },
          recipeMaterials: [{
            ingredientCategoryId: category.id,
            ingredientId: recipeRecord.id,
            dosage: 1,
            configuration: { sugarRule: { enabled: 1 } },
            sortOrder: 0,
            ingredientName: materialIdentity,
          }],
        }],
      }],
    });
    const bomRecord = requireRecord(
      extractCreatedRecord(bomResponse, originalIdentity) ?? await this.find('bom', originalIdentity),
      originalIdentity,
    );
    cleanupRegistry.register({
      entity: '配方单', identity: originalIdentity,
      checkpoint: createCheckpoint('bom', bomRecord.id, [originalIdentity, editedIdentity], 40),
      execute: async () => {
        const residue = (await this.find('bom', editedIdentity)) ?? (await this.find('bom', originalIdentity));
        if (residue) await this.api.deleteBom(residue.id);
      },
      verify: async () => !(await this.find('bom', originalIdentity)) && !(await this.find('bom', editedIdentity)),
    });

    return createSeedRecord(
      'bom', bomRecord.id, originalIdentity, editedIdentity,
      [originalIdentity, editedIdentity, productIdentity, materialIdentity, materialEditedIdentity],
      { productId: productRecord.id, materialId: materialRecord.id, recipeIngredientId: recipeRecord.id, skuId, productIdentity, materialIdentity },
    );
  }
}

function createCheckpoint(
  entityKind: ProductCenterLedgerEntityKind,
  serverId: number,
  identityVariants: string[],
  cleanupOrder: number,
): CleanupCheckpoint {
  return {
    entryId: `${entityKind}-${serverId}`,
    entityKind,
    serverId,
    identityVariants,
    cleanupOrder,
  };
}

function createSeedRecord(
  entityKey: ProductCenterCoreEntityKey,
  id: number,
  originalIdentity: string,
  editedIdentity: string,
  cleanupIdentities: readonly string[],
  metadata: Readonly<Record<string, number | string>> = {},
): ProductCenterSopSeedRecord {
  return {
    entityKey,
    id,
    originalIdentity,
    editedIdentity,
    cleanupIdentities,
    checkpointEntryId: `${entityKey}-${id}`,
    metadata,
  };
}

function requireRecord(
  record: ProductCenterNamedRecord | undefined,
  identity: string,
): ProductCenterNamedRecord {
  if (!record) throw new Error(`未找到 API 创建后的唯一审计数据：${identity}`);
  return record;
}

function requireUniqueRecord(
  records: ProductCenterNamedRecord[],
  identity: string,
): ProductCenterNamedRecord {
  if (records.length !== 1) throw new Error(`审计数据不唯一：${identity}，实际数量 ${records.length}`);
  return records[0];
}

function collectNamedRecords(value: unknown, records: ProductCenterNamedRecord[] = []): ProductCenterNamedRecord[] {
  if (Array.isArray(value)) {
    for (const item of value) collectNamedRecords(item, records);
    return records;
  }
  if (!value || typeof value !== 'object') return records;
  const record = value as Record<string, unknown>;
  if (typeof record.id === 'number' && typeof record.name === 'string') records.push({ id: record.id, name: normalizeIdentity(record.name) });
  for (const child of Object.values(record)) collectNamedRecords(child, records);
  return records;
}

function findNamedRecord(value: unknown, identity: string): ProductCenterNamedRecord | undefined {
  return collectNamedRecords(value).find((record) => record.name === normalizeIdentity(identity));
}

function findRecipeRecord(value: unknown, identity: string): ProductCenterNamedRecord | undefined {
  if (Array.isArray(value)) {
    for (const item of value) {
      const match = findRecipeRecord(item, identity);
      if (match) return match;
    }
    return undefined;
  }
  if (!value || typeof value !== 'object') return undefined;
  const record = value as Record<string, unknown>;
  const normalizedIdentity = normalizeIdentity(identity);
  if ((typeof record.id === 'number' || typeof record.id === 'string') && subtreeContainsIdentity(record, normalizedIdentity)) {
    return { id: Number(record.id), name: identity };
  }
  for (const child of Object.values(record)) {
    const match = findRecipeRecord(child, identity);
    if (match) return match;
  }
  return undefined;
}

function subtreeContainsIdentity(value: unknown, identity: string): boolean {
  if (typeof value === 'string') return normalizeIdentity(value) === identity;
  if (Array.isArray(value)) return value.some((item) => subtreeContainsIdentity(item, identity));
  if (!value || typeof value !== 'object') return false;
  return Object.values(value as Record<string, unknown>).some((item) => subtreeContainsIdentity(item, identity));
}

function normalizeIdentity(value: string): string {
  return value.replace(/\\_/g, '_');
}

function requireMaterialCategory(value: unknown): ProductCenterNamedRecord {
  const match = findChildCategory(value, '糖类', 'cc');
  if (!match) throw new Error('未找到已验证的只读原料分类路径：糖类 → cc');
  return match;
}

function findChildCategory(
  value: unknown,
  parentName: string,
  childName: string,
): ProductCenterNamedRecord | undefined {
  if (Array.isArray(value)) {
    for (const item of value) {
      const match = findChildCategory(item, parentName, childName);
      if (match) return match;
    }
    return undefined;
  }
  if (!value || typeof value !== 'object') return undefined;
  const record = value as Record<string, unknown>;
  if (record.name === parentName && Array.isArray(record.children)) {
    const child = record.children.find((item) => {
      if (!item || typeof item !== 'object') return false;
      const candidate = item as Record<string, unknown>;
      return candidate.name === childName && typeof candidate.id === 'number';
    }) as Record<string, unknown> | undefined;
    if (child) return { id: Number(child.id), name: String(child.name) };
  }
  for (const child of Object.values(record)) {
    const match = findChildCategory(child, parentName, childName);
    if (match) return match;
  }
  return undefined;
}