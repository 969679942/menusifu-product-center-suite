import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {
  issueSystemTestExecutionGrant,
  revokeSystemTestExecutionGrant,
} from '../../../Test Automation Platform/src/automation/system-test/system-test-execution-grant';
import { fingerprintSystemTestValue } from '../../../Test Automation Platform/src/automation/system-test/system-test-contract';
import type { ProjectRemediationOptimizationPlan } from '../../../Test Automation Platform/src/governance/project-remediation-optimization';
import type { GroupAutomationBinding } from '../utils/product-center-group-automation';

const projectRoot = path.resolve(__dirname, '..');
const planArgument = argument('plan');
if (!planArgument) throw new Error('OPTIMIZATION_PLAN_REQUIRED_BEFORE_BROWSER');
const plan = readJson<ProjectRemediationOptimizationPlan>(path.resolve(projectRoot, planArgument));
if (!plan.changeId || !plan.scopeTotal || !plan.selectionFingerprint) throw new Error('OPTIMIZATION_PLAN_METADATA_REQUIRED');
const bindings = readJson<{ cases: GroupAutomationBinding[] }>(path.join(
  projectRoot,
  'contracts/product-center/group/product-center-group-bindings.json',
)).cases;
const requestedCaseIds = (argument('case-ids') ?? process.env.PC_GROUP_FINDING_CASE_IDS ?? '')
  .split(',')
  .map((item) => item.trim())
  .filter(Boolean);
if (requestedCaseIds.length === 0) throw new Error('GROUP_FINDING_REPLAY_CASE_IDS_REQUIRED');
const bindingByCaseId = new Map(bindings.map((item) => [item.caseId, item]));
for (const caseId of requestedCaseIds) {
  const binding = bindingByCaseId.get(caseId);
  if (!binding || binding.blockClassification !== 'observed-product-drift' || binding.handlerId === null) {
    throw new Error(`GROUP_FINDING_REPLAY_CASE_NOT_ELIGIBLE:${caseId}`);
  }
  if (!plan.canaryCaseIds.includes(caseId)) throw new Error(`GROUP_FINDING_REPLAY_CASE_NOT_IN_CANARY:${caseId}`);
}

const runId = argument('run-id') ?? `product-center-group-finding-${timestamp()}`;
const reportPath = argument('report') ?? `output/product-center-group-finding-replay-${runId}.json`;
const grant = issueSystemTestExecutionGrant({
  rootDir: projectRoot,
  applicationId: 'merchant-center-product-center',
  runId,
  caseIds: requestedCaseIds,
  ttlMs: 30 * 60 * 1000,
  candidateFingerprint: fingerprintSystemTestValue({
    planFingerprint: plan.fingerprint,
    caseIds: requestedCaseIds,
  }),
});
try {
  const result = spawnSync(process.execPath, [
    require.resolve('@playwright/test/cli'),
    'test',
    'tests/generated/product-center-group-finding-replay.generated.spec.ts',
    '--project=chrome',
    '--workers=1',
    '--reporter=line,json',
  ], {
    cwd: projectRoot,
    env: {
      ...process.env,
      ...grant.env,
      PC_GROUP_FINDING_CASE_IDS: requestedCaseIds.join(','),
      PC_PLAYWRIGHT_OUTPUT_DIR: `test-results/${runId}`,
      PLAYWRIGHT_JSON_OUTPUT_NAME: reportPath,
    },
    stdio: 'inherit',
    shell: false,
  });
  process.exitCode = result.status ?? 1;
} finally {
  revokeSystemTestExecutionGrant(grant);
}

function readJson<T>(filePath: string): T {
  return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T;
}

function argument(name: string): string | undefined {
  const prefix = `--${name}=`;
  return process.argv.find((value) => value.startsWith(prefix))?.slice(prefix.length);
}

function timestamp(): string {
  return new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}
