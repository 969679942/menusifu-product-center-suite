import { expect, test } from '@playwright/test';
import {
  PRODUCT_CENTER_REMAINING_SCENARIOS,
  buildProductCenterCaseStepTrace,
  buildProductCenterRemainingScenarioReport,
  buildProductCenterXmindSegments,
  classifyProductCenterRemainingFailure,
  discoverProductCenterNegativeCandidates,
  type ProductCenterTraceBinding,
} from '../../utils/product-center-remaining-scenario-execution';
import type { ProductCenterAuditCandidate } from '../../utils/product-center-unified-audit-source';

function candidate(overrides: Partial<ProductCenterAuditCandidate> = {}): ProductCenterAuditCandidate {
  return {
    candidateId: 'candidate-1',
    formalCaseId: 'TC-001',
    title: '商品创建',
    module: '商品',
    preconditions: ['已进入商品中心'],
    actions: ['填写名称', '保存商品'],
    expectedResults: ['表单可见', '商品创建成功'],
    sourceRefs: ['file:source-1'],
    reviewRequired: [],
    ...overrides,
  };
}

test.describe('商品中心剩余场景协调合同', () => {
  test('登记此前 10 个未解决场景且不允许直接业务执行', () => {
    expect(PRODUCT_CENTER_REMAINING_SCENARIOS.map((scenario) => scenario.id)).toEqual([
      'S03', 'S06', 'S08', 'S09', 'S10', 'S15', 'S16', 'S17', 'S21', 'S30',
    ]);
    const result = buildProductCenterRemainingScenarioReport({ candidates: [candidate()] });
    expect(result.report.summary.total).toBe(10);
    expect(result.report.summary.readyForBusinessExecution).toBe(false);
    expect(result.report.executionAllowed).toBe(false);
    expect(result.report.guardrails.existingResultsRerun).toBe(false);
  });

  test('逐步骤追踪保留来源，并在动作与预期数量不一致时阻断完整性', () => {
    const trace = buildProductCenterCaseStepTrace(candidate({ expectedResults: ['商品创建成功'] }));
    expect(trace.issues).toContain('ACTION_EXPECTATION_COUNT_MISMATCH');
    expect(trace.entries.every((entry) => entry.sourceRefs.includes('file:source-1'))).toBe(true);
    expect(trace.complete).toBe(false);
  });

  test('逐步骤绑定观察通道和证据后才可完整', () => {
    const source = candidate();
    const bindings: Record<string, ProductCenterTraceBinding> = {};
    for (const stepKind of ['precondition', 'action', 'expectation'] as const) {
      const count = source[stepKind === 'precondition' ? 'preconditions' : stepKind === 'action' ? 'actions' : 'expectedResults'].length;
      for (let index = 1; index <= count; index += 1) {
        bindings[`${source.candidateId}:${stepKind}:${index}`] = {
          observationChannel: stepKind === 'expectation' ? 'ui' : 'ui',
          evidenceRefs: ['evidence/run-1'],
        };
      }
    }
    expect(buildProductCenterCaseStepTrace(source, bindings).complete).toBe(true);
  });

  test('负向候选只从来源已有语义识别，不凭空新增用例', () => {
    const positive = candidate({ candidateId: 'positive', formalCaseId: 'TC-POS', title: '商品列表展示' });
    const negative = candidate({ candidateId: 'negative', formalCaseId: 'TC-NEG', title: '名称为空不可提交' });
    expect(discoverProductCenterNegativeCandidates([positive, negative]).map((item) => item.formalCaseId)).toEqual(['TC-NEG']);
  });

  test('XMind 候选按模块和大小分段，分段不丢来源', () => {
    const candidates = Array.from({ length: 501 }, (_, index) => candidate({
      candidateId: `candidate-${index}`,
      formalCaseId: null,
      module: index % 2 === 0 ? '商品' : '组',
      sourceRefs: ['file:xmind', `xmind:node-${index}`],
    }));
    const result = buildProductCenterXmindSegments(candidates, { maxSegmentSize: 100 });
    expect(result.candidateCount).toBe(501);
    expect(result.segments.every((segment) => segment.candidateIds.length <= 100 && segment.sourceRefs.length > 0)).toBe(true);
    expect(result.modules.map((module) => module.module)).toEqual(['商品', '组']);
  });

  test('认证、权限、瞬态和产品归因按证据优先级分类', () => {
    expect(classifyProductCenterRemainingFailure({ diagnostic: 'login required' }).category).toBe('auth-blocked');
    expect(classifyProductCenterRemainingFailure({ statusCode: 403, diagnostic: 'Forbidden' }).category).toBe('permission-blocked');
    expect(classifyProductCenterRemainingFailure({ statusCode: 429, diagnostic: 'Too Many Requests' }).retryable).toBe(true);
    expect(classifyProductCenterRemainingFailure({
      diagnostic: 'expected enabled but received disabled',
      pageObserved: true,
      assertionObserved: true,
      contextVerified: true,
      permissionVerified: true,
      dataVerified: true,
      cleanupVerified: true,
      productMismatchConfirmed: true,
    })).toMatchObject({ category: 'product-behavior', productFailure: true });
  });

  test('没有页面证据时只关闭静态追踪、分段和分类，不误报业务场景已解决', () => {
    const result = buildProductCenterRemainingScenarioReport({ candidates: [candidate()] });
    const byId = new Map(result.report.scenarios.map((scenario) => [scenario.id, scenario.status]));
    expect((['S03', 'S06', 'S08', 'S09', 'S10'] as const).every((id) => byId.get(id) === 'blocked')).toBe(true);
    expect(byId.get('S21')).toBe('partial');
    expect(result.report.summary.readyForBusinessExecution).toBe(false);
  });
});
