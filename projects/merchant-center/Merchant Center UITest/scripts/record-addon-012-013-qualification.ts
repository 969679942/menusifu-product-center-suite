import fs from 'node:fs';
import path from 'node:path';
import { publishImmutableArtifact } from '../utils/immutable-artifact';

const root = process.cwd();
const read = (relativePath: string) => JSON.parse(fs.readFileSync(path.resolve(root, relativePath), 'utf8').replace(/^\uFEFF/, '')) as any;
const publish = (relativePath: string, value: unknown, reason: string) => publishImmutableArtifact({
  outputRoot: root,
  relativePath,
  content: `${JSON.stringify(value, null, 2)}\n`,
  reason,
});

const readiness = read('deliverables/system-test-platform/product-center-item-release-readiness.json');
const qualified = readiness.cases.filter((item: any) => item.qualificationStatus === 'current-receipt-qualified').map((item: any) => item.caseId);
const incomplete = readiness.summary.incomplete;
const now = new Date().toISOString();

const goals = read('deliverables/system-test-platform/seven-current-goals.json');
goals.updatedAt = now;
goals.currentQualified = readiness.summary.currentQualified;
goals.notQualified = incomplete;
goals.nextUnit = 'ADD005-011-implementation-fingerprint-impact-revalidation';
goals.goals[0].completed = `205 条集合对账无漏案或重复；当前标准收据资格 ${readiness.summary.currentQualified}/204，ADD012/013 已完成正式收据闭环。`;
goals.goals[0].remaining = '继续按实现指纹影响集重验；ADD001 业务规则裁决仍独立阻断。';
goals.goals[4].currentQualified = readiness.summary.currentQualified;
goals.goals[4].remaining = `${incomplete} 条未合格；ADD012/013 已收据合格，下一影响集为 ADD005–011。`;
goals.goals[4].latestResult = 'ADD012/013 当前报告包含完整操作、3/3断言、执行上下文和 API/UI 零残留，公共收据门禁已接受。';
goals.nextAction = '按实现指纹影响集处理 ADD005–011；只对当前资格受影响用例定向重验，不重跑已合格且无影响用例。';
goals.latestQualification = { recordedAt: now, qualified, currentQualified: readiness.summary.currentQualified, incomplete };
publish('deliverables/system-test-platform/seven-current-goals.json', goals, 'record-addon-012-013-current-receipt-qualification-and-advance-impact-set');

const checkpoint = read('deliverables/system-test-platform/remediation-checkpoint.json');
checkpoint.updatedAt = now;
checkpoint.currentUnit = 'ADD005-011-implementation-fingerprint-impact-revalidation';
checkpoint.sevenGoalCheckpoint.currentQualified = readiness.summary.currentQualified;
checkpoint.sevenGoalCheckpoint.remaining = incomplete;
checkpoint.sevenGoalCheckpoint.currentResult = 'deliverables/system-test-platform/product-center-item-release-readiness.json';
checkpoint.sevenGoalCheckpoint.nextAction = '先对 ADD005–011 做实现指纹影响分析；确认受影响后只执行必要的定向重验，并保存每轮收据与清理证据。';
checkpoint.sevenGoalCheckpoint.lastSelectedCaseIds = qualified;
checkpoint.sevenGoalCheckpoint.lastTerminalCaseIds = qualified;
checkpoint.sevenGoalCheckpoint.lastIncompleteCaseIds = [];
checkpoint.sevenGoalCheckpoint.lastRunStatus = 'completed';
checkpoint.sevenGoalCheckpoint.ledgerSummary = { ...checkpoint.sevenGoalCheckpoint.ledgerSummary, currentQualified: readiness.summary.currentQualified, incomplete };
publish('deliverables/system-test-platform/remediation-checkpoint.json', checkpoint, 'checkpoint-addon-012-013-qualified-before-next-impact-set');

console.log(JSON.stringify({ currentQualified: readiness.summary.currentQualified, incomplete, nextUnit: goals.nextUnit, qualified }));
