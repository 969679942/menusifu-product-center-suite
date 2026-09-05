import { test, expect } from '../../fixtures/product-center-endpoint-api.fixture';
import { createAuditIdentity } from '../../test-data/product-center/audit-identity';

type NamedRecord = { id: number; name: string };

function collectNamedRecords(value: unknown, records: NamedRecord[] = []): NamedRecord[] {
  if (Array.isArray(value)) {
    for (const item of value) collectNamedRecords(item, records);
    return records;
  }
  if (!value || typeof value !== 'object') return records;

  const record = value as Record<string, unknown>;
  if (typeof record.id === 'number' && typeof record.name === 'string') {
    records.push({ id: record.id, name: record.name });
  }
  for (const child of Object.values(record)) collectNamedRecords(child, records);
  return records;
}

test.describe('商品中心五实体直连接口 CRUD', () => {
  test('商品分类应完成创建、查询、编辑、删除并保持零残留', async ({ productCenterApi, cleanupRegistry }) => {
    const identity = createAuditIdentity('CATEGORY');
    const code = `A${String(identity.timestamp).slice(-8)}`;
    let categoryId: number | undefined;

    const findByNames = async (...names: string[]): Promise<NamedRecord[]> => {
      const tree = await productCenterApi.categoryTree();
      return collectNamedRecords(tree).filter(record => names.includes(record.name));
    };

    await test.step('创建审计商品分类并立即记录服务端 ID', async () => {
      await productCenterApi.createCategory({ name: identity.marker, secondName: '审计分类', code });
      const records = await findByNames(identity.marker);
      expect(records).toHaveLength(1);
      categoryId = records[0].id;

      cleanupRegistry.register({
        entity: '商品分类',
        identity: identity.marker,
        resource: { entityKind: 'category', serverId: categoryId!, identityVariants: [identity.marker, identity.editedMarker] },
        execute: async () => {
          const residues = await findByNames(identity.marker, identity.editedMarker);
          for (const residue of residues) await productCenterApi.deleteCategory(residue.id);
        },
        verify: async () => (await findByNames(identity.marker, identity.editedMarker)).length === 0,
      });
    });

    await test.step('编辑商品分类并验证新名称', async () => {
      expect(categoryId).toBeDefined();
      await productCenterApi.updateCategory(categoryId!, { name: identity.editedMarker, secondName: '审计分类编辑', code });
      expect(await findByNames(identity.editedMarker)).toEqual([{ id: categoryId!, name: identity.editedMarker }]);
      expect(await findByNames(identity.marker)).toHaveLength(0);
    });

    await test.step('删除商品分类并验证原始及编辑身份均不存在', async () => {
      expect(categoryId).toBeDefined();
      await productCenterApi.deleteCategory(categoryId!);
      categoryId = undefined;
      expect(await findByNames(identity.marker, identity.editedMarker)).toHaveLength(0);
    });
  });

  test('做法组应完成创建、查询、预更新、编辑、删除并保持零残留', async ({ productCenterApi, cleanupRegistry }) => {
    const identity = createAuditIdentity('METHOD');
    let methodId: number | undefined;

    const findByName = async (name: string): Promise<Record<string, any> | undefined> => {
      const page = await productCenterApi.methodPage(name);
      return page?.data?.list?.find((record: Record<string, unknown>) => record.name === name);
    };

    await test.step('创建审计做法组并立即记录服务端 ID', async () => {
      await productCenterApi.createMethod({ name: identity.marker, secondName: '做法审计', optionName: '做法项' });
      const record = await findByName(identity.marker);
      expect(record).toBeDefined();
      methodId = record!.id;

      cleanupRegistry.register({
        entity: '做法组',
        identity: identity.marker,
        resource: { entityKind: 'method', serverId: methodId!, identityVariants: [identity.marker, identity.editedMarker] },
        execute: async () => {
          for (const name of [identity.editedMarker, identity.marker]) {
            const residue = await findByName(name);
            if (residue && String(residue.name).startsWith('AUTO_AUDIT_')) await productCenterApi.deleteMethod(residue.id);
          }
        },
        verify: async () => !(await findByName(identity.marker)) && !(await findByName(identity.editedMarker)),
      });
    });

    await test.step('预检查并编辑做法组名称', async () => {
      expect(methodId).toBeDefined();
      const detailResponse = await productCenterApi.methodDetail(methodId!);
      const detail = detailResponse.data as Record<string, any>;
      expect(detail.name).toBe(identity.marker);
      const updateBody = {
        name: identity.editedMarker,
        secondName: detail.secondName,
        modifierType: detail.modifierType,
        description: detail.description,
        required: detail.required,
        multiple: detail.multiple,
        status: detail.status,
        options: detail.options,
        affectedItemIds: [],
      };
      await productCenterApi.checkMethod(methodId!, updateBody);
      await productCenterApi.updateMethod(methodId!, updateBody);
      expect((await findByName(identity.editedMarker))?.id).toBe(methodId);
      expect(await findByName(identity.marker)).toBeUndefined();
    });

    await test.step('删除做法组并验证原始及编辑身份均不存在', async () => {
      expect(methodId).toBeDefined();
      await productCenterApi.deleteMethod(methodId!);
      methodId = undefined;
      expect(await findByName(identity.marker)).toBeUndefined();
      expect(await findByName(identity.editedMarker)).toBeUndefined();
    });
  });
  test('原料应完成创建、查询、编辑、删除并保持零残留', async ({ productCenterApi, cleanupRegistry }) => {
    const identity = createAuditIdentity('MATERIAL');
    const code = `M${String(identity.timestamp).slice(-12)}`;
    let materialId: number | undefined;

    const findByName = async (name: string): Promise<NamedRecord | undefined> => {
      const page = await productCenterApi.materialPage(name);
      return collectNamedRecords(page).find(record => record.name === name);
    };
    const findChildCategory = (value: unknown, rootName: string, childName: string): NamedRecord | undefined => {
      if (Array.isArray(value)) {
        for (const item of value) {
          const match = findChildCategory(item, rootName, childName);
          if (match) return match;
        }
        return undefined;
      }
      if (!value || typeof value !== 'object') return undefined;
      const record = value as Record<string, any>;
      if (record.name === rootName && Array.isArray(record.children)) {
        const child = record.children.find((item: Record<string, unknown>) => item.name === childName && typeof item.id === 'number');
        if (child) return { id: child.id, name: child.name };
      }
      for (const child of Object.values(record)) {
        const match = findChildCategory(child, rootName, childName);
        if (match) return match;
      }
      return undefined;
    };

    const categoryTree = await productCenterApi.materialCategoryTree();
    const category = findChildCategory(categoryTree, '糖类', 'cc');
    expect(category, '未找到已验证的只读原料分类路径：糖类 → cc').toBeDefined();

    await test.step('创建审计原料并立即记录服务端 ID', async () => {
      await productCenterApi.createMaterial({
        name: identity.marker,
        secondName: '原料审计',
        categoryId: category!.id,
        code,
        description: 'AUTO_AUDIT 原料描述',
      });
      const record = await findByName(identity.marker);
      expect(record).toBeDefined();
      materialId = record!.id;

      cleanupRegistry.register({
        entity: '原料',
        identity: identity.marker,
        resource: { entityKind: 'material', serverId: materialId!, identityVariants: [identity.marker, identity.editedMarker] },
        execute: async () => {
          for (const name of [identity.editedMarker, identity.marker]) {
            const residue = await findByName(name);
            if (residue && residue.name.startsWith('AUTO_AUDIT_')) await productCenterApi.deleteMaterial(residue.id);
          }
        },
        verify: async () => !(await findByName(identity.marker)) && !(await findByName(identity.editedMarker)),
      });
    });

    await test.step('编辑原料并验证新名称', async () => {
      expect(materialId).toBeDefined();
      await productCenterApi.updateMaterial(materialId!, {
        name: identity.editedMarker,
        secondName: '原料审计编辑',
        categoryId: category!.id,
        code,
        description: 'AUTO_AUDIT 原料描述编辑',
      });
      expect((await findByName(identity.editedMarker))?.id).toBe(materialId);
      expect(await findByName(identity.marker)).toBeUndefined();
    });

    await test.step('删除原料并验证原始及编辑身份均不存在', async () => {
      expect(materialId).toBeDefined();
      await productCenterApi.deleteMaterial(materialId!);
      materialId = undefined;
      expect(await findByName(identity.marker)).toBeUndefined();
      expect(await findByName(identity.editedMarker)).toBeUndefined();
    });
  });
  test('品牌调味应完成创建、查询、编辑、删除并保持零残留', async ({ productCenterApi, cleanupRegistry }) => {
    const identity = createAuditIdentity('SEASONING');
    let seasoningId: number | undefined;

    const findByName = async (name: string): Promise<NamedRecord | undefined> => {
      const list = await productCenterApi.seasoningList();
      return collectNamedRecords(list).find(record => record.name === name);
    };

    await test.step('创建审计品牌调味并立即记录服务端 ID', async () => {
      await productCenterApi.createSeasoning({ name: identity.marker, secondName: '调味审计' });
      const record = await findByName(identity.marker);
      expect(record).toBeDefined();
      seasoningId = record!.id;

      cleanupRegistry.register({
        entity: '品牌调味',
        identity: identity.marker,
        resource: { entityKind: 'seasoning', serverId: seasoningId!, identityVariants: [identity.marker, identity.editedMarker] },
        execute: async () => {
          for (const name of [identity.editedMarker, identity.marker]) {
            const residue = await findByName(name);
            if (residue && residue.name.startsWith('AUTO_AUDIT_')) await productCenterApi.deleteSeasoning(residue.id);
          }
        },
        verify: async () => !(await findByName(identity.marker)) && !(await findByName(identity.editedMarker)),
      });
    });

    await test.step('编辑品牌调味并验证新名称', async () => {
      expect(seasoningId).toBeDefined();
      const detailResponse = await productCenterApi.seasoningDetail(seasoningId!);
      const detail = detailResponse.data as Record<string, any>;
      const updateBody = {
        name: identity.editedMarker,
        secondName: '调味审计编辑',
        posName: detail.posName ?? identity.editedMarker,
        options: (detail.options ?? []).map((option: Record<string, any>) => ({
          id: option.id,
          name: option.name,
          secondName: option.secondName,
          priceAdjustment: option.priceAdjustment,
          posName: option.posName,
          kitchenName: option.kitchenName,
          posColor: option.posColor,
          sortOrder: option.sortOrder,
        })),
      };
      await productCenterApi.updateSeasoning(seasoningId!, updateBody);
      expect((await findByName(identity.editedMarker))?.id).toBe(seasoningId);
      expect(await findByName(identity.marker)).toBeUndefined();
    });

    await test.step('删除品牌调味并验证原始及编辑身份均不存在', async () => {
      expect(seasoningId).toBeDefined();
      await productCenterApi.deleteSeasoning(seasoningId!);
      seasoningId = undefined;
      expect(await findByName(identity.marker)).toBeUndefined();
      expect(await findByName(identity.editedMarker)).toBeUndefined();
    });
  });
  test('配方单应完成依赖创建、创建、查询、编辑、删除并保持零残留', async ({ productCenterApi, cleanupRegistry }) => {
    test.setTimeout(180_000);
    const identity = createAuditIdentity('BOM');
    const productName = `AUTO_AUDIT_BOM_PRODUCT_${identity.timestamp}`;
    const materialName = `AUTO_AUDIT_BOM_MATERIAL_${identity.timestamp}`;
    const materialEditedName = `${materialName}_EDIT`;
    const materialCode = `B${String(identity.timestamp).slice(-12)}`;
    let productId: number | undefined;
    let materialId: number | undefined;
    let recipeIngredientId: number | undefined;
    let bomId: number | undefined;

    const findNamed = (value: unknown, name: string): NamedRecord | undefined => collectNamedRecords(value).find(record => record.name === name);
    const findProduct = async (): Promise<NamedRecord | undefined> => findNamed(await productCenterApi.productPage(productName), productName);
    const findMaterial = async (): Promise<NamedRecord | undefined> => findNamed(await productCenterApi.materialPage(materialName), materialName)
      ?? findNamed(await productCenterApi.materialPage(materialEditedName), materialEditedName);
    const findRecipeIngredient = async (): Promise<NamedRecord | undefined> => findNamed(await productCenterApi.recipeIngredientList(), materialName);
    const findBom = async (...names: string[]): Promise<NamedRecord | undefined> => {
      for (const name of names) {
        const record = findNamed(await productCenterApi.bomPage(name), name);
        if (record) return record;
      }
      return undefined;
    };
    const findCategory = (value: unknown): NamedRecord | undefined => {
      if (Array.isArray(value)) {
        for (const item of value) {
          const match = findCategory(item);
          if (match) return match;
        }
        return undefined;
      }
      if (!value || typeof value !== 'object') return undefined;
      const record = value as Record<string, any>;
      if (record.name === '糖类' && Array.isArray(record.children)) {
        const child = record.children.find((item: Record<string, unknown>) => item.name === 'cc' && typeof item.id === 'number');
        if (child) return { id: child.id, name: child.name };
      }
      for (const child of Object.values(record)) {
        const match = findCategory(child);
        if (match) return match;
      }
      return undefined;
    };
    const renameBom = (value: unknown): boolean => {
      if (Array.isArray(value)) return value.some(renameBom);
      if (!value || typeof value !== 'object') return false;
      const record = value as Record<string, unknown>;
      if (record.name === identity.marker) {
        record.name = identity.editedMarker;
        return true;
      }
      return Object.values(record).some(renameBom);
    };

    const category = findCategory(await productCenterApi.materialCategoryTree());
    expect(category, '未找到已验证的只读原料分类路径：糖类 → cc').toBeDefined();

    await test.step('创建审计商品依赖并登记清理', async () => {
      const response = await productCenterApi.createBomProduct(productName);
      productId = typeof response.data === 'number' ? response.data : response.data?.id;
      productId ??= (await findProduct())?.id;
      expect(productId).toBeDefined();
      cleanupRegistry.register({
        entity: '配方单商品依赖', identity: productName,
        resource: { entityKind: 'bom-product', serverId: productId!, cleanupOrder: 0 },
        execute: async () => { const residue = await findProduct(); if (residue) await productCenterApi.deleteBomProduct(residue.id); },
        verify: async () => !(await findProduct()),
      });
    });

    await test.step('创建审计原料及配方原料依赖并登记清理', async () => {
      await productCenterApi.createMaterial({ name: materialName, secondName: '配方原料审计', categoryId: category!.id, code: materialCode, description: 'AUTO_AUDIT 配方原料描述' });
      materialId = (await findMaterial())?.id;
      expect(materialId).toBeDefined();
      cleanupRegistry.register({
        entity: '配方单原料依赖', identity: materialName,
        resource: { entityKind: 'material', serverId: materialId!, cleanupOrder: 10, identityVariants: [materialName, materialEditedName] },
        execute: async () => { const residue = await findMaterial(); if (residue) await productCenterApi.deleteMaterial(residue.id); },
        verify: async () => !(await findMaterial()),
      });

      const recipeResponse = await productCenterApi.createRecipeIngredient({ ingredientId: materialId!, categoryId: category!.id, shortName: `A${String(identity.timestamp).slice(-9)}` });
      recipeIngredientId = recipeResponse.data?.id ?? (await findRecipeIngredient())?.id;
      expect(recipeIngredientId).toBeDefined();
      cleanupRegistry.register({
        entity: '配方原料依赖', identity: materialName,
        resource: { entityKind: 'recipe-ingredient', serverId: recipeIngredientId!, cleanupOrder: 20 },
        execute: async () => { const residue = await findRecipeIngredient(); if (residue) await productCenterApi.deleteRecipeIngredient(residue.id); },
        verify: async () => !(await findRecipeIngredient()),
      });
    });

    await test.step('创建配方单并立即记录服务端 ID', async () => {
      const productDetail = await productCenterApi.productDetail(productId!);
      const skuId = productDetail.data?.skuList?.[0]?.id;
      expect(skuId).toBeDefined();
      await productCenterApi.createBom({
        itemId: productId!,
        groupBoms: [{
          groupName: 'Default Group',
          boms: [{
            name: identity.marker,
            item: { skuId },
            recipeMaterials: [
              { ingredientCategoryId: category!.id, ingredientId: recipeIngredientId!, dosage: 1, configuration: { sugarRule: { enabled: 1 } }, sortOrder: 0, ingredientName: materialName },
              { configuration: { sugarRule: { enabled: 0 }, otherSettings: { enabled: 1 } }, sortOrder: 1 },
            ],
            sortOrder: 0,
            title: 'Recipe 1',
          }],
          sortOrder: 0,
        }],
      });
      bomId = (await findBom(identity.marker))?.id;
      expect(bomId).toBeDefined();
      cleanupRegistry.register({
        entity: '配方单', identity: identity.marker,
        resource: { entityKind: 'bom', serverId: bomId!, cleanupOrder: 30, identityVariants: [identity.marker, identity.editedMarker] },
        execute: async () => { const residue = await findBom(identity.editedMarker, identity.marker); if (residue) await productCenterApi.deleteBom(residue.id); },
        verify: async () => !(await findBom(identity.marker, identity.editedMarker)),
      });
    });

    await test.step('编辑配方单名称并验证', async () => {
      const groupedResponse = await productCenterApi.bomGrouped(productId!);
      const groupedData = structuredClone(groupedResponse.data);
      const groupBoms = Array.isArray(groupedData) ? groupedData : groupedData?.groupBoms ?? groupedData?.groups;
      expect(Array.isArray(groupBoms)).toBe(true);
      expect(renameBom(groupBoms)).toBe(true);
      await productCenterApi.updateBom({ itemId: productId!, groupBoms });
      expect((await findBom(identity.editedMarker))?.id).toBe(bomId);
      expect(await findBom(identity.marker)).toBeUndefined();
    });

    await test.step('删除配方单及全部审计依赖并验证零残留', async () => {
      await productCenterApi.deleteBom(bomId!);
      bomId = undefined;
      const recipe = await findRecipeIngredient();
      if (recipe) await productCenterApi.deleteRecipeIngredient(recipe.id);
      recipeIngredientId = undefined;
      const material = await findMaterial();
      if (material) await productCenterApi.deleteMaterial(material.id);
      materialId = undefined;
      const product = await findProduct();
      if (product) await productCenterApi.deleteBomProduct(product.id);
      productId = undefined;
      expect(await findBom(identity.marker, identity.editedMarker)).toBeUndefined();
      expect(await findRecipeIngredient()).toBeUndefined();
      expect(await findMaterial()).toBeUndefined();
      expect(await findProduct()).toBeUndefined();
    });
  });});
