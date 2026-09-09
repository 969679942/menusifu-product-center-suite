import type { Locator, Page, Response } from '@playwright/test';
import { executeReadOnlyUiWithTransientRetry } from '../../api/transient-retry';

const listResponseByPath: Record<string, RegExp> = {
  '/pp/brand/spec': /brand-specs\/page/,
  '/pp/brand/option-group/taste': /brand-modifiers\/page/,
  '/pp/brand/option-group/method': /brand-modifiers\/page/,
  '/pp/brand/option-group/additional': /brand-addon-group\/list/,
  '/pp/brand/combo': /brand-sections\/list/,
};
const localizedListLabels: Record<string, { search: RegExp; table: RegExp }> = {
  '/pp/brand/spec': { search: /Specification Group Name|规格组名称/i, table: /Specification Group Name|规格组名称/i },
  '/pp/brand/option-group/taste': { search: /Flavor Group Name|口味组名称/i, table: /Flavor Group Name|口味组名称/i },
  '/pp/brand/option-group/method': { search: /Preparation Group Name|做法组名称/i, table: /Preparation Group Name|做法组名称/i },
  '/pp/brand/option-group/additional': { search: /Add-On Group Name|加料组名称/i, table: /Add-On Group Name|加料组名称/i },
};
import type { ProductManagementMenuItem } from '../../test-data/product-management';
import { step } from '../../utils/step';
import { settleInput } from '../../utils/input-settle';
import { updateCurrentProductCenterGroupProgressPhase } from '../../utils/product-center-group-progress';
import { waitUntil } from '../../utils/wait';
import { MerchantShellPage } from '../sidebar.page';

export class GroupListAccessError extends Error {
  constructor(readonly stage: 'forbidden', readonly currentUrl: string) {
    super(`组列表 UI 对账不可用：${stage}；url=${currentUrl}`);
    this.name = 'GroupListAccessError';
  }
}

export class GroupListPage extends MerchantShellPage {
  readonly searchInput: Locator;
  readonly searchClearButton: Locator;
  readonly addButton: Locator;
  readonly tableHeaderRow: Locator;
  readonly tableBodyRows: Locator;
  readonly emptyResults: Locator;
  readonly forbiddenTitle: Locator;
  readonly rowActionMenu: Locator;

  constructor(
    page: Page,
    private readonly menuItem: ProductManagementMenuItem,
  ) {
    super(page);
    this.searchInput = page.getByPlaceholder(
      menuItem.path === '/pp/brand/combo'
        ? /Combo group name|套餐组名称/i
        : localizedListLabels[menuItem.path]?.search ?? new RegExp(menuItem.searchPlaceholder, 'i'),
    );
    this.searchClearButton = page.getByRole('button', { name: 'close-circle' });
    this.addButton = page.getByRole('button', { name: /^(?:plus )?(Add|新增|添加)$/i });
    this.tableHeaderRow = page.locator('.ant-table-thead');
    this.tableBodyRows = page.locator('tbody tr.ant-table-row:visible');
    this.emptyResults = page.locator('.ant-empty:visible');
    this.forbiddenTitle = page.getByText('403 无权限', { exact: true });
    const rowMenuAnchor = menuItem.path === '/pp/brand/combo'
      ? page.getByRole('menuitem', { name: /Delete|删除$/i })
      : page.getByRole('menuitem', { name: /Edit|编辑$/i });
    this.rowActionMenu = rowMenuAnchor
      .locator('xpath=ancestor::*[@role="menu"][1]');
  }

  @step('打开组列表页')
  async open(): Promise<{ status: number; pathname: string }> {
    let readEvidence: { status: number; pathname: string } | undefined;
    await executeReadOnlyUiWithTransientRetry(
      async () => {
        const listResponse = this.page.waitForResponse((response) => (
          response.request().method() === 'GET'
          && (listResponseByPath[this.menuItem.path] ?? /ops-brand\//).test(new URL(response.url()).pathname)
          && response.status() >= 200
          && response.status() < 300
        ), { timeout: 30_000 });
        await this.page.goto(this.menuItem.path, { waitUntil: 'domcontentloaded' });
        const response = await listResponse;
        readEvidence = { status: response.status(), pathname: new URL(response.url()).pathname };
        await this.expectLoaded();
      },
      { onRetry: () => updateCurrentProductCenterGroupProgressPhase('read-retrying') },
    );
    if (!readEvidence) throw new Error(`${this.menuItem.pageName}列表缺少成功 GET 证据。`);
    return readEvidence;
  }

  @step('等待组列表页加载完成')
  async expectLoaded(): Promise<void> {
    await this.expectPathname(this.menuItem.path);
    const state = await waitUntil(
      async () => ({
        searchVisible: await this.searchInput.isVisible().catch(() => false),
        forbiddenVisible: await this.forbiddenTitle.isVisible().catch(() => false),
      }),
      (value) => value.searchVisible || value.forbiddenVisible,
      { timeout: 10_000, interval: 100, message: '组列表页未进入可操作或无权限终态。' },
    );
    if (state.forbiddenVisible) throw new GroupListAccessError('forbidden', this.page.url());
    await this.addButton.waitFor({ state: 'visible', timeout: 30_000 });
    const tableMarker = this.menuItem.path === '/pp/brand/combo'
      ? this.tableHeaderRow.getByText(/^(Combo Group|套餐组)$/i)
      : this.tableHeaderRow.getByText(
        localizedListLabels[this.menuItem.path]?.table ?? new RegExp(`^${this.menuItem.tableMarker}$`, 'i'),
      );
    await this.expectUniqueVisible(tableMarker, `表头 ${this.menuItem.tableMarker}`);
  }

  @step('按名称搜索：{keyword}')
  async search(keyword: string): Promise<void> {
    await this.searchInput.fill(keyword);
  }

  @step('按名称搜索并等待接口完成：{keyword}')
  async searchAndWait(keyword: string): Promise<void> {
    const currentKeyword = await this.searchInput.inputValue();
    if (currentKeyword === keyword && keyword === '') {
      await this.readVisibleResultCount();
      return;
    }
    if (currentKeyword === keyword) {
      const clearResponsePromise = this.page.waitForResponse((response) => (
        response.request().method() === 'GET'
        && (listResponseByPath[this.menuItem.path] ?? /ops-brand\//).test(new URL(response.url()).pathname)
        && response.status() >= 200
        && response.status() < 300
      ), { timeout: 30_000 });
      await this.search('');
      await clearResponsePromise;
    }
    const responsePromise = this.page.waitForResponse((response) => (
      response.request().method() === 'GET'
      && (listResponseByPath[this.menuItem.path] ?? /ops-brand\//).test(new URL(response.url()).pathname)
      && response.status() >= 200
      && response.status() < 300
    ), { timeout: 30_000 });
    await this.search(keyword);
    await responsePromise;
    await this.readVisibleResultCount();
  }

  @step('等待组列表搜索无结果')
  async expectEmptySearchResults(): Promise<void> {
    await waitUntil(
      () => this.tableBodyRows.count(),
      (count) => count === 0,
      { timeout: 15_000, message: '组列表搜索后仍存在数据行。' },
    );
    await this.emptyResults.waitFor({ state: 'visible', timeout: 10_000 });
  }

  @step('读取组列表当前可见结果数量')
  async readVisibleResultCount(): Promise<number> {
    return waitUntil(
      async () => ({
        count: await this.tableBodyRows.count(),
        emptyVisible: await this.emptyResults.isVisible().catch(() => false),
      }),
      (state) => state.count > 0 || state.emptyVisible,
      { timeout: 15_000, message: '组列表搜索结果未进入稳定终态。' },
    ).then((state) => state.count);
  }

  @step('读取组身份当前可见数量：{identity}')
  async readVisibleIdentityCount(identity: string): Promise<number> {
    return this.tableBodyRows.filter({ has: this.identityText(identity) }).count();
  }

  @step('等待组身份可见数量达到：{identity}，{expectedCount}')
  async waitForVisibleIdentityCount(identity: string, expectedCount: number): Promise<number> {
    return waitUntil(
      () => this.readVisibleIdentityCount(identity),
      (count) => count === expectedCount,
      { timeout: 15_000, message: `组身份 ${identity} 的 UI 数量未达到 ${expectedCount}。` },
    );
  }

  @step('点击添加')
  async clickAdd(): Promise<void> {
    await this.addButton.click();
  }
  @step('清空组列表搜索并等待结果稳定')
  async resetSearchAndWait(): Promise<void> {
    if (await this.searchClearButton.isVisible().catch(() => false)) {
      const responsePromise = this.page.waitForResponse((response) => (
        response.request().method() === 'GET'
        && (listResponseByPath[this.menuItem.path] ?? /ops-brand\//).test(new URL(response.url()).pathname)
        && response.status() >= 200
        && response.status() < 300
      ), { timeout: 30_000 });
      await this.searchClearButton.click();
      await responsePromise;
      await this.readVisibleResultCount();
      return;
    }
    await this.searchAndWait('');
  }

  @step('读取组列表首行名称')
  async readFirstVisibleIdentity(): Promise<string> {
    const row = this.tableBodyRows.first();
    await row.waitFor({ state: 'visible', timeout: 15_000 });
    const identityColumnIndex = 'identityColumnIndex' in this.menuItem ? this.menuItem.identityColumnIndex ?? 0 : 0;
    const identity = (await row.locator('td').nth(identityColumnIndex).innerText()).trim();
    if (!identity) throw new Error('组列表首行名称为空。');
    return identity;
  }

  @step('读取组列表当前可见行文本')
  async readVisibleRowTexts(): Promise<string[]> {
    return (await this.tableBodyRows.allTextContents()).map((value) => value.trim());
  }

  @step('读取组列表搜索框值')
  async readSearchValue(): Promise<string> {
    return this.searchInput.inputValue();
  }

  @step('定位组身份所在行：{identity}')
  async rowByIdentity(identity: string): Promise<Locator> {
    const row = this.tableBodyRows.filter({ has: this.identityText(identity) });
    await this.expectUniqueVisible(row, `组身份 ${identity} 所在行`);
    await row.waitFor({ state: 'visible', timeout: 15_000 });
    return row;
  }

  @step('打开组身份行操作菜单：{identity}')
  async openRowMenu(identity: string): Promise<Locator> {
    const row = await this.rowByIdentity(identity);
    const trigger = row.locator('.ant-dropdown-trigger:visible');
    await this.expectUniqueVisible(trigger, `组身份 ${identity} 的行操作入口`);
    await trigger.waitFor({ state: 'visible', timeout: 10_000 });
    await trigger.click();
    const menu = this.rowActionMenu;
    await this.expectUniqueVisible(menu, `组身份 ${identity} 的行操作菜单`);
    await menu.waitFor({ state: 'visible', timeout: 10_000 });
    return menu;
  }

  @step('校验组行菜单包含动作')
  async expectRowMenuActions(actions: RegExp): Promise<void> {
    const menu = this.rowActionMenu;
    await this.expectUniqueVisible(menu, '当前组行操作菜单');
    const matchingAction = menu.getByRole('menuitem').filter({ hasText: actions });
    if (await matchingAction.count() === 0) throw new Error(`组行菜单缺少动作：${actions}`);
  }

  @step('删除组并确认：{identity}')
  async deleteIdentityAndConfirm(identity: string): Promise<Response> {
    return (await this.deleteIdentityAndConfirmWithEvidence(identity)).response;
  }

  @step('删除组并采集确认弹窗证据：{identity}')
  async deleteIdentityAndConfirmWithEvidence(identity: string): Promise<{ response: Response; dialogText: string }> {
    const menu = await this.openRowMenu(identity);
    const deleteAction = menu.getByRole('menuitem', { name: /Delete$|删除$/i });
    await this.expectUniqueVisible(deleteAction, `组身份 ${identity} 的删除动作`);
    await deleteAction.click();
    const dialog = this.page.locator('[role=dialog]:visible');
    await this.expectUniqueVisible(dialog, `组身份 ${identity} 的删除确认弹窗`);
    const dialogText = (await dialog.innerText()).trim();
    const confirm = dialog.locator('button.ant-btn-primary:visible');
    await this.expectUniqueVisible(confirm, `组身份 ${identity} 的删除确认按钮`);
    const pathname = this.menuItem.path === '/pp/brand/spec'
      ? /\/brand-specs\/\d+$/
      : this.menuItem.path === '/pp/brand/option-group/additional'
        ? /\/brand-addon-group\/\d+$/
        : this.menuItem.path === '/pp/brand/combo'
          ? /\/brand-sections\/\d+$/
          : /\/brand-modifiers\/\d+$/;
    const responsePromise = this.page.waitForResponse((response) => (
      response.request().method() === 'DELETE'
      && pathname.test(new URL(response.url()).pathname)
    ), { timeout: 60_000 });
    await confirm.click();
    return { response: await responsePromise, dialogText };
  }

  @step('尝试删除组并采集拒绝证据：{identity}')
  async attemptDeleteIdentityAndCaptureRejection(identity: string): Promise<{
    status: number;
    responseBody: unknown;
    errorText: string;
  }> {
    const menu = await this.openRowMenu(identity);
    const deleteAction = menu.getByRole('menuitem', { name: /Delete$/i });
    await this.expectUniqueVisible(deleteAction, `组身份 ${identity} 的删除动作`);
    await deleteAction.click();
    const dialog = this.page.locator('[role=dialog]:visible');
    await this.expectUniqueVisible(dialog, `组身份 ${identity} 的删除确认弹窗`);
    const confirm = dialog.locator('button.ant-btn-primary:visible');
    await this.expectUniqueVisible(confirm, `组身份 ${identity} 的删除确认按钮`);
    const pathname = this.menuItem.path === '/pp/brand/spec'
      ? /\/brand-specs\/\d+$/
      : this.menuItem.path === '/pp/brand/option-group/additional'
        ? /\/brand-addon-group\/\d+$/
        : this.menuItem.path === '/pp/brand/combo'
          ? /\/brand-sections\/\d+$/
          : /\/brand-modifiers\/\d+$/;
    const responsePromise = this.page.waitForResponse((response) => (
      response.request().method() === 'DELETE'
      && pathname.test(new URL(response.url()).pathname)
    ), { timeout: 60_000 });
    await confirm.click();
    const response = await responsePromise;
    const responseBody = await response.json().catch(() => null);
    const messages = this.page.locator('.ant-message-error:visible, .ant-message-warning:visible, [role=alert]:visible');
    const errorText = (await messages.allTextContents()).map((value) => value.trim()).filter(Boolean).join(' | ');
    return { status: response.status(), responseBody, errorText };
  }

  @step('通过 UI 创建规格组并填写全部文本字段：{identity}')
  async createFullSpecificationGroup(identity: string): Promise<{
    response: Response;
    optionIdentity: string;
    values: Record<string, string>;
  }> {
    if (this.menuItem.path !== '/pp/brand/spec') throw new Error('仅规格组支持全字段创建。');
    const groupName = this.page.locator('input[aria-required="true"][type="text"]:visible');
    await this.expectUniqueVisible(groupName, '规格组名称字段');
    const topLevelFields = this.page.locator('main:visible .ant-form-item input[type="text"]:visible');
    await waitUntil(() => topLevelFields.count(), (count) => count === 3, {
      timeout: 10_000, interval: 100, message: '规格组顶部文本字段数量不是3。',
    });
    const values: Record<string, string> = {
      name: identity,
      secondName: `${identity}_ALT`.slice(0, 100),
      displayName: `${identity}_DISPLAY`.slice(0, 100),
      optionName: `${identity}_OPTION`.slice(0, 100),
      optionSecondName: `${identity}_OPTION_ALT`.slice(0, 100),
      specValue: 'SPEC_VALUE_001',
      deviceCode: 'DEVICE_CODE_001',
    };
    await topLevelFields.nth(0).fill(values.name);
    await topLevelFields.nth(1).fill(values.secondName);
    await topLevelFields.nth(2).fill(values.displayName);
    const advanced = this.page.locator('.ant-segmented-item-label:visible').filter({ hasText: /^Advanced$/ });
    await this.expectUniqueVisible(advanced, '规格组 Advanced 模式');
    await advanced.click();
    const table = this.specificationTable();
    await table.waitFor({ state: 'visible', timeout: 15_000 });
    const row = table.locator('tbody tr:visible').first();
    const cells = row.locator('td');
    await cells.nth(1).locator('input:visible').fill(values.optionName);
    await cells.nth(2).locator('input:visible').fill(values.optionSecondName);
    await cells.nth(3).locator('input:visible').fill(values.specValue);
    await cells.nth(5).locator('input:visible').fill(values.deviceCode);
    const submit = this.page.getByRole('button', { name: 'Confirm', exact: true });
    await waitUntil(() => submit.isEnabled(), (enabled) => enabled, {
      timeout: 10_000, interval: 100, message: '规格全字段填写后提交按钮仍不可用。',
    });
    const responsePromise = this.page.waitForResponse((response) => (
      response.request().method() === 'POST'
      && /\/brand-specs$/.test(new URL(response.url()).pathname)
      && response.ok()
    ), { timeout: 60_000 });
    await submit.click();
    return { response: await responsePromise, optionIdentity: values.optionName, values };
  }

  @step('编辑被引用规格明细全部同步字段：{optionIdentity}')
  async updateReferencedSpecificationOptionFields(
    optionIdentity: string,
  ): Promise<{
    response: Response;
    previousName: string;
    updatedFields: Record<'name' | 'secondName' | 'value' | 'deviceCode', string>;
    confirmationText: string;
  }> {
    if (!new URL(this.page.url()).pathname.includes('/spec/')) throw new Error('仅规格组支持规格明细全字段编辑。');
    const advanced = this.page.locator('.ant-segmented-item-label:visible').filter({ hasText: /^(Advanced|高级)$/i });
    if (await advanced.count() === 1) await advanced.click();
    const names = this.detailNameFields();
    const currentNames = await Promise.all(Array.from({ length: await names.count() }, (_, index) => names.nth(index).inputValue()));
    const optionIndex = currentNames.indexOf(optionIdentity);
    if (optionIndex < 0) throw new Error(`未找到待编辑规格明细：${optionIdentity}`);
    const row = names.nth(optionIndex).locator('xpath=ancestor::tr[1]');
    const cells = row.locator('td');
    const updatedFields = {
      name: `${optionIdentity}_SYNCED_${Date.now()}`.slice(0, 100),
      secondName: `${optionIdentity}_SECOND`.slice(0, 100),
      value: `VALUE_${Date.now()}`.slice(0, 20),
      deviceCode: `DEV${Date.now()}`.slice(-20),
    };
    await cells.nth(1).locator('input:visible').fill(updatedFields.name);
    await cells.nth(2).locator('input:visible').fill(updatedFields.secondName);
    await cells.nth(3).locator('input:visible').fill(updatedFields.value);
    const iconCell = cells.nth(4);
    const iconControl = iconCell.getByRole('button', { name: /cloud-upload/i });
    await iconControl.waitFor({ state: 'visible', timeout: 10_000 });
    await iconControl.click();
    const imageDialog = this.page.locator('[role="dialog"]:visible').filter({ hasText: /Select Image|选择图片/i });
    await this.expectUniqueVisible(imageDialog, '规格图标图库');
    const thumbnail = imageDialog.locator('img[alt]:visible').first();
    await thumbnail.waitFor({ state: 'visible', timeout: 10_000 });
    await thumbnail.click();
    const confirmImage = imageDialog.getByRole('button', { name: /^(Confirm|确\s*定)$/i });
    await this.expectUniqueVisible(confirmImage, '规格图标图库确认按钮');
    await waitUntil(() => confirmImage.isEnabled(), (enabled) => enabled, {
      timeout: 10_000, interval: 100, message: '选择规格图标后图库确认按钮仍不可用。',
    });
    await confirmImage.click();
    await imageDialog.waitFor({ state: 'hidden', timeout: 10_000 });
    await cells.nth(5).locator('input:visible').fill(updatedFields.deviceCode);
    const submit = this.page.getByRole('button', { name: /^(Confirm|确\s*定)$/i });
    await this.expectUniqueVisible(submit, '规格组编辑提交按钮');
    await waitUntil(() => submit.isEnabled(), (enabled) => enabled, {
      timeout: 15_000, interval: 100, message: '规格全字段更新后提交按钮仍不可用。',
    });
    const responsePromise = this.page.waitForResponse((response) => (
      response.request().method() === 'PUT'
      && /\/brand-specs\/\d+$/.test(new URL(response.url()).pathname)
    ), { timeout: 60_000 });
    await submit.click();
    const modificationDialog = this.page.locator('[role=dialog]:visible').filter({ hasText: /Confirm Modification|确认变更/i });
    let confirmationText = '';
    if (await modificationDialog.waitFor({ state: 'visible', timeout: 5_000 }).then(() => true).catch(() => false)) {
      confirmationText = (await modificationDialog.innerText()).trim();
      const confirm = modificationDialog.getByRole('button', { name: /^(Confirm Modification|确认修改)$/i });
      await this.expectUniqueVisible(confirm, '规格同步确认修改按钮');
      await confirm.click();
    }
    const response = await responsePromise;
    if (!response.ok()) throw new Error(`规格全字段编辑保存失败 HTTP ${response.status()}`);
    return { response, previousName: optionIdentity, updatedFields, confirmationText };
  }

  @step('提交无商品套餐组并采集拒绝证据：{identity}，{comboType}')
  async submitEmptyComboGroup(identity: string, comboType: 'Fixed Combo' | 'Optional Combo' | 'Pick & Mix'): Promise<{
    responseStatus: number | null;
    responseBody: unknown;
    errorText: string;
    pathname: string;
  }> {
    if (this.menuItem.path !== '/pp/brand/combo') throw new Error('仅套餐组支持无商品提交校验。');
    const surface = this.page.locator('main:visible');
    const groupName = surface.locator('input[aria-required="true"][type="text"]:visible');
    const submit = this.groupFormSubmitControl(surface);
    await this.expectUniqueVisible(groupName, '套餐组名称字段');
    await this.expectUniqueVisible(submit, '套餐组提交按钮');
    await groupName.fill(identity);
    await this.selectComboType(comboType);
    await waitUntil(() => submit.isEnabled(), (enabled) => enabled, {
      timeout: 10_000, interval: 100, message: `选择 ${comboType} 后套餐提交按钮仍不可用。`,
    });
    let responseStatus: number | null = null;
    let responseBody: unknown = null;
    const listener = async (response: Response) => {
      if (response.request().method() !== 'POST' || !/\/brand-sections$/.test(new URL(response.url()).pathname)) return;
      responseStatus = response.status();
      responseBody = await response.json().catch(() => null);
    };
    this.page.on('response', listener);
    await submit.click();
    const messages = this.page.locator('.ant-form-item-explain-error:visible, .ant-message-error:visible, [role=alert]:visible');
    const terminal = await waitUntil(
      async () => ({
        responseStatus,
        pathname: new URL(this.page.url()).pathname,
        messages: (await messages.allTextContents()).map((value) => value.trim()).filter(Boolean),
      }),
      (state) => state.responseStatus !== null || state.messages.length > 0 || state.pathname === this.menuItem.path,
      { timeout: 30_000, interval: 100, message: `${comboType} 无商品提交未进入拒绝或保存终态。` },
    );
    this.page.off('response', listener);
    return {
      responseStatus: terminal.responseStatus,
      responseBody,
      errorText: terminal.messages.join(' | '),
      pathname: terminal.pathname,
    };
  }

  @step('验证套餐组名称必填且不产生创建请求')
  async expectComboNameRequiredValidation(probeIdentity: string): Promise<void> {
    if (this.menuItem.path !== '/pp/brand/combo') throw new Error('仅套餐组支持套餐名称必填校验。');
    const surface = this.page.locator('main:visible');
    const groupName = surface.locator('input[aria-required="true"][type="text"]:visible');
    const submit = this.groupFormSubmitControl(surface);
    await this.expectUniqueVisible(groupName, '套餐组名称字段');
    await this.expectUniqueVisible(submit, '套餐组提交按钮');

    await groupName.fill(probeIdentity);
    await groupName.fill('');
    await this.selectComboType('Optional Combo');
    await settleInput();
    if (await submit.isEnabled()) await submit.click();
    await this.expectFieldErrorOrNativeInvalid(
      groupName,
      /Please enter|Required|name/i,
      '套餐组名称必填错误',
    );
    if (!new URL(this.page.url()).pathname.endsWith('/create')) {
      throw new Error('套餐组名称缺失提交后未停留在新增页。');
    }
  }

  @step('选择套餐类型：{comboType}')
  async selectComboType(comboType: 'Fixed Combo' | 'Optional Combo' | 'Pick & Mix'): Promise<void> {
    if (this.menuItem.path !== '/pp/brand/combo') throw new Error('仅套餐组支持套餐类型选择。');
    const surface = this.page.locator('main:visible');
    const comboTypeLabel = comboType === 'Fixed Combo'
      ? /^(Fixed Combo|固定搭配)/i
      : comboType === 'Optional Combo'
        ? /^(Optional Combo|可选搭配)/i
        : /^(Pick & Mix|随心配)/i;
    const radioLabel = surface.locator('label.ant-radio-wrapper:visible')
      .filter({ hasText: comboTypeLabel });
    if (await radioLabel.count() === 1) {
      const radio = radioLabel.locator('input[type="radio"]');
      await radioLabel.click();
      await waitUntil(() => radio.isChecked(), (checked) => checked, {
        timeout: 10_000,
        interval: 100,
        message: `套餐类型 ${comboType} 单选项未选中。`,
      });
      return;
    }
    const comboSelect = surface.locator('.ant-select:visible');
    await this.expectUniqueVisible(comboSelect, '套餐类型选择框');
    await comboSelect.click();
    const dropdown = this.page.locator('.ant-select-dropdown:visible');
    await this.expectUniqueVisible(dropdown, '套餐类型下拉框');
    const option = dropdown.locator('.ant-select-item-option:visible').filter({ hasText: comboTypeLabel });
    await this.expectUniqueVisible(option, `套餐类型 ${comboType}`);
    await option.click();
  }

  @step('在加料商品选择页搜索并设置商品选中状态：{identity}，{selected}')
  async setAddonProductSelection(identity: string, selected: boolean, keepOpen = false): Promise<{
    identity: string;
    searchValue: string;
    checked: boolean;
  }> {
    if (this.menuItem.path !== '/pp/brand/option-group/additional') throw new Error('仅加料组支持加料商品选择。');
    const overlay = await this.openProductSelectionOverlay();
    const search = overlay.getByPlaceholder('Item Name');
    await this.expectUniqueVisible(search, '加料商品名称搜索框');
    await search.fill(identity);
    const row = overlay.getByRole('row', { name: new RegExp(escapeRegex(identity)) });
    await this.expectUniqueVisible(row, `加料商品 ${identity} 所在行`);
    const checkbox = row.getByRole('checkbox');
    await this.expectUniqueVisible(checkbox, `加料商品 ${identity} 复选框`);
    if (selected && !await checkbox.isChecked()) await checkbox.check();
    if (!selected && await checkbox.isChecked()) await checkbox.uncheck();
    const evidence = { identity, searchValue: await search.inputValue(), checked: await checkbox.isChecked() };
    if (!keepOpen) await this.confirmProductSelection(overlay);
    return evidence;
  }

  @step('在当前加料商品选择页搜索并设置商品选中状态：{identity}，{selected}')
  async setAddonProductSelectionInOpenOverlay(identity: string, selected: boolean): Promise<{
    identity: string;
    searchValue: string;
    checked: boolean;
  }> {
    const overlay = this.productSelectionOverlay();
    await this.expectUniqueVisible(overlay, '当前加料商品选择弹层');
    const search = overlay.getByPlaceholder('Item Name');
    await search.fill(identity);
    const row = overlay.getByRole('row', { name: new RegExp(escapeRegex(identity)) });
    await this.expectUniqueVisible(row, `加料商品 ${identity} 所在行`);
    const checkbox = row.getByRole('checkbox');
    await this.expectUniqueVisible(checkbox, `加料商品 ${identity} 复选框`);
    if (selected && !await checkbox.isChecked()) await checkbox.check();
    if (!selected && await checkbox.isChecked()) await checkbox.uncheck();
    return { identity, searchValue: await search.inputValue(), checked: await checkbox.isChecked() };
  }

  @step('确认当前商品选择结果')
  async confirmOpenProductSelection(): Promise<void> {
    const overlay = this.productSelectionOverlay();
    await this.expectUniqueVisible(overlay, '当前商品选择弹层');
    await this.confirmProductSelection(overlay);
  }

  @step('在套餐商品选择页精确选择商品：{identity}')
  async selectComboProduct(
    identity: string,
    categoryName: string,
    options: { preserveExistingIdentities?: readonly string[] } = {},
  ): Promise<{
    identity: string;
    searchValue: string;
    checked: boolean;
    categorySelected: boolean;
    confirmDisabledBeforeSelection: boolean;
    rowText: string;
  }> {
    if (this.menuItem.path !== '/pp/brand/combo') throw new Error('仅套餐组支持套餐商品选择。');
    const preservedIdentities = [...(options.preserveExistingIdentities ?? [])];
    if (preservedIdentities.length > 0) await this.expectSelectedProducts(preservedIdentities);
    const overlay = await this.openProductSelectionOverlay();
    const confirm = overlay.getByRole('button', { name: /^(Confirm|确\s*定)$/i });
    await this.expectUniqueVisible(confirm, '套餐商品选择确认按钮');
    const confirmDisabledBeforeSelection = await confirm.isDisabled();
    const categoryNode = overlay.getByRole('treeitem', {
      name: new RegExp(`Select tree node ${escapeRegex(categoryName)}$`),
    });
    await this.expectUniqueVisible(categoryNode, `套餐商品分类 ${categoryName}`);
    const categoryTitle = categoryNode.getByText(categoryName, { exact: true });
    await this.expectUniqueVisible(categoryTitle, `套餐商品分类 ${categoryName} 标题`);
    await categoryTitle.click();
    const search = overlay.getByPlaceholder(/Product Name|商品名称/i);
    await this.expectUniqueVisible(search, '套餐商品名称搜索框');
    let rowText = '', targetChecked = false;
    for (const selectedIdentity of [identity]) {
      const identityText = overlay.getByText(selectedIdentity, { exact: true }).filter({ visible: true });
      await waitUntil(
        async () => {
          await search.fill('');
          await search.fill(selectedIdentity);
          return identityText.count();
        },
        (count) => count === 1,
        {
          timeout: selectedIdentity === identity ? 60_000 : 15_000,
          interval: selectedIdentity === identity ? 1_000 : 100,
          message: `套餐商品 ${selectedIdentity} 尚未进入选择索引`,
        },
      );
      await identityText.waitFor({ state: 'visible', timeout: 10_000 });
      const row = identityText.locator('xpath=ancestor::*[.//input[@type="checkbox"]][1]');
      await this.expectUniqueVisible(row, `套餐商品 ${selectedIdentity} 所在行`);
      const checkbox = row.getByRole('checkbox');
      await this.expectUniqueVisible(checkbox, `套餐商品 ${selectedIdentity} 复选框`);
      if (selectedIdentity === identity) rowText = (await row.innerText()).trim();
      if (!await checkbox.isChecked()) await checkbox.check();
      if (selectedIdentity === identity) targetChecked = await checkbox.isChecked();
    }
    const evidence = {
      identity,
      searchValue: await search.inputValue(),
      checked: targetChecked,
      categorySelected: true,
      confirmDisabledBeforeSelection,
      rowText,
    };
    await this.confirmProductSelection(overlay);
    await this.expectSelectedProducts([...preservedIdentities, identity]);
    return evidence;
  }
  @step('在套餐商品选择页选择多规格商品全部规格：{identity}')
  async selectAllComboProductSkus(identity: string, categoryName: string): Promise<number> {
    if (this.menuItem.path !== '/pp/brand/combo') throw new Error('仅套餐组支持多规格商品选择。');
    const overlay = await this.openProductSelectionOverlay();
    const categoryNode = overlay.getByRole('treeitem', {
      name: new RegExp(`Select tree node ${escapeRegex(categoryName)}$`),
    });
    await this.expectUniqueVisible(categoryNode, `套餐商品分类 ${categoryName}`);
    const categoryCheckbox = categoryNode.getByRole('checkbox', { name: 'Select tree node' });
    await this.expectUniqueVisible(categoryCheckbox, `套餐商品分类 ${categoryName} 复选框`);
    if (!await categoryCheckbox.isChecked()) await categoryCheckbox.check();
    const search = overlay.getByPlaceholder('Product Name');
    await this.expectUniqueVisible(search, '套餐商品名称搜索框');
    await search.fill(identity);
    const identityText = overlay.getByText(identity, { exact: true });
    await waitUntil(() => identityText.count(), (count) => count > 0, {
      timeout: 15_000,
      interval: 100,
      message: `套餐多规格商品 ${identity} 未出现在商品表`,
    });
    const selectAll = overlay.getByRole('checkbox', { name: 'Select all' });
    await this.expectUniqueVisible(selectAll, '套餐商品全选复选框');
    await waitUntil(() => selectAll.isChecked(), (checked) => checked, {
      timeout: 15_000,
      interval: 100,
      message: `套餐分类 ${categoryName} 未自动选中商品表`,
    });
    await this.confirmProductSelection(overlay);
    return this.countSelectedProductRows(identity);
  }
  @step('在套餐商品选择页选择商品并保持弹层打开：{identity}')
  async selectComboProductAndKeepOverlayOpen(identity: string, categoryName: string): Promise<void> {
    if (this.menuItem.path !== '/pp/brand/combo') throw new Error('仅套餐组支持套餐商品选择。');
    const overlay = await this.openProductSelectionOverlay();
    const categoryNode = overlay.getByRole('treeitem', {
      name: new RegExp(`Select tree node ${escapeRegex(categoryName)}$`),
    });
    await this.expectUniqueVisible(categoryNode, `套餐商品分类 ${categoryName}`);
    const categoryCheckbox = categoryNode.getByRole('checkbox', { name: 'Select tree node' });
    await this.expectUniqueVisible(categoryCheckbox, `套餐商品分类 ${categoryName} 复选框`);
    if (!await categoryCheckbox.isChecked()) await categoryCheckbox.check();
    const selectAll = overlay.getByRole('checkbox', { name: 'Select all' });
    await this.expectUniqueVisible(selectAll, '套餐商品全选复选框');
    if (await selectAll.isChecked()) await selectAll.uncheck();
    const search = overlay.getByPlaceholder('Product Name');
    await this.expectUniqueVisible(search, '套餐商品名称搜索框');
    await search.fill(identity);
    const identityText = overlay.getByText(identity, { exact: true });
    await this.expectUniqueVisible(identityText, `套餐商品 ${identity}`);
    const checkbox = overlay.locator('input[type="checkbox"]:visible:not([aria-label="Select all"]):not([aria-label="Select tree node"])');
    await this.expectUniqueVisible(checkbox, `套餐商品 ${identity} 复选框`);
    if (!await checkbox.isChecked()) await checkbox.check();
  }

  @step('取消当前商品选择弹层')
  async cancelOpenProductSelection(): Promise<void> {
    const overlay = this.productSelectionOverlay();
    await this.expectUniqueVisible(overlay, '当前商品选择弹层');
    await this.page.keyboard.press('Escape');
    await overlay.waitFor({ state: 'hidden', timeout: 10_000 });
  }

  @step('验证组表单仅包含目标已选商品')
  async expectSelectedProducts(included: readonly string[], excluded: readonly string[] = []): Promise<void> {
    const surface = this.page.locator('main:visible');
    await waitUntil(
      async () => ({
        included: await Promise.all(included.map((identity) => surface.getByText(identity, { exact: true }).count())),
        excluded: await Promise.all(excluded.map((identity) => surface.getByText(identity, { exact: true }).count())),
      }),
      (state) => state.included.every((count) => count === 1) && state.excluded.every((count) => count === 0),
      {
        timeout: 30_000,
        interval: 250,
        message: `组表单商品回显未稳定：${JSON.stringify({ included, excluded })}`,
      },
    );
  }

  @step('删除加料组商品行并保存：{identity}')
  async deleteAddonProductRowAndSave(identity: string): Promise<{
    responses: Response[];
    confirmationText: string;
    errorText: string;
    rowRemoved: boolean;
  }> {
    if (this.menuItem.path !== '/pp/brand/option-group/additional') throw new Error('仅加料组支持商品行删除。');
    const identityText = this.page.locator('main:visible').getByText(identity, { exact: true });
    await this.expectUniqueVisible(identityText, `加料商品 ${identity}`);
    const row = identityText.locator('xpath=ancestor::tr[1]');
    await this.expectUniqueVisible(row, `加料商品 ${identity} 所在行`);
    const deleteButton = row.getByRole('button', { name: 'delete', exact: true });
    await this.expectUniqueVisible(deleteButton, `加料商品 ${identity} 行删除按钮`);
    const responses: Response[] = [];
    let lastMutationAt = 0;
    const collectMutation = (response: Response) => {
      const method = response.request().method();
      const pathname = new URL(response.url()).pathname;
      if (['DELETE', 'PUT', 'PATCH'].includes(method)
        && (/\/brand-addon-group-item\/\d+\/?$/.test(pathname)
          || /\/brand-addon-group\/(?:check\/)?\d+\/?$/.test(pathname))) {
        responses.push(response);
        lastMutationAt = Date.now();
      }
    };
    this.page.on('response', collectMutation);
    await deleteButton.click();
    const dialog = this.page.locator('[role=dialog]:visible');
    const error = this.page.locator('.ant-message-error:visible, [role=alert]:visible');
    let confirmationText = '';
    const firstState = await waitUntil(
      async () => ({ dialogs: await dialog.count(), rows: await row.count(), errors: await error.count() }),
      (state) => state.dialogs === 1 || state.rows === 0 || state.errors > 0,
      { timeout: 10_000, interval: 100, message: `加料商品 ${identity} 删除动作无可验证终态` },
    );
    if (firstState.dialogs === 1) {
      confirmationText = (await dialog.innerText()).trim();
      const confirm = dialog.locator('button.ant-btn-primary:visible').last();
      await this.expectUniqueVisible(confirm, '加料商品删除确认按钮');
      await confirm.click();
      await waitUntil(
        async () => ({ dialogs: await dialog.count(), rows: await row.count(), errors: await error.count() }),
        (state) => state.dialogs === 0 || state.rows === 0 || state.errors > 0,
        { timeout: 10_000, interval: 100, message: `加料商品 ${identity} 确认删除后无可验证终态` },
      );
    }
    const errorText = (await error.allTextContents()).map((value) => value.trim()).filter(Boolean).join(' | ');
    const rowRemoved = await row.count() === 0;
    if (!rowRemoved) {
      this.page.off('response', collectMutation);
      return { responses, confirmationText, errorText, rowRemoved };
    }
    const submit = this.groupFormSubmitControl();
    await this.expectUniqueVisible(submit, '加料组编辑提交按钮');
    const responsePromise = this.page.waitForResponse((response) => (
      ['PUT', 'PATCH'].includes(response.request().method())
      && /\/brand-addon-group\/(?:check\/)?\d+\/?$/.test(new URL(response.url()).pathname)
    ), { timeout: 60_000 }).catch(() => null);
    await submit.click();
    const response = await responsePromise;
    if (response && !responses.includes(response)) responses.push(response);
    if (response && /\/brand-addon-group\/check\/\d+\/?$/.test(new URL(response.url()).pathname)) {
      const changeDialog = this.page.locator('[role=dialog]:visible');
      await this.expectUniqueVisible(changeDialog, '加料组变更预览弹窗');
      confirmationText = (await changeDialog.innerText()).trim();
      const applyChange = changeDialog.getByRole('button', { name: 'Confirm Modification', exact: true });
      await this.expectUniqueVisible(applyChange, '加料组变更预览确认按钮');
      const updatePromise = this.page.waitForResponse((candidate) => (
        ['PUT', 'PATCH'].includes(candidate.request().method())
        && /\/brand-addon-group\/\d+\/?$/.test(new URL(candidate.url()).pathname)
      ), { timeout: 60_000 });
      await applyChange.click();
      const updateResponse = await updatePromise;
      if (!responses.includes(updateResponse)) responses.push(updateResponse);
    }
    if (response) {
      if (lastMutationAt === 0) lastMutationAt = Date.now();
      await waitUntil(
        () => Date.now() - lastMutationAt,
        (quietFor) => quietFor >= 1_000,
        { timeout: 10_000, interval: 100, message: `加料商品 ${identity} 保存请求未稳定` },
      );
    }
    this.page.off('response', collectMutation);
    const submitErrorText = (await error.allTextContents()).map((value) => value.trim()).filter(Boolean).join(' | ');
    return {
      responses,
      confirmationText,
      errorText: [errorText, submitErrorText].filter(Boolean).join(' | '),
      rowRemoved,
    };
  }

  @step('删除加料商品并处理变更预览：{identity} / {decision}')
  async deleteAddonProductRowWithPreview(
    identity: string,
    decision: 'cancel' | 'confirm',
  ): Promise<{ previewText: string; responses: Response[]; saved: boolean }> {
    if (this.menuItem.path !== '/pp/brand/option-group/additional') throw new Error('仅加料组支持变更预览。');
    const identityText = this.page.locator('main:visible').getByText(identity, { exact: true });
    await this.expectUniqueVisible(identityText, `加料商品 ${identity}`);
    const row = identityText.locator('xpath=ancestor::tr[1]');
    const deleteButton = row.getByRole('button', { name: 'delete', exact: true });
    await this.expectUniqueVisible(deleteButton, `加料商品 ${identity} 行删除按钮`);
    await deleteButton.click();
    const dialog = this.page.locator('[role=dialog]:visible');
    if (await dialog.count() === 1) {
      const localConfirm = dialog.getByRole('button', { name: /^(Confirm|OK|确定|确认)$/i });
      if (await localConfirm.count() === 1) {
        await localConfirm.click();
        await dialog.waitFor({ state: 'hidden', timeout: 10_000 });
      }
    }
    await row.waitFor({ state: 'detached', timeout: 10_000 });
    const responses: Response[] = [];
    const collect = (response: Response) => {
      const pathname = new URL(response.url()).pathname;
      if (['PUT', 'PATCH'].includes(response.request().method())
        && /\/brand-addon-group\/(?:check\/)?\d+\/?$/.test(pathname)) responses.push(response);
    };
    this.page.on('response', collect);
    try {
      const submit = this.page.locator('main:visible').getByRole('button', { name: 'Confirm', exact: true });
      await submit.click();
      await this.expectUniqueVisible(dialog, '加料组变更预览弹窗');
      const previewText = (await dialog.innerText()).trim();
      if (decision === 'cancel') {
        const cancel = dialog.getByRole('button', { name: /^(Cancel|取消)$/i });
        await this.expectUniqueVisible(cancel, '加料组变更预览取消按钮');
        await cancel.click();
        await dialog.waitFor({ state: 'hidden', timeout: 10_000 });
        return { previewText, responses, saved: false };
      }
      const confirm = dialog.getByRole('button', { name: 'Confirm Modification', exact: true });
      await this.expectUniqueVisible(confirm, '加料组变更预览确认按钮');
      await confirm.click();
      await waitUntil(
        async () => ({
          saved: responses.some((response) => response.ok() && /\/brand-addon-group\/\d+\/?$/.test(new URL(response.url()).pathname)),
          list: new URL(this.page.url()).pathname === this.menuItem.path,
        }),
        (state) => state.saved && state.list,
        { timeout: 60_000, interval: 100, message: '加料组删除确认未形成成功接口和列表终态' },
      );
      return { previewText, responses, saved: true };
    } finally {
      this.page.off('response', collect);
    }
  }

  @step('保存加料组编辑并读取变更请求：{identity}')
  async saveAddonGroupEditAndReadMutation(): Promise<{ responses: Response[]; confirmationTexts: string[] }> {
    if (this.menuItem.path !== '/pp/brand/option-group/additional') throw new Error('仅加料组支持编辑保存。');
    const responses: Response[] = [];
    const confirmationTexts: string[] = [];
    const collect = (response: Response) => {
      const pathname = new URL(response.url()).pathname;
      if (['PUT', 'PATCH'].includes(response.request().method())
        && /\/brand-addon-group\/(?:check\/)?\d+\/?$/.test(pathname)) responses.push(response);
    };
    this.page.on('response', collect);
    try {
      const submit = this.page.locator('main:visible').getByRole('button', { name: 'Confirm', exact: true });
      await this.expectUniqueVisible(submit, '加料组编辑提交按钮');
      await submit.click();
      const dialog = this.page.locator('[role=dialog]:visible');
      for (let confirmationIndex = 0; confirmationIndex < 4; confirmationIndex += 1) {
        const state = await waitUntil(
          async () => ({
            dialogCount: await dialog.count(),
            saved: responses.some((response) => response.ok() && /\/brand-addon-group\/\d+\/?$/.test(new URL(response.url()).pathname)),
            returnedToList: new URL(this.page.url()).pathname === this.menuItem.path,
          }),
          (value) => value.dialogCount === 1 || value.saved || value.returnedToList,
          { timeout: 30_000, interval: 100, message: '加料组编辑未进入变更确认或保存终态' },
        );
        if (state.saved || state.returnedToList) break;
        const beforeText = (await dialog.innerText()).trim();
        confirmationTexts.push(beforeText);
        const namedConfirm = dialog.getByRole('button', { name: 'Confirm Modification', exact: true });
        const primary = await namedConfirm.count() === 1 ? namedConfirm : dialog.locator('button.ant-btn-primary:visible');
        await this.expectUniqueVisible(primary, `加料组第 ${confirmationIndex + 1} 层确认按钮`);
        await waitUntil(
          () => primary.click({ trial: true }).then(() => true).catch(() => false),
          (ready) => ready,
          { timeout: 30_000, interval: 100, message: `加料组第 ${confirmationIndex + 1} 层确认按钮未进入可点击状态` },
        );
        await primary.click();
        await waitUntil(
          async () => {
            const dialogTexts = await dialog.allInnerTexts();
            return {
              dialogCount: dialogTexts.length,
              dialogText: dialogTexts.length === 1 ? dialogTexts[0].trim() : '',
              saved: responses.some((response) => response.ok() && /\/brand-addon-group\/\d+\/?$/.test(new URL(response.url()).pathname)),
              returnedToList: new URL(this.page.url()).pathname === this.menuItem.path,
            };
          },
          (value) => value.dialogCount === 0 || value.dialogText !== beforeText || value.saved || value.returnedToList,
          { timeout: 30_000, interval: 100, message: `加料组第 ${confirmationIndex + 1} 层确认后无状态变化` },
        );
      }
      await waitUntil(
        async () => ({
          saved: responses.some((response) => response.ok() && /\/brand-addon-group\/\d+\/?$/.test(new URL(response.url()).pathname)),
          list: new URL(this.page.url()).pathname === this.menuItem.path,
        }),
        (value) => value.saved && value.list,
        { timeout: 60_000, interval: 100, message: '加料组编辑未形成成功接口和列表终态' },
      );
      await this.expectLoaded();
      return { responses, confirmationTexts };
    } finally {
      this.page.off('response', collect);
    }
  }

  @step('读取组表单中目标商品的已选规格行数：{identity}')
  async countSelectedProductRows(identity: string): Promise<number> {
    const surface = this.page.locator('main:visible');
    const tables = surface.locator('table:visible');
    const matchingTableIndexes = await waitUntil(
      () => tables.evaluateAll((elements, target) => elements
        .map((element, index) => (element.textContent ?? '').includes(String(target)) ? index : -1)
        .filter((index) => index >= 0), identity),
      (indexes) => indexes.length === 1,
      {
        timeout: 15_000,
        interval: 100,
        message: `组选中商品 ${identity} 未找到唯一规格表格`,
      },
    );
    const table = tables.nth(matchingTableIndexes[0]);
    await this.expectUniqueVisible(table, `组选中商品 ${identity} 表格`);
    return table.locator('tbody tr:visible').count();
  }

  @step('填写组名称：{identity}')
  async fillGroupName(identity: string): Promise<string> {
    const groupName = this.page.locator('main:visible input[aria-required="true"][type="text"]:visible');
    await this.expectUniqueVisible(groupName, '组名称字段');
    await groupName.fill(identity);
    return groupName.inputValue();
  }

  @step('填写套餐组全部文本字段：{identity}')
  async fillComboAllTextFields(identity: string): Promise<{ name: string; secondName: string; description: string }> {
    if (this.menuItem.path !== '/pp/brand/combo') throw new Error('仅套餐组支持套餐全字段填写。');
    const surface = this.page.locator('main:visible');
    const requiredName = surface.getByText('Combo Group Name', { exact: true })
      .locator('xpath=ancestor::div[contains(@class,"ant-form-item")][1]')
      .locator('input[aria-required="true"][type="text"]:visible');
    await this.expectUniqueVisible(requiredName, '套餐组名称字段');
    const alternateName = surface.getByText('Combo Group Name (Alt.Language)', { exact: true })
      .locator('xpath=ancestor::div[contains(@class,"ant-form-item")][1]')
      .locator('input[type="text"]:visible');
    await this.expectUniqueVisible(alternateName, '套餐组备用语言字段');
    const textareas = surface.locator('textarea:visible');
    await this.expectUniqueVisible(textareas, '套餐组描述字段');
    const values = {
      name: identity,
      secondName: `${identity}_ALT`.slice(0, 100),
      description: `${identity}_DESCRIPTION`.slice(0, 250),
    };
    await requiredName.fill(values.name);
    await alternateName.fill(values.secondName);
    await textareas.fill(values.description);
    return {
      name: await requiredName.inputValue(),
      secondName: await alternateName.inputValue(),
      description: await textareas.inputValue(),
    };
  }

  @step('填写加料组数量规则：最少 {minimum}，最多 {maximum}，免费 {freeQuantity}')
  async fillAddonQuantityRules(minimum: number, maximum: number, freeQuantity: number): Promise<void> {
    if (this.menuItem.path !== '/pp/brand/option-group/additional') throw new Error('仅加料组支持加料数量规则。');
    const fields = this.page.locator('main:visible input[placeholder="items"][role="spinbutton"]:visible');
    await waitUntil(() => fields.count(), (count) => count === 3, {
      timeout: 10_000,
      interval: 100,
      message: '加料组数量规则字段数量不是3。',
    });
    await fields.nth(0).fill(String(minimum));
    await fields.nth(1).fill(String(maximum));
    await fields.nth(2).fill(String(freeQuantity));
  }

  @step('读取加料组数量规则')
  async readAddonQuantityRules(): Promise<{
    minimum: string;
    maximum: string;
    freeQuantity: string;
  }> {
    if (this.menuItem.path !== '/pp/brand/option-group/additional') throw new Error('仅加料组支持读取加料数量规则。');
    const fields = this.page.locator('main:visible input[placeholder="items"][role="spinbutton"]:visible');
    return waitUntil(async () => ({
      count: await fields.count(),
      values: await fields.evaluateAll((inputs) => inputs.map((input) => (input as HTMLInputElement).value)),
    }), (state) => state.count === 3 && state.values.every((value) => value !== ''), {
      timeout: 10_000,
      interval: 100,
      message: '加料组数量规则字段未完成回填。',
    }).then((state) => ({
      minimum: state.values[0],
      maximum: state.values[1],
      freeQuantity: state.values[2],
    }));
  }

  @step('填写加料组内商品规则：{identity}，最少 {minimum}，最多 {maximum}，单次加价 {singleSurcharge}')
  async fillAddonItemRules(identity: string, minimum: string, maximum: string, singleSurcharge: string): Promise<{
    minimum: string;
    maximum: string;
    singleSurcharge: string;
  }> {
    const fields = await this.addonItemRuleFields(identity);
    await fields.nth(0).fill(minimum);
    await fields.nth(1).fill(maximum);
    await fields.nth(2).fill(singleSurcharge);
    return {
      minimum: await fields.nth(0).inputValue(),
      maximum: await fields.nth(1).inputValue(),
      singleSurcharge: await fields.nth(2).inputValue(),
    };
  }

  @step('读取加料组内商品单次加价：{identity}')
  async readAddonItemSingleSurcharge(identity: string): Promise<string> {
    const fields = await this.addonItemRuleFields(identity);
    return fields.nth(2).inputValue();
  }

  private async addonItemRuleFields(identity: string): Promise<Locator> {
    if (this.menuItem.path !== '/pp/brand/option-group/additional') throw new Error('仅加料组支持加料明细规则。');
    const identityText = this.page.locator('main:visible').getByText(identity, { exact: true });
    await this.expectUniqueVisible(identityText, `加料明细 ${identity} 名称`);
    const row = identityText.locator('xpath=ancestor::tr[1]');
    await this.expectUniqueVisible(row, `加料明细 ${identity} 所在行`);
    const visibleHeaders = this.page.locator('main:visible th:visible');
    const headerTexts = (await visibleHeaders.allTextContents()).map((value) => value.trim());
    const basePriceIndexes = headerTexts
      .map((value, index) => ({ value, index }))
      .filter(({ value }) => /(价格|Price)\s*\(\$\)/i.test(value))
      .map(({ index }) => index);
    if (basePriceIndexes.length !== 1) {
      throw new Error(`加料商品只读标准价列无法唯一识别：${JSON.stringify(headerTexts)}`);
    }
    const fields = row.getByRole('spinbutton');
    await waitUntil(() => fields.count(), (count) => count === 3, {
      timeout: 10_000,
      interval: 100,
      message: `加料明细 ${identity} 数量和单次加价字段数量不是3。`,
    });
    const singleSurchargeColumnIndex = await fields.nth(2).evaluate((input) => {
      const cell = input.closest('td');
      if (!cell?.parentElement) return -1;
      return Array.from(cell.parentElement.children).indexOf(cell);
    });
    if (singleSurchargeColumnIndex !== basePriceIndexes[0] + 1 || !headerTexts[singleSurchargeColumnIndex]) {
      throw new Error(`加料组单次加价字段未位于只读标准价右侧相邻列：base=${basePriceIndexes[0]} editable=${singleSurchargeColumnIndex} headers=${JSON.stringify(headerTexts)}`);
    }
    return fields;
  }

  @step('提交组表单并采集校验拒绝证据')
  async submitGroupAndCaptureRejection(options: { allowSilentNoWrite?: boolean } = {}): Promise<{
    mutationCount: number;
    responseStatus: number | null;
    responseBody: unknown;
    errorText: string;
    submitDisabled: boolean;
    leftCreateSurface: boolean;
    silentNoWrite: boolean;
  }> {
    const submit = this.groupFormSubmitControl();
    await this.expectUniqueVisible(submit, '组表单提交按钮');
    let mutationCount = 0;
    let responseStatus: number | null = null;
    let responseBody: unknown = null;
    let responseBodyPromise: Promise<void> | undefined;
    let resolveMutation: (() => void) | undefined;
    const mutationObserved = new Promise<void>((resolve) => {
      resolveMutation = resolve;
    });
    const listener = (response: Response) => {
      const pathname = new URL(response.url()).pathname;
      if (response.request().method() === 'POST' && /\/(brand-addon-group|brand-sections)$/.test(pathname)) {
        mutationCount += 1;
        responseStatus = response.status();
        responseBodyPromise = response.json().then((body) => {
          responseBody = body;
        }).catch(() => undefined);
        resolveMutation?.();
      }
    };
    this.page.on('response', listener);
    try {
      await settleInput();
      const submitDisabled = await submit.isDisabled();
      const errors = this.page.locator(
        '.ant-form-item-explain-error:visible, .ant-message-error:visible, .ant-notification-notice-error:visible, [role=alert].ant-alert-error:visible',
      );
      if (submitDisabled) {
        return {
          mutationCount,
          responseStatus,
          responseBody,
          errorText: (await errors.allTextContents()).map((value) => value.trim()).filter(Boolean).join(' | '),
          submitDisabled,
          leftCreateSurface: false,
          silentNoWrite: false,
        };
      }
      const pendingForever = () => new Promise<never>(() => undefined);
      const errorObserved = errors.first().waitFor({ state: 'visible', timeout: 15_000 })
        .catch(pendingForever);
      const dialogs = this.page.locator('[role=dialog]:visible');
      const dialogObserved = dialogs.first().waitFor({ state: 'visible', timeout: 15_000 })
        .catch(pendingForever);
      const navigationObserved = this.page.waitForURL(
        (url) => !url.pathname.endsWith('/create'),
        { timeout: 15_000 },
      ).catch(pendingForever);
      let timeoutId: ReturnType<typeof setTimeout> | undefined;
      const timeout = new Promise<never>((_, reject) => {
        timeoutId = setTimeout(() => reject(new Error('组负向提交未进入校验拒绝终态。')), options.allowSilentNoWrite ? 5_000 : 15_000);
      });
      await submit.click();
      const nativeInvalidText = (await this.page.locator('main:visible input:invalid:visible').evaluateAll((inputs) => (
        inputs.map((input) => (input as HTMLInputElement).validationMessage || 'native-constraint-invalid')
      ))).filter(Boolean).join(' | ');
      if (nativeInvalidText) {
        if (timeoutId) clearTimeout(timeoutId);
        return {
          mutationCount,
          responseStatus,
          responseBody,
          errorText: nativeInvalidText,
          submitDisabled: false,
          leftCreateSurface: false,
          silentNoWrite: false,
        };
      }
      try {
        await Promise.race([mutationObserved, errorObserved, dialogObserved, navigationObserved, timeout]).catch((error) => {
          if (!options.allowSilentNoWrite) throw error;
        });
      } finally {
        if (timeoutId) clearTimeout(timeoutId);
      }
      await responseBodyPromise;
      const leftCreateSurface = !new URL(this.page.url()).pathname.endsWith('/create');
      let dialogText = '';
      if (await dialogs.count()) {
        const dialog = dialogs.first();
        dialogText = (await dialog.innerText()).trim();
        const cancel = dialog.getByRole('button', { name: /^(取消|Cancel|No)$/i });
        await this.expectUniqueVisible(cancel, '组负向提交反馈弹窗取消按钮');
        await cancel.click();
        await dialog.waitFor({ state: 'hidden', timeout: 10_000 });
      }
      const formErrorText = leftCreateSurface
        ? ''
        : (await errors.allTextContents()).map((value) => value.trim()).filter(Boolean).join(' | ');
      return {
        mutationCount,
        responseStatus,
        responseBody,
        errorText: [formErrorText, dialogText].filter(Boolean).join(' | '),
        submitDisabled: false,
        leftCreateSurface,
        silentNoWrite: options.allowSilentNoWrite === true
          && mutationCount === 0
          && !leftCreateSurface
          && !formErrorText
          && !dialogText,
      };
    } finally {
      this.page.off('response', listener);
    }
  }

  @step('填写套餐组选择数量：{quantity}')
  async fillComboSelectionQuantity(quantity: number): Promise<void> {
    if (this.menuItem.path !== '/pp/brand/combo') throw new Error('仅套餐组支持选择数量。');
    const field = this.page.locator(
      'main:visible input[placeholder="Quantity"][role="spinbutton"]:visible, main:visible input[placeholder="items"][role="spinbutton"]:visible',
    );
    await this.expectUniqueVisible(field, '套餐组选择数量字段');
    await field.fill(String(quantity));
  }

  @step('提交组创建并等待成功响应')
  async submitGroupCreate(): Promise<Response> {
    const entityPath = this.menuItem.path === '/pp/brand/option-group/additional'
      ? /\/brand-addon-group$/
      : /\/brand-sections$/;
    const submit = this.groupFormSubmitControl();
    await this.expectUniqueVisible(submit, '组创建提交按钮');
    await settleInput();
    await waitUntil(() => submit.isEnabled(), (enabled) => enabled, {
      timeout: 10_000,
      interval: 100,
      message: '组创建提交按钮未启用。',
    });
    const responsePromise = this.page.waitForResponse((response) => (
      response.request().method() === 'POST'
      && entityPath.test(new URL(response.url()).pathname)
    ), { timeout: 60_000 });
    await submit.click();
    const response = await responsePromise;
    if (!response.ok()) throw new Error(`组创建失败 HTTP ${response.status()}`);
    await this.expectLoaded();
    return response;
  }

  @step('打开首个组的编辑界面并等待可编辑字段')
  async openFirstRowEditSurface(): Promise<Locator> {
    const identity = await this.readFirstVisibleIdentity();
    return this.openEditSurface(identity);
  }

  @step('打开指定组的编辑界面并等待可编辑字段：{identity}')
  async openEditSurface(identity: string): Promise<Locator> {
    if (this.menuItem.path === '/pp/brand/combo') {
      const row = await this.rowByIdentity(identity);
      const nameControl = row.getByText(identity, { exact: true });
      await this.expectUniqueVisible(nameControl, `组身份 ${identity} 的名称编辑入口`);
      await nameControl.click();
    } else {
      const menu = await this.openRowMenu(identity);
      const edit = menu.getByRole('menuitem', { name: /Edit|编辑$/i });
      await this.expectUniqueVisible(edit, `组身份 ${identity} 的编辑动作`);
      await edit.click();
    }
    await waitUntil(
      () => new URL(this.page.url()).pathname,
      (pathname) => pathname !== this.menuItem.path && pathname.endsWith('/create'),
      { timeout: 30_000, interval: 100, message: `组身份 ${identity} 未进入编辑路由。` },
    );
    const surface = this.page.locator('main:visible');
    const editableFields = surface.locator('input:visible, textarea:visible, [contenteditable="true"]:visible');
    await waitUntil(
      () => editableFields.count(),
      (count) => count > 0,
      { timeout: 30_000, interval: 100, message: `${this.menuItem.pageName}编辑页面未出现可编辑字段。` },
    );
    return surface;
  }

  @step('通过已捕获路由重新打开组编辑界面')
  async openCapturedEditSurface(editUrl: string): Promise<Locator> {
    const currentUrl = new URL(this.page.url());
    const targetUrl = new URL(editUrl, currentUrl.origin);
    if (targetUrl.origin !== currentUrl.origin
      || !targetUrl.pathname.startsWith(`${this.menuItem.path}/`)
      || !targetUrl.pathname.endsWith('/create')) {
      throw new Error(`组编辑路由与当前模块不匹配：${targetUrl.pathname}`);
    }
    await executeReadOnlyUiWithTransientRetry(
      () => this.page.goto(targetUrl.toString(), { waitUntil: 'domcontentloaded', timeout: 30_000 }),
      { onRetry: () => updateCurrentProductCenterGroupProgressPhase('read-retrying') },
    );
    const surface = this.page.locator('main:visible');
    const editableFields = surface.locator('input:visible, textarea:visible, [contenteditable="true"]:visible');
    await waitUntil(
      () => editableFields.count(),
      (count) => count > 0,
      { timeout: 30_000, interval: 100, message: `${this.menuItem.pageName}已捕获编辑路由未恢复可编辑终态。` },
    );
    return surface;
  }

  @step('设置组明细唯一默认项和加价并保存：{targetOption} / {price}')
  async setOptionDefaultPriceAndSave(
    optionNames: readonly string[],
    targetOption: string,
    price: string,
  ): Promise<{ checkedNames: string[]; price: string; responses: Response[] }> {
    if (!['/pp/brand/option-group/taste', '/pp/brand/option-group/method', '/pp/brand/option-group/additional'].includes(this.menuItem.path)) {
      throw new Error('仅口味组、做法组和加料组支持默认项与加价编辑');
    }
    const surface = this.page.locator('main:visible');
    const rows = new Map<string, Locator>();
    for (const optionName of optionNames) {
      const identity = this.menuItem.path === '/pp/brand/option-group/additional'
        ? surface.getByText(optionName, { exact: true })
        : surface.locator(`input[value="${escapeCssAttribute(optionName)}"]:visible`);
      await this.expectUniqueVisible(identity, `组明细 ${optionName}`);
      const row = identity.locator('xpath=ancestor::tr[1]');
      await this.expectUniqueVisible(row, `组明细 ${optionName} 所在行`);
      rows.set(optionName, row);
      const toggle = row.getByRole('switch');
      await this.expectUniqueVisible(toggle, `组明细 ${optionName} 默认开关`);
      const shouldCheck = optionName === targetOption;
      const checked = await this.isSwitchChecked(toggle);
      if (checked !== shouldCheck) await toggle.click({ timeout: 10_000 });
    }
    const targetRow = rows.get(targetOption);
    if (!targetRow) throw new Error(`目标组明细不存在：${targetOption}`);
    const priceInput = targetRow.getByRole('spinbutton').last();
    await this.expectUniqueVisible(priceInput, `组明细 ${targetOption} 加价字段`);
    await priceInput.fill(price);
    await settleInput();
    const checkedNames: string[] = [];
    for (const optionName of optionNames) {
      if (await this.isSwitchChecked(rows.get(optionName)!.getByRole('switch'))) checkedNames.push(optionName);
    }
    const persistedPrice = await priceInput.inputValue();
    if (checkedNames.length !== 1 || checkedNames[0] !== targetOption) {
      throw new Error(`组明细唯一默认项设置失败：${checkedNames.join(',')}`);
    }
    if (Number(persistedPrice) !== Number(price)) {
      throw new Error(`组明细加价输入失败：expected=${price} actual=${persistedPrice}`);
    }

    const responses: Response[] = [];
    const collect = (response: Response) => {
      const pathname = new URL(response.url()).pathname;
      if (['PUT', 'PATCH'].includes(response.request().method())
        && /\/(brand-modifiers|brand-addon-group)\/(?:check\/)?\d+\/?$/.test(pathname)) {
        responses.push(response);
      }
    };
    this.page.on('response', collect);
    try {
      const submit = surface.getByRole('button', { name: 'Confirm', exact: true });
      await this.expectUniqueVisible(submit, '组编辑提交按钮');
      await submit.click();
      if (this.menuItem.path === '/pp/brand/option-group/additional') {
        const modificationDialog = this.page.locator('[role=dialog]:visible');
        const modificationState = await waitUntil(
          async () => ({
            finalSaved: responses.some((response) => response.ok() && /\/brand-addon-group\/\d+\/?$/.test(new URL(response.url()).pathname)),
            dialogCount: await modificationDialog.count(),
            returnedToList: new URL(this.page.url()).pathname === this.menuItem.path,
          }),
          (state) => state.finalSaved || state.dialogCount === 1 || state.returnedToList,
          { timeout: 30_000, interval: 100, message: '加料组编辑未进入变更确认或保存终态' },
        );
        if (!modificationState.finalSaved && modificationState.dialogCount === 1) {
          const namedConfirm = modificationDialog.getByRole('button', { name: 'Confirm Modification', exact: true });
          const confirmModification = await namedConfirm.count() === 1
            ? namedConfirm
            : modificationDialog.locator('button.ant-btn-primary:visible');
          await this.expectUniqueVisible(confirmModification, '加料组变更确认按钮');
          await waitUntil(
            () => confirmModification.click({ trial: true }).then(() => true).catch(() => false),
            (ready) => ready,
            { timeout: 30_000, interval: 100, message: '加料组变更确认按钮未进入可点击状态' },
          );
          try {
            await confirmModification.click();
          } catch (error) {
            const reconciled = await waitUntil(
              () => responses.some((response) => response.ok() && /\/brand-addon-group\/\d+\/?$/.test(new URL(response.url()).pathname)),
              (saved) => saved,
              { timeout: 10_000, interval: 100, message: '加料组确认点击异常后未观察到最终更新响应' },
            ).catch(() => false);
            if (!reconciled) throw error;
          }
        }
      } else {
        await this.confirmVisiblePrimaryDialog();
      }
      await waitUntil(
        async () => ({
          saved: responses.some((response) => response.ok() && !/\/check\//.test(new URL(response.url()).pathname)),
          list: new URL(this.page.url()).pathname === this.menuItem.path,
        }),
        (state) => state.saved && state.list,
        { timeout: 60_000, interval: 100, message: '组默认项与加价保存未形成成功接口和列表终态' },
      );
      await this.expectLoaded();
      return { checkedNames, price: persistedPrice, responses };
    } finally {
      this.page.off('response', collect);
    }
  }

  @step('打开规格组编辑界面：{identity}')
  async openSpecEditSurface(identity: string): Promise<void> {
    if (this.menuItem.path !== '/pp/brand/spec') throw new Error('仅规格组支持规格字段边界编辑');
    const menu = await this.openRowMenu(identity);
    const edit = menu.getByRole('menuitem', { name: /Edit|编辑$/i });
    await this.expectUniqueVisible(edit, `规格组 ${identity} 的编辑动作`);
    await edit.click();
    await waitUntil(
      () => new URL(this.page.url()).pathname,
      (pathname) => pathname.endsWith('/spec/create'),
      { timeout: 30_000, interval: 100, message: `规格组 ${identity} 未进入编辑页面` },
    );
    await this.specificationTable().waitFor({ state: 'visible', timeout: 30_000 });
  }

  @step('按规格表头填写20字符边界字段并保存：{header}')
  async fillSpecOptionBoundaryAndSave(header: 'Spec Value' | 'Device Code', requestedValue: string): Promise<{
    persistedValue: string;
    response: Response;
  }> {
    const table = this.specificationTable();
    const headers = table.locator('thead th');
    const headerCells = headers.filter({ hasText: new RegExp(`^${header}$`) });
    await this.expectUniqueVisible(headerCells, `规格表头 ${header}`);
    const headerTexts = (await headers.allTextContents()).map((value) => value.trim());
    const columnIndex = headerTexts.findIndex((value) => value === header);
    if (columnIndex < 0) throw new Error(`规格表头未找到：${header}`);
    const rows = table.locator('tbody tr:visible');
    await waitUntil(
      () => rows.count(),
      (count) => count === 1,
      { timeout: 15_000, interval: 100, message: '规格边界前置必须且只能包含一个规格明细' },
    );
    const field = rows.locator('td').nth(columnIndex).locator('input:visible');
    await this.expectUniqueVisible(field, `规格字段 ${header}`);
    if (await field.getAttribute('maxlength') !== '20') throw new Error(`${header} 字段 maxlength 不是 20`);
    await field.fill(requestedValue);
    await settleInput();
    const persistedValue = await field.inputValue();
    if (persistedValue !== requestedValue.slice(0, 20)) {
      throw new Error(`${header} 字段未拒绝第21个字符：${persistedValue}`);
    }
    const submit = this.page.getByRole('button', { name: 'Confirm', exact: true });
    await this.expectUniqueVisible(submit, '规格编辑提交按钮');
    const responsePromise = this.page.waitForResponse((response) => (
      response.request().method() === 'PUT'
      && /\/brand-specs\/\d+$/.test(new URL(response.url()).pathname)
    ), { timeout: 60_000 });
    await submit.click();
    const response = await responsePromise;
    if (!response.ok()) throw new Error(`规格编辑保存失败 HTTP ${response.status()}`);
    await this.expectLoaded();
    return { persistedValue, response };
  }

  @step('按规格表头读取20字符边界字段：{header}')
  async readSpecOptionBoundary(header: 'Spec Value' | 'Device Code'): Promise<string> {
    const table = this.specificationTable();
    const headers = table.locator('thead th');
    const headerCells = headers.filter({ hasText: new RegExp(`^${header}$`) });
    await this.expectUniqueVisible(headerCells, `规格表头 ${header}`);
    const headerTexts = (await headers.allTextContents()).map((value) => value.trim());
    const columnIndex = headerTexts.findIndex((value) => value === header);
    if (columnIndex < 0) throw new Error(`规格表头未找到：${header}`);
    const rows = table.locator('tbody tr:visible');
    await waitUntil(
      () => rows.count(),
      (count) => count === 1,
      { timeout: 15_000, interval: 100, message: '规格回读必须且只能包含一个规格明细' },
    );
    const field = rows.locator('td').nth(columnIndex).locator('input:visible');
    await this.expectUniqueVisible(field, `规格字段 ${header}`);
    const value = await field.inputValue();
    await this.cancelCurrentSurface();
    return value;
  }

  private specificationTable(): Locator {
    return this.page.locator('table').filter({
      has: this.page.locator('thead th').filter({ hasText: /^Spec Value/ }),
    });
  }

  @step('在组编辑页打开新增明细界面')
  async openAddDetailSurface(): Promise<Locator> {
    const pathname = new URL(this.page.url()).pathname;
    const addDetail = this.page.getByRole('button', {
      name: pathname.includes('/spec/')
        ? /Add Specification$/
        : pathname.includes('/taste/')
          ? /Add Flavor$/
          : /Add$/,
    });
    await this.expectUniqueVisible(addDetail, '新增组明细入口');
    await addDetail.click();
    const dialog = this.page.getByRole('dialog');
    const visibleDialog = await dialog.isVisible({ timeout: 1_000 }).catch(() => false);
    const surface = visibleDialog ? dialog : this.page.locator('main:visible');
    await waitUntil(
      () => surface.locator('input:visible, textarea:visible, [contenteditable="true"]:visible').count(),
      (count) => count > 0,
      { timeout: 15_000, interval: 100, message: '新增组明细后未出现可编辑界面。' },
    );
    return surface;
  }

  @step('提交已有组新增空明细并校验名称必填')
  async submitExistingEmptyDetail(): Promise<{
    detailCount: number;
    errorText: string;
    pathname: string;
    submitDisabled: boolean;
  }> {
    const detailNames = this.detailNameFields();
    const detailCount = await detailNames.count();
    if (detailCount < 2) throw new Error('新增明细后未出现独立的新明细名称字段。');
    const detailName = detailNames.last();
    const row = detailName.locator('xpath=ancestor::tr[1]');
    const detailPlaceholder = await detailName.getAttribute('placeholder');
    if (!detailPlaceholder) throw new Error('新增明细名称字段缺少已审计 placeholder。');
    const otherTextFields = row.locator(`input[type="text"]:visible:not([placeholder="${detailPlaceholder}"])`);
    for (let index = 0; index < await otherTextFields.count(); index += 1) {
      const field = otherTextFields.nth(index);
      if (await field.inputValue()) continue;
      const maximum = Number(await field.getAttribute('maxlength') ?? 20);
      await field.fill(`AUTO_AUDIT_OTHER_${index}`.slice(0, maximum));
    }
    const submit = this.page.getByRole('button', { name: 'Confirm', exact: true });
    await this.expectUniqueVisible(submit, '已有组编辑提交按钮');
    const submitDisabled = await submit.isDisabled();
    if (!submitDisabled) await submit.click();
    const requiresVisibleError = new URL(this.page.url()).pathname.includes('/spec/');
    const errorText = requiresVisibleError
      ? await this.expectFieldErrorOrNativeInvalid(
        detailName,
        /Please enter|Required|不能为空|必填/i,
        '新增规格明细名称必填错误',
      )
      : '';
    return { detailCount, errorText, pathname: new URL(this.page.url()).pathname, submitDisabled };
  }

  @step('提交已有组内重复明细名称：{optionIdentity}')
  async submitExistingDuplicateDetail(optionIdentity: string): Promise<{ errorText: string; pathname: string }> {
    const detailNames = this.detailNameFields();
    if (await detailNames.count() < 2) throw new Error('新增明细后未出现独立的新明细名称字段。');
    const detailName = detailNames.last();
    await detailName.fill(optionIdentity);
    await settleInput();
    const submit = this.page.getByRole('button', { name: 'Confirm', exact: true });
    await this.expectUniqueVisible(submit, '已有组编辑提交按钮');
    await waitUntil(
      () => submit.isEnabled(),
      (enabled) => enabled,
      { timeout: 10_000, interval: 100, message: '重复明细填写后提交按钮仍不可用。' },
    );
    await submit.click();
    const fieldError = detailName
      .locator('xpath=ancestor::*[contains(concat(" ", normalize-space(@class), " "), " ant-form-item ")][1]')
      .locator('.ant-form-item-explain-error:visible');
    const messageError = this.page.locator('.ant-message-error:visible');
    const errorText = await waitUntil(
      async () => [
        ...(await fieldError.allTextContents()),
        ...(await messageError.allTextContents()),
      ].map((value) => value.trim()).filter(Boolean),
      (messages) => messages.some((message) => /duplicat|already exists?|conflict|repeat|不可重复|重复|冲突/i.test(message)),
      { timeout: 15_000, interval: 100, message: '同组重复明细提交后未出现重复语义错误。' },
    ).then((messages) => messages.join(' | '));
    return { errorText, pathname: new URL(this.page.url()).pathname };
  }

  @step('保存已有规格组新增明细：{optionIdentity}')
  async saveAddedSpecificationDetail(optionIdentity: string): Promise<Response> {
    if (!new URL(this.page.url()).pathname.includes('/spec/')) throw new Error('仅规格组支持此新增明细保存能力。');
    const detailNames = this.detailNameFields();
    if (await detailNames.count() < 2) throw new Error('新增规格明细后未出现独立的新明细名称字段。');
    await detailNames.last().fill(optionIdentity);
    await settleInput();
    const submit = this.page.getByRole('button', { name: 'Confirm', exact: true });
    await this.expectUniqueVisible(submit, '规格组编辑提交按钮');
    await waitUntil(() => submit.isEnabled(), (enabled) => enabled, {
      timeout: 10_000, interval: 100, message: '新增规格明细填写后提交按钮仍不可用。',
    });
    const responsePromise = this.page.waitForResponse((response) => (
      response.request().method() === 'PUT'
      && /\/brand-specs\/\d+$/.test(new URL(response.url()).pathname)
      && response.ok()
    ), { timeout: 60_000 });
    await submit.click();
    const response = await responsePromise;
    await waitUntil(
      () => new URL(this.page.url()).pathname,
      (pathname) => pathname === this.menuItem.path,
      { timeout: 30_000, interval: 100, message: '新增规格明细保存后未返回规格组列表。' },
    );
    return response;
  }

  @step('尝试删除唯一组明细并确认拦截：{optionIdentity}')
  async attemptDeleteOnlyDetail(optionIdentity: string): Promise<{ blocked: boolean; messageText: string }> {
    const detailNames = this.detailNameFields();
    await waitUntil(() => detailNames.count(), (count) => count === 1, {
      timeout: 10_000, interval: 100, message: '唯一明细删除探测未呈现且仅呈现一个原明细。',
    });
    if (await detailNames.first().inputValue() !== optionIdentity) throw new Error(`唯一明细身份不匹配：${optionIdentity}`);
    const originalRow = detailNames.first().locator('xpath=ancestor::tr[1]');
    const deleteButton = originalRow.getByRole('button', { name: 'delete', exact: true });
    await this.expectUniqueVisible(deleteButton, `唯一明细 ${optionIdentity} 的删除按钮`);
    await deleteButton.click();
    const visibleDialog = this.page.locator('[role=dialog]:visible').last();
    let blockingDialogText = '';
    if (await visibleDialog.count() === 1) {
      const initialDialogText = (await visibleDialog.innerText()).trim();
      const isBlockingDialog = /只有一个选项|only\s+one\s+option|cannot\s+delete|can't\s+delete/i.test(initialDialogText);
      if (isBlockingDialog) {
        blockingDialogText = initialDialogText;
      } else {
        const confirmationDialog = visibleDialog;
      const confirm = confirmationDialog.locator('button.ant-btn-primary:visible');
      await this.expectUniqueVisible(confirm, '唯一明细删除确认按钮');
      await confirm.click();
      await confirmationDialog.waitFor({ state: 'hidden', timeout: 10_000 });
      }
    }
    const messages = this.page.locator('.ant-message-error:visible, .ant-message-warning:visible, [role=alert]:visible');
    const informationDialog = this.page.locator('[role=dialog].ant-modal-confirm-info:visible').last();
    const state = await waitUntil(
      async () => ({
        names: await this.readCurrentDetailNames(),
        messages: (await messages.allTextContents()).map((value) => value.trim()).filter(Boolean),
        informationDialogVisible: await informationDialog.isVisible().catch(() => false),
        informationDialogText: blockingDialogText || await informationDialog.innerText().catch(() => ''),
      }),
      (value) => value.names.length === 1
        && value.names[0] === optionIdentity
        && (value.messages.length > 0 || (value.informationDialogVisible && value.informationDialogText.trim().length > 0)),
      { timeout: 15_000, interval: 100, message: '唯一明细删除后未同时出现拦截反馈并保留原明细。' },
    );
    if (state.informationDialogVisible || blockingDialogText) {
      await this.dismissInformationDialog('唯一明细删除拦截信息弹窗');
    }
    return {
      blocked: true,
      messageText: [...state.messages, state.informationDialogText.trim()].filter(Boolean).join(' | '),
    };
  }

  private async dismissInformationDialog(description: string): Promise<void> {
    const dialog = this.page.locator('[role=dialog].ant-modal-confirm-info:visible').last();
    if (await dialog.count() !== 1) throw new Error(`${description}缺少可见弹窗。`);
    const semanticDismiss = dialog.getByRole('button', { name: /^(OK|Confirm|Close|Got it|确定|确认|关闭|知道了)$/i }).last();
    const primaryDismiss = dialog.locator('button.ant-btn-primary:visible').last();
    const defaultDismiss = dialog.locator('button.ant-btn-default:visible').last();
    const closeIcon = dialog.locator('button.ant-modal-close:visible').last();
    const onlyVisibleButton = dialog.locator('button:visible').last();
    const dismiss = await semanticDismiss.count() === 1 && await semanticDismiss.isVisible().catch(() => false)
      ? semanticDismiss
      : await primaryDismiss.count() === 1
        ? primaryDismiss
        : await defaultDismiss.count() === 1
          ? defaultDismiss
          : await closeIcon.count() === 1
            ? closeIcon
            : await onlyVisibleButton.count() === 1
              ? onlyVisibleButton
              : null;
    if (!dismiss) throw new Error(`${description}缺少可识别关闭按钮。`);
    await dismiss.click({ force: true });
    if (await dialog.isVisible().catch(() => false)) await this.page.keyboard.press('Escape').catch(() => undefined);
    if (await dialog.isVisible().catch(() => false) && await closeIcon.count() === 1) {
      await closeIcon.click({ force: true }).catch(() => undefined);
    }
    await waitUntil(
      () => this.page.locator('[role=dialog].ant-modal-confirm-info:visible').count(),
      (count) => count === 0,
      { timeout: 10_000, interval: 100, message: `${description}关闭后仍保持可见。` },
    );
  }

  @step('读取当前编辑页明细名称')
  async readCurrentDetailNames(): Promise<string[]> {
    const detailNames = this.detailNameFields();
    return Promise.all(Array.from({ length: await detailNames.count() }, (_, index) => detailNames.nth(index).inputValue()));
  }

  @step('等待当前组明细名称稳定')
  async waitForCurrentDetailNames(expectedNames: readonly string[]): Promise<string[]> {
    return waitUntil(
      () => this.readCurrentDetailNames(),
      (names) => names.length === expectedNames.length
        && names.every((name, index) => name === expectedNames[index]),
      {
        timeout: 30_000,
        interval: 100,
        message: `组明细名称未稳定为：${expectedNames.join(', ')}`,
      },
    );
  }

  @step('填写当前新增组明细名称：{identity}')
  async fillNewestDetailName(identity: string): Promise<string[]> {
    const detailNames = this.detailNameFields();
    await waitUntil(() => detailNames.count(), (count) => count >= 2, {
      timeout: 15_000,
      interval: 100,
      message: '新增组明细后未出现独立的新明细名称字段。',
    });
    const newestDetail = detailNames.last();
    await newestDetail.fill(identity);
    await waitUntil(() => newestDetail.inputValue(), (value) => value === identity, {
      timeout: 10_000,
      interval: 100,
      message: `新增组明细名称未稳定为：${identity}`,
    });
    return this.readCurrentDetailNames();
  }

  @step('删除指定未引用组明细并保存：{optionIdentity}')
  async deleteUnreferencedOptionDetailAndSave(optionIdentity: string): Promise<{
    response: Response;
    confirmationText: string;
    requestPayload: unknown;
  }> {
    const detailNames = this.detailNameFields();
    await waitUntil(() => detailNames.count(), (count) => count >= 2, {
      timeout: 15_000,
      interval: 100,
      message: '未引用明细删除前不足两个可编辑明细。',
    });
    const values = await this.readCurrentDetailNames();
    const optionIndex = values.indexOf(optionIdentity);
    if (optionIndex < 0) throw new Error(`未找到待删除明细：${optionIdentity}`);
    const row = detailNames.nth(optionIndex).locator('xpath=ancestor::tr[1]');
    const deleteButton = row.getByRole('button', { name: 'delete', exact: true });
    await this.expectUniqueVisible(deleteButton, `未引用明细 ${optionIdentity} 的删除按钮`);
    await deleteButton.click();
    const dialog = this.page.locator('[role=dialog]:visible');
    let confirmationText = '';
    if (await dialog.count() === 1) {
      confirmationText = (await dialog.innerText()).trim();
      const confirm = dialog.getByRole('button', { name: /^(Confirm|OK|确定|确认)$/i });
      await this.expectUniqueVisible(confirm, '未引用明细删除确认按钮');
      await confirm.click();
      await dialog.waitFor({ state: 'hidden', timeout: 10_000 });
    }
    await waitUntil(() => this.readCurrentDetailNames(), (names) => !names.includes(optionIdentity), {
      timeout: 15_000,
      interval: 100,
      message: `删除明细后页面仍包含：${optionIdentity}`,
    });
    const pathname = new URL(this.page.url()).pathname;
    const responsePath = pathname.includes('/spec/') ? /\/brand-specs(?:\/|$)/ : /\/brand-modifiers(?:\/|$)/;
    const submit = this.page.getByRole('button', { name: /^(Confirm|确\s*定)$/i });
    await this.expectUniqueVisible(submit, '未引用明细删除保存按钮');
    const responsePromise = this.page.waitForResponse((response) => (
      ['POST', 'PUT', 'PATCH'].includes(response.request().method())
      && responsePath.test(new URL(response.url()).pathname)
    ), { timeout: 60_000 });
    await submit.click();
    const modificationDialog = this.page.locator('[role=dialog]:visible').filter({ hasText: /Confirm Modification|确认变更/i });
    if (await modificationDialog.waitFor({ state: 'visible', timeout: 3_000 }).then(() => true).catch(() => false)) {
      confirmationText = `${confirmationText} ${(await modificationDialog.innerText()).trim()}`.trim();
      const confirmModification = modificationDialog.getByRole('button', { name: /^(Confirm Modification|确认修改)$/i });
      await this.expectUniqueVisible(confirmModification, '未引用明细删除确认修改按钮');
      await confirmModification.click();
    }
    const response = await responsePromise;
    if (!response.ok()) throw new Error(`未引用明细删除保存失败 HTTP ${response.status()}`);
    return { response, confirmationText, requestPayload: response.request().postDataJSON() };
  }

  @step('尝试删除被引用组明细并采集拒绝：{optionIdentity}')
  async attemptDeleteReferencedOptionDetail(optionIdentity: string): Promise<{
    response: Response | null;
    confirmationText: string;
    beforeNames: string[];
    currentNames: string[];
  }> {
    const detailNames = this.detailNameFields();
    await waitUntil(() => detailNames.count(), (count) => count >= 2, {
      timeout: 15_000,
      interval: 100,
      message: '被引用明细删除前不足两个可编辑明细。',
    });
    const values = await this.readCurrentDetailNames();
    const optionIndex = values.indexOf(optionIdentity);
    if (optionIndex < 0) throw new Error(`未找到被引用待删除明细：${optionIdentity}`);
    const row = detailNames.nth(optionIndex).locator('xpath=ancestor::tr[1]');
    const deleteButton = row.getByRole('button', { name: 'delete', exact: true });
    await this.expectUniqueVisible(deleteButton, `被引用明细 ${optionIdentity} 的删除按钮`);
    await deleteButton.click();
    const errorMessages = this.page.locator('.ant-message-error:visible, .ant-form-item-explain-error:visible, [role=alert]:visible');
    const immediate = await waitUntil(
      async () => ({
        names: await this.readCurrentDetailNames(),
        errorText: (await errorMessages.allTextContents()).map((value) => value.trim()).filter(Boolean).join(' | '),
      }),
      (state) => Boolean(state.errorText) || !state.names.includes(optionIdentity),
      { timeout: 5_000, interval: 100, message: `删除被引用明细后页面无阻断提示且行未移除：${optionIdentity}` },
    );
    if (immediate.errorText) {
      return {
        response: null,
        confirmationText: immediate.errorText,
        beforeNames: values,
        currentNames: immediate.names,
      };
    }
    const dialog = this.page.locator('[role=dialog]:visible');
    let confirmationText = '';
    if (await dialog.count() === 1) {
      confirmationText = (await dialog.innerText()).trim();
      const confirm = dialog.getByRole('button', { name: /^(Confirm|OK|确定|确认)$/i });
      await this.expectUniqueVisible(confirm, '被引用明细删除确认按钮');
      await confirm.click();
      await dialog.waitFor({ state: 'hidden', timeout: 10_000 });
    }
    const submit = this.page.getByRole('button', { name: /^(Confirm|确\s*定)$/i });
    await this.expectUniqueVisible(submit, '被引用明细删除保存按钮');
    const pathname = new URL(this.page.url()).pathname;
    const responsePath = pathname.includes('/spec/') ? /\/brand-specs(?:\/|$)/ : /\/brand-modifiers(?:\/|$)/;
    const responsePromise = this.page.waitForResponse((response) => (
      ['POST', 'PUT', 'PATCH'].includes(response.request().method())
      && responsePath.test(new URL(response.url()).pathname)
    ), { timeout: 60_000 }).catch(() => null);
    await submit.click();
    const modificationDialog = this.page.locator('[role=dialog]:visible').filter({ hasText: /Confirm Modification|确认变更/i });
    if (await modificationDialog.waitFor({ state: 'visible', timeout: 3_000 }).then(() => true).catch(() => false)) {
      confirmationText = `${confirmationText} ${(await modificationDialog.innerText()).trim()}`.trim();
      const confirmModification = modificationDialog.getByRole('button', { name: /^(Confirm Modification|确认修改)$/i });
      await this.expectUniqueVisible(confirmModification, '被引用明细删除确认修改按钮');
      await confirmModification.click();
    }
    const response = await responsePromise;
    const currentNames = immediate.names;
    return { response, confirmationText, beforeNames: values, currentNames };
  }

  @step('打开添加表单并等待可编辑界面')
  async openCreateSurface(): Promise<Locator> {
    await this.clickAdd();
    await waitUntil(
      () => new URL(this.page.url()).pathname,
      (pathname) => pathname !== this.menuItem.path && pathname.endsWith('/create'),
      { timeout: 30_000, interval: 100, message: `${this.menuItem.pageName}未进入新增路由。` },
    );
    const surface = this.page.locator('main:visible');
    await this.expectUniqueVisible(surface, `${this.menuItem.pageName}新增页面`);
    const editableFields = surface.locator('input:visible, textarea:visible, [contenteditable="true"]:visible');
    await waitUntil(
      () => editableFields.count(),
      (count) => count > 0,
      { timeout: 30_000, interval: 100, message: `${this.menuItem.pageName}新增页面未出现可编辑字段。` },
    );
    const submit = this.groupFormSubmitControl(surface);
    const cancel = surface.getByRole('button', { name: /^(取消|Cancel|关闭|Close)$/i });
    await waitUntil(
      async () => ({ submit: await submit.count(), cancel: await cancel.count() }),
      (state) => state.submit === 1 && state.cancel === 1,
      { timeout: 30_000, interval: 100, message: `${this.menuItem.pageName}新增页面提交或取消控件不唯一。` },
    );
    return surface;
  }

  groupFormSubmitControl(surface: Locator = this.page.locator('main:visible')): Locator {
    return surface.getByRole('button', {
      name: this.menuItem.path === '/pp/brand/combo'
        ? /^(确\s*定|Confirm)$/i
        : /^(确\s*定|保存|Save|确认|Confirm|创建|Create|添加|Add)$/i,
    });
  }

  @step('提交空表单并等待校验反馈')
  async submitEmptyFormAndExpectValidation(): Promise<void> {
    const submit = this.page.getByRole('button', { name: /^(保存|Save|确认|Confirm|创建|Create|添加|Add)$/i }).last();
    await submit.waitFor({ state: 'visible', timeout: 10_000 });
    if (await submit.isEnabled()) {
      await submit.click();
      const validation = this.page.locator('.ant-form-item-explain-error:visible, [role=alert]:visible, .ant-message-error:visible').first();
      await validation.waitFor({ state: 'visible', timeout: 10_000 });
      return;
    }
    const requiredField = this.page.locator('.ant-form-item-required:visible, [aria-required="true"]:visible').first();
    await requiredField.waitFor({ state: 'visible', timeout: 10_000 });
  }

  @step('验证组名称和组子项必填校验')
  async expectOptionGroupRequiredValidation(identity: string, exactDetailMessage?: string): Promise<{
    groupNameRequired: true;
    detailNameRequired: true;
  }> {
    const pathname = new URL(this.page.url()).pathname;
    const detailPlaceholder = pathname.includes('/spec/')
      ? /^(?:eg[:：]?|如[:：]?)\s*Cupsize$/i
      : /^(?:eg[:：]?|如[:：]?)\s*Sweet$/i;
    const groupError = pathname.includes('/spec/')
      ? /规格名称\s*[（(]必填[）)]|Please enter the specification group name/i
      : pathname.includes('/taste/')
        ? /请输入口味名称|Please enter the flavor group name/i
        : /请输入组名称|做法名称\s*[（(]必填[）)]|Please enter group name/i;
    const submit = this.page.getByRole('button', { name: /^(确\s*定|Confirm)$/i });
    const groupName = this.page.locator('input[aria-required="true"][type="text"]:visible');
    const detailName = this.page.getByPlaceholder(detailPlaceholder);
    await this.expectUniqueVisible(submit, '做法组提交按钮');
    await this.expectUniqueVisible(groupName, '做法组名称字段');
    await this.expectUniqueVisible(detailName, '做法明细名称字段');

    await submit.click();
    await this.expectFieldError(groupName, groupError, '组名称必填错误');

    await groupName.fill(identity);
    if (pathname.includes('/spec/') || pathname.includes('/taste/')) {
      const addOption = this.page.getByRole('button', {
        name: pathname.includes('/spec/') ? /Add Specification/i : /Add Flavor/i,
      });
      await this.expectUniqueVisible(addOption, '添加组子项按钮');
      await addOption.click();
      await waitUntil(
        () => this.page.getByPlaceholder(detailPlaceholder).count(),
        (count) => count === 2,
        { timeout: 10_000, interval: 100, message: '新增组子项行未出现' },
      );
      await submit.click();
      await this.expectFieldErrorOrNativeInvalid(
        this.page.getByPlaceholder(detailPlaceholder).last(),
        /Please enter|Required/i,
        '组子项名称必填错误',
      );
    } else if (pathname.includes('/method/')) {
      await submit.click();
      await waitUntil(
        async () => ({
          pathname: new URL(this.page.url()).pathname,
          detailVisible: await detailName.isVisible().catch(() => false),
        }),
        (state) => state.pathname.endsWith('/create') && state.detailVisible,
        { timeout: 10_000, interval: 100, message: '做法明细缺失提交后未保持在新增页' },
      );
    } else {
      await submit.click();
      await this.expectFieldError(detailName, /Please enter|Required/i, '组子项名称必填错误');
    }
    if (exactDetailMessage) {
      const messages = this.page.locator('.ant-form-item-explain-error:visible, .ant-message-error:visible, [role=alert]:visible');
      await waitUntil(
        () => messages.allTextContents(),
        (values) => values.some((value) => value.trim() === exactDetailMessage),
        { timeout: 10_000, interval: 100, message: `未显示精确组子项名称必填提示：${exactDetailMessage}` },
      );
    }
    return { groupNameRequired: true, detailNameRequired: true };
  }

  @step('验证组名称精确必填提示：{identity}')
  async expectGroupNameRequiredValidation(identity: string, exactMessage: string): Promise<void> {
    const detailName = this.detailNameFields().first();
    const submit = this.page.getByRole('button', { name: /^(Confirm|确\s*定)$/i });
    await this.expectUniqueVisible(detailName, '组明细名称字段');
    await this.expectUniqueVisible(submit, '组提交按钮');
    await detailName.fill(identity);
    await submit.click();
    const messages = this.page.locator('.ant-form-item-explain-error:visible, .ant-message-error:visible, [role=alert]:visible');
    await waitUntil(
      () => messages.allTextContents(),
      (values) => values.some((value) => value.trim() === exactMessage),
      { timeout: 10_000, interval: 100, message: `未显示精确组名称必填提示：${exactMessage}` },
    );
  }

  @step('验证组无子项时保存失败：{identity}')
  async expectEmptyOptionsValidation(identity: string): Promise<string> {
    const pathname = new URL(this.page.url()).pathname;
    if (pathname.includes('/option-group/additional/')) {
      const groupName = this.page.locator('input[aria-required="true"][type="text"]:visible');
      const submit = this.page.getByRole('button', { name: /^(Confirm|确\s*定)$/i });
      await this.expectUniqueVisible(groupName, '加料组名称字段');
      await this.expectUniqueVisible(submit, '加料组提交按钮');
      await groupName.fill(identity);
      await waitUntil(
        () => submit.isDisabled(),
        (disabled) => disabled,
        { timeout: 10_000, interval: 100, message: '未添加加料明细时确定按钮未保持禁用' },
      );
      return '';
    }
    const groupName = this.page.locator('input[aria-required="true"][type="text"]:visible');
    const detailNames = this.detailNameFields();
    const submit = this.page.getByRole('button', { name: /^(Confirm|确\s*定)$/i });
    await this.expectUniqueVisible(groupName, '组名称字段');
    await this.expectUniqueVisible(submit, '组提交按钮');
    await waitUntil(
      () => detailNames.count(),
      (count) => count === 1,
      { timeout: 10_000, interval: 100, message: '组创建页初始子项数量不是 1' },
    );
    await groupName.fill(identity);
    if (await submit.isEnabled()) await submit.click();
    const detailName = detailNames.first();
    const formItem = detailName.locator('xpath=ancestor::*[contains(concat(" ", normalize-space(@class), " "), " ant-form-item ")][1]');
    const detailError = formItem.locator('.ant-form-item-explain-error:visible');
    const messages = this.page.locator('.ant-form-item-explain-error:visible, .ant-message-error:visible, [role=alert]:visible');
    const terminal = await waitUntil(
      async () => ({
        pathname: new URL(this.page.url()).pathname,
        ariaInvalid: await detailName.getAttribute('aria-invalid'),
        errorCount: await detailError.count(),
        errorText: await detailError.allTextContents(),
        visibleText: (await messages.allTextContents()).map((value) => value.trim()).filter(Boolean),
        submitDisabled: await submit.isDisabled(),
      }),
      (state) => state.pathname.endsWith('/create') && (
        (state.ariaInvalid === 'true' && state.errorCount === 1 && state.errorText.some((text) => text.trim().length > 0))
        || state.visibleText.length > 0
        || state.submitDisabled
      ),
      { timeout: 10_000, interval: 100, message: '空明细提交未出现字段错误或禁用终态' },
    );
    return terminal.visibleText.join(' | ');
  }

  @step('通过 UI 创建带单个子项的组：{identity}')
  async createSimpleOptionGroup(identity: string, optionIdentity: string): Promise<Response> {
    return (await this.createSimpleOptionGroupWithEvidence(identity, optionIdentity)).response;
  }

  @step('通过 UI 创建组并采集字段长度：{identity}')
  async createSimpleOptionGroupWithEvidence(identity: string, optionIdentity: string): Promise<{
    response: Response;
    groupValue: string;
    optionValue: string;
  }> {
    const pathname = new URL(this.page.url()).pathname;
    const detailPlaceholder = pathname.includes('/spec/') ? 'eg: Cupsize' : 'eg: Sweet';
    const createResponse = pathname.includes('/spec/') ? /\/brand-specs$/ : /\/brand-modifiers$/;
    const groupName = this.page.locator('input[aria-required="true"][type="text"]:visible');
    const detailName = this.page.locator(`input[placeholder="${detailPlaceholder}"]:visible`);
    const submit = this.page.getByRole('button', { name: 'Confirm', exact: true });
    await this.expectUniqueVisible(groupName, '组名称字段');
    await this.expectUniqueVisible(detailName, '组子项名称字段');
    await this.expectUniqueVisible(submit, '组提交按钮');
    await groupName.fill(identity);
    await detailName.fill(optionIdentity);
    await settleInput();
    await waitUntil(
      () => submit.isEnabled(),
      (enabled) => enabled,
      { timeout: 10_000, interval: 100, message: '必填项填写后组提交按钮仍不可用' },
    );
    const groupValue = await groupName.inputValue();
    const optionValue = await detailName.inputValue();
    const responsePromise = this.page.waitForResponse((response) => (
      response.request().method() === 'POST'
      && createResponse.test(new URL(response.url()).pathname)
      && response.status() >= 200
      && response.status() < 300
    ), { timeout: 60_000 });
    await submit.click();
    const response = await responsePromise;
    return {
      response,
      groupValue,
      optionValue,
    };
  }

  @step('提交重复组名称并采集拒绝证据：{identity}')
  async submitDuplicateOptionGroup(identity: string, optionIdentity: string): Promise<{
    status: number;
    responseBody: unknown;
    errorText: string;
    pathname: string;
  }> {
    const pathname = new URL(this.page.url()).pathname;
    const detailPlaceholder = pathname.includes('/spec/') ? 'eg: Cupsize' : 'eg: Sweet';
    const createResponse = pathname.includes('/spec/') ? /\/brand-specs$/ : /\/brand-modifiers$/;
    const groupName = this.page.locator('input[aria-required="true"][type="text"]:visible');
    const detailName = this.page.locator(`input[placeholder="${detailPlaceholder}"]:visible`);
    const submit = this.page.getByRole('button', { name: 'Confirm', exact: true });
    const errorMessage = this.page.locator('.ant-message-error:visible');
    await this.expectUniqueVisible(groupName, '组名称字段');
    await this.expectUniqueVisible(detailName, '组子项名称字段');
    await this.expectUniqueVisible(submit, '组提交按钮');
    await groupName.fill(identity);
    await detailName.fill(optionIdentity);
    await settleInput();
    await waitUntil(
      () => submit.isEnabled(),
      (enabled) => enabled,
      { timeout: 10_000, interval: 100, message: '重复校验必填项填写后提交按钮仍不可用' },
    );
    const responsePromise = this.page.waitForResponse((response) => (
      response.request().method() === 'POST'
      && createResponse.test(new URL(response.url()).pathname)
    ), { timeout: 60_000 });
    await submit.click();
    const response = await responsePromise;
    await this.expectUniqueVisible(errorMessage, '重复组名称错误提示');
    return {
      status: response.status(),
      responseBody: await response.json().catch(() => null),
      errorText: (await errorMessage.innerText()).trim(),
      pathname: new URL(this.page.url()).pathname,
    };
  }

  @step('校验组列表唯一行包含子项：{identity}，{optionIdentity}')
  async expectIdentityRowContains(identity: string, optionIdentity: string): Promise<void> {
    await this.searchAndWait(identity);
    await this.waitForVisibleIdentityCount(identity, 1);
    const rowText = (await (await this.rowByIdentity(identity)).innerText()).trim();
    if (!rowText.includes(optionIdentity)) {
      throw new Error(`组 ${identity} 的列表行未展示子项 ${optionIdentity}`);
    }
  }

  @step('校验组列表唯一行不包含子项：{identity}，{optionIdentity}')
  async expectIdentityRowExcludes(identity: string, optionIdentity: string): Promise<void> {
    await this.searchAndWait(identity);
    await this.waitForVisibleIdentityCount(identity, 1);
    const rowText = (await (await this.rowByIdentity(identity)).innerText()).trim();
    if (rowText.includes(optionIdentity)) {
      throw new Error(`组 ${identity} 的列表行仍展示已删除子项 ${optionIdentity}`);
    }
  }

  @step('校验组列表唯一行包含且不包含子项：{identity}，{includedOptionIdentity}，{excludedOptionIdentity}')
  async expectIdentityRowContainsAndExcludes(
    identity: string,
    includedOptionIdentity: string,
    excludedOptionIdentity: string,
  ): Promise<void> {
    let lastError: unknown;
    for (let attempt = 0; attempt < 4; attempt += 1) {
      try {
        if (attempt > 0) {
          await this.open();
        }
        await this.searchAndWait('');
        await this.searchAndWait(identity);
        await this.waitForVisibleIdentityCount(identity, 1);
        lastError = undefined;
        break;
      } catch (error) {
        lastError = error;
      }
    }
    if (lastError) throw lastError;
    const rowText = (await (await this.rowByIdentity(identity)).innerText()).trim();
    if (!rowText.includes(includedOptionIdentity)) {
      throw new Error(`组 ${identity} 的列表行未展示子项 ${includedOptionIdentity}`);
    }
    if (rowText.includes(excludedOptionIdentity)) {
      throw new Error(`组 ${identity} 的列表行仍展示已删除子项 ${excludedOptionIdentity}`);
    }
  }

  @step('校验组列表唯一行包含全部值：{identity}')
  async expectIdentityRowContainsAll(identity: string, expectedValues: readonly string[]): Promise<void> {
    await this.searchAndWait(identity);
    await this.waitForVisibleIdentityCount(identity, 1);
    const rowText = (await (await this.rowByIdentity(identity)).innerText()).trim();
    const missing = expectedValues.filter((value) => !rowText.includes(value));
    if (missing.length) throw new Error(`组 ${identity} 的列表行缺少字段值：${missing.join(', ')}`);
  }

  @step('校验组列表字段结构完整')
  async expectTableStructureComplete(): Promise<void> {
    const headers = (await this.tableHeaderRow.locator('th').allTextContents()).map((value) => value.trim());
    const requiredHeaders: string[] = [this.menuItem.tableMarker];
    if (this.menuItem.path === '/pp/brand/spec') {
      requiredHeaders.push('Specification Item Details', 'Linked Items', 'Action');
    }
    for (const header of requiredHeaders) {
      if (!headers.some((value) => value.includes(header))) throw new Error(`组列表缺少字段列：${header}`);
    }
    const rows = this.tableBodyRows;
    const rowCount = await rows.count();
    for (let index = 0; index < rowCount; index += 1) {
      const cells = rows.nth(index).locator('td');
      if (await cells.count() < requiredHeaders.length) throw new Error(`组列表第 ${index + 1} 行字段数量不完整`);
    }
    const visibleErrors = this.page.locator('[role="alert"]:visible, .ant-result-error:visible, .ant-message-error:visible');
    if (await visibleErrors.count() > 0) throw new Error('组列表存在可见异常提示');
  }

  @step('取消当前组表单或关闭弹层')
  async cancelCurrentSurface(): Promise<void> {
    const informationOverlay = this.page.locator('[role=dialog].ant-modal-confirm-info:visible').last();
    if (await informationOverlay.count() && await informationOverlay.isVisible().catch(() => false)) {
      const dismiss = informationOverlay.locator('button:visible');
      await this.expectUniqueVisible(dismiss, '信息弹窗关闭按钮');
      await dismiss.click({ force: true });
      await informationOverlay.waitFor({ state: 'hidden', timeout: 10_000 });
    }
    const blockingOverlay = this.page.locator('[role=dialog]:visible, .ant-modal-wrap:visible').last();
    if (await blockingOverlay.count() && await blockingOverlay.isVisible().catch(() => false)) {
      const semanticDismiss = blockingOverlay.getByRole('button', {
        name: /^(取消|Cancel|关闭|Close|OK|确定|知道了)$/i,
      }).last();
      const closeIcon = blockingOverlay.locator('button.ant-modal-close:visible').last();
      if (await semanticDismiss.count() && await semanticDismiss.isVisible().catch(() => false)) {
        await semanticDismiss.click({ force: true });
      } else if (await closeIcon.count() && await closeIcon.isVisible().catch(() => false)) {
        await closeIcon.click({ force: true });
      } else {
        await this.page.keyboard.press('Escape');
      }
      await blockingOverlay.waitFor({ state: 'hidden', timeout: 10_000 });
    }
    const cancel = this.page.getByRole('button', { name: /^(取消|Cancel|关闭|Close)$/i }).last();
    if (await cancel.count() && await cancel.isVisible().catch(() => false)) {
      await waitUntil(
        () => cancel.click({ trial: true }).then(() => true).catch(() => false),
        (ready) => ready,
        { timeout: 30_000, interval: 100, message: '组表单取消按钮被加载状态持续遮挡。' },
      );
      await cancel.click();
    } else {
      await this.page.keyboard.press('Escape');
    }
    await waitUntil(
      () => new URL(this.page.url()).pathname,
      (pathname) => pathname === this.menuItem.path,
      { timeout: 15_000, message: '取消新增后未返回组列表页。' },
    );
    await this.expectLoaded();
  }

  private async expectUniqueVisible(locator: Locator, description: string): Promise<void> {
    await waitUntil(
      () => locator.count(),
      (count) => count === 1,
      { timeout: 15_000, interval: 100, message: `${description} 定位数量不是 1。` },
    );
    await locator.waitFor({ state: 'visible', timeout: 10_000 });
  }

  private async isSwitchChecked(toggle: Locator): Promise<boolean> {
    const ariaChecked = await toggle.getAttribute('aria-checked');
    if (ariaChecked !== null) return ariaChecked === 'true';
    return toggle.locator('input[type="checkbox"]').isChecked().catch(() => false);
  }

  private async confirmVisiblePrimaryDialog(): Promise<void> {
    const dialog = this.page.locator('[role=dialog]:visible');
    const appeared = await waitUntil(
      async () => ({
        dialogCount: await dialog.count(),
        returnedToList: new URL(this.page.url()).pathname === this.menuItem.path,
      }),
      (state) => state.dialogCount === 1 || state.returnedToList,
      { timeout: 30_000, interval: 100, message: '组编辑提交未进入确认或列表终态' },
    );
    if (appeared.dialogCount !== 1) return;
    const confirm = dialog.locator('button.ant-btn-primary:visible');
    await this.expectUniqueVisible(confirm, '组编辑二次确认按钮');
    await confirm.click();
  }

  private productSelectionOverlay(): Locator {
    return this.page.locator('[role=dialog]:visible, .ant-drawer:visible').last();
  }

  private identityText(identity: string): Locator {
    const escapedIdentity = identity.replace(/_/g, '\\_');
    return escapedIdentity === identity
      ? this.page.getByText(identity, { exact: true })
      : this.page.getByText(identity, { exact: true }).or(
          this.page.getByText(escapedIdentity, { exact: true }),
        );
  }

  private async openProductSelectionOverlay(): Promise<Locator> {
    const add = this.page.locator('main:visible').getByRole('button', { name: /Add|添\s*加/i });
    await this.expectUniqueVisible(add, '组商品添加按钮');
    await add.click();
    const overlay = this.productSelectionOverlay();
    await this.expectUniqueVisible(overlay, '组商品选择弹层');
    return overlay;
  }

  private async confirmProductSelection(overlay: Locator): Promise<void> {
    const confirm = overlay.getByRole('button', { name: /^(Confirm|确\s*定)$/i });
    await this.expectUniqueVisible(confirm, '商品选择确认按钮');
    await waitUntil(() => confirm.isEnabled(), (enabled) => enabled, {
      timeout: 10_000,
      interval: 100,
      message: '商品选择确认按钮未启用。',
    });
    await confirm.click();
    await overlay.waitFor({ state: 'hidden', timeout: 10_000 });
  }

  private async expectFieldError(field: Locator, message: RegExp, description: string): Promise<void> {
    const formItem = field.locator('xpath=ancestor::*[contains(concat(" ", normalize-space(@class), " "), " ant-form-item ")][1]');
    const error = formItem.locator('.ant-form-item-explain-error:visible');
    await waitUntil(
      async () => ({
        ariaInvalid: await field.getAttribute('aria-invalid'),
        errorCount: await error.count(),
        errorText: await error.allTextContents(),
      }),
      (state) => state.ariaInvalid === 'true'
        && state.errorCount === 1
        && state.errorText.some((text) => message.test(text.trim())),
      { timeout: 10_000, interval: 100, message: `${description}未出现` },
    );
  }

  private detailNameFields(): Locator {
    const pathname = new URL(this.page.url()).pathname;
    return this.page.getByPlaceholder(pathname.includes('/spec/') ? /Cupsize/i : /Sweet/i);
  }

  private async expectFieldErrorOrNativeInvalid(field: Locator, message: RegExp, description: string): Promise<string> {
    const formItem = field.locator('xpath=ancestor::*[contains(concat(" ", normalize-space(@class), " "), " ant-form-item ")][1]');
    const error = formItem.locator('.ant-form-item-explain-error:visible');
    return waitUntil(
      async () => ({
        ariaInvalid: await field.getAttribute('aria-invalid'),
        nativeRequired: await field.getAttribute('required'),
        nativeValid: await field.evaluate((element) => (element as HTMLInputElement).checkValidity()),
        validationMessage: await field.evaluate((element) => (element as HTMLInputElement).validationMessage),
        errorText: await error.allTextContents(),
      }),
      (state) => (
        state.ariaInvalid === 'true'
        && state.errorText.some((text) => message.test(text.trim()))
      ) || (
        state.nativeRequired !== null
        && !state.nativeValid
        && state.validationMessage.trim().length > 0
      ),
      { timeout: 10_000, interval: 100, message: `${description}未出现` },
    ).then((state) => state.errorText.find((text) => message.test(text.trim()))?.trim() || state.validationMessage.trim());
  }
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function escapeCssAttribute(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}
