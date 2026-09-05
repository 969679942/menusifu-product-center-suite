import type { Locator, Page, Response } from '@playwright/test';
import { ITEM_CREATE_PATHS, itemCreateStandardFormDom } from '../../../test-data/item-list';
import { matchesCategoryNodeIdentity } from '../../../utils/category-node-identity';
import { selectFileThroughChooser } from '../../../utils/file-chooser-sequencing';
import { settleInput } from '../../../utils/input-settle';
import { step } from '../../../utils/step';
import { waitUntil } from '../../../utils/wait';
import { selectUniqueAsyncTableTarget } from '../../../utils/async-table-unique-selection';
import { ItemCreateFormPage } from './item-create-form.page';
import { ItemCreateStandardLocators } from './item-create-standard-locators';

type SpecGroupCreateEntryContract = {
  tagName: string;
  role: string;
  className: string;
  parentTagName: string;
  parentRole: string;
  parentClassName: string;
};

type StandardMainImageUploadEvidence = {
  cardCount: number;
  sources: string[];
  loadingIndicatorCount: number;
  terminalState: 'preview-ready' | 'loading' | 'missing-preview';
  requestObserved: boolean;
  responseStatus: number | null;
  responseReferences: string[];
  responseSummary: {
    message?: string;
    dataPresent: boolean;
    imageReferenceCount: number;
    dataPreview?: string;
    visibleDialogTexts: string[];
  };
};

export class ItemCreateStandardPage extends ItemCreateFormPage {
  protected readonly locators: ItemCreateStandardLocators;

  constructor(page: Page) {
    super(page, ITEM_CREATE_PATHS.standard);
    this.locators = new ItemCreateStandardLocators(page);
  }

  @step('打开标准商品创建页')
  async open(): Promise<void> {
    await this.page.goto(this.expectedPath, { waitUntil: 'domcontentloaded' });
    await this.expectLoaded();
  }

  @step('等待标准商品创建页进入可交互终态')
  async expectLoaded(): Promise<void> {
    await this.expectPathname(this.expectedPath);
    await waitUntil(
      async () => ({
        save: await this.locators.saveButton.isVisible().catch(() => false),
        basicInfo: await this.locators.basicInfoHeading.count(),
        price: await this.locators.priceHeading.count(),
        printSettings: await this.locators.printHeading.count(),
        attributes: await this.locators.attributeHeading.count(),
        singleSpec: await this.locators.singleSpecRadio.count(),
      }),
      (state) => state.save && state.basicInfo === 1 && state.price === 1
        && state.printSettings === 1 && state.attributes === 1 && state.singleSpec === 1,
      {
        timeout: 15_000,
        interval: 100,
        probeTimeout: 2_000,
        message: '标准商品创建页核心结构未进入可交互终态。',
      },
    );
  }

  protected async expectFormStructure(): Promise<void> {
    await waitUntil(
      async () => ({
        save: await this.locators.saveButton.isVisible().catch(() => false),
        basicInfo: await this.locators.basicInfoHeading.count(),
        price: await this.locators.priceHeading.count(),
        printSettings: await this.locators.printHeading.count(),
        attributes: await this.locators.attributeHeading.count(),
        singleSpec: await this.locators.singleSpecRadio.count(),
      }),
      (state) => state.save && state.basicInfo === 1 && state.price === 1
        && state.printSettings === 1 && state.attributes === 1 && state.singleSpec === 1,
      {
        timeout: 15_000,
        interval: 100,
        probeTimeout: 2_000,
        message: '标准商品表单核心结构未进入可交互终态。',
      },
    );
  }

  @step('读取标准商品创建页核心结构')
  async readCoreStructureEvidence(): Promise<{
    basicInfo: number;
    price: number;
    printSettings: number;
    attributes: number;
    moreSettings: number;
    singleSpec: number;
    multiSpec: number;
  }> {
    return {
      basicInfo: await this.locators.basicInfoHeading.count(),
      price: await this.locators.priceHeading.count(),
      printSettings: await this.locators.printHeading.count(),
      attributes: await this.locators.attributeHeading.count(),
      moreSettings: await this.locators.otherSettingsHeading.count(),
      singleSpec: await this.locators.singleSpecRadio.count(),
      multiSpec: await this.locators.multiSpecRadio.count(),
    };
  }

  @step('读取行业商品字段是否禁用')
  async isIndustryGoodsDisabled(): Promise<boolean> {
    return this.locators.industryGoodsInput.isDisabled();
  }

  @step('填写商品第二名称：{altName}')
  async fillItemAltName(altName: string): Promise<void> {
    await this.locators.itemAltNameInput.fill(altName);
  }

  @step('填写商品描述：{description}')
  async fillDescription(description: string): Promise<void> {
    await this.locators.descriptionInput.fill(description);
  }

  @step('通过键盘输入商品名称原始值：{itemName}')
  async typeItemNameRaw(itemName: string): Promise<void> {
    await this.locators.itemNameInput.press('ControlOrMeta+A');
    await this.locators.itemNameInput.type(itemName);
  }

  @step('读取商品名称长度边界')
  async readItemNameBoundaryEvidence(): Promise<{ value: string; maxLength: number | null }> {
    const maxLength = await this.locators.itemNameInput.getAttribute('maxlength');
    return {
      value: await this.locators.itemNameInput.inputValue(),
      maxLength: maxLength === null ? null : Number(maxLength),
    };
  }

  @step('探测商品描述长度边界：{acceptedLength}/{rejectedLength}')
  async probeDescriptionLengthBoundary(
    acceptedLength: number,
    rejectedLength: number,
  ): Promise<{
    acceptedLength: number;
    rejectedLength: number;
    valueLengthAfterAccepted: number;
    valueLengthAfterRejected: number;
    maxLengthAttribute: number | null;
    counterText: string;
    counterLimit: number | null;
  }> {
    const timeout = 5_000;
    await this.locators.descriptionInput.fill('D'.repeat(acceptedLength), { timeout });
    const valueLengthAfterAccepted = (await this.locators.descriptionInput.inputValue({ timeout })).length;
    await this.locators.descriptionInput.type('X'.repeat(Math.max(rejectedLength - acceptedLength, 1)), { timeout });
    const valueLengthAfterRejected = (await this.locators.descriptionInput.inputValue({ timeout })).length;
    const maxLength = await this.locators.descriptionInput.getAttribute('maxlength', { timeout });
    const counterText = (await this.locators.descriptionCounter.allInnerTexts()).join(' ');
    const counterLimitMatch = counterText.match(/\/\s*(\d+)/u);
    return {
      acceptedLength,
      rejectedLength,
      valueLengthAfterAccepted,
      valueLengthAfterRejected,
      maxLengthAttribute: maxLength === null ? null : Number(maxLength),
      counterText,
      counterLimit: counterLimitMatch ? Number(counterLimitMatch[1]) : null,
    };
  }

  @step('点击商品分类级联选择器')
  async clickCategoryCascader(): Promise<void> {
    await this.locators.categoryCascader.click({ timeout: 10_000 });
  }

  @step('等待商品分类菜单可见')
  async expectCategoryMenuVisible(): Promise<void> {
    await waitUntil(
      () => this.locators.visibleCategoryMenus.count(),
      (count) => count > 0,
      { timeout: 10_000, interval: 100, message: '商品分类菜单未显示。' },
    );
  }

  @step('读取分类菜单叶子项数量')
  async countCategoryLeafMenuItems(): Promise<number> {
    return this.locators.categoryLeafMenuItems().count();
  }

  @step('点击分类菜单第 {index} 个叶子项')
  async clickCategoryLeafMenuItemAt(index: number): Promise<void> {
    await this.locators.categoryLeafMenuItems().nth(index).click();
  }

  @step('选择商品二级分类：{parentName} / {leafName}')
  async selectCategoryPath(parentName: string, leafName: string): Promise<string> {
    await this.clickCategoryCascader();
    await this.expectCategoryMenuVisible();
    await this.requireUniqueCategoryNode(parentName, true)
      .then((node) => node.dispatchEvent('click'));
    await waitUntil(
      async () => ({
        menuCount: await this.locators.visibleCategoryMenus.count(),
        leafCount: await this.locators.categoryNode(leafName).count(),
      }),
      (state) => state.menuCount === 2 && state.leafCount === 1,
      { timeout: 10_000, message: `一级分类 ${parentName} 未展开唯一二级分类 ${leafName}。` },
    );
    await this.requireUniqueCategoryNode(leafName, false)
      .then((node) => node.dispatchEvent('click'));
    return waitUntil(
      () => this.readSelectedCategoryPath(),
      (value) => value.includes(parentName) && value.includes(leafName),
      { timeout: 10_000, message: `商品分类未回显 ${parentName} / ${leafName}。` },
    );
  }

  @step('选择无子级的一级商品分类：{categoryName}')
  async selectLeafCategoryWithoutChildren(categoryName: string): Promise<string> {
    await this.clickCategoryCascader();
    await this.expectCategoryMenuVisible();
    const node = await this.requireUniqueCategoryNode(categoryName, false);
    await node.dispatchEvent('click');
    return waitUntil(
      () => this.readSelectedCategoryPath(),
      (value) => value.includes(categoryName),
      { timeout: 10_000, message: `无子级一级分类未回显：${categoryName}` },
    );
  }

  @step('仅选择有子级的一级分类：{parentName}')
  async selectCategoryParentOnly(parentName: string, expectedLeafName: string): Promise<{
    selectedPathBefore: string;
    selectedPathAfter: string;
    visibleMenuCount: number;
    childVisible: boolean;
  }> {
    await this.clickCategoryCascader();
    await this.expectCategoryMenuVisible();
    const selectedPathBefore = await this.readSelectedCategoryPath();
    await this.requireUniqueCategoryNode(parentName, true)
      .then((node) => node.dispatchEvent('click'));
    const state = await waitUntil(
      async () => ({
        selectedPathAfter: await this.readSelectedCategoryPath(),
        visibleMenuCount: await this.locators.visibleCategoryMenus.count(),
        childVisible: await this.locators.categoryNode(expectedLeafName).isVisible().catch(() => false),
      }),
      (value) => value.visibleMenuCount === 2 && value.childVisible,
      { timeout: 10_000, message: `一级分类 ${parentName} 未展开二级分类。` },
    );
    return { selectedPathBefore, ...state };
  }

  @step('读取已选商品分类路径')
  async readSelectedCategoryPath(): Promise<string> {
    return (await this.locators.categorySelectedValue.innerText()).trim();
  }

  @step('上传本地主图：{filePath}')
  async uploadMainImage(filePath: string): Promise<number> {
    const uploadTrigger = await this.locators.mainImageCards.count() === 1
      ? this.locators.mainImageCards.first()
      : this.locators.mainImageUploadArea;
    await selectFileThroughChooser(
      this.page,
      uploadTrigger,
      this.locators.mainImageFileInput,
      filePath,
      this.locators.localImageUploadButton,
    );
    return waitUntil(
      () => this.readMainImageCardCount(),
      (count) => count > 0,
      { timeout: 20_000, interval: 250, message: '本地主图上传后未展示预览。' },
    );
  }

  @step('读取主图卡片数量')
  async readMainImageCardCount(): Promise<number> {
    return this.locators.mainImageCards.count();
  }

  @step('读取现有标准商品主图替换控制合同')
  async readMainImageReplacementEvidence(): Promise<{
    cardCount: number;
    uploadAreaCount: number;
    localActionCount: number;
    deleteActionCount: number;
  }> {
    if (await this.locators.mainImageCards.count() === 1) {
      await this.locators.mainImageCards.first().hover({ timeout: 5_000 });
    }
    return {
      cardCount: await this.locators.mainImageCards.count(),
      uploadAreaCount: await this.locators.mainImageUploadArea.count(),
      localActionCount: await this.locators.localImageUploadButton.count(),
      deleteActionCount: await this.locators.mainImageDeleteIcons.count(),
    };
  }

  @step('读取单规格是否选中')
  async isSingleSpecSelected(): Promise<boolean> {
    return this.locators.singleSpecRadio.isChecked();
  }

  @step('确认分类选择器不存在审计分类：{categoryNames}')
  async expectCategoriesAbsent(categoryNames: string[]): Promise<void> {
    await this.clickCategoryCascader();
    await this.expectCategoryMenuVisible();
    for (const categoryName of categoryNames) {
      await waitUntil(
        () => this.locators.categoryNode(categoryName).count(),
        (count) => count === 0,
        { timeout: 10_000, message: `分类选择器仍包含 ${categoryName}。` },
      );
    }
    await this.page.keyboard.press('Escape');
  }

  @step('关闭商品属性添加菜单')
  async closeAddAttributeMenu(): Promise<void> {
    await this.page.keyboard.press('Escape');
  }

  @step('点击高级设置')
  async clickAdvancedSettings(): Promise<void> {
    await this.locators.advancedSettingsButton.click();
  }

  @step('确保高级设置已展开')
  async ensureAdvancedSettingsExpanded(): Promise<void> {
    if (!await this.locators.posNameInput.isVisible().catch(() => false)) {
      await this.clickAdvancedSettings();
    }
    await this.locators.posNameInput.waitFor({ state: 'visible', timeout: 10_000 });
  }

  @step('读取标准商品高级设置八字段')
  async readAdvancedSettingsFieldEvidence(): Promise<{
    expanded: boolean;
    fields: Record<string, { visible: boolean; enabled: boolean }>;
  }> {
    await this.ensureAdvancedSettingsExpanded();
    const fields = {
      posName: this.locators.posNameInput,
      kitchenName: this.locators.kitchenNameInput,
      mnemonicCode: this.locators.mnemonicCodeInput,
      industryGoods: this.locators.industryGoodsInput,
      itemCode: this.locators.itemCodeInput,
      unit: this.locators.unitInput,
      deviceCode: this.locators.deviceCodeInput,
      minimumOrderQuantity: this.locators.minimumOrderQuantityInput,
    };
    return {
      expanded: true,
      fields: Object.fromEntries(await Promise.all(Object.entries(fields).map(async ([name, locator]) => (
        [name, {
          visible: await locator.isVisible().catch(() => false),
          enabled: await locator.isEnabled().catch(() => false),
        }] as const
      )))),
    };
  }

  @step('上传标准商品主图并读取短终态：{filePath}')
  async uploadStandardMainImageWithEvidence(filePath: string): Promise<StandardMainImageUploadEvidence> {
    const beforeSources = await this.readStandardMainImageSources();
    const responsePromise = this.waitForStandardMainImageUploadResponse(8_000).catch(() => undefined);
    if (await this.locators.mainImageCards.count() === 1) {
      await this.locators.mainImageCards.first().hover({ timeout: 5_000 });
      if (await this.locators.mainImageDeleteIcons.count() !== 1) {
        throw new Error('替换标准商品主图前未找到唯一删除操作。');
      }
      await this.locators.mainImageDeleteIcons.click({ timeout: 5_000 });
      await waitUntil(
        () => this.locators.mainImageCards.count(),
        (count) => count === 0,
        { timeout: 10_000, interval: 100, message: '替换标准商品主图前原主图未删除。' },
      );
      await this.locators.mainImageUploadArea.waitFor({ state: 'visible', timeout: 10_000 });
      await selectFileThroughChooser(
        this.page,
        this.locators.mainImageUploadArea,
        this.locators.mainImageFileInputs,
        filePath,
        this.locators.localImageUploadButton,
      );
    } else {
      await selectFileThroughChooser(
        this.page,
        this.locators.mainImageUploadArea,
        this.locators.mainImageFileInputs,
        filePath,
        this.locators.localImageUploadButton,
      );
    }
    const response = await responsePromise;
    if (response && !response.ok()) throw new Error(`标准商品主图上传接口返回 HTTP ${response.status()}。`);
    const responseBody = response ? await response.json().catch(() => null) : null;
    const responseReferences = readImageReferences(responseBody);
    const state = await waitUntil(
      async () => ({
        cardCount: await this.locators.mainImageCards.count(),
        sources: await this.readStandardMainImageSources(),
        loadingIndicatorCount: await this.locators.mainImageLoadingIndicators.count(),
      }),
      (value) => value.loadingIndicatorCount === 0
        && value.cardCount > 0
        && JSON.stringify(value.sources) !== JSON.stringify(beforeSources),
      { timeout: 5_000, interval: 100, message: '标准商品主图上传后未进入预览终态。' },
    ).catch(async () => ({
      cardCount: await this.locators.mainImageCards.count(),
      sources: await this.readStandardMainImageSources(),
      loadingIndicatorCount: await this.locators.mainImageLoadingIndicators.count(),
    }));
    return {
      cardCount: Math.max(state.cardCount, state.sources.length),
      sources: state.sources,
      loadingIndicatorCount: state.loadingIndicatorCount,
      terminalState: state.loadingIndicatorCount > 0
        ? 'loading'
        : state.sources.length > 0
          ? 'preview-ready'
          : 'missing-preview',
      requestObserved: Boolean(response),
      responseStatus: response?.status() ?? null,
      responseReferences,
      responseSummary: response
        ? await this.summarizeStandardMainImageResponse(responseBody)
        : {
            message: '标准商品主图上传未观察到响应',
            dataPresent: false,
            imageReferenceCount: 0,
            visibleDialogTexts: [],
          },
    };
  }

  @step('读取高级设置默认收起状态')
  async readAdvancedSettingsCollapsedEvidence(): Promise<{
    expanded: boolean;
    fieldVisibility: Record<string, boolean>;
  }> {
    const fields = {
      posName: this.locators.posNameInput,
      kitchenName: this.locators.kitchenNameInput,
      mnemonicCode: this.locators.mnemonicCodeInput,
      industryGoods: this.locators.industryGoodsInput,
      itemCode: this.locators.itemCodeInput,
      unit: this.locators.unitInput,
      deviceCode: this.locators.deviceCodeInput,
      minimumOrderQuantity: this.locators.minimumOrderQuantityInput,
    };
    const fieldVisibility = Object.fromEntries(await Promise.all(
      Object.entries(fields).map(async ([name, locator]) => (
        [name, await locator.isVisible().catch(() => false)] as const
      )),
    ));
    return {
      expanded: Object.values(fieldVisibility).some(Boolean),
      fieldVisibility,
    };
  }

  @step('读取标准商品属性添加菜单项')
  async readAttributeAddMenuItems(): Promise<string[]> {
    await this.openAddAttributeMenu();
    const items = await this.page.locator('.ant-dropdown-menu:visible [role="menuitem"]').allInnerTexts();
    await this.closeAddAttributeMenu();
    return items.map((value) => value.trim()).filter(Boolean);
  }

  @step('填写 POS 名称：{posName}')
  async fillPosName(posName: string): Promise<void> {
    await this.locators.posNameInput.fill(posName);
  }

  @step('填写送厨名称：{kitchenName}')
  async fillKitchenName(kitchenName: string): Promise<void> {
    await this.locators.kitchenNameInput.fill(kitchenName);
  }

  @step('读取 POS 名称与送厨名称')
  async readPosAndKitchenNames(): Promise<{ posName: string; kitchenName: string }> {
    await this.ensureAdvancedSettingsExpanded();
    return {
      posName: await this.locators.posNameInput.inputValue(),
      kitchenName: await this.locators.kitchenNameInput.inputValue(),
    };
  }

  @step('填写助记码：{mnemonicCode}')
  async fillMnemonicCode(mnemonicCode: string): Promise<void> {
    await this.locators.mnemonicCodeInput.fill(mnemonicCode);
  }

  @step('填写行业商品：{industryGoods}')
  async fillIndustryGoods(industryGoods: string): Promise<void> {
    await this.locators.industryGoodsInput.fill(industryGoods);
  }

  @step('读取行业商品输入值')
  async readIndustryGoodsValue(): Promise<string> {
    return this.locators.industryGoodsInput.inputValue({ timeout: 5_000 });
  }

  @step('填写商品编码：{itemCode}')
  async fillItemCode(itemCode: string): Promise<void> {
    await this.locators.itemCodeInput.fill(itemCode, { timeout: 10_000 });
  }

  @step('填写单位：{unit}')
  async fillUnit(unit: string): Promise<void> {
    await this.locators.unitInput.fill(unit, { timeout: 10_000 });
  }

  @step('填写设备编码：{deviceCode}')
  async fillDeviceCode(deviceCode: string): Promise<void> {
    await this.locators.deviceCodeInput.fill(deviceCode);
  }

  @step('填写起售数量：{quantity}')
  async fillMinimumOrderQuantity(quantity: string): Promise<void> {
    await this.locators.minimumOrderQuantityInput.fill(quantity, { timeout: 10_000 });
  }

  @step('通过键盘输入起售数量原始值：{quantity}')
  async typeMinimumOrderQuantityRaw(quantity: string): Promise<void> {
    const timeout = 10_000;
    await this.locators.minimumOrderQuantityInput.waitFor({ state: 'visible', timeout });
    await this.locators.minimumOrderQuantityInput.press('ControlOrMeta+A', { timeout });
    await this.locators.minimumOrderQuantityInput.type(quantity, { timeout });
  }

  @step('清空起售数量')
  async clearMinimumOrderQuantity(): Promise<void> {
    await this.locators.minimumOrderQuantityInput.fill('');
  }

  @step('失焦标准价输入框')
  async blurStandardPrice(): Promise<void> {
    await this.locators.standardPriceInput.press('Tab');
  }

  @step('读取标准商品起售数量输入值')
  async readMinimumOrderQuantityValue(timeout = 5_000): Promise<string> {
    return this.locators.minimumOrderQuantityInput.inputValue({ timeout });
  }

  @step('选择单规格')
  async selectSingleSpec(): Promise<void> {
    await this.locators.singleSpecRadio.click();
    await waitUntil(
      () => this.locators.singleSpecRadio.isChecked(),
      (checked) => checked,
      { timeout: 10_000, interval: 100, message: '单规格单选项点击后未进入选中态。' },
    );
  }

  @step('选择多规格')
  async selectMultiSpec(): Promise<void> {
    await this.locators.multiSpecRadio.click();
    await waitUntil(
      () => this.locators.multiSpecRadio.isChecked(),
      (checked) => checked,
      { timeout: 10_000, interval: 100, message: '多规格单选项点击后未进入选中态。' },
    );
    await this.locators.addSpecGroupButton.waitFor({ state: 'visible', timeout: 10_000 });
  }

  @step('启用称重商品')
  async enableWeightBasedItem(): Promise<void> {
    await this.locators.weightBasedYesRadio.click();
  }

  @step('读取称重商品是否选中')
  async isWeightBasedItemSelected(): Promise<boolean> {
    return this.locators.weightBasedYesRadio.isChecked();
  }

  @step('读取称重商品选项禁用状态')
  async readWeightBasedDisabledEvidence(): Promise<{
    disabled: boolean;
    ariaDisabled: string | null;
    checked: boolean;
  }> {
    return {
      disabled: await this.locators.weightBasedYesRadio.isDisabled(),
      ariaDisabled: await this.locators.weightBasedYesRadio.getAttribute('aria-disabled'),
      checked: await this.locators.weightBasedYesRadio.isChecked(),
    };
  }

  @step('读取标准商品字段校验证据：{field}')
  async readFieldValidationEvidence(
    field: 'mnemonicCode' | 'posName' | 'deviceCode' | 'standardPrice',
  ): Promise<{
    value: string;
    maxLengthAttribute: number | null;
    ariaInvalid: string | null;
    errors: string[];
  }> {
    const input = field === 'mnemonicCode'
      ? this.locators.mnemonicCodeInput
      : field === 'posName'
        ? this.locators.posNameInput
        : field === 'deviceCode'
          ? this.locators.deviceCodeInput
          : this.locators.standardPriceInput;
    const maxLength = await input.getAttribute('maxlength');
    const formItem = input.locator('xpath=ancestor::*[contains(@class,"ant-form-item")][1]');
    return {
      value: await input.inputValue(),
      maxLengthAttribute: maxLength === null ? null : Number(maxLength),
      ariaInvalid: await input.getAttribute('aria-invalid'),
      errors: await formItem.locator('.ant-form-item-explain-error:visible').allInnerTexts(),
    };
  }

  @step('读取单位')
  async readUnitValue(timeout = 5_000): Promise<string> {
    const selectedItem = this.locators.unitSelect.locator('.ant-select-selection-item');
    await selectedItem.waitFor({ state: 'visible', timeout });
    return (await selectedItem.innerText()).trim();
  }

  @step('读取称重商品销售单位选项')
  async readWeightUnitOptions(): Promise<string[]> {
    await this.locators.unitSelect.click({ timeout: 10_000 });
    await this.locators.visibleUnitOptions.first().waitFor({ state: 'visible', timeout: 10_000 });
    const options = (await this.locators.visibleUnitOptions.allInnerTexts()).map((value) => value.trim()).filter(Boolean);
    await this.page.keyboard.press('Escape');
    return [...new Set(options)];
  }

  @step('选择称重商品销售单位：{unit}')
  async selectWeightUnit(unit: 'g' | 'kg' | 'ml'): Promise<void> {
    await this.locators.unitSelect.click({ timeout: 10_000 });
    const option = this.locators.visibleUnitOptions.filter({ hasText: new RegExp(`^${unit}$`) });
    await option.waitFor({ state: 'visible', timeout: 10_000 });
    await option.click({ timeout: 10_000 });
  }

  @step('填写包装费：{packagingFee}')
  async fillPackagingFee(packagingFee: string): Promise<void> {
    await this.locators.packagingFeeInput.fill(packagingFee);
  }

  @step('读取标准商品包装费输入值')
  async readPackagingFeeValue(timeout = 5_000): Promise<string> {
    return this.locators.packagingFeeInput.inputValue({ timeout });
  }

  @step('填写成本：{cost}')
  async fillCost(cost: string): Promise<void> {
    await this.locators.costInput.fill(cost);
  }

  @step('读取标准商品成本输入值')
  async readCostValue(timeout = 5_000): Promise<string> {
    return this.locators.costInput.inputValue({ timeout });
  }

  @step('从图片库按名称选择标准商品主图：{imageName}')
  async selectMainImageFromLibraryByName(imageName: string): Promise<{
    imageName: string;
    dialogOpened: boolean;
    candidateCount: number;
    selected: boolean;
    beforeSources: string[];
    afterSources: string[];
    afterCardCount: number;
  }> {
    const beforeSources = await this.readStandardMainImageSources();
    const beforeCardCount = await this.locators.mainImageCards.count();
    await this.locators.mainImageUploadArea.click({ timeout: 5_000 });
    await this.locators.mainImageLibraryButton.waitFor({ state: 'visible', timeout: 5_000 });
    await this.locators.mainImageLibraryButton.click({ timeout: 5_000 });
    const libraryDialog = this.locators.imageLibraryDialog();
    const dialogOpened = await libraryDialog.waitFor({ state: 'visible', timeout: 5_000 }).then(() => true).catch(() => false);
    if (!dialogOpened) {
      return {
        imageName,
        dialogOpened: false,
        candidateCount: 0,
        selected: false,
        beforeSources,
        afterSources: beforeSources,
        afterCardCount: beforeCardCount,
      };
    }
    await this.locators.imageLibrarySearchInput().fill(imageName, { timeout: 5_000 });
    await this.locators.imageLibrarySearchInput().press('Enter', { timeout: 5_000 });
    const namedEntry = this.locators.imageLibraryImage(imageName);
    const candidateCount = await waitUntil(
      () => namedEntry.count(),
      (count) => count === 1,
      { timeout: 10_000, interval: 100, message: `图片库未出现唯一受控图片：${imageName}` },
    ).catch(() => 0);
    if (candidateCount !== 1) {
      await this.page.keyboard.press('Escape');
      return {
        imageName,
        dialogOpened: true,
        candidateCount,
        selected: false,
        beforeSources,
        afterSources: beforeSources,
        afterCardCount: beforeCardCount,
      };
    }
    await namedEntry.click({ timeout: 5_000 });
    await this.locators.imageLibraryConfirmButton().click({ timeout: 5_000 });
    const afterSources = await waitUntil(
      () => this.readStandardMainImageSources(),
      (sources) => sources.length === 1 && JSON.stringify(sources) !== JSON.stringify(beforeSources),
      { timeout: 15_000, interval: 250, message: '图片库按名称选择后主图未形成唯一页面回显。' },
    ).catch(() => this.readStandardMainImageSources());
    const afterCardCount = await this.locators.mainImageCards.count();
    return {
      imageName,
      dialogOpened: true,
      candidateCount,
      selected: afterCardCount === 1 && (
        beforeCardCount !== afterCardCount
        || JSON.stringify(afterSources) !== JSON.stringify(beforeSources)
      ),
      beforeSources,
      afterSources,
      afterCardCount,
    };
  }

  @step('按名称选择材料信息：{optionKind} / {optionName}')
  async selectIngredientInfoByName(
    optionName: string,
    optionKind: 'Ingredient' | 'Allergen' | 'Nutrition' = 'Ingredient',
  ): Promise<{ optionName: string; selected: boolean; optionKind: string }> {
    await this.ensureOtherSettingsExpanded();
    const section = this.locators.otherSection.getByText('Ingredient Info', { exact: true }).locator('../..');
    await section.getByRole('button', { name: /Add$/ }).click({ timeout: 10_000 });
    const menuItemName = optionKind === 'Allergen' ? 'Allergens' : optionKind === 'Nutrition' ? 'Nutritional' : 'Ingredient';
    const menuItem = this.locators.ingredientInfoMenuItem(menuItemName);
    const menuItemCount = await waitUntil(
      () => menuItem.count(),
      (count) => count === 1,
      { timeout: 10_000, interval: 100, message: `材料信息未观察到唯一 ${menuItemName} 入口。` },
    ).catch(() => 0);
    if (menuItemCount !== 1) throw new Error(`材料信息未观察到唯一 ${menuItemName} 入口。`);
    await menuItem.click({ timeout: 10_000 });
    const dialog = this.locators.visibleDialogs.last();
    await dialog.waitFor({ state: 'visible', timeout: 10_000 });
    const search = dialog.getByRole('textbox').first();
    if (await search.isVisible().catch(() => false)) {
      await search.fill(optionName);
      await settleInput();
      await search.press('Enter');
    }
    const rows = dialog.getByRole('row').filter({ hasText: optionName });
    await waitUntil(
      () => rows.count(),
      (count) => count > 0,
      { timeout: 15_000, interval: 100, message: `材料信息弹窗未出现目标选项：${optionKind}/${optionName}` },
    );
    let checkbox: Locator | undefined;
    for (let index = 0; index < await rows.count(); index += 1) {
      const candidate = rows.nth(index).getByRole('checkbox').last();
      if (await candidate.count() === 1 && await candidate.isEnabled().catch(() => false)) {
        checkbox = candidate;
        break;
      }
    }
    if (!checkbox) throw new Error(`材料信息目标选项没有可用复选框：${optionKind}/${optionName}`);
    if (!await checkbox.isChecked()) await checkbox.check({ timeout: 10_000, force: true });
    await dialog.getByRole('button', { name: 'Confirm', exact: true }).click({ timeout: 10_000 });
    await dialog.waitFor({ state: 'hidden', timeout: 10_000 });
    return {
      optionName,
      selected: await this.locators.otherSection.getByText(optionName, { exact: true }).count() > 0,
      optionKind,
    };
  }

  @step('探测规格组去创建入口和跳转终态')
  async probeSpecGroupCreateNavigation(): Promise<{
    addGroupButtonCount: number;
    dialogCount: number;
    createEntryCount: number;
    buttonTexts: string[];
    linkTexts: string[];
    linkHrefs: string[];
    tabStatesBefore: Array<{ text: string; selected: boolean }>;
    tabStatesAfter: Array<{ text: string; selected: boolean }>;
    inputContractsBefore: Array<{ type: string; name: string; placeholder: string; value: string }>;
    inputContractsAfter: Array<{ type: string; name: string; placeholder: string; value: string }>;
    createEntryContractBefore?: SpecGroupCreateEntryContract;
    createEntryContractAfter?: SpecGroupCreateEntryContract;
    listRequestObserved: boolean;
    beforePath: string;
    afterPath: string;
    beforeDialogText: string;
    afterDialogText: string;
    beforePageCount: number;
    afterPageCount: number;
    newPagePath: string;
    newPageTitle: string;
    newPageClosed: boolean;
    navigationObserved: boolean;
    inlineCreateTabObserved: boolean;
  }> {
    const beforePath = new URL(this.page.url()).pathname;
    const beforePageCount = this.page.context().pages().length;
    const addGroupButtonCount = await this.locators.addSpecGroupButton.count();
    if (addGroupButtonCount !== 1) {
      return {
        addGroupButtonCount,
        dialogCount: 0,
        createEntryCount: 0,
        buttonTexts: [],
        linkTexts: [],
        linkHrefs: [],
        tabStatesBefore: [],
        tabStatesAfter: [],
        inputContractsBefore: [],
        inputContractsAfter: [],
        listRequestObserved: false,
        beforePath,
        afterPath: beforePath,
        beforeDialogText: '',
        afterDialogText: '',
        beforePageCount,
        afterPageCount: beforePageCount,
        newPagePath: '',
        newPageTitle: '',
        newPageClosed: false,
        navigationObserved: false,
        inlineCreateTabObserved: false,
      };
    }
    const pagesBeforeClick = [...this.page.context().pages()];
    let listRequestObserved = false;
    const markListRequestObserved = (response: import('@playwright/test').Response) => {
      if (response.request().method() !== 'GET' || !response.ok()) return;
      if (new URL(response.url()).pathname.endsWith('/ops-brand/brand-specs/page')) listRequestObserved = true;
    };
    this.page.on('response', markListRequestObserved);
    await this.locators.addSpecGroupButton.click();
    const dialogVisible = await this.locators.specGroupDialog.isVisible().catch(() => false);
    if (!dialogVisible) {
      this.page.off('response', markListRequestObserved);
      return {
        addGroupButtonCount,
        dialogCount: 0,
        createEntryCount: 0,
        buttonTexts: [],
        linkTexts: [],
        linkHrefs: [],
        tabStatesBefore: [],
        tabStatesAfter: [],
        inputContractsBefore: [],
        inputContractsAfter: [],
        listRequestObserved,
        beforePath,
        afterPath: new URL(this.page.url()).pathname,
        beforeDialogText: '',
        afterDialogText: '',
        beforePageCount,
        afterPageCount: this.page.context().pages().length,
        newPagePath: '',
        newPageTitle: '',
        newPageClosed: false,
        navigationObserved: false,
        inlineCreateTabObserved: false,
      };
    }
    await waitUntil(
      async () => ({
        requestObserved: listRequestObserved,
        loadingCount: await this.locators.selectionLoading('spec').count(),
      }),
      (state) => state.requestObserved && state.loadingCount === 0,
      { timeout: 15_000, interval: 100, message: '规格组列表接口未在点击去创建前完成稳定加载。' },
    ).catch(() => undefined);
    this.page.off('response', markListRequestObserved);
    const buttonTexts = (await this.locators.specGroupDialogButtons.allInnerTexts()).map((value) => value.trim()).filter(Boolean);
    const linkTexts = (await this.locators.specGroupDialogLinks.allInnerTexts()).map((value) => value.trim()).filter(Boolean);
    const linkHrefs = await this.locators.specGroupDialogLinks.evaluateAll((links) => links.map((link) => (
      link instanceof HTMLAnchorElement ? link.getAttribute('href') ?? '' : ''
    )).filter(Boolean));
    const tabStatesBefore = await this.readSpecGroupTabStates();
    const inputContractsBefore = await this.readSpecGroupInputContracts();
    const createEntryCount = await this.locators.specGroupCreateEntry.count();
    const createEntryContractBefore = createEntryCount === 1
      ? await this.readSpecGroupCreateEntryContract()
      : undefined;
    const beforeDialogText = (await this.locators.specGroupDialog.innerText()).trim();
    if (createEntryCount === 1) {
      await this.locators.specGroupCreateEntry.click();
      await waitUntil(
        async () => ({
          path: new URL(this.page.url()).pathname,
          pageCount: this.page.context().pages().length,
          dialogText: await this.locators.specGroupDialog.innerText().catch(() => ''),
          entryContract: await this.readSpecGroupCreateEntryContract().catch(() => undefined),
          inputContracts: await this.readSpecGroupInputContracts(),
        }),
        (state) => state.path !== beforePath
          || state.pageCount !== beforePageCount
          || state.dialogText.trim() !== beforeDialogText
          || JSON.stringify(state.entryContract) !== JSON.stringify(createEntryContractBefore)
          || JSON.stringify(state.inputContracts) !== JSON.stringify(inputContractsBefore),
        { timeout: 10_000, interval: 100, message: '规格组去创建入口点击后未观察到页面或弹窗终态变化。' },
      ).catch(() => undefined);
    }
    const afterPath = new URL(this.page.url()).pathname;
    const afterPageCount = this.page.context().pages().length;
    const newPage = this.page.context().pages().find((candidate) => !pagesBeforeClick.includes(candidate));
    let newPagePath = '';
    let newPageTitle = '';
    let newPageClosed = false;
    if (newPage) {
      const newPageUrl = await waitUntil(
        () => newPage.url(),
        (url) => Boolean(url && url !== 'about:blank'),
        { timeout: 10_000, interval: 100, message: '规格组去创建新窗口未形成有效 URL。' },
      ).catch(() => '');
      if (newPageUrl) {
        await newPage.waitForLoadState('domcontentloaded', { timeout: 5_000 }).catch(() => undefined);
        newPagePath = new URL(newPageUrl).pathname;
      }
      newPageTitle = await newPage.title().catch(() => '');
      if (!newPage.isClosed()) await newPage.close();
      newPageClosed = true;
    }
    const afterDialogText = (await this.locators.specGroupDialog.innerText().catch(() => '')).trim();
    const tabStatesAfter = await this.readSpecGroupTabStates();
    const inputContractsAfter = await this.readSpecGroupInputContracts();
    const createEntryContractAfter = createEntryCount === 1
      ? await this.readSpecGroupCreateEntryContract().catch(() => undefined)
      : undefined;
    const navigationObserved = createEntryCount === 1 && (
      afterPath !== beforePath || newPagePath.length > 0
    );
    return {
      addGroupButtonCount,
      dialogCount: 1,
      createEntryCount,
      buttonTexts,
      linkTexts,
      linkHrefs,
      tabStatesBefore,
      tabStatesAfter,
      inputContractsBefore,
      inputContractsAfter,
      createEntryContractBefore,
      createEntryContractAfter,
      listRequestObserved,
      beforePath,
      afterPath,
      beforeDialogText,
      afterDialogText,
      beforePageCount,
      afterPageCount,
      newPagePath,
      newPageTitle,
      newPageClosed,
      navigationObserved,
      inlineCreateTabObserved: !navigationObserved && createEntryCount === 1 && (
        JSON.stringify(createEntryContractAfter) !== JSON.stringify(createEntryContractBefore)
        || JSON.stringify(inputContractsAfter) !== JSON.stringify(inputContractsBefore)
        || afterDialogText !== beforeDialogText
      ),
    };
  }

  private async readSpecGroupCreateEntryContract(): Promise<SpecGroupCreateEntryContract> {
    return this.locators.specGroupCreateEntry.evaluate((element) => ({
      tagName: element.tagName.toLowerCase(),
      role: element.getAttribute('role') ?? '',
      className: element.getAttribute('class') ?? '',
      parentTagName: element.parentElement?.tagName.toLowerCase() ?? '',
      parentRole: element.parentElement?.getAttribute('role') ?? '',
      parentClassName: element.parentElement?.getAttribute('class') ?? '',
    }));
  }

  private async readSpecGroupTabStates(): Promise<Array<{ text: string; selected: boolean }>> {
    return this.locators.specGroupDialogTabs.evaluateAll((tabs) => tabs.map((tab) => ({
      text: tab.textContent?.trim() ?? '',
      selected: tab.getAttribute('aria-selected') === 'true',
    })));
  }

  private async readSpecGroupInputContracts(): Promise<Array<{
    type: string;
    name: string;
    placeholder: string;
    value: string;
  }>> {
    return this.locators.specGroupDialogInputs.evaluateAll((inputs) => inputs.map((input) => {
      const element = input as HTMLInputElement;
      return {
        type: element.type,
        name: element.name,
        placeholder: element.placeholder,
        value: element.value,
      };
    }));
  }

  @step('添加首个规格组')
  async addFirstSpecGroup(): Promise<void> {
    await this.locators.addSpecGroupButton.click();
    await this.locators.specGroupDialog.waitFor({ state: 'visible', timeout: 10_000 });
    await this.locators.firstSpecGroupRowRadio().click();
    await this.locators.specGroupConfirmButton.click();
    await this.locators.specGroupDialog.waitFor({ state: 'hidden', timeout: 10_000 });
  }

  @step('按名称选择规格组：{groupName}')
  async selectSpecGroupByName(groupName: string): Promise<void> {
    await this.selectRuleGroup('spec', groupName, '/ops-brand/brand-specs/page');
  }

  @step('填写全部多规格价格：{price}')
  async fillAllMultiSpecPrices(price: string): Promise<void> {
    await waitUntil(
      () => this.locators.multiSpecPriceInputs.count(),
      (count) => count > 0,
      { timeout: 10_000, message: '多规格价格输入框未出现。' },
    );
    const count = await this.locators.multiSpecPriceInputs.count();
    for (let index = 0; index < count; index += 1) {
      await this.locators.multiSpecPriceInputs.nth(index).fill(price);
    }
  }

  @step('点击属性排序规则选择')
  async clickSortRuleSelect(): Promise<void> {
    await this.locators.sortRuleSelectButton.click();
  }

  @step('等待属性排序规则对话框可见')
  async expectSortRuleDialogVisible(): Promise<void> {
    await this.locators.sortRuleDialogTitle().waitFor({ state: 'visible', timeout: 10_000 });
  }

  @step('关闭属性排序规则对话框')
  async closeSortRuleDialog(): Promise<void> {
    await this.locators.sortRuleDialogCloseButton().click();
    await this.locators.sortRuleDialogTitle().waitFor({ state: 'hidden', timeout: 10_000 });
  }

  @step('打开商品属性添加菜单')
  async openAddAttributeMenu(): Promise<void> {
    await this.locators.addAttributeMenuButton.click();
  }

  @step('点击添加口味属性')
  async clickAddAttributeFlavor(): Promise<void> {
    await this.locators.addAttributeFlavorMenuItem.click();
  }

  @step('点击添加做法属性')
  async clickAddAttributeRecipe(): Promise<void> {
    await this.locators.addAttributeRecipeMenuItem.click();
  }

  @step('点击添加加料属性')
  async clickAddAttributeAdditives(): Promise<void> {
    await this.locators.addAttributeAdditivesMenuItem.click();
  }

  @step('读取多规格展示顺序')
  async readMultiSpecOrder(optionNames: readonly string[] = []): Promise<string[]> {
    const attributeTab = this.page.getByText('Attribute', { exact: true });
    if (await attributeTab.count() === 1 && await attributeTab.isVisible().catch(() => false)) {
      await attributeTab.click();
    }
    await this.locators.multiSpecRows.first().waitFor({ state: 'visible', timeout: 10_000 });
    const order: string[] = [];
    const rowCount = await this.locators.multiSpecRows.count();
    for (let index = 0; index < rowCount; index += 1) {
      const row = this.locators.multiSpecRows.nth(index);
      const rowText = (await row.innerText()).trim();
      const optionName = optionNames.length > 0
        ? [...optionNames]
          .sort((left, right) => right.length - left.length)
          .find((candidate) => rowText.includes(candidate))
        : (await row.locator('td').nth(1).innerText()).trim().split(/\r?\n/)[0].trim();
      if (optionName) order.push(optionName);
    }
    return order;
  }

  @step('读取已选规格组能力：{groupName}')
  async readSelectedSpecGroupEvidence(groupName: string): Promise<{
    route: string;
    selectedGroupCount: number;
    priceSectionText: string;
  }> {
    const selectedGroup = this.locators.priceSection.getByText(groupName, { exact: true });
    return {
      route: new URL(this.page.url()).pathname,
      selectedGroupCount: await selectedGroup.count(),
      priceSectionText: (await this.locators.priceSection.innerText()).trim(),
    };
  }

  @step('移除商品已选规格组：{groupName}')
  async removeSelectedSpecGroup(groupName: string): Promise<void> {
    const groupNameLabel = this.locators.priceSection.getByText(groupName, { exact: true });
    if (await groupNameLabel.count() !== 1) throw new Error(`规格组名称不唯一：${groupName}`);
    await groupNameLabel.waitFor({ state: 'visible', timeout: 10_000 });
    const remove = this.locators.priceSection.getByRole('button', { name: /delete/i });
    if (await remove.count() !== 1) throw new Error(`规格组删除按钮不唯一：${groupName}`);
    await remove.click();
    const dialog = this.page.locator('[role=dialog]:visible');
    if (await dialog.count() === 1) {
      const confirm = dialog.getByRole('button', { name: /^(Confirm|OK|确定|确认)$/i });
      if (await confirm.count() !== 1) throw new Error(`规格组删除确认按钮不唯一：${groupName}`);
      await confirm.click();
      await dialog.waitFor({ state: 'hidden', timeout: 10_000 });
    }
    await groupNameLabel.waitFor({ state: 'detached', timeout: 10_000 });
  }

  @step('拖动规格 {sourceOption} 到 {targetOption} 前')
  async moveMultiSpecOption(sourceOption: string, targetOption: string): Promise<void> {
    const source = this.locators.multiSpecRow(sourceOption);
    const target = this.locators.multiSpecRow(targetOption);
    await source.waitFor({ state: 'visible', timeout: 10_000 });
    await target.waitFor({ state: 'visible', timeout: 10_000 });
    const sourceHandle = source.getByRole('button', { name: 'holder', exact: true });
    const targetHandle = target.getByRole('button', { name: 'holder', exact: true });
    if (await sourceHandle.count() === 1 && await targetHandle.count() === 1) {
      await sourceHandle.dragTo(targetHandle, { timeout: 10_000 });
      return;
    }
    const sourceBox = await source.boundingBox();
    const targetBox = await target.boundingBox();
    if (!sourceBox || !targetBox) throw new Error('多规格拖动目标缺少可见坐标');
    await this.page.mouse.move(sourceBox.x + 20, sourceBox.y + sourceBox.height / 2);
    await this.page.mouse.down();
    await this.page.mouse.move(targetBox.x + 20, targetBox.y + targetBox.height / 2, { steps: 12 });
    await this.page.mouse.up();
  }

  @step('填写规格 {optionName} 的价格：{price}')
  async fillMultiSpecPriceByOption(optionName: string, price: string): Promise<void> {
    const row = this.locators.multiSpecRow(optionName);
    await row.waitFor({ state: 'visible', timeout: 10_000 });
    await row.getByRole('spinbutton', { name: itemCreateStandardFormDom.multiSpecPriceSpinbutton })
      .fill(price, { timeout: 10_000 });
  }

  @step('选择默认规格：{optionName}')
  async selectDefaultSpecByOption(optionName: string): Promise<void> {
    const row = this.locators.multiSpecRow(optionName);
    await row.waitFor({ state: 'visible', timeout: 10_000 });
    await row.getByRole('switch').click({ timeout: 10_000 });
  }

  @step('选择当前第一条规格为默认规格')
  async selectFirstMultiSpecAsDefault(): Promise<void> {
    const firstRow = this.locators.multiSpecRows.first();
    await firstRow.waitFor({ state: 'visible', timeout: 10_000 });
    const defaultSwitch = firstRow.getByRole('switch');
    await defaultSwitch.waitFor({ state: 'visible', timeout: 10_000 });
    if (await defaultSwitch.getAttribute('aria-checked') !== 'true') {
      await defaultSwitch.click({ timeout: 10_000 });
    }
  }

  @step('读取已选默认规格数量')
  async readSelectedDefaultSpecCount(): Promise<number> {
    return this.locators.multiSpecRows.getByRole('switch', { checked: true }).count();
  }

  @step('按名称选择口味组：{groupName}')
  async selectFlavorGroupByName(groupName: string): Promise<void> {
    await this.selectRuleGroup('flavor', groupName, '/ops-brand/brand-modifiers/page');
  }

  @step('按名称选择做法组：{groupName}')
  async selectRecipeGroupByName(groupName: string): Promise<void> {
    await this.selectRuleGroup('recipe', groupName, '/ops-brand/brand-modifiers/page');
  }

  @step('按名称选择加料组：{groupName}')
  async selectAdditivesGroupByName(groupName: string): Promise<void> {
    await this.selectRuleGroup('additives', groupName, '/ops-brand/brand-addon-group/list');
  }

  @step('读取附加价确认弹窗是否可见', { executableOperation: false })
  async isAdditionalPriceWarningVisible(): Promise<boolean> {
    return this.locators.additionalPriceWarningDialog.isVisible().catch(() => false);
  }

  @step('等待附加价为空或零确认弹窗', { executableOperation: false })
  async waitForAdditionalPriceWarning(timeout: number): Promise<boolean> {
    return this.locators.additionalPriceWarningDialog
      .waitFor({ state: 'visible', timeout })
      .then(() => true)
      .catch(() => false);
  }

  @step('确认附加价为空或零仍提交')
  async confirmAdditionalPriceWarning(): Promise<void> {
    await this.locators.additionalPriceWarningDialog.waitFor({ state: 'visible', timeout: 10_000 });
    await this.locators.additionalPriceConfirmButton.click();
    await this.locators.additionalPriceWarningDialog.waitFor({ state: 'hidden', timeout: 10_000 });
  }

  @step('确认商品创建页选择器不存在规则组：{groupName}')
  async expectRuleGroupAbsent(
    kind: 'spec' | 'flavor' | 'recipe' | 'additives',
    groupName: string,
  ): Promise<void> {
    if (kind === 'spec') {
      await this.selectMultiSpec();
      await this.locators.addSpecGroupButton.click();
    } else {
      await this.openAddAttributeMenu();
      if (kind === 'flavor') await this.clickAddAttributeFlavor();
      if (kind === 'recipe') await this.clickAddAttributeRecipe();
      if (kind === 'additives') await this.clickAddAttributeAdditives();
    }
    const dialog = this.locators.selectionDialog(kind);
    await dialog.waitFor({ state: 'visible', timeout: 10_000 });
    const searchInput = this.locators.selectionSearchInput(kind);
    await searchInput.fill(groupName);
    const triggeredAt = Date.now();
    await waitUntil(
      async () => ({
        elapsed: Date.now() - triggeredAt,
        query: await searchInput.inputValue(),
        loading: await this.locators.selectionLoading(kind).count(),
        targetCount: await this.locators.selectionTarget(kind, groupName).count(),
      }),
      (state) => state.elapsed >= 500
        && state.query === groupName
        && state.loading === 0
        && state.targetCount === 0,
      { timeout: 15_000, message: `规则组选择器仍包含 ${groupName}。` },
    );
    await this.page.keyboard.press('Escape');
    await dialog.waitFor({ state: 'hidden', timeout: 10_000 });
  }

  @step('选择打印档口：{stallName}')
  async selectPrintStallByName(stallName: string): Promise<void> {
    await this.locators.printStallSearchInput.fill(stallName);
    const checkbox = this.locators.printStallCheckbox(stallName);
    await checkbox.waitFor({ state: 'visible', timeout: 15_000 });
    await checkbox.setChecked(true);
  }

  @step('读取已选择打印档口数量')
  async readSelectedPrintStallCount(): Promise<number> {
    const text = await this.locators.selectedStallsText.innerText();
    return Number(text.match(/\d+/)?.[0] ?? -1);
  }

  @step('确认打印档口选择区不存在：{stallName}')
  async expectPrintStallAbsent(stallName: string): Promise<void> {
    await this.locators.printStallSearchInput.fill(stallName);
    await waitUntil(
      () => this.locators.printStallCheckbox(stallName).count(),
      (count) => count === 0,
      { timeout: 15_000, message: `打印档口选择区仍包含 ${stallName}。` },
    );
  }

  @step('读取标准价必填校验')
  async readStandardPriceValidation(): Promise<{
    errorCount: number;
    errorText: string;
    ariaInvalid: string | null;
    value: string;
    required: boolean;
    valueMissing: boolean;
    validationMessage: string;
  }> {
    const nativeState = await this.locators.standardPriceInput.evaluate((element: HTMLInputElement) => ({
      value: element.value,
      required: element.required,
      valueMissing: element.validity.valueMissing,
      validationMessage: element.validationMessage,
    }));
    return {
      errorCount: await this.locators.standardPriceError.count(),
      errorText: (await this.locators.standardPriceError.allInnerTexts()).join(' '),
      ariaInvalid: await this.locators.standardPriceInput.getAttribute('aria-invalid'),
      ...nativeState,
    };
  }

  @step('读取当前可见价格输入值')
  async readVisiblePriceValues(): Promise<string[]> {
    // Scope to the price section; page-level queries matched unrelated controls.
    return this.locators.multiSpecPriceInputs.evaluateAll((inputs: HTMLInputElement[]) => (
      inputs.filter((input) => input.getClientRects().length > 0).map((input) => input.value)
    ));
  }

  @step('读取商品属性区配置状态')
  async readAttributeConfigurationEvidence(): Promise<{
    text: string;
    inputs: Array<{
      type: string;
      value: string;
      checked: boolean;
      required: boolean;
      disabled: boolean;
      ariaLabel: string | null;
      ariaInvalid: string | null;
    }>;
  }> {
    return {
      text: (await this.locators.attributeSection.innerText()).trim(),
      inputs: await this.locators.attributeInputs.evaluateAll((inputs: HTMLInputElement[]) => inputs.map((input) => ({
        type: input.type,
        value: input.value,
        checked: input.checked,
        required: input.required,
        disabled: input.disabled,
        ariaLabel: input.getAttribute('aria-label'),
        ariaInvalid: input.getAttribute('aria-invalid'),
      }))),
    };
  }

  @step('展开属性互斥规则')
  async expandMutuallyExclusiveRules(): Promise<void> {
    await this.locators.mutuallyExclusiveExpandButton.click();
  }

  @step('点击属性互斥规则添加')
  async clickMutuallyExclusiveRulesAdd(): Promise<void> {
    await this.locators.mutuallyExclusiveRulesAddButton.waitFor({ state: 'visible', timeout: 10_000 });
    await this.locators.mutuallyExclusiveRulesAddButton.click();
  }

  @step('读取新增属性互斥规则内联结构')
  async readMutuallyExclusiveInlineEvidence(): Promise<{
    ruleTitles: string[];
    editButtonCount: number;
    text: string;
  }> {
    await this.locators.mutuallyExclusiveRuleTitles.first().waitFor({ state: 'visible', timeout: 10_000 });
    return {
      ruleTitles: (await this.locators.mutuallyExclusiveRuleTitles.allInnerTexts()).map((value) => value.trim()),
      editButtonCount: await this.locators.mutuallyExclusiveRuleEditButtons.count(),
      text: (await this.locators.mutuallyExclusiveRulesContainer.innerText()).trim(),
    };
  }

  @step('打开属性互斥规则第 {index} 个组编辑器')
  async openMutuallyExclusiveGroupEditor(index: number): Promise<void> {
    await this.locators.mutuallyExclusiveRuleEditButtons.nth(index).click();
    await this.locators.visibleDialog.waitFor({ state: 'visible', timeout: 10_000 });
  }

  @step('配置属性互斥规则第 {index} 侧选项：{optionName}')
  async configureMutuallyExclusiveSide(index: number, optionName: string): Promise<void> {
    await this.openMutuallyExclusiveGroupEditor(index);
    const option = this.locators.visibleDialog.getByRole('checkbox', { name: optionName, exact: true });
    await option.waitFor({ state: 'visible', timeout: 10_000 });
    await option.check();
    await this.locators.visibleDialog.getByRole('button', { name: 'Confirm', exact: true }).click();
    await this.locators.visibleDialog.waitFor({ state: 'hidden', timeout: 10_000 });
  }

  @step('读取属性互斥规则弹窗结构证据')
  async readMutuallyExclusiveDialogEvidence(): Promise<{
    dialogCount: number;
    text: string;
    headings: string[];
    buttons: string[];
    labels: string[];
    inputs: Array<{ type: string; id: string; name: string; placeholder: string }>;
    comboboxCount: number;
    checkboxCount: number;
    radioCount: number;
  }> {
    await this.locators.visibleDialog.waitFor({ state: 'visible', timeout: 10_000 });
    return {
      dialogCount: await this.locators.visibleDialog.count(),
      text: (await this.locators.visibleDialog.innerText()).trim(),
      headings: (await this.locators.visibleDialog.getByRole('heading').allInnerTexts()).map((value) => value.trim()),
      buttons: (await this.locators.visibleDialog.getByRole('button').allInnerTexts()).map((value) => value.trim()),
      labels: (await this.locators.visibleDialog.locator('label').allInnerTexts()).map((value) => value.trim()),
      inputs: await this.locators.visibleDialog.locator('input').evaluateAll((inputs: HTMLInputElement[]) => (
        inputs.map((input) => ({
          type: input.type,
          id: input.id,
          name: input.name,
          placeholder: input.placeholder,
        }))
      )),
      comboboxCount: await this.locators.visibleDialog.getByRole('combobox').count(),
      checkboxCount: await this.locators.visibleDialog.getByRole('checkbox').count(),
      radioCount: await this.locators.visibleDialog.getByRole('radio').count(),
    };
  }

  @step('关闭属性互斥规则弹窗')
  async closeMutuallyExclusiveDialog(): Promise<void> {
    const closeButton = this.locators.visibleDialog.getByRole('button', { name: 'close', exact: true });
    if (await closeButton.count() === 1) await closeButton.click();
    else await this.page.keyboard.press('Escape');
    await this.locators.visibleDialog.waitFor({ state: 'hidden', timeout: 10_000 });
  }

  @step('展开其他设置')
  async expandOtherSettings(): Promise<void> {
    await this.locators.otherSettingsExpandButton.click();
  }

  @step('等待其他设置区块可见')
  async expectOtherSettingsHeadingVisible(): Promise<void> {
    await this.locators.otherSettingsHeading.waitFor({ state: 'visible', timeout: 10_000 });
  }

  @step('等待详情图片上传入口可见')
  async expectDetailImageUploadVisible(): Promise<void> {
    await this.locators.detailImageUploadButton.waitFor({ state: 'visible', timeout: 10_000 });
  }

  @step('点击描述标签添加')
  async clickDescriptionLabelsAdd(): Promise<void> {
    await this.locators.descriptionLabelsAddButton.click();
  }

  @step('点击商品角标添加')
  async clickBadgesAdd(): Promise<void> {
    await this.locators.badgesAddButton.click();
  }

  @step('点击统计标签添加')
  async clickStatsAdd(): Promise<void> {
    await this.locators.statsAddButton.click();
  }

  @step('点击材料信息添加')
  async clickIngredientInfoAdd(): Promise<void> {
    await this.locators.ingredientInfoAddButton.click();
  }

  @step('等待高级设置字段可见')
  async expectAdvancedSettingsFieldsVisible(): Promise<void> {
    await this.locators.posNameInput.waitFor({ state: 'visible', timeout: 10_000 });
    await this.locators.kitchenNameInput.waitFor({ state: 'visible', timeout: 10_000 });
    await this.locators.mnemonicCodeInput.waitFor({ state: 'visible', timeout: 10_000 });
    await this.locators.industryGoodsInput.waitFor({ state: 'visible', timeout: 10_000 });
    await this.locators.itemCodeInput.waitFor({ state: 'visible', timeout: 10_000 });
    await this.locators.unitInput.waitFor({ state: 'visible', timeout: 10_000 });
    await this.locators.deviceCodeInput.waitFor({ state: 'visible', timeout: 10_000 });
    await this.locators.minimumOrderQuantityInput.waitFor({ state: 'visible', timeout: 10_000 });
  }

  @step('等待属性排序规则区域可见')
  async expectSortRulesSectionVisible(): Promise<void> {
    await this.locators.sortRulesHeading.waitFor({ state: 'visible', timeout: 10_000 });
    await this.locators.sortRuleSelectButton.waitFor({ state: 'visible', timeout: 10_000 });
  }

  @step('等待属性添加菜单项可见')
  async expectAddAttributeMenuItemsVisible(): Promise<void> {
    await this.locators.addAttributeFlavorMenuItem.waitFor({ state: 'visible', timeout: 10_000 });
    await this.locators.addAttributeRecipeMenuItem.waitFor({ state: 'visible', timeout: 10_000 });
    await this.locators.addAttributeAdditivesMenuItem.waitFor({ state: 'visible', timeout: 10_000 });
  }

  @step('等待属性互斥规则添加按钮可见')
  async expectMutuallyExclusiveRulesAddVisible(): Promise<void> {
    await this.locators.mutuallyExclusiveRulesAddButton.waitFor({ state: 'visible', timeout: 10_000 });
  }

  @step('等待其他设置子项添加按钮可见')
  async expectOtherSettingsAddButtonsVisible(): Promise<void> {
    await this.locators.descriptionLabelsAddButton.waitFor({ state: 'visible', timeout: 10_000 });
    await this.locators.badgesAddButton.waitFor({ state: 'visible', timeout: 10_000 });
    await this.locators.statsAddButton.waitFor({ state: 'visible', timeout: 10_000 });
    await this.locators.ingredientInfoAddButton.waitFor({ state: 'visible', timeout: 10_000 });
  }

  private async requireUniqueCategoryNode(name: string, mustHaveChildren: boolean) {
    const node = this.locators.categoryNode(name);
    const count = await waitUntil(
      () => node.count(),
      (value) => value === 1,
      { timeout: 10_000, interval: 100, message: `分类节点未加载：${name}` },
    );
    const exactTextCount = count === 1 ? await node.getByText(name, { exact: true }).count() : 0;
    const observedText = count === 1 ? await node.innerText() : '';
    if (count !== 1 || exactTextCount !== 1 && !matchesStandardCategoryNodeIdentity(observedText, name)) {
      throw new Error(`分类节点未按业务身份唯一显示：${name};count=${count}`);
    }
    const childIndicatorCount = await node.getByRole('img', { name: 'right' }).count();
    if ((mustHaveChildren && childIndicatorCount !== 1)
      || (!mustHaveChildren && childIndicatorCount !== 0)) {
      throw new Error(`分类节点层级与预期不一致：${name};childIndicator=${childIndicatorCount}`);
    }
    return node;
  }

  private async selectRuleGroup(
    kind: 'spec' | 'flavor' | 'recipe' | 'additives',
    groupName: string,
    responsePath: string,
  ): Promise<void> {
    let listRequestCompleted = false;
    const markListRequestCompleted = (response: import('@playwright/test').Response) => {
      if (response.request().method() !== 'GET' || !response.ok()) return;
      listRequestCompleted = new URL(response.url()).pathname.endsWith(responsePath);
    };
    this.page.on('response', markListRequestCompleted);
    try {
      if (kind === 'spec') await this.locators.addSpecGroupButton.click();
      else {
        await this.openAddAttributeMenu();
        if (kind === 'flavor') await this.clickAddAttributeFlavor();
        if (kind === 'recipe') await this.clickAddAttributeRecipe();
        if (kind === 'additives') await this.clickAddAttributeAdditives();
      }
      const dialog = this.locators.selectionDialog(kind);
      await dialog.waitFor({ state: 'visible', timeout: 10_000 });
      const searchInput = this.locators.selectionSearchInput(kind);
      await searchInput.fill(groupName);
      await settleInput();
      await searchInput.press('Enter');
      await selectUniqueAsyncTableTarget({
        dialog,
        loading: this.locators.selectionLoading(kind),
        rows: this.locators.selectionRows(kind),
        target: this.locators.selectionTarget(kind, groupName),
        requestCompleted: () => listRequestCompleted,
        timeout: 15_000,
      });
      await this.locators.selectionConfirmButton(kind).click();
      await dialog.waitFor({ state: 'hidden', timeout: 10_000 });
      if (kind !== 'spec') {
        await this.locators.selectedAttributeGroup(groupName).waitFor({ state: 'visible', timeout: 10_000 });
      }
    } finally {
      this.page.off('response', markListRequestCompleted);
    }
  }

  private readStandardMainImageSources(): Promise<string[]> {
    return this.locators.mainImagePreviews.evaluateAll((elements) => elements.map((element) => (
      element instanceof HTMLImageElement
        ? element.currentSrc || element.src
        : (element as HTMLElement).style.backgroundImage
    )).filter(Boolean));
  }

  private waitForStandardMainImageUploadResponse(timeout: number): Promise<Response> {
    return this.page.waitForResponse((response) => (
      response.request().method() === 'POST'
      && new URL(response.url()).pathname.endsWith('/item/v1/ops-brand/brand-image-files')
    ), { timeout });
  }

  private async summarizeStandardMainImageResponse(body: unknown): Promise<StandardMainImageUploadEvidence['responseSummary']> {
    const record = body && typeof body === 'object' ? body as Record<string, unknown> : {};
    const dataPreview = record.data === undefined ? undefined : JSON.stringify(record.data).slice(0, 1_000);
    return {
      message: typeof record.message === 'string' ? record.message.slice(0, 300) : undefined,
      dataPresent: record.data !== undefined && record.data !== null,
      imageReferenceCount: containsImageReference(record.data) ? 1 : 0,
      dataPreview,
      visibleDialogTexts: (await this.locators.visibleDialogs.allInnerTexts())
        .map((text) => text.trim().slice(0, 500))
        .filter(Boolean),
    };
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

export function createItemCreateStandardPage(page: Page): ItemCreateStandardPage {
  return new ItemCreateStandardPage(page);
}

function matchesStandardCategoryNodeIdentity(observed: string, expected: string): boolean {
  return matchesCategoryNodeIdentity(observed, expected)
    || matchesCategoryNodeIdentity(observed, `${expected}(${expected}_SECOND)`);
}

function containsImageReference(value: unknown): boolean {
  if (typeof value === 'string') return /https?:|cdn|image|\.(?:png|jpe?g|webp)(?:\?|$)/i.test(value);
  if (Array.isArray(value)) return value.some(containsImageReference);
  if (!value || typeof value !== 'object') return false;
  return Object.entries(value as Record<string, unknown>).some(([key, child]) => (
    /image|path|url/i.test(key) && typeof child === 'string' && child.length > 0
  ) || containsImageReference(child));
}

function countNamedResponseRecords(value: unknown, name: string): number {
  if (Array.isArray(value)) return value.reduce((count, entry) => count + countNamedResponseRecords(entry, name), 0);
  if (!value || typeof value !== 'object') return 0;
  const record = value as Record<string, unknown>;
  const current = record.name === name && (typeof record.id === 'number' || typeof record.id === 'string') ? 1 : 0;
  return current + Object.values(record).reduce<number>(
    (count, entry) => count + countNamedResponseRecords(entry, name),
    0,
  );
}
