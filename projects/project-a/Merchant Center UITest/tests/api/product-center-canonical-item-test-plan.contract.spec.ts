import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { buildProductCenterItemCanonicalArtifacts } from '../../scripts/build-product-center-item-canonical-test-plan';
import {
  buildProductCenterItemCanonicalRelease,
  parseProductCenterXmindItemPlan,
  renderProductCenterCanonicalMarkdown,
  validateProductCenterCanonicalRelease,
} from '../../utils/product-center-canonical-item-test-plan';

const projectRoot = process.cwd();
const sourcePath = path.resolve(
  projectRoot,
  '../Merchant Center Info/00-待转换测试方案/用例库/商品中心-商品管理-商品/1.商品中心-商品管理-商品.xmind',
);

const prdPath = path.resolve(
  projectRoot,
  '../Merchant Center Info/PRD与对应测试用例/1.需求品牌商品与分类.md',
);

const businessRulesPath = path.resolve(
  projectRoot,
  '../Merchant Center Info/商品中心业务规则.md',
);

test.describe('商品 XMind 唯一 canonical 测试方案', () => {
  test('应解析商品 XMind 的真实节点分母和完整执行链', async () => {
    const plan = parseProductCenterXmindItemPlan(fs.readFileSync(sourcePath));

    expect(plan.summary).toMatchObject({
      nodes: 155,
      leaves: 48,
      detailedCandidates: 9,
      incompleteCandidates: 39,
    });
    expect(plan.candidates.every((item) => (
      item.nodeId.length > 0
      && item.path.length >= 4
      && item.precondition.trim().length > 0
      && item.steps.trim().length > 0
      && item.expected.trim().length > 0
    ))).toBe(true);
    expect(new Set(plan.candidates.map((item) => item.nodeId)).size)
      .toBe(plan.candidates.length);
  });

  test('canonical release 必须保留 XMind 精确来源并把无优先级/无正式映射置为 review-required', async () => {
    const plan = parseProductCenterXmindItemPlan(fs.readFileSync(sourcePath));
    const release = buildProductCenterItemCanonicalRelease({
      plan,
      sourceFiles: {
        xmind: sourcePath,
        prd: prdPath,
        businessRules: businessRulesPath,
      },
      observedRoutes: ['/pp/brand/list', '/pp/brand/category'],
    });

    expect(release.summary).toMatchObject({
      candidates: 9,
      generated: 9,
      reviewRequired: 9,
      blocked: 39,
    });
    expect(validateProductCenterCanonicalRelease(release)).toEqual([]);
    expect(release.cases.every((item) => (
      item.sources.some((source) => source.kind === 'xmind' && source.verified)
      && item.status === 'review-required'
      && item.reviewRequired.includes('PRIORITY_UNASSIGNED')
      && item.reviewRequired.includes('FORMAL_SOURCE_MAPPING_REQUIRED')
    ))).toBe(true);
    expect(release.blocked.every((item) => item.status === 'blocked')).toBe(true);
  });

  test('canonical Markdown 是唯一业务内容载体，自动化绑定不得复制步骤或预期', async () => {
    const plan = parseProductCenterXmindItemPlan(fs.readFileSync(sourcePath));
    const release = buildProductCenterItemCanonicalRelease({
      plan,
      sourceFiles: {
        xmind: sourcePath,
        prd: prdPath,
        businessRules: businessRulesPath,
      },
      observedRoutes: ['/pp/brand/list', '/pp/brand/category'],
    });
    const markdown = renderProductCenterCanonicalMarkdown(release);

    expect(markdown.match(/^### 用例编号：/gm)).toHaveLength(9);
    expect(markdown).not.toMatch(/^={2,}$/m);
    expect(markdown).not.toMatch(/\d+\.\s+\d+\./);
    expect(markdown).toContain('旧规则线索复核：');
    expect(markdown).not.toContain('业务规则复核：');
    expect(release.automationBindings).toHaveLength(9);
    expect(release.automationBindings.every((binding) => (
      binding.canonicalId
      && !('actions' in binding)
      && !('expectedResults' in binding)
      && !('preconditions' in binding)
    ))).toBe(true);
    expect(new Set(release.cases.map((item) => item.canonicalId)).size)
      .toBe(release.cases.length);
  });

  test('用户确认的分类规则应校正叶子选择用例且不得误写为分类必填', async () => {
    const outputRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'product-center-item-category-rule-'));
    try {
      const paths = buildProductCenterItemCanonicalArtifacts({ projectRoot, outputRoot });
      const release = JSON.parse(fs.readFileSync(paths.releasePath, 'utf8'));
      const item = release.cases.find((candidate: any) => (
        candidate.canonicalId === 'TC-ITEM-STD-007'
      ));

      expect(item).toMatchObject({
        title: '一级分类存在二级分类时必须选择二级分类才能完成商品分类选择',
        priority: 'P1',
        status: 'ready-for-technical-binding',
        executionChannel: 'acceptance',
      });
      expect(item.actions).toEqual([
        '点击侧边栏【商品管理】-【商品】，进入商品列表页',
        '点击【新增商品】并选择【标准商品】，进入创建页',
        '打开【商品分类】下拉框',
        '点击一级分类A',
        '点击二级分类A1',
      ]);
      expect(item.expectedResults).toEqual([
        '点击一级分类A后，下拉框展开二级分类；一级分类A不作为最终已选分类',
        '点击二级分类A1后，商品分类字段显示二级分类A1，分类选择完成',
      ]);
      const currentBusinessContent = JSON.stringify({
        title: item.title,
        actions: item.actions,
        expectedResults: item.expectedResults,
      });
      expect(currentBusinessContent).not.toContain('才能新增成功');
      expect(currentBusinessContent).not.toContain('才可点提交按钮');
      expect(item.sources.some((source: any) => (
        source.sourceRole === 'test-plan-skeleton'
        && source.matchedText === '一级分类下有二级分类，必须选择到二级分类，才能新增成功'
      ))).toBe(true);
      expect(item.reviewRequired).not.toContain('FORMAL_SOURCE_MAPPING_REQUIRED');
      expect(item.reviewRequired).not.toContain('PRIORITY_UNASSIGNED');
      expect(item.reviewRequired).not.toContain('LEGACY_RULE_REVIEW_REQUIRED');
      expect(item.reviewRequired).not.toContain('CROSS_SCOPE_DOWNSTREAM_FRAGMENT');
      expect(item.diagnostics).toEqual([]);
      expect(item.supersededDiagnostics).toEqual(['CROSS_SCOPE_DOWNSTREAM_FRAGMENT']);
      expect(item.claims.every((claim: any) => (
        claim.formalRuleBindingIds.includes('formal-binding:BR-ITEM-CATEGORY-LEAF-SELECTION')
      ))).toBe(true);
      expect(item.sources.some((source: any) => (
        source.sourceRole === 'product-confirmed-rule'
        && source.acceptanceEligible === true
      ))).toBe(true);
    } finally {
      fs.rmSync(outputRoot, { recursive: true, force: true });
    }
  });

  test('用户审核通过无二级分类创建用例后应写入 P1 和正式规则绑定', async () => {
    const outputRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'product-center-item-parent-category-rule-'));
    try {
      const paths = buildProductCenterItemCanonicalArtifacts({ projectRoot, outputRoot });
      const release = JSON.parse(fs.readFileSync(paths.releasePath, 'utf8'));
      const item = release.cases.find((candidate: any) => (
        candidate.canonicalId === 'TC-ITEM-STD-006'
      ));

      expect(item).toMatchObject({
        title: '一级分类下无二级分类，可新增商品成功',
        priority: 'P1',
        status: 'ready-for-technical-binding',
        executionChannel: 'acceptance',
      });
      expect(item.expectedResults).toEqual([
        '一级分类 A 被直接选中，标准商品创建成功',
      ]);
      expect(item.reviewRequired).toEqual([]);
      expect(item.diagnostics).toEqual([]);
      expect(item.supersededDiagnostics).toEqual(['CROSS_SCOPE_DOWNSTREAM_FRAGMENT', 'UNSUPPORTED_SOURCE_FORMAT']);
      expect(item.claims.every((claim: any) => (
        claim.formalRuleBindingIds.includes(
          'formal-binding:BR-ITEM-CATEGORY-DIRECT-PARENT-CREATE',
        )
      ))).toBe(true);
      expect(item.sources.some((source: any) => (
        source.sourceRole === 'product-confirmed-rule'
        && source.acceptanceEligible === true
      ))).toBe(true);
    } finally {
      fs.rmSync(outputRoot, { recursive: true, force: true });
    }
  });

  test('构建入口应只发布一份业务 Markdown 并把机器派生产物分离', async () => {
    const outputRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'product-center-item-canonical-'));
    try {
      const paths = buildProductCenterItemCanonicalArtifacts({ projectRoot, outputRoot });
      const markdown = fs.readFileSync(paths.markdownPath, 'utf8');
      const release = JSON.parse(fs.readFileSync(paths.releasePath, 'utf8'));
      const bindings = JSON.parse(fs.readFileSync(paths.bindingsPath, 'utf8'));
      const report = JSON.parse(fs.readFileSync(paths.reportPath, 'utf8'));
      const coverage = JSON.parse(fs.readFileSync(paths.coverageReportPath, 'utf8'));
      const ruleRegistry = JSON.parse(fs.readFileSync(paths.ruleRegistryPath, 'utf8'));
      const candidateRulesById = new Map<string, { executionChannel: string }>(
        ruleRegistry.candidates.map((item: any) => [item.ruleId, item]),
      );

      expect(markdown.match(/^### 用例编号：/gm)).toHaveLength(9);
      expect(release.summary).toMatchObject({ generated: 9, reviewRequired: 6, blocked: 39 });
      expect(release.cases.map((item: any) => item.canonicalId)).toEqual([
        'TC-ITEM-STD-006',
        'TC-ITEM-STD-007',
        'TC-ITEM-STD-011',
        'TC-ITEM-STD-012',
        'TC-ITEM-STD-013',
        'TC-ITEM-STD-014',
        'TC-ITEM-STD-025',
        'TC-ITEM-STD-026',
        'TC-ITEM-STD-027',
      ]);
      expect(release.cases.every((item: any) => !item.canonicalId.includes('XMIND'))).toBe(true);
      expect(bindings.bindings).toHaveLength(9);
      expect(bindings.bindings.every((binding: Record<string, unknown>) => (
        !('title' in binding)
        && !('preconditions' in binding)
        && !('actions' in binding)
        && !('expectedResults' in binding)
      ))).toBe(true);
      expect(report).toMatchObject({
        status: 'review-required',
        summary: { generated: 9, reviewRequired: 6, blocked: 39 },
        sourceCoverage: {
          xmindVerified: 9,
          formalMapped: 6,
          legacyMapped: 6,
          pageRoutesObserved: 2,
          legacyAligned: 8,
          legacyPartial: 1,
          legacyDiscrepancies: 0,
        },
      });
      const legacyDiscrepancies = release.cases.filter((item: any) =>
        item.businessRuleAssessment?.disposition === 'legacy-discrepancy');
      expect(legacyDiscrepancies).toHaveLength(0);
      expect(legacyDiscrepancies.every((item: any) => (
        item.reviewRequired.includes('LEGACY_RULE_DISCREPANCY')
        && item.executionChannel === candidateRulesById.get(item.ruleIds[0])?.executionChannel
      ))).toBe(true);
      expect(release.cases.every((item: any) => (
        (['TC-ITEM-STD-025', 'TC-ITEM-STD-026', 'TC-ITEM-STD-027'].includes(item.canonicalId)
          ? item.ruleIds.length === 0
          : item.ruleIds.length === 1)
        && ['acceptance', 'probe', 'none'].includes(item.executionChannel)
        && (['TC-ITEM-STD-025', 'TC-ITEM-STD-026', 'TC-ITEM-STD-027'].includes(item.canonicalId)
          ? item.reviewRequired.includes('FORMAL_SOURCE_MAPPING_REQUIRED')
          : !item.reviewRequired.includes('FORMAL_SOURCE_MAPPING_REQUIRED'))
        && (['TC-ITEM-STD-025', 'TC-ITEM-STD-026', 'TC-ITEM-STD-027'].includes(item.canonicalId)
          ? item.reviewRequired.includes('LEGACY_RULE_REVIEW_REQUIRED')
          : !item.reviewRequired.includes('LEGACY_RULE_REVIEW_REQUIRED'))
        && item.claims.every((claim: any) => (
          (['TC-ITEM-STD-025', 'TC-ITEM-STD-026', 'TC-ITEM-STD-027'].includes(item.canonicalId)
            ? claim.candidateRuleIds.length === 0
            : claim.candidateRuleIds.length === 1)
          && claim.formalRuleBindingIds.length === (['TC-ITEM-STD-025', 'TC-ITEM-STD-026', 'TC-ITEM-STD-027'].includes(item.canonicalId) ? 0 : 1)
          && claim.legacyRuleBindingIds.length === (['TC-ITEM-STD-025', 'TC-ITEM-STD-026', 'TC-ITEM-STD-027'].includes(item.canonicalId) ? 0 : 1)
          && claim.evidenceBindings.some((binding: any) => (
            binding.sourceRole === 'test-plan-skeleton'
            && binding.contribution === 'scenario-skeleton'
            && binding.acceptanceEligible === false
            && binding.verified === true
          ))
          && Array.isArray(claim.executionEvidenceIds)
          && claim.executionEvidenceIds.length === 0
        ))
      ))).toBe(true);
      expect(release.cases.filter((item: any) => item.executionChannel === 'acceptance')).toHaveLength(6);
      expect(release.cases.filter((item: any) => item.executionChannel === 'probe')).toHaveLength(0);
      expect(release.cases.filter((item: any) => item.executionChannel === 'none')).toHaveLength(3);
      expect(release.cases.every((item: any) => item.sources.every((source: any) => (
        source.kind !== 'business-rule'
        || (source.sourceRole === 'legacy-rule-baseline' && source.acceptanceEligible === false)
        || (source.sourceRole === 'product-confirmed-rule' && source.acceptanceEligible === true)
      )))).toBe(true);
      expect(bindings.bindings.every((binding: any) => (
        binding.capabilityIds[0] === 'navigation.sidebar.open'
        && binding.claimIds.length > 0
        && (['TC-ITEM-STD-025', 'TC-ITEM-STD-026', 'TC-ITEM-STD-027'].includes(binding.canonicalId)
          ? binding.ruleIds.length === 0
          : binding.ruleIds.length === 1)
        && ['acceptance', 'probe', 'none'].includes(binding.executionChannel)
        && !('ruleStatement' in binding)
      ))).toBe(true);
      expect(report.ruleGovernance).toMatchObject({
        legacyRules: 3,
        formalRules: 6,
        candidateRules: 225,
        acceptanceCases: 6,
        probeCases: 0,
        nonExecutableCases: 3,
        runtimeMayPromoteToFormal: false,
      });
      expect(coverage).toMatchObject({
        collectionId: 'product-center-item-source-coverage',
        summary: {
          canonicalCases: 9,
          probeCases: 9,
          acceptanceCases: 0,
          blockedXmindNodes: 39,
        },
        guardrails: { canonicalBusinessMarkdownCount: 1 },
      });
    } finally {
      fs.rmSync(outputRoot, { recursive: true, force: true });
    }
  });
});
