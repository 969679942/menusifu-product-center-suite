import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';

const projectRoot = path.resolve(__dirname, '..');
const legacyPath = path.join(projectRoot, 'contracts/product-center/business-rules/product-center-item-legacy-rule-baseline.json');
const registryPath = path.join(projectRoot, 'contracts/product-center/business-rules/generated/product-center-item-rule-registry.json');
const lifecyclePath = path.join(projectRoot, 'contracts/product-center/business-rules/generated/product-center-business-rule-lifecycle-snapshot.json');
const outputPath = path.join(projectRoot, 'contracts/product-center/reviews/product-center-historical-business-rule-migration-acceptance.json');
const markdownPath = path.join(projectRoot, 'contracts/product-center/reviews/product-center-historical-business-rule-migration-acceptance.md');

type LegacyBinding = {
  bindingId: string;
  ruleId: string;
  statement: string;
  authority?: { sourcePath?: string; fingerprint?: string };
};
type LegacyRegistryEntry = { bindingId: string; authority?: { sourcePath?: string; fingerprint?: string } };

type FormalRule = {
  ruleId: string;
  ruleFingerprint: string;
  linkedCaseIds: string[];
};

const dispositionByRuleId: Record<string, {
  disposition: 'resolved-by-formal-rule' | 'deprecated-by-product-confirmation';
  replacementRuleIds: string[];
  rationale: string;
}> = {
  'BR-ITEM-CATEGORY-LEAF': {
    disposition: 'resolved-by-formal-rule',
    replacementRuleIds: ['BR-ITEM-CATEGORY-LEAF-SELECTION', 'BR-ITEM-CATEGORY-DIRECT-PARENT-CREATE'],
    rationale: '历史叶子分类要求已拆分为有二级分类必须选叶子、无二级分类可直接选一级分类两条正式规则；保留历史来源，不升格。',
  },
  'BR-ITEM-010': {
    disposition: 'resolved-by-formal-rule',
    replacementRuleIds: ['BR-ITEM-010'],
    rationale: '历史统一判重语义已由当前正式规则替代，当前按同一商户内商品类型判重且分类不参与判重。',
  },
  'BR-ITEM-INDUSTRY-INHERITANCE': {
    disposition: 'deprecated-by-product-confirmation',
    replacementRuleIds: [],
    rationale: '行业商品库继承规则及关联规范用例已按产品确认废弃；历史来源保留，不重新注册为可执行规则。',
  },
};

export function buildProductCenterHistoricalBusinessRuleMigrationAcceptance() {
  const legacy = readJson<{ bindings: LegacyBinding[] }>(legacyPath);
  const registry = readJson<{ legacyRules: LegacyRegistryEntry[] }>(registryPath);
  const registryByBinding = new Map(registry.legacyRules.map((item) => [item.bindingId, item]));
  const lifecycle = readJson<{ rules: FormalRule[] }>(lifecyclePath);
  const formalById = new Map(lifecycle.rules.map((rule) => [rule.ruleId, rule]));
  const acceptedAt = '2026-08-31T00:00:00+08:00';
  const approvedBy = '金将军';
  const entries = legacy.bindings.map((binding) => {
    const decision = dispositionByRuleId[binding.ruleId];
    if (!decision) throw new Error(`HISTORICAL_RULE_DISPOSITION_MISSING:${binding.ruleId}`);
    const replacements = decision.replacementRuleIds.map((ruleId) => {
      const rule = formalById.get(ruleId);
      if (!rule) throw new Error(`HISTORICAL_RULE_REPLACEMENT_MISSING:${binding.ruleId}:${ruleId}`);
      return { ruleId, ruleFingerprint: rule.ruleFingerprint };
    });
    const linkedCaseIds = [...new Set(replacements.flatMap((item) => formalById.get(item.ruleId)?.linkedCaseIds ?? []))].sort();
    const authority = registryByBinding.get(binding.bindingId)?.authority;
    if (!authority?.sourcePath || !/^[a-f0-9]{64}$/.test(authority.fingerprint ?? '')) {
      throw new Error(`HISTORICAL_RULE_SOURCE_FINGERPRINT_MISSING:${binding.ruleId}`);
    }
    return {
      bindingId: binding.bindingId,
      ruleId: binding.ruleId,
      historicalStatement: binding.statement,
      historicalSourcePath: authority.sourcePath,
      historicalSourceFingerprint: authority.fingerprint,
      disposition: decision.disposition,
      replacementRules: replacements,
      linkedCaseIds,
      approvedBy,
      acceptedAt,
      rationale: decision.rationale,
    };
  });
  const withoutFingerprint = {
    schemaVersion: '1.0.0' as const,
    acceptanceId: 'product-center-historical-business-rule-migration-acceptance-20260831',
    applicationId: 'merchant-center',
    businessDomainId: 'product-center',
    approvedBy,
    acceptedAt,
    entries,
  };
  const receiptFingerprint = sha256(stableJson(withoutFingerprint));
  const artifact = { ...withoutFingerprint, receiptFingerprint };
  writeAtomic(outputPath, `${JSON.stringify(artifact, null, 2)}\n`);
  writeAtomic(markdownPath, renderMarkdown(artifact));
  return artifact;
}

function renderMarkdown(artifact: ReturnType<typeof buildProductCenterHistoricalBusinessRuleMigrationAcceptance>): string {
  return [
    '# 商品中心历史业务规则迁移接受收据', '',
    `- 接受编号：${artifact.acceptanceId}`,
    `- 接受人：${artifact.approvedBy}`,
    `- 接受时间：${artifact.acceptedAt}`,
    `- 收据指纹：${artifact.receiptFingerprint}`,
    '', '| 历史绑定 | 处置 | 替代规则 | 关联用例 |', '|---|---|---|---|',
    ...artifact.entries.map((entry) => `| ${entry.ruleId} | ${entry.disposition} | ${entry.replacementRules.map((rule) => rule.ruleId).join('、') || '无'} | ${entry.linkedCaseIds.join('、') || '无'} |`),
    '', '说明：该收据只接受历史来源处置，不授权历史规则直接执行或覆盖正式规则。', '',
  ].join('\n');
}

function readJson<T>(filePath: string): T { return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T; }
function sha256(value: string): string { return createHash('sha256').update(value).digest('hex'); }
function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`).join(',')}}`;
  }
  return JSON.stringify(value);
}
function writeAtomic(filePath: string, content: string): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.tmp`;
  fs.writeFileSync(temporaryPath, content, 'utf8');
  fs.renameSync(temporaryPath, filePath);
}

if (require.main === module) {
  try {
    const artifact = buildProductCenterHistoricalBusinessRuleMigrationAcceptance();
    process.stdout.write(JSON.stringify({ acceptanceId: artifact.acceptanceId, entries: artifact.entries.length, receiptFingerprint: artifact.receiptFingerprint }) + '\n');
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
