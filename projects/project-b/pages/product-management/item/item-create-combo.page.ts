import type { Locator, Page, Request, Response } from '@playwright/test';
import { ITEM_CREATE_PATHS, itemCreateComboFormDom } from '../../../test-data/item-list';
import { step } from '../../../utils/step';
import { settleInput } from '../../../utils/input-settle';
import { clickStableAsyncSelectionConfirm, clickStableLocator, selectUniqueAsyncTableTarget } from '../../../utils/async-table-unique-selection';
import { selectFileThroughChooser } from '../../../utils/file-chooser-sequencing';
import { waitUntil } from '../../../utils/wait';
import { ItemCreateFormPage } from './item-create-form.page';
import { ItemCreateComboLocators } from './item-create-combo-locators';

export type ItemComboSaveTrigger = 'save' | 'save-and-new';

/**
 * Composition-root factory used by flows. Keeping page construction here
 * prevents business flows from coupling to concrete page implementations.
 */
export function createItemCreateComboPage(page: Page): ItemCreateComboPage {
  return new ItemCreateComboPage(page);
}

export type ItemComboGroupRequiredAttempt = {
  trigger: ItemComboSaveTrigger;
  route: string;
  errorMessageCount: number;
  errorMessage: string;
  successMessageCount: number;
  responseMethod: string;
  responsePath: string;
  responseStatus: number;
  responseErrorCode: string;
  responseErrorMessage: string;
  mutationCount: number;
  response: Response;
};

export type ItemComboOptionalDialogEvidence = {
  dialogCount: number;
  groupNameInputCount: number;
  altNameInputCount: number;
  selectionQuantityInputCount: number;
  mergeSwitchCount: number;
  repeatSwitchCount: number;
  itemSearchInputCount: number;
  categoryFilterCount: number;
};

export type ItemComboOptionalCardBoundary = {
  route: string;
  cardCount: number;
  customTypeCount: number;
  groupEditButtonCount: number;
  groupDeleteButtonCount: number;
  repeatRuleCount: number;
  selectionQuantityRuleCount: number;
  productRowCount: number;
  productRowButtonCount: number;
  productRowDeleteIconCount: number;
  cardText: string;
};

export type ItemComboOptionalAddResult = {
  response: Response;
  dialog: ItemComboOptionalDialogEvidence;
  boundary: ItemComboOptionalCardBoundary;
};

export type ItemComboGroupMenuEvidence = {
  route: string;
  addFixedCount: number;
  selectFixedCount: number;
  addCustomCount: number;
  selectCustomCount: number;
};

export type ItemComboGroupMenuContractAudit = {
  route: string;
  triggerCount: number;
  visibleMenuItemsBefore: string[];
  visibleMenuItemsAfter: string[];
  addedMenuItems: string[];
};

export type ItemComboExistingSelectionEvidence = {
  comboType: 'fixed' | 'custom';
  groupName: string;
  route: string;
  confirmDisabledBeforeSelection: boolean;
  confirmEnabledAfterSelection: boolean;
  confirmDisabledAfterRemoval: boolean;
  selectedNameCount: number;
  returnedCardCount: number;
};

export type ItemComboFixedAddResult = {
  response: Response;
  groupName: string;
  productName: string;
  returnedCardCount: number;
};

export type ItemComboRequiredFieldAttempt = {
  missingField: 'item-name' | 'standard-price';
  route: string;
  validationSignal: 'visible-error-message' | 'input-error-state';
  errorCount: number;
  errorText: string;
  successMessageCount: number;
  mutationCount: number;
};

export class ItemCreateComboPage extends ItemCreateFormPage {
  protected readonly locators: ItemCreateComboLocators;
  private readonly mainImageLibraryButton: Locator;

  constructor(page: Page) {
    super(page, ITEM_CREATE_PATHS.combo);
    this.locators = new ItemCreateComboLocators(page);
    this.mainImageLibraryButton = page.getByRole('button', { name: 'Library', exact: true });
  }

  @step('打开套餐商品创建页')
  async open(): Promise<void> {
    await this.page.goto(this.expectedPath, { waitUntil: 'domcontentloaded' });
    await this.expectLoaded();
  }

  @step('注册监听并捕获套餐组列表认证请求')
  async captureAuthenticatedComboListRequest(): Promise<Request> {
    await this.open();
    await this.locators.attributeHeading.scrollIntoViewIfNeeded();
    const requestPromise = this.page.waitForRequest((request) => (
      request.method() === 'GET'
      && new URL(request.url()).pathname.endsWith('/ops-brand/brand-sections/list')
    ), { timeout: 15_000 });
    try {
      await this.locators.addComboGroupButton.click({ timeout: 10_000 });
      await this.clickSettledComboMenuItem(this.locators.selectFixedComboMenuItem, 'Select Fixed Combo');
      const request = await requestPromise;
      await this.locators.fixedComboDialog.waitFor({ state: 'visible', timeout: 5_000 });
      if (await this.locators.fixedComboCloseButton.count() === 1) {
        await this.locators.fixedComboCloseButton.click({ timeout: 5_000 });
      } else {
        await this.page.keyboard.press('Escape');
      }
      await this.locators.fixedComboDialog.waitFor({ state: 'hidden', timeout: 5_000 });
      return request;
    } catch (error) {
      await this.page.keyboard.press('Escape').catch(() => undefined);
      throw error;
    }
  }

  protected async expectFormStructure(): Promise<void> {
    await Promise.all([
      this.locators.basicInfoHeading.waitFor({ state: 'visible', timeout: 15_000 }),
      this.locators.priceHeading.waitFor({ state: 'visible', timeout: 15_000 }),
      this.locators.attributeHeading.waitFor({ state: 'visible', timeout: 15_000 }),
    ]);
  }

  @step('等待套餐商品编辑页进入可操作终态')
  async expectPackageEditReady(): Promise<void> {
    await waitUntil(
      () => new URL(this.page.url()).pathname,
      (pathname) => pathname === '/pp/brand/edit/combo',
      { timeout: 15_000, interval: 100, message: '套餐商品编辑路由未就绪。' },
    );
    await this.expectFormStructure();
    await waitUntil(
      async () => ({
        itemName: await this.readItemName(),
        standardPrice: await this.readStandardPriceValue(),
      }),
      (state) => state.itemName.trim().length > 0 && state.standardPrice.trim().length > 0,
      { timeout: 20_000, interval: 100, message: '套餐商品编辑页名称与价格未完成初始化。' },
    );
    await waitUntil(
      () => this.locators.attributeSection.locator('[role="button"][aria-roledescription="sortable"]').count(),
      (count) => count > 0,
      { timeout: 20_000, interval: 100, message: '套餐商品编辑页组合组未完成回显。' },
    );
  }

  @step('快速上传套餐主图并读取稳定终态：{filePath}')
  async uploadPackageMainImageFast(filePath: string): Promise<{
    before: { count: number; sources: string[] };
    after: { count: number; sources: string[] };
    sourceChanged: boolean;
    requestObserved: true;
    responseStatus: number;
    responseBusiness: { code?: string | number; message?: string; dataType: string };
    responseReferences: string[];
  }> {
    const before = await this.readCommonMainImageState();
    const [response] = await Promise.all([
      this.page.waitForResponse((candidate) => (
        candidate.request().method() === 'POST'
        && new URL(candidate.url()).pathname.endsWith('/item/v1/ops-brand/brand-image-files')
      ), { timeout: 8_000 }),
      selectFileThroughChooser(
        this.page,
        this.locators.mainImageUploadArea,
        this.locators.mainImageFileInputs,
        filePath,
        this.locators.localImageUploadButton,
      ),
    ]);
    if (!response.ok()) throw new Error(`套餐主图上传接口返回 HTTP ${response.status()}。`);
    const responseBody = await response.json().catch(() => null) as Record<string, unknown> | null;
    const after = await waitUntil(
      () => this.readCommonMainImageState(),
      (state) => state.count > 0 && JSON.stringify(state.sources) !== JSON.stringify(before.sources),
      { timeout: 8_000, interval: 100, message: '套餐主图上传后未进入稳定预览终态。' },
    ).catch(() => this.readCommonMainImageState());
    const responseReferences = readImageReferences(responseBody);
    if (after.count === 0 || after.sources.length === 0) {
      throw new Error(`套餐主图上传接口成功但页面没有形成可预览图片：${JSON.stringify({ responseReferences, after })}`);
    }
    return {
      before,
      after,
      sourceChanged: JSON.stringify(after.sources) !== JSON.stringify(before.sources),
      requestObserved: true,
      responseStatus: response.status(),
      responseBusiness: {
        ...(typeof responseBody?.code === 'string' || typeof responseBody?.code === 'number'
          ? { code: responseBody.code }
          : {}),
        ...(typeof responseBody?.message === 'string' ? { message: responseBody.message } : {}),
        dataType: Array.isArray(responseBody?.data) ? 'array' : typeof responseBody?.data,
      },
      responseReferences,
    };
  }

  @step('按唯一名称选择套餐 Ingredient Info：{optionName}')
  async selectOtherSettingOptionByName(optionName: string): Promise<{ optionName: string; selected: boolean }> {
    await this.ensureOtherSettingsExpanded();
    const section = this.locators.otherSection.getByText('Ingredient Info', { exact: true }).locator('../..');
    await section.getByRole('button', { name: /Add$/ }).click({ timeout: 10_000 });
    const menu = this.page.locator('.ant-dropdown-menu:visible').last();
    await menu.getByRole('menuitem', { name: 'Ingredient', exact: true }).click({ timeout: 10_000 });
    const dialog = this.locators.visibleDialogs.last();
    await dialog.waitFor({ state: 'visible', timeout: 10_000 });
    const search = dialog.getByRole('textbox').first();
    if (await search.isVisible().catch(() => false)) await search.fill(optionName);
    await settleInput();
    await search.press('Enter');
    const optionRow = dialog.locator('tbody tr:visible').filter({ hasText: optionName });
    const control = optionRow.getByRole('checkbox');
    await waitUntil(
      () => control.count(),
      (count) => count === 1,
      { timeout: 15_000, interval: 100, message: `套餐 Ingredient Info 未出现受控原料：${optionName}` },
    );
    if (!(await control.isChecked())) await control.check({ timeout: 10_000 });
    await dialog.getByRole('button', { name: 'Confirm', exact: true }).click({ timeout: 10_000 });
    await dialog.waitFor({ state: 'hidden', timeout: 10_000 });
    return { optionName, selected: await this.locators.otherSection.getByText(optionName, { exact: true }).count() > 0 };
  }

  @step('从图片库按名称选择套餐商品主图：{imageName}')
  async selectPackageMainImageFromLibraryByName(imageName: string): Promise<{
    imageName: string;
    dialogOpened: boolean;
    candidateCount: number;
    selected: boolean;
    beforeSources: string[];
    afterSources: string[];
  }> {
    const before = await this.readCommonMainImageState();
    await this.locators.mainImageUploadArea.click();
    const dialogOpened = await this.mainImageLibraryButton
      .waitFor({ state: 'visible', timeout: 5_000 })
      .then(() => true)
      .catch(() => false);
    if (!dialogOpened) {
      return { imageName, dialogOpened: false, candidateCount: 0, selected: false, beforeSources: before.sources, afterSources: before.sources };
    }
    await this.mainImageLibraryButton.click({ timeout: 5_000 });
    const libraryDialog = this.locators.visibleDialogs.last();
    await libraryDialog.waitFor({ state: 'visible', timeout: 10_000 });
    const search = libraryDialog.getByRole('textbox').first();
    if (await search.isVisible().catch(() => false)) {
      await search.fill(imageName);
      await settleInput();
      await search.press('Enter');
    }
    const namedEntry = libraryDialog.getByText(imageName, { exact: true });
    const candidateCount = await waitUntil(
      () => namedEntry.count(),
      (count) => count === 1,
      { timeout: 15_000, interval: 100, message: `套餐图片库未唯一返回受控图片：${imageName}` },
    ).catch(() => namedEntry.count());
    if (candidateCount !== 1) {
      await this.page.keyboard.press('Escape');
      return { imageName, dialogOpened: true, candidateCount, selected: false, beforeSources: before.sources, afterSources: before.sources };
    }
    const namedCheckbox = libraryDialog.getByRole('checkbox', { name: imageName, exact: true });
    if (await namedCheckbox.count() === 1) await namedCheckbox.check();
    else await namedEntry.click();
    const confirm = libraryDialog.getByRole('button', { name: /confirm|ok/i }).first();
    if (await confirm.isVisible().catch(() => false)) await confirm.click();
    const after = await waitUntil(
      () => this.readCommonMainImageState(),
      (state) => state.sources.length === 1 && JSON.stringify(state.sources) !== JSON.stringify(before.sources),
      { timeout: 15_000, interval: 250, message: '套餐图片库按名称选择后未形成唯一页面回显。' },
    ).catch(() => this.readCommonMainImageState());
    return {
      imageName,
      dialogOpened: true,
      candidateCount,
      selected: after.sources.length === 1 && JSON.stringify(after.sources) !== JSON.stringify(before.sources),
      beforeSources: before.sources,
      afterSources: after.sources,
    };
  }

  @step('按唯一名称选择套餐统计标签：{names}')
  async selectStatisticsTagsByName(names: readonly string[]): Promise<string[]> {
    await this.ensureOtherSettingsExpanded();
    await this.locators.statsAddButton.click({ timeout: 10_000 });
    const dialog = this.locators.visibleDialogs.last();
    await dialog.waitFor({ state: 'visible', timeout: 10_000 });
    const controls = dialog.getByRole('checkbox');
    await readVisibleControlNames(controls);
    for (const name of names) {
      const control = dialog.getByRole('checkbox', { name, exact: true });
      await control.waitFor({ state: 'visible', timeout: 10_000 });
      if (!(await control.isChecked())) await control.click({ timeout: 10_000 });
    }
    await dialog.getByRole('button', { name: 'Confirm', exact: true }).click({ timeout: 10_000 });
    await dialog.waitFor({ state: 'hidden', timeout: 10_000 });
    const selectedNames: string[] = [];
    for (const name of names) {
      if (await this.locators.otherSection.getByText(name, { exact: true }).count() > 0) selectedNames.push(name);
    }
    return selectedNames;
  }

  @step('展开套餐互斥规则')
  async expandMutuallyExclusiveRules(): Promise<void> {
    await this.locators.mutuallyExclusiveExpandButton.click({ timeout: 10_000 });
  }

  @step('新增套餐互斥规则')
  async addMutuallyExclusiveRule(): Promise<void> {
    await this.locators.mutuallyExclusiveRulesAddButton.click({ timeout: 10_000 });
    await this.locators.mutuallyExclusiveRuleTitles.first().waitFor({ state: 'visible', timeout: 10_000 });
  }

  @step('读取套餐互斥规则结构')
  async readMutuallyExclusiveRuleEvidence(): Promise<{ ruleTitles: string[]; editButtonCount: number; text: string }> {
    return {
      ruleTitles: (await this.locators.mutuallyExclusiveRuleTitles.allInnerTexts()).map((value) => value.trim()),
      editButtonCount: await this.locators.mutuallyExclusiveRuleEditButtons.count(),
      text: (await this.locators.mutuallyExclusiveRulesContainer.innerText()).trim(),
    };
  }

  @step('配置套餐互斥规则第 {index} 侧选项：{optionName}')
  async configureMutuallyExclusiveSide(index: number, optionName: string): Promise<void> {
    const editButton = this.locators.mutuallyExclusiveRuleEditButtons.nth(index);
    await editButton.click({ timeout: 10_000 });
    const dialog = this.locators.mutuallyExclusiveVisibleDialog;
    await dialog.waitFor({ state: 'visible', timeout: 10_000 });
    const option = dialog.getByRole('checkbox', { name: optionName, exact: true });
    await option.waitFor({ state: 'visible', timeout: 10_000 });
    if (!(await option.isChecked())) await option.check({ timeout: 10_000 });
    await dialog.getByRole('button', { name: 'Confirm', exact: true }).click({ timeout: 10_000 });
    await dialog.waitFor({ state: 'hidden', timeout: 10_000 });
  }

  @step('读取套餐互斥冲突项置灰状态：{groupName}')
  async readMutuallyExclusiveConflictEvidence(groupName: string, optionNames: readonly string[]): Promise<{
    groupName: string;
    options: Array<{ name: string; disabled: boolean; checked: boolean }>;
  }> {
    const group = this.locators.commonSelectedAttributeGroup(groupName);
    await group.waitFor({ state: 'visible', timeout: 10_000 });
    await this.ensureComboAttributeOptionsVisible(group, optionNames[0]);
    const options = [] as Array<{ name: string; disabled: boolean; checked: boolean }>;
    for (const name of optionNames) {
      const row = group.locator('tr').filter({ has: this.page.getByText(name, { exact: true }) });
      await row.waitFor({ state: 'visible', timeout: 10_000 });
      const toggle = row.getByRole('switch');
      options.push({ name, disabled: await toggle.isDisabled(), checked: await toggle.getAttribute('aria-checked').then((value) => value === 'true') });
    }
    return { groupName, options };
  }

  private async ensureComboAttributeOptionsVisible(group: import('@playwright/test').Locator, firstOptionName: string): Promise<void> {
    const firstOptionRow = group.locator('tr').filter({ has: this.page.getByText(firstOptionName, { exact: true }) });
    if (await firstOptionRow.isVisible().catch(() => false)) return;
    const expandButton = group.getByRole('button').filter({ has: this.page.getByRole('img', { name: 'down' }) }).first();
    await expandButton.click({ timeout: 10_000 });
    await firstOptionRow.waitFor({ state: 'visible', timeout: 10_000 });
  }

  @step('读取套餐组内商品移除控件：{groupName}')
  async readComboGroupRemovalBoundary(groupName: string): Promise<{
    groupName: string;
    groupCount: number;
    deleteButtonCount: number;
    rowCount: number;
    rowDeleteButtonCount: number;
    text: string;
  }> {
    const group = this.locators.selectedComboGroup(groupName);
    await group.waitFor({ state: 'visible', timeout: 10_000 });
    const rows = group.locator('tbody tr:visible');
    return {
      groupName,
      groupCount: await group.count(),
      deleteButtonCount: await group.getByRole('button', { name: /delete|remove/i }).count(),
      rowCount: await rows.count(),
      rowDeleteButtonCount: await rows.getByRole('button', { name: /delete|remove/i }).count(),
      text: (await group.innerText()).trim(),
    };
  }

  @step('移除套餐组内全部商品：{groupName}')
  async removeAllComboGroupItems(groupName: string): Promise<{ removedCount: number; remainingCount: number }> {
    const group = this.locators.selectedComboGroup(groupName);
    await group.waitFor({ state: 'visible', timeout: 10_000 });
    const rows = group.locator('tbody tr:visible');
    const before = await rows.count();
    await group.getByRole('button', { name: 'edit Edit', exact: true }).click({ timeout: 10_000 });
    const dialog = this.locators.visibleDialogs.last();
    await dialog.waitFor({ state: 'visible', timeout: 10_000 });
    const checkedControls = dialog.getByRole('checkbox', { checked: true });
    const checkedBefore = await checkedControls.count();
    if (checkedBefore === 0) throw new Error(`套餐组 ${groupName} 编辑弹窗没有已选商品`);
    for (let index = checkedBefore - 1; index >= 0; index -= 1) {
      const control = checkedControls.nth(index);
      if (await control.isChecked()) await control.uncheck({ timeout: 10_000 });
    }
    await dialog.getByRole('button', { name: 'Confirm', exact: true }).click({ timeout: 10_000 });
    await dialog.waitFor({ state: 'hidden', timeout: 10_000 });
    const remainingCount = await waitUntil(
      () => rows.count(),
      (count) => count === 0,
      { timeout: 10_000, interval: 100, message: `套餐组 ${groupName} 子项未全部移除` },
    );
    return { removedCount: before, remainingCount };
  }

  @step('删除整个套餐分组：{groupName}')
  async deleteComboGroupByName(groupName: string): Promise<{ beforeCount: number; afterCount: number }> {
    const group = this.locators.selectedComboGroup(groupName);
    const beforeCount = await group.count();
    if (beforeCount !== 1) throw new Error(`删除套餐分组前未找到唯一分组：${groupName} count=${beforeCount}`);
    const deleteButton = group.getByRole('button', { name: /delete|删除/i }).last();
    if (await deleteButton.count() !== 1) throw new Error(`套餐分组未出现整组删除按钮：${groupName}`);
    await deleteButton.click({ timeout: 10_000 });
    const afterCount = await waitUntil(
      () => this.locators.selectedComboGroup(groupName).count(),
      (count) => count === 0,
      { timeout: 10_000, interval: 100, message: `套餐分组删除后仍存在：${groupName}` },
    );
    return { beforeCount, afterCount };
  }

  @step('从套餐页面当前弹窗选择可见描述标签：{attemptedCount}')
  async selectVisibleDescriptionTags(attemptedCount: number): Promise<{
    availableNames: string[];
    checkedNames: string[];
    blockedNames: string[];
    selectedNames: string[];
    maximumText: string;
  }> {
    await this.ensureOtherSettingsExpanded();
    await this.locators.descriptionLabelsAddButton.click({ timeout: 10_000 });
    const dialog = this.locators.descriptionLabelsDialog();
    await dialog.waitFor({ state: 'visible', timeout: 10_000 });
    const controls = dialog.getByRole('checkbox');
    await waitUntil(
      () => controls.count(),
      (count) => count > 0,
      { timeout: 8_000, interval: 100, message: '描述标签弹窗无可观察选项。' },
    ).catch(() => 0);
    const availableNames = await readVisibleControlNames(controls);
    const checkedNames: string[] = [];
    const blockedNames: string[] = [];
    for (let index = 0; index < Math.min(attemptedCount, await controls.count()); index += 1) {
      const control = controls.nth(index);
      const name = availableNames[index] ?? `index:${index}`;
      if (await control.isDisabled()) {
        blockedNames.push(name);
        continue;
      }
      if (!(await control.isChecked())) await control.click({ timeout: 5_000 });
      if (await control.isChecked()) checkedNames.push(name);
      else blockedNames.push(name);
    }
    const maximumText = (await dialog.innerText()).split('\n').find((line) => /Maximum\s+\d+/i.test(line)) ?? '';
    await dialog.getByRole('button', { name: 'Confirm', exact: true }).click({ timeout: 5_000 });
    await dialog.waitFor({ state: 'hidden', timeout: 8_000 });
    const selectedNames = await this.readOtherSettingsSelectedNames(checkedNames);
    return { availableNames, checkedNames, blockedNames, selectedNames, maximumText };
  }

  @step('从套餐页面当前弹窗选择可见统计标签：{requestedCount}')
  async selectVisibleStatisticsTags(requestedCount: number): Promise<{
    availableNames: string[];
    selectedNames: string[];
  }> {
    await this.ensureOtherSettingsExpanded();
    await this.locators.statsAddButton.click({ timeout: 10_000 });
    const dialog = this.locators.visibleDialogs.last();
    await dialog.waitFor({ state: 'visible', timeout: 10_000 });
    const controls = dialog.getByRole('checkbox');
    await waitUntil(
      () => controls.count(),
      (count) => count > 0,
      { timeout: 8_000, interval: 100, message: '统计标签弹窗无可观察选项。' },
    ).catch(() => 0);
    const availableNames = await readVisibleControlNames(controls);
    const selectedNames: string[] = [];
    for (let index = 0; index < Math.min(requestedCount, await controls.count()); index += 1) {
      const control = controls.nth(index);
      if (await control.isDisabled()) continue;
      if (!(await control.isChecked())) await control.click({ timeout: 5_000 });
      if (await control.isChecked()) selectedNames.push(availableNames[index] ?? `index:${index}`);
    }
    await dialog.getByRole('button', { name: 'Confirm', exact: true }).click({ timeout: 5_000 });
    await dialog.waitFor({ state: 'hidden', timeout: 8_000 });
    return { availableNames, selectedNames };
  }

  @step('从套餐页面当前弹窗选择第 {index} 个可见商品角标')
  async selectVisibleCornerMark(index: number): Promise<{ availableNames: string[]; name: string; selected: boolean }> {
    await this.ensureOtherSettingsExpanded();
    await this.locators.badgesAddButton.click({ timeout: 10_000 });
    const dialog = this.locators.badgesDialog();
    await dialog.waitFor({ state: 'visible', timeout: 10_000 });
    const controls = dialog.getByRole('radio');
    const count = await waitUntil(
      () => controls.count(),
      (value) => value > index,
      { timeout: 8_000, interval: 100, message: `商品角标可见选项不足：需要索引 ${index}` },
    ).catch(() => controls.count());
    const availableNames = await readVisibleControlNames(controls);
    if (count <= index) {
      await this.page.keyboard.press('Escape').catch(() => undefined);
      throw new Error(`商品角标可见选项不足：需要 ${index + 1}，实际 ${count}`);
    }
    const control = controls.nth(index);
    const name = availableNames[index] ?? `index:${index}`;
    await control.click({ timeout: 5_000 });
    await dialog.getByRole('button', { name: 'Confirm', exact: true }).click({ timeout: 5_000 });
    await dialog.waitFor({ state: 'hidden', timeout: 8_000 });
    return { availableNames, name, selected: await this.locators.otherSection.getByText(name, { exact: true }).count() > 0 };
  }

  @step('读取套餐商品创建页核心结构')
  async readCoreStructureEvidence(): Promise<{
    basicInfo: number;
    price: number;
    comboGroup: number;
    moreSettings: number;
  }> {
    return {
      basicInfo: await this.locators.basicInfoHeading.count(),
      price: await this.locators.priceHeading.count(),
      comboGroup: await this.locators.addComboGroupButton.count(),
      moreSettings: await this.locators.otherSettingsHeading.count(),
    };
  }

  @step('展开套餐商品高级设置')
  async clickAdvancedSettings(): Promise<void> {
    await this.locators.advancedSettingsButton.click();
  }

  @step('填写套餐商品起售数量：{quantity}')
  async fillMinimumOrderQuantity(quantity: string): Promise<void> {
    await this.locators.minimumOrderQuantityInput.waitFor({ state: 'visible', timeout: 10_000 });
    await this.locators.minimumOrderQuantityInput.fill(quantity);
  }

  @step('通过键盘输入套餐商品起售数量原始值：{quantity}')
  async typeMinimumOrderQuantityRaw(quantity: string): Promise<void> {
    await this.locators.minimumOrderQuantityInput.waitFor({ state: 'visible', timeout: 10_000 });
    await this.locators.minimumOrderQuantityInput.press('ControlOrMeta+A');
    await this.locators.minimumOrderQuantityInput.type(quantity);
  }

  @step('读取套餐商品起售数量输入值')
  async readMinimumOrderQuantityValue(timeout = 5_000): Promise<string> {
    return this.locators.minimumOrderQuantityInput.inputValue({ timeout });
  }

  @step('填写套餐商品包装费：{packagingFee}')
  async fillPackagingFee(packagingFee: string): Promise<void> {
    await this.locators.packagingFeeInput.fill(packagingFee);
  }

  @step('读取套餐商品包装费')
  async readPackagingFee(timeout = 5_000): Promise<string> {
    return this.locators.packagingFeeInput.inputValue({ timeout });
  }

  @step('套餐商品仅选择有子级的一级分类：{parentName}')
  async selectCategoryParentOnly(parentName: string, expectedLeafName: string): Promise<{
    selectedPathBefore: string;
    selectedPathAfter: string;
    visibleMenuCount: number;
    childVisible: boolean;
  }> {
    await this.locators.categoryCascader.click({ timeout: 10_000 });
    await waitUntil(
      () => this.locators.visibleCategoryMenus.count(),
      (count) => count > 0,
      { timeout: 10_000, interval: 100, message: '套餐商品分类菜单未显示。' },
    );
    const selectedPathBefore = (await this.locators.categorySelectedValue.innerText()).trim();
    const parent = this.locators.categoryNode(parentName);
    const parentCount = await parent.count();
    if (parentCount !== 1) throw new Error(`套餐商品一级分类 ${parentName} 数量=${parentCount}`);
    await parent.click({ force: true, timeout: 10_000 });
    const state = await waitUntil(
      async () => ({
        selectedPathAfter: (await this.locators.categorySelectedValue.innerText()).trim(),
        visibleMenuCount: await this.locators.visibleCategoryMenus.count(),
        childVisible: await this.locators.categoryNode(expectedLeafName).isVisible().catch(() => false),
      }),
      (value) => value.visibleMenuCount === 2 && value.childVisible,
      { timeout: 10_000, message: `套餐商品一级分类 ${parentName} 未展开二级分类。` },
    );
    return { selectedPathBefore, ...state };
  }

  @step('选择套餐商品二级分类：{parentName} / {leafName}')
  async selectCategoryPath(parentName: string, leafName: string): Promise<string> {
    await this.locators.categoryCascader.click({ timeout: 10_000 });
    await waitUntil(
      () => this.locators.visibleCategoryMenus.count(),
      (count) => count > 0,
      { timeout: 10_000, interval: 100, message: '套餐商品分类菜单未显示。' },
    );
    const parent = this.locators.categoryNode(parentName);
    if (await parent.count() !== 1) throw new Error(`套餐商品一级分类 ${parentName} 不唯一`);
    await parent.click({ force: true, timeout: 10_000 });
    await waitUntil(
      () => this.locators.categoryNode(leafName).count(),
      (count) => count === 1,
      { timeout: 10_000, interval: 100, message: `套餐商品二级分类 ${leafName} 未显示。` },
    );
    await this.locators.categoryNode(leafName).click({ force: true, timeout: 10_000 });
    return waitUntil(
      () => this.locators.categorySelectedValue.innerText(),
      (value) => value.includes(parentName) && value.includes(leafName),
      { timeout: 10_000, interval: 100, message: `套餐商品分类未回显 ${parentName} / ${leafName}。` },
    );
  }

  @step('选择无子级的套餐商品一级分类：{categoryName}')
  async selectLeafCategoryWithoutChildren(categoryName: string): Promise<string> {
    await this.locators.categoryCascader.click({ timeout: 10_000 });
    await waitUntil(
      () => this.locators.visibleCategoryMenus.count(),
      (count) => count > 0,
      { timeout: 10_000, message: '套餐商品分类菜单未展开。' },
    );
    const nodes = this.locators.categoryNode(categoryName);
    const count = await nodes.count();
    if (count !== 1) throw new Error(`套餐商品分类 ${categoryName} 匹配数量应为 1，实际为 ${count}。`);
    await nodes.click({ force: true, timeout: 10_000 });
    return waitUntil(
      () => this.locators.categorySelectedValue.innerText(),
      (value) => value.includes(categoryName),
      { timeout: 10_000, message: `套餐商品无子级一级分类未回显：${categoryName}` },
    );
  }

  @step('读取套餐商品分类回显路径')
  async readSelectedCategoryPath(): Promise<string> {
    return (await this.locators.categorySelectedValue.innerText()).trim();
  }

  @step('填写套餐商品描述：{description}')
  async fillDescription(description: string): Promise<void> {
    await this.locators.descriptionInput.fill(description, { timeout: 5_000 });
  }

  @step('读取套餐商品描述边界')
  async readDescriptionBoundary(): Promise<{ value: string; characterCountText: string; maxLength: number | null }> {
    const timeout = 10_000;
    const characterCountText = await this.locators.descriptionCharCount.count() === 0
      ? ''
      : (await this.locators.descriptionCharCount.innerText({ timeout })).trim();
    return {
      value: await this.locators.descriptionInput.inputValue({ timeout }),
      characterCountText,
      maxLength: await this.locators.descriptionInput.getAttribute('maxlength', { timeout }).then((value) => value ? Number(value) : null),
    };
  }

  @step('填写套餐商品 POS 名称：{posName}')
  async fillPosName(posName: string): Promise<void> {
    await this.locators.posNameInput.fill(posName, { timeout: 5_000 });
  }

  @step('填写套餐商品送厨名称：{kitchenName}')
  async fillKitchenName(kitchenName: string): Promise<void> {
    await this.locators.kitchenNameInput.fill(kitchenName, { timeout: 5_000 });
  }

  @step('读取套餐商品 POS 名称与送厨名称')
  async readPosAndKitchenNames(): Promise<{ posName: string; kitchenName: string }> {
    return {
      posName: await this.locators.posNameInput.inputValue(),
      kitchenName: await this.locators.kitchenNameInput.inputValue(),
    };
  }

  @step('填写套餐商品助记码：{mnemonicCode}')
  async fillMnemonicCode(mnemonicCode: string): Promise<void> {
    await this.locators.mnemonicCodeInput.fill(mnemonicCode, { timeout: 5_000 });
  }

  @step('读取套餐商品高级文本字段能力')
  async readAdvancedTextFieldCapabilityEvidence(): Promise<{
    description: { count: number; visible: boolean };
    posName: { count: number; visible: boolean };
    kitchenName: { count: number; visible: boolean };
    mnemonicCode: { count: number; visible: boolean };
  }> {
    return {
      description: {
        count: await this.locators.descriptionInput.count(),
        visible: await this.locators.descriptionInput.isVisible().catch(() => false),
      },
      posName: {
        count: await this.locators.posNameInput.count(),
        visible: await this.locators.posNameInput.isVisible().catch(() => false),
      },
      kitchenName: {
        count: await this.locators.kitchenNameInput.count(),
        visible: await this.locators.kitchenNameInput.isVisible().catch(() => false),
      },
      mnemonicCode: {
        count: await this.locators.mnemonicCodeInput.count(),
        visible: await this.locators.mnemonicCodeInput.isVisible().catch(() => false),
      },
    };
  }

  @step('读取套餐商品助记码边界')
  async readMnemonicBoundary(): Promise<{ value: string; maxLength: number | null }> {
    return {
      value: await this.locators.mnemonicCodeInput.inputValue(),
      maxLength: await this.locators.mnemonicCodeInput.getAttribute('maxlength').then((value) => value ? Number(value) : null),
    };
  }

  @step('读取套餐分组四菜单证据')
  async readComboGroupMenuEvidence(): Promise<ItemComboGroupMenuEvidence> {
    await this.locators.attributeHeading.scrollIntoViewIfNeeded();
    await this.locators.addComboGroupButton.click({ timeout: 10_000 });
    await Promise.all([
      this.locators.addFixedComboMenuItem.waitFor({ state: 'visible', timeout: 5_000 }),
      this.locators.selectFixedComboMenuItem.waitFor({ state: 'visible', timeout: 5_000 }),
      this.locators.addCustomComboMenuItem.waitFor({ state: 'visible', timeout: 5_000 }),
      this.locators.selectCustomComboMenuItem.waitFor({ state: 'visible', timeout: 5_000 }),
    ]);
    return {
      route: new URL(this.page.url()).pathname,
      addFixedCount: await this.locators.addFixedComboMenuItem.count(),
      selectFixedCount: await this.locators.selectFixedComboMenuItem.count(),
      addCustomCount: await this.locators.addCustomComboMenuItem.count(),
      selectCustomCount: await this.locators.selectCustomComboMenuItem.count(),
    };
  }

  @step('审计套餐分组菜单当前控件合同')
  async auditComboGroupMenuContract(): Promise<ItemComboGroupMenuContractAudit> {
    await this.locators.attributeHeading.scrollIntoViewIfNeeded();
    const visibleMenuItemsBefore = await this.readVisibleMenuItemTexts();
    await this.locators.addComboGroupButton.click({ timeout: 10_000 });
    const visibleMenuItemsAfter = await waitUntil(
      () => this.readVisibleMenuItemTexts(),
      (items) => items.some((item) => !visibleMenuItemsBefore.includes(item)),
      { timeout: 10_000, interval: 100, message: '套餐分组菜单未展示新的可见菜单项' },
    );
    return {
      route: new URL(this.page.url()).pathname,
      triggerCount: await this.locators.addComboGroupButton.count(),
      visibleMenuItemsBefore,
      visibleMenuItemsAfter,
      addedMenuItems: visibleMenuItemsAfter.filter((item) => !visibleMenuItemsBefore.includes(item)),
    };
  }

  @step('读取套餐商品属性组引用入口能力')
  async readCommonAttributeReferenceCapabilityEvidence(): Promise<{
    addButtonCount: number;
    menuItemsByButton: string[][];
    supportedKinds: Array<'flavor' | 'recipe' | 'additives'>;
  }> {
    await this.locators.attributeHeading.scrollIntoViewIfNeeded();
    const addButtons = this.locators.attributeSection.getByRole('button', { name: /Add$/ });
    const addButtonCount = await addButtons.count();
    const menuItemsByButton: string[][] = [];
    const supportedKinds = new Set<'flavor' | 'recipe' | 'additives'>();

    for (let index = 0; index < addButtonCount; index += 1) {
      const button = addButtons.nth(index);
      if (!await button.isVisible().catch(() => false)) continue;
      await button.click({ timeout: 10_000 });
      const menuItems = this.page.locator('.ant-dropdown-menu:visible').getByRole('menuitem');
      await menuItems.first().waitFor({ state: 'visible', timeout: 5_000 }).catch(() => undefined);
      const names = (await menuItems.allTextContents()).map((name) => name.trim()).filter(Boolean);
      menuItemsByButton.push(names);
      if (names.includes('Flavor')) supportedKinds.add('flavor');
      if (names.includes('Recipe')) supportedKinds.add('recipe');
      if (names.includes('Additives')) supportedKinds.add('additives');
      await this.page.keyboard.press('Escape');
    }

    return { addButtonCount, menuItemsByButton, supportedKinds: [...supportedKinds] };
  }

  @step('读取 Select Custom Combo 路由基线：{targetIdentity}')
  async readBaseline(targetIdentity: string): Promise<{
    route: string;
    dialogCount: number;
    targetCardCount: number;
  }> {
    const dialogVisible = await this.locators.customComboDialog.isVisible().catch(() => false);
    return {
      route: new URL(this.page.url()).pathname,
      dialogCount: dialogVisible ? 1 : 0,
      targetCardCount: await this.locators.customComboGroupCard(targetIdentity).count(),
    };
  }

  @step('读取 Select Custom Combo 菜单证据')
  async readMenuEvidence(): Promise<ItemComboGroupMenuEvidence> {
    return this.readComboGroupMenuEvidence();
  }

  @step('打开 Select Custom Combo 弹窗并等待列表终态：{targetIdentity}')
  async openSelectCustomDialog(targetIdentity: string): Promise<{
    dialogCount: number;
    loadingObserved: boolean;
    loadingCount: number;
    rowCount: number;
    targetCount: number;
    targetVisible: boolean;
    targetEnabled: boolean;
    confirmDisabledBeforeSelection: boolean;
    network: { completed: boolean; method: string; path: string; status: number };
  }> {
    let loadingObserved = false;
    let network = {
      completed: false,
      method: '',
      path: '',
      status: 0,
    };
    const listener = (response: Response) => {
      if (response.request().method() !== 'GET') return;
      const path = new URL(response.url()).pathname;
      if (!path.endsWith('/ops-brand/brand-sections/list')) return;
      network = {
        completed: true,
        method: response.request().method(),
        path,
        status: response.status(),
      };
    };
    this.page.on('response', listener);
    try {
      await this.clickSettledComboMenuItem(this.locators.selectCustomComboMenuItem, 'Select Custom Combo');
      await waitUntil(
        async () => {
          const loadingCount = await this.locators.customComboLoading.count();
          if (loadingCount > 0) loadingObserved = true;
          return {
            dialogCount: await this.locators.customComboDialog.count(),
            loadingCount,
            networkCompleted: network.completed,
          };
        },
        (state) => state.dialogCount === 1 && state.loadingCount === 0 && state.networkCompleted,
        { timeout: 15_000, interval: 100, message: 'Select Custom Combo 弹窗未进入列表终态。' },
      );
      const target = this.locators.customComboRowCheckbox(targetIdentity);
      const targetCount = await target.count();
      return {
        dialogCount: await this.locators.customComboDialog.count(),
        loadingObserved,
        loadingCount: await this.locators.customComboLoading.count(),
        rowCount: await this.locators.customComboRows.count(),
        targetCount,
        targetVisible: targetCount === 1 && await target.isVisible(),
        targetEnabled: targetCount === 1 && await target.isEnabled(),
        confirmDisabledBeforeSelection: await this.locators.customComboConfirmButton.isDisabled(),
        network,
      };
    } finally {
      this.page.off('response', listener);
    }
  }

  @step('只读验证 Select Custom Combo 目标：{targetIdentity}')
  async verifySelectCustomTarget(targetIdentity: string): Promise<{
    targetCount: number;
    targetVisible: boolean;
    targetEnabled: boolean;
  }> {
    const target = this.locators.customComboRowCheckbox(targetIdentity);
    const targetCount = await target.count();
    return {
      targetCount,
      targetVisible: targetCount === 1 && await target.isVisible(),
      targetEnabled: targetCount === 1 && await target.isEnabled(),
    };
  }

  @step('可逆切换 Select Custom Combo 目标：{targetIdentity}')
  async toggleSelectCustomTarget(
    targetIdentity: string,
    expectedConfirmDisabled: boolean,
  ): Promise<{ confirmDisabled: boolean }> {
    const target = this.locators.customComboRowCheckbox(targetIdentity);
    if (await target.count() !== 1) throw new Error(`Select Custom Combo 目标不唯一：${targetIdentity}`);
    await target.click();
    const confirmDisabled = await waitUntil(
      () => this.locators.customComboConfirmButton.isDisabled(),
      (value) => value === expectedConfirmDisabled,
      { timeout: 10_000, interval: 100, message: 'Select Custom Combo 确认按钮状态未达到预期。' },
    );
    return { confirmDisabled };
  }

  @step('刷新恢复 Select Custom Combo 路由基线：{targetIdentity}')
  async reconstructRouteBaseline(targetIdentity: string): Promise<{
    route: string;
    dialogCount: number;
    targetCardCount: number;
  }> {
    await this.page.reload({ waitUntil: 'domcontentloaded' });
    await this.expectLoaded();
    return this.readBaseline(targetIdentity);
  }

  @step('按名称添加固定搭配套餐组：{comboGroupName}')
  async addFixedComboGroupByName(comboGroupName: string): Promise<void> {
    await this.locators.attributeHeading.scrollIntoViewIfNeeded();
    await this.locators.addComboGroupButton.click({ timeout: 10_000 });
    let listRequestCompleted = false;
    const markListRequestCompleted = (response: Response) => {
      if (response.request().method() !== 'GET' || !response.ok()) return;
      try {
        listRequestCompleted = new URL(response.url()).pathname.endsWith('/ops-brand/brand-sections/list');
      } catch {
        listRequestCompleted = false;
      }
    };
    this.page.on('response', markListRequestCompleted);
    try {
      await this.clickSettledComboMenuItem(this.locators.selectFixedComboMenuItem, 'Select Fixed Combo');
      await this.locators.fixedComboDialog.waitFor({ state: 'visible', timeout: 10_000 });
      await this.locators.fixedComboSearchInput.fill(comboGroupName);
      await settleInput();
      await this.locators.fixedComboSearchInput.press('Enter');
      await selectUniqueAsyncTableTarget({
        dialog: this.locators.fixedComboDialog,
        loading: this.locators.fixedComboLoading,
        rows: this.locators.fixedComboRows,
        target: this.locators.fixedComboRowCheckbox(comboGroupName),
        requestCompleted: () => listRequestCompleted,
        timeout: 15_000,
      });
    } finally {
      this.page.off('response', markListRequestCompleted);
    }
    await clickStableAsyncSelectionConfirm({ confirmButton: this.locators.fixedComboConfirmButton, dialog: this.locators.fixedComboDialog, selectedControl: this.locators.fixedComboRowCheckbox(comboGroupName), label: 'Select Fixed Combo' });
    await this.locators.fixedComboDialog.waitFor({ state: 'hidden', timeout: 10_000 });
  }

  @step('添加首个 Custom Combo 套餐组')
  async addFirstCustomComboGroup(): Promise<void> {
    await this.locators.attributeHeading.scrollIntoViewIfNeeded();
    await this.locators.addComboGroupButton.click({ timeout: 10_000 });
    await this.clickSettledComboMenuItem(this.locators.selectCustomComboMenuItem, 'Select Custom Combo');
    await this.locators.customComboDialog.waitFor({ state: 'visible', timeout: 10_000 });
    const rowTexts = await this.locators.customComboDialog
      .locator('tbody tr.ant-table-row:visible')
      .allInnerTexts();
    if (rowTexts.length !== 1) {
      throw new Error(`无法安全推断 Custom Combo：候选行数量为 ${rowTexts.length}，请按业务名称选择`);
    }
    const comboGroupName = rowTexts[0]?.split(/\r?\n/).map((value) => value.trim()).find(Boolean);
    if (!comboGroupName) throw new Error('无法从唯一 Custom Combo 行读取业务名称');
    await this.locators.customComboRowCheckbox(comboGroupName).click();
    await this.confirmSelectedCustomComboGroup();
  }

  @step('探测已有套餐组选择、移除与确认：{input.comboType} {input.groupName}')
  async probeExistingComboGroupSelection(input: {
    comboType: 'fixed' | 'custom';
    groupName: string;
  }): Promise<ItemComboExistingSelectionEvidence> {
    await this.locators.attributeHeading.scrollIntoViewIfNeeded();
    await this.locators.addComboGroupButton.click();
    const dialog = input.comboType === 'fixed' ? this.locators.fixedComboDialog : this.locators.customComboDialog;
    const loading = input.comboType === 'fixed' ? this.locators.fixedComboLoading : this.locators.customComboLoading;
    const rows = input.comboType === 'fixed' ? this.locators.fixedComboRows : this.locators.customComboRows;
    const confirm = input.comboType === 'fixed'
      ? this.locators.fixedComboConfirmButton
      : this.locators.customComboConfirmButton;
    const target = input.comboType === 'fixed'
      ? this.locators.fixedComboRowCheckbox(input.groupName)
      : this.locators.customComboRowCheckbox(input.groupName);
    const menuItem = input.comboType === 'fixed'
      ? this.locators.selectFixedComboMenuItem
      : this.locators.selectCustomComboMenuItem;
    let listRequestCompleted = false;
    const markListRequestCompleted = (response: Response) => {
      if (response.request().method() !== 'GET' || !response.ok()) return;
      listRequestCompleted = new URL(response.url()).pathname.endsWith('/ops-brand/brand-sections/list');
    };
    this.page.on('response', markListRequestCompleted);
    try {
      await this.clickSettledComboMenuItem(menuItem, input.comboType === 'fixed' ? 'Select Fixed Combo' : 'Select Custom Combo');
      await dialog.waitFor({ state: 'visible', timeout: 5_000 });
      const confirmDisabledBeforeSelection = await confirm.isDisabled({ timeout: 5_000 });
      await selectUniqueAsyncTableTarget({
        dialog,
        loading,
        rows,
        target,
        requestCompleted: () => listRequestCompleted,
        timeout: 15_000,
      });
      const confirmEnabledAfterSelection = await confirm.isEnabled({ timeout: 5_000 });
      const selectedNameCount = await dialog.getByText(input.groupName, { exact: true }).count();
      await target.click({ timeout: 5_000 });
      const confirmDisabledAfterRemoval = await confirm.isDisabled({ timeout: 5_000 });
      await target.click({ timeout: 5_000 });
      await confirm.click({ timeout: 5_000 });
      await dialog.waitFor({ state: 'hidden', timeout: 10_000 });
      return {
        ...input,
        route: new URL(this.page.url()).pathname,
        confirmDisabledBeforeSelection,
        confirmEnabledAfterSelection,
        confirmDisabledAfterRemoval,
        selectedNameCount,
        returnedCardCount: await this.locators.customComboGroupCard(input.groupName).count(),
      };
    } finally {
      this.page.off('response', markListRequestCompleted);
    }
  }

  @step('按名称搜索已有套餐组：{input.comboType} {input.query}')
  async probeExistingComboGroupSearch(input: {
    comboType: 'fixed' | 'custom';
    query: string;
    targetName: string;
  }): Promise<{
    searchInputCount: number;
    initialRowCount: number;
    searchedRowCount: number;
    searchedTargetCount: number;
    restoredRowCount: number;
    responseStatuses: number[];
  }> {
    await this.locators.attributeHeading.scrollIntoViewIfNeeded();
    await this.locators.addComboGroupButton.click({ timeout: 10_000 });
    const menuItem = input.comboType === 'fixed' ? this.locators.selectFixedComboMenuItem : this.locators.selectCustomComboMenuItem;
    const dialog = input.comboType === 'fixed' ? this.locators.fixedComboDialog : this.locators.customComboDialog;
    const rows = input.comboType === 'fixed' ? this.locators.fixedComboRows : this.locators.customComboRows;
    const search = input.comboType === 'fixed' ? this.locators.fixedComboSearchInput : this.locators.customComboSearchInput;
    const target = input.comboType === 'fixed'
      ? this.locators.fixedComboRowCheckbox(input.targetName)
      : this.locators.customComboRowCheckbox(input.targetName);
    const responseStatuses: number[] = [];
    const listener = (response: Response) => {
      if (response.request().method() === 'GET' && new URL(response.url()).pathname.endsWith('/ops-brand/brand-sections/list')) {
        responseStatuses.push(response.status());
      }
    };
    this.page.on('response', listener);
    try {
      await this.clickSettledComboMenuItem(menuItem, input.comboType === 'fixed' ? 'Select Fixed Combo' : 'Select Custom Combo');
      await dialog.waitFor({ state: 'visible', timeout: 10_000 });
      const searchInputCount = await search.count();
      if (searchInputCount !== 1) throw new Error(`${input.comboType} 套餐组搜索输入框数量=${searchInputCount}`);
      const initialRowCount = await waitUntil(
        () => rows.count(),
        (count) => count > 0,
        { timeout: 5_000, interval: 100, message: `${input.comboType} 套餐组默认列表为空` },
      );
      const initialResponseCount = responseStatuses.length;
      await search.fill(input.query, { timeout: 5_000 });
      await waitUntil(
        async () => ({ rows: await rows.count(), target: await target.count(), responses: responseStatuses.length }),
        (state) => state.responses > initialResponseCount && state.target === 1,
        { timeout: 15_000, interval: 100, message: `${input.comboType} 套餐组搜索未找到目标 ${input.targetName}` },
      );
      const searchedRowCount = await rows.count();
      const searchedTargetCount = await target.count();
      const clearResponseCount = responseStatuses.length;
      await search.fill('', { timeout: 5_000 });
      const restoredRowState = await waitUntil(
        async () => ({ rows: await rows.count(), responses: responseStatuses.length, search: await search.inputValue() }),
        (state) => state.responses > clearResponseCount && state.rows > 0 && state.search === '',
        { timeout: 15_000, interval: 100, message: `${input.comboType} 套餐组清空搜索后列表未恢复` },
      );
      await this.page.keyboard.press('Escape');
      await dialog.waitFor({ state: 'hidden', timeout: 5_000 });
      return { searchInputCount, initialRowCount, searchedRowCount, searchedTargetCount, restoredRowCount: restoredRowState.rows, responseStatuses };
    } finally {
      this.page.off('response', listener);
    }
  }

  @step('新增固定搭配套餐组：{input.groupName}')
  async addFixedComboGroup(input: {
    groupName: string;
    productName: string;
    beforeCreateTrigger?: () => Promise<void> | void;
  }): Promise<ItemComboFixedAddResult> {
    await this.locators.attributeHeading.scrollIntoViewIfNeeded();
    await this.locators.addComboGroupButton.click({ timeout: 10_000 });
    await this.clickSettledComboMenuItem(this.locators.addFixedComboMenuItem, 'Add Fixed Combo');
    await this.locators.addFixedComboDialog.waitFor({ state: 'visible', timeout: 10_000 });
    await this.locators.addFixedComboGroupNameInput.fill(input.groupName);

    let listRequestCompleted = false;
    const markListRequestCompleted = (response: Response) => {
      if (response.request().method() !== 'POST' || !response.ok()) return;
      listRequestCompleted = new URL(response.url()).pathname.endsWith('/ops-brand/brand-items/pageQuery');
    };
    this.page.on('response', markListRequestCompleted);
    try {
      await this.locators.addFixedComboItemSearchInput.fill(input.productName);
      await selectUniqueAsyncTableTarget({
        dialog: this.locators.addFixedComboDialog,
        loading: this.locators.addFixedComboLoading,
        rows: this.locators.addFixedComboRows,
        target: this.locators.addFixedComboCreateProductCheckbox(input.productName),
        requestCompleted: () => listRequestCompleted,
        timeout: 15_000,
      });
    } finally {
      this.page.off('response', markListRequestCompleted);
    }

    const response = await captureResponse(
      this.page,
      (candidate) => candidate.request().method() === 'POST'
        && new URL(candidate.url()).pathname.endsWith('/ops-brand/brand-sections'),
      async () => {
        await settleInput();
        await input.beforeCreateTrigger?.();
        await this.locators.addFixedComboConfirmButton.click({ timeout: 5_000 });
      },
      15_000,
      '新增固定搭配套餐组响应未捕获',
    );
    await this.locators.addFixedComboDialog.waitFor({ state: 'hidden', timeout: 10_000 });
    return {
      response,
      groupName: input.groupName,
      productName: input.productName,
      returnedCardCount: await this.locators.customComboGroupCard(input.groupName).count(),
    };
  }

  @step('提交套餐商品必填字段缺失：{input.missingField}')
  async attemptSaveWithMissingRequiredField(input: {
    missingField: 'item-name' | 'standard-price';
    itemName?: string;
    price?: string;
    minimumOrderQuantity: string;
    comboGroupName: string;
    beforeSaveTrigger?: () => Promise<void> | void;
  }): Promise<ItemComboRequiredFieldAttempt> {
    if (input.itemName) await this.fillItemName(input.itemName);
    await this.clickAdvancedSettings();
    await this.fillMinimumOrderQuantity(input.minimumOrderQuantity);
    await this.addFixedComboGroupByName(input.comboGroupName);
    if (input.price) await this.fillStandardPrice(input.price);
    let mutationCount = 0;
    const countMutation = (response: Response) => {
      if (response.request().method() === 'POST'
        && new URL(response.url()).pathname.endsWith('/ops-brand/brand-items/combo')) mutationCount += 1;
    };
    this.page.on('response', countMutation);
    try {
      await input.beforeSaveTrigger?.();
      await this.clickSave();
      const error = input.missingField === 'item-name'
        ? this.locators.itemNameRequiredError
        : this.locators.standardPriceRequiredError;
      await error.waitFor({ state: 'visible', timeout: 10_000 });
      return {
        missingField: input.missingField,
        route: new URL(this.page.url()).pathname,
        validationSignal: input.missingField === 'item-name'
          ? 'visible-error-message'
          : 'input-error-state',
        errorCount: await error.count(),
        errorText: (await error.innerText()).trim(),
        successMessageCount: await this.locators.successMessage.count(),
        mutationCount,
      };
    } finally {
      this.page.off('response', countMutation);
    }
  }

  @step('读取套餐组卡片数量：{groupName}')
  async readComboGroupCardCount(groupName: string): Promise<number> {
    const card = this.locators.customComboGroupCard(groupName);
    await card.first().waitFor({ state: 'visible', timeout: 10_000 });
    return card.count();
  }

  @step('按名称选择 Custom Combo 套餐组：{comboGroupName}')
  async selectCustomComboGroupByName(comboGroupName: string): Promise<void> {
    await this.locators.attributeHeading.scrollIntoViewIfNeeded();
    await this.locators.addComboGroupButton.click({ timeout: 10_000 });
    await this.clickSettledComboMenuItem(this.locators.selectCustomComboMenuItem, 'Select Custom Combo');
    await this.locators.customComboDialog.waitFor({ state: 'visible', timeout: 10_000 });
    await selectUniqueAsyncTableTarget({
      dialog: this.locators.customComboDialog,
      loading: this.locators.customComboLoading,
      rows: this.locators.customComboRows,
      target: this.locators.customComboRowCheckbox(comboGroupName),
      requestCompleted: () => true,
      timeout: 15_000,
    });
    await this.confirmSelectedCustomComboGroup(comboGroupName);
  }

  @step('提交未添加套餐分组的套餐商品：{trigger}')
  async attemptSaveWithoutComboGroup(
    trigger: ItemComboSaveTrigger,
    beforeSaveTrigger?: () => Promise<void> | void,
  ): Promise<ItemComboGroupRequiredAttempt> {
    let mutationCount = 0;
    const countMutation = (response: Response) => {
      if (response.request().method() !== 'POST') return;
      if (new URL(response.url()).pathname.endsWith('/ops-brand/brand-items/combo')) mutationCount += 1;
    };
    this.page.on('response', countMutation);
    try {
      const response = await captureResponse(
        this.page,
        (candidate) => candidate.request().method() === 'POST'
          && new URL(candidate.url()).pathname.endsWith('/ops-brand/brand-items/combo'),
        async () => {
          await beforeSaveTrigger?.();
          if (trigger === 'save') await this.clickSave();
          else await this.clickSaveAndCreate();
        },
        15_000,
        `套餐${trigger}缺少分组响应未捕获`,
      );
      const responseBody = await response.json().catch(() => null);
      await this.locators.comboGroupRequiredError.waitFor({ state: 'visible', timeout: 10_000 });
      const responseError = readBusinessError(responseBody);
      return {
        trigger,
        route: new URL(this.page.url()).pathname,
        errorMessageCount: await this.locators.comboGroupRequiredError.count(),
        errorMessage: await this.locators.comboGroupRequiredError.innerText(),
        successMessageCount: await this.locators.successMessage.count(),
        responseMethod: response.request().method(),
        responsePath: new URL(response.url()).pathname,
        responseStatus: response.status(),
        responseErrorCode: responseError.code,
        responseErrorMessage: responseError.message,
        mutationCount,
        response,
      };
    } finally {
      this.page.off('response', countMutation);
    }
  }

  @step('等待套餐分组必填错误提示关闭')
  async waitForComboGroupRequiredErrorHidden(): Promise<void> {
    await this.locators.comboGroupRequiredError.waitFor({ state: 'hidden', timeout: 15_000 });
  }

  @step('在套餐商品编辑页添加可选搭配组：{groupName}')
  async addCustomComboGroup(input: {
    groupName: string;
    productName: string;
    additionalProductNames?: string[];
    selectionQuantity?: string;
    allowDuplicateSelection: boolean;
    beforeCreateTrigger?: () => Promise<void> | void;
  }): Promise<ItemComboOptionalAddResult> {
    await this.locators.attributeHeading.scrollIntoViewIfNeeded();
    await this.locators.addComboGroupButton.click({ timeout: 10_000 });
    await this.clickSettledComboMenuItem(this.locators.addCustomComboMenuItem, 'Add Custom Combo');
    await this.locators.addCustomComboDialog.waitFor({ state: 'visible', timeout: 10_000 });
    const dialog = await this.readCustomComboDialogEvidence();
    await this.locators.customComboGroupNameInput.fill(input.groupName);
    await this.locators.customComboSelectionQuantityInput.fill(input.selectionQuantity ?? '1');
    await this.locators.customComboRepeatSwitch.setChecked(input.allowDuplicateSelection);

    for (const productName of [input.productName, ...(input.additionalProductNames ?? [])]) {
      let listRequestCompleted = false;
      const markListRequestCompleted = (response: Response) => {
        if (response.request().method() !== 'POST' || !response.ok()) return;
        listRequestCompleted = new URL(response.url()).pathname.endsWith('/ops-brand/brand-items/pageQuery');
      };
      this.page.on('response', markListRequestCompleted);
      try {
        await this.locators.customComboItemSearchInput.fill(productName);
        await selectUniqueAsyncTableTarget({
          dialog: this.locators.addCustomComboDialog,
          loading: this.locators.customComboCreateLoading,
          rows: this.locators.customComboCreateRows,
          target: this.locators.customComboCreateProductCheckbox(productName),
          requestCompleted: () => listRequestCompleted,
          timeout: 15_000,
        });
      } finally {
        this.page.off('response', markListRequestCompleted);
      }
    }

    const response = await captureResponse(
      this.page,
      (candidate) => candidate.request().method() === 'POST'
        && new URL(candidate.url()).pathname.endsWith('/ops-brand/brand-sections'),
      async () => {
        await settleInput();
        await input.beforeCreateTrigger?.();
        await this.locators.customComboCreateConfirmButton.click({ timeout: 5_000 });
      },
      15_000,
      '新增可选搭配套餐组响应未捕获',
    );
    await this.locators.addCustomComboDialog.waitFor({ state: 'hidden', timeout: 10_000 });
    const boundary = await this.readCustomComboCardBoundary(input.groupName, input.productName);
    return { response, dialog, boundary };
  }

  @step('读取可选搭配弹窗字段证据')
  async readCustomComboDialogEvidence(): Promise<ItemComboOptionalDialogEvidence> {
    return {
      dialogCount: await this.locators.addCustomComboDialog.count(),
      groupNameInputCount: await this.locators.customComboGroupNameInput.count(),
      altNameInputCount: await this.locators.customComboAltNameInput.count(),
      selectionQuantityInputCount: await this.locators.customComboSelectionQuantityInput.count(),
      mergeSwitchCount: await this.locators.customComboMergeSwitch.count(),
      repeatSwitchCount: await this.locators.customComboRepeatSwitch.count(),
      itemSearchInputCount: await this.locators.customComboItemSearchInput.count(),
      categoryFilterCount: await this.locators.customComboCategoryFilter.count(),
    };
  }

  @step('打开添加可选搭配弹窗')
  async openCustomComboCreateDialog(): Promise<void> {
    await this.locators.attributeHeading.scrollIntoViewIfNeeded();
    await this.locators.addComboGroupButton.click({ timeout: 10_000 });
    await this.clickSettledComboMenuItem(this.locators.addCustomComboMenuItem, 'Add Custom Combo');
    await this.locators.addCustomComboDialog.waitFor({ state: 'visible', timeout: 10_000 });
  }

  @step('关闭添加可选搭配弹窗')
  async closeCustomComboCreateDialog(): Promise<void> {
    await this.locators.customComboCreateCloseButton.click({ timeout: 5_000 });
    await this.locators.addCustomComboDialog.waitFor({ state: 'hidden', timeout: 10_000 });
  }

  @step('读取可选搭配组卡片与商品行操作边界')
  async readCustomComboCardBoundary(
    groupName: string,
    productName: string,
  ): Promise<ItemComboOptionalCardBoundary> {
    const card = this.locators.customComboGroupCard(groupName);
    const productRow = this.locators.customComboGroupProductRow(groupName, productName);
    await card.waitFor({ state: 'visible', timeout: 10_000 });
    await productRow.waitFor({ state: 'visible', timeout: 10_000 });
    return {
      route: new URL(this.page.url()).pathname,
      cardCount: await card.count(),
      customTypeCount: await card.getByText(itemCreateComboFormDom.customComboTypeLabel, {
        exact: true,
      }).count(),
      groupEditButtonCount: await card.getByRole('button', {
        name: itemCreateComboFormDom.customComboEditButton,
        exact: true,
      }).count(),
      groupDeleteButtonCount: await card.getByRole('button', {
        name: itemCreateComboFormDom.customComboDeleteButton,
        exact: true,
      }).count(),
      repeatRuleCount: await card.getByText(itemCreateComboFormDom.customComboRepeatRule, {
        exact: true,
      }).count(),
      selectionQuantityRuleCount: await card.getByText(
        itemCreateComboFormDom.customComboSelectionQuantityRule,
        { exact: false },
      ).count(),
      productRowCount: await productRow.count(),
      productRowButtonCount: await productRow.getByRole('button').count(),
      productRowDeleteIconCount: await productRow.locator('[aria-label="delete"]').count(),
      cardText: await card.innerText(),
    };
  }

  @step('按名称选择套餐口味组：{groupName}')
  override async selectFlavorGroupByName(groupName: string): Promise<void> {
    await this.selectComboAttributeGroupByName('flavor', groupName);
  }

  @step('按名称选择套餐做法组：{groupName}')
  override async selectRecipeGroupByName(groupName: string): Promise<void> {
    await this.selectComboAttributeGroupByName('recipe', groupName);
  }

  @step('按名称选择套餐加料组：{groupName}')
  override async selectAdditivesGroupByName(groupName: string): Promise<void> {
    await this.selectComboAttributeGroupByName('additives', groupName);
  }

  @step('在套餐属性弹窗选择组：{kind} {groupName}')
  private async selectComboAttributeGroupByName(
    kind: 'flavor' | 'recipe' | 'additives',
    groupName: string,
  ): Promise<void> {
    await this.locators.comboAttributeAddButton.click({ timeout: 10_000 });
    const menuItem = kind === 'flavor'
      ? this.locators.commonFlavorMenuItem
      : kind === 'recipe'
        ? this.locators.commonRecipeMenuItem
        : this.locators.commonAdditivesMenuItem;
    await menuItem.click({ timeout: 10_000 });
    const dialog = this.locators.commonSelectionDialog(kind);
    await dialog.waitFor({ state: 'visible', timeout: 10_000 });
    const search = this.locators.commonSelectionSearchInput(kind);
    await search.fill(groupName);
    await settleInput();
    await search.press('Enter');
    await selectUniqueAsyncTableTarget({
      dialog,
      loading: dialog.locator('.ant-spin-spinning:visible'),
      rows: this.locators.commonSelectionRows(kind),
      target: this.locators.commonSelectionTarget(kind, groupName),
      requestCompleted: () => true,
      timeout: 15_000,
    });
    await dialog.getByRole('button', { name: 'Confirm', exact: true }).click();
    await dialog.waitFor({ state: 'hidden', timeout: 10_000 });
    await this.locators.commonSelectedAttributeGroup(groupName).waitFor({ state: 'visible', timeout: 10_000 });
  }

  private async confirmSelectedCustomComboGroup(comboGroupName?: string): Promise<void> {
    await clickStableAsyncSelectionConfirm({
      confirmButton: this.locators.customComboConfirmButton,
      dialog: this.locators.customComboDialog,
      selectedControl: comboGroupName
        ? this.locators.customComboRowCheckbox(comboGroupName)
        : this.locators.customComboRows.locator('input[type="checkbox"]:checked'),
      label: 'Select Custom Combo',
    });
    await this.locators.customComboDialog.waitFor({ state: 'hidden', timeout: 10_000 });
  }

  @step('等待套餐分组菜单稳定后选择：{1}')
  private async clickSettledComboMenuItem(menuItem: Locator, label: string): Promise<void> {
    await clickStableLocator({ locator: menuItem, label: `${label} 菜单项` });
  }

  private async readVisibleMenuItemTexts(): Promise<string[]> {
    const menuItems = await this.page.getByRole('menuitem').all();
    const texts: string[] = [];
    for (const menuItem of menuItems) {
      if (!await menuItem.isVisible().catch(() => false)) continue;
      const text = (await menuItem.innerText()).trim();
      if (text) texts.push(text);
    }
    return [...new Set(texts)];
  }
}

function readImageReferences(value: unknown): string[] {
  const references = new Set<string>();
  const visit = (candidate: unknown, key = ''): void => {
    if (Array.isArray(candidate)) {
      candidate.forEach((entry) => visit(entry, key));
      return;
    }
    if (candidate && typeof candidate === 'object') {
      Object.entries(candidate as Record<string, unknown>).forEach(([childKey, childValue]) => visit(childValue, childKey));
      return;
    }
    if (typeof candidate !== 'string' || candidate.length === 0) return;
    if (/(image|file|path|url|key|name)/i.test(key)) references.add(candidate);
  };
  visit(value);
  return [...references];
}

async function readVisibleControlNames(controls: Locator): Promise<string[]> {
  const names: string[] = [];
  const count = await controls.count();
  for (let index = 0; index < count; index += 1) {
    const control = controls.nth(index);
    const name = (await control.getAttribute('aria-label'))?.trim()
      || await control.evaluate((element) => element.closest('label')?.innerText.trim() ?? '');
    names.push(name || `index:${index}`);
  }
  return names;
}

function readBusinessError(value: unknown): { code: string; message: string } {
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = readBusinessError(item);
      if (found.code || found.message) return found;
    }
    return { code: '', message: '' };
  }
  if (!value || typeof value !== 'object') return { code: '', message: '' };
  const record = value as Record<string, unknown>;
  const code = typeof record.code === 'string' ? record.code : '';
  const message = typeof record.message === 'string' ? record.message : '';
  if (code || message) return { code, message };
  for (const child of Object.values(record)) {
    const found = readBusinessError(child);
    if (found.code || found.message) return found;
  }
  return { code: '', message: '' };
}

async function captureResponse(
  page: Page,
  predicate: (response: Response) => boolean,
  trigger: () => Promise<void>,
  timeout: number,
  message: string,
): Promise<Response> {
  return new Promise<Response>((resolve, reject) => {
    let settled = false;
    const cleanup = () => {
      page.off('response', listener);
      clearTimeout(timer);
    };
    const finish = (callback: () => void) => {
      if (settled) return;
      settled = true;
      cleanup();
      callback();
    };
    const listener = (response: Response) => {
      try {
        if (predicate(response)) finish(() => resolve(response));
      } catch (error) {
        finish(() => reject(error));
      }
    };
    const timer = setTimeout(() => finish(() => reject(new Error(`${message}，等待上限 ${timeout}ms`))), timeout);
    page.on('response', listener);
    void trigger().catch((error) => finish(() => reject(error)));
  });
}
