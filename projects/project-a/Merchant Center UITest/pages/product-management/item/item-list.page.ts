import type { Locator, Page, Response } from '@playwright/test';
import { ITEM_LIST_PATH, itemListFilterOptionsDom } from '../../../test-data/item-list';
import { step } from '../../../utils/step';
import { settleInput } from '../../../utils/input-settle';
import { createRefreshGatedProbe, waitUntil } from '../../../utils/wait';
import { requestPayloadContainsIdentity } from '../../../utils/request-payload-identity';
import { MerchantShellPage } from '../../sidebar.page';
import { ItemCreateTypePage } from './item-create-type.page';
import { ItemImportImagePage } from './item-import-image.page';
import { ItemImportProductPage } from './item-import-product.page';
import { ItemImportRecordPage } from './item-import-record.page';
import { ItemAddToMenuPage } from './item-add-to-menu.page';
import { ItemListLocators } from './item-list-locators';

const LIST_CONTEXT_TIMEOUT_MS = 30_000;
const LIST_QUERY_TIMEOUT_MS = 10_000;

type ItemListContextStage =
  | 'authentication-required'
  | 'merchant-selection-required'
  | 'unexpected-route'
  | 'list-surface-unavailable';

export class ItemListContextError extends Error {
  readonly stage: ItemListContextStage;
  readonly currentUrl: string;

  constructor(stage: ItemListContextStage, currentUrl: string) {
    super(`商品列表上下文失败：${stage}；url=${currentUrl}`);
    this.name = 'ItemListContextError';
    this.stage = stage;
    this.currentUrl = currentUrl;
  }
}

export class ItemListPage extends MerchantShellPage {
  private readonly locators: ItemListLocators;

  constructor(page: Page) {
    super(page);
    this.locators = new ItemListLocators(page);
  }

  @step('打开商品列表页')
  async open(): Promise<void> {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      await this.page.goto(ITEM_LIST_PATH, { waitUntil: 'domcontentloaded', timeout: 30_000 });
      try {
        await this.expectLoaded();
        return;
      } catch (error) {
        if (!(error instanceof ItemListContextError) || error.stage !== 'list-surface-unavailable' || attempt > 0) throw error;
      }
    }
  }

  @step('为残留核对打开商品列表页')
  async openForResidueCheck(): Promise<void> {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      if (new URL(this.page.url()).pathname !== ITEM_LIST_PATH || attempt > 0) {
        await this.page.goto(ITEM_LIST_PATH, { waitUntil: 'domcontentloaded', timeout: 30_000 });
      }
      try {
        await this.expectLoaded();
        return;
      } catch (error) {
        if (!(error instanceof ItemListContextError) || error.stage !== 'list-surface-unavailable' || attempt > 0) throw error;
      }
    }
  }

  @step('等待商品列表页加载完成')
  async expectLoaded(): Promise<void> {
    if (this.page.url() === 'about:blank') {
      await this.page.goto(ITEM_LIST_PATH, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    }

    const state = await waitUntil(
      async () => this.readListContextState(),
      (value) => value.ready || value.loginVisible || value.merchantVisible,
      {
        timeout: LIST_CONTEXT_TIMEOUT_MS,
        interval: 100,
        probeTimeout: 2_000,
        message: '商品列表路由或核心控件未在约定时间就绪。',
      },
    ).catch(async () => this.readListContextState());

    if (state.loginVisible) throw new ItemListContextError('authentication-required', state.url);
    if (state.merchantVisible) throw new ItemListContextError('merchant-selection-required', state.url);
    if (state.pathname !== ITEM_LIST_PATH) throw new ItemListContextError('unexpected-route', state.url);
    if (!state.ready) throw new ItemListContextError('list-surface-unavailable', state.url);
  }

  @step('按商品名称搜索：{keyword}')
  async fillSearch(keyword: string): Promise<void> {
    const response = this.waitForPageQueryResponse(keyword, 1_500).catch(() => undefined);
    await this.locators.searchInput.fill(keyword);
    await response;
  }

  @step('按商品名称搜索并等待接口完成：{keyword}')
  async fillSearchAndWait(keyword: string): Promise<void> {
    await this.performSearchAndWait(keyword);
  }
  private async performSearchAndWait(keyword: string): Promise<void> {
    const responsePromise = this.waitForPageQueryResponse(keyword, LIST_QUERY_TIMEOUT_MS);
    await this.locators.searchInput.fill(keyword);
    await settleInput();
    await this.locators.searchInput.press('Enter');
    await responsePromise;
  }

  @step('等待商品身份可见数量达到：{identity}，{expectedCount}')
  async waitForVisibleIdentityCount(itemName: string, expectedCount: number): Promise<number> {
    return waitUntil(
      () => this.locators.rowsByItemName(itemName).count(),
      (count) => count === expectedCount,
      { timeout: 15_000, message: `商品身份 ${itemName} 的 UI 数量未达到 ${expectedCount}。` },
    );
  }

  @step('读取商品身份当前可见数量：{itemName}')
  async readVisibleIdentityCount(itemName: string): Promise<number> {
    return this.locators.rowsByItemName(itemName).count();
  }

  @step('按第二语言名称查询并读取接口证据：{keyword}')
  async searchAndReadSecondLanguageEvidence(keyword: string): Promise<{
    keyword: string;
    responseStatus: number;
    responsePath: string;
    currentPage: number;
    visibleRowCount: number;
    matchingResponseTexts: string[];
  }> {
    const responsePromise = this.waitForPageQueryResponse(keyword);
    await this.locators.searchInput.fill(keyword);
    const response = await responsePromise;
    const responseBody = await response.json().catch(() => null);
    return {
      keyword,
      responseStatus: response.status(),
      responsePath: new URL(response.url()).pathname,
      currentPage: await this.readCurrentPageNumber(),
      visibleRowCount: await this.readVisibleRowCount(),
      matchingResponseTexts: collectMatchingStrings(responseBody, keyword).slice(0, 20),
    };
  }

  @step('按商品名称执行残留搜索：{keyword}')
  async fillSearchForResidueCheck(keyword: string): Promise<void> {
    const normalizedKeyword = keyword.trim().toLocaleLowerCase();
    let queryRequired = true;
    let candidateSince = 0;
    await waitUntil(
      async () => {
        if (queryRequired) {
          try {
            await this.locators.searchInput.fill('');
            await this.performSearchAndWait(keyword);
            queryRequired = false;
          } catch {
            return { inputMatched: false, emptyVisible: false, rowsMatched: false, rowCount: -1, stableForMs: 0 };
          }
        }
        const inputMatched = (await this.locators.searchInput.inputValue()).trim() === keyword;
        const emptyVisible = await this.locators.emptyResults.isVisible().catch(() => false);
        const rowTexts = await this.locators.tableBodyRows.allInnerTexts();
        const rowsMatched = rowTexts.length > 0
          && rowTexts.every((text) => text.toLocaleLowerCase().includes(normalizedKeyword));
        const candidate = inputMatched && (emptyVisible || rowsMatched);
        if (!candidate) {
          queryRequired = true;
          candidateSince = 0;
        } else if (candidateSince === 0) {
          candidateSince = Date.now();
        }
        return {
          inputMatched,
          emptyVisible,
          rowsMatched,
          rowCount: rowTexts.length,
          stableForMs: candidateSince === 0 ? 0 : Date.now() - candidateSince,
        };
      },
      (state) => state.stableForMs >= 1_000,
      {
        timeout: 45_000,
        interval: 500,
        probeTimeout: 20_000,
        message: `商品残留搜索未稳定收敛：${keyword}`,
      },
    );
  }

  @step('进入新增商品类型选择页')
  async enterCreateTypePage(): Promise<ItemCreateTypePage> {
    await this.locators.addButton.click();
    const createTypePage = new ItemCreateTypePage(this.page);
    await createTypePage.expectLoaded();
    return createTypePage;
  }

  @step('点击重置筛选')
  async clickReset(): Promise<void> {
    await this.locators.resetButton.click();
    await waitUntil(
      () => this.readVisibleRowCount(),
      (count) => count > 0,
      { timeout: 15_000, message: '重置筛选后列表应恢复展示数据。' },
    );
  }

  @step('打开商品类型筛选')
  async openTypeFilter(): Promise<void> {
    if (await this.locators.typeFilterContainer().getByRole('checkbox').first().isVisible().catch(() => false)) {
      return;
    }
    await this.locators.filterTypeTrigger.click();
    await this.locators.typeFilterContainer().getByRole('checkbox').first().waitFor({ state: 'visible', timeout: 10_000 });
  }

  @step('选择商品类型筛选项：{typeLabel}')
  async selectTypeFilterOption(typeLabel: string): Promise<void> {
    await this.setTypeFilterOptions([typeLabel]);
  }

  @step('为查询记忆探针选择商品类型：{typeLabel}')
  async selectTypeFilterOptionForMemoryProbe(typeLabel: string): Promise<void> {
    await this.setTypeFilterOptions([typeLabel]);
  }

  @step('打开商品状态筛选')
  async openStatusFilter(): Promise<void> {
    if (await this.locators.statusFilterContainer().getByRole('radio').first().isVisible().catch(() => false)) {
      return;
    }
    await this.locators.filterStatusTrigger.click();
    await this.locators.statusFilterContainer().getByRole('radio').first().waitFor({ state: 'visible', timeout: 10_000 });
  }

  @step('选择商品状态筛选项：{statusLabel}')
  async selectStatusFilterOption(statusLabel: string): Promise<void> {
    await this.openStatusFilter();
    const response = this.waitForPageQueryResponse();
    await this.locators.statusFilterOptionRow(statusLabel).click();
    await response;
    await this.waitForStatusFilterApplied(statusLabel);
  }

  private async waitForTypeFilterApplied(typeLabel: string): Promise<void> {
    await waitUntil(
      async () => this.readTypeFilterApplicationState([typeLabel]),
      (state) => state.selectionApplied && (state.rowCount === 0
        || state.rowTypes.every((typeText) => matchesTypeFilter(typeText, typeLabel))),
      {
        timeout: 15_000,
        message: `筛选商品类型 ${typeLabel} 后列表未完成请求/状态确认。`,
        probeTimeout: 5_000,
      },
    );
  }

  private async waitForStatusFilterApplied(statusLabel: string): Promise<void> {
    await waitUntil(
      async () => this.readFirstVisibleRowStatusText(),
      (statusText) => statusText === statusLabel,
      {
        timeout: 15_000,
        message: `筛选商品状态 ${statusLabel} 后列表未刷新。`,
        probeTimeout: 5_000,
      },
    );
  }

  private async readFirstVisibleRowTypeText(): Promise<string> {
    const count = await this.readVisibleRowCount();
    if (count === 0) {
      return '';
    }
    return (await this.locators.rowTypeCell(this.locators.tableBodyRows.first()).textContent())?.trim() ?? '';
  }

  private async readFirstVisibleRowStatusText(): Promise<string> {
    const count = await this.readVisibleRowCount();
    if (count === 0) {
      return '';
    }
    return (await this.locators.rowStatusCell(this.locators.tableBodyRows.first()).textContent())?.trim() ?? '';
  }

  @step('打开顶部操作菜单')
  async openActionMenu(): Promise<void> {
    await this.locators.actionButton.click();
  }

  @step('进入导入记录页')
  async enterImportRecordPage(): Promise<ItemImportRecordPage> {
    await this.locators.importRecordsButton.click();
    const importRecordPage = new ItemImportRecordPage(this.page);
    await importRecordPage.expectLoaded();
    return importRecordPage;
  }

  private async waitForTypeFiltersApplied(typeLabels: readonly string[]): Promise<void> {
    const allowed = new Set(typeLabels);
    await waitUntil(
      async () => this.readTypeFilterApplicationState(typeLabels),
      (state) => state.selectionApplied && (state.rowCount === 0
        || state.rowTypes.every((typeText) => allowed.has(typeText))),
      {
        timeout: 15_000,
        message: `筛选商品类型 ${typeLabels.join('、')} 后列表未完成请求/状态确认。`,
        probeTimeout: 5_000,
      },
    );
  }

  /**
   * A valid filter result can contain zero rows.  The old waiter treated an
   * empty table as a stale request and spent another 15 seconds retrying.
   * Confirm the authoritative checkbox state first; only then inspect rows.
   */
  private async readTypeFilterApplicationState(typeLabels: readonly string[]): Promise<{
    selectionApplied: boolean;
    rowCount: number;
    rowTypes: string[];
  }> {
    await this.openTypeFilter();
    // The checkbox itself is the authoritative filter state.  Do not infer
    // the option label from a parent node: the dropdown renders auxiliary
    // text/icons in that node, so the composite text is not stable and can
    // make a checked option look unselected.
    const allLabels = [
      itemListFilterOptionsDom.typeStandard,
      itemListFilterOptionsDom.typeCombo,
      itemListFilterOptionsDom.typeSide,
    ];
    const checked: Array<string | null> = await Promise.all(allLabels.map(async (label) => (
      await this.locators.typeFilterOption(label).isChecked() ? label : null
    )));
    const checkedCount = await this.locators.checkedTypeFilters().count();
    await this.page.keyboard.press('Escape');
    const requested = new Set(typeLabels);
    const normalizedChecked = new Set(checked.filter((label) => label !== null));
    const selectionApplied = checkedCount === normalizedChecked.size
      && normalizedChecked.size === requested.size
      && [...requested].every((label) => [...normalizedChecked].some((actual) => (
        actual === label || matchesTypeFilter(actual, label)
      )));
    return {
      selectionApplied,
      rowCount: await this.readVisibleRowCount(),
      rowTypes: await this.readVisibleRowTypeTexts(),
    };
  }

  @step('进入图片导入页')
  async enterImageImportPage(): Promise<ItemImportImagePage> {
    await this.openActionMenu();
    await this.locators.actionMenuImageImport.click();
    const imageImportPage = new ItemImportImagePage(this.page);
    await imageImportPage.expectLoaded();
    return imageImportPage;
  }

  @step('进入商品导入页')
  async enterProductImportPage(): Promise<ItemImportProductPage> {
    await this.openActionMenu();
    await this.locators.actionMenuItemImport.click();
    const productImportPage = new ItemImportProductPage(this.page);
    await productImportPage.expectLoaded();
    return productImportPage;
  }

  @step('勾选首行商品')
  async selectFirstRow(): Promise<void> {
    await this.locators.firstRowCheckbox().click();
  }

  @step('打开批量操作菜单')
  async openBatchActionMenu(): Promise<void> {
    await this.locators.batchActionButton.click();
  }

  @step('打开首行商品操作菜单')
  async openFirstRowActionMenu(): Promise<void> {
    await this.locators.firstRowActionButton().click();
  }

  @step('打开商品操作菜单：{itemName}')
  async openRowActionMenu(itemName: string): Promise<void> {
    await this.locators.rowActionButton(itemName).click();
  }

  @step('点击商品行复制操作')
  async clickRowActionCopy(): Promise<void> {
    await this.locators.rowActionCopy.click();
  }

  @step('点击行操作删除')
  async clickRowActionDelete(): Promise<void> {
    await this.locators.rowActionDelete.click();
  }

  @step('点击行操作：{action}')
  async clickRowLifecycleAction(action: 'enable' | 'disable'): Promise<void> {
    const target = action === 'enable' ? this.locators.rowActionEnable : this.locators.rowActionDisable;
    await target.click();
  }

  @step('确认商品状态变更二次弹窗')
  async confirmLifecycleDialog(required = false): Promise<{ shown: boolean; text: string }> {
    const dialog = this.locators.visibleDialogs.or(this.locators.visibleModals).last();
    const shown = await dialog.waitFor({ state: 'visible', timeout: required ? 5_000 : 1_000 })
      .then(() => true)
      .catch(() => false);
    if (!shown) {
      if (required) throw new Error('商品状态变更后未出现预期的二次确认弹窗。');
      return { shown: false, text: '' };
    }
    const text = (await dialog.innerText()).trim();
    const confirm = dialog.getByRole('button', { name: /^(Confirm|OK|确定|Disable|停用)$/i });
    if (await confirm.count() !== 1) throw new Error(`状态变更弹窗未出现唯一确认按钮：${text}`);
    await settleInput();
    await confirm.click({ timeout: 5_000 });
    await dialog.waitFor({ state: 'hidden', timeout: 15_000 });
    return { shown: true, text };
  }

  @step('读取删除确认文案')
  async readDeleteDialogText(): Promise<string> {
    await this.locators.deleteDialog.waitFor({ state: 'visible', timeout: 10_000 });
    return (await this.locators.deleteDialog.innerText()).trim();
  }

  @step('取消删除确认弹窗')
  async cancelDeleteDialog(): Promise<void> {
    await this.locators.deleteDialogCancelButton.click();
    await this.locators.deleteDialog.waitFor({ state: 'hidden', timeout: 10_000 });
  }

  @step('在删除确认弹窗点击确认')
  async confirmDeleteDialog(): Promise<void> {
    await this.locators.deleteDialog.waitFor({ state: 'visible', timeout: 10_000 });
    await settleInput();
    await this.locators.deleteDialogConfirmButton.click();
    await this.locators.deleteDialog.waitFor({ state: 'hidden', timeout: 30_000 });
  }

  @step('等待列表不包含商品：{itemName}')
  async expectItemNotVisible(itemName: string): Promise<void> {
    await waitUntil(
      async () => this.locators.rowByItemName(itemName).isVisible().catch(() => false),
      (visible) => visible === false,
      { timeout: 30_000, message: `列表仍包含商品 ${itemName}。` },
    );
  }

  @step('读取当前列表数据行数')
  async readVisibleRowCount(): Promise<number> {
    return this.locators.tableBodyRows.count();
  }

  @step('读取分页总条数文案')
  async readPaginationTotalText(): Promise<string> {
    return (await this.locators.paginationTotalText.textContent())?.trim() ?? '';
  }

  @step('读取当前页码')
  async readCurrentPageNumber(): Promise<number> {
    if (await this.locators.paginationCurrentPage.count() === 0) return 1;
    const text = (await this.locators.paginationCurrentPage.textContent())?.trim() ?? '';
    return Number(text);
  }

  @step('读取商品列表可见列标题')
  async readVisibleColumnHeaders(): Promise<string[]> {
    return normalizeSurfaceTexts(await this.locators.tableHeaderRow.locator('th:visible').allInnerTexts());
  }

  @step('探测商品列表分页条数选项')
  async probePageSizeOptions(): Promise<{
    available: boolean;
    originalText: string;
    optionTexts: string[];
    observations: Array<{ requested: number; selectorText: string; visibleRows: number }>;
    restoredText: string;
  }> {
    const selector = this.locators.pagination.locator('.ant-pagination-options .ant-select-selector');
    if (!await selector.isVisible().catch(() => false)) {
      return { available: false, originalText: '', optionTexts: [], observations: [], restoredText: '' };
    }
    const originalText = (await selector.innerText()).trim();
    await selector.click();
    const options = this.page.locator('.ant-select-dropdown:visible [role="option"]');
    await options.first().waitFor({ state: 'visible', timeout: 5_000 }).catch(() => undefined);
    const optionTexts = normalizeSurfaceTexts(await options.allInnerTexts());
    await this.page.keyboard.press('Escape');
    const observations: Array<{ requested: number; selectorText: string; visibleRows: number }> = [];
    for (const requested of [10, 20, 50, 100]) {
      if (!optionTexts.some((text) => new RegExp(`(^|\\D)${requested}(\\D|$)`).test(text))) continue;
      await this.selectPageSize(selector, requested);
      observations.push({
        requested,
        selectorText: (await selector.innerText()).trim(),
        visibleRows: await this.readVisibleRowCount(),
      });
    }
    const originalSize = Number(originalText.match(/\d+/)?.[0]);
    if (Number.isFinite(originalSize) && originalSize > 0) await this.selectPageSize(selector, originalSize);
    return {
      available: true,
      originalText,
      optionTexts,
      observations,
      restoredText: (await selector.innerText()).trim(),
    };
  }

  @step('读取商品列表默认列配置')
  async readDefaultColumnConfiguration(): Promise<{
    available: boolean;
    triggerCandidates: string[];
    checked: string[];
    unchecked: string[];
    disabled: string[];
    visibleHeaders: string[];
  }> {
    const opened = await this.openColumnSettings();
    if (!opened.surface) {
      return { available: false, triggerCandidates: opened.triggerCandidates, checked: [], unchecked: [], disabled: [], visibleHeaders: await this.readVisibleColumnHeaders() };
    }
    const state = await this.readColumnSettingsState(opened.surface);
    await this.page.keyboard.press('Escape');
    return { available: true, triggerCandidates: opened.triggerCandidates, ...state, visibleHeaders: await this.readVisibleColumnHeaders() };
  }

  @step('探测商品列表展示列选择')
  async probeColumnSelection(): Promise<{
    available: boolean;
    triggerCandidates: string[];
    original: Awaited<ReturnType<ItemListPage['readColumnSettingsState']>> | null;
    selectedHeaders: string[];
    headersAfterSpecificationRemoved: string[];
    changed: string[];
    restored: boolean;
  }> {
    const opened = await this.openColumnSettings();
    if (!opened.surface) {
      return { available: false, triggerCandidates: opened.triggerCandidates, original: null, selectedHeaders: [], headersAfterSpecificationRemoved: [], changed: [], restored: true };
    }
    const original = await this.readColumnSettingsState(opened.surface);
    const changed: string[] = [];
    for (const target of [/^Category$/i, /^Specification(s)?$/i, /^(Standard\s*)?Price$/i]) {
      const name = await this.setColumnChecked(opened.surface, target, true);
      if (name) changed.push(name);
    }
    await this.page.keyboard.press('Escape');
    const selectedHeaders = await this.readVisibleColumnHeaders();
    const reopened = await this.openColumnSettings();
    if (reopened.surface) await this.setColumnChecked(reopened.surface, /^Specification(s)?$/i, false);
    await this.page.keyboard.press('Escape');
    const headersAfterSpecificationRemoved = await this.readVisibleColumnHeaders();
    const restored = await this.restoreColumnState(original);
    return { available: true, triggerCandidates: opened.triggerCandidates, original, selectedHeaders, headersAfterSpecificationRemoved, changed, restored };
  }

  @step('探测商品列表还原默认列')
  async probeRestoreDefaultColumns(): Promise<{
    available: boolean;
    triggerCandidates: string[];
    original: Awaited<ReturnType<ItemListPage['readColumnSettingsState']>> | null;
    toggledColumn: string;
    resetControlText: string;
    restored: boolean;
    finalState: Awaited<ReturnType<ItemListPage['readColumnSettingsState']>> | null;
  }> {
    const opened = await this.openColumnSettings();
    if (!opened.surface) {
      return { available: false, triggerCandidates: opened.triggerCandidates, original: null, toggledColumn: '', resetControlText: '', restored: true, finalState: null };
    }
    const original = await this.readColumnSettingsState(opened.surface);
    const toggleName = original.unchecked[0] ?? original.checked.find((name) => !original.disabled.includes(name)) ?? '';
    if (toggleName) await this.setColumnChecked(opened.surface, new RegExp(`^${escapeRegExp(toggleName)}$`, 'i'), !original.checked.includes(toggleName));
    const reset = opened.surface.getByRole('button', { name: /restore|reset|default/i }).first();
    const resetControlText = await reset.isVisible().catch(() => false) ? (await reset.innerText()).trim() : '';
    if (resetControlText) await reset.click();
    await this.page.keyboard.press('Escape');
    const finalOpened = await this.openColumnSettings();
    const finalState = finalOpened.surface ? await this.readColumnSettingsState(finalOpened.surface) : null;
    await this.page.keyboard.press('Escape');
    const restored = finalState !== null && sameColumnState(original, finalState);
    if (!restored) await this.restoreColumnState(original);
    return { available: true, triggerCandidates: opened.triggerCandidates, original, toggledColumn: toggleName, resetControlText, restored, finalState };
  }

  @step('探测商品页面中英文切换入口')
  async probeLanguageSwitch(): Promise<{
    available: boolean;
    triggerTexts: string[];
    optionTexts: string[];
    chineseSurfaceTexts: string[];
    englishSurfaceTexts: string[];
    restored: boolean;
  }> {
    const header = this.page.locator('header, .ant-layout-header, [class*="header"]').first();
    const triggers = header.locator('button:visible, [role="button"]:visible').filter({ hasText: /^(English|中文|简体中文|EN|ZH)$/i });
    const triggerTexts = normalizeSurfaceTexts(await triggers.allInnerTexts());
    if (await triggers.count() !== 1) {
      return { available: false, triggerTexts, optionTexts: [], chineseSurfaceTexts: [], englishSurfaceTexts: [], restored: true };
    }
    const trigger = triggers.first();
    const originalText = (await trigger.innerText()).trim();
    await trigger.click();
    const menu = this.page.locator('.ant-dropdown:visible, [role="menu"]:visible').last();
    const options = menu.locator('[role="menuitem"], li, button').filter({ hasText: /English|中文|简体中文/i });
    const optionTexts = normalizeSurfaceTexts(await options.allInnerTexts());
    const chineseOption = options.filter({ hasText: /中文|简体中文/i }).first();
    if (!await chineseOption.isVisible().catch(() => false)) {
      await this.page.keyboard.press('Escape');
      return { available: false, triggerTexts, optionTexts, chineseSurfaceTexts: [], englishSurfaceTexts: [], restored: true };
    }
    await chineseOption.click();
    await waitUntil(
      () => trigger.innerText().catch(() => ''),
      (text) => /中文|ZH/i.test(text),
      { timeout: 10_000, interval: 100, message: '系统语言未切换到中文。', probeTimeout: 2_000 },
    ).catch(() => undefined);
    const chineseSurfaceTexts = await this.readLanguageSurfaceTexts();
    await trigger.click();
    const englishOption = this.page.locator('.ant-dropdown:visible, [role="menu"]:visible').last()
      .locator('[role="menuitem"], li, button').filter({ hasText: /English/i }).first();
    if (await englishOption.isVisible().catch(() => false)) await englishOption.click();
    const englishSurfaceTexts = await this.readLanguageSurfaceTexts();
    const restored = /English|EN/i.test(originalText)
      ? /English|EN/i.test(await trigger.innerText().catch(() => ''))
      : true;
    return { available: true, triggerTexts, optionTexts, chineseSurfaceTexts, englishSurfaceTexts, restored };
  }

  @step('读取商品行类型：{itemName}')
  async readItemTypeText(itemName: string): Promise<string> {
    return (await this.locators.rowTypeCell(this.locators.rowByItemName(itemName)).textContent())?.trim() ?? '';
  }

  @step('读取商品行状态：{itemName}')
  async readItemStatusText(itemName: string): Promise<string> {
    return (await this.locators.rowStatusCell(this.locators.rowByItemName(itemName)).textContent())?.trim() ?? '';
  }

  @step('读取查询条件状态')
  async readFilterState(): Promise<{
    search: string;
    checkedTypeCount: number;
    checkedStatusCount: number;
    currentPage: number;
  }> {
    const search = await this.locators.searchInput.inputValue();
    await this.openTypeFilter();
    const checkedTypeCount = await this.locators.checkedTypeFilters().count();
    await this.page.keyboard.press('Escape');
    await this.openStatusFilter();
    const checkedStatusCount = await this.locators.checkedStatusFilters().count();
    await this.page.keyboard.press('Escape');
    return { search, checkedTypeCount, checkedStatusCount, currentPage: await this.readCurrentPageNumber() };
  }

  @step('设置商品类型组合筛选：{typeLabels}')
  async setTypeFilterOptions(typeLabels: string[]): Promise<void> {
    await this.openTypeFilter();
    const selected = new Set(typeLabels);
    const allLabels = [
      itemListFilterOptionsDom.typeStandard,
      itemListFilterOptionsDom.typeCombo,
      itemListFilterOptionsDom.typeSide,
    ];
    for (const label of allLabels) {
      const checkbox = this.locators.typeFilterOption(label);
      const shouldBeChecked = selected.has(label);
      if (await checkbox.isChecked() !== shouldBeChecked) {
        const response = this.waitForPageQueryResponse();
        if (shouldBeChecked) await checkbox.check();
        else await checkbox.uncheck();
        await response;
      }
    }
    await this.page.keyboard.press('Escape');
    if (typeLabels.length === 1) await this.waitForTypeFilterApplied(typeLabels[0]);
    else if (typeLabels.length > 1) await this.waitForTypeFiltersApplied(typeLabels);
  }

  @step('等待所有可见行类型属于：{typeLabels}')
  async expectAllVisibleRowsMatchTypes(typeLabels: string[]): Promise<void> {
    const allowed = new Set(typeLabels);
    const rowCount = await this.readVisibleRowCount();
    for (let index = 0; index < rowCount; index += 1) {
      const text = (await this.locators.rowTypeCell(this.locators.tableBodyRows.nth(index)).textContent())?.trim() ?? '';
      if (!allowed.has(text)) throw new Error(`第 ${index + 1} 行商品类型不在允许集合：${text}`);
    }
  }

  @step('读取当前可见消息')
  async readVisibleMessages(): Promise<string[]> {
    return (await this.locators.visibleMessages.allInnerTexts()).map((text) => text.trim()).filter(Boolean);
  }

  @step('等待并读取当前可见消息')
  async readSettledVisibleMessages(): Promise<string[]> {
    let messages: string[] = [];
    await waitUntil(
      async () => {
        messages = await this.readVisibleMessages();
        return messages;
      },
      (value) => value.length > 0,
      { timeout: 5_000, interval: 100, message: '操作后未出现可见消息。', probeTimeout: 2_000 },
    ).catch(() => undefined);
    return messages;
  }

  @step('进入批量添加至菜单页面')
  async enterAddToMenuPage(): Promise<ItemAddToMenuPage> {
    await this.locators.batchMenuAddToMenu.click();
    const target = new ItemAddToMenuPage(this.page);
    await target.expectLoaded();
    return target;
  }

  private async readListContextState(): Promise<{
    url: string;
    pathname: string;
    loginVisible: boolean;
    merchantVisible: boolean;
    ready: boolean;
  }> {
    const url = this.page.url();
    const pathname = safePathname(url);
    const [loginVisible, merchantVisible, searchVisible, addVisible, tableVisible] = await Promise.all([
      this.page.locator('input[type="email"]').isVisible({ timeout: 500 }).catch(() => false),
      this.page.getByRole('heading', { name: 'Selected Merchant', exact: true }).isVisible({ timeout: 500 }).catch(() => false),
      this.locators.searchInput.isVisible({ timeout: 500 }).catch(() => false),
      this.locators.addButton.isVisible({ timeout: 500 }).catch(() => false),
      this.page.locator('.ant-table-thead:visible').count().then((count) => count > 0).catch(() => false),
    ]);
    return {
      url,
      pathname,
      loginVisible,
      merchantVisible,
      ready: pathname === ITEM_LIST_PATH && searchVisible && addVisible && tableVisible,
    };
  }

  private async readVisibleRowTypeTexts(): Promise<string[]> {
    return this.locators.tableBodyRows.evaluateAll((rows) => rows.map((row) => {
      const cells = row.querySelectorAll('td');
      return cells.item(4)?.textContent?.trim() ?? '';
    }));
  }

  private waitForPageQueryResponse(expectedName?: string, timeout = LIST_QUERY_TIMEOUT_MS): Promise<Response> {
    return this.page.waitForResponse((response) => {
      const request = response.request();
      if (request.method() !== 'POST') return false;
      if (!new URL(response.url()).pathname.endsWith('/ops-brand/brand-items/pageQuery')) return false;
      if (expectedName === undefined) return true;
      const keyword = expectedName;
      const payload = request.postDataJSON();
      return requestPayloadContainsIdentity(payload, keyword);
    }, { timeout });
  }

  private async selectPageSize(selector: Locator, requested: number): Promise<void> {
    await selector.click();
    const option = this.page.locator('.ant-select-dropdown:visible [role="option"]')
      .filter({ hasText: new RegExp(`(^|\\D)${requested}(\\D|$)`) }).first();
    await option.waitFor({ state: 'visible', timeout: 5_000 });
    await option.click();
    await waitUntil(
      () => selector.innerText(),
      (text) => new RegExp(`(^|\\D)${requested}(\\D|$)`).test(text),
      { timeout: 15_000, interval: 100, message: `分页条数未切换到 ${requested}。`, probeTimeout: 2_000 },
    );
  }

  private async openColumnSettings(): Promise<{ surface?: Locator; triggerCandidates: string[] }> {
    const iconButtons = this.page.locator('button:visible').filter({
      has: this.page.locator([
        'span[role="img"][aria-label*="setting" i]',
        'span[role="img"][aria-label*="column" i]',
        'span[role="img"][aria-label*="control" i]',
        'svg[data-icon*="setting" i]',
        'svg[data-icon*="column" i]',
        'svg[data-icon*="control" i]',
      ].join(',')),
    });
    const namedButtons = this.page.getByRole('button', { name: /column|display.*setting|setting.*column/i });
    const candidates = iconButtons.or(namedButtons);
    const triggerCandidates = normalizeSurfaceTexts(await candidates.evaluateAll((elements) => elements.map((element) => (
      `${element.getAttribute('aria-label') ?? ''}|${element.getAttribute('title') ?? ''}|${element.textContent ?? ''}`
    ))));
    const count = await candidates.count();
    if (count === 0) return { triggerCandidates };
    await candidates.last().click();
    const surface = this.page.locator('.ant-popover:visible, .ant-dropdown:visible, [role="dialog"]:visible')
      .filter({ has: this.page.locator('input[type="checkbox"]') }).last();
    if (!await surface.isVisible().catch(() => false)) return { triggerCandidates };
    return { surface, triggerCandidates };
  }

  private async readColumnSettingsState(surface: Locator): Promise<{
    checked: string[];
    unchecked: string[];
    disabled: string[];
  }> {
    const rows = surface.locator('label').filter({ has: this.page.locator('input[type="checkbox"]') });
    const state = { checked: [] as string[], unchecked: [] as string[], disabled: [] as string[] };
    for (let index = 0; index < await rows.count(); index += 1) {
      const row = rows.nth(index);
      const name = (await row.innerText()).trim().replace(/\s+/g, ' ');
      if (!name) continue;
      const checkbox = row.getByRole('checkbox');
      (await checkbox.isChecked() ? state.checked : state.unchecked).push(name);
      if (await checkbox.isDisabled()) state.disabled.push(name);
    }
    return state;
  }

  private async setColumnChecked(surface: Locator, namePattern: RegExp, checked: boolean): Promise<string | undefined> {
    const row = surface.locator('label').filter({ hasText: namePattern }).filter({ has: this.page.locator('input[type="checkbox"]') }).first();
    if (!await row.isVisible().catch(() => false)) return undefined;
    const checkbox = row.getByRole('checkbox');
    const name = (await row.innerText()).trim().replace(/\s+/g, ' ');
    if (!await checkbox.isDisabled() && await checkbox.isChecked() !== checked) await checkbox.click();
    return name;
  }

  private async restoreColumnState(original: { checked: string[]; unchecked: string[]; disabled: string[] }): Promise<boolean> {
    const opened = await this.openColumnSettings();
    if (!opened.surface) return false;
    for (const name of original.checked) await this.setColumnChecked(opened.surface, new RegExp(`^${escapeRegExp(name)}$`, 'i'), true);
    for (const name of original.unchecked) await this.setColumnChecked(opened.surface, new RegExp(`^${escapeRegExp(name)}$`, 'i'), false);
    const restored = sameColumnState(original, await this.readColumnSettingsState(opened.surface));
    await this.page.keyboard.press('Escape');
    return restored;
  }

  private async readLanguageSurfaceTexts(): Promise<string[]> {
    return normalizeSurfaceTexts(await this.page.locator('h1:visible, h2:visible, label:visible, button:visible').allInnerTexts()).slice(0, 80);
  }

  @step('等待列表包含商品：{itemName}')
  async expectItemVisible(itemName: string): Promise<void> {
    await waitUntil(
      () => this.readVisibleRowCount(),
      (count) => count > 0,
      { timeout: 10_000, message: '列表未展示任何商品行。' },
    );
    await this.locators.rowByItemName(itemName).waitFor({ state: 'visible', timeout: 10_000 });
  }

  @step('等待列表唯一展示商品：{itemName}')
  async expectUniqueItemVisible(itemName: string, timeout = 15_000): Promise<void> {
    await waitUntil(
      () => this.locators.rowsByItemName(itemName).count(),
      (count) => count === 1,
      { timeout, message: `列表中商品 ${itemName} 未唯一展示。` },
    );
    await this.locators.rowsByItemName(itemName).waitFor({ state: 'visible', timeout: 10_000 });
  }

  @step('等待搜索无结果')
  async expectEmptySearchResults(timeout = 10_000): Promise<void> {
    await waitUntil(
      () => this.readVisibleRowCount(),
      (count) => count === 0,
      { timeout, message: '搜索无结果时列表应无数据行。' },
    );
    await this.locators.emptyResults.waitFor({ state: 'visible', timeout });
  }

  @step('等待所有可见行商品类型为：{typeLabel}')
  async expectAllVisibleRowsMatchType(typeLabel: string): Promise<void> {
    await waitUntil(
      () => this.readVisibleRowTypeTexts(),
      (typeTexts) => typeTexts.length > 0 && typeTexts.every((text) => matchesTypeFilter(text, typeLabel)),
      { timeout: 10_000, message: `筛选后并非所有商品行类型均为 ${typeLabel}。`, probeTimeout: 5_000 },
    );
  }

  @step('重复精确查询直至商品唯一展示：{itemName}')
  async waitForIndexedItem(itemName: string, timeout = 60_000): Promise<void> {
    await waitUntil(
      createRefreshGatedProbe({ refresh: () => this.fillSearchAndWait(itemName).catch(() => undefined), observe: () => this.locators.rowsByItemName(itemName).count(), refreshInterval: 5_000 }),
      (count) => count === 1,
      { timeout, interval: 250, message: `列表索引中商品 ${itemName} 未唯一展示。` },
    );
    await this.locators.rowsByItemName(itemName).waitFor({ state: 'visible', timeout: 10_000 });
  }

  @step('等待所有可见行商品状态为：{statusLabel}')
  async expectAllVisibleRowsMatchStatus(statusLabel: string): Promise<void> {
    await waitUntil(
      () => this.readVisibleRowCount(),
      (count) => count > 0,
      { timeout: 10_000, message: '筛选后列表应展示商品行。' },
    );
    const rowCount = await this.readVisibleRowCount();
    for (let index = 0; index < rowCount; index += 1) {
      const row = this.locators.tableBodyRows.nth(index);
      await waitUntil(
        () => this.locators.rowStatusCell(row).textContent(),
        (text) => (text ?? '').trim() === statusLabel,
        { timeout: 10_000, message: `第 ${index + 1} 行商品状态应为 ${statusLabel}。`, probeTimeout: 5_000 },
      );
    }
  }

  @step('读取商品规格列文案：{itemName}')
  async readItemSpecificationText(itemName: string): Promise<string> {
    const row = this.locators.rowByItemName(itemName);
    return (await this.locators.rowSpecificationCell(row).textContent())?.trim() ?? '';
  }

  @step('读取商品价格列文案：{itemName}')
  async readItemPriceText(itemName: string): Promise<string> {
    const rows = this.locators.rowsByItemName(itemName);
    const count = await rows.count();
    if (count !== 1) throw new Error(`读取商品价格前身份不唯一：${itemName}，实际数量 ${count}`);
    return (await this.locators.rowPriceCell(rows).textContent())?.trim() ?? '';
  }

  @step('读取商品分类列文案：{itemName}')
  async readItemCategoryText(itemName: string): Promise<string> {
    const rows = this.locators.rowsByItemName(itemName);
    const count = await rows.count();
    if (count !== 1) throw new Error(`读取商品分类前身份不唯一：${itemName}，实际数量 ${count}`);
    return (await this.locators.rowCategoryCell(rows).textContent())?.trim() ?? '';
  }

  @step('读取商品行服务端 ID：{itemName}')
  async readItemServerIds(itemName: string): Promise<number[]> {
    const rows = this.locators.rowsByItemName(itemName);
    const ids: number[] = [];
    for (let index = 0; index < await rows.count(); index += 1) {
      const rawId = await rows.nth(index).getAttribute('data-row-key');
      const id = Number(rawId);
      if (Number.isFinite(id)) ids.push(id);
    }
    return [...new Set(ids)];
  }

  @step('读取商品列表主图地址：{itemName}')
  async readItemMainImageSources(itemName: string): Promise<string[]> {
    const rows = this.locators.rowsByItemName(itemName);
    const count = await rows.count();
    if (count !== 1) throw new Error(`读取商品主图前身份不唯一：${itemName}，实际数量 ${count}`);
    return this.locators.rowMainImages(rows).evaluateAll((images: HTMLImageElement[]) => (
      images.map((image) => image.currentSrc || image.src).filter(Boolean)
    ));
  }

  @step('读取指定商品类型的主图候选数量：{typeLabel}')
  async readMainImageCandidateCount(typeLabel: string): Promise<number> {
    const rows = this.locators.rowsByType(typeLabel);
    let count = 0;
    for (let index = 0; index < await rows.count(); index += 1) {
      count += await this.locators.rowMainImages(rows.nth(index)).count();
    }
    return count;
  }

  @step('点击指定商品类型的第一个主图：{typeLabel}')
  async clickFirstMainImageByType(typeLabel: string): Promise<{
    source: string;
    rowIndex: number;
    className: string;
    role: string;
    ancestorRole: string;
    tabIndex: number;
    cursor: string;
  } | undefined> {
    const rows = this.locators.rowsByType(typeLabel);
    for (let index = 0; index < await rows.count(); index += 1) {
      const images = this.locators.rowMainImages(rows.nth(index));
      if (await images.count() === 0) continue;
      const image = images.first();
      const source = await image.getAttribute('src');
      if (!source || !isBusinessImageSource(source)) continue;
      const contract = await image.evaluate((element) => ({
        className: element.className,
        role: element.getAttribute('role') ?? '',
        ancestorRole: element.closest('[role]')?.getAttribute('role') ?? '',
        tabIndex: (element as HTMLElement).tabIndex,
        cursor: window.getComputedStyle(element).cursor,
      }));
      await image.click();
      return { source, rowIndex: index, ...contract };
    }
    return undefined;
  }

  @step('读取商品主图预览证据')
  async readImagePreviewEvidence(timeout = 3_000): Promise<{ previewCount: number; previewSource: string }> {
    const visible = await this.locators.imagePreview.waitFor({ state: 'visible', timeout })
      .then(() => true)
      .catch(() => false);
    return {
      previewCount: visible ? await this.locators.imagePreview.count() : 0,
      previewSource: visible ? await this.locators.imagePreview.getAttribute('src') ?? '' : '',
    };
  }

  @step('读取主图点击后的可见交互表面')
  async readImageInteractionSurfaceEvidence(): Promise<{ dialogCount: number; modalCount: number }> {
    return {
      dialogCount: await this.locators.visibleDialogs.count(),
      modalCount: await this.locators.visibleModals.count(),
    };
  }

  @step('关闭商品主图预览')
  async closeImagePreviewIfVisible(): Promise<void> {
    if (!(await this.locators.imagePreviewCloseButton.isVisible().catch(() => false))) return;
    await this.locators.imagePreviewCloseButton.click();
    await this.locators.imagePreview.waitFor({ state: 'hidden', timeout: 10_000 });
  }

  @step('点击商品名称：{itemName}')
  async clickItemName(itemName: string): Promise<void> {
    await this.expectUniqueItemVisible(itemName);
    await this.clickVisibleItemName(itemName);
  }

  @step('点击已确认可见的商品名称：{itemName}')
  async clickVisibleItemName(itemName: string): Promise<void> {
    await this.locators.itemNameLink(itemName).click();
    await waitUntil(
      () => new URL(this.page.url()).pathname,
      (pathname) => pathname.startsWith('/pp/brand/edit/'),
      { timeout: 10_000, interval: 100, message: `点击商品 ${itemName} 后未进入编辑页。` },
    );
  }

  @step('等待分页信息显示总条数')
  async expectPaginationVisible(): Promise<void> {
    await this.locators.pagination.waitFor({ state: 'visible', timeout: 10_000 });
  }

  @step('等待批量操作按钮处于禁用状态')
  async expectBatchActionDisabled(): Promise<void> {
    await this.locators.batchActionButton.waitFor({ state: 'visible', timeout: 10_000 });
    await waitUntil(
      async () => this.locators.batchActionButton.isDisabled(),
      (disabled) => disabled === true,
      { timeout: 10_000, message: '未选中商品时批量操作按钮应禁用。', probeTimeout: 2_000 },
    );
  }

  @step('等待批量操作按钮可用且显示选中数量：{count}')
  async expectBatchActionEnabled(count: number): Promise<void> {
    const enabledBatchButton = this.locators.batchActionButtonForCount(count);
    await enabledBatchButton.waitFor({ state: 'visible', timeout: 10_000 });
    await waitUntil(
      async () => enabledBatchButton.isEnabled(),
      (enabled) => enabled === true,
      { timeout: 10_000, message: `选中 ${count} 条商品后批量操作按钮应可用。`, probeTimeout: 2_000 },
    );
  }

  @step('等待批量操作菜单项可见')
  async expectBatchActionMenuItemsVisible(): Promise<void> {
    await this.locators.batchMenuEditProductInfo.waitFor({ state: 'visible', timeout: 10_000 });
    await this.locators.batchMenuModifySalesInfo.waitFor({ state: 'visible', timeout: 10_000 });
    await this.locators.batchMenuModifyPrice.waitFor({ state: 'visible', timeout: 10_000 });
    await this.locators.batchMenuModifyAttributes.waitFor({ state: 'visible', timeout: 10_000 });
    await this.locators.batchMenuAddToMenu.waitFor({ state: 'visible', timeout: 10_000 });
  }

  @step('读取批量操作菜单及基础字段子菜单')
  async readBatchActionMenuEvidence(): Promise<{
    menuOpened: boolean;
    topLevelItems: string[];
    productInfoItems: string[];
    visibleSurfaceText: string[];
  }> {
    await this.openBatchActionMenu();
    const menuOpened = await waitUntil(
      () => this.locators.visibleBatchMenuItems.count(),
      (count) => count > 0,
      { timeout: 5_000, interval: 100, message: '批量操作菜单未显示。', probeTimeout: 2_000 },
    ).then(() => true).catch(() => false);
    const topLevelItems = normalizeMenuTexts(await this.locators.visibleBatchMenuItems.allInnerTexts());
    const visibleSurfaceText = normalizeMenuTexts(await this.locators.visibleBatchDropdowns.allInnerTexts());
    const productInfoTrigger = this.locators.visibleBatchMenuItems.filter({ hasText: /Edit.*(Product|Item).*Info/i }).first();
    if (await productInfoTrigger.isVisible().catch(() => false)) {
      await productInfoTrigger.hover();
      await waitUntil(
        () => this.locators.visibleBatchMenuItems.count(),
        (count) => count > topLevelItems.length,
        { timeout: 5_000, interval: 100, message: '批量编辑商品信息子菜单未显示。', probeTimeout: 2_000 },
      ).catch(() => undefined);
    }
    const allVisibleItems = normalizeMenuTexts(await this.locators.visibleBatchMenuItems.allInnerTexts());
    const nestedProductInfoItems = allVisibleItems.filter((item) => !topLevelItems.includes(item));
    return {
      menuOpened,
      topLevelItems,
      productInfoItems: nestedProductInfoItems.length > 0
        ? nestedProductInfoItems
        : topLevelItems.filter((item) => /^Edit\s/u.test(item)),
      visibleSurfaceText,
    };
  }

  @step('等待顶部操作菜单包含图片导入与商品导入选项')
  async expectActionMenuItemsVisible(): Promise<void> {
    await this.locators.actionMenuImageImport.waitFor({ state: 'visible', timeout: 10_000 });
    await this.locators.actionMenuItemImport.waitFor({ state: 'visible', timeout: 10_000 });
  }

  @step('等待首行商品操作菜单包含停用、复制、删除选项')
  async expectFirstRowActionMenuItemsVisible(): Promise<void> {
    await this.locators.rowActionDisable.waitFor({ state: 'visible', timeout: 10_000 });
    await this.locators.rowActionCopy.waitFor({ state: 'visible', timeout: 10_000 });
    await this.locators.rowActionDelete.waitFor({ state: 'visible', timeout: 10_000 });
  }
}

export function createItemListPage(page: Page): ItemListPage {
  return new ItemListPage(page);
}

function collectMatchingStrings(value: unknown, keyword: string, matches: string[] = []): string[] {
  if (typeof value === 'string') {
    if (value.toLowerCase().includes(keyword.toLowerCase())) matches.push(value);
    return matches;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectMatchingStrings(item, keyword, matches);
    return matches;
  }
  if (value && typeof value === 'object') {
    for (const item of Object.values(value as Record<string, unknown>)) {
      collectMatchingStrings(item, keyword, matches);
    }
  }
  return matches;
}

function isBusinessImageSource(source: string): boolean {
  return !source.startsWith('nullimage')
    && !source.startsWith('data:image/svg+xml');
}

function normalizeMenuTexts(values: string[]): string[] {
  return [...new Set(values.flatMap((value) => value.split(/\r?\n/u)).map((value) => value.trim()).filter(Boolean))];
}

function normalizeSurfaceTexts(values: string[]): string[] {
  return [...new Set(values.flatMap((value) => value.split(/\r?\n/u))
    .map((value) => value.trim().replace(/\s+/g, ' ')).filter(Boolean))];
}

function matchesTypeFilter(actual: string, expected: string): boolean {
  if (expected === 'Add-On') return /^(Add-On|Side)$/i.test(actual.trim());
  return actual.trim() === expected;
}

function sameColumnState(
  left: { checked: string[]; unchecked: string[] },
  right: { checked: string[]; unchecked: string[] },
): boolean {
  return [...left.checked].sort().join('|') === [...right.checked].sort().join('|')
    && [...left.unchecked].sort().join('|') === [...right.unchecked].sort().join('|');
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function safePathname(url: string): string {
  try {
    return new URL(url).pathname;
  } catch {
    return '';
  }
}
