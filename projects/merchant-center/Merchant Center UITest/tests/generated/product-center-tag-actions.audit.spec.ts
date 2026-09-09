import type { Page } from '@playwright/test';
import { test } from '../../fixtures/product-center.fixture';
import { waitUntil } from '../../utils/wait';

const routes = [
  { kind: 'description', path: '/pp/brand/tag/description', responsePath: '/ops-brand/brand-tags/page' },
  { kind: 'statistic', path: '/pp/brand/tag/statistic', responsePath: '/ops-brand/brand-tags/page' },
  { kind: 'badge', path: '/pp/brand/tag/badge', responsePath: '/ops-brand/brand-tags/corner/page' },
] as const;

test.describe('商品中心标签深度只读审计', () => {
  test.describe.configure({ mode: 'serial', timeout: 180_000 });

  for (const route of routes) {
    test(`${route.kind} 标签列表动作合同`, async ({ page }, testInfo) => {
      const observedRequests: Array<{ method: string; path: string; status: number | null }> = [];
      page.on('response', (response) => {
        const pathname = new URL(response.url()).pathname;
        if (pathname.includes('/ops-brand/brand-tags') || pathname.includes('/ops-brand/brand-items')) {
          observedRequests.push({ method: response.request().method(), path: pathname, status: response.status() });
        }
      });

      await openRoute(page, route);
      const firstRow = page.locator('main:visible tbody tr:visible').first();
      await waitUntil(() => firstRow.count(), (count) => count === 1, {
        timeout: 60_000,
        message: `${route.kind} 标签列表无可审计数据`,
      });
      const rowContract = await firstRow.evaluate((row) => ({
        text: (row.textContent ?? '').replace(/\s+/g, ' ').trim(),
        html: row.outerHTML.slice(0, 12_000),
        links: Array.from(row.querySelectorAll('a')).map((link) => ({
          text: (link.textContent ?? '').trim(),
          href: link.getAttribute('href'),
          className: link.getAttribute('class'),
        })),
        buttons: Array.from(row.querySelectorAll('button')).map((button) => ({
          text: (button.textContent ?? '').trim(),
          ariaLabel: button.getAttribute('aria-label'),
          title: button.getAttribute('title'),
          className: button.getAttribute('class'),
        })),
      }));

      const linkActions = [];
      for (let index = 0; index < Math.min(rowContract.links.length, 3); index += 1) {
        await openRoute(page, route);
        const row = page.locator('main:visible tbody tr:visible').first();
        const link = row.locator('a').nth(index);
        const before = page.url();
        await link.click();
        await waitUntil(() => readOverlays(page), (overlays) => overlays.length > 0, {
          timeout: 10_000,
          message: `${route.kind} 标签列表链接未打开浮层`,
        });
        linkActions.push({
          index,
          text: rowContract.links[index]?.text ?? '',
          before,
          after: page.url(),
          overlays: await readOverlays(page),
        });
      }

      await openRoute(page, route);
      const menuButton = page.locator('main:visible tbody tr:visible').first().locator('button.ant-dropdown-trigger');
      let menuItems: string[] = [];
      if (await menuButton.count()) {
        await menuButton.click();
        menuItems = (await page.locator('.ant-dropdown:visible [role="menuitem"]:visible').allInnerTexts())
          .map((value) => value.replace(/\s+/g, ' ').trim())
          .filter(Boolean);
      }

      await openRoute(page, route);
      await page.getByRole('button', { name: 'plus Add', exact: true }).click();
      const dialog = page.locator('[role="dialog"]:visible');
      await dialog.waitFor({ state: 'visible', timeout: 30_000 });
      const createContract = await dialog.evaluate((root) => ({
        text: (root.textContent ?? '').replace(/\s+/g, ' ').trim(),
        formItems: Array.from(root.querySelectorAll('.ant-form-item')).map((item) => ({
          text: (item.textContent ?? '').replace(/\s+/g, ' ').trim(),
          html: item.outerHTML.slice(0, 5_000),
        })),
        radios: Array.from(root.querySelectorAll('label.ant-radio-wrapper')).map((label) => ({
          text: (label.textContent ?? '').replace(/\s+/g, ' ').trim(),
          checked: Boolean(label.querySelector('input[type="radio"]:checked')),
        })),
      }));

      await testInfo.attach(`tag-${route.kind}-actions`, {
        body: Buffer.from(JSON.stringify({ route, rowContract, linkActions, menuItems, createContract, observedRequests }, null, 2)),
        contentType: 'application/json',
      });
    });

  }

  test('标签创建分组选择与角标非法日期只读合同', async ({ page }, testInfo) => {
    const groupOptions: Record<'description' | 'statistic', string[]> = {
      description: [],
      statistic: [],
    };
    for (const route of routes.filter((item) => item.kind !== 'badge')) {
      await openRoute(page, route);
      await page.getByRole('button', { name: 'plus Add', exact: true }).click();
      const dialog = page.locator('[role="dialog"]:visible');
      await dialog.waitFor({ state: 'visible', timeout: 30_000 });
      await dialog.getByRole('combobox').click();
      const options = page.getByRole('option');
      await waitUntil(() => options.count(), (count) => count > 0, {
        timeout: 10_000,
        message: `${route.kind} 标签分组下拉无选项`,
      });
      groupOptions[route.kind] = (await options.allInnerTexts())
        .map((value) => value.replace(/\s+/g, ' ').trim())
        .filter(Boolean);
      await page.keyboard.press('Escape');
      await dialog.getByRole('button', { name: 'close', exact: true }).click();
    }

    const badgeRoute = routes.find((item) => item.kind === 'badge')!;
    await openRoute(page, badgeRoute);
    await page.getByRole('button', { name: 'plus Add', exact: true }).click();
    const badgeDialog = page.locator('[role="dialog"]:visible');
    await badgeDialog.waitFor({ state: 'visible', timeout: 30_000 });
    const startInput = badgeDialog.locator('input[date-range="start"]');
    const endInput = badgeDialog.locator('input[date-range="end"]');
    await startInput.fill('2026-08-20');
    await startInput.press('Tab');
    await endInput.fill('2026-08-19');
    await endInput.press('Tab');
    const dateContract = {
      startValue: await startInput.inputValue(),
      endValue: await endInput.inputValue(),
      errors: (await badgeDialog.locator('.ant-form-item-explain-error:visible').allInnerTexts())
        .map((value) => value.replace(/\s+/g, ' ').trim())
        .filter(Boolean),
      confirmDisabled: await badgeDialog.getByRole('button', { name: 'Confirm', exact: true }).isDisabled(),
    };

    await testInfo.attach('tag-create-readonly-contract', {
      body: Buffer.from(JSON.stringify({ groupOptions, dateContract }, null, 2)),
      contentType: 'application/json',
    });
  });
});

async function openRoute(page: Page, route: typeof routes[number]): Promise<void> {
  const response = page.waitForResponse((candidate) => (
    candidate.ok() && new URL(candidate.url()).pathname.endsWith(route.responsePath)
  ), { timeout: 60_000 });
  await page.goto(route.path, { waitUntil: 'domcontentloaded' });
  await response;
  await waitUntil(() => page.locator('.ant-spin-spinning:visible').count(), (count) => count === 0, {
    timeout: 30_000,
    message: `${route.kind} 标签列表加载未结束`,
  });
}

async function readOverlays(page: Page): Promise<Array<{ text: string; html: string }>> {
  return page.locator('[role="dialog"]:visible, .ant-drawer:visible').evaluateAll((nodes) => nodes.map((node) => ({
    text: (node.textContent ?? '').replace(/\s+/g, ' ').trim(),
    html: node.outerHTML.slice(0, 12_000),
  })));
}
