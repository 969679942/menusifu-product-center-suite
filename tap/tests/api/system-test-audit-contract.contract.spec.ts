import { expect, test } from '@playwright/test';
import type { SystemTestCompiledCase } from '../../src/automation/system-test/system-test-contract';
import {
  evaluateSystemTestCaseAuditCompleteness,
  summarizeSystemTestAuditCompleteness,
} from '../../src/automation/system-test/system-test-audit-contract';
import { buildStructuredChangeEvidence } from '../../src/utils/executable-operation-receipt';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { verifySystemTestAuditCompleteness } from '../../scripts/verify-system-test-audit-completeness';

const mutationCase = compiledCase('TC-AUDIT-MUTATION', 'reversible', ['items:update']);
const readOnlyCase = compiledCase('TC-AUDIT-READ', 'none', []);

test('审计合同应使用 auditEligible 而不是全部执行证据作为调用覆盖分母', () => {
  const complete = evaluateSystemTestCaseAuditCompleteness({
    item: mutationCase,
    runId: 'run-1',
    evidence: {
      caseId: mutationCase.caseId,
      assertionReceipts: [],
      operationReceipts: [{ operationKey: 'items:update', observed: true, method: 'PUT', status: 'passed', finishedAt: '2026-08-28T01:00:00Z' }],
      changeReceipts: [{
        entityType: 'item', entityId: 'server-1', changeType: 'persisted',
        beforeFingerprint: 'a'.repeat(64), afterFingerprint: 'b'.repeat(64), changedFields: ['name'],
      }],
      mutationObserved: true,
      cleanup: {
        apiIdentityCounts: { AUTO_AUDIT_1: 0 }, uiIdentityCounts: { AUTO_AUDIT_1: 0 },
        objects: [{ entityType: 'item', serverId: 'server-1', businessIdentity: 'AUTO_AUDIT_1', cleanupAttempt: 1, apiResidueCount: 0, uiResidueCount: 0, outcome: 'verified-zero' }],
      },
    },
  });
  const excluded = evaluateSystemTestCaseAuditCompleteness({ item: readOnlyCase, runId: 'run-1', evidence: { caseId: readOnlyCase.caseId, assertionReceipts: [] } });
  expect(complete.status).toBe('complete');
  expect(excluded.status).toBe('excluded');
  expect(summarizeSystemTestAuditCompleteness([complete, excluded])).toEqual(expect.objectContaining({
    planned: 2, auditEligible: 1, classifiedExclusions: 1, auditComplete: 1, auditIncomplete: 0, invariantSatisfied: true,
  }));
});

test('变更和清理证据缺失必须分类为 audit-incomplete 而不是产品失败', () => {
  const result = evaluateSystemTestCaseAuditCompleteness({
    item: mutationCase, runId: 'run-2',
    evidence: { caseId: mutationCase.caseId, assertionReceipts: [], operationReceipts: [{ operationKey: 'items:update', observed: true, method: 'PUT' }] },
  });
  expect(result.status).toBe('incomplete');
  expect(result.missing).toEqual(['missing-cleanup', 'missing-diff']);
});

test('结构化 Diff 应稳定计算嵌套字段且相同输入不产生虚假变化', () => {
  expect(buildStructuredChangeEvidence({ name: 'A', price: 10 }, { name: 'B', price: 10 })).toEqual(expect.objectContaining({
    changedFields: ['name'], dataChanged: true,
  }));
  expect(buildStructuredChangeEvidence({ item: { name: 'A' } }, { item: { name: 'A' } })).toEqual(expect.objectContaining({
    changedFields: [], dataChanged: false,
  }));
});

test('Jenkins 门禁应将缺失记录分类为 audit-incomplete', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'audit-gate-'));
  try {
    const ledger = path.join(root, 'evidence-ledger.json');
    fs.writeFileSync(ledger, JSON.stringify({ auditCompleteness: {
      schemaVersion: '1.1.0',
      summary: { planned: 2, auditEligible: 1, classifiedExclusions: 1, auditComplete: 0, auditIncomplete: 1, byMissingCode: { 'missing-diff': 1 }, invariantSatisfied: true },
    } }));
    expect(verifySystemTestAuditCompleteness(ledger)).toEqual(expect.objectContaining({
      ok: false, exitCode: 2, status: 'audit-incomplete', diagnostics: ['AUDIT_INCOMPLETE:{"missing-diff":1}'],
    }));
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

function compiledCase(caseId: string, mutationMode: SystemTestCompiledCase['mutationMode'], requiredOperationKeys: string[]): SystemTestCompiledCase {
  return {
    caseId, ruleId: `rule-${caseId}`, ruleStatus: 'supported', recipeId: `recipe-${caseId}`,
    action: mutationMode === 'none' ? 'read' : 'edit', dataProfileId: 'profile', mutationMode,
    expectationClaims: [], requiredContextGuards: [], requiredOperationKeys, probeAdapterIds: [], externalCapabilities: [],
  };
}
