import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';

test('Y3 B1 执行器应整组六组九条取证且finally清理', () => {
  const source = fs.readFileSync(
    path.resolve(__dirname, '../generated/product-center-item-yellow-y3.generated.spec.ts'),
    'utf8',
  );
  for (const caseId of [
    'TC-ITEM-STD-030',
    'TC-ITEM-ADD-041',
    'TC-ITEM-ADD-002',
    'TC-ITEM-PKG-048',
    'TC-ITEM-UI-004',
    'TC-ITEM-UI-005',
    'TC-ITEM-UI-006',
    'TC-ITEM-UI-007',
    'TC-ITEM-UI-008',
  ]) expect(source).toContain(caseId);
  expect(source).toContain("executionMode: 'wave-shared-chain'");
  expect(source).toContain('evidenceInheritanceAllowed: false');
  expect(source).toContain('finally');
  expect(source).toContain('cleanupRegistry.cleanupAll()');
  expect(source).toContain("startsWith('AUTO_AUDIT_')");
  expect(source).toContain('loadResumableEvidence');
  expect(source).toContain('invalidateReprobeGroup');
  expect(source).not.toContain('test.each');
});
