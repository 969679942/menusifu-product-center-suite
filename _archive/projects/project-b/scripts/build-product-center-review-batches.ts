import fs from 'node:fs';
import path from 'node:path';
import { buildProductCenterReviewBatchSet } from '../utils/product-center-review-batches';

const projectRoot = path.resolve(__dirname, '..');
const reviewDirectory = path.join(projectRoot, 'contracts/product-center/reviews');
const outputDirectory = path.join(reviewDirectory, 'batches');
const p0 = readJson<{ items: Parameters<typeof buildProductCenterReviewBatchSet>[0] }>(
  path.join(reviewDirectory, 'p0-review-items.json'),
);
const contract = readJson<Parameters<typeof buildProductCenterReviewBatchSet>[1]>(
  path.join(projectRoot, 'contracts/product-center/product-center-test-contract.json'),
);
const batchSet = buildProductCenterReviewBatchSet(p0.items, contract, 20);

fs.mkdirSync(outputDirectory, { recursive: true });
for (const name of fs.readdirSync(outputDirectory)) {
  if (/^batch-[a-f0-9]{10}-\d{2}\.json$/.test(name)) {
    fs.rmSync(path.join(outputDirectory, name), { force: true });
  }
}

const files = batchSet.batches.map((batch) => {
  const file = `${batch.id}.json`;
  writeJson(path.join(outputDirectory, file), {
    schemaVersion: batchSet.schemaVersion,
    generatedAt: new Date().toISOString(),
    ...batch,
  });
  return { id: batch.id, group: batch.group, count: batch.items.length, file };
});
writeJson(path.join(outputDirectory, 'manifest.json'), {
  schemaVersion: batchSet.schemaVersion,
  generatedAt: new Date().toISOString(),
  summary: batchSet.summary,
  files,
});

process.stdout.write(`P0 审核批次已生成：${outputDirectory}\n审核项：${batchSet.summary.total}，批次：${batchSet.summary.batchCount}\n`);

function readJson<T>(filePath: string): T {
  return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T;
}

function writeJson(filePath: string, value: unknown): void {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

