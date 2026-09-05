import fs from 'node:fs';
import path from 'node:path';
import contractDocument from '../contracts/product-center/product-center-test-contract.json';
import { productCenterContractModules } from '../contracts/product-center/modules';
import { productCenterCoverageCuration } from '../contracts/product-center/test-cases/product-center-coverage-curation';
import { buildProductCenterTestCaseIrCatalog } from '../sop/product-center/product-center-test-case-ir.catalog';
import {
  auditProductCenterCoverage,
  buildProductCenterCoverageDenominator,
} from '../utils/product-center-coverage-denominator';
import {
  productCenterContractCollections,
  type ProductCenterTestContract,
} from '../utils/product-center-test-contract';
import { auditProductCenterTestCaseExecutability } from '../utils/product-center-test-case-executability';
import {
  auditProductCenterTestCaseGenerationGate,
  auditProductCenterTestCases,
} from '../utils/product-center-test-case-ir';
import { auditProductCenterTestCaseSemantics } from '../utils/product-center-test-case-semantics';

const projectRoot = path.resolve(__dirname, '..');
const contract = contractDocument as ProductCenterTestContract;
const cases = buildProductCenterTestCaseIrCatalog();
const knownSourceIds = new Set(productCenterContractCollections
  .filter((collection) => collection !== 'traceability')
  .flatMap((collection) => (contract[collection] ?? []).map((record) => record.id)));
const denominatorDocument = buildProductCenterCoverageDenominator(contract, {
  moduleForRoute: resolveModule,
  coverageGroups: productCenterCoverageCuration,
});
const baseAudit = auditProductCenterTestCases(cases, { knownSourceIds });
const semanticAudit = auditProductCenterTestCaseSemantics(cases, { knownSourceIds });
const coverageAudit = auditProductCenterCoverage(cases, denominatorDocument.items);
const knownRoleIds = new Set(cases.flatMap((item) => item.execution?.roleIds ?? []));
const knownEnvironmentIds = new Set(cases.flatMap((item) => item.execution?.environmentIds ?? []));
const knownCapabilityIds = new Set(cases.flatMap((item) => item.execution?.capabilityIds ?? []));
const executabilityAudit = auditProductCenterTestCaseExecutability(cases, {
  roleIds: knownRoleIds,
  environmentIds: knownEnvironmentIds,
  capabilityIds: knownCapabilityIds,
});
const generationGate = auditProductCenterTestCaseGenerationGate(cases, {
  scope: 'case-only',
  denominator: denominatorDocument.items,
  baseAudit,
  semanticAudit,
  executabilityAudit,
  coverageAudit,
});
const status = baseAudit.summary.reviewRequired > 0
  || semanticAudit.summary.reviewRequired > 0
  || executabilityAudit.summary.reviewRequired > 0
  || coverageAudit.unknownCoverageIds.length > 0
  ? 'review-required'
  : 'passed';

writeJson('contracts/product-center/test-cases/product-center-existing-sop-cases.json', {
  schemaVersion: '1.0.0',
  contractVersion: contract.metadata.contractVersion,
  sourceFingerprint: contract.metadata.sourceFingerprint,
  cases,
});
writeJson('output/test-case-audit/product-center/latest.json', {
  schemaVersion: '1.0.0',
  generatedAt: new Date().toISOString(),
  contractVersion: contract.metadata.contractVersion,
  sourceFingerprint: contract.metadata.sourceFingerprint,
  ...baseAudit,
});
writeJson('contracts/product-center/test-cases/product-center-coverage-denominator.json', denominatorDocument);
writeJson('output/test-case-audit/product-center/preflight-latest.json', {
  schemaVersion: '1.0.0',
  generatedAt: new Date().toISOString(),
  contractVersion: contract.metadata.contractVersion,
  sourceFingerprint: contract.metadata.sourceFingerprint,
  scope: 'case-only',
  status,
  baseAudit,
  semanticAudit,
  coverageAudit,
  executabilityAudit,
  corrections: semanticAudit.corrections,
  generationGate,
});

if (status !== 'passed') {
  throw new Error('测试用例三层前置审计未通过，详见 preflight-latest.json');
}

function resolveModule(route: string): string {
  const matches = productCenterContractModules.filter((module) =>
    (module.routes as readonly string[]).includes(route));
  if (matches.length !== 1) {
    throw new Error(`覆盖分母路由必须唯一归属合同模块：${route}，实际 ${matches.length} 个`);
  }
  return matches[0].id;
}

function writeJson(relativePath: string, value: unknown): void {
  const outputPath = path.join(projectRoot, relativePath);
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}
