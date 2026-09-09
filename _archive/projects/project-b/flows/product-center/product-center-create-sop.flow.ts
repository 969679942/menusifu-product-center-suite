import type { Page } from '@playwright/test';
import { ProductCenterCreateSopPage } from '../../pages/product-center/product-center-create-sop.page';
import type { ProductCenterCreateSopDefinition } from '../../sop/product-center/product-center-create-sop.catalog';
import type { ProductCenterCreateContext } from '../../test-data/product-center/sop/product-center-create-data.factory';
import type { ProductCenterSopSeedRecord } from '../../test-data/product-center/sop/product-center-sop-data.factory';
import { step } from '../../utils/step';

export class ProductCenterCreateSopFlow {
  private readonly target: ProductCenterCreateSopPage;

  constructor(page: Page) {
    this.target = new ProductCenterCreateSopPage(page);
  }

  @step('执行商品中心 UI 创建正向 SOP')
  async create(definition: ProductCenterCreateSopDefinition, context: ProductCenterCreateContext): Promise<void> {
    await this.target.create(definition, context);
  }

  @step('验证商品中心 UI 创建终态')
  async verifyCreatedUi(definition: ProductCenterCreateSopDefinition, record: ProductCenterSopSeedRecord): Promise<void> {
    await this.target.verifyCreatedUi(definition, record);
  }
}
