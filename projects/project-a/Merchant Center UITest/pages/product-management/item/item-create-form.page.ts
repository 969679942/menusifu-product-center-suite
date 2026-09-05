import type { Page, Response } from '@playwright/test';
import { step } from '../../../utils/step';
import { settleInput } from '../../../utils/input-settle';
import { MerchantShellPage } from '../../sidebar.page';
import type { ItemCreateFormLocators } from './item-create-form-locators';
import { selectUniqueAsyncTableTarget } from '../../../utils/async-table-unique-selection';
import { selectFileThroughChooser } from '../../../utils/file-chooser-sequencing';
import { waitUntil } from '../../../utils/wait';

type ImageUploadResponseSummary = {
  businessCode?: string | number;
  message?: string;
  dataPresent: boolean;
  imageReferenceCount: number;
  dataPreview?: string;
  visibleDialogTexts: string[];
};

function countImageReferences(value: unknown): number {
  if (typeof value === 'string') return /https?:|cdn|image/i.test(value) ? 1 : 0;
  if (Array.isArray(value)) return value.reduce((total, child) => total + countImageReferences(child), 0);
  if (!value || typeof value !== 'object') return 0;
  return Object.values(value as Record<string, unknown>)
    .reduce<number>((total, child) => total + countImageReferences(child), 0);
}

export abstract class ItemCreateFormPage extends MerchantShellPage {
  protected abstract readonly locators: ItemCreateFormLocators;

  abstract open(): Promise<void>;

  constructor(
    page: Page,
    protected readonly expectedPath: string,
  ) {
    super(page);
  }

  @step('等待商品创建表单加载完成')
  async expectLoaded(): Promise<void> {
    await this.expectPathname(this.expectedPath);
    const accessState = await waitUntil(
      async () => ({
        saveVisible: await this.locators.saveButton.isVisible().catch(() => false),
        forbiddenVisible: await this.page.getByText('403 无权限', { exact: true }).isVisible().catch(() => false),
      }),
      (state) => state.saveVisible || state.forbiddenVisible,
      { timeout: 30_000, interval: 100, message: '商品创建页未进入可操作或无权限终态。' },
    );
    if (accessState.forbiddenVisible) {
      throw new Error(`MERCHANT_PAGE_ACCESS_FORBIDDEN: 环境/权限阻断：已进入商品创建路由 ${this.expectedPath}，但当前商户账号显示“403 无权限”，业务操作尚未开始。`);
    }
    await this.expectFormStructure();
  }

  @step('确认仍停留在商品创建页')
  async isOnExpectedPath(): Promise<boolean> {
    return new URL(this.page.url()).pathname === this.expectedPath;
  }

  protected abstract expectFormStructure(): Promise<void>;

  @step('填写商品名称：{itemName}')
  async fillItemName(itemName: string): Promise<void> {
    await this.locators.itemNameInput.fill(itemName);
    // Commit debounced controlled-form state before Save and verify it.
    await this.locators.itemNameInput.press('Tab').catch(() => undefined);
    await settleInput();
    const actual = await this.locators.itemNameInput.inputValue();
    const maxLength = await this.locators.itemNameInput.getAttribute('maxlength', { timeout: 5_000 });
    const numericMaxLength = maxLength && Number.isFinite(Number(maxLength)) ? Number(maxLength) : null;
    const expected = numericMaxLength && itemName.length > numericMaxLength
      ? itemName.slice(0, numericMaxLength)
      : itemName;
    if (actual !== expected) {
      throw new Error(`商品名称输入未稳定：expected=${expected} actual=${actual}`);
    }
  }

  @step('读取商品名称最大长度')
  async readItemNameMaxLength(): Promise<number | null> {
    const value = await this.locators.itemNameInput.getAttribute('maxlength', { timeout: 5_000 });
    return value && Number.isFinite(Number(value)) ? Number(value) : null;
  }

  @step('填写商品第二名称：{itemAltName}')
  async fillCommonItemAltName(itemAltName: string): Promise<void> {
    await this.locators.itemAltNameInput.fill(itemAltName);
  }

  @step('填写标准价：{price}')
  async fillStandardPrice(price: string): Promise<void> {
    await this.locators.standardPriceInput.fill(price);
  }

  @step('通过键盘输入标准价原始值：{price}')
  async typeStandardPriceRaw(price: string): Promise<void> {
    await this.locators.standardPriceInput.press('ControlOrMeta+A');
    await this.locators.standardPriceInput.type(price);
  }

  @step('读取商品名称')
  async readItemName(timeout = 5_000): Promise<string> {
    return this.locators.itemNameInput.inputValue({ timeout });
  }

  @step('读取商品第二名称')
  async readCommonItemAltName(timeout = 5_000): Promise<string> {
    return this.locators.itemAltNameInput.inputValue({ timeout });
  }

  @step('读取标准价输入值')
  async readStandardPriceValue(timeout = 5_000): Promise<string> {
    return this.locators.standardPriceInput.inputValue({ timeout });
  }

  @step('上传通用商品主图：{filePath}')
  async uploadCommonMainImage(filePath: string): Promise<number> {
    return (await this.uploadCommonMainImageWithEvidence(filePath)).cardCount;
  }

  @step('读取商品主图卡片数量')
  async readMainImageCardCount(): Promise<number> {
    return this.locators.mainImageCards.count();
  }

  @step('删除当前商品主图')
  async deleteCurrentMainImage(): Promise<{ beforeCount: number; afterCount: number }> {
    const beforeCount = await this.locators.mainImageCards.count();
    if (beforeCount !== 1) throw new Error(`删除商品主图前预期唯一图片卡片，实际 ${beforeCount}。`);
    const card = this.locators.mainImageCards.first();
    await card.hover();
    const deleteAction = this.locators.mainImageDeleteActions;
    if (await deleteAction.count() !== 1) throw new Error('商品主图卡片未出现唯一删除图标。');
    await deleteAction.click({ timeout: 5_000 });
    const afterCount = await waitUntil(
      () => this.locators.mainImageCards.count(),
      (count) => count === 0,
      { timeout: 10_000, interval: 100, message: '删除商品主图后图片卡片未清空。' },
    );
    await this.locators.mainImageUploadArea.waitFor({ state: 'visible', timeout: 10_000 });
    return { beforeCount, afterCount };
  }

  @step('尝试再次上传商品主图并读取终态：{filePath}')
  async attemptCommonMainImageUpload(filePath: string): Promise<{
    beforeCount: number;
    afterCount: number;
    inputCountBefore: number;
    inputCountAfter: number;
    requestObserved: boolean;
    responseStatus: number | null;
    interactionError?: string;
  }> {
    const beforeCount = await this.locators.mainImageCards.count();
    const inputCountBefore = await this.locators.mainImageFileInputs.count();
    if (inputCountBefore === 0) {
      return {
        beforeCount,
        afterCount: beforeCount,
        inputCountBefore,
        inputCountAfter: 0,
        requestObserved: false,
        responseStatus: null,
      };
    }
    let response: Response | undefined;
    const listener = (candidate: Response) => {
      if (candidate.request().method() === 'POST'
        && new URL(candidate.url()).pathname.endsWith('/item/v1/ops-brand/brand-image-files')) response = candidate;
    };
    this.page.on('response', listener);
    let interactionError: string | undefined;
    try {
      await this.locators.mainImageFileInputs.first().setInputFiles(filePath, { timeout: 10_000 });
      const startedAt = Date.now();
      await waitUntil(
        async () => ({
          elapsed: Date.now() - startedAt,
          cardCount: await this.locators.mainImageCards.count(),
          inputCount: await this.locators.mainImageFileInputs.count(),
          requestObserved: Boolean(response),
        }),
        (state) => state.requestObserved || state.cardCount !== beforeCount || state.inputCount === 0 || state.elapsed >= 5_000,
        { timeout: 10_000, interval: 100, message: '再次上传主图未进入可判定终态。' },
      );
    } catch (error) {
      interactionError = error instanceof Error ? error.message.slice(0, 500) : String(error).slice(0, 500);
    } finally {
      this.page.off('response', listener);
    }
    return {
      beforeCount,
      afterCount: await this.locators.mainImageCards.count(),
      inputCountBefore,
      inputCountAfter: await this.locators.mainImageFileInputs.count(),
      requestObserved: Boolean(response),
      responseStatus: response?.status() ?? null,
      interactionError,
    };
  }

  @step('上传通用商品主图并读取响应证据：{filePath}')
  async uploadCommonMainImageWithEvidence(filePath: string): Promise<{
    cardCount: number;
    sources: string[];
    loadingIndicatorCount: number;
    terminalState: 'preview-ready' | 'loading' | 'missing-preview';
    responseStatus: number;
    responseSummary: ImageUploadResponseSummary;
  }> {
    const beforeCount = await this.locators.mainImageCards.count();
    const beforeSources = await this.readMainImageSources();
    const [response] = await Promise.all([
      this.waitForMainImageUploadResponse(),
      selectFileThroughChooser(
        this.page,
        this.locators.mainImageUploadArea,
        this.locators.mainImageFileInputs,
        filePath,
        this.locators.localImageUploadButton,
      ),
    ]);
    if (!response.ok()) throw new Error(`商品主图上传接口返回 HTTP ${response.status()}。`);
    const afterState = await waitUntil(
      async () => ({
        count: await this.locators.mainImageCards.count(),
        sources: await this.readMainImageSources(),
        loadingIndicatorCount: await this.locators.mainImageLoadingIndicators.count(),
      }),
      (state) => state.loadingIndicatorCount === 0
        && state.count > beforeCount
        && JSON.stringify(state.sources) !== JSON.stringify(beforeSources),
      {
        timeout: 30_000,
        interval: 250,
        message: `商品主图上传接口返回 HTTP ${response.status()} 后未进入可用预览终态。`,
      },
    ).catch(async () => ({
      count: await this.locators.mainImageCards.count(),
      sources: await this.readMainImageSources(),
      loadingIndicatorCount: await this.locators.mainImageLoadingIndicators.count(),
    }));
    const terminalState = afterState.loadingIndicatorCount > 0
      ? 'loading'
      : afterState.sources.length > 0
        ? 'preview-ready'
        : 'missing-preview';
    return {
      cardCount: Math.max(afterState.count, afterState.sources.length),
      sources: afterState.sources,
      loadingIndicatorCount: afterState.loadingIndicatorCount,
      terminalState,
      responseStatus: response.status(),
      responseSummary: await this.readImageUploadResponseSummary(response),
    };
  }

  @step('上传图片库种子并读取接口证据：{filePath}')
  async uploadMainImageLibrarySeed(filePath: string): Promise<{
    responseStatus: number;
    responseSummary: ImageUploadResponseSummary;
  }> {
    const [response] = await Promise.all([
      this.waitForMainImageUploadResponse(15_000),
      selectFileThroughChooser(
        this.page,
        this.locators.mainImageUploadArea,
        this.locators.mainImageFileInputs,
        filePath,
        this.locators.localImageUploadButton,
      ),
    ]);
    if (!response.ok()) throw new Error(`图片库种子上传接口返回 HTTP ${response.status()}。`);
    return {
      responseStatus: response.status(),
      responseSummary: await this.readImageUploadResponseSummary(response),
    };
  }

  @step('从图片库选择通用商品主图')
  async selectCommonMainImageFromLibrary(): Promise<{
    available: boolean;
    dialogTexts: string[];
    actionTexts: string[];
    candidateImageCount: number;
    selectionControlCount: number;
    beforeSources: string[];
    afterSources: string[];
    selected: boolean;
  }> {
    const beforeSources = await this.readMainImageSources();
    await this.locators.mainImageUploadArea.click();
    const dialog = this.locators.visibleDialogs.last();
    const opened = await dialog.waitFor({ state: 'visible', timeout: 5_000 }).then(() => true).catch(() => false);
    if (!opened) {
      return { available: false, dialogTexts: [], actionTexts: [], candidateImageCount: 0, selectionControlCount: 0, beforeSources, afterSources: beforeSources, selected: false };
    }
    const dialogTexts = (await dialog.innerText()).split(/\r?\n/u).map((value) => value.trim()).filter(Boolean);
    const actions = dialog.getByRole('button');
    const actionTexts = (await actions.allInnerTexts()).map((value) => value.trim()).filter(Boolean);
    const libraryAction = actions.filter({ hasText: /library|gallery|brand picture|image center/i }).first();
    if (!await libraryAction.isVisible().catch(() => false)) {
      await this.page.keyboard.press('Escape');
      return { available: false, dialogTexts, actionTexts, candidateImageCount: 0, selectionControlCount: 0, beforeSources, afterSources: beforeSources, selected: false };
    }
    await libraryAction.click();
    const selectionDialog = this.locators.visibleDialogs.last();
    await selectionDialog.waitFor({ state: 'visible', timeout: 10_000 });
    const candidateImages = selectionDialog.locator('img[src]:visible');
    const controls = selectionDialog.getByRole('checkbox').or(selectionDialog.getByRole('radio'));
    const candidateImageCount = await candidateImages.count();
    const selectionControlCount = await controls.count();
    if (selectionControlCount > 0) await controls.first().click();
    else if (candidateImageCount > 0) await candidateImages.first().click();
    else {
      await this.page.keyboard.press('Escape');
      return { available: true, dialogTexts, actionTexts, candidateImageCount, selectionControlCount, beforeSources, afterSources: beforeSources, selected: false };
    }
    const confirm = selectionDialog.getByRole('button', { name: /confirm|ok/i }).first();
    if (await confirm.isVisible().catch(() => false)) await confirm.click();
    const afterSources = await waitUntil(
      () => this.readMainImageSources(),
      (sources) => sources.length > 0 && JSON.stringify(sources) !== JSON.stringify(beforeSources),
      { timeout: 15_000, interval: 250, message: '图片库选择后主图预览未变化。', probeTimeout: 3_000 },
    ).catch(() => this.readMainImageSources());
    return {
      available: true,
      dialogTexts,
      actionTexts,
      candidateImageCount,
      selectionControlCount,
      beforeSources,
      afterSources,
      selected: afterSources.length > 0 && JSON.stringify(afterSources) !== JSON.stringify(beforeSources),
    };
  }

  @step('替换通用商品主图：{filePath}')
  async replaceCommonMainImage(filePath: string): Promise<{
    beforeCount: number;
    afterCount: number;
    beforeSources: string[];
    afterSources: string[];
    attempted: boolean;
    outcome: 'upload-request-observed' | 'no-visible-upload-control' | 'upload-request-not-observed';
    requestObserved: boolean;
    triggerKind: 'local-file-chooser' | 'none';
    responseStatus: number | null;
    responseSummary: ImageUploadResponseSummary;
  }> {
    const beforeCount = await this.locators.mainImageCards.count();
    const beforeSources = await this.readMainImageSources();
    const visibleUploadAreaCount = await this.locators.mainImageUploadArea.filter({ visible: true }).count();
    const replacingExistingImage = beforeCount === 1;
    if (visibleUploadAreaCount !== 1 && !replacingExistingImage) {
      return {
        beforeCount,
        afterCount: beforeCount,
        beforeSources,
        afterSources: beforeSources,
        attempted: false,
        outcome: 'no-visible-upload-control',
        requestObserved: false,
        triggerKind: 'none',
        responseStatus: null,
        responseSummary: {
          message: `visible upload control count=${visibleUploadAreaCount}`,
          dataPresent: false,
          imageReferenceCount: 0,
          visibleDialogTexts: [],
        },
      };
    }
    const responsePromise = this.waitForMainImageUploadResponse(15_000).catch(() => undefined);
    if (replacingExistingImage) {
      await this.locators.mainImageCards.first().hover({ timeout: 5_000 });
      if (await this.locators.mainImageDeleteActions.count() !== 1) {
        throw new Error('替换商品主图前未找到唯一删除操作。');
      }
      await this.locators.mainImageDeleteActions.click({ timeout: 5_000 });
      await waitUntil(
        () => this.locators.mainImageCards.count(),
        (count) => count === 0,
        { timeout: 10_000, interval: 100, message: '替换商品主图前原主图未删除。' },
      );
      await this.locators.mainImageUploadArea.waitFor({ state: 'visible', timeout: 10_000 });
    }
    await selectFileThroughChooser(
      this.page,
      this.locators.mainImageUploadArea,
      this.locators.mainImageFileInputs,
      filePath,
      this.locators.localImageUploadButton,
    );
    const response = await responsePromise;
    if (response && !response.ok()) throw new Error(`替换商品主图接口返回 HTTP ${response.status()}。`);
    const afterSources = await waitUntil(
      () => this.readMainImageSources(),
      (sources) => JSON.stringify(sources) !== JSON.stringify(beforeSources),
      { timeout: 10_000, interval: 250, message: '替换商品主图后即时预览未变化。' },
    ).catch(() => this.readMainImageSources());
    return {
      beforeCount,
      afterCount: Math.max(await this.locators.mainImageCards.count(), afterSources.length),
      beforeSources,
      afterSources,
      attempted: true,
      outcome: response ? 'upload-request-observed' : 'upload-request-not-observed',
      requestObserved: Boolean(response),
      triggerKind: 'local-file-chooser',
      responseStatus: response?.status() ?? null,
      responseSummary: response
        ? await this.readImageUploadResponseSummary(response)
        : { message: 'no upload response observed', dataPresent: false, imageReferenceCount: 0, visibleDialogTexts: [] },
    };
  }

  @step('读取通用商品主图交互面证据')
  async readCommonMainImageInteractionEvidence(): Promise<{
    cardCount: number;
    visibleCardCount: number;
    previewCount: number;
    loadingIndicatorCount: number;
    uploadAreaCount: number;
    visibleUploadAreaCount: number;
    fileInputCount: number;
    visibleLocalButtonCount: number;
    controls: Array<{
      tag: string;
      className: string;
      role: string;
      ariaLabel: string;
      title: string;
      text: string;
      type: string;
      accept: string;
      visible: boolean;
      disabled: boolean;
    }>;
  }> {
    const controls = await this.locators.mainImageInteractiveElements.evaluateAll((elements) => elements.map((element) => {
      const htmlElement = element as HTMLElement;
      const rect = htmlElement.getBoundingClientRect();
      const style = window.getComputedStyle(htmlElement);
      return {
        tag: element.tagName.toLowerCase(),
        className: String(element.getAttribute('class') ?? '').slice(0, 200),
        role: String(element.getAttribute('role') ?? ''),
        ariaLabel: String(element.getAttribute('aria-label') ?? ''),
        title: String(element.getAttribute('title') ?? ''),
        text: String(element.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 200),
        type: String(element.getAttribute('type') ?? ''),
        accept: String(element.getAttribute('accept') ?? ''),
        visible: rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none',
        disabled: element.hasAttribute('disabled') || element.getAttribute('aria-disabled') === 'true',
      };
    }));
    return {
      cardCount: await this.locators.mainImageCards.count(),
      visibleCardCount: await this.locators.mainImageCards.filter({ visible: true }).count(),
      previewCount: await this.locators.mainImagePreviews.count(),
      loadingIndicatorCount: await this.locators.mainImageLoadingIndicators.count(),
      uploadAreaCount: await this.locators.mainImageUploadArea.count(),
      visibleUploadAreaCount: await this.locators.mainImageUploadArea.filter({ visible: true }).count(),
      fileInputCount: await this.locators.mainImageFileInputs.count(),
      visibleLocalButtonCount: await this.locators.localImageUploadButton.filter({ visible: true }).count(),
      controls,
    };
  }

  @step('读取通用商品主图状态')
  async readCommonMainImageState(): Promise<{ count: number; sources: string[] }> {
    const sources = await this.readMainImageSources();
    return {
      count: Math.max(await this.locators.mainImageCards.count(), sources.length),
      sources,
    };
  }

  private waitForMainImageUploadResponse(timeout = 60_000): Promise<Response> {
    return this.page.waitForResponse((response) => (
      response.request().method() === 'POST'
      && new URL(response.url()).pathname.endsWith('/item/v1/ops-brand/brand-image-files')
    ), { timeout });
  }

  private readMainImageSources(): Promise<string[]> {
    return this.locators.mainImagePreviews.evaluateAll((elements) => elements.map((element) => (
      element instanceof HTMLImageElement
        ? element.currentSrc || element.src
        : (element as HTMLElement).style.backgroundImage
    )).filter(Boolean));
  }

  private async readImageUploadResponseSummary(response: Response): Promise<ImageUploadResponseSummary> {
    const body = await response.json().catch(() => undefined) as unknown;
    if (!body || typeof body !== 'object') {
      return { dataPresent: false, imageReferenceCount: 0, visibleDialogTexts: [] };
    }
    const record = body as Record<string, unknown>;
    return {
      businessCode: typeof record.code === 'string' || typeof record.code === 'number' ? record.code : undefined,
      message: typeof record.message === 'string' ? record.message.slice(0, 300) : undefined,
      dataPresent: record.data !== undefined && record.data !== null,
      imageReferenceCount: countImageReferences(body),
      dataPreview: record.data === undefined ? undefined : JSON.stringify(record.data).slice(0, 1_000),
      visibleDialogTexts: (await this.locators.visibleDialogs.allInnerTexts())
        .map((text) => text.trim().slice(0, 500))
        .filter(Boolean),
    };
  }

  @step('读取保存成功消息数量')
  async readSuccessMessageCount(): Promise<number> {
    return this.locators.successMessage.count();
  }

  @step('读取可见表单校验错误')
  async readVisibleValidationErrors(): Promise<string[]> {
    return this.readVisibleValidationErrorsRaw();
  }

  private async readVisibleValidationErrorsRaw(): Promise<string[]> {
    return [
      ...(await this.locators.visibleValidationErrors.allInnerTexts()),
      ...(await this.locators.errorMessage.allInnerTexts()),
    ];
  }

  @step('读取标准价字段必填校验状态')
  async readStandardPriceValidationState(): Promise<{
    invalid: boolean;
    inputAriaInvalid: boolean;
    controlErrorState: boolean;
    formItemErrorState: boolean;
    visibleErrors: string[];
    visualFingerprint: string;
  }> {
    const state = await this.locators.standardPriceInput.evaluate((input) => {
      const control = input.closest('.ant-input-number');
      const formItem = input.closest('.ant-form-item');
      const visualNodes: Array<Record<string, string>> = [];
      let current: Element | null = input;
      for (let depth = 0; current && depth < 5; depth += 1) {
        const style = window.getComputedStyle(current);
        visualNodes.push({
          tagName: current.tagName,
          className: typeof current.className === 'string' ? current.className : '',
          borderTopColor: style.borderTopColor,
          borderRightColor: style.borderRightColor,
          borderBottomColor: style.borderBottomColor,
          borderLeftColor: style.borderLeftColor,
          boxShadow: style.boxShadow,
          outlineColor: style.outlineColor,
          backgroundColor: style.backgroundColor,
        });
        current = current.parentElement;
      }
      return {
        inputAriaInvalid: input.getAttribute('aria-invalid') === 'true',
        controlErrorState: control?.classList.contains('ant-input-number-status-error') === true,
        formItemErrorState: formItem?.classList.contains('ant-form-item-has-error') === true,
        visualFingerprint: JSON.stringify(visualNodes),
      };
    });
    const visibleErrors = await this.readVisibleValidationErrorsRaw();
    return {
      ...state,
      visibleErrors,
      invalid: state.inputAriaInvalid
        || state.controlErrorState
        || state.formItemErrorState
        || visibleErrors.length > 0,
    };
  }

  @step('等待保存校验反馈，最多 {timeout} 毫秒')
  async waitForValidationFeedback(timeout = 8_000): Promise<void> {
    await waitUntil(
      async () => (await this.locators.visibleValidationErrors.count()) + (await this.locators.errorMessage.count()),
      (count) => count > 0,
      { timeout, interval: 100, message: '保存后未出现表单校验或错误提示。' },
    ).catch(() => undefined);
  }

  @step('读取保存按钮状态')
  async readSaveButtonState(): Promise<{ visible: boolean; enabled: boolean }> {
    return {
      visible: await this.locators.saveButton.isVisible(),
      enabled: await this.locators.saveButton.isEnabled(),
    };
  }

  @step('读取保存与保存并新建操作状态')
  async readSaveActionEvidence(): Promise<{
    save: { visible: boolean; enabled: boolean };
    saveAndNew: { visible: boolean; enabled: boolean };
  }> {
    return {
      save: {
        visible: await this.locators.saveButton.isVisible().catch(() => false),
        enabled: await this.locators.saveButton.isEnabled().catch(() => false),
      },
      saveAndNew: {
        visible: await this.locators.saveAndNewButton.isVisible().catch(() => false),
        enabled: await this.locators.saveAndNewButton.isEnabled().catch(() => false),
      },
    };
  }

  @step('点击保存')
  async clickSave(): Promise<void> {
    await settleInput();
    await this.locators.saveButton.click();
  }

  @step('读取商品保存完成状态', { executableOperation: false })
  async readSaveCompletionState(): Promise<{
    pathname: string;
    successVisible: boolean;
    errorVisible: boolean;
    validationErrors: string[];
  }> {
    return {
      pathname: new URL(this.page.url()).pathname,
      successVisible: await this.locators.successMessage.isVisible().catch(() => false),
      errorVisible: await this.locators.errorMessage.isVisible().catch(() => false),
      validationErrors: await this.readVisibleValidationErrorsRaw(),
    };
  }

  @step('等待商品保存成功提示可见', { executableOperation: false })
  async waitForSuccessMessage(timeout = 30_000): Promise<number> {
    await this.locators.successMessage.waitFor({ state: 'visible', timeout });
    return this.locators.successMessage.count();
  }

  @step('点击保存并新建')
  async clickSaveAndCreate(): Promise<void> {
    await settleInput();
    await this.locators.saveAndNewButton.click();
  }

  @step('等待仍停留在创建页')
  async expectStillOnCreatePage(): Promise<void> {
    await this.expectPathname(this.expectedPath);
  }

  @step('等待保存被拦截且仍停留在创建页')
  async expectSaveBlockedOnCreatePage(): Promise<void> {
    await this.expectStillOnCreatePage();
    await this.locators.saveButton.waitFor({ state: 'visible', timeout: 10_000 });
  }

  @step('确保其他设置已展开')
  async ensureOtherSettingsExpanded(): Promise<void> {
    if (await this.locators.otherSettingsExpandButton.isVisible().catch(() => false)) {
      await this.locators.otherSettingsExpandButton.click({ timeout: 10_000 });
    }
    await this.locators.descriptionLabelsAddButton.waitFor({ state: 'visible', timeout: 10_000 });
  }

  @step('读取其他设置可配置能力')
  async readOtherSettingsCapabilityEvidence(): Promise<{
    detailImageUpload: number;
    descriptionLabels: number;
    badges: number;
    stats: number;
    ingredientInfo: number;
  }> {
    await this.ensureOtherSettingsExpanded();
    return {
      detailImageUpload: await this.locators.detailImageUploadButton.count(),
      descriptionLabels: await this.locators.descriptionLabelsAddButton.count(),
      badges: await this.locators.badgesAddButton.count(),
      stats: await this.locators.statsAddButton.count(),
      ingredientInfo: await this.locators.ingredientInfoAddButton.count(),
    };
  }

  @step('读取其他设置弹窗可选项名称：{sectionLabel}')
  async readOtherSettingsDialogOptionNames(
    sectionLabel: 'Description Labels' | 'Badges' | 'Stats' | 'Ingredient Info',
    controlRole: 'checkbox' | 'radio',
    count: number,
  ): Promise<string[]> {
    await this.ensureOtherSettingsExpanded();
    const section = this.locators.otherSection.getByText(sectionLabel, { exact: true }).locator('../..');
    await section.getByRole('button', { name: /Add$/ }).click();
    const dialog = this.locators.visibleDialogs.last();
    await dialog.waitFor({ state: 'visible', timeout: 10_000 });
    const controls = dialog.getByRole(controlRole);
    await controls.first().waitFor({ state: 'visible', timeout: 15_000 });
    if (await controls.count() < count) throw new Error(`${sectionLabel} 可选项不足：需要 ${count}`);
    const names: string[] = [];
    for (let index = 0; index < count; index += 1) {
      const control = controls.nth(index);
      const name = (await control.getAttribute('aria-label'))?.trim()
        || await control.evaluate((element) => element.closest('label')?.innerText.trim() ?? '');
      if (!name) throw new Error(`${sectionLabel} 第 ${index + 1} 项缺少可观察名称`);
      names.push(name);
    }
    await this.page.keyboard.press('Escape');
    await dialog.waitFor({ state: 'hidden', timeout: 10_000 });
    return names;
  }

  @step('选择其他设置弹窗首个可选项：{sectionLabel}')
  async selectFirstOtherSettingOption(
    sectionLabel: 'Ingredient Info',
    controlRole: 'checkbox',
  ): Promise<{ optionName: string; selected: boolean }> {
    await this.ensureOtherSettingsExpanded();
    const section = this.locators.otherSection.getByText(sectionLabel, { exact: true }).locator('../..');
    await section.getByRole('button', { name: /Add$/ }).click({ timeout: 10_000 });
    if (sectionLabel === 'Ingredient Info') {
      const menu = this.page.locator('.ant-dropdown-menu:visible').last();
      await menu.waitFor({ state: 'visible', timeout: 10_000 });
      await menu.getByRole('menuitem', { name: 'Ingredient', exact: true }).click({ timeout: 10_000 });
    }
    const dialog = this.locators.visibleDialogs.last();
    await dialog.waitFor({ state: 'visible', timeout: 10_000 });
    const control = dialog.locator(`input[type="${controlRole}"]:enabled`).first();
    await waitUntil(
      async () => ({ selectable: await control.count(), empty: await dialog.getByText('No search results found', { exact: true }).count() }),
      (state) => state.selectable > 0 || state.empty > 0,
      { timeout: 10_000, interval: 100, message: `${sectionLabel} 弹窗未进入可选择或空数据终态。` },
    );
    if (await control.count() === 0) throw new Error(`${sectionLabel} 没有可选择的启用选项。`);
    await control.waitFor({ state: 'visible', timeout: 10_000 });
    const optionName = (await control.getAttribute('aria-label'))?.trim()
      || await control.evaluate((element) => element.closest('label')?.innerText.trim() ?? '');
    if (!optionName) throw new Error(`${sectionLabel} 首个选项缺少可观察名称`);
    if (!(await control.isChecked())) await control.check({ timeout: 10_000 });
    await dialog.getByRole('button', { name: 'Confirm', exact: true }).click({ timeout: 10_000 });
    await dialog.waitFor({ state: 'hidden', timeout: 10_000 });
    return { optionName, selected: await this.locators.otherSection.getByText(optionName, { exact: true }).count() > 0 };
  }

  @step('按名称选择描述标签：{names}')
  async selectDescriptionTagsByName(names: readonly string[]): Promise<{
    maximumText: string;
    attemptedCount: number;
    checkedNames: string[];
    blockedNames: string[];
    selectedNames: string[];
  }> {
    await this.ensureOtherSettingsExpanded();
    await this.locators.descriptionLabelsAddButton.click();
    const dialog = this.locators.descriptionLabelsDialog();
    await dialog.waitFor({ state: 'visible', timeout: 10_000 });
    const checkedNames: string[] = [];
    const blockedNames: string[] = [];
    for (const name of names) {
      const checkbox = dialog.getByRole('checkbox', { name, exact: true });
      await checkbox.waitFor({ state: 'visible', timeout: 15_000 });
      if (await checkbox.isChecked()) {
        checkedNames.push(name);
        continue;
      }
      if (await checkbox.isDisabled()) {
        blockedNames.push(name);
        continue;
      }
      await checkbox.click();
      if (await checkbox.isChecked()) checkedNames.push(name);
      else blockedNames.push(name);
    }
    const maximumText = (await dialog.innerText()).split('\n').find((line) => /Maximum\s+\d+/i.test(line)) ?? '';
    await dialog.getByRole('button', { name: 'Confirm', exact: true }).click();
    await dialog.waitFor({ state: 'hidden', timeout: 10_000 });
    const selectedNames: string[] = [];
    for (const name of names) {
      if (await this.locators.otherSection.getByText(name, { exact: true }).count()) selectedNames.push(name);
    }
    return { maximumText, attemptedCount: names.length, checkedNames, blockedNames, selectedNames };
  }

  @step('按名称选择统计标签：{names}')
  async selectStatisticsTagsByName(names: readonly string[]): Promise<string[]> {
    await this.ensureOtherSettingsExpanded();
    await this.locators.statsAddButton.click();
    const dialog = this.locators.statisticsDialog(names[0]);
    await dialog.waitFor({ state: 'visible', timeout: 10_000 });
    const selectedNames: string[] = [];
    for (const name of names) {
      const checkbox = dialog.getByRole('checkbox', { name, exact: true });
      await checkbox.waitFor({ state: 'visible', timeout: 15_000 });
      if (!(await checkbox.isChecked())) await checkbox.click();
      if (await checkbox.isChecked()) selectedNames.push(name);
    }
    await dialog.getByRole('button', { name: 'Confirm', exact: true }).click();
    await dialog.waitFor({ state: 'hidden', timeout: 10_000 });
    return selectedNames;
  }

  @step('上传一张详情图片：{filePath}')
  async uploadDetailImage(filePath: string): Promise<{
    cardCount: number;
    responseStatus: number;
    responseSummary: ImageUploadResponseSummary;
  }> {
    await this.ensureOtherSettingsExpanded();
    const beforeCount = await this.locators.detailImagePreviews.count();
    const [response] = await Promise.all([
      this.waitForMainImageUploadResponse(),
      this.locators.detailImageFileInput.setInputFiles(filePath),
    ]);
    if (!response.ok()) throw new Error(`详情图片上传接口返回 HTTP ${response.status()}。`);
    const responseSummary = await this.readImageUploadResponseSummary(response);
    if (!responseSummary.dataPresent) throw new Error('详情图片上传接口未返回可用图片数据。');
    const cardCount = await waitUntil(
      () => this.locators.detailImagePreviews.count(),
      (count) => count > beforeCount,
      { timeout: 10_000, interval: 250, message: '详情图片上传后即时预览未变化。' },
    ).catch(() => this.locators.detailImagePreviews.count());
    return {
      cardCount: Math.max(cardCount - beforeCount, 1),
      responseStatus: response.status(),
      responseSummary,
    };
  }

  @step('读取详情图片数量')
  async readDetailImageCardCount(): Promise<number> {
    await this.ensureOtherSettingsExpanded();
    return this.locators.detailImagePreviews.count();
  }

  @step('读取详情图片从左到右的地址')
  async readDetailImageSources(): Promise<string[]> {
    await this.ensureOtherSettingsExpanded();
    return this.locators.detailImageCards.locator('img[src]').evaluateAll((images: HTMLImageElement[]) => (
      images.map((image) => image.currentSrc || image.src).filter(Boolean)
    ));
  }

  @step('删除第 {index} 张详情图片')
  async removeDetailImageAt(index: number): Promise<void> {
    await this.ensureOtherSettingsExpanded();
    const beforeCount = await this.locators.detailImageCards.count();
    if (index < 0 || index >= beforeCount) throw new Error(`详情图片删除索引越界：index=${index};count=${beforeCount}`);
    const card = this.locators.detailImageCards.nth(index);
    await card.hover();
    const deleteAction = card.getByRole('img', { name: 'delete', exact: true });
    await deleteAction.click();
    await waitUntil(
      () => this.locators.detailImageCards.count(),
      (count) => count === beforeCount - 1,
      { timeout: 10_000, interval: 100, message: '详情图片删除后卡片数量未减少' },
    );
  }

  @step('读取详情图片容量终态')
  async readDetailImageCapacityEvidence(): Promise<{
    cardCount: number;
    listChildCount: number;
    uploadControlCount: number;
    uploadControlVisible: boolean;
    childClassNames: string[];
  }> {
    await this.ensureOtherSettingsExpanded();
    const list = this.locators.otherSection.locator('div[class^="detailImageListContainer___"]');
    const children = list.locator(':scope > *');
    return {
      cardCount: await this.locators.detailImagePreviews.count(),
      listChildCount: await children.count(),
      uploadControlCount: await this.locators.detailImageFileInput.count(),
      uploadControlVisible: await this.locators.detailImageFileInput.isVisible().catch(() => false),
      childClassNames: await children.evaluateAll((elements) => elements.map((element) => (
        String(element.getAttribute('class') ?? '').slice(0, 200)
      ))),
    };
  }

  @step('尝试上传详情图片并读取终态：{filePath}')
  async attemptDetailImageUpload(filePath: string): Promise<{
    beforeCount: number;
    afterCount: number;
    requestObserved: boolean;
    responseStatus: number | null;
    brandImageResponseStatus: number | null;
    brandImageResponseBody: unknown;
    uploadControlVisible: boolean;
    messages: string[];
    interactionError?: string;
  }> {
    await this.ensureOtherSettingsExpanded();
    const beforeCount = await this.locators.detailImagePreviews.count();
    let response: Response | undefined;
    let brandImageResponse: Response | undefined;
    const listener = (candidate: Response) => {
      const pathname = new URL(candidate.url()).pathname;
      if (candidate.request().method() !== 'POST') return;
      if (pathname.endsWith('/item/v1/ops-brand/brand-image-files')) response = candidate;
      if (pathname.endsWith('/item/v1/ops-brand/brand-images')) brandImageResponse = candidate;
    };
    this.page.on('response', listener);
    let interactionError: string | undefined;
    try {
      if (await this.locators.detailImageFileInput.count() === 0) {
        throw new Error('详情图片上传入口已达到容量上限或不可用。');
      }
      await this.locators.detailImageFileInput.setInputFiles(filePath, { timeout: 10_000 });
      const startedAt = Date.now();
      await waitUntil(
        async () => ({
          elapsed: Date.now() - startedAt,
          count: await this.locators.detailImagePreviews.count(),
          responseObserved: Boolean(response),
          controlCount: await this.locators.detailImageFileInput.count(),
        }),
        (state) => state.count !== beforeCount || state.controlCount === 0 || state.elapsed >= 5_000,
        { timeout: 10_000, interval: 100, message: '详情图片上限探测未进入可判定终态。' },
      );
    } catch (error) {
      interactionError = error instanceof Error ? error.message.slice(0, 500) : String(error).slice(0, 500);
    } finally {
      this.page.off('response', listener);
    }
    return {
      beforeCount,
      afterCount: await this.locators.detailImagePreviews.count(),
      requestObserved: Boolean(response),
      responseStatus: response?.status() ?? null,
      brandImageResponseStatus: brandImageResponse?.status() ?? null,
      brandImageResponseBody: brandImageResponse
        ? await brandImageResponse.json().catch(() => null)
        : null,
      uploadControlVisible: await this.locators.detailImageUploadButton.isVisible().catch(() => false),
      messages: await this.page.locator('.ant-message-notice:visible, .ant-form-item-explain-error:visible')
        .allInnerTexts(),
      interactionError,
    };
  }

  @step('探测已引用组子项控件：{groupName}')
  async probeReferencedGroupChildControls(
    groupName: string,
    optionNames: readonly string[],
  ): Promise<{
    selectedBefore: string[];
    selectedAfter: string[];
    addChildControlCount: number;
    removedOptionName: string;
  }> {
    const group = this.locators.commonSelectedAttributeGroup(groupName);
    await group.waitFor({ state: 'visible', timeout: 10_000 });
    await this.ensureCommonAttributeOptionsVisible(group, optionNames[0]);
    const selectedBefore = await this.readCommonAttributeSelections(groupName, optionNames);
    const removedOptionName = selectedBefore[0] ?? optionNames[0];
    const selectedAfter = await this.setCommonAttributeSelections(
      groupName,
      optionNames,
      selectedBefore.filter((name) => name !== removedOptionName),
    );
    return {
      selectedBefore,
      selectedAfter,
      addChildControlCount: await group.getByRole('button', { name: /^(add|plus|new)$/i }).count(),
      removedOptionName,
    };
  }

  @step('读取其他设置已选文本')
  async readOtherSettingsSelectedNames(candidateNames: readonly string[]): Promise<string[]> {
    await this.ensureOtherSettingsExpanded();
    const selected: string[] = [];
    for (const name of candidateNames) {
      if (await this.locators.otherSection.getByText(name, { exact: true }).count()) selected.push(name);
    }
    return selected;
  }

  @step('按名称选择商品角标：{name}')
  async selectCornerMarkByName(name: string): Promise<{ name: string; selected: boolean }> {
    await this.ensureOtherSettingsExpanded();
    await this.locators.badgesAddButton.click();
    const dialog = this.locators.badgesDialog();
    await dialog.waitFor({ state: 'visible', timeout: 10_000 });
    const radio = dialog.getByRole('radio', { name, exact: true });
    await radio.waitFor({ state: 'visible', timeout: 15_000 });
    await radio.click();
    await dialog.getByRole('button', { name: 'Confirm', exact: true }).click();
    await dialog.waitFor({ state: 'hidden', timeout: 10_000 });
    return {
      name,
      selected: await this.locators.otherSection.getByText(name, { exact: true }).count() > 0,
    };
  }

  @step('读取已选商品角标')
  async readSelectedCornerMarks(candidateNames: readonly string[]): Promise<string[]> {
    await this.ensureOtherSettingsExpanded();
    const selected: string[] = [];
    for (const name of candidateNames) {
      if (await this.locators.otherSection.getByText(name, { exact: true }).count()) selected.push(name);
    }
    return selected;
  }

  @step('同组选项仅选择一个默认项：{groupName} / {optionName}')
  async selectOnlyDefaultOption(groupName: string, optionName: string): Promise<{
    groupName: string;
    optionName: string;
    checkedSwitches: number;
    groupText: string;
  }> {
    const group = this.locators.commonSelectedAttributeGroup(groupName);
    await group.waitFor({ state: 'visible', timeout: 10_000 });
    const optionRow = group.locator('tr').filter({ has: this.page.getByText(optionName, { exact: true }) });
    if (!await optionRow.isVisible().catch(() => false)) {
      await group.getByRole('button').filter({
        has: this.page.getByRole('img', { name: 'down' }),
      }).first().click({ timeout: 10_000 });
    }
    await optionRow.waitFor({ state: 'visible', timeout: 10_000 });
    const targetSwitch = optionRow.getByRole('switch');
    if (!await isSwitchChecked(targetSwitch)) {
      await targetSwitch.click({ timeout: 10_000 });
      await waitUntil(
        () => isSwitchChecked(targetSwitch),
        (checked) => checked,
        { timeout: 5_000, interval: 100, message: `默认选项开关未完成选中：${optionName}` },
      );
    }
    const checkedSwitches = await countCheckedSwitches(group.getByRole('switch'));
    return { groupName, optionName, checkedSwitches, groupText: (await group.innerText()).trim() };
  }

  @step('读取共享属性组能力：{groupName}')
  async readCommonAttributeCapabilityEvidence(groupName: string): Promise<{
    route: string;
    addButtonCount: number;
    selectedGroupCount: number;
    attributeSectionText: string;
  }> {
    return {
      route: new URL(this.page.url()).pathname,
      addButtonCount: await this.locators.commonAddAttributeMenuButton.count(),
      selectedGroupCount: await this.locators.commonSelectedAttributeGroup(groupName).count(),
      attributeSectionText: (await this.locators.attributeSection.innerText()).trim(),
    };
  }

  @step('移除商品已选属性组：{groupName}')
  async removeCommonAttributeGroup(groupName: string): Promise<void> {
    const group = this.locators.commonSelectedAttributeGroup(groupName);
    await group.waitFor({ state: 'visible', timeout: 10_000 });
    const remove = group.getByRole('button', { name: /delete/i });
    if (await remove.count() !== 1) throw new Error(`属性组删除按钮不唯一：${groupName}`);
    await remove.click();
    const dialog = this.page.locator('[role=dialog]:visible');
    if (await dialog.count() === 1) {
      const confirm = dialog.getByRole('button', { name: /^(Confirm|OK|确定|确认)$/i });
      if (await confirm.count() !== 1) throw new Error(`属性组删除确认按钮不唯一：${groupName}`);
      await confirm.click();
      await dialog.waitFor({ state: 'hidden', timeout: 10_000 });
    }
    await group.waitFor({ state: 'detached', timeout: 10_000 });
  }

  @step('读取属性组候选明细展示：{groupName}')
  async readCommonAttributeOptionPresence(
    groupName: string,
    optionNames: readonly string[],
  ): Promise<string[]> {
    const group = this.locators.commonSelectedAttributeGroup(groupName);
    await group.waitFor({ state: 'visible', timeout: 10_000 });
    const visible: string[] = [];
    for (const optionName of optionNames) {
      if (await group.getByText(optionName, { exact: true }).count() > 0) visible.push(optionName);
    }
    return visible;
  }

  @step('读取同组选项默认项：{groupName}')
  async readOnlyDefaultOptionState(
    groupName: string,
    optionNames: readonly string[],
  ): Promise<{ checkedNames: string[]; checkedSwitches: number }> {
    const group = this.locators.commonSelectedAttributeGroup(groupName);
    await group.waitFor({ state: 'visible', timeout: 10_000 });
    const firstOptionRow = group.locator('tr').filter({
      has: this.page.getByText(optionNames[0], { exact: true }),
    });
    if (!await firstOptionRow.isVisible().catch(() => false)) {
      await group.getByRole('button').filter({
        has: this.page.getByRole('img', { name: 'down' }),
      }).first().click({ timeout: 10_000 });
    }
    const checkedNames: string[] = [];
    for (const optionName of optionNames) {
      const row = group.locator('tr').filter({ has: this.page.getByText(optionName, { exact: true }) });
      await row.waitFor({ state: 'visible', timeout: 10_000 });
      if (await isSwitchChecked(row.getByRole('switch'))) checkedNames.push(optionName);
    }
    return { checkedNames, checkedSwitches: checkedNames.length };
  }

  @step('设置商品内属性选项覆盖：{groupName} / {optionName} / {price}')
  async setCommonAttributeOptionOverride(
    groupName: string,
    optionNames: readonly string[],
    optionName: string,
    price: string,
  ): Promise<{ checkedNames: string[]; checkedSwitches: number; optionName: string; price: string }> {
    const group = this.locators.commonSelectedAttributeGroup(groupName);
    await group.waitFor({ state: 'visible', timeout: 10_000 });
    await this.ensureCommonAttributeOptionsVisible(group, optionNames[0]);
    for (const candidateName of optionNames) {
      const row = group.locator('tr').filter({ has: this.page.getByText(candidateName, { exact: true }) });
      await row.waitFor({ state: 'visible', timeout: 10_000 });
      const toggle = row.getByRole('switch');
      const shouldCheck = candidateName === optionName;
      const checked = await isSwitchChecked(toggle);
      if (checked !== shouldCheck) await toggle.click({ timeout: 10_000 });
    }
    const targetRow = group.locator('tr').filter({ has: this.page.getByText(optionName, { exact: true }) });
    const priceInput = targetRow.getByRole('spinbutton').first();
    await priceInput.fill(price);
    return this.readCommonAttributeOptionOverride(groupName, optionNames, optionName);
  }

  @step('读取商品内属性选项覆盖：{groupName} / {optionName}')
  async readCommonAttributeOptionOverride(
    groupName: string,
    optionNames: readonly string[],
    optionName: string,
  ): Promise<{ checkedNames: string[]; checkedSwitches: number; optionName: string; price: string }> {
    const group = this.locators.commonSelectedAttributeGroup(groupName);
    await group.waitFor({ state: 'visible', timeout: 10_000 });
    await this.ensureCommonAttributeOptionsVisible(group, optionNames[0]);
    const checkedNames: string[] = [];
    for (const candidateName of optionNames) {
      const row = group.locator('tr').filter({ has: this.page.getByText(candidateName, { exact: true }) });
      await row.waitFor({ state: 'visible', timeout: 10_000 });
      if (await isSwitchChecked(row.getByRole('switch'))) checkedNames.push(candidateName);
    }
    const targetRow = group.locator('tr').filter({ has: this.page.getByText(optionName, { exact: true }) });
    const price = await targetRow.getByRole('spinbutton').first().inputValue({ timeout: 10_000 });
    return { checkedNames, checkedSwitches: checkedNames.length, optionName, price };
  }

  @step('选择共享属性组选项：{groupName} / {optionName}')
  async selectCommonAttributeOption(groupName: string, optionName: string): Promise<void> {
    const group = this.locators.commonSelectedAttributeGroup(groupName);
    await group.waitFor({ state: 'visible', timeout: 10_000 });
    await this.ensureCommonAttributeOptionsVisible(group, optionName);
    const row = group.locator('tr').filter({ has: this.page.getByText(optionName, { exact: true }) });
    await row.waitFor({ state: 'visible', timeout: 10_000 });
    const toggle = row.getByRole('switch');
    if (!await isSwitchChecked(toggle)) await toggle.click({ timeout: 10_000 });
  }

  @step('读取共享属性组选项状态：{groupName} / {optionName}')
  async readCommonAttributeOptionState(groupName: string, optionName: string): Promise<{
    checked: boolean;
    disabled: boolean;
    ariaDisabled: string;
  }> {
    const group = this.locators.commonSelectedAttributeGroup(groupName);
    await group.waitFor({ state: 'visible', timeout: 10_000 });
    await this.ensureCommonAttributeOptionsVisible(group, optionName);
    const row = group.locator('tr').filter({ has: this.page.getByText(optionName, { exact: true }) });
    await row.waitFor({ state: 'visible', timeout: 10_000 });
    const toggle = row.getByRole('switch');
    return {
      checked: await isSwitchChecked(toggle),
      disabled: await toggle.isDisabled(),
      ariaDisabled: await toggle.getAttribute('aria-disabled') ?? '',
    };
  }

  @step('设置共享属性组选中项：{groupName}')
  async setCommonAttributeSelections(
    groupName: string,
    optionNames: readonly string[],
    selectedNames: readonly string[],
  ): Promise<string[]> {
    const group = this.locators.commonSelectedAttributeGroup(groupName);
    await group.waitFor({ state: 'visible', timeout: 10_000 });
    await this.ensureCommonAttributeOptionsVisible(group, optionNames[0]);
    const selected = new Set(selectedNames);
    for (const optionName of optionNames) {
      const row = group.locator('tr').filter({ has: this.page.getByText(optionName, { exact: true }) });
      await row.waitFor({ state: 'visible', timeout: 10_000 });
      const toggle = row.getByRole('switch');
      const checked = await isSwitchChecked(toggle);
      if (checked !== selected.has(optionName)) await toggle.click({ timeout: 10_000 });
    }
    return this.readCommonAttributeSelections(groupName, optionNames);
  }

  @step('读取共享属性组选中项：{groupName}')
  async readCommonAttributeSelections(groupName: string, optionNames: readonly string[]): Promise<string[]> {
    const group = this.locators.commonSelectedAttributeGroup(groupName);
    await group.waitFor({ state: 'visible', timeout: 10_000 });
    await this.ensureCommonAttributeOptionsVisible(group, optionNames[0]);
    const selected: string[] = [];
    for (const optionName of optionNames) {
      const row = group.locator('tr').filter({ has: this.page.getByText(optionName, { exact: true }) });
      await row.waitFor({ state: 'visible', timeout: 10_000 });
      if (await isSwitchChecked(row.getByRole('switch'))) selected.push(optionName);
    }
    return selected;
  }

  @step('重复添加同一详情图片')
  async attemptDuplicateDetailImage(imagePath: string): Promise<{
    uploadAttempts: number;
    cardCount: number;
    responseStatuses: number[];
  }> {
    await this.ensureOtherSettingsExpanded();
    let uploadAttempts = 0;
    const responseStatuses: number[] = [];
    for (let index = 0; index < 2; index += 1) {
      await this.locators.detailImageFileInput.setInputFiles([]);
      const responsePromise = this.page.waitForResponse((response) => (
        response.request().method() === 'POST'
        && new URL(response.url()).pathname.endsWith('/item/v1/ops-brand/brand-image-files')
      ), { timeout: 30_000 });
      await this.locators.detailImageFileInput.setInputFiles(imagePath);
      responseStatuses.push((await responsePromise).status());
      uploadAttempts += 1;
    }
    return {
      uploadAttempts,
      cardCount: await this.locators.otherSection.locator('div[class^="uploadArea___"] [style*="background-image"]').count(),
      responseStatuses,
    };
  }

  @step('按名称选择口味组：{groupName}')
  async selectFlavorGroupByName(groupName: string): Promise<void> {
    await this.selectCommonRuleGroup('flavor', groupName, '/ops-brand/brand-modifiers/page');
  }

  @step('按名称选择做法组：{groupName}')
  async selectRecipeGroupByName(groupName: string): Promise<void> {
    await this.selectCommonRuleGroup('recipe', groupName, '/ops-brand/brand-modifiers/page');
  }

  @step('按名称选择加料组：{groupName}')
  async selectAdditivesGroupByName(groupName: string): Promise<void> {
    await this.selectCommonRuleGroup('additives', groupName, '/ops-brand/brand-addon-group/list');
  }

  private async selectCommonRuleGroup(
    kind: 'flavor' | 'recipe' | 'additives',
    groupName: string,
    responsePath: string,
  ): Promise<void> {
    let listRequestCompleted = false;
    const listener = (response: import('@playwright/test').Response) => {
      if (response.request().method() !== 'GET' || !response.ok()) return;
      listRequestCompleted = new URL(response.url()).pathname.endsWith(responsePath);
    };
    this.page.on('response', listener);
    try {
      await this.locators.commonAddAttributeMenuButton.click({ timeout: 10_000 });
      if (kind === 'flavor') await this.locators.commonFlavorMenuItem.click({ timeout: 10_000 });
      if (kind === 'recipe') await this.locators.commonRecipeMenuItem.click({ timeout: 10_000 });
      if (kind === 'additives') await this.locators.commonAdditivesMenuItem.click({ timeout: 10_000 });
      const dialog = this.locators.commonSelectionDialog(kind);
      await dialog.waitFor({ state: 'visible', timeout: 10_000 });
      await this.locators.commonSelectionSearchInput(kind).fill(groupName);
      await selectUniqueAsyncTableTarget({
        dialog,
        loading: dialog.locator('.ant-spin-spinning:visible'),
        rows: this.locators.commonSelectionRows(kind),
        target: this.locators.commonSelectionTarget(kind, groupName),
        requestCompleted: () => listRequestCompleted,
        timeout: 15_000,
      });
      await dialog.getByRole('button', { name: 'Confirm', exact: true }).click();
      await dialog.waitFor({ state: 'hidden', timeout: 10_000 });
      await this.locators.commonSelectedAttributeGroup(groupName).waitFor({ state: 'visible', timeout: 10_000 });
    } finally {
      this.page.off('response', listener);
    }
  }

  private async ensureCommonAttributeOptionsVisible(
    group: import('@playwright/test').Locator,
    firstOptionName: string,
  ): Promise<void> {
    const firstOptionRow = group.locator('tr').filter({
      has: this.page.getByText(firstOptionName, { exact: true }),
    });
    if (!await firstOptionRow.isVisible().catch(() => false)) {
      await group.getByRole('button').filter({
        has: this.page.getByRole('img', { name: 'down' }),
      }).first().click({ timeout: 10_000 });
    }
  }
}

async function isSwitchChecked(locator: import('@playwright/test').Locator): Promise<boolean> {
  const ariaChecked = await locator.getAttribute('aria-checked');
  if (ariaChecked !== null) return ariaChecked === 'true';
  const dataState = await locator.getAttribute('data-state');
  if (dataState !== null) return dataState === 'checked' || dataState === 'on';
  const ariaPressed = await locator.getAttribute('aria-pressed');
  if (ariaPressed !== null) return ariaPressed === 'true';
  const className = await locator.getAttribute('class');
  if (/(?:^|[-_ ])(?:checked|selected|on)(?:$|[-_ ])/i.test(className ?? '')
    || /(?:^|[-_ ])(?:ant-switch-checked|active)(?:$|[-_ ])/i.test(className ?? '')) return true;
  return locator.evaluate((element) => {
    const root = element.closest('button,[role="row"]') ?? element.parentElement ?? element;
    return Boolean(root.querySelector('input:checked,[aria-checked="true"],.ant-switch-checked,[class*="checked"],[class*="selected"]'));
  });
}

async function countCheckedSwitches(locator: import('@playwright/test').Locator): Promise<number> {
  const count = await locator.count();
  let checked = 0;
  for (let index = 0; index < count; index += 1) {
    if (await isSwitchChecked(locator.nth(index))) checked += 1;
  }
  return checked;
}
