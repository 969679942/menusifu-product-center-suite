import { expect, test } from '@playwright/test';
import { buildHistoricalEvidenceReconciliation } from '../../scripts/reconcile-product-center-historical-evidence';
import { buildProductCenterEvidenceClosurePreflight } from '../../scripts/run-product-center-evidence-closure-flow';

test.describe('商品中心证据协调与重审触发门禁', () => {
  test('历史证据先协调，不能直接签发通过或自动重跑', () => {
    const report = buildHistoricalEvidenceReconciliation({
      generatedAt: '2026-08-20T02:00:00.000Z',
      closureAudit: {
        generatedAt: '2026-08-20T01:59:00.000Z',
        cases: [
          {
            caseId: 'CASE-HISTORY', module: '商品管理-组', state: 'evidence-reconciliation-required',
            matchingCompleteReceipts: 0, historicalEvidenceRefs: ['output/history.json'],
          },
          {
            caseId: 'CASE-MISSING', module: '商品管理-商品', state: 'evidence-reconciliation-required',
            matchingCompleteReceipts: 0, historicalEvidenceRefs: [],
          },
          {
            caseId: 'CASE-PASSED', module: '商品管理-商品', state: 'evidence-passed',
            matchingCompleteReceipts: 1, historicalEvidenceRefs: ['output/current.json'],
          },
        ],
      },
      resolveEvidencePath: (reference) => reference.endsWith('history.json') ? 'D:/history.json' : null,
      inspectEvidence: (caseId) => caseId === 'CASE-HISTORY'
        ? {
          standardReceipt: false,
          casePresent: true,
          legacyFactsPreserved: true,
          diagnostics: [`${caseId}:HISTORICAL_RECEIPT_SCHEMA_INCOMPLETE`],
        }
        : { standardReceipt: false, casePresent: false, diagnostics: [] },
    });

    expect(report.summary).toMatchObject({
      total: 3,
      reconciliationRequired: 2,
      legacyEvidenceFound: 1,
      backfillBlocked: 0,
      standardReceiptBackfilled: 0,
      noEvidenceSource: 1,
      alreadyReconciled: 1,
      rerunCandidates: 2,
      referenceRepairs: 0,
      legacyFactsPreserved: 1,
    });
    expect(report.rerunCandidateCaseIds).toEqual(['CASE-HISTORY', 'CASE-MISSING']);
    expect(report.cases.find((item) => item.caseId === 'CASE-HISTORY')).toMatchObject({
      status: 'legacy-evidence-found',
      nextAction: 'rerun-candidate',
    });
    expect(report.policy).toEqual({
      neverPromoteFromLegacyEvidence: true,
      legacyEvidenceMustBeInspectedBeforeRerun: true,
      noAutomaticPageExecution: true,
    });
  });
});

test('证据闭环入口一次盘点全部阶段缺口并保持业务执行保护', () => {
  const report = buildProductCenterEvidenceClosurePreflight('D:/workspace', [
    { id: 'audit', inputs: ['input/a.json', 'input/shared.json'], outputs: ['generated/a.json'] },
    { id: 'reconcile', inputs: ['input/b.json', 'input/shared.json', 'generated/a.json'], outputs: ['generated/b.json'] },
  ], '2026-09-07T00:00:00.000Z');

  expect(report).toMatchObject({
    status: 'blocked',
    code: 'EVIDENCE_CLOSURE_PREFLIGHT_INPUTS_MISSING',
    stageCount: 2,
    guardrails: {
      businessExecutionStarted: false,
      liveBusinessWritesEnabled: false,
      existingPassedCasesInvalidated: false,
      secretsPersisted: false,
    },
  });
  expect(report.missingInputs).toEqual([
    { path: 'input/a.json', stages: ['audit'] },
    { path: 'input/b.json', stages: ['reconcile'] },
    { path: 'input/shared.json', stages: ['audit', 'reconcile'] },
  ]);
});
