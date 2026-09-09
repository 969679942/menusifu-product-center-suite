import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { cleanProductCenterWorkspace } from '../../scripts/clean-product-center-workspace';

test.describe('商品中心工作区瘦身合同', () => {
  test('应只清理可再生结果并保留权威产物与运行依赖', () => {
    const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'pc-cleanup-'));
    try {
      write(projectRoot, 'allure-results/raw.json', 'raw');
      write(projectRoot, 'test-results/result.json', 'result');
      write(projectRoot, 'output/page-screenshot.png', 'image');
      write(projectRoot, 'output/performance/product-center-timing-1.json', '1');
      write(projectRoot, 'output/performance/product-center-timing-2.json', '2');
      write(projectRoot, 'output/performance/product-center-timing-3.json', '3');
      fs.utimesSync(path.join(projectRoot, 'output/performance/product-center-timing-1.json'), 1, 1);
      fs.utimesSync(path.join(projectRoot, 'output/performance/product-center-timing-2.json'), 2, 2);
      fs.utimesSync(path.join(projectRoot, 'output/performance/product-center-timing-3.json'), 3, 3);
      write(projectRoot, 'node_modules/.keep', 'dependency');
      write(projectRoot, 'contracts/product-center/release.json', 'contract');
      write(projectRoot, 'output/product-center-item-final-status.json', 'status');
      const result = cleanProductCenterWorkspace({ projectRoot, retainTimingReports: 2, generatedAt: '2026-08-11T00:00:00.000Z' });
      expect(result.reclaimedBytes).toBeGreaterThan(0);
      expect(fs.existsSync(path.join(projectRoot, 'allure-results'))).toBe(false);
      expect(fs.existsSync(path.join(projectRoot, 'test-results'))).toBe(false);
      expect(fs.existsSync(path.join(projectRoot, 'output/page-screenshot.png'))).toBe(false);
      expect(fs.existsSync(path.join(projectRoot, 'output/performance/product-center-timing-1.json'))).toBe(false);
      expect(fs.existsSync(path.join(projectRoot, 'output/performance/product-center-timing-2.json'))).toBe(true);
      expect(fs.existsSync(path.join(projectRoot, 'output/performance/product-center-timing-3.json'))).toBe(true);
      expect(fs.existsSync(path.join(projectRoot, 'node_modules/.keep'))).toBe(true);
      expect(fs.existsSync(path.join(projectRoot, 'contracts/product-center/release.json'))).toBe(true);
      expect(fs.existsSync(path.join(projectRoot, 'output/product-center-item-final-status.json'))).toBe(true);
    } finally {
      fs.rmSync(projectRoot, { recursive: true, force: true });
    }
  });
});

function write(projectRoot: string, relativePath: string, value: string): void {
  const filePath = path.join(projectRoot, relativePath);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, value, 'utf8');
}
