import fs from 'node:fs';
import path from 'node:path';
import type { SystemTestRevalidationImpactType } from '../../../Test Automation Platform/src/automation/system-test/system-test-revalidation-policy';
import {
  buildProductCenterFingerprintRevalidationImpact,
  type ProductCenterAssetRemediationQueues,
} from '../adapters/product-center/product-center-fingerprint-revalidation-impact';

const projectRoot = path.resolve(__dirname, '..');
const moduleName = requiredArgument('module');
const changeId = requiredArgument('change-id');
const outputPath = path.resolve(projectRoot, requiredArgument('output'));
const queuePath = path.resolve(
  projectRoot,
  argument('queue') ?? 'deliverables/system-test-platform/product-center-asset-remediation-queues.json',
);
const impactType = (argument('impact-type') ?? 'business-implementation') as SystemTestRevalidationImpactType;
const allowedImpactTypes = new Set<SystemTestRevalidationImpactType>([
  'report-only',
  'platform-only',
  'adapter-only',
  'business-implementation',
  'context-change',
  'evidence-gap',
  'unknown-impact',
]);
if (!allowedImpactTypes.has(impactType)) throw new Error(`FINGERPRINT_REVALIDATION_IMPACT_TYPE_INVALID:${impactType}`);

const queue = readJson<ProductCenterAssetRemediationQueues>(queuePath);
const manifest = buildProductCenterFingerprintRevalidationImpact({
  queue,
  module: moduleName,
  changeId,
  impactType,
});

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
process.stdout.write(`${JSON.stringify({
  module: moduleName,
  selected: manifest.impactedCaseIds.length,
  driftDimensions: manifest.source.driftDimensions,
  output: outputPath,
})}\n`);

function readJson<T>(filePath: string): T {
  if (!fs.existsSync(filePath)) throw new Error(`FINGERPRINT_REVALIDATION_QUEUE_MISSING:${filePath}`);
  return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T;
}

function requiredArgument(name: string): string {
  const value = argument(name)?.trim();
  if (!value) throw new Error(`FINGERPRINT_REVALIDATION_ARGUMENT_REQUIRED:${name}`);
  return value;
}

function argument(name: string): string | undefined {
  const prefix = `--${name}=`;
  return process.argv.find((value) => value.startsWith(prefix))?.slice(prefix.length);
}
