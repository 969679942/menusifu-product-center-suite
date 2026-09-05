import type { Page } from '@playwright/test';
import { ItemCreateFlow } from '../item-create.flow';
import { createItemListPage } from '../../pages/product-management/item/item-list.page';
import type {
  ProductCenterItemCreateContext,
  ProductCenterItemCreateRecord,
} from '../../test-data/product-center/product-center-item-create-data.factory';
import { step } from '../../utils/step';
import { matchesProductCenterApiOperation } from '../../automation/recipe/product-center-gold-run-optimization';

export type ProductCenterItemStandardCreateResult = {
  name: string;
  specification: 'single';
  price: string;
  minimumOrderQuantity: string;
  priceBeforeSave: string;
  packagingFee?: string;
  packagingFeeBeforeSave?: string;
  cost?: string;
  costBeforeSave?: string;
  responseMethod: string;
  responsePath: string;
  responseStatus: number;
  successMessageCount: number;
  locatorCount?: number;
  listPrice?: number;
  apiRecordCount?: number;
  apiPrice?: number;
};

export type ProductCenterItemStandardCreateInput = {
  context: ProductCenterItemCreateContext;
  specification: 'single';
  price: string;
  minimumOrderQuantity: string;
  packagingFee?: string;
  cost?: string;
  beforeSubmit?: () => Promise<void>;
};

export class ProductCenterItemStandardCreateFlow {
  constructor(private readonly page: Page) {}

  @step('按参数从当前商品列表创建标准商品')
  async create(
    input: ProductCenterItemStandardCreateInput,
    registerCreated: (responseBody: unknown) => Promise<ProductCenterItemCreateRecord>,
  ): Promise<ProductCenterItemStandardCreateResult> {
    const { context, specification, price, minimumOrderQuantity, packagingFee, cost, beforeSubmit } = input;
    const formPage = await new ItemCreateFlow().openStandardCreateFromList(this.page);
    await formPage.fillItemName(context.originalIdentity);
    if (specification === 'single') await formPage.selectSingleSpec();
    await formPage.clickAdvancedSettings();
    await formPage.expectAdvancedSettingsFieldsVisible();
    await formPage.fillMinimumOrderQuantity(minimumOrderQuantity);
    await formPage.fillStandardPrice(price);
    if (packagingFee !== undefined) await formPage.fillPackagingFee(packagingFee);
    if (cost !== undefined) await formPage.fillCost(cost);
    const priceBeforeSave = await formPage.readStandardPriceValue();
    const packagingFeeBeforeSave = packagingFee === undefined ? undefined : await formPage.readPackagingFeeValue();
    const costBeforeSave = cost === undefined ? undefined : await formPage.readCostValue();

    const responsePromise = this.page.waitForResponse((response) => matchesProductCenterApiOperation({
      method: response.request().method(),
      url: response.url(),
    }, {
      method: 'POST',
      pathSuffix: '/ops-brand/brand-items/standard',
    }),
    { timeout: 60_000 });
    const successPromise = formPage.waitForSuccessMessage();
    await beforeSubmit?.();
    await formPage.clickSave();
    const response = await responsePromise;
    const responseBody = await response.json().catch(() => null);
    await registerCreated(responseBody);
    const successMessageCount = await successPromise;

    return {
      name: context.originalIdentity,
      specification,
      price,
      minimumOrderQuantity,
      priceBeforeSave,
      packagingFee,
      packagingFeeBeforeSave,
      cost,
      costBeforeSave,
      responseMethod: response.request().method(),
      responsePath: new URL(response.url()).pathname,
      responseStatus: response.status(),
      successMessageCount,
    };
  }

  @step('验证单规格标准商品在列表中唯一展示且价格正确')
  async verifyUi(result: ProductCenterItemStandardCreateResult): Promise<void> {
    if (
      result.responseMethod !== 'POST'
      || !result.responsePath.endsWith('/ops-brand/brand-items/standard')
      || result.responseStatus < 200
      || result.responseStatus >= 300
      || result.successMessageCount !== 1
    ) {
      throw new Error('单规格标准商品创建未获得成功请求与可见成功提示');
    }
    const listPage = createItemListPage(this.page);
    await listPage.expectLoaded();
    await listPage.fillSearch(result.name);
    await listPage.expectUniqueItemVisible(result.name);
    const priceText = await listPage.readItemPriceText(result.name);
    const listPrice = normalizePrice(priceText);
    const expectedPrice = Number(result.price);
    if (listPrice !== expectedPrice) {
      throw new Error(`单规格标准商品列表价格不为 ${result.price}：${priceText}`);
    }
    result.locatorCount = 1;
    result.listPrice = listPrice;
  }
}

function normalizePrice(value: string): number {
  const normalized = value.replace(/[^0-9.-]/g, '');
  return normalized === '' ? Number.NaN : Number(normalized);
}
