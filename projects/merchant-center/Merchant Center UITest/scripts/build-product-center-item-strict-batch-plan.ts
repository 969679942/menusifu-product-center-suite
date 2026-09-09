import fs from 'node:fs';
import path from 'node:path';
import { buildProductCenterItemMigrationLedger, type ProductCenterItemMigrationLedger } from './build-product-center-item-migration-ledger';

export type ProductCenterItemStrictBatchPlan = {
  schemaVersion: '1.0.0';
  collectionId: 'product-center-item-strict-batch-plan';
  generatedAt: string;
  sourceLedger: string;
  manifestPath: string;
  sourceReleaseFingerprint: string;
  batchSize: number;
  scope: 'strict-revalidation-remaining';
  totalCases: number;
  batches: Array<{ batchId: string; caseIds: string[]; standard: number; package: number; addon: number }>;
};

export function buildProductCenterItemStrictBatchPlan(
  ledger: ProductCenterItemMigrationLedger,
  batchSize = 20,
): ProductCenterItemStrictBatchPlan {
  if (!Number.isInteger(batchSize) || batchSize < 1) throw new Error('batchSize 必须是正整数');
  const ids = ledger.cases
    .filter((item) => item.status === 'legacy-passed')
    .sort((left, right) => left.priority.localeCompare(right.priority) || left.caseId.localeCompare(right.caseId));
  const batches = [];
  for (let index = 0; index < ids.length; index += batchSize) {
    const selected = ids.slice(index, index + batchSize);
    batches.push({
      batchId: `item-strict-${String(batches.length + 1).padStart(3, '0')}`,
      caseIds: selected.map((item) => item.caseId),
      standard: selected.filter((item) => item.family === 'standard').length,
      package: selected.filter((item) => item.family === 'package').length,
      addon: selected.filter((item) => item.family === 'addon').length,
    });
  }
  return {
    schemaVersion: '1.0.0',
    collectionId: 'product-center-item-strict-batch-plan',
    generatedAt: new Date().toISOString(),
    sourceLedger: 'deliverables/product-center-item/migration-ledger.json',
    manifestPath: 'contracts/product-center/test-manifests/product-center-item-strict-revalidation-v1.json',
    sourceReleaseFingerprint: ledger.source.releaseFingerprint,
    batchSize,
    scope: 'strict-revalidation-remaining',
    totalCases: ids.length,
    batches,
  };
}

function buildStrictManifest(rootDir: string, ledger: ProductCenterItemMigrationLedger): unknown {
  const basePath = path.resolve(rootDir, 'contracts/product-center/test-manifests/product-center-item-practice-batch-v1.json');
  const base = JSON.parse(fs.readFileSync(basePath, 'utf8')) as {
    dataProfiles: Record<string, unknown>;
    circuitBreaker: unknown;
    evidencePolicy: unknown;
    sourceRelease: unknown;
  };
  const selected = ledger.cases
    .filter((item) => item.status === 'legacy-passed')
    .sort((left, right) => left.caseId.localeCompare(right.caseId));
  const families = {
    standard: selected.filter((item) => item.family === 'standard').map((item) => item.caseId),
    package: selected.filter((item) => item.family === 'package').map((item) => item.caseId),
    addon: selected.filter((item) => item.family === 'addon').map((item) => item.caseId),
  };
  return {
    schemaVersion: '1.0.0',
    collectionId: 'product-center-item-strict-revalidation-v1',
    sourceRelease: base.sourceRelease,
    selectionPolicy: {
      targetSize: selected.length,
      familyQuota: {
        standard: families.standard.length,
        package: families.package.length,
        addon: families.addon.length,
      },
    },
    dataProfiles: base.dataProfiles,
    caseBindings: selected.map((item) => ({
      caseId: item.caseId,
      ruleId: item.caseId.replace(/^TC-/, 'CBR-'),
      dataProfile: item.family === 'standard'
        ? 'item-standard-write'
        : item.family === 'package' ? 'item-package-write' : 'item-addon-write',
    })),
    circuitBreaker: base.circuitBreaker,
    evidencePolicy: base.evidencePolicy,
    families,
  };
}

if (require.main === module) {
  const rootDir = path.resolve(__dirname, '..');
  const ledger = buildProductCenterItemMigrationLedger(rootDir);
  const batchSize = Number(process.env.PC_ITEM_BATCH_SIZE ?? '20');
  const plan = buildProductCenterItemStrictBatchPlan(ledger, batchSize);
  const outputPath = path.resolve(rootDir, '..', 'deliverables/product-center-item/strict-batch-plan.json');
  const manifestPath = path.resolve(rootDir, 'contracts/product-center/test-manifests/product-center-item-strict-revalidation-v1.json');
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(plan, null, 2)}\n`, 'utf8');
  fs.writeFileSync(manifestPath, `${JSON.stringify(buildStrictManifest(rootDir, ledger), null, 2)}\n`, 'utf8');
  process.stdout.write(`商品严格重验证批次计划：${outputPath}\n`);
  process.stdout.write(`批次：${plan.batches.length}，用例：${plan.totalCases}\n`);
}
