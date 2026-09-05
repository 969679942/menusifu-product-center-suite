import fs from 'node:fs';
import path from 'node:path';
import { test, type Page, type Request } from '@playwright/test';

const routesByProfile: Record<string, string[]> = {
  'single-store-000407': [
    '/pp/brand/seasoning/list',
    '/pp/brand/seasoning/create',
    '/pp/brand/seasoning/create-select',
    '/pp/brand/seasoning/record',
  ],
  'multi-store-000420': [
    '/pp/brand/seasoning/list',
    '/pp/brand/seasoning/create',
    '/pp/brand/seasoning/create-select',
    '/pp/brand/seasoning/template',
    '/pp/brand/seasoning/addtemplate',
    '/pp/brand/seasoning/record',
    '/poi/location/seasoning',
  ],
};

test('调味管理完整页面合同只读探针', async ({ page }) => {
  const profile = process.env.MC_SEASONING_CONTEXT || 'single-store-000407';
  const routes = routesByProfile[profile];
  if (!routes) throw new Error(`未知调味审计 profile：${profile}`);
  const evidence: Record<string, unknown> = {
    schemaVersion: '1.0.0',
    profile,
    brandId: process.env.MC_BRAND_ID || '',
    collectedAt: new Date().toISOString(),
    businessWrites: 'none',
    routes: [],
  };
  const routeEvidence = evidence.routes as Array<Record<string, unknown>>;

  for (const route of routes) {
    const requests: Array<Record<string, unknown>> = [];
    const listener = (request: Request): void => {
      const url = new URL(request.url());
      if (!/global-modifier|modifier-template|brand-modifier-sync|poi-modifier|merchants/i.test(url.pathname)) return;
      requests.push({
        method: request.method(),
        path: url.pathname,
        brandId: request.headers()['x-brand-id'] || null,
      });
    };
    page.on('request', listener);
    try {
      await page.goto(route, { waitUntil: 'domcontentloaded' });
      await waitForBusinessPage(page);
      routeEvidence.push({
        requestedRoute: route,
        terminalRoute: new URL(page.url()).pathname,
        title: await page.title(),
        body: await page.locator('main:visible').innerText().catch(() => page.locator('body').innerText()),
        controls: await page.locator('button:visible,input:visible,textarea:visible,[role="combobox"]:visible,[role="button"]:visible,a:visible').evaluateAll((items) => items.map((item) => ({
          tag: item.tagName.toLowerCase(),
          role: item.getAttribute('role'),
          name: (item.getAttribute('aria-label') || item.getAttribute('placeholder') || item.getAttribute('title') || item.textContent || '').trim(),
          href: item.getAttribute('href'),
          type: item.getAttribute('type'),
          required: item.getAttribute('aria-required') === 'true' || (item as HTMLInputElement).required,
          disabled: (item as HTMLButtonElement).disabled || item.getAttribute('aria-disabled') === 'true',
          value: 'value' in item ? (item as HTMLInputElement).value : undefined,
          maxLength: item.getAttribute('maxlength'),
          min: item.getAttribute('min'),
          max: item.getAttribute('max'),
        })).filter((item) => item.name || item.href)),
        inputStructures: await page.locator('input:visible').evaluateAll((items) => items.map((item) => ({
          type: item.getAttribute('type'),
          placeholder: item.getAttribute('placeholder'),
          ariaLabel: item.getAttribute('aria-label'),
          required: item.getAttribute('aria-required') === 'true' || (item as HTMLInputElement).required,
          className: item.className,
          parentClassName: item.parentElement?.className || null,
          cellClassName: item.closest('td,th')?.className || null,
          rowClassName: item.closest('tr')?.className || null,
          tableWrapperClassName: item.closest('.ant-table-wrapper')?.className || null,
        }))),
        headers: await page.locator('th:visible,[role="columnheader"]:visible').allInnerTexts(),
        dialogs: await page.locator('[role="dialog"]:visible,.ant-modal:visible,.ant-drawer:visible').allInnerTexts(),
        requests: [...new Map(requests.map((item) => [`${item.method}:${item.path}`, item])).values()],
      });
    } finally {
      page.off('request', listener);
    }
  }

  const outputPath = path.resolve(__dirname, `../full-page-contract-${profile}.json`);
  fs.writeFileSync(outputPath, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8');
});

async function waitForBusinessPage(page: Page): Promise<void> {
  await page.locator('main:visible').waitFor({ state: 'visible', timeout: 30_000 }).catch(() => undefined);
  await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => undefined);
  await page.waitForFunction(() => !/Requesting permissions|正在加载权限/i.test(document.body.innerText), undefined, { timeout: 30_000 });
}
