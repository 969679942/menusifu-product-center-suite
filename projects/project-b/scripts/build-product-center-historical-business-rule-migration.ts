import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';

const projectRoot = path.resolve(__dirname, '..');
const workspaceRoot = path.resolve(projectRoot, '..');
const migrationReportPath = path.join(projectRoot, 'adapters/test-automation-platform/reports/merchant-center-migration-closure.json');
const registryPath = path.join(projectRoot, 'contracts/product-center/business-rules/generated/product-center-item-rule-registry.json');
const legacyPath = path.join(projectRoot, 'contracts/product-center/business-rules/product-center-item-legacy-rule-baseline.json');
const acceptancePath = path.join(projectRoot, 'contracts/product-center/reviews/product-center-historical-business-rule-migration-acceptance.json');
const outputPath = path.join(projectRoot, 'output/governance/product-center-historical-business-rule-migration.json');
const markdownPath = path.join(projectRoot, 'output/governance/product-center-historical-business-rule-migration.md');

type LegacyBinding = { bindingId: string; ruleId: string; statement: string; citation: string; sectionHeading: string };

export function buildProductCenterHistoricalBusinessRuleMigration() {
  const migration = readJson<any>(migrationReportPath);
  const registry = readJson<any>(registryPath);
  const legacy = readJson<{ bindings: LegacyBinding[] }>(legacyPath);
  const acceptance = fs.existsSync(acceptancePath) ? readJson<any>(acceptancePath) : null;
  const legacyRules = legacy.bindings.map((binding) => {
    const authority = registry.legacyRules?.find((item: any) => item.bindingId === binding.bindingId)?.authority;
    const base = {
      ...binding,
      historicalSourcePath: authority?.sourcePath ?? null,
      historicalSourceFingerprint: authority?.fingerprint ?? null,
    };
    if (binding.ruleId === 'BR-ITEM-CATEGORY-LEAF') {
      return {
        ...base,
        disposition: 'resolved-by-formal-rule',
        replacementRuleIds: ['BR-ITEM-CATEGORY-LEAF-SELECTION', 'BR-ITEM-CATEGORY-DIRECT-PARENT-CREATE'],
        action: '保留历史来源，不升格；当前正式规则已拆分叶子分类要求与无子级一级分类例外。',
      };
    }
    if (binding.ruleId === 'BR-ITEM-010') {
      return {
        ...base,
        disposition: 'resolved-by-formal-rule',
        replacementRuleIds: ['BR-ITEM-010'],
        action: '已按 2026-08-30 金将军确认迁入当前正式规则；同一商户内按商品类型判重、分类不参与判重，标准/套餐与加料允许跨类型同名。',
      };
    }
    if (binding.ruleId === 'BR-ITEM-INDUSTRY-INHERITANCE') {
      return {
        ...base,
        disposition: 'deprecated-by-product-confirmation',
        replacementRuleIds: [],
        action: '已按 2026-08-30 金将军确认废弃行业商品库规则及继承能力；关联规范用例同步废弃，历史来源保留且不再恢复。',
      };
    }
    return {
      ...base,
      disposition: 'awaiting-confirmation',
      replacementRuleIds: [],
      action: '候选规则仍存在来源或语义歧义，需产品确认后才能转正式。',
    };
  });
  const historicalReferences = (migration.historicalReferenceGaps ?? []).map((gap: any) => {
    const target = String(gap.detail).split(' -> ')[0].replace(/^.*?:\//, '');
    const module = target.includes('标签管理') ? 'tag'
      : target.includes('调味管理') ? 'seasoning'
        : target.includes('组/') ? 'group' : 'item';
    const isXmind = target.toLowerCase().endsWith('.xmind');
    const replacement = isXmind
      ? null
      : target.includes('PRD')
        ? `Merchant Center Info/00-待转换测试方案/来源资料/${path.basename(target).replace(/\\/g, '/')}`
        : module === 'group'
          ? 'Merchant Center Info/00-待转换测试方案/用例库/商品中心-商品管理-组/2.商品中心-商品管理-组-正式测试用例.md'
          : module === 'item'
            ? 'Merchant Center Info/00-待转换测试方案/用例库/商品中心-商品管理-商品/1.商品中心-商品管理-商品-正式测试用例.md'
            : null;
    return {
      source: gap.path,
      target,
      disposition: isXmind ? 'retained-history-no-rebuild' : replacement ? 'replacement-registered' : 'awaiting-source-review',
      replacement,
      action: isXmind
        ? '按治理要求保留缺失历史XMind诊断，不重建、不删除、不冒充当前来源。'
        : replacement
          ? '已登记当前来源替代路径；不直接改写冻结快照，待迁移接受收据后统一切换。'
          : '需要补充可验证替代来源。',
    };
  });
  const report = {
    schemaVersion: '1.0.0',
    reportId: 'product-center-historical-business-rule-migration',
    sourceFingerprint: createHash('sha256').update(JSON.stringify({ migration, registry, legacy })).digest('hex'),
    summary: {
      legacyRules: legacyRules.length,
      legacyResolved: legacyRules.filter((item) => item.disposition === 'resolved-by-formal-rule'
        || item.disposition === 'deprecated-by-product-confirmation').length,
      legacyAwaitingConfirmation: legacyRules.filter((item) => item.disposition === 'awaiting-confirmation').length,
      historicalReferences: historicalReferences.length,
      historicalReplacementRegistered: historicalReferences.filter((item) => item.disposition === 'replacement-registered').length,
      historicalXmindRetained: historicalReferences.filter((item) => item.disposition === 'retained-history-no-rebuild').length,
      candidateRulesAvailable: registry.summary?.candidates ?? 0,
      migrationAcceptance: {
        status: validateAcceptance(acceptance, legacyRules) ? 'accepted' : acceptance ? 'invalid' : 'missing',
        acceptanceId: acceptance?.acceptanceId ?? null,
        approvedBy: acceptance?.approvedBy ?? null,
        acceptedAt: acceptance?.acceptedAt ?? null,
        receiptFingerprint: acceptance?.receiptFingerprint ?? null,
        entryCount: acceptance?.entries?.length ?? 0,
      },
    },
    status: legacyRules.some((item) => item.disposition === 'awaiting-confirmation')
      ? 'in-progress'
      : validateAcceptance(acceptance, legacyRules) ? 'complete' : 'ready-for-migration-acceptance',
    legacyRules,
    historicalReferences,
    guardrails: {
      legacyMayAuthorizeAcceptance: false,
      historicalXmindRebuilt: false,
      frozenSnapshotRewritten: false,
      formalRulesAutoPromoted: false,
    },
    nextActions: validateAcceptance(acceptance, legacyRules)
      ? ['保持历史来源只读保留；后续仅在历史来源或替代规则指纹变化时重新评审。']
      : [
        '迁移负责人审阅 BR-ITEM-010 正式替代关系和行业规则废弃处置后签发逐项迁移接受收据。',
        '保留行业商品规则及关联用例的历史来源，不将其重新注册为当前可执行规则。',
      ],
  };
  writeAtomic(outputPath, `${JSON.stringify(report, null, 2)}\n`);
  writeAtomic(markdownPath, renderMarkdown(report));
  return report;
}

function validateAcceptance(acceptance: any, legacyRules: any[]): boolean {
  if (!acceptance || !Array.isArray(acceptance.entries) || acceptance.entries.length !== legacyRules.length) return false;
  if (!acceptance.approvedBy?.trim() || !acceptance.acceptedAt?.trim() || !/^[a-f0-9]{64}$/.test(acceptance.receiptFingerprint ?? '')) return false;
  const byBinding = new Map(acceptance.entries.map((entry: any) => [entry.bindingId, entry]));
  return legacyRules.every((legacy: any) => {
    const entry = byBinding.get(legacy.bindingId);
    return Boolean(entry)
      && entry.ruleId === legacy.ruleId
      && typeof legacy.historicalSourceFingerprint === 'string'
      && /^[a-f0-9]{64}$/.test(legacy.historicalSourceFingerprint)
      && entry.historicalSourceFingerprint === legacy.historicalSourceFingerprint
      && typeof entry.historicalSourcePath === 'string'
      && entry.historicalSourcePath.length > 0
      && Array.isArray(entry.replacementRules)
      && entry.disposition === legacy.disposition
      && entry.replacementRules.map((rule: any) => rule.ruleId).join('|') === legacy.replacementRuleIds.join('|');
  });
}

function renderMarkdown(report: ReturnType<typeof buildProductCenterHistoricalBusinessRuleMigration>): string {
  return [
    '# 商品中心历史业务规则迁移处置', '',
    `- 状态：${report.status}`,
    `- Legacy规则：${report.summary.legacyRules}，已由正式规则覆盖：${report.summary.legacyResolved}，待确认：${report.summary.legacyAwaitingConfirmation}`,
    `- 历史引用：${report.summary.historicalReferences}，已登记替代路径：${report.summary.historicalReplacementRegistered}，缺失XMind保留诊断：${report.summary.historicalXmindRetained}`,
    '', '## Legacy规则', '',
    ...report.legacyRules.map((item) => `- **${item.ruleId}**：${item.disposition}；${item.action}`),
    '', '## 历史引用', '',
    ...report.historicalReferences.map((item) => `- ${item.target}：${item.disposition}${item.replacement ? ` -> ${item.replacement}` : ''}`),
    '', '说明：本报告不把历史规则直接变成正式规则，也不重建缺失XMind。', '',
  ].join('\n');
}

function readJson<T>(filePath: string): T { return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T; }
function writeAtomic(filePath: string, content: string): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.tmp`;
  fs.writeFileSync(temporaryPath, content, 'utf8');
  fs.renameSync(temporaryPath, filePath);
}

if (require.main === module) {
  try { const report = buildProductCenterHistoricalBusinessRuleMigration(); process.stdout.write(`${JSON.stringify(report.summary)}\n`); }
  catch (error) { process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`); process.exitCode = 1; }
}
