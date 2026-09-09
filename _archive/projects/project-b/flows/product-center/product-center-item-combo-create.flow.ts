import type { Page } from '@playwright/test';
import { matchesProductCenterApiOperation } from '../../automation/recipe/product-center-gold-run-optimization';
import type {
  ProductCenterItemCreateContext,
  ProductCenterItemCreateRecord,
} from '../../test-data/product-center/product-center-item-create-data.factory';
import { createItemListPage } from '../../pages/product-management/item/item-list.page';
import { ItemCreateFlow } from '../item-create.flow';
import { step } from '../../utils/step';

export type ProductCenterItemComboCreateResult = {
  name: string;
  price: string;
  minimumOrderQuantity: string;
  valueBeforeSave: string;
  comboGroupName: string;
  responseMethod: string;
  responsePath: string;
  responseStatus: number;
  successMessageCount: number;
  locatorCount?: number;
  listPrice?: number;
  apiRecordCount?: number;
  apiPrice?: number;
};

export type ProductCenterItemComboCreateInput = {
  context: ProductCenterItemCreateContext;
  price: string;
  minimumOrderQuantity: string;
  comboGroupName: string;
  beforeSubmit?: () => Promise<void> | void;
};

export class ProductCenterItemComboCreateFlow {
  constructor(private readonly page: Page) {}

  @step('从当前商品列表仅填写必填项创建套餐商品')
  async create(
    input: ProductCenterItemComboCreateInput,
    registerCreated: (responseBody: unknown) => Promise<ProductCenterItemCreateRecord>,
  ): Promise<ProductCenterItemComboCreateResult> {
    const { context, price, minimumOrderQuantity, comboGroupName } = input;
    const formPage = await new ItemCreateFlow().openComboCreateFromList(this.page);
    await formPage.fillItemName(context.originalIdentity);
    await formPage.clickAdvancedSettings();
    await formPage.fillMinimumOrderQuantity(minimumOrderQuantity);
    await formPage.addFixedComboGroupByName(comboGroupName);
    await formPage.fillStandardPrice(price);
    const valueBeforeSave = await formPage.readMinimumOrderQuantityValue();

    const responsePromise = this.page.waitForResponse((response) => matchesProductCenterApiOperation({
      method: response.request().method(),
      url: response.url(),
    }, {
      method: 'POST',
      pathSuffix: '/ops-brand/brand-items/combo',
    }), { timeout: 60_000 });
    const successPromise = formPage.waitForSuccessMessage();
    await input.beforeSubmit?.();
    await formPage.clickSave();
    const response = await responsePromise;
    const responseBody = await response.json().catch(() => null);
    await registerCreated(responseBody);
    const successMessageCount = await successPromise;

    return {
      name: context.originalIdentity,
      price,
      minimumOrderQuantity,
      valueBeforeSave,
      comboGroupName,
      responseMethod: response.request().method(),
      responsePath: new URL(response.url()).pathname,
      responseStatus: response.status(),
      successMessageCount,
    };
  }

  @step('验证仅必填套餐商品在列表中唯一展示')
  async verifyUi(result: ProductCenterItemComboCreateResult): Promise<void> {
    if (
      result.responseMethod !== 'POST'
      || !result.responsePath.endsWith('/ops-brand/brand-items/combo')
      || result.responseStatus < 200
      || result.responseStatus >= 300
      || result.successMessageCount !== 1
    ) {
      throw new Error('仅必填套餐商品创建未获得成功请求与可见成功提示');
    }
    const listPage = createItemListPage(this.page);
    await listPage.expectLoaded();
    await listPage.fillSearch(result.name);
    await listPage.expectUniqueItemVisible(result.name);
    const priceText = await listPage.readItemPriceText(result.name);
    const listPrice = normalizePrice(priceText);
    if (listPrice !== 10) throw new Error(`仅必填套餐商品列表价格不为 10.00：${priceText}`);
    result.locatorCount = 1;
    result.listPrice = listPrice;
  }
}

function normalizePrice(value: string): number {
  const normalized = value.replace(/[^0-9.-]/g, '');
  return normalized === '' ? Number.NaN : Number(normalized);
}
