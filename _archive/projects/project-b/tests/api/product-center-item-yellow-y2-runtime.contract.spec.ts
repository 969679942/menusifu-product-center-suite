import { expect, test } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

test('Y2受控链应配置互斥规则并在finally验证零残留', () => {
  const source = fs.readFileSync(path.resolve(
    __dirname,
    '../generated/product-center-item-yellow-y2.generated.spec.ts',
  ), 'utf8');
  expect(source).toContain('TC-ITEM-STD-061');
  expect(source).toContain('AUTO_AUDIT_YELLOW_Y2_');
  expect(source).toContain('registerCreated');
  expect(source).toContain('configureMutuallyExclusiveSide(0');
  expect(source).toContain('configureMutuallyExclusiveSide(1');
  expect(source).toContain('readCommonAttributeOptionState');
  expect(source).toContain('cleanupRegistry.cleanupAll()');
  expect(source).toContain("entry.phase === 'residue-verified'");
  expect(source).not.toContain('waitForTimeout');
});
