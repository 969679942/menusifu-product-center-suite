import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';

const projectRoot = path.resolve(__dirname, '..');
const workspaceRoot = path.resolve(projectRoot, '..');
const policyPath = path.join(projectRoot, 'contracts/product-center/governance/product-center-business-rule-delegated-approval-policy.json');
const preflightPath = path.join(workspaceRoot, 'deliverables/test-plan-governance/product-center-document-rule-batch-preflight.json');
const outputJsonPath = path.join(workspaceRoot, 'deliverables/test-plan-governance/product-center-delegated-rule-approval-plan.json');
const outputMarkdownPath = path.join(workspaceRoot, 'deliverables/test-plan-governance/product-center-delegated-rule-approval-plan.md');

type PreflightRule = {
  ruleId: string;
  statement: string;
  approvalEligible: boolean;
  executionCoverage: 'verified' | 'evidence-remediation-required';
  conflicts: unknown[];
  semanticBlockerCodes: string[];
};

const highRiskPatterns: Array<{ code: string; pattern: RegExp }> = [
  { code: 'MONEY_OR_PRICE_RULE', pattern: /四舍五入|金额计算|价格计算|计价|折扣|税额|退款|结算/u },
  { code: 'PERMISSION_OR_SECURITY_RULE', pattern: /权限|角色|安全|认证/u },
  { code: 'IRREVERSIBLE_DELETE_RULE', pattern: /删除(?:商品|组|子项|记录|明细)|物理删除|不可恢复/u },
  { code: 'CROSS_SYSTEM_SIDE_EFFECT_RULE', pattern: /同步|下发|门店|菜单|终端|POS|跨系统/u },
];

export function buildProductCenterDelegatedRuleApprovalPlan(): string {
  const policy = readJson<any>(policyPath);
  const preflight = readJson<{ fingerprint: string; rules: PreflightRule[] }>(preflightPath);
  const decisions = preflight.rules.map((rule) => {
    const reasonCodes = [
      ...(!rule.approvalEligible ? ['SEMANTIC_APPROVAL_GATE_FAILED'] : []),
      ...(rule.executionCoverage !== 'verified' ? ['CURRENT_COMPLETE_EVIDENCE_REQUIRED'] : []),
      ...(rule.conflicts.length > 0 ? ['EXPLICIT_CONFLICT_REQUIRES_HUMAN'] : []),
      ...highRiskPatterns.filter((item) => item.pattern.test(rule.statement)).map((item) => item.code),
      ...rule.semanticBlockerCodes,
    ];
    const uniqueReasons = unique(reasonCodes);
    return {
      ruleId: rule.ruleId,
      decision: uniqueReasons.length === 0 ? 'delegated-approval-eligible' :
        uniqueReasons.some((code) => code.includes('CONFLICT') || code.includes('MONEY') || code.includes('PERMISSION') || code.includes('DELETE') || code.includes('CROSS_SYSTEM'))
          ? 'human-product-intent-required' : 'automation-evidence-required',
      reasonCodes: uniqueReasons,
    };
  });
  const report = {
    schemaVersion: '1.0.0',
    reportId: 'product-center-delegated-rule-approval-plan',
    generatedAt: new Date().toISOString(),
    scope: 'project-adapter+generated-evidence',
    policyId: policy.policyId,
    policyStatus: policy.status,
    sourcePreflightFingerprint: preflight.fingerprint,
    summary: {
      total: decisions.length,
      delegatedApprovalEligible: decisions.filter((item) => item.decision === 'delegated-approval-eligible').length,
      automationEvidenceRequired: decisions.filter((item) => item.decision === 'automation-evidence-required').length,
      humanProductIntentRequired: decisions.filter((item) => item.decision === 'human-product-intent-required').length,
    },
    decisions,
    effects: {
      formalRulesModified: false,
      businessExecutionStarted: false,
      existingPassedResultsInvalidated: false,
      nextAction: '符合条件的规则可由 AI 依据完整当前证据代理确认；其余先自动补证据，仅产品意图冲突提交人工。',
    },
  };
  const signed = { ...report, fingerprint: sha256(stableJson(report)) };
  writeJson(outputJsonPath, signed);
  writeText(outputMarkdownPath, renderMarkdown(signed));
  return outputJsonPath;
}

function renderMarkdown(report: any): string {
  return [
    '# 商品中心 AI 代理规则确认计划', '',
    `- 可代理确认：${report.summary.delegatedApprovalEligible}`,
    `- 先自动补证据：${report.summary.automationEvidenceRequired}`,
    `- 仍需产品人工决定：${report.summary.humanProductIntentRequired}`,
    '- 代理确认只认当前现网事实，不替产品臆造“应该如何”；不会自动启动会修改业务数据的测试。', '',
    '| 规则 | 处置 | 原因 |', '|---|---|---|',
    ...report.decisions.map((item: any) => `| ${item.ruleId} | ${item.decision} | ${item.reasonCodes.join('、') || '完整当前证据且低风险'} |`),
    '',
  ].join('\n');
}

function readJson<T>(filePath: string): T { return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T; }
function writeJson(filePath: string, value: unknown): void { fs.mkdirSync(path.dirname(filePath), { recursive: true }); fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8'); }
function writeText(filePath: string, value: string): void { fs.mkdirSync(path.dirname(filePath), { recursive: true }); fs.writeFileSync(filePath, value, 'utf8'); }
function unique(values: readonly string[]): string[] { return [...new Set(values)].sort(); }
function sha256(value: string): string { return createHash('sha256').update(value).digest('hex'); }
function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`).join(',')}}`;
  return JSON.stringify(value);
}

if (require.main === module) {
  try { process.stdout.write(`${buildProductCenterDelegatedRuleApprovalPlan()}\n`); }
  catch (error) { process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`); process.exitCode = 1; }
}
