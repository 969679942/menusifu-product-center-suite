import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import {
  findAmbiguousDownstreamPhrases,
  validateBusinessRuleDownstreamContract,
} from '../automation/system-test/business-rule-downstream-contract';
import { loadCurrentProductCenterBusinessRuleLifecycleSnapshot } from './build-product-center-business-rule-lifecycle-snapshot';

const projectRoot = path.resolve(__dirname, '..');
const workspaceRoot = path.resolve(projectRoot, '..');
const outputRoot = path.join(workspaceRoot, 'deliverables/test-plan-governance');
const jsonPath = path.join(outputRoot, 'product-center-business-rule-language-audit.json');
const markdownPath = path.join(outputRoot, 'product-center-business-rule-language-audit.md');

export function auditProductCenterBusinessRuleLanguage() {
  const lifecycle = loadCurrentProductCenterBusinessRuleLifecycleSnapshot();
  const findings = lifecycle.rules.flatMap((rule) => {
    const text = [rule.statement, ...rule.semantics.actions, ...rule.semantics.outcomes, ...rule.semantics.sideEffects].join('\n');
    const phrases = findAmbiguousDownstreamPhrases(text);
    if (phrases.length === 0) return [];
    const contracts = rule.semantics.downstreamSyncContracts ?? [];
    const contractErrors = contracts.flatMap(validateBusinessRuleDownstreamContract);
    return [{
      ruleId: rule.ruleId,
      phrases,
      structuredContractIds: contracts.map((contract) => contract.contractId),
      disposition: contracts.length > 0 && contractErrors.length === 0 ? 'guarded-by-structured-contract' as const : 'blocked' as const,
      contractErrors,
    }];
  });
  const unguarded = findings.filter((item) => item.disposition === 'blocked');
  const report = {
    schemaVersion: '1.0.0',
    reportId: 'product-center-business-rule-language-audit',
    scope: 'generated-evidence',
    status: unguarded.length === 0 ? 'pass' : 'blocked',
    purpose: '扫描正式规则中的模糊下游同步语义；有结构化契约时自动解释，无契约时在生成/审核前阻断。',
    source: {
      lifecyclePath: 'Merchant Center UITest/contracts/product-center/business-rules/generated/product-center-business-rule-lifecycle-snapshot.json',
      lifecycleFingerprint: lifecycle.fingerprint,
    },
    summary: {
      formalRules: lifecycle.rules.length,
      rulesWithAmbiguousPhrase: findings.length,
      guardedRules: findings.filter((item) => item.disposition === 'guarded-by-structured-contract').length,
      unguardedRules: unguarded.length,
      humanReviewRequired: 0,
    },
    findings,
    guardrails: {
      ambiguousPhraseMayNotEnterHumanQueueWithoutContext: true,
      structuredContractRequiredForAutoPass: true,
      reportMayNotAuthorizeBusinessExecution: true,
      existingBusinessResultsUnchanged: true,
    },
  };
  const withFingerprint = { ...report, fingerprint: sha256(stableStringify(report)), generatedAt: new Date().toISOString() };
  fs.mkdirSync(outputRoot, { recursive: true });
  fs.writeFileSync(jsonPath, `${JSON.stringify(withFingerprint, null, 2)}\n`, 'utf8');
  fs.writeFileSync(markdownPath, renderMarkdown(withFingerprint), 'utf8');
  return { ...withFingerprint, jsonPath, markdownPath };
}

function renderMarkdown(report: any): string {
  return [
    '# 商品中心业务规则模糊语义审计', '',
    `- 状态：${report.status}`,
    `- 正式规则：${report.summary.formalRules}`,
    `- 含模糊短语：${report.summary.rulesWithAmbiguousPhrase}；结构化契约已兜底：${report.summary.guardedRules}；未兜底阻断：${report.summary.unguardedRules}`,
    `- 人工语义审核：${report.summary.humanReviewRequired}`,
    '', '| 规则 | 模糊短语 | 结构化契约 | 处置 |', '|---|---|---|---|',
    ...report.findings.map((item: any) => `| ${item.ruleId} | ${item.phrases.join('、')} | ${item.structuredContractIds.join('、') || '无'} | ${item.disposition} |`),
    '', '说明：模糊短语不会直接生成“同步下游”人工问题；有契约自动判定，缺契约直接阻断并指出所需字段。', '',
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
    const report = auditProductCenterBusinessRuleLanguage();
    process.stdout.write(`${JSON.stringify({ status: report.status, summary: report.summary, output: report.jsonPath })}\n`);
    if (report.status === 'blocked') process.exitCode = 1;
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}

