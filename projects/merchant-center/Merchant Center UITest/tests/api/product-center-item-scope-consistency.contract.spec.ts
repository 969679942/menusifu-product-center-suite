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
  test('应完整对账 216 条正式资产、201 条已完成与 15 条未落地', () => {
    const report = readJson<ConversionReport>(
      'output/product-center-item-formal-full-conversion/latest/product-center-item-formal-full-conversion.json',
    );
    const completed = readAssetIndex('已完成/index.json')
      .cases.filter((item) => item.caseId.startsWith('TC-ITEM-'));
    const unlanded = readAssetIndex('未落地/index.json')
      .cases.filter((item) => item.caseId.startsWith('TC-ITEM-'));
    const formalCaseIds = report.sourceCases.map((item) => item.caseId);
    const indexedCaseIds = [...completed, ...unlanded].map((item) => item.caseId);

    expect(formalCaseIds).toHaveLength(216);
    expect(new Set(formalCaseIds).size).toBe(216);
    expect(completed).toHaveLength(201);
    expect(unlanded).toHaveLength(15);
    expect(new Set(indexedCaseIds)).toEqual(new Set(formalCaseIds));
    expect(unlanded.filter((item) => item.status === 'not-applicable')).toHaveLength(4);
    expect(unlanded.filter((item) => item.status === 'unlanded')).toHaveLength(11);
    for (const caseId of requiredExcludedCaseIds) {
      expect(unlanded.find((item) => item.caseId === caseId)).toMatchObject({
        caseId,
        status: 'not-applicable',
      });
    }
  });

  test('生成入口应登记全部正式用例并显式分类三条转换期不适用用例', () => {
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

    expect(manifest.denominator).toEqual({ formal: 216, notApplicable: 3, executable: 213 });
    expect(manifest.formalCases).toHaveLength(216);
    expect(manifest.cases).toHaveLength(213);
    expect(new Set(manifest.formalCases.map((item) => item.caseId))).toEqual(
      new Set(report.sourceCases.map((item) => item.caseId)),
    );
    expect(manifest.notApplicable).toEqual(conversionNotApplicable);
    expect(conversionNotApplicable).toEqual([...requiredExcludedCaseIds].sort());

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
