import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import {
  buildRuntimeAuditCorrectionDocumentFromReceipts,
  reconcileProductCenterRuntimeAudit,
} from '../../utils/product-center-runtime-audit-correction';

test.describe('运行收据到审计校正合同', () => {
  test('应从运行收据生成可自动裁决的 V2 合同并通过现有门禁', () => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'runtime-receipt-'));
    try {
      fs.mkdirSync(path.join(rootDir, 'audit'));
      fs.writeFileSync(path.join(rootDir, 'audit/receipt.json'), '{"feedback":"至少需要一个加料选项"}\n', 'utf8');
      const sourceCase = {
        id: 'TC-GRP-ADD-003',
        title: '无加料明细时保存失败',
        preconditions: ['必填项全部填写。'],
        actions: ['点击确定。'],
        expectedResults: ['确定按钮置灰，不发送写请求。'],
      };
      const expected = '中文界面逐字显示 `至少需要一个加料选项`，且不发送写请求。';
      const document = buildRuntimeAuditCorrectionDocumentFromReceipts({
        planId: 'group-plan-v2',
        collectionId: 'group-runtime-receipts',
        cases: [sourceCase],
        rootDir,
        context: {
          applicationVersionFingerprint: 'app-v2',
          environmentId: 'qa',
          roleId: 'product-admin',
          locale: 'zh-CN',
          maxEvidenceAgeDays: 2,
        },
        evidenceDiscovery: { rootPaths: ['audit'], extensions: ['.json'], strict: true },
        receipts: [{
          caseId: sourceCase.id,
          evidencePath: 'audit/receipt.json',
          observedAt: '2026-08-17T00:00:00.000Z',
          observation: {
            locale: 'zh-CN',
            applicationVersionFingerprint: 'app-v2',
            environmentId: 'qa',
            roleId: 'product-admin',
            exactUiFeedback: ['至少需要一个加料选项'],
            submitButtonState: 'disabled',
            businessWriteRequest: 'not-sent',
            persisted: 'no',
            uiLookup: 'not-found',
            apiLookup: 'not-found',
          },
          resolution: {
            action: 'correct-case',
            reason: '以中文运行时实际行为更新精确断言',
            patches: { expectedResults: [expected] },
            assertions: [
              { fact: 'exact-ui-feedback', expectedValue: ['至少需要一个加料选项'], text: expected },
              { fact: 'business-write-request', expectedValue: 'not-sent', text: expected },
            ],
          },
          aiDecision: {
            approved: true,
            engine: 'codex:test-expert',
            decidedAt: '2026-08-17T00:01:00.000Z',
            rationale: '证据完整、版本与语言匹配，未发生业务写入。',
          },
        }],
      });
      const result = reconcileProductCenterRuntimeAudit([sourceCase], document, {
        rootDir,
        expectedPlanId: 'group-plan-v2',
        applicationVersionFingerprint: 'app-v2',
        environmentId: 'qa',
        roleId: 'product-admin',
        now: new Date('2026-08-17T01:00:00.000Z'),
      });
      expect(result.status).toBe('passed');
      expect(result.cases[0].expectedResults).toEqual([expected]);
      expect(result.evidence).toEqual({ registered: 1, consumed: 1, unregistered: [], invalid: [] });
      expect(result.corrections[0].decision.mode).toBe('automatic');
    } finally {
      fs.rmSync(rootDir, { recursive: true, force: true });
    }
  });

  test('缺少 AI 批准时应自动进入人工异常队列', () => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'runtime-receipt-review-'));
    try {
      fs.mkdirSync(path.join(rootDir, 'audit'));
      fs.writeFileSync(path.join(rootDir, 'audit/receipt.json'), '{}\n', 'utf8');
      const document = buildRuntimeAuditCorrectionDocumentFromReceipts({
        planId: 'plan', collectionId: 'receipts', rootDir,
        context: {
          applicationVersionFingerprint: 'app', environmentId: 'qa', roleId: 'admin',
          locale: 'zh-CN', maxEvidenceAgeDays: 1,
        },
        cases: [{ id: 'CASE-1', title: '用例', preconditions: [], actions: [], expectedResults: ['旧结果'] }],
        receipts: [{
          caseId: 'CASE-1', evidencePath: 'audit/receipt.json', observedAt: '2026-08-17T00:00:00.000Z',
          observation: { locale: 'zh-CN', businessWriteRequest: 'not-sent' },
          resolution: {
            action: 'correct-case', reason: '待审核', patches: { expectedResults: ['新结果'] },
            assertions: [{ fact: 'business-write-request', expectedValue: 'not-sent', text: '新结果' }],
          },
        }],
      });
      const result = reconcileProductCenterRuntimeAudit([{ id: 'CASE-1', title: '用例', preconditions: [], actions: [], expectedResults: ['旧结果'] }], document, {
        rootDir, expectedPlanId: 'plan', applicationVersionFingerprint: 'app', environmentId: 'qa', roleId: 'admin',
      });
      expect(result.status).toBe('review-required');
      expect(result.issues.map((item) => item.code)).toContain('RUNTIME_AUDIT_REQUIRED');
    } finally {
      fs.rmSync(rootDir, { recursive: true, force: true });
    }
  });
});
