import type { APIRequestContext } from '@playwright/test';
import { callOperation } from '../operation-client';
import { runtimeConfig } from '../runtime-config';
import { assertAuditIdentity } from '../../test-data/product-center/audit-identity';
import { readProductTotalCount } from '../../utils/product-center-item-required-validation';

async function json<T>(response: Awaited<ReturnType<typeof callOperation>>): Promise<T> {
  const body = await response.json().catch(() => null);
  if (!response.ok() || body?.success === false) throw new Error(`API 请求失败 HTTP ${response.status()}：${JSON.stringify(body)}`);
  return body as T;
}

export class ProductCenterApi {
  constructor(private readonly request: APIRequestContext) {}

  async createCategory(input: {
    name: string;
    secondName: string;
    code: string;
    parentId?: number;
    level?: 1 | 2;
  }) {
    assertAuditIdentity(input.name);
    return json<any>(await callOperation(this.request, 'brand-menu:POST /ops-brand/brand-categories', {
      body: { parentId: 0, level: 1, sortOrder: 1, type: 1, ...input },
    }));
  }
  async updateCategory(id: number, input: { name: string; secondName: string; code: string }) {
    assertAuditIdentity(input.name);
    return json<any>(await callOperation(this.request, 'brand-menu:PUT /ops-brand/brand-categories/{id}', { pathParams: { id }, body: { id, parentId: 0, level: 1, sortOrder: 1, type: 1, ...input } }));
  }
  async deleteCategory(id: number) { return json<any>(await callOperation(this.request, 'brand-menu:DELETE /ops-brand/brand-categories/{id}', { pathParams: { id } })); }
  async categoryTree() { return json<any>(await callOperation(this.request, 'brand-menu:GET /ops-brand/brand-categories/treeList', { query: { categoryType: 1 } })); }

  async brandImageList(name: string) {
    assertAuditIdentity(name);
    return json<any>(await callOperation(this.request, 'brand-menu:POST /ops-brand/brand-images/list', {
      body: { pageNumber: 1, pageSize: 100, name },
    }));
  }
  async deleteBrandImage(id: number) {
    return json<any>(await callOperation(this.request, 'brand-menu:DELETE /ops-brand/brand-images/{id}', {
      pathParams: { id },
    }));
  }

  async createMethod(input: {
    name: string;
    secondName: string;
    optionName: string;
    optionNames?: readonly string[];
  }) {
    assertAuditIdentity(input.name);
    const optionNames = input.optionNames?.length ? input.optionNames : [input.optionName];
    return json<any>(await callOperation(this.request, 'brand-menu:POST /ops-brand/brand-modifiers', {
      body: {
        name: input.name,
        secondName: input.secondName,
        description: 'AUTO_AUDIT description',
        modifierType: 2,
        required: false,
        multiple: false,
        status: 1,
        options: optionNames.map((name, index) => ({
          name,
          secondName: '',
          defaultSelected: index === 0,
          priceAdjustment: index,
          sortOrder: index,
          status: 1,
        })),
      },
    }));
  }
  async methodPage(name: string) {
    assertAuditIdentity(name);
    return json<any>(await callOperation(this.request, 'brand-menu:GET /ops-brand/brand-modifiers/page', {
      query: { pageNumber: 1, pageSize: 100, modifierType: 2, name },
    }));
  }
  async methodDetail(id: number) { return json<any>(await callOperation(this.request, 'brand-menu:GET /ops-brand/brand-modifiers/{id}', { pathParams: { id } })); }
  async checkMethod(id: number, body: { name: string } & Record<string, unknown>) {
    assertAuditIdentity(body.name);
    return json<any>(await callOperation(this.request, 'brand-menu:PUT /ops-brand/brand-modifiers/check/{id}', { pathParams: { id }, body }));
  }
  async updateMethod(id: number, body: { name: string } & Record<string, unknown>) {
    assertAuditIdentity(body.name);
    return json<any>(await callOperation(this.request, 'brand-menu:PUT /ops-brand/brand-modifiers/{id}', { pathParams: { id }, body }));
  }
  async deleteMethod(id: number) { return json<any>(await callOperation(this.request, 'brand-menu:DELETE /ops-brand/brand-modifiers/{id}', { pathParams: { id } })); }

  async materialCategoryTree() {
    return json<any>(await callOperation(this.request, 'brand-menu:GET /ops-brand/brand-categories/treeList', { query: { categoryType: 3 } }));
  }
  async createMaterial(input: { name: string; secondName: string; categoryId: number; code: string; description: string }) {
    assertAuditIdentity(input.name);
    return json<any>(await callOperation(this.request, 'brand-menu:POST /ops-brand/brand-ingredients', {
      body: { ...input, allergenIds: [], nutritionIds: [] },
    }));
  }
  async materialPage(name: string) {
    assertAuditIdentity(name);
    return json<any>(await callOperation(this.request, 'brand-menu:GET /ops-brand/brand-ingredients', {
      query: { searchData: name, pageNumber: 1, pageSize: 100 },
    }));
  }
  async materialDetail(id: number) { return json<any>(await callOperation(this.request, 'brand-menu:GET /ops-brand/brand-ingredients/{id}', { pathParams: { id } })); }
  async allergenAll() { return json<any>(await callOperation(this.request, 'brand-menu:GET /ops-brand/brand-allergens/all')); }
  async nutritionAll() { return json<any>(await callOperation(this.request, 'brand-menu:GET /ops-brand/brand-nutritions/all')); }
  async updateMaterial(id: number, input: { name: string; secondName: string; categoryId: number; code: string; description: string }) {
    assertAuditIdentity(input.name);
    return json<any>(await callOperation(this.request, 'brand-menu:PUT /ops-brand/brand-ingredients/{id}', {
      pathParams: { id },
      body: { ...input, allergenIds: [], nutritionIds: [] },
    }));
  }
  async deleteMaterial(id: number) { return json<any>(await callOperation(this.request, 'brand-menu:DELETE /ops-brand/brand-ingredients/{id}', { pathParams: { id } })); }

  async createSeasoning(input: { name: string; secondName: string; optionName?: string; optionNames?: readonly string[] }) {
    assertAuditIdentity(input.name);
    const optionNames = input.optionNames?.length ? input.optionNames : [input.optionName ?? 'Vegetable'];
    return json<any>(await callOperation(this.request, 'brand-menu:POST /ops-brand/global-modifier/batch', {
      body: {
        list: [{
          platModifierId: 3,
          name: input.name,
          secondName: input.secondName,
          options: optionNames.map((name, index) => ({ name, secondName: `审计调味${index + 1}`, priceAdjustment: 0 })),
        }],
      },
    }));
  }
  async createEmptySeasoning(input: { name: string; secondName: string }) {
    assertAuditIdentity(input.name);
    return json<any>(await callOperation(this.request, 'brand-menu:POST /ops-brand/global-modifier/batch', {
      body: {
        list: [{
          platModifierId: 3,
          name: input.name,
          secondName: input.secondName,
          options: [],
        }],
      },
    }));
  }
  async seasoningList() {
    return json<any>(await callOperation(this.request, 'brand-menu:GET /ops-brand/global-modifier/list', { query: { status: 1 } }));
  }
  async seasoningDetail(id: number) { return json<any>(await callOperation(this.request, 'brand-menu:GET /ops-brand/global-modifier/{id}', { pathParams: { id } })); }
  async updateSeasoning(id: number, body: { name: string } & Record<string, unknown>) {
    assertAuditIdentity(body.name);
    return json<any>(await callOperation(this.request, 'brand-menu:PUT /ops-brand/global-modifier/{id}', { pathParams: { id }, body }));
  }
  async deleteSeasoning(id: number) { return json<any>(await callOperation(this.request, 'brand-menu:DELETE /ops-brand/global-modifier/{id}', { pathParams: { id } })); }

  async seasoningTemplatePage(name = '') {
    if (name) assertAuditIdentity(name);
    return json<any>(await callOperation(this.request, 'brand-menu:GET /ops-brand/modifier-template/page', {
      query: { pageNumber: 1, pageSize: 100, name },
    }));
  }
  async seasoningTemplateDetail(id: number) {
    return json<any>(await callOperation(this.request, 'brand-menu:GET /ops-brand/modifier-template/{id}', { pathParams: { id } }));
  }
  async updateSeasoningTemplate(id: number, body: Record<string, unknown>) {
    const name = typeof body.name === 'string' ? body.name : '';
    if (name) assertAuditIdentity(name);
    return json<any>(await callOperation(this.request, 'brand-menu:PUT /ops-brand/modifier-template/{id}', { pathParams: { id }, body }));
  }
  async deleteSeasoningTemplate(id: number) {
    return json<any>(await callOperation(this.request, 'brand-menu:DELETE /ops-brand/modifier-template/{id}', { pathParams: { id } }));
  }

  async createTaste(input: {
    name: string;
    secondName: string;
    optionName: string;
    optionNames?: readonly string[];
  }) {
    assertAuditIdentity(input.name);
    const optionNames = input.optionNames?.length ? input.optionNames : [input.optionName];
    return json<any>(await callOperation(this.request, 'brand-menu:POST /ops-brand/brand-modifiers', {
      body: {
        name: input.name,
        secondName: input.secondName,
        description: 'AUTO_AUDIT taste',
        modifierType: 1,
        required: false,
        multiple: false,
        status: 1,
        options: optionNames.map((name, index) => ({
          name,
          secondName: '',
          defaultSelected: index === 0,
          priceAdjustment: index,
          sortOrder: index,
          status: 1,
        })),
      },
    }));
  }
  async tastePage(name: string) {
    assertAuditIdentity(name);
    return json<any>(await callOperation(this.request, 'brand-menu:GET /ops-brand/brand-modifiers/page', { query: { pageNumber: 1, pageSize: 100, modifierType: 1, name } }));
  }
  async tasteDetail(id: number) { return json<any>(await callOperation(this.request, 'brand-menu:GET /ops-brand/brand-modifiers/{id}', { pathParams: { id } })); }
  async checkTaste(id: number, body: { name: string } & Record<string, unknown>) {
    assertAuditIdentity(body.name);
    return json<any>(await callOperation(this.request, 'brand-menu:PUT /ops-brand/brand-modifiers/check/{id}', { pathParams: { id }, body }));
  }
  async updateTaste(id: number, body: { name: string } & Record<string, unknown>) {
    assertAuditIdentity(body.name);
    return json<any>(await callOperation(this.request, 'brand-menu:PUT /ops-brand/brand-modifiers/{id}', { pathParams: { id }, body }));
  }

  async createSpec(input: {
    name: string;
    secondName: string;
    optionName: string;
    optionNames?: readonly string[];
    allowEmptyOptions?: boolean;
  }) {
    assertAuditIdentity(input.name);
    const optionNames = input.allowEmptyOptions ? [] : input.optionNames?.length ? input.optionNames : [input.optionName];
    return json<any>(await callOperation(this.request, 'brand-menu:POST /ops-brand/brand-specs', {
      body: {
        name: input.name,
        secondName: input.secondName,
        displayName: input.name,
        description: 'AUTO_AUDIT spec',
        sortOrder: 0,
        status: 1,
        options: optionNames.map((name, index) => ({
          name,
          secondName: '',
          value: String(index + 1),
          sortOrder: index,
          status: 1,
          defaultSelected: false,
        })),
      },
    }));
  }
  async specPage(name: string) {
    assertAuditIdentity(name);
    return json<any>(await callOperation(this.request, 'brand-menu:GET /ops-brand/brand-specs/page', { query: { pageNumber: 1, pageSize: 100, name } }));
  }
  async specDetail(id: number) { return json<any>(await callOperation(this.request, 'brand-menu:GET /ops-brand/brand-specs/{id}', { pathParams: { id } })); }
  async updateSpec(id: number, body: { name: string } & Record<string, unknown>) { assertAuditIdentity(body.name); return json<any>(await callOperation(this.request, 'brand-menu:PUT /ops-brand/brand-specs/{id}', { pathParams: { id }, body })); }
  async deleteSpec(id: number) { return json<any>(await callOperation(this.request, 'brand-menu:DELETE /ops-brand/brand-specs/{id}', { pathParams: { id } })); }

  async createAddonGroup(input: {
    name: string;
    secondName: string;
    itemId?: number;
    itemIds?: readonly number[];
  }) {
    assertAuditIdentity(input.name);
    const itemIds = input.itemIds?.length
      ? [...new Set(input.itemIds)]
      : input.itemId === undefined ? [] : [input.itemId];
    const items = itemIds.map((itemId, index) => ({
      itemId,
      sortOrder: index,
      status: 1,
      selectionRule: { quantity: 0, maxQuantity: 1 },
      pricingRule: { additionalPrice: index },
      defaultSelected: index === 0,
    }));
    return json<any>(await callOperation(this.request, 'brand-menu:POST /ops-brand/brand-addon-group', { body: { name: input.name, secondName: input.secondName, description: 'AUTO_AUDIT addon', status: 1, selectionRule: { min: 0, max: 1, mergeDisplay: true, repeatSelect: false }, pricingRule: { freeQuantity: 0 }, items } }));
  }
  async addonGroupList(name: string) {
    assertAuditIdentity(name);
    return json<any>(await callOperation(this.request, 'brand-menu:GET /ops-brand/brand-addon-group/list', { query: { status: 1 } }));
  }
  async addonGroupDetail(id: number) { return json<any>(await callOperation(this.request, 'brand-menu:GET /ops-brand/brand-addon-group/{id}', { pathParams: { id } })); }
  async createAddonGroupItem(input: {
    groupId: number;
    itemId: number;
    skuId?: number;
    sortOrder?: number;
    status?: number;
    selectionRule?: Record<string, unknown>;
    pricingRule?: Record<string, unknown>;
    defaultSelected?: boolean;
  }) {
    return json<any>(await callOperation(this.request, 'brand-menu:POST /ops-brand/brand-addon-group-item', {
      body: {
        groupId: input.groupId,
        itemId: input.itemId,
        ...(input.skuId === undefined ? {} : { skuId: input.skuId }),
        sortOrder: input.sortOrder ?? 0,
        status: input.status ?? 1,
        selectionRule: input.selectionRule ?? { quantity: 0, maxQuantity: 1 },
        pricingRule: input.pricingRule ?? { additionalPrice: 0 },
        defaultSelected: input.defaultSelected ?? true,
      },
    }));
  }
  async deleteAddonGroupItem(id: number) {
    return json<any>(await callOperation(this.request, 'brand-menu:DELETE /ops-brand/brand-addon-group-item/{id}', { pathParams: { id } }));
  }
  async checkAddonGroup(id: number, body: { name: string } & Record<string, unknown>) { assertAuditIdentity(body.name); return json<any>(await callOperation(this.request, 'brand-menu:PUT /ops-brand/brand-addon-group/check/{id}', { pathParams: { id }, body })); }
  async updateAddonGroup(id: number, body: { name: string } & Record<string, unknown>) { assertAuditIdentity(body.name); return json<any>(await callOperation(this.request, 'brand-menu:PUT /ops-brand/brand-addon-group/{id}', { pathParams: { id }, body })); }
  async deleteAddonGroup(id: number) { return json<any>(await callOperation(this.request, 'brand-menu:DELETE /ops-brand/brand-addon-group/{id}', { pathParams: { id } })); }

  async createPrintStall(input: { name: string; remark: string }) {
    assertAuditIdentity(input.name);
    return json<any>(await callOperation(this.request, 'brand-menu:POST /ops-brand/print-stalls', { body: input }));
  }
  async printStallPage(name: string) {
    assertAuditIdentity(name);
    return json<any>(await callOperation(this.request, 'brand-menu:GET /ops-brand/print-stalls', { query: { pageNumber: 1, pageSize: 100 } }));
  }
  async deletePrintStall(id: number) { return json<any>(await callOperation(this.request, 'brand-menu:DELETE /ops-brand/print-stalls/{id}', { pathParams: { id } })); }

  async createTax(input: { name: string; rate: number }) {
    assertAuditIdentity(input.name);
    return json<any>(await callOperation(this.request, 'brand-menu:POST /ops-poi/tax-types', {
      body: { ...input, roundingMethod: 'ROUND_HALF_UP', defaultTax: false, sortOrder: 0 },
    }));
  }
  async taxPage(name: string) {
    assertAuditIdentity(name);
    return json<any>(await callOperation(this.request, 'brand-menu:POST /ops-poi/tax-types/pageQuery', { body: { pageNumber: 1, pageSize: 100, name } }));
  }
  async updateTax(id: number, input: { name: string; rate: number }) {
    assertAuditIdentity(input.name);
    return json<any>(await callOperation(this.request, 'brand-menu:PUT /ops-poi/tax-types/{id}', {
      pathParams: { id }, body: { ...input, roundingMethod: 'ROUND_HALF_UP', defaultTax: false, sortOrder: 0 },
    }));
  }
  async deleteTax(id: number) { return json<any>(await callOperation(this.request, 'brand-menu:DELETE /ops-poi/tax-types/{id}', { pathParams: { id } })); }

  async poiPrintStalls() { return json<any>(await callOperation(this.request, 'brand-menu:GET /ops-poi/print-stalls')); }
  async createPrinter(input: { name: string; poiPrintStallId: number }) {
    assertAuditIdentity(input.name);
    return json<any>(await callOperation(this.request, 'brand-menu:POST /ops-poi/item-printers/printers', {
      body: { name: input.name, enablePrint: true, printStalls: [{ poiPrintStallId: input.poiPrintStallId }] },
    }));
  }
  async printerPage(name: string) {
    assertAuditIdentity(name);
    return json<any>(await callOperation(this.request, 'brand-menu:POST /ops-poi/item-printers/printers/page', { body: { pageNumber: 1, pageSize: 100, name } }));
  }
  async updatePrinter(id: string, input: { name: string; poiPrintStallId: number }) {
    assertAuditIdentity(input.name);
    return json<any>(await callOperation(this.request, 'brand-menu:PUT /ops-poi/item-printers/printers/{printerId}', {
      pathParams: { printerId: id },
      body: { name: input.name, enablePrint: true, printStalls: [{ poiPrintStallId: input.poiPrintStallId }] },
    }));
  }
  async deletePrinter(id: string) {
    return json<any>(await callOperation(this.request, 'brand-menu:DELETE /ops-poi/item-printers/printers', { body: { printerIds: [id] } }));
  }
  async createComboGroup(input: {
    name: string;
    itemId?: number;
    skuId?: number;
    sectionType?: 1 | 2 | 5;
    secondName?: string;
    description?: string;
    selectionRule?: Record<string, unknown>;
    pricingRule?: Record<string, unknown>;
    sectionItemList?: readonly Record<string, unknown>[];
  }) {
    assertAuditIdentity(input.name);
    if (!input.sectionItemList && (!input.itemId || !input.skuId)) {
      throw new Error(`套餐组 ${input.name} 缺少商品或 SKU`);
    }
    return json<any>(await callOperation(this.request, 'brand-menu:POST /ops-brand/brand-sections', {
      body: {
        sectionType: input.sectionType ?? 1,
        name: input.name,
        secondName: input.secondName ?? '套餐组审计',
        description: input.description ?? 'AUTO_AUDIT combo group',
        selectionRule: input.selectionRule ?? { min: 1, max: 1, mergeDisplay: true, repeatSelect: false },
        pricingRule: input.pricingRule ?? { freeQuantity: 0 },
        sectionItemList: input.sectionItemList ?? [{
          itemId: input.itemId,
          skuId: input.skuId,
          selectionRule: { quantity: 1, maxQuantity: 1 },
          defaultSelected: true,
          sortOrder: 0,
        }],
      },
    }));
  }
  async comboGroupList() { return json<any>(await callOperation(this.request, 'brand-menu:GET /ops-brand/brand-sections/list', { query: { pageNumber: 1, pageSize: 100 } })); }
  async comboGroupDetail(id: number) { return json<any>(await callOperation(this.request, 'brand-menu:GET /ops-brand/brand-sections/{id}', { pathParams: { id } })); }
  async deleteComboGroup(id: number) { return json<any>(await callOperation(this.request, 'brand-menu:DELETE /ops-brand/brand-sections/{id}', { pathParams: { id } })); }

  async createTagGroup(input: { name: string; type: 1 | 3 }) {
    assertAuditIdentity(input.name);
    return json<any>(await callOperation(this.request, 'brand-menu:POST /ops-brand/brand-tag-groups', { body: input }));
  }
  async tagGroupList(type: 1 | 3) {
    return json<any>(await callOperation(this.request, 'brand-menu:GET /ops-brand/brand-tag-groups/list', { query: { type } }));
  }
  async deleteTagGroup(id: number) { return json<any>(await callOperation(this.request, 'brand-menu:DELETE /ops-brand/brand-tag-groups/{id}', { pathParams: { id } })); }
  async createDescriptionTag(input: { name: string; groupId: number }) {
    assertAuditIdentity(input.name);
    return json<any>(await callOperation(this.request, 'brand-menu:POST /ops-brand/brand-tags', {
      body: {
        ...input,
        secondName: '描述标签审计',
        type: 1,
        styleConfig: JSON.stringify({ backgroundColor: '#E6F4FF', borderColor: '#91CAFF', color: '#1677FF', domTpl: '', borderRadius: 4, domTemplate: '' }),
      },
    }));
  }
  async createStatTag(input: { name: string; groupId: number }) {
    assertAuditIdentity(input.name);
    return json<any>(await callOperation(this.request, 'brand-menu:POST /ops-brand/brand-tags', { body: { ...input, secondName: '统计标签审计', type: 3 } }));
  }
  async tagPage(type: 1 | 3) {
    return json<any>(await callOperation(this.request, 'brand-menu:GET /ops-brand/brand-tags/page', { query: { pageNumber: 1, pageSize: 100, type } }));
  }
  async deleteTag(id: number) { return json<any>(await callOperation(this.request, 'brand-menu:DELETE /ops-brand/brand-tags/{id}', { pathParams: { id } })); }
  async createCornerMark(input: {
    name: string;
    secondName?: string;
    sortOrder?: number;
    startTimeLocal?: string;
    endTimeLocal?: string;
    styleConfig?: string;
  }) {
    assertAuditIdentity(input.name);
    return json<any>(await callOperation(this.request, 'brand-menu:POST /ops-brand/brand-tags/corner', {
      body: {
        name: input.name,
        secondName: input.secondName ?? '角标审计',
        iconUrl: '',
        styleConfig: input.styleConfig
          ?? JSON.stringify({ color: '#1677FF', backgroundColor: '#E6F4FF', borderRadius: '4px' }),
        sortOrder: input.sortOrder ?? 1,
        ...(input.startTimeLocal ? { startTimeLocal: input.startTimeLocal } : {}),
        ...(input.endTimeLocal ? { endTimeLocal: input.endTimeLocal } : {}),
      },
    }));
  }
  async cornerMarkPage(name?: string) {
    if (name) assertAuditIdentity(name);
    return json<any>(await callOperation(this.request, 'brand-menu:GET /ops-brand/brand-tags/corner/page', {
      query: { pageNumber: 1, pageSize: 100, ...(name ? { name } : {}) },
    }));
  }
  async updateCornerMark(id: number, input: {
    name: string;
    secondName?: string;
    sortOrder?: number;
    startTimeLocal: string;
    endTimeLocal: string;
    styleConfig: string;
  }) {
    assertAuditIdentity(input.name);
    return json<any>(await callOperation(this.request, 'brand-menu:PUT /ops-brand/brand-tags/corner/{id}', {
      pathParams: { id },
      body: {
        name: input.name,
        secondName: input.secondName ?? '角标审计',
        iconUrl: '',
        styleConfig: input.styleConfig,
        sortOrder: input.sortOrder ?? 1,
        startTimeLocal: input.startTimeLocal,
        endTimeLocal: input.endTimeLocal,
        id,
      },
    }));
  }
  async deleteCornerMark(id: number) {
    return json<any>(await callOperation(this.request, 'brand-menu:DELETE /ops-brand/brand-tags/corner/{id}', {
      pathParams: { id },
    }));
  }

  async createMaterialCategory(input: { name: string; secondName: string; parentId?: number }) {
    assertAuditIdentity(input.name);
    return json<any>(await callOperation(this.request, 'brand-menu:POST /ops-brand/brand-categories', {
      body: { name: input.name, secondName: input.secondName, parentId: input.parentId ?? 0, type: 3, poiId: 'M000024451' },
    }));
  }
  async updateMaterialCategory(id: number, input: { name: string; secondName: string }) {
    assertAuditIdentity(input.name);
    return json<any>(await callOperation(this.request, 'brand-menu:PUT /ops-brand/brand-categories/{id}', { pathParams: { id }, body: input }));
  }

  async updateRecipeIngredient(id: number, input: { ingredientId: number; categoryId: number; shortName: string }) {
    return json<any>(await callOperation(this.request, 'brand-menu:PUT /ops-brand/recipe-ingredients/{id}', {
      pathParams: { id },
      body: { isEdit: true, ...input, sugarRule: true, tagPrint: true },
    }));
  }

  async createMenu(input: { name: string; secondName: string; code: string }) {
    assertAuditIdentity(input.name);
    return json<any>(await callOperation(this.request, 'brand-menu:POST /ops-brand/brand-menus', {
      body: buildMenuCreatePayload(input),
    }));
  }
  async menuPage(name: string) {
    assertAuditIdentity(name);
    return json<any>(await callOperation(this.request, 'brand-menu:POST /ops-brand/brand-menus/page', { body: { pageNumber: 1, pageSize: 20, name } }));
  }
  async menuDetail(id: number) {
    return json<any>(await callOperation(this.request, 'brand-menu:GET /ops-brand/brand-menus/{id}', { pathParams: { id } }));
  }
  async menuSubMenuList(id: number, loadBlockItems = true) {
    return json<any>(await callOperation(this.request, 'brand-menu:GET /ops-brand/brand-menus/{id}/subMenu/list', {
      pathParams: { id },
      query: { loadBlockItems },
    }));
  }
  async createMenuBlock(input: { subMenuId: number; code: string; name: string; secondName: string }) {
    assertAuditIdentity(input.name);
    return json<any>(await callOperation(this.request, 'brand-menu:POST /ops-brand/brand-menu-block', {
      body: buildMenuBlockCreatePayload(input),
    }));
  }
  async menuBlockSearch(name: string) {
    assertAuditIdentity(name);
    return json<any>(await callOperation(this.request, 'brand-menu:GET /ops-brand/brand-menu-block/search', { query: { name } }));
  }
  async menuBlockDetail(id: number) {
    return json<any>(await callOperation(this.request, 'brand-menu:GET /ops-brand/brand-menu-block/{id}', {
      pathParams: { id },
      query: { simple: false },
    }));
  }
  async deleteMenuBlock(id: number) {
    return json<any>(await callOperation(this.request, 'brand-menu:DELETE /ops-brand/brand-menu-block/{id}', { pathParams: { id } }));
  }
  async createMenuBlockItems(items: readonly {
    blockId: number;
    itemId: number;
    sortOrder?: number;
    sourceType?: number;
    visibleType?: number;
    marketPriceItem?: number;
    posColor?: string;
  }[]) {
    return json<any>(await callOperation(this.request, 'brand-menu:POST /ops-brand/brand-block-item/batchCreate', {
      body: { items: items.map((item) => ({ sourceType: 1, visibleType: 0, marketPriceItem: 0, ...item })) },
    }));
  }
  async menuBlockItemStructList(input: {
    menuId: number;
    subMenuId?: number;
    blockId?: number;
    itemId?: number;
    name?: string;
  }) {
    return json<any>(await callOperation(this.request, 'brand-menu:POST /ops-brand/brand-block-item/struct/list', {
      body: { pageNumber: 1, pageSize: 100, ...input },
    }));
  }
  async deleteMenuBlockItem(id: number) {
    return json<any>(await callOperation(this.request, 'brand-menu:DELETE /ops-brand/brand-block-item/{id}', { pathParams: { id } }));
  }
  async updateMenu(id: number, input: { name: string; secondName: string; code: string }) {
    assertAuditIdentity(input.name);
    return json<any>(await callOperation(this.request, 'brand-menu:PUT /ops-brand/brand-menus/{id}', { pathParams: { id }, body: { ...input, channelCode: ['POS'] } }));
  }
  async deleteMenu(id: number) { return json<any>(await callOperation(this.request, 'brand-menu:DELETE /ops-brand/brand-menus/{id}', { pathParams: { id } })); }
  async poiItemChannelStatus(itemId: number, poiId: string) {
    return json<any>(await callOperation(this.request, 'brand-menu:GET /ops-brand/poi-item-channel-status/item/{itemId}', {
      pathParams: { itemId },
      query: { poiId },
    }));
  }
  async updatePoiItemChannelStatus(input: {
    itemId: number;
    channelCode: string;
    orderType: string;
    status: 0 | 1;
  }) {
    return json<any>(await callOperation(this.request, 'brand-menu:PUT /ops-brand/poi-item-channel-status', { body: input }));
  }
  async createBomProduct(
    name: string,
    categoryId = 142,
    options: { price?: number; weightItem?: boolean } = {},
  ) {
    assertAuditIdentity(name);
    return json<any>(await callOperation(this.request, 'brand-menu:POST /ops-brand/brand-items/standard', {
      body: {
        itemBasic: {
          name,
          secondName: `${name}_SECOND`,
          minOrderQuantity: 1,
          type: 1,
          weightItem: options.weightItem ?? false,
          categoryId,
          specType: 1,
          itemMainImages: [],
          itemDetailImages: [],
        },
        printStallIds: [],
        itemSpecDetail: {
          specList: [],
          skuList: [{ salePrice: options.price ?? 1, costPrice: 0, packageFee: 0 }],
        },
        cookList: [], tasteList: [], mutexAttrRuleList: [], addGroupList: [], descTagList: [], corner: [], statisticalsTagList: [], flexedSectionList: [], fixedSectionList: [], allergenList: [], nutritionList: [], ingredientList: [],
      },
    }));
  }
  async bindTagToProduct(input: { itemId: number; groupId: number; tagId: number }) {
    const tag = {
      brandId: runtimeConfig.brandId,
      itemId: input.itemId,
      tagId: input.tagId,
      tagGroupId: input.groupId,
      sortOrder: 0,
    };
    return json<any>(await callOperation(this.request, 'brand-menu:POST /ops-brand/brand-item-tag-groups', {
      body: {
        itemId: input.itemId,
        brandId: runtimeConfig.brandId,
        brandItemTagGroupRequests: [{
          itemId: input.itemId,
          brandId: runtimeConfig.brandId,
          tagGroupId: input.groupId,
          sortOrder: 0,
          brandItemTagList: [tag],
        }],
      },
    }));
  }
  async bindDescriptionTagToProduct(input: { itemId: number; groupId: number; tagId: number }) {
    return this.bindTagToProduct(input);
  }
  async brandItemTagGroupList(input: { itemId: number; groupId: number; type?: 1 | 3 }) {
    return json<any>(await callOperation(this.request, 'brand-menu:GET /ops-brand/brand-item-tag-groups/list', {
      query: { itemId: input.itemId, tagGroupId: input.groupId, type: input.type ?? 1 },
    }));
  }
  async productPage(name: string) {
    assertAuditIdentity(name);
    return json<any>(await callOperation(this.request, 'brand-menu:POST /ops-brand/brand-items/pageQuery', { body: { pageNumber: 1, pageSize: 20, name } }));
  }
  async productCount(): Promise<number> {
    const body = await json<unknown>(await callOperation(
      this.request,
      'brand-menu:POST /ops-brand/brand-items/pageQuery',
      { body: { pageNumber: 1, pageSize: 1 } },
    ));
    return readProductTotalCount(body);
  }
  async productDetail(id: number) { return json<any>(await callOperation(this.request, 'brand-menu:GET /ops-brand/brand-items/{id}', { pathParams: { id } })); }
  async updateItemAddonAttributes(input: {
    itemIds: readonly number[];
    addon: {
      operationType: 1 | 2 | 3;
      additionList?: readonly Record<string, unknown>[];
      removeList?: readonly Record<string, unknown>[];
    };
  }) {
    return json<any>(await callOperation(this.request, 'brand-menu:POST /ops-brand/brand-items/update/attr-info', {
      body: {
        itemIds: [...input.itemIds],
        addon: {
          operationType: input.addon.operationType,
          ...(input.addon.additionList === undefined ? {} : { additionList: [...input.addon.additionList] }),
          ...(input.addon.removeList === undefined ? {} : { removeList: [...input.addon.removeList] }),
        },
      },
    }));
  }
  async updateStandardItem(id: number, body: Record<string, unknown>) {
    return json<any>(await callOperation(this.request, 'brand-menu:PUT /ops-brand/brand-items/standard/{id}', {
      pathParams: { id },
      body,
    }));
  }
  async deleteBomProduct(id: number) { return json<any>(await callOperation(this.request, 'brand-menu:DELETE /ops-brand/brand-items/delete', { body: { deleteId: id, force: true } })); }
  async createStoreProduct(name: string) {
    assertAuditIdentity(name);
    return json<any>(await callOperation(this.request, 'brand-menu:POST /ops-poi/brand-items/standard', {
      body: {
        itemBasic: { name, secondName: `${name}_SECOND`, minOrderQuantity: 1, type: 1, weightItem: false, categoryId: 142, specType: 1, itemMainImages: [], itemDetailImages: [] },
        printStallIds: [],
        itemSpecDetail: { specList: [], skuList: [{ salePrice: 1, costPrice: 0, packageFee: 0 }] },
        cookList: [], tasteList: [], mutexAttrRuleList: [], addGroupList: [], descTagList: [], corner: [], statisticalsTagList: [], flexedSectionList: [], fixedSectionList: [], allergenList: [], nutritionList: [], ingredientList: [],
      },
    }));
  }
  async storeProductPage(name: string) {
    assertAuditIdentity(name);
    return json<any>(await callOperation(this.request, 'brand-menu:POST /ops-poi/brand-items/pageQuery', {
      body: { pageNumber: 1, pageSize: 20, name },
    }));
  }
  async storePoiProductPage(
    name?: string,
    options: { status?: 0 | 1; includeNoChannelItem?: boolean } = {},
  ) {
    return json<any>(await callOperation(this.request, 'brand-menu:POST /ops-poi/poi-items/pageQuery', {
      body: { pageNumber: 1, pageSize: 100, ...(name ? { allName: name } : {}), ...options },
    }));
  }
  async deleteStoreProduct(id: number) {
    return json<any>(await callOperation(this.request, 'brand-menu:DELETE /ops-poi/brand-items/delete', {
      body: { deleteId: id, force: true },
    }));
  }
  async brandMerchantPage(input: {
    merchantId?: string;
    merchantName?: string;
    keywords?: string;
  } = {}) {
    return json<any>(await callOperation(this.request, 'brand-menu:POST /ops-brand/merchants/page', {
      body: { pageNumber: 1, pageSize: 100, ...input },
    }));
  }
  async createMenuSyncJob(input: {
    syncType: number;
    menuId: number;
    targetPois: readonly {
      poiId: string;
      poiName: string;
      region?: string;
    }[];
    remark?: string;
  }) {
    return json<any>(await callOperation(this.request, 'brand-menu:POST /ops-brand/brand-menu-sync-job', {
      body: { ...input, targetPois: [...input.targetPois] },
    }));
  }
  async executeMenuSyncJob(id: number, input: { executeType: number; scheduledTime?: string }) {
    return json<any>(await callOperation(this.request, 'brand-menu:PUT /ops-brand/brand-menu-sync-job/execute/{id}', {
      pathParams: { id },
      body: input,
    }));
  }
  async cancelMenuSyncJob(id: number) {
    return json<any>(await callOperation(this.request, 'brand-menu:PUT /ops-brand/brand-menu-sync-job/cancel/{id}', {
      pathParams: { id },
    }));
  }
  async menuSyncJobStatus(id: number) {
    return json<any>(await callOperation(this.request, 'brand-menu:GET /ops-brand/brand-menu-sync-job/{id}/status', {
      pathParams: { id },
    }));
  }
  async menuSyncJobDetail(id: number) {
    return json<any>(await callOperation(this.request, 'brand-menu:GET /ops-brand/brand-menu-sync-job/{id}', {
      pathParams: { id },
    }));
  }
  async createRecipeIngredient(input: { ingredientId: number; categoryId: number; shortName: string }) {
    return json<any>(await callOperation(this.request, 'brand-menu:POST /ops-brand/recipe-ingredients', { body: { ...input, sugarRule: true, tagPrint: true } }));
  }
  async recipeIngredientList() { return json<any>(await callOperation(this.request, 'brand-menu:POST /ops-brand/recipe-ingredients/list', { body: { pageNumber: 1, pageSize: 100 } })); }
  async deleteRecipeIngredient(id: number) { return json<any>(await callOperation(this.request, 'brand-menu:DELETE /ops-brand/recipe-ingredients/{id}', { pathParams: { id } })); }
  async createBom(body: { itemId: number; groupBoms: unknown[] }) { return json<any>(await callOperation(this.request, 'brand-menu:POST /ops-brand/bom/item/batch', { body })); }
  async updateBom(body: { itemId: number | string; groupBoms: unknown[] }) { return json<any>(await callOperation(this.request, 'brand-menu:PUT /ops-brand/bom/item/batch', { body })); }
  async bomDetail(id: number) { return json<any>(await callOperation(this.request, 'brand-menu:GET /ops-brand/bom/{id}', { pathParams: { id } })); }
  async bomGrouped(itemId: number) { return json<any>(await callOperation(this.request, 'brand-menu:GET /ops-brand/bom/item/{itemId}/grouped', { pathParams: { itemId } })); }
  async deleteBom(id: number) { return json<any>(await callOperation(this.request, 'brand-menu:DELETE /ops-brand/bom/{id}', { pathParams: { id } })); }
  async bomPage(name: string) {
    assertAuditIdentity(name);
    return json<any>(await callOperation(this.request, 'brand-menu:POST /ops-brand/bom/page', { body: { pageNumber: 1, pageSize: 20, name } }));
  }
}

export function buildMenuCreatePayload(input: { name: string; secondName: string; code: string }) {
  const timeConfig = buildDailyMenuTimeConfig();
  return {
    ...input,
    channelCode: ['POS'],
    timeConfig,
    subMenuList: [1, 2, 3].map((number, index) => ({
      name: `${input.name}_PAGE_${number}`,
      sortOrder: index,
      timeConfig,
    })),
  };
}

export function buildMenuBlockCreatePayload(input: { subMenuId: number; code: string; name: string; secondName: string }) {
  return {
    ...input,
    blockType: 2,
    sortOrder: 0,
    description: 'AUTO_AUDIT menu block',
    status: 1,
    visibleType: 0,
    timeConfig: buildDailyMenuTimeConfig(),
    items: [],
  };
}

function buildDailyMenuTimeConfig() {
  return {
    displayPeriod: 'DAILY',
    timeType: 1,
    excludeTimeConfig: { includeAllHolidays: false },
  } as const;
}
