import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { buildProductCenterTestPlanIntakeV1Artifacts } from '../../scripts/build-product-center-test-plan-intake-v1';
import {
  buildProductCenterTestPlanIntake,
  type ProductCenterTestPlanAutomationBinding,
} from '../../utils/product-center-test-plan-intake';

test.describe('商品中心真实测试方案输入链路', () => {
  test('应从正式 Markdown 和显式技术绑定生成十一条可自动化用例', async () => {
    const outputRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'product-center-plan-intake-'));
    try {
      const paths = buildProductCenterTestPlanIntakeV1Artifacts({
        projectRoot: path.resolve(__dirname, '../..'),
        outputRoot,
      });
      const release = JSON.parse(fs.readFileSync(paths.releasePath, 'utf8'));
      const bindings = JSON.parse(fs.readFileSync(paths.bindingsPath, 'utf8'));
      const report = JSON.parse(fs.readFileSync(paths.reportPath, 'utf8'));

      expect(release.summary).toMatchObject({
        inputCases: 11,
        generated: 11,
        reviewRequired: 0,
        blockedSources: 116,
        falsePromotions: 0,
      });
      expect(bindings.bindings).toHaveLength(11);
      expect(release.cases).toHaveLength(11);
      expect(release.cases.every((item: any) =>
        item.capabilityIds[0] === 'navigation.sidebar.open'
        && item.assertionAdapterIds.length > 0
        && item.claimIds.length === (
          item.preconditions.length + item.actions.length + item.expectedResults.length
        )
        && item.claims.length === item.claimIds.length
        && item.sourceTrace.length > 0
        && item.sourceTrace.every((trace: any) => trace.sourceIds.length > 0)
        && item.dataPrerequisites.descriptions.length > 0
        && (item.mutatesData === false || item.cleanupAdapterIds.length > 0)
      )).toBe(true);
      expect(report).toMatchObject({
        status: 'passed-with-blocked',
        evaluation: {
          total: 14,
          correct: 14,
          accuracy: 1,
          falsePromotions: 0,
        },
        metadata: {
          complete: 11,
          incomplete: 0,
          sidebarComplete: 11,
          sourceTraceComplete: 11,
        },
      });
      expect(report.evaluation.negativeFixtures).toEqual([
        { id: 'missing-sidebar', expectedIssueCode: 'SIDEBAR_ENTRY_REQUIRED', passed: true },
        { id: 'claim-text-mismatch', expectedIssueCode: 'CLAIM_TEXT_MISMATCH', passed: true },
        { id: 'missing-verification-signal', expectedIssueCode: 'EXPECTATION_NOT_OBSERVABLE', passed: true },
      ]);
    } finally {
      fs.rmSync(outputRoot, { recursive: true, force: true });
    }
  });

  test('技术绑定缺失或未从侧边栏进入时必须进入 review', async () => {
    const projectRoot = path.resolve(__dirname, '../..');
    const outputRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'product-center-plan-gate-'));
    try {
      const paths = buildProductCenterTestPlanIntakeV1Artifacts({ projectRoot, outputRoot });
      const markdown = fs.readFileSync(
        path.join(projectRoot, 'contracts/product-center/test-cases/generated/product-center-test-plan-generation-v1.md'),
        'utf8',
      );
      const bindingDocument = JSON.parse(fs.readFileSync(paths.bindingsPath, 'utf8')) as {
        bindings: ProductCenterTestPlanAutomationBinding[];
      };
      const missingBinding = buildProductCenterTestPlanIntake({
        markdown,
        bindings: bindingDocument.bindings.slice(1),
        deferredBlocked: 116,
      });
      expect(missingBinding.summary).toMatchObject({ generated: 10, reviewRequired: 1 });
      expect(missingBinding.reviewRequired[0].issueCodes).toContain('TECHNICAL_BINDING_REQUIRED');

      const invalidBindings = bindingDocument.bindings.map((item, index) => index === 0
        ? { ...item, capabilityIds: item.capabilityIds.slice(1) }
        : item);
      const invalidSidebar = buildProductCenterTestPlanIntake({
        markdown,
        bindings: invalidBindings,
        deferredBlocked: 116,
      });
      expect(invalidSidebar.summary).toMatchObject({ generated: 10, reviewRequired: 1 });
      expect(invalidSidebar.reviewRequired[0].issueCodes).toContain('SIDEBAR_ENTRY_REQUIRED');

      const invalidClaims = bindingDocument.bindings.map((item, index) => index === 0
        ? {
          ...item,
          claims: item.claims?.map((claim, claimIndex) => (
            claimIndex === 0 ? { ...claim, text: `${claim.text}-changed` } : claim
          )),
        }
        : item);
      const invalidClaimText = buildProductCenterTestPlanIntake({
        markdown,
        bindings: invalidClaims,
      });
      expect(invalidClaimText.summary).toMatchObject({ generated: 10, reviewRequired: 1 });
      expect(invalidClaimText.reviewRequired[0].issueCodes).toContain('CLAIM_TEXT_MISMATCH');
    } finally {
      fs.rmSync(outputRoot, { recursive: true, force: true });
    }
  });

  test('本地流水线应构建并阻断不准确的真实测试方案输入', async () => {
    const projectRoot = path.resolve(__dirname, '../..');
    const packageJson = JSON.parse(fs.readFileSync(path.join(projectRoot, 'package.json'), 'utf8'));
    const pipeline = fs.readFileSync(
      path.join(projectRoot, 'scripts/run-product-center-quality-pipeline.ts'),
      'utf8',
    );
    const intakeCli = fs.readFileSync(
      path.join(projectRoot, 'scripts/build-product-center-test-plan-intake-v1.ts'),
      'utf8',
    );
    const guide = fs.readFileSync(
      path.join(projectRoot, 'docs/product-center-test-plan-intake-v1.md'),
      'utf8',
    );

    expect(packageJson.scripts['build:product-center:test-plan-intake-v1'])
      .toContain('build-product-center-test-plan-intake-v1.ts');
    expect(packageJson.scripts['test:product-center:contract'])
      .toContain('run-product-center-contract-tests.ts');
    expect(fs.readFileSync(path.join(
      projectRoot,
      'contracts/product-center/test-manifests/product-center-contract-tests.json',
    ), 'utf8')).toContain('product-center-test-plan-intake-v1.contract.spec.ts');
    expect(pipeline).toContain("'test-plan-generation-v1'");
    expect(pipeline).toContain("'build:product-center:test-plan-generation-v1'");
    expect(pipeline).toContain("'test-plan-intake-v1'");
    expect(pipeline).toContain("'build:product-center:test-plan-intake-v1'");
    expect(intakeCli).toContain("paths.status === 'review-required'");
    expect(guide).toContain('系统不会根据标题、步骤、行业惯例或现有自动化脚本猜测');
  });
});
