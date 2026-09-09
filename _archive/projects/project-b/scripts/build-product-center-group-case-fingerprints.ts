import fs from 'node:fs';
import path from 'node:path';
import {
  buildProductCenterGroupCaseFingerprintManifest,
  type ProductCenterGroupCaseFingerprintBinding,
} from '../utils/product-center-group-case-fingerprint';

const projectRoot = path.resolve(__dirname, '..');
const bindingsPath = path.join(projectRoot, 'contracts/product-center/group/product-center-group-bindings.json');
const outputPath = path.join(projectRoot, 'contracts/product-center/group/product-center-group-case-fingerprints.json');
const bindings = JSON.parse(fs.readFileSync(bindingsPath, 'utf8')) as { cases: ProductCenterGroupCaseFingerprintBinding[] };
const manifest = buildProductCenterGroupCaseFingerprintManifest(projectRoot, bindings.cases);
fs.writeFileSync(outputPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
process.stdout.write(`${JSON.stringify({ cases: manifest.cases.length, output: path.relative(projectRoot, outputPath) })}\n`);
