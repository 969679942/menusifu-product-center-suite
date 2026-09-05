import fs from 'node:fs';
import path from 'node:path';
import {
  verifyProductCenterDriftRepairApplication,
  type ProductCenterDriftRepairApplication,
} from '../utils/product-center-drift-repair-application';
import type { ProductCenterDriftRepairProposal } from '../utils/product-center-drift-repair-proposal';

export function applyProductCenterDriftRepair(
  rootDir = process.cwd(),
  approvedFindings: readonly string[] = [],
) {
  const proposal = readJson<ProductCenterDriftRepairProposal>(path.join(
    rootDir,
    'output/page-contract/product-center-drift-repair-proposal.json',
  ));
  const registryPath = path.join(
    rootDir,
    'contracts/product-center/reviews/product-center-drift-technical-repair-applications.json',
  );
  const registry = fs.existsSync(registryPath)
    ? readJson<{ applications?: ProductCenterDriftRepairApplication[] }>(registryPath)
    : { applications: [] };
  const result = verifyProductCenterDriftRepairApplication({
    rootDir,
    proposal,
    approvedFindings,
    applications: registry.applications ?? [],
  });
  const outputPath = path.join(
    rootDir,
    'output/page-contract/product-center-drift-repair-application.json',
  );
  writeJsonAtomic(outputPath, {
    schemaVersion: '1.0.0',
    collectionId: 'product-center-drift-repair-application',
    generatedAt: new Date().toISOString(),
    proposalFingerprint: proposal.fingerprint,
    ...result,
  });
  return { outputPath, result };
}

function readJson<T>(filePath: string): T {
  return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T;
}

function writeJsonAtomic(filePath: string, value: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.tmp`;
  fs.writeFileSync(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  fs.renameSync(temporaryPath, filePath);
}

if (require.main === module) {
  try {
    const approvedFindings = process.argv.slice(2)
      .filter((argument) => argument.startsWith('--approved-finding='))
      .map((argument) => argument.slice('--approved-finding='.length));
    const result = applyProductCenterDriftRepair(process.cwd(), approvedFindings);
    process.stdout.write(`商品中心漂移技术修复应用：${result.result.status};${result.outputPath}\n`);
  } catch (error: unknown) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
