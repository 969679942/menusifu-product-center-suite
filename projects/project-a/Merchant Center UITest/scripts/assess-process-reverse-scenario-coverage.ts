import fs from 'node:fs';
import path from 'node:path';
import {
  assessReverseScenarioCoverage,
  validateReverseScenarioCatalog,
  validateReverseScenarioCaseRegistry,
  type ReverseScenarioCatalog,
  type ReverseScenarioCaseReference,
  type ReverseScenarioCaseRecord,
} from '../../Test Automation Platform/src/utils/reverse-scenario-catalog';

export function buildProcessReverseScenarioCoverage(merchantRoot = path.resolve(__dirname, '../..')): void {
  const catalogPath = path.join(merchantRoot, 'deliverables/test-plan-governance/process-reverse-scenario-catalog-v1.json');
  const registryPath = path.join(merchantRoot, 'deliverables/test-plan-governance/process-reverse-scenario-case-registry-v1.json');
  const outputPath = path.join(merchantRoot, 'deliverables/test-plan-governance/process-reverse-scenario-coverage-v1.json');

  const catalog = readJson<ReverseScenarioCatalog>(catalogPath);
  const catalogIssues = validateReverseScenarioCatalog(catalog);
  if (catalogIssues.length) {
    throw new Error(`反向场景目录校验失败：${catalogIssues.map((item) => item.code).join(',')}`);
  }
  const registry = readJson<{ cases: ReverseScenarioCaseRecord[] }>(registryPath);
  const registryIssues = validateReverseScenarioCaseRegistry(catalog, registry.cases);
  if (registryIssues.length) {
    throw new Error(`反向场景登记校验失败：${registryIssues.map((item) => item.code).join(',')}`);
  }
  const references: ReverseScenarioCaseReference[] = registry.cases.map((item) => ({
    caseId: item.caseId,
    scenarioIds: [item.scenarioId],
    evidenceComplete: false,
    current: true,
  }));
  const coverage = assessReverseScenarioCoverage(catalog, references);
  const summary = coverage.reduce((acc, item) => {
    acc[item.status] += 1;
    return acc;
  }, { covered: 0, partial: 0, missing: 0 });
  const report = {
    schemaVersion: '1.0.0',
    catalogId: catalog.catalogId,
    assessedAt: new Date().toISOString(),
    references: [path.relative(merchantRoot, registryPath).replace(/\\/g, '/')],
    summary: {
      scenarioCount: coverage.length,
      ...summary,
      note: '候选用例已建立映射；未取得业务/运行收据的场景保持 partial。',
    },
    partialScenarioIds: coverage.filter((item) => item.status === 'partial').map((item) => item.scenarioId),
    resultsImpact: 'unchanged',
    executionScope: 'static-and-contract-only',
    crossSystemPilot: 'deferred',
  };
  fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({ outputPath, summary }, null, 2));
}

function readJson<T>(filePath: string): T {
  return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T;
}

if (require.main === module) buildProcessReverseScenarioCoverage();
