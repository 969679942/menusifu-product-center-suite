import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';

const projectRoot = path.resolve(__dirname, '../..');
const planPath = path.join(projectRoot, 'output/quality/product-center-maintainability-responsibility-plan.json');

test('维护性职责拆分计划必须保护公开接口并保持 report-only', () => {
  expect(fs.existsSync(planPath)).toBe(true);
  const plan = JSON.parse(fs.readFileSync(planPath, 'utf8')) as {
    status: string;
    summary: { regionCount: number; publicSurfaceCount: number; businessExecutionStarted: boolean; existingPassedCasesInvalidated: boolean };
    regions: Array<{ filePath: string; facade: string; extractionOrder: number; publicSurfaceCount: number; requiredPreconditions: string[] }>;
  };
  expect(plan.status).toBe('ready-for-engineering-review');
  expect(plan.summary).toMatchObject({ regionCount: 5, businessExecutionStarted: false, existingPassedCasesInvalidated: false });
  expect(plan.summary.publicSurfaceCount).toBeGreaterThan(0);
  expect(plan.regions.map((item) => item.extractionOrder)).toEqual([1, 2, 3, 4, 5]);
  for (const region of plan.regions) {
    expect(region.filePath).toBe(region.facade);
    expect(region.publicSurfaceCount).toBeGreaterThan(0);
    expect(region.requiredPreconditions).toContain('区域行为隔离快照');
  }
});
