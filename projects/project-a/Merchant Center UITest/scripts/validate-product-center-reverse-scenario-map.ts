import fs from 'node:fs';
import path from 'node:path';

const merchantRoot = path.resolve(process.cwd(), '..');
const mapPath = path.join(merchantRoot, 'Merchant Center UITest/adapters/test-automation-platform/product-center-reverse-scenario-map-v1.json');
const auditPath = path.join(merchantRoot, 'deliverables/product-center-group/runtime-audit-v2.json');
const map = readJson<{ mappings: Array<{ scenarioId: string; caseIds: string[]; status: string; evidenceRefs: string[] }> }>(mapPath);
const audit = readJson<{ corrections?: Array<{ caseId: string }> }>(auditPath);
const knownCaseIds = new Set((audit.corrections ?? []).map((item) => item.caseId));
const issues: string[] = [];
const seen = new Set<string>();
for (const item of map.mappings ?? []) {
  if (!/^RS-[A-Z0-9-]+$/.test(item.scenarioId)) issues.push(`invalid scenarioId: ${item.scenarioId}`);
  if (seen.has(item.scenarioId)) issues.push(`duplicate scenarioId: ${item.scenarioId}`);
  seen.add(item.scenarioId);
  if (!Array.isArray(item.caseIds) || item.caseIds.length === 0) issues.push(`empty caseIds: ${item.scenarioId}`);
  for (const caseId of item.caseIds ?? []) if (!knownCaseIds.has(caseId)) issues.push(`unknown caseId ${caseId} for ${item.scenarioId}`);
  if (item.status !== 'partial') issues.push(`evidence mapping must remain partial: ${item.scenarioId}`);
  if (!Array.isArray(item.evidenceRefs) || item.evidenceRefs.length === 0) issues.push(`missing evidenceRefs: ${item.scenarioId}`);
}
if (issues.length) throw new Error(`商品中心反向场景映射校验失败：${issues.join('; ')}`);
console.log(JSON.stringify({ mapPath, mappingCount: map.mappings.length, knownCaseCount: knownCaseIds.size, issues: 0 }, null, 2));

function readJson<T>(filePath: string): T {
  return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T;
}
