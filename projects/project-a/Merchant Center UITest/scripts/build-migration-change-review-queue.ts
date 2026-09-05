import fs from 'node:fs';
import path from 'node:path';

const projectRoot = path.resolve(__dirname, '..');
const migrationPath = path.join(projectRoot, 'adapters/test-automation-platform/reports/merchant-center-migration-closure.json');
const migration = JSON.parse(fs.readFileSync(migrationPath, 'utf8')) as { inventory?: { changed?: Array<{ code: string; path: string; detail: string }> } };
const changed = migration.inventory?.changed ?? [];

const items = changed.map((entry, index) => {
  const isPlatform = entry.path.startsWith('platform:');
  const isTransientEvidence = /repair-diagnosis|output|allure|report|runtime-audit|compiler-state/i.test(entry.path);
  const changeClass = isPlatform ? 'public-core' : isTransientEvidence ? 'generated-evidence-or-runtime-asset' : 'project-adapter-or-domain-asset';
  return {
    reviewId: `MIGRATION-REVIEW-${String(index + 1).padStart(3, '0')}`,
    path: entry.path,
    changeCode: entry.code,
    detail: entry.detail,
    changeClass,
    owner: '待指定迁移责任人',
    disposition: 'needs-human-acceptance',
    blockedBy: '未提供该项变更的明确批准人、原因和前后哈希验收记录',
    nextAction: '确认是否为本轮有意变更；补充批准人、原因、前后哈希和结果影响后再决定是否纳入新基线',
    dueAt: null,
    approvalStatus: 'pending',
    expectedImpact: changeClass === 'public-core' ? '可能影响所有项目的公共流程合同，需先通过公共合同测试' : '仅影响商品中心适配器或生成证据，需确认是否改变项目执行/复用资格',
    resultImpact: changeClass === 'public-core' ? 'revalidation-required-if-runtime-contract-changed' : 'unchanged-until-approved',
  };
});

const report = {
  schemaVersion: '1.0.0',
  generatedAt: new Date().toISOString(),
  scope: 'merchant-center-migration-change-review',
  status: items.length === 0 ? 'clear' : 'needs-human-acceptance',
  summary: { total: items.length, pending: items.length, publicCore: items.filter((item) => item.changeClass === 'public-core').length, projectOrEvidence: items.filter((item) => item.changeClass !== 'public-core').length },
  guardrails: { autoBaselineAcceptance: false, businessUiWrites: false, rerunPassedCases: false, crossSystemPilot: 'deferred' },
  items,
};
const outputDir = path.join(projectRoot, 'output/migration');
fs.mkdirSync(outputDir, { recursive: true });
fs.writeFileSync(path.join(outputDir, 'migration-change-review-queue.json'), `${JSON.stringify(report, null, 2)}\n`);
const markdown = ['# 迁移变化人工验收队列', '', `状态：${report.status}`, `总数：${report.summary.total}；公共核心：${report.summary.publicCore}；项目/证据：${report.summary.projectOrEvidence}`, '', '| Review ID | 路径 | 分类 | 审批状态 | 下一步 |', '|---|---|---|---|---|', ...items.map((item) => `| ${item.reviewId} | ${item.path} | ${item.changeClass} | ${item.approvalStatus} | ${item.nextAction} |`), '', '说明：本队列只登记迁移变化，不自动接受新基线，不改变业务用例结果。', ''];
fs.writeFileSync(path.join(outputDir, 'migration-change-review-queue.md'), markdown.join('\n'));
process.stdout.write(JSON.stringify({ status: report.status, total: report.summary.total, output: path.relative(path.resolve(projectRoot, '..'), outputDir).replaceAll('\\', '/') }) + '\n');
