import { test, expect } from '@playwright/test';
import { runCrudScript, type CrudScript } from '../../utils/audit-script-runner';

const scripts: CrudScript[] = [
  { entity: '商品分类', file: 'menusifu-crud-category.ts', artifactPrefix: 'crud-category-AUTO_AUDIT_CATEGORY_' },
  { entity: '做法组', file: 'menusifu-crud-modifier-group-v2.ts', artifactPrefix: 'crud-method-robust-AUTO_AUDIT_METHOD_', env: { OPTION_GROUP_TYPE: 'method' } },
  { entity: '原料', file: 'menusifu-crud-material.ts', artifactPrefix: 'crud-material-AUTO_AUDIT_MAT_' },
  { entity: '配方单', file: 'menusifu-crud-bom.ts', artifactPrefix: 'crud-bom-AUTO_AUDIT_BOM_' },
  { entity: '品牌调味', file: 'menusifu-crud-seasoning.ts', artifactPrefix: 'crud-seasoning-AUTO_AUDIT_SEASONING_' },
];

test.describe('商品中心五实体 UI CRUD 回归', () => {
  test.describe.configure({ mode: 'serial', timeout: 15 * 60_000 });
  for (const script of scripts) {
    test(`${script.entity}应完成创建编辑删除并清理`, async () => {
      const result = await runCrudScript(script);
      expect(result.residue).toBe(0);
      expect(result.steps.length).toBeGreaterThan(0);
    });
  }
});
