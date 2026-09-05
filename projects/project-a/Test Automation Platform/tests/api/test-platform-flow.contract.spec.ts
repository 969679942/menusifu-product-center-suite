import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import {
  assertBatchPerformanceGate,
  buildCaseTagGrep,
  resolveSafeBatchWorkers,
} from '../../src/utils/playwright-batch-policy';
import { fingerprintPaths, resolvePipelineStageInputs } from '../../src/utils/idempotent-pipeline';
import { TestExecutionIndex } from '../../src/utils/test-execution-index';
import {
  buildHumanRuleEvidenceManifest,
  canEvidenceSetPassed,
  validateTestEvidenceManifest,
} from '../../src/utils/test-evidence-governance';
import {
  assessTestPlanLanding,
  assertDeliveryCompletion,
  evaluateDeliveryCompletion,
} from '../../src/utils/test-plan-landing-gate';
import {
  buildSystemTestAuditDependencyEnvironment,
  classifyFlowCompletion,
  partitionSystemTestCasesForExecution,
  resolveFlowResumeRunIds,
  resolveFlowExecutionSelection,
  resolveFlowSelection,
  shouldRunAudit,
} from '../../scripts/run-system-test-flow';
import {
  resolveSystemTestCaseSelection,
  resolveSystemTestExecutionMode,
} from '../../scripts/run-system-test';
import { resolveCompilationSelection } from '../../scripts/compile-system-test-plan';
import type { SystemTestManifest } from '../../src/automation/system-test/system-test-contract';
import { fingerprintRuntimeAuditablePlan } from '../../src/utils/test-plan-runtime-audit-correction';
import { assessRuntimeAuditFreshness } from '../../src/utils/runtime-audit-freshness';
import { resolveSystemTestPlatformArtifact } from '../../src/platform-paths';
import {
  beginSystemTestRepairAttempt,
  completeSystemTestRepairAttempt,
  readSystemTestRepairLedger,
} from '../../src/automation/system-test/system-test-repair-attempt-guard';

test.describe('通用测试流程优化门禁', () => {
  test('公共平台产物必须显式绑定项目目录且不能路径越界', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'platform-artifacts-'));
    const previous = process.env.SYSTEM_TEST_ARTIFACT_ROOT;
    delete process.env.SYSTEM_TEST_ARTIFACT_ROOT;
    try {
      expect(() => resolveSystemTestPlatformArtifact('readiness.json')).toThrow(/公共平台不得隐式写入自身目录/);
      expect(resolveSystemTestPlatformArtifact('readiness.json', root)).toBe(path.join(root, 'readiness.json'));
      expect(() => resolveSystemTestPlatformArtifact('../readiness.json', root)).toThrow(/路径越界/);
    } finally {
      if (previous === undefined) delete process.env.SYSTEM_TEST_ARTIFACT_ROOT;
      else process.env.SYSTEM_TEST_ARTIFACT_ROOT = previous;
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test('人工截图可以修正规则但不能签发运行通过', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'human-evidence-'));
    const evidenceRoot = path.join(root, 'evidence');
    fs.mkdirSync(evidenceRoot, { recursive: true });
    fs.writeFileSync(path.join(evidenceRoot, 'rule.png'), Buffer.from('image'));
    const manifest = buildHumanRuleEvidenceManifest({
      workspaceRoot: root,
      evidenceRoot,
      relativeRoot: 'evidence',
      caseIdsByFile: { 'rule.png': ['CASE-001'] },
      generatedAt: '2026-08-19T00:00:00.000Z',
    });
    expect(validateTestEvidenceManifest(manifest, root)).toEqual([]);
    expect(canEvidenceSetPassed(manifest.assets[0])).toBe(false);
    fs.rmSync(root, { recursive: true, force: true });
  });

  test('发布身份变化触发重验，但发布身份缺失不否定完整执行通过', async () => {
    const baseCase = {
      caseId: 'CASE-001', title: '保存成功', disposition: 'ready' as const,
      automationBound: true, caseFingerprint: 'case-v2',
    };
    const stale = assessTestPlanLanding({
      planId: 'demo', applicationVersionFingerprint: 'b'.repeat(64), cases: [baseCase],
      executionRecords: [{
        caseId: 'CASE-001', applicationVersionFingerprint: 'a'.repeat(64), caseFingerprint: 'case-v2',
        status: 'passed', runId: 'run-1', evidencePath: 'run.json', durationMs: 1,
        recordedAt: '2026-08-19T00:00:00.000Z', evidenceStatus: 'complete',
        assertionStatuses: ['verified'],
      }],
    });
    expect(stale.cases[0].status).toBe('ready');
    const current = assessTestPlanLanding({
      planId: 'demo', applicationVersionFingerprint: 'b'.repeat(64), cases: [baseCase],
      executionRecords: [{
        caseId: 'CASE-001', applicationVersionFingerprint: 'b'.repeat(64), caseFingerprint: 'case-v2',
        status: 'passed', runId: 'run-2', evidencePath: 'run.json', durationMs: 1,
        recordedAt: '2026-08-19T00:00:00.000Z', evidenceStatus: 'complete',
        assertionStatuses: ['verified'],
      }],
    });
    expect(current.cases[0].status).toBe('passed');
    const noReleaseIdentity = assessTestPlanLanding({
      planId: 'demo', changeObservation: { status: 'unavailable' }, cases: [baseCase],
      executionRecords: [{
        caseId: 'CASE-001', applicationVersionFingerprint: null, caseFingerprint: 'case-v2',
        status: 'passed', runId: 'run-3', evidencePath: 'run.json', durationMs: 1,
        recordedAt: '2026-08-20T00:00:00.000Z', evidenceStatus: 'complete', reuseStatus: 'run-only',
        assertionStatuses: ['verified'],
      }],
    });
    expect(noReleaseIdentity.cases[0].status).toBe('passed');
    expect(noReleaseIdentity.cases[0].applicabilityStatus).toBe('valid-at-execution');
    expect(noReleaseIdentity.cases[0].reuseStatus).toBe('run-only');

    const unstableDerivedIdentity = assessTestPlanLanding({
      planId: 'demo',
      changeObservation: {
        status: 'derived', fingerprint: 'c'.repeat(64), source: 'browser-runtime', stable: false,
      },
      cases: [baseCase],
      executionRecords: [{
        caseId: 'CASE-001', applicationVersionFingerprint: 'd'.repeat(64), caseFingerprint: 'case-v2',
        releaseObservation: {
          status: 'derived', fingerprint: 'd'.repeat(64), source: 'browser-runtime', stable: false,
        },
        status: 'passed', runId: 'run-4', evidencePath: 'run.json', durationMs: 1,
        recordedAt: '2026-08-20T00:00:00.000Z', evidenceStatus: 'complete', reuseStatus: 'run-only',
        assertionStatuses: ['verified'],
      }],
    });
    expect(unstableDerivedIdentity.cases[0].status).toBe('passed');
    expect(unstableDerivedIdentity.cases[0].applicabilityStatus).toBe('valid-at-execution');
  });

  test('跨方案模块存在来源或技术阻断时不得宣称闭环', async () => {
    const assessment = assessTestPlanLanding({
      planId: 'demo-application-customer-support',
      changeObservation: { status: 'unavailable' },
      cases: [
        {
          caseId: 'TC-DEMO-001', title: '已执行场景', disposition: 'ready',
          automationBound: true, caseFingerprint: 'case-demo-001',
        },
        {
          caseId: 'TC-DEMO-002', title: '来源待审计场景', disposition: 'blocked-source',
          automationBound: false, caseFingerprint: 'case-demo-002',
        },
        {
          caseId: 'TC-DEMO-003', title: '适配器待实现场景', disposition: 'blocked-technical',
          automationBound: false, caseFingerprint: 'case-demo-003',
        },
      ],
      executionRecords: [{
        caseId: 'TC-DEMO-001', applicationVersionFingerprint: null, caseFingerprint: 'case-demo-001',
        status: 'passed', runId: 'run-demo', evidencePath: 'run-demo.json', durationMs: 1,
        recordedAt: '2026-08-24T00:00:00.000Z', evidenceStatus: 'complete', reuseStatus: 'run-only',
        assertionStatuses: ['verified'],
      }],
    });

    expect(assessment.status).toBe('incomplete');
    expect(assessment.completion).toMatchObject({
      deliveryComplete: false,
      acceptedComplete: 1,
      unresolved: 2,
    });
    expect(assessment.summary).toMatchObject({ blockedSource: 1, blockedTechnical: 1 });
  });

  test('分类排除不得被当作模块完成量', async () => {
    const assessment = assessTestPlanLanding({
      planId: 'demo-exclusion-only',
      changeObservation: { status: 'unavailable' },
      cases: [
        {
          caseId: 'TC-DEMO-EXCLUDED-001', title: '延期场景', disposition: 'deferred',
          automationBound: false, caseFingerprint: 'case-deferred',
        },
        {
          caseId: 'TC-DEMO-EXCLUDED-002', title: '不适用场景', disposition: 'not-applicable',
          automationBound: false, caseFingerprint: 'case-na',
        },
      ],
      executionRecords: [],
    });

    expect(assessment.status).toBe('incomplete');
    expect(assessment.completion).toMatchObject({
      deliveryComplete: false,
      acceptedComplete: 0,
      unresolved: 2,
      acceptedStatuses: ['passed', 'handled'],
    });
    expect(assessment.summary).toMatchObject({ deferred: 1, notApplicable: 1 });
    const completion = evaluateDeliveryCompletion({
      total: assessment.summary.total,
      acceptedComplete: assessment.completion.acceptedComplete,
      unresolved: assessment.completion.unresolved,
      classifiedExclusions: assessment.summary.deferred + assessment.summary.notApplicable,
    });
    expect(completion.deliveryComplete).toBe(false);
    expect(() => assertDeliveryCompletion(completion, 'completed')).toThrow(/DELIVERY_COMPLETION_CONTRACT_VIOLATION/);
  });

  test('实现指纹变化后可开启新修复周期但同一实现仍受预算限制', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'repair-budget-by-implementation-'));
    const ledgerPath = path.join(root, 'repair-ledger.json');
    try {
      const common = {
        ledgerPath, applicationId: 'demo', caseId: 'CASE-001', caseFingerprint: 'case-v1', runId: 'run',
      };
      const oldImplementation = 'a'.repeat(64);
      for (let index = 0; index < 3; index += 1) {
        const decision = beginSystemTestRepairAttempt({
          ...common,
          runId: `old-${index}`,
          implementationFingerprint: oldImplementation,
          diagnosisFingerprint: `${String(index + 1).repeat(64)}`,
          policy: { maxCyclesPerCase: 3, maxAttemptsPerCycle: 1 },
        });
        expect(decision.allowed).toBe(true);
        completeSystemTestRepairAttempt({ ledgerPath, attemptId: decision.attempt!.attemptId, status: 'interrupted' });
      }
      const newImplementation = 'b'.repeat(64);
      const next = beginSystemTestRepairAttempt({
        ...common,
        runId: 'new-implementation',
        implementationFingerprint: newImplementation,
        diagnosisFingerprint: 'c'.repeat(64),
      });
      expect(next.allowed).toBe(true);
      const cycles = readSystemTestRepairLedger(ledgerPath).entries[0].cycles;
      expect(cycles).toHaveLength(2);
      expect(cycles[0].attempts).toHaveLength(3);
      expect(cycles[1].attempts).toHaveLength(1);
      expect(cycles.at(-1)?.attempts.at(-1)?.implementationFingerprint).toBe(newImplementation);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
  test('选中多少用例就只应注册并初始化多少用例', async () => {
    assertBatchPerformanceGate({
      selectedCaseIds: ['TC-A-001', 'TC-A-002'],
      registeredCaseIds: ['TC-A-002', 'TC-A-001'],
      fixtureCaseIds: ['TC-A-001', 'TC-A-002'],
      authenticationChecks: 1,
      attemptedCaseIds: ['TC-A-001', 'TC-A-002'],
    });
    const grep = new RegExp(buildCaseTagGrep(['TC-A-002', 'TC-A-001']));
    expect(grep.test('@case-TC-A-001 ')).toBe(true);
    expect(grep.test('@case-TC-A-003 ')).toBe(false);
    expect(() => assertBatchPerformanceGate({
      selectedCaseIds: ['TC-A-001', 'TC-A-002'],
      registeredCaseIds: ['TC-A-001', 'TC-A-002'],
      fixtureCaseIds: ['TC-A-001'],
      authenticationChecks: 2,
      attemptedCaseIds: ['TC-A-001'],
    })).toThrow(/认证检查不得超过 1 次/);
  });

  test('通用增量执行不得把空选择降级为全量运行', async () => {
    expect(resolveFlowSelection([], ['CASE-001', 'CASE-002'])).toEqual([]);
    expect(resolveFlowSelection(['CASE-002', 'CASE-002'], ['CASE-001', 'CASE-002']))
      .toEqual(['CASE-002']);
    expect(() => resolveFlowSelection(['CASE-003'], ['CASE-001', 'CASE-002']))
      .toThrow('SYSTEM_TEST_SELECTION_UNKNOWN_CASE_IDS:CASE-003');
  });

  test('运行入口必须消费 execution-selection，禁止未授权的单条直跑', () => {
    expect(resolveSystemTestCaseSelection({
      explicitCaseIds: [],
      persistedCaseIds: [],
      contractCaseIds: ['CASE-001', 'CASE-002'],
      selectionFileExists: true,
    })).toEqual({ selectedCaseIds: [], noOp: true });
    expect(() => resolveSystemTestCaseSelection({
      explicitCaseIds: ['CASE-002'],
      persistedCaseIds: ['CASE-001'],
      contractCaseIds: ['CASE-001', 'CASE-002'],
      selectionFileExists: true,
    })).toThrow('SYSTEM_TEST_CASES_NOT_IN_EXECUTION_SELECTION:CASE-002');
    expect(resolveSystemTestCaseSelection({
      explicitCaseIds: [],
      persistedCaseIds: [],
      contractCaseIds: ['CASE-001'],
      allowUnscopedSelection: true,
      selectionFileExists: false,
    })).toEqual({ selectedCaseIds: ['CASE-001'], noOp: false });
    expect(resolveSystemTestCaseSelection({
      explicitCaseIds: ['CASE-002'],
      persistedCaseIds: ['CASE-001'],
      contractCaseIds: ['CASE-001', 'CASE-002'],
      fullRegressionAuthorized: true,
      selectionFileExists: true,
    })).toEqual({ selectedCaseIds: ['CASE-002'], noOp: false });
    expect(() => resolveSystemTestCaseSelection({
      explicitCaseIds: ['CASE-UNKNOWN'],
      persistedCaseIds: ['CASE-001'],
      contractCaseIds: ['CASE-001', 'CASE-002'],
      fullRegressionAuthorized: true,
      selectionFileExists: true,
    })).toThrow('SYSTEM_TEST_FULL_REGRESSION_UNKNOWN_CASE_IDS:CASE-UNKNOWN');
  });

  test('受治理全量回归必须选择全部当前合同用例且不依赖增量选择', () => {
    expect(resolveFlowExecutionSelection({
      fullRegression: true,
      selectedCaseIds: ['CASE-001'],
      availableCaseIds: ['CASE-003', 'CASE-001', 'CASE-002', 'CASE-002'],
    })).toEqual(['CASE-001', 'CASE-002', 'CASE-003']);
    expect(resolveFlowExecutionSelection({
      fullRegression: false,
      selectedCaseIds: ['CASE-002'],
      availableCaseIds: ['CASE-001', 'CASE-002'],
    })).toEqual(['CASE-002']);
  });

  test('全量回归不消费整改门禁，增量执行仍必须绑定优化计划', () => {
    expect(resolveSystemTestExecutionMode({
      executionIntent: 'full-regression',
      fullRegressionAuthorized: true,
    })).toBe('full-regression');
    expect(resolveSystemTestExecutionMode({
      executionIntent: 'repair',
      fullRegressionAuthorized: false,
      optimizationPlanPath: 'plan.json',
      optimizationStage: 'canary',
    })).toBe('incremental');
    expect(() => resolveSystemTestExecutionMode({
      executionIntent: 'repair',
      fullRegressionAuthorized: false,
    })).toThrow('OPTIMIZATION_PLAN_REQUIRED_BEFORE_BROWSER');
    expect(() => resolveSystemTestExecutionMode({
      executionIntent: 'full-regression',
      fullRegressionAuthorized: true,
      optimizationPlanPath: 'plan.json',
      optimizationStage: 'batch',
    })).toThrow('FULL_REGRESSION_OPTIMIZATION_MIXED');
  });

  test('已执行完全部选中用例即使存在自动化缺口也必须进入结果分析', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'flow-completion-classification-'));
    const runId = 'run-complete-with-automation-gap';
    const runRoot = path.join(root, 'output/system-test/demo-system', runId);
    fs.mkdirSync(runRoot, { recursive: true });
    try {
      fs.writeFileSync(path.join(runRoot, 'run-report.json'), JSON.stringify({
        failureCategories: ['automation-gap'], securityFindings: 0,
      }));
      fs.writeFileSync(path.join(runRoot, 'evidence-ledger.json'), JSON.stringify({
        summary: { selected: 2, executed: 2, evidenceIncomplete: 1 },
      }));
      expect(classifyFlowCompletion({ rootDir: root, systemId: 'demo-system', runId, exitCode: 1 })).toMatchObject({
        status: 'completed-with-findings',
      });
      expect(classifyFlowCompletion({
        rootDir: root, systemId: 'demo-system', runId: 'run-incomplete', exitCode: 1,
      })).toMatchObject({ status: 'blocked' });
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test('中断恢复只复用已有完整收据批次，选择集变化必须拒绝复用', () => {
    const checkpoint = {
      flowId: 'flow-1', status: 'running' as const,
      selectedCaseIds: ['CASE-001', 'CASE-002'], runIds: ['run-1', 'run-2'],
    };
    expect(resolveFlowResumeRunIds({
      existingCheckpoint: checkpoint,
      flowId: 'flow-1', selectedCaseIds: ['CASE-002', 'CASE-001'], completedRunIds: ['run-1'],
    })).toEqual(['run-1']);
    expect(() => resolveFlowResumeRunIds({
      existingCheckpoint: checkpoint,
      flowId: 'flow-1', selectedCaseIds: ['CASE-003'], completedRunIds: ['run-1'],
    })).toThrow('SYSTEM_TEST_CHECKPOINT_SELECTION_DRIFT');
  });

  test('全量回归必须在租户隔离后按有界数量切批，避免固定时限截断整轮', () => {
    const cases = Array.from({ length: 15 }, (_, index) => ({
      caseId: `CASE-${String(index + 1).padStart(2, '0')}`,
      executionContextProfile: index < 13 ? 'tenant-a' : 'tenant-b',
    }));
    const batches = partitionSystemTestCasesForExecution(
      cases.map((item) => item.caseId),
      cases,
      12,
    );
    expect(batches.map((item) => ({
      profile: item.profile,
      size: item.caseIds.length,
      batchIndex: item.batchIndex,
      batchCount: item.batchCount,
    }))).toEqual([
      { profile: 'tenant-a', size: 12, batchIndex: 1, batchCount: 2 },
      { profile: 'tenant-a', size: 1, batchIndex: 2, batchCount: 2 },
      { profile: 'tenant-b', size: 2, batchIndex: 1, batchCount: 1 },
    ]);
    expect(() => partitionSystemTestCasesForExecution([], [], 0))
      .toThrow('SYSTEM_TEST_BATCH_SIZE_INVALID:0');
  });

  test('旧方案的显式首批集合只能作为兼容输入并标记为 legacy', async () => {
    expect(resolveCompilationSelection({
      changedExecutableCaseIds: ['CASE-001', 'CASE-002'],
      legacyInitialCaseIds: ['CASE-002', 'CASE-001', 'CASE-002'],
      rerunCaseIds: [],
    })).toEqual({
      reason: 'initial-intake', strategy: 'legacy-initial-case-ids', selectedCaseIds: ['CASE-001', 'CASE-002'],
    });
    expect(resolveCompilationSelection({
      changedExecutableCaseIds: ['CASE-001', 'CASE-002'],
      legacyInitialCaseIds: ['CASE-001'],
      rerunCaseIds: ['CASE-002', 'CASE-001'],
    })).toEqual({
      reason: 'initial-intake-and-runtime-audit-change', strategy: 'legacy-initial-case-ids', selectedCaseIds: ['CASE-001', 'CASE-002'],
    });
  });

  test('方案编译器支持显式定向重跑并拒绝未知用例', () => {
    expect(resolveCompilationSelection({
      changedExecutableCaseIds: [],
      legacyInitialCaseIds: [],
      rerunCaseIds: [],
      explicitCaseIds: ['CASE-002'],
      availableCaseIds: ['CASE-001', 'CASE-002'],
    })).toEqual({
      reason: 'explicit-directed-rerun',
      strategy: 'new-or-changed-executable-bindings',
      selectedCaseIds: ['CASE-002'],
    });
    expect(() => resolveCompilationSelection({
      changedExecutableCaseIds: [],
      legacyInitialCaseIds: [],
      rerunCaseIds: [],
      explicitCaseIds: ['CASE-999'],
      availableCaseIds: ['CASE-001'],
    })).toThrow('EXECUTION_SELECTION_UNKNOWN_CASE_IDS:CASE-999');
  });

  test('审计产物缺失、方案变化或审计实现变化时必须重新审计', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'system-test-audit-trigger-'));
    try {
      const planPath = path.join(root, 'plan.json');
      const specPath = path.join(root, 'audit.spec.ts');
      const configPath = path.join(root, 'playwright.config.ts');
      const outputPath = path.join(root, 'runtime-audit.json');
      const cases = [{
        caseId: 'CASE-001', ruleId: 'RULE-001', title: '读取列表', sourceIds: ['source:1'], route: '/items',
        action: 'read', dataProfileId: 'read', coverageIds: ['route:items'], contractIds: ['route:items'],
        conditions: [], actions: [], expectations: [], capabilities: [],
      }];
      fs.writeFileSync(planPath, JSON.stringify({ schemaVersion: '1.0.0', systemId: 'demo', cases }), 'utf8');
      fs.writeFileSync(specPath, 'export {};', 'utf8');
      fs.writeFileSync(configPath, 'export default {};', 'utf8');
      const manifest = {
        execution: {
          audit: { specPath: 'audit.spec.ts', project: 'audit', outputPath: 'runtime-audit.json', trigger: 'when-required' },
          playwrightConfigPath: 'playwright.config.ts',
        },
      } as SystemTestManifest;
      expect(shouldRunAudit({ rootDir: root, planPath, manifest })).toBe(true);
      fs.writeFileSync(outputPath, JSON.stringify({
        schemaVersion: '2.0.0', collectionId: 'audit', planId: 'demo', generatedAt: new Date().toISOString(),
        planFingerprint: fingerprintRuntimeAuditablePlan(cases.map((item) => ({
          caseId: item.caseId, title: item.title, preconditions: item.conditions, actions: item.actions,
          expectedResults: [], route: item.route, sourceIds: item.sourceIds, coverageIds: item.coverageIds,
          capabilityIds: [], assertionAdapterIds: [],
        }))), corrections: [],
      }), 'utf8');
      const future = new Date(Date.now() + 2000);
      fs.utimesSync(outputPath, future, future);
      expect(shouldRunAudit({ rootDir: root, planPath, manifest })).toBe(false);
      fs.writeFileSync(specPath, 'export const changed = true;', 'utf8');
      const newer = new Date(Date.now() + 4000);
      fs.utimesSync(specPath, newer, newer);
      expect(shouldRunAudit({ rootDir: root, planPath, manifest })).toBe(true);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test('审计证据过期或上下文不匹配时必须标记为不可消费', () => {
    const stale = assessRuntimeAuditFreshness({
      observedAt: '2026-08-01T00:00:00.000Z',
      maxAgeDays: 7,
      now: new Date('2026-08-30T00:00:00.000Z'),
    });
    expect(stale).toMatchObject({ status: 'stale', reasons: ['AUDIT_EXPIRED'] });
    const mismatch = assessRuntimeAuditFreshness({
      generatedAt: '2026-08-30T00:00:00.000Z',
      environmentId: 'tenant-a', expectedEnvironmentId: 'tenant-b',
      roleId: 'operator', expectedRoleId: 'viewer',
      locale: 'zh-CN', expectedLocale: 'en-US',
      now: new Date('2026-08-30T00:00:01.000Z'),
    });
    expect(mismatch.status).toBe('stale');
    expect(mismatch.reasons).toEqual(expect.arrayContaining([
      'AUDIT_ENVIRONMENT_MISMATCH', 'AUDIT_ROLE_MISMATCH', 'AUDIT_LOCALE_MISMATCH',
    ]));
  });

  test('审计文档 freshness 到期或运行上下文变化时应重新触发审计', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'system-test-audit-freshness-'));
    try {
      const planPath = path.join(root, 'plan.json');
      const specPath = path.join(root, 'audit.spec.ts');
      const configPath = path.join(root, 'playwright.config.ts');
      const outputPath = path.join(root, 'runtime-audit.json');
      const cases = [{
        caseId: 'CASE-001', ruleId: 'RULE-001', title: '读取列表', sourceIds: ['source:1'], route: '/items',
        action: 'read', dataProfileId: 'read', coverageIds: ['route:items'], contractIds: ['route:items'],
        conditions: [], actions: [], expectations: [], capabilities: [],
      }];
      fs.writeFileSync(planPath, JSON.stringify({ schemaVersion: '1.0.0', systemId: 'demo', cases }), 'utf8');
      fs.writeFileSync(specPath, 'export {};', 'utf8');
      fs.writeFileSync(configPath, 'export default {};', 'utf8');
      const manifest = {
        system: { executionContext: { environmentId: 'env-a', roleId: 'role-a', locale: 'zh-CN' } },
        execution: {
          audit: { specPath: 'audit.spec.ts', project: 'audit', outputPath: 'runtime-audit.json', trigger: 'when-required' },
          playwrightConfigPath: 'playwright.config.ts',
        },
      } as unknown as SystemTestManifest;
      fs.writeFileSync(outputPath, JSON.stringify({
        schemaVersion: '2.0.0', collectionId: 'audit', planId: 'demo', generatedAt: '2026-08-30T00:00:00.000Z',
        freshUntil: '2026-08-29T00:00:00.000Z',
        planFingerprint: fingerprintRuntimeAuditablePlan(cases.map((item) => ({
          caseId: item.caseId, title: item.title, preconditions: item.conditions, actions: item.actions,
          expectedResults: [], route: item.route, sourceIds: item.sourceIds, coverageIds: item.coverageIds,
          capabilityIds: [], assertionAdapterIds: [],
        }))),
        context: { environmentId: 'env-a', roleId: 'role-a', locale: 'zh-CN' }, corrections: [],
      }), 'utf8');
      const now = new Date('2026-08-30T00:00:01.000Z');
      fs.utimesSync(outputPath, now, now);
      expect(shouldRunAudit({ rootDir: root, planPath, manifest })).toBe(true);
      fs.writeFileSync(outputPath, JSON.stringify({
        schemaVersion: '2.0.0', collectionId: 'audit', planId: 'demo', generatedAt: '2026-08-30T00:00:00.000Z',
        freshUntil: '2026-09-30T00:00:00.000Z',
        planFingerprint: fingerprintRuntimeAuditablePlan(cases.map((item) => ({
          caseId: item.caseId, title: item.title, preconditions: item.conditions, actions: item.actions,
          expectedResults: [], route: item.route, sourceIds: item.sourceIds, coverageIds: item.coverageIds,
          capabilityIds: [], assertionAdapterIds: [],
        }))),
        context: { environmentId: 'env-b', roleId: 'role-a', locale: 'zh-CN' }, corrections: [],
      }), 'utf8');
      fs.utimesSync(outputPath, now, now);
      expect(shouldRunAudit({ rootDir: root, planPath, manifest })).toBe(true);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test('审计项目依赖 setup 时必须获得隔离的阶段收据上下文', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'system-test-audit-setup-'));
    try {
      fs.writeFileSync(path.join(root, 'setup.spec.ts'), 'export {};', 'utf8');
      const manifest = {
        system: { systemId: 'demo-system', baseURL: 'https://example.test' },
        execution: {
          audit: {
            specPath: 'audit.spec.ts', project: 'audit', outputPath: 'audit.json',
            trigger: 'when-required', executionContextProfile: 'tenant-a',
          },
          setupSpecPath: 'setup.spec.ts',
        },
      } as SystemTestManifest;
      const env = buildSystemTestAuditDependencyEnvironment({ rootDir: root, manifest });
      expect(env).toMatchObject({
        SYSTEM_TEST_EXECUTION_CONTEXT_PROFILE: 'tenant-a',
        SYSTEM_TEST_STAGE: 'setup',
      });
      expect(env.SYSTEM_TEST_STAGE_RECEIPT).toContain('audit-setup-tenant-a.json');
      expect(env.SYSTEM_TEST_STAGE_FINGERPRINT).toMatch(/^[a-f0-9]{64}$/);
      expect(env.SYSTEM_TEST_CONTEXT_FINGERPRINT).toMatch(/^[a-f0-9]{64}$/);
      expect(env.SYSTEM_TEST_STAGE_IMPLEMENTATION_FINGERPRINT).toMatch(/^[a-f0-9]{64}$/);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test('仅只读或数据隔离用例可启用两个 worker', async () => {
    expect(resolveSafeBatchWorkers(2, [
      { caseId: 'TC-A-001', mode: 'read-only', isolatedData: false, resourceKeys: ['route:a'] },
      { caseId: 'TC-A-002', mode: 'mutation', isolatedData: true, resourceKeys: ['record:b'] },
    ])).toBe(2);
    expect(resolveSafeBatchWorkers(2, [
      { caseId: 'TC-A-001', mode: 'mutation', isolatedData: false, resourceKeys: ['route:a'] },
    ])).toBe(1);
  });

  test('运行账本按运行批次保留历史，并支持可信发布身份精确查询', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'test-execution-index-'));
    const filePath = path.join(root, 'index.json');
    const index = new TestExecutionIndex(filePath);
    const record = {
      caseId: 'TC-A-001',
      applicationVersionFingerprint: 'a'.repeat(64),
      releaseObservation: {
        status: 'verified' as const, fingerprint: 'a'.repeat(64), source: 'test', stable: true,
        observedAt: '2026-08-18T00:00:00.000Z',
      },
      executionEpochId: 'run-1',
      executionContextFingerprint: null,
      caseFingerprint: 'case-v1',
      semanticCaseFingerprint: null,
      implementationFingerprint: null,
      status: 'passed' as const,
      evidenceStatus: 'complete' as const,
      cleanupEvidence: { apiZeroResidue: true, uiZeroResidue: true },
      receiptEvidenceFingerprint: 'c'.repeat(64),
      evidenceFileFingerprint: 'd'.repeat(64),
      reuseStatus: 'reusable' as const,
      runId: 'run-1',
      evidencePath: 'output/run-1.json',
      durationMs: 100,
      recordedAt: '2026-08-18T00:00:00.000Z',
    };
    expect(index.upsert([record])).toBe(true);
    expect(index.upsert([record])).toBe(false);
    expect(index.find('TC-A-001', 'a'.repeat(64), 'case-v1')).toEqual(record);
    expect(index.find('TC-A-001', 'b'.repeat(64), 'case-v1')).toBeUndefined();
    expect(index.upsert([{ ...record, runId: 'run-2', executionEpochId: 'run-2', recordedAt: '2026-08-19T00:00:00.000Z' }])).toBe(true);
    expect(index.snapshot().records).toHaveLength(2);
    expect(index.latestPassed('TC-A-001', 'case-v1')?.runId).toBe('run-2');
    expect(index.upsert([{
      ...record,
      runId: 'legacy-alias',
      executionEpochId: 'run-2',
      recordedAt: '2026-08-19T00:00:00.000Z',
      cleanupEvidence: null,
      receiptEvidenceFingerprint: null,
      evidenceFileFingerprint: null,
    }])).toBe(false);
    expect(index.snapshot().records).toHaveLength(2);
    expect(index.latestPassed('TC-A-001', 'case-v1')?.runId).toBe('run-2');
  });

  test('相同输入应生成一致阶段指纹', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pipeline-fingerprint-'));
    fs.writeFileSync(path.join(root, 'input.txt'), 'stable', 'utf8');
    expect(fingerprintPaths(root, ['input.txt'])).toBe(fingerprintPaths(root, ['input.txt']));
  });

  test('审计阶段应在运行时重新解析动态证据输入', async () => {
    let evidencePath = 'evidence/first.json';
    const stage = { inputs: () => [evidencePath] };
    expect(resolvePipelineStageInputs(stage)).toEqual(['evidence/first.json']);
    evidencePath = 'evidence/second.json';
    expect(resolvePipelineStageInputs(stage)).toEqual(['evidence/second.json']);
  });

  test('剩余用例运行器应保持单进程、非 serial 和批次认证', async () => {
    const runner = fs.readFileSync(path.resolve(__dirname, '../../scripts/run-system-test.ts'), 'utf8');
    const flow = fs.readFileSync(path.resolve(__dirname, '../../scripts/run-system-test-flow.ts'), 'utf8');
    expect(runner).toContain('executableCaseIds.join');
    expect(runner).toContain('blockedCaseIds');
    expect(runner).toContain('`--workers=${input.workers}`');
    expect(runner).not.toContain("for (const caseId of caseIds)");
    expect(flow).toContain('resolveFlowSelection');
  });

  test('产品偏差证据完整时流程标记为已完成且有发现，不误记为技术阻断', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'system-test-flow-findings-'));
    const runRoot = path.join(root, 'output/system-test/demo/run-1');
    fs.mkdirSync(runRoot, { recursive: true });
    fs.writeFileSync(path.join(runRoot, 'run-report.json'), JSON.stringify({
      failureCategories: ['product-failure'], securityFindings: 0,
    }), 'utf8');
    fs.writeFileSync(path.join(runRoot, 'evidence-ledger.json'), JSON.stringify({
      summary: { selected: 3, executed: 3, evidenceIncomplete: 0 },
    }), 'utf8');
    try {
      expect(classifyFlowCompletion({ rootDir: root, systemId: 'demo', runId: 'run-1', exitCode: 1 }))
        .toEqual({ status: 'completed-with-findings', error: '已完成全部选中用例执行，失败分类：product-failure，退出码 1' });
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
