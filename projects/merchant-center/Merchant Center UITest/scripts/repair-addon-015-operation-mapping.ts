import fs from 'node:fs';
import path from 'node:path';
import { publishImmutableArtifact } from '../utils/immutable-artifact';

const root = process.cwd();
const relativePath = 'contracts/product-center/test-cases/canonical/product-center-item-current-receipt-contract.json';
const absolutePath = path.resolve(root, relativePath);
const manifest = JSON.parse(fs.readFileSync(absolutePath, 'utf8').replace(/^\uFEFF/, '')) as any;
const entry = manifest.cases.find((item: any) => item.caseId === 'TC-ITEM-ADD-015');
if (!entry) throw new Error('ADD015_CONTRACT_MISSING');
const supporting = Array.isArray(entry.operationMapping?.supporting)
  ? entry.operationMapping.supporting
  : [];
for (const executableOperationKey of ['ItemEditStandardPage.readItemName', 'ItemEditStandardPage.readVisiblePriceValues']) {
  if (!supporting.some((item: any) => item.executableOperationKey === executableOperationKey && item.occurrence === 9)) {
    supporting.push({ executableOperationKey, occurrence: 9, required: true });
  }
}
entry.operationMapping.supporting = supporting;
publishImmutableArtifact({
  outputRoot: root,
  relativePath,
  content: `${JSON.stringify(manifest, null, 2)}\n`,
  reason: 'repair-addon-015-current-operation-occurrence-mapping-from-real-receipt',
});
console.log(JSON.stringify({ caseId: entry.caseId, addedOccurrences: 2 }, null, 2));
