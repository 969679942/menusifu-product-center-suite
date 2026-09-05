import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '../../fixtures/product-center.fixture';
import { createAddOnsPage } from '../../pages/product-management/group-list.factory';
import { startProductCenterPageApiCapture } from '../../utils/product-center-page-api-capture';

test('加料组页面 API 只读观测', async ({ page }, testInfo) => {
  const projectRoot = path.resolve(__dirname, '../..');
  const outputPath = path.join(projectRoot, 'output/page-contract/product-center-api-exchanges.json');
  const evidencePath = 'Merchant Center UITest/output/page-contract/product-center-api-exchanges.json';
  const observedAt = new Date().toISOString();
  const capture = startProductCenterPageApiCapture(page, {
    caseId: 'TC-GRP-ADD-003',
    route: '/pp/brand/option-group/additional',
    evidencePath,
    observedAt,
  });

  const pageObject = createAddOnsPage(page);
  await pageObject.open();
  const exchanges = await capture.stop();

  expect(exchanges.length, '页面未捕获到任何可用于 API 文档比对的业务交换').toBeGreaterThan(0);
  const artifact = {
    schemaVersion: '1.0.0',
    collectionId: 'product-center-page-api-exchanges',
    generatedAt: observedAt,
    sourceCaseIds: ['TC-GRP-ADD-003'],
    mutationRequestsObserved: exchanges.filter((item) => ['POST', 'PUT', 'PATCH', 'DELETE'].includes(item.method)).length,
    exchanges,
  };
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  const temporaryPath = `${outputPath}.tmp`;
  fs.writeFileSync(temporaryPath, `${JSON.stringify(artifact, null, 2)}\n`, 'utf8');
  fs.renameSync(temporaryPath, outputPath);
  await testInfo.attach('product-center-api-exchanges', {
    body: Buffer.from(JSON.stringify(artifact, null, 2)),
    contentType: 'application/json',
  });
});
