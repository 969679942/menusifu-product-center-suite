import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {
  buildProductCenterBusinessRuleCompletionReviewQueue,
  renderProductCenterBusinessRuleCompletionReviewMarkdown,
  type ProductCenterSupplementalCaseEvidence,
} from '../adapters/product-center/product-center-business-rule-completion-review-adapter';
import { loadCurrentProductCenterBusinessRuleLifecycleSnapshot } from './build-product-center-business-rule-lifecycle-snapshot';

const projectRoot = path.resolve(__dirname, '..');
const jsonPath = path.join(
  projectRoot,
  'contracts/product-center/business-rules/generated/product-center-business-rule-completion-review-queue.json',
);
const markdownPath = path.join(
  projectRoot,
  'output/test-case-audit/product-center/product-center-business-rule-completion-review-queue.md',
);
const canonicalPlanPath = 'contracts/product-center/test-cases/canonical/product-center-item-xmind-rebuild-pilot.json';
const fullReviewPath = 'contracts/product-center/test-cases/canonical/product-center-item-full-review.json';
const changeTriggerPath = 'contracts/product-center/business-rules/generated/product-center-business-rule-change-trigger.json';

export function buildProductCenterBusinessRuleCompletionReviewArtifacts(): {
  jsonPath: string;
  markdownPath: string;
} {
  const snapshot = loadCurrentProductCenterBusinessRuleLifecycleSnapshot();
  const changeTrigger = readJsonIfExists<{
    rerunCaseIds: string[];
    preservedPassedCaseIds: string[];
  }>(changeTriggerPath);
  const snapshotWithExecutionImpact = changeTrigger ? {
    ...snapshot,
    executionImpact: {
      ...snapshot.executionImpact,
      existingPassedCasesInvalidated: changeTrigger.rerunCaseIds.length > 0,
      invalidatedCaseIds: [...changeTrigger.rerunCaseIds],
      rerunCaseIds: [...changeTrigger.rerunCaseIds],
      preservedPassedCaseIds: [...changeTrigger.preservedPassedCaseIds],
    },
  } : snapshot;
  const queue = buildProductCenterBusinessRuleCompletionReviewQueue(
    snapshotWithExecutionImpact,
    loadCurrentProductCenterSupplementalCaseEvidence(snapshot.rules.flatMap((rule) => rule.linkedCaseIds)),
  );
  writeJsonAtomic(jsonPath, { ...queue, generatedAt: new Date().toISOString() });
  writeTextAtomic(markdownPath, renderProductCenterBusinessRuleCompletionReviewMarkdown(queue));
  return { jsonPath, markdownPath };
}

export function loadCurrentProductCenterSupplementalCaseEvidence(
  linkedCaseIds: readonly string[],
): ProductCenterSupplementalCaseEvidence[] {
  const canonicalPlan = readJson<{
    cases: Array<{
      id: string;
      preconditions: string[];
      actions: string[];
      expectedResults: string[];
    }>;
  }>(canonicalPlanPath);
  const fullReview = readJson<{
    entries: Array<{ caseId: string; decision: string }>;
  }>(fullReviewPath);
  const approvedCaseIds = new Set(
    fullReview.entries.filter((entry) => entry.decision === 'approved').map((entry) => entry.caseId),
  );
  const linked = new Set(linkedCaseIds);
  return canonicalPlan.cases
    .filter((item) => linked.has(item.id) && approvedCaseIds.has(item.id))
    .map((item) => ({
      caseId: item.id,
      sourcePath: canonicalPlanPath,
      sourceFingerprint: createHash('sha256').update(JSON.stringify(item)).digest('hex'),
      reviewStatus: 'approved' as const,
      preconditions: [...item.preconditions],
      actions: [...item.actions],
      expectedResults: [...item.expectedResults],
    }));
}

function readJson<T>(relativePath: string): T {
  return JSON.parse(fs.readFileSync(path.join(projectRoot, relativePath), 'utf8')) as T;
}

function readJsonIfExists<T>(relativePath: string): T | null {
  const filePath = path.join(projectRoot, relativePath);
  return fs.existsSync(filePath) ? JSON.parse(fs.readFileSync(filePath, 'utf8')) as T : null;
}

function writeJsonAtomic(filePath: string, value: unknown): void {
  writeTextAtomic(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function writeTextAtomic(filePath: string, value: string): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.tmp`;
  fs.writeFileSync(temporaryPath, value, 'utf8');
  fs.renameSync(temporaryPath, filePath);
}

if (require.main === module) {
  try {
    const outputs = buildProductCenterBusinessRuleCompletionReviewArtifacts();
    process.stdout.write(`${outputs.jsonPath}\n${outputs.markdownPath}\n`);
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
