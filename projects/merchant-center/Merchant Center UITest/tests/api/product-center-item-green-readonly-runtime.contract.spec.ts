import { expect, test } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

test('绿色首批只读共享链应逐条留证且禁止写请求', () => {
  const source = fs.readFileSync(path.resolve(
    __dirname,
    '../generated/product-center-item-green-readonly-pilot.generated.spec.ts',
  ), 'utf8');
  expect(source).toContain('TC-ITEM-STD-064');
  expect(source).toContain('TC-ITEM-PKG-057');
  expect(source).toContain('TC-ITEM-PKG-054');
  expect(source).toContain('TC-ITEM-STD-071');
  expect(source).toContain('TC-ITEM-ADD-035');
  expect(source).toContain("evidenceInheritanceAllowed: false");
  expect(source).toContain('mutationRequests');
  expect(source).not.toContain('waitForTimeout');
});

test('商品查询仅一页时应将无分页控件识别为首页', () => {
  const source = fs.readFileSync(path.resolve(
    __dirname,
    '../../pages/product-management/item/item-list.page.ts',
  ), 'utf8');
  expect(source).toContain('paginationCurrentPage.count() === 0');
  expect(source).toContain('return 1');
});
