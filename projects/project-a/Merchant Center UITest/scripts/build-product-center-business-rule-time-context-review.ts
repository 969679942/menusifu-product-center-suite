import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { validateBusinessRuleTemporalContext } from '../../../Test Automation Platform/src/automation/system-test/business-rule-governance';
import { loadCurrentProductCenterBusinessRuleLifecycleSnapshot } from './build-product-center-business-rule-lifecycle-snapshot';
import { buildProductCenterBusinessRuleTimeContextEvidence, type ProductCenterRuleTimeContextEvidence } from '../utils/product-center-business-rule-time-context-evidence';

const projectRoot = path.resolve(__dirname, '..');
const workspaceRoot = path.resolve(projectRoot, '..');
const outputRoot = path.join(workspaceRoot, 'deliverables/test-plan-governance');
const outputJsonPath = path.join(outputRoot, 'product-center-business-rule-time-context-review.json');
const outputMarkdownPath = path.join(outputRoot, 'product-center-business-rule-time-context-review.md');

const contextFields = [
  'environmentIds',
  'tenantIds',
  'roleIds',
  'locales',
  'routes',
  'featureFlags',
] as const;

export function buildProductCenterBusinessRuleTimeContextReview() {
  const lifecycle = loadCurrentProductCenterBusinessRuleLifecycleSnapshot();
  // Evidence is collected from authoritative confirmation, binding and
  // execution-index sources.  It is deliberately kept outside the rule
  // document so metadata collection cannot alter rule semantics/fingerprints.
  const evidenceArtifact = buildProductCenterBusinessRuleTimeContextEvidence();
  const evidenceByRuleId = new Map<string, ProductCenterRuleTimeContextEvidence>(
    evidenceArtifact.rules.map((item) => [item.ruleId, item]),
  );
  const rules = lifecycle.rules.map((rule) => {
    const governance = rule.governance;
    const evidence = evidenceByRuleId.get(rule.ruleId);
    const evidenceGovernance = governance
      ? {
        ...governance,
        changedAt: governance.changedAt ?? evidence?.timestamps.changedAt ?? null,
        lastVerifiedAt: governance.lastVerifiedAt ?? evidence?.timestamps.lastVerifiedAt ?? null,
      }
      : governance;
    const effectiveContext = rule.effectiveContext;
    const validation = validateBusinessRuleTemporalContext({ ...rule, governance: evidenceGovernance });
    const missingTimeFields = validation.missingTimeFields;
    const populatedContextFields = contextFields.filter((field) => effectiveContext[field].length > 0);
    const contextStatus = governance?.effectiveContextStatus === 'explicit' && populatedContextFields.length > 0
      ? 'declared'
      : governance?.effectiveContextStatus === 'explicit'
        ? 'metadata-inconsistent'
        : 'missing';
    return {
      ruleId: rule.ruleId,
      statement: rule.statement,
      effectiveVersion: rule.effectiveVersion,
      approvalAt: rule.approval?.approvedAt ?? null,
      timeEvidenceStatus: evidence?.missingFields.some((field) => ['createdAt', 'changedAt', 'effectiveFrom', 'lastVerifiedAt'].includes(field))
        ? 'partial'
        : 'complete',
      validatedTimeStatus: validation.timeStatus,
      missingTimeFields,
      effectiveContextStatus: governance?.effectiveContextStatus ?? 'unknown',
      contextEvidenceStatus: contextStatus,
      effectiveContext,
      populatedContextFields,
      diagnostics: validation.diagnostics,
      evidenceRef: evidence ? 'deliverables/test-plan-governance/product-center-business-rule-time-context-evidence.json' : null,
      collectedEvidence: evidence
        ? {
          changedAt: evidence.timestamps.changedAt,
          lastVerifiedAt: evidence.timestamps.lastVerifiedAt,
          receiptCount: evidence.receipts.length,
          executionContextFingerprints: evidence.context.executionContextFingerprints,
          contextStatus: evidence.context.status,
          missingFields: evidence.missingFields,
          diagnostics: evidence.diagnostics,
        }
        : null,
      // Missing timestamps/context are an automated evidence-collection task,
      // not a request for the product owner to re-confirm metadata already
      // present in the rule/receipt.  Semantic or scope conflicts remain the
      // only human-review path.
      humanConfirmationRequired: false,
      evidenceCollectionRequired: validation.timeStatus !== 'complete' || validation.contextStatus !== 'explicit',
      confirmationRequired: false,
      collectionMode: 'automated-source-or-release-record',
      requiredEvidence: {
        time: [
          '权威版本或发布记录：证明 effectiveFrom 及 effectiveVersion 的对应关系',
          '规则创建/变更记录：证明 createdAt、changedAt 和变更原因',
          '当前版本验证收据：证明 lastVerifiedAt 与规则语义一致',
        ],
        context: [
          '执行环境标识（environmentId）及来源指纹',
          '商户/租户业务身份（tenantId 或明确不适用声明）',
          '角色、语言、路由和功能开关快照',
        ],
      },
    };
  });
  const summary = {
    totalRules: rules.length,
    timeComplete: rules.filter((rule) => rule.timeEvidenceStatus === 'complete').length,
    timePartial: rules.filter((rule) => rule.timeEvidenceStatus === 'partial').length,
    timeUnknown: rules.filter((rule) => rule.timeEvidenceStatus === 'unknown').length,
    contextDeclared: rules.filter((rule) => rule.contextEvidenceStatus === 'declared').length,
    contextMissing: rules.filter((rule) => rule.contextEvidenceStatus === 'missing').length,
    contextMetadataInconsistent: rules.filter((rule) => rule.contextEvidenceStatus === 'metadata-inconsistent').length,
    invalidTimeOrContext: rules.filter((rule) => rule.validatedTimeStatus === 'invalid' || rule.contextEvidenceStatus === 'metadata-inconsistent').length,
    // Kept as a compatibility field for older consumers; it now means
    // product-owner confirmation and is intentionally zero for metadata.
    confirmationRequired: rules.filter((rule) => rule.humanConfirmationRequired).length,
    humanConfirmationRequired: rules.filter((rule) => rule.humanConfirmationRequired).length,
    evidenceCollectionRequired: rules.filter((rule) => rule.evidenceCollectionRequired).length,
  };
  const report = {
    schemaVersion: '1.0.0',
    reportId: 'product-center-business-rule-time-context-review',
    scope: 'generated-evidence',
    status: summary.evidenceCollectionRequired === 0 ? 'complete' : 'evidence-collection-required',
    purpose: '自动登记正式规则的时间证据和生效上下文缺口；优先从规则、收据和发布记录采集，不要求人工重复确认元数据。',
    source: {
      lifecyclePath: 'Merchant Center UITest/contracts/product-center/business-rules/generated/product-center-business-rule-lifecycle-snapshot.json',
      lifecycleFingerprint: lifecycle.fingerprint,
    },
    summary,
    rules,
    executionImpact: {
      existingPassedCasesInvalidated: false,
      rerunCaseIds: [],
      moduleDeliveryBlocked: false,
    },
    evidenceArtifact: {
      path: 'deliverables/test-plan-governance/product-center-business-rule-time-context-evidence.json',
      fingerprint: evidenceArtifact.fingerprint,
      summary: evidenceArtifact.summary,
    },
    guardrails: {
      missingEvidenceMayNotBeInferred: true,
      reportMayNotModifyRules: true,
      reportMayNotAuthorizeExecution: true,
      contextStatusRequiresEvidence: true,
      timeOrderValidated: true,
      explicitContextMayNotBeEmpty: true,
    },
  };
  const withFingerprint = { ...report, fingerprint: sha256(stableStringify(report)), generatedAt: new Date().toISOString() };
  fs.mkdirSync(outputRoot, { recursive: true });
  fs.writeFileSync(outputJsonPath, `${JSON.stringify(withFingerprint, null, 2)}\n`, 'utf8');
  fs.writeFileSync(outputMarkdownPath, renderMarkdown(withFingerprint), 'utf8');
  return { ...withFingerprint, outputJsonPath, outputMarkdownPath };
}

function renderMarkdown(report: any): string {
  return [
    '# 商品中心正式业务规则时间与生效上下文待确认清单',
    '',
    `- 状态：${report.status}`,
    `- 正式规则：${report.summary.totalRules}；时间完整/部分/未知：${report.summary.timeComplete}/${report.summary.timePartial}/${report.summary.timeUnknown}`,
    `- 上下文已声明/缺失/元数据不一致：${report.summary.contextDeclared}/${report.summary.contextMissing}/${report.summary.contextMetadataInconsistent}`,
    `- 人工确认：${report.summary.humanConfirmationRequired}；自动证据收集：${report.summary.evidenceCollectionRequired}`,
    '',
    '| 规则 | 生效版本 | 审批时间 | 时间证据 | 时间缺失字段 | 上下文证据 | 已填上下文字段 |',
    '|---|---|---|---|---|---|---|',
    ...report.rules.map((rule: any) => `| ${rule.ruleId} | ${rule.effectiveVersion ?? '-'} | ${rule.approvalAt ?? '-'} | ${rule.validatedTimeStatus} | ${rule.missingTimeFields.join('、') || '无'} | ${rule.contextEvidenceStatus} | ${rule.populatedContextFields.join('、') || '无'} |`),
    '',
    '处理要求：系统自动从规则、标准收据和发布记录补采时间/上下文；缺少来源时标记证据缺口，不要求用户确认、不修改规则语义、不触发重跑、不授权业务执行。',
    '',
  ].join('\n');
}

function sha256(value: string): string { return createHash('sha256').update(value).digest('hex'); }

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

if (require.main === module) {
  try {
    const report = buildProductCenterBusinessRuleTimeContextReview();
    process.stdout.write(`${JSON.stringify({ status: report.status, summary: report.summary, output: report.outputJsonPath })}\n`);
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
