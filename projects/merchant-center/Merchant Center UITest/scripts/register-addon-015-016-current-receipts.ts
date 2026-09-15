import fs from 'node:fs';
import path from 'node:path';
import { publishImmutableArtifact } from '../utils/immutable-artifact';
import { fingerprintExecutionContext } from '../../Test Automation Platform/src/utils/test-execution-state';
import { fingerprintProductCenterItemImplementation } from '../adapters/product-center/product-center-item-implementation';

const root = process.cwd();
const manifestPath = 'contracts/product-center/test-cases/canonical/product-center-item-current-receipt-contract.json';
const reportPath = 'output/product-center-item-source-governed-20260912T155104Z.json';
const ids = ['TC-ITEM-ADD-015', 'TC-ITEM-ADD-016'] as const;
const readJson = (relativePath: string): any => JSON.parse(
  fs.readFileSync(path.resolve(root, relativePath), 'utf8').replace(/^\uFEFF/, ''),
);

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
const existingById = new Map(manifest.cases.map((entry: any) => [entry.caseId, entry]));
for (const caseId of ids) {
  const receipt = receiptById.get(caseId);
  const existing = existingById.get(caseId);
  if (!receipt || !existing) throw new Error(`ADDON_CURRENT_RECEIPT_INPUT_MISSING:${caseId}`);
  if (receipt.receiptVersion !== '4.0.0') throw new Error(`ADDON_RECEIPT_NOT_FORMAL:${caseId}`);
  if (!receipt.executionContext || !Array.isArray(receipt.operationReceipts)
    || !Array.isArray(receipt.assertionReceipts)
    || receipt.cleanup?.apiZeroResidue !== true
    || receipt.cleanup?.uiZeroResidue !== true
    || receipt.cleanup?.uiVerificationObserved !== true) {
    throw new Error(`ADDON_RECEIPT_EVIDENCE_INCOMPLETE:${caseId}`);
  }
  const updated = {
    ...existing,
    implementationFingerprint: fingerprintProductCenterItemImplementation(root, caseId),
    executionContextFingerprint: fingerprintExecutionContext(receipt.executionContext),
  };
  manifest.cases = manifest.cases.filter((entry: any) => entry.caseId !== caseId);
  manifest.cases.push(updated);
}
manifest.reportPaths = [...new Set([...manifest.reportPaths, reportPath])];
publishImmutableArtifact({
  outputRoot: root,
  relativePath: manifestPath,
  content: `${JSON.stringify(manifest, null, 2)}\n`,
  reason: 'register-current-addon-015-016-receipts-after-impact-revalidation',
});
console.log(JSON.stringify({ registered: ids, reportPath }, null, 2));
