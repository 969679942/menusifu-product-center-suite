import { chromium } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';

const projectRoot = path.resolve(process.cwd(), '..');
const testOpsRoot = 'D:/Menusifu/TestOps';
const inventoryFile = path.join(projectRoot, 'contracts/product-center/field-boundary-probe-inventory.json');
const secretFile = path.join(projectRoot, '.secrets/runtime.env');
const outputDirectory = path.join(testOpsRoot, 'artifacts', `field-boundary-probe-${Date.now()}`);
const baseUrl = 'https://cc-fe.balamxqa.com';

const parseEnv = (text) => Object.fromEntries(text.split(/\r?\n/).filter(line => line && !line.startsWith('#') && line.includes('=')).map(line => {
  const index = line.indexOf('=');
  return [line.slice(0, index), line.slice(index + 1)];
}));
const env = parseEnv(await fs.readFile(secretFile, 'utf8'));
if (!env.MC_USERNAME || !env.MC_PASSWORD) throw new Error('缺少运行时登录凭据');
await fs.mkdir(outputDirectory, { recursive: true });
const inventory = JSON.parse(await fs.readFile(inventoryFile, 'utf8'));
const requestedIds = new Set((process.env.FIELD_PROBE_IDS || '').split(',').filter(Boolean));
const recordsToProbe = requestedIds.size ? inventory.records.filter(record => requestedIds.has(record.id)) : inventory.records;
if (requestedIds.size && recordsToProbe.length !== requestedIds.size) throw new Error('指定字段 ID 未全部命中 inventory');
const browser = await chromium.launch({ headless: true, executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
const context = await browser.newContext({ ignoreHTTPSErrors: true, locale: 'zh-CN', viewport: { width: 1440, height: 1000 } });
const report = { generatedAt: new Date().toISOString(), source: inventoryFile, total: recordsToProbe.length, requestedIds: [...requestedIds], records: [], summary: {} };

async function login() {
  const page = await context.newPage();
  await page.goto(`${baseUrl}/pp/brandpictrue`, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  const emailInput = page.locator('input[type=email]');
  await emailInput.waitFor({ state: 'visible', timeout: 90_000 });
  await emailInput.fill(env.MC_USERNAME);
  await page.locator('input[type=password]').fill(env.MC_PASSWORD);
  await page.getByRole('button', { name: /sign in/i }).click();
  const dialog = page.getByRole('dialog');
  await dialog.waitFor({ state: 'visible' });
  const merchant = dialog.locator('div[class*=merchantCard]').filter({ hasText: 'Menusifu SCH Restaurant' });
  if (await merchant.count() !== 1) throw new Error('商户卡片定位不唯一');
  await merchant.click();
  await dialog.getByRole('button', { name: /确 定/ }).click();
  await dialog.waitFor({ state: 'hidden' });
  await page.close();
}

async function probeInput(locator, baseRecord) {
  try { await locator.waitFor({ state: 'visible', timeout: 30_000 }); }
  catch { return { status: 'blocked', reason: 'locator-not-visible-after-wait', boundaryGenerationAllowed: false }; }
  const count = await locator.count();
  if (count !== 1) return { status: 'blocked', reason: `locator-count-${count}`, boundaryGenerationAllowed: false };
  const sample = 'Aa09_中文-.,!@#😀';
  const longValue = 'A'.repeat(300);
  const attributes = await locator.evaluate(element => ({
    tag: element.tagName,
    type: element.getAttribute('type') || '',
    maxLengthAttribute: element.getAttribute('maxlength'),
    minLengthAttribute: element.getAttribute('minlength'),
    pattern: element.getAttribute('pattern'),
    inputMode: element.getAttribute('inputmode'),
    readOnly: element.hasAttribute('readonly'),
    disabled: element.hasAttribute('disabled'),
  }));
  if (attributes.readOnly || attributes.disabled) return { status: 'not-applicable', reason: attributes.readOnly ? 'readonly' : 'disabled', attributes, boundaryGenerationAllowed: false };
  await locator.fill(sample);
  const sampleValue = await locator.inputValue();
  await locator.fill(longValue);
  const longResult = await locator.inputValue();
  await locator.clear();
  const exactMax = attributes.maxLengthAttribute ? Number(attributes.maxLengthAttribute) : (longResult.length < longValue.length ? longResult.length : null);
  return {
    status: 'probed',
    probeMode: baseRecord.overlayId ? 'dialog-fill-without-submit' : 'page-filter-fill-without-submit',
    attributes,
    characterSet: {
      sample,
      acceptedExactly: sampleValue === sample,
      acceptedValue: sampleValue,
      codePointClasses: ['latin', 'digit', 'underscore', 'cjk', 'punctuation', 'emoji'],
    },
    semanticMaxLength: exactMax === null ? { exact: null, lowerBound: longResult.length, source: 'ui-fill-observation' } : { exact: exactMax, lowerBound: exactMax, source: attributes.maxLengthAttribute ? 'dom-maxlength' : 'ui-truncation' },
    crossFieldRule: baseRecord.overlayId ? 'not-evaluated-no-submit' : 'not-applicable-filter-field',
    boundaryGenerationAllowed: exactMax !== null && sampleValue === sample,
  };
}

async function openDialog(page, route) {
  await page.goto(new URL(route, baseUrl).href, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  if (route === '/pp/brand/tag/statistic' || route === '/pp/brand/tag/description') {
    const trigger = page.getByText('添加', { exact: true });
    try { await trigger.waitFor({ state: 'visible', timeout: 30_000 }); } catch { return { error: 'add-trigger-not-visible-after-wait' }; }
    if (await trigger.count() !== 1) return { error: `add-trigger-count-${await trigger.count()}` };
    await trigger.click();
  } else if (route === '/pp/printer-stall/list') {
    const trigger = page.getByRole('button', { name: /新增打印档口/ });
    try { await trigger.waitFor({ state: 'visible', timeout: 30_000 }); } catch { return { error: 'stall-trigger-not-visible-after-wait' }; }
    if (await trigger.count() !== 1) return { error: `stall-trigger-count-${await trigger.count()}` };
    await trigger.click();
  } else if (route === '/poi/printer-stall/list') {
    await page.goto(`${baseUrl}/poi/printer-stall/list?view=printer`, { waitUntil: 'domcontentloaded', timeout: 60_000 });
    const trigger = page.getByRole('button', { name: /新增打印机/ });
    try { await trigger.waitFor({ state: 'visible', timeout: 30_000 }); } catch { return { error: 'printer-trigger-not-visible-after-wait' }; }
    if (await trigger.count() !== 1) return { error: `printer-trigger-count-${await trigger.count()}` };
    await trigger.click();
  } else return { error: 'unsupported-overlay-route' };
  const dialog = page.locator('[role=dialog]:visible');
  if (await dialog.count() !== 1) return { error: `dialog-count-${await dialog.count()}` };
  return { dialog };
}

function dialogLocator(dialog, record) {
  if (record.label === '标签名称') return dialog.locator('.ant-form-item').filter({ hasText: '标签名称' }).locator('input[type=text]');
  if (record.label === '分组名称') return null;
  if (record.label === '档口名称') return dialog.locator('.ant-form-item').filter({ hasText: '档口名称' }).locator('input,textarea');
  if (record.label === '备注') return dialog.locator('.ant-form-item').filter({ hasText: '备注' }).locator('textarea');
  if (record.label === '打印机名称') return dialog.locator('.ant-form-item').filter({ hasText: '打印机名称' }).locator('input[type=text]');
  if (record.label === '打印档口') return null;
  if (/field-(35|56)$/.test(record.fieldId)) return dialog.getByPlaceholder('标签第二语言', { exact: true });
  if (/field-(37|58)$/.test(record.fieldId)) return dialog.getByPlaceholder('标签组第二语言', { exact: true });
  return null;
}

async function probeRecord(record) {
  if (record.type === 'search') {
    return {
      status: 'not-applicable',
      reason: record.label ? 'controlled-select-search-input' : 'framework-internal-search-input',
      characterSet: 'not-applicable', semanticMaxLength: 'not-applicable', crossFieldRule: record.label ? 'selection-required-by-owning-control' : 'not-applicable',
      boundaryGenerationAllowed: false,
    };
  }
  if (!record.overlayId && record.placeholder) {
    const page = await context.newPage();
    try {
      await page.goto(new URL(record.route, baseUrl).href, { waitUntil: 'domcontentloaded', timeout: 60_000 });
      return await probeInput(page.getByPlaceholder(record.placeholder, { exact: true }), record);
    } finally { await page.close(); }
  }
  if (record.overlayId) {
    const page = await context.newPage();
    try {
      const opened = await openDialog(page, record.route);
      if (opened.error) return { status: 'blocked', reason: opened.error, boundaryGenerationAllowed: false };
      const locator = dialogLocator(opened.dialog, record);
      if (!locator) return { status: 'blocked', reason: 'dynamic-or-unlabeled-dialog-field-needs-secondary-mapping', boundaryGenerationAllowed: false };
      const result = await probeInput(locator, record);
      await page.keyboard.press('Escape');
      return result;
    } finally { await page.close(); }
  }
  return { status: 'blocked', reason: 'no-stable-placeholder-or-label', boundaryGenerationAllowed: false };
}

try {
  await login();
  for (const record of recordsToProbe) {
    let result;
    try { result = await probeRecord(record); }
    catch (error) { result = { status: 'error', error: String(error), boundaryGenerationAllowed: false }; }
    report.records.push({ id: record.id, route: record.route, fieldId: record.fieldId, label: record.label, placeholder: record.placeholder, type: record.type, overlayId: record.overlayId, result });
    await fs.writeFile(path.join(outputDirectory, 'partial.json'), JSON.stringify(report, null, 2));
  }
  report.summary = report.records.reduce((summary, record) => {
    const key = record.result.status;
    summary[key] = (summary[key] || 0) + 1;
    return summary;
  }, {});
} finally {
  await fs.writeFile(path.join(outputDirectory, 'field-boundary-probe.json'), JSON.stringify(report, null, 2));
  await context.clearCookies();
  await browser.close();
}
console.log(JSON.stringify({ outputDirectory, total: report.total, summary: report.summary }, null, 2));
if ((report.summary.error || 0) > 0) process.exitCode = 1;
