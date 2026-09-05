import type { CleanupRegistry } from '../../../api/product-center/cleanup-registry';
import { extractCreatedRecord } from '../../../api/product-center/created-record';
import type { ProductCenterApi } from '../../../api/product-center/product-center-api';
import type { ProductCenterCoreEntityKey } from '../../../sop/product-center/product-center-sop.types';
import { createAuditIdentity, nextAuditTimestamp, type AuditEntity } from '../audit-identity';
import {
  ProductCenterSopDataFactory,
  type ProductCenterNamedRecord,
  type ProductCenterSopSeedRecord,
} from './product-center-sop-data.factory';

export type ProductCenterCreateContext = {
  entityKey: ProductCenterCoreEntityKey;
  originalIdentity: string;
  editedIdentity: string;
  cleanupIdentities: readonly string[];
  metadata: Readonly<Record<string, number | string>>;
};

const auditEntityByKey: Record<ProductCenterCoreEntityKey, AuditEntity> = {
  category: 'CATEGORY', method: 'METHOD', material: 'MATERIAL', seasoning: 'SEASONING', bom: 'BOM',
};

export class ProductCenterCreateDataFactory {
  private readonly coreFactory: ProductCenterSopDataFactory;

  constructor(private readonly api: ProductCenterApi) {
    this.coreFactory = new ProductCenterSopDataFactory(api);
  }

  async prepare(
    entityKey: ProductCenterCoreEntityKey,
    cleanupRegistry: CleanupRegistry,
    timestamp = nextAuditTimestamp(),
  ): Promise<ProductCenterCreateContext> {
    const identity = createAuditIdentity(auditEntityByKey[entityKey], timestamp);
    if (entityKey === 'category') {
      return createContext(entityKey, identity.marker, identity.editedMarker, {
        code: `A${String(timestamp).slice(-8)}`,
      });
    }
    if (entityKey === 'method') {
      return createContext(entityKey, identity.marker, identity.editedMarker, {
        optionName: `AUTO_AUDIT_OPTION_${timestamp}`,
      });
    }
    if (entityKey === 'material') {
      const category = requireMaterialCategory(await this.api.materialCategoryTree());
      return createContext(entityKey, identity.marker, identity.editedMarker, {
        categoryId: category.id,
        categoryRootName: '糖类',
        categoryChildName: 'cc',
        code: `M${String(timestamp).slice(-12)}`,
      });
    }
    if (entityKey === 'seasoning') {
      return createContext(entityKey, identity.marker, identity.editedMarker, {
        optionName: `AUTO_AUDIT_SEASONING_OPTION_${timestamp}`,
      });
    }
    return this.prepareBom(identity.marker, identity.editedMarker, timestamp, cleanupRegistry);
  }

  async findPrimary(context: ProductCenterCreateContext): Promise<ProductCenterNamedRecord | undefined> {
    return this.coreFactory.find(context.entityKey, context.originalIdentity);
  }

  async registerCreated(
    context: ProductCenterCreateContext,
    record: ProductCenterNamedRecord,
    cleanupRegistry: CleanupRegistry,
  ): Promise<ProductCenterSopSeedRecord> {
    const checkpointEntryId = `${context.entityKey}-${record.id}`;
    cleanupRegistry.register({
      entity: entityName(context.entityKey),
      identity: context.originalIdentity,
      checkpoint: {
        entryId: checkpointEntryId,
        entityKind: context.entityKey,
        serverId: record.id,
        identityVariants: [context.originalIdentity, context.editedIdentity],
        cleanupOrder: 40,
      },
      execute: async () => {
        const residue =
          (await this.coreFactory.find(context.entityKey, context.editedIdentity)) ??
          (await this.coreFactory.find(context.entityKey, context.originalIdentity));
        if (residue) await this.deletePrimary(context.entityKey, residue.id);
      },
      verify: async () =>
        !(await this.coreFactory.find(context.entityKey, context.originalIdentity)) &&
        !(await this.coreFactory.find(context.entityKey, context.editedIdentity)),
    });
    return {
      entityKey: context.entityKey,
      id: record.id,
      originalIdentity: context.originalIdentity,
      editedIdentity: context.editedIdentity,
      cleanupIdentities: context.cleanupIdentities,
      checkpointEntryId,
      metadata: context.metadata,
    };
  }

  private async prepareBom(
    originalIdentity: string,
    editedIdentity: string,
    timestamp: number,
    cleanupRegistry: CleanupRegistry,
  ): Promise<ProductCenterCreateContext> {
    const productIdentity = `AUTO_AUDIT_BOM_PRODUCT_${timestamp}`;
    const materialIdentity = `AUTO_AUDIT_BOM_MATERIAL_${timestamp}`;
    const category = requireMaterialCategory(await this.api.materialCategoryTree());

    const productResponse = await this.api.createBomProduct(productIdentity);
    const productRecord = requireRecord(
      normalizeCreatedRecord(productResponse, productIdentity) ??
        findNamedRecord(await this.api.productPage(productIdentity), productIdentity),
      productIdentity,
    );
    cleanupRegistry.register({
      entity: '配方单商品依赖', identity: productIdentity,
      checkpoint: {
        entryId: `bom-product-${productRecord.id}`, entityKind: 'bom-product', serverId: productRecord.id,
        identityVariants: [productIdentity], cleanupOrder: 10,
      },
      execute: async () => {
        const residue = findNamedRecord(await this.api.productPage(productIdentity), productIdentity);
        if (residue) await this.api.deleteBomProduct(residue.id);
      },
      verify: async () => !findNamedRecord(await this.api.productPage(productIdentity), productIdentity),
    });

    const materialResponse = await this.api.createMaterial({
      name: materialIdentity,
      secondName: '配方原料审计',
      categoryId: category.id,
      code: `B${String(timestamp).slice(-12)}`,
      description: 'AUTO_AUDIT 配方原料描述',
    });
    const materialRecord = requireRecord(
      extractCreatedRecord(materialResponse, materialIdentity) ??
        findNamedRecord(await this.api.materialPage(materialIdentity), materialIdentity),
      materialIdentity,
    );
    cleanupRegistry.register({
      entity: '配方单原料依赖', identity: materialIdentity,
      checkpoint: {
        entryId: `material-${materialRecord.id}`, entityKind: 'material', serverId: materialRecord.id,
        identityVariants: [materialIdentity, `${materialIdentity}_EDIT`], cleanupOrder: 20,
      },
      execute: async () => {
        const residue = findNamedRecord(await this.api.materialPage(materialIdentity), materialIdentity);
        if (residue) await this.api.deleteMaterial(residue.id);
      },
      verify: async () => !findNamedRecord(await this.api.materialPage(materialIdentity), materialIdentity),
    });

    const recipeResponse = await this.api.createRecipeIngredient({
      ingredientId: materialRecord.id,
      categoryId: category.id,
      shortName: `A${String(timestamp).slice(-9)}`,
    });
    const recipeRecord = requireRecord(
      normalizeCreatedRecord(recipeResponse, materialIdentity) ??
        findNamedRecord(await this.api.recipeIngredientList(), materialIdentity),
      materialIdentity,
    );
    cleanupRegistry.register({
      entity: '配方原料依赖', identity: materialIdentity,
      checkpoint: {
        entryId: `recipe-ingredient-${recipeRecord.id}`, entityKind: 'recipe-ingredient', serverId: recipeRecord.id,
        identityVariants: [materialIdentity], cleanupOrder: 30,
      },
      execute: async () => {
        const residue = findNamedRecord(await this.api.recipeIngredientList(), materialIdentity);
        if (residue) await this.api.deleteRecipeIngredient(residue.id);
      },
      verify: async () => !findNamedRecord(await this.api.recipeIngredientList(), materialIdentity),
    });

    const productDetail = await this.api.productDetail(productRecord.id);
    const skuId = productDetail.data?.skuList?.[0]?.id;
    if (typeof skuId !== 'number') throw new Error(`审计商品缺少 SKU ID：${productIdentity}`);

    return createContext('bom', originalIdentity, editedIdentity, {
      productIdentity,
      productId: productRecord.id,
      skuId,
      materialIdentity,
      materialId: materialRecord.id,
      recipeIngredientId: recipeRecord.id,
      categoryId: category.id,
    }, [originalIdentity, editedIdentity, productIdentity, materialIdentity]);
  }

  private async deletePrimary(entityKey: ProductCenterCoreEntityKey, id: number): Promise<void> {
    if (entityKey === 'category') return void await this.api.deleteCategory(id);
    if (entityKey === 'method') return void await this.api.deleteMethod(id);
    if (entityKey === 'material') return void await this.api.deleteMaterial(id);
    if (entityKey === 'seasoning') return void await this.api.deleteSeasoning(id);
    await this.api.deleteBom(id);
  }
}

function createContext(
  entityKey: ProductCenterCoreEntityKey,
  originalIdentity: string,
  editedIdentity: string,
  metadata: Readonly<Record<string, number | string>>,
  cleanupIdentities: readonly string[] = [originalIdentity, editedIdentity],
): ProductCenterCreateContext {
  return { entityKey, originalIdentity, editedIdentity, metadata, cleanupIdentities };
}

function entityName(entityKey: ProductCenterCoreEntityKey): string {
  return { category: '商品分类', method: '做法组', material: '原料', seasoning: '品牌调味', bom: '配方单' }[entityKey];
}

function normalizeCreatedRecord(response: unknown, identity: string): ProductCenterNamedRecord | undefined {
  return extractCreatedRecord(response, identity);
}

function findNamedRecord(value: unknown, identity: string): ProductCenterNamedRecord | undefined {
  if (Array.isArray(value)) {
    for (const item of value) {
      const match = findNamedRecord(item, identity);
      if (match) return match;
    }
    return undefined;
  }
  if (!value || typeof value !== 'object') return undefined;
  const record = value as Record<string, unknown>;
  if (typeof record.id === 'number' && record.name === identity) return { id: record.id, name: identity };
  for (const child of Object.values(record)) {
    const match = findNamedRecord(child, identity);
    if (match) return match;
  }
  return undefined;
}

function requireRecord(record: ProductCenterNamedRecord | undefined, identity: string): ProductCenterNamedRecord {
  if (!record) throw new Error(`未找到 API 创建后的唯一审计依赖：${identity}`);
  return record;
}

function requireMaterialCategory(value: unknown): ProductCenterNamedRecord {
  const match = findChildCategory(value, '糖类', 'cc');
  if (!match) throw new Error('未找到已验证的只读原料分类路径：糖类 → cc');
  return match;
}

function findChildCategory(value: unknown, rootName: string, childName: string): ProductCenterNamedRecord | undefined {
  if (Array.isArray(value)) {
    for (const item of value) {
      const match = findChildCategory(item, rootName, childName);
      if (match) return match;
    }
    return undefined;
  }
  if (!value || typeof value !== 'object') return undefined;
  const record = value as Record<string, unknown>;
  if (record.name === rootName && Array.isArray(record.children)) {
    const child = record.children.find((item) =>
      typeof item === 'object' && item !== null &&
      (item as Record<string, unknown>).name === childName &&
      typeof (item as Record<string, unknown>).id === 'number',
    ) as Record<string, unknown> | undefined;
    if (child) return { id: child.id as number, name: child.name as string };
  }
  for (const child of Object.values(record)) {
    const match = findChildCategory(child, rootName, childName);
    if (match) return match;
  }
  return undefined;
}
