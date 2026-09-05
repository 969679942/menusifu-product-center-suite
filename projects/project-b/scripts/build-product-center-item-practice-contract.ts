import fs from 'node:fs';
import path from 'node:path';
import { resolveAuthCredentials } from '../test-data/auth';
import {
  buildProductCenterItemPracticeContract,
  loadProductCenterItemPracticeContractInputs,
} from '../utils/product-center-item-practice-contract';
import { evaluateProductCenterItemStaticPreflight } from '../utils/product-center-item-practice-preflight';

export function buildProductCenterItemPracticeArtifacts(input: {
  rootDir?: string;
  selectedCaseIds?: readonly string[];
  contractPath?: string;
  preflightPath?: string;
  env?: NodeJS.ProcessEnv;
} = {}) {
  const rootDir = input.rootDir ?? process.cwd();
  const loaded = loadProductCenterItemPracticeContractInputs(rootDir);
  const result = buildProductCenterItemPracticeContract({
    ...loaded,
    rootDir,
    selectedCaseIds: input.selectedCaseIds,
  });
  if (result.errors.length > 0) throw new Error(`商品实战合同编译失败：\n${result.errors.join('\n')}`);
  const contractPath = path.resolve(input.contractPath ?? path.join(rootDir, 'output/product-center-item-practice-contract.json'));
  const preflightPath = path.resolve(input.preflightPath ?? path.join(rootDir, 'output/product-center-item-practice-static-preflight.json'));
  const preflight = evaluateProductCenterItemStaticPreflight({
    contract: result.contract,
    rootDir,
    credentials: resolveAuthCredentials(),
    env: input.env,
  });
  writeJson(contractPath, result.contract);
  writeJson(preflightPath, preflight);
  return { contract: result.contract, preflight, contractPath, preflightPath };
}

function writeJson(filePath: string, value: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.tmp`;
  fs.writeFileSync(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  fs.renameSync(temporaryPath, filePath);
}

function parseCaseIds(): string[] {
  const value = process.argv.find((argument) => argument.startsWith('--case-ids='))?.slice('--case-ids='.length);
  return value?.split(',').map((item) => item.trim().toUpperCase()).filter(Boolean) ?? [];
}

if (require.main === module) {
  const artifacts = buildProductCenterItemPracticeArtifacts({ selectedCaseIds: parseCaseIds() });
  process.stdout.write(`商品实战合同：${artifacts.contractPath}\n`);
  process.stdout.write(`静态预检：${artifacts.preflight.status} ${artifacts.preflightPath}\n`);
  if (artifacts.preflight.status !== 'passed') process.exitCode = 2;
}
