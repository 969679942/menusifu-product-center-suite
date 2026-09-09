import fs from 'node:fs';
import path from 'node:path';
import { diffProductCenterContracts } from '../utils/product-center-contract-diff';
import type { ProductCenterTestContract } from '../utils/product-center-test-contract';

const projectRoot = path.resolve(__dirname, '..');
const contractDirectory = path.join(projectRoot, 'contracts/product-center');
const baselinePath = process.argv[2] ? path.resolve(process.argv[2]) : path.join(contractDirectory, 'snapshots/product-center-baseline.json');
const currentPath = process.argv[3] ? path.resolve(process.argv[3]) : path.join(contractDirectory, 'product-center-test-contract.json');
const outputPath = path.join(contractDirectory, 'product-center-contract-diff.json');
const reviewDirectory = path.join(contractDirectory, 'reviews');
const reviewPath = path.join(reviewDirectory, 'current-contract-review.json');

const before = JSON.parse(fs.readFileSync(baselinePath, 'utf8')) as ProductCenterTestContract;
const after = JSON.parse(fs.readFileSync(currentPath, 'utf8')) as ProductCenterTestContract;
const diff = diffProductCenterContracts(before, after);
fs.writeFileSync(outputPath, `${JSON.stringify(diff, null, 2)}\n`, 'utf8');
const manifest = JSON.parse(fs.readFileSync(path.join(contractDirectory, 'generated/manifest.json'), 'utf8')) as {
  sourceFingerprint: string;
  modules: unknown[];
  sharedRecords: number;
};
const ruleReview = JSON.parse(fs.readFileSync(path.join(contractDirectory, 'product-center-rule-review.json'), 'utf8')) as {
  summary: { total: number; p0: number; p1: number };
};
fs.mkdirSync(reviewDirectory, { recursive: true });
fs.writeFileSync(reviewPath, `${JSON.stringify({
  status: 'pending-human-review',
  version: after.metadata.contractVersion,
  candidateFingerprint: after.metadata.sourceFingerprint,
  baselineFingerprint: before.metadata.sourceFingerprint,
  metadataChanged: diff.metadataChanged,
  recordChanges: diff.summary,
  impactedRoutes: diff.impactedRoutes,
  impactedCases: diff.impactedCases,
  modules: manifest.modules,
  sharedRecords: manifest.sharedRecords,
  reviewQueue: ruleReview.summary,
  promotionCommand: `npm run contract:promote -- --version ${after.metadata.contractVersion} --reviewed-by <审核人> --note <说明>`,
}, null, 2)}\n`, 'utf8');
process.stdout.write(`合同差异已生成：${outputPath}\n受影响路由：${diff.impactedRoutes.length}，受影响用例：${diff.impactedCases.length}\n`);
