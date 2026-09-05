/**
 * Cross-project reverse-generation scenario contract.
 *
 * The catalog describes when an observed process event may produce or update
 * a test case. It deliberately contains no product fields or UI selectors;
 * those remain project-adapter responsibilities.
 */

export type ReverseScenarioScope = 'case' | 'plan' | 'project' | 'platform';

export type ReverseScenario = {
  scenarioId: string;
  requirementIds: string[];
  title: string;
  trigger: {
    event: string;
    scope: ReverseScenarioScope;
    requiredEvidence: string[];
  };
  sourceRefs: string[];
  expectedResolutionActions: Array<
    'no-change' | 'correct-case' | 'add-case' | 'delete-case' | 'split-case'
    | 'merge-cases' | 'block-case' | 'revalidate'
  >;
  mandatoryContracts: string[];
  humanEscalationReasons: string[];
};

export type ReverseScenarioCatalog = {
  schemaVersion: '1.0.0';
  catalogId: string;
  ownerScope: 'public-process';
  scenarios: ReverseScenario[];
};

export type ReverseScenarioCaseReference = {
  caseId: string;
  scenarioIds: string[];
  evidenceComplete?: boolean;
  current?: boolean;
};

export type ReverseScenarioCaseRecord = {
  caseId: string;
  scenarioId: string;
  sourceRefs: string[];
  contractRefs: string[];
  status: 'candidate' | 'bound' | 'blocked';
  executionEligible: boolean;
};

export type ReverseScenarioCoverage = {
  scenarioId: string;
  linkedCaseIds: string[];
  status: 'covered' | 'partial' | 'missing';
  reason: string;
};

export type ReverseScenarioValidationIssue = {
  scenarioId: string;
  code:
    | 'INVALID_ID'
    | 'DUPLICATE_ID'
    | 'MISSING_REQUIREMENT'
    | 'MISSING_SOURCE'
    | 'MISSING_TRIGGER'
    | 'MISSING_EVIDENCE'
    | 'MISSING_ACTION'
    | 'MISSING_CONTRACT'
    | 'MISSING_ESCALATION';
  message: string;
};

export function validateReverseScenarioCaseRegistry(
  catalog: ReverseScenarioCatalog,
  cases: readonly ReverseScenarioCaseRecord[],
): ReverseScenarioValidationIssue[] {
  const issues: ReverseScenarioValidationIssue[] = [];
  const scenarioIds = new Set(catalog.scenarios.map((item) => item.scenarioId));
  const caseIds = new Set<string>();
  for (const item of cases) {
    if (!nonEmpty(item.caseId) || caseIds.has(item.caseId)) {
      issues.push({ scenarioId: item.scenarioId || 'unknown', code: 'DUPLICATE_ID', message: `caseId 重复或为空：${item.caseId}` });
    }
    caseIds.add(item.caseId);
    if (!scenarioIds.has(item.scenarioId)) {
      issues.push({ scenarioId: item.scenarioId, code: 'INVALID_ID', message: `case 绑定了未知场景：${item.scenarioId}` });
    }
    if (!nonEmptyArray(item.sourceRefs)) {
      issues.push({ scenarioId: item.scenarioId, code: 'MISSING_SOURCE', message: '流程用例必须提供来源引用' });
    }
    if (!nonEmptyArray(item.contractRefs)) {
      issues.push({ scenarioId: item.scenarioId, code: 'MISSING_CONTRACT', message: '流程用例必须提供公共合同引用' });
    }
    if (item.status === 'candidate' && item.executionEligible) {
      issues.push({ scenarioId: item.scenarioId, code: 'MISSING_TRIGGER', message: 'candidate 用例不得直接具备执行资格' });
    }
  }
  return issues;
}

export function validateReverseScenarioCatalog(
  value: unknown,
): ReverseScenarioValidationIssue[] {
  const issues: ReverseScenarioValidationIssue[] = [];
  if (!isRecord(value) || value.schemaVersion !== '1.0.0'
    || value.ownerScope !== 'public-process' || !Array.isArray(value.scenarios)) {
    return [{ scenarioId: 'catalog', code: 'INVALID_ID', message: '场景目录必须是 1.0.0 public-process 合同' }];
  }
  const seen = new Set<string>();
  for (const item of value.scenarios) {
    const scenario = item as Partial<ReverseScenario>;
    const scenarioId = typeof scenario.scenarioId === 'string' ? scenario.scenarioId : 'unknown';
    if (!/^RS-[A-Z0-9-]+$/.test(scenarioId)) {
      issues.push({ scenarioId, code: 'INVALID_ID', message: 'scenarioId 必须使用 RS- 前缀' });
    }
    if (seen.has(scenarioId)) {
      issues.push({ scenarioId, code: 'DUPLICATE_ID', message: 'scenarioId 不得重复' });
    }
    seen.add(scenarioId);
    if (!nonEmptyArray(scenario.requirementIds)) {
      issues.push({ scenarioId, code: 'MISSING_REQUIREMENT', message: '必须绑定至少一个 FR/C 要求 ID' });
    }
    if (!nonEmptyArray(scenario.sourceRefs)) {
      issues.push({ scenarioId, code: 'MISSING_SOURCE', message: '必须提供来源引用' });
    }
    if (!scenario.trigger || !nonEmpty(scenario.trigger.event)
      || !['case', 'plan', 'project', 'platform'].includes(scenario.trigger.scope ?? '')) {
      issues.push({ scenarioId, code: 'MISSING_TRIGGER', message: '必须提供事件和合法作用域' });
    }
    if (!scenario.trigger || !nonEmptyArray(scenario.trigger.requiredEvidence)) {
      issues.push({ scenarioId, code: 'MISSING_EVIDENCE', message: '必须声明触发所需证据' });
    }
    if (!nonEmptyArray(scenario.expectedResolutionActions)) {
      issues.push({ scenarioId, code: 'MISSING_ACTION', message: '必须声明反向解析动作' });
    }
    if (!nonEmptyArray(scenario.mandatoryContracts)) {
      issues.push({ scenarioId, code: 'MISSING_CONTRACT', message: '必须绑定公共合同' });
    }
    if (!nonEmptyArray(scenario.humanEscalationReasons)) {
      issues.push({ scenarioId, code: 'MISSING_ESCALATION', message: '必须声明人工异常条件' });
    }
  }
  return issues;
}

export function assessReverseScenarioCoverage(
  catalog: ReverseScenarioCatalog,
  references: readonly ReverseScenarioCaseReference[],
): ReverseScenarioCoverage[] {
  const byScenario = new Map<string, ReverseScenarioCaseReference[]>();
  for (const reference of references) {
    for (const scenarioId of reference.scenarioIds) {
      const list = byScenario.get(scenarioId) ?? [];
      list.push(reference);
      byScenario.set(scenarioId, list);
    }
  }
  return catalog.scenarios.map((scenario) => {
    const linked = byScenario.get(scenario.scenarioId) ?? [];
    const linkedCaseIds = [...new Set(linked.map((item) => item.caseId))].sort();
    if (linked.length === 0) {
      return { scenarioId: scenario.scenarioId, linkedCaseIds, status: 'missing', reason: '没有流程用例映射' };
    }
    if (linked.some((item) => item.evidenceComplete !== true || item.current === false)) {
      return {
        scenarioId: scenario.scenarioId,
        linkedCaseIds,
        status: 'partial',
        reason: '已有映射但证据不完整或不是当前用例',
      };
    }
    return {
      scenarioId: scenario.scenarioId,
      linkedCaseIds,
      status: 'covered',
      reason: '存在当前且证据完整的流程用例映射',
    };
  });
}

function nonEmptyArray(value: unknown): value is unknown[] {
  return Array.isArray(value) && value.length > 0;
}

function nonEmpty(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isRecord(value: unknown): value is Record<string, any> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
