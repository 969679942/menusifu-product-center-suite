import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';

const projectRoot = path.resolve(__dirname, '..');
const reportPath = path.join(projectRoot, 'output/quality/product-center-maintainability-report.json');
const snapshotPath = path.join(projectRoot, 'output/quality/product-center-maintainability-api-snapshot.json');
const outputPath = path.join(projectRoot, 'output/quality/product-center-maintainability-responsibility-plan.json');
const markdownPath = path.join(projectRoot, 'output/quality/product-center-maintainability-responsibility-plan.md');

type MaintainabilityReport = {
  summary: { highPriorityFiles: number; directIdentityTemplates: number };
  files: Array<{ path: string; lines: number; reviewPriority: string; category: string }>;
};
type Snapshot = {
  files: Array<{
    path: string;
    sourceSha256: string;
    lines: number;
    classes: Array<{ name: string; methods: Array<{ name: string; line: number }> }>;
    exportedFunctions: Array<{ name: string; line: number }>;
  }>;
};

const report = readJson<MaintainabilityReport>(reportPath);
const snapshot = readJson<Snapshot>(snapshotPath);
const extractionProofPath = path.join(projectRoot, 'deliverables/system-test-platform/group-runner-extraction-proof.json');
const extractionProof = fs.existsSync(extractionProofPath) ? readJson<{
  sourceFile: string;
  allDeclarationsPreserved: boolean;
  files: Array<{ path: string; sha256: string }>;
}>(extractionProofPath) : undefined;
const extractionVerified = extractionProof?.allDeclarationsPreserved === true
  && extractionProof.files.length === 3
  && extractionProof.files.every((file) => {
    const sourcePath = path.resolve(projectRoot, file.path);
    return sourcePath.startsWith(`${projectRoot}${path.sep}`)
      && fs.existsSync(sourcePath)
      && createHash('sha256').update(fs.readFileSync(sourcePath)).digest('hex') === file.sha256;
  });
const hotspotPaths = report.files
  .filter((item) => item.reviewPriority === 'high')
  .map((item) => item.path.replace(/\\/g, '/'));
const snapshotByPath = new Map(snapshot.files.map((item) => [item.path, item]));
const responsibilityByPath: Record<string, {
  region: string;
  facade: string;
  extractionOrder: number;
  affectedSurfaces: string[];
}> = {
  'utils/product-center-group-runner.ts': { region: 'group-runner-orchestration', facade: 'utils/product-center-group-runner.ts', extractionOrder: 1, affectedSurfaces: ['group create', 'group edit', 'group delete', 'reference validation', 'query/reset', 'evidence aggregation'] },
  'flows/product-center/item-216/standard-item-216.flow.ts': { region: 'standard-item-216-flow', facade: 'flows/product-center/item-216/standard-item-216.flow.ts', extractionOrder: 2, affectedSurfaces: ['create', 'validation', 'edit', 'lifecycle', 'reference environment', 'evidence'] },
  'flows/product-center/item-216/package-item-216.flow.ts': { region: 'package-item-216-flow', facade: 'flows/product-center/item-216/package-item-216.flow.ts', extractionOrder: 3, affectedSurfaces: ['package create', 'package rules', 'specification', 'cleanup', 'evidence'] },
  'pages/product-management/group-list.page.ts': { region: 'group-list-page', facade: 'pages/product-management/group-list.page.ts', extractionOrder: 4, affectedSurfaces: ['list', 'filters', 'row menu', 'create/edit dialog', 'options', 'cleanup'] },
  'pages/product-center/seasoning-boundary.page.ts': { region: 'seasoning-boundary-page', facade: 'pages/product-center/seasoning-boundary.page.ts', extractionOrder: 5, affectedSurfaces: ['template list', 'template form', 'distribution', 'store records', 'cleanup'] },
};

const missing = hotspotPaths.filter((item) => !snapshotByPath.has(item) || !responsibilityByPath[item]);
if (missing.length > 0) throw new Error('MAINTAINABILITY_RESPONSIBILITY_PLAN_INPUT_MISSING:' + missing.join(','));

const regions = hotspotPaths.map((filePath) => {
  const definition = responsibilityByPath[filePath];
  const file = snapshotByPath.get(filePath)!;
  const publicMethods = file.classes.flatMap((entry) => entry.methods)
    .concat(file.exportedFunctions.map((entry) => ({ name: entry.name, line: entry.line })));
  return {
    filePath,
    region: definition.region,
    facade: definition.facade,
    extractionOrder: definition.extractionOrder,
    sourceSha256: file.sourceSha256,
    implementationMoved: filePath === extractionProof?.sourceFile && extractionVerified,
    lines: file.lines,
    publicSurfaceCount: publicMethods.length,
    publicSurfaceNames: publicMethods.map((entry) => entry.name),
    affectedSurfaces: definition.affectedSurfaces,
    requiredPreconditions: ['区域行为隔离快照', '兼容 facade 保留原导出与构造方式', '实现指纹变化后定向重验引用该区域的用例', '公共与项目适配器合同回归'],
    forbiddenShortcuts: ['不得抬高维护性基线掩盖热点', '不得复制第二份业务实现', '不得直接修改生成 spec 代替 flow/facade 重构', '不得用历史收据替代拆分后的当前收据'],
  };
});

const completedExtractions = [
  {
    region: 'group-runner-orchestration',
    helper: 'utils/product-center-group-runner-helpers.ts',
    kind: 'pure-routing-and-observation-helpers',
    status: fs.existsSync(path.join(projectRoot, 'utils/product-center-group-runner-helpers.ts'))
      ? 'completed' as const
      : 'planned' as const,
    impact: '保留 runner facade、公开 API 和业务执行语义；仅减少重复解析/判定职责',
  },
  {
    region: 'group-runner-orchestration',
    helper: 'adapters/product-center/product-center-group-combo-v2-cases.ts; adapters/product-center/product-center-group-combo-v2-support.ts',
    kind: 'combo-v2-scenarios-and-shared-support',
    status: extractionVerified ? 'completed' as const : 'revalidation-required' as const,
    evidence: 'deliverables/system-test-platform/group-runner-extraction-proof.json',
    impact: '117 个声明逐项保持；原公开入口继续转发到唯一实现，业务通过仍需当前标准收据',
  },
];

const plan = {
  schemaVersion: '1.0.0',
  planId: 'product-center-maintainability-responsibility-v1',
  generatedAt: new Date().toISOString(),
  status: 'ready-for-engineering-review' as const,
  scope: 'static-analysis-and-contract-protection',
  purpose: '按职责隔离热点实现，保护公开 API、实现指纹和定向重验边界',
  source: { maintainabilityReport: 'output/quality/product-center-maintainability-report.json', apiSnapshot: 'output/quality/product-center-maintainability-api-snapshot.json', highPriorityFiles: report.summary.highPriorityFiles, directIdentityTemplates: report.summary.directIdentityTemplates },
  summary: { regionCount: regions.length, publicSurfaceCount: regions.reduce((sum, item) => sum + item.publicSurfaceCount, 0), completedExtractionCount: completedExtractions.filter((item) => item.status === 'completed').length, businessExecutionStarted: false, existingPassedCasesInvalidated: false },
  regions,
  completedExtractions,
  acceptance: ['拆分后原 facade API 仍可被现有 runner/spec 引用', '源码指纹变化只触发实际引用区域的定向重验', '公共合同、适配器合同和系统无关负向合同全部通过', '维护性高优先级文件数量下降或有明确新增对账', '无重复业务实现、无敏感值、无生成伪收据'],
  nextAction: '组 runner 纯 helper 抽离已完成；继续按 extractionOrder 对剩余职责实施兼容 facade 拆分，并在每批后执行定向合同回归',
};

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, JSON.stringify(plan, null, 2) + '\n', 'utf8');
fs.writeFileSync(markdownPath, renderMarkdown(plan) + '\n', 'utf8');
process.stdout.write(JSON.stringify({ outputPath, markdownPath, summary: plan.summary }) + '\n');

function readJson<T>(filePath: string): T {
  return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T;
}

function renderMarkdown(value: typeof plan): string {
  return [
    '# 商品中心维护性职责拆分计划',
    '',
    '状态：' + value.status,
    '热点文件：' + value.summary.regionCount,
    '公开接口面：' + value.summary.publicSurfaceCount,
    '已完成纯职责抽离：' + value.summary.completedExtractionCount,
    '业务执行：false；既有通过用例：未失效。',
    '',
    '| 顺序 | 文件 | 区域 | Facade | 接口面 |',
    '| ---: | --- | --- | --- | ---: |',
    ...value.regions.map((item) => '| ' + item.extractionOrder + ' | ' + item.filePath + ' | ' + item.region + ' | ' + item.facade + ' | ' + item.publicSurfaceCount + ' |'),
    '',
    '## 已完成抽离',
    '',
    ...value.completedExtractions.map((item) => '- ' + item.region + '：' + item.helper + '（' + item.status + '）'),
    '',
    '## 验收',
    '',
    ...value.acceptance.map((item) => '- ' + item),
  ].join('\n');
}
