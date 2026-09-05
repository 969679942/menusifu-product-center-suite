import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import {
  buildProductCenterGroupCaseFingerprintManifest,
  selectImpactedProductCenterGroupCases,
  type ProductCenterGroupCaseFingerprintBinding,
} from '../../utils/product-center-group-case-fingerprint';

const projectRoot = path.resolve(__dirname, '../..');
const bindings = (JSON.parse(fs.readFileSync(
  path.join(projectRoot, 'contracts/product-center/group/product-center-group-bindings.json'),
  'utf8',
)) as { cases: ProductCenterGroupCaseFingerprintBinding[] }).cases;

test('用例级指纹必须覆盖 handler 实际调用的 flow 页面和工厂声明', () => {
  const manifest = buildProductCenterGroupCaseFingerprintManifest(projectRoot, bindings);
  const detached = manifest.cases.find((item) => item.caseId === 'TC-GRP-SPEC-018');
  expect(detached).toBeDefined();
  expect(detached?.dependencyFiles).toEqual(expect.arrayContaining([
    'utils/product-center-group-runner.ts',
    'flows/product-center/item-216/standard-item-216.flow.ts',
    'pages/product-management/item/item-create-standard.page.ts',
    'test-data/product-center/item-216/standard-item-216.factory.ts',
  ]));
  expect(detached?.dependencySymbols.some((item) => item.includes('StandardItem216Flow.detachReferencedAttributeGroup'))).toBe(true);
  expect(detached?.fingerprint).toMatch(/^[a-f0-9]{64}$/);
});

test('同一 handler 的不同 case 必须因 caseId 与绑定合同得到独立指纹', () => {
  const manifest = buildProductCenterGroupCaseFingerprintManifest(projectRoot, bindings);
  const detached = manifest.cases.filter((item) => item.handlerId === 'detached-reference-group-delete');
  expect(detached.length).toBeGreaterThan(1);
  expect(new Set(detached.map((item) => item.fingerprint)).size).toBe(detached.length);
});

test('handler 实现指纹不得随无关用例集合或输入顺序变化', () => {
  const executable = bindings.filter((item) => item.generationAllowed);
  const targetIds = new Set([
    'TC-GRP-MTH-018', 'TC-GRP-PKG-002', 'TC-GRP-PKG-008',
    'TC-GRP-PKG-036', 'TC-GRP-SPEC-028', 'TC-GRP-TASTE-019',
  ]);
  const targets = bindings.filter((item) => targetIds.has(item.caseId));
  expect(targets).toHaveLength(targetIds.size);
  const full = buildProductCenterGroupCaseFingerprintManifest(projectRoot, [...executable, ...targets], {
    includeSourceRecovery: true,
  });
  const subset = buildProductCenterGroupCaseFingerprintManifest(projectRoot, targets, {
    includeSourceRecovery: true,
  });
  const reversed = buildProductCenterGroupCaseFingerprintManifest(projectRoot, [...targets, ...executable].reverse(), {
    includeSourceRecovery: true,
  });
  for (const caseId of targetIds) {
    const expected = full.cases.find((item) => item.caseId === caseId);
    const selected = subset.cases.find((item) => item.caseId === caseId);
    const reordered = reversed.cases.find((item) => item.caseId === caseId);
    expect(selected?.implementationFingerprint).toBe(expected?.implementationFingerprint);
    expect(reordered?.implementationFingerprint).toBe(expected?.implementationFingerprint);
    expect(selected?.dependencyFiles).toEqual(expected?.dependencyFiles);
    expect(reordered?.dependencySymbols).toEqual(expected?.dependencySymbols);
  }
});

test('用例依赖图不得把页面类全部方法扩散到无关 handler', () => {
  const manifest = buildProductCenterGroupCaseFingerprintManifest(projectRoot, bindings);
  const methodCancel = manifest.cases.find((item) => item.caseId === 'TC-GRP-SPEC-023');
  const addonList = manifest.cases.find((item) => item.caseId === 'TC-GRP-ADD-001');
  expect(methodCancel?.dependencySymbols.some((item) => item.includes('GroupListPage.fillNewestDetailName'))).toBe(true);
  expect(addonList?.dependencySymbols.some((item) => item.includes('GroupListPage.fillNewestDetailName'))).toBe(false);
});

test('增量选择只返回缺少基线或局部指纹变化的用例', () => {
  const current = buildProductCenterGroupCaseFingerprintManifest(projectRoot, bindings);
  const changedCaseId = current.cases[0].caseId;
  const baseline = {
    ...current,
    cases: current.cases.map((item) => item.caseId === changedCaseId
      ? { ...item, fingerprint: '0'.repeat(64) }
      : item),
  };
  const impact = selectImpactedProductCenterGroupCases(current, baseline);
  expect(impact.selectedCaseIds).toEqual([changedCaseId]);
  expect(impact.unchangedCaseIds).toHaveLength(current.cases.length - 1);
  expect(impact.reasons).toEqual([expect.objectContaining({ caseId: changedCaseId, reason: 'dependency-changed' })]);
});

test('影响感知入口必须零变化不运行且仅传递受影响 caseId', () => {
  const source = fs.readFileSync(
    path.join(projectRoot, 'scripts/run-product-center-group-impact-aware.ts'),
    'utf8',
  );
  expect(source).toContain("selectedCaseIds.length === 0");
  expect(source).toContain("PC_GROUP_CASE_IDS: selectedCaseIds.join(',')");
  expect(source).toContain('execution-refinement-evidence-incomplete');
  expect(source).toContain("PC_GROUP_BUILD_REPORT: 'false'");
  expect(source).toContain("'--reuse-report', path.relative(projectRoot, baselineCopyPath)");
});

test('正式报告复用旧证据必须命中局部指纹和原报告运行身份', () => {
  const source = fs.readFileSync(
    path.join(projectRoot, 'scripts/build-product-center-group-final-report.ts'),
    'utf8',
  );
  expect(source).toContain('baselineCase?.caseExecutionFingerprint === caseExecution.fingerprint');
  expect(source).toContain('baselineCase.finalRunId === observed.runId');
  expect(source).toContain('baselineRunJsonFiles.has(observed.jsonEvidence)');
  expect(source).toContain("evidenceReuseMode: reusableBaseline ? 'case-impact-reuse' : 'full-current-execution'");
});
