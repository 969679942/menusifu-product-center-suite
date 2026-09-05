import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { buildProductCenterItemFinalRelease } from '../../scripts/build-product-center-item-final-release';

const projectRoot = path.resolve(__dirname, '../..');

test.describe('商品管理 209 条可执行用例唯一权威发布合同', () => {
  test('应发布 202 通过、11 延期、0 失败的唯一状态', () => {
    const outputRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'pc-item-final-release-'));
    try {
      const { release } = buildProductCenterItemFinalRelease({
        projectRoot,
        outputRoot,
        updateConversionManifest: false,
        generatedAt: '2026-08-11T00:00:00.000Z',
      });
      expect(release.status).toBe('released');
      expect(release.summary).toMatchObject({
        formalCases: 216,
        canonicalCases: 232,
        executableCases: 209,
        notApplicable: 7,
        supplementalReviewed: 16,
        automationBound: 209,
        runtimePassed: 201,
        deferred: 8,
        failed: 0,
        unresolved: 0,
      });
      expect(new Set(release.automationBindings.map((item) => item.caseId)).size).toBe(209);
      expect(release.automationBindings.filter((item) => item.runtimeStatus === 'deferred')).toHaveLength(8);
      expect(release.automationBindings.filter((item) => item.runtimeStatus === 'unresolved')).toHaveLength(0);
    } finally {
      fs.rmSync(outputRoot, { recursive: true, force: true });
    }
  });

  test('应包含最新人工业务规则和完整脚本绑定', () => {
    const outputRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'pc-item-final-rules-'));
    try {
      const { release, businessRulesPath } = buildProductCenterItemFinalRelease({ projectRoot, outputRoot, updateConversionManifest: false });
      const addonDuplicate = release.cases.find((item) => item.caseId === 'TC-ITEM-ADD-015');
      const businessRules = JSON.parse(fs.readFileSync(businessRulesPath, 'utf8')) as {
        status: string;
        releaseFingerprint: string;
        authorityPolicy: {
          formalAuthority: boolean;
          runtimeMayPromoteToFormal: boolean;
          runtimeMayGenerateCandidates: boolean;
          runtimeMayTriggerHumanReview: boolean;
          humanApprovalRequired: boolean;
          formalRegistryPath: string;
          formalReviewQueuePath: string;
          reviewedFormalRulesPath: string;
        };
        summary: { confirmedRules: number; runtimeObservations: number; deferredDecisions: number; totalDecisions: number };
        rules: Array<{ caseId: string; statement: string; runtimeStatus: string; sourceType: string }>;
        runtimeObservations: Array<{ caseId: string; sourceType: string; formalPromotionAllowed: boolean }>;
        testPlanRuleLedger: {
          fingerprint: string;
          summary: { sourceCases: number; activeCandidates: number; deprecatedExcluded: number };
        };
        candidateRules: Array<{
          caseId: string;
          currentStatus: string;
          formalPromotionAllowed: boolean;
          conditions: string[];
          actions: string[];
          outcomes: string[];
        }>;
        excludedTestPlanCases: Array<{ caseId: string; reason: string }>;
      };
      expect(addonDuplicate?.title).toBe('加料商品允许与其他商品类型同名');
      expect(addonDuplicate?.ruleDecision?.confirmedBy).toBe('金将军');
      expect(addonDuplicate?.runtime.status).toBe('runtime-passed');
      expect(release.sourceArtifacts.fullReview.sha256).toMatch(/^[a-f0-9]{64}$/);
      expect(release.sourceArtifacts.manualDecisions.sha256).toMatch(/^[a-f0-9]{64}$/);
      expect(release.fingerprint).toMatch(/^[a-f0-9]{64}$/);
      expect(release.executableFingerprint).toMatch(/^[a-f0-9]{64}$/);
      expect(businessRules.status).toBe('released');
      expect(businessRules.releaseFingerprint).toBe(release.fingerprint);
      expect(businessRules.authorityPolicy).toEqual({
        formalAuthority: false,
        runtimeMayPromoteToFormal: false,
        runtimeMayGenerateCandidates: true,
        runtimeMayTriggerHumanReview: true,
        humanApprovalRequired: true,
        formalRegistryPath: 'contracts/product-center/business-rules/generated/product-center-item-rule-registry.json',
        formalReviewQueuePath: 'output/test-case-audit/product-center/item-formal-rule-review-queue.json',
        reviewedFormalRulesPath: 'contracts/product-center/business-rules/generated/product-center-item-reviewed-formal-rules.json',
      });
      expect(businessRules.summary).toEqual({ confirmedRules: 54, runtimeObservations: 2, deferredDecisions: 8, totalDecisions: 67 });
      expect(businessRules.rules.every((item) => item.sourceType === 'direct-user-confirmation')).toBe(true);
      expect(businessRules.runtimeObservations).toEqual(expect.arrayContaining([
        expect.objectContaining({ caseId: 'TC-ITEM-ADD-016', sourceType: 'runtime-analysis', formalPromotionAllowed: false }),
        expect.objectContaining({ caseId: 'TC-ITEM-STD-005', sourceType: 'runtime-analysis', formalPromotionAllowed: false }),
      ]));
      expect(businessRules.testPlanRuleLedger.summary).toMatchObject({
        sourceCases: 232,
        activeCandidates: 225,
        deprecatedExcluded: 7,
      });
      expect(businessRules.testPlanRuleLedger.fingerprint).toMatch(/^[a-f0-9]{64}$/);
      expect(businessRules.candidateRules).toHaveLength(225);
      expect(businessRules.candidateRules.every((item) => (
        item.currentStatus !== 'formal'
        && item.formalPromotionAllowed === false
        && item.conditions.length > 0
        && item.actions.length > 0
        && item.outcomes.length > 0
      ))).toBe(true);
      expect(businessRules.excludedTestPlanCases).toHaveLength(7);
      expect(businessRules.rules.find((item) => item.caseId === 'TC-ITEM-ADD-015')).toMatchObject({
        statement: expect.stringContaining('加料商品可以与其他商品类型使用相同商品名称'),
        runtimeStatus: 'runtime-passed',
      });
    } finally {
      fs.rmSync(outputRoot, { recursive: true, force: true });
    }
  });

  test('生成器应只复用指纹匹配的运行投影', () => {
    const generator = fs.readFileSync(path.join(projectRoot, 'scripts/generate-product-center-item-216-spec.ts'), 'utf8');
    expect(generator).toContain('readRuntimeProjection(projectRoot, executableFingerprint, executableCases.length)');
    expect(generator).toContain('projection.executableFingerprint !== expectedExecutableFingerprint');
    expect(generator).toContain('runtimePassed: executableCases.filter');
    expect(generator).not.toContain('runtimeNotRun: executableCases.length');
  });

  test('一键交付默认只读构建且显式 full-live 才执行业务写测试', () => {
    const delivery = fs.readFileSync(path.join(projectRoot, 'scripts/run-product-center-item-delivery.ts'), 'utf8');
    expect(delivery).toContain("const fullLive = args.has('--full-live')");
    expect(delivery).toContain("const preserveWorkspace = args.has('--preserve-workspace')");
    expect(delivery).toContain("{ id: 'authoritative-release-prep', npmScript: 'build:product-center:item-final-release' }");
    expect(delivery).toContain("{ id: 'authoritative-release', npmScript: 'build:product-center:item-final-release' }");
    expect(delivery).toContain("{ id: 'rule-governance', npmScript: 'build:product-center:item-rule-registry' }");
    expect(delivery.indexOf("id: 'authoritative-release-prep'")).toBeLessThan(delivery.indexOf("id: 'rule-governance'"));
    expect(delivery.indexOf("id: 'rule-governance'")).toBeLessThan(
      delivery.indexOf("{ id: 'authoritative-release',"),
    );
    expect(delivery).toContain("...(fullLive ? [{ id: 'live-213'");
    expect(delivery).toContain("nonIdempotentReplayPolicy: 'runner-server-id-reconciliation-required'");
    expect(delivery).toContain("cleanupPolicy: 'finally-and-ui-api-zero-residue'");
    expect(delivery).toContain('workspaceCleanupEnabled: !preserveWorkspace');
    expect(delivery).toContain("path.join(projectRoot, 'utils/product-center-item-test-plan-rules.ts')");
  });

  test('主工程构建应发布单一当前态交付包且不建立 SaaS 版本目录', () => {
    const builder = fs.readFileSync(path.join(projectRoot, 'scripts/build-product-center-item-final-release.ts'), 'utf8');
    expect(builder).toContain("'deliverables/product-center-item'");
    expect(builder).toContain('singleCurrentState: true');
    expect(builder).toContain('historyOwnedByGit: true');
    expect(builder).toContain('archivedAutomationSha256');
    expect(builder).not.toContain('2026-08-11-r1');
  });
});
