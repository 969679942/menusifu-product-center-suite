import { expect, test } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { buildReviewBatches } from '../../utils/review-batch';
import { buildProductCenterReviewBatchSet } from '../../utils/product-center-review-batches';

test.describe('商品中心 P0 审核批次', () => {
  test('通用批次构建器应限制单包数量并保持无重复遗漏', async () => {
    const items = Array.from({ length: 43 }, (_, index) => ({
      id: `review-${index + 1}`,
      group: index < 21 ? 'group-a' : 'group-b',
      payload: { question: `问题 ${index + 1}` },
    }));

    const result = buildReviewBatches(items, 20);
    const ids = result.batches.flatMap((batch) => batch.items.map((item) => item.id));

    expect(result.summary.total).toBe(43);
    expect(result.batches.every((batch) => batch.items.length <= 20)).toBe(true);
    expect(new Set(ids).size).toBe(43);
    expect(ids.sort()).toEqual(items.map((item) => item.id).sort());
  });

  test('现有九十四条 P0 应按 API 模块生成完整审核包', async () => {
    const p0 = JSON.parse(fs.readFileSync(path.resolve(
      process.cwd(),
      'contracts/product-center/reviews/p0-review-items.json',
    ), 'utf8'));
    const contract = JSON.parse(fs.readFileSync(path.resolve(
      process.cwd(),
      'contracts/product-center/product-center-test-contract.json',
    ), 'utf8'));

    const result = buildProductCenterReviewBatchSet(p0.items, contract, 20);
    const ids = result.batches.flatMap((batch) => batch.items.map((item) => item.id));

    expect(result.summary.total).toBe(94);
    expect(result.batches.every((batch) => batch.items.length <= 20)).toBe(true);
    expect(new Set(ids).size).toBe(94);
    expect(result.batches.every((batch) => batch.group.length > 0)).toBe(true);
  });
});
