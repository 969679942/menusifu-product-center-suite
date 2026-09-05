import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { buildProductCenterGroupComboV2Review } from '../../scripts/build-product-center-group-combo-v2-review';

const projectRoot = path.resolve(__dirname, '../..');

test('套餐组 V2 审核包应固化增改废弃和精确自动化状态', () => {
  const result = buildProductCenterGroupComboV2Review();
  expect(result.summary).toEqual({
    total: 46,
    active: 44,
    modified: 33,
    added: 11,
    deprecated: 2,
    automationGenerated: 42,
    automationBlocked: 2,
  });
  const document = JSON.parse(fs.readFileSync(result.jsonPath, 'utf8'));
  const activeCases = document.cases.filter((item: any) => item.disposition !== 'deprecated');
  expect(activeCases.every((item: any) => item.steps.length === item.expectedResults.length)).toBe(true);
  expect(document.cases.find((item: any) => item.id === 'TC-GRP-PKG-001').expectedResults).toHaveLength(3);
  expect(document.cases.find((item: any) => item.id === 'TC-GRP-PKG-003')).toMatchObject({
    disposition: 'modified',
    evidenceLevel: 'observed-negative-runtime',
    automation: { status: 'generated', handlerId: 'combo-empty-items-validation', runtimeVerified: false },
  });
  expect(document.cases.find((item: any) => item.id === 'TC-GRP-PKG-017')).toMatchObject({
    disposition: 'deprecated',
    automation: { status: 'not-generated', blockClassification: 'deprecated' },
  });
  expect(document.cases.find((item: any) => item.id === 'TC-GRP-PKG-046')).toMatchObject({
    disposition: 'added',
    evidenceLevel: 'ui-contract-observed-success-not-verified',
    automation: { status: 'generated', handlerId: 'combo-v2-create-contract', runtimeVerified: false },
  });
  for (const caseId of ['TC-GRP-PKG-034', 'TC-GRP-PKG-035']) {
    expect(document.cases.find((item: any) => item.id === caseId)).toMatchObject({
      automation: { status: 'blocked', blockClassification: 'external-dependency-blocked', runtimeVerified: false },
    });
  }
  const blockedReview = fs.readFileSync(result.blockedReviewMarkdownPath, 'utf8');
  expect(blockedReview.match(/^### TC-GRP-PKG-/gm)).toHaveLength(32);
  expect(blockedReview).toContain('人工已审核：32 条');
  expect(blockedReview).toContain('TC-GRP-PKG-016');
  expect(blockedReview).toContain('TC-GRP-PKG-034');
  expect(blockedReview).toContain('TC-GRP-PKG-035');
});

test('套餐组 V2 执行入口必须仅运行生成资格用例并要求显式实时开关', () => {
  const source = fs.readFileSync(
    path.join(projectRoot, 'scripts/run-product-center-group-combo-v2-review.ts'),
    'utf8',
  );
  expect(source).toContain("binding.caseId.startsWith('TC-GRP-PKG-') && binding.generationAllowed");
  expect(source).toContain("PC_GROUP_COMBO_V2_LIVE !== '1'");
  expect(source).toContain("PC_GROUP_CASE_IDS: executableIds.join(',')");
});
