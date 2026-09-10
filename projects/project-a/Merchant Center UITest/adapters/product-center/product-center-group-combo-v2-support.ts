import fs from 'node:fs';
import path from 'node:path';
import { test, type Page } from '@playwright/test';
import type { CleanupRegistry } from '../../api/product-center/cleanup-registry';
import type { ProductCenterApi } from '../../api/product-center/product-center-api';
import type { ProductCenterExecutionLedger } from '../../api/product-center/execution-ledger';
import { extractCreatedRecord } from '../../api/product-center/created-record';
import { GroupListPage } from '../../pages/product-management/group-list.page';
import { SidebarPage } from '../../pages/sidebar.page';
import { createCombosPage } from '../../pages/product-management/group-list.factory';
import { ProductCenterItemCreateDataFactory } from '../../test-data/product-center/product-center-item-create-data.factory';
import { ItemCreateFlow } from '../../flows/item-create.flow';
import { createItemListPage } from '../../pages/product-management/item/item-list.page';
import { ItemCreateComboPage } from '../../pages/product-management/item/item-create-combo.page';
import { ItemEditComboPage, ItemEditStandardPage } from '../../pages/product-management/item/item-edit.page';
import { type GroupAutomationBinding } from '../../utils/product-center-group-automation';
import { waitUntil } from '../../utils/wait';
import type { RuntimeAssertionReceipt } from '../../automation/system-test/system-test-runtime-contract';
import { containsNamedValue, containsScalarValue, namedRecords, normalizeUiText, readFirstSkuId, requireGroupRecord } from '../../utils/product-center-group-runner-helpers';

function readFirstSalePrice(value: unknown): number | undefined {
  if (Array.isArray(value)) {
    for (const item of value) {
      const price = readFirstSalePrice(item);
      if (price !== undefined) return price;
    }
    return undefined;
  }
  if (!value || typeof value !== 'object') return undefined;
  const record = value as Record<string, unknown>;
  if (record.salePrice !== undefined && Number.isFinite(Number(record.salePrice))) {
    return Number(record.salePrice);
  }
  for (const child of Object.values(record)) {
    const price = readFirstSalePrice(child);
    if (price !== undefined) return price;
  }
  return undefined;
}

export function groupUiAssertionReceipt(
  binding: GroupAutomationBinding,
  expectedResultIndex: number,
  actualValue: unknown,
  status: RuntimeAssertionReceipt['status'],
): RuntimeAssertionReceipt {
  return {
    claimId: assertionReceipt(binding, expectedResultIndex),
    status,
    expectedValue: binding.expectedResults[expectedResultIndex],
    actualValue,
    actualStatus: 'observed',
    observationChannel: 'ui',
    authority: 'user-visible',
    comparison: status === 'verified' ? 'matched' : 'mismatched',
  };
}

export async function createComboV2ReferenceOwner(
  identity: string,
  groupName: string,
  page: Page,
  productCenterApi: ProductCenterApi,
  cleanupRegistry: CleanupRegistry,
  executionLedger: ProductCenterExecutionLedger,
): Promise<{ identity: string; checkpointEntryId: string }> {
  const form = new ItemCreateComboPage(page);
  await form.open();
  await form.fillItemName(identity);
  await form.clickAdvancedSettings();
  await form.fillMinimumOrderQuantity('1');
  await form.selectCustomComboGroupByName(groupName);
  await form.fillStandardPrice('10.00');
  const responsePromise = page.waitForResponse((response) => (
    response.request().method() === 'POST'
    && /\/ops-brand\/brand-items\/combo$/.test(new URL(response.url()).pathname)
  ), { timeout: 60_000 });
  await form.clickSave();
  const response = await responsePromise;
  if (!response.ok()) throw new Error(`套餐引用商品 ${identity} 创建失败 HTTP ${response.status()}`);
  const responseBody = await response.json().catch(() => null);
  const itemFactory = new ProductCenterItemCreateDataFactory(productCenterApi);
  const record = await itemFactory.registerCreated({
    entityKey: 'item',
    productType: 'combo',
    originalIdentity: identity,
    price: '10.00',
    minimumOrderQuantity: '1',
    customComboGroupName: groupName,
  }, responseBody, cleanupRegistry);
  executionLedger.markPhase(record.checkpointEntryId, 'api-verified');
  return { identity, checkpointEntryId: record.checkpointEntryId };
}

export async function readComboV2OwnerCard(
  page: Page,
  ownerIdentity: string,
  groupName: string,
  productIdentity: string,
): Promise<string> {
  await ensureEnglishValidationLocale(page);
  const list = createItemListPage(page);
  await list.open();
  await list.waitForIndexedItem(ownerIdentity, 60_000);
  await list.clickVisibleItemName(ownerIdentity);
  const edit = new ItemEditComboPage(page);
  await edit.expectLoaded();
  return (await edit.readCustomComboCardBoundary(groupName, productIdentity)).cardText;
}

export async function comboV2RemoveProductRow(main: ReturnType<Page['locator']>, identity: string): Promise<void> {
  const table = await comboV2ProductTable(main, identity);
  const row = table.locator('tbody tr:visible').filter({ hasText: identity });
  if (await row.count() !== 1) throw new Error(`待移除套餐商品行不唯一：${identity}`);
  const remove = row.locator('button[aria-label="delete"]:visible, [aria-label="delete"]:visible').last();
  if (await remove.count() !== 1) throw new Error(`套餐商品 ${identity} 缺少删除操作`);
  await remove.click();
  const dialog = main.page().locator('[role=dialog]:visible').last();
  if (await dialog.isVisible().catch(() => false)) {
    const confirm = dialog.locator('button.ant-btn-primary:visible').last();
    if (await confirm.count() === 1) await confirm.click();
  }
  await row.waitFor({ state: 'detached', timeout: 10_000 }).catch(async () => row.waitFor({ state: 'hidden', timeout: 10_000 }));
}

export async function comboV2ExpectSingleProductDeleteBlocked(
  main: ReturnType<Page['locator']>,
  identity: string,
  expectedMessage: string,
): Promise<void> {
  const table = await comboV2ProductTable(main, identity);
  const row = table.locator('tbody tr:visible').filter({ hasText: identity });
  if (await row.count() !== 1) throw new Error(`唯一套餐商品行不唯一：${identity}`);
  const remove = row.locator('button[aria-label="delete"]:visible, [aria-label="delete"]:visible').last();
  if (await remove.count() !== 1) throw new Error(`唯一套餐商品 ${identity} 缺少删除操作`);
  await remove.click();
  const dialog = main.page().locator('[role=dialog]:visible').filter({ hasText: expectedMessage });
  await dialog.waitFor({ state: 'visible', timeout: 10_000 });
  const text = normalizeUiText(await dialog.innerText());
  if (!text.includes(expectedMessage)) throw new Error(`唯一套餐商品删除提示不精确：expected=${expectedMessage} actual=${text}`);
  const confirm = dialog.locator('button.ant-btn-primary:visible').last();
  if (await confirm.count() !== 1) throw new Error('唯一套餐商品删除提示确认按钮不唯一');
  await confirm.click();
  await dialog.waitFor({ state: 'hidden', timeout: 10_000 });
  if (await row.count() !== 1 || !await row.isVisible()) throw new Error(`唯一套餐商品删除后未保留：${identity}`);
}

export async function comboV2SelectPriceSource(
  main: ReturnType<Page['locator']>,
  identity: string,
  optionLabel: RegExp,
): Promise<void> {
  const cell = await comboV2ProductCell(main, identity, /Price Source|价格来源/i);
  const select = cell.locator('.ant-select:visible');
  if (await select.count() !== 1) throw new Error(`套餐商品 ${identity} 价格来源选择框不唯一`);
  await select.click();
  const customPrice = /Custom|自定义/i.test(optionLabel.source);
  const expectedOption = customPrice ? /^(Custom|自定义)$/i : /^(Default|默认)$/i;
  const expectedCellText = customPrice ? /Custom|自定义/i : /Default|默认/i;
  const options = main.page().locator('.ant-select-dropdown:visible').last()
    .locator('.ant-select-item-option:visible').filter({ hasText: expectedOption });
  await waitUntil(
    () => options.count(),
    (count) => count === 1,
    { timeout: 10_000, interval: 100, message: `套餐商品 ${identity} 价格来源选项未收敛：${expectedOption}` },
  );
  const option = options.last();
  await option.click();
  await waitUntil(
    () => cell.innerText(),
    (text) => expectedCellText.test(normalizeUiText(text)),
    { timeout: 10_000, interval: 100, message: `套餐商品 ${identity} 价格来源未切换：${expectedCellText}` },
  );
}

export async function comboV2CustomPriceInput(
  main: ReturnType<Page['locator']>,
  identity: string,
): Promise<ReturnType<Page['locator']>> {
  const cell = await comboV2ProductCell(main, identity, /Custom Price/i);
  const input = cell.locator('input:visible').last();
  if (await input.count() !== 1) throw new Error(`套餐商品 ${identity} 自定义价输入框不唯一`);
  return input;
}

async function updateComboV2ProductPrice(
  page: Page,
  identity: string,
  productId: number,
  price: string,
  productCenterApi: ProductCenterApi,
): Promise<void> {
  const list = createItemListPage(page);
  await list.open();
  await list.waitForIndexedItem(identity);
  await list.clickVisibleItemName(identity);
  const edit = new ItemEditStandardPage(page);
  await edit.expectLoaded();
  await edit.fillStandardPrice(price);
  const waitForUpdateResponse = () => page.waitForResponse((response) => (
    ['POST', 'PUT', 'PATCH'].includes(response.request().method())
    && new RegExp(`/ops-brand/brand-items/standard(?:/${productId})?$`).test(new URL(response.url()).pathname)
  ), { timeout: 60_000 });
  const responsePromise = waitForUpdateResponse();
  await edit.clickSave();
  const continueSaving = page.getByRole('button', { name: /Continue Saving/i });
  const firstTerminal = await Promise.race([
    responsePromise.then(() => 'response' as const),
    continueSaving.waitFor({ state: 'visible', timeout: 10_000 }).then(() => 'confirm' as const),
  ]);
  if (firstTerminal === 'confirm') await continueSaving.click();
  const response = await responsePromise;
  if (!response.ok()) throw new Error(`标准商品 ${identity} 改价失败 HTTP ${response.status()}`);
  const persistedPrice = await waitUntil(
    () => productCenterApi.productDetail(productId).then(readFirstSalePrice),
    (value) => value === Number(price),
    { timeout: 30_000, interval: 500, message: `标准商品 ${identity} 改价未落库为 ${price}` },
  );
  if (persistedPrice !== Number(price)) {
    throw new Error(`标准商品 ${identity} 改价落库值错误：${String(persistedPrice)}`);
  }
}

export function findComboV2ItemRule(detail: unknown, itemId: number): Record<string, unknown> | undefined {
  const record = findComboV2DetailRecord(detail);
  if (!record || !Array.isArray(record.sectionItemList)) return undefined;
  const item = record.sectionItemList.find((candidate) => containsScalarValue(candidate, itemId));
  if (!item || typeof item !== 'object') return undefined;
  const selectionRule = (item as Record<string, unknown>).selectionRule;
  return selectionRule && typeof selectionRule === 'object' ? selectionRule as Record<string, unknown> : undefined;
}

export function buildComboV2BoundaryName(
  timestamp: number,
  type: 'Fixed Combo' | 'Optional Combo' | 'Pick & Mix',
): string {
  const typeToken = type === 'Fixed Combo' ? 'FIXED' : type === 'Optional Combo' ? 'OPTIONAL' : 'PICK_MIX';
  const prefix = `AUTO_AUDIT_COMBO V2_NAME_${typeToken}_${timestamp}_`;
  return `${prefix}${'X'.repeat(Math.max(0, 100 - Array.from(prefix).length))}`.slice(0, 100);
}

export async function comboV2NameInput(main: ReturnType<Page['locator']>): Promise<ReturnType<Page['locator']>> {
  const input = main.locator('input[aria-required="true"][type="text"]:visible').first();
  if (await input.count() !== 1) throw new Error('套餐组名称字段不唯一');
  return input;
}

export function comboV2SectionType(type: 'Fixed Combo' | 'Optional Combo' | 'Pick & Mix'): 1 | 2 | 5 {
  if (type === 'Fixed Combo') return 1;
  if (type === 'Optional Combo') return 2;
  return 5;
}

export async function comboV2RuleInput(
  main: ReturnType<Page['locator']>,
  label: RegExp,
): Promise<ReturnType<Page['locator']>> {
  const rows = main.locator('[class*="ruleRow"]:visible').filter({ hasText: label });
  const rowCount = await waitUntil(
    () => rows.count(),
    (count) => count === 1,
    { timeout: 10_000, interval: 100, message: `套餐规则字段未收敛为唯一可见字段：${label}` },
  );
  if (rowCount !== 1) throw new Error(`套餐规则字段不唯一：${label}`);
  const inputs = rows.first().locator('input[role="spinbutton"]:visible');
  const inputCount = await waitUntil(
    () => inputs.count(),
    (count) => count === 1,
    { timeout: 10_000, interval: 100, message: `套餐规则字段输入框未收敛：${label}` },
  );
  if (inputCount !== 1) throw new Error(`套餐规则字段缺少唯一输入框：${label}`);
  return inputs.first();
}

export async function comboV2FillAndBlur(input: ReturnType<Page['locator']>, value: string): Promise<void> {
  await input.fill(value);
  await input.blur();
  await waitUntil(
    () => input.inputValue(),
    () => true,
    { timeout: 2_000, interval: 50, message: `套餐数量字段未完成归一化：${value}` },
  );
}

export async function selectComboV2Products(
  pageObject: ReturnType<typeof createCombosPage>,
  products: readonly ComboV2ProductFixture[],
): Promise<void> {
  for (const [index, product] of products.entries()) {
    await pageObject.selectComboProduct(product.identity, product.categoryName, {
      preserveExistingIdentities: products.slice(0, index).map((item) => item.identity),
    });
  }
}

export async function comboV2FillRule(main: ReturnType<Page['locator']>, label: RegExp, value: string): Promise<void> {
  await comboV2FillAndBlur(await comboV2RuleInput(main, label), value);
}

async function comboV2ProductTable(
  main: ReturnType<Page['locator']>,
  identity: string,
): Promise<ReturnType<Page['locator']>> {
  const identityControl = main.getByText(identity, { exact: true });
  const table = identityControl.locator('xpath=ancestor::table[1]');
  const tableCount = await waitUntil(
    () => table.count(),
    (count) => count === 1,
    { timeout: 30_000, interval: 100, message: `套餐商品表未加载完成：${identity}` },
  );
  if (tableCount !== 1) {
    const details = await table.evaluateAll((tables) => tables.map((element) => ({
      className: element.className,
      headers: Array.from(element.querySelectorAll('thead th')).map((cell) => cell.textContent?.trim() ?? ''),
      text: element.textContent?.trim().slice(0, 500) ?? '',
    })));
    throw new Error(`套餐商品表不唯一：${identity}；候选=${JSON.stringify(details)}`);
  }
  return table;
}

export async function comboV2ProductCell(
  main: ReturnType<Page['locator']>,
  identity: string,
  header: RegExp,
): Promise<ReturnType<Page['locator']>> {
  const table = await comboV2ProductTable(main, identity);
  const headers = (await table.locator('thead th').allInnerTexts()).map((value) => normalizeUiText(value));
  const index = headers.findIndex((value) => header.test(value));
  if (index < 0) throw new Error(`套餐商品表缺少列：${header}，实际=${headers.join(' | ')}`);
  const row = table.locator('tbody tr:visible').filter({ hasText: identity });
  if (await row.count() !== 1) throw new Error(`套餐商品行不唯一：${identity}`);
  return row.locator('td').nth(index);
}

export async function comboV2ProductHeaders(
  main: ReturnType<Page['locator']>,
  identity: string,
  expected: readonly RegExp[],
): Promise<string[]> {
  const table = await comboV2ProductTable(main, identity);
  return waitUntil(
    () => table.locator('thead th').allInnerTexts()
      .then((values) => values.map((value) => normalizeUiText(value))),
    (headers) => expected.every((pattern) => headers.some((header) => pattern.test(header))),
    {
      timeout: 10_000,
      interval: 100,
      message: `套餐商品表头未完成加载：${expected.map(String).join(', ')}`,
    },
  );
}

export async function comboV2FillRowNumber(
  main: ReturnType<Page['locator']>,
  identity: string,
  header: RegExp,
  value: string,
): Promise<void> {
  const cell = await comboV2ProductCell(main, identity, header);
  const input = cell.locator('input:visible').last();
  if (await input.count() !== 1) throw new Error(`套餐商品 ${identity} 的 ${header} 输入框不唯一`);
  await comboV2FillAndBlur(input, value);
  const actualValue = await input.inputValue();
  if (actualValue !== value) {
    const attributes = await input.evaluate((element) => ({
      type: element.getAttribute('type'),
      min: element.getAttribute('min'),
      max: element.getAttribute('max'),
      step: element.getAttribute('step'),
      ariaInvalid: element.getAttribute('aria-invalid'),
    }));
    throw new Error(`套餐商品 ${identity} 的 ${header} 未保持 ${value}，实际=${actualValue}，属性=${JSON.stringify(attributes)}`);
  }
}

export async function comboV2SetRowDefault(
  main: ReturnType<Page['locator']>,
  identity: string,
  selected: boolean,
): Promise<void> {
  const cell = await comboV2ProductCell(main, identity, /^(Default|默认选中)(\s*\*)?$/i);
  const toggle = cell.locator('button[role="switch"]');
  if (await toggle.count() === 1) {
    const current = await toggle.getAttribute('aria-checked') === 'true';
    if (current !== selected) await toggle.click();
    if ((await toggle.getAttribute('aria-checked') === 'true') !== selected) {
      throw new Error(`套餐商品 ${identity} 默认开关状态错误`);
    }
    return;
  }
  const checkbox = cell.locator('input[type="checkbox"], input[type="radio"]');
  if (await checkbox.count() !== 1) throw new Error(`套餐商品 ${identity} 默认选择控件不唯一`);
  const wrapper = checkbox.locator('xpath=ancestor::label[1]');
  if (selected && !await checkbox.isChecked()) {
    if (await wrapper.count() === 1) await wrapper.click();
    else await checkbox.check();
  }
  if (!selected && await checkbox.isChecked()) {
    if (await wrapper.count() === 1) await wrapper.click();
    else await checkbox.uncheck();
  }
  if (await checkbox.isChecked() !== selected) throw new Error(`套餐商品 ${identity} 默认选中状态错误`);
}

export async function submitComboV2FormAndRegister(
  identity: string,
  main: ReturnType<Page['locator']>,
  productCenterApi: ProductCenterApi,
  cleanupRegistry: CleanupRegistry,
  executionLedger: ProductCenterExecutionLedger,
  registeredGroupIds: Set<number>,
  dependencyOf?: string,
  expectedExistingId?: number,
): Promise<{ id: number; sectionType: number; impactText: string; requestBody: unknown }> {
  const submit = main.getByRole('button', { name: /^(Confirm|确\s*定)$/i });
  if (await submit.count() !== 1 || !await submit.isEnabled()) throw new Error(`套餐组 ${identity} 提交按钮不可用`);
  const responsePromise = main.page().waitForResponse((response) => (
    ['POST', 'PUT', 'PATCH'].includes(response.request().method())
    && /\/ops-brand\/brand-sections(?:\/\d+)?$/.test(new URL(response.url()).pathname)
  ), { timeout: 60_000 });
  await submit.click();
  const impactDialog = main.page().locator('[role=dialog]:visible').last();
  const firstTerminal = await Promise.race([
    responsePromise.then(() => 'response' as const),
    impactDialog.waitFor({ state: 'visible', timeout: 2_000 }).then(() => 'dialog' as const).catch(() => 'none' as const),
  ]);
  let impactText = '';
  if (firstTerminal === 'dialog') {
    impactText = normalizeUiText(await impactDialog.innerText());
    const confirm = impactDialog.locator('button.ant-btn-primary:visible').last();
    if (await confirm.count() !== 1) throw new Error(`套餐组 ${identity} 影响确认按钮不唯一`);
    await confirm.click();
  }
  const response = await responsePromise;
  if (!response.ok()) throw new Error(`套餐组 ${identity} 保存失败 HTTP ${response.status()}`);
  const requestBody = response.request().postDataJSON();
  const record = await waitUntil(
    async () => {
      if (expectedExistingId !== undefined) {
        const detail = await productCenterApi.comboGroupDetail(expectedExistingId);
        const detailRecord = findComboV2DetailRecord(detail);
        const sectionType = Number(detailRecord?.sectionType ?? detailRecord?.type);
        if (!Number.isFinite(sectionType)) return undefined;
        return { id: expectedExistingId, name: identity, sectionType };
      }
      const records = collectComboGroupRecords(await productCenterApi.comboGroupList())
        .filter((candidate) => candidate.name === identity);
      return records.length === 1 ? records[0] : undefined;
    },
    (candidate): candidate is { id: number; name: string; sectionType: number } => candidate !== undefined,
    { timeout: 60_000, interval: 500, probeTimeout: 10_000, message: `套餐组 ${identity} 保存后 API 未找到唯一记录` },
  );
  if (!record) throw new Error(`套餐组 ${identity} 保存后 API 未找到唯一记录`);
  await registerComboV2GroupCleanup(record, productCenterApi, cleanupRegistry, executionLedger, registeredGroupIds, dependencyOf);
  executionLedger.markPhase(`combo-${record.id}`, 'ui-verified');
  return { id: record.id, sectionType: record.sectionType, impactText, requestBody };
}

export async function submitComboV2FormExpectRejected(
  binding: GroupAutomationBinding,
  identity: string,
  main: ReturnType<Page['locator']>,
  productCenterApi: ProductCenterApi,
  expectedMessage?: RegExp,
): Promise<string> {
  const exactAuditMessage = binding.expectedUiFeedback?.exactMessage;
  if (!exactAuditMessage && !expectedMessage) {
    throw new Error(`${binding.caseId} 缺少提示审计合同，禁止执行精确错误提示断言`);
  }
  const submit = main.getByRole('button', { name: /^(Confirm|确\s*定)$/i });
  if (await submit.count() !== 1) throw new Error(`${binding.caseId} 套餐提交按钮不唯一`);
  const inputValues = {
    minimum: await comboRuleInputValue(main, /Minimum Selection Quantity|最少选择数量/i),
    maximum: await comboRuleInputValue(main, /Maximum Selection Quantity|最多选择数量/i),
  };
  const messages = main.page().locator(
    '.ant-form-item-explain-error:visible, .ant-message-error:visible, .ant-notification-notice-error:visible, [role=alert]:visible',
  );
  const baselineMessages = (await messages.allInnerTexts())
    .map((value) => normalizeUiText(value))
    .filter(Boolean);
  if (await submit.isEnabled()) await submit.click();
  const visibleText = await waitUntil(
    () => messages.allInnerTexts().then((values) => values.map((value) => normalizeUiText(value)).filter(Boolean)),
    (values) => values.some((value) => !baselineMessages.includes(value)),
    {
      timeout: 15_000,
      interval: 100,
      message: `${binding.caseId} 提交后未显示新增可见拦截反馈`,
    },
  );
  const actualMessages = visibleText.filter((value) => !baselineMessages.includes(value));
  const persisted = collectComboGroupRecords(await productCenterApi.comboGroupList()).filter((record) => record.name === identity);
  if (persisted.length !== 0) throw new Error(`${binding.caseId} 拒绝提交后产生套餐组记录：${identity}`);
  const matchedMessage = visibleText.find((value) => exactAuditMessage ? value === exactAuditMessage : expectedMessage?.test(value) === true);
  if (!matchedMessage) {
    throw new ObservedProductDifferenceError(
      `${binding.caseId} 页面实际提示与审计期望不一致：期望=${exactAuditMessage ?? expectedMessage}; 实际=${actualMessages.join(' | ')}`,
      {
        schemaVersion: '1.0.0',
        caseId: binding.caseId,
        title: binding.title,
        generatedAt: new Date().toISOString(),
        route: new URL(main.page().url()).pathname,
        inputValues,
        expectedMessage: exactAuditMessage ?? String(expectedMessage),
        actualMessages,
        submitEnabled: await submit.isEnabled(),
        persistedGroupIds: persisted.map((record) => record.id),
        productBehavior: 'observed-product-drift',
      },
    );
  }
  return matchedMessage;
}

export class ObservedProductDifferenceError extends Error {
  constructor(message: string, readonly evidence: Record<string, unknown>) {
    super(message);
    this.name = 'ObservedProductDifferenceError';
  }
}

export function readProductCenterGroupObservedDifferenceEvidence(error: unknown): Record<string, unknown> | null {
  return error instanceof ObservedProductDifferenceError ? error.evidence : null;
}

export async function ensureChineseValidationLocale(page: Page): Promise<void> {
  const sidebar = new SidebarPage(page);
  if (page.url() === 'about:blank') {
    const itemList = createItemListPage(page);
    await itemList.openForResidueCheck();
    await itemList.expectLoaded();
  }
  // A freshly navigated SaaS route can briefly render an empty document while
  // the shell/API bootstrap completes.  Do not interpret that transient state
  // as a missing locale control; wait for visible shell content and perform a
  // single idempotent reload before classifying the page as unavailable.
  const shellReady = async (): Promise<boolean> => page.evaluate(() => {
    const text = document.body?.innerText?.trim() ?? '';
    return text.length > 20 || Boolean(document.querySelector('a[href],button,[role="main"]'));
  }).catch(() => false);
  if (!(await shellReady())) {
    await waitUntil(shellReady, (ready) => ready, {
      timeout: 10_000,
      interval: 200,
      message: '商品中心页面外壳尚未加载完成。',
    }).catch(async () => {
      await page.reload({ waitUntil: 'domcontentloaded', timeout: 30_000 }).catch(() => undefined);
      await waitUntil(shellReady, (ready) => ready, {
        timeout: 20_000,
        interval: 200,
        message: `商品中心页面未加载完成：url=${page.url()}`,
      });
    });
  }
  const chineseMarker = page.getByRole('button', { name: /加料|套餐|确定|保存/ }).first();
  if (await chineseMarker.isVisible().catch(() => false)
    || await sidebar.isChineseAutomationLocale()) return;
  await sidebar.openLanguageMenu();
  await sidebar.selectChineseLanguage();
  await sidebar.expectChineseAutomationLocale();
}

export async function ensureEnglishValidationLocale(page: Page): Promise<void> {
  const sidebar = new SidebarPage(page);
  if (await sidebar.isEnglishAutomationLocale()) return;
  const itemList = createItemListPage(page);
  await itemList.openForResidueCheck();
  if (await sidebar.isEnglishAutomationLocale()) return;
  await sidebar.openLanguageMenu();
  await sidebar.selectEnglishLanguage();
  await sidebar.expectEnglishAutomationLocale();
  await itemList.expectLoaded();
}

export async function ensureComboV2GroupCleanupRegistered(
  identity: string,
  productCenterApi: ProductCenterApi,
  cleanupRegistry: CleanupRegistry,
  executionLedger: ProductCenterExecutionLedger,
  registeredGroupIds: Set<number>,
  dependencyOf?: string,
): Promise<void> {
  const records = collectComboGroupRecords(await productCenterApi.comboGroupList()).filter((record) => record.name === identity);
  for (const record of records) {
    await registerComboV2GroupCleanup(record, productCenterApi, cleanupRegistry, executionLedger, registeredGroupIds, dependencyOf);
  }
}

async function registerComboV2GroupCleanup(
  record: { id: number; name: string },
  productCenterApi: ProductCenterApi,
  cleanupRegistry: CleanupRegistry,
  executionLedger: ProductCenterExecutionLedger,
  registeredGroupIds: Set<number>,
  dependencyOf?: string,
): Promise<void> {
  if (registeredGroupIds.has(record.id)) return;
  registeredGroupIds.add(record.id);
  const checkpointEntryId = `combo-${record.id}`;
  cleanupRegistry.register({
    entity: '套餐组',
    identity: record.name,
    checkpoint: {
      entryId: checkpointEntryId,
      entityKind: 'combo',
      serverId: record.id,
      identityVariants: [record.name],
      cleanupOrder: 40,
      dependencyOf,
    },
    execute: async () => {
      const residue = collectComboGroupRecords(await productCenterApi.comboGroupList())
        .find((candidate) => candidate.id === record.id);
      if (residue) await productCenterApi.deleteComboGroup(record.id);
    },
    verify: async () => collectComboGroupRecords(await productCenterApi.comboGroupList())
      .every((candidate) => candidate.id !== record.id),
  });
  executionLedger.markPhase(checkpointEntryId, 'mutation-observed');
  executionLedger.markPhase(checkpointEntryId, 'api-verified');
}

export function assertComboV2Rule(
  detail: unknown,
  expected: { sectionType: 1 | 2 | 5; min: number; max: number; defaultQuantityTotal?: number },
): void {
  const record = findComboV2DetailRecord(detail);
  if (!record) throw new Error('套餐组详情缺少规则对象');
  const sectionType = Number(record.sectionType ?? record.type);
  const selectionRule = record.selectionRule && typeof record.selectionRule === 'object'
    ? record.selectionRule as Record<string, unknown>
    : {};
  const min = Number(selectionRule.min ?? selectionRule.minimumQuantity ?? selectionRule.minimumSelectionQuantity);
  const max = Number(selectionRule.max ?? selectionRule.maximumQuantity ?? selectionRule.maximumSelectionQuantity);
  if (sectionType !== expected.sectionType || min !== expected.min || max !== expected.max) {
    throw new Error(`套餐组规则回读错误：type=${sectionType}, min=${min}, max=${max}`);
  }
  if (expected.defaultQuantityTotal !== undefined) {
    const items = Array.isArray(record.sectionItemList) ? record.sectionItemList : [];
    const total = items.reduce((sum, item) => {
      if (!item || typeof item !== 'object') return sum;
      const itemRule = (item as Record<string, unknown>).selectionRule;
      if (!itemRule || typeof itemRule !== 'object') return sum;
      return sum + Number((itemRule as Record<string, unknown>).quantity ?? 0);
    }, 0);
    if (total !== expected.defaultQuantityTotal) {
      throw new Error(`套餐组默认数量合计错误：expected=${expected.defaultQuantityTotal}, actual=${total}`);
    }
  }
}

function findComboV2DetailRecord(value: unknown): Record<string, unknown> | undefined {
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findComboV2DetailRecord(item);
      if (found) return found;
    }
    return undefined;
  }
  if (!value || typeof value !== 'object') return undefined;
  const record = value as Record<string, unknown>;
  if ((record.sectionType !== undefined || record.type !== undefined) && record.selectionRule && record.sectionItemList) return record;
  for (const nested of Object.values(record)) {
    const found = findComboV2DetailRecord(nested);
    if (found) return found;
  }
  return undefined;
}

export function assertAddonGroupRule(
  detail: unknown,
  expected: { minimum: number; maximum: number; freeQuantity: number },
): void {
  const record = findAddonGroupRuleRecord(detail);
  if (!record) throw new Error('加料组详情缺少组级数量规则对象');
  const selectionRule = record.selectionRule as Record<string, unknown>;
  const pricingRule = record.pricingRule as Record<string, unknown>;
  const minimum = Number(selectionRule.min ?? selectionRule.minimumQuantity ?? selectionRule.minimumSelectionQuantity);
  const maximum = Number(selectionRule.max ?? selectionRule.maximumQuantity ?? selectionRule.maximumSelectionQuantity);
  const freeQuantity = Number(pricingRule.freeQuantity ?? pricingRule.free ?? pricingRule.freeCount);
  if (minimum !== expected.minimum || maximum !== expected.maximum || freeQuantity !== expected.freeQuantity) {
    throw new Error(`加料组规则回读错误：minimum=${minimum}, maximum=${maximum}, freeQuantity=${freeQuantity}`);
  }
}

function findAddonGroupRuleRecord(value: unknown): Record<string, unknown> | undefined {
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findAddonGroupRuleRecord(item);
      if (found) return found;
    }
    return undefined;
  }
  if (!value || typeof value !== 'object') return undefined;
  const record = value as Record<string, unknown>;
  if (record.selectionRule && typeof record.selectionRule === 'object'
    && record.pricingRule && typeof record.pricingRule === 'object'
    && Object.prototype.hasOwnProperty.call(record.pricingRule, 'freeQuantity')) {
    return record;
  }
  for (const nested of Object.values(record)) {
    const found = findAddonGroupRuleRecord(nested);
    if (found) return found;
  }
  return undefined;
}

export async function comboTypeSurfaceText(
  pageObject: GroupListPage,
  main: ReturnType<Page['locator']>,
  type: 'Fixed Combo' | 'Optional Combo' | 'Pick & Mix',
): Promise<string> {
  await pageObject.selectComboType(type);
  return normalizeUiText(await main.innerText());
}

export async function comboRuleInputValue(main: ReturnType<Page['locator']>, label: RegExp): Promise<string> {
  const rows = main.locator('[class*="ruleRow"]:visible').filter({ hasText: label });
  const rowCount = await waitUntil(
    () => rows.count(),
    (count) => count === 1,
    { timeout: 10_000, interval: 100, message: `套餐规则字段未收敛为唯一可见字段：${label}` },
  );
  if (rowCount !== 1) throw new Error(`套餐规则字段不唯一：${label}`);
  const inputs = rows.first().locator('input[role="spinbutton"]:visible');
  const inputCount = await waitUntil(
    () => inputs.count(),
    (count) => count === 1,
    { timeout: 10_000, interval: 100, message: `套餐规则字段输入框未收敛：${label}` },
  );
  if (inputCount !== 1) throw new Error(`套餐规则字段缺少唯一输入框：${label}`);
  return inputs.first().inputValue();
}

export function comboRuleSwitches(main: ReturnType<Page['locator']>): ReturnType<Page['locator']> {
  return main.locator('button[role="switch"][id^="selectionRule_"]:visible');
}

export function comboRuleSwitch(
  main: ReturnType<Page['locator']>,
  rule: 'repeatSelect' | 'mergeDisplay',
): ReturnType<Page['locator']> {
  return main.locator(`button[role="switch"][id="selectionRule_${rule}"]:visible`);
}

export type ComboV2ProductFixture = {
  identity: string;
  id: number;
  skuId: number;
  categoryName: string;
  checkpointEntryId: string;
};

export function writeProductCenterGroupEvidence(fileName: string, value: unknown): void {
  const projectRoot = path.resolve(__dirname, '..');
  const outputPath = path.join(projectRoot, 'output', fileName);
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  try {
    fs.writeFileSync(outputPath, `${JSON.stringify(value, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
  }
}

export async function createComboV2UiPricedProductFixture(
  identity: string,
  page: Page,
  productCenterApi: ProductCenterApi,
  cleanupRegistry: CleanupRegistry,
  executionLedger: ProductCenterExecutionLedger,
): Promise<ComboV2ProductFixture> {
  const responsePromise = page.waitForResponse((response) => (
    response.request().method() === 'POST'
    && /\/ops-brand\/brand-items\/standard$/.test(new URL(response.url()).pathname)
  ), { timeout: 60_000 });
  const form = await new ItemCreateFlow().openStandardCreateFromList(page);
  await form.fillItemName(identity);
  await form.selectCategoryPath('Special Offer', 'Special Offer01');
  await form.selectSingleSpec();
  await form.fillStandardPrice('1.00');
  await form.clickSave();
  const response = await responsePromise;
  if (!response.ok()) throw new Error(`套餐组价格商品 ${identity} 创建失败 HTTP ${response.status()}`);
  await createItemListPage(page).expectLoaded();
  const itemFactory = new ProductCenterItemCreateDataFactory(productCenterApi);
  const product = await itemFactory.registerCreated({
    entityKey: 'item',
    productType: 'standard',
    originalIdentity: identity,
    price: '1.00',
    minimumOrderQuantity: '1',
  }, await response.json().catch(() => null), cleanupRegistry);
  const detail = await productCenterApi.productDetail(product.id);
  const skuId = readFirstSkuId(detail);
  if (!skuId) throw new Error(`套餐组价格商品 ${identity} 缺少 SKU`);
  const persistedPrice = readFirstSalePrice(detail);
  if (persistedPrice !== 1) throw new Error(`套餐组价格商品 ${identity} 初始有效价错误：${String(persistedPrice)}`);
  executionLedger.markPhase(product.checkpointEntryId, 'api-verified');
  return {
    identity,
    id: product.id,
    skuId,
    categoryName: 'Special Offer',
    checkpointEntryId: product.checkpointEntryId,
  };
}

export async function createComboV2ProductFixture(
  identity: string,
  productCenterApi: ProductCenterApi,
  cleanupRegistry: CleanupRegistry,
  executionLedger: ProductCenterExecutionLedger,
): Promise<ComboV2ProductFixture> {
  const category = requireGroupRecord(namedRecords(await productCenterApi.categoryTree(), 'Special Offer')[0], 'Special Offer');
  const itemFactory = new ProductCenterItemCreateDataFactory(productCenterApi);
  const responseBody = await productCenterApi.createBomProduct(identity, category.id);
  const product = await itemFactory.registerCreated({
    entityKey: 'item',
    productType: 'standard',
    originalIdentity: identity,
    price: '1.00',
    minimumOrderQuantity: '1',
  }, responseBody, cleanupRegistry);
  const detail = await productCenterApi.productDetail(product.id);
  const skuId = readFirstSkuId(detail);
  if (!skuId) throw new Error(`套餐组商品 ${identity} 缺少 SKU`);
  await waitUntil(
    () => productCenterApi.productPage(identity),
    (value) => namedRecords(value, identity).some((candidate) => (
      Number((candidate as Record<string, unknown>).id) === product.id
    )),
    {
      timeout: 60_000,
      interval: 500,
      probeTimeout: 10_000,
      message: `套餐组商品 ${identity} 创建后未进入服务端商品索引`,
    },
  );
  executionLedger.markPhase(product.checkpointEntryId, 'api-verified');
  return {
    identity,
    id: product.id,
    skuId,
    categoryName: category.name,
    checkpointEntryId: product.checkpointEntryId,
  };
}

export async function createComboV2GroupFixture(
  input: {
    name: string;
    sectionType: 1 | 2 | 5;
    products: readonly ComboV2ProductFixture[];
    selectionRule?: Record<string, unknown>;
    pricingRule?: Record<string, unknown>;
    sectionItems?: readonly Record<string, unknown>[];
  },
  productCenterApi: ProductCenterApi,
  cleanupRegistry: CleanupRegistry,
  executionLedger: ProductCenterExecutionLedger,
): Promise<{ id: number; name: string; checkpointEntryId: string }> {
  if (input.products.length === 0) throw new Error(`套餐组 ${input.name} 缺少商品夹具`);
  const responseBody = await productCenterApi.createComboGroup({
    name: input.name,
    sectionType: input.sectionType,
    selectionRule: input.selectionRule,
    pricingRule: input.pricingRule,
    sectionItemList: input.sectionItems ?? input.products.map((product, index) => ({
      itemId: product.id,
      skuId: product.skuId,
      selectionRule: { quantity: 1, maxQuantity: 1 },
      defaultSelected: index === 0,
      sortOrder: index,
    })),
  });
  const record = extractCreatedRecord(responseBody, input.name)
    ?? collectComboGroupRecords(await productCenterApi.comboGroupList()).find((candidate) => candidate.name === input.name);
  if (!record) throw new Error(`套餐组创建后未找到：${input.name}`);
  const checkpointEntryId = `combo-${record.id}`;
  cleanupRegistry.register({
    entity: '套餐组',
    identity: input.name,
    checkpoint: {
      entryId: checkpointEntryId,
      entityKind: 'combo',
      serverId: record.id,
      identityVariants: [input.name],
      cleanupOrder: 40,
      dependencyOf: input.products[0]?.checkpointEntryId,
    },
    execute: async () => {
      const residue = collectComboGroupRecords(await productCenterApi.comboGroupList())
        .find((candidate) => candidate.id === record.id);
      if (residue) await productCenterApi.deleteComboGroup(record.id);
    },
    verify: async () => collectComboGroupRecords(await productCenterApi.comboGroupList())
      .every((candidate) => candidate.id !== record.id),
  });
  executionLedger.markPhase(checkpointEntryId, 'mutation-observed');
  const detail = await productCenterApi.comboGroupDetail(record.id);
  if (!containsNamedValue(detail, input.name)) throw new Error(`套餐组详情未包含名称：${input.name}`);
  executionLedger.markPhase(checkpointEntryId, 'api-verified');
  return { id: record.id, name: input.name, checkpointEntryId };
}

export function collectComboGroupRecords(value: unknown, output: Array<{ id: number; name: string; sectionType: number }> = []): Array<{ id: number; name: string; sectionType: number }> {
  if (Array.isArray(value)) {
    for (const item of value) collectComboGroupRecords(item, output);
    return output;
  }
  if (!value || typeof value !== 'object') return output;
  const record = value as Record<string, unknown>;
  const id = Number(record.id ?? record.sectionId);
  const name = String(record.name ?? record.sectionName ?? '');
  const sectionType = Number(record.sectionType ?? record.type);
  if (id > 0 && name && [1, 2, 5].includes(sectionType)
    && !output.some((item) => item.id === id)) output.push({ id, name, sectionType });
  for (const child of Object.values(record)) collectComboGroupRecords(child, output);
  return output;
}

export function assertionReceipt(binding: GroupAutomationBinding, expectedResultIndex: number): string {
  const assertionId = binding.assertionIds[expectedResultIndex];
  if (!assertionId || !binding.expectedResults[expectedResultIndex]) {
    throw new Error(`${binding.caseId} 断言收据索引无对应预期：${expectedResultIndex}`);
  }
  return assertionId;
}

export function cleanupEvidence(executionLedger: ProductCenterExecutionLedger): {
  checkpointPath: string;
  runId: string;
  entries: ReturnType<ProductCenterExecutionLedger['snapshot']>['entries'];
} {
  const snapshot = executionLedger.snapshot();
  if (snapshot.entries.length === 0 || snapshot.entries.some((entry) => entry.phase !== 'residue-verified')) {
    throw new Error(`当前用例清理证据未收敛：${snapshot.runId}`);
  }
  return {
    checkpointPath: executionLedger.filePath,
    runId: snapshot.runId,
    entries: snapshot.entries,
  };
}
