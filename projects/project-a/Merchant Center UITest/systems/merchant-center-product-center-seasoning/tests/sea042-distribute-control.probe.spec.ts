import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { waitUntil } from '../../../utils/wait';

test('SEA-042 单门店品牌下发入口只读审计', async ({ page }) => {
  const outputRoot = path.resolve(__dirname, '../audit-sea042');
  const reportPath = path.join(outputRoot, 'control-inventory.json');
  fs.mkdirSync(outputRoot, { recursive: true });
  const businessResponses: Array<{ method: string; path: string; status: number }> = [];
  const blockedMutations: Array<{ method: string; path: string }> = [];
  page.on('response', (response) => {
    const url = new URL(response.url());
    if (/global-modifier|brand-modifier-sync/.test(url.pathname)) {
      businessResponses.push({ method: response.request().method(), path: url.pathname, status: response.status() });
    }
  });

  await page.goto('/pp/brand/seasoning/list', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('main:visible')).toContainText(/调味|Seasoning/, { timeout: 30_000 });
  await page.waitForLoadState('networkidle').catch(() => undefined);
  const rawControls = await page.locator('main:visible').locator('button, [role="button"], a[href], input').evaluateAll((elements) => elements
    .filter((element) => Boolean((element as HTMLElement).offsetParent))
    .map((element) => ({
      tag: element.tagName.toLowerCase(),
      role: element.getAttribute('role'),
      accessibleName: (element.getAttribute('aria-label')
        || element.getAttribute('title')
        || element.getAttribute('placeholder')
        || element.textContent
        || '').replace(/\s+/g, ' ').trim(),
      disabled: (element as HTMLButtonElement).disabled || element.getAttribute('aria-disabled') === 'true',
      href: element.getAttribute('href'),
      className: typeof element.className === 'string' ? element.className : '',
    })));
  const controls = rawControls.map(({ className, ...item }) => ({
    ...item,
    classFingerprint: crypto.createHash('sha256').update(className).digest('hex'),
  }));
  const distributionControls = controls.filter((item) => /下发|同步|distribut|sync/i.test(item.accessibleName));
  await page.route('**/ops-brand/brand-modifier-sync/all', async (route) => {
    const request = route.request();
    blockedMutations.push({ method: request.method(), path: new URL(request.url()).pathname });
    await route.abort('blockedbyclient');
  });
  const distributionButton = page.locator('main:visible').getByRole('button', { name: /下发$/ });
  await expect(distributionButton).toHaveCount(1);
  await distributionButton.click();
  const dialog = page.getByRole('dialog');
  const distributionOutcomeCount = await waitUntil(
    async () => blockedMutations.length + await dialog.count(),
    (count) => count > 0,
    { timeout: 10_000, interval: 100, message: '单门店品牌下发入口未出现弹窗或受控请求' },
  );
  expect(distributionOutcomeCount, '单门店品牌下发入口应出现弹窗或受控请求').toBeGreaterThan(0);
  const dialogContract = await dialog.isVisible() ? {
    text: (await dialog.innerText()).replace(/\s+/g, ' ').trim(),
    controls: await dialog.locator('button, [role="button"], input, textarea, [role="combobox"]').evaluateAll((elements) => elements
      .filter((element) => Boolean((element as HTMLElement).offsetParent))
      .map((element) => ({
        tag: element.tagName.toLowerCase(),
        role: element.getAttribute('role'),
        accessibleName: (element.getAttribute('aria-label')
          || element.getAttribute('title')
          || element.getAttribute('placeholder')
          || element.textContent
          || '').replace(/\s+/g, ' ').trim(),
        disabled: (element as HTMLButtonElement).disabled || element.getAttribute('aria-disabled') === 'true',
        required: element.getAttribute('aria-required') === 'true' || (element as HTMLInputElement).required,
        type: element.getAttribute('type'),
      }))),
  } : null;
  await page.screenshot({ path: path.join(outputRoot, 'brand-seasoning-list.png'), fullPage: true });
  fs.writeFileSync(reportPath, `${JSON.stringify({
    schemaVersion: '1.0.0',
    collectedAt: new Date().toISOString(),
    route: new URL(page.url()).pathname,
    context: { profile: 'single-store-000407', brandId: '000407', merchant: 'Menusifu SCH Restaurant' },
    mutationAuthorized: false,
    businessWrites: 0,
    blockedMutations,
    controls,
    distributionControls,
    dialogContract,
    businessResponses,
  }, null, 2)}\n`, 'utf8');
  expect(distributionControls.length, '单门店品牌调味页没有发现可见下发入口').toBeGreaterThan(0);
});
