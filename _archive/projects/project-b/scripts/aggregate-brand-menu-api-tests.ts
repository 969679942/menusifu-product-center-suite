import fs from 'node:fs';
import path from 'node:path';
import { readApiLifecycleByOperationKey } from '../utils/api-lifecycle';

type Operation = { operationKey: string; method: string; path: string };
type Result = { operationKey: string; executionOrder?: number; classification?: string; [key: string]: unknown };
type ShardReport = { shardId: string; shardName: string; industryExcluded: boolean; authentication?: Record<string, unknown>; total: number; executed: number; results: Result[] };

const projectRoot = process.cwd();
const catalogPath = path.resolve(projectRoot, '..', 'contracts/api/operations/brand-menu.operations.json');
const reportDir = path.resolve(projectRoot, 'output/brand-menu-api-shards');
const reportPath = path.resolve(projectRoot, 'output/brand-menu-api-tests.json');
const operations = JSON.parse(fs.readFileSync(catalogPath, 'utf8')) as Operation[];
const reportFiles = fs.readdirSync(reportDir).filter((file) => file.endsWith('.json')).sort();
const reports = reportFiles.map((file) => JSON.parse(fs.readFileSync(path.join(reportDir, file), 'utf8')) as ShardReport);
const lifecycle = readApiLifecycleByOperationKey();
const allResults = reports.flatMap((report) => report.results ?? []);
const lifecycleExcludedResults = allResults.filter((result) => lifecycle.get(result.operationKey)?.automationPolicy === 'exclude-from-active-catalog');
const results = allResults
  .filter((result) => lifecycle.get(result.operationKey)?.automationPolicy !== 'exclude-from-active-catalog')
  .sort((a, b) => (a.executionOrder ?? Number.MAX_SAFE_INTEGER) - (b.executionOrder ?? Number.MAX_SAFE_INTEGER));
const expectedKeys = new Set(operations.map((operation) => operation.operationKey));
const actualKeys = new Set(results.map((result) => result.operationKey));
const duplicateKeys = results.map((result) => result.operationKey).filter((key, index, all) => all.indexOf(key) !== index);
const missingKeys = operations.map((operation) => operation.operationKey).filter((key) => !actualKeys.has(key));
const extraKeys = [...actualKeys].filter((key) => !expectedKeys.has(key));
const authentications = reports.map((report) => JSON.stringify(report.authentication ?? {}));

if (reports.some((report) => report.industryExcluded !== true)) throw new Error('存在未声明 industryExcluded=true 的分片报告');
if (new Set(authentications).size !== 1 || authentications[0] === '{}') throw new Error('分片报告的脱敏认证上下文缺失或不一致');
if (results.length !== operations.length || missingKeys.length > 0 || extraKeys.length > 0 || duplicateKeys.length > 0) {
  throw new Error(`接口结果守恒校验失败: expected=${operations.length}, actual=${results.length}, missing=${missingKeys.length}, extra=${extraKeys.length}, duplicates=${duplicateKeys.length}`);
}

const classification = Object.fromEntries([...new Set(results.map((result) => result.classification ?? 'unclassified'))].map((name) => [name, results.filter((result) => (result.classification ?? 'unclassified') === name).length]));
const successfulResponses = Number(classification.success ?? 0);
const validationResponses = Number(classification['validation-response'] ?? 0);
const businessRejections = Number(classification['business-rejection'] ?? 0);
const blockedByFixtureOrContext = results.length - successfulResponses - validationResponses - businessRejections;
const completion = {
  level: 'request-observation',
  requestCoverageComplete: results.length === operations.length,
  successfulResponses,
  validationResponses,
  businessRejections,
  blockedByFixtureOrContext,
  businessContractPassed: 0,
  businessClosureComplete: false,
  nextGate: 'endpoint-specific-contracts-and-fixtures',
};
fs.writeFileSync(reportPath, JSON.stringify({
  generatedAt: new Date().toISOString(), scope: 'brand-menu', industryExcluded: true,
  total: operations.length, executed: results.length, shardCount: reports.length, classification,
  lifecycleExcluded: lifecycleExcludedResults.map((result) => ({
    operationKey: result.operationKey,
    status: lifecycle.get(result.operationKey)?.status ?? 'excluded',
  })),
  completion,
  authentication: reports[0].authentication,
  shards: reports.map((report) => ({ shardId: report.shardId, shardName: report.shardName, total: report.total, executed: report.executed, resultCount: report.results.length })),
  results,
}, null, 2), 'utf8');
console.log(`已聚合 ${results.length} 条品牌接口请求观测结果，${reports.length} 个分片，守恒校验通过；业务合同闭环尚未完成：${reportPath}`);
