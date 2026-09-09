import { test, expect } from '@playwright/test';
import {
  assessReverseScenarioCoverage,
  validateReverseScenarioCatalog,
  validateReverseScenarioCaseRegistry,
  type ReverseScenarioCatalog,
} from '../../src/utils/reverse-scenario-catalog';

const catalog: ReverseScenarioCatalog = {
  schemaVersion: '1.0.0',
  catalogId: 'process-reverse-scenarios-v1',
  ownerScope: 'public-process',
  scenarios: [{
    scenarioId: 'RS-FR-001',
    requirementIds: ['FR-001'],
    title: '任务发现',
    trigger: { event: 'task-index-updated', scope: 'project', requiredEvidence: ['task-index'] },
    sourceRefs: ['流程优化PRD.md#FR-001'],
    expectedResolutionActions: ['correct-case', 'add-case', 'block-case'],
    mandatoryContracts: ['C-006'],
    humanEscalationReasons: ['疑似删除无法由当前接口证明'],
  }],
};

test('场景目录必须有来源、触发证据、动作、合同和人工升级条件', () => {
  expect(validateReverseScenarioCatalog(catalog)).toEqual([]);
  const invalid = structuredClone(catalog);
  invalid.scenarios[0].sourceRefs = [];
  expect(validateReverseScenarioCatalog(invalid).some((item) => item.code === 'MISSING_SOURCE')).toBeTruthy();
});

test('覆盖评估区分缺失、部分覆盖和完整覆盖', () => {
  expect(assessReverseScenarioCoverage(catalog, [])).toEqual([{
    scenarioId: 'RS-FR-001', linkedCaseIds: [], status: 'missing', reason: '没有流程用例映射',
  }]);
  expect(assessReverseScenarioCoverage(catalog, [{ caseId: 'PROC-001', scenarioIds: ['RS-FR-001'], evidenceComplete: false }])[0].status).toBe('partial');
  expect(assessReverseScenarioCoverage(catalog, [{ caseId: 'PROC-001', scenarioIds: ['RS-FR-001'], evidenceComplete: true, current: true }])[0].status).toBe('covered');
});

test('同一场景多个项目映射时保持去重并按场景聚合', () => {
  const result = assessReverseScenarioCoverage(catalog, [
    { caseId: 'PROC-001', scenarioIds: ['RS-FR-001'], evidenceComplete: true, current: true },
    { caseId: 'PROC-002', scenarioIds: ['RS-FR-001'], evidenceComplete: true, current: true },
    { caseId: 'PROC-001', scenarioIds: ['RS-FR-001'], evidenceComplete: true, current: true },
  ]);
  expect(result[0].linkedCaseIds).toEqual(['PROC-001', 'PROC-002']);
});

test('流程候选用例必须绑定已知场景、来源和公共合同且默认不可执行', () => {
  const valid = validateReverseScenarioCaseRegistry(catalog, [{
    caseId: 'PROC-FR-001', scenarioId: 'RS-FR-001', sourceRefs: ['流程优化PRD.md#FR-001'],
    contractRefs: ['C-006'], status: 'candidate', executionEligible: false,
  }]);
  expect(valid).toEqual([]);
  const invalid = validateReverseScenarioCaseRegistry(catalog, [{
    caseId: 'PROC-FR-001', scenarioId: 'RS-UNKNOWN', sourceRefs: [], contractRefs: [],
    status: 'candidate', executionEligible: true,
  }]);
  expect(invalid.length).toBeGreaterThanOrEqual(3);
});
