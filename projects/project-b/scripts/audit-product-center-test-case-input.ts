import fs from 'node:fs';
import path from 'node:path';
import contractDocument from '../contracts/product-center/product-center-test-contract.json';
import { buildProductCenterTestCaseIrCatalog } from '../sop/product-center/product-center-test-case-ir.catalog';
import type { ProductCenterCoverageItem } from '../utils/product-center-coverage-denominator';
import {
  productCenterContractCollections,
  type ProductCenterTestContract,
} from '../utils/product-center-test-contract';
import {
  processProductCenterTestCaseIntake,
  type ProductCenterTestCaseSourceBinding,
} from '../utils/product-center-test-case-ir';

const projectRoot = path.resolve(__dirname, '..');
const args = process.argv.slice(2);
const inputPath = requiredPath('--input');
const bindingPath = requiredPath('--bindings');
const scope = readScope();
const moduleIds = new Set(readRepeatedValues('--module'));
const routes = new Set(readRepeatedValues('--route'));
const outputPath = optionalPath('--output')
  ?? path.join(projectRoot, 'output/test-case-audit/product-center/intake-latest.json');
const contract = contractDocument as ProductCenterTestContract;
const knownSourceIds = new Set(productCenterContractCollections
  .filter((collection) => collection !== 'traceability')
  .flatMap((collection) => (contract[collection] ?? []).map((record) => record.id)));
const inputDocument = readJson(inputPath);
const bindingDocument = readJson(bindingPath);
const bindings = readBindings(bindingDocument);
const denominatorDocument = readDenominator();
const catalogCases = buildProductCenterTestCaseIrCatalog();
const result = processProductCenterTestCaseIntake(inputDocument, bindings, {
  scope,
  knownSourceIds,
  denominator: denominatorDocument.items,
  ...(scope === 'module-full' ? {
    moduleIds,
    ...(routes.size > 0 ? { routes } : {}),
  } : {}),
  knownRoleIds: new Set(catalogCases.flatMap((item) => item.execution?.roleIds ?? [])),
  knownEnvironmentIds: new Set(catalogCases.flatMap((item) => item.execution?.environmentIds ?? [])),
  knownCapabilityIds: new Set(catalogCases.flatMap((item) => item.execution?.capabilityIds ?? [])),
});

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify({
  schemaVersion: '1.0.0',
  generatedAt: new Date().toISOString(),
  contractVersion: contract.metadata.contractVersion,
  sourceFingerprint: contract.metadata.sourceFingerprint,
  scope,
  input: path.relative(projectRoot, inputPath),
  bindings: path.relative(projectRoot, bindingPath),
  ...result,
}, null, 2)}\n`, 'utf8');

process.stdout.write(`测试用例入口审计：${outputPath}\n状态：${result.status}\n生成门禁：${result.generationGate?.status ?? 'n/a'}\n`);
if (result.status !== 'passed') process.exitCode = 1;

function requiredPath(name: string): string {
  const value = optionalPath(name);
  if (!value) throw new Error(`缺少参数 ${name}`);
  return value;
}

function optionalPath(name: string): string | undefined {
  const index = args.indexOf(name);
  if (index < 0 || !args[index + 1]) return undefined;
  return path.resolve(projectRoot, args[index + 1]);
}

function readScope(): 'case-only' | 'module-full' | 'full' {
  const index = args.indexOf('--scope');
  const value = index < 0 ? 'full' : args[index + 1];
  if (value !== 'case-only' && value !== 'module-full' && value !== 'full') {
    throw new Error('--scope 必须为 case-only、module-full 或 full');
  }
  if (value === 'module-full' && !args.includes('--module')) {
    throw new Error('module-full 必须通过 --module 指定至少一个模块');
  }
  return value;
}

function readRepeatedValues(name: string): string[] {
  return args.flatMap((argument, index) => argument === name && args[index + 1]
    ? [args[index + 1]]
    : []);
}

function readDenominator(): { items: ProductCenterCoverageItem[] } {
  const filePath = path.join(
    projectRoot,
    'contracts/product-center/test-cases/product-center-coverage-denominator.json',
  );
  const input = readJson(filePath);
  if (!isRecord(input) || input.contractVersion !== contract.metadata.contractVersion
    || input.sourceFingerprint !== contract.metadata.sourceFingerprint || !Array.isArray(input.items)) {
    throw new Error('覆盖分母与当前统一合同不一致，请先运行 build:product-center:test-case-ir');
  }
  return { items: input.items as ProductCenterCoverageItem[] };
}

function readJson(filePath: string): unknown {
  return JSON.parse(fs.readFileSync(filePath, 'utf8')) as unknown;
}

function readBindings(input: unknown): ProductCenterTestCaseSourceBinding[] {
  if (!isRecord(input) || input.schemaVersion !== '1.0.0' || !Array.isArray(input.bindings)) {
    throw new Error('来源绑定文档格式无效');
  }
  return input.bindings.flatMap((item, index) => {
    if (!isRecord(item)) throw new Error(`来源绑定格式无效：bindings[${index}]`);
    if (typeof item.ref === 'string' && Array.isArray(item.sourceIds)
      && item.sourceIds.every((sourceId) => typeof sourceId === 'string')) {
      return [{ ref: item.ref, sourceIds: item.sourceIds as string[] }];
    }
    // Intake v1 bindings are grouped by canonical case and expose sourceBindings.
    // Flatten them here so the audit consumes the same source contract without
    // requiring a second, project-specific binding format.
    if (Array.isArray(item.sourceBindings)) {
      const flattened = item.sourceBindings.map((binding) => {
        if (!isRecord(binding) || typeof binding.ref !== 'string' || !Array.isArray(binding.sourceIds)
          || binding.sourceIds.some((sourceId) => typeof sourceId !== 'string')) {
          throw new Error(`来源绑定格式无效：bindings[${index}].sourceBindings`);
        }
        return { ref: binding.ref, sourceIds: binding.sourceIds as string[] };
      });
      if (flattened.length > 0) return flattened;
    }
    throw new Error(`来源绑定格式无效：bindings[${index}]`);
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
