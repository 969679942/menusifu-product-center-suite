import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { buildProductCenterTestPlanGenerationV1Artifacts } from '../../scripts/build-product-center-test-plan-generation-v1';
import { diagnoseProductCenterMarkdownTestPlan } from '../../utils/product-center-test-plan-markdown';

test.describe('商品中心测试方案生成准确用例第一版', () => {
  test('应只生成十一条来源明确用例并保持一百一十六条来源缺口 blocked', async () => {
    const outputRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'product-center-generation-v1-'));
    const projectRoot = path.resolve(__dirname, '../..');
    try {
      const paths = buildProductCenterTestPlanGenerationV1Artifacts({ projectRoot, outputRoot });
      const release = JSON.parse(fs.readFileSync(paths.releasePath, 'utf8'));
      const report = JSON.parse(fs.readFileSync(paths.reportPath, 'utf8'));
      const markdown = fs.readFileSync(paths.markdownPath, 'utf8');
      const blocked = JSON.parse(fs.readFileSync(paths.blockedPath, 'utf8'));
      const holdout = JSON.parse(fs.readFileSync(paths.holdoutPath, 'utf8'));

      expect(release.summary).toEqual({
        candidates: 11,
        generated: 11,
        reviewRequired: 0,
        blocked: 116,
        falsePromotions: 0,
      });
      expect(release.cases).toHaveLength(11);
      expect(new Set(release.cases.map((item: { canonicalId: string }) => item.canonicalId)).size)
        .toBe(11);
      expect(release.cases.every((item: {
        canonicalId: string;
        internalCaseId: string;
        sourceCitations: unknown[];
        capabilityIds: string[];
      }) => /^TC-PC-[A-Z0-9]+-[A-Z0-9]+-\d{3}$/.test(item.canonicalId)
        && item.internalCaseId.length > 0
        && item.sourceCitations.length > 0
        && item.capabilityIds[0] === 'navigation.sidebar.open')).toBe(true);
      expect(diagnoseProductCenterMarkdownTestPlan(markdown)).toMatchObject({
        status: 'valid',
        caseCount: 11,
        issues: [],
      });
      expect(markdown).not.toMatch(/^\d+\.\s+\d+\./m);
      expect(blocked.summary).toMatchObject({ total: 116, currentGoalBlocking: 116 });
      expect(blocked.cases).toHaveLength(116);
      expect(blocked.cases.every((item: {
        status: string;
        disposition: string;
        currentGoalBlocking: boolean;
      }) => item.status === 'blocked'
        && item.disposition === 'blocked-source-review'
        && item.currentGoalBlocking === true)).toBe(true);
      expect(JSON.stringify(blocked)).not.toContain('sourceRaw');
      expect(report).toMatchObject({
        status: 'passed-with-blocked',
        naming: { valid: 11, invalid: 0 },
        sourceGate: { generated: 11, blocked: 116, falsePromotions: 0 },
      });
      expect(holdout).toMatchObject({
        policy: { participatesInRelease: false, labelSource: 'human-reviewed-holdout' },
        summary: { total: 36, correct: 36, falsePromotions: 0, falseRejections: 0 },
        quality: {
          expectedCounts: { generated: 15, 'review-required': 21 },
          actualCounts: { generated: 15, 'review-required': 21 },
        },
      });
      expect(holdout.samples.every((item: any) => (
        item.actualDecision === 'generated' || item.actualDecision === 'review-required'
      ))).toBe(true);
      const releaseIds = new Set(release.cases.map((item: any) => item.internalCaseId));
      expect(holdout.samples.every((item: any) => !releaseIds.has(item.caseId))).toBe(true);
      expect(holdout.samples.reduce((counts: Record<string, number>, item: any) => ({
        ...counts,
        [item.productArchetype]: (counts[item.productArchetype] ?? 0) + 1,
      }), {})).toEqual({ standard: 12, combo: 12, addon: 12 });
      expect(new Set(holdout.samples.map((item: any) => item.scenario))).toEqual(new Set([
        'positive', 'boundary', 'blocked', 'review-required', 'format-drift',
      ]));
      for (const productArchetype of ['standard', 'combo', 'addon']) {
        const decisions = new Set(holdout.samples
          .filter((item: any) => item.productArchetype === productArchetype)
          .map((item: any) => item.expectedDecision));
        expect(decisions).toEqual(new Set(['generated', 'review-required']));
      }
      expect(new Set(holdout.samples.flatMap((item: any) => item.issueCodes))).toEqual(new Set([
        'UNKNOWN_MODULE_CODE', 'UNKNOWN_ACTION_CODE', 'INVALID_TITLE', 'PRECONDITION_REQUIRED',
        'ACTION_REQUIRED', 'EXPECTATION_REQUIRED', 'SOURCE_TRACE_REQUIRED',
        'LEGACY_SOURCE_NOT_GENERATABLE', 'INVALID_INFERENCE', 'CONFLICTING_SOURCE',
        'FORMAL_SOURCE_REQUIRED', 'SIDEBAR_ENTRY_REQUIRED', 'CLEANUP_REQUIRED',
      ]));
      expect(holdout.samples
        .filter((item: any) => item.expectedDecision === 'generated')
        .every((item: any) => item.issueCodes.length === 0)).toBe(true);
    } finally {
      fs.rmSync(outputRoot, { recursive: true, force: true });
    }
  });

  test('package 应提供独立构建命令并固化命名规范', async () => {
    const projectRoot = path.resolve(__dirname, '../..');
    const packageJson = JSON.parse(fs.readFileSync(path.join(projectRoot, 'package.json'), 'utf8')) as {
      scripts: Record<string, string>;
    };
    const naming = fs.readFileSync(path.join(projectRoot, 'docs/product-center-test-case-naming.md'), 'utf8');

    expect(packageJson.scripts['build:product-center:test-plan-generation-v1'])
      .toContain('build-product-center-test-plan-generation-v1.ts');
    expect(naming).toContain('TC-PC-<MODULE>-<ACTION>-<NNN>');
    expect(naming).toContain('内部 caseId');
    expect(naming).toContain('不得根据标题');
  });
});
