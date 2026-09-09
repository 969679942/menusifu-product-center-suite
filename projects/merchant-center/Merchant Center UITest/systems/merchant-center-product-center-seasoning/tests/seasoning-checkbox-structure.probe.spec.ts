import fs from 'node:fs';
import path from 'node:path';
import { test } from '@playwright/test';

test('调味列表复选框结构只读探针', async ({ page }) => {
  await page.goto('/pp/brand/seasoning/list', { waitUntil: 'domcontentloaded' });
  await page.locator('main:visible').getByRole('button', { name: /批量操作/ }).waitFor({ state: 'visible' });
  const structures = await page.locator('main:visible input[type="checkbox"]:visible').evaluateAll((items) => items.map((item) => {
    const ancestors: Array<{ tag: string; className: string; text: string }> = [];
    let current: Element | null = item.parentElement;
    while (current && ancestors.length < 8) {
      ancestors.push({
        tag: current.tagName.toLowerCase(),
        className: String(current.className || ''),
        text: (current.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 200),
      });
      current = current.parentElement;
    }
    return {
      ariaLabel: item.getAttribute('aria-label'),
      checked: (item as HTMLInputElement).checked,
      ancestors,
    };
  }));
  const batchButton = page.locator('main:visible').getByRole('button', { name: /批量操作/ });
  const dataCheckbox = page.locator('main:visible input[type="checkbox"]:visible:not([aria-label="Select all"])').first();
  const eventProbe = {
    before: { checked: await dataCheckbox.isChecked(), batchDisabled: await batchButton.isDisabled() },
    after: { checked: false, batchDisabled: true, batchText: '' },
  };
  await dataCheckbox.dispatchEvent('click');
  eventProbe.after = {
    checked: await dataCheckbox.isChecked(),
    batchDisabled: await batchButton.isDisabled(),
    batchText: (await batchButton.innerText()).trim(),
  };
  const batchAncestors = await batchButton.evaluate((element) => {
    const output: Array<{ tag: string; className: string; text: string }> = [];
    let current: Element | null = element;
    while (current && output.length < 5) {
      output.push({
        tag: current.tagName.toLowerCase(),
        className: String(current.className || ''),
        text: (current.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 300),
      });
      current = current.parentElement;
    }
    return output;
  });
  await batchButton.click();
  const batchMenuText = await page.locator('.ant-dropdown:visible').innerText().catch(() => '');
  fs.writeFileSync(
    path.resolve(__dirname, '../seasoning-checkbox-structure.json'),
    `${JSON.stringify({ collectedAt: new Date().toISOString(), businessWrites: 'none', structures, eventProbe, batchAncestors, batchMenuText }, null, 2)}\n`,
    'utf8',
  );
});
