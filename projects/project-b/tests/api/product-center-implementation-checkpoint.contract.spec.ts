import path from 'node:path';
import { expect, test } from '@playwright/test';
import {
  fingerprintProductCenterItemImplementation,
  productCenterItemImplementationCheckpoint,
  productCenterItemImplementationCheckpointInputs,
} from '../../adapters/product-center/product-center-item-implementation';

const projectRoot = path.resolve(__dirname, '../..');

test.describe('商品中心业务规则实现检查点适配合同', () => {
  test('标准商品和套餐规则显式覆盖Flow、页面、定位器和数据工厂', () => {
    for (const caseId of ['TC-ITEM-STD-006', 'TC-ITEM-PKG-059']) {
      const checkpoint = productCenterItemImplementationCheckpoint(caseId);
      expect(new Set(checkpoint.entries.map((entry) => entry.category))).toEqual(new Set([
        'flow', 'page-object', 'locator', 'data-factory',
      ]));
      expect(fingerprintProductCenterItemImplementation(projectRoot, caseId)).toMatch(/^[a-f0-9]{64}$/);
    }
  });

  test('统一审计输入必须显式包含所有实现检查点，防止错误复用本地检查点', () => {
    const inputs = productCenterItemImplementationCheckpointInputs();
    expect(inputs).toContain('flows/product-center/item-216/standard-item-216.flow.ts');
    expect(inputs).toContain('flows/product-center/item-216/package-item-216.flow.ts');
    expect(inputs).toContain('pages/product-management/item/item-create-combo-locators.ts');
    expect(inputs).toContain('test-data/product-center/item-216/standard-item-216.factory.ts');
    expect(inputs).toContain('flows/product-center/item-216/addon-main-image-evidence.ts');
  });

  test('加料主图证据判定器只影响其所属用例的实现指纹', () => {
    const targetEntries = productCenterItemImplementationCheckpoint('TC-ITEM-ADD-035').entries;
    const unrelatedEntries = productCenterItemImplementationCheckpoint('TC-ITEM-ADD-034').entries;

    expect(targetEntries).toContainEqual({
      category: 'flow',
      path: 'flows/product-center/item-216/addon-main-image-evidence.ts',
    });
    expect(unrelatedEntries).not.toContainEqual({
      category: 'flow',
      path: 'flows/product-center/item-216/addon-main-image-evidence.ts',
    });
  });
});
