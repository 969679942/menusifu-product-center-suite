import { expect, test } from '@playwright/test';
import {
  buildProductCenterMarkdownRepairQueue,
  buildProductCenterGenerationPortfolio,
  buildProductCenterLegacyMigrationPlan,
  evaluateSegmentedGenerationQuality,
  normalizeProductCenterAcceptanceStatus,
} from '../../utils/product-center-quality-program';
import {
  buildProductCenterAcceptanceTrend,
  buildProductCenterControlledRepairApprovalGate,
  buildProductCenterControlledRepairClosure,
  buildProductCenterControlledRepairPlan,
} from '../../utils/product-center-quality-operations';
import {
  auditUtf8Artifact,
  buildProductCenterArtifactRetentionAudit,
} from '../../utils/product-center-artifact-governance';
import {
  summarizeProductCenterMarkdownStructuralValidity,
} from '../../scripts/build-product-center-quality-program';

test.describe('商品中心质量改进组合合同', () => {
  test('Playwright 超时应归并为失败趋势且未知状态继续阻断', async () => {
    expect(normalizeProductCenterAcceptanceStatus('passed')).toBe('passed');
    expect(normalizeProductCenterAcceptanceStatus('failed')).toBe('failed');
    expect(normalizeProductCenterAcceptanceStatus('skipped')).toBe('skipped');
    expect(normalizeProductCenterAcceptanceStatus('timedOut')).toBe('failed');
    expect(() => normalizeProductCenterAcceptanceStatus('unknown')).toThrow(/状态无效/);
  });

  test('应区分真实样本和负向夹具并量化九模块缺口', async () => {
    const portfolio = buildProductCenterGenerationPortfolio({
      moduleIds: ['brand-item', 'brand-group', 'brand-seasoning', 'brand-tag'],
      samples: [
        { caseId: 'real:create', module: 'brand-item', cohort: 'real-source', scenario: 'positive' },
        { caseId: 'real:boundary', module: 'brand-group', cohort: 'real-source', scenario: 'boundary' },
        { caseId: 'fixture:review', module: 'brand-seasoning', cohort: 'negative-fixture', scenario: 'review-required' },
        { caseId: 'fixture:format', module: 'brand-tag', cohort: 'negative-fixture', scenario: 'format-drift' },
      ],
      requiredScenarios: ['positive', 'boundary', 'blocked', 'review-required', 'format-drift'],
    });

    expect(portfolio.summary).toMatchObject({
      totalModules: 4,
      modulesWithRealSources: 2,
      realSourceSamples: 2,
      negativeFixtures: 2,
    });
    expect(portfolio.gaps.missingRealSourceModules).toEqual(['brand-seasoning', 'brand-tag']);
    expect(portfolio.gaps.missingScenarios).toEqual(['blocked']);
    expect(portfolio.readyForScale).toBe(false);
  });

  test('同一模块应允许多个真实用例覆盖同一场景', async () => {
    const portfolio = buildProductCenterGenerationPortfolio({
      moduleIds: ['brand-item'],
      samples: [
        { caseId: 'real:item-standard', module: 'brand-item', cohort: 'real-source', scenario: 'positive' },
        { caseId: 'real:item-combo', module: 'brand-item', cohort: 'real-source', scenario: 'positive' },
      ],
      requiredScenarios: ['positive'],
    });

    expect(portfolio.modules[0]).toMatchObject({
      totalSamples: 2,
      realSourceSamples: 2,
      scenarios: ['positive'],
    });
    expect(portfolio.readyForScale).toBe(true);
  });

  test('应分别统计真实来源和负向夹具的误放行与误拦截', async () => {
    const quality = evaluateSegmentedGenerationQuality([
      { caseId: 'real:pass', cohort: 'real-source', expectedDecision: 'generated', actualDecision: 'generated' },
      { caseId: 'real:false-reject', cohort: 'real-source', expectedDecision: 'generated', actualDecision: 'review-required' },
      { caseId: 'fixture:pass', cohort: 'negative-fixture', expectedDecision: 'review-required', actualDecision: 'review-required' },
      { caseId: 'fixture:false-promote', cohort: 'negative-fixture', expectedDecision: 'review-required', actualDecision: 'generated' },
    ]);

    expect(quality.overall.summary).toMatchObject({ falsePromotions: 1, falseRejections: 1 });
    expect(quality.byCohort['real-source'].summary.falseRejections).toBe(1);
    expect(quality.byCohort['negative-fixture'].summary.falsePromotions).toBe(1);
  });

  test('同一用例多个诊断不得重复扣减结构有效用例数', async () => {
    const result = summarizeProductCenterMarkdownStructuralValidity(3, [
      { code: 'MISSING_SECTION', caseId: 'case-a' },
      { code: 'NON_NUMBERED_STEP', caseId: 'case-a' },
      { code: 'MISSING_SECTION', caseId: 'case-b' },
    ]);

    expect(result).toEqual({
      structurallyValidCaseCount: 1,
      invalidCaseIds: ['case-a', 'case-b'],
      documentIssueCount: 0,
      issueCaseIdsByCode: {
        MISSING_SECTION: ['case-a', 'case-b'],
        NON_NUMBERED_STEP: ['case-a'],
      },
    });
  });

  test('应生成按模块排序且不伪造来源的 legacy 迁移计划', async () => {
    const plan = buildProductCenterLegacyMigrationPlan({
      cases: [
        legacyCase('create:item', 'brand-item', 2),
        legacyCase('edit:item', 'brand-item', 1),
        legacyCase('delete:menu', 'menu', 3),
      ],
      modulesWithFormalSources: new Set(['brand-item']),
    });

    expect(plan.summary).toEqual({ totalCases: 3, legacyCases: 3, legacyClaims: 6, migratableCases: 2, blockedCases: 1 });
    expect(plan.modules[0]).toMatchObject({ module: 'brand-item', status: 'ready-for-source-audit', caseCount: 2 });
    expect(plan.modules[1]).toMatchObject({ module: 'menu', status: 'source-required', caseCount: 1 });
  });

  test('应形成模块级验收趋势并在样本不足时拒绝判断 flaky', async () => {
    const trend = buildProductCenterAcceptanceTrend([
      {
        runId: 'run-1', scope: 'main', generatedAt: '2026-07-26T00:00:00.000Z', accepted: true,
        entries: [{ caseId: 'create:item', module: 'brand-item', status: 'passed' }],
      },
      {
        runId: 'run-2', scope: 'main', generatedAt: '2026-07-27T00:00:00.000Z', accepted: false,
        entries: [{ caseId: 'create:item', module: 'brand-item', status: 'failed' }],
      },
    ]);

    expect(trend.modules[0]).toMatchObject({ module: 'brand-item', runs: 2, acceptedRuns: 1 });
    expect(trend.cases[0]).toMatchObject({ caseId: 'create:item', classification: 'insufficient-data' });
  });

  test('页面合同漂移只能生成需审批的技术修复建议且不得改写业务规则', async () => {
    const plan = buildProductCenterControlledRepairPlan({
      changes: [
        { collection: 'fields', id: 'field:name', route: '/pp/brand/category', kind: 'changed' },
        { collection: 'businessRules', id: 'rule:name-limit', route: '/pp/brand/category', kind: 'changed' },
      ],
      impactedCases: [{ caseId: 'negative:category-max', changeIds: ['field:name'], match: 'source-id' }],
      recipes: [{
        id: 'recipe:category-max', caseId: 'negative:category-max', route: '/pp/brand/category',
        capabilityIds: ['navigation.sidebar.open', 'category.validateName'],
      }],
    });

    expect(plan.guardrails).toEqual({ approvalRequired: true, autoApplyAllowed: false, businessRuleMutationAllowed: false });
    expect(plan.proposals).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'page-contract-audit', approvalRequired: true }),
      expect.objectContaining({ kind: 'product-confirmation', autoApplyAllowed: false }),
    ]));
  });

  test('追溯和未决项漂移不得误报为页面定位器修复', async () => {
    const plan = buildProductCenterControlledRepairPlan({
      changes: [
        { collection: 'traceability', id: 'trace:case', kind: 'changed' },
        { collection: 'unresolved', id: 'unresolved:field', kind: 'removed' },
      ],
      impactedCases: [],
      recipes: [],
    });

    expect(plan.proposals.map((item) => item.kind)).toEqual([
      'traceability-refresh',
      'unresolved-review',
    ]);
  });

  test('受控修复未经审批不得执行增量回归，全部批准后才可放行', async () => {
    const repairPlan = buildProductCenterControlledRepairPlan({
      changes: [{ collection: 'fields', id: 'field:name', route: '/pp/brand/category', kind: 'changed' }],
      impactedCases: [{ caseId: 'negative:category-max', changeIds: ['field:name'], match: 'source-id' }],
      recipes: [{
        id: 'recipe:category-max', caseId: 'negative:category-max', route: '/pp/brand/category',
        capabilityIds: ['navigation.sidebar.open', 'category.validateName'],
      }],
    });
    const incrementalPlan = {
      planFingerprint: 'a'.repeat(64),
      cases: [{ caseId: 'negative:category-max' }],
      specFiles: ['tests/generated/product-center-recipe-pilot.generated.spec.ts'],
      grep: '分类名称边界',
    };

    const pending = buildProductCenterControlledRepairApprovalGate({
      repairPlan,
      incrementalPlan,
      decisions: [],
    });
    expect(pending).toMatchObject({
      status: 'approval-required',
      executionAllowed: false,
      pendingProposalIds: ['repair:fields:field:name'],
      incrementalRegression: { caseIds: ['negative:category-max'], executionAllowed: false },
    });

    const approved = buildProductCenterControlledRepairApprovalGate({
      repairPlan,
      incrementalPlan,
      decisions: [{
        proposalId: 'repair:fields:field:name',
        decision: 'approved',
        reviewedBy: 'automation-owner',
        reviewedAt: '2026-07-26T00:00:00.000Z',
        rationale: '页面合同已人工核验',
      }],
    });
    expect(approved).toMatchObject({
      status: 'ready-for-incremental-regression',
      executionAllowed: true,
      pendingProposalIds: [],
      incrementalRegression: { executionAllowed: true },
    });
    expect(approved.guardrails).toEqual({
      approvalRequired: true,
      autoApplyAllowed: false,
      businessRuleMutationAllowed: false,
    });
  });

  test('增量回归计划与受影响用例集合不一致时必须阻断', async () => {
    const repairPlan = buildProductCenterControlledRepairPlan({
      changes: [{ collection: 'fields', id: 'field:name', kind: 'changed' }],
      impactedCases: [{ caseId: 'negative:category-max', changeIds: ['field:name'], match: 'source-id' }],
      recipes: [],
    });
    expect(() => buildProductCenterControlledRepairApprovalGate({
      repairPlan,
      incrementalPlan: {
        planFingerprint: 'b'.repeat(64), cases: [], specFiles: [], grep: '',
      },
      decisions: [],
    })).toThrow(/增量回归用例与受控修复影响集合不一致/);
  });

  test('已批准且实际边界无差异时应以 no-code-change 关闭 proposal', async () => {
    const closure = buildProductCenterControlledRepairClosure({
      approvalGate: {
        status: 'ready-for-incremental-regression',
        executionAllowed: true,
        relevantProposalIds: ['repair:fields:field:name'],
      },
      incrementalPlan: {
        planFingerprint: 'a'.repeat(64),
        cases: [{ caseId: 'negative:name-max' }],
      },
      incrementalResult: {
        status: 'passed',
        planFingerprint: 'a'.repeat(64),
        caseResults: [{ caseId: 'negative:name-max', status: 'passed' }],
      },
      observations: [{
        proposalId: 'repair:fields:field:name',
        caseId: 'negative:name-max',
        expectedMaxLength: 50,
        observedMaxLength: 50,
        acceptedLength: 50,
        rejectedLength: 50,
        locatorCount: 1,
        visible: true,
        enabled: true,
      }],
    });

    expect(closure).toMatchObject({
      status: 'completed-no-code-change',
      closedProposalIds: ['repair:fields:field:name'],
      codeChanges: [],
      businessRuleMutation: false,
    });
  });

  test('应识别 UTF-8 问题并以只报告模式执行保留治理', async () => {
    expect(auditUtf8Artifact('valid.json', Buffer.from('{"name":"商品"}', 'utf8'))).toMatchObject({
      validUtf8: true, hasBom: false, replacementCharacters: 0,
    });
    expect(auditUtf8Artifact('bom.json', Buffer.from('\uFEFF{}', 'utf8'))).toMatchObject({ hasBom: true });

    const audit = buildProductCenterArtifactRetentionAudit({
      now: '2026-07-26T00:00:00.000Z',
      artifacts: [
        { path: 'output/performance/old.json', kind: 'performance', generatedAt: '2026-06-01T00:00:00.000Z' },
        { path: 'output/checkpoints/incomplete.json', kind: 'checkpoint', generatedAt: '2026-06-01T00:00:00.000Z', checkpointPhase: 'cleanup-pending' },
        { path: 'output/checkpoints/onboarding.json', kind: 'checkpoint', generatedAt: '2026-07-25T00:00:00.000Z', checkpointPhase: 'workflow-complete' },
      ],
    });

    expect(audit.deletionMode).toBe('report-only');
    expect(audit.expiredCandidates).toEqual(['output/performance/old.json']);
    expect(audit.cleanupAlerts).toEqual(['output/checkpoints/incomplete.json']);
  });

  test('Markdown 诊断应形成分级修复队列且禁止自动改写业务内容', async () => {
    const queue = buildProductCenterMarkdownRepairQueue([
      {
        module: 'brand-tag',
        path: '商品管理/标签.md',
        issues: [
          diagnostic('UNSUPPORTED_SOURCE_FORMAT', 'TC-TAG-001', 10),
          diagnostic('NON_NUMBERED_STEP', 'TC-TAG-002', 30),
        ],
      },
      {
        module: 'brand-item',
        path: '商品管理/商品.md',
        issues: [diagnostic('INVALID_PRIORITY', 'TC-ITEM-001', 20)],
      },
    ]);

    expect(queue.summary).toEqual({
      totalItems: 3,
      files: 2,
      cases: 3,
      byCode: { INVALID_PRIORITY: 1, NON_NUMBERED_STEP: 1, UNSUPPORTED_SOURCE_FORMAT: 1 },
      byPriority: { P0: 2, P1: 0, P2: 1 },
    });
    expect(queue.guardrails).toEqual({
      approvalRequired: true,
      autoApplyAllowed: false,
      businessContentMutationAllowed: false,
    });
    expect(queue.groups.map((item) => [item.repairPriority, item.code])).toEqual([
      ['P0', 'INVALID_PRIORITY'],
      ['P0', 'UNSUPPORTED_SOURCE_FORMAT'],
      ['P2', 'NON_NUMBERED_STEP'],
    ]);
    expect(queue.groups[1]).toMatchObject({
      repairTrack: 'source-citation',
      requiresSourceOrOwnerConfirmation: true,
      itemCount: 1,
    });
  });
});

function legacyCase(id: string, module: string, claimCount: number) {
  return {
    id,
    module,
    claims: Array.from({ length: claimCount }, (_, index) => ({
      id: `claim:${id}:${index}`,
      sourceTrace: { businessBasis: { kind: 'legacy-baseline' as const, refs: [`SOP:${id}`] } },
    })),
  };
}

function diagnostic(code: 'UNSUPPORTED_SOURCE_FORMAT' | 'NON_NUMBERED_STEP' | 'INVALID_PRIORITY', caseId: string, line: number) {
  return { code, caseId, line, message: `${code} message`, suggestion: `${code} suggestion` };
}
