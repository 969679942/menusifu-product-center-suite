import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import {
  projectBusinessRuleGovernance,
  queryBusinessRuleGovernance,
  type BusinessRuleGovernanceEvent,
} from '../../../Test Automation Platform/src/automation/system-test/business-rule-governance';
import { loadCurrentProductCenterBusinessRuleLifecycleSnapshot } from './build-product-center-business-rule-lifecycle-snapshot';

const projectRoot = path.resolve(__dirname, '..');
const workspaceRoot = path.resolve(projectRoot, '..');
const outputRoot = path.join(workspaceRoot, 'deliverables/test-plan-governance');
const outputJsonPath = path.join(outputRoot, 'product-center-business-rule-governance-operations.json');
const outputMarkdownPath = path.join(outputRoot, 'product-center-business-rule-governance-operations.md');

const operationDefinitions = [
  {
    operation: 'candidate-rejected', priority: 'P1', status: 'contract-covered',
    purpose: '将候选规则驳回并持久化驳回原因，支持按 ruleId 和 approvalStatus 查询。',
    required: ['eventId', 'ruleId', 'ruleFingerprint', 'revision', 'actor', 'reason', 'occurredAt'],
  },
  {
    operation: 'candidate-held', priority: 'P1', status: 'contract-covered',
    purpose: '将候选规则挂起并保留待处理原因，不进入正式规则或执行计划。',
    required: ['eventId', 'ruleId', 'ruleFingerprint', 'revision', 'actor', 'reason', 'occurredAt'],
  },
  {
    operation: 'rule-retired', priority: 'P0', status: 'contract-covered',
    purpose: '以 effectiveTo 和审计事件使正式规则停止生效，保留历史版本。',
    required: ['effectiveTo', 'actor', 'reason', 'occurredAt'],
  },
  {
    operation: 'rule-restored', priority: 'P1', status: 'contract-covered',
    purpose: '将已废弃规则恢复为正式状态，产生可追溯恢复事件。',
    required: ['actor', 'reason', 'occurredAt'],
  },
  {
    operation: 'rule-rolled-back', priority: 'P1', status: 'contract-covered',
    purpose: '通过新审计事件引用旧 revision/fingerprint 恢复语义，不覆盖历史记录。',
    required: ['targetRevision', 'targetRuleFingerprint', 'resultingRevision', 'resultingRuleFingerprint'],
  },
  {
    operation: 'approval-revoked', priority: 'P1', status: 'contract-covered',
    purpose: '撤回已批准规则的批准资格，阻止旧批准继续被消费。',
    required: ['actor', 'reason', 'occurredAt'],
  },
  {
    operation: 'approval-expired', priority: 'P1', status: 'contract-covered',
    purpose: '在 expiresAt 不晚于发生时间时记录批准过期并阻止复用。',
    required: ['expiresAt', 'actor', 'reason', 'occurredAt'],
  },
] as const;

export function buildProductCenterBusinessRuleGovernanceOperations() {
  const lifecycle = loadCurrentProductCenterBusinessRuleLifecycleSnapshot();
  const examples = buildIsolatedExamples();
  const report = {
    schemaVersion: '1.0.0',
    reportId: 'product-center-business-rule-governance-operations',
    scope: 'generated-evidence',
    status: 'contract-ready',
    purpose: '登记业务规则驳回/挂起、废弃/恢复、回滚和批准撤回/过期的公共审计操作；示例使用隔离夹具，不改变商品中心正式规则。',
    source: {
      lifecyclePath: 'Merchant Center UITest/contracts/product-center/business-rules/generated/product-center-business-rule-lifecycle-snapshot.json',
      lifecycleFingerprint: lifecycle.fingerprint,
      publicContract: 'Test Automation Platform/src/automation/system-test/business-rule-governance.ts',
    },
    summary: {
      formalRulesInspected: lifecycle.rules.length,
      supportedOperations: operationDefinitions.length,
      contractCoveredOperations: operationDefinitions.filter((item) => item.status === 'contract-covered').length,
      currentFormalRulesMutated: 0,
      currentCasesRerun: 0,
    },
    operations: operationDefinitions,
    isolatedExamples: examples,
    guardrails: {
      appendOnly: true,
      queryIsProjectionOnly: true,
      formalRuleSemanticsMutated: false,
      operationMayAuthorizeBusinessExecution: false,
      operationMayChangeCaseState: false,
      retiredRuleRequiresEffectiveTo: true,
      rollbackCreatesNewAuditRevision: true,
      expiredApprovalRequiresExpiryEvidence: true,
      consumersMustApplyEligibilityGate: true,
      rollbackTargetMustExistInHistory: true,
    },
    executionImpact: {
      existingPassedCasesInvalidated: false,
      rerunCaseIds: [],
      moduleDeliveryBlocked: false,
      businessExecutionStarted: false,
    },
  };
  const withFingerprint = { ...report, fingerprint: sha256(stableStringify(report)), generatedAt: new Date().toISOString() };
  fs.mkdirSync(outputRoot, { recursive: true });
  fs.writeFileSync(outputJsonPath, `${JSON.stringify(withFingerprint, null, 2)}\n`, 'utf8');
  fs.writeFileSync(outputMarkdownPath, renderMarkdown(withFingerprint), 'utf8');
  return { ...withFingerprint, outputJsonPath, outputMarkdownPath };
}

function buildIsolatedExamples() {
  const fp = 'a'.repeat(64);
  const formalRule = {
    ruleId: 'fixture:formal-rule', ruleFingerprint: fp, revision: 1,
    approval: { decision: 'approved' as const },
    governance: { effectiveTo: null },
    scope: { applicationId: 'fixture', businessDomainId: 'fixture', entityTypes: ['item'], operationKeys: [], channels: [] },
    schemaVersion: '1.0.0' as const, ruleType: 'normative' as const, statement: '夹具规则', sourceRegistry: [], sourceFingerprint: fp,
    effectiveVersion: 'fixture-v1', effectiveContext: { environmentIds: [], tenantIds: [], roleIds: [], locales: [], routes: [], featureFlags: [] },
    supersedes: [], conflictsWith: [], linkedCaseIds: [], linkedBindingIds: [], verificationStatus: 'verified' as const,
    semantics: { preconditions: [], entities: ['item'], actions: [], stateTransitions: [], constraints: [], outcomes: ['ok'], sideEffects: [], assertionSurfaces: [], cleanup: { policyStatus: 'verified' as const, required: false, apiZeroResidueRequired: false, uiZeroResidueRequired: false } },
    previousRuleFingerprint: null,
  } as any;
  const event = (eventType: BusinessRuleGovernanceEvent['eventType'], extra: Partial<BusinessRuleGovernanceEvent> = {}): BusinessRuleGovernanceEvent => ({
    eventId: `fixture:${eventType}`,
    eventType, ruleId: formalRule.ruleId, ruleFingerprint: fp, revision: 1,
    occurredAt: '2026-08-30T00:00:00.000Z', actor: 'fixture-owner', reason: '合同测试夹具', ...extra,
  });
  const held = projectBusinessRuleGovernance([event('candidate-held')]);
  const retired = projectBusinessRuleGovernance([event('rule-retired', { effectiveTo: '2026-08-31T00:00:00.000Z' })], [formalRule]);
  const restored = projectBusinessRuleGovernance([
    event('rule-retired', { effectiveTo: '2026-08-31T00:00:00.000Z' }),
    event('rule-restored', { occurredAt: '2026-09-01T00:00:00.000Z' }),
  ], [formalRule]);
  const rolledBack = projectBusinessRuleGovernance([
    event('rule-rolled-back', { targetRevision: 1, targetRuleFingerprint: fp, resultingRevision: 3, resultingRuleFingerprint: 'c'.repeat(64), ruleFingerprint: 'b'.repeat(64), revision: 2 }),
  ], [{ ...formalRule, revision: 2, ruleFingerprint: 'b'.repeat(64), previousRuleFingerprint: fp }]);
  const revoked = projectBusinessRuleGovernance([event('approval-revoked')], [formalRule]);
  const expired = projectBusinessRuleGovernance([event('approval-expired', { expiresAt: '2026-08-29T00:00:00.000Z' })], [formalRule]);
  return {
    persistedHoldQuery: queryBusinessRuleGovernance(held, { approvalStatus: 'held' }).map((item) => item.ruleId),
    retiredStatus: retired.records[0]?.lifecycleStatus ?? null,
    restoredStatus: restored.records[0]?.lifecycleStatus ?? null,
    rollbackRevision: rolledBack.records[0]?.currentRevision ?? null,
    revokedStatus: revoked.records[0]?.approvalStatus ?? null,
    expiredStatus: expired.records[0]?.approvalStatus ?? null,
  };
}

function renderMarkdown(report: any): string {
  return [
    '# 商品中心业务规则治理操作合同', '',
    `- 状态：${report.status}`,
    `- 正式规则检查：${report.summary.formalRulesInspected}；支持操作：${report.summary.supportedOperations}；合同覆盖：${report.summary.contractCoveredOperations}`,
    `- 当前正式规则变更：${report.summary.currentFormalRulesMutated}；当前用例重跑：${report.summary.currentCasesRerun}`,
    '', '| 操作 | 级别 | 状态 | 目的 |', '|---|---|---|---|',
    ...report.operations.map((item: any) => `| ${item.operation} | ${item.priority} | ${item.status} | ${item.purpose} |`),
    '', '隔离夹具验证：',
    `- held 查询：${report.isolatedExamples.persistedHoldQuery.join('、') || '无'}`,
    `- retire/restore：${report.isolatedExamples.retiredStatus} → ${report.isolatedExamples.restoredStatus}`,
    `- rollback revision：${report.isolatedExamples.rollbackRevision}`,
    `- revoke/expire：${report.isolatedExamples.revokedStatus} / ${report.isolatedExamples.expiredStatus}`,
    '', '说明：该合同只提供治理记录和查询能力，不修改正式规则、不改变用例状态、不授权业务执行。', '',
  ].join('\n');
}

function sha256(value: string): string { return createHash('sha256').update(value).digest('hex'); }
function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`).join(',')}}`;
  return JSON.stringify(value);
}

if (require.main === module) {
  try {
    const report = buildProductCenterBusinessRuleGovernanceOperations();
    process.stdout.write(`${JSON.stringify({ status: report.status, output: report.outputJsonPath })}\n`);
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
