import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import {
  buildProductCenterGroupTestCases,
  canRegenerateGroupCasesWithHistoricalRuntimeAudit,
} from '../../scripts/build-product-center-group-test-cases';
import { auditProductCenterGroupGeneratedCaseSemantics } from '../../utils/product-center-group-semantic-gate';

const workspaceRoot = path.resolve(__dirname, '../../..');
const outputPath = path.join(workspaceRoot, 'deliverables/product-center-group/test-cases.json');
const markdownPath = path.join(workspaceRoot, 'deliverables/product-center-group/test-cases.md');
const semanticGatePath = path.join(workspaceRoot, 'deliverables/product-center-group/test-case-semantic-gate-report.json');
const reconciliationPath = path.join(workspaceRoot, 'deliverables/product-center-group/audit-reconciliation.json');

test.describe('商品中心组正式用例生成合同', () => {
  test('仅允许证据重新核验完成的旧审计指纹问题降级为待重验', () => {
    expect(canRegenerateGroupCasesWithHistoricalRuntimeAudit({
      status: 'blocked',
      issueCodes: ['RUNTIME_AUDIT_FINGERPRINT_MISMATCH', 'RUNTIME_AUDIT_EVIDENCE_INVALID'],
      expectedCorrectionCount: 4,
      verifiedCorrectionCount: 4,
    })).toBe(true);
    expect(canRegenerateGroupCasesWithHistoricalRuntimeAudit({
      status: 'blocked',
      issueCodes: ['RUNTIME_AUDIT_FINGERPRINT_MISMATCH', 'BUSINESS_ASSERTION_CONFLICT'],
      expectedCorrectionCount: 4,
      verifiedCorrectionCount: 4,
    })).toBe(false);
    expect(canRegenerateGroupCasesWithHistoricalRuntimeAudit({
      status: 'blocked',
      issueCodes: ['RUNTIME_AUDIT_FINGERPRINT_MISMATCH'],
      expectedCorrectionCount: 4,
      verifiedCorrectionCount: 3,
    })).toBe(false);
    expect(canRegenerateGroupCasesWithHistoricalRuntimeAudit({
      status: 'blocked',
      issueCodes: [],
      expectedCorrectionCount: 4,
      verifiedCorrectionCount: 4,
    })).toBe(false);
  });

  test('套餐组正式用例必须应用中文审计反馈和场景修正', async () => {
    buildProductCenterGroupTestCases();
    const document = JSON.parse(fs.readFileSync(outputPath, 'utf8')) as {
      cases: Array<{ id: string; title: string; expectedResults: string[] }>;
    };
    const reconciliation = JSON.parse(fs.readFileSync(reconciliationPath, 'utf8')) as {
      correction: { auditedCaseCorrections: string[]; validatedEvidenceClaims: string[] };
    };
    expect(reconciliation.correction.auditedCaseCorrections).toEqual([
      'TC-GRP-PKG-003',
      'TC-GRP-PKG-027',
      'TC-GRP-PKG-040',
      'TC-GRP-PKG-045',
      'TC-GRP-PKG-037',
      'TC-GRP-PKG-038',
      'TC-GRP-PKG-039',
    ]);
    expect(reconciliation.correction.validatedEvidenceClaims).toEqual([
      'TC-GRP-PKG-003:zh-CN-exact-feedback-and-no-persist',
      'TC-GRP-PKG-027:zh-CN-exact-feedback-and-no-persist',
      'TC-GRP-PKG-040:zh-CN-exact-feedback-and-no-persist',
      'TC-GRP-PKG-045:create-switchable-saved-locked-no-write',
      'TC-GRP-PKG-037:fixed-field-contract-no-write',
      'TC-GRP-PKG-038:optional-field-contract-no-write',
      'TC-GRP-PKG-039:pick-mix-field-contract-no-write',
    ]);
    for (const caseId of ['TC-GRP-PKG-003', 'TC-GRP-PKG-027', 'TC-GRP-PKG-040']) {
      const testCase = document.cases.find((item) => item.id === caseId);
      expect(testCase?.expectedResults[0]).toContain('至少有一个子项');
      expect(testCase?.expectedResults[0]).not.toContain('At least one option is required');
    }
    expect(document.cases.find((item) => item.id === 'TC-GRP-PKG-045')).toMatchObject({
      title: '新增套餐组类型切换后字段随类型更新',
      expectedResults: [
        '三种套餐组类型均可在新增页选择，任一时刻仅有一种类型处于选中状态。',
        '切换类型后，页面展示与当前类型对应的选择规则和商品字段；未执行保存。',
        '已保存套餐组仅保留原类型，三种类型单选项均禁用，编辑页不可切换类型。',
      ],
    });
  });

  test('多条预期结果不得被静默截断', async () => {
    buildProductCenterGroupTestCases();
    const document = JSON.parse(fs.readFileSync(outputPath, 'utf8')) as {
      cases: Array<{ id: string; steps: string[]; expectedResults: string[] }>;
    };
    const case013 = document.cases.find((item) => item.id === 'TC-GRP-SPEC-013');

    expect(case013?.steps).toHaveLength(2);
    expect(case013?.expectedResults).toEqual([
      '规格组 A 列表/详情含 A1、A2。',
      '商品 P 的规格引用集合仍仅含 A1，不含 A2。',
    ]);
  });

  test('139条来源用例的步骤和预期编号必须一一对应', async () => {
    buildProductCenterGroupTestCases();
    const document = JSON.parse(fs.readFileSync(outputPath, 'utf8')) as {
      cases: Array<{ id: string; steps: string[]; expectedResults: string[] }>;
    };
    const sourceCases = document.cases.filter((item) => !item.id.startsWith('TC-GRP-ATTR-'));
    const mismatches = sourceCases
      .filter((item) => item.steps.length !== item.expectedResults.length)
      .map((item) => ({ id: item.id, steps: item.steps.length, expected: item.expectedResults.length }));

    expect(sourceCases).toHaveLength(139);
    expect(mismatches).toEqual([]);
  });

  test('生成阶段必须阻断含糊的加料价格字段和违反正式规则的预期', async () => {
    const base = {
      id: 'TC-GRP-ADD-SEMANTIC',
      module: '商品管理 → 加料组',
      source: 'BR-FMT-005',
      steps: ['新增加料组并选择商品。'],
    };
    const result = auditProductCenterGroupGeneratedCaseSemantics([
      {
        ...base,
        title: '加料价格格式校验',
        steps: ['在加料明细价格输入 `1.999`。'],
        expectedResults: ['保存失败。'],
      },
      {
        ...base,
        id: 'TC-GRP-ADD-RULE-CONFLICT',
        title: '单次加价格式校验',
        steps: ['在单次加价输入 `1.999`。'],
        expectedResults: ['显示精度错误且拒绝保存。'],
      },
    ]);

    expect(result.status).toBe('blocked');
    expect(result.issues.map((issue) => [issue.caseId, issue.kind])).toEqual([
      ['TC-GRP-ADD-SEMANTIC', 'field-identity-ambiguous'],
      ['TC-GRP-ADD-RULE-CONFLICT', 'source-rule-conflict'],
    ]);
  });

  test('人工可读用例与结构化用例必须来自同一修正后对象', async () => {
    buildProductCenterGroupTestCases();
    const document = JSON.parse(fs.readFileSync(outputPath, 'utf8')) as {
      cases: Array<{ id: string; title: string; steps: string[]; expectedResults: string[] }>;
    };
    const markdown = fs.readFileSync(markdownPath, 'utf8');
    const semanticGate = JSON.parse(fs.readFileSync(semanticGatePath, 'utf8')) as {
      status: string;
      checkedCases: number;
      issues: unknown[];
      gates: Record<string, boolean>;
      auditFreshness: {
        verifiedAt: string | null;
        applicationVersionFingerprint: string | null;
        versionComparable: boolean;
        legacyAuditLimitation: string | null;
      };
    };
    const add005 = document.cases.find((item) => item.id === 'TC-GRP-ADD-005');

    expect(add005).toMatchObject({
      title: '加料组内单次加价仅允许数字且超过两位小数按规则四舍五入',
      steps: expect.arrayContaining([expect.stringContaining('「单次加价」')]),
      expectedResults: expect.arrayContaining([expect.stringContaining('四舍五入为 `2.00` 后保存成功')]),
    });
    expect(markdown).toContain(`用例标题：${add005?.title}`);
    expect(markdown).toContain(add005?.steps[0]);
    expect(markdown).toContain(add005?.expectedResults[1]);
    expect(semanticGate).toMatchObject({
      status: 'passed',
      checkedCases: 141,
      issues: [],
      gates: {
        fieldIdentityRequired: true,
        sourceRuleEntailmentRequired: true,
        markdownJsonParityRequired: true,
        arbitraryRouteFieldBindingForbidden: true,
        versionDriftRequiresComparableFingerprints: true,
      },
    });
    expect(semanticGate.auditFreshness).toEqual({
      verifiedAt: expect.any(String),
      applicationVersionFingerprint: null,
      versionComparable: false,
      legacyAuditLimitation: '历史页面审计未记录应用版本指纹，不能据此证明版本变化或签发产品偏差。',
    });
  });
});
