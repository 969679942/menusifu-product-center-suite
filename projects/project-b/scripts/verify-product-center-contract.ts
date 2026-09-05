import fs from 'node:fs';
import path from 'node:path';
import { validateProductCenterTestContract, type ProductCenterTestContract } from '../utils/product-center-test-contract';

const projectRoot = path.resolve(__dirname, '..');
const contractPath = path.join(projectRoot, 'contracts/product-center/product-center-test-contract.json');
const contractDirectory = path.dirname(contractPath);
const contract = JSON.parse(fs.readFileSync(contractPath, 'utf8')) as ProductCenterTestContract;
const errors = validateProductCenterTestContract(contract);
const secretPatterns = [
  /Bearer\s+[A-Za-z0-9._-]{12,}/i,
  /(?:password|authorization|cookie|token)\s*[:=]\s*["']?(?!\[REDACTED\])[A-Za-z0-9._-]{8,}/i,
];
const secretFindings = listJsonFiles(contractDirectory).filter((filePath) => {
  const content = fs.readFileSync(filePath, 'utf8');
  return secretPatterns.some((pattern) => pattern.test(content));
}).map((filePath) => path.relative(projectRoot, filePath));
const traceabilityCount = contract.traceability?.filter((record) => record.id.startsWith('trace:sop:')).length ?? 0;
const traceability = readJson<{ executableDescriptorCount: number }>(path.join(contractDirectory, 'product-center-traceability.json'));
const manifest = readJson<{ modules: Array<{ routes: number }> }>(path.join(contractDirectory, 'generated/manifest.json'));
const snapshot = readJson<{ records: Array<{ sha256: string }> }>(path.join(contractDirectory, 'snapshots/product-center-test-contract.snapshot.json'));
const byId = readJson<Record<string, unknown>>(path.join(contractDirectory, 'generated/indexes/byId.json'));
const expectedRecords = Object.values(contract.metadata.counts).reduce((total, count) => total + (count ?? 0), 0);
const failures = [
  ...errors.map((error) => `${error.code}:${error.collection}:${error.recordId ?? ''}`),
  ...secretFindings.map((finding) => `SENSITIVE_ARTIFACT:${finding}`),
  ...(traceabilityCount !== traceability.executableDescriptorCount
    ? [`TRACEABILITY_COUNT:${traceabilityCount}/${traceability.executableDescriptorCount}`]
    : []),
  ...(manifest.modules.length !== 9 ? [`MODULE_COUNT:${manifest.modules.length}`] : []),
  ...(manifest.modules.reduce((total, module) => total + module.routes, 0) !== 34 ? ['MODULE_ROUTE_COUNT'] : []),
  ...(Object.keys(byId).length !== expectedRecords ? [`INDEX_RECORD_COUNT:${Object.keys(byId).length}/${expectedRecords}`] : []),
  ...(snapshot.records.length !== expectedRecords ? [`SNAPSHOT_RECORD_COUNT:${snapshot.records.length}/${expectedRecords}`] : []),
  ...(snapshot.records.some((record) => !/^[a-f0-9]{64}$/.test(record.sha256)) ? ['INVALID_SNAPSHOT_HASH'] : []),
];
if (failures.length > 0) {
  process.stderr.write(`统一合同验收失败：\n${failures.join('\n')}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write(`统一合同验收通过：集合 ${contract.metadata.collections.length}，模块 ${manifest.modules.length}，记录 ${expectedRecords}，SOP 追溯 ${traceabilityCount}，敏感项 0\n`);
}

function listJsonFiles(root: string): string[] {
  return fs.readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(root, entry.name);
    if (entry.isDirectory()) return listJsonFiles(fullPath);
    return entry.name.endsWith('.json') ? [fullPath] : [];
  });
}

function readJson<T>(filePath: string): T {
  return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T;
}
