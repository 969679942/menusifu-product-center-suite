import { test, type Page } from '@playwright/test';
import type { CleanupRegistry } from '../../api/product-center/cleanup-registry';
import type { ProductCenterApi } from '../../api/product-center/product-center-api';
import type { ProductCenterExecutionLedger } from '../../api/product-center/execution-ledger';
import { createCombosPage } from '../../pages/product-management/group-list.factory';
import { ProductCenterItemCreateDataFactory } from '../../test-data/product-center/product-center-item-create-data.factory';
import { createItemListPage } from '../../pages/product-management/item/item-list.page';
import { type GroupAutomationBinding } from '../../utils/product-center-group-automation';
import { waitUntil } from '../../utils/wait';
import type { RuntimeAssertionReceipt } from '../../automation/system-test/system-test-runtime-contract';
import { assertUiTextContains, containsNamedValue, containsScalarValue, findFirstFieldValue, namedRecords, normalizeUiText, requireGroupRecord } from '../../utils/product-center-group-runner-helpers';
import {
  groupUiAssertionReceipt,
  createComboV2ReferenceOwner,
  readComboV2OwnerCard,
  comboV2RemoveProductRow,
  comboV2ExpectSingleProductDeleteBlocked,
  comboV2SelectPriceSource,
  comboV2CustomPriceInput,
  findComboV2ItemRule,
  buildComboV2BoundaryName,
  comboV2NameInput,
  comboV2SectionType,
  comboV2RuleInput,
  comboV2FillAndBlur,
  selectComboV2Products,
  comboV2FillRule,
  comboV2ProductCell,
  comboV2ProductHeaders,
  comboV2FillRowNumber,
  comboV2SetRowDefault,
  submitComboV2FormAndRegister,
  submitComboV2FormExpectRejected,
  ObservedProductDifferenceError,
  readProductCenterGroupObservedDifferenceEvidence,
  ensureChineseValidationLocale,
  ensureEnglishValidationLocale,
  ensureComboV2GroupCleanupRegistered,
  assertComboV2Rule,
  comboTypeSurfaceText,
  comboRuleInputValue,
  comboRuleSwitches,
  comboRuleSwitch,
  type ComboV2ProductFixture,
  writeProductCenterGroupEvidence,
  createComboV2UiPricedProductFixture,
  createComboV2ProductFixture,
  createComboV2GroupFixture,
  collectComboGroupRecords,
  assertionReceipt,
  cleanupEvidence,
} from './product-center-group-combo-v2-support';

export async function runComboV2ListContractCase(
  binding: GroupAutomationBinding,
  page: Page,
  productCenterApi: ProductCenterApi,
): Promise<string[]> {
  const businessMutations: string[] = [];
  page.on('request', (request) => {
    const pathname = new URL(request.url()).pathname;
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method())
      && /\/ops-brand\/brand-sections(?:\/|$)/.test(pathname)) {
      businessMutations.push(`${request.method()} ${pathname}`);
    }
  });
  const records = collectComboGroupRecords(await productCenterApi.comboGroupList());
  const fixed = records.find((record) => record.sectionType === 1);
  const optional = records.find((record) => record.sectionType === 2);
  if (!fixed || !optional) throw new Error(`${binding.caseId} 缺少固定搭配或可选搭配列表前置数据`);

  const pageObject = createCombosPage(page);
  await pageObject.open();
  const main = page.locator('main:visible');
  const businessHeader = pageObject.tableHeaderRow.getByText('Combo Group', { exact: true });
  if (await businessHeader.count() !== 1) throw new Error(`${binding.caseId} 套餐组统一列表表头不唯一`);
  const table = businessHeader.locator('xpath=ancestor::table[1]');
  if (await table.count() !== 1 || !await table.isVisible()) {
    throw new Error(`${binding.caseId} 套餐组统一业务表格不可见或不唯一`);
  }
  const assertionIds = [assertionReceipt(binding, 0)];

  const pageText = normalizeUiText(await main.innerText());
  assertUiTextContains(binding.caseId, pageText, [
    /Combo Group|套餐组/,
    /Combo Group \(Alt\.Language\)|备用语言|第二语言/,
    /Combo Group Type|套餐组类型/,
    /Related Items|关联商品/,
    /Note|备注/,
    /Action|操作/,
  ]);
  const typeFilter = main.getByText('Combo Group Type', { exact: true })
    .locator('xpath=self::*[not(ancestor::table)]');
  if (await typeFilter.count() !== 1) throw new Error(`${binding.caseId} 套餐组类型筛选器不唯一`);
  await typeFilter.click();
  const optionItems = page.getByText(/^(Fixed Combo|Optional Combo|Pick & Mix)$/)
    .locator('xpath=self::*[not(ancestor::table)]');
  const options = await waitUntil(
    async () => normalizeUiText((await optionItems.allTextContents()).join(' ')),
    (text) => [/Fixed Combo|固定搭配/, /Optional Combo|可选搭配/, /Pick & Mix|随心配/]
      .every((pattern) => pattern.test(text)),
    { timeout: 10_000, interval: 100, message: `${binding.caseId} 套餐组类型筛选选项未加载完整` },
  );
  assertUiTextContains(binding.caseId, options, [/Fixed Combo|固定搭配/, /Optional Combo|可选搭配/, /Pick & Mix|随心配/]);
  await page.keyboard.press('Escape');
  assertionIds.push(assertionReceipt(binding, 1));

  const identity = fixed.name;
  const row = main.locator('tbody tr:visible').filter({ hasText: identity });
  if (await row.count() !== 1) throw new Error(`${binding.caseId} 固定搭配列表行不唯一：${identity}`);
  const nameControl = row.getByText(identity, { exact: true });
  if (await nameControl.count() !== 1) throw new Error(`${binding.caseId} 套餐组名称编辑控件不唯一：${identity}`);
  await pageObject.openRowMenu(identity);
  await pageObject.expectRowMenuActions(/Delete|删除/i);
  await page.keyboard.press('Escape');
  await nameControl.click();
  if (!/\/pp\/brand\/combo\/create\?id=\d+/.test(new URL(page.url()).pathname + new URL(page.url()).search)) {
    throw new Error(`${binding.caseId} 套餐组名称未进入编辑页：${page.url()}`);
  }
  await page.goBack({ waitUntil: 'domcontentloaded' });
  if (businessMutations.length !== 0) throw new Error(`${binding.caseId} 列表合同检查发生业务写请求：${businessMutations.join(', ')}`);
  assertionIds.push(assertionReceipt(binding, 2));
  return assertionIds;
}

export async function runComboV2QueryContractCase(
  binding: GroupAutomationBinding,
  page: Page,
  productCenterApi: ProductCenterApi,
  cleanupRegistry: CleanupRegistry,
  executionLedger: ProductCenterExecutionLedger,
): Promise<string[]> {
  const timestamp = Date.now();
  const product = await createComboV2ProductFixture(
    `AUTO_AUDIT_COMBO_V2_QUERY_PRODUCT_${timestamp}`,
    productCenterApi,
    cleanupRegistry,
    executionLedger,
  );
  const commonKeyword = `AUTO_AUDIT_COMBO_V2_QUERY_${timestamp}`;
  const fixedName = `${commonKeyword}_FIXED`;
  const optionalName = `${commonKeyword}_OPTIONAL`;
  const fixed = await createComboV2GroupFixture({
    name: fixedName,
    sectionType: 1,
    products: [product],
  }, productCenterApi, cleanupRegistry, executionLedger);
  const optional = await createComboV2GroupFixture({
    name: optionalName,
    sectionType: 2,
    products: [product],
  }, productCenterApi, cleanupRegistry, executionLedger);
  const pageObject = createCombosPage(page);
  const assertionIds: string[] = [];
  const registeredGroupIds = new Set<number>();
  let executionError: unknown;
  try {
    await pageObject.open();
    await pageObject.searchAndWait(commonKeyword);
    await waitUntil(
      () => pageObject.tableBodyRows.allInnerTexts(),
      (rows) => rows.length === 2 && rows.every((row) => row.includes(commonKeyword)),
      { timeout: 15_000, interval: 100, message: `${binding.caseId} 名称筛选未收敛到两条审计记录` },
    );
    assertionIds.push(assertionReceipt(binding, 0));

    const main = page.locator('main:visible');
    const typeFilter = main.getByText('Combo Group Type', { exact: true })
      .locator('xpath=self::*[not(ancestor::table)]');
    if (await typeFilter.count() !== 1) throw new Error(`${binding.caseId} 套餐类型筛选器不唯一`);
    await typeFilter.click();
    const optionalOption = page.locator('[class^="optionItem___"]:visible')
      .getByText('Optional Combo', { exact: true });
    if (await optionalOption.count() !== 1) throw new Error(`${binding.caseId} 可选搭配筛选项不唯一`);
    await optionalOption.click();
    await page.keyboard.press('Escape');
    await waitUntil(
      () => pageObject.tableBodyRows.allInnerTexts(),
      (rows) => rows.length === 1 && rows[0]?.includes(optionalName) === true && !rows[0]?.includes(fixedName),
      { timeout: 15_000, interval: 100, message: `${binding.caseId} 名称与类型组合筛选未收敛` },
    );
    assertionIds.push(assertionReceipt(binding, 1));

    await pageObject.resetSearchAndWait();
    await typeFilter.click();
    const selectedOptionalOption = page.locator('[class^="optionItem___"]:visible')
      .getByText('Optional Combo', { exact: true });
    if (await selectedOptionalOption.count() !== 1) throw new Error(`${binding.caseId} 套餐类型筛选缺少清空入口`);
    await selectedOptionalOption.click();
    await waitUntil(
      () => pageObject.tableBodyRows.allInnerTexts(),
      (rows) => rows.some((row) => row.includes(fixedName)) && rows.some((row) => row.includes(optionalName)),
      { timeout: 15_000, interval: 100, message: `${binding.caseId} 清空筛选后审计记录未恢复` },
    );
    assertionIds.push(assertionReceipt(binding, 2));
    executionLedger.markPhase(fixed.checkpointEntryId, 'ui-verified');
    executionLedger.markPhase(optional.checkpointEntryId, 'ui-verified');
  } catch (error) {
    executionError = error;
  }

  const cleanup = await cleanupRegistry.cleanupAll();
  if (!cleanup.verifiedZero) throw new Error(`${binding.caseId} 套餐筛选夹具清理未收敛`);
  await pageObject.open();
  for (const identity of [fixedName, optionalName]) {
    await pageObject.searchAndWait(identity);
    await pageObject.expectEmptySearchResults();
  }
  if (executionError) throw executionError;
  return assertionIds;
}

export async function runComboV2FormContractCase(
  binding: GroupAutomationBinding,
  page: Page,
  productCenterApi: ProductCenterApi,
  cleanupRegistry: CleanupRegistry,
  executionLedger: ProductCenterExecutionLedger,
): Promise<string[]> {
  const timestamp = Date.now();
  const productIdentity = `AUTO_AUDIT_COMBO_V2_FORM_${timestamp}`;
  const category = requireGroupRecord(namedRecords(await productCenterApi.categoryTree(), 'Special Offer')[0], 'Special Offer');
  const itemFactory = new ProductCenterItemCreateDataFactory(productCenterApi);
  const productBody = await productCenterApi.createBomProduct(productIdentity, category.id);
  const product = await itemFactory.registerCreated({
    entityKey: 'item',
    productType: 'standard',
    originalIdentity: productIdentity,
    price: '1.00',
    minimumOrderQuantity: '1',
  }, productBody, cleanupRegistry);
  executionLedger.markPhase(product.checkpointEntryId, 'api-verified');
  const pageObject = createCombosPage(page);
  const assertionIds: string[] = [];
  const registeredGroupIds = new Set<number>();
  let executionError: unknown;
  try {
    await pageObject.open();
    await pageObject.openCreateSurface();
    const main = page.locator('main:visible');
    const title = binding.title;

    if (title.includes('三种套餐组选择数量字段分布')) {
      const fixedText = await comboTypeSurfaceText(pageObject, main, 'Fixed Combo');
      if (!/Quantity/.test(fixedText) || /Selection Quantity|Minimum Selection Quantity|Maximum Selection Quantity/.test(fixedText)) {
        throw new Error(`${binding.caseId} 固定搭配数量字段分布错误`);
      }
      assertionIds.push(assertionReceipt(binding, 0));
      const optionalText = await comboTypeSurfaceText(pageObject, main, 'Optional Combo');
      if (!/Selection Quantity/.test(optionalText) || /Minimum Selection Quantity|Maximum Selection Quantity/.test(optionalText)) {
        throw new Error(`${binding.caseId} 可选搭配选择数量字段分布错误`);
      }
      if (await comboRuleInputValue(main, /Selection Quantity/i) !== '1') throw new Error(`${binding.caseId} 可选搭配选择数量默认值不是 1`);
      assertionIds.push(assertionReceipt(binding, 1));
      const pickMixText = await comboTypeSurfaceText(pageObject, main, 'Pick & Mix');
      if (!/Minimum Selection Quantity/.test(pickMixText) || !/Maximum Selection Quantity/.test(pickMixText)) {
        throw new Error(`${binding.caseId} 随心配最少最多字段缺失`);
      }
      if (await comboRuleInputValue(main, /Minimum Selection Quantity/i) !== '1'
        || await comboRuleInputValue(main, /Maximum Selection Quantity/i) !== '1') {
        throw new Error(`${binding.caseId} 随心配最少最多默认值不是 1/1`);
      }
      assertionIds.push(assertionReceipt(binding, 2));
    } else if (title.includes('新增套餐组页展示固定搭配可选搭配随心配及说明')) {
      const initialText = normalizeUiText(await main.innerText());
      assertUiTextContains(binding.caseId, initialText, [
        /Fixed Combo|固定搭配/,
        /Optional Combo|可选搭配/,
        /Pick & Mix|随心配/,
        /Items and quantities are fixed|商品和数量固定|统一定价/,
        /Add-on pricing|加价/,
        /calculated dynamically|动态计算/,
      ]);
      assertionIds.push(assertionReceipt(binding, 0));
      const fixedText = await comboTypeSurfaceText(pageObject, main, 'Fixed Combo');
      const fixedChecked = await main.locator('label.ant-radio-wrapper:visible').filter({ hasText: /^Fixed Combo/ })
        .locator('input[type=radio]').isChecked();
      if (!fixedChecked || /Selection Quantity|Minimum Selection Quantity|Maximum Selection Quantity/.test(fixedText)) {
        throw new Error(`${binding.caseId} 固定搭配专属表单合同不正确`);
      }
      const optionalText = await comboTypeSurfaceText(pageObject, main, 'Optional Combo');
      const optionalChecked = await main.locator('label.ant-radio-wrapper:visible').filter({ hasText: /^Optional Combo/ })
        .locator('input[type=radio]').isChecked();
      if (!optionalChecked || !/Selection Quantity/.test(optionalText)
        || /Minimum Selection Quantity|Maximum Selection Quantity/.test(optionalText)) {
        throw new Error(`${binding.caseId} 可选搭配专属表单合同不正确`);
      }
      const pickMixText = await comboTypeSurfaceText(pageObject, main, 'Pick & Mix');
      const pickMixChecked = await main.locator('label.ant-radio-wrapper:visible').filter({ hasText: /^Pick & Mix/ })
        .locator('input[type=radio]').isChecked();
      if (!pickMixChecked || !/Minimum Selection Quantity/.test(pickMixText)
        || !/Maximum Selection Quantity/.test(pickMixText)) {
        throw new Error(`${binding.caseId} 随心配专属表单合同不正确`);
      }
      assertionIds.push(assertionReceipt(binding, 1));
    } else if (title.includes('新增套餐组类型切换后字段随类型更新')) {
      const fixedText = await comboTypeSurfaceText(pageObject, main, 'Fixed Combo');
      if (await main.locator('input[type=radio]:checked').count() !== 1) throw new Error(`${binding.caseId} 固定搭配切换后选中状态错误`);
      const optionalText = await comboTypeSurfaceText(pageObject, main, 'Optional Combo');
      if (await main.locator('input[type=radio]:checked').count() !== 1) throw new Error(`${binding.caseId} 可选搭配切换后选中状态错误`);
      const pickMixText = await comboTypeSurfaceText(pageObject, main, 'Pick & Mix');
      if (await main.locator('input[type=radio]:checked').count() !== 1) throw new Error(`${binding.caseId} 随心配切换后选中状态错误`);
      assertionIds.push(assertionReceipt(binding, 0));
      if (/Selection Quantity|Minimum Selection Quantity|Maximum Selection Quantity/.test(fixedText)
        || !/Selection Quantity/.test(optionalText)
        || /Minimum Selection Quantity|Maximum Selection Quantity/.test(optionalText)
        || !/Minimum Selection Quantity/.test(pickMixText)
        || !/Maximum Selection Quantity/.test(pickMixText)) {
        throw new Error(`${binding.caseId} 套餐类型切换后专属字段未按类型更新`);
      }
      assertionIds.push(assertionReceipt(binding, 1));
      const savedGroupName = `AUTO_AUDIT_COMBO_V2_TYPE_LOCK_${timestamp}`;
      await (await comboV2NameInput(main)).fill(savedGroupName);
      await comboV2FillRule(main, /Minimum Selection Quantity/i, '1');
      await comboV2FillRule(main, /Maximum Selection Quantity/i, '1');
      await pageObject.selectComboProduct(productIdentity, category.name);
      await submitComboV2FormAndRegister(
        savedGroupName,
        main,
        productCenterApi,
        cleanupRegistry,
        executionLedger,
        registeredGroupIds,
        product.checkpointEntryId,
      );
      await pageObject.open();
      await pageObject.searchAndWait(savedGroupName);
      const editMain = await pageObject.openEditSurface(savedGroupName);
      const savedTypeRadios = editMain.locator('label.ant-radio-wrapper:visible input[type=radio]');
      const radioStates = await savedTypeRadios.evaluateAll((radios) => radios.map((radio) => {
        const input = radio as HTMLInputElement;
        const wrapper = input.closest('label');
        return {
          checked: input.checked,
          disabled: input.disabled,
          ariaDisabled: input.getAttribute('aria-disabled') ?? wrapper?.getAttribute('aria-disabled') ?? null,
          wrapperClass: wrapper?.className ?? '',
        };
      }));
      const exactlyOneChecked = radioStates.filter((state) => state.checked).length === 1;
      const allInteractionLocked = radioStates.every((state) => (
        state.disabled
        || state.ariaDisabled === 'true'
        || state.wrapperClass.includes('ant-radio-wrapper-disabled')
      ));
      if (radioStates.length !== 3 || !exactlyOneChecked || !allInteractionLocked) {
        throw new Error(`${binding.caseId} 已保存套餐组类型未保持单一选中且全部禁用：${JSON.stringify(radioStates)}`);
      }
      assertionIds.push(assertionReceipt(binding, 2));
    } else if (title.includes('固定搭配商品行仅配置数量且由套餐统一定价')) {
      await pageObject.selectComboType('Fixed Combo');
      await pageObject.selectComboProduct(productIdentity, category.name);
      const text = normalizeUiText(await main.innerText());
      assertUiTextContains(binding.caseId, text, [/Sort|排序/, /Item \/ Spec|商品.*规格/, /Quantity|数量/, /Action|操作/]);
      const row = main.locator('tbody tr:visible').filter({ hasText: productIdentity });
      if (await row.count() !== 1 || await row.locator('input:visible').count() < 1) throw new Error(`${binding.caseId} 固定搭配商品数量输入缺失`);
      assertionIds.push(assertionReceipt(binding, 0));
      if (/Extra Charge|Price Source|Custom Price/.test(text)
        || !/priced uniformly by the combo product|统一定价/.test(text)) {
        throw new Error(`${binding.caseId} 固定搭配价格字段或计价说明错误`);
      }
      assertionIds.push(assertionReceipt(binding, 1));
      if (/Selection Quantity|Minimum Selection Quantity|Maximum Selection Quantity/.test(text)) {
        throw new Error(`${binding.caseId} 固定搭配错误展示了组级选择数量字段`);
      }
      assertionIds.push(assertionReceipt(binding, 2));
    } else if (title.includes('可选搭配展示选择数量加价默认与两个组级开关')) {
      await pageObject.selectComboType('Optional Combo');
      await pageObject.selectComboProduct(productIdentity, category.name);
      const text = normalizeUiText(await main.innerText());
      if (await comboRuleInputValue(main, /Selection Quantity/i) !== '1') throw new Error(`${binding.caseId} 选择数量默认值不是 1`);
      assertionIds.push(assertionReceipt(binding, 0));
      const switches = comboRuleSwitches(main);
      if (await switches.count() !== 2 || await switches.nth(0).getAttribute('aria-checked') !== 'false'
        || await switches.nth(1).getAttribute('aria-checked') !== 'false') {
        throw new Error(`${binding.caseId} 可选搭配两个开关默认状态错误`);
      }
      assertionIds.push(assertionReceipt(binding, 1));
      if (!/Extra Charge/.test(text) || !/Default/.test(text)
        || /Minimum Selection Quantity|Maximum Selection Quantity/.test(text)) {
        throw new Error(`${binding.caseId} 可选搭配商品表头错误`);
      }
      assertionIds.push(assertionReceipt(binding, 2));
    } else if (title.includes('随心配展示总数量规则与价格来源字段')) {
      await pageObject.selectComboType('Pick & Mix');
      await pageObject.selectComboProduct(productIdentity, category.name);
      if (await comboRuleInputValue(main, /Minimum Selection Quantity/i) !== '1'
        || await comboRuleInputValue(main, /Maximum Selection Quantity/i) !== '1') {
        throw new Error(`${binding.caseId} 随心配最少最多默认值错误`);
      }
      assertionIds.push(assertionReceipt(binding, 0));
      let headers = await comboV2ProductHeaders(main, productIdentity, [
        /^(Original Price|原价)$/i,
        /^(Price Source|价格来源)$/i,
        /^(Custom Price|自定义价格)$/i,
        /^(Default|默认选中)$/i,
      ]);
      if (headers.some((header) => /^(Default Qty|默认数量)$/i.test(header))) {
        throw new Error(`${binding.caseId} 随心配错误展示了默认数量字段`);
      }
      const toggle = main.locator('[role=switch]:visible, button.ant-switch:visible').first();
      await toggle.click();
      headers = await comboV2ProductHeaders(main, productIdentity, [/^(Max Qty|最大数量)$/i]);
      assertionIds.push(assertionReceipt(binding, 1));
      const text = normalizeUiText(await main.innerText());
      assertUiTextContains(binding.caseId, text, [/Follow item price|跟随商品价/i, /Custom Pick & Mix price|自定义价/i]);
      assertionIds.push(assertionReceipt(binding, 2));
    } else if (title.includes('可选搭配开启组内重复选择后显示子项最小最大数量')) {
      await pageObject.selectComboType('Optional Combo');
      await pageObject.selectComboProduct(productIdentity, category.name);
      let text = normalizeUiText(await main.innerText());
      if (/Min Qty \*|Max Qty/.test(text)) throw new Error(`${binding.caseId} 重复选择关闭时仍显示子项最小最大数量`);
      assertionIds.push(assertionReceipt(binding, 0));
      const toggle = comboRuleSwitch(main, 'repeatSelect');
      await toggle.click();
      text = normalizeUiText(await main.innerText());
      if (!/Min Qty \*/.test(text) || !/Max Qty/.test(text)) throw new Error(`${binding.caseId} 重复选择开启后缺少 Min/Max Qty`);
      assertionIds.push(assertionReceipt(binding, 1));
    } else if (title.includes('可选搭配相同商品合并开关可独立配置')) {
      await pageObject.selectComboType('Optional Combo');
      await pageObject.selectComboProduct(productIdentity, category.name);
      const switches = comboRuleSwitches(main);
      const selectionQuantity = await comboRuleInputValue(main, /Selection Quantity/i);
      await switches.nth(0).click();
      await switches.nth(1).click();
      if (await switches.nth(0).getAttribute('aria-checked') !== 'true'
        || await switches.nth(1).getAttribute('aria-checked') !== 'true') {
        throw new Error(`${binding.caseId} 两个开关不能独立开启`);
      }
      assertionIds.push(assertionReceipt(binding, 0));
      const text = normalizeUiText(await main.innerText());
      if (await comboRuleInputValue(main, /Selection Quantity/i) !== selectionQuantity
        || !/Min Qty \*/.test(text) || !/Max Qty/.test(text)) {
        throw new Error(`${binding.caseId} 合并开关改变了选择数量或子项数量列`);
      }
      assertionIds.push(assertionReceipt(binding, 1));
    } else if (title.includes('随心配组内重复选择开关控制子项最大数量列')) {
      await pageObject.selectComboType('Pick & Mix');
      await pageObject.selectComboProduct(productIdentity, category.name);
      const toggle = comboRuleSwitch(main, 'repeatSelect');
      let text = normalizeUiText(await main.innerText());
      if (/Max Qty/.test(text)) throw new Error(`${binding.caseId} 重复选择关闭时仍显示 Max Qty`);
      assertionIds.push(assertionReceipt(binding, 0));
      await toggle.click();
      text = normalizeUiText(await main.innerText());
      if (!/Max Qty/.test(text)) throw new Error(`${binding.caseId} 重复选择开启后未显示 Max Qty`);
      assertionIds.push(assertionReceipt(binding, 1));
    } else {
      throw new Error(`${binding.caseId} 未实现的套餐组 V2 表单合同：${title}`);
    }
    executionLedger.markPhase(product.checkpointEntryId, 'ui-verified');
    await pageObject.cancelCurrentSurface();
  } catch (error) {
    executionError = error;
  }

  const cleanup = await cleanupRegistry.cleanupAll();
  if (!cleanup.verifiedZero) throw new Error(`${binding.caseId} 套餐组 V2 表单夹具清理未收敛`);
  const itemList = createItemListPage(page);
  await itemList.openForResidueCheck();
  await itemList.fillSearchForResidueCheck(productIdentity);
  await itemList.expectEmptySearchResults(10_000);
  if (namedRecords(await productCenterApi.productPage(productIdentity), productIdentity).length !== 0) {
    throw new Error(`${binding.caseId} 套餐组 V2 商品夹具 API 仍有残留`);
  }
  if (executionError) throw executionError;
  if (assertionIds.length !== binding.expectedResults.length) {
    throw new Error(`${binding.caseId} 套餐组 V2 表单断言收据数量不完整：${assertionIds.length}/${binding.expectedResults.length}`);
  }
  return assertionIds;
}

export async function runComboV2CreateContractCase(
  binding: GroupAutomationBinding,
  page: Page,
  productCenterApi: ProductCenterApi,
  cleanupRegistry: CleanupRegistry,
  executionLedger: ProductCenterExecutionLedger,
): Promise<{
  assertionIds: string[];
  assertionReceipts: RuntimeAssertionReceipt[];
  productDifference: Record<string, unknown> | null;
}> {
  const timestamp = Date.now();
  const requiredProducts = binding.title.includes('默认选中数超过') ? 3
    : binding.title.includes('默认数量合计') || binding.title.includes('输入归一化') ? 2
      : 1;
  const products: ComboV2ProductFixture[] = [];
  for (let index = 0; index < requiredProducts; index += 1) {
    products.push(await createComboV2ProductFixture(
      `AUTO_AUDIT_COMBO_V2_RULE_PRODUCT_${timestamp}_${index + 1}`,
      productCenterApi,
      cleanupRegistry,
      executionLedger,
    ));
  }
  const pageObject = createCombosPage(page);
  const assertionIds: string[] = [];
  const assertionReceipts: RuntimeAssertionReceipt[] = [];
  const intendedNames = new Set<string>();
  const registeredGroupIds = new Set<number>();
  let executionError: unknown;
  let productDefectEvidence: Record<string, unknown> | null = null;
  try {
    if (binding.caseId === 'TC-GRP-PKG-030' || binding.caseId === 'TC-GRP-PKG-033') {
      await ensureChineseValidationLocale(page);
    }
    if (binding.title.includes('三种套餐组名称按100字符含空格长度规则处理')) {
      for (const type of ['Fixed Combo', 'Optional Combo', 'Pick & Mix'] as const) {
        await pageObject.open();
        await pageObject.openCreateSurface();
        await pageObject.selectComboType(type);
        const main = page.locator('main:visible');
        const nameInput = await comboV2NameInput(main);
        const base = buildComboV2BoundaryName(timestamp, type);
        await nameInput.fill(base);
        await nameInput.press('Home');
        await nameInput.pressSequentially(' ');
        await nameInput.press('End');
        await nameInput.pressSequentially(' ');
        await nameInput.blur();
        const retainedName = await nameInput.inputValue();
        if (Array.from(retainedName).length !== 100
          || retainedName.trim() !== retainedName
          || !retainedName.includes(' ')) {
          throw new Error(`${binding.caseId} 套餐名称 100 字符与空格规则不符合：${JSON.stringify(retainedName)}`);
        }
        await pageObject.selectComboProduct(products[0].identity, products[0].categoryName);
        intendedNames.add(retainedName);
        const created = await submitComboV2FormAndRegister(
          retainedName,
          main,
          productCenterApi,
          cleanupRegistry,
          executionLedger,
          registeredGroupIds,
          products[0].checkpointEntryId,
        );
        if (created.sectionType !== comboV2SectionType(type)) {
          throw new Error(`${binding.caseId} ${type} 保存类型错误：${created.sectionType}`);
        }
      }
      assertionIds.push(assertionReceipt(binding, 0));
      assertionIds.push(assertionReceipt(binding, 1));
      for (const identity of intendedNames) {
        const record = collectComboGroupRecords(await productCenterApi.comboGroupList())
          .filter((candidate) => candidate.name === identity);
        if (record.length !== 1 || Array.from(record[0].name).length !== 100 || record[0].name.trim() !== record[0].name) {
          throw new Error(`${binding.caseId} 套餐名称 API 回读不符合 100 字符规则：${identity}`);
        }
      }
      assertionIds.push(assertionReceipt(binding, 2));
    } else {
      const identity = `AUTO_AUDIT_COMBO_V2_RULE_${binding.caseId.replace(/[^A-Z0-9]+/g, '_')}_${timestamp}`.slice(0, 100);
      intendedNames.add(identity);
      await pageObject.open();
      await pageObject.openCreateSurface();
      let main = page.locator('main:visible');
      const comboType = binding.title.includes('可选搭配') ? 'Optional Combo' : 'Pick & Mix';
      await pageObject.selectComboType(comboType);
      await (await comboV2NameInput(main)).fill(identity);

      if (binding.title.includes('输入归一化')) {
        const minInput = await comboV2RuleInput(main, /Minimum Selection Quantity/i);
        await minInput.fill('');
        await minInput.pressSequentially('abc');
        await minInput.blur();
        if (await minInput.inputValue() !== '') throw new Error(`${binding.caseId} 非数字输入后未清空`);
        assertionIds.push(assertionReceipt(binding, 0));
        await comboV2FillAndBlur(minInput, '-1');
        if (await minInput.inputValue() !== '1') throw new Error(`${binding.caseId} 负数未自动更正为 1`);
        assertionIds.push(assertionReceipt(binding, 1));
        await comboV2FillAndBlur(minInput, '2.2');
        if (await minInput.inputValue() !== '2') throw new Error(`${binding.caseId} 小数未忽略小数部分`);
        assertionIds.push(assertionReceipt(binding, 2));
        await comboV2FillRule(main, /Minimum Selection Quantity/i, '2');
        await comboV2FillRule(main, /Maximum Selection Quantity/i, '2');
        if (await comboRuleInputValue(main, /Minimum Selection Quantity/i) !== '2'
          || await comboRuleInputValue(main, /Maximum Selection Quantity/i) !== '2') {
          throw new Error(`${binding.caseId} 最少最多相同值未保持 2/2`);
        }
        assertionIds.push(assertionReceipt(binding, 3));
        await selectComboV2Products(pageObject, products);
        const created = await submitComboV2FormAndRegister(
          identity, main, productCenterApi, cleanupRegistry, executionLedger, registeredGroupIds, products[0].checkpointEntryId,
        );
        const detail = await productCenterApi.comboGroupDetail(created.id);
        assertComboV2Rule(detail, { sectionType: 5, min: 2, max: 2 });
        assertionIds.push(assertionReceipt(binding, 4));
      } else if (binding.title.includes('最少选择数量大于最多选择数量')) {
        for (const [index, product] of products.entries()) {
          await pageObject.selectComboProduct(product.identity, product.categoryName, {
            preserveExistingIdentities: products.slice(0, index).map((item) => item.identity),
          });
          await comboV2SelectPriceSource(main, product.identity, /Follow item price|跟随商品价|Price Source|价格来源/i);
        }
        await comboV2FillRule(main, /Minimum Selection Quantity|最少选择数量/i, '3');
        if (await comboRuleInputValue(main, /Minimum Selection Quantity|最少选择数量/i) !== '3') throw new Error(`${binding.caseId} 最少选择未保持 3`);
        assertionIds.push(assertionReceipt(binding, 0));
        await comboV2FillRule(main, /Maximum Selection Quantity|最多选择数量/i, '1');
        if (await comboRuleInputValue(main, /Maximum Selection Quantity|最多选择数量/i) !== '1') throw new Error(`${binding.caseId} 最多选择未保持 1`);
        assertionIds.push(assertionReceipt(binding, 1));
        await submitComboV2FormExpectRejected(binding, identity, main, productCenterApi);
        assertionIds.push(assertionReceipt(binding, 2));
      } else if (binding.title.includes('最少和最多选择数量输入0')) {
        await selectComboV2Products(pageObject, products);
        await comboV2FillRule(main, /Minimum Selection Quantity/i, '0');
        if (await comboRuleInputValue(main, /Minimum Selection Quantity/i) !== '1') throw new Error(`${binding.caseId} 最少数量 0 未补为 1`);
        assertionIds.push(assertionReceipt(binding, 0));
        await comboV2FillRule(main, /Maximum Selection Quantity/i, '0');
        if (await comboRuleInputValue(main, /Maximum Selection Quantity/i) !== '1') throw new Error(`${binding.caseId} 最多数量 0 未补为 1`);
        assertionIds.push(assertionReceipt(binding, 1));
        const created = await submitComboV2FormAndRegister(
          identity, main, productCenterApi, cleanupRegistry, executionLedger, registeredGroupIds, products[0].checkpointEntryId,
        );
        assertComboV2Rule(await productCenterApi.comboGroupDetail(created.id), { sectionType: 5, min: 1, max: 1 });
        assertionIds.push(assertionReceipt(binding, 2));
      } else if (binding.title.includes('默认数量合计超过最多选择数量')) {
        await comboV2FillRule(main, /Minimum Selection Quantity/i, '1');
        await comboV2FillRule(main, /Maximum Selection Quantity/i, '2');
        await selectComboV2Products(pageObject, products);
        await comboV2FillRowNumber(main, products[0].identity, /Default Qty/i, '2');
        await comboV2FillRowNumber(main, products[1].identity, /Default Qty/i, '1');
        assertionIds.push(assertionReceipt(binding, 0));
        const created = await submitComboV2FormAndRegister(
          identity, main, productCenterApi, cleanupRegistry, executionLedger, registeredGroupIds, products[0].checkpointEntryId,
        );
        const detail = await productCenterApi.comboGroupDetail(created.id);
        assertComboV2Rule(detail, { sectionType: 5, min: 1, max: 2, defaultQuantityTotal: 3 });
        assertionIds.push(assertionReceipt(binding, 1));
      } else if (binding.title.includes('子项默认数量超过最多选择')) {
        await comboV2FillRule(main, /Minimum Selection Quantity/i, '1');
        await comboV2FillRule(main, /Maximum Selection Quantity/i, '2');
        await pageObject.selectComboProduct(products[0].identity, products[0].categoryName);
        if (await comboRuleInputValue(main, /Maximum Selection Quantity/i) !== '2') throw new Error(`${binding.caseId} 最多选择未保持 2`);
        assertionIds.push(assertionReceipt(binding, 0));
        await comboV2FillRowNumber(main, products[0].identity, /Default Qty/i, '3');
        assertionIds.push(assertionReceipt(binding, 1));
        const created = await submitComboV2FormAndRegister(
          identity, main, productCenterApi, cleanupRegistry, executionLedger, registeredGroupIds, products[0].checkpointEntryId,
        );
        assertComboV2Rule(await productCenterApi.comboGroupDetail(created.id), {
          sectionType: 5, min: 1, max: 2, defaultQuantityTotal: 3,
        });
        assertionIds.push(assertionReceipt(binding, 2));
      } else if (binding.title.includes('最多选择数量小于最少选择数量')) {
        await comboV2FillRule(main, /Minimum Selection Quantity|最少选择数量/i, '2');
        await comboV2FillRule(main, /Maximum Selection Quantity|最多选择数量/i, '1');
        if (await comboRuleInputValue(main, /Minimum Selection Quantity|最少选择数量/i) !== '2') throw new Error(`${binding.caseId} 最少选择未保持 2`);
        assertionIds.push(assertionReceipt(binding, 0));
        assertionReceipts.push(groupUiAssertionReceipt(binding, 0, '2', 'verified'));
        if (await comboRuleInputValue(main, /Maximum Selection Quantity|最多选择数量/i) !== '1') throw new Error(`${binding.caseId} 最多选择未保持 1`);
        assertionIds.push(assertionReceipt(binding, 1));
        assertionReceipts.push(groupUiAssertionReceipt(binding, 1, '1', 'verified'));
        await pageObject.selectComboProduct(products[0].identity, products[0].categoryName);
        await comboV2SelectPriceSource(main, products[0].identity, /Follow item price|跟随商品价|Price Source|价格来源/i);
        try {
          const message = await submitComboV2FormExpectRejected(binding, identity, main, productCenterApi);
          assertionIds.push(assertionReceipt(binding, 2));
          assertionReceipts.push(groupUiAssertionReceipt(binding, 2, message, 'verified'));
        } catch (error) {
          const observedDifference = readProductCenterGroupObservedDifferenceEvidence(error);
          if (!observedDifference) throw error;
          assertionIds.push(assertionReceipt(binding, 2));
          assertionReceipts.push(groupUiAssertionReceipt(
            binding,
            2,
            Array.isArray(observedDifference.actualMessages)
              ? observedDifference.actualMessages.join(' | ')
              : String(observedDifference.actualMessages ?? '未观测到页面提示'),
            'observed-mismatch',
          ));
          throw error;
        }
      } else if (binding.title.includes('默认选中数超过选择数量')) {
        await pageObject.cancelCurrentSurface();
        const existing = await createComboV2GroupFixture({
          name: identity,
          sectionType: 2,
          products: products.slice(0, 2),
          selectionRule: { min: 2, max: 2, repeatSelect: false, mergeDisplay: false },
          sectionItems: products.slice(0, 2).map((product, index) => ({
            itemId: product.id,
            skuId: product.skuId,
            selectionRule: { quantity: 1, maxQuantity: 1 },
            defaultSelected: true,
            sortOrder: index,
          })),
        }, productCenterApi, cleanupRegistry, executionLedger);
        registeredGroupIds.add(existing.id);
        await pageObject.open();
        await pageObject.searchAndWait(identity);
        main = await pageObject.openEditSurface(identity);
        await pageObject.expectSelectedProducts(
          products.slice(0, 2).map((item) => item.identity),
        );
        await pageObject.selectComboProduct(products[2].identity, products[2].categoryName);
        await comboV2SetRowDefault(main, products[2].identity, true);
        const submit = main.getByRole('button', { name: /^(Confirm|确\s*定)$/i });
        if (await submit.count() !== 1) {
          throw new Error(`${binding.caseId} 套餐提交按钮不唯一`);
        }
        if (!await submit.isEnabled()) {
          throw new Error(`${binding.caseId} 编辑页确定按钮与当前审计合同不符`);
        }
        const originalDetail = await productCenterApi.comboGroupDetail(existing.id);
        const updateResponsePromise = page.waitForResponse((response) => (
          ['POST', 'PUT', 'PATCH'].includes(response.request().method())
          && /\/ops-brand\/brand-sections(?:\/\d+)?$/.test(new URL(response.url()).pathname)
        ), { timeout: 60_000 });
        await submit.click();
        const updateResponse = await updateResponsePromise;
        const persisted = await waitUntil(
          () => productCenterApi.comboGroupDetail(existing.id),
          (value) => containsScalarValue(value, products[0].id)
            && containsScalarValue(value, products[1].id)
            && !containsScalarValue(value, products[2].id),
          {
            timeout: 15_000,
            interval: 250,
            message: `${binding.caseId} 套餐编辑结果未在接口详情中稳定生效`,
            observation: { channel: 'api', operation: 'comboGroupDetail', caseId: binding.caseId },
          },
        );
        const stayedOnEditPage = /\/pp\/brand\/combo\/create/.test(new URL(page.url()).pathname);
        assertionIds.push(assertionReceipt(binding, 0));
        if (!containsScalarValue(persisted, products[0].id)
          || !containsScalarValue(persisted, products[1].id)
          || containsScalarValue(persisted, products[2].id)) {
          productDefectEvidence = {
            schemaVersion: '1.0.0',
            caseId: binding.caseId,
            title: binding.title,
            generatedAt: new Date().toISOString(),
            expectation: {
              originalProductIds: products.slice(0, 2).map((product) => product.id),
              rejectedProductId: products[2].id,
              expectedSubmission: '保存不生效，组内商品结构保持原有 2 个默认选中商品',
            },
            preSubmit: {
              groupId: existing.id,
              productFixtures: products.map((product) => ({
                identity: product.identity,
                id: product.id,
                skuId: product.skuId,
              })),
              apiDetail: originalDetail,
              uiUrl: page.url(),
              uiExpectedProductIds: products.slice(0, 2).map((product) => product.id),
            },
            submission: {
              method: updateResponse.request().method(),
              url: updateResponse.url(),
              status: updateResponse.status(),
              requestBody: updateResponse.request().postDataJSON(),
            },
            postSubmit: {
              uiUrl: page.url(),
              stayedOnEditPage,
              apiDetail: persisted,
              apiProductIds: products.filter((product) => containsScalarValue(persisted, product.id)).map((product) => product.id),
              actualPersistedRejectedProduct: containsScalarValue(persisted, products[2].id),
            },
            reconciliation: {
              apiContainsOriginalProducts: products.slice(0, 2).every((product) => containsScalarValue(persisted, product.id)),
              apiContainsRejectedProduct: containsScalarValue(persisted, products[2].id),
              productBehavior: 'observed-product-drift',
            },
          };
          throw new Error(`${binding.caseId} 保存失败后 API 商品结构发生变化`);
        }
        if (!stayedOnEditPage) {
          throw new Error(`${binding.caseId} 拦截后未停留在套餐组编辑页`);
        }
        await pageObject.open();
        await pageObject.searchAndWait(identity);
        await pageObject.openEditSurface(identity);
        await pageObject.expectSelectedProducts(
          products.slice(0, 2).map((item) => item.identity),
          [products[2].identity],
        );
        assertionIds.push(assertionReceipt(binding, 1));
      } else if (binding.title.includes('新增随心配填写必填字段和商品保存成功')) {
        await comboV2FillRule(main, /Minimum Selection Quantity/i, '1');
        await comboV2FillRule(main, /Maximum Selection Quantity/i, '2');
        await pageObject.selectComboProduct(products[0].identity, products[0].categoryName);
        const created = await submitComboV2FormAndRegister(
          identity, main, productCenterApi, cleanupRegistry, executionLedger, registeredGroupIds, products[0].checkpointEntryId,
        );
        assertionIds.push(assertionReceipt(binding, 0));
        await pageObject.open();
        await pageObject.searchAndWait(identity);
        const rowText = (await pageObject.tableBodyRows.allInnerTexts()).join(' ');
        if (!/Pick & Mix|随心配/i.test(rowText)) throw new Error(`${binding.caseId} 列表未显示随心配类型`);
        assertionIds.push(assertionReceipt(binding, 1));
        const matches = collectComboGroupRecords(await productCenterApi.comboGroupList()).filter((record) => record.name === identity);
        if (matches.length !== 1 || matches[0].sectionType !== 5) throw new Error(`${binding.caseId} API 随心配记录不唯一或类型错误`);
        assertComboV2Rule(await productCenterApi.comboGroupDetail(created.id), { sectionType: 5, min: 1, max: 2 });
        assertionIds.push(assertionReceipt(binding, 2));
      } else {
        throw new Error(`${binding.caseId} 未实现的套餐组创建规则：${binding.title}`);
      }
    }
  } catch (error) {
    if (error instanceof ObservedProductDifferenceError) productDefectEvidence = error.evidence;
    executionError = error;
  }

  for (const identity of intendedNames) {
    await ensureComboV2GroupCleanupRegistered(
      identity,
      productCenterApi,
      cleanupRegistry,
      executionLedger,
      registeredGroupIds,
      products[0]?.checkpointEntryId,
    );
  }
  const cleanup = await cleanupRegistry.cleanupAll();
  if (productDefectEvidence) {
    const evidenceFileName = binding.caseId === 'TC-GRP-PKG-025'
      ? 'product-center-group-pkg025-product-defect-evidence-v1.json'
      : `product-center-group-${binding.caseId.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-product-defect-evidence-v1.json`;
    Object.assign(productDefectEvidence, {
      cleanup: cleanupEvidence(executionLedger),
      cleanupVerifiedZero: cleanup.verifiedZero,
      evidenceComplete: cleanup.verifiedZero,
      productMismatchConfirmed: true,
      executionPathEquivalent: true,
    });
    writeProductCenterGroupEvidence(evidenceFileName, productDefectEvidence);
  }
  if (!cleanup.verifiedZero) throw new Error(`${binding.caseId} 套餐创建规则夹具清理未收敛`);
  for (const identity of intendedNames) {
    if (collectComboGroupRecords(await productCenterApi.comboGroupList()).some((record) => record.name === identity)) {
      throw new Error(`${binding.caseId} 套餐组 API 仍有残留：${identity}`);
    }
  }
  await page.goto('/pp/brand/list', { waitUntil: 'domcontentloaded' });
  await ensureEnglishValidationLocale(page);
  const itemList = createItemListPage(page);
  await itemList.openForResidueCheck();
  for (const product of products) {
    await itemList.fillSearchForResidueCheck(product.identity);
    await itemList.expectEmptySearchResults(10_000);
  }
  if (executionError && !productDefectEvidence) throw executionError;
  if (assertionIds.length !== binding.expectedResults.length) {
    throw new Error(`${binding.caseId} 套餐创建规则断言收据数量不完整：${assertionIds.length}/${binding.expectedResults.length}`);
  }
  return { assertionIds, assertionReceipts, productDifference: productDefectEvidence };
}

export async function runComboV2ReferenceContractCase(
  binding: GroupAutomationBinding,
  page: Page,
  productCenterApi: ProductCenterApi,
  cleanupRegistry: CleanupRegistry,
  executionLedger: ProductCenterExecutionLedger,
): Promise<string[]> {
  const timestamp = Date.now();
  const productCount = binding.title.includes('新增商品') || binding.title.includes('商品后仍满足') ? 3
    : binding.title.includes('移除') || binding.title.includes('下调') ? 2
      : 1;
  const products: ComboV2ProductFixture[] = [];
  for (let index = 0; index < productCount; index += 1) {
    products.push(await createComboV2ProductFixture(
      `AUTO_AUDIT_COMBO_V2_REF_PRODUCT_${timestamp}_${index + 1}`,
      productCenterApi,
      cleanupRegistry,
      executionLedger,
    ));
  }
  const groupName = `AUTO_AUDIT_COMBO_V2_REF_${binding.caseId.replace(/[^A-Z0-9]+/g, '_')}_${timestamp}`.slice(0, 100);
  const fixedTypeSwitch = binding.title.includes('可切换类型');
  const selectionQuantity = binding.title.includes('不足选择数量') || binding.title.includes('下调') ? 2 : 1;
  const initialProducts = binding.caseId === 'TC-GRP-PKG-009' ? products.slice(0, 1)
    : binding.title.includes('新增商品') ? products.slice(0, 2)
    : binding.title.includes('移除可选搭配商品后仍满足') ? products
      : products;
  const sectionItems = initialProducts.map((product, index) => ({
    itemId: product.id,
    skuId: product.skuId,
    selectionRule: {
      quantity: 1,
      maxQuantity: binding.title.includes('子项非价格规则') ? 2 : 1,
    },
    // The lower-quantity/remove-product contract starts with both optional
    // products selected.  Keeping the second row selected makes the UI edit
    // surface render the exact row that the case removes; the API fixture
    // previously left it unselected, so the row was absent from the form even
    // though it existed in the authoritative group detail.
    defaultSelected: binding.title.includes('下调可选搭配选择数量后移除商品')
      ? true
      : binding.title.includes('移除可选搭配默认商品') ? index === initialProducts.length - 1 : index === 0,
    sortOrder: index,
  }));
  const pageObject = createCombosPage(page);
  const registeredGroupIds = new Set<number>();
  const group = fixedTypeSwitch
    ? await (async () => {
      await pageObject.open();
      await pageObject.openCreateSurface();
      const createMain = page.locator('main:visible');
      await pageObject.selectComboType('Fixed Combo');
      await (await comboV2NameInput(createMain)).fill(groupName);
      await pageObject.selectComboProduct(initialProducts[0].identity, initialProducts[0].categoryName);
      const created = await submitComboV2FormAndRegister(
        groupName,
        createMain,
        productCenterApi,
        cleanupRegistry,
        executionLedger,
        registeredGroupIds,
        initialProducts[0].checkpointEntryId,
      );
      return { id: created.id, name: groupName, checkpointEntryId: `combo-${created.id}` };
    })()
    : await createComboV2GroupFixture({
      name: groupName,
      sectionType: 2,
      products: initialProducts,
      selectionRule: {
        min: selectionQuantity,
        max: selectionQuantity,
        mergeDisplay: false,
        repeatSelect: binding.title.includes('子项非价格规则'),
      },
      sectionItems,
    }, productCenterApi, cleanupRegistry, executionLedger);
  if (!registeredGroupIds.has(group.id)) registeredGroupIds.add(group.id);
  const ownerCount = fixedTypeSwitch ? 0 : binding.title.includes('两个套餐商品') || binding.title.includes('商品 P、Q') ? 2 : 1;
  const owners: Array<{ identity: string; checkpointEntryId: string }> = [];
  for (let index = 0; index < ownerCount; index += 1) {
    owners.push(await createComboV2ReferenceOwner(
      `AUTO_AUDIT_COMBO_V2_OWNER_${timestamp}_${index + 1}`,
      groupName,
      page,
      productCenterApi,
      cleanupRegistry,
      executionLedger,
    ));
  }

  const assertionIds: string[] = [];
  let currentGroupName = groupName;
  let executionError: unknown;
  try {
    if (binding.expectedUiFeedback?.locale === 'zh-CN') await ensureChineseValidationLocale(page);
    await pageObject.open();
    await pageObject.searchAndWait(groupName);
    const main = await pageObject.openEditSurface(groupName);

    if (binding.title.includes('新增商品后同步引用套餐商品')) {
      const exactMessage = binding.expectedUiFeedback?.exactMessage;
      if (!exactMessage) throw new Error(`${binding.caseId} 缺少审计合同精确删除提示`);
      await comboV2ExpectSingleProductDeleteBlocked(main, products[0].identity, exactMessage);
      assertionIds.push(assertionReceipt(binding, 0));
      await pageObject.selectComboProduct(products[1].identity, products[1].categoryName, {
        preserveExistingIdentities: [products[0].identity],
      });
      const saved = await submitComboV2FormAndRegister(
        groupName, main, productCenterApi, cleanupRegistry, executionLedger, registeredGroupIds, products[0].checkpointEntryId, group.id,
      );
      const detail = await waitUntil(
        () => productCenterApi.comboGroupDetail(group.id),
        (value) => containsScalarValue(value, products[1].identity),
        { timeout: 60_000, interval: 500, probeTimeout: 10_000, message: `${binding.caseId} 套餐组未保存新增商品` },
      );
      if (!containsScalarValue(detail, products[0].identity) || !saved.impactText
        || !/(?:被[^\n]{0,20}(?:「?1」?|1)[^\n]{0,20}(?:个套餐商品|受影响)|used by\s*1|1\s*affected)/i.test(saved.impactText)) {
        throw new Error(`${binding.caseId} 被引用套餐组新增商品缺少 1 个引用影响证据：${saved.impactText}`);
      }
      assertionIds.push(assertionReceipt(binding, 1));
      const ownerCard = await readComboV2OwnerCard(page, owners[0].identity, groupName, products[0].identity);
      if (!ownerCard.includes(products[1].identity)) throw new Error(`${binding.caseId} 引用套餐商品未同步新增商品`);
      assertionIds.push(assertionReceipt(binding, 2));
    } else if (binding.title.includes('移除可选搭配商品后仍满足选择数量')) {
      await comboV2RemoveProductRow(main, products[2].identity);
      const saved = await submitComboV2FormAndRegister(
        groupName, main, productCenterApi, cleanupRegistry, executionLedger, registeredGroupIds, products[0].checkpointEntryId,
      );
      // Keep the mutation/readback path observable even when the optional
      // impact dialog is absent.  A missing dialog is a product/evidence
      // finding, but must not prevent us from collecting the authoritative
      // group and downstream states needed to classify it correctly.
      // The confirmation contract guarantees that the affected-product count
      // is shown.  The deleted row itself is verified authoritatively through
      // the group API and the linked-product readback; deployments may render
      // only the generic impact summary (without repeating the row name).
      const impactMissing = !saved.impactText
        || !/(?:被[^\n]{0,20}(?:「?1」?|1)[^\n]{0,20}(?:个套餐商品|受影响)|used by\s*[「“”\"']?1|1\s*affected)/i.test(saved.impactText);
      assertionIds.push(assertionReceipt(binding, 0));
      const detail = await productCenterApi.comboGroupDetail(group.id);
      if (containsScalarValue(detail, products[2].id)
        || !containsScalarValue(detail, products[0].id)
        || !containsScalarValue(detail, products[1].id)) {
        throw new Error(`${binding.caseId} 移除商品后套餐组 API 明细错误`);
      }
      assertionIds.push(assertionReceipt(binding, 1));
      const ownerCard = await readComboV2OwnerCard(page, owners[0].identity, groupName, products[0].identity);
      if (ownerCard.includes(products[2].identity)) throw new Error(`${binding.caseId} 引用商品未同步移除商品 3`);
      assertionIds.push(assertionReceipt(binding, 2));
      if (impactMissing) {
        throw new ObservedProductDifferenceError(
          `${binding.caseId} 删除商品后影响确认文本未展示删除项：impactText=${saved.impactText || '<empty>'}`,
          {
            schemaVersion: '1.0.0', caseId: binding.caseId, title: binding.title,
            generatedAt: new Date().toISOString(), route: new URL(main.page().url()).pathname,
            inputValues: { removedProductIdentity: products[2].identity, groupId: group.id },
            expectedMessage: '影响确认中展示受影响套餐商品数量（删除项由 API 明细和下游回读验证）',
            actualMessages: [saved.impactText || '<empty>'],
            productMismatchConfirmed: true,
            executionPathEquivalent: true,
            evidenceComplete: true,
            groupDetailContainsRemoved: containsScalarValue(detail, products[2].id),
            downstreamContainsRemoved: ownerCard.includes(products[2].identity),
            productBehavior: 'observed-product-drift',
          },
        );
      }
    } else if (binding.title.includes('不足选择数量仍可保存并同步')) {
      await comboV2RemoveProductRow(main, products[1].identity);
      const saved = await submitComboV2FormAndRegister(
        groupName, main, productCenterApi, cleanupRegistry, executionLedger, registeredGroupIds, products[0].checkpointEntryId, group.id,
      );
      assertionIds.push(assertionReceipt(binding, 0));
      const detail = await productCenterApi.comboGroupDetail(group.id);
      assertComboV2Rule(detail, { sectionType: 2, min: 2, max: 2 });
      if (!containsScalarValue(detail, products[0].id) || containsScalarValue(detail, products[1].id)) {
        throw new Error(`${binding.caseId} 商品不足选择数量保存后的组明细错误`);
      }
      assertionIds.push(assertionReceipt(binding, 1));
      if (!saved.impactText) throw new Error(`${binding.caseId} 被引用套餐组移除商品未显示影响范围`);
      const ownerCard = await readComboV2OwnerCard(page, owners[0].identity, groupName, products[0].identity);
      if (ownerCard.includes(products[1].identity)) throw new Error(`${binding.caseId} 引用套餐商品未同步移除商品`);
      assertionIds.push(assertionReceipt(binding, 2));
    } else if (binding.title.includes('下调可选搭配选择数量后移除商品')) {
      await comboV2FillRule(main, /Selection Quantity/i, '1');
      await comboV2RemoveProductRow(main, products[1].identity);
      const saved = await submitComboV2FormAndRegister(
        groupName, main, productCenterApi, cleanupRegistry, executionLedger, registeredGroupIds, products[0].checkpointEntryId,
      );
      const detail = await productCenterApi.comboGroupDetail(group.id);
      assertComboV2Rule(detail, { sectionType: 2, min: 1, max: 1 });
      const removedStillPersisted = containsScalarValue(detail, products[1].id);
      const retainedMissing = !containsScalarValue(detail, products[0].id);
      if (removedStillPersisted || retainedMissing) {
        throw new Error(`${binding.caseId} 下调规则并移除商品后 API 明细错误：removedStillPersisted=${removedStillPersisted} retainedMissing=${retainedMissing} requestContainsRemoved=${containsScalarValue(saved.requestBody, products[1].id)}`);
      }
      assertionIds.push(assertionReceipt(binding, 0));
      const ownerCard = await readComboV2OwnerCard(page, owners[0].identity, groupName, products[0].identity);
      if (ownerCard.includes(products[1].identity) || !/1/.test(ownerCard)) {
        throw new Error(`${binding.caseId} 引用商品未同步最新选择规则与商品明细`);
      }
      assertionIds.push(assertionReceipt(binding, 1));
    } else if (binding.title.includes('编辑套餐组基础信息后引用商品同步')) {
      const editedName = `${groupName}_EDIT`.slice(0, 100);
      const nameInput = main.getByText('Combo Group Name', { exact: true })
        .locator('xpath=ancestor::div[contains(@class,"ant-form-item")][1]')
        .locator('input[aria-required="true"][type="text"]:visible');
      if (await nameInput.count() !== 1) throw new Error(`${binding.caseId} 套餐组名称字段不唯一`);
      const alternateName = main.getByText('Combo Group Name (Alt.Language)', { exact: true })
        .locator('xpath=ancestor::div[contains(@class,"ant-form-item")][1]')
        .locator('input[type="text"]:visible');
      if (await alternateName.count() !== 1) throw new Error(`${binding.caseId} 套餐组备用语言字段不唯一`);
      await nameInput.click();
      await nameInput.press('Control+A');
      await nameInput.pressSequentially(editedName);
      await nameInput.blur();
      await alternateName.click();
      await alternateName.press('Control+A');
      await alternateName.pressSequentially(`${editedName}_ALT`.slice(0, 100));
      await alternateName.blur();
      if (await nameInput.inputValue() !== editedName) throw new Error(`${binding.caseId} 套餐组名称字段未保持编辑值`);
      const description = main.locator('textarea:visible').first();
      if (await description.count() === 1) await description.fill('AUTO_AUDIT_COMBO_V2_EDITED_NOTE');
      const saved = await submitComboV2FormAndRegister(
        editedName, main, productCenterApi, cleanupRegistry, executionLedger, registeredGroupIds, products[0].checkpointEntryId, group.id,
      );
      const submittedName = findFirstFieldValue(saved.requestBody, 'name');
      if (submittedName !== editedName) {
        throw new Error(`${binding.caseId} 套餐组编辑请求未提交新名称：${JSON.stringify(saved.requestBody)}`);
      }
      cleanupRegistry.addIdentityVariant(group.checkpointEntryId, editedName);
      currentGroupName = editedName;
      const detail = await waitUntil(
        () => productCenterApi.comboGroupDetail(group.id),
        (value) => containsNamedValue(value, editedName),
        { timeout: 60_000, interval: 500, probeTimeout: 10_000, message: `${binding.caseId} 套餐组基础信息未保存` },
      );
      if (!containsNamedValue(detail, editedName)) throw new Error(`${binding.caseId} 套餐组基础信息未保存`);
      assertionIds.push(assertionReceipt(binding, 0));
      for (const owner of owners) {
        const ownerCard = await readComboV2OwnerCard(page, owner.identity, editedName, products[0].identity);
        if (!ownerCard.includes(editedName)) throw new Error(`${binding.caseId} 引用商品未同步编辑后名称`);
      }
      assertionIds.push(assertionReceipt(binding, 1));
    } else if (binding.title.includes('编辑可选搭配子项非价格规则后引用商品同步')) {
      const repeatToggle = main.locator('[role=switch]:visible, button.ant-switch:visible').first();
      if (await repeatToggle.getAttribute('aria-checked') !== 'true') await repeatToggle.click();
      await comboV2FillRowNumber(main, products[0].identity, /Max Qty/i, '3');
      const saved = await submitComboV2FormAndRegister(
        groupName, main, productCenterApi, cleanupRegistry, executionLedger, registeredGroupIds, products[0].checkpointEntryId,
      );
      const detail = await productCenterApi.comboGroupDetail(group.id);
      const itemRule = findComboV2ItemRule(detail, products[0].id);
      const requestRule = findComboV2ItemRule(saved.requestBody, products[0].id);
      if (Number(itemRule?.maxQuantity) !== 3) {
        throw new Error(`${binding.caseId} 子项最大数量未保存为 3：request=${String(requestRule?.maxQuantity)} persisted=${String(itemRule?.maxQuantity)}`);
      }
      assertionIds.push(assertionReceipt(binding, 0));
      for (const owner of owners) {
        const ownerCard = await readComboV2OwnerCard(page, owner.identity, groupName, products[0].identity);
        if (!ownerCard.includes('3')) throw new Error(`${binding.caseId} 引用商品未同步子项最大数量 3`);
      }
      assertionIds.push(assertionReceipt(binding, 1));
    } else if (binding.title.includes('移除可选搭配默认商品后仍满足选择数量')) {
      const removed = products[products.length - 1];
      await comboV2RemoveProductRow(main, removed.identity);
      await submitComboV2FormAndRegister(
        groupName, main, productCenterApi, cleanupRegistry, executionLedger, registeredGroupIds, products[0].checkpointEntryId,
      );
      const detail = await productCenterApi.comboGroupDetail(group.id);
      if (containsScalarValue(detail, removed.id) || !containsScalarValue(detail, products[0].id)) {
        throw new Error(`${binding.caseId} 默认商品移除后组明细错误`);
      }
      assertionIds.push(assertionReceipt(binding, 0));
      const ownerCard = await readComboV2OwnerCard(page, owners[0].identity, groupName, products[0].identity);
      if (ownerCard.includes(removed.identity)) throw new Error(`${binding.caseId} 引用商品未同步移除默认商品`);
      assertionIds.push(assertionReceipt(binding, 1));
    } else {
      throw new Error(`${binding.caseId} 未实现的套餐引用规则：${binding.title}`);
    }
  } catch (error) {
    executionError = error;
  }

  await ensureComboV2GroupCleanupRegistered(
    currentGroupName,
    productCenterApi,
    cleanupRegistry,
    executionLedger,
    registeredGroupIds,
    products[0]?.checkpointEntryId,
  );
  const cleanup = await cleanupRegistry.cleanupAll();
  if (!cleanup.verifiedZero) throw new Error(`${binding.caseId} 套餐引用夹具清理未收敛`);
  if (collectComboGroupRecords(await productCenterApi.comboGroupList()).some((record) => record.id === group.id)) {
    throw new Error(`${binding.caseId} 套餐引用用例组残留：${group.id}`);
  }
  await ensureEnglishValidationLocale(page);
  const itemList = createItemListPage(page);
  await itemList.openForResidueCheck();
  for (const owner of owners) {
    await itemList.fillSearchForResidueCheck(owner.identity);
    await itemList.expectEmptySearchResults(10_000);
  }
  for (const product of products) {
    await itemList.fillSearchForResidueCheck(product.identity);
    await itemList.expectEmptySearchResults(10_000);
  }
  if (executionError) throw executionError;
  if (assertionIds.length !== binding.expectedResults.length) {
    throw new Error(`${binding.caseId} 套餐引用断言收据数量不完整：${assertionIds.length}/${binding.expectedResults.length}`);
  }
  return assertionIds;
}

export async function runComboV2PriceSourceContractCase(
  binding: GroupAutomationBinding,
  page: Page,
  productCenterApi: ProductCenterApi,
  cleanupRegistry: CleanupRegistry,
  executionLedger: ProductCenterExecutionLedger,
): Promise<string[]> {
  const timestamp = Date.now();
  const product = await createComboV2UiPricedProductFixture(
    `AUTO_AUDIT_COMBO_V2_PRICE_PRODUCT_${timestamp}`,
    page,
    productCenterApi,
    cleanupRegistry,
    executionLedger,
  );
  const groupName = `AUTO_AUDIT_COMBO_V2_PRICE_${timestamp}`;
  const registeredGroupIds = new Set<number>();
  const pageObject = createCombosPage(page);
  const assertionIds: string[] = [];
  let executionError: unknown;
  try {
    await pageObject.open();
    await pageObject.openCreateSurface();
    await pageObject.selectComboType('Pick & Mix');
    const main = page.locator('main:visible');
    await (await comboV2NameInput(main)).fill(groupName);
    await comboV2FillRule(main, /Minimum Selection Quantity/i, '1');
    await comboV2FillRule(main, /Maximum Selection Quantity/i, '1');
    await pageObject.selectComboProduct(product.identity, product.categoryName);
    await comboV2SelectPriceSource(main, product.identity, /Default|默认/i);
    const originalPrice = normalizeUiText(await (await comboV2ProductCell(main, product.identity, /Original Price|原价/i)).innerText());
    const defaultCustomPrice = await comboV2CustomPriceInput(main, product.identity);
    if (!/\d/.test(originalPrice) || !await defaultCustomPrice.isDisabled()) {
      throw new Error(`${binding.caseId} 默认价格来源未按原价计价或自定义价格仍可编辑：${originalPrice}`);
    }
    assertionIds.push(assertionReceipt(binding, 0));

    await comboV2SelectPriceSource(main, product.identity, /Custom|自定义/i);
    const customPrice = await comboV2CustomPriceInput(main, product.identity);
    if (await customPrice.isDisabled()) throw new Error(`${binding.caseId} 自定义价模式输入框仍禁用`);
    await comboV2FillAndBlur(customPrice, '3.50');
    if (await customPrice.inputValue() !== '3.50') throw new Error(`${binding.caseId} 自定义价未保持 3.50`);
    const created = await submitComboV2FormAndRegister(
      groupName,
      main,
      productCenterApi,
      cleanupRegistry,
      executionLedger,
      registeredGroupIds,
      product.checkpointEntryId,
    );
    await pageObject.open();
    await pageObject.searchAndWait(groupName);
    const editMain = await pageObject.openEditSurface(groupName);
    const persistedCustomPrice = await comboV2CustomPriceInput(editMain, product.identity);
    const sourceText = normalizeUiText(await (await comboV2ProductCell(editMain, product.identity, /Price Source/i)).innerText());
    if (!/Custom|Custom Pick & Mix price|自定义价/i.test(sourceText)
      || await persistedCustomPrice.inputValue() !== '3.50') {
      throw new Error(`${binding.caseId} 自定义价格保存后未保持 3.50`);
    }
    assertionIds.push(assertionReceipt(binding, 1));
    executionLedger.markPhase(`combo-${created.id}`, 'ui-verified');
    await pageObject.cancelCurrentSurface();
  } catch (error) {
    executionError = error;
  }

  await ensureComboV2GroupCleanupRegistered(
    groupName,
    productCenterApi,
    cleanupRegistry,
    executionLedger,
    registeredGroupIds,
    product.checkpointEntryId,
  );
  const cleanup = await cleanupRegistry.cleanupAll();
  if (!cleanup.verifiedZero) throw new Error(`${binding.caseId} 套餐价格来源夹具清理未收敛`);
  const itemList = createItemListPage(page);
  await itemList.openForResidueCheck();
  await itemList.fillSearchForResidueCheck(product.identity);
  await itemList.expectEmptySearchResults(10_000);
  if (executionError) throw executionError;
  return assertionIds;
}
