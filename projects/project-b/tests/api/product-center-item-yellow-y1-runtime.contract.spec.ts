import { expect, test } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const executorPath = path.resolve('tests/generated/product-center-item-yellow-y1.generated.spec.ts');

test.describe('商品中心黄色 Y1 只读共享执行器合同', () => {
  test('应由单一共享链为14条用例独立留证', () => {
    expect(fs.existsSync(executorPath)).toBe(true);
    const source = fs.readFileSync(executorPath, 'utf8');
    expect(source).toContain('AUTO_AUDIT_YELLOW_Y1');
    expect(source).toContain('product-center-item-yellow-y1-runtime-');
    expect(source).toContain("mode: 'wave-shared-chain'");
    expect(source).toContain('representativeGroups: 8');
    expect(source).toContain('caseEvidenceRequired: 14');
    expect(source).toContain('evidenceInheritanceAllowed: false');
    expect(source).toContain('mutationCount: 0');
    expect(source).not.toContain('waitForTimeout(');
    expect(source).not.toContain('.clickSave(');
    expect(source).not.toContain('.clickSaveAndCreate(');
  });

  test('应覆盖Y1全部14条且不拆成逐用例测试', () => {
    const source = fs.readFileSync(executorPath, 'utf8');
    for (const caseId of [
      'TC-ITEM-STD-041', 'TC-ITEM-STD-079', 'TC-ITEM-STD-071', 'TC-ITEM-STD-074',
      'TC-ITEM-STD-076', 'TC-ITEM-ADD-035', 'TC-ITEM-PKG-044', 'TC-ITEM-PKG-056',
      'TC-ITEM-PKG-003', 'TC-ITEM-PKG-045', 'TC-ITEM-PKG-014', 'TC-ITEM-PKG-051',
      'TC-ITEM-UI-001', 'TC-ITEM-UI-002',
    ]) expect(source).toContain(caseId);
    expect((source.match(/^test\(/gm) ?? []).length).toBe(1);
  });
});
