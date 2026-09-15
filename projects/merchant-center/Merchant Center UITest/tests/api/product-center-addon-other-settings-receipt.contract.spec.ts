import { test, expect } from '@playwright/test';
import { AddonItem216Flow } from '../../flows/product-center/item-216/addon-item-216.flow';
import { evaluateSystemTestRuntimeContract, type RuntimeAssertionReceipt } from '../../../Test Automation Platform/src/automation/system-test/system-test-runtime-contract';

const complete = { detailImageUpload: 1, descriptionLabels: 1, badges: 1, stats: 1, ingredientInfo: 1 };

function isolatedFlow(actual: typeof complete) {
  // Exercise the real adapter method with a supplied page observation; no browser or data factory starts.
  const flow = Object.create(AddonItem216Flow.prototype);
  flow.page = { url: () => 'https://example.invalid/create-side' };
  flow.openCreate = async () => ({ readOtherSettingsCapabilityEvidence: async () => actual });
  return flow as { inspectOtherSettings(context: { caseId: string; originalIdentity: string }): Promise<{ assertionReceipts: RuntimeAssertionReceipt[] }> };
}

test('加料其他设置实际适配方法返回完整正式断言，公共合同可以消费', async () => {
  const actual = { ...complete };
  const result = await isolatedFlow(actual).inspectOtherSettings({ caseId: 'TC-ITEM-ADD-002', originalIdentity: 'isolated' });
  expect(result.assertionReceipts).toHaveLength(1);
  expect(result.assertionReceipts[0]).toMatchObject({
    claimId: 'TC-ITEM-ADD-002:expectation-1', actualValue: actual, expectedValue: complete,
    observationChannel: 'ui', authority: 'user-visible', comparison: 'matched', status: 'verified',
  });
  expect(evaluateSystemTestRuntimeContract({ caseId: 'TC-ITEM-ADD-002', requiredOperationKeys: [],
    requiredAssertionIds: ['TC-ITEM-ADD-002:expectation-1'], assertionReceipts: result.assertionReceipts }).status).toBe('complete');
  expect(evaluateSystemTestRuntimeContract({ caseId: 'TC-ITEM-ADD-002', requiredOperationKeys: [],
    requiredAssertionIds: ['TC-ITEM-ADD-002:expectation-1'], assertionReceipts: [] }).status).toBe('incomplete');
});

for (const field of Object.keys(complete) as Array<keyof typeof complete>) {
  test(`加料其他设置缺少能力 ${field} 时不得返回通过收据`, async () => {
    await expect(isolatedFlow({ ...complete, [field]: 0 }).inspectOtherSettings({
      caseId: 'TC-ITEM-ADD-002', originalIdentity: 'isolated',
    })).rejects.toThrow('TC-ITEM-ADD-002:expectation-1');
  });
}
