import type { Locator, Page, Request } from '@playwright/test';
import { settleInput } from '../../utils/input-settle';
import { step } from '../../utils/step';
import { waitUntil } from '../../utils/wait';

const standardCreateRoute = '/pp/brand/create/standard';
const standardCreateRequest = /\/ops-brand\/brand-items\/standard/;

export type ProductCenterItemRequiredValidationUiResult = {
  route: string;
  requiredErrorCount: number;
  successMessageCount: number;
  mutationCount: number;
  nameInputCount: number;
};

export class ProductCenterItemRequiredValidationPage {
  private readonly main: Locator;
  private readonly addItemButton: Locator;
  private readonly typePageHeading: Locator;
  private readonly standardProductCard: Locator;
  private readonly standardProductCreateLink: Locator;
  private readonly basicInfoHeading: Locator;
  private readonly itemNameInput: Locator;
  private readonly singleSpecRadio: Locator;
  private readonly standardPriceInput: Locator;
  private readonly saveButton: Locator;
  private readonly requiredError: Locator;
  private readonly successMessage: Locator;

  constructor(private readonly page: Page) {
    this.main = page.locator('main:visible');
    this.addItemButton = this.main.getByRole('button', { name: 'plus Add Item', exact: true });
    this.typePageHeading = page.getByRole('heading', { name: 'Select Product Type', exact: true });
    this.standardProductCard = page.locator('[class^="card___"]:visible').filter({
      has: page.getByText('Standard Product', { exact: true }),
    });
    this.standardProductCreateLink = this.standardProductCard.getByText('Create', { exact: true });
    this.basicInfoHeading = page.getByRole('heading', { name: 'Basic Info', level: 2, exact: true });
    this.itemNameInput = page.locator('#section-base input[aria-required="true"]:visible');
    this.singleSpecRadio = page.getByRole('radio', {
      name: 'Single Recommended for single item',
      exact: true,
    });
    this.standardPriceInput = page.getByPlaceholder('Price(Required)', { exact: true });
    this.saveButton = page.getByRole('button', { name: 'Save', exact: true });
    this.requiredError = page.getByText('Please enter product name', { exact: true });
    this.successMessage = page.locator('.ant-message-notice-success:visible');
  }

  @step('执行标准商品名称缺失保存并采集可见终态')
  async attemptCreateWithoutRequiredName(): Promise<ProductCenterItemRequiredValidationUiResult> {
    let mutationCount = 0;
    const countMutation = (request: Request) => {
      if (request.method() === 'POST' && standardCreateRequest.test(request.url())) mutationCount += 1;
    };
    this.page.on('request', countMutation);
    try {
      await this.openStandardCreateFromList();
      await this.expectUniqueVisibleNameInput();
      await this.singleSpecRadio.click();
      await this.standardPriceInput.fill('10.00');
      await settleInput();
      await this.saveButton.click();
      await waitUntil(
        () => this.requiredError.count(),
        (count) => count === 1,
        { timeout: 10_000, interval: 100, message: '商品名称必填提示未唯一可见' },
      );
      return {
        route: new URL(this.page.url()).pathname,
        requiredErrorCount: await this.requiredError.count(),
        successMessageCount: await this.successMessage.count(),
        mutationCount,
        nameInputCount: await this.itemNameInput.count(),
      };
    } finally {
      this.page.off('request', countMutation);
    }
  }

  @step('从商品列表进入标准商品创建页')
  private async openStandardCreateFromList(): Promise<void> {
    await this.addItemButton.click();
    await this.typePageHeading.waitFor({ state: 'visible', timeout: 10_000 });
    await this.standardProductCreateLink.click();
    await this.basicInfoHeading.waitFor({ state: 'visible', timeout: 30_000 });
    await waitUntil(
      () => new URL(this.page.url()).pathname,
      (route) => route === standardCreateRoute,
      { timeout: 10_000, interval: 100, message: '未进入标准商品创建页' },
    );
  }

  @step('验证商品名称必填输入框唯一可见')
  private async expectUniqueVisibleNameInput(): Promise<void> {
    const count = await this.itemNameInput.count();
    if (count !== 1) throw new Error(`商品名称必填输入框必须唯一可见，实际数量：${count}`);
  }
}
