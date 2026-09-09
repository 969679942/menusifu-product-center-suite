import fs from 'node:fs';
import path from 'node:path';
import { readApiLifecycleByOperationKey } from '../utils/api-lifecycle';

type Result = {
  executionOrder: number;
  operationKey: string;
  method: string;
  path: string;
  status: number;
  classification: string;
};

type GovernanceClass =
  | 'service-authorization-required'
  | 'deployment-version-review'
  | 'request-contract-conflict'
  | 'entity-fixture-candidate'
  | 'multipart-fixture-candidate';

type Operation = {
  operationKey: string;
  requestBody?: { content?: Record<string, unknown> };
};

const rootDir = process.cwd();
const sourcePath = path.resolve(rootDir, 'output/brand-menu-api-tests.json');
const outputPath = path.resolve(rootDir, 'output/brand-menu-api-blocker-plan.json');
const markdownPath = path.resolve(rootDir, 'output/brand-menu-api-blocker-plan.md');
const source = JSON.parse(fs.readFileSync(sourcePath, 'utf8')) as { results: Result[] };
const operations = JSON.parse(fs.readFileSync(path.resolve(rootDir, '..', 'contracts/api/operations/all.operations.json'), 'utf8')) as Operation[];
const operationByKey = new Map(operations.map((operation) => [operation.operationKey, operation]));
const lifecycle = readApiLifecycleByOperationKey();
const blocked = source.results
  .filter((result) => [
    'fixture-required',
    'context-required',
    'authorization-required',
    'route-unavailable',
    'entity-fixture-required',
    'request-fixture-required',
  ].includes(result.classification))
  .filter((result) => lifecycle.get(result.operationKey)?.automationPolicy !== 'exclude-from-active-catalog');
const entries = blocked.map((result) => {
  const operation = operationByKey.get(result.operationKey);
  const governanceClass = classify(result, operation);
  return {
    ...result,
    governanceClass,
    requestContentTypes: Object.keys(operation?.requestBody?.content ?? {}),
    mutationReplayAllowed: false,
    ...(governanceClass === 'service-authorization-required'
      ? { evidenceRefs: ['output/brand-menu-api-ui-auth-replay.json'] }
      : {}),
    nextAction: nextAction(governanceClass),
    recoveryCondition: recoveryCondition(governanceClass),
  };
});
const summary = Object.fromEntries([...new Set(entries.map((entry) => entry.governanceClass))]
  .sort()
  .map((name) => [name, entries.filter((entry) => entry.governanceClass === name).length]));

fs.writeFileSync(outputPath, JSON.stringify({
  generatedAt: new Date().toISOString(),
  source: path.relative(rootDir, sourcePath).replace(/\\/g, '/'),
  total: entries.length,
  lifecycleExcluded: source.results
    .filter((result) => lifecycle.get(result.operationKey)?.automationPolicy === 'exclude-from-active-catalog')
    .map((result) => ({
      operationKey: result.operationKey,
      status: lifecycle.get(result.operationKey)?.status ?? 'excluded',
    })),
  mutationReplayPolicy: 'registered-server-resource-required',
  summary,
  entries,
}, null, 2), 'utf8');

const lines = [
  '# 品牌接口阻断治理计划',
  '',
  `- 总数：${entries.length}`,
  `- 服务授权边界：${summary['service-authorization-required'] ?? 0}`,
  `- 文档先于部署：${summary['deployment-version-review'] ?? 0}`,
  `- 请求合同冲突：${summary['request-contract-conflict'] ?? 0}`,
  `- 实体夹具候选：${summary['entity-fixture-candidate'] ?? 0}`,
  `- 上传夹具候选：${summary['multipart-fixture-candidate'] ?? 0}`,
  '- 写操作重放门禁：必须先登记真实服务端资源 ID。',
  '',
  '| 接口 | 状态 | 治理分类 | 下一步 |',
  '| --- | ---: | --- | --- |',
  ...entries.map((entry) => `| \`${entry.operationKey}\` | ${entry.status} | ${entry.governanceClass} | ${entry.nextAction} |`),
  '',
];
fs.writeFileSync(markdownPath, lines.join('\n'), 'utf8');
console.log(`已生成 ${entries.length} 条接口阻断治理计划：${outputPath}`);

function classify(result: Result, operation: Operation | undefined): GovernanceClass {
  if (result.status === 401 || result.status === 403) return 'service-authorization-required';
  if (result.path === '/ops-brand/menu-import/upload') return 'request-contract-conflict';
  if (operation?.requestBody?.content?.['multipart/form-data']) return 'multipart-fixture-candidate';
  if (/\/sched\/jobs/i.test(result.path) && result.status === 404) return 'deployment-version-review';
  return 'entity-fixture-candidate';
}

function nextAction(classification: GovernanceClass): string {
  if (classification === 'service-authorization-required') return '确认服务级凭据、网关策略和允许的调用入口';
  if (classification === 'deployment-version-review') return '确认 document (5) 新增路由对应服务是否已部署到 QA';
  if (classification === 'request-contract-conflict') return '确认旧接口是否废弃；当前页面文件选择已证实使用 /item/v1/ops-brand/menu-import-tasks-files multipart file 字段';
  if (classification === 'multipart-fixture-candidate') return '建立受控文件样本、上传请求合同和任务清理';
  return '找到创建入口并通过资源注册器登记服务端 ID 后定向执行';
}

function recoveryCondition(classification: GovernanceClass): string {
  if (classification === 'service-authorization-required') return '获得允许自动化使用的服务身份或确认接口非外部测试范围';
  if (classification === 'deployment-version-review') return 'QA 发布身份包含调度接口版本且只读查询返回非 404';
  if (classification === 'request-contract-conflict') return '接口负责人确认旧接口废弃，或提供其独立入口、真实媒体类型和请求字段结构';
  if (classification === 'multipart-fixture-candidate') return '上传样本可创建任务且任务可查询和清理';
  return '前置实体可创建、可查询、可清理并已登记真实服务端 ID';
}
