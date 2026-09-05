import fs from 'node:fs';
import path from 'node:path';
import {
  buildProductCenterApiObservationProposal,
  type ProductCenterApiCatalogOperation,
  type ProductCenterObservedApiExchange,
} from '../utils/product-center-api-observation';

export function buildProductCenterApiObservationProposalArtifact(projectRoot = process.cwd()) {
  const inputPath = path.join(projectRoot, 'output/page-contract/product-center-api-exchanges.json');
  const catalogPath = path.resolve(projectRoot, '..', 'contracts/api/operations/all.operations.json');
  const outputPath = path.join(projectRoot, 'output/page-contract/product-center-api-observation-proposal.json');
  const input = readJson<{ exchanges?: ProductCenterObservedApiExchange[] }>(inputPath);
  const catalog = readJson<ProductCenterApiCatalogOperation[]>(catalogPath);
  const proposal = buildProductCenterApiObservationProposal({
    exchanges: input.exchanges ?? [],
    catalog,
  });
  writeJsonAtomic(outputPath, proposal);
  return { outputPath, proposal };
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
    const result = buildProductCenterApiObservationProposalArtifact();
    process.stdout.write(`商品中心 API 观测提案：${result.outputPath};状态=${result.proposal.status};新接口=${result.proposal.summary.newOperations}\n`);
    if (result.proposal.status !== 'no-change') process.exitCode = 1;
  } catch (error: unknown) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
