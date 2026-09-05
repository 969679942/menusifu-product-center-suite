import { expect, test } from '@playwright/test';
import {
  assessBusinessRuleCoverage,
  type BusinessRuleCoverageCaseClaim,
  type BusinessRuleCoverageEvidence,
  type BusinessRuleCoverageObligation,
} from '../../src/automation/system-test/business-rule-coverage';

const ruleId = 'BR-FIXTURE-001';

function obligation(id: string, options: Partial<BusinessRuleCoverageObligation> = {}): BusinessRuleCoverageObligation {
  return {
    obligationId: id,
    ruleId,
    dimension: 'outcome',
    layer: 'business-behavior',
    statement: `义务 ${id}`,
    applicability: 'required',
    sourceIds: ['source:rule'],
    assertionSurfaceIds: [`assertion:${id}`],
    ...options,
  };
}

function claim(id: string, caseId: string, obligationIds: string[]): BusinessRuleCoverageCaseClaim {
  return { claimId: id, ruleId, caseId, kind: 'test-case', obligationIds, sourceIds: [`source:${caseId}`] };
}

function evidence(caseId: string, verifiedObligationIds: string[]): BusinessRuleCoverageEvidence {
  return {
    evidenceId: `evidence:${caseId}`,
    caseId,
    executionStatus: 'passed',
    evidenceStatus: 'complete',
    caseFingerprint: 'case-current',
    implementationFingerprint: 'implementation-current',
    executionContextFingerprint: 'context-current',
    verifiedObligationIds,
    assertionSurfaceIdsObserved: verifiedObligationIds.map((id) => `assertion:${id}`),
  };
}

test.describe('系统无关业务规则义务覆盖合同', () => {
  test('一个用例只覆盖部分义务时必须为 partial', () => {
    const result = assessBusinessRuleCoverage({
      ruleId,
      obligations: [obligation('O1'), obligation('O2')],
      claims: [claim('C1', 'TC-1', ['O1'])],
    });
    expect(result.maturity).toBe('partial');
    expect(result.missingObligationIds).toEqual(['O2']);
    expect(result.mandatoryCoverageRate).toBe(0.5);
  });

  test('一个用例显式覆盖全部义务时允许结构覆盖', () => {
    const result = assessBusinessRuleCoverage({
      ruleId,
      obligations: [obligation('O1'), obligation('O2')],
      claims: [claim('C1', 'TC-1', ['O1', 'O2'])],
    });
    expect(result.maturity).toBe('structurally-covered');
    expect(result.missingObligationIds).toEqual([]);
  });

  test('多个用例合并覆盖全部义务时允许结构覆盖', () => {
    const result = assessBusinessRuleCoverage({
      ruleId,
      obligations: [obligation('O1'), obligation('O2')],
      claims: [claim('C1', 'TC-1', ['O1']), claim('C2', 'TC-2', ['O2'])],
    });
    expect(result.maturity).toBe('structurally-covered');
    expect(result.structurallyRelevantCaseIds).toEqual(['TC-1', 'TC-2']);
  });

  test('多个用例重复覆盖同一义务不能补足其他缺失义务', () => {
    const result = assessBusinessRuleCoverage({
      ruleId,
      obligations: [obligation('O1'), obligation('O2')],
      claims: [claim('C1', 'TC-1', ['O1']), claim('C2', 'TC-2', ['O1'])],
    });
    expect(result.maturity).toBe('partial');
    expect(result.coveredMandatoryObligations).toBe(1);
  });

  test('全部义务具有当前指纹和完整通过证据时才是 execution-verified', () => {
    const result = assessBusinessRuleCoverage({
      ruleId,
      obligations: [obligation('O1'), obligation('O2')],
      claims: [claim('C1', 'TC-1', ['O1', 'O2'])],
      currentIdentities: [{ caseId: 'TC-1', caseFingerprint: 'case-current', implementationFingerprint: 'implementation-current', executionContextFingerprint: 'context-current' }],
      evidence: [evidence('TC-1', ['O1', 'O2'])],
    });
    expect(result.maturity).toBe('execution-verified');
    expect(result.executionVerifiedCoverageRate).toBe(1);
  });

  test('旧用例指纹或不完整收据不能成为当前执行验证', () => {
    const stale = { ...evidence('TC-1', ['O1']), caseFingerprint: 'case-old' };
    const result = assessBusinessRuleCoverage({
      ruleId,
      obligations: [obligation('O1')],
      claims: [claim('C1', 'TC-1', ['O1'])],
      currentIdentities: [{ caseId: 'TC-1', caseFingerprint: 'case-current', implementationFingerprint: 'implementation-current', executionContextFingerprint: 'context-current' }],
      evidence: [stale],
    });
    expect(result.maturity).toBe('structurally-covered');
    expect(result.currentEvidenceCaseIds).toEqual([]);
  });

  test('optional 义务不进入 mandatory 分母', () => {
    const result = assessBusinessRuleCoverage({
      ruleId,
      obligations: [obligation('O1'), obligation('O2', { applicability: 'optional' })],
      claims: [claim('C1', 'TC-1', ['O1'])],
    });
    expect(result.mandatoryObligations).toBe(1);
    expect(result.maturity).toBe('structurally-covered');
  });

  test('无来源义务和 claim 必须产生诊断且不能伪造覆盖', () => {
    const result = assessBusinessRuleCoverage({
      ruleId,
      obligations: [obligation('O1', { sourceIds: [] })],
      claims: [{ ...claim('C1', 'TC-1', ['O1']), sourceIds: [] }],
    });
    expect(result.diagnostics).toContain('OBLIGATION_SOURCE_REQUIRED:O1');
    expect(result.diagnostics).toContain('CLAIM_SOURCE_REQUIRED:C1');
    expect(result.maturity).toBe('uncovered');
  });

  test('not-applicable 义务必须有明确处置证据', () => {
    const result = assessBusinessRuleCoverage({
      ruleId,
      obligations: [obligation('O1', { applicability: 'not-applicable' })],
      claims: [],
    });
    expect(result.maturity).toBe('not-assessed');
    expect(result.diagnostics).toContain('NOT_APPLICABLE_DISPOSITION_REQUIRED:O1');
  });
});
