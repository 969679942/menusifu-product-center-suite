import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';

type IndexedCase = {
  caseId: string;
  module?: string;
  status: string;
};

type AssetIndex = {
  cases: IndexedCase[];
};

type ConversionCase = {
  caseId: string;
  reviewDecision: string;
  automationClassification: 'strict-generatable' | 'blocked' | 'not-applicable';
};

type ConversionReport = {
  sourceCases: ConversionCase[];
};

type ConversionManifest = {
  denominator: {
    formal: number;
    notApplicable: number;
    executable: number;
  };
  notApplicable: string[];
  formalCases: Array<{
    caseId: string;
    conversionScope: 'executable' | 'not-applicable';
  }>;
  cases: Array<{ caseId: string }>;
};

const projectRoot = path.resolve(__dirname, '../..');
const assetRoot = path.resolve(projectRoot, '../Merchant Center Info/00-待转换测试方案');
const requiredExcludedCaseIds = [
  'TC-ITEM-PKG-066',
  'TC-ITEM-STD-040',
  'TC-ITEM-STD-060',
] as const;

test.describe('商品模块正式范围一致性', () => {
  test('应完整对账当前正式资产与已完成/未落地索引', () => {
    const report = readJson<ConversionReport>(
      'output/product-center-item-formal-full-conversion/latest/product-center-item-formal-full-conversion.json',
    );
    const completed = readAssetIndex('已完成/index.json')
      .cases.filter((item) => item.caseId.startsWith('TC-ITEM-'));
    const unlanded = readAssetIndex('未落地/index.json')
      .cases.filter((item) => item.caseId.startsWith('TC-ITEM-'));
    const formalCaseIds = report.sourceCases.map((item) => item.caseId);
    const indexedCaseIds = [...completed, ...unlanded].map((item) => item.caseId);

    expect(formalCaseIds.length).toBeGreaterThan(0);
    expect(new Set(formalCaseIds).size).toBe(formalCaseIds.length);
    expect(completed.length + unlanded.length).toBe(formalCaseIds.length);
    expect(new Set(indexedCaseIds)).toEqual(new Set(formalCaseIds));
    const indexNotApplicable = unlanded.filter((item) => item.status === 'not-applicable').map((item) => item.caseId).sort();
    const reportNotApplicable = report.sourceCases.filter((item) => item.automationClassification === 'not-applicable').map((item) => item.caseId).sort();
    expect(indexNotApplicable).toEqual(reportNotApplicable);
    expect(unlanded.filter((item) => item.status === 'unlanded').length).toBeGreaterThanOrEqual(0);
    for (const caseId of requiredExcludedCaseIds) {
      expect(unlanded.find((item) => item.caseId === caseId)).toMatchObject({
        caseId,
        status: 'not-applicable',
      });
    }
  });

  test('生成入口应登记全部正式用例并显式分类转换期不适用用例', () => {
    const report = readJson<ConversionReport>(
      'output/product-center-item-formal-full-conversion/latest/product-center-item-formal-full-conversion.json',
    );
    const manifest = readJson<ConversionManifest>('output/product-center-item-213-conversion.json');
    const generatedSpec = fs.readFileSync(
      path.join(projectRoot, 'tests/generated/product-center-item-216.generated.spec.ts'),
      'utf8',
    );
    const conversionNotApplicable = report.sourceCases
      .filter((item) => item.automationClassification === 'not-applicable')
      .map((item) => item.caseId)
      .sort();

    expect(manifest.denominator.formal).toBe(report.sourceCases.length);
    expect(manifest.denominator.notApplicable).toBe(conversionNotApplicable.length);
    expect(manifest.denominator.executable).toBe(manifest.cases.length);
    expect(manifest.formalCases).toHaveLength(report.sourceCases.length);
    expect(manifest.cases).toHaveLength(report.sourceCases.length - conversionNotApplicable.length);
    expect(new Set(manifest.formalCases.map((item) => item.caseId))).toEqual(
      new Set(report.sourceCases.map((item) => item.caseId)),
    );
    expect(manifest.notApplicable).toEqual(conversionNotApplicable);
    expect(conversionNotApplicable).toEqual([...new Set(conversionNotApplicable)].sort());

    for (const caseId of requiredExcludedCaseIds) {
      expect(report.sourceCases.find((item) => item.caseId === caseId)).toMatchObject({
        caseId,
        reviewDecision: 'deprecated',
        automationClassification: 'not-applicable',
      });
      expect(manifest.formalCases.find((item) => item.caseId === caseId)).toMatchObject({
        caseId,
        conversionScope: 'not-applicable',
      });
      expect(manifest.cases.some((item) => item.caseId === caseId)).toBe(false);
      expect(generatedSpec).toContain(`"caseId": "${caseId}"`);
    }
  });
});

function readJson<T>(relativePath: string): T {
  return JSON.parse(fs.readFileSync(path.join(projectRoot, relativePath), 'utf8')) as T;
}

function readAssetIndex(relativePath: string): AssetIndex {
  return JSON.parse(fs.readFileSync(path.join(assetRoot, relativePath), 'utf8')) as AssetIndex;
}
