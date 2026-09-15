import fs from 'node:fs';
import path from 'node:path';
import { publishImmutableArtifact } from '../utils/immutable-artifact';

const root = process.cwd();
const relativePath = 'contracts/product-center/test-cases/canonical/product-center-item-current-receipt-contract.json';
const absolutePath = path.resolve(root, relativePath);
const manifest = JSON.parse(fs.readFileSync(absolutePath, 'utf8').replace(/^\uFEFF/, '')) as any;
const entry = manifest.cases.find((item: any) => item.caseId === 'TC-ITEM-ADD-019');
if (!entry) throw new Error('ADD019_CONTRACT_MISSING');
entry.semanticCaseFingerprint = '2457c6f9dafb47033fcd5dc96d3d995c9cdad5bfee62e979cb18af1a8fa6699b';
publishImmutableArtifact({
  outputRoot: root,
  relativePath,
  content: `${JSON.stringify(manifest, null, 2)}\n`,
  reason: 'repair-addon-019-semantic-fingerprint-to-current-canonical-source',
});
console.log(JSON.stringify({ caseId: entry.caseId, semanticCaseFingerprint: entry.semanticCaseFingerprint }, null, 2));
