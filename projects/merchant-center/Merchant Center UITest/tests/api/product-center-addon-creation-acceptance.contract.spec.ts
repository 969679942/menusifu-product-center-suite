import { expect, test } from '@playwright/test';
import { AddonCreationAcceptanceFlow } from '../../flows/product-center/item-216/addon-creation-acceptance.flow';
import { ItemCreateAcceptancePage } from '../../pages/product-management/item/item-create-acceptance.page';
import { evaluateSystemTestRuntimeContract } from '../../automation/system-test/system-test-runtime-contract';
import { matchesBusinessFeedbackMessage } from '../../utils/business-feedback-contract';
import feedback from '../../contracts/product-center/feedback/item-create-submitted.json';

function negativeHarness(options: { successResponse?: boolean; apiCount?: number; delayed?: boolean; failed?: boolean; pending?: boolean } = {}) {
  const flow = Object.create(AddonCreationAcceptanceFlow.prototype) as any;
  const listeners = new Map<string, (value: unknown) => void>();
  flow.page = { on: (event: string, listener: (value: unknown) => void) => listeners.set(event, listener),
    off: (event: string) => listeners.delete(event), url: () => 'https://example.invalid/pp/brand/create/side' };
  let registered = false;
  const ports = { count: async () => options.apiCount ?? 0,
    registerUnexpected: async (_context: unknown, body: unknown) => { expect(body).toEqual({ data: { id: 123 }, success: true }); registered = true; } };
  const form = { fillItemName: async () => undefined, fillStandardPrice: async () => undefined,
    clickSave: async () => {
      if (!options.successResponse && !options.failed && !options.pending) return;
      const request = { method: () => 'POST', url: () => 'https://example.invalid/ops-brand/brand-items/side' };
      listeners.get('request')?.(request);
      if (options.failed) { listeners.get('requestfailed')?.(request); return; }
      if (options.pending) return;
      const respond = () => listeners.get('response')?.({ request: () => request,
        url: request.url, ok: () => true, json: async () => ({ data: { id: 123 }, success: true }) });
      if (options.delayed) setTimeout(respond, 150); else respond();
    },
    readNameRequiredFeedback: async () => ({ value: '', invalid: true, errors: ['Please enter product name'] }),
    expectStillOnCreatePage: async () => undefined, readSuccessMessageCount: async () => 0 };
  return { invoke: () => flow.verifyRequiredName(form, { caseId: 'TC-ITEM-ADD-006', originalIdentity: 'AUTO_AUDIT_SYNTHETIC' }, ports),
    registered: () => registered, listeners };
}

test('名称缺失验收返回且仅返回两个正式断言，公共收据合同可消费', async () => {
  const harness = negativeHarness();
  const result = await harness.invoke();
  expect(result.assertionReceipts.map((a: any) => a.claimId)).toEqual(['TC-ITEM-ADD-006:expectation-1', 'TC-ITEM-ADD-006:expectation-2']);
  expect(evaluateSystemTestRuntimeContract({ caseId: 'TC-ITEM-ADD-006', requiredOperationKeys: [],
    requiredAssertionIds: ['TC-ITEM-ADD-006:expectation-1', 'TC-ITEM-ADD-006:expectation-2'], assertionReceipts: result.assertionReceipts }).status).toBe('complete');
  expect(harness.listeners.size).toBe(0);
});
test('异常成功创建先登记服务端对象，再拒绝保存被阻断的结论', async () => {
  const harness = negativeHarness({ successResponse: true });
  await expect(harness.invoke()).rejects.toThrow('TC-ITEM-ADD-006:expectation-1');
  expect(harness.registered()).toBe(true);
  expect(harness.listeners.size).toBe(0);
});
test('既存同名数据不能被记为前置成立或保存拦截成功', async () => {
  await expect(negativeHarness({ apiCount: 1 }).invoke()).rejects.toThrow('TC-ITEM-ADD-006:expectation-1');
});

test('字段已报错但写请求响应迟到，仍须登记异常成功对象并拒绝通过', async () => {
  const harness = negativeHarness({ successResponse: true, delayed: true });
  await expect(harness.invoke()).rejects.toThrow('TC-ITEM-ADD-006:expectation-1');
  expect(harness.registered()).toBe(true);
  expect(harness.listeners.size).toBe(0);
});

test('写请求连接失败不等于业务拒绝保存', async () => {
  const harness = negativeHarness({ failed: true });
  await expect(harness.invoke()).rejects.toThrow('ADDON_NAME_WRITE_EVIDENCE_INCOMPLETE');
  expect(harness.listeners.size).toBe(0);
});

test('写请求没有终态时不得用字段报错授权通过', async () => {
  const harness = negativeHarness({ pending: true });
  await expect(harness.invoke()).rejects.toThrow('名称校验期间存在未完成写请求');
  expect(harness.listeners.size).toBe(0);
});

test('创建成功反馈只接受正式文案与已登记的真实环境变体', async () => {
  expect(matchesBusinessFeedbackMessage('提交成功', feedback)).toBe(true);
  expect(matchesBusinessFeedbackMessage('Successfully Submitted', feedback)).toBe(true);
  expect(matchesBusinessFeedbackMessage('Something happened', feedback)).toBe(false);
});
test('名称字段观察不读取页面其他字段错误，只有名称自身错误才返回', async () => {
  const page = Object.create(ItemCreateAcceptancePage.prototype) as any;
  let fieldErrors: any[] = [];
  page.locators = { itemNameInput: { evaluate: async (read: (input: any) => unknown) => read({ value: '',
    getAttribute: () => null, classList: { contains: () => false },
    closest: () => ({ classList: { contains: () => false }, querySelectorAll: () => fieldErrors }) }) } };
  expect(await page.readNameRequiredFeedback()).toEqual({ value: '', invalid: false, errors: [] });
  fieldErrors = [{ textContent: 'Please enter product name', getClientRects: () => [{}] }];
  expect((await page.readNameRequiredFeedback()).errors).toEqual(['Please enter product name']);
});
