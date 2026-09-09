import type { Locator, Page } from '@playwright/test';
import { matchesCategoryNodeIdentity } from '../../utils/category-node-identity';
import { step } from '../../utils/step';
import { waitUntil } from '../../utils/wait';
import type {
  ProductCenterCategoryLeafSelectionResult,
  ProductCenterCategoryParentSelectionResult,
} from '../../utils/product-center-item-category-leaf-runtime';

export class ProductCenterItemCategoryLeafProbePage {
  private readonly categoryField: Locator;
  private readonly categoryCascader: Locator;
  private readonly categorySelectedValue: Locator;
  private readonly visibleCategoryMenus: Locator;

  constructor(private readonly page: Page) {
    this.categoryField = page.locator('#category');
    this.categoryCascader = this.categoryField.locator('.custom-cascader');
    this.categorySelectedValue = this.categoryField.locator('[class^="cascaderText___"]');
    this.visibleCategoryMenus = page.locator('ul.ant-cascader-menu:visible');
  }

  @step('打开商品分类级联菜单并验证控件唯一')
  async openCategoryCascader(): Promise<{
    fieldLocatorCount: number;
    cascaderLocatorCount: number;
    visibleMenuCount: number;
  }> {
    const fieldLocatorCount = await this.categoryField.count();
    const cascaderLocatorCount = await this.categoryCascader.count();
    if (fieldLocatorCount !== 1 || cascaderLocatorCount !== 1) {
      throw new Error(`商品分类控件不唯一：field=${fieldLocatorCount};cascader=${cascaderLocatorCount}`);
    }
    await this.categoryCascader.click({ timeout: 10_000 });
    const visibleMenuCount = await waitUntil(
      () => this.visibleCategoryMenus.count(),
      (count) => count === 1,
      { timeout: 10_000, interval: 100, message: '商品分类一级菜单未唯一显示' },
    );
    return { fieldLocatorCount, cascaderLocatorCount, visibleMenuCount };
  }

  @step('点击有子级的一级分类：{parentName}')
  async selectParentWithChildren(
    parentName: string,
    leafName: string,
  ): Promise<ProductCenterCategoryParentSelectionResult> {
    const parent = await this.requireUniqueNode(parentName, true);
    const selectedValueBefore = await this.readSelectedValue();
    await parent.click({ force: true, timeout: 10_000 });
    const state = await waitUntil(
      async () => ({
        visibleMenuCount: await this.visibleCategoryMenus.count(),
        leaf: await this.readNodeState(leafName),
      }),
      (value) => value.visibleMenuCount === 2
        && value.leaf.locatorCount === 1
        && value.leaf.visible,
      { timeout: 10_000, interval: 100, message: `一级分类 ${parentName} 的二级菜单未唯一展开` },
    );
    const selectedValueAfter = await this.readSelectedValue();
    return {
      parentName,
      locatorCount: 1,
      visibleMenuCount: state.visibleMenuCount,
      selectedValueBefore,
      selectedValueAfter,
      childVisible: state.leaf.visible,
    };
  }

  @step('点击二级分类：{leafName}')
  async selectLeaf(
    parentName: string,
    leafName: string,
  ): Promise<Omit<ProductCenterCategoryLeafSelectionResult, 'mutationAttempted'>> {
    const leaf = await this.requireUniqueNode(leafName, false);
    await leaf.click({ force: true, timeout: 10_000 });
    const settled = await waitUntil(
      async () => ({
        selectedPath: await this.readSelectedValue(),
        visibleMenuCount: await this.visibleCategoryMenus.count(),
      }),
      (value) => value.selectedPath.includes(parentName)
        && value.selectedPath.includes(leafName)
        && value.visibleMenuCount === 0,
      { timeout: 10_000, interval: 100, message: `二级分类 ${leafName} 未提交到商品分类字段` },
    );
    return {
      parentName,
      leafName,
      locatorCount: 1,
      selectedPath: settled.selectedPath,
      menuClosed: settled.visibleMenuCount === 0,
    };
  }

  private categoryNode(name: string): Locator {
    return this.page.getByRole('menuitemcheckbox').filter({ hasText: name });
  }

  private async requireUniqueNode(name: string, mustHaveChildren: boolean): Promise<Locator> {
    const node = this.categoryNode(name);
    const state = await this.readNodeState(name);
    if (state.locatorCount !== 1 || !state.visible || !matchesCategoryNodeIdentity(state.text, name)) {
      throw new Error(`分类节点未按业务身份唯一显示：${name};count=${state.locatorCount}`);
    }
    const childIndicatorCount = await node.getByRole('img', { name: 'right' }).count();
    if ((mustHaveChildren && childIndicatorCount !== 1)
      || (!mustHaveChildren && childIndicatorCount !== 0)) {
      throw new Error(`分类节点层级与预期不一致：${name};childIndicator=${childIndicatorCount}`);
    }
    return node;
  }

  private async readNodeState(name: string): Promise<{
    locatorCount: number;
    visible: boolean;
    text: string;
  }> {
    const node = this.categoryNode(name);
    const locatorCount = await node.count();
    if (locatorCount !== 1) return { locatorCount, visible: false, text: '' };
    return {
      locatorCount,
      visible: await node.isVisible(),
      text: (await node.innerText()).trim(),
    };
  }

  private async readSelectedValue(): Promise<string> {
    const count = await this.categorySelectedValue.count();
    if (count !== 1) throw new Error(`商品分类已选值容器不唯一：${count}`);
    return (await this.categorySelectedValue.innerText()).trim();
  }
}
