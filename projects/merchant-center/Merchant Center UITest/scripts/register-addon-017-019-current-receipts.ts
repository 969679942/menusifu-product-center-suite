import fs from 'node:fs';
import path from 'node:path';
import { publishImmutableArtifact } from '../utils/immutable-artifact';
import { fingerprintExecutionContext } from '../../Test Automation Platform/src/utils/test-execution-state';

const root = process.cwd();
const manifestPath = 'contracts/product-center/test-cases/canonical/product-center-item-current-receipt-contract.json';
const reportPath = process.env.ADDON_CURRENT_RECEIPT_REPORT?.trim()
  || 'output/product-center-item-source-governed-20260912T163201Z.json';
const ids = (process.env.ADDON_CURRENT_RECEIPT_CASE_IDS?.split(',').map((item) => item.trim()).filter(Boolean)
  ?? ['TC-ITEM-ADD-017', 'TC-ITEM-ADD-018', 'TC-ITEM-ADD-019']) as readonly string[];

function readJson(relativePath: string): any {
  return JSON.parse(fs.readFileSync(path.resolve(root, relativePath), 'utf8').replace(/^\uFEFF/, ''));
}

function findReceipts(node: any, output: any[] = []): any[] {
  if (!node || typeof node !== 'object') return output;
  if (Array.isArray(node)) {
    for (const child of node) findReceipts(child, output);
    return output;
  }
  for (const attachment of node.attachments ?? []) {
    if (attachment?.name !== 'test-execution-receipt' || typeof attachment.body !== 'string') continue;
    try {
      const receipt = JSON.parse(Buffer.from(attachment.body, 'base64').toString('utf8'));
      if (ids.includes(receipt.caseId)) output.push(receipt);
    } catch { /* Ignore unrelated attachments. */ }
  }
  for (const child of Object.values(node)) findReceipts(child, output);
  return output;
}

const manifest = readJson(manifestPath);
const receipts = findReceipts(readJson(reportPath));
const receiptById = new Map(receipts.map((receipt) => [receipt.caseId, receipt]));
const contextById = new Map(ids.map((caseId) => {
  const receipt = receiptById.get(caseId);
  if (!receipt) throw new Error(`ADDON_CURRENT_RECEIPT_INPUT_MISSING:${caseId}`);
  return [caseId, receipt];
}));

for (const caseId of ids) {
  const entry = manifest.cases.find((item: any) => item.caseId === caseId);
  const receipt = contextById.get(caseId);
  if (!entry || !receipt) throw new Error(`ADDON_CURRENT_RECEIPT_CONTRACT_MISSING:${caseId}`);
  if (receipt.receiptVersion !== '4.0.0' || !Array.isArray(receipt.operationReceipts) || !Array.isArray(receipt.assertionReceipts)) {
    throw new Error(`ADDON_CURRENT_RECEIPT_NOT_FORMAL:${caseId}`);
  }
  const raw = [...receipt.operationReceipts].sort((left, right) => left.sequence - right.sequence);
  const counts = new Map<string, number>();
  const allOccurrences = raw.map((operation: any) => {
    const occurrence = (counts.get(operation.operationKey) ?? 0) + 1;
    counts.set(operation.operationKey, occurrence);
    return { executableOperationKey: operation.operationKey, occurrence };
  });
  const business = entry.operationMapping.business;
  const consumed = new Set(business.map((item: any) => JSON.stringify([item.executableOperationKey, item.occurrence])));
  const supporting = allOccurrences
    .filter((item) => !consumed.has(JSON.stringify([item.executableOperationKey, item.occurrence])))
    .map((item) => ({ ...item, required: true }));
  entry.operationMapping.supporting = supporting;
  entry.executionContextFingerprint = fingerprintExecutionContext(receipt.executionContext);
}

manifest.reportPaths = [...new Set([...manifest.reportPaths, reportPath])];
publishImmutableArtifact({
  outputRoot: root,
  relativePath: manifestPath,
  content: `${JSON.stringify(manifest, null, 2)}\n`,
  reason: 'register-addon-017-019-current-receipts-after-targeted-revalidation',
});
console.log(JSON.stringify({ registered: ids, reportPath, contextFingerprints: Object.fromEntries(ids.map((caseId) => [caseId, manifest.cases.find((item: any) => item.caseId === caseId).executionContextFingerprint])) }, null, 2));
