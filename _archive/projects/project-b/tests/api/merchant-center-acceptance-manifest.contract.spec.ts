import { expect, test } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { productCenterAcceptanceProject } from '../../acceptance/projects/product-center.acceptance';
import { storeProductAcceptanceProject } from '../../acceptance/projects/store-product.acceptance';

test.describe('商户中心验收项目清单', () => {
  test('商品中心与门店商品管理应共享认证适配器和扫描内核', async () => {
    expect(productCenterAcceptanceProject.manifest.routes).toHaveLength(34);
    expect(storeProductAcceptanceProject.manifest.routes).toHaveLength(10);
    expect(storeProductAcceptanceProject.auth).toBe(productCenterAcceptanceProject.auth);

    const productRoutes = new Set(productCenterAcceptanceProject.manifest.routes.map((route) => route.path));
    expect(storeProductAcceptanceProject.manifest.routes.every((route) => productRoutes.has(route.path))).toBe(true);
  });

  test('通用验收核心不得包含商品中心硬编码', async () => {
    const coreDirectory = path.resolve(process.cwd(), 'utils/acceptance');
    const content = fs.readdirSync(coreDirectory)
      .filter((name) => name.endsWith('.ts'))
      .map((name) => fs.readFileSync(path.join(coreDirectory, name), 'utf8'))
      .join('\n');

    expect(content).not.toContain('product-center');
    expect(content).not.toContain('/pp/');
    expect(content).not.toContain('000407');
    expect(content).not.toContain('商品中心');
  });

  test('独立验收 CLI 应复用 Playwright 管理的 Chromium 运行时', async () => {
    const source = fs.readFileSync(path.resolve(
      process.cwd(),
      'scripts/run-project-acceptance.ts',
    ), 'utf8');

    expect(source).toContain('chromium.launch({ headless: true })');
    expect(source).not.toContain("channel: 'chrome'");
  });

  test('认证适配器语言环境应与英文 DOM 定位合同一致', async () => {
    const source = fs.readFileSync(path.resolve(
      process.cwd(),
      'acceptance/projects/merchant-center-auth.adapter.ts',
    ), 'utf8');

    expect(source).toContain("locale: 'en-US'");
    expect(source).not.toContain("locale: 'zh-CN'");
  });
});
