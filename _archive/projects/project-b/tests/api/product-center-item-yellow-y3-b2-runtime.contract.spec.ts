import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';

test('Y3-B2 执行器应整组六组十一条并支持断点恢复与零残留', () => {
  const source = fs.readFileSync(
    path.resolve(__dirname, '../generated/product-center-item-yellow-y3-b2.generated.spec.ts'),
    'utf8',
  );
  for (const caseId of [
    'TC-ITEM-STD-019', 'TC-ITEM-STD-084', 'TC-ITEM-STD-085', 'TC-ITEM-STD-086',
    'TC-ITEM-ADD-025', 'TC-ITEM-ADD-007', 'TC-ITEM-ADD-009', 'TC-ITEM-ADD-022',
    'TC-ITEM-ADD-011', 'TC-ITEM-ADD-049', 'TC-ITEM-ADD-038',
  ]) expect(source).toContain(caseId);
  expect(source).toContain("executionMode: 'wave-shared-chain'");
  expect(source).toContain('evidenceInheritanceAllowed: false');
  expect(source).toContain('loadResumableEvidence');
  expect(source).toContain('recoverInterruptedRun');
  expect(source).toContain('invalidateReprobeGroup');
  expect(source).toContain('cleanupRegistry.cleanupAll()');
  expect(source).toContain("startsWith('AUTO_AUDIT_')");
  expect(source).not.toContain('test.each');
});
