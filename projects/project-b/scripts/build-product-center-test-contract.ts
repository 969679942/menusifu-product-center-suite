import fs from 'node:fs';
import path from 'node:path';
import { generateProductCenterProductionSopCases } from '../sop/product-center/product-center-sop-generator';
import { productCenterCreateSopCatalog } from '../sop/product-center/product-center-create-sop.catalog';
import { productCenterSopCatalog } from '../sop/product-center/product-center-sop.catalog';
import { highDependencySopCatalog } from '../sop/product-center/product-center-high-dependency-sop.catalog';
import { lowDependencySopCatalog } from '../sop/product-center/product-center-low-dependency-sop.catalog';
import { productCenterNegativeSopCatalog } from '../sop/product-center/product-center-negative-sop.catalog';
import { productCenterContractCurationSources, productCenterContractModules } from '../contracts/product-center/modules';
import {
  applyProductCenterModuleCurations,
  buildProductCenterMaintenanceArtifacts,
  validateProductCenterModuleRegistry,
} from '../utils/product-center-contract-maintenance';
import {
  buildProductCenterTestContract,
  validateProductCenterTestContract,
  type ProductCenterTestContract,
  type UpstreamContract,
} from '../utils/product-center-test-contract';

const projectRoot = path.resolve(__dirname, '..');
const merchantCenterRoot = path.resolve(projectRoot, '..');
const sourceContractPath = path.join(merchantCenterRoot, 'contracts/product-center/product-center-test-contract.json');
const outputDirectory = path.join(projectRoot, 'contracts/product-center');
const outputPath = path.join(outputDirectory, 'product-center-test-contract.json');
const reviewPath = path.join(outputDirectory, 'product-center-rule-review.json');
const traceabilityPath = path.join(outputDirectory, 'product-center-traceability.json');
const snapshotDirectory = path.join(outputDirectory, 'snapshots');
const snapshotPath = path.join(snapshotDirectory, 'product-center-test-contract.snapshot.json');
const baselinePath = path.join(snapshotDirectory, 'product-center-baseline.json');
const generatedDirectory = path.join(outputDirectory, 'generated');
const moduleViewDirectory = path.join(generatedDirectory, 'modules');
const indexDirectory = path.join(generatedDirectory, 'indexes');

function main(): void {
  const upstream = applyProductCenterModuleCurations(
    JSON.parse(fs.readFileSync(sourceContractPath, 'utf8')) as UpstreamContract & ProductCenterTestContract,
    productCenterContractCurationSources,
  );
  const descriptors = generateProductCenterProductionSopCases({
    core: productCenterSopCatalog,
    create: productCenterCreateSopCatalog,
    lowDependency: lowDependencySopCatalog,
    highDependency: highDependencySopCatalog,
    negative: productCenterNegativeSopCatalog,
  });
  const verifiedAt = String(upstream.metadata?.generatedAt ?? '2026-07-24T00:00:00.000Z');
  const contract = buildProductCenterTestContract({
    upstream,
    descriptors,
    version: '1.0.0',
    verifiedAt,
    requirementRefs: discoverRequirementRefs(productCenterContractModules),
    routeAliases: Object.assign({}, ...productCenterContractModules.map((module) => module.routeAliases)),
    sourceContext: productCenterContractCurationSources,
  });
  const errors = validateProductCenterTestContract(contract);
  if (errors.length > 0) throw new Error(`合同校验失败：${JSON.stringify(errors)}`);
  const moduleErrors = validateProductCenterModuleRegistry(productCenterContractModules, contract, descriptors);
  if (moduleErrors.length > 0) throw new Error(`模块合同校验失败：${JSON.stringify(moduleErrors)}`);
  const maintenance = buildProductCenterMaintenanceArtifacts(contract, productCenterContractModules);

  fs.mkdirSync(moduleViewDirectory, { recursive: true });
  fs.mkdirSync(indexDirectory, { recursive: true });
  writeJson(outputPath, contract);
  const review = buildRuleReview(contract);
  writeJson(reviewPath, review);
  writeJson(traceabilityPath, {
    contractVersion: contract.metadata.contractVersion,
    generatedAt: contract.metadata.generatedAt,
    executableDescriptorCount: descriptors.length,
    complete: contract.traceability?.length === descriptors.length,
    stageGaps: {
      requirement: contract.traceability?.filter((record) => record.evidence.stageGaps?.includes('prd-requirement-reference')).length ?? 0,
      apiMapping: contract.traceability?.filter((record) => record.evidence.stageGaps?.includes('ui-api-operation-mapping')).length ?? 0,
    },
    records: contract.traceability ?? [],
  });
  writeJson(snapshotPath, maintenance.snapshot);
  writeJson(path.join(generatedDirectory, 'manifest.json'), maintenance.manifest);
  writeJson(path.join(moduleViewDirectory, 'shared.json'), maintenance.sharedView);
  for (const [moduleId, view] of Object.entries(maintenance.moduleViews)) {
    writeJson(path.join(moduleViewDirectory, `${moduleId}.json`), view);
  }
  for (const [indexName, index] of Object.entries(maintenance.indexes)) {
    writeJson(path.join(indexDirectory, `${indexName}.json`), index);
  }
  if (!fs.existsSync(baselinePath)) writeJson(baselinePath, contract);
  process.stdout.write(`统一合同已生成：${outputPath}\n规则评审项：${review.items.length}\nSOP 追溯描述符：${descriptors.length}\n`);
}

function discoverRequirementRefs(modules: typeof productCenterContractModules): Record<string, string[]> {
  const infoRoot = path.join(merchantCenterRoot, 'Merchant Center Info');
  const aliases = Object.assign({}, ...modules.map((module) => module.requirementAliases)) as Record<string, readonly string[]>;
  const files = listRequirementFiles(infoRoot);
  return Object.fromEntries(Object.entries(aliases).map(([entity, terms]) => [
    entity,
    files.filter((file) => terms.some((term) => path.basename(file).includes(term)))
      .map((file) => `merchant-center:/Merchant Center Info/${path.relative(infoRoot, file).replace(/\\/g, '/')}`)
      .sort(),
  ]));
}

function listRequirementFiles(root: string): string[] {
  if (!fs.existsSync(root)) return [];
  const files: string[] = [];
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const fullPath = path.join(root, entry.name);
    if (entry.isDirectory()) files.push(...listRequirementFiles(fullPath));
    else if (/\.(md|xmind)$/i.test(entry.name) && !entry.name.includes('模板')) files.push(fullPath);
  }
  return files.sort();
}

function buildRuleReview(contract: ProductCenterTestContract) {
  const items = [
    ...(contract.businessRules ?? []).filter((record) => !record.generationAllowed || !['observed', 'confirmed'].includes(record.status)).map((record) => ({
      id: record.id,
      category: 'business-rule',
      status: 'review-required',
      priority: record.status === 'blocked' || record.status === 'unresolved' ? 'P0' : 'P1',
      reason: '规则来源为 AI/手工修正或尚未获得运行时/产品确认，不得生成断言',
      source: record.source,
      entity: record.entity,
      route: record.route,
    })),
    ...(contract.unresolved ?? []).map((record) => ({
      id: record.id,
      category: 'unresolved-contract',
      status: 'review-required',
      priority: 'P0',
      reason: '黑盒证据存在未解决冲突或缺失，禁止自动生成操作/断言',
      source: record.source,
      entity: record.entity,
      route: record.route,
    })),
  ].sort((left, right) => `${left.priority}:${left.id}`.localeCompare(`${right.priority}:${right.id}`));
  return {
    contractVersion: contract.metadata.contractVersion,
    generatedAt: contract.metadata.generatedAt,
    policy: '仅 observed/confirmed 且无开放冲突记录可生成自动化断言',
    summary: { total: items.length, p0: items.filter((item) => item.priority === 'P0').length, p1: items.filter((item) => item.priority === 'P1').length },
    items,
  };
}

function writeJson(filePath: string, value: unknown): void {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

main();
