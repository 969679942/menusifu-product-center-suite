import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { matchesCategoryNodeIdentity } from '../../utils/category-node-identity';

test.describe('分类节点业务身份合同', () => {
  test('应接受精确名称和带第二语言后缀的展示文本', () => {
    const identity = 'AUTO_AUDIT_WAVE_D_CATEGORY_PARENT_B_001';

    expect(matchesCategoryNodeIdentity(identity, identity)).toBe(true);
    expect(matchesCategoryNodeIdentity(`${identity}(Wave D Parent B)`, identity)).toBe(true);
    expect(matchesCategoryNodeIdentity(`${identity}_OTHER`, identity)).toBe(false);
  });

  test('已验证唯一身份的分类节点点击应绕过 tooltip 拦截并有局部超时', () => {
    const source = fs.readFileSync(path.resolve(
      __dirname,
      '../../pages/product-management/item/item-create-standard.page.ts',
    ), 'utf8');

    expect(source).toContain("categoryCascader.click({ timeout: 10_000 })");
    expect(source.match(/node\.click\(\{ force: true, timeout: 10_000 \}\)/g)).toHaveLength(3);
  });

  test('分类叶子只读 Probe 应支持第二语言后缀并保持连续有界点击', () => {
    const source = fs.readFileSync(path.resolve(
      __dirname,
      '../../pages/product-center/product-center-item-category-leaf-probe.page.ts',
    ), 'utf8');

    expect(source).toContain('matchesCategoryNodeIdentity(state.text, name)');
    expect(source.match(/click\(\{ force: true, timeout: 10_000 \}\)/g)).toHaveLength(2);
  });
});
