import type { CleanupRegistry } from '../../../api/product-center/cleanup-registry';
import type { ProductCenterApi } from '../../../api/product-center/product-center-api';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { deflateSync } from 'node:zlib';
import {
  ProductCenterItemCreateDataFactory,
  nextAuditTimestamp,
  readSkuIds,
  type BrandProductFixtureRecord,
  type BrandProductFixtureRole,
  type ProductCenterItemCreateContext,
  type ProductCenterItemCreateRecord,
} from '../product-center-item-create-data.factory';

export type StandardItem216Context = ProductCenterItemCreateContext & {
  caseId?: string;
};

export type StandardItem216AttributeFixture = {
  kind: 'spec' | 'taste' | 'method' | 'addon';
  id: number;
  groupName: string;
  optionNames: string[];
  checkpointEntryId: string;
  cleanupIdentityVariants?: string[];
};

export type StandardItem216CategoryFixture = {
  parentA: { id: number; name: string };
  childA1: { id: number; name: string };
  childA2: { id: number; name: string };
  parentB: { id: number; name: string };
  childB1: { id: number; name: string };
};

export type StandardItem216ReferenceFixture = {
  id: number;
  name: string;
};

export type StandardItem216MaterialFixture = {
  id: number;
  name: string;
  categoryId: number;
  categoryName: string;
};

export type StandardItem216IngredientInfoFixtures = {
  ingredient: StandardItem216MaterialFixture;
  allergen: StandardItem216ReferenceFixture;
  nutrition: StandardItem216ReferenceFixture;
};

export type StandardItem216MainImageEvidence = {
  sourceFields: string[];
  references: string[];
};

export class StandardItem216Factory {
  private readonly itemFactory: ProductCenterItemCreateDataFactory;

  constructor(private readonly api: ProductCenterApi) {
    this.itemFactory = new ProductCenterItemCreateDataFactory(api);
  }

  async prepare(caseId?: string): Promise<StandardItem216Context> {
    return { ...(await this.itemFactory.prepare()), caseId };
  }

  async registerCreated(
    context: StandardItem216Context,
    responseBody: unknown,
    cleanupRegistry: CleanupRegistry,
    cleanupOptions: { cleanupOrder?: number; dependencyOf?: string } = {},
  ): Promise<ProductCenterItemCreateRecord> {
    return this.itemFactory.registerCreated(context, responseBody, cleanupRegistry, cleanupOptions);
  }

  async verifyPrice(record: ProductCenterItemCreateRecord, expectedPrice: number): Promise<boolean> {
    return Boolean(await this.itemFactory.verifyPrice(record, expectedPrice));
  }

  async itemRecordCount(identity: string): Promise<number> {
    return this.itemFactory.itemRecordCount(identity);
  }

  async createSingleSkuBrandProduct(
    role: BrandProductFixtureRole,
    cleanupRegistry: CleanupRegistry,
    identity: string,
  ): Promise<BrandProductFixtureRecord> {
    return this.itemFactory.createSingleSkuBrandProduct(role, cleanupRegistry, { identity });
  }

  async registerUiCreatedSingleSkuBrandProduct(
    role: BrandProductFixtureRole,
    cleanupRegistry: CleanupRegistry,
    identity: string,
  ): Promise<BrandProductFixtureRecord> {
    const productType = role === 'addon-candidate' ? 'side' : 'standard';
    const record = await this.itemFactory.registerCreated({
      entityKey: 'item',
      productType,
      originalIdentity: identity,
      price: '1.00',
      minimumOrderQuantity: '1',
    }, null, cleanupRegistry, { cleanupOrder: 20 });
    const skuIds = readSkuIds(await this.api.productDetail(record.id));
    if (skuIds.length !== 1) {
      throw new Error(`${role} UI 单 SKU 品牌商品夹具数量错误：itemId=${record.id} skuIds=${skuIds.join(',')}`);
    }
    return { ...record, role, skuIds };
  }

  async readMainImageEvidence(itemId: number): Promise<StandardItem216MainImageEvidence> {
    return readMainImageEvidence(await this.api.productDetail(itemId));
  }

  async createLocalImageAssets(caseId: string, count: number): Promise<{
    paths: string[];
    cleanup: () => Promise<void>;
  }> {
    const directory = await mkdtemp(path.join(os.tmpdir(), `auto-audit-${caseId.replace(/[^A-Za-z0-9_-]/g, '_')}-`));
    const paths: string[] = [];
    for (let index = 0; index < count; index += 1) {
      const filePath = path.join(
        directory,
        `AUTO_AUDIT_${normalizeCaseId(caseId)}_${Date.now()}_${index + 1}.png`,
      );
      await writeFile(filePath, createStandardItemAuditPng(`${caseId}-${index + 1}`));
      paths.push(filePath);
    }
    return {
      paths,
      cleanup: async () => rm(directory, { recursive: true, force: true }),
    };
  }

  async registerUploadedBrandImageFixture(
    candidateNames: readonly string[],
    cleanupRegistry: CleanupRegistry,
  ): Promise<{
    id: number;
    name: string;
    checkpointEntryId: string;
    imagePath?: string;
    imageUrl?: string;
  }> {
    for (const name of candidateNames) {
      const response = await this.api.brandImageList(name);
      const image = requireNamedImageRecord(response, name);
      if (image) {
        return {
          ...await this.itemFactory.registerBrandImageCreated(name, response, cleanupRegistry),
          ...(image.imagePath ? { imagePath: image.imagePath } : {}),
          ...(image.imageUrl ? { imageUrl: image.imageUrl } : {}),
        };
      }
    }
    throw new Error(`标准商品图片上传后未找到品牌图片夹具：${JSON.stringify(candidateNames)}`);
  }

  async createMaterialFixture(
    caseId: string,
    cleanupRegistry: CleanupRegistry,
  ): Promise<StandardItem216MaterialFixture> {
    const suffix = normalizeCaseId(caseId);
    const rootCategoryName = `AUTO_AUDIT_${suffix}_MATERIAL_CATEGORY_ROOT`;
    const rootCategoryResponse = await this.api.createMaterialCategory({
      name: rootCategoryName,
      secondName: `${rootCategoryName}_SECOND`,
    });
    const rootCategory = requireNamedRecord(rootCategoryResponse, rootCategoryName)
      ?? requireNamedRecord(await this.api.materialCategoryTree(), rootCategoryName);
    if (!rootCategory) throw new Error(`标准商品一级材料分类创建后未找到：${rootCategoryName}`);
    this.registerNamedCleanup(
      cleanupRegistry,
      '标准商品一级材料分类',
      'material-category',
      rootCategoryName,
      rootCategory.id,
      async () => {
        const residue = requireNamedRecord(await this.api.materialCategoryTree(), rootCategoryName);
        if (residue) await this.api.deleteCategory(residue.id);
      },
      async () => !containsNamed(await this.api.materialCategoryTree(), rootCategoryName),
      [rootCategoryName],
      20,
    );
    const categoryName = `AUTO_AUDIT_${suffix}_MATERIAL_CATEGORY_LEAF`;
    const categoryResponse = await this.api.createMaterialCategory({
      name: categoryName,
      secondName: `${categoryName}_SECOND`,
      parentId: rootCategory.id,
    });
    const category = requireNamedRecord(categoryResponse, categoryName)
      ?? requireNamedRecord(await this.api.materialCategoryTree(), categoryName);
    if (!category) throw new Error(`标准商品二级材料分类创建后未找到：${categoryName}`);
    this.registerNamedCleanup(
      cleanupRegistry,
      '标准商品二级材料分类',
      'material-category',
      categoryName,
      category.id,
      async () => {
        const residue = requireNamedRecord(await this.api.materialCategoryTree(), categoryName);
        if (residue) await this.api.deleteCategory(residue.id);
      },
      async () => !containsNamed(await this.api.materialCategoryTree(), categoryName),
      [categoryName],
      30,
    );
    const name = `AUTO_AUDIT_${suffix}_MATERIAL`;
    const response = await this.api.createMaterial({
      name,
      secondName: `${name}_SECOND`,
      categoryId: category.id,
      code: `A${Date.now().toString().slice(-12)}`,
      description: 'AUTO_AUDIT standard ingredient fixture',
    });
    const record = requireNamedRecord(response, name)
      ?? requireNamedRecord(await this.api.materialPage(name), name);
    if (!record) throw new Error(`标准商品原料创建后未找到：${name}`);
    this.registerNamedCleanup(
      cleanupRegistry,
      '标准商品原料',
      'material',
      name,
      record.id,
      async () => {
        const residue = requireNamedRecord(await this.api.materialPage(name), name);
        if (residue) await this.api.deleteMaterial(residue.id);
      },
      async () => !containsNamed(await this.api.materialPage(name), name),
      [name],
      40,
    );
    return { id: record.id, name, categoryId: category.id, categoryName };
  }

  async createIngredientInfoFixtures(
    caseId: string,
    cleanupRegistry: CleanupRegistry,
  ): Promise<StandardItem216IngredientInfoFixtures> {
    const ingredient = await this.createMaterialFixture(caseId, cleanupRegistry);
    const allergen = findFirstEnabledNamedResource(await this.api.allergenAll());
    const nutrition = findFirstEnabledNamedResource(await this.api.nutritionAll());
    if (!allergen) throw new Error('TEST_DATA_BLOCKED 标准商品过敏原列表没有可选择的启用数据。');
    if (!nutrition) throw new Error('TEST_DATA_BLOCKED 标准商品营养成分列表没有可选择的启用数据。');
    return { ingredient, allergen, nutrition };
  }

  async createTasteFixture(
    caseId: string,
    cleanupRegistry: CleanupRegistry,
    options: { optionCount?: 1 | 2 } = {},
  ): Promise<StandardItem216AttributeFixture> {
    const suffix = `${normalizeCaseId(caseId)}_${nextAuditTimestamp()}`;
    const groupName = `AUTO_AUDIT_${suffix}_TASTE`;
    const optionNames = [`AUTO_AUDIT_${suffix}_TASTE_A`, `AUTO_AUDIT_${suffix}_TASTE_B`]
      .slice(0, options.optionCount ?? 2);
    await this.deleteAuditTasteResidue([groupName, `${groupName}_SYNCED`]);
    const response = await this.api.createTaste({
      name: groupName,
      secondName: `${groupName}_SECOND`,
      optionName: optionNames[0],
      optionNames,
    });
    const record = requireNamedRecord(response, groupName)
      ?? requireNamedRecord(await this.api.tastePage(groupName), groupName);
    if (!record) throw new Error(`标准商品口味组创建后未找到：${groupName}`);
    const cleanupIdentityVariants = [groupName];
    this.registerNamedCleanup(cleanupRegistry, '标准商品口味组', 'taste', groupName, record.id, async () => {
      const residue = await Promise.all(cleanupIdentityVariants.map(async (identity) => ({
        identity,
        exists: containsNamed(await this.api.tastePage(identity), identity),
      })));
      if (residue.some((item) => item.exists)) await this.api.deleteMethod(record.id);
    }, async () => {
      const residue = await Promise.all(cleanupIdentityVariants.map(async (identity) => (
        containsNamed(await this.api.tastePage(identity), identity)
      )));
      return residue.every((exists) => !exists);
    }, cleanupIdentityVariants);
    return {
      kind: 'taste',
      id: record.id,
      groupName,
      optionNames,
      checkpointEntryId: `standard-item-taste-${record.id}`,
      cleanupIdentityVariants,
    };
  }

  async createSpecFixture(
    caseId: string,
    cleanupRegistry: CleanupRegistry,
    options: { optionCount?: 1 | 2 } = {},
  ): Promise<StandardItem216AttributeFixture> {
    const suffix = `${normalizeCaseId(caseId)}_${nextAuditTimestamp()}`;
    const groupName = `AUTO_AUDIT_${suffix}_SPEC`;
    const optionNames = [`AUTO_AUDIT_${suffix}_SPEC_A`, `AUTO_AUDIT_${suffix}_SPEC_B`]
      .slice(0, options.optionCount ?? 2);
    const response = await this.api.createSpec({
      name: groupName,
      secondName: `${groupName}_SECOND`,
      optionName: optionNames[0],
      optionNames,
    });
    const record = requireNamedRecord(response, groupName)
      ?? requireNamedRecord(await this.api.specPage(groupName), groupName);
    if (!record) throw new Error(`标准商品规格组创建后未找到：${groupName}`);
    const cleanupIdentityVariants = [groupName];
    this.registerNamedCleanup(cleanupRegistry, '标准商品规格组', 'spec', groupName, record.id, async () => {
      if (await this.attributeFixtureExists('spec', cleanupIdentityVariants)) await this.api.deleteSpec(record.id);
    }, async () => !await this.attributeFixtureExists('spec', cleanupIdentityVariants), cleanupIdentityVariants);
    return {
      kind: 'spec',
      id: record.id,
      groupName,
      optionNames,
      checkpointEntryId: `standard-item-spec-${record.id}`,
      cleanupIdentityVariants,
    };
  }

  async createMethodFixture(
    caseId: string,
    cleanupRegistry: CleanupRegistry,
    options: { optionCount?: 1 | 2 } = {},
  ): Promise<StandardItem216AttributeFixture> {
    const suffix = normalizeCaseId(caseId);
    const groupName = `AUTO_AUDIT_${suffix}_METHOD`;
    const optionNames = [`AUTO_AUDIT_${suffix}_METHOD_A`, `AUTO_AUDIT_${suffix}_METHOD_B`]
      .slice(0, options.optionCount ?? 2);
    const response = await this.api.createMethod({
      name: groupName,
      secondName: `${groupName}_SECOND`,
      optionName: optionNames[0],
      optionNames,
    });
    const record = requireNamedRecord(response, groupName)
      ?? requireNamedRecord(await this.api.methodPage(groupName), groupName);
    if (!record) throw new Error(`标准商品做法组创建后未找到：${groupName}`);
    const cleanupIdentityVariants = [groupName];
    this.registerNamedCleanup(cleanupRegistry, '标准商品做法组', 'method', groupName, record.id, async () => {
      if (await this.attributeFixtureExists('method', cleanupIdentityVariants)) await this.api.deleteMethod(record.id);
    }, async () => !await this.attributeFixtureExists('method', cleanupIdentityVariants), cleanupIdentityVariants);
    return {
      kind: 'method',
      id: record.id,
      groupName,
      optionNames,
      checkpointEntryId: `standard-item-method-${record.id}`,
      cleanupIdentityVariants,
    };
  }

  async createAddonFixture(
    caseId: string,
    dependency: ProductCenterItemCreateRecord | readonly ProductCenterItemCreateRecord[],
    cleanupRegistry: CleanupRegistry,
  ): Promise<StandardItem216AttributeFixture> {
    const suffix = normalizeCaseId(caseId);
    const groupName = `AUTO_AUDIT_${suffix}_ADDON`;
    const dependencies = Array.isArray(dependency) ? dependency : [dependency];
    if (dependencies.length === 0) throw new Error('标准商品加料组至少需要一个商品候选');
    const response = await this.api.createAddonGroup({
      name: groupName,
      secondName: `${groupName}_SECOND`,
      itemIds: dependencies.map((item) => item.id),
    });
    const record = requireNamedRecord(response, groupName)
      ?? requireNamedRecord(await this.api.addonGroupList(groupName), groupName);
    if (!record) throw new Error(`标准商品加料组创建后未找到：${groupName}`);
    const cleanupIdentityVariants = [groupName];
    this.registerNamedCleanup(cleanupRegistry, '标准商品加料组', 'addon', groupName, record.id, async () => {
      try {
        await this.api.deleteAddonGroup(record.id);
      } catch (error) {
        if (await addonGroupExistsById(this.api, record.id)) throw error;
      }
      const normalizedResidues = findNormalizedNamedRecords(await this.api.addonGroupList(groupName), groupName);
      for (const residue of normalizedResidues) {
        if (residue.id !== record.id) await this.api.deleteAddonGroup(residue.id);
      }
    }, async () => !await addonGroupExistsById(this.api, record.id)
      && findNormalizedNamedRecords(await this.api.addonGroupList(groupName), groupName).length === 0,
    cleanupIdentityVariants, 30);
    return {
      kind: 'addon',
      id: record.id,
      groupName,
      optionNames: dependencies.map((item) => item.originalIdentity),
      checkpointEntryId: `standard-item-addon-${record.id}`,
      cleanupIdentityVariants,
    };
  }

  async readAttributeFixtureSnapshot(fixture: StandardItem216AttributeFixture): Promise<string> {
    const detail = fixture.kind === 'addon'
      ? await this.api.addonGroupDetail(fixture.id)
      : await this.api.methodDetail(fixture.id);
    return JSON.stringify(detail);
  }

  async createPrintStallFixtures(
    caseId: string,
    count: number,
    cleanupRegistry: CleanupRegistry,
  ): Promise<string[]> {
    const names: string[] = [];
    for (let index = 0; index < count; index += 1) {
      const name = `AUTO_AUDIT_${normalizeCaseId(caseId)}_STALL_${index + 1}`;
      const response = await this.api.createPrintStall({ name, remark: 'AUTO_AUDIT standard item stall' });
      const record = requireNamedRecord(response, name)
        ?? requireNamedRecord(await this.api.printStallPage(name), name);
      if (!record) throw new Error(`标准商品打印档口创建后未找到：${name}`);
      this.registerNamedCleanup(cleanupRegistry, '标准商品打印档口', 'print-stall', name, record.id, async () => {
        await this.api.deletePrintStall(record.id);
      }, async () => !containsNamed(await this.api.printStallPage(name), name));
      names.push(name);
    }
    return names;
  }

  async createCategoryFixture(caseId: string, cleanupRegistry: CleanupRegistry): Promise<StandardItem216CategoryFixture> {
    const suffix = normalizeCaseId(caseId);
    const parentA = await this.createCategoryRecord(`AUTO_AUDIT_${suffix}_CATEGORY_A`, 0, 1, cleanupRegistry, 30);
    const childA1 = await this.createCategoryRecord(`AUTO_AUDIT_${suffix}_CATEGORY_A1`, parentA.id, 2, cleanupRegistry, 40);
    const childA2 = await this.createCategoryRecord(`AUTO_AUDIT_${suffix}_CATEGORY_A2`, parentA.id, 2, cleanupRegistry, 40);
    const parentB = await this.createCategoryRecord(`AUTO_AUDIT_${suffix}_CATEGORY_B`, 0, 1, cleanupRegistry, 30);
    const childB1 = await this.createCategoryRecord(`AUTO_AUDIT_${suffix}_CATEGORY_B1`, parentB.id, 2, cleanupRegistry, 40);
    return { parentA, childA1, childA2, parentB, childB1 };
  }

  async createComboReferenceFixture(
    caseId: string,
    item: ProductCenterItemCreateRecord,
    cleanupRegistry: CleanupRegistry,
  ): Promise<StandardItem216ReferenceFixture> {
    const name = `AUTO_AUDIT_${normalizeCaseId(caseId)}_COMBO_REFERENCE`;
    const detail = await this.api.productDetail(item.id);
    const skuId = readFirstSkuId(detail);
    if (skuId === undefined) throw new Error(`标准商品套餐引用夹具缺少 SKU ID：${item.originalIdentity}`);
    const response = await this.api.createComboGroup({ name, itemId: item.id, skuId });
    const record = requireNamedRecord(response, name) ?? requireNamedRecord(await this.api.comboGroupList(), name);
    if (!record) throw new Error(`标准商品套餐引用夹具创建后未找到：${name}`);
    this.registerNamedCleanup(cleanupRegistry, '标准商品套餐组引用', 'combo', name, record.id, async () => {
      await this.api.deleteComboGroup(record.id);
    }, async () => !containsNamed(await this.api.comboGroupList(), name));
    return { id: record.id, name };
  }

  async renameTasteFixture(
    fixture: StandardItem216AttributeFixture,
    affectedItemIds: readonly number[],
    cleanupRegistry: CleanupRegistry,
  ): Promise<{ previousName: string; updatedName: string }> {
    if (fixture.kind !== 'taste') throw new Error('口味组改名方法仅支持 taste');
    return this.renameAttributeFixture(fixture, affectedItemIds, cleanupRegistry);
  }

  async renameAttributeFixture(
    fixture: StandardItem216AttributeFixture,
    affectedItemIds: readonly number[],
    cleanupRegistry: CleanupRegistry,
  ): Promise<{ previousName: string; updatedName: string }> {
    if (!fixture.cleanupIdentityVariants) throw new Error('属性组缺少改名后的清理身份变体');
    const detailResponse = fixture.kind === 'addon'
      ? await this.api.addonGroupDetail(fixture.id)
      : fixture.kind === 'spec'
        ? await this.api.specDetail(fixture.id)
        : fixture.kind === 'taste'
          ? await this.api.tasteDetail(fixture.id)
          : await this.api.methodDetail(fixture.id);
    const detail = detailResponse.data as Record<string, unknown>;
    const previousName = fixture.groupName;
    const updatedName = `${previousName}_SYNCED_${nextAuditTimestamp()}`;
    const body = fixture.kind === 'spec'
      ? {
          id: fixture.id,
          name: updatedName,
          secondName: detail.secondName,
          displayName: updatedName,
          description: detail.description,
          sortOrder: detail.sortOrder,
          status: detail.status,
          options: Array.isArray(detail.options) ? detail.options : [],
          affectedItemIds: [...affectedItemIds],
        }
      : fixture.kind === 'addon'
        ? {
            name: updatedName,
            secondName: detail.secondName,
            description: detail.description,
            status: detail.status,
            selectionRule: detail.selectionRule,
            pricingRule: detail.pricingRule,
            items: Array.isArray(detail.items) ? detail.items : [],
            affectedItemIds: [...affectedItemIds],
          }
        : {
            name: updatedName,
            secondName: detail.secondName,
            modifierType: detail.modifierType,
            description: detail.description,
            required: detail.required,
            multiple: detail.multiple,
            status: detail.status,
            options: Array.isArray(detail.options) ? detail.options : [],
            affectedItemIds: [...affectedItemIds],
          };
    fixture.cleanupIdentityVariants.push(updatedName);
    cleanupRegistry.addIdentityVariant(fixture.checkpointEntryId, updatedName);
    if (fixture.kind === 'addon') {
      await this.api.checkAddonGroup(fixture.id, body);
      await this.api.updateAddonGroup(fixture.id, body);
    } else if (fixture.kind === 'spec') {
      await this.api.updateSpec(fixture.id, body);
    } else if (fixture.kind === 'taste') {
      await this.api.checkTaste(fixture.id, body);
      await this.api.updateTaste(fixture.id, body);
    } else {
      await this.api.checkMethod(fixture.id, body);
      await this.api.updateMethod(fixture.id, body);
    }
    if (!await this.attributeFixtureExists(fixture.kind, [updatedName])) {
      throw new Error(`${fixture.kind} 属性组同步改名后 API 未找到：${updatedName}`);
    }
    return { previousName, updatedName };
  }

  async addAttributeFixtureOption(
    fixture: StandardItem216AttributeFixture,
    optionName: string,
  ): Promise<{ optionName: string }> {
    if (fixture.kind === 'addon') throw new Error('加料组选项必须使用商品关系工厂创建');
    const detail = await this.readEditableAttributeDetail(fixture);
    const options = Array.isArray(detail.options) ? [...detail.options] as Array<Record<string, unknown>> : [];
    const template = options[0] ?? {};
    options.push(fixture.kind === 'spec'
      ? { ...template, id: undefined, name: optionName, secondName: '', value: String(options.length + 1), sortOrder: options.length, defaultSelected: false }
      : { ...template, id: undefined, name: optionName, secondName: '', priceAdjustment: 0, sortOrder: options.length, defaultSelected: false });
    await this.updateAttributeFixtureOptions(fixture, detail, options, []);
    return { optionName };
  }

  async renameAttributeFixtureOption(
    fixture: StandardItem216AttributeFixture,
    optionIndex: number,
    affectedItemIds: readonly number[],
  ): Promise<{
    previousName: string;
    updatedName: string;
    updatedFields: Record<string, string>;
  }> {
    if (fixture.kind === 'addon') throw new Error('加料组选项必须使用商品关系工厂更新');
    const detail = await this.readEditableAttributeDetail(fixture);
    const options = Array.isArray(detail.options) ? [...detail.options] as Array<Record<string, unknown>> : [];
    const original = options[optionIndex];
    if (!original || typeof original.name !== 'string') throw new Error(`${fixture.kind} 缺少可改名明细：${optionIndex}`);
    const previousName = original.name;
    const updatedName = `${previousName}_SYNCED_${nextAuditTimestamp()}`;
    const updatedFields: Record<string, string> = fixture.kind === 'spec'
      ? {
          name: updatedName,
          secondName: `${updatedName}_SECOND`.slice(0, 100),
          value: `VALUE_${nextAuditTimestamp()}`.slice(0, 20),
          imagePath: 'img/item/brand-000407/2026/8/5/f37b452e-d5b6-4dd5-9741-e2fe33042a6c',
          deviceCode: `DEV${nextAuditTimestamp()}`.slice(-20),
        }
      : { name: updatedName };
    options[optionIndex] = {
      ...original,
      ...updatedFields,
      ...(updatedFields.imagePath ? { imageUrl: `https://cdn.balamxqa.com/${updatedFields.imagePath}` } : {}),
    };
    await this.updateAttributeFixtureOptions(fixture, detail, options, affectedItemIds);
    fixture.optionNames[optionIndex] = updatedName;
    return { previousName, updatedName, updatedFields };
  }

  private async readEditableAttributeDetail(
    fixture: StandardItem216AttributeFixture,
  ): Promise<Record<string, unknown>> {
    const response = fixture.kind === 'spec'
      ? await this.api.specDetail(fixture.id)
      : fixture.kind === 'taste'
        ? await this.api.tasteDetail(fixture.id)
        : await this.api.methodDetail(fixture.id);
    return response.data as Record<string, unknown>;
  }

  private async updateAttributeFixtureOptions(
    fixture: StandardItem216AttributeFixture,
    detail: Record<string, unknown>,
    options: Array<Record<string, unknown>>,
    affectedItemIds: readonly number[],
  ): Promise<void> {
    if (fixture.kind === 'spec') {
      await this.api.updateSpec(fixture.id, {
        id: fixture.id,
        name: fixture.groupName,
        secondName: detail.secondName,
        displayName: detail.displayName ?? fixture.groupName,
        description: detail.description,
        sortOrder: detail.sortOrder,
        status: detail.status,
        options,
        affectedItemIds: [...affectedItemIds],
      });
      return;
    }
    const body = {
      name: fixture.groupName,
      secondName: detail.secondName,
      modifierType: detail.modifierType,
      description: detail.description,
      required: detail.required,
      multiple: detail.multiple,
      status: detail.status,
      options,
      affectedItemIds: [...affectedItemIds],
    };
    if (fixture.kind === 'taste') {
      await this.api.checkTaste(fixture.id, body);
      await this.api.updateTaste(fixture.id, body);
    } else {
      await this.api.checkMethod(fixture.id, body);
      await this.api.updateMethod(fixture.id, body);
    }
  }

  private async attributeFixtureExists(
    kind: StandardItem216AttributeFixture['kind'],
    identities: readonly string[],
  ): Promise<boolean> {
    for (const identity of identities) {
      const response = kind === 'addon'
        ? await this.api.addonGroupList(identity)
        : kind === 'spec'
          ? await this.api.specPage(identity)
          : kind === 'taste'
          ? await this.api.tastePage(identity)
          : await this.api.methodPage(identity);
      if (containsNamed(response, identity)) return true;
    }
    return false;
  }

  private async deleteAuditTasteResidue(identities: readonly string[]): Promise<void> {
    for (const identity of identities) {
      const residue = requireNamedRecord(await this.api.tastePage(identity), identity);
      if (residue) await this.api.deleteMethod(residue.id);
      if (containsNamed(await this.api.tastePage(identity), identity)) {
        throw new Error(`历史口味组审计残留清理失败：${identity}`);
      }
    }
  }

  async createCornerMarkFixtures(
    caseId: string,
    count: number,
    cleanupRegistry: CleanupRegistry,
  ): Promise<string[]> {
    const names: string[] = [];
    for (let index = 0; index < count; index += 1) {
      const name = `AUTO_AUDIT_${normalizeCaseId(caseId)}_CORNER_${index + 1}`;
      const response = await this.api.createCornerMark({ name, sortOrder: index + 1 });
      const record = requireNamedRecord(response, name)
        ?? requireNamedRecord(await this.api.cornerMarkPage(name), name);
      if (!record) throw new Error(`标准商品角标创建后未找到：${name}`);
      this.registerNamedCleanup(cleanupRegistry, '标准商品角标', 'corner-mark', name, record.id, async () => {
        await this.api.deleteCornerMark(record.id);
      }, async () => !containsNamed(await this.api.cornerMarkPage(name), name));
      names.push(name);
    }
    return names;
  }

  async createDescriptionTagFixtures(
    caseId: string,
    count: number,
    cleanupRegistry: CleanupRegistry,
  ): Promise<string[]> {
    const suffix = normalizeCaseId(caseId);
    const groupName = `AUTO_AUDIT_${suffix}_TAG_GROUP`;
    const groupResponse = await this.api.createTagGroup({ name: groupName, type: 1 });
    const group = requireNamedRecord(groupResponse, groupName)
      ?? requireNamedRecord(await this.api.tagGroupList(1), groupName);
    if (!group) throw new Error(`标准商品描述标签组创建后未找到：${groupName}`);
    this.registerNamedCleanup(cleanupRegistry, '标准商品描述标签组', 'tag-group', groupName, group.id, async () => {
      await this.api.deleteTagGroup(group.id);
    }, async () => !containsNamed(await this.api.tagGroupList(1), groupName), [groupName], 30);
    const names: string[] = [];
    for (let index = 0; index < count; index += 1) {
      const name = `AUTO_AUDIT_${suffix}_TAG_${index + 1}`;
      const response = await this.api.createDescriptionTag({ name, groupId: group.id });
      const record = requireNamedRecord(response, name)
        ?? requireNamedRecord(await this.api.tagPage(1), name);
      if (!record) throw new Error(`标准商品描述标签创建后未找到：${name}`);
      this.registerNamedCleanup(cleanupRegistry, '标准商品描述标签', 'description-tag', name, record.id, async () => {
        await this.api.deleteTag(record.id);
      }, async () => !containsNamed(await this.api.tagPage(1), name));
      names.push(name);
    }
    return names;
  }

  private registerNamedCleanup(
    cleanupRegistry: CleanupRegistry,
    entity: string,
    entityKind: 'category' | 'material-category' | 'material' | 'spec' | 'taste' | 'method' | 'addon' | 'print-stall' | 'corner-mark' | 'tag-group' | 'description-tag' | 'combo',
    identity: string,
    id: number,
    execute: () => Promise<void>,
    verify: () => Promise<boolean>,
    identityVariants = [identity],
    cleanupOrder = 35,
  ): void {
    cleanupRegistry.register({
      entity,
      identity,
      checkpoint: {
        entryId: `standard-item-${entityKind}-${id}`,
        entityKind,
        serverId: id,
        identityVariants,
        cleanupOrder,
      },
      execute,
      verify,
    });
  }

  private async createCategoryRecord(
    name: string,
    parentId: number,
    level: 1 | 2,
    cleanupRegistry: CleanupRegistry,
    cleanupOrder: number,
  ): Promise<CategoryRecord> {
    const response = await this.api.createCategory({
      name,
      secondName: `${name}_SECOND`,
      code: `AUTO${nextAuditTimestamp().toString().slice(-10)}`,
      parentId,
      level,
    });
    const record = requireNamedRecord(response, name) ?? requireNamedRecord(await this.api.categoryTree(), name);
    if (!record) throw new Error(`标准商品分类夹具创建后未找到：${name}`);
    this.registerNamedCleanup(cleanupRegistry, '标准商品分类夹具', 'category', name, record.id, async () => {
      await this.api.deleteCategory(record.id);
    }, async () => !containsNamed(await this.api.categoryTree(), name), [name], cleanupOrder);
    return { id: record.id, name };
  }
}

type CategoryRecord = { id: number; name: string };

export function readMainImageEvidence(value: unknown): StandardItem216MainImageEvidence {
  const root = asRecord(value);
  const data = asRecord(root?.data);
  const itemBasic = asRecord(data?.itemBasic);
  const fields = [
    ['data.itemBasic.itemMainImages', itemBasic?.itemMainImages],
    ['data.itemBasic.mainImageList', itemBasic?.mainImageList],
    ['data.itemMainImages', data?.itemMainImages],
    ['data.mainImageList', data?.mainImageList],
  ] as const;
  const sourceFields = fields
    .filter(([, field]) => Array.isArray(field))
    .map(([fieldName]) => fieldName);
  const references = fields.flatMap(([, field]) => readMainImageReferences(field));
  return { sourceFields, references: [...new Set(references)] };
}

function readMainImageReferences(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (typeof entry === 'string') return [entry];
    const image = asRecord(entry);
    if (!image) return [];
    return ['imagePath', 'imageUrl', 'path', 'url']
      .map((key) => image[key])
      .filter((reference): reference is string => typeof reference === 'string' && reference.length > 0);
  });
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

async function addonGroupExistsById(api: ProductCenterApi, id: number): Promise<boolean> {
  return api.addonGroupDetail(id)
    .then((value) => containsRecordId(value, id))
    .catch((error: unknown) => {
      if (/not exist|HTTP 404|not found|请求资源不存在/i.test(String(error))) return false;
      throw error;
    });
}

function containsRecordId(value: unknown, id: number): boolean {
  if (Array.isArray(value)) return value.some((item) => containsRecordId(item, id));
  if (!value || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  if (Number(record.id) === id) return true;
  return Object.values(record).some((child) => containsRecordId(child, id));
}

function findNormalizedNamedRecords(value: unknown, identity: string): Array<{ id: number; name: string }> {
  const found: Array<{ id: number; name: string }> = [];
  visit(value);
  return found.filter((item, index) => found.findIndex((candidate) => candidate.id === item.id) === index);

  function visit(node: unknown): void {
    if (Array.isArray(node)) {
      node.forEach(visit);
      return;
    }
    if (!node || typeof node !== 'object') return;
    const record = node as Record<string, unknown>;
    if (typeof record.name === 'string'
      && normalizeEscapedIdentity(record.name) === normalizeEscapedIdentity(identity)
      && Number.isFinite(Number(record.id))) {
      found.push({ id: Number(record.id), name: record.name });
    }
    Object.values(record).forEach(visit);
  }
}

function normalizeEscapedIdentity(value: string): string {
  return value.replace(/\\_/g, '_');
}

function findFirstEnabledNamedResource(value: unknown): StandardItem216ReferenceFixture | undefined {
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findFirstEnabledNamedResource(item);
      if (found) return found;
    }
    return undefined;
  }
  const record = asRecord(value);
  if (!record) return undefined;
  const id = Number(record.id);
  if (Number.isFinite(id) && typeof record.name === 'string' && record.name.trim() && record.status !== 0 && record.enabled !== false) {
    return { id, name: record.name.trim() };
  }
  for (const child of Object.values(record)) {
    const found = findFirstEnabledNamedResource(child);
    if (found) return found;
  }
  return undefined;
}

function normalizeCaseId(caseId: string): string {
  return caseId.replace(/^TC-ITEM-STD-/u, 'STD_').replace(/[^A-Za-z0-9_-]/g, '_');
}

function createStandardItemAuditPng(seed: string): Buffer {
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
    standardItemPngChunk('IHDR', header),
    standardItemPngChunk('IDAT', deflateSync(pixels)),
    standardItemPngChunk('IEND', Buffer.alloc(0)),
  ]);
}

function standardItemPngChunk(type: string, data: Buffer): Buffer {
  const typeBytes = Buffer.from(type, 'ascii');
  const payload = Buffer.concat([typeBytes, data]);
  const chunk = Buffer.alloc(12 + data.length);
  chunk.writeUInt32BE(data.length, 0);
  payload.copy(chunk, 4);
  chunk.writeUInt32BE(standardItemPngCrc32(payload), 8 + data.length);
  return chunk;
}

function standardItemPngCrc32(value: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of value) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function requireNamedRecord(value: unknown, identity: string): { id: number } | undefined {
  const matches = new Map<number, { id: number }>();
  const visit = (candidate: unknown): void => {
    if (Array.isArray(candidate)) {
      for (const item of candidate) visit(item);
      return;
    }
    if (!candidate || typeof candidate !== 'object') return;
    const record = candidate as Record<string, unknown>;
    if (record.name === identity && (typeof record.id === 'number' || typeof record.id === 'string')) {
      const id = Number(record.id);
      if (Number.isFinite(id)) matches.set(id, { id });
    }
    for (const child of Object.values(record)) visit(child);
  };
  visit(value);
  if (matches.size > 1) throw new Error(`标准商品夹具身份不唯一：${identity}`);
  return [...matches.values()][0];
}

function requireNamedImageRecord(
  value: unknown,
  identity: string,
): { id: number; imagePath?: string; imageUrl?: string } | undefined {
  const matches = new Map<number, { id: number; imagePath?: string; imageUrl?: string }>();
  const visit = (candidate: unknown): void => {
    if (Array.isArray(candidate)) {
      candidate.forEach(visit);
      return;
    }
    if (!candidate || typeof candidate !== 'object') return;
    const record = candidate as Record<string, unknown>;
    if (record.name === identity && (typeof record.id === 'number' || typeof record.id === 'string')) {
      const id = Number(record.id);
      if (Number.isFinite(id)) {
        matches.set(id, {
          id,
          ...(typeof record.imagePath === 'string' ? { imagePath: record.imagePath } : {}),
          ...(typeof record.imageUrl === 'string' ? { imageUrl: record.imageUrl } : {}),
        });
      }
    }
    Object.values(record).forEach(visit);
  };
  visit(value);
  if (matches.size > 1) throw new Error(`标准商品图片夹具身份不唯一：${identity}`);
  return [...matches.values()][0];
}

function containsNamed(value: unknown, identity: string): boolean {
  if (Array.isArray(value)) return value.some((item) => containsNamed(item, identity));
  if (!value || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  return record.name === identity || Object.values(record).some((child) => containsNamed(child, identity));
}

function readFirstSkuId(value: unknown): number | undefined {
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = readFirstSkuId(item);
      if (found !== undefined) return found;
    }
    return undefined;
  }
  if (!value || typeof value !== 'object') return undefined;
  const record = value as Record<string, unknown>;
  const skuList = record.skuList;
  if (Array.isArray(skuList)) {
    const first = skuList[0];
    if (first && typeof first === 'object') {
      const candidate = (first as Record<string, unknown>).skuId ?? (first as Record<string, unknown>).id;
      const id = Number(candidate);
      if (Number.isFinite(id)) return id;
    }
  }
  for (const child of Object.values(record)) {
    const found = readFirstSkuId(child);
    if (found !== undefined) return found;
  }
  return undefined;
}
