import type { Page } from '@playwright/test';
import { ProductCenterHighDependencySopPage } from '../../pages/product-center/product-center-high-dependency-sop.page';
import type { HighDependencySopDefinition } from '../../sop/product-center/product-center-high-dependency-sop.catalog';
import type { HighDependencySeedRecord } from '../../test-data/product-center/sop/product-center-high-dependency-data.factory';
import { step } from '../../utils/step';

type HighDependencySopCase = HighDependencySopDefinition & { action: 'edit' | 'delete' };
export class ProductCenterHighDependencySopFlow {
  private readonly target: ProductCenterHighDependencySopPage;
  constructor(page: Page) { this.target = new ProductCenterHighDependencySopPage(page); }
  @step('执行高依赖实体 API 前置 UI 编辑正向 SOP') async edit(sopCase: HighDependencySopCase, record: HighDependencySeedRecord): Promise<void> { await this.target.open(sopCase, record); await this.target.editIdentity(sopCase, record); }
  @step('执行高依赖实体 API 前置 UI 删除正向 SOP') async delete(sopCase: HighDependencySopCase, record: HighDependencySeedRecord): Promise<void> { await this.target.open(sopCase, record); await this.target.deleteIdentity(sopCase, record); }
  @step('验证高依赖实体 UI 编辑终态') async verifyEditedUi(sopCase: HighDependencySopCase, record: HighDependencySeedRecord): Promise<void> { await this.target.verifyEditedUi(sopCase, record); }
  @step('验证高依赖实体 UI 删除终态') async verifyDeletedUi(sopCase: HighDependencySopCase, record: HighDependencySeedRecord): Promise<void> { await this.target.verifyDeletedUi(sopCase, record); }
}