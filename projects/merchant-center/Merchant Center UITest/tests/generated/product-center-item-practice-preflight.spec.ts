import fs from 'node:fs';
import path from 'node:path';
import { test } from '../../fixtures/product-center.fixture';
import type {
  ProductCenterItemLiveProbeId,
  ProductCenterItemPracticeContract,
} from '../../utils/product-center-item-practice-contract';

const contractPath = path.resolve(
  process.env.PC_ITEM_PRACTICE_CONTRACT ?? 'output/product-center-item-practice-contract.json',
);
const contract = JSON.parse(fs.readFileSync(contractPath, 'utf8')) as ProductCenterItemPracticeContract;
const probeIds = [...new Set(contract.cases.flatMap((item) => item.liveProbeIds))].sort();

test('商品实战批次在线只读预检', {
  annotation: [{ type: 'practice-preflight', description: contract.fingerprint }],
}, async ({ productCenterApi }, testInfo) => {
  const runId = process.env.PC_ITEM_RUN_ID ?? `preflight-${Date.now()}`;
  const evidence: Array<{ probeId: ProductCenterItemLiveProbeId; status: 'passed' }> = [];
  for (const probeId of probeIds) {
    if (probeId === 'product-page') await productCenterApi.productPage(`AUTO_AUDIT_PREFLIGHT_${runId}`);
    if (probeId === 'combo-group-list') await productCenterApi.comboGroupList();
    if (probeId === 'addon-group-list') await productCenterApi.addonGroupList(`AUTO_AUDIT_PREFLIGHT_${runId}`);
    evidence.push({ probeId, status: 'passed' });
  }
  await testInfo.attach('product-center-item-practice-preflight', {
    body: Buffer.from(JSON.stringify({ contractFingerprint: contract.fingerprint, probes: evidence }, null, 2), 'utf8'),
    contentType: 'application/json',
  });
});
