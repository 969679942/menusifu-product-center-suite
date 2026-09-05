import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';

test('调味模板新增页面与必填校验定向审计', async ({ page }) => {
  const traffic: Array<{ method: string; path: string; status?: number }> = [];
  page.on('response', (response) => {
    const url = new URL(response.url());
    if (/modifier-template|global-modifier/i.test(url.pathname)) {
      traffic.push({ method: response.request().method(), path: url.pathname, status: response.status() });
    }
  });
  await page.goto('/pp/brand/seasoning/template', { waitUntil: 'domcontentloaded' });
  await page.waitForResponse((response) => new URL(response.url()).pathname === '/item/v1/ops-brand/modifier-template/page');
  await page.getByRole('button', { name: /新增模版$/ }).click();
  await page.waitForURL((url) => url.pathname === '/pp/brand/seasoning/addtemplate');
  await page.locator('main input:visible,main textarea:visible').first().waitFor({ state: 'visible' });
  const route = new URL(page.url()).pathname;
  const form = page.locator('form:visible,[role="dialog"]:visible,main:visible');
  const fields = await form.locator('input:visible,textarea:visible,[role="combobox"]:visible').evaluateAll((items) => items.map((item) => ({
    tag: item.tagName.toLowerCase(),
    role: item.getAttribute('role'),
    type: item.getAttribute('type'),
    name: item.getAttribute('name'),
    placeholder: item.getAttribute('placeholder'),
    ariaLabel: item.getAttribute('aria-label'),
    maxLength: item.getAttribute('maxlength'),
    required: (item as HTMLInputElement).required,
    value: (item as HTMLInputElement).value,
  })));
  const labels = await form.locator('label:visible,.ant-form-item-label:visible').allInnerTexts();
  const controls = await form.locator('button:visible,[role="button"]:visible').evaluateAll((items) => items.map((item) => ({
    tag: item.tagName.toLowerCase(),
    role: item.getAttribute('role'),
    name: (item.getAttribute('aria-label') || item.getAttribute('title') || item.textContent || '').trim(),
    disabled: (item as HTMLButtonElement).disabled,
  })).filter((item) => item.name));
  const submit = form.getByRole('button', { name: /确\s*定|保\s*存/, exact: true });
  const submitCount = await submit.count();
  let validation: unknown = { submitted: false, submitCount };
  if (submitCount === 1 && await submit.isEnabled()) {
    const mutationsBefore = traffic.filter((item) => item.method === 'POST' && item.path.endsWith('/ops-brand/modifier-template')).length;
    await submit.click();
    validation = {
      submitted: true,
      invalidFields: await form.locator('.ant-form-item-has-error:visible').allInnerTexts(),
      visibleErrors: await form.locator('[role="alert"]:visible,.ant-form-item-explain-error:visible').allInnerTexts(),
      mutations: traffic.filter((item) => item.method === 'POST' && item.path.endsWith('/ops-brand/modifier-template')).length - mutationsBefore,
    };
  }
  const evidence = {
    merchant: process.env.MC_MERCHANT ?? '',
    brandId: process.env.MC_BRAND_ID ?? '',
    route,
    body: await page.locator('body').innerText(),
    fields,
    labels,
    controls,
    validation,
    traffic,
  };
  fs.writeFileSync(path.resolve(__dirname, '../template-create-live-audit.json'), `${JSON.stringify(evidence, null, 2)}\n`, 'utf8');
  expect(route).toBe('/pp/brand/seasoning/addtemplate');
});
