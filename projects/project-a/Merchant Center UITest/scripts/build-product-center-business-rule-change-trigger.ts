import fs from 'node:fs';
import path from 'node:path';
import {
  buildBusinessRuleChangeTrigger,
  type BusinessRuleSemanticBaseline,
  type BusinessRuleTriggerCase,
} from '../automation/system-test/business-rule-change-trigger';
import type { ArbiterDisposition } from '../automation/system-test/system-test-case-state-arbiter';
import { loadCurrentProductCenterBusinessRuleLifecycleSnapshot } from './build-product-center-business-rule-lifecycle-snapshot';
import { resolveSystemTestPlatformArtifact } from '../utils/system-test-platform-paths';

const projectRoot = path.resolve(__dirname, '..');
const workspaceRoot = path.resolve(projectRoot, '..');
const governanceRoot = path.join(workspaceRoot, 'deliverables/test-plan-governance');
const baselinePath = path.join(
  projectRoot,
  'contracts/product-center/business-rules/product-center-business-rule-verified-baseline.json',
);
const outputPath = path.join(
  projectRoot,
  'contracts/product-center/business-rules/generated/product-center-business-rule-change-trigger.json',
);

type LandingReport = {
  modules: Array<{ assessment: { cases: Array<{
    caseId: string;
    disposition: string;
    caseFingerprint: string | null;
    semanticCaseFingerprint?: string | null;
    fingerprintMatchMode?: 'effective' | 'semantic';
    implementationFingerprint?: string | null;
    implementationFingerprintRequired?: boolean;
  }> } }>;
};

type ExecutionIndex = {
  records: Array<{
    caseId: string;
    caseFingerprint: string;
    semanticCaseFingerprint?: string | null;
    implementationFingerprint?: string | null;
    status: 'passed' | 'failed' | 'skipped' | 'not-run';
    evidenceStatus?: 'complete' | 'incomplete' | 'legacy-unverified';
    assertionStatuses?: ReadonlyArray<'verified' | 'observed-mismatch'>;
    recordedAt: string;
    evidencePath?: string | null;
  }>;
};

export function buildProductCenterBusinessRuleChangeTriggerArtifact(input: {
  landingReport?: LandingReport;
  executionIndex?: ExecutionIndex;
} = {}) {
  const landingReport = input.landingReport ?? readJson<LandingReport>(path.join(
    governanceRoot,
    process.env.PC_LANDING_INPUT_BASENAME?.trim()
      ? `${process.env.PC_LANDING_INPUT_BASENAME.trim()}.json`
      : 'product-center-item-group-landing-audit.json',
  ));
  const executionIndex = input.executionIndex
    ?? readJson<ExecutionIndex>(resolveSystemTestPlatformArtifact('execution-index.json'));
  const receiptsByCaseId = new Map<string, ExecutionIndex['records']>();
  for (const receipt of executionIndex.records) {
    const receipts = receiptsByCaseId.get(receipt.caseId) ?? [];
    receipts.push(receipt);
    receiptsByCaseId.set(receipt.caseId, receipts);
  }
  const cases: BusinessRuleTriggerCase[] = landingReport.modules.flatMap((module) => (
    module.assessment.cases.map((item) => ({
      caseId: item.caseId,
      currentCaseFingerprint: item.caseFingerprint,
      currentSemanticCaseFingerprint: item.semanticCaseFingerprint,
      fingerprintMatchMode: item.fingerprintMatchMode,
      currentImplementationFingerprint: item.implementationFingerprint,
      implementationFingerprintRequired: item.implementationFingerprintRequired,
      disposition: normalizeDisposition(item.disposition),
      receipts: (receiptsByCaseId.get(item.caseId) ?? []).map((receipt) => ({
        caseFingerprint: receipt.caseFingerprint,
        semanticCaseFingerprint: receipt.semanticCaseFingerprint,
        implementationFingerprint: receipt.implementationFingerprint,
        status: receipt.status,
        evidenceStatus: receipt.evidenceStatus,
        assertionStatuses: receipt.assertionStatuses,
        recordedAt: receipt.recordedAt,
        evidencePath: receipt.evidencePath,
      })),
    }))
  ));
  const result = buildBusinessRuleChangeTrigger({
    currentRules: loadCurrentProductCenterBusinessRuleLifecycleSnapshot().rules,
    baseline: readJson<BusinessRuleSemanticBaseline>(baselinePath),
    cases,
  });
  writeJsonAtomic(outputPath, result);
  return result;
}

function normalizeDisposition(value: string): ArbiterDisposition {
  return ['ready', 'deferred', 'not-applicable', 'product-defect', 'blocked-source', 'blocked-technical'].includes(value)
    ? value as ArbiterDisposition
    : 'ready';
}

function readJson<T>(filePath: string): T {
  return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T;
}

function writeJsonAtomic(filePath: string, value: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.tmp`;
  fs.writeFileSync(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  fs.renameSync(temporaryPath, filePath);
}

if (require.main === module) {
  try {
    const result = buildProductCenterBusinessRuleChangeTriggerArtifact();
    process.stdout.write(`${JSON.stringify({ status: result.status, rerunCaseIds: result.rerunCaseIds })}\n`);
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
