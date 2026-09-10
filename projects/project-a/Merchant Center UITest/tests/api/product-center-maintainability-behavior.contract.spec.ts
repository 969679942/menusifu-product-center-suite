import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';

const projectRoot = path.resolve(__dirname, '../..');
const reportPath = path.join(projectRoot, 'output/quality/product-center-maintainability-behavior-contract.json');

test('维护性区域行为合同必须逐接口绑定源码且保持运行证据边界', () => {
  expect(fs.existsSync(reportPath)).toBe(true);
  const report = JSON.parse(fs.readFileSync(reportPath, 'utf8')) as {
    status: string;
    summary: { regionCount: number; publicSurfaceCount: number; implementationMoved: boolean; businessExecutionStarted: boolean; existingPassedCasesInvalidated: boolean };
    regions: Array<{ filePath: string; facade: string; extractionOrder: number; sourceSha256: string; affectedSurfaces: string[]; publicSurfaceCount: number; publicSurfaces: Array<{ name: string; sourceLine: number; declaration: string; verification: string }>; status: string; implementationMoved: boolean; businessExecutionStarted: boolean; existingPassedCasesInvalidated: boolean }>;
  };
  expect(report.status).toBe('ready-for-engineering-review');
  expect(report.summary).toMatchObject({ regionCount: 5, businessExecutionStarted: false, existingPassedCasesInvalidated: false });
  const plan = JSON.parse(fs.readFileSync(path.join(projectRoot, 'output/quality/product-center-maintainability-responsibility-plan.json'), 'utf8')) as {
    regions: Array<{ filePath: string; implementationMoved: boolean }>;
  };
  expect(report.summary.implementationMoved).toBe(plan.regions.some((region) => region.implementationMoved));
  expect(report.summary.publicSurfaceCount).toBeGreaterThan(0);
  expect(report.regions.map((region) => region.extractionOrder)).toEqual([1, 2, 3, 4, 5]);
  let surfaceCount = 0;
  for (const region of report.regions) {
    expect(region.filePath).toBe(region.facade);
    expect(region.sourceSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(region.affectedSurfaces.length).toBeGreaterThan(0);
    expect(region.status).toBe('static-boundary-ready');
    expect(region.implementationMoved).toBe(plan.regions.find((item) => item.filePath === region.filePath)?.implementationMoved === true);
    expect(region.businessExecutionStarted).toBe(false);
    expect(region.existingPassedCasesInvalidated).toBe(false);
    const sourcePath = path.resolve(projectRoot, region.filePath);
    const source = fs.readFileSync(sourcePath, 'utf8');
    for (const surface of region.publicSurfaces) {
      expect(surface.sourceLine).toBeGreaterThan(0);
      expect(surface.declaration).toContain(surface.name);
      expect(surface.verification).toBe('runtime-receipt-required');
      expect(source).toContain(surface.name);
      surfaceCount += 1;
    }
    expect(region.publicSurfaceCount).toBe(region.publicSurfaces.length);
  }
  expect(surfaceCount).toBe(report.summary.publicSurfaceCount);
});
