import type { Locator, Page } from '@playwright/test';
import { step } from '../../utils/step';
import { waitUntil } from '../../utils/wait';

export class ProductCenterCrudPage {
  readonly main: Locator;
  constructor(private readonly page: Page, readonly route: string) { this.main = page.locator('main:visible,[role=main]:visible').last(); }

  @step('打开商品中心业务页面：{route}')
  async open(route = this.route): Promise<void> {
    await this.page.goto(route, { waitUntil: 'domcontentloaded' });
    await waitUntil(() => new URL(this.page.url()).pathname, (value: string) => value.includes(route), { timeout: 60_000, message: `页面未进入 ${route}` });
    await this.main.waitFor({ state: 'visible', timeout: 30_000 });
    await waitUntil(
      async () => ({
        controls: await this.main.locator('button:visible,a[href]:visible,[role=button]:visible').count(),
        fields: await this.main.locator('input:visible,textarea:visible,select:visible,[role=combobox]:visible').count(),
        terminal: await this.main.locator('table:visible,.ant-empty:visible,.ant-result:visible').count(),
      }),
      state => state.controls + state.fields + state.terminal > 0,
      { timeout: 60_000, message: `页面 ${route} 未进入可验证终态` },
    );
  }

  @step('读取页面可操作控件数量')
  async readActionableControlCount(): Promise<number> {
    return this.main.locator('button:visible,a[href]:visible,[role=button]:visible').count();
  }

  @step('读取页面可见字段数量')
  async readVisibleFieldCount(): Promise<number> {
    return this.main.locator('input:visible,textarea:visible,select:visible,[role=combobox]:visible').count();
  }

  @step('验证页面不存在指定审计数据：{identity}')
  async hasIdentity(identity: string): Promise<boolean> {
    return await this.main.getByText(identity, { exact: false }).count() > 0;
  }
}
