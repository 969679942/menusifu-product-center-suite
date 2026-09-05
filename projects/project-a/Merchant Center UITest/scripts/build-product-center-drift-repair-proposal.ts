import fs from 'node:fs';
import path from 'node:path';
import type { ImpactedCase } from '../utils/contract-change-impact';
import { buildProductCenterDriftRepairProposal } from '../utils/product-center-drift-repair-proposal';
import type { ProductCenterPageContractDiff } from '../utils/product-center-page-contract-observation';

export function buildProductCenterDriftRepairProposalArtifact(projectRoot = process.cwd()) {
  const diff = readJson<ProductCenterPageContractDiff>(path.join(
    projectRoot,
    'output/page-contract/product-center-page-contract-diff.json',
  ));
  const impact = readJson<{ impactedCases?: ImpactedCase[] }>(path.join(
    projectRoot,
    'output/page-contract/product-center-page-contract-impact.json',
  ));
  const proposal = buildProductCenterDriftRepairProposal({
    diff,
    impactedCases: impact.impactedCases ?? [],
  });
  const outputPath = path.join(
    projectRoot,
    'output/page-contract/product-center-drift-repair-proposal.json',
  );
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
    const result = buildProductCenterDriftRepairProposalArtifact();
    process.stdout.write(
      `商品中心漂移修复 Proposal：${result.outputPath}\n状态：${result.proposal.status}\n`,
    );
    if (result.proposal.status === 'blocked') process.exitCode = 1;
  } catch (error: unknown) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
