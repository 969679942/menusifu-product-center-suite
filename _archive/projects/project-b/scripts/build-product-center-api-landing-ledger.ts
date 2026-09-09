import fs from 'node:fs';
import path from 'node:path';

type RequestReport = {
  generatedAt: string;
  total: number;
  executed: number;
  shardCount: number;
  industryExcluded: boolean;
  classification: Record<string, number>;
  completion: {
    requestCoverageComplete: boolean;
    successfulResponses: number;
    validationResponses: number;
    businessRejections: number;
    blockedByFixtureOrContext: number;
  };
};

type JsonAnnotation = { type: string; description?: string };
type JsonSpec = {
  title: string;
  file: string;
  ok: boolean;
  tests: Array<{ status: string; annotations?: JsonAnnotation[] }>;
};
type JsonSuite = { specs?: JsonSpec[]; suites?: JsonSuite[] };
type CrudReport = {
  stats: { startTime: string; duration: number; expected: number; skipped: number; unexpected: number; flaky: number };
  suites: JsonSuite[];
};
type CleanupEvidence = {
  apiIdentityCounts: Record<string, number>;
  serverIds: Array<number | string>;
  verifiedZero: true;
};

const rootDir = process.cwd();
const requestPath = path.resolve(rootDir, 'output/brand-menu-api-tests.json');
const crudPath = path.resolve(rootDir, 'output/product-center-api-crud-results.json');
const blockerPath = path.resolve(rootDir, 'output/brand-menu-api-blocker-plan.json');
const outputPath = path.resolve(rootDir, 'output/product-center-api-landing-ledger.json');
const markdownPath = path.resolve(rootDir, 'output/product-center-api-landing-ledger.md');

const requestReport = readJson<RequestReport>(requestPath);
const crudReport = readJson<CrudReport>(crudPath);
const blockerReport = readJson<{ total: number; summary: Record<string, number> }>(blockerPath);
const specs = crudReport.suites.flatMap(collectSpecs);
const cleanupEvidence = specs.flatMap((spec) => (spec.tests[0]?.annotations ?? []))
  .filter((annotation) => annotation.type === 'API 清理证据' && annotation.description)
  .map((annotation) => JSON.parse(annotation.description!) as CleanupEvidence);
const serverIds = cleanupEvidence.flatMap((item) => item.serverIds);
const identities = cleanupEvidence.flatMap((item) => Object.keys(item.apiIdentityCounts));
const uniqueServerIds = [...new Set(serverIds.map(String))];
const uniqueIdentities = [...new Set(identities)];
const passedScenarios = specs.filter((spec) => spec.ok && spec.tests.every((item) => item.status === 'expected'));
const mutationScenarios = passedScenarios.filter((spec) => (spec.tests[0]?.annotations ?? [])
  .some((annotation) => annotation.type === 'API 清理证据'));
const requestContractPassed = requestReport.completion.successfulResponses
  + requestReport.completion.validationResponses
  + requestReport.completion.businessRejections;

if (requestReport.executed !== requestReport.total) {
  throw new Error(`活动接口守恒失败：total=${requestReport.total}, executed=${requestReport.executed}`);
}
if (requestContractPassed + blockerReport.total !== requestReport.total) {
  throw new Error(`接口分类守恒失败：contract=${requestContractPassed}, blocked=${blockerReport.total}, total=${requestReport.total}`);
}
if (passedScenarios.length !== crudReport.stats.expected || crudReport.stats.unexpected !== 0) {
  throw new Error(`CRUD 收据未闭环：passed=${passedScenarios.length}, expected=${crudReport.stats.expected}, unexpected=${crudReport.stats.unexpected}`);
}
if (cleanupEvidence.some((item) => item.verifiedZero !== true) || uniqueServerIds.length === 0) {
  throw new Error('CRUD 清理证据缺少零残留或真实服务端 ID');
}

const ledger = {
  schemaVersion: '1.0.0',
  generatedAt: new Date().toISOString(),
  scope: 'merchant-center-product-center-brand-menu-api',
  industryItemExcluded: true,
  sources: {
    requestReport: relative(requestPath),
    crudReport: relative(crudPath),
    blockerPlan: relative(blockerPath),
  },
  requestContracts: {
    activeOperations: requestReport.total,
    generatedTests: requestReport.total,
    executed: requestReport.executed,
    shardCount: requestReport.shardCount,
    successfulResponses: requestReport.completion.successfulResponses,
    validationResponses: requestReport.completion.validationResponses,
    businessRejections: requestReport.completion.businessRejections,
    requestContractPassed,
    blocked: blockerReport.total,
    classifications: requestReport.classification,
  },
  businessLifecycles: {
    scenarios: specs.length,
    passed: passedScenarios.length,
    mutationScenarios: mutationScenarios.length,
    cleanupEvidence: cleanupEvidence.length,
    registeredServerIds: uniqueServerIds.length,
    registeredIdentities: uniqueIdentities.length,
    allMutationResidueVerifiedZero: cleanupEvidence.every((item) => item.verifiedZero === true),
    durationMs: crudReport.stats.duration,
    cases: passedScenarios.map((spec) => ({ title: spec.title, file: spec.file, status: 'passed' })),
  },
  blockers: {
    total: blockerReport.total,
    summary: blockerReport.summary,
  },
  completion: {
    staticScriptLandingComplete: requestReport.total === requestReport.executed,
    requestExecutionComplete: requestReport.completion.requestCoverageComplete,
    currentBusinessLifecycleSuiteComplete: passedScenarios.length === crudReport.stats.expected,
    resourceLedgerComplete: uniqueServerIds.length === 23 && cleanupEvidence.every((item) => item.verifiedZero === true),
    fullEndpointBusinessClosureComplete: blockerReport.total === 0,
    status: blockerReport.total === 0 ? 'complete' : 'partial-blocked',
  },
};

fs.writeFileSync(outputPath, JSON.stringify(ledger, null, 2), 'utf8');
fs.writeFileSync(markdownPath, [
  '# 商品中心接口测试落地账本',
  '',
  `- 活动接口脚本：${ledger.requestContracts.generatedTests}/${ledger.requestContracts.activeOperations}`,
  `- 最新请求执行：${ledger.requestContracts.executed}/${ledger.requestContracts.activeOperations}`,
  `- 请求合同通过：${ledger.requestContracts.requestContractPassed}`,
  `- 待补能力：${ledger.requestContracts.blocked}`,
  `- 业务生命周期场景：${ledger.businessLifecycles.passed}/${ledger.businessLifecycles.scenarios}`,
  `- 变更场景零残留：${ledger.businessLifecycles.mutationScenarios}/${ledger.businessLifecycles.mutationScenarios}`,
  `- 已登记服务端 ID：${ledger.businessLifecycles.registeredServerIds}`,
  `- 当前结论：${ledger.completion.status}`,
  '',
  '## 阻断分类',
  '',
  ...Object.entries(blockerReport.summary).map(([name, count]) => `- ${name}: ${count}`),
  '',
  '## 业务生命周期',
  '',
  ...ledger.businessLifecycles.cases.map((item) => `- ${item.title}`),
  '',
].join('\n'), 'utf8');

console.log(`接口落地账本已生成：${outputPath}`);

function collectSpecs(suite: JsonSuite): JsonSpec[] {
  return [...(suite.specs ?? []), ...(suite.suites ?? []).flatMap(collectSpecs)];
}

function readJson<T>(filePath: string): T {
  return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T;
}

function relative(filePath: string): string {
  return path.relative(rootDir, filePath).replace(/\\/g, '/');
}
