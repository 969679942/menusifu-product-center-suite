import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import {
  createUiArchitectureBaseline,
  evaluateUiArchitectureBaseline,
  inspectUiArchitecture,
  type UiArchitectureConfig,
} from '../../src/governance/ui-architecture';
import {
  assertObservedExecutableOperations,
  consumeExecutableOperationReceipts,
  finishExecutableOperation,
  startExecutableOperation,
} from '../../src/utils/executable-operation-receipt';

test.describe('跨方案 UI 架构与步骤收据治理', () => {
  test('架构基线应阻断新增文件债务和空正式步骤收据', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ui-architecture-'));
    const config: UiArchitectureConfig = {
      version: 1,
      layers: {
        pages: ['pages'], flows: ['flows'], fixtures: ['fixtures'],
        testData: ['test-data'], utils: ['utils'], specs: ['tests'],
      },
      formalSpecFiles: ['tests/formal.spec.ts'],
      hotspots: [{ path: 'pages/example.page.ts' }],
    };
    write('pages/example.page.ts', 'export class ExamplePage { public async open() {} }');
    write('tests/formal.spec.ts', "const receipt = { operationReceipts: [{ operationKey: 'open', observed: true }] };\n");
    const baseline = createUiArchitectureBaseline(inspectUiArchitecture({ projectRoot: root, config }));

    write('flows/new.flow.ts', "import { Page } from '@playwright/test'; export async function run(page: Page) { await page.waitForTimeout(10); }\n");
    write('tests/formal.spec.ts', "const receipt = { operationReceipts: [] };\nconst tag = '@generated';\n");
    const violations = evaluateUiArchitectureBaseline({
      report: inspectUiArchitecture({ projectRoot: root, config }),
      baseline,
    });

    expect(violations).toContain('ARCHITECTURE_METRIC_INCREASE:hardWaitCalls:1>0');
    expect(violations).toContain('ARCHITECTURE_METRIC_INCREASE:formalSpecsWithEmptyOperationReceipts:1>0');
    expect(violations).toContain('ARCHITECTURE_METRIC_INCREASE:formalSpecsWithGeneratedTag:1>0');

    function write(relative: string, content: string): void {
      const target = path.join(root, relative);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, content, 'utf8');
    }
  });

  test('可执行步骤收据应保留顺序并拒绝空步骤通过', async () => {
    const first = startExecutableOperation({ executionId: 'case-1', operationKey: 'Page.open', title: '打开页面', method: 'open' });
    finishExecutableOperation(first, 'passed');
    const second = startExecutableOperation({ executionId: 'case-1', operationKey: 'Flow.save', title: '保存商品', method: 'save' });
    finishExecutableOperation(second, 'passed');
    const receipts = consumeExecutableOperationReceipts('case-1');

    expect(receipts.map((item) => item.sequence)).toEqual([1, 2]);
    expect(() => assertObservedExecutableOperations(receipts, 'TC-1')).not.toThrow();
    expect(() => assertObservedExecutableOperations([], 'TC-2')).toThrow('FORMAL_CASE_EXECUTABLE_OPERATION_RECEIPT_MISSING');
  });
});
