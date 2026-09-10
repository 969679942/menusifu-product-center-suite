import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';

const projectRoot = path.resolve(__dirname, '../..');
const snapshotPath = path.join(projectRoot, 'output/quality/product-center-maintainability-api-snapshot.json');
const expectedPaths = [
  'utils/product-center-group-runner.ts',
  'flows/product-center/item-216/standard-item-216.flow.ts',
  'flows/product-center/item-216/package-item-216.flow.ts',
  'pages/product-management/group-list.page.ts',
  'pages/product-center/seasoning-boundary.page.ts',
];

test.describe('商品中心维护性公开 API 快照', () => {
  test('热点集合、源码指纹和公开方法快照必须完整', () => {
    expect(fs.existsSync(snapshotPath)).toBe(true);
    const snapshot = JSON.parse(fs.readFileSync(snapshotPath, 'utf8')) as {
      summary: { classMethodCount: number; exportedFunctionCount: number; publicSurfaceCount: number };
      files: Array<{ path: string; sourceSha256: string; lines: number; classes: Array<{ methods: Array<unknown> }>; exportedFunctions: Array<unknown> }>;
    };
    expect(snapshot.summary).toMatchObject({ classMethodCount: 221, exportedFunctionCount: 3, publicSurfaceCount: 224 });
    expect(snapshot.files.map((file) => file.path)).toEqual(expectedPaths);
    for (const file of snapshot.files) {
      expect(file.sourceSha256).toMatch(/^[a-f0-9]{64}$/);
      expect(file.lines).toBeGreaterThan(2_000);
      expect(file.classes.some((entry) => entry.methods.length > 0) || file.exportedFunctions.length > 0).toBe(true);
    }
  });
});
