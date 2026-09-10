import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';

const reportPath = path.resolve(__dirname, '../../../deliverables/test-plan-governance/process-reverse-scenario-adapter-readiness-v1.json');

test('反向场景适配就绪报告必须区分静态合同与真实运行资格', () => {
  expect(fs.existsSync(reportPath)).toBe(true);
  const report = JSON.parse(fs.readFileSync(reportPath, 'utf8')) as {
    executionScope: string;
    summary: { scenarioCount: number; registeredCaseCount: number; executableCaseCount: number; adapterReadyCount: number; evidenceCompleteCount: number };
    scenarios: Array<{ caseId: string | null; adapterStatus: string; staticContractReady: boolean; runtimeReady: boolean; executionEligible: boolean; blockers: string[]; businessExecutionStarted?: boolean }>;
    guardrails: { noBusinessExecution: boolean; candidateCasesExecutionEligible: boolean; existingPassedCasesInvalidated: boolean };
  };
  expect(report.executionScope).toBe('static-and-contract-only');
  expect(report.summary).toMatchObject({ scenarioCount: 26, registeredCaseCount: 26, executableCaseCount: 0, adapterReadyCount: 0, evidenceCompleteCount: 0 });
  expect(report.scenarios).toHaveLength(report.summary.scenarioCount);
  for (const scenario of report.scenarios) {
    expect(scenario.caseId).toBeTruthy();
    expect(scenario.adapterStatus).toBe('candidate-only');
    expect(scenario.staticContractReady).toBe(true);
    expect(scenario.runtimeReady).toBe(false);
    expect(scenario.executionEligible).toBe(false);
    expect(scenario.blockers).toContain('execution-grant');
  }
  expect(report.guardrails).toMatchObject({ noBusinessExecution: true, candidateCasesExecutionEligible: false, existingPassedCasesInvalidated: false });
});
