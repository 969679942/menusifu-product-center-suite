import fs from 'node:fs';
import path from 'node:path';
import { buildProductCenterItemRemediationScope } from '../utils/product-center-item-remediation-scope';

const projectRoot = path.resolve(__dirname, '..');
const outputPath = path.resolve(
  projectRoot,
  'deliverables/system-test-platform/product-center-item-remediation-scope.json',
);
const artifact = buildProductCenterItemRemediationScope(projectRoot);
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(artifact, null, 2)}\n`, 'utf8');
process.stdout.write(`${JSON.stringify({ outputPath, summary: artifact.summary })}\n`);
