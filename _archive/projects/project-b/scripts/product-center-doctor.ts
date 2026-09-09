import fs from 'node:fs';
import path from 'node:path';
import { buildProcessDoctorReport, type ProcessDoctorSnapshot } from '../../../Test Automation Platform/src/governance/process-doctor';

const projectRoot = path.resolve(__dirname, '..');
const workspaceRoot = path.resolve(projectRoot, '..');

function readJson(relativePath: string): any | null {
  const filePath = path.join(projectRoot, relativePath);
  if (!fs.existsSync(filePath)) return null;
  try { return JSON.parse(fs.readFileSync(filePath, 'utf8')); } catch { return null; }
}

function collectCheckpoints(dir: string): Array<{ file: string; gaps: string[] }> {
  const required = ['intentFingerprint', 'selectionFingerprint', 'selectedCaseIds', 'terminalCaseIds', 'incompleteCaseIds'];
  const output: Array<{ file: string; gaps: string[] }> = [];
  if (!fs.existsSync(dir)) return output;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) output.push(...collectCheckpoints(full));
    else if (entry.name.toLowerCase().includes('checkpoint') && entry.name.endsWith('.json')) {
      try {
        const value = JSON.parse(fs.readFileSync(full, 'utf8')) as Record<string, unknown>;
        if (value.runId && (value.selectedCaseIds || value.terminalCaseIds || value.status)) {
          const gaps = required.filter((key) => !(key in value));
          if (gaps.length) output.push({ file: path.relative(workspaceRoot, full).replaceAll('\\', '/'), gaps });
        }
      } catch { output.push({ file: path.relative(workspaceRoot, full).replaceAll('\\', '/'), gaps: ['invalid-json'] }); }
    }
  }
  return output;
}

const diff = readJson('output/page-contract/product-center-page-contract-diff.json');
const approval = readJson('output/test-case-audit/product-center/technical-binding-approval-request-latest.json');
const sources = readJson('contracts/product-center/reviews/unsupported-source-format-decisions.json');
const migration = readJson('adapters/test-automation-platform/reports/merchant-center-migration-closure.json');
const quality = readJson('output/quality/product-center-maintainability-report.json');
const readiness = readJson('deliverables/system-test-platform/readiness.json');
const verdict = readJson('deliverables/system-test-platform/final-goal-verdict.json');
const checkpointGaps = collectCheckpoints(path.join(projectRoot, 'deliverables')).concat(collectCheckpoints(path.join(workspaceRoot, 'contracts')));

const snapshot: ProcessDoctorSnapshot = {
  scope: 'merchant-center-project-governance',
  pageContract: diff ? { status: diff.status, findings: diff.summary?.findings, evidencePath: 'Merchant Center UITest/output/page-contract/product-center-page-contract-diff.json' } : undefined,
  technicalApproval: approval ? { pending: approval.summary?.pending, evidencePath: 'Merchant Center UITest/output/test-case-audit/product-center/technical-binding-approval-request-latest.json' } : undefined,
  sourceGovernance: sources ? { currentGoalBlockingCases: sources.summary?.currentGoalBlockingCases, evidencePath: 'Merchant Center UITest/contracts/product-center/reviews/unsupported-source-format-decisions.json' } : undefined,
  migration: migration ? { status: migration.status, unowned: migration.summary?.unowned, bridgeViolations: migration.summary?.bridgeViolations, inventoryChanged: migration.summary?.inventoryChanged, evidencePath: 'Merchant Center UITest/adapters/test-automation-platform/reports/merchant-center-migration-closure.json' } : undefined,
  maintainability: quality ? { highPriorityFiles: quality.summary?.highPriorityFiles, baselineMaxHighPriorityFiles: quality.baseline?.maxHighPriorityFiles, directIdentityTemplates: quality.directIdentityTemplates, evidencePath: 'Merchant Center UITest/output/quality/product-center-maintainability-report.json' } : undefined,
  readiness: { status: readiness?.status, crossSystemReady: verdict?.crossSystemReady, readinessPath: 'Merchant Center UITest/deliverables/system-test-platform/readiness.json', verdictPath: 'Merchant Center UITest/deliverables/system-test-platform/final-goal-verdict.json' },
  checkpointGaps,
  labels: { projectOwner: '商品中心自动化负责人', approvalOwner: '商品中心技术绑定审批人', sourceOwner: '各模块产品负责人', migrationOwner: '平台迁移责任人', maintenanceOwner: '商品中心自动化开发负责人', pilotOwner: '金将军（明确启动人）' },
};
const report = buildProcessDoctorReport(snapshot);
const outDir = path.join(projectRoot, 'output/doctor');
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'product-center-doctor.json'), `${JSON.stringify(report, null, 2)}\n`);
const markdown = ['# 商品中心项目治理状态诊断', '', `生成时间：${report.generatedAt}`, `总体状态：${report.summary.status}`, `范围：${report.executionScope}`, '', '| Finding | 类别 | 级别 | 状态 | 下一步 |', '|---|---|---|---|---|', ...report.findings.map((finding) => `| ${finding.findingId} | ${finding.category} | ${finding.severity} | ${finding.status} | ${finding.nextAction} |`), '', '既有业务结果：unchanged（本次未执行业务 UI 写操作、未启动跨系统试点、未主动重跑已通过用例）。', ''];
fs.writeFileSync(path.join(outDir, 'product-center-doctor.md'), markdown.join('\n'));
process.stdout.write(JSON.stringify({ status: report.summary.status, findings: report.summary.totalFindings, output: path.relative(workspaceRoot, outDir).replaceAll('\\', '/') }) + '\n');
