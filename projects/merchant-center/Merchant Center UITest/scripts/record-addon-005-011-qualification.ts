import fs from 'node:fs';
import path from 'node:path';
import { publishImmutableArtifact } from '../utils/immutable-artifact';

const root = process.cwd();
const read = (relativePath: string): any => JSON.parse(
  fs.readFileSync(path.resolve(root, relativePath), 'utf8').replace(/^\uFEFF/, ''),
);
const publish = (relativePath: string, value: unknown, reason: string) => publishImmutableArtifact({
  outputRoot: root,
  relativePath,
  content: `${JSON.stringify(value, null, 2)}\n`,
  reason,
});

const readiness = read('deliverables/system-test-platform/product-center-item-release-readiness.json');
const ledger = read('deliverables/system-test-platform/seven-goal-case-ledger.json');
const qualified = readiness.cases
  .filter((item: any) => item.qualificationStatus === 'current-receipt-qualified')
  .map((item: any) => item.caseId);
const currentQualified = readiness.summary.currentQualified;
const incomplete = readiness.summary.incomplete;
const now = new Date().toISOString();

const goals = read('deliverables/system-test-platform/seven-current-goals.json');
goals.updatedAt = now;
goals.currentQualified = currentQualified;
goals.notQualified = incomplete;
goals.nextUnit = 'ADD015-016-current-receipt-closure';
goals.goals[0].completed = `205 条集合对账无漏案或重复；当前标准收据资格 ${currentQualified}/204。`;
goals.goals[0].remaining = '继续按实现指纹影响集和正式收据逐案推进；ADD001 业务规则裁决仍独立阻断。';
goals.goals[1].completed = '首批真实闭环目标已完成，且 ADD005–011 已完成当前影响集重验并形成正式收据。';
goals.goals[4].currentQualified = currentQualified;
goals.goals[4].remaining = `${incomplete} 条未合格；ADD005–013 已形成当前标准收据，下一单元为 ADD015–016。`;
goals.goals[4].latestResult = 'ADD009–011 诊断后真实执行 3/3 通过；ADD005–008 同轮真实执行 4/4 通过；7 条收据已登记并通过发布收据合同回归。';
goals.nextAction = '处理 ADD015–016 的当前操作/断言/上下文合同并执行必要的真实重验；不重跑已合格用例。';
goals.latestQualification = {
  recordedAt: now,
  qualified,
  currentQualified,
  incomplete,
  newlyQualified: [
    'TC-ITEM-ADD-005', 'TC-ITEM-ADD-006', 'TC-ITEM-ADD-007',
    'TC-ITEM-ADD-008', 'TC-ITEM-ADD-009', 'TC-ITEM-ADD-010', 'TC-ITEM-ADD-011',
  ],
  reports: [
    'output/product-center-item-source-governed-20260912T152951Z.json',
    'output/product-center-item-source-governed-20260912T154123Z.json',
  ],
};
publish('deliverables/system-test-platform/seven-current-goals.json', goals, 'record-addon-005-011-current-receipt-qualification');

const checkpoint = read('deliverables/system-test-platform/remediation-checkpoint.json');
checkpoint.updatedAt = now;
checkpoint.currentUnit = 'ADD015-016-current-receipt-closure';
checkpoint.sevenGoalCheckpoint.currentQualified = currentQualified;
checkpoint.sevenGoalCheckpoint.remaining = incomplete;
checkpoint.sevenGoalCheckpoint.currentResult = 'deliverables/system-test-platform/product-center-item-release-readiness.json';
checkpoint.sevenGoalCheckpoint.nextAction = '先对 ADD015–016 做当前实现/合同差异分析，再只执行必要的定向重验并保存正式收据。';
checkpoint.sevenGoalCheckpoint.lastSelectedCaseIds = goals.latestQualification.newlyQualified;
checkpoint.sevenGoalCheckpoint.lastTerminalCaseIds = goals.latestQualification.newlyQualified;
checkpoint.sevenGoalCheckpoint.lastIncompleteCaseIds = [];
checkpoint.sevenGoalCheckpoint.lastRunStatus = 'completed';
checkpoint.sevenGoalCheckpoint.ledgerSummary = {
  ...checkpoint.sevenGoalCheckpoint.ledgerSummary,
  currentQualified,
  incomplete,
};
checkpoint.sevenGoalCheckpoint.latestRun = {
  selectedCaseIds: goals.latestQualification.newlyQualified,
  terminalCaseIds: goals.latestQualification.newlyQualified,
  status: 'completed',
  reportPaths: goals.latestQualification.reports,
};
publish('deliverables/system-test-platform/remediation-checkpoint.json', checkpoint, 'checkpoint-addon-005-011-qualified-before-next-impact-set');

console.log(JSON.stringify({ currentQualified, incomplete, nextUnit: goals.nextUnit, qualified }, null, 2));
