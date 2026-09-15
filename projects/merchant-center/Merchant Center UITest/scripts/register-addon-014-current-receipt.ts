import fs from 'node:fs';
import path from 'node:path';
import { publishImmutableArtifact } from '../utils/immutable-artifact';
import { fingerprintExecutionContext } from '../../Test Automation Platform/src/utils/test-execution-state';
import { fingerprintProductCenterItemImplementation } from '../adapters/product-center/product-center-item-implementation';

const root = process.cwd();
const manifestPath = 'contracts/product-center/test-cases/canonical/product-center-item-current-receipt-contract.json';
const reportPath = 'output/product-center-item-source-governed-20260912T155757Z.json';
const caseId = 'TC-ITEM-ADD-014';
const manifest = JSON.parse(fs.readFileSync(path.resolve(root, manifestPath), 'utf8').replace(/^\uFEFF/, '')) as any;
const report = JSON.parse(fs.readFileSync(path.resolve(root, reportPath), 'utf8').replace(/^\uFEFF/, '')) as any;
const existing = manifest.cases.find((entry: any) => entry.caseId === caseId);
if (!existing) throw new Error('ADD014_CONTRACT_MISSING');

function findReceipt(node: any): any | undefined {
  if (!node || typeof node !== 'object') return undefined;
  if (Array.isArray(node)) {
    for (const child of node) {
      const found = findReceipt(child);
      if (found) return found;
    }
    return undefined;
  }
  for (const attachment of node.attachments ?? []) {
    if (attachment?.name !== 'test-execution-receipt' || typeof attachment.body !== 'string') continue;
    try {
      const receipt = JSON.parse(Buffer.from(attachment.body, 'base64').toString('utf8'));
      if (receipt.caseId === caseId) return receipt;
    } catch { /* Ignore unrelated attachments. */ }
  }
  for (const child of Object.values(node)) {
    const found = findReceipt(child);
    if (found) return found;
  }
  return undefined;
}

const receipt = findReceipt(report);
if (!receipt || receipt.receiptVersion !== '4.0.0') throw new Error('ADD014_RECEIPT_NOT_FORMAL');
if (!receipt.executionContext || !Array.isArray(receipt.operationReceipts)
  || !Array.isArray(receipt.assertionReceipts)
  || receipt.cleanup?.apiZeroResidue !== true
  || receipt.cleanup?.uiZeroResidue !== true
  || receipt.cleanup?.uiVerificationObserved !== true) {
  throw new Error('ADD014_RECEIPT_EVIDENCE_INCOMPLETE');
}
const updated = {
  ...existing,
  implementationFingerprint: fingerprintProductCenterItemImplementation(root, caseId),
  executionContextFingerprint: fingerprintExecutionContext(receipt.executionContext),
};
manifest.cases = manifest.cases.filter((entry: any) => entry.caseId !== caseId);
manifest.cases.push(updated);
manifest.reportPaths = [...new Set([...manifest.reportPaths, reportPath])];
publishImmutableArtifact({
  outputRoot: root,
  relativePath: manifestPath,
  content: `${JSON.stringify(manifest, null, 2)}\n`,
  reason: 'register-current-addon-014-receipt-after-user-business-decision',
});
console.log(JSON.stringify({ caseId, reportPath }, null, 2));
