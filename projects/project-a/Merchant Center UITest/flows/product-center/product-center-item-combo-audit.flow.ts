import type { Page } from '@playwright/test';
import type { ProductCenterApi } from '../../api/product-center/product-center-api';
import { ItemCreateFlow } from '../item-create.flow';
import { ProductCenterItemComboCreateFlow } from './product-center-item-combo-create.flow';
import { createItemListPage } from '../../pages/product-management/item/item-list.page';
import { ItemEditComboPage } from '../../pages/product-management/item/item-edit.page';
import type {
  ProductCenterItemCreateContext,
  ProductCenterItemCreateRecord,
} from '../../test-data/product-center/product-center-item-create-data.factory';
import type {
  ProductCenterItemComboGroupRequiredResult,
  ProductCenterItemComboOptionalBoundaryResult,
} from '../../utils/product-center-item-combo-audit';
import { step } from '../../utils/step';

export class ProductCenterItemComboAuditFlow {
  constructor(
    private readonly page: Page,
    private readonly api: ProductCenterApi,
  ) {}

  @step('探测套餐商品缺少套餐分组时的保存与保存并新建校验')
  async probeGroupRequired(
    context: ProductCenterItemCreateContext,
    registerUnexpectedCreated: (responseBody: unknown) => Promise<ProductCenterItemCreateRecord>,
  ): Promise<ProductCenterItemComboGroupRequiredResult> {
    const beforeRecordCount = await this.itemRecordCount(context.originalIdentity);
    const formPage = await new ItemCreateFlow().openComboCreateFromCurrentList(this.page);
    await formPage.fillItemName(context.originalIdentity);
    await formPage.clickAdvancedSettings();
    await formPage.fillMinimumOrderQuantity(context.minimumOrderQuantity);
    await formPage.fillStandardPrice(context.price);

    const save = await formPage.attemptSaveWithoutComboGroup('save');
    await this.registerUnexpectedResidue(context, registerUnexpectedCreated);
    await formPage.waitForComboGroupRequiredErrorHidden();
    const saveAndNew = await formPage.attemptSaveWithoutComboGroup('save-and-new');
    await this.registerUnexpectedResidue(context, registerUnexpectedCreated);
    const afterRecordCount = await this.itemRecordCount(context.originalIdentity);

    return {
      identity: context.originalIdentity,
      beforeRecordCount,
      afterRecordCount,
      attempts: [save, saveAndNew],
    };
  }

  @step('探测套餐商品编辑页可选搭配组的操作边界')
  async probeOptionalEditBoundary(input: {
    context: ProductCenterItemCreateContext;
    registerItemCreated: (responseBody: unknown) => Promise<ProductCenterItemCreateRecord>;
    registerComboGroupCreated: (
      name: string,
      responseBody: unknown,
      intentId?: string,
    ) => Promise<{ id: number; name: string; checkpointEntryId: string }>;
    recordComboGroupMutationIntent?: (name: string) => string;
    markComboGroupMutationTriggered?: (intentId: string) => void;
    markComboGroupMutationVerified?: (intentId: string) => void;
    readItemRecordCount: (identity: string) => Promise<number>;
    readComboGroupRecordCount: (identity: string) => Promise<number>;
  }): Promise<ProductCenterItemComboOptionalBoundaryResult> {
    const { context } = input;
    if (!context.comboGroupName || !context.customComboGroupName || !context.dependencyProductIdentity) {
      throw new Error('可选搭配边界探测缺少固定组、自定义组或依赖商品身份');
    }
    const created = await new ProductCenterItemComboCreateFlow(this.page).create({
      context,
      price: context.price,
      minimumOrderQuantity: context.minimumOrderQuantity,
      comboGroupName: context.comboGroupName,
    }, input.registerItemCreated);

    const listPage = createItemListPage(this.page);
    await listPage.expectLoaded();
    await listPage.fillSearch(context.originalIdentity);
    await listPage.expectUniqueItemVisible(context.originalIdentity);
    await listPage.clickItemName(context.originalIdentity);
    const editPage = new ItemEditComboPage(this.page);
    await editPage.expectLoaded();
    const mutationIntentId = input.recordComboGroupMutationIntent?.(context.customComboGroupName);
    await editPage.selectCustomComboGroupByName(context.customComboGroupName);
    const boundary = await editPage.readCustomComboCardBoundary(
      context.customComboGroupName,
      context.dependencyProductIdentity,
    );

    const result = {
      identity: context.originalIdentity,
      customGroupName: context.customComboGroupName,
      dependencyProductIdentity: context.dependencyProductIdentity,
      itemCreateResponseMethod: created.responseMethod,
      itemCreateResponsePath: created.responsePath,
      itemCreateResponseStatus: created.responseStatus,
      responseMethod: 'N/A',
      responsePath: 'N/A',
      responseStatus: 0,
      mutationCount: 1,
      itemRecordCount: await input.readItemRecordCount(context.originalIdentity),
      customGroupRecordCount: await input.readComboGroupRecordCount(context.customComboGroupName),
      boundary,
    };
    if (mutationIntentId) input.markComboGroupMutationVerified?.(mutationIntentId);
    return { ...result, ...(mutationIntentId ? { mutationIntentId } : {}) };
  }

  private async registerUnexpectedResidue(
    context: ProductCenterItemCreateContext,
    registerUnexpectedCreated: (responseBody: unknown) => Promise<ProductCenterItemCreateRecord>,
  ): Promise<void> {
    if (await this.itemRecordCount(context.originalIdentity) > 0) {
      await registerUnexpectedCreated(null);
    }
  }

  private async itemRecordCount(identity: string): Promise<number> {
    const body = await this.api.productPage(identity);
    if (!body || typeof body !== 'object') return 0;
    const data = (body as Record<string, unknown>).data;
    if (!data || typeof data !== 'object') return 0;
    const list = (data as Record<string, unknown>).list;
    if (!Array.isArray(list)) return 0;
    return list.filter((item) => {
      if (!item || typeof item !== 'object') return false;
      const basic = (item as Record<string, unknown>).itemBasic;
      return Boolean(basic)
        && typeof basic === 'object'
        && String((basic as Record<string, unknown>).name).replace(/\\_/g, '_') === identity;
    }).length;
  }
}
