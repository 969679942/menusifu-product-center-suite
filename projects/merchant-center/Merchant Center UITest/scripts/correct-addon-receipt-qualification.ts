import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { publishImmutableArtifact } from '../utils/immutable-artifact';
import { parseProductCenterItemCaseSemanticFingerprints } from '../utils/product-center-item-case-semantic-fingerprint';
import { buildSevenGoalCaseLedger } from './build-seven-goal-case-ledger';

// A bounded correction of the September 9 positional mapping incident. No business execution.
const root = process.cwd();
const read = (p: string) => JSON.parse(fs.readFileSync(path.resolve(root, p), 'utf8').replace(/^\uFEFF/, ''));
const hash = (p: string) => createHash('sha256').update(fs.readFileSync(path.resolve(root, p))).digest('hex');
const publish = (p: string, value: unknown) => publishImmutableArtifact({ outputRoot: root, relativePath: p,
  content: JSON.stringify(value, null, 2) + '\n', reason: 'withdraw-unsupported-positional-source-mapping-preserve-original-evidence' });
const manifestPath = 'contracts/product-center/test-cases/canonical/product-center-item-current-receipt-contract.json';
const reportPath = 'output/product-center-item-source-governed-addon-014-016-20260909-04.json';
const sourcePath = '../Merchant Center Info/00-待转换测试方案/用例库/商品中心-商品管理-商品/1.商品中心-商品管理-商品-正式测试用例.md';
const auditPath = 'deliverables/system-test-platform/addon-014-016-semantic-correction.json';
if (fs.existsSync(path.join(root, auditPath))) throw new Error('CORRECTION_ALREADY_RECORDED_REVIEW_CHECKPOINT');
const manifest = read(manifestPath);
const ids = ['TC-ITEM-ADD-014', 'TC-ITEM-ADD-015', 'TC-ITEM-ADD-016'];
const sources = parseProductCenterItemCaseSemanticFingerprints(path.resolve(root, sourcePath));
const receipts: any[] = [];
function walk(suite: any) {
  for (const spec of suite.specs ?? []) for (const test of spec.tests ?? []) for (const result of test.results ?? []) {
    for (const attachment of result.attachments ?? []) if (attachment.name === 'test-execution-receipt') {
      const receipt = JSON.parse(Buffer.from(attachment.body, 'base64').toString('utf8'));
      if (ids.includes(receipt.caseId)) receipts.push(receipt);
    }
  }
  for (const nested of suite.suites ?? []) walk(nested);
}
walk(read(reportPath));
if (new Set(receipts.map(r => r.caseId)).size !== 3) throw new Error('RECEIPT_INSPECTION_INCOMPLETE');
const details: Record<string, { reasons: string[]; nextAction: string }> = {
  'TC-ITEM-ADD-014': {
    reasons: ['SOURCE_ACTIONS_7_8_EDIT_SCENARIO_NOT_EXECUTED', 'SOURCE_ASSERTION_3_REPLACED_WITH_CREATE_COUNT',
      'EXPECTED_BITEM_7014_OBSERVED_BITEM_7010', 'SOURCE_NAVIGATION_1_3_NOT_PROVEN_BY_DIRECT_OPEN'],
    nextAction: '补正式导航和独立编辑目标；创建与编辑分别核对 BITEM-7014、名称与列表。7010 只登记实际观察，不能归为语言等价；实现缺口自动修复，正式规则与稳定行为冲突另行取证。',
  },
  'TC-ITEM-ADD-015': {
    reasons: ['SOURCE_ACTIONS_5_7_STANDARD_RENAME_NOT_EXECUTED', 'SOURCE_ASSERTION_3_REPLACED_WITH_CREATE_COUNT',
      'UI_LIST_TYPE_AND_NAME_OBSERVATIONS_INCOMPLETE'],
    nextAction: '补标准商品编辑成已有加料名称的场景；独立核对创建与编辑 API 响应、UI 列表商品类型、新旧名称以及所有身份清理。',
  },
  'TC-ITEM-ADD-016': {
    reasons: ['POSITIONAL_MAPPING_BINDS_WRAPPER_AND_NAVIGATION_TO_FIELD_ACTIONS', 'EMPTY_CLEANUP_IDENTITY_OBSERVATIONS',
      'SOURCE_ASSERTION_3_UI_LIST_QUERY_NOT_EXECUTED', 'SOURCE_ASSERTION_1_UI_OBSERVATION_LABELLED_API'],
    nextAction: '将四个正式动作明确映射到填写名称、填写第二名称、填写价格、保存；保留负向尝试身份，补列表查询和 API/UI 零残留；按 UI 及 API 实际通道分别生成断言。',
  },
};
publish(auditPath, { schemaVersion: '1.0.0', recordedAt: new Date().toISOString(), status: 'evidence-incomplete',
  previousTurnAssessment: 'changed-authoritative-state-but-qualified-two-cases-with-unsupported-semantic-mapping',
  businessExecuted: 0, businessResultsModified: false, unrelatedQualifiedCasesInvalidated: false,
  inputs: [manifestPath, reportPath, sourcePath, 'flows/product-center/item-216/addon-item-216.flow.ts'].map(p => ({ path: p, sha256: hash(p) })),
  withdrawnContracts: manifest.cases.filter((c: any) => ids.includes(c.caseId)),
  rows: ids.map(caseId => {
    const receipt = receipts.find(r => r.caseId === caseId);
    const source = sources.find(s => s.caseId === caseId)!;
    return { caseId, source, ...details[caseId], formalPassQualified: false,
      receiptAssertions: receipt.assertionReceipts, cleanup: receipt.cleanup,
      operationTrace: receipt.operationReceipts.map((o: any) => ({ sequence: o.sequence, key: o.operationKey, title: o.title, status: o.status })) };
  }),
  cost: { startGoalTokens: 3761484, observedGoalTokens: 3871707, observedDelta: 110223,
    source: 'get_goal.tokensUsed', interpretation: 'goal-counter-delta-not-provider-billing-or-isolated-business-cost',
    decision: 'finish-safe-correction-checkpoint-then-freeze-this-audit-direction' },
});
const readinessPath = 'deliverables/system-test-platform/product-center-item-release-readiness.json';
publish('deliverables/system-test-platform/addon-014-016-readiness-before-correction.json', read(readinessPath));
manifest.cases = manifest.cases.filter((c: any) => !ids.includes(c.caseId));
publish(manifestPath, manifest);
const summary = buildSevenGoalCaseLedger(root);
if (summary.currentQualified !== 16) throw new Error(`UNEXPECTED_QUALIFICATION_CHANGE:${summary.currentQualified}`);
const goalPath = 'deliverables/system-test-platform/seven-current-goals.json';
const goals = read(goalPath);
goals.updatedAt = new Date().toISOString();
goals.currentQualified = summary.currentQualified;
goals.notQualified = summary.notQualified;
goals.goals[0].completed = '205 条集合对账无漏案或重复；现有资格合同合格 16，未合格 188。深层语义覆盖尚未全审。';
goals.goals[0].status = 'scope-reconciled-semantic-review-incomplete';
goals.goals[1].completed = '保留此前首批真实闭环证据；撤销 ADD014/015 新增资格，ADD016 清理仍不完整，三条均不计入新增正式闭环。';
goals.goals[4].currentQualified = 16;
goals.goals[4].remaining = '188 条未合格；ADD014–016 具体语义及清理缺口见 addon-014-016-semantic-correction.json';
goals.goals[4].latestResult = '3 条运行报告均存在，但不足以证明当前完整正式场景；保留原始报告，只撤销不成立的资格合同。';
goals.nextUnit = 'ADD016-source-aligned-negative-flow-and-identity-cleanup';
goals.semanticCorrection = auditPath;
publish(goalPath, goals);
const checkpointPath = 'deliverables/system-test-platform/remediation-checkpoint.json';
const checkpoint = read(checkpointPath);
Object.assign(checkpoint.sevenGoalCheckpoint, { currentQualified: 16, remaining: 188, ledgerSummary: summary,
  currentResult: auditPath, nextAction: goals.nextUnit, goalMustRemainActive: true });
publish(checkpointPath, checkpoint);
console.log(JSON.stringify({ correction: auditPath, summary, rawReportUnchanged: hash(reportPath) }));
