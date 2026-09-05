import { test, expect } from '../../fixtures/product-center-endpoint-api.fixture';
import { createAuditIdentity } from '../../test-data/product-center/audit-identity';
import { waitUntil } from '../../utils/wait';

type NamedRecord = Record<string, any> & { id: number; name: string };

const normalizeName = (value: unknown): string => String(value ?? '').replaceAll('\\', '');

function findNamedRecord(value: unknown, name: string): NamedRecord | undefined {
  if (Array.isArray(value)) {
    for (const item of value) {
      const match = findNamedRecord(item, name);
      if (match) return match;
    }
    return undefined;
  }
  if (!value || typeof value !== 'object') return undefined;
  const record = value as Record<string, any>;
  if (normalizeName(record.name) === name && typeof record.id === 'number') return { ...record, name: normalizeName(record.name) } as NamedRecord;
  for (const child of Object.values(record)) {
    const match = findNamedRecord(child, name);
    if (match) return match;
  }
  return undefined;
}

function findNamedStringRecord(value: unknown, name: string): (Record<string, any> & { id: string; name: string }) | undefined {
  if (Array.isArray(value)) {
    for (const item of value) {
      const match = findNamedStringRecord(item, name);
      if (match) return match;
    }
    return undefined;
  }
  if (!value || typeof value !== 'object') return undefined;
  const record = value as Record<string, any>;
  const id = record.id ?? record.printerId;
  if (normalizeName(record.name) === name && typeof id === 'string') return { ...record, id, name: normalizeName(record.name) };
  for (const child of Object.values(record)) {
    const match = findNamedStringRecord(child, name);
    if (match) return match;
  }
  return undefined;
}

function findMaterialCategory(value: unknown): NamedRecord | undefined {
  if (Array.isArray(value)) {
    for (const item of value) {
      const match = findMaterialCategory(item);
      if (match) return match;
    }
    return undefined;
  }
  if (!value || typeof value !== 'object') return undefined;
  const record = value as Record<string, any>;
  if (record.name === '糖类' && Array.isArray(record.children)) {
    return record.children.find((item: Record<string, unknown>) => item.name === 'cc' && typeof item.id === 'number') as NamedRecord | undefined;
  }
  for (const child of Object.values(record)) {
    const match = findMaterialCategory(child);
    if (match) return match;
  }
  return undefined;
}

test.describe('商品中心 P2 直连接口 CRUD', () => {
  test('原料分类应完成创建、查询、编辑、删除并保持零残留', async ({ productCenterApi, cleanupRegistry }) => {
    const identity = createAuditIdentity('MATERIAL_CATEGORY');
    let categoryId: number | undefined;
    const findByName = async (name: string) => findNamedRecord(await productCenterApi.materialCategoryTree(), name);

    await test.step('创建审计原料分类并记录服务端 ID', async () => {
      await productCenterApi.createMaterialCategory({ name: identity.marker, secondName: '原料分类审计' });
      categoryId = (await findByName(identity.marker))?.id;
      expect(categoryId).toBeDefined();
      cleanupRegistry.register({
        entity: '原料分类', identity: identity.marker,
        resource: { entityKind: 'material-category', serverId: categoryId!, identityVariants: [identity.marker, identity.editedMarker] },
        execute: async () => {
          for (const name of [identity.editedMarker, identity.marker]) {
            const residue = await findByName(name);
            if (residue) await productCenterApi.deleteCategory(residue.id);
          }
        },
        verify: async () => !(await findByName(identity.marker)) && !(await findByName(identity.editedMarker)),
      });
    });

    await test.step('编辑原料分类并验证新名称', async () => {
      await productCenterApi.updateMaterialCategory(categoryId!, { name: identity.editedMarker, secondName: '原料分类审计编辑' });
      expect((await findByName(identity.editedMarker))?.id).toBe(categoryId);
      expect(await findByName(identity.marker)).toBeUndefined();
    });

    await test.step('删除原料分类并验证双身份不存在', async () => {
      await productCenterApi.deleteCategory(categoryId!);
      categoryId = undefined;
      expect(await findByName(identity.marker)).toBeUndefined();
      expect(await findByName(identity.editedMarker)).toBeUndefined();
    });
  });

  test('配方原料应完成创建、查询、编辑、删除并保持零残留', async ({ productCenterApi, cleanupRegistry }) => {
    const identity = createAuditIdentity('RECIPE_INGREDIENT');
    const category = findMaterialCategory(await productCenterApi.materialCategoryTree());
    expect(category).toBeDefined();
    let materialId: number | undefined;
    let recipeIngredientId: number | undefined;
    const findMaterial = async () => findNamedRecord(await productCenterApi.materialPage(identity.marker), identity.marker);
    const findRecipe = async () => findNamedRecord(await productCenterApi.recipeIngredientList(), identity.marker);

    await test.step('创建审计原料依赖并登记清理', async () => {
      await productCenterApi.createMaterial({ name: identity.marker, secondName: '配方原料审计', categoryId: category!.id, code: `R${String(identity.timestamp).slice(-12)}`, description: 'AUTO_AUDIT 配方原料描述' });
      materialId = (await findMaterial())?.id;
      expect(materialId).toBeDefined();
      cleanupRegistry.register({
        entity: '配方原料的原料依赖', identity: identity.marker,
        resource: { entityKind: 'material', serverId: materialId!, cleanupOrder: 0 },
        execute: async () => { const residue = await findMaterial(); if (residue) await productCenterApi.deleteMaterial(residue.id); },
        verify: async () => !(await findMaterial()),
      });
    });

    await test.step('创建并编辑配方原料缩写', async () => {
      const created = await productCenterApi.createRecipeIngredient({ ingredientId: materialId!, categoryId: category!.id, shortName: `A${String(identity.timestamp).slice(-9)}` });
      recipeIngredientId = created.data?.id ?? (await findRecipe())?.id;
      expect(recipeIngredientId).toBeDefined();
      cleanupRegistry.register({
        entity: '配方原料', identity: identity.marker,
        resource: { entityKind: 'recipe-ingredient', serverId: recipeIngredientId!, cleanupOrder: 10 },
        execute: async () => { const residue = await findRecipe(); if (residue) await productCenterApi.deleteRecipeIngredient(residue.id); },
        verify: async () => !(await findRecipe()),
      });
      const editedShortName = `B${String(identity.timestamp).slice(-9)}`;
      await productCenterApi.updateRecipeIngredient(recipeIngredientId!, { ingredientId: materialId!, categoryId: category!.id, shortName: editedShortName });
      expect((await findRecipe())?.shortName).toBe(editedShortName);
    });

    await test.step('删除配方原料及原料依赖并验证零残留', async () => {
      await productCenterApi.deleteRecipeIngredient(recipeIngredientId!);
      recipeIngredientId = undefined;
      await productCenterApi.deleteMaterial(materialId!);
      materialId = undefined;
      expect(await findRecipe()).toBeUndefined();
      expect(await findMaterial()).toBeUndefined();
    });
  });

  test('菜单应完成创建、查询、编辑、删除并保持零残留', async ({ productCenterApi, cleanupRegistry }) => {
    const identity = createAuditIdentity('MENU');
    const code = `M${String(identity.timestamp).slice(-13)}`;
    let menuId: number | undefined;
    const findByName = async (name: string) => findNamedRecord(await productCenterApi.menuPage(name), name);

    await test.step('创建审计菜单并记录服务端 ID', async () => {
      await productCenterApi.createMenu({ name: identity.marker, secondName: '菜单审计', code });
      menuId = (await findByName(identity.marker))?.id;
      expect(menuId).toBeDefined();
      cleanupRegistry.register({
        entity: '菜单', identity: identity.marker,
        resource: { entityKind: 'menu', serverId: menuId!, identityVariants: [identity.marker, identity.editedMarker] },
        execute: async () => {
          for (const name of [identity.editedMarker, identity.marker]) {
            const residue = await findByName(name);
            if (residue) await productCenterApi.deleteMenu(residue.id);
          }
        },
        verify: async () => !(await findByName(identity.marker)) && !(await findByName(identity.editedMarker)),
      });
    });

    await test.step('编辑菜单并验证新名称', async () => {
      await productCenterApi.updateMenu(menuId!, { name: identity.editedMarker, secondName: '菜单审计编辑', code });
      expect((await findByName(identity.editedMarker))?.id).toBe(menuId);
      expect(await findByName(identity.marker)).toBeUndefined();
    });

    await test.step('删除菜单并验证双身份不存在', async () => {
      await productCenterApi.deleteMenu(menuId!);
      menuId = undefined;
      expect(await findByName(identity.marker)).toBeUndefined();
      expect(await findByName(identity.editedMarker)).toBeUndefined();
    });
  });

  test('口味组应完成创建、预更新、编辑、删除并保持零残留', async ({ productCenterApi, cleanupRegistry }) => {
    const identity = createAuditIdentity('TASTE'); let id: number | undefined;
    const find = async (name: string) => findNamedRecord(await productCenterApi.tastePage(name), name);
    await productCenterApi.createTaste({ name: identity.marker, secondName: '口味审计', optionName: '口味项' });
    id = (await find(identity.marker))?.id; expect(id).toBeDefined();
    cleanupRegistry.register({ entity: '口味组', identity: identity.marker, resource: { entityKind: 'taste', serverId: id!, identityVariants: [identity.marker, identity.editedMarker] }, execute: async () => { const row = await find(identity.editedMarker) ?? await find(identity.marker); if (row) await productCenterApi.deleteMethod(row.id); }, verify: async () => !(await find(identity.marker)) && !(await find(identity.editedMarker)) });
    const detail = (await productCenterApi.methodDetail(id!)).data;
    const body = { name: identity.editedMarker, secondName: detail.secondName, modifierType: detail.modifierType, description: detail.description, required: detail.required, multiple: detail.multiple, status: detail.status, options: detail.options, affectedItemIds: [] };
    await productCenterApi.checkMethod(id!, body); await productCenterApi.updateMethod(id!, body);
    expect((await find(identity.editedMarker))?.id).toBe(id);
    await productCenterApi.deleteMethod(id!); id = undefined;
    expect(await find(identity.editedMarker)).toBeUndefined();
  });

  test('规格组应完成创建、编辑、删除并保持零残留', async ({ productCenterApi, cleanupRegistry }) => {
    const identity = createAuditIdentity('SPEC'); let id: number | undefined;
    const find = async (name: string) => findNamedRecord(await productCenterApi.specPage(name), name);
    await productCenterApi.createSpec({ name: identity.marker, secondName: '规格审计', optionName: '规格项' });
    id = (await find(identity.marker))?.id; expect(id).toBeDefined();
    cleanupRegistry.register({ entity: '规格组', identity: identity.marker, resource: { entityKind: 'spec', serverId: id!, identityVariants: [identity.marker, identity.editedMarker] }, execute: async () => { const row = await find(identity.editedMarker) ?? await find(identity.marker); if (row) await productCenterApi.deleteSpec(row.id); }, verify: async () => !(await find(identity.marker)) && !(await find(identity.editedMarker)) });
    const detail = (await productCenterApi.specDetail(id!)).data;
    await productCenterApi.updateSpec(id!, { id: id!, name: identity.editedMarker, secondName: detail.secondName, displayName: identity.editedMarker, description: detail.description, sortOrder: detail.sortOrder, status: detail.status, options: detail.options });
    expect((await find(identity.editedMarker))?.id).toBe(id);
    await productCenterApi.deleteSpec(id!); id = undefined;
    expect(await find(identity.editedMarker)).toBeUndefined();
  });

  test('加料组应完成创建、预更新、编辑、删除并保持零残留', async ({ productCenterApi, cleanupRegistry }) => {
    const identity = createAuditIdentity('ADDITIONAL'); let id: number | undefined;
    const find = async (name: string) => findNamedRecord(await productCenterApi.addonGroupList(name), name);
    await productCenterApi.createAddonGroup({ name: identity.marker, secondName: '加料审计' });
    id = (await find(identity.marker))?.id; expect(id).toBeDefined();
    cleanupRegistry.register({ entity: '加料组', identity: identity.marker, resource: { entityKind: 'addon', serverId: id!, identityVariants: [identity.marker, identity.editedMarker] }, execute: async () => { const row = await find(identity.editedMarker) ?? await find(identity.marker); if (row) await productCenterApi.deleteAddonGroup(row.id); }, verify: async () => !(await find(identity.marker)) && !(await find(identity.editedMarker)) });
    const detail = (await productCenterApi.addonGroupDetail(id!)).data;
    const body = { name: identity.editedMarker, secondName: detail.secondName, description: detail.description, status: detail.status, selectionRule: detail.selectionRule, pricingRule: detail.pricingRule, items: detail.items ?? [], affectedItemIds: [] };
    await productCenterApi.checkAddonGroup(id!, body); await productCenterApi.updateAddonGroup(id!, body);
    const updated = await waitUntil(() => find(identity.editedMarker), (record) => record?.id === id, { timeout: 20_000, interval: 500, message: '加料组编辑结果未稳定' });
    expect(updated?.id).toBe(id);
    await productCenterApi.deleteAddonGroup(id!); id = undefined;
    expect(await find(identity.editedMarker)).toBeUndefined();
  });

  test('品牌打印档口应完成创建、查询、删除并保持零残留', async ({ productCenterApi, cleanupRegistry }) => {
    const identity = createAuditIdentity('STALL');
    let id: number | undefined;
    const find = async (name: string) => findNamedRecord(await productCenterApi.printStallPage(name), name);

    await test.step('创建审计品牌打印档口并记录服务端 ID', async () => {
      const created = await productCenterApi.createPrintStall({ name: identity.marker, remark: 'AUTO_AUDIT 品牌打印档口' });
      id = created?.data?.id ?? (await find(identity.marker))?.id;
      expect(id).toBeDefined();
      cleanupRegistry.register({
        entity: '品牌打印档口', identity: identity.marker,
        resource: { entityKind: 'print-stall', serverId: id! },
        execute: async () => {
          for (const name of [identity.editedMarker, identity.marker]) {
            const residue = await find(name);
            if (residue) await productCenterApi.deletePrintStall(residue.id);
          }
        },
        verify: async () => !(await find(identity.marker)) && !(await find(identity.editedMarker)),
      });
    });

    await test.step('删除品牌打印档口并验证双身份不存在', async () => {
      await productCenterApi.deletePrintStall(id!);
      id = undefined;
      expect(await find(identity.marker)).toBeUndefined();
      expect(await find(identity.editedMarker)).toBeUndefined();
    });
  });

  test('税种应完成创建、查询、编辑、删除并保持零残留', async ({ productCenterApi, cleanupRegistry }) => {
    const identity = createAuditIdentity('TAX');
    let id: number | undefined;
    const find = async (name: string) => findNamedRecord(await productCenterApi.taxPage(name), name);

    await test.step('创建非默认审计税种并记录服务端 ID', async () => {
      await productCenterApi.createTax({ name: identity.marker, rate: 5 });
      id = (await find(identity.marker))?.id;
      expect(id).toBeDefined();
      cleanupRegistry.register({
        entity: '税种', identity: identity.marker,
        resource: { entityKind: 'tax', serverId: id!, identityVariants: [identity.marker, identity.editedMarker] },
        execute: async () => {
          for (const name of [identity.editedMarker, identity.marker]) {
            const residue = await find(name);
            if (residue) await productCenterApi.deleteTax(residue.id);
          }
        },
        verify: async () => !(await find(identity.marker)) && !(await find(identity.editedMarker)),
      });
    });

    await test.step('编辑税种并验证新名称和税率', async () => {
      await productCenterApi.updateTax(id!, { name: identity.editedMarker, rate: 6 });
      const updated = await find(identity.editedMarker);
      expect(updated?.id).toBe(id);
      expect(Number(updated?.rate)).toBe(6);
      expect(await find(identity.marker)).toBeUndefined();
    });

    await test.step('删除税种并验证双身份不存在', async () => {
      await productCenterApi.deleteTax(id!);
      id = undefined;
      expect(await find(identity.marker)).toBeUndefined();
      expect(await find(identity.editedMarker)).toBeUndefined();
    });
  });

  test('打印机应完成创建、查询、编辑、删除并保持零残留', async ({ productCenterApi, cleanupRegistry }) => {
    const identity = createAuditIdentity('PRINTER');
    const poiPrintStall = findNamedRecord(await productCenterApi.poiPrintStalls(), '厨房');
    expect(poiPrintStall, '门店必须存在只读依赖打印档口“厨房”').toBeDefined();
    let id: string | undefined;
    const find = async (name: string) => findNamedStringRecord(await productCenterApi.printerPage(name), name);

    await test.step('创建审计打印机并记录服务端 ID', async () => {
      const created = await productCenterApi.createPrinter({ name: identity.marker, poiPrintStallId: poiPrintStall!.id });
      id = created?.data?.id ?? (await find(identity.marker))?.id;
      expect(id).toBeDefined();
      cleanupRegistry.register({
        entity: '打印机', identity: identity.marker,
        resource: { entityKind: 'printer', serverId: id!, identityVariants: [identity.marker, identity.editedMarker] },
        execute: async () => {
          for (const name of [identity.editedMarker, identity.marker]) {
            const residue = await find(name);
            if (residue) await productCenterApi.deletePrinter(residue.id);
          }
        },
        verify: async () => !(await find(identity.marker)) && !(await find(identity.editedMarker)),
      });
    });

    await test.step('编辑打印机并验证新名称', async () => {
      await productCenterApi.updatePrinter(id!, { name: identity.editedMarker, poiPrintStallId: poiPrintStall!.id });
      const updated = await find(identity.editedMarker);
      expect(updated?.id).toBe(id);
      expect(await find(identity.marker)).toBeUndefined();
    });

    await test.step('删除打印机并验证双身份不存在', async () => {
      await productCenterApi.deletePrinter(id!);
      id = undefined;
      expect(await find(identity.marker)).toBeUndefined();
      expect(await find(identity.editedMarker)).toBeUndefined();
    });
  });

  test('套餐组应完成创建、查询、删除并保持零残留', async ({ productCenterApi, cleanupRegistry }) => {
    const identity = createAuditIdentity('COMBO');
    let productId: number | undefined;
    let comboId: number | undefined;
    const findCombo = async (name: string) => findNamedRecord(await productCenterApi.comboGroupList(), name);
    const findProduct = async () => findNamedRecord(await productCenterApi.productPage(identity.marker), identity.marker);

    await test.step('创建审计商品作为套餐组依赖并记录 ID', async () => {
      const created = await productCenterApi.createBomProduct(identity.marker);
      productId = created?.data?.id ?? (await findProduct())?.id;
      expect(productId).toBeDefined();
      cleanupRegistry.register({
        entity: '套餐组依赖商品', identity: identity.marker,
        resource: { entityKind: 'bom-product', serverId: productId!, cleanupOrder: 0 },
        execute: async () => { const residue = await findProduct(); if (residue) await productCenterApi.deleteBomProduct(residue.id); },
        verify: async () => !(await findProduct()),
      });
    });

    await test.step('创建审计套餐组并记录服务端 ID', async () => {
      const detail = (await productCenterApi.productDetail(productId!)).data;
      const skuId = detail?.itemSpecDetail?.skuList?.[0]?.id ?? detail?.skuList?.[0]?.id ?? detail?.skus?.[0]?.id;
      expect(skuId, '审计商品必须返回可用 SKU ID').toBeDefined();
      const created = await productCenterApi.createComboGroup({ name: identity.marker, itemId: productId!, skuId });
      comboId = created?.data?.id ?? (await findCombo(identity.marker))?.id;
      expect(comboId).toBeDefined();
      cleanupRegistry.register({
        entity: '套餐组', identity: identity.marker,
        resource: { entityKind: 'combo', serverId: comboId!, cleanupOrder: 10 },
        execute: async () => { const residue = await findCombo(identity.marker); if (residue) await productCenterApi.deleteComboGroup(residue.id); },
        verify: async () => !(await findCombo(identity.marker)),
      });
    });

    await test.step('删除套餐组及依赖商品并验证不存在', async () => {
      await productCenterApi.deleteComboGroup(comboId!);
      comboId = undefined;
      expect(await findCombo(identity.marker)).toBeUndefined();
      await productCenterApi.deleteBomProduct(productId!);
      productId = undefined;
      expect(await findProduct()).toBeUndefined();
    });
  });

  for (const tagCase of [
    { title: '描述标签', entity: 'DESCRIPTION_TAG' as const, type: 1 as const },
    { title: '统计标签', entity: 'STAT_TAG' as const, type: 3 as const },
  ]) {
    test(`${tagCase.title}应完成创建、查询、删除并保持零残留`, async ({ productCenterApi, cleanupRegistry }) => {
      const identity = createAuditIdentity(tagCase.entity);
      const groupName = `${identity.marker}_GROUP`;
      let groupId: number | undefined;
      let tagId: number | undefined;
      const findGroup = async () => findNamedRecord(await productCenterApi.tagGroupList(tagCase.type), groupName);
      const findTag = async () => findNamedRecord(await productCenterApi.tagPage(tagCase.type), identity.marker);

      await test.step(`创建${tagCase.title}审计分组并记录服务端 ID`, async () => {
        const created = await productCenterApi.createTagGroup({ name: groupName, type: tagCase.type });
        groupId = created?.data?.id ?? (await findGroup())?.id;
        expect(groupId).toBeDefined();
        cleanupRegistry.register({
          entity: `${tagCase.title}分组`, identity: groupName,
          resource: { entityKind: 'tag-group', serverId: groupId!, cleanupOrder: 0 },
          execute: async () => { const residue = await findGroup(); if (residue) await productCenterApi.deleteTagGroup(residue.id); },
          verify: async () => !(await findGroup()),
        });
      });

      await test.step(`创建${tagCase.title}并记录服务端 ID`, async () => {
        const created = tagCase.type === 1
          ? await productCenterApi.createDescriptionTag({ name: identity.marker, groupId: groupId! })
          : await productCenterApi.createStatTag({ name: identity.marker, groupId: groupId! });
        tagId = created?.data?.id ?? (await findTag())?.id;
        expect(tagId).toBeDefined();
        cleanupRegistry.register({
          entity: tagCase.title, identity: identity.marker,
          resource: { entityKind: tagCase.type === 1 ? 'description-tag' : 'statistic-tag', serverId: tagId!, cleanupOrder: 10 },
          execute: async () => { const residue = await findTag(); if (residue) await productCenterApi.deleteTag(residue.id); },
          verify: async () => !(await findTag()),
        });
      });

      await test.step(`删除${tagCase.title}和审计分组并验证不存在`, async () => {
        await productCenterApi.deleteTag(tagId!);
        tagId = undefined;
        expect(await findTag()).toBeUndefined();
        await productCenterApi.deleteTagGroup(groupId!);
        groupId = undefined;
        expect(await findGroup()).toBeUndefined();
      });
    });
  }
});
