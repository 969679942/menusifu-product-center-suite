import fs from 'node:fs';
import path from 'node:path';
import { test, expect } from '@playwright/test';

test('调味模板下发门店上下文定向审计', async ({ page }, testInfo) => {
  const requests: Array<{ method: string; path: string; status?: number; brandHeaders?: Record<string, string> }> = [];
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (/modifier|seasoning|poi|merchant|dispatch|sync/i.test(url.pathname)) {
      const brandHeaders = Object.fromEntries(Object.entries(request.headers()).filter(([name]) => /brand/i.test(name)));
      requests.push({ method: request.method(), path: url.pathname, ...(Object.keys(brandHeaders).length > 0 ? { brandHeaders } : {}) });
    }
  });
  page.on('response', (response) => {
    const url = new URL(response.url());
    const item = [...requests].reverse().find((candidate) => candidate.method === response.request().method() && candidate.path === url.pathname && candidate.status === undefined);
    if (item) item.status = response.status();
  });
  await page.goto('/pp/brand/seasoning/template', { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle').catch(() => undefined);
  const before = await page.locator('body').innerText();
  const controls = await page.locator('button, input, [role="button"], a[href]').evaluateAll((elements) => elements.filter((element) => Boolean((element as HTMLElement).offsetParent)).map((element) => ({ tag: element.tagName.toLowerCase(), role: element.getAttribute('role'), name: (element.getAttribute('aria-label') || element.getAttribute('placeholder') || element.textContent || '').trim(), href: element.getAttribute('href'), type: element.getAttribute('type'), disabled: (element as HTMLButtonElement).disabled })).filter((item) => item.name || item.href));
  const distribution = page.locator('button:visible').filter({ hasText: /下发|发布|分发/i }).first();
  const distributionCount = await page.locator('button:visible').filter({ hasText: /下发|发布|分发/i }).count();
  let clicked = false;
  let after = '';
  if (distributionCount > 0 && await distribution.isEnabled().catch(() => false)) {
    await distribution.click();
    clicked = true;
    await page.waitForLoadState('networkidle').catch(() => undefined);
    after = await page.locator('body').innerText();
  }
  const card = page.getByText('NRA', { exact: true }).first();
  const hoverEvidence = await card.isVisible().then(async (visible) => {
    if (!visible) return { visible: false, ancestor: null, controls: [], body: '' };
    await card.hover();
    const ancestor = await card.evaluate((node) => {
      let current: HTMLElement | null = node as HTMLElement;
      for (let depth = 0; current && depth < 6; depth += 1, current = current.parentElement) {
        const controls = Array.from(current.querySelectorAll<HTMLElement>('button,[role="button"],a')).filter((item) => item.offsetParent).map((item) => ({
          tag: item.tagName.toLowerCase(),
          name: (item.getAttribute('aria-label') || item.getAttribute('title') || item.textContent || '').trim(),
          href: item.getAttribute('href'),
          testId: item.getAttribute('data-testid'),
        }));
        if (controls.length > 0) return { tag: current.tagName.toLowerCase(), className: current.className, text: (current.innerText || '').trim(), controls };
      }
      return null;
    });
    const visibleControls = await page.locator('button:visible,[role="button"]:visible,a:visible').evaluateAll((items) => items.map((item) => ({
      tag: item.tagName.toLowerCase(),
      name: (item.getAttribute('aria-label') || item.getAttribute('title') || item.textContent || '').trim(),
      href: item.getAttribute('href'),
      testId: item.getAttribute('data-testid'),
    })).filter((item) => item.name));
    return { visible: true, ancestor, controls: visibleControls, body: await page.locator('body').innerText() };
  }).catch((error) => ({ visible: false, ancestor: String(error), controls: [], body: '' }));
  const cardActionEvidence = await card.isVisible().then(async (visible) => {
    if (!visible) return { clicked: false, trigger: null, overlays: [], controls: [], body: '' };
    const cardRoot = card.locator('xpath=ancestor::div[contains(@class,"card")][1]');
    const action = cardRoot.locator('button:visible');
    const count = await action.count();
    if (count !== 1) return { clicked: false, trigger: { count }, overlays: [], controls: [], body: '' };
    const trigger = await action.evaluate((item) => ({
      ariaLabel: item.getAttribute('aria-label'),
      title: item.getAttribute('title'),
      className: item.className,
      html: item.innerHTML,
      svg: Array.from(item.querySelectorAll('svg')).map((svg) => ({
        dataIcon: svg.getAttribute('data-icon'),
        ariaLabel: svg.getAttribute('aria-label'),
        className: svg.getAttribute('class'),
      })),
    }));
    await action.click();
    const overlays = await page.locator('[role="menu"]:visible,[role="dialog"]:visible,.ant-popover:visible,.ant-dropdown:visible').evaluateAll((items) => items.map((item) => ({
      role: item.getAttribute('role'),
      className: item.className,
      text: (item as HTMLElement).innerText.trim(),
    })));
    const overlayControls = await page.locator('[role="menu"]:visible button,[role="menu"]:visible [role="menuitem"],[role="dialog"]:visible button,.ant-popover:visible button,.ant-dropdown:visible button,.ant-dropdown:visible [role="menuitem"]').evaluateAll((items) => items.filter((item) => Boolean((item as HTMLElement).offsetParent)).map((item) => ({
      tag: item.tagName.toLowerCase(),
      role: item.getAttribute('role'),
      name: (item.getAttribute('aria-label') || item.getAttribute('title') || item.textContent || '').trim(),
    })).filter((item) => item.name));
    const distributionAction = page.locator('.ant-dropdown:visible').getByText('下发', { exact: true });
    const distributionActionCount = await distributionAction.count();
    let distribution: unknown = { opened: false, actionCount: distributionActionCount };
    if (distributionActionCount === 1) {
      const requestStart = requests.length;
      const merchantPageResponse = page.waitForResponse((response) => (
        response.request().method() === 'POST'
        && new URL(response.url()).pathname === '/item/v1/ops-brand/merchants/page'
      ));
      await distributionAction.click();
      const response = await merchantPageResponse;
      const responseBody = await response.json().catch(() => null);
      await page.getByRole('dialog').getByText('暂无数据', { exact: true }).waitFor({ state: 'hidden', timeout: 10_000 }).catch(() => undefined);
      distribution = {
        opened: true,
        route: new URL(page.url()).pathname,
        merchantPageResponse: { status: response.status(), body: responseBody },
        overlays: await page.locator('[role="dialog"]:visible,.ant-modal:visible,.ant-drawer:visible').evaluateAll((items) => items.map((item) => ({ role: item.getAttribute('role'), className: item.className, text: (item as HTMLElement).innerText.trim() }))),
        fields: await page.locator('input:visible,textarea:visible,[role="combobox"]:visible').evaluateAll((items) => items.map((item) => ({ tag: item.tagName.toLowerCase(), role: item.getAttribute('role'), type: item.getAttribute('type'), placeholder: item.getAttribute('placeholder'), ariaLabel: item.getAttribute('aria-label'), disabled: (item as HTMLInputElement).disabled }))),
        controls: await page.locator('[role="dialog"]:visible button,.ant-modal:visible button,.ant-drawer:visible button,[role="dialog"]:visible [role="checkbox"]').evaluateAll((items) => items.filter((item) => Boolean((item as HTMLElement).offsetParent)).map((item) => ({ tag: item.tagName.toLowerCase(), role: item.getAttribute('role'), name: (item.getAttribute('aria-label') || item.getAttribute('title') || item.textContent || '').trim(), disabled: (item as HTMLButtonElement).disabled })).filter((item) => item.name)),
        requests: requests.slice(requestStart),
      };
    }
    return { clicked: true, trigger, overlays, controls: overlayControls, distribution, body: await page.locator('body').innerText() };
  }).catch((error) => ({ clicked: false, trigger: String(error), overlays: [], controls: [], body: '' }));
  const distributionDialogEvidence = await page.getByRole('menuitem', { name: '下发', exact: true }).isVisible().then(async (visible) => {
    if (!visible) return { opened: false, route: new URL(page.url()).pathname, overlays: [], fields: [], controls: [], requests: [] };
    const requestStart = requests.length;
    await page.getByRole('menuitem', { name: '下发', exact: true }).click();
    const dialogOrPage = await page.locator('[role="dialog"]:visible,main:visible').evaluateAll((items) => items.map((item) => ({
      role: item.getAttribute('role'),
      className: item.className,
      text: (item as HTMLElement).innerText.trim(),
    })));
    const fields = await page.locator('input:visible,textarea:visible,[role="combobox"]:visible').evaluateAll((items) => items.map((item) => ({
      tag: item.tagName.toLowerCase(),
      role: item.getAttribute('role'),
      type: item.getAttribute('type'),
      placeholder: item.getAttribute('placeholder'),
      ariaLabel: item.getAttribute('aria-label'),
      disabled: (item as HTMLInputElement).disabled,
    })));
    const actionControls = await page.locator('button:visible,[role="dialog"]:visible [role="button"],[role="dialog"]:visible [role="checkbox"]').evaluateAll((items) => items.map((item) => ({
      tag: item.tagName.toLowerCase(),
      role: item.getAttribute('role'),
      name: (item.getAttribute('aria-label') || item.getAttribute('title') || item.textContent || '').trim(),
      disabled: (item as HTMLButtonElement).disabled,
    })).filter((item) => item.name));
    return { opened: true, route: new URL(page.url()).pathname, overlays: dialogOrPage, fields, controls: actionControls, requests: requests.slice(requestStart) };
  }).catch((error) => ({ opened: false, route: new URL(page.url()).pathname, error: String(error), overlays: [], fields: [], controls: [], requests: [] }));
  const evidence = { merchant: process.env.MC_MERCHANT ?? '', brandId: process.env.MC_BRAND_ID ?? '', route: new URL(page.url()).pathname, controls, distributionCount, clicked, before, after, hoverEvidence, cardActionEvidence, distributionDialogEvidence, requests };
  const evidencePath = path.resolve(__dirname, `../template-distribution-live-audit-${process.env.MC_BRAND_ID ?? 'unknown'}.json`);
  fs.writeFileSync(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8');
  await testInfo.attach('seasoning-template-distribution-audit', { contentType: 'application/json', body: Buffer.from(JSON.stringify(evidence, null, 2)) });
  expect(new URL(page.url()).pathname).toBe('/pp/brand/seasoning/template');
});
