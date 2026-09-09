import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { fingerprintImplementationCheckpoint } from '../../src/automation/system-test/system-test-implementation-fingerprint';

test.describe('通用实现检查点合同', () => {
  test('非商品域可以声明并稳定计算完整实现检查点', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'inventory-checkpoint-'));
    try {
      for (const file of ['flow.ts', 'page.ts', 'locators.ts', 'factory.ts']) fs.writeFileSync(path.join(root, file), file);
      const checkpoint = {
        requiredCategories: ['flow', 'page-object', 'locator', 'data-factory'] as const,
        entries: [
          { category: 'flow' as const, path: 'flow.ts' },
          { category: 'page-object' as const, path: 'page.ts' },
          { category: 'locator' as const, path: 'locators.ts' },
          { category: 'data-factory' as const, path: 'factory.ts' },
        ],
      };
      const first = fingerprintImplementationCheckpoint(root, checkpoint);
      const second = fingerprintImplementationCheckpoint(root, checkpoint);
      expect(first.diagnostics).toEqual([]);
      expect(second.fingerprint).toBe(first.fingerprint);
      expect(first.sources).toHaveLength(4);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test('缺少定位器或越界路径必须阻断，不能产生伪完整检查点', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'inventory-checkpoint-negative-'));
    try {
      fs.writeFileSync(path.join(root, 'flow.ts'), 'flow');
      const result = fingerprintImplementationCheckpoint(root, {
        requiredCategories: ['flow', 'locator'],
        entries: [
          { category: 'flow', path: 'flow.ts' },
          { category: 'page-object', path: '../foreign-page.ts' },
        ],
      });
      expect(result.diagnostics).toEqual([
        'IMPLEMENTATION_CHECKPOINT_CATEGORY_MISSING:locator',
        'IMPLEMENTATION_CHECKPOINT_PATH_OUTSIDE_ROOT:../foreign-page.ts',
      ]);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
