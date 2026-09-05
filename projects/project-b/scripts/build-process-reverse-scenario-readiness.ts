import fs from 'node:fs';
import path from 'node:path';
import type { ReverseScenarioCatalog } from '../../../Test Automation Platform/src/utils/reverse-scenario-catalog';

const merchantRoot = path.resolve(process.cwd(), '..');
const catalogPath = path.join(merchantRoot, 'deliverables/test-plan-governance/process-reverse-scenario-catalog-v1.json');
const registryPath = path.join(merchantRoot, 'deliverables/test-plan-governance/process-reverse-scenario-case-registry-v1.json');
const outputPath = path.join(merchantRoot, 'deliverables/test-plan-governance/process-reverse-scenario-adapter-readiness-v1.json');

const catalog = readJson<ReverseScenarioCatalog>(catalogPath);
const registry = readJson<{ cases: Array<{ caseId: string; scenarioId: string; status: string; executionEligible: boolean }> }>(registryPath);
const caseByScenario = new Map(registry.cases.map((item) => [item.scenarioId, item]));
const scenarios = catalog.scenarios.map((scenario) => {
  const registered = caseByScenario.get(scenario.scenarioId);
  return {
    scenarioId: scenario.scenarioId,
    requirementIds: scenario.requirementIds,
    caseId: registered?.caseId ?? null,
    adapterStatus: registered ? 'candidate-only' : 'missing',
    executionEligible: registered?.executionEligible === true,
    evidence: scenario.trigger.requiredEvidence.map((name) => ({ name, status: 'missing' })),
    nextAction: '补齐项目适配器来源、标准运行收据、上下文/授权和清理证据后定向重验',
  };
});
const summary = {
  scenarioCount: scenarios.length,
  registeredCaseCount: scenarios.filter((item) => item.caseId).length,
  executableCaseCount: scenarios.filter((item) => item.executionEligible).length,
  adapterReadyCount: scenarios.filter((item) => item.adapterStatus === 'ready').length,
  evidenceCompleteCount: scenarios.filter((item) => item.evidence.every((evidence) => evidence.status === 'complete')).length,
};
fs.writeFileSync(outputPath, `${JSON.stringify({
  schemaVersion: '1.0.0',
  planId: 'reverse-scenario-optimization-v1',
  generatedAt: new Date().toISOString(),
  projectId: 'process-governance',
  executionScope: 'static-and-contract-only',
  summary,
  scenarios,
  guardrails: {
    noBusinessExecution: true,
    noCrossSystemPilot: true,
    candidateCasesExecutionEligible: false,
    existingPassedCasesInvalidated: false,
  },
}, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ outputPath, summary }, null, 2));

function readJson<T>(filePath: string): T {
  return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T;
}
