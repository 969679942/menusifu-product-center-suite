import fs from 'node:fs';
import path from 'node:path';
import {
  buildSystemTestCapabilityMatchReport,
  type SystemTestCapabilityMatchCase,
} from '../../../Test Automation Platform/src/automation/system-test/system-test-capability-matching';
import { productCenterRecipeCapabilityContracts } from '../adapters/product-center/product-center-recipe-capabilities';

const projectRoot = path.resolve(__dirname, '..');
const outputPath = path.join(projectRoot, 'deliverables/system-test-platform/product-center-capability-match.json');

type JsonDocument = {
  cases?: Array<Record<string, unknown>>;
  bindings?: Array<Record<string, unknown>>;
};

export function buildProductCenterCapabilityMatch(options: { write?: boolean } = {}) {
  const cases = collectCases();
  const registeredCapabilityIds = new Set<string>(productCenterRecipeCapabilityContracts.map((item) => item.id));
  for (const filePath of [
    'systems/merchant-center-product-center-seasoning/adapters.json',
    'systems/merchant-center-store-operations-tax/adapters.json',
  ]) {
    const document = readJson<{ adapters?: Array<{ id?: string }> }>(filePath);
    for (const adapter of document.adapters ?? []) if (adapter.id) registeredCapabilityIds.add(adapter.id);
  }
  const report = buildSystemTestCapabilityMatchReport({
    applicationId: 'merchant-center',
    environmentId: process.env.MC_TEST_ENV?.trim() || 'balamxqa',
    registeredCapabilityIds: [...registeredCapabilityIds],
    cases,
  });
  if (options.write !== false) writeJson(outputPath, report);
  return { outputPath, report };
}

function collectCases(): SystemTestCapabilityMatchCase[] {
  const result = new Map<string, SystemTestCapabilityMatchCase>();
  const add = (item: Record<string, unknown>) => {
    const caseId = typeof item.caseId === 'string' ? item.caseId.trim() : '';
    if (!caseId) return;
    const capabilities = Array.isArray(item.capabilityIds)
      ? item.capabilityIds.filter((value): value is string => typeof value === 'string')
      : Array.isArray(item.capabilities)
        ? item.capabilities.flatMap((value) => value && typeof value === 'object' && typeof (value as Record<string, unknown>).id === 'string'
          ? [(value as Record<string, unknown>).id as string] : [])
        : [];
    const excluded = item.generationAllowed === false
      || item.status === 'not-applicable'
      || item.blockClassification === 'not-applicable';
    result.set(caseId, { caseId, requiredCapabilityIds: capabilities, excluded });
  };
  for (const filePath of [
    'contracts/product-center/group/product-center-group-bindings.json',
    'contracts/product-center/test-cases/canonical/product-center-legacy-remaining-automation-bindings.json',
    'systems/merchant-center-product-center-seasoning/binding-registry.json',
  ]) {
    const document = readJson<JsonDocument>(filePath);
    for (const item of [...(document.cases ?? []), ...(document.bindings ?? [])]) add(item);
  }
  return [...result.values()];
}

function readJson<T>(relativePath: string): T {
  return JSON.parse(fs.readFileSync(path.join(projectRoot, relativePath), 'utf8')) as T;
}

function writeJson(filePath: string, value: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.tmp`;
  fs.writeFileSync(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  fs.renameSync(temporaryPath, filePath);
}

if (require.main === module) {
  const result = buildProductCenterCapabilityMatch();
  process.stdout.write(`${JSON.stringify(result.report.summary, null, 2)}\n`);
}
