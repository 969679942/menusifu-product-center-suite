import { expect, test } from '@playwright/test';
import {
  buildProductCenterRemainingTechnicalBindingGap,
  renderProductCenterRemainingTechnicalBindingGapMarkdown,
} from '../../utils/product-center-remaining-technical-binding-gap';
import type { ProductCenterAuditCandidate } from '../../utils/product-center-unified-audit-source';

const candidate = (overrides: Partial<ProductCenterAuditCandidate> = {}): ProductCenterAuditCandidate => ({
  candidateId: 'candidate-1',
  formalCaseId: 'TC-001',
  title: '创建商品',
  module: '商品',
  preconditions: ['已登录'],
  actions: ['填写名称', '点击保存'],
  expectedResults: ['保存成功'],
  sourceRefs: ['file:source-1'],
  reviewRequired: [],
  ...overrides,
});

test('剩余场景技术绑定缺口保留来源并阻断未授权执行', () => {
  const result = buildProductCenterRemainingTechnicalBindingGap({
    candidates: [candidate(), candidate({ candidateId: 'xmind-1', formalCaseId: null, preconditions: [], actions: [], expectedResults: [], sourceRefs: ['xmind:node-1'] })],
    traces: [
      { caseId: 'TC-001', sourceRefs: ['file:source-1'], entries: [], issues: [], complete: false },
      { caseId: 'xmind-1', sourceRefs: ['xmind:node-1'], entries: [], issues: [], complete: false },
    ],
    sourceFingerprint: 'source-fingerprint',
  });
  expect(result.summary.stableCaseIdCount).toBe(1);
  expect(result.summary.xmindCandidateCount).toBe(1);
  expect(result.entries[1].gapCodes).toContain('STABLE_CASE_ID_REQUIRED');
  expect(result.entries[0].gapCodes).toEqual(expect.arrayContaining([
    'OBSERVATION_CHANNEL_REQUIRED',
    'DATA_PROFILE_REQUIRED',
    'CLEANUP_ADAPTER_REQUIRED',
    'EXECUTION_GRANT_REQUIRED',
  ]));
  expect(result.guardrails.formalBindingGenerationAllowed).toBe(false);
  expect(renderProductCenterRemainingTechnicalBindingGapMarkdown(result)).toContain('不生成正式绑定');
});
