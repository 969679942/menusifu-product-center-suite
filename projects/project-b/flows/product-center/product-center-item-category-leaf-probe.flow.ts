import type { Page, Request } from '@playwright/test';
import { ItemCreateFlow } from '../item-create.flow';
import { ProductCenterItemCategoryLeafProbePage } from '../../pages/product-center/product-center-item-category-leaf-probe.page';
import { step } from '../../utils/step';
import { isProductCenterCategoryProbeMutationRequest } from '../../utils/product-center-item-category-leaf-runtime';

type MutationTracker = {
  listener: (request: Request) => void;
  paths: string[];
};

const mutationTrackers = new WeakMap<Page, MutationTracker>();

export class ProductCenterItemCategoryLeafProbeFlow {
  private readonly probePage: ProductCenterItemCategoryLeafProbePage;

  constructor(private readonly page: Page) {
    this.probePage = new ProductCenterItemCategoryLeafProbePage(page);
  }

  @step('从当前商品列表进入标准商品创建页并等待分类数据加载')
  async openStandardCreateFromCurrentList(): Promise<{
    responseMethod: string;
    responsePath: string;
    responseStatus: number;
    categoryRequestCompleted: boolean;
    arrivedPath: string;
  }> {
    startMutationTracking(this.page);
    const categoryResponse = this.page.waitForResponse(
      (response) => /brand-categories\/treeList/.test(response.url())
        && response.status() >= 200
        && response.status() < 300,
      { timeout: 30_000 },
    );
    await new ItemCreateFlow().openStandardCreateFromCurrentList(this.page);
    const response = await categoryResponse;
    return {
      responseMethod: response.request().method(),
      responsePath: new URL(response.url()).pathname,
      responseStatus: response.status(),
      categoryRequestCompleted: true,
      arrivedPath: new URL(this.page.url()).pathname,
    };
  }

  @step('打开商品分类级联菜单')
  async openCategoryCascader() {
    return this.probePage.openCategoryCascader();
  }

  @step('验证一级分类展开二级分类但不提交已选值')
  async selectParentWithChildren(parentName: string, leafName: string) {
    return this.probePage.selectParentWithChildren(parentName, leafName);
  }

  @step('选择二级分类并停止只读写请求监控')
  async selectLeaf(parentName: string, leafName: string) {
    const result = await this.probePage.selectLeaf(parentName, leafName);
    const mutationPaths = stopProductCenterItemCategoryLeafMutationTracking(this.page);
    return {
      ...result,
      mutationAttempted: mutationPaths.length > 0,
      mutationRequestCount: mutationPaths.length,
      mutationPaths,
    };
  }
}

export function stopProductCenterItemCategoryLeafMutationTracking(page: Page): string[] {
  const tracker = mutationTrackers.get(page);
  if (!tracker) return [];
  page.off('request', tracker.listener);
  mutationTrackers.delete(page);
  return [...tracker.paths];
}

function startMutationTracking(page: Page): void {
  stopProductCenterItemCategoryLeafMutationTracking(page);
  const paths: string[] = [];
  const listener = (request: Request) => {
    if (!isProductCenterCategoryProbeMutationRequest(request.method(), request.url())) return;
    paths.push(`${request.method()} ${new URL(request.url()).pathname}`);
  };
  page.on('request', listener);
  mutationTrackers.set(page, { listener, paths });
}
