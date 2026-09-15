import fs from 'node:fs';
import path from 'node:path';
import { publishImmutableArtifact } from '../utils/immutable-artifact';

const root = process.cwd();
const relativePath = 'contracts/product-center/test-cases/canonical/product-center-item-current-receipt-contract.json';
const absolutePath = path.resolve(root, relativePath);
const manifest = JSON.parse(fs.readFileSync(absolutePath, 'utf8').replace(/^\uFEFF/, '')) as any;
const entry = manifest.cases.find((item: any) => item.caseId === 'TC-ITEM-ADD-014');
if (!entry) throw new Error('ADD014_CONTRACT_MISSING');
const supporting = Array.isArray(entry.operationMapping?.supporting)
  ? entry.operationMapping.supporting
  : [];
for (let occurrence = 5; occurrence <= 23; occurrence += 1) {
  if (!supporting.some((item: any) => item.executableOperationKey === 'ItemEditSidePage.readItemName'
    && item.occurrence === occurrence)) {
    supporting.push({ executableOperationKey: 'ItemEditSidePage.readItemName', occurrence, required: true });
  }
}
entry.operationMapping.supporting = supporting;
publishImmutableArtifact({
  outputRoot: root,
  relativePath,
  content: `${JSON.stringify(manifest, null, 2)}\n`,
  reason: 'repair-addon-014-current-operation-occurrence-mapping-from-real-receipt',
});
console.log(JSON.stringify({ caseId: entry.caseId, addedOccurrence: 23 }, null, 2));
