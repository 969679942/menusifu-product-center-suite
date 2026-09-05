import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import {
  fingerprintProductCenterRuntimeAuditableCase,
  fingerprintProductCenterRuntimeAuditablePlan,
  reconcileProductCenterRuntimeAudit,
  type ProductCenterRuntimeAuditCorrectionDocument,
} from '../../utils/product-center-runtime-audit-correction';
import { compileSystemTestPlan } from '../../automation/system-test/system-test-plan-compiler';

const sourceCase = {
  id: 'TC-PC-GROUP-NEG-001',
  title: '无明细时保存失败',
  preconditions: ['已进入新增页。'],
  actions: ['填写唯一名称并点击确定。'],
  expectedResults: ['页面提示英文错误。'],
};

function audit(overrides: Partial<ProductCenterRuntimeAuditCorrectionDocument['corrections'][number]> = {}) {
  return {
    schemaVersion: '1.0.0' as const,
    collectionId: 'fixture-runtime-audit',
    planId: 'fixture-plan',
    generatedAt: '2026-08-16T00:00:00.000Z',
    corrections: [{
      caseId: sourceCase.id,
      reviewedBy: '人工审核',
      reviewedAt: '2026-08-16',
      evidencePaths: ['output/audit/fixture.json'],
      status: 'human-confirmed-runtime' as const,
      observation: {
        locale: 'zh-CN',
        exactUiFeedback: ['至少有一个子项'],
        submitButtonState: 'disabled' as const,
        businessWriteRequest: 'not-sent' as const,
        persisted: 'no' as const,
        uiLookup: 'not-found' as const,
        apiLookup: 'not-found' as const,
      },
      resolution: {
        action: 'correct-case' as const,
        reason: '以中文运行时实际行为为准',
        patches: {
          expectedResults: [
            '中文界面显示 `至少有一个子项`。',
            '确定按钮置灰，不发送业务写请求。',
            'UI 与 API 均查询不到该记录。',
          ],
        },
        assertions: [
          { fact: 'locale', text: '中文界面显示 `至少有一个子项`。'},
          { fact: 'exact-ui-feedback', text: '中文界面显示 `至少有一个子项`。'},
          { fact: 'submit-button-state', text: '确定按钮置灰，不发送业务写请求。'},
          { fact: 'business-write-request', text: '确定按钮置灰，不发送业务写请求。'},
          { fact: 'ui-lookup', text: 'UI 与 API 均查询不到该记录。'},
          { fact: 'api-lookup', text: 'UI 与 API 均查询不到该记录。'},
        ],
      },
      ...overrides,
    }],
  };
}

test.describe('运行时审计校正合同', () => {
  test('按审计合同校正精确提示和阻断状态', () => {
    const result = reconcileProductCenterRuntimeAudit([sourceCase], audit());

    expect(result.status).toBe('passed');
    expect(result.cases[0].expectedResults).toEqual([
      '中文界面显示 `至少有一个子项`。',
      '确定按钮置灰，不发送业务写请求。',
      'UI 与 API 均查询不到该记录。',
    ]);
    expect(result.corrections[0]).toMatchObject({
      caseId: sourceCase.id,
      action: 'correct-case',
      changedFields: ['expectedResults'],
    });
  });

  test('审计事实没有进入预期结果时阻断生成', () => {
    const document = audit();
    document.corrections[0].resolution.patches = { expectedResults: ['页面停留在当前页。'] };
    const result = reconcileProductCenterRuntimeAudit([sourceCase], document);

    expect(result.status).toBe('review-required');
    expect(result.issues[0].code).toBe('RUNTIME_AUDIT_CONFLICT');
  });

  test('未确认、重复或未知目标审计均不能放行', () => {
    const pending = audit();
    pending.corrections[0].status = 'review-required';
    expect(reconcileProductCenterRuntimeAudit([sourceCase], pending).status).toBe('review-required');

    const unknown = audit();
    unknown.corrections[0].caseId = 'TC-PC-UNKNOWN-001';
    expect(reconcileProductCenterRuntimeAudit([sourceCase], unknown).issues[0].code)
      .toBe('RUNTIME_AUDIT_CASE_NOT_FOUND');
  });

  test('页面实际精确提示未逐字登记时不能放行', () => {
    const document = audit();
    document.corrections[0].resolution.assertions = document.corrections[0].resolution.assertions
      .filter((item) => item.fact !== 'exact-ui-feedback');
    const result = reconcileProductCenterRuntimeAudit([sourceCase], document);

    expect(result.status).toBe('review-required');
    expect(result.issues[0].code).toBe('RUNTIME_AUDIT_INVALID');
  });

  test('标准系统测试方案编译器应自动消费同一审计合同', () => {
    const runtimeAudit = audit();
    runtimeAudit.corrections[0] = {
      ...runtimeAudit.corrections[0],
      caseId: 'CASE-READ-001',
      observation: { locale: 'zh-CN', exactUiFeedback: ['实际中文提示'] },
      resolution: {
        action: 'correct-case',
        reason: '以运行时审计为准',
        patches: { expectedResults: ['页面显示 `实际中文提示`。'] },
        assertions: [{ fact: 'exact-ui-feedback', text: '页面显示 `实际中文提示`。' }],
      },
    };
    const result = compileSystemTestPlan({
      plan: {
        schemaVersion: '1.0.0',
        systemId: 'runtime-audit-fixture',
        executionContext: {
          environmentId: 'fixture', locale: 'zh-CN', roleId: 'tester', tenantScope: 'fixture',
          featureFlagFingerprint: createHash('sha256').update('none').digest('hex'),
        },
        sourceRegistry: {
          schemaVersion: '1.0.0',
          sources: [{
            sourceId: 'audit:fixture', kind: 'runtime-evidence', path: 'output/audit/fixture.json',
            fingerprint: createHash('sha256').update('fixture').digest('hex'), verified: true,
            routes: ['/items'], contractIds: ['ui:feedback'], observationChannels: ['ui'],
          }],
        },
        governance: {
          schemaVersion: '1.0.0',
          semanticDuplicatePolicy: { enabled: true, requireVariantEvidence: true },
          assertionSurfaces: [{
            surfaceId: 'ui.feedback', observationChannel: 'ui', authority: 'user-visible',
            routes: ['/items'], fieldIds: ['feedback.message'],
          }],
          contextGuardPolicy: {
            adapterId: 'system.context.fixture', phases: ['before-action', 'before-assertion'],
            requiredChecks: ['route', 'locale', 'role', 'tenant', 'business-identity'],
          },
          feedbackPolicy: {
            exactFeedbackRequiresRuntimeEvidence: true,
            mutationFeedbackRequiresOperationCorrelation: true,
          },
        },
        runtimeAudit,
        cases: [{
          caseId: 'CASE-READ-001',
          ruleId: 'RULE-READ-001',
          title: '读取页面提示',
          sourceIds: ['audit:fixture'],
          route: '/items',
          action: 'read',
          dataProfileId: 'read',
          coverageIds: ['route:items'],
          contractIds: ['ui:feedback'],
          conditions: ['已进入页面'],
          actions: ['触发校验'],
          expectations: [{
            expected: '旧提示', assertionAdapterId: 'system.assert.feedback', observationChannel: 'ui',
            authority: 'user-visible', terminalCondition: '提示稳定可见', fieldId: 'feedback.message',
            assertionSurfaceId: 'ui.feedback',
            feedback: { mode: 'exact-message', trigger: 'pre-submit', exactText: '实际中文提示' },
            sourceIds: ['audit:fixture'], contractIds: ['ui:feedback'],
          }],
          capabilities: [{ id: 'navigation.open-items' }],
          semantics: {
            businessObjectId: 'feedback', scenarioFamilyId: 'validation', stateTransitionId: 'trigger-message',
            scopeId: 'items', variantId: 'runtime-correction', variantSourceIds: ['audit:fixture'],
            businessIdentityStrategy: 'none',
          },
        }],
      },
      dataProfiles: {
        read: {
          mutationMode: 'none',
          requiredOperationKeys: [],
          probeAdapterIds: [],
          externalCapabilities: [],
        },
      },
    });

    expect(result.errors).toEqual([]);
    expect(result.ruleLedger.rules[0].outcomes).toEqual(['页面显示 `实际中文提示`。']);
  });

  test('V2 应校验证据清单并同步规则来源技术绑定和覆盖项', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'runtime-audit-v2-'));
    try {
      fs.mkdirSync(path.join(directory, 'audit'));
      const evidencePath = path.join(directory, 'audit/runtime.json');
      fs.writeFileSync(evidencePath, '{"result":"observed"}\n', 'utf8');
      const candidate = {
        ...sourceCase,
        sourceIds: ['prd:group'],
        route: '/old-route',
        coverageIds: ['coverage:old'],
        capabilityIds: ['group.open-old'],
        claims: [{
          id: 'claim:expectation:1',
          kind: 'expectation' as const,
          text: sourceCase.expectedResults[0],
          sourceIds: ['prd:group'],
          evidenceLevel: 'confirmed',
          sourceTrace: { businessBasis: { kind: 'prd-explicit', refs: ['PRD-1'] }, executionEvidence: [] },
        }],
      };
      const document = v2Audit(candidate, evidencePath, directory);
      const result = reconcileProductCenterRuntimeAudit([candidate], document, {
        rootDir: directory,
        expectedPlanId: 'fixture-v2-plan',
        applicationVersionFingerprint: 'app-v2',
        environmentId: 'qa',
        roleId: 'product-admin',
        now: new Date('2026-08-16T12:00:00.000Z'),
      });

      expect(result.status).toBe('passed');
      expect(result.evidence).toEqual({ registered: 1, consumed: 1, unregistered: [], invalid: [] });
      expect(result.cases[0]).toMatchObject({
        route: '/new-route',
        sourceIds: ['prd:group', 'audit:runtime-v2'],
        capabilityIds: ['group.open-new'],
        coverageIds: ['coverage:runtime-state'],
      });
      expect(result.cases[0].claims?.[0]).toMatchObject({
        text: '确定按钮为 disabled，且不发送写请求。',
        sourceIds: ['prd:group', 'audit:runtime-v2'],
        evidenceLevel: 'observed',
      });
      expect(result.businessRuleChanges).toEqual([expect.objectContaining({ ruleId: 'BR-GROUP-RUNTIME-001' })]);
      expect(result.technicalBindingChanges).toEqual([expect.objectContaining({ route: '/new-route' })]);
      expect(result.coverageChanges).toEqual(expect.arrayContaining([
        expect.objectContaining({ coverageId: 'coverage:runtime-state' }),
        expect.objectContaining({ coverageId: 'coverage:old', disposition: 'not-applicable' }),
      ]));
      expect(result.corrections[0].decision).toEqual({
        mode: 'automatic',
        policyId: 'runtime-evidence-safe-v1',
        decidedBy: 'codex:test-expert',
        decidedAt: '2026-08-16T10:00:00.000Z',
        rationale: '证据、指纹、上下文、精确断言和写请求安全门禁均通过',
      });
    } finally {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });

  test('V2 AI 自动裁决越权或缺少写入安全证据时应转人工异常队列', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'runtime-audit-v2-auto-denied-'));
    try {
      fs.mkdirSync(path.join(directory, 'audit'));
      const evidencePath = path.join(directory, 'audit/runtime.json');
      fs.writeFileSync(evidencePath, '{"result":"observed"}\n', 'utf8');

      const policyDenied = v2Audit(sourceCase, evidencePath, directory);
      policyDenied.autoApprovalPolicy!.allowBusinessRuleChanges = false;
      const policyResult = reconcileProductCenterRuntimeAudit([sourceCase], policyDenied, {
        rootDir: directory,
        expectedPlanId: 'fixture-v2-plan',
        now: new Date('2026-08-16T12:00:00.000Z'),
      });
      expect(policyResult.status).toBe('review-required');
      expect(policyResult.corrections).toEqual([]);
      expect(policyResult.issues).toContainEqual(expect.objectContaining({
        caseId: sourceCase.id,
        code: 'RUNTIME_AUDIT_AUTO_APPROVAL_DENIED',
      }));

      const unsafeMutation = v2Audit(sourceCase, evidencePath, directory);
      unsafeMutation.corrections[0].observation = {
        ...unsafeMutation.corrections[0].observation,
        businessWriteRequest: 'sent',
        persisted: 'yes',
        network: [{ method: 'POST', path: '/ops/group', operationKey: 'group.create', outcome: 'sent' }],
      };
      const mutationResult = reconcileProductCenterRuntimeAudit([sourceCase], unsafeMutation, {
        rootDir: directory,
        expectedPlanId: 'fixture-v2-plan',
        now: new Date('2026-08-16T12:00:00.000Z'),
      });
      expect(mutationResult.status).toBe('review-required');
      expect(mutationResult.issues).toContainEqual(expect.objectContaining({
        caseId: sourceCase.id,
        code: 'RUNTIME_AUDIT_AUTO_APPROVAL_DENIED',
      }));
    } finally {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });

  test('V2 AI 自动裁决应按 zh-CN 运行证据逐字回写精确提示', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'runtime-audit-v2-exact-feedback-'));
    try {
      fs.mkdirSync(path.join(directory, 'audit'));
      const evidencePath = path.join(directory, 'audit/runtime.json');
      fs.writeFileSync(evidencePath, '{"feedback":"至少有一个子项"}\n', 'utf8');
      const document = v2Audit(sourceCase, evidencePath, directory);
      const expected = '中文界面逐字显示 `至少有一个子项`，且不发送写请求。';
      document.corrections[0].observation.exactUiFeedback = ['至少有一个子项'];
      document.corrections[0].resolution.patches = { expectedResults: [expected] };
      document.corrections[0].resolution.assertions = [{
        fact: 'exact-ui-feedback', expectedValue: ['至少有一个子项'], text: expected,
      }, {
        fact: 'business-write-request', expectedValue: 'not-sent', text: expected,
      }];

      const result = reconcileProductCenterRuntimeAudit([sourceCase], document, {
        rootDir: directory,
        expectedPlanId: 'fixture-v2-plan',
        now: new Date('2026-08-16T12:00:00.000Z'),
      });

      expect(result.status).toBe('passed');
      expect(result.cases[0].expectedResults).toEqual([expected]);
      expect(result.corrections[0].decision.mode).toBe('automatic');
    } finally {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });

  test('V2 审计应允许未关联用例变化但仍校验每条校正用例指纹', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'runtime-audit-v2-case-fingerprint-'));
    try {
      fs.mkdirSync(path.join(directory, 'audit'));
      const evidencePath = path.join(directory, 'audit/runtime.json');
      fs.writeFileSync(evidencePath, '{"feedback":"至少有一个子项"}\n', 'utf8');
      const document = v2Audit(sourceCase, evidencePath, directory);
      const unrelatedCase = {
        ...sourceCase,
        id: 'TC-UNRELATED-001',
        title: '不相关用例发生变化',
      };

      const result = reconcileProductCenterRuntimeAudit([sourceCase, unrelatedCase], document, {
        rootDir: directory,
        expectedPlanId: 'fixture-v2-plan',
        now: new Date('2026-08-16T12:00:00.000Z'),
      });

      expect(result.status).toBe('passed');
      expect(result.issues.some((item) => item.code === 'RUNTIME_AUDIT_FINGERPRINT_MISMATCH')).toBe(false);
    } finally {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });

  test('V2 应阻断未登记证据、事实值不一致和过期用例指纹', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'runtime-audit-v2-invalid-'));
    try {
      fs.mkdirSync(path.join(directory, 'audit'));
      const evidencePath = path.join(directory, 'audit/runtime.json');
      fs.writeFileSync(evidencePath, '{}\n', 'utf8');
      fs.writeFileSync(path.join(directory, 'audit/unregistered.json'), '{}\n', 'utf8');
      const document = v2Audit(sourceCase, evidencePath, directory);
      document.corrections[0].reviewedCaseFingerprint = '0'.repeat(64);
      document.corrections[0].resolution.assertions[0].expectedValue = 'enabled';
      const result = reconcileProductCenterRuntimeAudit([sourceCase], document, {
        rootDir: directory,
        expectedPlanId: 'fixture-v2-plan',
      });

      expect(result.status).toBe('review-required');
      expect(new Set(result.issues.map((item) => item.code))).toEqual(new Set([
        'RUNTIME_AUDIT_EVIDENCE_UNREGISTERED',
        'RUNTIME_AUDIT_FINGERPRINT_MISMATCH',
      ]));
    } finally {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });

  test('审计决策应支持新增删除拆分和合并用例', () => {
    const caseItem = (id: string) => ({
      id,
      title: id,
      preconditions: ['存在前置数据'],
      actions: ['执行操作'],
      expectedResults: ['审计结果已覆盖。'],
    });
    const document: ProductCenterRuntimeAuditCorrectionDocument = {
      schemaVersion: '1.0.0',
      collectionId: 'fixture-structural-corrections',
      planId: 'fixture-structural-plan',
      generatedAt: '2026-08-16T00:00:00.000Z',
      corrections: [
        structuralCorrection('CASE-A', 'split-case', [caseItem('CASE-A1'), caseItem('CASE-A2')]),
        {
          ...structuralCorrection('CASE-B', 'merge-cases', [caseItem('CASE-BD')]),
          resolution: {
            ...structuralCorrection('CASE-B', 'merge-cases', [caseItem('CASE-BD')]).resolution,
            sourceCaseIds: ['CASE-B', 'CASE-D'],
          },
        },
        structuralCorrection('CASE-E', 'delete-case'),
        structuralCorrection('CASE-C', 'add-case', [caseItem('CASE-C')]),
      ],
    };
    const result = reconcileProductCenterRuntimeAudit(
      [caseItem('CASE-A'), caseItem('CASE-B'), caseItem('CASE-D'), caseItem('CASE-E')],
      document,
    );

    expect(result.status).toBe('passed');
    expect(result.cases.map((item) => item.id).sort()).toEqual(['CASE-A1', 'CASE-A2', 'CASE-BD', 'CASE-C']);
    expect(result.corrections.map((item) => item.action)).toEqual([
      'split-case', 'merge-cases', 'delete-case', 'add-case',
    ]);
  });
});

function structuralCorrection(
  caseId: string,
  action: 'add-case' | 'delete-case' | 'split-case' | 'merge-cases',
  replacementCases?: Array<ReturnType<(typeof structuralCaseFactory)>>,
) {
  return {
    caseId,
    reviewedBy: '人工审核',
    reviewedAt: '2026-08-16',
    evidencePaths: ['output/audit/fixture.json'],
    status: 'human-confirmed-runtime' as const,
    observation: { submitButtonState: 'disabled' as const },
    resolution: {
      action,
      reason: '结构校正测试',
      replacementCases,
      assertions: [{ fact: 'submit-button-state', text: '审计结果已覆盖。' }],
    },
  };
}

function structuralCaseFactory(id: string) {
  return {
    id,
    title: id,
    preconditions: ['存在前置数据'],
    actions: ['执行操作'],
    expectedResults: ['审计结果已覆盖。'],
  };
}

function v2Audit(
  candidate: typeof sourceCase & Record<string, unknown>,
  evidencePath: string,
  rootDir: string,
): ProductCenterRuntimeAuditCorrectionDocument {
  const expected = '确定按钮为 disabled，且不发送写请求。';
  return {
    schemaVersion: '2.0.0' as const,
    collectionId: 'fixture-v2-runtime-audit',
    planId: 'fixture-v2-plan',
    generatedAt: '2026-08-16T10:00:00.000Z',
    planFingerprint: fingerprintProductCenterRuntimeAuditablePlan([candidate]),
    context: {
      applicationVersionFingerprint: 'app-v2',
      environmentId: 'qa',
      roleId: 'product-admin',
      locale: 'zh-CN',
      maxEvidenceAgeDays: 30,
    },
    evidenceDiscovery: { rootPaths: ['audit'], extensions: ['.json'], strict: true },
    autoApprovalPolicy: {
      policyId: 'runtime-evidence-safe-v1',
      enabled: true,
      minimumConsumedEvidence: 1,
      allowedActions: ['no-change', 'correct-case'],
      allowBusinessRuleChanges: true,
      allowTechnicalBindingChanges: true,
      allowCoverageChanges: true,
      requireMutationSafety: true,
    },
    evidenceInventory: [{
      evidenceId: 'audit:runtime-v2',
      path: path.relative(rootDir, evidencePath).replace(/\\/g, '/'),
      sha256: createHash('sha256').update(fs.readFileSync(evidencePath)).digest('hex'),
      observedAt: '2026-08-16T09:00:00.000Z',
      disposition: 'consumed' as const,
      applicationVersionFingerprint: 'app-v2',
      environmentId: 'qa',
      roleId: 'product-admin',
      locale: 'zh-CN',
    }],
    coverageInventory: [{
      coverageId: 'coverage:runtime-state',
      kind: 'state' as const,
      route: '/new-route',
      sourceIds: ['audit:runtime-v2'],
      disposition: 'required' as const,
      linkedCaseIds: [sourceCase.id],
    }],
    corrections: [{
      caseId: sourceCase.id,
      reviewedCaseFingerprint: fingerprintProductCenterRuntimeAuditableCase(candidate),
      evidenceIds: ['audit:runtime-v2'],
      status: 'auto-confirmed-runtime' as const,
      automatedDecision: {
        policyId: 'runtime-evidence-safe-v1',
        decisionEngine: 'codex:test-expert',
        decidedAt: '2026-08-16T10:00:00.000Z',
        rationale: '证据、指纹、上下文、精确断言和写请求安全门禁均通过',
      },
      observation: {
        locale: 'zh-CN',
        route: '/new-route',
        pageMode: 'create' as const,
        applicationVersionFingerprint: 'app-v2',
        environmentId: 'qa',
        roleId: 'product-admin',
        submitButtonState: 'disabled' as const,
        businessWriteRequest: 'not-sent' as const,
        controls: [{ id: 'confirm', state: 'disabled' as const, visible: true }],
        network: [{ method: 'POST', path: '/ops/group', operationKey: 'group.create', outcome: 'not-sent' as const }],
      },
      impacts: { businessRule: 'update' as const, technicalBinding: 'update' as const, coverage: 'update' as const },
      resolution: {
        action: 'correct-case' as const,
        reason: '根据运行时审计同步业务和技术合同',
        patches: { expectedResults: [expected] },
        businessRuleChanges: [{
          action: 'update' as const,
          ruleId: 'BR-GROUP-RUNTIME-001',
          statement: '必填项完整但无明细时确定按钮禁用且不发送写请求',
          sourceIds: ['audit:runtime-v2'],
        }],
        technicalBindingChanges: [{
          caseId: sourceCase.id,
          route: '/new-route',
          capabilityIds: ['group.open-new'],
          verificationSignals: ['ui', 'network'],
          apiOperations: [{ method: 'POST', path: '/ops/group', operationKey: 'group.create' }],
        }],
        coverageChanges: [{
          coverageId: 'coverage:runtime-state',
          kind: 'state' as const,
          route: '/new-route',
          sourceIds: ['audit:runtime-v2'],
          disposition: 'required' as const,
          linkedCaseIds: [sourceCase.id],
        }, {
          coverageId: 'coverage:old',
          kind: 'state' as const,
          route: '/old-route',
          sourceIds: ['audit:runtime-v2'],
          disposition: 'not-applicable' as const,
          linkedCaseIds: [sourceCase.id],
          reason: '运行时审计确认旧覆盖项已被新页面状态替代',
        }],
        assertions: [
          { fact: 'submit-button-state', expectedValue: 'disabled', text: expected },
          { fact: 'business-write-request', expectedValue: 'not-sent', text: expected },
          { fact: 'control:confirm:state', expectedValue: 'disabled', text: expected },
          { fact: 'network:group.create:outcome', expectedValue: 'not-sent', text: expected },
        ],
      },
    }],
  };
}
