import type { Page } from '@playwright/test';
import { ProductCenterLowDependencySopPage } from '../../pages/product-center/product-center-low-dependency-sop.page';
import type { LowDependencySopDefinition } from '../../sop/product-center/product-center-low-dependency-sop.catalog';
import type { LowDependencySeedRecord } from '../../test-data/product-center/sop/product-center-low-dependency-data.factory';
import { step } from '../../utils/step';

type LowDependencySopCase = LowDependencySopDefinition & { action: 'edit' | 'delete' };

export class ProductCenterLowDependencySopFlow {
  private readonly target: ProductCenterLowDependencySopPage;

  constructor(page: Page) {
    this.target = new ProductCenterLowDependencySopPage(page);
  }

  @step('执行低依赖实体 API 前置 UI 编辑正向 SOP')
  async edit(sopCase: LowDependencySopCase, record: LowDependencySeedRecord): Promise<void> {
    await this.target.open(sopCase, record);
    await this.target.editIdentity(sopCase, record);
  }

  @step('执行低依赖实体 API 前置 UI 删除正向 SOP')
  async delete(sopCase: LowDependencySopCase, record: LowDependencySeedRecord): Promise<void> {
    await this.target.open(sopCase, record);
    await this.target.deleteIdentity(sopCase, record);
  }

  @step('验证低依赖实体 UI 编辑终态')
  async verifyEditedUi(sopCase: LowDependencySopCase, record: LowDependencySeedRecord): Promise<void> {
    await this.target.verifyEditedUi(sopCase, record);
  }

  @step('验证低依赖实体 UI 删除终态')
  async verifyDeletedUi(sopCase: LowDependencySopCase, record: LowDependencySeedRecord): Promise<void> {
    await this.target.verifyDeletedUi(sopCase, record);
  }
}