import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';

const projectRoot = path.resolve(__dirname, '..');
const workspaceRoot = path.resolve(projectRoot, '..');
const governanceRoot = path.join(workspaceRoot, 'deliverables/test-plan-governance');
const catalogRoot = path.join(workspaceRoot, 'Merchant Center Info/业务规则治理');
const authorityPath = path.join(workspaceRoot, 'Merchant Center Info/商品中心业务规则.md');
const outputJsonPath = path.join(governanceRoot, 'product-center-business-rule-review-workbench.json');
const outputMarkdownPath = path.join(catalogRoot, '00-快速晋级工作台.md');

type CoverageReport = {
  summary: {
    documentExplicitRules: number;
    formalRules: number;
    formalExecutionVerifiedRules: number;
    documentStatusCounts: Record<string, number>;
  };
  documentRuleLedger: Array<{
    ruleId: string;
    status: string;
    statement: string;
    moduleSection: string;
    primaryLineNumber: number;
    sourceLabels: string[];
    classificationEvidence: string[];
  }>;
};

type DocumentPlan = {
  summary: {
    pendingLifecycleRules: number;
    sourceRepair: number;
    caseDesign: number;
    receiptJoin: number;
    batchPreflight: number;
  };
};

type Preflight = {
  summary: {
    approvalEligibleRules: number;
    approvalReadyButVerificationPendingRules: number;
    executionVerifiedRules: number;
  };
  rules: Array<{
    ruleId: string;
    statement: string;
    moduleSection: string;
    sourceLabels: string[];
    sourceLine: number;
    approvalEligible: boolean;
    executionCoverage: 'verified' | 'evidence-remediation-required';
    blockerCodes: string[];
  }>;
  approvalPackages: Array<{
    packageId: string;
    moduleSection: string;
    ruleIds: string[];
    approvalEligibleRuleIds: string[];
    lane: 'batch-approval' | 'individual-review' | 'evidence-remediation';
    status: string;
    humanReviewScope: string;
    executionAuthorized: false;
  }>;
};

type CandidatePlan = {
  summary: {
    totalCandidates: number;
    totalClusters: number;
    sourceRepairCandidates: number;
    deferredHoldCandidates: number;
    formalCoveredCandidates: number;
    contractTriageCandidates: number;
    automatedEnrichmentCandidates: number;
  };
};

export function buildProductCenterBusinessRuleReviewWorkbench() {
  const paths = {
    coverage: path.join(projectRoot, 'output/governance/product-center-business-rule-document-coverage.json'),
    documentPlan: path.join(governanceRoot, 'product-center-document-rule-promotion-plan.json'),
    preflight: path.join(governanceRoot, 'product-center-document-rule-batch-preflight.json'),
    evidenceRecovery: path.join(governanceRoot, 'product-center-document-rule-evidence-recovery-plan.json'),
    candidatePlan: path.join(governanceRoot, 'product-center-business-rule-promotion-batch-plan.json'),
    timeContext: path.join(governanceRoot, 'product-center-business-rule-time-context-review.json'),
    caseDecisions: path.join(workspaceRoot, 'deliverables/product-center-item/business-rules.json'),
  };
  const coverage = readJson<CoverageReport>(paths.coverage);
  const documentPlan = readJson<DocumentPlan>(paths.documentPlan);
  const preflight = readJson<Preflight>(paths.preflight);
  const candidatePlan = readJson<CandidatePlan>(paths.candidatePlan);
  const evidenceRecovery = readJson<any>(paths.evidenceRecovery);
  const timeContext = readJson<any>(paths.timeContext);
  const caseDecisions = readJson<any>(paths.caseDecisions);
  const authorityLines = fs.readFileSync(authorityPath, 'utf8').split(/\r?\n/);
  const ruleById = new Map(preflight.rules.map((item) => [item.ruleId, item]));
  const reviewBatches = preflight.approvalPackages
    .filter((item) => item.lane === 'batch-approval')
    .map((item) => ({
      packageId: item.packageId,
      moduleSection: item.moduleSection,
      status: item.status,
      humanReviewScope: item.humanReviewScope,
      rules: item.ruleIds.map((ruleId) => {
        const rule = ruleById.get(ruleId);
        if (!rule) throw new Error(`REVIEW_PACKAGE_RULE_MISSING:${ruleId}`);
        return {
          ruleId,
          statement: rule.statement,
          sourceLabels: rule.sourceLabels,
          sourceLine: rule.sourceLine,
          verificationStatus: rule.executionCoverage === 'verified' ? 'execution-verified' : 'verification-pending',
          approvalEffect: rule.executionCoverage === 'verified'
            ? '批准后可登记为正式规则并复用当前验证证据。'
            : '批准后登记为正式规则，但验证状态保持待验证；仅生成最小增量验证候选，不自动执行。',
        };
      }),
      executionAuthorized: false as const,
    }));
  const individualBusinessDecisions = coverage.documentRuleLedger
    .filter((item) => item.status === 'conflicted')
    .map((item) => {
      const evidenceLineNumbers = item.classificationEvidence
        .map((evidence) => Number(evidence.match(/line-(\d+)/)?.[1]))
        .filter((lineNumber) => Number.isInteger(lineNumber));
      return {
        ruleId: item.ruleId,
        moduleSection: item.moduleSection,
        statement: item.statement,
        sourceLabels: item.sourceLabels,
        sourceLine: item.primaryLineNumber,
        evidenceQuotes: evidenceLineNumbers.map((lineNumber) => ({
          lineNumber,
          text: authorityLines[lineNumber - 1]?.trim() ?? '原文缺失',
        })),
        requiredDecision: '只确认冲突双方哪一个是当前业务口径；技术元数据、执行上下文和证据恢复不需要人工处理。',
      };
    });

  const sourceFingerprints = Object.fromEntries(Object.entries({ ...paths, authority: authorityPath })
    .map(([key, filePath]) => [key, sha256(fs.readFileSync(filePath))]));
  const inputFingerprint = sha256(stableStringify(sourceFingerprints));
  const generatedAt = stableGeneratedAt(inputFingerprint);
  const automatedPendingRules = documentPlan.summary.sourceRepair
    + documentPlan.summary.caseDesign
    + documentPlan.summary.receiptJoin;
  const unsigned = {
    schemaVersion: '1.0.0',
    reportId: 'product-center-business-rule-review-workbench',
    scope: 'project-adapter+generated-evidence',
    generatedAt,
    inputFingerprint,
    authority: {
      businessRuleSourceOfTruth: authorityPath,
      workbenchIsAuthority: false,
      approvalAndExecutionAreSeparate: true,
    },
    terminology: {
      formalBusinessRules: '已进入正式生命周期的业务规则。',
      documentPendingRules: '已写入唯一文档但尚未完成生命周期登记的规则。',
      caseLevelConfirmedDecisions: '历史用例整改中的人工确认决定，不等于正式业务规则数量。',
      caseDerivedCandidates: '从测试用例提取的观察候选，不进入文档规则或正式规则分母。',
    },
    summary: {
      documentRules: coverage.summary.documentExplicitRules,
      formalBusinessRules: coverage.summary.formalRules,
      documentPendingRules: documentPlan.summary.pendingLifecycleRules,
      batchApprovalReadyRules: preflight.summary.approvalEligibleRules,
      batchApprovalPackages: reviewBatches.length,
      approvalReadyAndExecutionVerifiedRules: preflight.summary.executionVerifiedRules,
      approvalReadyButVerificationPendingRules: preflight.summary.approvalReadyButVerificationPendingRules,
      individualBusinessDecisions: individualBusinessDecisions.length,
      automatedPendingRules,
      caseDerivedCandidates: candidatePlan.summary.totalCandidates,
      semanticCandidateClusters: candidatePlan.summary.totalClusters,
      caseLevelConfirmedDecisions: caseDecisions.summary?.confirmedRules ?? 0,
      formalRuleCurrentExecutionVerified: coverage.summary.formalExecutionVerifiedRules,
      formalRuleCurrentExecutionTotal: coverage.summary.formalRules,
      timeContextAutomaticEvidenceRequired: timeContext.summary?.evidenceCollectionRequired ?? 0,
      timeContextHumanConfirmationRequired: timeContext.summary?.humanConfirmationRequired ?? 0,
      recoveredImmutableReceiptCases: evidenceRecovery.summary?.immutableReceiptRecoveredCases ?? 0,
      businessExecutionStarted: false,
      formalRulesModified: false,
      existingResultsInvalidated: false,
    },
    reviewBatches,
    individualBusinessDecisions,
    automatedWork: {
      documentRules: {
        sourceRepair: documentPlan.summary.sourceRepair,
        caseDesign: documentPlan.summary.caseDesign,
        receiptJoin: documentPlan.summary.receiptJoin,
      },
      caseCandidates: {
        sourceRepair: candidatePlan.summary.sourceRepairCandidates,
        evidenceEnrichment: candidatePlan.summary.automatedEnrichmentCandidates,
        testContractTriage: candidatePlan.summary.contractTriageCandidates,
        formalCovered: candidatePlan.summary.formalCoveredCandidates,
        deferredHold: candidatePlan.summary.deferredHoldCandidates,
      },
    },
    guardrails: {
      noAutomaticFormalApproval: true,
      noAutomaticBusinessExecution: true,
      verificationGapDoesNotBlockSemanticApproval: true,
      technicalOrMetadataGapNeverBecomesHumanQuestion: true,
      conflictedRulesRequireExplicitBusinessDecision: true,
      batchApprovalRequiresCurrentInputFingerprint: true,
    },
    sourceFingerprints,
  };
  const report = { ...unsigned, fingerprint: sha256(stableStringify(unsigned)) };
  writeIfChanged(outputJsonPath, `${JSON.stringify(report, null, 2)}\n`);
  writeIfChanged(outputMarkdownPath, renderMarkdown(report));
  return report;
}

function renderMarkdown(report: ReturnType<typeof buildProductCenterBusinessRuleReviewWorkbench>): string {
  const lines = [
    '# 商品中心业务规则快速晋级工作台', '',
    '> 本文件由程序生成，只用于评审和审计；唯一业务事实源仍是 `../商品中心业务规则.md`。', '',
    '## 当前结论', '',
    `- 文档规则：${report.summary.documentRules}；正式业务规则：${report.summary.formalBusinessRules}；待生命周期核验：${report.summary.documentPendingRules}。`,
    `- 已完成静态预审且可批量审核：${report.summary.batchApprovalReadyRules} 条，共 ${report.summary.batchApprovalPackages} 个语义包。`,
    `- 其中当前执行已验证：${report.summary.approvalReadyAndExecutionVerifiedRules} 条；批准后仍需最小验证：${report.summary.approvalReadyButVerificationPendingRules} 条。`,
    `- 真正需要逐条业务裁决：${report.summary.individualBusinessDecisions} 条；时间/上下文需要人工确认：${report.summary.timeContextHumanConfirmationRequired} 条。`,
    `- 剩余 ${report.summary.automatedPendingRules} 条由系统继续补来源、匹配用例或关联收据，不交给人工逐条处理。`,
    `- 用例派生候选 ${report.summary.caseDerivedCandidates} 条已压缩为 ${report.summary.semanticCandidateClusters} 个语义簇；它们不等于正式规则。`,
    '', '## 你需要审核的批量规则包', '',
    '审核时只判断规则中文表述是否是当前业务口径。执行时间、环境、租户、角色、语言、路由、指纹和收据由系统处理。', '',
  ];
  for (const batch of report.reviewBatches) {
    lines.push(
      `### ${batch.packageId}`, '',
      `- 模块：${batch.moduleSection}`,
      `- 状态：${batch.status}`,
      `- 审核范围：${batch.humanReviewScope}`,
      '', '| 规则 | 当前业务表述 | 来源 | 执行验证 | 批准后的处理 |', '|---|---|---|---|---|',
      ...batch.rules.map((rule) => `| ${rule.ruleId} | ${escapeTable(rule.statement)} | ${escapeTable(rule.sourceLabels.join('、') || '权威规则文档')}（第 ${rule.sourceLine} 行） | ${rule.verificationStatus} | ${rule.approvalEffect} |`),
      '',
    );
  }
  lines.push('## 仅有的逐条业务冲突', '');
  if (report.individualBusinessDecisions.length === 0) lines.push('当前无业务冲突。', '');
  for (const item of report.individualBusinessDecisions) {
    lines.push(
      `### ${item.ruleId}`, '',
      `- 模块：${item.moduleSection}`,
      `- 当前冲突表述：${item.statement}`,
      `- 权威位置：第 ${item.sourceLine} 行`,
      `- 需要决定：${item.requiredDecision}`,
      ...item.evidenceQuotes.map((quote) => `- 原文第 ${quote.lineNumber} 行：${quote.text}`),
      '',
    );
  }
  lines.push(
    '## 系统自动处理队列', '',
    `- 文档规则：来源修复 ${report.automatedWork.documentRules.sourceRepair}、用例设计 ${report.automatedWork.documentRules.caseDesign}、收据关联 ${report.automatedWork.documentRules.receiptJoin}。`,
    `- 用例候选：来源修复 ${report.automatedWork.caseCandidates.sourceRepair}、证据补齐 ${report.automatedWork.caseCandidates.evidenceEnrichment}、测试合同分流 ${report.automatedWork.caseCandidates.testContractTriage}、已被正式规则覆盖 ${report.automatedWork.caseCandidates.formalCovered}、延期保持 ${report.automatedWork.caseCandidates.deferredHold}。`,
    '- 上述项目不需要业务人员确认；处理完成后才会生成新的批量审核包。', '',
    '## 数字口径', '',
    `- “用例级确认决定”当前为 ${report.summary.caseLevelConfirmedDecisions}，它是历史用例整改决定，绝不再显示为正式业务规则数。`,
    '- 规则语义批准与执行验证分离：允许先确认规则是什么，再通过最小用例集合补验证；没有完整收据仍不能把验证状态写成通过。',
    '- 本次生成没有执行 UI/API、没有修改正式规则、没有使历史结果失效。', '',
  );
  return lines.join('\n');
}

function stableGeneratedAt(inputFingerprint: string): string {
  if (fs.existsSync(outputJsonPath)) {
    try {
      const current = readJson<{ inputFingerprint?: string; generatedAt?: string }>(outputJsonPath);
      if (current.inputFingerprint === inputFingerprint && current.generatedAt) return current.generatedAt;
    } catch {
      // Malformed generated output is replaced from authoritative inputs.
    }
  }
  return new Date().toISOString();
}

function writeIfChanged(filePath: string, content: string): void {
  if (fs.existsSync(filePath) && fs.readFileSync(filePath, 'utf8') === content) return;
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.tmp`;
  fs.writeFileSync(temporaryPath, content, 'utf8');
  fs.renameSync(temporaryPath, filePath);
}

function escapeTable(value: string): string { return value.replace(/\|/g, '\\|').replace(/\r?\n/g, ' ').trim(); }
function readJson<T>(filePath: string): T { return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T; }
function sha256(value: string | Buffer): string { return createHash('sha256').update(value).digest('hex'); }
function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.entries(value as Record<string, unknown>).sort(([left], [right]) => left.localeCompare(right)).map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`).join(',')}}`;
  return JSON.stringify(value);
}

if (require.main === module) {
  const report = buildProductCenterBusinessRuleReviewWorkbench();
  process.stdout.write(`${JSON.stringify({ status: 'generated', summary: report.summary, output: outputMarkdownPath })}\n`);
}
