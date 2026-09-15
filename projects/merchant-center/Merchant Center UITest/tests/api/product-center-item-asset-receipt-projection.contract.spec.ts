import { test, expect } from '@playwright/test';
import { projectItemAssetReceiptQualification } from '../../adapters/product-center/product-center-item-asset-receipt-projection';

test('资产索引消费公共当前收据裁决并保留绑定默认值，不能把历史通过或未运行覆盖当前资格', () => {
  const dispositions = new Map<string, any>([
    ['qualified', { status: 'landed', runtimeStatus: 'not-run', scriptPath: 'owned.spec.ts' }],
    ['incomplete', { status: 'landed', runtimeStatus: 'passed' }],
    ['excluded', { status: 'not-applicable', runtimeStatus: 'not-applicable' }],
    ['unrelated', { status: 'landed', runtimeStatus: 'ready' }],
  ]);
  projectItemAssetReceiptQualification({ dispositions, qualification: {
    accepted: new Map([['qualified', ['contract.json', 'report.json']]]),
    findings: [{ caseId: 'incomplete', reasons: ['CURRENT_RECEIPT_MISSING'] }, { caseId: 'excluded', reasons: ['CURRENT_RECEIPT_MISSING'] }],
    sourceArtifacts: {},
  } });
  expect(dispositions.get('qualified')).toMatchObject({ runtimeStatus: 'current-receipt-qualified', bindingRuntimeStatus: 'not-run', scriptPath: 'owned.spec.ts', currentReceiptQualification: { status: 'qualified' } });
  expect(dispositions.get('incomplete')).toMatchObject({ runtimeStatus: 'current-receipt-incomplete', bindingRuntimeStatus: 'passed', currentReceiptQualification: { status: 'incomplete', reasons: ['CURRENT_RECEIPT_MISSING'] } });
  expect(dispositions.get('excluded')).toEqual({ status: 'not-applicable', runtimeStatus: 'not-applicable' });
  expect(dispositions.get('unrelated')).toEqual({ status: 'landed', runtimeStatus: 'ready' });
});
