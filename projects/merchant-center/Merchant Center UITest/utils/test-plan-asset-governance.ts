import fs from 'node:fs';
import path from 'node:path';
import {
  productCenterCompletedTestPlanRoot,
  productCenterUnlandedTestPlanRoot,
} from './product-center-test-plan-source';
import {
  productCenterRegisteredTestPlanRoot,
  type ProductCenterTestPlanRegistration,
} from './product-center-test-plan-registry';

export type TestPlanAssetCase = {
  caseId: string;
  title: string;
  module: string;
  canonicalPath: string;
  status: 'landed' | 'unlanded' | 'not-applicable';
  scriptPath?: string;
  runtimeStatus?: string;
  reason?: string;
};

export type TestPlanAssetIndex = {
  schemaVersion: '1.0.0';
  generatedAt: string;
  contract: {
    canonicalFilesPerModule: 1;
    canonicalRoot: string;
    completedIndexRoot: string;
    unlandedIndexRoot: string;
  };
  summary: Record<string, number>;
  cases: TestPlanAssetCase[];
};

export function parseMarkdownTestCases(markdown: string): Array<{ caseId: string; title: string }> {
  return [...markdown.matchAll(/^### 用例编号：([^\r\n]+)[\s\S]*?^用例标题：([^\r\n]+)/gm)]
    .map((match) => ({ caseId: match[1].trim(), title: match[2].trim() }));
}

export function buildTestPlanAssetIndex(
  infoRoot: string,
  cases: readonly TestPlanAssetCase[],
  generatedAt = new Date().toISOString(),
): TestPlanAssetIndex {
  const canonicalRoot = path.relative(infoRoot, path.join(infoRoot, '00-待转换测试方案', '用例库')).replaceAll('\\', '/');
  const completedIndexRoot = path.relative(infoRoot, productCenterCompletedTestPlanRoot(infoRoot)).replaceAll('\\', '/');
  const unlandedIndexRoot = path.relative(infoRoot, productCenterUnlandedTestPlanRoot(infoRoot)).replaceAll('\\', '/');
  const summary = cases.reduce<Record<string, number>>((result, item) => {
    result[item.status] = (result[item.status] ?? 0) + 1;
    return result;
  }, {});
  return {
    schemaVersion: '1.0.0',
    generatedAt,
    contract: {
      canonicalFilesPerModule: 1,
      canonicalRoot,
      completedIndexRoot,
      unlandedIndexRoot,
    },
    summary,
    cases: [...cases].sort((left, right) => left.caseId.localeCompare(right.caseId)),
  };
}

export function validateTestPlanAssetIndex(
  index: TestPlanAssetIndex,
  infoRoot: string,
  plans: readonly ProductCenterTestPlanRegistration[],
  workspaceRoot?: string,
): void {
  const plansByModule = new Map(plans.map((plan) => [plan.module, plan]));
  const modules = new Set(index.cases.map((item) => item.module));
  for (const module of modules) {
    const plan = plansByModule.get(module);
    if (!plan) throw new Error(`测试资产模块未进入方案注册表：${module}`);
    const moduleRoot = productCenterRegisteredTestPlanRoot(infoRoot, plan);
    const canonicalFiles = fs.existsSync(moduleRoot)
      ? fs.readdirSync(moduleRoot).filter((fileName) => /\.md$/i.test(fileName))
      : [];
    if (canonicalFiles.length !== 1) {
      throw new Error(`测试方案 ${plan.directory} 必须且只能有一个权威用例文件，实际为 ${canonicalFiles.length}`);
    }
  }
  const duplicateIds = index.cases
    .map((item) => item.caseId)
    .filter((caseId, position, all) => all.indexOf(caseId) !== position);
  if (duplicateIds.length > 0) throw new Error(`测试资产存在重复用例编号：${[...new Set(duplicateIds)].join(',')}`);
  const invalidCompleted = index.cases.filter((item) => item.status === 'landed' && !item.scriptPath);
  if (invalidCompleted.length > 0) throw new Error(`已完成索引缺少脚本来源：${invalidCompleted.map((item) => item.caseId).join(',')}`);
  if (workspaceRoot) {
    const missingScripts = index.cases.filter((item) => item.status === 'landed' && item.scriptPath)
      .filter((item) => !fs.existsSync(path.resolve(workspaceRoot, item.scriptPath!)));
    if (missingScripts.length > 0) {
      throw new Error(`已完成索引引用的脚本不存在：${missingScripts.map((item) => `${item.caseId}:${item.scriptPath}`).join(',')}`);
    }
  }
}

export function renderTestPlanAssetIndex(index: TestPlanAssetIndex, title = '测试方案资产状态'): string {
  return [
    `# ${title}`,
    '',
    `- 生成时间：${index.generatedAt}`,
    `- 权威用例文件规则：每个模块仅 1 个 Markdown 文件，正文位于 \`${index.contract.canonicalRoot}\`。`,
    '- 已完成目录语义：仅记录已有自动化脚本绑定的用例，不代表当前版本运行通过；当前运行状态必须查看运行账本。',
    '',
    '| 用例编号 | 模块 | 状态 | 脚本 | 运行状态 | 原因 |',
    '| --- | --- | --- | --- | --- | --- |',
    ...index.cases.map((item) => `| ${item.caseId} | ${item.module} | ${item.status} | ${item.scriptPath ?? ''} | ${item.runtimeStatus ?? ''} | ${item.reason ?? ''} |`),
    '',
  ].join('\n');
}
