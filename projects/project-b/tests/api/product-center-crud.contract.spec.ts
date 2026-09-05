import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { findOperation } from '../../api/operation-client';

const requiredOperations = [
  'brand-menu:POST /ops-brand/brand-categories', 'brand-menu:PUT /ops-brand/brand-categories/{id}', 'brand-menu:DELETE /ops-brand/brand-categories/{id}',
  'brand-menu:POST /ops-brand/brand-modifiers', 'brand-menu:PUT /ops-brand/brand-modifiers/{id}', 'brand-menu:DELETE /ops-brand/brand-modifiers/{id}',
  'brand-menu:POST /ops-brand/brand-ingredients', 'brand-menu:DELETE /ops-brand/brand-ingredients/{id}',
  'brand-menu:POST /ops-brand/bom/item/batch', 'brand-menu:PUT /ops-brand/bom/item/batch', 'brand-menu:DELETE /ops-brand/bom/{id}',
  'brand-menu:POST /ops-brand/global-modifier/batch', 'brand-menu:PUT /ops-brand/global-modifier/{id}', 'brand-menu:DELETE /ops-brand/global-modifier/{id}',
] as const;

test.describe('商品中心五实体 API CRUD 合同', () => {
  test('五实体 CRUD operationKey 应全部存在', async () => {
    for (const operationKey of requiredOperations) expect((await findOperation(operationKey)).operationKey).toBe(operationKey);
  });

  test('五实体最新 CRUD 运行证据应完整且无残留', async () => {
    const report = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), '..', 'contracts/product-center/current-acceptance-report.json'), 'utf8'));
    expect(report.pilots).toHaveLength(5);
    for (const pilot of report.pilots) {
      expect(pilot.pass, pilot.artifact).toBe(true);
      expect(pilot.residue, pilot.artifact).toBe(0);
      expect(pilot.steps, pilot.artifact).toBeGreaterThan(0);
    }
  });
});
