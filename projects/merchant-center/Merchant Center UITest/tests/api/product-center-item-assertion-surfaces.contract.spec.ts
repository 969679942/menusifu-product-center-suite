import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test, expect } from '@playwright/test';
import { parseProductCenterItemAssertionSurfaces } from '../../utils/product-center-item-assertion-surfaces';

test('断言保留正式编号并在清理要求处终止，重复编号不能静默通过', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'assertion-surface-'));
  const source = path.join(root, 'formal.md');
  try {
    fs.writeFileSync(source, '### 用例编号：TC-ITEM-TEST-001\n预期结果：\n2. 显示详情\n\n清理要求：\n1. 删除并验证零残留\n\n### 用例编号：TC-ITEM-TEST-002\n预期结果：\n1. 展示字段\n1. 嵌入的第二项\n');
    const parsed = parseProductCenterItemAssertionSurfaces(source);
    expect(parsed[0]).toMatchObject({ assertionIds: ['TC-ITEM-TEST-001:expectation-2'], reasons: [] });
    expect(parsed[1]).toMatchObject({ assertionIds: ['TC-ITEM-TEST-002:expectation-1'], duplicateNumbers: [1], reasons: ['FORMAL_ASSERTION_NUMBERING_AMBIGUOUS'] });
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
