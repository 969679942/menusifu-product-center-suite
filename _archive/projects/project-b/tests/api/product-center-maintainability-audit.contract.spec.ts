import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { buildProductCenterMaintainabilityReport } from '../../utils/product-center-maintainability-audit';

test.describe('商品中心维护性增量门禁', () => {
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
