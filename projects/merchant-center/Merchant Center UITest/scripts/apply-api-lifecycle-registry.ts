import fs from 'node:fs';
import path from 'node:path';
import {
  assertLifecycleRegistryIntegrity,
  filterActiveApiOperations,
  readApiLifecycleByOperationKey,
  readApiLifecycleRegistry,
} from '../utils/api-lifecycle';

type Operation = { operationKey: string; [key: string]: unknown };

const rootDir = process.cwd();
const brandPath = path.resolve(rootDir, '..', 'contracts/api/operations/brand-menu.operations.json');
const industryPath = path.resolve(rootDir, '..', 'contracts/api/operations/industry-item.operations.json');
const allPath = path.resolve(rootDir, '..', 'contracts/api/operations/all.operations.json');
const lifecycleMarkdownPath = path.resolve(rootDir, '..', 'Merchant Center API/API生命周期登记.md');
const brandOperations = JSON.parse(fs.readFileSync(brandPath, 'utf8')) as Operation[];
const industryOperations = JSON.parse(fs.readFileSync(industryPath, 'utf8')) as Operation[];
const allOperations = JSON.parse(fs.readFileSync(allPath, 'utf8')) as Operation[];
const lifecycle = readApiLifecycleByOperationKey();
const registry = readApiLifecycleRegistry();

assertLifecycleRegistryIntegrity(brandOperations);
const activeBrandOperations = filterActiveApiOperations(brandOperations);
const activeAllOperations = filterActiveApiOperations(allOperations);
const missingIndustry = industryOperations.filter((operation) => !activeAllOperations.some((candidate) => candidate.operationKey === operation.operationKey));
if (missingIndustry.length > 0) throw new Error(`生命周期过滤误删行业接口：${missingIndustry.map((operation) => operation.operationKey).join(', ')}`);

const deprecatedKeys = [...lifecycle.entries()]
  .filter(([, entry]) => entry.status === 'deprecated')
  .map(([operationKey]) => operationKey);
for (const operationKey of deprecatedKeys) {
  if (activeBrandOperations.some((operation) => operation.operationKey === operationKey)) {
    throw new Error(`废弃接口仍存在于活动品牌目录：${operationKey}`);
  }
}

fs.writeFileSync(brandPath, `${JSON.stringify(activeBrandOperations, null, 2)}\n`, 'utf8');
fs.writeFileSync(allPath, `${JSON.stringify(activeAllOperations, null, 2)}\n`, 'utf8');
const lifecycleRows = registry.entries.map((entry) => [
  entry.operationKey,
  entry.status,
  String(entry.replacementOperationKey ?? '无'),
  String(entry.reason ?? '未填写'),
  String(entry.decidedAt ?? '未填写'),
].map(escapeMarkdownCell).join(' | '));
const lifecycleMarkdown = [
  '# API 生命周期登记',
  '',
  '> 本文件由 `Merchant Center API/api-lifecycle-registry.json` 自动生成，请勿手工维护。原始供应方接口文档保持不变；活动测试目录由生命周期登记过滤。',
  '',
  '| 接口 | 状态 | 替代接口 | 说明 | 决策日期 |',
  '| --- | --- | --- | --- | --- |',
  ...lifecycleRows.map((row) => `| ${row} |`),
  '',
  '## 状态规则',
  '',
  '- `deprecated`：已废弃，不生成活动接口测试，不进入活动阻断清单；历史结果保留并标记生命周期排除。',
  '- `superseded`：已由新接口替代，处理方式同废弃，但必须登记替代接口。',
  '- `blocked-review`：来源或业务用途待复核，不得自动执行真实请求。',
  '- `not-applicable`：经范围确认不属于当前业务测试，不生成活动接口测试；原始文档和历史结果保留。',
  '- 未登记接口默认按 `active` 处理。',
  '',
].join('\n');
fs.writeFileSync(lifecycleMarkdownPath, lifecycleMarkdown, 'utf8');
console.log(`API 生命周期已应用：品牌活动接口 ${activeBrandOperations.length} 条；全量活动接口 ${activeAllOperations.length} 条；废弃 ${deprecatedKeys.length} 条。`);

function escapeMarkdownCell(value: string): string {
  return value.replaceAll('|', '\\|').replaceAll(/\r?\n/g, ' ');
}
