import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {
  buildProductCenterItemCanonicalRelease,
  parseProductCenterXmindItemPlan,
  renderProductCenterCanonicalMarkdown,
  type ProductCenterCanonicalBusinessRuleAssessment,
  type ProductCenterCanonicalCaseOverride,
  type ProductCenterCanonicalSource,
  validateProductCenterCanonicalRelease,
} from '../utils/product-center-canonical-item-test-plan';
import { scanGeneratedArtifacts } from '../utils/product-center-run-safety';
import {
  verifyProductCenterBusinessRuleCitation,
  verifyProductCenterBusinessRuleStatement,
  type ProductCenterSourceCitationVerification,
} from '../utils/product-center-source-citation';
import { buildProductCenterItemRuleRegistryArtifacts } from './build-product-center-item-rule-registry';
import type { ProductCenterRuleRegistry } from '../utils/product-center-rule-evidence-ledger';
import { buildProductCenterItemSourceCoverageArtifacts } from './build-product-center-item-source-coverage';

export function buildProductCenterItemCanonicalArtifacts(options: {
  projectRoot?: string;
  outputRoot?: string;
  observedRoutes?: string[];
} = {}): {
  markdownPath: string;
  releasePath: string;
  bindingsPath: string;
  reportPath: string;
  ruleRegistryPath: string;
  ruleReportPath: string;
  coverageReportPath: string;
} {
  const projectRoot = path.resolve(options.projectRoot ?? path.resolve(__dirname, '..'));
  const outputRoot = path.resolve(options.outputRoot ?? projectRoot);
  const infoRoot = path.resolve(projectRoot, '..', 'Merchant Center Info');
  const xmindPath = path.join(
    infoRoot,
    '00-待转换测试方案',
    '用例库',
    '商品中心-商品管理-商品',
    '1.商品中心-商品管理-商品.xmind',
  );
  const prdPath = path.join(infoRoot, 'PRD与对应测试用例', '1.需求品牌商品与分类.md');
  const businessRulesPath = path.join(infoRoot, '商品中心业务规则.md');
  const observedRoutes = options.observedRoutes ?? ['/pp/brand/list', '/pp/brand/category'];
  const confirmationSourcePath = path.join(
    projectRoot,
    'contracts/product-center/reviews/product-center-item-rule-confirmations.json',
  );
  const caseOverrides = readConfirmedCaseOverrides(confirmationSourcePath);
  const plan = parseProductCenterXmindItemPlan(fs.readFileSync(xmindPath));
  const businessRuleAssessments = buildBusinessRuleAssessments(
    fs.readFileSync(businessRulesPath, 'utf8'),
    businessRulesPath,
  );
  const initialRelease = buildProductCenterItemCanonicalRelease({
    plan,
    sourceFiles: { xmind: xmindPath, prd: prdPath, businessRules: businessRulesPath },
    observedRoutes,
    businessRuleAssessments,
    canonicalIdsByNodeId: itemCanonicalIdsByNodeId,
    caseOverrides,
  });
  const rulePaths = buildProductCenterItemRuleRegistryArtifacts({
    projectRoot,
    outputRoot,
    canonicalRelease: initialRelease,
  });
  const ruleRegistry = JSON.parse(
    fs.readFileSync(rulePaths.registryPath, 'utf8'),
  ) as ProductCenterRuleRegistry;
  const release = buildProductCenterItemCanonicalRelease({
    plan,
    sourceFiles: { xmind: xmindPath, prd: prdPath, businessRules: businessRulesPath },
    observedRoutes,
    businessRuleAssessments,
    canonicalIdsByNodeId: itemCanonicalIdsByNodeId,
    ruleRegistry,
    caseOverrides,
  });
  const validationErrors = validateProductCenterCanonicalRelease(release);
  if (validationErrors.length > 0) {
    throw new Error(`商品 canonical release 校验失败：${validationErrors.join(',')}`);
  }
  const markdown = renderProductCenterCanonicalMarkdown(release);
  if (/^={2,}$/m.test(markdown) || /\d+\.\s+\d+\./.test(markdown)) {
    throw new Error('商品 canonical Markdown 含禁止分隔符或双重编号');
  }

  const markdownPath = path.join(
    outputRoot,
    'contracts/product-center/test-cases/canonical/product-center-item-canonical.md',
  );
  const releasePath = path.join(
    outputRoot,
    'contracts/product-center/test-cases/canonical/product-center-item-canonical-release.json',
  );
  const bindingsPath = path.join(
    outputRoot,
    'contracts/product-center/test-cases/canonical/product-center-item-automation-bindings.json',
  );
  const reportPath = path.join(
    outputRoot,
    'output/test-case-audit/product-center/item-canonical-latest.json',
  );
  const sourceCoverage = {
    xmindVerified: release.cases.filter((item) => item.sources.some((source) =>
      source.kind === 'xmind' && source.verified)).length,
    formalMapped: release.cases.filter((item) => item.claims.some((claim) =>
      claim.formalRuleBindingIds.length > 0)).length,
    legacyMapped: release.cases.filter((item) => item.claims.some((claim) =>
      claim.legacyRuleBindingIds.length > 0)).length,
    pageRoutesObserved: observedRoutes.length,
    legacyAligned: release.cases.filter((item) =>
      item.businessRuleAssessment.disposition === 'legacy-aligned').length,
    legacyPartial: release.cases.filter((item) =>
      item.businessRuleAssessment.disposition === 'legacy-partial').length,
    legacyDiscrepancies: release.cases.filter((item) =>
      item.businessRuleAssessment.disposition === 'legacy-discrepancy').length,
  };
  const fingerprint = createHash('sha256').update(JSON.stringify({
    release,
    markdown,
    sourceCoverage,
  })).digest('hex');
  writeText(markdownPath, markdown);
  writeJson(releasePath, { ...release, fingerprint });
  writeJson(bindingsPath, {
    schemaVersion: '1.0.0',
    collectionId: 'product-center-item-canonical-automation-bindings',
    fingerprint,
    bindings: release.automationBindings,
  });
  const safety = {
    sensitiveFindings: scanGeneratedArtifacts(path.dirname(markdownPath)).length,
    authStateArtifacts: fs.existsSync(path.join(outputRoot, 'output/auth-state.json')) ? 1 : 0,
  };
  if (safety.sensitiveFindings > 0 || safety.authStateArtifacts > 0) {
    throw new Error(`商品 canonical 产物安全扫描未通过：${JSON.stringify(safety)}`);
  }
  writeJson(reportPath, {
    schemaVersion: '1.0.0',
    collectionId: 'product-center-item-canonical',
    generatedAt: new Date().toISOString(),
    status: release.status,
    fingerprint,
    summary: release.summary,
    sourceCoverage,
    safety,
    diagnostics: {
      incompleteCandidates: plan.blocked.map((item) => ({ nodeId: item.nodeId, diagnostics: item.diagnostics })),
      crossScopeCases: release.cases.filter((item) => item.diagnostics.length > 0)
        .map((item) => ({ canonicalId: item.canonicalId, diagnostics: item.diagnostics })),
      legacyRuleReconciliation: release.cases.map((item) => ({
        canonicalId: item.canonicalId,
        nodeId: item.nodeId,
        disposition: item.businessRuleAssessment.disposition,
        note: item.businessRuleAssessment.note,
        sourceCitations: item.sources.filter((source) => source.kind === 'business-rule')
          .map((source) => source.citation),
      })),
    },
    guardrails: {
      sourceInferenceAllowed: false,
      formalSourceMappingRequired: true,
      legacyRuleMayAuthorizeAcceptance: false,
      pageEvidenceMayInferBusinessRule: false,
      automationContentDuplicationAllowed: false,
      missingFormalSourceDisposition: 'review-required',
    },
    ruleGovernance: {
      legacyRules: ruleRegistry.summary.legacy,
      formalRules: ruleRegistry.summary.formal,
      candidateRules: ruleRegistry.summary.candidates,
      acceptanceCases: release.cases.filter((item) => item.executionChannel === 'acceptance').length,
      probeCases: release.cases.filter((item) => item.executionChannel === 'probe').length,
      nonExecutableCases: release.cases.filter((item) => item.executionChannel === 'none').length,
      runtimeMayPromoteToFormal: false,
      registryPath: rulePaths.registryPath,
      reviewReportPath: rulePaths.reportPath,
    },
  });
  const coveragePaths = buildProductCenterItemSourceCoverageArtifacts({ projectRoot, outputRoot });
  return {
    markdownPath,
    releasePath,
    bindingsPath,
    reportPath,
    ruleRegistryPath: rulePaths.registryPath,
    ruleReportPath: rulePaths.reportPath,
    coverageReportPath: coveragePaths.reportPath,
  };
}

function readConfirmedCaseOverrides(sourcePath: string): ProductCenterCanonicalCaseOverride[] {
  const source = JSON.parse(fs.readFileSync(sourcePath, 'utf8')) as {
    sourceRole: string;
    confirmations: Array<{ canonicalCorrections?: ProductCenterCanonicalCaseOverride[] }>;
  };
  if (source.sourceRole !== 'product-confirmed-rule') {
    throw new Error('商品规则确认来源角色无效');
  }
  const overrides = source.confirmations.flatMap((item) => item.canonicalCorrections ?? []);
  if (new Set(overrides.map((item) => item.canonicalId)).size !== overrides.length) {
    throw new Error('商品规则确认包含重复 canonical 校正');
  }
  return overrides;
}

const itemCanonicalIdsByNodeId: Readonly<Record<string, string>> = {
  '7l7h2blkkkak5s2ovti99bqtjh': 'TC-ITEM-STD-006',
  '3nkakilp5sp9jupkg7bg1sdp95': 'TC-ITEM-STD-007',
  '1g5c9rbjd6bmkdnho5o3qumd5i': 'TC-ITEM-STD-011',
  '5nps4c4rebgh2bb38j2bp5sh2j': 'TC-ITEM-STD-012',
  '56qm12npj4iodhphpmi8nqg8oa': 'TC-ITEM-STD-013',
  '3vud493ll768u9t0iqhiqqftg8': 'TC-ITEM-STD-014',
  '4idefkot8f9al0d5eaqjlsukei': 'TC-ITEM-STD-025',
  '7lbkbtis9nhoheguguq1p4q0hq': 'TC-ITEM-STD-026',
  '1gld10kchs6ofo359iu2jpbpbg': 'TC-ITEM-STD-027',
};

function buildBusinessRuleAssessments(
  businessRules: string,
  businessRulesPath: string,
): ProductCenterCanonicalBusinessRuleAssessment[] {
  const categoryLeaf = toBusinessRuleSource(
    verifyProductCenterBusinessRuleStatement(businessRules, {
      citation: '商品分类叶子选择规则',
      sectionHeading: '1. 商品管理 / 商品',
      expectedText: '商品分类：非必填；创建或编辑时未修改则保留原分类，主动清空允许保存为空；若选择的一级分类存在二级分类，必须选择到叶子分类；保存后列表可按分类过滤、编辑详情回显最终结果。',
    }),
    businessRulesPath,
  );
  const itemNameUnique = toBusinessRuleSource(
    verifyProductCenterBusinessRuleCitation(businessRules, {
      citation: 'BR-ITEM-010',
      sectionHeading: '2.4 商品规则（BR-ITEM 摘要 · 2026-06-16 产品确认）',
      ruleId: 'BR-ITEM-010',
      expectedText: '[B端] 商品名称：必填，100 字符；**首尾禁止空格，含首尾空格保存失败**（见 `BR-FMT-001`）；**同一商户内标准商品与套餐商品共享名称唯一性空间，彼此及各自同类型创建或编辑同名均失败并提示 `BITEM-7014：商品名称与其它类型商品名称重复`**；**加料商品使用独立名称空间，标准商品或套餐商品在创建及编辑改名时均可与加料商品同名，但加料商品之间创建或编辑同名均失败**；分类不参与判重；同类型无重复时允许改名，编辑失败原名称保持不变；商品第二名称互斥规则见 `BR-ITEM-021`。',
    }),
    businessRulesPath,
  );
  const industryInheritance = toBusinessRuleSource(
    verifyProductCenterBusinessRuleStatement(businessRules, {
      citation: '行业商品继承范围',
      sectionHeading: '1. 商品管理 / 商品',
      expectedText: '行业商品开启后，新建商品仅继承商品名称，其余参数不继承。',
    }),
    businessRulesPath,
  );
  return [
    assessment('7l7h2blkkkak5s2ovti99bqtjh', 'legacy-partial',
      '旧规则线索支持叶子分类选择，但未定义“无二级分类时列表展示与排序”的完整预期。', [categoryLeaf]),
    assessment('3nkakilp5sp9jupkg7bg1sdp95', 'legacy-aligned',
      '旧规则线索描述有二级分类时必须选择到叶子分类；仍需当前正式来源复核。', [categoryLeaf]),
    assessment('1g5c9rbjd6bmkdnho5o3qumd5i', 'legacy-aligned',
      '已按当前产品确认统一为同一商户内标准/套餐共享名称空间、加料独立名称空间；分类不参与判重。', [itemNameUnique]),
    assessment('5nps4c4rebgh2bb38j2bp5sh2j', 'legacy-aligned',
      '已按当前产品确认覆盖标准/套餐共享空间及加料独立空间的同名失败场景。', [itemNameUnique]),
    assessment('56qm12npj4iodhphpmi8nqg8oa', 'legacy-aligned',
      '二级分类变化不改变同一商品类型的判重结论，分类不属于判重作用域。', [itemNameUnique]),
    assessment('3vud493ll768u9t0iqhiqqftg8', 'legacy-aligned',
      '不同一级分类仍属于同一商户名称判重作用域，标准/套餐创建同名失败；标准/套餐与加料的跨空间允许同名另由对应用例覆盖。', [itemNameUnique]),
    assessment('4idefkot8f9al0d5eaqjlsukei', 'legacy-aligned',
      '行业商品库规则及继承能力已由产品确认废弃，本用例同步废弃并保留历史来源。', [industryInheritance]),
    assessment('7lbkbtis9nhoheguguq1p4q0hq', 'legacy-aligned',
      '行业商品库规则及继承能力已由产品确认废弃，本用例同步废弃并保留历史来源。', [industryInheritance]),
    assessment('1gld10kchs6ofo359iu2jpbpbg', 'legacy-aligned',
      '行业商品库规则及继承能力已由产品确认废弃，本用例同步废弃并保留历史来源。', [industryInheritance]),
  ];
}

function assessment(
  nodeId: string,
  disposition: ProductCenterCanonicalBusinessRuleAssessment['disposition'],
  note: string,
  sources: ProductCenterCanonicalSource[],
): ProductCenterCanonicalBusinessRuleAssessment {
  return { nodeId, disposition, note, sources };
}

function toBusinessRuleSource(
  verification: ProductCenterSourceCitationVerification,
  sourcePath: string,
): ProductCenterCanonicalSource {
  return {
    kind: 'business-rule',
    sourceId: `legacy-rule:${verification.citation}`,
    sourceRole: 'legacy-rule-baseline',
    acceptanceEligible: false,
    citation: `旧规则线索 ← ${verification.citation} @ ${verification.matchedLocation}`,
    verified: verification.verified,
    sourcePath,
    fingerprint: createHash('sha256').update(fs.readFileSync(sourcePath)).digest('hex'),
    matchedText: verification.matchedText,
  };
}

function writeJson(filePath: string, value: unknown): void {
  writeText(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function writeText(filePath: string, value: string): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.tmp`;
  fs.writeFileSync(temporaryPath, value, 'utf8');
  fs.renameSync(temporaryPath, filePath);
}

if (require.main === module) {
  try {
    const paths = buildProductCenterItemCanonicalArtifacts();
    process.stdout.write(`商品中心商品 canonical 产物已生成：\n${paths.markdownPath}\n${paths.releasePath}\n${paths.bindingsPath}\n${paths.reportPath}\n`);
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
