import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';

const projectRoot = path.resolve(__dirname, '../..');
const workspaceRoot = path.resolve(projectRoot, '..');
const generatedSpecPath = path.resolve(projectRoot, 'tests/generated/product-center-item-216.generated.spec.ts');
const landingPath = path.resolve(
  workspaceRoot,
  'deliverables/test-plan-governance/product-center-item-group-landing-audit.json',
);
const reportPath = path.resolve(
  workspaceRoot,
  'deliverables/test-plan-governance/product-center-item-dual-fingerprint-migration.json',
);

test.describe('商品用例双指纹过渡适配合同', () => {
  test('可执行商品用例生成3.2双指纹收据且逐用例语义指纹唯一', () => {
    const source = fs.readFileSync(generatedSpecPath, 'utf8');
    expect(source).toContain("receiptVersion: '4.0.0' as const");
    expect(source).toContain('semanticCaseFingerprint: input.item.semanticCaseFingerprint');
    const caseData = source.match(/const allCases = (\[[\s\S]*?\]) as readonly GeneratedCase\[\];\r?\nconst supplementalCaseIds/)?.[1];
    expect(caseData).toBeTruthy();
    const cases = JSON.parse(caseData!) as Array<{ caseId: string; semanticCaseFingerprint?: string }>;
    expect(cases).toHaveLength(211);
    expect(cases.every((item) => /^[a-f0-9]{64}$/.test(item.semanticCaseFingerprint ?? ''))).toBe(true);
    expect(new Set(cases.map((item) => item.semanticCaseFingerprint)).size).toBe(cases.length);
  });

  test('当前裁决使用单一语义指纹且218条均已生成语义指纹', () => {
    const landing = JSON.parse(fs.readFileSync(landingPath, 'utf8')) as {
      modules: Array<{ module: string; assessment: { cases: Array<{
        caseId: string; semanticCaseFingerprint?: string | null; fingerprintMatchMode?: string;
      }> } }>;
    };
    const cases = landing.modules.find((item) => item.module === '商品管理-商品')!.assessment.cases;
    expect(cases).toHaveLength(218);
    expect(cases.every((item) => item.fingerprintMatchMode === 'semantic')).toBe(true);
    expect(cases.every((item) => /^[a-f0-9]{64}$/.test(item.semanticCaseFingerprint ?? ''))).toBe(true);
  });

  test('迁移报告废弃双指纹切换门禁并保留旧结果', () => {
    const report = JSON.parse(fs.readFileSync(reportPath, 'utf8')) as {
      policy: Record<string, boolean | string | number>;
      summary: Record<string, boolean | number>;
      cases: Array<{ caseId: string; transitionStatus: string }>;
    };
    expect(report.policy).toMatchObject({
      activeFingerprintMode: 'semantic',
      receiptVersionForNewRuns: '4.0.0',
      legacyReceiptCompatible: true,
      dualFingerprintTransition: 'deprecated',
      naturalRevalidationOnly: true,
      automaticRerun: false,
      automaticApproval: false,
      pageExecutionTriggered: false,
      browserExecutionCount: 0,
      existingPassedResultsInvalidated: false,
    });
    expect(report.summary).toMatchObject({
      total: 218,
      requiredForCutover: 202,
      eligible: 202,
      'awaiting-dual-receipt': 0,
      excluded: 16,
      cutoverReady: true,
    });
    expect(report.cases).toHaveLength(218);
  });

  test('双指纹进度已进入静态证据闭环且不携带执行参数', () => {
    const source = fs.readFileSync(
      path.resolve(projectRoot, 'scripts/run-product-center-evidence-closure-flow.ts'),
      'utf8',
    );
    expect(source).toContain("id: 'item-dual-fingerprint-migration-progress'");
    expect(source).toContain('scripts/build-product-center-item-dual-fingerprint-migration.ts');
    expect(source).not.toMatch(/item-dual-fingerprint-migration-progress[\s\S]{0,900}--execute/);
  });
});
