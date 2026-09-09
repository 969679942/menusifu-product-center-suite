import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { loadCurrentProductCenterBusinessRuleLifecycleSnapshot } from '../scripts/build-product-center-business-rule-lifecycle-snapshot';

type ExecutionRecord = {
  caseId?: string;
  status?: string;
  evidenceStatus?: string;
  recordedAt?: string;
  runId?: string;
  evidencePath?: string | null;
  executionContextFingerprint?: string | null;
  applicationVersionFingerprint?: string | null;
  implementationFingerprint?: string | null;
  caseFingerprint?: string | null;
  receiptEvidenceFingerprint?: string | null;
  evidenceFileFingerprint?: string | null;
};

export type ProductCenterRuleTimeContextEvidence = {
  ruleId: string;
  sourceFingerprints: Array<{ path: string; sha256: string }>;
  timestamps: {
    createdAt: string | null;
    changedAt: string | null;
    effectiveFrom: string | null;
    lastVerifiedAt: string | null;
  };
  effectiveVersion: string | null;
  effectiveVersionKind: 'iso-timestamp' | 'logical-version' | 'missing';
  context: {
    environmentIds: string[];
    tenantIds: string[];
    roleIds: string[];
    locales: string[];
    routes: string[];
    featureFlags: string[];
    executionContextFingerprints: string[];
    status: 'explicit' | 'fingerprint-only' | 'missing';
  };
  receipts: Array<{
    caseId: string;
    runId: string | null;
    recordedAt: string;
    evidencePath: string;
    executionContextFingerprint: string | null;
    applicationVersionFingerprint: string | null;
    implementationFingerprint: string | null;
    caseFingerprint: string | null;
    receiptEvidenceFingerprint: string | null;
    evidenceFileFingerprint: string | null;
  }>;
  missingFields: string[];
  diagnostics: string[];
  collectionMode: 'automated-source-and-receipt-scan';
};

export type ProductCenterRuleTimeContextEvidenceArtifact = {
  schemaVersion: '1.0.0';
  reportId: 'product-center-business-rule-time-context-evidence';
  scope: 'generated-evidence';
  generatedAt: string;
  lifecycleFingerprint: string;
  source: {
    confirmationsPath: string;
    formalBindingsPath: string;
    executionIndexPath: string;
  };
  summary: {
    totalRules: number;
    changedAtCollected: number;
    lastVerifiedAtCollected: number;
    completeTimeRecords: number;
    explicitContextRecords: number;
    fingerprintOnlyContextRecords: number;
    missingContextRecords: number;
    humanConfirmationRequired: 0;
    unresolvedEvidenceRecords: number;
  };
  rules: ProductCenterRuleTimeContextEvidence[];
  guardrails: {
    semanticRuleFingerprintChanged: false;
    reportMayModifyRules: false;
    reportMayAuthorizeExecution: false;
    missingEvidenceMayBeInferred: false;
    metadataDoesNotRequireHumanReconfirmation: true;
  };
  fingerprint: string;
};

const projectRoot = path.resolve(__dirname, '..');
const workspaceRoot = path.resolve(projectRoot, '..');
const confirmationsPath = path.join(projectRoot, 'contracts/product-center/reviews/product-center-item-rule-confirmations.json');
const formalBindingsPath = path.join(projectRoot, 'contracts/product-center/business-rules/product-center-item-formal-rule-bindings.json');
const executionIndexPath = path.join(projectRoot, 'deliverables/system-test-platform/execution-index.json');
const outputPath = path.join(workspaceRoot, 'deliverables/test-plan-governance/product-center-business-rule-time-context-evidence.json');
const outputMarkdownPath = path.join(workspaceRoot, 'deliverables/test-plan-governance/product-center-business-rule-time-context-evidence.md');
const relative = (filePath: string) => path.relative(projectRoot, filePath).replace(/\\/g, '/');

export function buildProductCenterBusinessRuleTimeContextEvidence(): ProductCenterRuleTimeContextEvidenceArtifact {
  const lifecycle = loadCurrentProductCenterBusinessRuleLifecycleSnapshot();
  const confirmations = readJson<{ confirmations?: Array<Record<string, unknown>> }>(confirmationsPath).confirmations ?? [];
  const bindings = readJson<{ bindings?: Array<Record<string, unknown>> }>(formalBindingsPath).bindings ?? [];
  const executionRecords = readJson<{ records?: ExecutionRecord[] }>(executionIndexPath).records ?? [];
  const sourceFingerprints = [confirmationsPath, formalBindingsPath, executionIndexPath].map((filePath) => ({
    path: relative(filePath),
    sha256: sha256(fs.readFileSync(filePath)),
  }));
  const rules: ProductCenterRuleTimeContextEvidence[] = lifecycle.rules.map((rule) => {
    const confirmation = confirmations.find((item) => item.ruleId === rule.ruleId);
    const binding = bindings.find((item) => item.ruleId === rule.ruleId);
    const linkedCaseIds = new Set(rule.linkedCaseIds);
    const receipts = executionRecords
      .filter((record) => linkedCaseIds.has(record.caseId ?? '')
        && record.status === 'passed'
        && record.evidenceStatus === 'complete'
        && typeof record.recordedAt === 'string'
        && Number.isFinite(Date.parse(record.recordedAt))
        && typeof record.evidencePath === 'string'
        && Boolean(record.receiptEvidenceFingerprint)
        && Boolean(record.evidenceFileFingerprint)
        && Boolean(record.executionContextFingerprint))
      .sort((left, right) => String(right.recordedAt).localeCompare(String(left.recordedAt)))
      .filter((record, index, all) => all.findIndex((item) => item.caseId === record.caseId) === index)
      .map((record) => ({
        caseId: record.caseId!,
        runId: record.runId ?? null,
        recordedAt: record.recordedAt!,
        evidencePath: record.evidencePath!,
        executionContextFingerprint: record.executionContextFingerprint ?? null,
        applicationVersionFingerprint: record.applicationVersionFingerprint ?? null,
        implementationFingerprint: record.implementationFingerprint ?? null,
        caseFingerprint: record.caseFingerprint ?? null,
        receiptEvidenceFingerprint: record.receiptEvidenceFingerprint ?? null,
        evidenceFileFingerprint: record.evidenceFileFingerprint ?? null,
      }));
    const suppliedGovernance = (binding?.governance ?? confirmation?.governance ?? {}) as Record<string, unknown>;
    const changedAt = typeof suppliedGovernance.changedAt === 'string' && isIso(suppliedGovernance.changedAt)
      ? suppliedGovernance.changedAt
      : null;
    const lastVerifiedAt = receipts[0]?.recordedAt ?? null;
    const effectiveVersion = typeof rule.effectiveVersion === 'string' ? rule.effectiveVersion : null;
    const effectiveVersionKind = effectiveVersion === null
      ? 'missing'
      : isIso(effectiveVersion) ? 'iso-timestamp' : 'logical-version';
    const executionContextFingerprints = [...new Set(receipts
      .map((receipt) => receipt.executionContextFingerprint)
      .filter((value): value is string => Boolean(value)))];
    const missingFields = [
      ...(!changedAt ? ['changedAt'] : []),
      'createdAt',
      ...(!isIso(effectiveVersion) ? ['effectiveFrom'] : []),
      ...(!lastVerifiedAt ? ['lastVerifiedAt'] : []),
      ...(executionContextFingerprints.length === 0 ? ['effectiveContext'] : []),
    ];
    const diagnostics = [
      ...(changedAt ? [] : ['CHANGED_AT_SOURCE_NOT_FOUND']),
      'CREATED_AT_SOURCE_NOT_FOUND',
      ...(!isIso(effectiveVersion) ? ['EFFECTIVE_FROM_REQUIRES_RELEASE_TIMESTAMP'] : []),
      ...(lastVerifiedAt ? [] : ['CURRENT_COMPLETE_RECEIPT_NOT_FOUND']),
      ...(executionContextFingerprints.length > 0
        ? ['EXECUTION_CONTEXT_DETAILS_NOT_EMITTED_FINGERPRINT_ONLY']
        : ['EXECUTION_CONTEXT_SOURCE_NOT_FOUND']),
    ];
    return {
      ruleId: rule.ruleId,
      sourceFingerprints,
      timestamps: {
        createdAt: null,
        changedAt,
        effectiveFrom: isIso(effectiveVersion) ? effectiveVersion : null,
        lastVerifiedAt,
      },
      effectiveVersion,
      effectiveVersionKind,
      context: {
        environmentIds: [],
        tenantIds: [],
        roleIds: [],
        locales: [],
        routes: [],
        featureFlags: [],
        executionContextFingerprints,
        status: executionContextFingerprints.length > 0 ? 'fingerprint-only' : 'missing',
      },
      receipts,
      missingFields,
      diagnostics,
      collectionMode: 'automated-source-and-receipt-scan',
    };
  });
  const summary = {
    totalRules: rules.length,
    changedAtCollected: rules.filter((rule) => Boolean(rule.timestamps.changedAt)).length,
    lastVerifiedAtCollected: rules.filter((rule) => Boolean(rule.timestamps.lastVerifiedAt)).length,
    completeTimeRecords: rules.filter((rule) => rule.missingFields.every((field) => !['createdAt', 'changedAt', 'effectiveFrom', 'lastVerifiedAt'].includes(field))).length,
    explicitContextRecords: rules.filter((rule) => rule.context.status === 'explicit').length,
    fingerprintOnlyContextRecords: rules.filter((rule) => rule.context.status === 'fingerprint-only').length,
    missingContextRecords: rules.filter((rule) => rule.context.status === 'missing').length,
    humanConfirmationRequired: 0 as const,
    unresolvedEvidenceRecords: rules.filter((rule) => rule.missingFields.length > 0).length,
  };
  const unsigned = {
    schemaVersion: '1.0.0' as const,
    reportId: 'product-center-business-rule-time-context-evidence' as const,
    scope: 'generated-evidence' as const,
    generatedAt: new Date().toISOString(),
    lifecycleFingerprint: lifecycle.fingerprint,
    source: {
      confirmationsPath: relative(confirmationsPath),
      formalBindingsPath: relative(formalBindingsPath),
      executionIndexPath: relative(executionIndexPath),
    },
    summary,
    rules,
    guardrails: {
      semanticRuleFingerprintChanged: false as const,
      reportMayModifyRules: false as const,
      reportMayAuthorizeExecution: false as const,
      missingEvidenceMayBeInferred: false as const,
      metadataDoesNotRequireHumanReconfirmation: true as const,
    },
  };
  const artifact = { ...unsigned, fingerprint: sha256(stableStringify(unsigned)) };
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(artifact, null, 2)}\n`, 'utf8');
  fs.writeFileSync(outputMarkdownPath, renderMarkdown(artifact), 'utf8');
  return artifact;
}

function renderMarkdown(artifact: ProductCenterRuleTimeContextEvidenceArtifact): string {
  const rows = artifact.rules.map((rule) => `| ${rule.ruleId} | ${rule.timestamps.changedAt ?? '-'} | ${rule.timestamps.lastVerifiedAt ?? '-'} | ${rule.effectiveVersionKind} | ${rule.context.status} | ${rule.receipts.length} | ${rule.missingFields.join('、') || '无'} |`);
  return [
    '# 商品中心业务规则时间与生效上下文证据登记',
    '',
    `- 规则数：${artifact.summary.totalRules}`,
    `- 已自动采集 changedAt：${artifact.summary.changedAtCollected}`,
    `- 已自动采集 lastVerifiedAt：${artifact.summary.lastVerifiedAtCollected}`,
    `- 上下文：显式 ${artifact.summary.explicitContextRecords}；仅指纹 ${artifact.summary.fingerprintOnlyContextRecords}；缺失 ${artifact.summary.missingContextRecords}`,
    `- 人工确认：${artifact.summary.humanConfirmationRequired}`,
    '',
    '| 规则 | 变更时间 | 最近验证 | 生效版本类型 | 上下文证据 | 收据数 | 未解决字段 |',
    '|---|---|---|---|---|---:|---|',
    ...rows,
    '',
    '说明：本登记只记录从确认文件、正式绑定和标准执行索引采集到的证据，不写回业务规则，不改变规则指纹，不授权执行。创建时间、可解析生效时间和上下文明细缺少权威来源时保留为缺口。',
    '',
  ].join('\n');
}

function readJson<T>(filePath: string): T { return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T; }
function isIso(value: unknown): value is string {
  return typeof value === 'string' && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
}
function sha256(value: string | Buffer): string { return createHash('sha256').update(value).digest('hex'); }
function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`).join(',')}}`;
  return JSON.stringify(value);
}

if (require.main === module) {
  const artifact = buildProductCenterBusinessRuleTimeContextEvidence();
  process.stdout.write(`${JSON.stringify({ output: outputPath, summary: artifact.summary })}\n`);
}
