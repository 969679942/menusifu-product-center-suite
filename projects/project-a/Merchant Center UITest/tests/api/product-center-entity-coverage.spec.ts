import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { productCenterEntities } from '../../test-data/product-center/entity-matrix';

test('18 个商品中心 CRUD 实体应全部有明确适用性结论', async () => {
  const report = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), '..', '..', 'TestOps/artifacts/p1-crud-applicability.json'), 'utf8'));
  expect(report.entities).toHaveLength(productCenterEntities.length);
  expect(report.pendingEntities).toBe(0);
  for (const [entity, route] of productCenterEntities) {
    expect(report.entities.some((item: any) => item.entity === entity && item.route === route), `${entity}:${route}`).toBe(true);
  }
});
