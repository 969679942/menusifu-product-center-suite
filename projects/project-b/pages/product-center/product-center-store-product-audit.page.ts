import type { Locator, Page } from '@playwright/test';
import { step } from '../../utils/step';
import { waitUntil } from '../../utils/wait';

export type StoreProductTextboxContract = {
  index: number;
  placeholder: string;
  ariaLabel: string;
  name: string;
  type: string;
  visible: boolean;
  enabled: boolean;
};

export type StoreProductSearchEvidence = {
  trigger: 'input-change';
  locatorCount: number;
  resultCount: number;
  responseMethod: string;
  responsePath: string;
  responseStatus: number;
};

export type StoreProductSearchDomContract = {
  tagName: string;
  role: string;
  ariaLabel: string;
  title: string;
  testId: string;
  className: string;
  childElements: Array<{
    tagName: string;
    role: string;
    ariaLabel: string;
    title: string;
    testId: string;
    className: string;
  }>;
};

export type StoreProductSearchRequestContract = {
  method: string;
  path: string;
  status: number;
  queryField: string;
  bodyKeys: string[];
};

export class ProductCenterStoreProductAuditPage {
  private readonly textboxes: Locator;
  private readonly rows: Locator;
  private readonly searchInput: Locator;

  constructor(private readonly page: Page) {
    this.textboxes = page.getByRole('textbox');
    this.rows = page.getByRole('row');
    this.searchInput = page.getByPlaceholder('Item Name/Code', { exact: true });
  }

  @step('等待门店商品列表进入可审计终态')
  async waitUntilReady(): Promise<void> {
    await waitUntil(
      async () => ({
        textboxCount: await this.textboxes.count(),
        rowCount: await this.rows.count(),
      }),
      (state) => state.textboxCount > 0 && state.rowCount > 0,
      {
        timeout: 60_000,
        interval: 200,
        message: '门店商品列表未出现可见查询输入框和表格。',
      },
    );
  }

  @step('读取门店商品页可见文本框合同')
  async readTextboxContracts(): Promise<StoreProductTextboxContract[]> {
    const contracts: StoreProductTextboxContract[] = [];
    const count = await this.textboxes.count();
    for (let index = 0; index < count; index += 1) {
      const textbox = this.textboxes.nth(index);
      const visible = await textbox.isVisible().catch(() => false);
      if (!visible) continue;
      contracts.push({
        index,
        placeholder: await textbox.getAttribute('placeholder') ?? '',
        ariaLabel: await textbox.getAttribute('aria-label') ?? '',
        name: await textbox.getAttribute('name') ?? '',
        type: await textbox.getAttribute('type') ?? '',
        visible,
        enabled: await textbox.isEnabled().catch(() => false),
      });
    }
    return contracts;
  }

  @step('读取门店商品列表行数')
  async readRowCount(): Promise<number> {
    return this.rows.count();
  }

  @step('读取门店商品查询框邻近结构合同')
  async readSearchDomContract(): Promise<StoreProductSearchDomContract> {
    return this.searchInput.evaluate((element) => {
      const container = element.parentElement ?? element;
      const readAttributes = (node: Element) => ({
        tagName: node.tagName.toLowerCase(),
        role: node.getAttribute('role') ?? '',
        ariaLabel: node.getAttribute('aria-label') ?? '',
        title: node.getAttribute('title') ?? '',
        testId: node.getAttribute('data-testid') ?? '',
        className: typeof node.className === 'string' ? node.className : '',
      });
      return {
        ...readAttributes(container),
        childElements: Array.from(container.children).map(readAttributes),
      };
    });
  }

  @step('探测门店商品名称查询请求结构')
  async probeSearchRequestContract(): Promise<StoreProductSearchRequestContract> {
    const probeValue = 'STORE_PRODUCT_AUDIT_PROBE';
    const responsePromise = this.page.waitForResponse((response) => {
      const request = response.request();
      if (
        request.method() !== 'POST'
        || normalizedOperationPath(response.url()) !== '/ops-poi/poi-items/pageQuery'
      ) return false;
      return request.postData()?.includes(probeValue) === true;
    }, { timeout: 60_000 });
    await this.searchInput.fill(probeValue);
    const response = await responsePromise;
    const body = response.request().postDataJSON() as unknown;
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      throw new Error('门店商品名称查询请求体不是对象');
    }
    const entries = Object.entries(body as Record<string, unknown>);
    const queryField = findJsonValuePath(body, probeValue);
    if (!queryField) throw new Error('门店商品名称查询请求未暴露可验证的查询字段');
    await this.clearSearch();
    return {
      method: response.request().method(),
      path: normalizedOperationPath(response.url()),
      status: response.status(),
      queryField,
      bodyKeys: entries.map(([key]) => key).sort(),
    };
  }

  @step('按门店商品名称片段查询并核对完整商品名称')
  async searchByName(
    searchFragment: string,
    expectedIdentity: string,
  ): Promise<StoreProductSearchEvidence> {
    const locatorCount = await this.searchInput.count();
    if (locatorCount !== 1 || !(await this.searchInput.isVisible())) {
      throw new Error(`门店商品名称查询输入框不唯一：${locatorCount}`);
    }
    const responsePromise = this.page.waitForResponse((response) => {
      const operationPath = normalizedOperationPath(response.url());
      return response.request().method() === 'POST'
        && operationPath === '/ops-poi/poi-items/pageQuery';
    }, { timeout: 60_000 });
    await this.searchInput.fill(searchFragment);
    const response = await responsePromise;
    const result = this.page.getByText(expectedIdentity, { exact: true });
    const resultCount = await waitUntil(
      () => result.count(),
      (count) => count === 1,
      {
        timeout: 60_000,
        interval: 200,
        message: `门店商品名称查询未唯一命中：${expectedIdentity}`,
      },
    );
    return {
      trigger: 'input-change',
      locatorCount,
      resultCount,
      responseMethod: response.request().method(),
      responsePath: normalizedOperationPath(response.url()),
      responseStatus: response.status(),
    };
  }

  @step('清空门店商品名称查询条件')
  async clearSearch(): Promise<void> {
    await this.searchInput.fill('');
    await waitUntil(
      () => this.searchInput.inputValue(),
      (value) => value === '',
      { timeout: 10_000, interval: 100, message: '门店商品名称查询条件未清空。' },
    );
  }
}

function normalizedOperationPath(url: string): string {
  const pathname = new URL(url).pathname;
  const operationIndex = pathname.indexOf('/ops-');
  return operationIndex < 0 ? pathname : pathname.slice(operationIndex);
}

function findJsonValuePath(
  value: unknown,
  expected: string,
  segments: string[] = [],
): string | undefined {
  if (value === expected) return segments.join('.');
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      const match = findJsonValuePath(value[index], expected, [...segments, String(index)]);
      if (match) return match;
    }
    return undefined;
  }
  if (!value || typeof value !== 'object') return undefined;
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    const match = findJsonValuePath(child, expected, [...segments, key]);
    if (match) return match;
  }
  return undefined;
}
