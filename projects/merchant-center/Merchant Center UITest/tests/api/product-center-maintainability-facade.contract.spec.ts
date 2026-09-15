import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';

type Region = {
  filePath: string;
  facade: string;
  extractionOrder: number;
  sourceSha256: string;
  publicSurfaceNames: string[];
  implementationMoved: boolean;
  facadePreserved: boolean;
};

type Plan = {
  status: string;
  summary: {
    regionCount: number;
    businessExecutionStarted: boolean;
    existingPassedCasesInvalidated: boolean;
  };
  regions: Region[];
};

const projectRoot = path.resolve(__dirname, '../..');
const planPath = path.join(projectRoot, 'output/quality/product-center-maintainability-responsibility-plan.json');
const snapshotPath = path.join(projectRoot, 'output/quality/product-center-maintainability-isolation-snapshot.json');

test('维护性 facade 合同必须与当前源码、公开接口和隔离快照一致', () => {
  expect(fs.existsSync(planPath)).toBe(true);
  expect(fs.existsSync(snapshotPath)).toBe(true);
  const plan = JSON.parse(fs.readFileSync(planPath, 'utf8')) as Plan;
  const snapshot = JSON.parse(fs.readFileSync(snapshotPath, 'utf8')) as Plan;

  expect(plan.status).toBe('ready-for-engineering-review');
  expect(snapshot.status).toBe('ready-for-facade-review');
  expect(plan.summary).toMatchObject({
    regionCount: 5,
    businessExecutionStarted: false,
    existingPassedCasesInvalidated: false,
  });
  expect(snapshot.summary).toMatchObject({
    regionCount: plan.summary.regionCount,
    businessExecutionStarted: false,
    existingPassedCasesInvalidated: false,
  });
  expect(plan.regions.map((region) => region.extractionOrder)).toEqual([1, 2, 3, 4, 5]);
  expect(snapshot.regions.map((region) => region.extractionOrder)).toEqual([1, 2, 3, 4, 5]);

  const snapshotByPath = new Map(snapshot.regions.map((region) => [region.filePath, region]));
  for (const region of plan.regions) {
    const current = snapshotByPath.get(region.filePath);
    expect(current, `缺少区域隔离快照: ${region.filePath}`).toBeTruthy();
    expect(region.facade).toBe(region.filePath);
    expect(current?.facade).toBe(region.filePath);
    expect(current?.implementationMoved).toBe(region.implementationMoved === true);
    expect(current?.facadePreserved).toBe(true);

    const sourcePath = path.resolve(projectRoot, region.filePath);
    expect(sourcePath.startsWith(`${projectRoot}${path.sep}`)).toBe(true);
    expect(fs.existsSync(sourcePath), `区域源码不存在: ${region.filePath}`).toBe(true);
    const source = fs.readFileSync(sourcePath);
    const sourceSha256 = crypto.createHash('sha256').update(source).digest('hex');
    expect(sourceSha256).toBe(region.sourceSha256);
    expect(sourceSha256).toBe(current?.sourceSha256);

    for (const publicSurfaceName of region.publicSurfaceNames) {
      expect(source.toString('utf8')).toContain(publicSurfaceName);
    }
  }
});
