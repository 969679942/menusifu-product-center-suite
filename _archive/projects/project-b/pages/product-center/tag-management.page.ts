import type { Locator, Page } from '@playwright/test';
import { settleInput } from '../../utils/input-settle';
import { step } from '../../utils/step';
import { waitUntil } from '../../utils/wait';

export type TagKind = 'description' | 'statistic' | 'badge';
export type BadgeShape = 'foldedCorner' | 'pillShape';
export type TagUiLocale = 'en-US' | 'zh-CN';

export type TagCreateSubmission = {
  status: number;
  ok: boolean;
  body: unknown;
  requestBody: unknown;
};

export type TagEditSubmission = TagCreateSubmission;

const tagRoutes = {
  description: { path: '/pp/brand/tag/description', responsePath: '/ops-brand/brand-tags/page' },
  statistic: { path: '/pp/brand/tag/statistic', responsePath: '/ops-brand/brand-tags/page' },
  badge: { path: '/pp/brand/tag/badge', responsePath: '/ops-brand/brand-tags/corner/page' },
} as const;

export class TagManagementPage {
  readonly main: Locator;
  readonly visibleDialog: Locator;
  private readonly tagNameInput: Locator;
  private readonly tagSecondNameInput: Locator;
  private readonly groupCombobox: Locator;
  private readonly validityStartInput: Locator;
  private readonly validityEndInput: Locator;
  private readonly visibleFeedback: Locator;
  private readonly rows: Locator;

  constructor(private readonly page: Page) {
    this.main = page.locator('main:visible');
    this.visibleDialog = page.locator('[role="dialog"]:visible');
    this.tagNameInput = this.visibleDialog.locator('input[type="text"][maxlength="20"]');
    this.tagSecondNameInput = this.visibleDialog.locator('input[type="text"][maxlength="50"]');
    this.groupCombobox = this.visibleDialog.getByRole('combobox');
    this.validityStartInput = this.visibleDialog.locator('input[date-range="start"]');
    this.validityEndInput = this.visibleDialog.locator('input[date-range="end"]');
    this.visibleFeedback = page.locator([
      '.ant-message-notice-content:visible',
      '.ant-notification-notice-description:visible',
      '.ant-form-item-explain-error:visible',
    ].join(', '));
    this.rows = this.main.locator('tbody tr:visible');
  }

  @step('打开标签列表：{kind}')
  async open(kind: TagKind): Promise<void> {
    const route = tagRoutes[kind];
    const response = this.page.waitForResponse((candidate) => (
      candidate.ok() && new URL(candidate.url()).pathname.endsWith(route.responsePath)
    ), { timeout: 60_000 });
    await this.page.goto(route.path, { waitUntil: 'domcontentloaded' });
    await response;
    await waitUntil(() => this.page.locator('.ant-spin-spinning:visible').count(), (count) => count === 0, {
      timeout: 30_000,
      message: `${kind} 标签列表加载未结束`,
    });
  }

  @step('打开新建标签弹窗：{kind}')
  async openCreate(kind: TagKind, locale: TagUiLocale = 'en-US'): Promise<void> {
    await this.open(kind);
    const createButton = this.createButton(locale);
    await waitUntil(() => createButton.count(), (count) => count === 1, {
      timeout: 30_000,
      message: `${kind} 标签新增入口未唯一显示`,
    });
    await createButton.click();
    await this.visibleDialog.waitFor({ state: 'visible', timeout: 30_000 });
  }

  @step('填写新标签名称：{name}')
  async fillCreateNames(name: string, secondName = ''): Promise<void> {
    await this.tagNameInput.fill(name);
    if (secondName) await this.tagSecondNameInput.fill(secondName);
  }

  @step('选择标签分组：{groupName}')
  async selectGroup(groupName: string): Promise<void> {
    await this.groupCombobox.click();
    const option = this.page.locator('.ant-select-dropdown:visible').getByText(groupName, { exact: true });
    await waitUntil(() => option.count(), (count) => count === 1, {
      timeout: 30_000,
      message: `标签分组 ${groupName} 未唯一显示`,
    });
    await option.click();
  }

  @step('填写角标有效期：{startDate} 至 {endDate}')
  async fillValidityPeriod(startDate: string, endDate: string): Promise<{ startDate: string; endDate: string }> {
    await this.validityStartInput.fill(startDate);
    await this.validityStartInput.press('Tab');
    await this.validityEndInput.fill(endDate);
    await this.validityEndInput.press('Tab');
    return {
      startDate: await this.validityStartInput.inputValue(),
      endDate: await this.validityEndInput.inputValue(),
    };
  }

  @step('选择角标形状：{shape}')
  async selectBadgeShape(shape: BadgeShape): Promise<void> {
    await this.visibleDialog.locator(`input[name="cornerType"][value="${shape}"]`).check();
  }

  @step('提交新建标签：{kind}')
  async submitCreate(kind: TagKind, locale: TagUiLocale = 'en-US'): Promise<TagCreateSubmission> {
    const endpoint = kind === 'badge' ? '/ops-brand/brand-tags/corner' : '/ops-brand/brand-tags';
    const responsePromise = this.page.waitForResponse((response) => (
      response.request().method() === 'POST'
      && new URL(response.url()).pathname.endsWith(endpoint)
    ), { timeout: 30_000 });
    await settleInput();
    await this.createConfirmButton(locale).click();
    const response = await responsePromise;
    return {
      status: response.status(),
      ok: response.ok(),
      body: await response.json().catch(() => null),
      requestBody: response.request().postDataJSON(),
    };
  }

  @step('读取标签提交反馈')
  async readSubmitFeedback(): Promise<string[]> {
    await waitUntil(() => this.visibleFeedback.count(), (count) => count > 0, {
      timeout: 10_000,
      message: '标签提交后未显示页面反馈',
    });
    return (await this.visibleFeedback.allInnerTexts())
      .map((value) => value.replace(/\s+/g, ' ').trim())
      .filter(Boolean);
  }

  @step('读取标签列表记录：{name}')
  async readTagRow(name: string): Promise<{ cells: string[]; styleText: string }> {
    const row = this.rowByName(name);
    await waitUntil(() => row.count(), (count) => count === 1, {
      timeout: 30_000,
      message: `标签列表记录 ${name} 未唯一显示`,
    });
    const cells = (await row.locator('td').allInnerTexts()).map((value) => value.replace(/\s+/g, ' ').trim());
    return { cells, styleText: cells[2] ?? '' };
  }

  @step('核验标签列表不再显示：{name}')
  async verifyTagAbsent(kind: TagKind, name: string): Promise<{
    observed: true;
    zeroResidue: boolean;
    visibleMatches: number;
    route: string;
  }> {
    await this.open(kind);
    const visibleMatches = await this.rowByName(name).count();
    return {
      observed: true,
      zeroResidue: visibleMatches === 0,
      visibleMatches,
      route: new URL(this.page.url()).pathname,
    };
  }

  @step('核验标签分组选择器不再显示：{groupName}')
  async verifyTagGroupAbsent(
    groupName: string,
    kind: 'description' | 'statistic',
  ): Promise<{
    observed: true;
    zeroResidue: boolean;
    visibleMatches: number;
    route: string;
  }> {
    await this.openCreate(kind);
    await this.groupCombobox.click();
    const dropdown = this.page.locator('.ant-select-dropdown:visible');
    await dropdown.waitFor({ state: 'visible', timeout: 30_000 });
    await settleInput();
    const visibleMatches = await dropdown.getByText(groupName, { exact: true }).count();
    await this.page.keyboard.press('Escape');
    await this.closeDialog();
    return {
      observed: true,
      zeroResidue: visibleMatches === 0,
      visibleMatches,
      route: new URL(this.page.url()).pathname,
    };
  }

  @step('读取首条有关联商品的标签')
  async readFirstRelatedTag(): Promise<{ name: string; relatedCount: number }> {
    const row = this.relatedRows().first();
    await waitUntil(() => row.count(), (count) => count === 1, {
      timeout: 30_000,
      message: '当前标签列表没有关联商品数量大于零的数据',
    });
    const name = (await row.locator('td').nth(0).locator('a').innerText()).trim();
    const relatedCount = Number((await row.locator('td').nth(3).locator('a').innerText()).trim());
    if (!name || !Number.isInteger(relatedCount) || relatedCount <= 0) {
      throw new Error(`标签关联数据无效：${JSON.stringify({ name, relatedCount })}`);
    }
    return { name, relatedCount };
  }

  @step('点击标签名称打开编辑弹窗：{name}')
  async openEdit(name: string): Promise<{ title: string; labelName: string }> {
    await this.rowByName(name).locator('td').nth(0).locator('a').click();
    await this.visibleDialog.waitFor({ state: 'visible', timeout: 30_000 });
    return {
      title: (await this.visibleDialog.getByText('Edit Tag', { exact: true }).innerText()).trim(),
      labelName: await this.visibleDialog.locator('input[type="text"][maxlength="20"]').inputValue(),
    };
  }

  @step('编辑标签名称并提交：{currentName} -> {nextName}')
  async editNameAndSubmit(
    currentName: string,
    nextName: string,
    kind: TagKind,
  ): Promise<TagEditSubmission> {
    await this.openEdit(currentName);
    await this.tagNameInput.fill(nextName);
    const endpoint = kind === 'badge' ? '/ops-brand/brand-tags/corner/' : '/ops-brand/brand-tags/';
    const responsePromise = this.page.waitForResponse((response) => (
      response.request().method() === 'PUT'
      && new URL(response.url()).pathname.includes(endpoint)
    ), { timeout: 30_000 });
    await settleInput();
    await this.visibleDialog.getByRole('button', { name: 'Confirm', exact: true }).click();
    const response = await responsePromise;
    return {
      status: response.status(),
      ok: response.ok(),
      body: await response.json().catch(() => null),
      requestBody: response.request().postDataJSON(),
    };
  }

  @step('关闭当前标签弹窗')
  async closeDialog(): Promise<void> {
    await this.visibleDialog.getByRole('button', { name: 'close', exact: true }).click();
    await this.visibleDialog.waitFor({ state: 'hidden', timeout: 10_000 });
  }

  @step('点击关联商品数量查看引用商品：{name}')
  async openRelatedProducts(name: string): Promise<{ title: string; productNames: string[] }> {
    await this.rowByName(name).locator('td').nth(3).locator('a').click();
    await this.visibleDialog.waitFor({ state: 'visible', timeout: 30_000 });
    const title = (await this.visibleDialog.innerText()).replace(/\s+/g, ' ').trim();
    const productNames = (await this.visibleDialog.locator('tbody tr:visible td:first-child').allInnerTexts())
      .map((value) => value.trim())
      .filter(Boolean);
    return { title, productNames };
  }

  private relatedRows(): Locator {
    return this.rows.filter({ has: this.page.locator('td:nth-child(4) a') });
  }

  private createButton(locale: TagUiLocale): Locator {
    return locale === 'zh-CN'
      ? this.page.getByRole('button', { name: 'plus 添加', exact: true })
      : this.page.getByRole('button', { name: 'plus Add', exact: true });
  }

  private createConfirmButton(locale: TagUiLocale): Locator {
    return locale === 'zh-CN'
      ? this.visibleDialog.getByRole('button', { name: '确 定', exact: true })
      : this.visibleDialog.getByRole('button', { name: 'Confirm', exact: true });
  }

  private rowByName(name: string): Locator {
    return this.rows.filter({
      has: this.page.getByText(name, { exact: true }),
    });
  }
}
