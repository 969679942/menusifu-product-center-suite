import { expect, test } from '@playwright/test';
import { buildProductCenterClosureAudit } from '../../scripts/build-product-center-closure-audit';
import { approveProductCenterIncrementalSelection } from '../../scripts/approve-product-center-incremental-selection';

test.describe('商品中心闭环审计门禁', () => {
  test('证据通过、明确变化和证据缺口必须分开处理', async () => {
    const report = buildProductCenterClosureAudit({
      landingReport: {
        generatedAt: '2026-08-20T00:00:00.000Z',
        changeObservation: { status: 'verified', fingerprint: 'b'.repeat(64), source: 'contract-test', stable: true, observedAt: '2026-08-20T00:00:00.000Z' },
        assetIndex: { completed: 3, unlanded: 1 },
        modules: [{
          module: '商品管理-组',
          assessment: {
            planId: 'group',
            summary: {},
            cases: [
              {
                caseId: 'CASE-EXACT', title: '严格通过', status: 'passed', disposition: 'ready',
                automationBound: true, caseFingerprint: 'fp-exact', reasons: [],
                applicabilityStatus: 'valid-at-execution', reuseStatus: 'run-only',
                executionReceipt: { status: 'passed', evidenceStatus: 'complete' },
              },
              {
                caseId: 'CASE-VERSION', title: '版本重取证', status: 'ready', disposition: 'ready',
                automationBound: true, caseFingerprint: 'fp-version', reasons: ['已观测到发布身份变化'],
                applicabilityStatus: 'change-revalidation-required', reuseStatus: 'invalidated', executionReceipt: null,
              },
              {
                caseId: 'CASE-CONTRACT', title: '合同重取证', status: 'ready', disposition: 'ready',
                automationBound: true, caseFingerprint: 'fp-new', reasons: [],
                applicabilityStatus: null, reuseStatus: null, executionReceipt: null,
              },
              {
                caseId: 'CASE-BACKFILL', title: '历史证据补录', status: 'ready', disposition: 'ready',
                automationBound: true, caseFingerprint: 'fp-backfill', reasons: [],
                applicabilityStatus: null, reuseStatus: null, executionReceipt: null,
                historicalExecution: { status: 'runtime-passed', evidenceRefs: ['output/legacy.json'] },
              },
              {
                caseId: 'CASE-DEFERRED', title: '延期', status: 'deferred', disposition: 'deferred',
                automationBound: false, caseFingerprint: null, reasons: ['能力阻断'],
                applicabilityStatus: null, reuseStatus: null, executionReceipt: null,
              },
            ],
          },
        }],
      },
      executionIndex: {
        records: [
          {
            caseId: 'CASE-EXACT', applicationVersionFingerprint: 'b'.repeat(64),
            releaseObservation: { status: 'verified', fingerprint: 'b'.repeat(64), source: 'contract-test', stable: true },
            caseFingerprint: 'fp-exact', evidenceStatus: 'complete',
            status: 'passed', runId: 'run-current', recordedAt: '2026-08-20T00:00:00.000Z',
          },
          {
            caseId: 'CASE-VERSION', applicationVersionFingerprint: 'a'.repeat(64),
            releaseObservation: { status: 'verified', fingerprint: 'a'.repeat(64), source: 'contract-test', stable: true },
            caseFingerprint: 'fp-version', evidenceStatus: 'complete',
            status: 'passed', runId: 'run-old', recordedAt: '2026-08-19T00:00:00.000Z',
          },
        ],
      },
    });

    expect(report.summary).toMatchObject({
      total: 5,
      'evidence-passed': 1,
      'change-revalidation-required': 1,
      'evidence-reconciliation-required': 1,
      'evidence-revalidation-required': 1,
      deferred: 1,
    });
    expect(report.incrementalSelection.approvedCaseIds).toEqual([]);
    expect(report.incrementalSelection.recommendedCaseIds).toEqual(['CASE-CONTRACT', 'CASE-VERSION']);
    expect(report.incrementalSelection.evidenceReconciliationCaseIds).toEqual(['CASE-BACKFILL']);
  });

  test('增量批准必须只接受当前推荐且非空的 caseId', () => {
    const audit = {
      generatedAt: '2026-08-20T00:00:00.000Z',
      source: { changeObservation: { status: 'unavailable', fingerprint: null } },
      incrementalSelection: {
        status: 'pending-explicit-execution',
        recommendedCaseIds: ['TC-ITEM-STD-001'],
        unavailableCaseIds: ['TC-GRP-SPEC-001'],
      },
    };
    const approved = approveProductCenterIncrementalSelection({
      closureAudit: audit,
      caseIds: ['tc-item-std-001', 'TC-ITEM-STD-001'],
      approvedBy: 'contract-test',
      approvedAt: '2026-08-20T00:01:00.000Z',
      caseExecutionFingerprints: { 'TC-ITEM-STD-001': 'sha256:test' },
    });
    expect(approved.approvedCaseIds).toEqual(['TC-ITEM-STD-001']);
    expect(approved.caseExecutionFingerprints).toEqual({ 'TC-ITEM-STD-001': 'sha256:test' });
    expect(() => approveProductCenterIncrementalSelection({
      closureAudit: audit,
      caseIds: [],
      approvedBy: 'contract-test',
    })).toThrow('至少一个 caseId');
    expect(() => approveProductCenterIncrementalSelection({
      closureAudit: audit,
      caseIds: ['TC-GRP-SPEC-001'],
      approvedBy: 'contract-test',
    })).toThrow('未进入当前执行计划');
  });

  test('不稳定的浏览器派生指纹变化不得触发重新执行', () => {
    const report = buildProductCenterClosureAudit({
      landingReport: {
        generatedAt: '2026-08-20T00:00:00.000Z',
        changeObservation: {
          status: 'derived', fingerprint: 'c'.repeat(64), source: 'browser-runtime', stable: false,
        },
        assetIndex: { completed: 1, unlanded: 0 },
        modules: [{
          module: '商品管理-组',
          assessment: {
            planId: 'group',
            summary: {},
            cases: [{
              caseId: 'CASE-DERIVED', title: '派生指纹变化', status: 'passed', disposition: 'ready',
              automationBound: true, caseFingerprint: 'fp-derived', reasons: [],
              applicabilityStatus: 'change-revalidation-required', reuseStatus: 'run-only',
              executionReceipt: { status: 'passed', evidenceStatus: 'complete' },
            }],
          },
        }],
      },
      executionIndex: {
        records: [{
          caseId: 'CASE-DERIVED', applicationVersionFingerprint: 'd'.repeat(64),
          releaseObservation: {
            status: 'derived', fingerprint: 'd'.repeat(64), source: 'browser-runtime', stable: false,
          },
          caseFingerprint: 'fp-derived', evidenceStatus: 'complete',
          status: 'passed', runId: 'run-derived', recordedAt: '2026-08-19T00:00:00.000Z',
        }],
      },
    });
    expect(report.summary['evidence-passed']).toBe(1);
    expect(report.summary['change-revalidation-required']).toBe(0);
    expect(report.incrementalSelection.recommendedCaseIds).toEqual([]);
  });

  test('已确认业务规则变化必须使旧完整收据失效且不影响未命中用例', () => {
    const report = buildProductCenterClosureAudit({
      landingReport: {
        generatedAt: '2026-08-23T00:00:00.000Z',
        changeObservation: {
          status: 'verified', fingerprint: 'b'.repeat(64), source: 'contract-test', stable: true,
        },
        assetIndex: { completed: 2, unlanded: 0 },
        modules: [{
          module: '非特定业务域',
          assessment: {
            planId: 'rule-change-negative-gate',
            summary: {},
            cases: [
              {
                caseId: 'CASE-RULE-CHANGED', title: '规则语义已变化', status: 'passed', disposition: 'ready',
                automationBound: true, caseFingerprint: 'fp-changed',
                reasons: ['执行证据完整且历史通过有效。'],
                applicabilityStatus: 'valid-at-execution', reuseStatus: 'reusable',
                executionReceipt: { status: 'passed', evidenceStatus: 'complete' },
              },
              {
                caseId: 'CASE-UNCHANGED', title: '规则语义未变化', status: 'passed', disposition: 'ready',
                automationBound: true, caseFingerprint: 'fp-unchanged', reasons: [],
                applicabilityStatus: 'valid-at-execution', reuseStatus: 'reusable',
                executionReceipt: { status: 'passed', evidenceStatus: 'complete' },
              },
            ],
          },
        }],
      },
      executionIndex: {
        records: [
          {
            caseId: 'CASE-RULE-CHANGED', applicationVersionFingerprint: 'b'.repeat(64),
            releaseObservation: { status: 'verified', fingerprint: 'b'.repeat(64), source: 'contract-test', stable: true },
            caseFingerprint: 'fp-changed', evidenceStatus: 'complete', status: 'passed',
            runId: 'run-before-rule-change', recordedAt: '2026-08-22T00:00:00.000Z',
          },
          {
            caseId: 'CASE-UNCHANGED', applicationVersionFingerprint: 'b'.repeat(64),
            releaseObservation: { status: 'verified', fingerprint: 'b'.repeat(64), source: 'contract-test', stable: true },
            caseFingerprint: 'fp-unchanged', evidenceStatus: 'complete', status: 'passed',
            runId: 'run-current', recordedAt: '2026-08-22T00:00:00.000Z',
          },
        ],
      },
      executionEligibleCaseIds: ['CASE-RULE-CHANGED', 'CASE-UNCHANGED'],
      businessRuleRerunCaseIds: ['CASE-RULE-CHANGED'],
    });

    expect(report.summary['change-revalidation-required']).toBe(1);
    expect(report.summary['evidence-passed']).toBe(1);
    expect(report.source.businessRuleRerunCaseCount).toBe(1);
    expect(report.incrementalSelection.recommendedCaseIds).toEqual(['CASE-RULE-CHANGED']);
    expect(report.cases.find((item) => item.caseId === 'CASE-RULE-CHANGED')).toMatchObject({
      state: 'change-revalidation-required',
      matchingCompleteReceipts: 1,
      reasons: ['已确认业务规则语义变化，旧执行收据仅保留为历史证据。'],
    });
    expect(report.cases.find((item) => item.caseId === 'CASE-UNCHANGED')?.state).toBe('evidence-passed');
  });

  test('历史证据迁移完成后仅将执行计划内用例接入统一审批', () => {
    const report = buildProductCenterClosureAudit({
      landingReport: {
        generatedAt: '2026-08-20T00:00:00.000Z',
        changeObservation: { status: 'unavailable', fingerprint: null, source: 'unavailable', stable: false },
        assetIndex: { completed: 0, unlanded: 0 },
        modules: [{
          module: '商品管理-商品',
          assessment: {
            planId: 'item',
            summary: {},
            cases: [
              {
                caseId: 'CASE-MIGRATED-READY', title: '迁移后可执行', status: 'ready', disposition: 'ready',
                automationBound: true, caseFingerprint: 'fp-ready', reasons: [], applicabilityStatus: null,
                reuseStatus: null, executionReceipt: null,
                historicalExecution: { status: 'runtime-passed', evidenceRefs: ['output/legacy-ready.json'] },
              },
              {
                caseId: 'CASE-MIGRATED-UNAVAILABLE', title: '迁移后不可执行', status: 'ready', disposition: 'ready',
                automationBound: true, caseFingerprint: 'fp-unavailable', reasons: [], applicabilityStatus: null,
                reuseStatus: null, executionReceipt: null,
                historicalExecution: { status: 'runtime-passed', evidenceRefs: ['output/legacy-unavailable.json'] },
              },
            ],
          },
        }],
      },
      executionIndex: { records: [] },
      executionEligibleCaseIds: ['CASE-MIGRATED-READY'],
      historicalEvidenceReconciliation: {
        generatedAt: '2026-08-20T00:01:00.000Z',
        checkpointKey: 'checkpoint',
        summary: {
          total: 2, reconciliationRequired: 2, legacyEvidenceFound: 2, backfillBlocked: 0,
          standardReceiptBackfilled: 0, noEvidenceSource: 0, alreadyReconciled: 0, rerunCandidates: 2,
        },
        rerunCandidateCaseIds: ['CASE-MIGRATED-READY', 'CASE-MIGRATED-UNAVAILABLE'],
      },
    });

    expect(report.incrementalSelection.recommendedCaseIds).toEqual(['CASE-MIGRATED-READY']);
    expect(report.incrementalSelection.unavailableCaseIds).toEqual(['CASE-MIGRATED-UNAVAILABLE']);
    expect(report.source.migratedRerunCandidateCaseCount).toBe(2);
  });

  test('规则影响用例即使只有历史或已处理投影也必须进入增量推荐', () => {
    const report = buildProductCenterClosureAudit({
      landingReport: {
        generatedAt: '2026-08-30T00:00:00.000Z',
        changeObservation: { status: 'unavailable', fingerprint: null, source: 'unavailable', stable: false },
        assetIndex: { completed: 3, unlanded: 0 },
        modules: [{
          module: '商品管理-商品',
          assessment: {
            planId: 'rule-impact-recommendation', summary: {}, cases: [
              {
                caseId: 'CASE-RULE-HISTORICAL', title: '规则影响的历史收据', status: 'ready', disposition: 'ready',
                automationBound: true, caseFingerprint: 'fp-historical', reasons: [],
                applicabilityStatus: null, reuseStatus: null, executionReceipt: null,
                historicalExecution: { status: 'runtime-passed', evidenceRefs: ['output/legacy.json'] },
              },
              {
                caseId: 'CASE-RULE-HANDLED', title: '规则影响的已处理用例', status: 'handled', disposition: 'ready',
                automationBound: true, caseFingerprint: 'fp-handled', reasons: [],
                applicabilityStatus: null, reuseStatus: null, executionReceipt: null,
                arbitration: { staleProductDefect: false, staleReceipts: 0, handlingStatus: 'handled', actionRequired: false },
              },
              {
                caseId: 'CASE-RULE-DEFERRED', title: '规则影响但延期', status: 'deferred', disposition: 'deferred',
                automationBound: false, caseFingerprint: null, reasons: [],
                applicabilityStatus: null, reuseStatus: null, executionReceipt: null,
              },
            ],
          },
        }],
      },
      executionIndex: { records: [] },
      executionEligibleCaseIds: ['CASE-RULE-HISTORICAL', 'CASE-RULE-HANDLED'],
      businessRuleAffectedCaseIds: ['CASE-RULE-HISTORICAL', 'CASE-RULE-HANDLED', 'CASE-RULE-DEFERRED'],
      businessRuleChangedRuleIds: ['BR-RULE-1'],
    });

    expect(report.incrementalSelection.recommendedCaseIds).toEqual([
      'CASE-RULE-HANDLED', 'CASE-RULE-HISTORICAL',
    ]);
    expect(report.incrementalSelection.recommendedCaseIds).not.toContain('CASE-RULE-DEFERRED');
    expect(report.source.businessRuleAffectedCaseCount).toBe(3);
    expect(report.auditDecision.targetedRuntimeAudit).toBe('required');
  });
});
