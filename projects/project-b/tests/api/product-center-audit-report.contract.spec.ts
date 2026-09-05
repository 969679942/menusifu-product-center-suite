import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { FileAuditEventStore } from '../../../../Test Automation Platform/src/audit/event-log';
import {
  adaptProductCenterClosureAudit,
  adaptProductCenterExecutionReceipts,
  adaptProductCenterOperationReceipts,
  adaptProductCenterProgress,
  adaptProductCenterRuntimeAudit,
} from '../../adapters/product-center/product-center-audit-event-adapter';
import {
  buildProductCenterAuditFreshness,
  buildProductCenterAuditReport,
  filterProductCenterAuditEvents,
  renderProductCenterAuditHtml,
} from '../../adapters/product-center/product-center-audit-report';
import { buildProductCenterAuditReportFiles } from '../../scripts/build-product-center-audit-report';
import {
  appendProductCenterAuditRunCompleted,
  configureProductCenterAuditRuntime,
} from '../../utils/product-center-audit-runtime';

test.describe('商品中心流程审计适配合同', () => {
  test('默认执行入口应实时记录业务化运行元数据和运行终态', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'product-center-run-audit-'));
    const logPath = path.join(root, 'events.jsonl');
    const previous = { ...process.env };
    try {
      process.env.SYSTEM_TEST_AUDIT_EVENT_LOG = logPath;
      process.env.SYSTEM_TEST_RUN_ID = 'runtime-contract-001';
      process.env.SYSTEM_TEST_LOGICAL_RUN_ID = 'business-run-001';
      process.env.SYSTEM_TEST_RUN_TYPE = '规则复验';
      process.env.SYSTEM_TEST_TRIGGER_TYPE = '业务规则变更触发';
      process.env.SYSTEM_TEST_SCOPE = '商品中心 / 2 个用例';
      const metadata = configureProductCenterAuditRuntime();
      appendProductCenterAuditRunCompleted('completed');
      const store = new FileAuditEventStore({ filePath: logPath });
      const events = store.readAll();
      expect(metadata).toMatchObject({ logicalRunId: 'business-run-001', runType: '规则复验', triggerType: '业务规则变更触发' });
      expect(events.map((event) => event.eventType)).toEqual(['run.started', 'run.completed']);
      expect(events[0].details).toMatchObject({ logicalRunId: 'business-run-001', scope: '商品中心 / 2 个用例', realtime: true });
      expect(store.verifyIntegrity().valid).toBe(true);
    } finally {
      for (const key of Object.keys(process.env)) if (!(key in previous)) delete process.env[key];
      Object.assign(process.env, previous);
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test('应把运行进度和标准收据转换为公共事件且不复制状态裁决', () => {
    const progress = adaptProductCenterProgress([{
      runId: 'run-001', caseId: 'TC-PC-001', phase: 'completed', status: 'passed', updatedAt: '2026-08-28T01:00:00.000Z',
    }]);
    const receipts = adaptProductCenterExecutionReceipts([{
      caseId: 'TC-PC-001', runId: 'run-001', recordedAt: '2026-08-28T01:00:01.000Z',
      status: 'passed', evidenceStatus: 'complete', receiptEvidenceFingerprint: 'a'.repeat(64),
      evidencePath: 'output/run-001/evidence-ledger.json', cleanupEvidence: { apiZeroResidue: true, uiZeroResidue: true },
    }]);

    expect(progress).toEqual([expect.objectContaining({
      applicationId: 'merchant-center', businessDomainId: 'product-center', eventType: 'case.completed',
      caseId: 'TC-PC-001', runId: 'run-001', outcome: 'success',
    })]);
    expect(receipts).toEqual([expect.objectContaining({
      eventType: 'evidence.recorded', caseId: 'TC-PC-001', evidenceRefs: ['output/run-001/evidence-ledger.json'],
    })]);
    expect(receipts.some((event) => event.eventType === 'state.changed')).toBe(false);
  });

  test('纠正合同只应产生候选和批准事实而不伪造执行完成', () => {
    const events = adaptProductCenterRuntimeAudit({
      collectionId: 'audit-001', planId: 'product-center', generatedAt: '2026-08-28T02:00:00.000Z',
      corrections: [{
        caseId: 'TC-PC-002', reviewedCaseFingerprint: 'b'.repeat(64), status: 'human-confirmed-runtime',
        reviewedBy: 'reviewer', reviewedAt: '2026-08-28T02:01:00.000Z',
        resolution: { action: 'correct-case', reason: '纠正预期', patches: { expectedResults: ['新预期'] } },
      }],
    });

    expect(events.map((event) => event.eventType)).toEqual(['correction.candidate', 'correction.approved']);
    expect(events.some((event) => ['correction.started', 'correction.completed'].includes(event.eventType))).toBe(false);
    expect(events[0]).toEqual(expect.objectContaining({
      caseId: 'TC-PC-002', dataChanged: true, beforeFingerprint: 'b'.repeat(64),
      details: expect.objectContaining({ changedFields: ['expectedResults'], affectedCaseIds: ['TC-PC-002'] }),
    }));
  });

  test('闭环审计应保持投影语义而不把快照伪造为逐用例状态迁移', () => {
    const events = adaptProductCenterClosureAudit({
      collectionId: 'closure-001', generatedAt: '2026-08-28T03:00:00.000Z', summary: { total: 2 },
      cases: [{ caseId: 'TC-PC-001', state: 'evidence-passed', actionRequired: false }, { caseId: 'TC-PC-002', state: 'ready', actionRequired: true }],
    });

    expect(events).toHaveLength(1);
    expect(events[0]).toEqual(expect.objectContaining({
      eventType: 'audit.completed',
      details: expect.objectContaining({ projectionOnly: true, actionRequiredCaseIds: ['TC-PC-002'] }),
    }));
  });

  test('报告筛选应纳入商品中心子域并排除其他系统事件', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'product-center-domain-filter-'));
    try {
      const store = new FileAuditEventStore({ filePath: path.join(root, 'events.jsonl') });
      store.appendMany([
        { eventId: 'domain-product', eventType: 'flow.started', occurredAt: '2026-08-28T03:10:00.000Z', actorType: 'system', applicationId: 'merchant-center', businessDomainId: 'product-center' },
        { eventId: 'domain-seasoning', eventType: 'flow.started', occurredAt: '2026-08-28T03:10:01.000Z', actorType: 'system', applicationId: 'merchant-center', businessDomainId: 'product-center-seasoning' },
        { eventId: 'domain-tax', eventType: 'flow.started', occurredAt: '2026-08-28T03:10:02.000Z', actorType: 'system', applicationId: 'merchant-center', businessDomainId: 'store-operations-tax' },
        { eventId: 'foreign-app', eventType: 'flow.started', occurredAt: '2026-08-28T03:10:03.000Z', actorType: 'system', applicationId: 'other-app', businessDomainId: 'product-center' },
      ]);

      expect(filterProductCenterAuditEvents(store.readAll()).map((event) => event.eventId)).toEqual([
        'domain-product', 'domain-seasoning',
      ]);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test('公共事件存储和商品报告应提供脱敏、漏斗、时间线与用例追踪', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'product-center-audit-report-'));
    try {
      const store = new FileAuditEventStore({ filePath: path.join(root, 'events.jsonl') });
      const inputs = [
        ...adaptProductCenterProgress([
          { runId: 'run-001', caseId: 'TC-PC-001', phase: 'started' as const, updatedAt: '2026-08-28T04:00:00.000Z' },
          { runId: 'run-001', caseId: 'TC-PC-001', phase: 'completed' as const, status: 'passed', updatedAt: '2026-08-28T04:00:02.000Z' },
        ]),
        ...adaptProductCenterRuntimeAudit({
          collectionId: 'audit-002', generatedAt: '2026-08-28T04:01:00.000Z', corrections: [{
            caseId: 'TC-PC-001', status: 'auto-confirmed-runtime', automatedDecision: { decidedAt: '2026-08-28T04:01:00.000Z', policyId: 'safe-policy' },
            resolution: { action: 'correct-case', patches: { actions: ['新步骤'] }, reason: '运行审计纠正' },
          }],
        }),
      ];
      inputs[0].details = { authorization: 'Bearer private-value', safe: '保留' };
      store.appendMany(inputs);
      const duplicate = store.append(inputs[0]);
      const events = store.readAll();
      const report = buildProductCenterAuditReport(events, { generatedAt: '2026-08-28T05:00:00.000Z' });
      const html = renderProductCenterAuditHtml(report);

      expect(duplicate.duplicate).toBe(true);
      expect(store.verifyIntegrity()).toEqual({ valid: true, count: 4, diagnostics: [] });
      expect(JSON.stringify(events)).not.toContain('private-value');
      expect(report.overview).toEqual(expect.objectContaining({ total: 4, uniqueRuns: 1, uniqueCases: 1 }));
      expect(report.correctionFunnel).toEqual(expect.objectContaining({ candidate: 1, approved: 1, started: 0, completed: 0, affectedCases: 1 }));
      expect(report.caseTracking[0]).toEqual(expect.objectContaining({ caseId: 'TC-PC-001', eventCount: 4 }));
      expect(html).toContain('调用审计');
      expect(html).toContain('流程时间线');
      expect(html).toContain('纠正漏斗');
      expect(html).toContain('用例追踪');
      expect(html).toContain('变更内容');
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test('趋势应按日期内的去重用例统计而不是按运行次数累计', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'product-center-trend-'));
    try {
      const store = new FileAuditEventStore({ filePath: path.join(root, 'events.jsonl') });
      store.appendMany(adaptProductCenterExecutionReceipts([
        {
          caseId: 'TC-TREND-001', runId: 'run-a', recordedAt: '2026-08-28T08:00:00.000Z',
          status: 'passed', evidenceStatus: 'complete', receiptEvidenceFingerprint: 'a'.repeat(64),
        },
        {
          caseId: 'TC-TREND-001', runId: 'run-b', recordedAt: '2026-08-28T09:00:00.000Z',
          status: 'passed', evidenceStatus: 'complete', receiptEvidenceFingerprint: 'b'.repeat(64),
        },
        {
          caseId: 'TC-TREND-002', runId: 'run-c', recordedAt: '2026-08-28T09:30:00.000Z',
          status: 'failed', evidenceStatus: 'complete', receiptEvidenceFingerprint: 'c'.repeat(64),
        },
      ]));
      const report = buildProductCenterAuditReport(store.readAll(), { generatedAt: '2026-08-28T10:00:00.000Z' });
      expect(report.trend).toEqual([expect.objectContaining({ date: '2026-08-28', runs: 3, passed: 1, failed: 1, blocked: 0, notRun: 0 })]);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test('报告命令对相同显式输入应幂等采集并生成稳定产物', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'product-center-report-command-'));
    try {
      const executionIndexPath = path.join(root, 'execution-index.json');
      const outputDirectory = path.join(root, 'report');
      const eventLogPath = path.join(root, 'events.jsonl');
      fs.writeFileSync(executionIndexPath, JSON.stringify({ records: [{
        caseId: 'TC-PC-003', runId: 'run-003', recordedAt: '2026-08-28T06:00:00.000Z',
        status: 'passed', evidenceStatus: 'complete', receiptEvidenceFingerprint: 'c'.repeat(64),
      }] }));
      const options = {
        executionIndexPath, outputDirectory, eventLogPath,
        generatedAt: '2026-08-28T06:00:00.000Z',
        progressPaths: [], runtimeAuditPaths: [], closureAuditPath: path.join(root, 'absent.json'),
      };

      const first = buildProductCenterAuditReportFiles(options);
      const firstJson = fs.readFileSync(first.jsonPath, 'utf8');
      const firstHtml = fs.readFileSync(first.htmlPath, 'utf8');
      const second = buildProductCenterAuditReportFiles(options);

      expect(first).toEqual(expect.objectContaining({ collected: 1, appended: 1, duplicates: 0 }));
      expect(second).toEqual(expect.objectContaining({ collected: 1, appended: 0, duplicates: 1 }));
      expect(fs.readFileSync(second.jsonPath, 'utf8')).toBe(firstJson);
      expect(fs.readFileSync(second.htmlPath, 'utf8')).toBe(firstHtml);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test('报告重建按当前时间评估时效，不延长历史观测有效期', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'product-center-report-clock-'));
    try {
      const observedAt = '2020-01-01T00:00:00.000Z';
      const freshUntil = '2020-01-02T00:00:00.000Z';
      const options = {
        outputDirectory: path.join(root, 'report'),
        eventLogPath: path.join(root, 'events.jsonl'),
        executionIndexPath: path.join(root, 'absent-index.json'),
        closureAuditPath: path.join(root, 'absent-closure.json'),
        progressPaths: [], runtimeAuditPaths: [], auditObservationPaths: [],
        freshness: {
          observedAt, freshUntil,
          executionContext: {
            environmentId: 'fixture', roleId: 'operator', tenantScope: 'fixture',
            locale: 'en-US', sourceScope: 'live', environmentFingerprint: 'e'.repeat(64),
          },
          fingerprints: {
            applicationVersionFingerprint: 'a'.repeat(64), pageContractFingerprint: 'b'.repeat(64),
            apiObservationFingerprint: 'c'.repeat(64), sourceFingerprint: 'd'.repeat(64),
            implementationFingerprint: 'e'.repeat(64), executionContextFingerprint: 'f'.repeat(64),
          },
        },
      };
      const before = Date.now();
      const { report } = buildProductCenterAuditReportFiles(options);
      expect(Date.parse(report.freshness.evaluatedAt)).toBeGreaterThanOrEqual(before);
      expect(Date.parse(report.freshness.evaluatedAt)).toBeLessThanOrEqual(Date.now());
      expect(report.freshness.status).toBe('stale');
      expect(report.observedAt).toBe(observedAt);
      expect(report.freshUntil).toBe(freshUntil);
      const replay = buildProductCenterAuditReportFiles({
        ...options, generatedAt: '2020-01-01T12:00:00.000Z',
      });
      expect(replay.report.freshness.status).toBe('fresh');
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test('当前审计必须具备观测时间、有效期、上下文和来源/实现指纹', () => {
    const complete = {
      observedAt: '2026-08-30T10:00:00.000Z',
      freshUntil: '2026-08-31T10:00:00.000Z',
      evaluatedAt: '2026-08-30T12:00:00.000Z',
      executionContext: {
        environmentId: 'balamxqa', environmentFingerprint: 'e'.repeat(64), roleId: 'merchant-operator',
        tenantScope: 'configured-merchant', locale: 'zh-CN', sourceScope: 'live',
      },
      fingerprints: {
        applicationVersionFingerprint: 'a'.repeat(64), pageContractFingerprint: 'b'.repeat(64),
        apiObservationFingerprint: 'c'.repeat(64), sourceFingerprint: 'd'.repeat(64),
        implementationFingerprint: 'e'.repeat(64), executionContextFingerprint: 'f'.repeat(64),
      },
    };
    const fresh = buildProductCenterAuditFreshness(complete);
    expect(fresh.status).toBe('fresh');
    expect(fresh.observedAt).toBe(complete.observedAt);
    expect(fresh.freshUntil).toBe(complete.freshUntil);
    expect(fresh.executionContext.roleId).toBe('merchant-operator');

    const expired = buildProductCenterAuditFreshness({
      ...complete, evaluatedAt: '2026-09-01T00:00:00.000Z',
    });
    expect(expired.status).toBe('stale');
    expect(expired.reasons).toContain('AUDIT_EXPIRED');

    const contextMismatch = buildProductCenterAuditFreshness({
      ...complete,
      expectedContext: { ...complete.executionContext, locale: 'en-US' },
    });
    expect(contextMismatch.status).toBe('stale');
    expect(contextMismatch.reasons).toContain('AUDIT_CONTEXT_LOCALE_MISMATCH');

    const fingerprintMismatch = buildProductCenterAuditFreshness({
      ...complete,
      expectedApplicationVersionFingerprint: 'f'.repeat(64),
    });
    expect(fingerprintMismatch.status).toBe('stale');
    expect(fingerprintMismatch.reasons).toContain('AUDIT_APPLICATION_VERSION_MISMATCH');
  });

  test('缺少真实观测证据时必须为 invalid，旧报告不能伪装成 current audit', () => {
    const freshness = buildProductCenterAuditFreshness({
      evaluatedAt: '2026-08-30T12:00:00.000Z',
      executionContext: { locale: 'zh-CN' },
      fingerprints: { applicationVersionFingerprint: 'a'.repeat(64) },
    });
    const report = buildProductCenterAuditReport([], { generatedAt: '2026-08-30T12:00:00.000Z', freshness });
    expect(freshness.status).toBe('invalid');
    expect(report.observedAt).toBeNull();
    expect(report.freshness.status).toBe('invalid');
    expect(report.freshness.reasons).toContain('AUDIT_OBSERVED_AT_MISSING');
    expect(report.freshness.reasons).toContain('AUDIT_FRESH_UNTIL_MISSING');
  });

  test('应将执行收据中的每次 API/UI 调用和结构化 Diff 转换为调用级事件', () => {
    const events = adaptProductCenterOperationReceipts([
      {
        operationKey: 'brand-menu:PUT /ops-brand/brand-items/{id}',
        title: '编辑商品', sequence: 2, method: 'PUT', observed: true, status: 'passed',
        durationMs: 125, occurredAt: '2026-08-28T07:00:01.000Z', responseStatus: 200,
        beforeFingerprint: 'a'.repeat(64), afterFingerprint: 'b'.repeat(64), changedFields: ['price', 'name'],
      },
      {
        operationKey: 'ui:click-save', method: 'UI', observed: false, status: 'failed',
        occurredAt: '2026-08-28T07:00:02.000Z',
      },
    ], { runId: 'run-op-1', caseId: 'TC-PC-OP-001', occurredAt: '2026-08-28T07:00:00.000Z', sourcePath: 'evidence.json' });

    expect(events).toHaveLength(2);
    expect(events[0]).toEqual(expect.objectContaining({
      eventType: 'operation.called', runId: 'run-op-1', caseId: 'TC-PC-OP-001',
      outcome: 'success', effectiveSuccess: true, dataChanged: true,
      beforeFingerprint: 'a'.repeat(64), afterFingerprint: 'b'.repeat(64), durationMs: 125,
      details: expect.objectContaining({ operationKey: 'brand-menu:PUT /ops-brand/brand-items/{id}', changedFields: ['name', 'price'], responseStatus: 200 }),
    }));
    expect(events[1]).toEqual(expect.objectContaining({ eventType: 'operation.called', outcome: 'failed', effectiveSuccess: false }));
  });

  test('报告命令应从显式 execution-index evidencePath 导入调用级事件而非扫描历史目录', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'product-center-operation-report-'));
    try {
      const evidencePath = path.join(root, 'evidence-ledger.json');
      const executionIndexPath = path.join(root, 'execution-index.json');
      fs.writeFileSync(evidencePath, JSON.stringify({ generatedAt: '2026-08-28T08:00:00.000Z', cases: [{ caseId: 'TC-PC-OP-002', runtimeEvidence: { operationReceipts: [{ operationKey: 'brand-menu:POST /ops-brand/brand-items/standard', method: 'POST', observed: true, status: 'passed', durationMs: 11, changedFields: ['sku'], beforeFingerprint: 'c'.repeat(64), afterFingerprint: 'd'.repeat(64) }] } }] }));
      fs.writeFileSync(executionIndexPath, JSON.stringify({ records: [{ caseId: 'TC-PC-OP-002', runId: 'run-op-2', recordedAt: '2026-08-28T08:00:01.000Z', status: 'passed', evidenceStatus: 'complete', evidencePath: evidencePath, receiptEvidenceFingerprint: 'e'.repeat(64) }] }));
      const result = buildProductCenterAuditReportFiles({ executionIndexPath, eventLogPath: path.join(root, 'events.jsonl'), outputDirectory: path.join(root, 'report'), progressPaths: [], runtimeAuditPaths: [], closureAuditPath: path.join(root, 'missing.json') });
      expect(result.report.callAudit.find((item) => item.eventType === 'operation.called')?.count).toBe(1);
      expect(result.report.overview.dataChanges).toBe(1);
      expect(result.report.caseTracking[0].changes[0].details).toEqual(expect.objectContaining({ changedFields: ['sku'] }));
    } finally { fs.rmSync(root, { recursive: true, force: true }); }
  });

  test('正式覆盖率应使用审计合同 auditEligible 分母并分离最新与历史收据事实', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'product-center-formal-audit-'));
    try {
      const store = new FileAuditEventStore({ filePath: path.join(root, 'events.jsonl') });
      store.appendMany([
        { eventId: 'requirements', eventType: 'audit.case-classified', occurredAt: '2026-08-28T08:00:00Z', actorType: 'system', applicationId: 'merchant-center', businessDomainId: 'product-center', runId: 'run-new', caseId: 'TC-PC-010', details: { auditRequirements: { schemaVersion: '1.1.0', operationExpected: true, structuredDiffExpected: true, cleanupExpected: true } } },
        { eventId: 'operation', eventType: 'operation.called', occurredAt: '2026-08-28T08:01:00Z', actorType: 'system', applicationId: 'merchant-center', businessDomainId: 'product-center', runId: 'run-new', caseId: 'TC-PC-010', outcome: 'success' },
        { eventId: 'receipt-old', eventType: 'evidence.recorded', occurredAt: '2026-08-27T08:02:00Z', actorType: 'system', applicationId: 'merchant-center', businessDomainId: 'product-center', runId: 'run-old', caseId: 'TC-PC-010', details: { receiptStatus: 'failed', caseFingerprint: 'old-case', implementationFingerprint: 'old-impl' } },
        { eventId: 'receipt-new', eventType: 'evidence.recorded', occurredAt: '2026-08-28T08:02:00Z', actorType: 'system', applicationId: 'merchant-center', businessDomainId: 'product-center', runId: 'run-new', caseId: 'TC-PC-010', beforeFingerprint: 'a', afterFingerprint: 'b', dataChanged: true, details: { receiptStatus: 'passed', caseFingerprint: 'new-case', implementationFingerprint: 'new-impl', cleanupEvidence: { apiZeroResidue: true, uiZeroResidue: true } } },
      ]);
      const report = buildProductCenterAuditReport(store.readAll());
      expect(report.overview.completeness).toEqual(expect.objectContaining({
        status: 'formal', auditEligibleCases: 1, operationCoverageRate: 1, structuredDiffCoverageRate: 1, cleanupCoverageRate: 1,
      }));
      expect(report.caseTracking[0]).toEqual(expect.objectContaining({
        historicalReceiptCount: 1, arbitrationStatus: 'not-provided',
        latestReceipt: expect.objectContaining({ status: 'passed', caseFingerprint: 'new-case', implementationFingerprint: 'new-impl' }),
      }));
    } finally { fs.rmSync(root, { recursive: true, force: true }); }
  });
});
