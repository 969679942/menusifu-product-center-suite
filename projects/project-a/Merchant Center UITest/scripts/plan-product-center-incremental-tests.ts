import fs from 'node:fs';
import path from 'node:path';
import { buildProductCenterIncrementalTestPlan } from '../utils/product-center-incremental-test-plan';
import type { ProductCenterContractDiff } from '../utils/product-center-contract-diff';
import type { ProductCenterTestContract } from '../utils/product-center-test-contract';

const projectRoot = path.resolve(__dirname, '..');
const contractDirectory = path.join(projectRoot, 'contracts/product-center');
const outputPath = path.join(contractDirectory, 'reviews/current-incremental-test-plan.json');
const diff = readJson<ProductCenterContractDiff>(path.join(contractDirectory, 'product-center-contract-diff.json'));
const contract = readJson<ProductCenterTestContract>(path.join(contractDirectory, 'product-center-test-contract.json'));
const recipes = readJson<{ recipes: Array<{ caseId: string }> }>(path.join(
  contractDirectory,
  'recipes/product-center-pilot-recipes.json',
));
const plan = buildProductCenterIncrementalTestPlan(diff, contract, {
  recipeCaseIds: new Set(recipes.recipes.map((recipe) => recipe.caseId)),
});
const artifact = {
  generatedAt: new Date().toISOString(),
  ...plan,
  command: buildDisplayCommand(plan.specFiles, plan.grep),
};

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(artifact, null, 2)}\n`, 'utf8');
process.stdout.write(`增量测试计划已生成：${outputPath}\n精确用例：${plan.cases.length}，测试文件：${plan.specFiles.length}\n`);

function buildDisplayCommand(specFiles: readonly string[], grep: string): string {
  return `npx playwright test ${specFiles.join(' ')} --project=chrome --grep ${JSON.stringify(grep)} --workers=4`;
}

function readJson<T>(filePath: string): T {
  return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T;
}
