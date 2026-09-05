import { request } from '@playwright/test';
import { ProductCenterApi } from '../api/product-center/product-center-api';

const storageStatePath = 'C:/Users/Administrator/AppData/Local/Temp/menusifu-merchant-center-system-test-auth/seasoning-multi-store-000420.json';
const identities = [
  'AUTO_AUDIT_TPL_011_1787706530106',
  'AUTO_AUDIT_TPL_012_1787706590079',
  'AUTO_AUDIT_TPL_014_1787706647605',
  'AUTO_AUDIT_TPL_025_1787706951254',
];

process.env.MC_BRAND_ID = '000420';
process.env.MC_POI_ID = 'M000023918';
async function main(): Promise<void> {
  const context = await request.newContext({ storageState: storageStatePath });
  try {
    const api = new ProductCenterApi(context);
    const page = await api.seasoningTemplatePage('');
    const rows = findRows(page);
    const matched = rows.filter((row) => identities.includes(row.name) && Number.isFinite(row.id));
    for (const row of matched) {
      const detail = await api.seasoningTemplateDetail(row.id);
      const detailName = findName(detail);
      if (detailName !== row.name) throw new Error(`模板身份回读不一致，拒绝删除：${row.name}/${detailName}`);
      await api.deleteSeasoningTemplate(row.id);
    }
    const after = findRows(await api.seasoningTemplatePage(''));
    const remaining = after.filter((row) => identities.includes(row.name));
    if (remaining.length > 0) throw new Error(`模板残留清理失败：${remaining.map((row) => row.name).join(',')}`);
    process.stdout.write(JSON.stringify({ matched, remaining }, null, 2));
  } finally {
    await context.dispose();
  }
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exitCode = 1;
});

function findRows(value: unknown): Array<{ id: number; name: string }> {
  const candidates: unknown[] = [];
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    for (const key of ['list', 'records', 'rows', 'data']) {
      const item = record[key];
      if (Array.isArray(item)) candidates.push(...item);
      else if (item && typeof item === 'object') candidates.push(...findRows(item));
    }
  }
  return candidates.flatMap((item) => {
    if (!item || typeof item !== 'object') return [];
    const record = item as Record<string, unknown>;
    const id = Number(record.id ?? record.templateId ?? record.modifierTemplateId);
    const name = String(record.name ?? record.templateName ?? '');
    return Number.isFinite(id) && name ? [{ id, name }] : [];
  });
}

function findName(value: unknown): string {
  if (!value || typeof value !== 'object') return '';
  const record = value as Record<string, unknown>;
  if (typeof record.name === 'string') return record.name;
  if (typeof record.templateName === 'string') return record.templateName;
  return '';
}
