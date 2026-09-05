import fs from 'node:fs';
import path from 'node:path';
import { buildSystemTestArtifacts } from '../../../Test Automation Platform/scripts/build-system-test-contract';
import { buildSystemTestCaseImplementationFingerprints } from '../../../Test Automation Platform/scripts/run-system-test';
import { fingerprintSystemTestValue } from '../../../Test Automation Platform/src/automation/system-test/system-test-contract';
import { buildProjectRemediationOptimizationPlan } from '../../../Test Automation Platform/src/governance/project-remediation-optimization';
import type { ProjectRemediationScopeArtifact } from '../../../Test Automation Platform/src/governance/project-remediation-scope';
import type { SystemTestOptimizationPlan, SystemTestOptimizationReceipt } from '../../../Test Automation Platform/src/governance/system-test-optimization-gate';
import { buildProductCenterProjectOptimizationCases } from '../adapters/product-center/product-center-project-optimization';
import { buildMerchantCenterOptimizationPlan } from '../utils/system-test-optimization-gate';
import type { SystemTestRevalidationImpactType } from '../../../Test Automation Platform/src/automation/system-test/system-test-revalidation-policy';

type ImpactManifest = {
  schemaVersion: '1.0.0';
  changeId: string;
  applicationId: string;
  defaultImpactType: SystemTestRevalidationImpactType;
  impactedCaseIds: string[];
  caseImpactTypes?: Record<string, SystemTestRevalidationImpactType>;
  classifiedExclusionCaseIds?: string[];
};

const projectRoot = path.resolve(__dirname, '..');
const mode = argument('mode') ?? 'project';
const outputPath = path.resolve(projectRoot, argument('output') ?? 'deliverables/system-test-platform/product-center-optimization-plan.json');
const maxBatchSize = Number(argument('batch-size') ?? '20');
const includedModules = argument('modules')?.split(',').map((item) => item.trim()).filter(Boolean);
const receiptsPath = argument('canary-receipts');
const canaryCaseIds = argument('canary-case-ids')?.split(',').map((item) => item.trim()).filter(Boolean);
const executionCaseIds = argument('execution-case-ids')?.split(',').map((item) => item.trim()).filter(Boolean);
const canaryReceipts = receiptsPath ? readJson<SystemTestOptimizationReceipt[]>(path.resolve(projectRoot, receiptsPath)) : undefined;
const standardReceiptsPath = argument('standard-receipts');
const standardReceipts = standardReceiptsPath
  ? readJson<SystemTestOptimizationReceipt[]>(path.resolve(projectRoot, standardReceiptsPath))
  : undefined;
const maxCanaryCases = Number(argument('max-canary-cases') ?? '20');
const maxCanaryRatio = Number(argument('max-canary-ratio') ?? '0.1');
const impactManifestPath = argument('impact-manifest');
if (!impactManifestPath) throw new Error('OPTIMIZATION_IMPACT_MANIFEST_REQUIRED');
const impactManifest = readJson<ImpactManifest>(path.resolve(projectRoot, impactManifestPath));
if (impactManifest.schemaVersion !== '1.0.0' || !impactManifest.changeId.trim() || !impactManifest.applicationId.trim()) {
  throw new Error('OPTIMIZATION_IMPACT_MANIFEST_INVALID');
}
const impactTypes = impactManifest.caseImpactTypes ?? {};
const impactedCaseIdSet = new Set(impactManifest.impactedCaseIds);

let plan: ProjectRemediationOptimizationPlan | SystemTestOptimizationPlan;
let totalCases: number;
if (mode === 'project') {
  if (argument('manifest')) throw new Error('PROJECT_OPTIMIZATION_MANIFEST_FORBIDDEN');
  const scope = readJson<ProjectRemediationScopeArtifact>(path.resolve(projectRoot, argument('scope') ?? 'deliverables/system-test-platform/product-center-remediation-scope.json'));
  const cases = buildProductCenterProjectOptimizationCases({ projectRoot, scope });
  const knownCaseIds = new Set(cases.map((item) => item.caseId));
  const classifiedExclusions = new Set(impactManifest.classifiedExclusionCaseIds ?? []);
  const unknownUnclassified = impactManifest.impactedCaseIds.filter((caseId) => !knownCaseIds.has(caseId) && !classifiedExclusions.has(caseId));
  if (unknownUnclassified.length > 0) throw new Error(`OPTIMIZATION_IMPACT_CASE_ID_UNKNOWN_UNCLASSIFIED:${unknownUnclassified.join(',')}`);
  const plannedImpactedCaseIds = impactManifest.impactedCaseIds.filter((caseId) => knownCaseIds.has(caseId));
  plan = buildProjectRemediationOptimizationPlan({ planId: `merchant-center:${scope.scopeId}`, scope, cases, maxBatchSize, canaryCaseIds, executionCaseIds, canaryReceipts, standardReceipts, impactedCaseIds: plannedImpactedCaseIds, impactTypes: Object.fromEntries(cases.map((item) => [item.caseId, impactedCaseIdSet.has(item.caseId) ? impactTypes[item.caseId] ?? impactManifest.defaultImpactType : 'platform-only'])), maxCanaryCases, maxCanaryRatio, includedModules, changeId: impactManifest.changeId });
  totalCases = cases.length;
} else if (mode === 'system') {
  const manifestPath = argument('manifest');
  if (!manifestPath) throw new Error('SYSTEM_OPTIMIZATION_MANIFEST_REQUIRED');
  if (argument('scope')) throw new Error('SYSTEM_OPTIMIZATION_SCOPE_FORBIDDEN');
  const artifacts = buildSystemTestArtifacts({ rootDir: projectRoot, manifestPath });
  if (artifacts.errors.length > 0) throw new Error(`SYSTEM_TEST_CONTRACT_INVALID:${artifacts.errors.join(',')}`);
  const implementationFingerprints = buildSystemTestCaseImplementationFingerprints(artifacts, path.resolve(projectRoot, '../../Test Automation Platform/scripts/run-system-test.ts'));
  const caseFingerprints = Object.fromEntries(artifacts.contract.cases.map((item) => [item.caseId, fingerprintSystemTestValue(item)]));
  plan = buildMerchantCenterOptimizationPlan({ planId: `merchant-center:${artifacts.manifest.system.systemId}`, contractFingerprint: artifacts.contract.fingerprint, cases: artifacts.contract.cases, maxBatchSize, canaryCaseIds, executionCaseIds, canaryReceipts, standardReceipts, impactedCaseIds: impactManifest.impactedCaseIds, impactTypes, caseFingerprints, implementationFingerprints, maxCanaryCases, maxCanaryRatio, changeId: impactManifest.changeId });
  totalCases = artifacts.contract.cases.length;
} else {
  throw new Error(`OPTIMIZATION_MODE_INVALID:${mode}`);
}

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(plan, null, 2)}\n`, 'utf8');
process.stdout.write(`${JSON.stringify({ mode, status: plan.status, totalCases, canaryCaseIds: plan.canaryCaseIds, batches: plan.batches.length, output: outputPath })}\n`);

function readJson<T>(filePath: string): T {
  if (!fs.existsSync(filePath)) throw new Error(`OPTIMIZATION_INPUT_MISSING:${filePath}`);
  return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T;
}
function argument(name: string): string | undefined {
  const prefix = `--${name}=`;
  return process.argv.find((value) => value.startsWith(prefix))?.slice(prefix.length);
}
