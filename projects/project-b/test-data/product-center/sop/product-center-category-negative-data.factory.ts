import type { CleanupRegistry } from '../../../api/product-center/cleanup-registry';
import { extractCreatedRecord } from '../../../api/product-center/created-record';
import type { ProductCenterApi } from '../../../api/product-center/product-center-api';
import { nextAuditTimestamp } from '../audit-identity';

export type CategoryTreeRecord = {
  id: number;
  name: string;
  parentId?: number;
  children: CategoryTreeRecord[];
};

export type CategoryWithProductSeedRecord = {
  parentCategoryId: number;
  parentCategoryName: string;
  productId: number;
  productName: string;
  childCategoryName: string;
  checkpointEntryId: string;
};

export type ProductCategoryTreeSeedRecord = {
  parentA: CategoryTreeRecord;
  childA: CategoryTreeRecord;
  childB: CategoryTreeRecord;
  parentB: CategoryTreeRecord;
  childC: CategoryTreeRecord;
  identities: string[];
};

type NamedRecord = { id: number; name: string };

export class ProductCenterCategoryNegativeDataFactory {
  constructor(private readonly api: ProductCenterApi) {}

  async seedCategoryWithProduct(
    cleanupRegistry: CleanupRegistry,
    timestamp = nextAuditTimestamp(),
  ): Promise<CategoryWithProductSeedRecord> {
    const parentCategoryName = `AUTO_AUDIT_CATEGORY_PARENT_${timestamp}`;
    const productName = `AUTO_AUDIT_CATEGORY_PRODUCT_${timestamp}`;
    const childCategoryName = `AUTO_AUDIT_CATEGORY_CHILD_${timestamp}`;
    const code = `R${String(timestamp).slice(-8)}`;

    const categoryResponse = await this.api.createCategory({
      name: parentCategoryName,
      secondName: '审计关系分类',
      code,
    });
    const parentCategory = extractCreatedRecord(categoryResponse, parentCategoryName)
      ?? requireRecord(await this.findCategory(parentCategoryName), parentCategoryName);
    const checkpointEntryId = `category-${parentCategory.id}`;

    cleanupRegistry.register({
      entity: '商品分类关系阻断父分类',
      identity: parentCategoryName,
      checkpoint: {
        entryId: checkpointEntryId,
        entityKind: 'category',
        serverId: parentCategory.id,
        identityVariants: [parentCategoryName],
        cleanupOrder: 10,
      },
      execute: async () => {
        const residue = await this.findCategory(parentCategoryName);
        if (residue) await this.api.deleteCategory(residue.id);
      },
      verify: async () => !(await this.findCategory(parentCategoryName)),
    });

    const productResponse = await this.api.createBomProduct(productName, parentCategory.id);
    const product = extractCreatedRecord(productResponse, productName)
      ?? requireRecord(await this.findProduct(productName), productName);

    cleanupRegistry.register({
      entity: '商品分类关系阻断商品依赖',
      identity: productName,
      checkpoint: {
        entryId: `bom-product-${product.id}`,
        entityKind: 'bom-product',
        serverId: product.id,
        identityVariants: [productName],
        cleanupOrder: 20,
        dependencyOf: checkpointEntryId,
      },
      execute: async () => {
        const residue = await this.findProduct(productName);
        if (residue) await this.api.deleteBomProduct(residue.id);
      },
      verify: async () => !(await this.findProduct(productName)),
    });

    return {
      parentCategoryId: parentCategory.id,
      parentCategoryName,
      productId: product.id,
      productName,
      childCategoryName,
      checkpointEntryId,
    };
  }

  async seedTwoLevelCategoryTree(
    cleanupRegistry: CleanupRegistry,
    timestamp = nextAuditTimestamp(),
  ): Promise<ProductCategoryTreeSeedRecord> {
    const parentA = await this.createAndRegisterCategory(cleanupRegistry, {
      name: `AUTO_AUDIT_WAVE_D_CATEGORY_PARENT_A_${timestamp}`,
      secondName: 'Wave D Parent A',
      code: `DA${String(timestamp).slice(-7)}`,
      level: 1,
    });
    const childA = await this.createAndRegisterCategory(cleanupRegistry, {
      name: `AUTO_AUDIT_WAVE_D_CATEGORY_CHILD_A_${timestamp}`,
      secondName: 'Wave D Child A',
      code: `D1${String(timestamp).slice(-7)}`,
      parentId: parentA.id,
      level: 2,
    }, `category-${parentA.id}`);
    const childB = await this.createAndRegisterCategory(cleanupRegistry, {
      name: `AUTO_AUDIT_WAVE_D_CATEGORY_CHILD_B_${timestamp}`,
      secondName: 'Wave D Child B',
      code: `D2${String(timestamp).slice(-7)}`,
      parentId: parentA.id,
      level: 2,
    }, `category-${parentA.id}`);
    const parentB = await this.createAndRegisterCategory(cleanupRegistry, {
      name: `AUTO_AUDIT_WAVE_D_CATEGORY_PARENT_B_${timestamp}`,
      secondName: 'Wave D Parent B',
      code: `DB${String(timestamp).slice(-7)}`,
      level: 1,
    });
    const childC = await this.createAndRegisterCategory(cleanupRegistry, {
      name: `AUTO_AUDIT_WAVE_D_CATEGORY_CHILD_C_${timestamp}`,
      secondName: 'Wave D Child C',
      code: `D3${String(timestamp).slice(-7)}`,
      parentId: parentB.id,
      level: 2,
    }, `category-${parentB.id}`);
    return {
      parentA,
      childA,
      childB,
      parentB,
      childC,
      identities: [parentA.name, childA.name, childB.name, parentB.name, childC.name],
    };
  }

  async findCategory(name: string): Promise<CategoryTreeRecord | undefined> {
    return collectCategoryTree(await this.api.categoryTree())
      .find((record) => record.name === normalizeIdentity(name));
  }

  async findProduct(name: string): Promise<NamedRecord | undefined> {
    return collectNamedRecords(await this.api.productPage(name))
      .find((record) => record.name === normalizeIdentity(name));
  }

  async findChildCategory(
    parentCategoryId: number,
    childCategoryName: string,
  ): Promise<CategoryTreeRecord | undefined> {
    const parent = collectCategoryTree(await this.api.categoryTree())
      .find((record) => record.id === parentCategoryId);
    return parent?.children.find((record) => record.name === normalizeIdentity(childCategoryName));
  }

  registerCreatedChild(
    cleanupRegistry: CleanupRegistry,
    record: CategoryWithProductSeedRecord,
    child: CategoryTreeRecord,
  ): void {
    cleanupRegistry.register({
      entity: '商品分类关系阻断异常子分类',
      identity: record.childCategoryName,
      checkpoint: {
        entryId: `category-${child.id}`,
        entityKind: 'category',
        serverId: child.id,
        identityVariants: [record.childCategoryName],
        cleanupOrder: 30,
        dependencyOf: record.checkpointEntryId,
      },
      execute: async () => {
        const residue = await this.findCategory(record.childCategoryName);
        if (residue) await this.api.deleteCategory(residue.id);
      },
      verify: async () => !(await this.findCategory(record.childCategoryName)),
    });
  }

  private async createAndRegisterCategory(
    cleanupRegistry: CleanupRegistry,
    input: {
      name: string;
      secondName: string;
      code: string;
      parentId?: number;
      level: 1 | 2;
    },
    dependencyOf?: string,
  ): Promise<CategoryTreeRecord> {
    const response = await this.api.createCategory(input);
    const created = extractCreatedRecord(response, input.name)
      ?? requireRecord(await this.findCategory(input.name), input.name);
    const record = await this.findCategory(input.name);
    if (!record || record.id !== created.id) throw new Error(`分类创建后未唯一回显：${input.name}`);
    cleanupRegistry.register({
      entity: input.level === 1 ? '商品一级分类' : '商品二级分类',
      identity: input.name,
      checkpoint: {
        entryId: `category-${record.id}`,
        entityKind: 'category',
        serverId: record.id,
        identityVariants: [input.name],
        cleanupOrder: input.level === 1 ? 10 : 20,
        dependencyOf,
      },
      execute: async () => {
        const residue = await this.findCategory(input.name);
        if (residue) await this.api.deleteCategory(residue.id);
      },
      verify: async () => !(await this.findCategory(input.name)),
    });
    return record;
  }
}

function collectCategoryTree(value: unknown, records: CategoryTreeRecord[] = []): CategoryTreeRecord[] {
  if (Array.isArray(value)) {
    for (const item of value) collectCategoryTree(item, records);
    return records;
  }
  if (!value || typeof value !== 'object') return records;
  const valueRecord = value as Record<string, unknown>;
  if (typeof valueRecord.id === 'number' && typeof valueRecord.name === 'string') {
    records.push({
      id: valueRecord.id,
      name: normalizeIdentity(valueRecord.name),
      parentId: typeof valueRecord.parentId === 'number' ? valueRecord.parentId : undefined,
      children: directCategoryChildren(valueRecord.children),
    });
  }
  for (const child of Object.values(valueRecord)) collectCategoryTree(child, records);
  return records;
}

function directCategoryChildren(value: unknown): CategoryTreeRecord[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== 'object') return [];
    const record = item as Record<string, unknown>;
    if (typeof record.id !== 'number' || typeof record.name !== 'string') return [];
    return [{
      id: record.id,
      name: normalizeIdentity(record.name),
      parentId: typeof record.parentId === 'number' ? record.parentId : undefined,
      children: directCategoryChildren(record.children),
    }];
  });
}

function collectNamedRecords(value: unknown, records: NamedRecord[] = []): NamedRecord[] {
  if (Array.isArray(value)) {
    for (const item of value) collectNamedRecords(item, records);
    return records;
  }
  if (!value || typeof value !== 'object') return records;
  const record = value as Record<string, unknown>;
  if ((typeof record.id === 'number' || typeof record.id === 'string') && typeof record.name === 'string') {
    records.push({ id: Number(record.id), name: normalizeIdentity(record.name) });
  }
  for (const child of Object.values(record)) collectNamedRecords(child, records);
  return records;
}

function requireRecord<T extends NamedRecord>(record: T | undefined, identity: string): T {
  if (!record) throw new Error(`未找到 API 创建后的唯一审计数据：${identity}`);
  return record;
}

function normalizeIdentity(value: string): string {
  return value.replace(/\\_/g, '_');
}
