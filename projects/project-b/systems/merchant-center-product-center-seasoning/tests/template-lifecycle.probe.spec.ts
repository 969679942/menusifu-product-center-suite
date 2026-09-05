import fs from 'node:fs';
import path from 'node:path';
import { expect, test, type Request } from '@playwright/test';
import { ProductCenterApi } from '../../../api/product-center/product-center-api';

test('调味模板可逆生命周期合同探针', async ({ page }, testInfo) => {
  const identity = `AUTO_AUDIT_SEASONING_TEMPLATE_${Date.now()}`;
  let templateId: number | null = null;
  let api: ProductCenterApi;
  const evidence: Record<string, unknown> = { identity, brandId: '000420', requests: [] };
  const requests = evidence.requests as Array<Record<string, unknown>>;
  const onRequest = (request: Request): void => {
    const pathname = new URL(request.url()).pathname;
    if (!/modifier-template|global-modifier|brand-modifier-sync/i.test(pathname)) return;
    requests.push({ method: request.method(), path: pathname, postData: request.postDataJSON?.() ?? null });
  };
  page.on('request', onRequest);
  try {
    api = new ProductCenterApi(page.request);
    await page.goto('/pp/brand/seasoning/addtemplate', { waitUntil: 'domcontentloaded' });
    evidence.preflightCleanup = await cleanupTemplatePrefix(api, 'AUTO_AUDIT_SEASONING_TEMPLATE_');
    await page.getByPlaceholder('调味模版名称').fill(identity);
    await page.getByPlaceholder('请输入第二语言').fill(`${identity}_SECOND`);
    await page.getByPlaceholder('模板说明').fill(`${identity}_DESCRIPTION`);
    const selectSeasoning = page.locator('button:visible').filter({ hasText: /^选择调味$/ });
    expect(await selectSeasoning.count(), '选择调味按钮必须唯一').toBe(1);
    const seasoningResponse = page.waitForResponse((response) => (
      response.request().method() === 'GET'
      && new URL(response.url()).pathname === '/item/v1/ops-brand/global-modifier/list'
      && response.ok()
    ));
    await selectSeasoning.click();
    await seasoningResponse;
    const overlay = page.locator('[role="dialog"]:visible,.ant-modal:visible,.ant-drawer:visible').first();
    await overlay.waitFor({ state: 'visible' });
    evidence.selectionOverlay = {
      body: await overlay.innerText(),
      controls: await overlay.locator('button:visible,input:visible,[role="checkbox"]:visible').evaluateAll((items) => items.map((item) => ({
        tag: item.tagName.toLowerCase(),
        name: (item.getAttribute('aria-label') || item.textContent || '').trim(),
        type: item.getAttribute('type'),
        disabled: (item as HTMLButtonElement).disabled,
      }))),
    };
    const checkboxes = page.locator('[role="dialog"]:visible input[type="checkbox"]:visible,.ant-modal:visible input[type="checkbox"]:visible');
    await checkboxes.first().waitFor({ state: 'visible', timeout: 30_000 });
    expect(await checkboxes.count(), '选择调味弹窗必须有可选调味').toBeGreaterThan(0);
    await checkboxes.first().check();
    const confirm = overlay.getByRole('button', { name: /^(?:确\s*定|Confirm)$/i });
    await confirm.click();
    await overlay.waitFor({ state: 'hidden' });
    const createResponsePromise = page.waitForResponse((response) => (
      response.request().method() === 'POST'
      && new URL(response.url()).pathname === '/item/v1/ops-brand/modifier-template'
    ));
    await page.getByRole('button', { name: /^保\s*存$/ }).click();
    const createResponse = await createResponsePromise;
    expect(createResponse.ok(), `模板创建状态：${createResponse.status()}`).toBe(true);
    const created = await waitForTemplate(api, identity);
    templateId = created.id;
    expect(templateId, '模板创建响应必须返回服务端 ID').not.toBeNull();
    evidence.create = { status: createResponse.status(), templateId, record: created.record };

    const detailBody = await api.seasoningTemplateDetail(templateId);
    evidence.detail = { body: detailBody };
    expect(JSON.stringify(detailBody)).toContain(identity);
  } finally {
    page.off('request', onRequest);
    api ??= new ProductCenterApi(page.request);
    if (templateId === null) templateId = (await findTemplate(api, identity))?.id ?? null;
    if (templateId !== null) {
      const deleteBody = await api.deleteSeasoningTemplate(templateId);
      evidence.cleanup = { id: templateId, body: deleteBody };
      const verifyBody = await api.seasoningTemplatePage(identity);
      const residue = countIdentity(verifyBody, identity);
      evidence.zeroResidue = { api: residue === 0, residue };
      expect(residue).toBe(0);
    }
    const outputPath = path.resolve(__dirname, '../template-lifecycle-live-contract.json');
    fs.writeFileSync(outputPath, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8');
    await testInfo.attach('template-lifecycle-live-contract', {
      contentType: 'application/json', body: Buffer.from(JSON.stringify(evidence, null, 2)),
    });
  }
});

async function findTemplate(api: ProductCenterApi, identity: string): Promise<{ id: number; record: Record<string, unknown> } | null> {
  const body = await api.seasoningTemplatePage(identity);
  return findNamedRecord(body, identity);
}

async function waitForTemplate(api: ProductCenterApi, identity: string): Promise<{ id: number; record: Record<string, unknown> }> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < 30_000) {
    const found = await findTemplate(api, identity);
    if (found) return found;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`模板创建后未按业务身份回读：${identity}`);
}

function findNamedRecord(value: unknown, identity: string): { id: number; record: Record<string, unknown> } | null {
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findNamedRecord(item, identity);
      if (found) return found;
    }
    return null;
  }
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  if (record.name === identity && Number.isFinite(Number(record.id))) return { id: Number(record.id), record };
  for (const item of Object.values(record)) {
    const found = findNamedRecord(item, identity);
    if (found) return found;
  }
  return null;
}

async function cleanupTemplatePrefix(api: ProductCenterApi, prefix: string): Promise<{ deletedIds: number[]; residue: number }> {
  const body = await api.seasoningTemplatePage(prefix);
  const records = collectNamedRecords(body, prefix);
  const deletedIds: number[] = [];
  for (const record of records) {
    await api.deleteSeasoningTemplate(record.id);
    deletedIds.push(record.id);
  }
  const residue = collectNamedRecords(await api.seasoningTemplatePage(prefix), prefix).length;
  if (residue > 0) throw new Error(`历史调味模板清理残留：${residue}`);
  return { deletedIds, residue };
}

function collectNamedRecords(value: unknown, prefix: string, output: Array<{ id: number; name: string }> = []): Array<{ id: number; name: string }> {
  if (Array.isArray(value)) {
    for (const item of value) collectNamedRecords(item, prefix, output);
    return [...new Map(output.map((item) => [item.id, item])).values()];
  }
  if (!value || typeof value !== 'object') return output;
  const record = value as Record<string, unknown>;
  if (typeof record.name === 'string' && record.name.startsWith(prefix) && Number.isFinite(Number(record.id))) {
    output.push({ id: Number(record.id), name: record.name });
  }
  for (const item of Object.values(record)) collectNamedRecords(item, prefix, output);
  return [...new Map(output.map((item) => [item.id, item])).values()];
}

function countIdentity(value: unknown, identity: string): number {
  if (Array.isArray(value)) return value.reduce<number>((total, item) => total + countIdentity(item, identity), 0);
  if (!value || typeof value !== 'object') return 0;
  const record = value as Record<string, unknown>;
  return (record.name === identity ? 1 : 0)
    + Object.values(record).reduce<number>((total, item) => total + countIdentity(item, identity), 0);
}
