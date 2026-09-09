import type { CleanupRegistry } from '../../../api/product-center/cleanup-registry';
import { extractCreatedRecord } from '../../../api/product-center/created-record';
import type { ProductCenterApi } from '../../../api/product-center/product-center-api';
import type { ProductCenterLedgerEntityKind } from '../../../api/product-center/execution-ledger';
import type { HighDependencyEntityKey } from '../../../sop/product-center/product-center-high-dependency-sop.catalog';
import { createAuditIdentity, type AuditEntity } from '../audit-identity';

export type HighDependencySeedRecord = {
  entityKey: HighDependencyEntityKey;
  id: number | string;
  originalIdentity: string;
  editedIdentity: string;
  checkpointEntryId: string;
  metadata: Readonly<Record<string, number | string>>;
};

type NamedRecord = { id: number | string; name?: string; shortName?: string } & Record<string, unknown>;

const auditEntityByKey: Record<HighDependencyEntityKey, AuditEntity> = {
  'recipe-ingredient': 'RECIPE_INGREDIENT', menu: 'MENU', printer: 'PRINTER', combo: 'COMBO',
};

export class ProductCenterHighDependencyDataFactory {
  constructor(private readonly api: ProductCenterApi) {}

  async seed(entityKey: HighDependencyEntityKey, cleanupRegistry: CleanupRegistry): Promise<HighDependencySeedRecord> {
    const identity = createAuditIdentity(auditEntityByKey[entityKey]);
    if (entityKey === 'recipe-ingredient') return this.seedRecipeIngredient(identity.marker, identity.editedMarker, identity.timestamp, cleanupRegistry);
    if (entityKey === 'menu') {
      const code = `M${String(identity.timestamp).slice(-13)}`;
      const response = await this.api.createMenu({ name: identity.marker, secondName: '菜单审计', code });
      const record = requireRecord(extractCreatedRecord(response, identity.marker) ?? findNamed(await this.api.menuPage(identity.marker), identity.marker), identity.marker);
      this.register(cleanupRegistry, '菜单', 'menu', identity.marker, record.id, 40, async () => findNamed(await this.api.menuPage(identity.editedMarker), identity.editedMarker) ?? findNamed(await this.api.menuPage(identity.marker), identity.marker), async (id) => this.api.deleteMenu(Number(id)));
      const subMenuIdentity = `${identity.marker}_PAGE_1`;
      const subMenu = requireRecord(findNamed(await this.api.menuDetail(Number(record.id)), subMenuIdentity), subMenuIdentity);
      const blockIdentity = `${identity.marker}_SECTION_1`;
      const blockCode = `B${String(identity.timestamp).slice(-12)}`;
      const blockResponse = await this.api.createMenuBlock({
        subMenuId: Number(subMenu.id),
        code: blockCode,
        name: blockIdentity,
        secondName: '菜单区块审计',
      });
      const block = requireRecord(extractCreatedRecord(blockResponse, blockIdentity) ?? findNamed(await this.api.menuBlockSearch(blockIdentity), blockIdentity), blockIdentity);
      this.register(cleanupRegistry, '菜单商品区块', 'menu-block', blockIdentity, block.id, 50, async () => findNamed(await this.api.menuBlockSearch(blockIdentity), blockIdentity), async (id) => this.api.deleteMenuBlock(Number(id)));
      return {
        entityKey,
        id: record.id,
        originalIdentity: identity.marker,
        editedIdentity: identity.editedMarker,
        checkpointEntryId: `menu-${record.id}`,
        metadata: { code, blockCode, blockIdentity, blockId: block.id, subMenuId: subMenu.id },
      };
    }
    if (entityKey === 'printer') {
      const stall = findNamed(await this.api.poiPrintStalls(), '厨房');
      if (!stall) throw new Error('打印机审计缺少只读门店打印档口：厨房');
      const response = await this.api.createPrinter({ name: identity.marker, poiPrintStallId: Number(stall.id) });
      const record = requireRecord(normalizeRecord(response, identity.marker) ?? findNamed(await this.api.printerPage(identity.marker), identity.marker), identity.marker);
      this.register(cleanupRegistry, '打印机', 'printer', identity.marker, record.id, 40, async () => findNamed(await this.api.printerPage(identity.editedMarker), identity.editedMarker) ?? findNamed(await this.api.printerPage(identity.marker), identity.marker), async (id) => this.api.deletePrinter(String(id)));
      return { entityKey, id: record.id, originalIdentity: identity.marker, editedIdentity: identity.editedMarker, checkpointEntryId: `printer-${record.id}`, metadata: { poiPrintStallId: Number(stall.id) } };
    }
    const productIdentity = `AUTO_AUDIT_COMBO_PRODUCT_${identity.timestamp}`;
    const productResponse = await this.api.createBomProduct(productIdentity);
    const product = requireRecord(normalizeRecord(productResponse, productIdentity) ?? findNamed(await this.api.productPage(productIdentity), productIdentity), productIdentity);
    cleanupRegistry.register({ entity: '套餐组商品依赖', identity: productIdentity, checkpoint: { entryId: `bom-product-${product.id}`, entityKind: 'bom-product', serverId: Number(product.id), identityVariants: [productIdentity], cleanupOrder: 10 }, execute: async () => { const residue = findNamed(await this.api.productPage(productIdentity), productIdentity); if (residue) await this.api.deleteBomProduct(Number(residue.id)); }, verify: async () => !findNamed(await this.api.productPage(productIdentity), productIdentity) });
    const detail = (await this.api.productDetail(Number(product.id))).data;
    const skuId = detail?.itemSpecDetail?.skuList?.[0]?.id ?? detail?.skuList?.[0]?.id ?? detail?.skus?.[0]?.id;
    if (skuId === undefined) throw new Error('套餐组审计商品缺少 SKU ID');
    const response = await this.api.createComboGroup({ name: identity.marker, itemId: Number(product.id), skuId: Number(skuId) });
    const record = requireRecord(normalizeRecord(response, identity.marker) ?? findNamed(await this.api.comboGroupList(), identity.marker), identity.marker);
    this.register(cleanupRegistry, '套餐组', 'combo', identity.marker, record.id, 40, async () => findNamed(await this.api.comboGroupList(), identity.editedMarker) ?? findNamed(await this.api.comboGroupList(), identity.marker), async (id) => this.api.deleteComboGroup(Number(id)));
    return { entityKey, id: record.id, originalIdentity: identity.marker, editedIdentity: identity.editedMarker, checkpointEntryId: `combo-${record.id}`, metadata: { productId: Number(product.id), skuId: Number(skuId), productIdentity } };
  }

  async verifyEdited(record: HighDependencySeedRecord): Promise<boolean> {
    if (record.entityKey === 'recipe-ingredient') {
      const item = this.findRecipe(await this.api.recipeIngredientList(), String(record.metadata.materialIdentity));
      return item?.shortName === record.metadata.editedShortName;
    }

    return (await this.findByEntity(record.entityKey, record.editedIdentity, record))?.id === record.id && !(await this.findByEntity(record.entityKey, record.originalIdentity, record));
  }

  async verifyAbsent(record: HighDependencySeedRecord): Promise<boolean> {
    if (record.entityKey === 'recipe-ingredient') return !this.findRecipe(await this.api.recipeIngredientList(), String(record.metadata.materialIdentity));
    return !(await this.findByEntity(record.entityKey, record.originalIdentity, record)) && !(await this.findByEntity(record.entityKey, record.editedIdentity, record));
  }

  private async seedRecipeIngredient(originalIdentity: string, editedIdentity: string, timestamp: number, cleanupRegistry: CleanupRegistry): Promise<HighDependencySeedRecord> {
    const category = findMaterialCategory(await this.api.materialCategoryTree());
    if (!category) throw new Error('配方原料审计缺少原料分类只读依赖');
    const materialIdentity = originalIdentity;
    const materialCode = `R${String(timestamp).slice(-12)}`;
    const materialResponse = await this.api.createMaterial({ name: materialIdentity, secondName: '配方原料审计', categoryId: Number(category.id), code: materialCode, description: 'AUTO_AUDIT 配方原料描述' });
    const material = requireRecord(extractCreatedRecord(materialResponse, materialIdentity) ?? findNamed(await this.api.materialPage(materialIdentity), materialIdentity), materialIdentity);
    cleanupRegistry.register({ entity: '配方原料原料依赖', identity: materialIdentity, checkpoint: { entryId: `material-${material.id}`, entityKind: 'material', serverId: Number(material.id), identityVariants: [materialIdentity], cleanupOrder: 20 }, execute: async () => { const residue = findNamed(await this.api.materialPage(materialIdentity), materialIdentity); if (residue) await this.api.deleteMaterial(Number(residue.id)); }, verify: async () => !findNamed(await this.api.materialPage(materialIdentity), materialIdentity) });
    const originalShortName = `A${String(timestamp).slice(-9)}`;
    const editedShortName = `B${String(timestamp).slice(-9)}`;
    const response = await this.api.createRecipeIngredient({ ingredientId: Number(material.id), categoryId: Number(category.id), shortName: originalShortName });
    const recipe = requireRecord(normalizeRecord(response, materialIdentity) ?? this.findRecipe(await this.api.recipeIngredientList(), materialIdentity), materialIdentity);
    cleanupRegistry.register({ entity: '配方原料', identity: materialIdentity, checkpoint: { entryId: `recipe-ingredient-${recipe.id}`, entityKind: 'recipe-ingredient', serverId: Number(recipe.id), identityVariants: [materialIdentity, editedIdentity], cleanupOrder: 40 }, execute: async () => { const residue = this.findRecipe(await this.api.recipeIngredientList(), materialIdentity); if (residue) await this.api.deleteRecipeIngredient(Number(residue.id)); }, verify: async () => !this.findRecipe(await this.api.recipeIngredientList(), materialIdentity) });
    return { entityKey: 'recipe-ingredient', id: recipe.id, originalIdentity: materialIdentity, editedIdentity, checkpointEntryId: `recipe-ingredient-${recipe.id}`, metadata: { materialId: Number(material.id), materialIdentity, categoryId: Number(category.id), originalShortName, editedShortName } };
  }

  private async findByEntity(entityKey: HighDependencyEntityKey, identity: string, record: HighDependencySeedRecord): Promise<NamedRecord | undefined> {
    if (entityKey === 'menu') return findNamed(await this.api.menuPage(identity), identity);
    if (entityKey === 'printer') return findNamed(await this.api.printerPage(identity), identity);
    return findNamed(await this.api.comboGroupList(), identity);
  }
  private findRecipe(value: unknown, identity: string): NamedRecord | undefined { return findNamed(value, identity); }
  private register(registry: CleanupRegistry, entity: string, entityKind: ProductCenterLedgerEntityKind, identity: string, id: number | string, cleanupOrder: number, find: () => Promise<NamedRecord | undefined>, remove: (id: number | string) => Promise<unknown>): void {
    registry.register({ entity, identity, checkpoint: { entryId: `${entityKind}-${id}`, entityKind, serverId: id, identityVariants: [identity], cleanupOrder }, execute: async () => { const residue = await find(); if (residue) await remove(residue.id); }, verify: async () => !(await find()) });
  }
}

function findMaterialCategory(value: unknown): NamedRecord | undefined {
  if (Array.isArray(value)) {
    for (const item of value) { const found = findMaterialCategory(item); if (found) return found; }
    return undefined;
  }
  if (!value || typeof value !== 'object') return undefined;
  const record = value as Record<string, unknown>;
  if (record.name === '糖类' && Array.isArray(record.children)) {
    return record.children.find((item) => Boolean(item) && typeof item === 'object' && (item as Record<string, unknown>).name === 'cc' && typeof (item as Record<string, unknown>).id === 'number') as NamedRecord | undefined;
  }
  for (const child of Object.values(record)) { const found = findMaterialCategory(child); if (found) return found; }
  return undefined;
}
function findNamed(value: unknown, identity: string): NamedRecord | undefined { if (Array.isArray(value)) { for (const item of value) { const found = findNamed(item, identity); if (found) return found; } return undefined; } if (!value || typeof value !== 'object') return undefined; const record = value as Record<string, unknown>; if ((typeof record.id === 'number' || typeof record.id === 'string') && ((typeof record.name === 'string' && normalizeIdentity(record.name) === normalizeIdentity(identity)) || record.shortName === identity)) return record as NamedRecord; for (const child of Object.values(record)) { const found = findNamed(child, identity); if (found) return found; } return undefined; }
function normalizeIdentity(value: string): string { return value.replace(/\\\\_/g, '_'); }
function normalizeRecord(response: any, identity: string): NamedRecord | undefined { const id = response?.data?.id ?? (typeof response?.data === 'number' ? response.data : undefined); return id !== undefined ? { id, name: identity } : undefined; }
function requireRecord(record: NamedRecord | undefined, identity: string): NamedRecord { if (!record) throw new Error(`未找到高依赖审计数据：${identity}`); return record; }
