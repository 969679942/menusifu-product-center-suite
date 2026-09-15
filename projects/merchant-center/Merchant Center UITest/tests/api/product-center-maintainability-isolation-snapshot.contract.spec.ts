import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';

const reportPath = path.resolve(__dirname, '../../output/quality/product-center-maintainability-isolation-snapshot.json');

test('维护性区域隔离快照必须保持 facade 和 report-only 边界', () => {
  expect(fs.existsSync(reportPath)).toBe(true);
  const report = JSON.parse(fs.readFileSync(reportPath, 'utf8')) as {
    status: string;
    summary: { regionCount: number; implementationMoved: boolean; businessExecutionStarted: boolean; existingPassedCasesInvalidated: boolean };
    regions: Array<{ facade: string; filePath: string; implementationMoved: boolean; facadePreserved: boolean; publicSurfaceFingerprint: string }>;
  };
  expect(report.status).toBe('ready-for-facade-review');
  const plan = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../output/quality/product-center-maintainability-responsibility-plan.json'), 'utf8')) as {
    regions: Array<{ filePath: string; implementationMoved: boolean }>;
  };
  expect(report.summary).toEqual({ regionCount: 5, implementationMoved: plan.regions.some((region) => region.implementationMoved), businessExecutionStarted: false, existingPassedCasesInvalidated: false });
  for (const region of report.regions) {
    expect(region.facade).toBe(region.filePath);
    expect(region.implementationMoved).toBe(plan.regions.find((item) => item.filePath === region.filePath)?.implementationMoved === true);
    expect(region.facadePreserved).toBe(true);
    expect(region.publicSurfaceFingerprint).toMatch(/^[a-f0-9]{8}$/);
  }
});
