import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';

const reportPath = path.resolve(__dirname, '../../output/quality/product-center-maintainability-targeted-revalidation.json');

test('维护性定向重验计划必须绑定区域指纹并禁止静态计划冒充业务执行', () => {
  expect(fs.existsSync(reportPath)).toBe(true);
  const report = JSON.parse(fs.readFileSync(reportPath, 'utf8')) as {
    status: string;
    summary: { regionCount: number; referenceCount: number; testFileCount: number; businessExecutionStarted: boolean; existingPassedCasesInvalidated: boolean };
    regions: Array<{ filePath: string; facade: string; extractionOrder: number; sourceSha256: string; publicSurfaceCount: number; references: string[]; testFiles: string[]; revalidationCommands: string[]; status: string; businessExecutionStarted: boolean; existingPassedCasesInvalidated: boolean }>;
  };
  expect(report.status).toBe('ready-for-engineering-review');
  expect(report.summary).toMatchObject({ regionCount: 5, businessExecutionStarted: false, existingPassedCasesInvalidated: false });
  let references = 0;
  let testFiles = 0;
  for (const region of report.regions) {
    expect(region.filePath).toBe(region.facade);
    expect(region.extractionOrder).toBeGreaterThan(0);
    expect(region.sourceSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(region.publicSurfaceCount).toBeGreaterThan(0);
    expect(region.status).toBe('static-plan-ready');
    expect(region.businessExecutionStarted).toBe(false);
    expect(region.existingPassedCasesInvalidated).toBe(false);
    expect(region.testFiles.every((filePath) => region.references.includes(filePath))).toBe(true);
    expect(region.revalidationCommands).toHaveLength(region.testFiles.length);
    references += region.references.length;
    testFiles += region.testFiles.length;
  }
  expect(references).toBe(report.summary.referenceCount);
  expect(testFiles).toBe(report.summary.testFileCount);
});
