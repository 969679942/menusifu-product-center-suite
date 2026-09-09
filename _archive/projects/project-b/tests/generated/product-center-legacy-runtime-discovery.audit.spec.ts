import { test } from '../../fixtures/product-center.fixture';
import { waitUntil } from '../../utils/wait';

const routes = [
  { name: '图片管理', path: '/pp/brandpictrue', responsePath: '/ops-brand/brand-images/list' },
  { name: '描述标签', path: '/pp/brand/tag/description', responsePath: '/ops-brand/brand-tags/page' },
  { name: '统计标签', path: '/pp/brand/tag/statistic', responsePath: '/ops-brand/brand-tags/page' },
  { name: '商品角标', path: '/pp/brand/tag/badge', responsePath: '/ops-brand/brand-tags/corner/page' },
] as const;

test.describe('商品中心历史剩余用例只读发现', () => {
  test.describe.configure({ mode: 'serial', timeout: 120_000 });

  for (const route of routes) {
    test(`应采集${route.name}当前页面合同`, async ({ page }, testInfo) => {
      const responsePromise = page.waitForResponse((response) => (
        new URL(response.url()).pathname.endsWith(route.responsePath)
        && response.ok()
      ), { timeout: 60_000 });
      await page.goto(route.path, { waitUntil: 'domcontentloaded' });
      await responsePromise;
      await waitUntil(
        () => page.locator('.ant-spin-spinning:visible').count(),
        (count) => count === 0,
        { timeout: 30_000, message: `${route.name}页面加载未收敛` },
      );
      const evidence = await page.locator('main:visible').evaluate((main) => {
        const visible = (element: Element) => {
          const style = window.getComputedStyle(element);
          const box = element.getBoundingClientRect();
          return style.visibility !== 'hidden' && style.display !== 'none' && box.width > 0 && box.height > 0;
        };
        const summarize = (element: Element) => ({
          tag: element.tagName.toLowerCase(),
          text: (element.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 240),
          role: element.getAttribute('role'),
          name: element.getAttribute('aria-label') ?? element.getAttribute('title'),
          placeholder: element.getAttribute('placeholder'),
          type: element.getAttribute('type'),
          className: element.getAttribute('class'),
          src: element.getAttribute('src'),
        });
        return {
          bodyText: (main.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 4_000),
          controls: Array.from(main.querySelectorAll('button,input,[role="button"],[role="tab"],a'))
            .filter(visible)
            .map(summarize),
          images: Array.from(main.querySelectorAll('img')).filter(visible).map((image) => ({
            ...summarize(image),
            parent: summarize(image.parentElement ?? image),
            grandparent: summarize(image.parentElement?.parentElement ?? image),
          })),
          backgrounds: Array.from(main.querySelectorAll('*')).filter((element) => (
            visible(element) && window.getComputedStyle(element).backgroundImage !== 'none'
          )).map((element) => ({
            ...summarize(element),
            backgroundImage: window.getComputedStyle(element).backgroundImage,
            parent: summarize(element.parentElement ?? element),
            grandparent: summarize(element.parentElement?.parentElement ?? element),
          })).slice(0, 30),
          imageNameNodes: Array.from(main.querySelectorAll('*')).filter((element) => (
            visible(element)
            && /^AUTO_AUDIT_/.test((element.textContent ?? '').trim())
            && !Array.from(element.children).some((child) => /^AUTO_AUDIT_/.test((child.textContent ?? '').trim()))
          )).slice(0, 2).map((element) => ({
            text: (element.textContent ?? '').trim(),
            element: element.outerHTML.slice(0, 2_000),
            parent: element.parentElement?.outerHTML.slice(0, 3_000),
            grandparent: element.parentElement?.parentElement?.outerHTML.slice(0, 4_000),
            ancestors: Array.from({ length: 6 }, (_, index) => {
              let current: Element | null = element;
              for (let depth = 0; depth <= index; depth += 1) current = current?.parentElement ?? null;
              return current ? {
                tag: current.tagName.toLowerCase(),
                className: current.getAttribute('class'),
                role: current.getAttribute('role'),
              } : null;
            }),
          })),
          rows: Array.from(main.querySelectorAll('tr,[role="row"]')).filter(visible).map(summarize).slice(0, 20),
        };
      });
      let dialogEvidence: unknown = null;
      if (route.name !== '图片管理') {
        await page.getByRole('button', { name: 'plus Add', exact: true }).click();
        const dialog = page.locator('[role="dialog"]:visible');
        await dialog.waitFor({ state: 'visible', timeout: 30_000 });
        dialogEvidence = await dialog.evaluate((element) => ({
          text: (element.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 2_000),
          inputs: Array.from(element.querySelectorAll('input')).map((input) => ({
            placeholder: input.getAttribute('placeholder'),
            type: input.getAttribute('type'),
            maxLength: input.getAttribute('maxlength'),
            required: input.getAttribute('aria-required'),
          })),
          buttons: Array.from(element.querySelectorAll('button')).map((button) => ({
            text: (button.textContent ?? '').trim(),
            name: button.getAttribute('aria-label') ?? button.getAttribute('title'),
            disabled: button.hasAttribute('disabled'),
          })),
        }));
      }
      await testInfo.attach(`${route.name}-runtime-discovery`, {
        body: Buffer.from(JSON.stringify({ route, evidence, dialogEvidence }, null, 2)),
        contentType: 'application/json',
      });
      process.stdout.write(`${JSON.stringify({ route: route.path, evidence, dialogEvidence })}\n`);
    });
  }
});
