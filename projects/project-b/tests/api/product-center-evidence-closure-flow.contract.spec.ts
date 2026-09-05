import { expect, test } from '@playwright/test';
import { buildHistoricalEvidenceReconciliation } from '../../scripts/reconcile-product-center-historical-evidence';

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
