import type { Locator, Page, Response } from '@playwright/test';
import { ITEM_CREATE_PATHS } from '../../../test-data/item-list';
import { step } from '../../../utils/step';
import { waitUntil } from '../../../utils/wait';
import { ItemCreateFormPage } from './item-create-form.page';
import { ItemCreateSideLocators } from './item-create-side-locators';

export class ItemCreateSidePage extends ItemCreateFormPage {
  protected readonly locators: ItemCreateSideLocators;

  constructor(page: Page) {
    super(page, ITEM_CREATE_PATHS.side);
    this.locators = new ItemCreateSideLocators(page);
  }

  @step('打开加料/配菜商品创建页')
  async open(): Promise<void> {
    await this.page.goto(this.expectedPath, { waitUntil: 'domcontentloaded' });
    await this.expectLoaded();
  }

  protected async expectFormStructure(): Promise<void> {
    await this.locators.basicInfoHeading.waitFor({ state: 'visible', timeout: 30_000 });
    await this.locators.priceHeading.waitFor({ state: 'visible', timeout: 30_000 });
    await this.locators.moreSettingsHeading.waitFor({ state: 'visible', timeout: 30_000 });
  }

  @step('确保加料商品高级设置已展开')
  async ensureAdvancedSettingsExpanded(): Promise<void> {
    if (!await this.locators.posNameInput.isVisible().catch(() => false)) {
      await this.locators.advancedSettingsButton.click();
    }
    await this.locators.posNameInput.waitFor({ state: 'visible', timeout: 10_000 });
  }

  @step('确保加料商品其他设置已展开')
  async ensureOtherSettingsExpanded(): Promise<void> {
    if (await this.locators.otherSettingsExpandButton.isVisible().catch(() => false)) {
      await this.locators.otherSettingsExpandButton.click({ timeout: 5_000 });
    }
    await waitUntil(
      async () => (await this.locators.descriptionLabelsAddButton.count())
        + (await this.locators.badgesAddButton.count())
        + (await this.locators.statsAddButton.count())
        + (await this.locators.ingredientInfoAddButton.count()),
      (count) => count > 0,
      { timeout: 5_000, interval: 100, message: '加料商品其他设置区域未进入可操作状态。' },
    );
  }

  @step('读取加料商品其他设置选项：{0}，数量 {2}')
  async readOtherSettingsDialogOptionNames(
    sectionLabel: 'Description Labels' | 'Badges' | 'Stats' | 'Ingredient Info',
    controlRole: 'checkbox' | 'radio',
    count: number,
  ): Promise<string[]> {
    await this.ensureOtherSettingsExpanded();
    await this.locators.getOtherSettingsAddButton(sectionLabel).click({ timeout: 5_000 });
    const dialog = this.locators.visibleDialogs.last();
    try {
      await dialog.waitFor({ state: 'visible', timeout: 5_000 });
      const controls = dialog.getByRole(controlRole);
      await controls.first().waitFor({ state: 'visible', timeout: 5_000 });
      const available = await controls.count();
      if (available < count) throw new Error(`${sectionLabel} 可选项不足：需要 ${count}，实际 ${available}`);
      const names: string[] = [];
      for (let index = 0; index < count; index += 1) {
        const control = controls.nth(index);
        const name = (await control.getAttribute('aria-label'))?.trim()
          || await control.evaluate((element) => element.closest('label')?.innerText.trim() ?? '');
        if (!name) throw new Error(`${sectionLabel} 第 ${index + 1} 项缺少可观察身份`);
        names.push(name);
      }
      return names;
    } finally {
      await this.page.keyboard.press('Escape').catch(() => undefined);
      await dialog.waitFor({ state: 'hidden', timeout: 3_000 }).catch(() => undefined);
    }
  }

  @step('读取加料商品名称最大长度')
  async readItemNameMaxLength(): Promise<number | null> {
    const value = await this.locators.itemNameInput.getAttribute('maxlength', { timeout: 5_000 });
    return value && Number.isFinite(Number(value)) ? Number(value) : null;
  }

  @step('选择加料商品第一个配料选项')
  async selectFirstOtherSettingOption(
    sectionLabel: 'Ingredient Info',
    controlRole: 'checkbox',
  ): Promise<{ optionName: string; selected: boolean }> {
    return this.selectOtherSettingOptionByName(sectionLabel, 'Ingredient', undefined, controlRole);
  }

  @step('选择加料商品其他设置选项：{1}，{2}')
  async selectOtherSettingOptionByName(
    sectionLabel: 'Ingredient Info',
    optionKind: 'Ingredient' | 'Allergen' | 'Nutrition',
    optionName?: string,
    controlRole: 'checkbox' = 'checkbox',
  ): Promise<{ optionName: string; selected: boolean; optionKind: string }> {
    await this.ensureOtherSettingsExpanded();
    await this.locators.getOtherSettingsAddButton(sectionLabel).click({ timeout: 5_000 });
    const menu = this.page.locator('.ant-dropdown-menu:visible').last();
    const dialog = this.locators.visibleDialogs.last();
    try {
      await menu.waitFor({ state: 'visible', timeout: 5_000 });
      const menuItemName = optionKind === 'Allergen'
        ? 'Allergens'
        : optionKind === 'Nutrition'
          ? 'Nutritional'
          : 'Ingredient';
      const menuItem = menu.getByRole('menuitem', { name: menuItemName, exact: true });
      if (await menuItem.count() !== 1) {
        throw new Error(`${sectionLabel} 未观察到唯一 ${menuItemName} 入口：${JSON.stringify((await menu.innerText()).trim())}`);
      }
      await menuItem.click({ timeout: 5_000 });
      await dialog.waitFor({ state: 'visible', timeout: 5_000 });
      const rows = dialog.getByRole('row');
      const exactRows = optionName ? rows.filter({ hasText: optionName }) : undefined;
      const emptyState = dialog.getByText('No search results found', { exact: true });
      await waitUntil(
        async () => exactRows ? exactRows.count() : countSelectableRows(rows, controlRole),
        (selectable) => selectable > 0,
        { timeout: 8_000, interval: 100, message: `${sectionLabel} 弹窗未出现目标可选项。` },
      ).catch(async (error) => {
        if (await emptyState.isVisible().catch(() => false)) {
          throw new Error(`${sectionLabel} ${optionKind} 没有可选择的启用选项。`);
        }
        throw error;
      });
      let selectedControl: Locator | undefined;
      let observedOptionName = optionName?.trim() ?? '';
      const candidateRows = exactRows ?? rows;
      for (let index = 0; index < await candidateRows.count(); index += 1) {
        const row = candidateRows.nth(index);
        const control = row.getByRole(controlRole).last();
        if (await control.count() === 0 || !await control.isEnabled().catch(() => false)) continue;
        const observedName = (await row.innerText()).trim();
        if (!observedName) continue;
        if (!observedOptionName || observedName.includes(observedOptionName)) {
          selectedControl = control;
          observedOptionName ||= observedName.split('\n')[0].trim();
          if (optionName) break;
        }
      }
      if (!selectedControl || !observedOptionName) {
        throw new Error(`${sectionLabel} ${optionKind} 未找到精确选项：${optionName ?? '(未指定)'}`);
      }
      if (!(await selectedControl.isChecked())) await selectedControl.check({ timeout: 5_000, force: true });
      await dialog.getByRole('button', { name: 'Confirm', exact: true }).click({ timeout: 5_000 });
      await dialog.waitFor({ state: 'hidden', timeout: 5_000 });
      return {
        optionName: observedOptionName,
        selected: await this.locators.otherSection.getByText(observedOptionName, { exact: true }).count() > 0,
        optionKind,
      };
    } finally {
      await this.page.keyboard.press('Escape').catch(() => undefined);
      await dialog.waitFor({ state: 'hidden', timeout: 3_000 }).catch(() => undefined);
    }
  }

  @step('从图片库精确选择加料商品主图')
  async selectCommonMainImageFromLibraryByReference(reference: {
    imagePath?: string;
    imageUrl?: string;
    name: string;
  }): Promise<{
    available: boolean;
    candidateImageCount: number;
    selected: boolean;
    selectedSource: string;
    selectionConfirmed: boolean;
    beforeSources: string[];
    afterSources: string[];
  }> {
    const beforeSources = await this.readSideMainImageSources();
    const existingCardCount = await this.locators.mainImageCards.count();
    const replacementTrigger = existingCardCount === 1
      ? this.locators.mainImageCards.first()
      : this.locators.mainImageUploadArea;
    await replacementTrigger.hover({ timeout: 5_000 });
    if (!await this.locators.mainImageLibraryButton.isVisible().catch(() => false)) {
      const cardBox = await this.locators.mainImageCards.first().boundingBox().catch(() => null);
      if (cardBox) {
        await this.page.mouse.move(cardBox.x + cardBox.width - 8, cardBox.y + Math.min(24, cardBox.height / 2));
      }
    }
    await this.locators.mainImageLibraryButton.waitFor({ state: 'visible', timeout: 10_000 });
    await this.locators.mainImageLibraryButton.click({ timeout: 5_000 });
    const selectionDialog = this.locators.imageLibraryDialog;
    await selectionDialog.waitFor({ state: 'visible', timeout: 5_000 });
    const candidateImages = selectionDialog.locator('img[src]:visible');
    const matchingImage = this.locators.imageLibraryImage(reference.name);
    const visibleWithoutSearch = await waitUntil(
      () => matchingImage.count(),
      (count) => count === 1,
      { timeout: 5_000, interval: 200, message: `图片库当前页未出现受控图片：${reference.name}` },
    ).then(() => true).catch(() => false);
    if (!visibleWithoutSearch) {
      await this.locators.imageLibrarySearchInput.fill('', { timeout: 5_000 });
      await this.locators.imageLibrarySearchInput.fill(reference.name, { timeout: 5_000 });
      await this.locators.imageLibrarySearchInput.press('Enter', { timeout: 5_000 });
      await waitUntil(
        async () => ({ exact: await matchingImage.count(), empty: await selectionDialog.getByText('No search results found', { exact: true }).count() }),
        (state) => state.exact > 0 || state.empty > 0,
        { timeout: 10_000, interval: 200, message: '图片库弹窗未进入候选图片或空数据终态。' },
      );
    }
    if (await matchingImage.count() !== 1) {
      throw new Error(`图片库未找到唯一受控图片 ${reference.name}：匹配数=${await matchingImage.count()}`);
    }
    await waitUntil(
      () => matchingImage.evaluate((node) => {
        const image = node as HTMLImageElement;
        return { complete: image.complete, naturalWidth: image.naturalWidth };
      }),
      (state) => state.complete && state.naturalWidth > 0,
      { timeout: 10_000, interval: 200, message: `图片库受控图片资源未加载完成：${reference.name}` },
    );
    const matchingCard = selectionDialog.locator('div[class^="imageCard___"]').filter({ has: matchingImage });
    if (await matchingCard.count() === 1) {
      await matchingCard.click({ timeout: 10_000 });
    } else {
      await matchingImage.click({ timeout: 10_000 });
    }
    await waitUntil(
      () => this.locators.imageLibraryConfirmButton.isEnabled(),
      (enabled) => enabled,
      { timeout: 5_000, interval: 100, message: `图片库受控图片选择后确认按钮未启用：${reference.name}` },
    );
    await this.locators.imageLibraryConfirmButton.click({ timeout: 5_000 });
    await selectionDialog.waitFor({ state: 'hidden', timeout: 15_000 });
    const afterSources = await waitUntil(
      () => this.readSideMainImageSources(),
      (sources) => sources.length === 1 && JSON.stringify(sources) !== JSON.stringify(beforeSources),
      { timeout: 10_000, interval: 250, message: `图片库选择受控图片后主图预览未变化：${reference.name}`, probeTimeout: 3_000 },
    ).catch(() => this.readSideMainImageSources());
    const selectedSource = afterSources.find((source) => [reference.imagePath, reference.imageUrl].filter(Boolean).some((value) => source.includes(value!))) ?? '';
    const selectionConfirmed = selectedSource.length > 0;
    if (!selectionConfirmed) {
      throw new Error(`图片库确认后主图未切换到目标引用：${JSON.stringify({ reference, beforeSources, afterSources })}`);
    }
    return {
      available: true,
      candidateImageCount: await candidateImages.count(),
      selected: selectedSource.length > 0,
      selectedSource,
      selectionConfirmed,
      beforeSources,
      afterSources,
    };
  }

  @step('上传加料商品详情图片：{0}')
  async uploadDetailImage(filePath: string): Promise<{
    cardCount: number;
    responseStatus: number;
    responseSummary: SideImageUploadResponseSummary;
  }> {
    await this.ensureOtherSettingsExpanded();
    const beforeCount = await this.locators.detailImagePreviews.count();
    if (await this.locators.detailImageFileInput.count() === 0) {
      throw new Error('详情图片上传控件未出现，无法继续执行本次加料商品用例。');
    }
    const responsePromise = this.waitForSideImageUploadResponse(15_000);
    await this.locators.detailImageFileInput.first().setInputFiles(filePath, { timeout: 5_000 });
    const response = await responsePromise;
    if (!response.ok()) throw new Error(`详情图片上传接口返回 HTTP ${response.status()}。`);
    const responseSummary = await this.readSideImageUploadResponseSummary(response);
    if (!responseSummary.dataPresent) throw new Error('详情图片上传接口未返回可用图片数据。');
    const cardCount = await waitUntil(
      () => this.locators.detailImagePreviews.count(),
      (count) => count > beforeCount,
      { timeout: 5_000, interval: 250, message: '详情图片上传后即时预览未变化。' },
    ).catch(() => this.locators.detailImagePreviews.count());
    return { cardCount: Math.max(cardCount - beforeCount, 1), responseStatus: response.status(), responseSummary };
  }

  @step('使用本地图片替换加料商品主图：{filePath}')
  async replaceMainImageWithLocalFile(filePath: string): Promise<{
    cardCount: number;
    sources: string[];
    loadingIndicatorCount: number;
    responseStatus: number;
    responseSummary: SideImageUploadResponseSummary;
  }> {
    const beforeSources = await this.readSideMainImageSources();
    const input = await this.ensureMainImageFileInput();
    const [response] = await Promise.all([
      this.waitForSideImageUploadResponse(15_000),
      input.setInputFiles(filePath, { timeout: 5_000 }),
    ]);
    if (!response.ok()) throw new Error(`商品主图替换接口返回 HTTP ${response.status()}。`);
    const responseSummary = await this.readSideImageUploadResponseSummary(response);
    const afterState = await waitUntil(
      async () => ({
        cardCount: await this.locators.mainImageCards.count(),
        sources: await this.readSideMainImageSources(),
        loadingIndicatorCount: await this.locators.mainImageLoadingIndicators.count(),
      }),
      (state) => state.loadingIndicatorCount === 0
        && state.cardCount === 1
        && state.sources.length === 1
        && JSON.stringify(state.sources) !== JSON.stringify(beforeSources),
      { timeout: 15_000, interval: 250, message: '本地主图替换后未进入唯一可用预览终态。' },
    );
    return { ...afterState, responseStatus: response.status(), responseSummary };
  }

  @step('批量上传加料商品详情图片')
  async uploadDetailImages(filePaths: readonly string[]): Promise<{
    multiple: boolean;
    cardCount: number;
    responses: Array<{ responseStatus: number; responseSummary: SideImageUploadResponseSummary }>;
  }> {
    await this.ensureOtherSettingsExpanded();
    const input = this.locators.detailImageFileInput.first();
    if (await input.count() === 0) throw new Error('详情图片上传控件未出现。');
    const multiple = await input.getAttribute('multiple') !== null;
    if (!multiple) {
      const responses = [];
      for (const filePath of filePaths) responses.push(await this.uploadDetailImage(filePath));
      return {
        multiple,
        cardCount: await this.locators.detailImagePreviews.count(),
        responses: responses.map(({ responseStatus, responseSummary }) => ({ responseStatus, responseSummary })),
      };
    }
    const observed: Response[] = [];
    const listener = (response: Response) => {
      if (response.request().method() === 'POST'
        && new URL(response.url()).pathname.endsWith('/item/v1/ops-brand/brand-image-files')) observed.push(response);
    };
    this.page.on('response', listener);
    try {
      await input.setInputFiles([...filePaths], { timeout: 5_000 });
      await waitUntil(
        () => Promise.resolve(observed.length),
        (count) => count >= filePaths.length,
        { timeout: 20_000, interval: 100, message: `详情图片批量上传响应不足：expected=${filePaths.length}` },
      );
      const responses = await Promise.all(observed.slice(0, filePaths.length).map(async (response) => {
        if (!response.ok()) throw new Error(`详情图片批量上传接口返回 HTTP ${response.status()}。`);
        return { responseStatus: response.status(), responseSummary: await this.readSideImageUploadResponseSummary(response) };
      }));
      const cardCount = await waitUntil(
        () => this.locators.detailImagePreviews.count(),
        (count) => count >= filePaths.length,
        { timeout: 10_000, interval: 100, message: `详情图片批量上传后预览不足：expected=${filePaths.length}` },
      );
      return { multiple, cardCount, responses };
    } finally {
      this.page.off('response', listener);
    }
  }

  private async ensureMainImageFileInput(): Promise<Locator> {
    await this.closeMainImagePreviewIfVisible();
    const input = this.locators.mainImageFileInputs.first();
    if (await input.count() > 0) return input;

    if (await this.locators.mainImageCards.count() > 0) {
      const card = this.locators.mainImageCards.first();
      await card.hover({ timeout: 5_000 });
      const deleteAction = this.locators.mainImageDeleteAction.first();
      await deleteAction.waitFor({ state: 'visible', timeout: 5_000 });
      await deleteAction.click({ timeout: 5_000 });
      await card.waitFor({ state: 'detached', timeout: 5_000 });
    } else if (await this.locators.mainImageUploadArea.count() === 0) {
      throw new Error('加料商品主图上传或替换控件未出现，已在 5 秒内结束本单元。');
    }

    await waitUntil(
      () => this.locators.mainImageFileInputs.count(),
      (count) => count > 0,
      { timeout: 5_000, interval: 100, message: '加料商品本地主图替换文件控件未出现，已在 5 秒内结束本单元。' },
    );
    return input;
  }

  @step('关闭加料商品主图预览弹窗')
  private async closeMainImagePreviewIfVisible(): Promise<void> {
    const dialog = this.locators.mainImagePreviewDialog;
    if (!await dialog.isVisible().catch(() => false)) return;
    await this.locators.mainImagePreviewCloseButton.click({ timeout: 5_000 });
    await dialog.waitFor({ state: 'hidden', timeout: 5_000 });
  }

  private waitForSideImageUploadResponse(timeout: number): Promise<Response> {
    return this.page.waitForResponse((response) => (
      response.request().method() === 'POST'
      && new URL(response.url()).pathname.endsWith('/item/v1/ops-brand/brand-image-files')
    ), { timeout });
  }

  private readSideMainImageSources(): Promise<string[]> {
    return this.locators.mainImagePreviews.evaluateAll((elements) => elements.map((element) => (
      element instanceof HTMLImageElement
        ? element.currentSrc || element.src
        : (element as HTMLElement).style.backgroundImage
    )).filter(Boolean));
  }

  private async readSideImageUploadResponseSummary(response: Response): Promise<SideImageUploadResponseSummary> {
    const body = await response.json().catch(() => undefined) as unknown;
    if (!body || typeof body !== 'object') return { dataPresent: false, imageReferenceCount: 0, visibleDialogTexts: [] };
    const record = body as Record<string, unknown>;
    return {
      businessCode: typeof record.code === 'string' || typeof record.code === 'number' ? record.code : undefined,
      message: typeof record.message === 'string' ? record.message.slice(0, 300) : undefined,
      dataPresent: record.data !== undefined && record.data !== null,
      imageReferenceCount: countSideImageReferences(body),
      dataPreview: record.data === undefined ? undefined : JSON.stringify(record.data).slice(0, 1_000),
      visibleDialogTexts: (await this.locators.visibleDialogs.allInnerTexts()).map((text) => text.trim().slice(0, 500)).filter(Boolean),
    };
  }

  @step('填写加料商品 POS 名称：{posName}')
  async fillPosName(posName: string): Promise<void> {
    await this.locators.posNameInput.fill(posName);
  }

  @step('填写加料商品送厨名称：{kitchenName}')
  async fillKitchenName(kitchenName: string): Promise<void> {
    await this.locators.kitchenNameInput.fill(kitchenName);
  }

  @step('读取加料商品 POS 名称')
  async readPosName(): Promise<string> {
    return this.locators.posNameInput.inputValue({ timeout: 10_000 });
  }

  @step('读取加料商品送厨名称')
  async readKitchenName(): Promise<string> {
    return this.locators.kitchenNameInput.inputValue({ timeout: 10_000 });
  }

  @step('选择加料商品二级分类：{parentName} / {leafName}')
  async selectCategoryPath(parentName: string, leafName: string): Promise<string> {
    await this.locators.categoryCascader.click({ timeout: 10_000 });
    await waitUntil(
      () => this.locators.visibleCategoryMenus.count(),
      (count) => count > 0,
      { timeout: 10_000, interval: 100, message: '加料商品分类菜单未显示。' },
    );
    const parent = this.locators.categoryNode(parentName);
    if (await parent.count() !== 1) throw new Error(`加料商品一级分类 ${parentName} 不唯一`);
    await parent.dispatchEvent('click');
    await waitUntil(
      () => this.locators.categoryNode(leafName).count(),
      (count) => count === 1,
      { timeout: 10_000, interval: 100, message: `加料商品二级分类 ${leafName} 未显示。` },
    );
    await this.locators.categoryNode(leafName).dispatchEvent('click');
    return waitUntil(
      () => this.locators.categorySelectedValue.innerText(),
      (value) => value.includes(parentName) && value.includes(leafName),
      { timeout: 10_000, interval: 100, message: `加料商品分类未回显 ${parentName} / ${leafName}。` },
    );
  }

  @step('填写加料商品包装费：{packagingFee}')
  async fillPackagingFee(packagingFee: string): Promise<void> {
    await this.locators.packagingFeeInput.fill(packagingFee);
  }

  @step('读取加料商品包装费')
  async readPackagingFee(): Promise<string> {
    return this.locators.packagingFeeInput.inputValue({ timeout: 10_000 });
  }

  @step('填写加料商品成本：{cost}')
  async fillCost(cost: string): Promise<void> {
    await this.locators.costInput.fill(cost);
  }

  @step('读取加料商品成本')
  async readCost(): Promise<string> {
    return this.locators.costInput.inputValue({ timeout: 10_000 });
  }
}

async function countSelectableRows(rows: Locator, controlRole: 'checkbox' | 'radio'): Promise<number> {
  let selectable = 0;
  for (let index = 0; index < await rows.count(); index += 1) {
    const row = rows.nth(index);
    const control = row.getByRole(controlRole).last();
    if (await control.count() > 0 && await control.isEnabled().catch(() => false) && (await row.innerText()).trim()) selectable += 1;
  }
  return selectable;
}

type SideImageUploadResponseSummary = {
  businessCode?: string | number;
  message?: string;
  dataPresent: boolean;
  imageReferenceCount: number;
  dataPreview?: string;
  visibleDialogTexts: string[];
};

function countSideImageReferences(value: unknown): number {
  if (typeof value === 'string') return /https?:|cdn|image/i.test(value) ? 1 : 0;
  if (Array.isArray(value)) return value.reduce((total, child) => total + countSideImageReferences(child), 0);
  if (!value || typeof value !== 'object') return 0;
  return Object.values(value as Record<string, unknown>)
    .reduce<number>((total, child) => total + countSideImageReferences(child), 0);
}
