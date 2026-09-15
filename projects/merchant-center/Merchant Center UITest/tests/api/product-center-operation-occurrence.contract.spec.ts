import { test, expect } from '@playwright/test';
import { step } from '../../utils/step';
import { consumeExecutableOperationReceipts, clearExecutableOperationReceipts } from '../../utils/executable-operation-receipt';
import { mapOperationReceiptOccurrences, type OperationOccurrenceMapping } from '../../../Test Automation Platform/src/governance/operation-occurrence-mapping';

class SyntheticPage {
  private selections = 0;
  @step('选择模拟项')
  async choose() { this.selections += 1; }
  @step('读取模拟状态')
  async read() { return this.selections; }
}
class SyntheticFlow {
  @step('执行模拟选择流程')
  async execute(page: SyntheticPage) { await page.choose(); await page.read(); await page.choose(); }
}

test('真实装饰器的嵌套和重复调用保留原始序列，并由显式适配合同对账', async ({}, testInfo) => {
  const mapping: OperationOccurrenceMapping = { schemaVersion: '1.0.0', sourceStepIds: ['synthetic:action-1', 'synthetic:action-2'],
    business: [{ operationKey: 'select-first', sourceStepId: 'synthetic:action-1', executableOperationKey: 'SyntheticPage.choose', occurrence: 1 },
      { operationKey: 'select-second', sourceStepId: 'synthetic:action-2', executableOperationKey: 'SyntheticPage.choose', occurrence: 2 }],
    supporting: [{ executableOperationKey: 'SyntheticFlow.execute', occurrence: 1, required: true },
      { executableOperationKey: 'SyntheticPage.read', occurrence: 1, required: true }] };
  clearExecutableOperationReceipts(testInfo.testId);
  try {
    await new SyntheticFlow().execute(new SyntheticPage());
    const raw = consumeExecutableOperationReceipts(testInfo.testId);
    expect(raw).toHaveLength(4);
    const result = mapOperationReceiptOccurrences(mapping, raw);
    expect(result.status).toBe('complete');
    expect(result.businessReceipts.map((row) => row.sequence)).toEqual([2, 4]);
    expect(result.supportingSequences).toEqual([1, 3]);
    const incomplete = raw.filter((row) => row.sequence !== 4);
    expect(mapOperationReceiptOccurrences(mapping, incomplete).reasons).toContain('BUSINESS_OPERATION_OCCURRENCE_MISSING');
  } finally { clearExecutableOperationReceipts(testInfo.testId); }
});
