import { expect, test } from '@playwright/test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildProductCenterItemRuleRegistryArtifacts } from '../../scripts/build-product-center-item-rule-registry';
import {
  buildProductCenterFormalReviewQueue,
  buildProductCenterRuleRegistry,
  compileProductCenterReviewedFormalRules,
  evaluateProductCenterFormalReviewReadiness,
  recommendProductCenterRuleStatus,
  selectProductCenterRuleExecutionChannel,
  validateProductCenterRuleRegistry,
  type ProductCenterCandidateRule,
  type ProductCenterFormalRuleBinding,
  type ProductCenterLegacyRuleBinding,
  type ProductCenterRuleExecutionEvidence,
} from '../../utils/product-center-rule-evidence-ledger';

const formalRule: ProductCenterFormalRuleBinding = {
  bindingId: 'formal-binding:BR-ITEM-010',
  ruleId: 'BR-ITEM-010',
  module: 'item',
  statement: '同一商户内商品名称不可重复',
  authority: {
    sourcePath: 'D:/Merchant Center Info/商品中心业务规则.md',
    section: '2.4 商品规则',
    matchedText: '同一商户（一个商品中心账号）内不可重复',
    fingerprint: 'a'.repeat(64),
    verified: true,
  },
};

const legacyRule: ProductCenterLegacyRuleBinding = {
  bindingId: 'legacy-binding:BR-ITEM-010',
  ruleId: 'BR-ITEM-010',
  module: 'item',
  statement: '同一商户内商品名称不可重复',
  sourceRole: 'legacy-rule-baseline',
  authority: {
    sourcePath: 'D:/Merchant Center Info/商品中心业务规则.md',
    section: '2.4 商品规则',
    matchedText: '同一商户（一个商品中心账号）内不可重复',
    fingerprint: 'a'.repeat(64),
    textVerified: true,
    formallyApproved: false,
  },
};

const candidateRule: ProductCenterCandidateRule = {
  ruleId: 'CBR-ITEM-STD-011',
  module: 'item',
  statement: '同一个一级分类下创建同名商品时保存失败',
  conditionClaims: ['TC-ITEM-STD-011:precondition-1'],
  actionClaims: ['TC-ITEM-STD-011:action-4', 'TC-ITEM-STD-011:action-5'],
  outcomeClaims: ['TC-ITEM-STD-011:expectation-1'],
  sourceIds: ['xmind:1g5c9rbjd6bmkdnho5o3qumd5i'],
  scope: ['同一商户', '同一一级分类'],
  currentStatus: 'provisional',
  formalRuleBindingIds: ['formal-binding:BR-ITEM-010'],
  legacyRuleBindingIds: [],
  legacyConflictRuleIds: [],
  conflictsWithRuleIds: [],
  requiredValidationDimensions: ['positive', 'negative', 'scope'],
};

function runtimeEvidence(
  dimension: ProductCenterRuleExecutionEvidence['dimension'],
  result: ProductCenterRuleExecutionEvidence['result'] = 'supports',
  dataVariantId: string = dimension,
  versionFingerprint: string = 'b'.repeat(64),
): ProductCenterRuleExecutionEvidence {
  return {
    evidenceId: `runtime:${dimension}:${result}:${dataVariantId}`,
    ruleId: candidateRule.ruleId,
    observedAt: '2026-07-29T08:00:00.000Z',
    versionFingerprint,
    environmentId: 'qa',
    roleId: 'merchant-admin',
    dataVariantId,
    dimension,
    result,
    uiEvidenceIds: [`ui:${dimension}:${dataVariantId}`],
    apiEvidenceIds: [`api:${dimension}:${dataVariantId}`],
    cleanupVerified: true,
  };
}

test.describe('商品中心规则证据账本合同', () => {
  test('正式规则进入 acceptance，候选规则进入 probe，冲突规则禁止执行', async () => {
    expect(selectProductCenterRuleExecutionChannel('formal', false)).toBe('acceptance');
    expect(selectProductCenterRuleExecutionChannel('provisional', false)).toBe('probe');
    expect(selectProductCenterRuleExecutionChannel('observed', false)).toBe('probe');
    expect(selectProductCenterRuleExecutionChannel('supported', false)).toBe('probe');
    expect(selectProductCenterRuleExecutionChannel('conflict', true)).toBe('none');
    expect(selectProductCenterRuleExecutionChannel('blocked', false)).toBe('none');
  });

  test('旧规则基线只能保留为不可执行线索，不得进入 formal 或 acceptance', async () => {
    const registry = buildProductCenterRuleRegistry({
      formalBindings: [],
      legacyBindings: [legacyRule],
      candidates: [{
        ...candidateRule,
        formalRuleBindingIds: [],
        legacyRuleBindingIds: [legacyRule.bindingId],
      }],
      evidence: [],
    });

    expect(validateProductCenterRuleRegistry(registry)).toEqual([]);
    expect(registry.summary).toMatchObject({ legacy: 1, formal: 0, acceptance: 0 });
    expect(registry.formalRules).toEqual([]);
    expect(registry.legacyRules[0]).toMatchObject({
      ruleId: 'BR-ITEM-010',
      sourceKind: 'legacy-rule-baseline',
      currentStatus: 'legacy',
      executionChannel: 'none',
      authority: {
        section: '2.4 商品规则',
        matchedText: '同一商户（一个商品中心账号）内不可重复',
        fingerprint: 'a'.repeat(64),
        textVerified: true,
        formallyApproved: false,
      },
    });
  });

  test('候选源不得通过 status 字段伪装成正式规则', async () => {
    const registry = buildProductCenterRuleRegistry({
      formalBindings: [formalRule],
      candidates: [{ ...candidateRule, currentStatus: 'formal' } as unknown as ProductCenterCandidateRule],
      evidence: [],
    });

    expect(validateProductCenterRuleRegistry(registry)).toContain(
      'CBR-ITEM-STD-011:CANDIDATE_STATUS_FORMAL_FORBIDDEN',
    );
    expect(registry.candidates[0].executionChannel).toBe('none');
  });

  test('一次完整运行只建议 observed，不得自动建议 formal', async () => {
    const recommendation = recommendProductCenterRuleStatus(candidateRule, [runtimeEvidence('positive')]);

    expect(recommendation.recommendedStatus).toBe('observed');
    expect(recommendation.coveredDimensions).toEqual(['positive']);
    expect(recommendation.missingDimensions).toEqual(['negative', 'scope']);
    expect(recommendation.recommendedStatus).not.toBe('formal');
  });

  test('全部独立验证维度通过后最多建议 supported', async () => {
    const recommendation = recommendProductCenterRuleStatus(candidateRule, [
      runtimeEvidence('positive'),
      runtimeEvidence('negative'),
      runtimeEvidence('scope'),
    ]);

    expect(recommendation.recommendedStatus).toBe('supported');
    expect(recommendation.missingDimensions).toEqual([]);
  });

  test('证据支持完整但只有一个前端版本时不得触发人工正式审核', async () => {
    const evidence = [
      runtimeEvidence('positive', 'supports', 'data-a'),
      runtimeEvidence('negative', 'supports', 'data-b'),
      runtimeEvidence('scope', 'supports', 'data-c'),
    ];
    const readiness = evaluateProductCenterFormalReviewReadiness(candidateRule, evidence);

    expect(readiness.status).toBe('not-ready');
    expect(readiness.triggered).toBe(false);
    expect(readiness.metrics).toMatchObject({
      independentDataVariants: 3,
      distinctVersionFingerprints: 1,
      missingDimensions: [],
    });
    expect(readiness.blockers).toContain('DISTINCT_VERSION_FINGERPRINTS_REQUIRED:2');
  });

  test('三组独立数据覆盖全部维度且跨两个版本后自动进入人工审核队列', async () => {
    const evidence = [
      runtimeEvidence('positive', 'supports', 'data-a', 'b'.repeat(64)),
      runtimeEvidence('negative', 'supports', 'data-b', 'b'.repeat(64)),
      runtimeEvidence('scope', 'supports', 'data-c', 'c'.repeat(64)),
    ];
    const registry = buildProductCenterRuleRegistry({
      formalBindings: [],
      candidates: [candidateRule],
      evidence,
    });
    const queue = buildProductCenterFormalReviewQueue(registry);

    expect(registry.summary.readyForFormalReview).toBe(1);
    expect(queue).toHaveLength(1);
    expect(queue[0]).toMatchObject({
      ruleId: candidateRule.ruleId,
      candidateFingerprint: expect.stringMatching(/^[a-f0-9]{64}$/),
      formalReview: { status: 'ready-for-human-review', triggered: true },
    });
  });

  test('人工批准必须命中当前候选指纹且候选已达到门禁', async () => {
    const evidence = [
      runtimeEvidence('positive', 'supports', 'data-a', 'b'.repeat(64)),
      runtimeEvidence('negative', 'supports', 'data-b', 'b'.repeat(64)),
      runtimeEvidence('scope', 'supports', 'data-c', 'c'.repeat(64)),
    ];
    const registry = buildProductCenterRuleRegistry({
      formalBindings: [],
      candidates: [candidateRule],
      evidence,
    });
    const candidate = registry.candidates[0];
    const decision = {
      ruleId: candidate.ruleId,
      candidateFingerprint: candidate.candidateFingerprint,
      decision: 'approve' as const,
      confirmedBy: '金将军',
      decidedAt: '2026-08-14T08:00:00.000Z',
      rationale: '规则表述和适用范围确认无误',
      approvedStatement: candidate.statement,
    };

    expect(compileProductCenterReviewedFormalRules(registry, [decision])).toEqual([
      expect.objectContaining({
        ruleId: candidate.ruleId,
        currentStatus: 'formal',
        authority: expect.objectContaining({ sourceRole: 'human-formal-review', confirmedBy: '金将军' }),
      }),
    ]);
    expect(() => compileProductCenterReviewedFormalRules(registry, [{
      ...decision,
      candidateFingerprint: 'd'.repeat(64),
    }])).toThrow('候选指纹已过期');
  });

  test('存在可靠反例时必须阻断人工正式审核', async () => {
    const readiness = evaluateProductCenterFormalReviewReadiness(candidateRule, [
      runtimeEvidence('positive', 'supports', 'data-a', 'b'.repeat(64)),
      runtimeEvidence('negative', 'supports', 'data-b', 'b'.repeat(64)),
      runtimeEvidence('scope', 'supports', 'data-c', 'c'.repeat(64)),
      runtimeEvidence('negative', 'contradicts', 'data-d', 'c'.repeat(64)),
    ]);

    expect(readiness).toMatchObject({
      status: 'blocked-by-conflict',
      triggered: false,
      blockers: expect.arrayContaining(['CONTRADICTION_OR_RULE_CONFLICT']),
    });
  });

  test('任一可靠反例都将候选规则建议为 conflict', async () => {
    const recommendation = recommendProductCenterRuleStatus(candidateRule, [
      runtimeEvidence('positive'),
      runtimeEvidence('negative', 'contradicts'),
    ]);

    expect(recommendation.recommendedStatus).toBe('conflict');
    expect(recommendation.contradictingEvidenceIds).toEqual(['runtime:negative:contradicts:negative']);
  });

  test('相同数据变体不得重复充当多个独立验证维度', async () => {
    const recommendation = recommendProductCenterRuleStatus(candidateRule, [
      runtimeEvidence('positive', 'supports', 'same-data'),
      runtimeEvidence('negative', 'supports', 'same-data'),
      runtimeEvidence('scope', 'supports', 'same-data'),
    ]);

    expect(recommendation.recommendedStatus).toBe('observed');
    expect(recommendation.coveredDimensions).toHaveLength(1);
    expect(recommendation.missingDimensions).toHaveLength(2);
  });

  test('清理未验证或 UI/API 证据不完整时不得计入规则支持证据', async () => {
    const cleanupFailed = { ...runtimeEvidence('positive'), cleanupVerified: false };
    const missingApi = { ...runtimeEvidence('negative'), apiEvidenceIds: [] };
    const recommendation = recommendProductCenterRuleStatus(candidateRule, [cleanupFailed, missingApi]);

    expect(recommendation.recommendedStatus).toBe('provisional');
    expect(recommendation.coveredDimensions).toEqual([]);
    expect(recommendation.supportingEvidenceIds).toEqual([]);
  });

  test('统一 registry 保留分离来源并生成稳定执行视图', async () => {
    const registry = buildProductCenterRuleRegistry({
      formalBindings: [formalRule],
      candidates: [candidateRule],
      evidence: [runtimeEvidence('positive')],
    });

    expect(validateProductCenterRuleRegistry(registry)).toEqual([]);
    expect(registry.summary).toMatchObject({ formal: 1, candidates: 1, acceptance: 1, probe: 1 });
    expect(registry.formalRules[0]).toMatchObject({
      ruleId: 'BR-ITEM-010',
      sourceKind: 'formal-binding',
      executionChannel: 'acceptance',
    });
    expect(registry.candidates[0]).toMatchObject({
      ruleId: 'CBR-ITEM-STD-011',
      sourceKind: 'candidate-ledger',
      currentStatus: 'provisional',
      recommendedStatus: 'observed',
      executionChannel: 'probe',
    });
  });

  test('商品正式绑定、旧规则基线与候选规则必须分文件维护', async () => {
    const projectRoot = path.resolve(__dirname, '../..');
    const formalSourcePath = path.join(
      projectRoot,
      'contracts/product-center/business-rules/product-center-item-formal-rule-bindings.json',
    );
    const candidateSourcePath = path.join(
      projectRoot,
      'contracts/product-center/business-rules/product-center-item-candidate-rules.json',
    );
    const legacySourcePath = path.join(
      projectRoot,
      'contracts/product-center/business-rules/product-center-item-legacy-rule-baseline.json',
    );

    expect(formalSourcePath).not.toBe(candidateSourcePath);
    expect(legacySourcePath).not.toBe(formalSourcePath);
    expect(legacySourcePath).not.toBe(candidateSourcePath);
    const formalSource = JSON.parse(fs.readFileSync(formalSourcePath, 'utf8'));
    const legacySource = JSON.parse(fs.readFileSync(legacySourcePath, 'utf8'));
    const candidateSource = JSON.parse(fs.readFileSync(candidateSourcePath, 'utf8'));
    expect(formalSource.bindings).toHaveLength(6);
    expect(formalSource.bindings.map((item: any) => item.ruleId).sort()).toEqual([
      'BR-ITEM-010',
      'BR-ITEM-CATEGORY-DIRECT-PARENT-CREATE',
      'BR-ITEM-CATEGORY-LEAF-SELECTION',
      'BR-ITEM-CATEGORY-OPTIONAL',
      'BR-ITEM-COMBO-GROUP-REQUIRED',
      'BR-ITEM-COMBO-OPTIONAL-EDIT-BOUNDARY',
    ]);
    expect(legacySource).toMatchObject({ sourceRole: 'legacy-rule-baseline' });
    expect(legacySource.bindings).toHaveLength(3);
    expect(candidateSource.rules).toHaveLength(9);
    expect(candidateSource.rules.every((item: any) => item.currentStatus !== 'formal')).toBe(true);
    expect(candidateSource.rules.every((item: any) => (
      item.formalRuleBindingIds.length === 0
      && item.legacyRuleBindingIds.length === 1
    ))).toBe(true);
  });

  test('真实构建必须保留 3 条旧规则并放行用户确认的 5 条正式规则', async () => {
    const projectRoot = path.resolve(__dirname, '../..');
    const outputRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'product-center-rule-ledger-'));
    try {
      const paths = buildProductCenterItemRuleRegistryArtifacts({ projectRoot, outputRoot });
      const registry = JSON.parse(fs.readFileSync(paths.registryPath, 'utf8'));
      const report = JSON.parse(fs.readFileSync(paths.reportPath, 'utf8'));

      expect(registry.summary).toMatchObject({
        legacy: 3,
        formal: 6,
        candidates: 225,
        acceptance: 6,
        probe: 217,
        none: 11,
        conflicts: 0,
        legacyDiscrepancies: 0,
      });
      expect(registry.formalRules).toHaveLength(6);
      expect(registry.formalRules.every((item: any) => (
        item.sourceKind === 'formal-binding'
        && item.currentStatus === 'formal'
        && item.executionChannel === 'acceptance'
        && item.authority.verified === true
        && item.authority.sourcePath.endsWith('product-center-item-rule-confirmations.json')
      ))).toBe(true);
      expect(registry.legacyRules).toHaveLength(3);
      expect(registry.legacyRules.every((item: any) => (
        item.sourceKind === 'legacy-rule-baseline'
        && item.currentStatus === 'legacy'
        && item.executionChannel === 'none'
        && item.authority.textVerified === true
        && item.authority.formallyApproved === false
        && item.authority.section.length > 0
        && item.authority.matchedText.length > 0
        && /^[a-f0-9]{64}$/i.test(item.authority.fingerprint)
        && item.ruleId.length > 0
      ))).toBe(true);
      expect(registry.candidates.filter((item: any) => item.currentStatus === 'provisional').every((item: any) => (
        item.executionChannel === 'probe'
      ))).toBe(true);
      expect(registry.candidates.filter((item: any) => item.currentStatus === 'provisional')).toHaveLength(217);
      expect(registry.candidates.filter((item: any) => item.currentStatus === 'blocked')).toHaveLength(8);
      expect(registry.candidates.filter((item: any) => item.currentStatus === 'blocked').every((item: any) => (
        item.executionChannel === 'none'
      ))).toBe(true);
      expect(registry.candidates.filter((item: any) =>
        item.legacyConflictRuleIds.length > 0)).toHaveLength(0);
      expect(validateProductCenterRuleRegistry(registry)).toEqual([]);
      expect(report.guardrails).toMatchObject({
        legacySourceIsReadOnly: true,
        legacyMayEnterAcceptance: false,
        runtimeMayPromoteToFormal: false,
        runtimeMayGenerateCandidates: true,
        runtimeMayTriggerHumanReview: true,
        candidateAcceptanceAllowed: false,
      });
      expect(paths.reviewQueuePath).toContain('item-formal-rule-review-queue.json');
      expect(paths.reviewedFormalRulesPath).toContain('product-center-item-reviewed-formal-rules.json');
      expect(JSON.parse(fs.readFileSync(paths.reviewQueuePath, 'utf8')).summary).toEqual({
        candidates: 225,
        readyForHumanReview: 0,
        approved: 0,
      });
      const testPlanLedger = JSON.parse(fs.readFileSync(paths.testPlanRuleLedgerPath, 'utf8'));
      expect(testPlanLedger.summary).toEqual({
        sourceCases: 232,
        activeCandidates: 225,
        deprecatedExcluded: 7,
        runtimeObserved: 201,
        deferredBlocked: 8,
        supplementalReviewed: 16,
        curatedOverrides: 6,
        formalRuleLinked: 14,
      });
      expect(fs.readFileSync(paths.testPlanRuleMarkdownPath, 'utf8')).toContain(
        '# 商品中心商品管理测试方案候选业务规则',
      );
      expect(report.safety).toEqual({ sensitiveFindings: 0, authStateArtifacts: 0 });
    } finally {
      fs.rmSync(outputRoot, { recursive: true, force: true });
    }
  });
});
