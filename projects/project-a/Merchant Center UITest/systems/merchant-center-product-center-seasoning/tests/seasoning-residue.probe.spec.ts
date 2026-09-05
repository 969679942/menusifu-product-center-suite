import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { ProductCenterApi } from '../../../api/product-center/product-center-api';

test('调味探针残留按服务端 ID 清理', async ({ request }) => {
  const api = new ProductCenterApi(request);
  const prefixes = ['AUTO_AUDIT_PRICE_MAX_'];
  const before = findByPrefixes(await api.seasoningList(), prefixes);
  for (const record of before) await api.deleteSeasoning(record.id);
  const after = findByPrefixes(await api.seasoningList(), prefixes);
  const evidence = { prefixes, deleted: before, residue: after };
  fs.writeFileSync(path.resolve(__dirname, '../seasoning-residue-cleanup.json'), `${JSON.stringify(evidence, null, 2)}\n`, 'utf8');
  expect(after).toEqual([]);
});

function findByPrefixes(value: unknown, prefixes: string[], output: Array<{ id: number; name: string }> = []): Array<{ id: number; name: string }> {
  if (Array.isArray(value)) {
    for (const item of value) findByPrefixes(item, prefixes, output);
    return [...new Map(output.map((item) => [item.id, item])).values()];
  }
  if (!value || typeof value !== 'object') return output;
  const record = value as Record<string, unknown>;
  const name = typeof record.name === 'string' ? record.name : '';
  if (name && prefixes.some((prefix) => name.startsWith(prefix)) && Number.isFinite(Number(record.id))) {
    output.push({ id: Number(record.id), name });
  }
  for (const item of Object.values(record)) findByPrefixes(item, prefixes, output);
  return [...new Map(output.map((item) => [item.id, item])).values()];
}
