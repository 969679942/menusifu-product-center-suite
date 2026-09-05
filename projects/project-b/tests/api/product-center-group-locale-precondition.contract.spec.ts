import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';

const projectRoot = path.resolve(__dirname, '../..');
const runnerSource = fs.readFileSync(
  path.join(projectRoot, 'utils/product-center-group-runner.ts'),
  'utf8',
);

function functionSource(name: string): string {
  const start = runnerSource.indexOf(`async function ${name}(`);
  if (start < 0) throw new Error(`未找到组执行函数：${name}`);
  const next = runnerSource.indexOf('\nasync function ', start + 1);
  return runnerSource.slice(start, next < 0 ? undefined : next);
}

test.describe('组中文校验页面前置合同', () => {
  for (const { functionName, readyMarker } of [
    { functionName: 'runSingleDetailDeleteBoundaryCase', readyMarker: 'await pageObject.open();' },
    { functionName: 'runComboEmptyItemsValidationCase', readyMarker: 'await pageObject.open();' },
  ]) {
    test(`${functionName} 必须先打开可断言业务面再识别语言`, () => {
      const source = functionSource(functionName);
      const pageOpen = source.indexOf(readyMarker);
      const localeCheck = source.indexOf('await ensureChineseValidationLocale(page);');

      expect(pageOpen).toBeGreaterThanOrEqual(0);
      expect(localeCheck).toBeGreaterThan(pageOpen);
    });
  }

  test('套餐空商品精确提示漂移必须登记产品差异而不是放宽为翻译匹配', () => {
    const source = functionSource('runComboEmptyItemsValidationCase');

    expect(source).toContain('throw new ObservedProductDifferenceError(');
    expect(source).toContain("productBehavior: 'observed-product-drift'");
    expect(source).toContain('expectedMessage: expectedAuditMessage');
    expect(source).not.toMatch(/At least one option is required.*至少有一个子项|至少有一个子项.*At least one option is required/);
  });
});
