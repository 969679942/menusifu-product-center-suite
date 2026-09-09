import { expect, type Locator, type Page, type Request, type Response } from '@playwright/test';
import { settleInput } from '../../utils/input-settle';
import { step } from '../../utils/step';
import { executeReadOnlyUiWithTransientRetry, waitUntil } from '../../utils/wait';
import { SidebarPage } from '../sidebar.page';

export type StoreIdentityExpectation = {
  storeId: string;
  storeName: string;
};

export type StoreIdentityObservation = StoreIdentityExpectation & {
  visibleStoreName: string;
  requestPoiId: string;
  localStoragePoiId: string;
  localStoragePoiName: string;
};

export class SeasoningBoundaryPage {
  readonly main: Locator;
  private readonly addSeasoningButton: Locator;
  private readonly addSeasoningMenuItem: Locator;
  private readonly industrySeasoningMenuItem: Locator;
  private readonly groupNameInput: Locator;
  private readonly groupSecondLanguageInput: Locator;
  private readonly groupPosNameInput: Locator;
  private readonly optionNameInput: Locator;
  private readonly optionSecondLanguageInput: Locator;
  private readonly priceInput: Locator;
  private readonly confirmButton: Locator;
  private readonly visibleErrors: Locator;
  private readonly recordTaskNameInput: Locator;
  private readonly recordStoreFilter: Locator;
  private readonly recordStatusFilter: Locator;
  private readonly recordResetButton: Locator;
  private readonly recordRows: Locator;
  private readonly templateNameInput: Locator;
  private readonly templateSecondLanguageInput: Locator;
  private readonly templateDescriptionInput: Locator;
  private readonly templateSaveButton: Locator;
  private readonly templateSelectSeasoningButton: Locator;
  private readonly templateSortButton: Locator;
  private readonly seasoningSearchInput: Locator;

  constructor(private readonly page: Page) {
    this.main = page.locator('main:visible');
    this.addSeasoningButton = this.main.getByRole('button', { name: /(?:plus\s+)?(?:Add Seasoning|新增调味)/i });
    this.addSeasoningMenuItem = page.locator('.ant-dropdown:visible').getByRole('menuitem', {
      name: /(?:Add Seasoning|新增调味|自定义)/i,
    });
    this.industrySeasoningMenuItem = page.locator('.ant-dropdown:visible').getByRole('menuitem', {
      name: /^使用行业(?:通用)?调味$/,
    });
    this.groupNameInput = this.main.locator('input[aria-required="true"]:visible');
    this.groupSecondLanguageInput = this.inputFollowingLabel('第二名称');
    this.groupPosNameInput = this.inputFollowingLabel('POS名称');
    this.optionNameInput = this.main.locator(
      'input[placeholder="eg: Sweet"]:visible, input[placeholder="如：Sweet"]:visible',
    );
    this.optionSecondLanguageInput = this.main
      .locator('tr.ant-table-row input[type="text"]:not([placeholder]):visible');
    this.priceInput = this.main.getByRole('spinbutton');
    this.confirmButton = page.getByRole('button', { name: /^(?:Confirm|确\s*定)$/i });
    this.visibleErrors = page.locator('.ant-form-item-explain-error:visible, .ant-message-error:visible');
    this.recordTaskNameInput = this.main.locator('input[placeholder="任务名称"]:visible');
    this.recordStoreFilter = this.recordSelectByLabel('门店');
    this.recordStatusFilter = this.recordSelectByLabel('状态');
    this.recordResetButton = this.main.locator('button[type="reset"]:visible');
    this.recordRows = this.main.locator('tbody.ant-table-tbody > tr.ant-table-row:not([aria-hidden="true"])');
    this.templateNameInput = this.main.locator('input[placeholder="调味模版名称"]:visible');
    this.templateSecondLanguageInput = this.main.locator('input[placeholder="请输入第二语言"]:visible');
    this.templateDescriptionInput = this.main.locator('input[placeholder="模板说明"]:visible');
    this.templateSaveButton = this.main.getByRole('button', { name: /^保\s*存$/ });
    this.templateSelectSeasoningButton = page.locator('button:visible').filter({ hasText: /^选择调味$/ });
    this.templateSortButton = page.locator('button:visible').filter({ hasText: /^组排序$/ });
    this.seasoningSearchInput = this.main.getByPlaceholder('调味名称');
  }

  @step('打开调味模板新增页面')
  async openTemplateCreate(): Promise<void> {
    await this.openTemplateList();
    await this.page.getByRole('button', { name: /新增模版$/ }).click();
    await this.page.waitForURL((url) => url.pathname === '/pp/brand/seasoning/addtemplate');
    await this.expectUniqueVisible(this.templateNameInput, '调味模板名称');
    await this.expectUniqueVisible(this.templateSecondLanguageInput, '调味模板第二语言');
    await this.expectUniqueVisible(this.templateDescriptionInput, '调味模板说明');
    await this.expectUniqueVisible(this.templateSaveButton, '调味模板保存按钮');
    await this.expectUniqueVisibleOnly(this.templateSelectSeasoningButton, '选择调味按钮');
  }

  @step('确保当前已在调味模板列表')
  async ensureTemplateListOpen(expectedTemplateName?: string): Promise<void> {
    if (new URL(this.page.url()).pathname === '/pp/brand/seasoning/template'
      && await this.page.getByRole('button', { name: /新增模版$/ }).isVisible().catch(() => false)
      && (!expectedTemplateName || await this.page.getByText(expectedTemplateName, { exact: true }).isVisible().catch(() => false))) return;
    await this.openTemplateList(expectedTemplateName);
  }

  @step('打开调味模板列表')
  async openTemplateList(expectedTemplateName?: string): Promise<void> {
    await executeReadOnlyUiWithTransientRetry(async () => {
      const response = this.page.waitForResponse((candidate) => candidate.request().method() === 'GET'
        && new URL(candidate.url()).pathname.endsWith('/ops-brand/modifier-template/page')
        && candidate.ok(), { timeout: 30_000 });
      await this.page.goto('/pp/brand/seasoning/template', { waitUntil: 'domcontentloaded' });
      await response;
      await this.page.getByRole('button', { name: /新增模版$/ }).waitFor({ state: 'visible' });
      await waitUntil(
        async () => ({
          loading: await this.page.locator('.ant-spin-spinning:visible').count(),
          expectedVisible: expectedTemplateName
            ? await this.page.getByText(expectedTemplateName, { exact: true }).isVisible().catch(() => false)
            : true,
        }),
        (state) => state.loading === 0 && state.expectedVisible,
        {
          timeout: 30_000,
          interval: 100,
          message: expectedTemplateName
            ? `调味模板列表未展示目标模板：${expectedTemplateName}`
            : '调味模板列表未进入稳定终态',
        },
      );
    });
  }

  @step('读取调味模板新增字段合同')
  async readTemplateCreateFields(): Promise<{ name: string; secondLanguage: string; description: string; selectSeasoningVisible: boolean; sortDisabled: boolean }> {
    return {
      name: await this.templateNameInput.getAttribute('placeholder') || '',
      secondLanguage: await this.templateSecondLanguageInput.getAttribute('placeholder') || '',
      description: await this.templateDescriptionInput.getAttribute('placeholder') || '',
      selectSeasoningVisible: await this.templateSelectSeasoningButton.isVisible(),
      sortDisabled: await this.templateSortButton.isDisabled(),
    };
  }

  @step('提交空调味模板并读取必填校验')
  async submitEmptyTemplate(): Promise<{ invalidText: string; mutationCount: number }> {
    let mutationCount = 0;
    let responseStatus: number | undefined;
    let responseBody: unknown;
    const listener = (request: import('@playwright/test').Request) => {
      if (request.method() === 'POST' && new URL(request.url()).pathname.endsWith('/ops-brand/modifier-template')) mutationCount += 1;
    };
    this.page.on('request', listener);
    try {
      await this.templateSaveButton.click({ force: true });
      await waitUntil(
        async () => this.main.locator('.ant-form-item-explain-error:visible').allInnerTexts(),
        (texts) => texts.some((text) => text.includes('调味模版名称必填')),
        { timeout: 10_000, interval: 100, message: '调味模板空提交未出现必填校验' },
      );
      return {
        invalidText: (await this.main.locator('.ant-form-item-explain-error:visible').allInnerTexts()).join('|'),
        mutationCount,
      };
    } finally {
      this.page.off('request', listener);
    }
  }

  @step('未选择调味组时提交模板并读取必选提示：{templateName}')
  async submitTemplateWithoutSeasoning(templateName: string): Promise<{
    errorText: string;
    mutationCount: number;
    route: string;
  }> {
    if (!templateName.startsWith('AUTO_AUDIT_')) throw new Error(`禁止提交非审计模板：${templateName}`);
    await this.expectUniqueVisible(this.templateNameInput, '调味模板名称');
    await this.templateNameInput.fill(templateName);
    await this.templateNameInput.press('Tab');
    await settleInput();
    let mutationCount = 0;
    const listener = (request: import('@playwright/test').Request): void => {
      if (request.method() === 'POST'
        && new URL(request.url()).pathname.endsWith('/ops-brand/modifier-template')) mutationCount += 1;
    };
    this.page.on('request', listener);
    try {
      await this.templateSaveButton.click({ force: true });
      const errorText = await waitUntil(
        () => this.readFeedbackTexts(),
        (texts) => texts.includes('调味模版至少需要一个调味组'),
        {
          timeout: 10_000,
          interval: 100,
          message: '模板未选择调味组时未出现必选提示',
          observation: {
            channel: 'ui',
            operation: 'read-template-required-feedback',
            caseId: 'TC-FLV-TPL-014',
          },
        },
      );
      return {
        errorText: errorText.find((value) => value === '调味模版至少需要一个调味组') ?? '',
        mutationCount,
        route: new URL(this.page.url()).pathname,
      };
    } finally {
      this.page.off('request', listener);
    }
  }

  @step('填写调味模板字段并保存：{templateName}')
  async saveTemplate(templateName: string, fields: { secondLanguage?: string; description?: string; selectSeasoning?: boolean } = {}): Promise<{ status: number; requestBody: unknown }> {
    if (!templateName.startsWith('AUTO_AUDIT_')) throw new Error(`禁止保存非审计模板：${templateName}`);
    await this.expectUniqueVisible(this.templateNameInput, '调味模板名称');
    await this.templateNameInput.fill(templateName);
    await this.templateNameInput.press('Tab');
    if (fields.secondLanguage !== undefined) await this.templateSecondLanguageInput.fill(fields.secondLanguage);
    if (fields.description !== undefined) await this.templateDescriptionInput.fill(fields.description);
    if (fields.selectSeasoning) {
      await this.templateSelectSeasoningButton.click();
      const dialog = this.page.getByRole('dialog');
      await this.expectUniqueVisibleOnly(dialog, '选择调味弹窗');
      const checkbox = dialog.locator('input[type="checkbox"]:visible:not([aria-label="Select all"])').first();
      await this.expectUniqueVisible(checkbox, '选择调味项');
      await checkbox.check();
      await dialog.getByRole('button', { name: /^确\s*定$/ }).click();
      await dialog.waitFor({ state: 'hidden' });
    }
    await settleInput();
    await waitUntil(
      () => this.templateSaveButton.isEnabled(),
      (enabled) => enabled,
      { timeout: 10_000, interval: 100, message: '调味模板保存按钮未进入可提交状态' },
    );
    const observedRequests: string[] = [];
    const requestListener = (request: import('@playwright/test').Request) => {
      const pathname = new URL(request.url()).pathname;
      if (pathname.includes('/ops-brand/modifier-template')) observedRequests.push(`${request.method()} ${pathname}`);
    };
    this.page.on('request', requestListener);
    try {
      const responseMatcher = (candidate: import('@playwright/test').Response): boolean => candidate.request().method() === 'POST'
        && new URL(candidate.url()).pathname.endsWith('/ops-brand/modifier-template');
      let responsePromise = this.page.waitForResponse(responseMatcher, { timeout: 5_000 });
      await this.templateSaveButton.click();
      let response: import('@playwright/test').Response;
      try {
        response = await responsePromise;
      } catch {
        // Some builds render the header action as a non-submit button. The audited
        // form still accepts Enter from the focused name field, so retry the same
        // user action without replaying a completed mutation.
        responsePromise = this.page.waitForResponse(responseMatcher, { timeout: 30_000 });
        await this.templateNameInput.press('Enter');
        response = await responsePromise;
      }
      return { status: response.status(), requestBody: response.request().postDataJSON() };
    } catch (error) {
      const buttonState = await this.templateSaveButton.evaluate((element) => ({
        outerHTML: element.outerHTML,
        disabled: (element as HTMLButtonElement).disabled,
        type: element.getAttribute('type'),
      })).catch(() => ({ outerHTML: '', disabled: false, type: null }));
      throw new Error(`${error instanceof Error ? error.message : String(error)}; observedTemplateRequests=${observedRequests.join(',')}; buttonState=${JSON.stringify(buttonState)}`);
    } finally {
      this.page.off('request', requestListener);
    }
  }

  @step('填写调味模板名称并读取规范化值：{templateName}')
  async fillTemplateNameAndRead(templateName: string): Promise<string> {
    await this.expectUniqueVisible(this.templateNameInput, '调味模板名称');
    await this.templateNameInput.fill(templateName);
    await this.templateNameInput.press('Tab');
    await this.templateNameInput.press('Tab');
    return this.templateNameInput.inputValue();
  }

  @step('保存调味模板并读取列表中的最终名称：{expectedListName}')
  async saveTemplateAndReadListName(submittedName: string, expectedListName: string, fields: { selectSeasoning?: boolean } = {}): Promise<{ status: number; requestBody: unknown; visibleName: string }> {
    const response = await this.saveTemplate(submittedName, fields);
    await this.openTemplateList(expectedListName);
    const identity = this.page.getByText(expectedListName, { exact: true });
    await this.expectUniqueVisibleOnly(identity, `已保存调味模板 ${expectedListName}`);
    return {
      status: response.status,
      requestBody: response.requestBody,
      visibleName: (await identity.innerText()).trim(),
    };
  }

  @step('编辑调味模板并保存：{templateName}')
  async editTemplate(templateName: string, updatedDescription: string): Promise<{ route: string; status: number; requestBody: unknown; visibleDescription: string }> {
    const { menu } = await this.openTemplateMenu(templateName);
    await menu.getByText('编辑', { exact: true }).click();
    await this.expectUniqueVisible(this.templateDescriptionInput, '调味模板说明');
    await this.templateDescriptionInput.click();
    await this.templateDescriptionInput.press(process.platform === 'darwin' ? 'Meta+A' : 'Control+A');
    await this.templateDescriptionInput.pressSequentially(updatedDescription, { delay: 10 });
    await this.templateDescriptionInput.press('Tab');
    await waitUntil(
      () => this.templateDescriptionInput.inputValue(),
      (value) => value === updatedDescription,
      { timeout: 5_000, interval: 100, message: '调味模板说明未稳定为编辑值' },
    );
    await settleInput();
    const visibleDescription = await this.templateDescriptionInput.inputValue();
    const responsePromise = this.page.waitForResponse((candidate) => candidate.request().method() === 'PUT'
      && /\/item\/v1\/ops-brand\/modifier-template\/\d+$/.test(new URL(candidate.url()).pathname), { timeout: 30_000 });
    await this.templateSaveButton.click();
    const response = await responsePromise;
    return { route: new URL(this.page.url()).pathname, status: response.status(), requestBody: response.request().postDataJSON(), visibleDescription };
  }

  @step((templateName: string, optionName: string, mode: 'add' | 'remove') =>
    `编辑调味模板“${templateName}”中的调味项“${optionName}”：${mode === 'add' ? '新增' : '移除'}`)
  async editTemplateSeasoning(templateName: string, optionName: string, mode: 'add' | 'remove'): Promise<{ status: number; requestBody: unknown; selectedCount: number; templateVisible: true }> {
    const { menu } = await this.openTemplateMenu(templateName);
    await menu.getByText('编辑', { exact: true }).click();
    await this.expectUniqueVisible(this.templateNameInput, '调味模板名称');
    const selectButton = this.templateSelectSeasoningButton;
    await this.expectUniqueVisibleOnly(selectButton, '选择调味按钮');
    const listResponse = this.page.waitForResponse((candidate) => candidate.request().method() === 'GET'
      && new URL(candidate.url()).pathname.endsWith('/ops-brand/global-modifier/list')
      && candidate.ok(), { timeout: 30_000 });
    await selectButton.click();
    await listResponse;
    const dialog = this.page.getByRole('dialog');
    await this.expectUniqueVisibleOnly(dialog, '选择调味弹窗');
    const optionRow = dialog.locator('tr:visible').filter({ hasText: optionName }).first();
    const optionCheckbox = optionRow.locator('input[type="checkbox"]:visible').first();
    await this.expectUniqueVisible(optionCheckbox, `模板编辑目标调味项 ${optionName}`);
    if (mode === 'remove') {
      if (await optionCheckbox.isChecked()) await optionCheckbox.uncheck();
      else throw new Error(`模板编辑弹窗中调味项未处于已选状态：${optionName}`);
    } else {
      if (await optionCheckbox.isChecked()) throw new Error(`模板编辑弹窗中调味项已存在，不能重复新增：${optionName}`);
      await optionCheckbox.check();
    }
    const confirm = dialog.getByRole('button', { name: /^确\s*定$/ });
    await confirm.click();
    await dialog.waitFor({ state: 'hidden' });
    await settleInput();
    const responsePromise = this.page.waitForResponse((candidate) => candidate.request().method() === 'PUT'
      && /\/item\/v1\/ops-brand\/modifier-template\/\d+$/.test(new URL(candidate.url()).pathname), { timeout: 30_000 });
    await this.templateSaveButton.click({ force: true });
    const response = await responsePromise;
    const requestBody = response.request().postDataJSON();
    const selectedCount = Array.isArray((requestBody as { modifierGroups?: unknown[] } | null)?.modifierGroups)
      ? ((requestBody as { modifierGroups: unknown[] }).modifierGroups).reduce<number>((total, group) => {
        const options = (group as { options?: unknown[] } | null)?.options;
        return total + (Array.isArray(options) ? options.length : 0);
      }, 0)
      : 0;
    return { status: response.status(), requestBody, selectedCount, templateVisible: true };
  }

  @step('尝试保存重复调味模板：{templateName}')
  async trySaveDuplicateTemplate(templateName: string): Promise<{ errorText: string; mutationCount: number; responseStatus?: number; responseBody?: unknown }> {
    await this.expectUniqueVisible(this.templateNameInput, '调味模板名称');
    await this.templateNameInput.fill(templateName);
    await this.templateNameInput.press('Tab');
    await this.templateSelectSeasoningButton.click();
    const dialog = this.page.getByRole('dialog');
    await this.expectUniqueVisibleOnly(dialog, '选择调味弹窗');
    const checkbox = dialog.locator('input[type="checkbox"]:visible:not([aria-label="Select all"]):not(:checked)').first();
    await this.expectUniqueVisible(checkbox, '重复模板用例选择调味项');
    await checkbox.check();
    await dialog.getByRole('button', { name: /^确\s*定$/ }).click();
    await settleInput();
    await this.templateNameInput.press('Tab');
    await expect(this.templateSaveButton).toBeEnabled();
    let mutationCount = 0;
    let responseStatus: number | undefined;
    let responseBody: unknown;
    const listener = (request: import('@playwright/test').Request) => {
      if (request.method() === 'POST' && new URL(request.url()).pathname.endsWith('/ops-brand/modifier-template')) mutationCount += 1;
    };
    this.page.on('request', listener);
    try {
      const responsePromise = this.page.waitForResponse((candidate) => candidate.request().method() === 'POST'
        && new URL(candidate.url()).pathname.endsWith('/ops-brand/modifier-template'), { timeout: 15_000 }).catch(() => undefined);
      await this.templateSaveButton.click();
      let errorTexts: string[] = [];
      await waitUntil(
        async () => {
          errorTexts = await this.readFeedbackTexts();
          return errorTexts;
        },
        (texts) => texts.length > 0,
        {
          timeout: 5_000,
          interval: 100,
          message: '重复调味模板保存未产生页面反馈',
          observation: { channel: 'ui', operation: 'read-duplicate-template-feedback' },
        },
      ).catch(() => undefined);
      const response = errorTexts.length > 0 ? undefined : await responsePromise;
      if (response) {
        responseStatus = response.status();
        responseBody = await response.json().catch(() => undefined);
        if (responseStatus >= 400 && errorTexts.length === 0) {
          errorTexts = [typeof responseBody === 'string' ? responseBody : JSON.stringify(responseBody ?? {})];
        }
      }
      if (errorTexts.length === 0 && mutationCount === 0 && responseStatus === undefined) {
        throw new Error('重复调味模板保存未产生请求或页面反馈');
      }
      return { errorText: errorTexts.join('|'), mutationCount, responseStatus, responseBody };
    } finally {
      this.page.off('request', listener);
    }
  }

  @step('打开调味模板操作菜单：{templateName}')
  async openTemplateMenu(templateName: string): Promise<{ menu: Locator; card: Locator }> {
    const identity = this.page.getByText(templateName, { exact: true });
    await this.expectUniqueVisibleOnly(identity, `调味模板 ${templateName}`);
    const card = identity.locator('xpath=ancestor::div[contains(@class,"card")][1]');
    await this.expectUniqueVisibleOnly(card, `调味模板 ${templateName} 卡片`);
    const action = card.locator('button:visible');
    await this.expectUniqueVisibleOnly(action, `调味模板 ${templateName} 操作按钮`);
    await identity.hover();
    await action.click();
    const menu = this.page.locator('.ant-dropdown:visible');
    await this.expectUniqueVisibleOnly(menu, `调味模板 ${templateName} 操作菜单`);
    return { menu, card };
  }

  @step('读取调味模板操作菜单：{templateName}')
  async readTemplateMenu(templateName: string): Promise<string[]> {
    const { menu } = await this.openTemplateMenu(templateName);
    return (await menu.locator('[role="menuitem"]').allInnerTexts()).map((value) => value.trim()).filter(Boolean);
  }

  @step('删除调味模板并读取二次确认：{templateName}')
  async deleteTemplate(templateName: string): Promise<{ confirmText: string; status: number }> {
    const { menu } = await this.openTemplateMenu(templateName);
    await menu.getByText('删除', { exact: true }).click();
    const dialog = this.page.getByRole('dialog');
    await this.expectUniqueVisibleOnly(dialog, '删除调味模板确认弹窗');
    const confirmText = await dialog.innerText();
    const responsePromise = this.page.waitForResponse((candidate) => candidate.request().method() === 'DELETE'
      && /\/item\/v1\/ops-brand\/modifier-template\/\d+$/.test(new URL(candidate.url()).pathname), { timeout: 30_000 });
    await dialog.getByRole('button', { name: /^删\s*除$/ }).click();
    const response = await responsePromise;
    return { confirmText, status: response.status() };
  }

  @step('打开调味模板下发门店弹窗')
  async openTemplateDistribution(): Promise<{ menuItems: string[]; dialogText: string; headers: string[]; confirmDisabled: boolean; merchantRequestObserved: boolean }> {
    const listResponse = this.page.waitForResponse((candidate) => (
      candidate.request().method() === 'GET'
      && new URL(candidate.url()).pathname.endsWith('/ops-brand/modifier-template/page')
      && candidate.ok()
    ), { timeout: 60_000 });
    await this.page.goto('/pp/brand/seasoning/template', { waitUntil: 'domcontentloaded' });
    await listResponse;
    const card = this.page.getByText('NRA', { exact: true }).first();
    await card.waitFor({ state: 'visible' });
    const cardRoot = card.locator('xpath=ancestor::div[contains(@class,"card")][1]');
    const action = cardRoot.locator('button:visible');
    await waitUntil(
      () => action.count(),
      (count) => count === 1,
      { timeout: 10_000, message: 'NRA 调味模板卡片三点按钮不可唯一操作' },
    );
    await card.hover();
    await action.click();
    const menu = this.page.locator('.ant-dropdown:visible');
    const merchantResponse = this.page.waitForResponse((candidate) => (
      candidate.request().method() === 'POST'
      && new URL(candidate.url()).pathname === '/item/v1/ops-brand/merchants/page'
      && candidate.ok()
    ), { timeout: 30_000 });
    const menuItems = await menu.locator('[role="menuitem"]').allInnerTexts();
    await menu.getByText('下发', { exact: true }).click();
    const dialog = this.page.getByRole('dialog');
    await dialog.waitFor({ state: 'visible' });
    const response = await merchantResponse;
    const dialogText = await dialog.innerText();
    const headers = await dialog.locator('thead th').allInnerTexts();
    const confirm = dialog.getByRole('button', { name: /^确\s*定$/ });
    return {
      menuItems,
      dialogText,
      headers: headers.map((value) => value.trim()).filter(Boolean),
      confirmDisabled: await confirm.isDisabled(),
      merchantRequestObserved: response.ok(),
    };
  }

  // system-test-fingerprint:start seasoning-page-distribute-template
  @step((templateName: string, storeId: string, expectedStoreName?: string) =>
    `下发调味模板“${templateName}”到门店“${expectedStoreName?.trim() || '页面读取名称'}”（${storeId}）`)
  async distributeTemplate(templateName: string, storeId: string, expectedStoreName?: string): Promise<{
    status: number;
    requestBody: unknown;
    dialogText: string;
    targetStoreId: string;
    targetStoreName: string;
  }> {
    if (!templateName.startsWith('AUTO_AUDIT_')) throw new Error(`禁止下发非审计模板：${templateName}`);
    const listResponse = this.page.waitForResponse((candidate) => candidate.request().method() === 'GET'
      && new URL(candidate.url()).pathname.endsWith('/ops-brand/modifier-template/page')
      && candidate.ok(), { timeout: 60_000 });
    await this.page.goto('/pp/brand/seasoning/template', { waitUntil: 'domcontentloaded' });
    await listResponse;
    const identity = this.page.getByText(templateName, { exact: true });
    await this.expectUniqueVisibleOnly(identity, `调味模板 ${templateName}`);
    const cardRoot = identity.locator('xpath=ancestor::div[contains(@class,"card")][1]');
    await this.expectUniqueVisibleOnly(cardRoot, `调味模板 ${templateName} 卡片`);
    const action = cardRoot.locator('button:visible');
    await this.expectUniqueVisibleOnly(action, `调味模板 ${templateName} 操作按钮`);
    await identity.hover();
    await action.click();
    const menu = this.page.locator('.ant-dropdown:visible');
    await this.expectUniqueVisibleOnly(menu, `调味模板 ${templateName} 操作菜单`);
    const merchantResponse = this.page.waitForResponse((candidate) => candidate.request().method() === 'POST'
      && new URL(candidate.url()).pathname === '/item/v1/ops-brand/merchants/page'
      && candidate.ok(), { timeout: 30_000 });
    await menu.getByText('下发', { exact: true }).click();
    await merchantResponse;
    const dialog = this.page.getByRole('dialog');
    await this.expectUniqueVisibleOnly(dialog, '下发到门店弹窗');
    const dialogText = await dialog.innerText();
    const row = dialog.locator('tbody tr:visible').filter({ hasText: storeId });
    await this.expectUniqueVisibleOnly(row, `目标门店 ${storeId}`);
    await this.expectUniqueVisibleOnly(row.getByText(storeId, { exact: true }), `目标门店编号 ${storeId}`);
    const cellTexts = (await row.locator('td:visible').allInnerTexts()).map((value) => value.trim());
    const storeIdCellIndex = cellTexts.indexOf(storeId);
    const inferredStoreName = storeIdCellIndex > 0 ? cellTexts[storeIdCellIndex - 1] : '';
    const targetStoreName = expectedStoreName?.trim() || inferredStoreName;
    if (!targetStoreName) throw new Error(`模板下发无法从目标门店行读取门店名称：${storeId}`);
    if (expectedStoreName) {
      await this.expectUniqueVisibleOnly(row.getByText(targetStoreName, { exact: true }), `目标门店名称 ${targetStoreName}`);
    }
    const checkbox = row.getByRole('checkbox');
    await this.expectUniqueVisible(checkbox, `目标门店 ${storeId} 复选框`);
    await checkbox.check();
    await waitUntil(
      () => checkbox.isChecked(),
      (checked) => checked,
      { timeout: 5_000, message: `目标门店 ${storeId} 未成功勾选` },
    );
    const confirm = dialog.getByRole('button', { name: /^确\s*定$/ });
    await this.expectUniqueVisibleOnly(confirm, '下发到门店确定按钮');
    const distributionResponse = this.page.waitForResponse((candidate) => candidate.request().method() === 'POST'
      && new URL(candidate.url()).pathname === '/item/v1/ops-brand/brand-modifier-sync/by-template', { timeout: 30_000 });
    await confirm.click();
    const response = await distributionResponse;
    const requestBody = response.request().postDataJSON();
    const targetPois = this.readDistributionTargetPois(requestBody);
    if (!targetPois.some((target) => target.poiId === storeId && target.poiName === targetStoreName)) {
      throw new Error(`模板下发请求目标门店不一致：期望=${targetStoreName}/${storeId}`);
    }
    return {
      status: response.status(),
      requestBody,
      dialogText,
      targetStoreId: storeId,
      targetStoreName,
    };
  }
  // system-test-fingerprint:end seasoning-page-distribute-template

  @step('读取当前门店调味页面可见数据')
  async readStoreSeasoningVisibleText(): Promise<string> {
    return this.main.innerText();
  }

  @step('进入门店调味并确认当前门店身份：{storeName}（{storeId}）')
  async verifyCurrentStoreIdentity(expectation: StoreIdentityExpectation): Promise<StoreIdentityObservation> {
    const requestPromise = this.page.waitForResponse((candidate) => candidate.request().method() === 'GET'
      && new URL(candidate.url()).pathname.endsWith('/ops-poi/global-modifier/list')
      && candidate.ok(), { timeout: 60_000 });
    await new SidebarPage(this.page).openSubMenuByPath('/poi/location/seasoning');
    const response = await requestPromise;
    await waitUntil(
      () => new URL(this.page.url()).pathname,
      (pathname) => pathname === '/poi/location/seasoning',
      { timeout: 30_000, interval: 250, message: '页面未进入门店商品管理-门店调味' },
    );
    await waitUntil(
      () => this.page.locator('body').innerText(),
      (text) => /批量操作|暂无数据|调味名称/.test(text),
      { timeout: 30_000, interval: 250, message: '门店调味页面未进入稳定终态' },
    );
    const currentStoreButton = this.page.getByRole('button').filter({ hasText: expectation.storeName });
    await this.expectUniqueVisibleOnly(currentStoreButton, `左下角当前门店 ${expectation.storeName}`);
    const currentStoreName = currentStoreButton.getByText(expectation.storeName, { exact: true });
    await this.expectUniqueVisibleOnly(currentStoreName, `左下角当前门店名称 ${expectation.storeName}`);
    const localStorageIdentity = await this.page.evaluate(() => ({
      poiId: window.localStorage.getItem('poiId') ?? '',
      poiName: window.localStorage.getItem('poiName') ?? '',
    }));
    const requestPoiId = response.request().headers()['x-poi-id'] ?? '';
    const visibleStoreName = (await currentStoreName.innerText()).trim();
    if (requestPoiId !== expectation.storeId
      || localStorageIdentity.poiId !== expectation.storeId
      || localStorageIdentity.poiName !== expectation.storeName
      || visibleStoreName !== expectation.storeName) {
      throw new Error(`门店调味查询上下文不一致：目标=${expectation.storeName}/${expectation.storeId}；页面=${visibleStoreName}/${localStorageIdentity.poiId}/${localStorageIdentity.poiName}；请求=${requestPoiId}`);
    }
    return {
      ...expectation,
      visibleStoreName,
      requestPoiId,
      localStoragePoiId: localStorageIdentity.poiId,
      localStoragePoiName: localStorageIdentity.poiName,
    };
  }

  @step('读取单门店调味模板入口状态')
  async readSingleStoreTemplateAbsence(): Promise<{ forbidden: boolean; templateNavCount: number; body: string }> {
    await this.page.goto('/pp/brand/seasoning/template', { waitUntil: 'domcontentloaded' });
    await waitUntil(
      () => this.page.locator('body').innerText(),
      (value) => !/Requesting permissions\.\.\./i.test(value)
        && (/403|没有权限访问此页面|调味|商品/.test(value)),
      { timeout: 15_000, interval: 250, message: '单门店调味模板权限终态未稳定' },
    );
    const body = await this.page.locator('body').innerText();
    return {
      forbidden: body.includes('403') || body.includes('没有权限访问此页面'),
      templateNavCount: await this.page.getByRole('link', { name: '调味模版', exact: true }).count(),
      body,
    };
  }

  @step('确保当前已在品牌调味列表')
  async ensureListOpen(): Promise<void> {
    if (new URL(this.page.url()).pathname === '/pp/brand/seasoning/list'
      && await this.addSeasoningButton.isVisible().catch(() => false)) return;
    await this.openList();
  }

  @step('打开品牌调味列表')
  async openList(): Promise<void> {
    await executeReadOnlyUiWithTransientRetry(async () => {
      const response = this.page.waitForResponse((candidate) => (
        candidate.request().method() === 'GET'
        && new URL(candidate.url()).pathname.endsWith('/ops-brand/global-modifier/list')
        && candidate.ok()
      ), { timeout: 15_000 }).catch(() => undefined);
      await this.page.goto('/pp/brand/seasoning/list', { waitUntil: 'domcontentloaded' });
      await this.expectUniqueVisible(this.addSeasoningButton, '品牌调味新增入口');
      void response;
    });
  }

  @step('按调味名称查询品牌调味列表：{identity}')
  async searchBrandSeasoning(identity: string): Promise<void> {
    await this.ensureListOpen();
    await this.expectUniqueVisibleOnly(this.seasoningSearchInput, '品牌调味名称查询框');
    const response = this.page.waitForResponse((candidate) => {
      const url = new URL(candidate.url());
      return candidate.request().method() === 'GET'
        && url.pathname.endsWith('/ops-brand/global-modifier/list')
        && url.searchParams.get('optionName') === identity
        && candidate.ok();
    }, { timeout: 30_000 });
    await this.seasoningSearchInput.fill(identity);
    await response;
    await waitUntil(
      () => this.main.locator('.ant-spin-spinning:visible').count(),
      (count) => count === 0,
      { timeout: 30_000, interval: 100, message: `品牌调味查询未进入稳定终态：${identity}` },
    );
  }

  @step('在完整品牌调味列表中滚动定位调味组：{groupName}')
  async revealBrandSeasoningGroup(groupName: string): Promise<void> {
    await this.openList();
    const group = this.main.locator('div[class*="groupItemContainer"]').filter({
      has: this.page.getByText(groupName, { exact: true }),
    });
    if (await group.count() === 1 && await group.isVisible()) return;
    const mainBox = await this.main.boundingBox();
    const viewport = this.page.viewportSize();
    if (!mainBox || !viewport) throw new Error(`品牌调味列表缺少可滚动页面坐标：${groupName}`);
    await this.page.mouse.move(mainBox.x + mainBox.width / 2, Math.min(mainBox.y + mainBox.height / 2, viewport.height - 1));
    for (let attempt = 0; attempt < 40; attempt += 1) {
      await this.page.mouse.wheel(0, Math.max(400, Math.floor(viewport.height * 0.8)));
      await this.page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));
      if (await group.count() === 1 && await group.isVisible()) return;
    }
    throw new Error(`完整品牌调味列表滚动后仍未展示目标组：${groupName}`);
  }

  @step('按页面合同执行调味只读预检：{route}')
  async openPreflightRoute(route: string, executionContextProfile: string): Promise<void> {
    if (route === '/pp/brand/seasoning/list') {
      await this.openList();
      return;
    }
    if (route === '/pp/brand/seasoning/record') {
      await this.openRecord();
      return;
    }
    if (route === '/pp/brand/seasoning/template') {
      if (executionContextProfile === 'single-store-000407') {
        const terminal = await this.readSingleStoreTemplateAbsence();
        if (!terminal.forbidden) throw new Error('单门店调味模板预检未进入已审计的 403 权限终态');
      } else {
        await this.openTemplateList();
      }
      return;
    }
    if (route === '/pp/brand/seasoning/addtemplate') {
      await this.openTemplateCreate();
      return;
    }
    if (route === '/poi/location/seasoning') {
      const response = this.page.waitForResponse((candidate) => candidate.request().method() === 'GET'
        && new URL(candidate.url()).pathname.endsWith('/ops-poi/global-modifier/list')
        && candidate.ok(), { timeout: 60_000 });
      await Promise.all([
        response,
        this.page.goto(route, { waitUntil: 'domcontentloaded' }),
      ]);
      await waitUntil(
        () => this.page.locator('body').innerText(),
        (text) => /批量操作|暂无数据|调味名称/.test(text),
        { timeout: 30_000, interval: 250, message: '门店调味预检页面终态超时' },
      );
      return;
    }
    throw new Error(`调味预检缺少路由合同：${route}`);
  }

  // system-test-fingerprint:start seasoning-page-distribute-all-single-store
  @step('单门店品牌调味页点击直接下发')
  async distributeAllSingleStore(): Promise<{ status: number; requestBody: unknown; buttonText: string; visibleText: string }> {
    await this.openList();
    const distributeButton = this.main.getByRole('button', { name: /下发$/ });
    await this.expectUniqueVisibleOnly(distributeButton, '单门店品牌调味直接下发按钮');
    const buttonText = (await distributeButton.innerText()).trim();
    const responsePromise = this.page.waitForResponse((candidate) => candidate.request().method() === 'POST'
      && new URL(candidate.url()).pathname === '/item/v1/ops-brand/brand-modifier-sync/all', { timeout: 30_000 });
    await distributeButton.click();
    const response = await responsePromise;
    return {
      status: response.status(),
      requestBody: response.request().postDataJSON(),
      buttonText,
      visibleText: await this.main.innerText(),
    };
  }
  // system-test-fingerprint:end seasoning-page-distribute-all-single-store

  @step('进入品牌调味创建页')
  async openCreate(): Promise<void> {
    await this.addSeasoningButton.click();
    await this.expectUniqueVisible(this.addSeasoningMenuItem, '品牌调味自定义创建菜单');
    await this.addSeasoningMenuItem.click();
    await waitUntil(() => new URL(this.page.url()).pathname, (pathname) => pathname.endsWith('/create'), {
      timeout: 30_000,
      message: '品牌调味未进入创建页',
    });
    await this.expectUniqueVisible(this.groupNameInput, '品牌调味组名称');
    await this.expectUniqueVisible(this.optionNameInput, '品牌调味项名称');
    await this.expectUniqueVisible(this.priceInput, '品牌调味价格');
  }

  @step('填写品牌调味：{groupName} / {optionName} / {price}')
  async fill(groupName: string, optionName: string, price: string): Promise<void> {
    await this.groupNameInput.fill(groupName);
    await this.optionNameInput.fill(optionName);
    await this.priceInput.fill(price);
    await settleInput();
  }

  @step('读取行业通用调味组的当前可选调味项：{groupName}')
  async readIndustrySeasoningOptionNames(groupName: string): Promise<string[]> {
    await this.openIndustrySeasoningSelection();
    const group = await this.expandIndustrySeasoningGroup(groupName);
    const rows = group.locator('div.ant-table-row');
    await waitUntil(() => rows.count(), (count) => count > 0, {
      timeout: 30_000,
      message: `行业调味组 ${groupName} 未展示可选调味项`,
    });
    const optionNames: string[] = [];
    for (let index = 0; index < await rows.count(); index += 1) {
      const optionName = (await rows.nth(index).locator('div.ant-table-cell').nth(1).innerText()).trim();
      if (optionName) optionNames.push(optionName);
    }
    await this.ensureListOpen();
    return [...new Set(optionNames)];
  }

  @step((groupName: string, optionNames: string | readonly string[]) => (
    `选择行业通用调味并提交：${groupName} / ${typeof optionNames === 'string' ? optionNames : optionNames.join('、')}`
  ))
  async selectIndustrySeasoning(groupName: string, optionNames: string | readonly string[]): Promise<{
    status: number;
    requestBody: unknown;
    selectedOptionNames: string[];
    visibleText: string;
  }> {
    const selectedOptionNames = typeof optionNames === 'string' ? [optionNames] : [...optionNames];
    if (selectedOptionNames.length === 0) throw new Error(`行业调味组 ${groupName} 至少需要选择一个真实调味项`);
    await this.openIndustrySeasoningSelection();
    const group = await this.expandIndustrySeasoningGroup(groupName);
    await this.selectIndustrySeasoningOptions(group, selectedOptionNames);
    const responsePromise = this.page.waitForResponse((candidate) => candidate.request().method() === 'POST'
      && /\/ops-brand\/global-modifier(?:\/batch)?$/.test(new URL(candidate.url()).pathname), { timeout: 30_000 });
    await this.page.getByRole('button', { name: /^确\s*定$/ }).click();
    const response = await responsePromise;
    await this.ensureListOpen();
    return {
      status: response.status(),
      requestBody: response.request().postDataJSON(),
      selectedOptionNames,
      visibleText: await this.main.innerText(),
    };
  }

  private async openIndustrySeasoningSelection(): Promise<void> {
    await this.openList();
    const emptyStateEntry = this.main.getByText('使用行业通用调味', { exact: true });
    const presetResponse = this.page.waitForResponse((candidate) => candidate.request().method() === 'GET'
      && new URL(candidate.url()).pathname.endsWith('/ops-brand/global-modifier/platform-presets')
      && candidate.ok(), { timeout: 30_000 });
    if (await emptyStateEntry.isVisible().catch(() => false)) {
      await this.expectUniqueVisibleOnly(emptyStateEntry, '缺省页使用行业通用调味入口');
      await emptyStateEntry.click();
    } else {
      await this.addSeasoningButton.click();
      await this.expectUniqueVisibleOnly(this.industrySeasoningMenuItem, '新增调味菜单中的使用行业调味入口');
      await this.industrySeasoningMenuItem.click();
    }
    await presetResponse;
    await this.page.waitForURL((url) => url.pathname === '/pp/brand/seasoning/create-select', { timeout: 30_000 });
  }

  @step('填写品牌调味全部字段：{groupName} / {optionName}')
  async fillAllFields(groupName: string, optionName: string, price: string): Promise<void> {
    await this.fill(groupName, optionName, price);
    await this.expectUniqueVisible(this.groupSecondLanguageInput, '调味组第二名称输入框');
    await this.expectUniqueVisible(this.groupPosNameInput, '调味组 POS 名称输入框');
    await this.groupSecondLanguageInput.fill(`${groupName}_SECOND`);
    await this.groupPosNameInput.fill(`${groupName}_POS`);
    await this.expectUniqueVisible(this.optionSecondLanguageInput, '调味项第二名称输入框');
    await this.optionSecondLanguageInput.first().fill(`${optionName}_SECOND`);
    const advanced = this.main.getByText('高级', { exact: true });
    const tableHeaders = (await this.main.locator('table:visible thead th:visible').allInnerTexts()).map((value) => value.trim());
    if (!tableHeaders.includes('送厨名称') && await advanced.count() > 0) await advanced.first().click();
    const sendKitchen = await this.inputInOptionColumn('送厨名称');
    await this.expectUniqueVisible(sendKitchen, '调味项送厨名称输入框');
    await sendKitchen.fill(`${optionName}_KITCHEN`);
    await settleInput();
  }

  @step('填写重复调味并提交读取唯一性反馈：{groupName} / {optionName}')
  async trySubmitDuplicateSeasoning(
    groupName: string,
    optionName: string,
    secondLanguage: string,
  ): Promise<{ status?: number; requestBody?: unknown; errorTexts: string[]; mutationCount: number; visibleText: string }> {
    await this.fill(groupName, optionName, '0');
    await this.expectUniqueVisible(this.groupSecondLanguageInput, '调味组第二名称输入框');
    await this.groupSecondLanguageInput.fill(secondLanguage);
    await this.expectUniqueVisible(this.groupPosNameInput, '调味组 POS 名称输入框');
    await this.groupPosNameInput.fill(`${groupName}_POS`);
    await this.expectUniqueVisible(this.optionSecondLanguageInput, '调味项第二名称输入框');
    await this.optionSecondLanguageInput.first().fill(`${optionName}_SECOND`);
    await settleInput();
    let mutationCount = 0;
    const requestListener = (request: import('@playwright/test').Request) => {
      if (request.method() === 'POST' && /\/ops-brand\/global-modifier(?:\/batch)?$/.test(new URL(request.url()).pathname)) mutationCount += 1;
    };
    this.page.on('request', requestListener);
    try {
      const responsePromise = this.page.waitForResponse((candidate) => candidate.request().method() === 'POST'
        && /\/ops-brand\/global-modifier(?:\/batch)?$/.test(new URL(candidate.url()).pathname), { timeout: 15_000 }).catch(() => undefined);
      await this.confirmButton.click();
      const response = await responsePromise;
      const errorTexts = await this.readFeedbackTexts();
      return {
        status: response?.status(),
        requestBody: response?.request().postDataJSON(),
        errorTexts,
        mutationCount,
        visibleText: await this.main.innerText(),
      };
    } finally {
      this.page.off('request', requestListener);
    }
  }

  @step('在已有调味组新增调味项并保存：{groupName} / {optionName}')
  async addOptionToExistingGroup(groupName: string, optionName: string, price: string): Promise<{ status: number; requestBody: unknown }> {
    const groupInput = this.groupNameInput;
    await this.expectUniqueVisible(groupInput, '已有调味组名称输入框');
    await waitUntil(() => groupInput.inputValue(), (value) => value === groupName, {
      timeout: 30_000,
      interval: 100,
      message: `已有调味组名称未稳定为 ${groupName}`,
    });
    const addButton = this.main.locator('button:visible').filter({ hasText: /^(?:\+\s*)?添加调味$/ });
    await this.expectUniqueVisibleOnly(addButton, '已有调味组添加调味按钮');
    const beforeRows = await this.main.locator('tr.ant-table-row:visible').count();
    await addButton.click();
    await waitUntil(() => this.main.locator('tr.ant-table-row:visible').count(), (count) => count > beforeRows, {
      timeout: 10_000,
      interval: 100,
      message: '新增调味项行未出现',
    });
    const row = this.main.locator('tr.ant-table-row:visible').last();
    const name = row.locator('input[placeholder="如：Sweet"]:visible, input[placeholder="eg: Sweet"]:visible');
    const second = row.locator('input[type="text"]:not([placeholder]):visible');
    const priceInput = row.getByRole('spinbutton');
    await this.expectUniqueVisible(name, '新增调味项名称输入框');
    await this.expectUniqueVisible(second, '新增调味项第二名称输入框');
    await this.expectUniqueVisible(priceInput, '新增调味项价格输入框');
    await name.fill(optionName);
    await second.fill(`${optionName}_SECOND`);
    await priceInput.fill(price);
    await settleInput();
    const responsePromise = this.page.waitForResponse((candidate) => candidate.request().method() === 'PUT'
      && /\/ops-brand\/global-modifier\/\d+$/.test(new URL(candidate.url()).pathname), { timeout: 30_000 });
    await this.confirmButton.click();
    const response = await responsePromise;
    return { status: response.status(), requestBody: response.request().postDataJSON() };
  }

  @step('在已有调味组提交重复调味项并读取反馈：{groupName} / {optionName}')
  async tryAddDuplicateOption(groupName: string, optionName: string): Promise<{ status?: number; requestBody?: unknown; errorTexts: string[]; mutationCount: number }> {
    const groupInput = this.groupNameInput;
    await this.expectUniqueVisible(groupInput, '已有调味组名称输入框');
    await waitUntil(() => groupInput.inputValue(), (value) => value === groupName, {
      timeout: 30_000,
      interval: 100,
      message: `已有调味组名称未稳定为 ${groupName}`,
    });
    const addButton = this.main.locator('button:visible').filter({ hasText: /^(?:\+\s*)?添加调味$/ });
    await this.expectUniqueVisibleOnly(addButton, '已有调味组添加调味按钮');
    const beforeRows = await this.main.locator('tr.ant-table-row:visible').count();
    await addButton.click();
    await waitUntil(() => this.main.locator('tr.ant-table-row:visible').count(), (count) => count > beforeRows, {
      timeout: 10_000,
      interval: 100,
      message: '新增重复调味项行未出现',
    });
    const row = this.main.locator('tr.ant-table-row:visible').last();
    const name = row.locator('input[placeholder="如：Sweet"]:visible, input[placeholder="eg: Sweet"]:visible');
    const second = row.locator('input[type="text"]:not([placeholder]):visible');
    const price = row.getByRole('spinbutton');
    await this.expectUniqueVisible(name, '重复调味项名称输入框');
    await this.expectUniqueVisible(second, '重复调味项第二名称输入框');
    await this.expectUniqueVisible(price, '重复调味项价格输入框');
    await name.fill(optionName);
    await second.fill(`${optionName}_SECOND`);
    await price.fill('0');
    await settleInput();
    let mutationCount = 0;
    const requestListener = (request: import('@playwright/test').Request) => {
      if ((request.method() === 'PUT' || request.method() === 'POST') && /\/ops-brand\/global-modifier(?:\/batch|\/\d+)?$/.test(new URL(request.url()).pathname)) mutationCount += 1;
    };
    this.page.on('request', requestListener);
    try {
      const responsePromise = this.page.waitForResponse((candidate) => (candidate.request().method() === 'PUT' || candidate.request().method() === 'POST')
        && /\/ops-brand\/global-modifier(?:\/batch|\/\d+)?$/.test(new URL(candidate.url()).pathname), { timeout: 15_000 }).catch(() => undefined);
      await this.confirmButton.click();
      const response = await responsePromise;
      return {
        status: response?.status(),
        requestBody: response?.request().postDataJSON(),
        errorTexts: await this.readFeedbackTexts(),
        mutationCount,
      };
    } finally {
      this.page.off('request', requestListener);
    }
  }

  @step('填写并提交第51个调味项，读取上限拦截结果：{groupName} / {optionName}')
  async addOptionAtLimit(groupName: string, optionName: string): Promise<{
    errorTexts: string[];
    beforeRowCount: number;
    rowCountAfterAdd: number;
    rowCount: number;
    addEnabled: boolean;
    mutationCount: number;
    mutationStatus?: number;
    mutationRequestBody?: unknown;
    mutationResponseBody?: unknown;
    rejectionChannel: '前端提交校验' | '服务端拒绝';
  }> {
    const groupInput = this.groupNameInput;
    await this.expectUniqueVisible(groupInput, '50项上限调味组名称输入框');
    await waitUntil(() => groupInput.inputValue(), (value) => value === groupName, {
      timeout: 30_000,
      interval: 100,
      message: `50项上限调味组未打开：${groupName}`,
    });
    const addButton = this.main.locator('button:visible').filter({ hasText: /^(?:\+\s*)?添加调味$/ });
    await this.expectUniqueVisibleOnly(addButton, '50项上限添加调味按钮');
    const beforeRowCount = await this.main.locator('tr.ant-table-row:visible').count();
    const addEnabled = await addButton.isEnabled();
    let mutationCount = 0;
    let mutationRequestBody: unknown;
    const mutationResponses: Array<Promise<{ status: number; body: unknown }>> = [];
    const requestListener = (request: Request) => {
      const pathname = new URL(request.url()).pathname;
      if (['POST', 'PUT', 'PATCH'].includes(request.method())
        && /\/ops-brand\/global-modifier(?:\/|$)/.test(pathname)) {
        mutationCount += 1;
        mutationRequestBody = request.postDataJSON();
      }
    };
    const responseListener = (response: Response) => {
      const request = response.request();
      const pathname = new URL(response.url()).pathname;
      if (!['POST', 'PUT', 'PATCH'].includes(request.method())
        || !/\/ops-brand\/global-modifier(?:\/|$)/.test(pathname)) return;
      mutationResponses.push(response.json()
        .catch(() => response.text().catch(() => '响应体不可读取'))
        .then((body) => ({ status: response.status(), body })));
    };
    this.page.on('request', requestListener);
    this.page.on('response', responseListener);
    try {
      if (!addEnabled) throw new Error('已有50项时“添加调味”按钮不可点击，无法执行正式提交场景');
      await addButton.click();
      await waitUntil(() => this.main.locator('tr.ant-table-row:visible').count(), (count) => count === beforeRowCount + 1, {
        timeout: 10_000,
        interval: 100,
        message: '点击添加调味后第51行未出现',
      });
      const rowCountAfterAdd = await this.main.locator('tr.ant-table-row:visible').count();
      const row = this.main.locator('tr.ant-table-row:visible').last();
      const name = row.locator('input[placeholder="如：Sweet"]:visible, input[placeholder="eg: Sweet"]:visible');
      const second = row.locator('input[type="text"]:not([placeholder]):visible');
      const price = row.getByRole('spinbutton');
      await this.expectUniqueVisible(name, '第51个调味项名称输入框');
      await this.expectUniqueVisible(second, '第51个调味项第二名称输入框');
      await this.expectUniqueVisible(price, '第51个调味项价格输入框');
      await name.fill(optionName);
      await second.fill(`${optionName}_SECOND`);
      await price.fill('0');
      await settleInput();
      await this.confirmButton.click();
      const errorTexts = await waitUntil(
        () => this.readFeedbackTexts(),
        (texts) => texts.includes('BITEM-11072 : 一个调味组最大仅能添加50个调味'),
        { timeout: 15_000, interval: 100, message: '提交第51个调味项后未出现精确上限提示' },
      );
      await settleInput();
      const mutationResponse = mutationResponses.length > 0
        ? await mutationResponses[mutationResponses.length - 1]
        : undefined;
      return {
        errorTexts,
        beforeRowCount,
        rowCountAfterAdd,
        rowCount: await this.main.locator('tr.ant-table-row:visible').count(),
        addEnabled,
        mutationCount,
        mutationStatus: mutationResponse?.status,
        mutationRequestBody,
        mutationResponseBody: mutationResponse?.body,
        rejectionChannel: mutationCount === 0 ? '前端提交校验' : '服务端拒绝',
      };
    } finally {
      this.page.off('request', requestListener);
      this.page.off('response', responseListener);
    }
  }

  @step((optionName: string, sourceGroupName?: string) => sourceGroupName
    ? `勾选调味组 ${sourceGroupName} 中的调味项 ${optionName}`
    : `勾选包含调味项 ${optionName} 的调味组`)
  async selectBatchGroupContainingOption(optionName: string, sourceGroupName?: string): Promise<{
    initiallyDisabled: boolean;
    enabledAfterSelection: boolean;
    batchText: string;
    menuText: string;
  }> {
    const batchButton = this.main.getByRole('button', { name: /批量操作/ });
    await this.expectUniqueVisibleOnly(batchButton, '品牌调味批量操作按钮');
    const groupContainers = this.main.locator('div[class*="groupItemContainer"]');
    const sourceGroup = sourceGroupName
      ? groupContainers.filter({ has: this.page.getByText(sourceGroupName, { exact: true }) })
      : undefined;
    if (sourceGroup) await this.expectUniqueVisibleOnly(sourceGroup, `源调味组 ${sourceGroupName}`);
    const optionIdentity = (sourceGroup ?? this.main).getByText(optionName, { exact: true });
    if (await optionIdentity.count() === 0 && sourceGroup) {
      const expandButton = sourceGroup.getByRole('button', { name: 'down', exact: true });
      await this.expectUniqueVisibleOnly(expandButton, `源调味组 ${sourceGroupName} 展开按钮`);
      await expandButton.click();
      await waitUntil(
        () => optionIdentity.count(),
        (count) => count > 0,
        { timeout: 10_000, interval: 100, message: `调味项 ${optionName} 展开后仍不可见` },
      );
    } else if (await optionIdentity.count() === 0) {
      const groupCount = await groupContainers.count();
      for (let index = 0; index < groupCount && await optionIdentity.count() === 0; index += 1) {
        const candidate = groupContainers.nth(index);
        const expandButton = candidate.getByRole('button', { name: 'down', exact: true });
        if (await expandButton.count() === 1 && await expandButton.isVisible()) await expandButton.click();
      }
    }
    await this.expectUniqueVisibleOnly(optionIdentity, `品牌调味项 ${optionName}`);
    const tableWrapper = this.main.locator('.ant-table-wrapper').filter({
      has: this.page.getByText(optionName, { exact: true }),
    });
    await this.expectUniqueVisibleOnly(tableWrapper, `品牌调味项 ${optionName} 所属表格`);
    const optionRow = tableWrapper.locator('.ant-table-row').filter({
      has: this.page.getByText(optionName, { exact: true }),
    });
    await this.expectUniqueVisibleOnly(optionRow, `品牌调味项 ${optionName} 所属行`);
    const checkbox = optionRow.getByRole('checkbox');
    await this.expectUniqueVisible(checkbox, `品牌调味项 ${optionName} 复选框`);
    const initiallyDisabled = await batchButton.isDisabled();
    await checkbox.dispatchEvent('click');
    await waitUntil(
      () => batchButton.isEnabled(),
      (enabled) => enabled,
      { timeout: 10_000, interval: 100, message: '勾选调味后批量操作按钮未启用' },
    );
    await batchButton.click();
    const menuText = await this.page.locator('.ant-dropdown:visible').innerText();
    return {
      initiallyDisabled,
      enabledAfterSelection: await batchButton.isEnabled(),
      batchText: (await batchButton.innerText()).trim(),
      menuText: menuText.trim(),
    };
  }

  @step((sourceGroupName: string, optionName: string, targetGroupName: string) =>
    `将调味项“${optionName}”从调味组“${sourceGroupName}”移动到调味组“${targetGroupName}”`)
  async batchMoveOption(sourceGroupName: string, optionName: string, targetGroupName: string): Promise<{ status: number; requestBody: unknown; menuText: string; dialogText: string }> {
    const result = await this.selectBatchGroupContainingOption(optionName, sourceGroupName);
    const menu = this.page.locator('.ant-dropdown:visible');
    const menuText = await menu.innerText();
    const moveEntry = menu.getByText(/变更调味组|移动调味项/, { exact: false });
    await this.expectUniqueVisibleOnly(moveEntry, '批量变更调味组菜单项');
    await moveEntry.click();
    const dialog = this.page.getByRole('dialog');
    await this.expectUniqueVisibleOnly(dialog, '批量变更调味组弹窗');
    const groupSearch = dialog.getByRole('combobox');
    await this.expectUniqueVisibleOnly(groupSearch, '批量变更目标调味组搜索框');
    await groupSearch.click();
    await groupSearch.fill(targetGroupName);
    const targetDropdown = this.page.locator('.ant-select-dropdown:visible');
    await this.expectUniqueVisibleOnly(targetDropdown, '批量变更目标调味组下拉列表');
    const target = targetDropdown.getByText(targetGroupName, { exact: true });
    await this.expectUniqueVisibleOnly(target, `目标调味组 ${targetGroupName}`);
    await target.click();
    const confirm = dialog.getByRole('button', { name: /^确\s*定$/ });
    await this.expectUniqueVisibleOnly(confirm, '批量变更调味组确定按钮');
    await settleInput();
    const dialogText = await dialog.innerText();
    const responsePromise = this.page.waitForResponse((candidate) => candidate.request().method() === 'POST'
      && new URL(candidate.url()).pathname.endsWith('/ops-brand/global-modifier/options/batch-move'), { timeout: 30_000 });
    await confirm.click();
    const response = await responsePromise;
    return {
      status: response.status(),
      requestBody: response.request().postDataJSON(),
      menuText,
      dialogText,
    };
  }

  @step((sourceOptionName: string, targetOptionName: string) => `拖动调味项排序：${sourceOptionName} → ${targetOptionName}`)
  async sortOptions(sourceOptionName: string, targetOptionName: string): Promise<{
    status: number;
    requestBody: unknown;
    before: string[];
    after: string[];
  }> {
    const sourceInputSelector = `input[value="${sourceOptionName}"]:visible`;
    const targetInputSelector = `input[value="${targetOptionName}"]:visible`;
    const sourceInput = this.main.locator(sourceInputSelector);
    const targetInput = this.main.locator(targetInputSelector);
    await this.expectUniqueVisibleOnly(sourceInput, `待排序调味项 ${sourceOptionName}`);
    await this.expectUniqueVisibleOnly(targetInput, `排序目标调味项 ${targetOptionName}`);
    const optionTable = this.main.locator('table').filter({ has: this.page.locator(sourceInputSelector) });
    await this.expectUniqueVisibleOnly(optionTable, `待排序调味项 ${sourceOptionName} 所属表格`);
    const sortableRows = optionTable.locator('tbody.ant-table-tbody > tr.ant-table-row[aria-roledescription="sortable"]');
    const sourceRow = sortableRows.filter({ has: this.page.locator(sourceInputSelector) });
    const targetRow = sortableRows.filter({ has: this.page.locator(targetInputSelector) });
    await this.expectUniqueVisibleOnly(sourceRow, `待排序调味项 ${sourceOptionName} 拖动行`);
    await this.expectUniqueVisibleOnly(targetRow, `排序目标调味项 ${targetOptionName} 拖动行`);
    const rows = await sortableRows.all();
    const before = await Promise.all(rows.map(async (row) => (await row.locator('input:visible').first().inputValue()).trim()));
    const sourceHandle = sourceRow.getByRole('button', { name: 'holder', exact: true });
    const targetHandle = targetRow.getByRole('button', { name: 'holder', exact: true });
    await this.expectUniqueVisibleOnly(sourceHandle, `待排序调味项 ${sourceOptionName} 拖动手柄`);
    await this.expectUniqueVisibleOnly(targetHandle, `排序目标调味项 ${targetOptionName} 拖动手柄`);
    await this.dragSortableByPointer(sourceHandle, targetHandle);
    const after = await waitUntil(
      async () => {
        const afterRows = await sortableRows.all();
        return Promise.all(afterRows.map(async (row) => (await row.locator('input:visible').first().inputValue()).trim()));
      },
      (values) => JSON.stringify(values) !== JSON.stringify(before),
      { timeout: 10_000, interval: 100, message: '调味项拖动后页面顺序未发生变化' },
    );
    await waitUntil(
      () => this.confirmButton.isEnabled(),
      (enabled) => enabled,
      { timeout: 10_000, interval: 100, message: '调味项排序后保存按钮未启用' },
    );
    const responsePromise = this.page.waitForResponse((candidate) => candidate.request().method() === 'PUT'
      && /\/ops-brand\/global-modifier\/\d+$/.test(new URL(candidate.url()).pathname), { timeout: 30_000 });
    await this.confirmButton.click();
    const response = await responsePromise;
    return { status: response.status(), requestBody: response.request().postDataJSON(), before, after };
  }

  @step((sourceGroupName: string, targetGroupName: string) => `拖动调味组排序：${sourceGroupName} → ${targetGroupName}`)
  async sortGroups(sourceGroupName: string, targetGroupName: string): Promise<{
    status: number;
    requestBody: unknown;
    before: string[];
    after: string[];
    dialogClosed: boolean;
  }> {
    const sortButton = this.main.getByRole('button', { name: /调味组排序/ });
    await this.expectUniqueVisibleOnly(sortButton, '调味组排序按钮');
    await sortButton.click();
    const dialog = this.page.getByRole('dialog');
    await this.expectUniqueVisibleOnly(dialog, '调味组排序弹窗');
    const items = dialog.locator('div[class*="sortableListItem"]');
    const before = (await items.allInnerTexts()).map((value) => value.trim()).filter(Boolean);
    const sourceItem = items.filter({ has: this.page.getByText(sourceGroupName, { exact: true }) });
    const targetItem = items.filter({ has: this.page.getByText(targetGroupName, { exact: true }) });
    await this.expectUniqueVisibleOnly(sourceItem, `待排序调味组 ${sourceGroupName}`);
    await this.expectUniqueVisibleOnly(targetItem, `排序目标调味组 ${targetGroupName}`);
    const sourceHandle = sourceItem.locator('button[aria-roledescription="sortable"]');
    const targetHandle = targetItem.locator('button[aria-roledescription="sortable"]');
    await this.expectUniqueVisibleOnly(sourceHandle, `待排序调味组 ${sourceGroupName} 拖动手柄`);
    await this.expectUniqueVisibleOnly(targetHandle, `排序目标调味组 ${targetGroupName} 拖动手柄`);
    await this.dragSortableByPointer(sourceHandle, targetHandle);
    const after = await waitUntil(
      async () => (await items.allInnerTexts()).map((value) => value.trim()).filter(Boolean),
      (values) => JSON.stringify(values) !== JSON.stringify(before),
      { timeout: 10_000, interval: 100, message: '调味组拖动后页面顺序未发生变化' },
    );
    const responsePromise = this.page.waitForResponse((candidate) => candidate.request().method() === 'PUT'
      && new URL(candidate.url()).pathname.endsWith('/ops-brand/global-modifier/sort'), { timeout: 30_000 });
    await dialog.getByRole('button', { name: /^确\s*定$/ }).click();
    const response = await responsePromise;
    await dialog.waitFor({ state: 'hidden' });
    return {
      status: response.status(),
      requestBody: response.request().postDataJSON(),
      before,
      after,
      dialogClosed: !await dialog.isVisible(),
    };
  }

  private async dragSortableByPointer(source: import('@playwright/test').Locator, target: import('@playwright/test').Locator): Promise<void> {
    await source.scrollIntoViewIfNeeded();
    await target.scrollIntoViewIfNeeded();
    const sourceBox = await source.boundingBox();
    const targetBox = await target.boundingBox();
    if (!sourceBox || !targetBox) throw new Error('排序源项或目标项没有可拖动的页面坐标');
    const sourceX = sourceBox.x + sourceBox.width / 2;
    const sourceY = sourceBox.y + sourceBox.height / 2;
    const targetX = targetBox.x + targetBox.width / 2;
    const targetY = targetBox.y + targetBox.height / 2;
    await this.page.mouse.move(sourceX, sourceY);
    await this.page.mouse.down();
    await this.page.mouse.move(sourceX + 10, sourceY + 10, { steps: 3 });
    await this.page.mouse.move(targetX, targetY, { steps: 12 });
    await this.page.mouse.up();
  }

  @step('提交调味项名称为空但第二语言有值的新增表单')
  async submitCreateWithoutOptionName(groupName: string, secondLanguage: string): Promise<{
    errorTexts: string[];
    invalidCount: number;
    mutationCount: number;
  }> {
    await this.groupNameInput.fill(groupName);
    await this.expectUniqueVisible(this.optionSecondLanguageInput, '调味项第二语言输入框');
    await this.optionSecondLanguageInput.fill(secondLanguage);
    await settleInput();
    let mutationCount = 0;
    const listener = (request: import('@playwright/test').Request): void => {
      if (request.method() === 'POST'
        && /\/ops-brand\/global-modifier(?:\/batch)?$/.test(new URL(request.url()).pathname)) mutationCount += 1;
    };
    this.page.on('request', listener);
    try {
      await this.confirmButton.click();
      const startedAt = Date.now();
      await waitUntil(
        async () => ({
          errors: await this.visibleErrors.allInnerTexts(),
          invalidCount: await this.main.locator('.ant-form-item-has-error:visible,input[aria-invalid="true"]:visible').count(),
          mutationCount,
          elapsed: Date.now() - startedAt,
        }),
        (state) => state.errors.length > 0 || state.invalidCount > 0 || state.mutationCount > 0 || state.elapsed >= 2_000,
        { timeout: 10_000, interval: 100, message: '调味项名称空提交未进入可判定终态' },
      );
      return {
        errorTexts: await this.visibleErrors.allInnerTexts(),
        invalidCount: await this.main.locator('.ant-form-item-has-error:visible,input[aria-invalid="true"]:visible').count(),
        mutationCount,
      };
    } finally {
      this.page.off('request', listener);
    }
  }

  @step('在已有调味组添加空名称项并读取校验：{groupName}')
  async submitExistingGroupOptionWithoutName(groupName: string, secondLanguage: string): Promise<{
    errorTexts: string[];
    invalidCount: number;
    mutationCount: number;
    groupVisible: boolean;
  }> {
    const group = this.main.locator('input[aria-required="true"]:visible');
    await this.expectUniqueVisible(group, '已有调味组名称输入框');
    await waitUntil(
      () => group.inputValue(),
      (value) => value === groupName,
      { timeout: 30_000, interval: 150, message: `编辑页调味组名称未回填：${groupName}` },
    );
    const currentName = await group.inputValue();
    if (currentName !== groupName) throw new Error(`编辑页调味组身份不匹配：expected=${groupName}, actual=${currentName}`);
    const addButton = this.main.locator('button:visible').filter({ hasText: /^(?:\+\s*)?添加调味$/ });
    await waitUntil(
      async () => ({
        url: this.page.url(),
        count: await addButton.count(),
        buttons: await this.main.locator('button:visible').allInnerTexts(),
      }),
      (state) => /\/pp\/brand\/seasoning\/edit(?:\?|$)/.test(state.url) && state.count === 1,
      { timeout: 30_000, interval: 150, message: '已有调味组添加调味按钮未在编辑终态出现' },
    );
    const beforeRows = await this.main.locator('tr.ant-table-row:visible').count();
    await addButton.click();
    await waitUntil(
      () => this.main.locator('tr.ant-table-row:visible').count(),
      (count) => count > beforeRows,
      { timeout: 10_000, interval: 100, message: '已有调味组点击添加调味后未新增行' },
    );
    const row = this.main.locator('tr.ant-table-row:visible').last();
    await this.expectUniqueVisibleOnly(row, '新增空名称调味项行');
    const secondLanguageInput = row.locator('input[type="text"]:not([placeholder]):visible');
    await this.expectUniqueVisible(secondLanguageInput, '新增调味项第二语言输入框');
    await secondLanguageInput.fill(secondLanguage);
    await settleInput();
    let mutationCount = 0;
    const listener = (request: import('@playwright/test').Request): void => {
      const pathname = new URL(request.url()).pathname;
      if ((request.method() === 'POST' || request.method() === 'PUT') && /\/ops-brand\/global-modifier(?:\/batch|\/\d+)?$/.test(pathname)) mutationCount += 1;
    };
    this.page.on('request', listener);
    try {
      await this.confirmButton.click();
      const startedAt = Date.now();
      await waitUntil(
        async () => ({
          errors: await this.visibleErrors.allInnerTexts(),
          invalidCount: await this.main.locator('.ant-form-item-has-error:visible,input[aria-invalid="true"]:visible').count(),
          mutationCount,
          elapsed: Date.now() - startedAt,
        }),
        (state) => state.errors.length > 0 || state.invalidCount > 0 || state.mutationCount > 0 || state.elapsed >= 2_000,
        { timeout: 10_000, interval: 100, message: '已有调味组空名称项提交未进入可判定终态' },
      );
      return {
        errorTexts: await this.visibleErrors.allInnerTexts(),
        invalidCount: await this.main.locator('.ant-form-item-has-error:visible,input[aria-invalid="true"]:visible').count(),
        mutationCount,
        groupVisible: await group.isVisible(),
      };
    } finally {
      this.page.off('request', listener);
    }
  }

  @step('提交调味组名称为空但第二名称和POS名称有值的新增表单')
  async submitCreateWithoutGroupName(secondLanguage: string, posName: string): Promise<{
    errorTexts: string[];
    invalidCount: number;
    mutationCount: number;
    confirmDisabledBefore: boolean;
    confirmDisabledAfter: boolean;
    groupNameValue: string;
    groupFieldErrorTexts: string[];
    groupFieldHasError: boolean;
  }> {
    if (!(await this.groupPosNameInput.isVisible().catch(() => false))) {
      const advanced = this.main.getByText('高级', { exact: true }).filter({ visible: true });
      if (await advanced.count() > 0) await advanced.first().click();
    }
    await this.expectUniqueVisible(this.groupSecondLanguageInput, '调味组第二名称输入框');
    await this.expectUniqueVisible(this.groupPosNameInput, '调味组POS名称输入框');
    await this.groupSecondLanguageInput.fill(secondLanguage);
    await this.groupPosNameInput.fill(posName);
    await settleInput();
    const confirmDisabledBefore = await this.confirmButton.isDisabled();
    let mutationCount = 0;
    const listener = (request: import('@playwright/test').Request): void => {
      if (request.method() === 'POST'
        && /\/ops-brand\/global-modifier(?:\/batch)?$/.test(new URL(request.url()).pathname)) mutationCount += 1;
    };
    this.page.on('request', listener);
    try {
      if (!confirmDisabledBefore) await this.confirmButton.click();
      await waitUntil(
        async () => ({
          errors: await this.visibleErrors.allInnerTexts(),
          invalidCount: await this.main.locator('.ant-form-item-has-error:visible,input[aria-invalid="true"]:visible').count(),
          mutationCount,
          confirmDisabled: await this.confirmButton.isDisabled(),
        }),
        (state) => state.errors.length > 0 || state.invalidCount > 0 || state.mutationCount > 0
          || state.confirmDisabled !== confirmDisabledBefore || confirmDisabledBefore,
        { timeout: 10_000, interval: 100, message: '调味组名称空提交未进入可判定终态' },
      );
      const groupField = this.groupNameInput.locator('xpath=ancestor::*[contains(@class,"ant-form-item")][1]');
      return {
        errorTexts: await this.visibleErrors.allInnerTexts(),
        invalidCount: await this.main.locator('.ant-form-item-has-error:visible,input[aria-invalid="true"]:visible').count(),
        mutationCount,
        confirmDisabledBefore,
        confirmDisabledAfter: await this.confirmButton.isDisabled(),
        groupNameValue: await this.groupNameInput.inputValue(),
        groupFieldErrorTexts: await groupField.locator('.ant-form-item-explain-error:visible').allInnerTexts(),
        groupFieldHasError: await groupField.locator('.ant-form-item-has-error:visible,input[aria-invalid="true"]:visible').count() > 0,
      };
    } finally {
      this.page.off('request', listener);
    }
  }

  @step('提交品牌调味并等待创建响应')
  async submitCreate(): Promise<Response> {
    const response = this.page.waitForResponse((candidate) => (
      candidate.request().method() === 'POST'
      && /\/ops-brand\/global-modifier(?:\/batch)?$/.test(new URL(candidate.url()).pathname)
    ), { timeout: 60_000 });
    await this.confirmButton.click();
    return response;
  }

  @step('取消新增调味并确认未发起保存请求')
  async cancelCreate(): Promise<{ route: string; mutationCount: number }> {
    let mutationCount = 0;
    const listener = (request: import('@playwright/test').Request) => {
      if (request.method() === 'POST' && /\/ops-brand\/global-modifier(?:\/batch)?$/.test(new URL(request.url()).pathname)) mutationCount += 1;
    };
    this.page.on('request', listener);
    try {
      const close = this.main.getByRole('button', { name: 'close', exact: true });
      await this.expectUniqueVisibleOnly(close, '新增调味关闭按钮');
      await close.click();
      await waitUntil(() => new URL(this.page.url()).pathname, (pathname) => pathname === '/pp/brand/seasoning/list', {
        timeout: 30_000,
        interval: 100,
        message: '取消新增后未返回调味列表',
      });
      return { route: new URL(this.page.url()).pathname, mutationCount };
    } finally {
      this.page.off('request', listener);
    }
  }

  @step((groupName: string, transientName: string) =>
    `将调味组“${groupName}”临时改名为“${transientName}”后取消编辑`)
  async cancelEditAfterChangingGroup(groupName: string, transientName: string): Promise<{
    route: string;
    mutationCount: number;
    originalName: string;
    transientName: string;
    transientValueConfirmed: boolean;
    visibleText: string;
  }> {
    await this.expectUniqueVisible(this.groupNameInput, '编辑调味组名称输入框');
    await waitUntil(() => this.groupNameInput.inputValue(), (value) => value === groupName, {
      timeout: 30_000,
      interval: 100,
      message: `编辑调味组名称未稳定为 ${groupName}`,
    });
    const originalName = (await this.groupNameInput.inputValue()).trim();
    await this.groupNameInput.fill(transientName);
    await settleInput();
    const transientValue = (await this.groupNameInput.inputValue()).trim();
    let mutationCount = 0;
    const listener = (request: import('@playwright/test').Request) => {
      if ((request.method() === 'PUT' || request.method() === 'POST') && /\/ops-brand\/global-modifier(?:\/\d+|\/batch)?$/.test(new URL(request.url()).pathname)) mutationCount += 1;
    };
    this.page.on('request', listener);
    try {
      const close = this.main.getByRole('button', { name: 'close', exact: true });
      await this.expectUniqueVisibleOnly(close, '编辑调味关闭按钮');
      await close.click();
      await waitUntil(() => new URL(this.page.url()).pathname, (pathname) => pathname === '/pp/brand/seasoning/list', {
        timeout: 30_000,
        interval: 100,
        message: '取消编辑后未返回调味列表',
      });
      return {
        route: new URL(this.page.url()).pathname,
        mutationCount,
        originalName,
        transientName,
        transientValueConfirmed: transientValue === transientName,
        visibleText: await this.main.innerText(),
      };
    } finally {
      this.page.off('request', listener);
    }
  }

  @step('编辑调味项并保存：{optionName}')
  async editOption(optionName: string, updatedOptionName: string): Promise<{ status: number; requestBody: unknown }> {
    const input = this.main.locator(`input[value="${optionName}"]:visible`);
    await this.expectUniqueVisible(input, `调味项 ${optionName} 编辑输入框`);
    await input.fill(updatedOptionName);
    await settleInput();
    const responsePromise = this.page.waitForResponse((candidate) => candidate.request().method() === 'PUT'
      && /\/ops-brand\/global-modifier\/\d+$/.test(new URL(candidate.url()).pathname), { timeout: 30_000 });
    await this.confirmButton.click();
    const response = await responsePromise;
    return { status: response.status(), requestBody: response.request().postDataJSON() };
  }

  @step('删除编辑页中的调味项并提交保存：{optionName}')
  async deleteOption(optionName: string): Promise<{
    status: number;
    requestBody: unknown;
  }> {
    const optionInputSelector = `input[value="${optionName}"]:visible`;
    const optionInput = this.main.locator(optionInputSelector);
    await this.expectUniqueVisibleOnly(optionInput, `调味项 ${optionName} 编辑输入框`);
    const row = this.main.locator('tr.ant-table-row:visible').filter({ has: this.page.locator(optionInputSelector) });
    await this.expectUniqueVisibleOnly(row, `调味项 ${optionName} 编辑行`);
    const deleteButton = row.getByRole('button', { name: 'delete', exact: true });
    await this.expectUniqueVisibleOnly(deleteButton, `调味项 ${optionName} 删除按钮`);
    await deleteButton.click();
    await waitUntil(
      () => optionInput.count(),
      (count) => count === 0,
      { timeout: 10_000, interval: 100, message: `调味项 ${optionName} 点击删除后仍保留在编辑表单` },
    );
    await settleInput();
      let response: import('@playwright/test').Response | undefined;
    const responseListener = (candidate: import('@playwright/test').Response) => {
      if (candidate.request().method() === 'PUT'
        && /\/ops-brand\/global-modifier\/\d+$/.test(new URL(candidate.url()).pathname)) response = candidate;
    };
    this.page.on('response', responseListener);
    try {
      await this.confirmButton.click();
      await waitUntil(
        () => response,
        (candidate) => Boolean(candidate),
        { timeout: 30_000, interval: 100, message: `调味项 ${optionName} 删除保存后未观察到保存请求` },
      );
      if (!response) throw new Error(`调味项 ${optionName} 删除后缺少保存响应`);
      return {
        status: response.status(),
        requestBody: response.request().postDataJSON(),
      };
    } finally {
      this.page.off('response', responseListener);
    }
  }

  @step('尝试提交品牌调味负向价格')
  async attemptInvalidSubmit(): Promise<{
    inputValue: string;
    confirmDisabled: boolean;
    errorTexts: string[];
    mutationCount: number;
  }> {
    let mutationCount = 0;
    const listener = (request: import('@playwright/test').Request) => {
      if (request.method() === 'POST'
        && /\/ops-brand\/global-modifier(?:\/batch)?$/.test(new URL(request.url()).pathname)) mutationCount += 1;
    };
    this.page.on('request', listener);
    try {
      const confirmDisabled = await this.confirmButton.isDisabled();
      if (!confirmDisabled) await this.confirmButton.click();
      const startedAt = Date.now();
      await waitUntil(
        async () => ({ elapsed: Date.now() - startedAt, errors: await this.visibleErrors.count(), mutationCount }),
        (state) => state.errors > 0 || state.mutationCount > 0 || state.elapsed >= 2_000,
        { timeout: 5_000, interval: 100, message: '品牌调味负向价格未进入可判定终态' },
      );
      return {
        inputValue: await this.priceInput.inputValue(),
        confirmDisabled,
        errorTexts: (await this.readFeedbackTexts()),
        mutationCount,
      };
    } finally {
      this.page.off('request', listener);
    }
  }

  @step('验证详情价格非法输入恢复原价')
  async attemptInvalidEditPrices(): Promise<{ originalValue: string; results: Array<{ input: string; value: string; confirmDisabled: boolean; mutationCount: number }> }> {
    const price = this.main.getByRole('spinbutton');
    const confirm = this.page.getByRole('button', { name: /^(?:Confirm|确\s*定)$/i, exact: true });
    await this.expectUniqueVisible(price, '调味详情价格输入框');
    await this.expectUniqueVisibleOnly(confirm, '调味详情确定按钮');
    const originalValue = await price.inputValue();
    const results: Array<{ input: string; value: string; confirmDisabled: boolean; mutationCount: number }> = [];
    for (const input of ['abc', '-1'] as const) {
      let mutationCount = 0;
      const listener = (request: import('@playwright/test').Request) => {
        if (request.method() === 'PUT' && /\/ops-brand\/global-modifier\/\d+/.test(new URL(request.url()).pathname)) mutationCount += 1;
      };
      this.page.on('request', listener);
      try {
        await price.fill(input);
        await price.press('Tab');
        await waitUntil(
          () => price.inputValue(),
          (value) => value === originalValue,
          { timeout: 10_000, interval: 100, message: `详情价格 ${input} 未恢复原价` },
        );
        results.push({ input, value: await price.inputValue(), confirmDisabled: await confirm.isDisabled(), mutationCount });
      } finally {
        this.page.off('request', listener);
      }
    }
    return { originalValue, results };
  }

  @step('读取调味页面当前可见校验提示')
  async readFeedbackTexts(): Promise<string[]> {
    const candidates = [
      this.visibleErrors,
      this.page.locator('[role="alert"]:visible'),
      this.page.locator('.ant-message-notice-content:visible'),
    ];
    const values = await Promise.all(candidates.map((locator) => locator.allInnerTexts().catch(() => [])));
    return [...new Set(values.flat().map((text) => text.trim()).filter(Boolean))];
  }

  @step('核对调味列表显示业务身份：{groupName}')
  async expectGroupVisible(groupName: string): Promise<void> {
    await waitUntil(
      async () => this.main.getByText(groupName, { exact: true }).count(),
      (count) => count > 0,
      { timeout: 30_000, interval: 500, message: `调味列表未显示创建的调味组：${groupName}` },
    );
  }

  @step('核对调味列表不再显示业务身份：{groupName}')
  async expectGroupAbsent(groupName: string): Promise<void> {
    await waitUntil(
      async () => this.main.getByText(groupName, { exact: true }).count(),
      (count) => count === 0,
      { timeout: 30_000, interval: 500, message: `调味列表仍显示已清理的调味组：${groupName}` },
    );
  }

  // system-test-fingerprint:start seasoning-page-delete-store-group
  @step('门店调味页面通过组操作菜单删除调味组：{groupName}')
  async deleteStoreGroup(groupName: string): Promise<{ status: number; confirmText: string; visibleText: string }> {
    const target = this.main.getByText(groupName, { exact: true });
    await this.expectUniqueVisibleOnly(target, `门店调味组 ${groupName}`);
    const container = this.storeGroupContainer(target);
    const action = this.storeActionButton(container);
    await this.expectUniqueVisibleOnly(action, `门店调味组 ${groupName} 操作入口`);
    await action.click();
    const menu = this.page.locator('.ant-dropdown:visible, .ant-dropdown-menu:visible').last();
    await this.expectUniqueVisible(menu, `门店调味组 ${groupName} 操作菜单`);
    await menu.getByText('删除', { exact: true }).click();
    const dialog = this.page.getByRole('dialog').last();
    await this.expectUniqueVisible(dialog, '门店调味组删除确认弹窗');
    const confirmText = (await dialog.innerText()).trim();
    const responsePromise = this.page.waitForResponse((candidate) => candidate.request().method() === 'DELETE'
      && /\/ops-poi\/global-modifier\/\d+$/.test(new URL(candidate.url()).pathname), { timeout: 30_000 });
    await dialog.getByRole('button', { name: /^删\s*除$/ }).click();
    const response = await responsePromise;
    await this.waitForStoreIdentityAbsent(groupName);
    return { status: response.status(), confirmText, visibleText: await this.main.innerText() };
  }
  // system-test-fingerprint:end seasoning-page-delete-store-group

  // system-test-fingerprint:start seasoning-page-delete-store-option
  @step('门店调味页面通过单项操作菜单删除调味项：{optionName}')
  async deleteStoreOption(groupName: string, optionName: string): Promise<{ status: number; confirmText: string; visibleText: string }> {
    const groupTarget = this.main.getByText(groupName, { exact: true });
    await this.expectUniqueVisibleOnly(groupTarget, `门店调味组 ${groupName}`);
    const container = this.storeGroupContainer(groupTarget);
    await this.ensureStoreGroupExpanded(container, groupName);
    const target = container.getByText(optionName, { exact: true });
    await this.expectUniqueVisibleOnly(target, `门店调味项 ${optionName}`);
    const row = target.locator('xpath=ancestor::div[contains(concat(" ",normalize-space(@class)," ")," ant-table-row ")][1]');
    await this.expectUniqueVisibleOnly(row, `门店调味项 ${optionName} 所在行`);
    const action = row.getByRole('button', { name: 'delete' });
    await this.expectUniqueVisible(action, `门店调味项 ${optionName} 操作入口`);
    await action.click();
    const dialog = this.page.getByRole('dialog').last();
    await this.expectUniqueVisible(dialog, '门店调味项删除确认弹窗');
    const confirmText = (await dialog.innerText()).trim();
    const responsePromise = this.page.waitForResponse((candidate) => candidate.request().method() === 'DELETE'
      && /\/ops-poi\/global-modifier\/option\/\d+$/.test(new URL(candidate.url()).pathname), { timeout: 30_000 });
    await dialog.getByRole('button', { name: /^删\s*除$/ }).click();
    const response = await responsePromise;
    await this.waitForStoreIdentityAbsent(optionName);
    return { status: response.status(), confirmText, visibleText: await this.main.innerText() };
  }
  // system-test-fingerprint:end seasoning-page-delete-store-option

  // system-test-fingerprint:start seasoning-page-batch-delete-store
  @step('门店调味页面勾选目标并通过批量操作删除：{identity}')
  async batchDeleteStore(groupName: string, identity: string): Promise<{ status: number; initiallyDisabled: boolean; confirmText: string; visibleText: string }> {
    const batchButton = this.main.getByRole('button', { name: /批量操作/ });
    await this.expectUniqueVisibleOnly(batchButton, '门店调味批量操作按钮');
    const initiallyDisabled = await batchButton.isDisabled();
    const groupTarget = this.main.getByText(groupName, { exact: true });
    await this.expectUniqueVisibleOnly(groupTarget, `门店调味组 ${groupName}`);
    const container = this.storeGroupContainer(groupTarget);
    await this.ensureStoreGroupExpanded(container, groupName);
    const target = container.getByText(identity, { exact: true });
    await this.expectUniqueVisibleOnly(target, `门店调味批量删除目标 ${identity}`);
    const row = target.locator('xpath=ancestor::div[contains(concat(" ",normalize-space(@class)," ")," ant-table-row ")][1]');
    const checkbox = row.getByRole('checkbox').first();
    await this.expectUniqueVisible(checkbox, `门店调味批量删除目标 ${identity} 复选框`);
    await checkbox.check();
    await waitUntil(() => batchButton.isEnabled(), (enabled) => enabled, {
      timeout: 10_000,
      interval: 100,
      message: '门店调味勾选后批量操作按钮未启用',
    });
    await batchButton.click();
    const menu = this.page.locator('.ant-dropdown:visible, .ant-dropdown-menu:visible').last();
    await this.expectUniqueVisible(menu, '门店调味批量操作菜单');
    await menu.getByText('删除', { exact: true }).click();
    const dialog = this.page.getByRole('dialog').last();
    await this.expectUniqueVisible(dialog, '门店调味批量删除确认弹窗');
    const confirmText = (await dialog.innerText()).trim();
    const responsePromise = this.page.waitForResponse((candidate) => candidate.request().method() === 'POST'
      && /\/ops-poi\/global-modifier\/batch-delete$/.test(new URL(candidate.url()).pathname), { timeout: 30_000 });
    await dialog.getByRole('button', { name: /^删\s*除$/ }).click();
    const response = await responsePromise;
    await this.waitForStoreIdentityAbsent(identity);
    return { status: response.status(), initiallyDisabled, confirmText, visibleText: await this.main.innerText() };
  }
  // system-test-fingerprint:end seasoning-page-batch-delete-store

  // system-test-fingerprint:start seasoning-page-single-store-action-readiness
  @step('只读验证单门店品牌调味下发动作链')
  async verifySingleStoreDistributionReadiness(): Promise<void> {
    await this.openList();
    const distributeButton = this.main.getByRole('button', { name: /下发$/ });
    await this.expectUniqueVisibleOnly(distributeButton, '单门店品牌调味直接下发按钮');
    if (await distributeButton.isDisabled()) throw new Error('单门店品牌调味直接下发按钮不可用');
  }
  // system-test-fingerprint:end seasoning-page-single-store-action-readiness

  // system-test-fingerprint:start seasoning-page-store-action-readiness-dispatch
  @step('只读验证门店调味动作链：{kind}')
  async verifyStoreMutationActionReadiness(
    kind: 'delete-group' | 'delete-option' | 'batch-delete' | 'redeliver',
    groupName: string,
    optionName?: string,
  ): Promise<void> {
    if (kind === 'delete-option') {
      if (!optionName) throw new Error('门店调味单项删除动作链缺少调味项身份');
      return this.verifyStoreOptionDeleteReadiness(groupName, optionName);
    }
    if (kind === 'batch-delete') {
      if (!optionName) throw new Error('门店调味批量删除动作链缺少调味项身份');
      return this.verifyStoreBatchDeleteReadiness(groupName, optionName);
    }
    return this.verifyStoreGroupDeleteReadiness(groupName);
  }
  // system-test-fingerprint:end seasoning-page-store-action-readiness-dispatch

  // system-test-fingerprint:start seasoning-page-store-group-delete-action-readiness
  private async verifyStoreGroupDeleteReadiness(groupName: string): Promise<void> {
    const groupTarget = this.main.getByText(groupName, { exact: true });
    await this.expectUniqueVisibleOnly(groupTarget, `门店调味组 ${groupName}`);
    const container = this.storeGroupContainer(groupTarget);
    const action = this.storeActionButton(container);
    await this.expectUniqueVisibleOnly(action, `门店调味组 ${groupName} 操作入口`);
    await action.click();
    const menu = this.page.locator('.ant-dropdown:visible, .ant-dropdown-menu:visible').last();
    await this.expectUniqueVisible(menu, '门店调味动作菜单');
    const deleteItem = menu.getByText('删除', { exact: true });
    await this.expectUniqueVisibleOnly(deleteItem, '门店调味删除菜单项');
    await deleteItem.click();
    const dialog = this.page.getByRole('dialog').last();
    await this.expectUniqueVisible(dialog, '门店调味删除确认弹窗');
    await this.cancelStoreDeleteDialog(dialog, '门店调味组删除');
  }
  // system-test-fingerprint:end seasoning-page-store-group-delete-action-readiness

  // system-test-fingerprint:start seasoning-page-store-option-delete-action-readiness
  private async verifyStoreOptionDeleteReadiness(groupName: string, optionName: string): Promise<void> {
    const row = await this.storeOptionRow(groupName, optionName);
    const action = row.getByRole('button', { name: 'delete' });
    await this.expectUniqueVisible(action, `门店调味项 ${optionName} 删除入口`);
    await action.click();
    const dialog = this.page.getByRole('dialog').last();
    await this.expectUniqueVisible(dialog, '门店调味项删除确认弹窗');
    await this.cancelStoreDeleteDialog(dialog, '门店调味项删除');
  }
  // system-test-fingerprint:end seasoning-page-store-option-delete-action-readiness

  // system-test-fingerprint:start seasoning-page-store-batch-delete-action-readiness
  private async verifyStoreBatchDeleteReadiness(groupName: string, optionName: string): Promise<void> {
    const row = await this.storeOptionRow(groupName, optionName);
    const batch = this.main.getByRole('button', { name: /批量操作/ });
    await this.expectUniqueVisibleOnly(batch, '门店调味批量操作按钮');
    const checkbox = row.getByRole('checkbox').first();
    await this.expectUniqueVisible(checkbox, `门店调味项 ${optionName} 复选框`);
    await checkbox.check();
    await waitUntil(() => batch.isEnabled(), (enabled) => enabled, {
      timeout: 5_000,
      interval: 100,
      message: '门店调味只读就绪检查中批量操作未启用',
    });
    await batch.click();
    const menu = this.page.locator('.ant-dropdown:visible, .ant-dropdown-menu:visible').last();
    await this.expectUniqueVisible(menu, '门店调味批量动作菜单');
    await menu.getByText('删除', { exact: true }).click();
    const dialog = this.page.getByRole('dialog').last();
    await this.expectUniqueVisible(dialog, '门店调味批量删除确认弹窗');
    await this.cancelStoreDeleteDialog(dialog, '门店调味批量删除');
    if (await checkbox.isChecked()) await checkbox.uncheck();
  }
  // system-test-fingerprint:end seasoning-page-store-batch-delete-action-readiness

  // system-test-fingerprint:start seasoning-page-template-distribution-action-readiness
  @step('只读验证调味模板下发动作链：{templateName}')
  async verifyTemplateDistributionReadiness(templateName: string, storeId: string): Promise<void> {
    const listResponse = this.page.waitForResponse((candidate) => candidate.request().method() === 'GET'
      && new URL(candidate.url()).pathname.endsWith('/ops-brand/modifier-template/page')
      && candidate.ok(), { timeout: 30_000 });
    await this.page.goto('/pp/brand/seasoning/template', { waitUntil: 'domcontentloaded' });
    await listResponse;
    const identity = this.page.getByText(templateName, { exact: true });
    await this.expectUniqueVisibleOnly(identity, `调味模板 ${templateName}`);
    const card = identity.locator('xpath=ancestor::div[contains(@class,"card")][1]');
    const action = card.locator('button:visible');
    await this.expectUniqueVisibleOnly(action, `调味模板 ${templateName} 操作入口`);
    await identity.hover();
    await action.click();
    const menu = this.page.locator('.ant-dropdown:visible').last();
    await this.expectUniqueVisibleOnly(menu, `调味模板 ${templateName} 操作菜单`);
    const merchantResponse = this.page.waitForResponse((candidate) => candidate.request().method() === 'POST'
      && new URL(candidate.url()).pathname === '/item/v1/ops-brand/merchants/page'
      && candidate.ok(), { timeout: 30_000 });
    await menu.getByText('下发', { exact: true }).click();
    await merchantResponse;
    const dialog = this.page.getByRole('dialog').last();
    await this.expectUniqueVisible(dialog, '调味模板下发门店弹窗');
    const row = dialog.locator('tr:visible').filter({ hasText: storeId });
    await this.expectUniqueVisibleOnly(row, `目标门店 ${storeId}`);
    await this.expectUniqueVisible(row.locator('input[type="checkbox"]:visible'), `目标门店 ${storeId} 复选框`);
    await this.expectUniqueVisibleOnly(dialog.getByRole('button', { name: /^确\s*定$/ }), '模板下发确定按钮');
    const close = dialog.getByRole('button', { name: /^close$/i });
    await this.expectUniqueVisibleOnly(close, '模板下发关闭按钮');
    await close.click();
    await dialog.waitFor({ state: 'hidden', timeout: 5_000 });
  }
  // system-test-fingerprint:end seasoning-page-template-distribution-action-readiness

  // system-test-fingerprint:start seasoning-page-store-mutation-common
  private async storeOptionRow(groupName: string, optionName: string): Promise<Locator> {
    const groupTarget = this.main.getByText(groupName, { exact: true });
    await this.expectUniqueVisibleOnly(groupTarget, `门店调味组 ${groupName}`);
    const container = this.storeGroupContainer(groupTarget);
    await this.ensureStoreGroupExpanded(container, groupName);
    const option = container.getByText(optionName, { exact: true });
    await this.expectUniqueVisibleOnly(option, `门店调味项 ${optionName}`);
    const row = option.locator('xpath=ancestor::div[contains(concat(" ",normalize-space(@class)," ")," ant-table-row ")][1]');
    await this.expectUniqueVisibleOnly(row, `门店调味项 ${optionName} 所在行`);
    return row;
  }

  private async cancelStoreDeleteDialog(dialog: Locator, label: string): Promise<void> {
    const confirm = dialog.getByRole('button', { name: /^删\s*除$/ });
    await this.expectUniqueVisibleOnly(confirm, `${label}确认按钮`);
    if (await confirm.isDisabled()) throw new Error(`${label}确认按钮不可用`);
    const cancel = dialog.getByRole('button', { name: /^取\s*消$/ });
    await this.expectUniqueVisibleOnly(cancel, `${label}取消按钮`);
    await cancel.click();
    await dialog.waitFor({ state: 'hidden', timeout: 5_000 });
  }

  private storeGroupContainer(target: Locator): Locator {
    return target.locator('xpath=ancestor::div[contains(@class,"groupItemContainer")][1]');
  }

  private storeActionButton(container: Locator): Locator {
    return container.locator('button.ant-dropdown-trigger:visible');
  }

  private async ensureStoreGroupExpanded(container: Locator, groupName: string): Promise<void> {
    const animatedContent = container.locator('div[style*="grid-template-rows"]').first();
    const style = await animatedContent.getAttribute('style');
    if (style?.includes('0fr')) {
      const expandButton = container.getByRole('button', { name: 'down', exact: true });
      await this.expectUniqueVisible(expandButton, `门店调味组 ${groupName} 展开按钮`);
      await expandButton.click();
    }
    await waitUntil(
      () => animatedContent.getAttribute('style'),
      (value) => Boolean(value && !value.includes('0fr')),
      { timeout: 10_000, interval: 100, message: `门店调味组 ${groupName} 未展开` },
    );
  }

  private async waitForStoreIdentityAbsent(identity: string): Promise<void> {
    await waitUntil(
      async () => this.main.getByText(identity, { exact: true }).count(),
      (count) => count === 0,
      { timeout: 30_000, interval: 500, message: `门店调味页面仍显示已删除身份：${identity}` },
    );
  }
  // system-test-fingerprint:end seasoning-page-store-mutation-common

  @step('确保当前已在调味下发记录')
  async ensureRecordOpen(): Promise<void> {
    if (new URL(this.page.url()).pathname === '/pp/brand/seasoning/record'
      && await this.recordTaskNameInput.isVisible().catch(() => false)) return;
    await this.openRecord();
  }

  @step('打开调味下发记录')
  async openRecord(): Promise<void> {
    await executeReadOnlyUiWithTransientRetry(async () => {
      const response = this.page.waitForResponse((candidate) => (
        candidate.request().method() === 'POST'
        && new URL(candidate.url()).pathname.endsWith('/ops-brand/brand-modifier-sync/job/list')
        && candidate.ok()
      ), { timeout: 60_000 });
      await Promise.all([
        response,
        this.page.goto('/pp/brand/seasoning/record', { waitUntil: 'domcontentloaded' }),
      ]);
      await this.expectUniqueVisible(this.recordTaskNameInput, '下发记录任务名称查询框');
      await this.expectUniqueVisible(this.recordResetButton, '下发记录重置按钮');
    });
  }

  @step('读取下发记录筛选控件合同')
  async readRecordFilterContract(): Promise<{
    taskVisible: boolean;
    storeVisible: boolean;
    statusVisible: boolean;
    resetVisible: boolean;
    storeOptionCount: number;
    statusOptionCount: number;
  }> {
    await this.expectUniqueVisibleOnly(this.recordStoreFilter, '下发记录门店筛选控件');
    await this.expectUniqueVisibleOnly(this.recordStatusFilter, '下发记录状态筛选控件');
    const storeOptionCount = await this.readSelectOptionCount(this.recordStoreFilter);
    const statusOptionCount = await this.readSelectOptionCount(this.recordStatusFilter);
    return {
      taskVisible: await this.recordTaskNameInput.isVisible(),
      storeVisible: await this.recordStoreFilter.isVisible(),
      statusVisible: await this.recordStatusFilter.isVisible(),
      resetVisible: await this.recordResetButton.isVisible(),
      storeOptionCount,
      statusOptionCount,
    };
  }

  @step('执行下发记录组合查询')
  async searchRecordByCombinedFilters(): Promise<{
    taskName: string;
    store: string;
    status: string;
    resultRows: string[];
  }> {
    const firstRow = this.recordRows.first();
    await firstRow.waitFor({ state: 'visible' });
    const cells = firstRow.locator('td');
    const taskName = (await cells.nth(0).innerText()).trim();
    const store = (await cells.nth(1).innerText()).trim();
    const status = (await cells.nth(2).innerText()).trim();
    await this.replaceRecordTaskName(taskName);
    await this.selectRecordOption(this.recordStoreFilter, store.replace(/\s+/g, ' ').trim());
    await this.selectRecordOption(this.recordStatusFilter, status.replace(/\s+/g, ' ').trim());
    const response = this.page.waitForResponse((candidate) => (
      candidate.request().method() === 'POST'
      && new URL(candidate.url()).pathname.endsWith('/ops-brand/brand-modifier-sync/job/list')
    ), { timeout: 30_000 });
    await this.recordTaskNameInput.press('Enter');
    await response;
    await waitUntil(
      () => this.recordRows.filter({ hasText: taskName }).count(),
      (count) => count > 0,
      { timeout: 10_000, interval: 100, message: `组合查询结果未展示任务：${taskName}` },
    );
    return {
      taskName,
      store,
      status,
      resultRows: (await this.recordRows.filter({ hasText: taskName }).allInnerTexts()).map((value) => value.trim()),
    };
  }

  @step('打开下发记录门店明细')
  async openRecordStoreDetail(): Promise<{ rowText: string; dialogText: string; headers: string[] }> {
    const firstRow = this.recordRows.first();
    await firstRow.waitFor({ state: 'visible' });
    const storeCount = firstRow.locator('td').nth(1).getByText(/^\d+$/, { exact: true });
    await this.expectUniqueVisibleOnly(storeCount, '下发记录门店数入口');
    const rowText = await firstRow.innerText();
    await storeCount.click();
    const dialog = this.page.getByRole('dialog');
    await this.expectUniqueVisibleOnly(dialog, '下发记录门店明细弹窗');
    return {
      rowText,
      dialogText: await dialog.innerText(),
      headers: (await dialog.locator('thead th:visible').allInnerTexts()).map((value) => value.trim()).filter(Boolean),
    };
  }

  @step('读取当前调味下发记录任务名称')
  async readVisibleRecordTaskNames(): Promise<string[]> {
    return this.recordRows.locator('td').first().allInnerTexts();
  }

  @step('按任务名称查询调味下发记录：{taskName}')
  async searchRecordByTaskName(taskName: string): Promise<string[]> {
    const response = this.page.waitForResponse((candidate) => (
      candidate.request().method() === 'POST'
      && new URL(candidate.url()).pathname.endsWith('/ops-brand/brand-modifier-sync/job/list')
    ), { timeout: 30_000 });
    await this.replaceRecordTaskName(taskName);
    await settleInput();
    await response;
    // The list response can complete before the SPA commits the new table
    // state. Wait for the queried identity to become visible, then scope the
    // read to matching rows so stale rows from the previous result cannot be
    // treated as query output.
    await waitUntil(
      () => this.recordRows.filter({ hasText: taskName }).count(),
      (count) => count > 0,
      { timeout: 10_000, interval: 100, message: `下发记录查询结果未展示任务：${taskName}` },
    );
    return (await this.recordRows.filter({ hasText: taskName }).allInnerTexts())
      .map((value) => value.trim()).filter(Boolean);
  }

  @step('重置调味下发记录查询条件')
  async resetRecordTaskName(): Promise<{ before: string; after: string }> {
    await this.replaceRecordTaskName('AUTO_AUDIT_NON_EXISTING_TASK');
    // REC-005's formal flow is query -> inspect -> reset. Exercise the query
    // transition before resetting so the adapter matches the user workflow.
    await this.waitForRecordQuery();
    const before = await this.recordTaskNameInput.inputValue();
    const response = this.page.waitForResponse((candidate) => (
      candidate.request().method() === 'POST'
      && new URL(candidate.url()).pathname.endsWith('/ops-brand/brand-modifier-sync/job/list')
    ), { timeout: 30_000 });
    await this.recordResetButton.click();
    await response;
    // Preserve the observed value so the formal assertion can classify a
    // reproducible product defect instead of losing the evidence to a timeout.
    let after = await this.recordTaskNameInput.inputValue();
    try {
      after = await waitUntil(
        () => this.recordTaskNameInput.inputValue(),
        (value) => value === '',
        { timeout: 10_000, interval: 100, message: '读取下发记录重置后的任务名称' },
      );
    } catch {
      after = await this.recordTaskNameInput.inputValue().catch(() => after);
    }
    return { before, after };
  }

  private async replaceRecordTaskName(value: string): Promise<void> {
    await this.recordTaskNameInput.click();
    await this.recordTaskNameInput.press('ControlOrMeta+A');
    await this.recordTaskNameInput.pressSequentially(value, { delay: 15 });
    await settleInput();
  }

  private async waitForRecordQuery(): Promise<void> {
    const response = this.page.waitForResponse((candidate) => (
      candidate.request().method() === 'POST'
      && new URL(candidate.url()).pathname.endsWith('/ops-brand/brand-modifier-sync/job/list')
    ), { timeout: 30_000 });
    await this.recordTaskNameInput.press('Enter');
    await response;
  }

  private recordSelectByLabel(label: string): Locator {
    const text = this.main.locator('[class*="selectLabel"]:visible').filter({ hasText: new RegExp(`^${label}$`) });
    return text.locator('xpath=..').locator('xpath=..');
  }

  private inputFollowingLabel(label: string): Locator {
    const formItem = this.main.getByText(label, { exact: true })
      .locator('xpath=ancestor::*[contains(@class,"ant-form-item")][1]');
    return formItem.locator('input:visible').first();
  }

  private async inputInOptionColumn(label: string): Promise<Locator> {
    const table = this.main.locator('table:visible').first();
    const headers = (await table.locator('thead th:visible').allInnerTexts()).map((value) => value.trim());
    const columnIndex = headers.findIndex((value) => value === label);
    if (columnIndex < 0) throw new Error(`新增调味项表格缺少审计列：${label}`);
    return table.locator('tbody tr.ant-table-row:visible').first().locator('td').nth(columnIndex).locator('input:visible').first();
  }

  private async readSelectOptionCount(select: Locator): Promise<number> {
    await select.click();
    const options = this.page.locator('[role="option"]:visible, .ant-dropdown-menu-item:visible');
    const count = await options.count();
    await this.page.keyboard.press('Escape');
    return count;
  }

  private async selectRecordOption(select: Locator, label: string): Promise<void> {
    await select.click();
    const candidates = this.page.locator('[role="option"]:visible, .ant-dropdown-menu-item:visible').filter({ hasText: label });
    if (await candidates.count() > 0) {
      await candidates.first().click();
      return;
    }
    await this.page.keyboard.press('Escape');
  }

  private async expandIndustrySeasoningGroup(groupName: string): Promise<Locator> {
    const title = this.main.locator('div[class^="name___"]').filter({ hasText: exactTextPattern(groupName) });
    await this.expectUniqueVisibleOnly(title, `行业调味组标题 ${groupName}`);
    const group = title.locator('xpath=ancestor::div[contains(@class,"groupItemContainer___")][1]');
    await this.expectUniqueVisibleOnly(group, `行业调味组 ${groupName}`);
    const toggle = group.locator('div[class^="header___"]').getByRole('button');
    await this.expectUniqueVisible(toggle, `行业调味组 ${groupName} 展开按钮`);
    await toggle.click();
    return group;
  }

  private async selectIndustrySeasoningOptions(group: Locator, optionNames: readonly string[]): Promise<void> {
    for (const optionName of optionNames) {
      const row = group.locator('div.ant-table-row').filter({
        has: this.page.getByText(optionName, { exact: true }),
      });
      await this.expectUniqueVisibleOnly(row, `行业调味项 ${optionName} 所在行`);
      const option = row.locator('div.ant-table-cell').nth(1).getByText(optionName, { exact: true });
      await this.expectUniqueVisibleOnly(option, `行业调味项 ${optionName}`);
      const checkbox = row.getByRole('checkbox');
      await this.expectUniqueVisible(checkbox, `行业调味项 ${optionName} 选择框`);
      await checkbox.check();
    }
  }

  private async expectUniqueVisible(locator: Locator, description: string): Promise<void> {
    await waitUntil(
      async () => ({
        count: await locator.count(),
        visible: await locator.isVisible().catch(() => false),
        enabled: await locator.isEnabled().catch(() => false),
      }),
      (state) => state.count === 1 && state.visible && state.enabled,
      { timeout: 30_000, message: `${description}不可唯一操作` },
    );
  }

  private async expectUniqueVisibleOnly(locator: Locator, description: string): Promise<void> {
    await waitUntil(
      async () => ({ count: await locator.count(), visible: await locator.isVisible().catch(() => false) }),
      (state) => state.count === 1 && state.visible,
      { timeout: 30_000, message: `${description}不可唯一识别` },
    );
  }

  private readDistributionTargetPois(body: unknown): Array<{ poiId: string; poiName: string }> {
    if (!body || typeof body !== 'object' || Array.isArray(body)) return [];
    const targetPois = (body as Record<string, unknown>).targetPois;
    if (!Array.isArray(targetPois)) return [];
    return targetPois.flatMap((target) => {
      if (!target || typeof target !== 'object' || Array.isArray(target)) return [];
      const record = target as Record<string, unknown>;
      return typeof record.poiId === 'string' && typeof record.poiName === 'string'
        ? [{ poiId: record.poiId, poiName: record.poiName }]
        : [];
    });
  }
}

function exactTextPattern(value: string): RegExp {
  return new RegExp(`^${value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`);
}
