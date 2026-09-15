import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { buildProductCenterMaintainabilityReport } from '../../utils/product-center-maintainability-audit';

test.describe('商品中心维护性增量门禁', () => {
  test('代码移入项目适配器后不得从维护性债务统计中消失', () => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pc-maintainability-adapter-'));
    try {
      const directory = path.join(rootDir, 'adapters/product-center');
      fs.mkdirSync(directory, { recursive: true });
      fs.writeFileSync(path.join(directory, 'example.ts'), 'const name = `AUTO_AUDIT_SAMPLE_${Date.now()}`;\n' + '\n'.repeat(2001), 'utf8');
      const report = buildProductCenterMaintainabilityReport(rootDir, {
        maxHighPriorityFiles: 0,
        maxDirectIdentityTemplates: 0,
      });
      expect(report.status).toBe('blocked');
      expect(report.summary).toMatchObject({ highPriorityFiles: 1, directIdentityTemplates: 1 });
      expect(report.issues).toEqual(expect.arrayContaining([
        'HIGH_PRIORITY_FILES_INCREASED:1>0',
        'DIRECT_IDENTITY_TEMPLATES_INCREASED:1>0',
      ]));
    } finally {
      expect(path.dirname(rootDir)).toBe(path.resolve(os.tmpdir()));
      fs.rmSync(rootDir, { recursive: true, force: true });
    }
  });
  test('不得新增高优先级大文件或直接身份模板', () => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pc-maintainability-'));
    try {
      fs.mkdirSync(path.join(rootDir, 'utils'), { recursive: true });
      fs.writeFileSync(path.join(rootDir, 'utils/example.ts'), 'const name = `AUTO_AUDIT_SAMPLE_${Date.now()}`;\n', 'utf8');

      const passed = buildProductCenterMaintainabilityReport(rootDir, {
        maxHighPriorityFiles: 0,
        maxDirectIdentityTemplates: 1,
      });
      expect(passed).toMatchObject({ status: 'passed', summary: { directIdentityTemplates: 1 } });

      const blocked = buildProductCenterMaintainabilityReport(rootDir, {
        maxHighPriorityFiles: 0,
        maxDirectIdentityTemplates: 0,
      });
      expect(blocked.status).toBe('blocked');
      expect(blocked.issues).toEqual(['DIRECT_IDENTITY_TEMPLATES_INCREASED:1>0']);
    } finally {
      fs.rmSync(rootDir, { recursive: true, force: true });
    }
  });
});
