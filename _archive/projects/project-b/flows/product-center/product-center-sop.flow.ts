import type { Page } from '@playwright/test';
import { ProductCenterSopPage } from '../../pages/product-center/product-center-sop.page';
import type { ProductCenterSopCase } from '../../sop/product-center/product-center-sop.types';
import type { ProductCenterSopSeedRecord } from '../../test-data/product-center/sop/product-center-sop-data.factory';
import { step } from '../../utils/step';

export class ProductCenterSopFlow {
  private readonly target: ProductCenterSopPage;

  constructor(page: Page) {
    this.target = new ProductCenterSopPage(page);
  }

  @step('执行 API 前置数据的 UI 编辑正向 SOP')
  async edit(sopCase: ProductCenterSopCase, record: ProductCenterSopSeedRecord): Promise<void> {
    await this.target.open(sopCase, record);
    await this.target.editIdentity(sopCase, record);
  }

  @step('执行 API 前置数据的 UI 删除正向 SOP')
  async delete(sopCase: ProductCenterSopCase, record: ProductCenterSopSeedRecord): Promise<void> {
    await this.target.open(sopCase, record);
    await this.target.deleteIdentity(sopCase, record);
  }

  @step('验证 UI 编辑终态')
  async verifyEditedUi(sopCase: ProductCenterSopCase, record: ProductCenterSopSeedRecord): Promise<void> {
    await this.target.verifyEditedUi(sopCase, record);
  }

  @step('验证 UI 删除终态')
  async verifyDeletedUi(sopCase: ProductCenterSopCase, record: ProductCenterSopSeedRecord): Promise<void> {
    await this.target.verifyDeletedUi(sopCase, record);
  }
}
