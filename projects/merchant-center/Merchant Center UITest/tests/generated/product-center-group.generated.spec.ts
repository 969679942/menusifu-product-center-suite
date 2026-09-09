import { expect, test } from '../../fixtures/product-center.fixture';
import {
  readProductCenterGroupObservedDifferenceEvidence,
  runProductCenterGroupCase,
} from '../../utils/product-center-group-runner';
import { evaluateGroupEvidence, type GroupAutomationBinding } from '../../utils/product-center-group-automation';
import { readProductCenterApplicationVersion } from '../../utils/product-center-application-version';
import { buildProductCenterGroupExecutionFingerprint } from '../../utils/product-center-group-execution-fingerprint';
import { writeProductCenterGroupProgress } from '../../utils/product-center-group-progress';
import bindingsDocument from '../../contracts/product-center/group/product-center-group-bindings.json';
import sourceDecisionsDocument from '../../contracts/product-center/reviews/unsupported-source-format-decisions.json';
import { loadProductCenterExecutionDecisions } from '../../utils/product-center-execution-decisions';
import { fingerprintReceiptEvidence } from '../../utils/playwright-execution-receipt';
import { assertObservedExecutableOperations, consumeExecutableOperationReceipts } from '../../utils/executable-operation-receipt';
import {
  buildProductCenterGroupReportContractFingerprint,
  buildProductCenterGroupReportReceiptContracts,
} from '../../flows/product-center/group/group-report-receipt.adapter';
import { buildProductCenterGroupCaseFingerprintManifest } from '../../utils/product-center-group-case-fingerprint';
import { runtimeConfig } from '../../api/runtime-config';

const bindings = bindingsDocument.cases as unknown as GroupAutomationBinding[];
const executionFingerprint = buildProductCenterGroupExecutionFingerprint(process.cwd()).fingerprint;
const configuredSourceRecoveryCaseIds = new Set((process.env.PC_GROUP_SOURCE_RECOVERY_CASE_IDS ?? '')
  .split(',')
  .map((item) => item.trim())
  .filter(Boolean));
const reportReceiptContracts = buildProductCenterGroupReportReceiptContracts(
  bindings.filter((item) => item.generationAllowed || configuredSourceRecoveryCaseIds.has(item.caseId)),
  { includeSourceRecovery: configuredSourceRecoveryCaseIds.size > 0 },
);
const reportReceiptContractByCaseId = new Map(reportReceiptContracts.map((item) => [item.caseId, item]));
const reportContractFingerprint = buildProductCenterGroupReportContractFingerprint(reportReceiptContracts);
const implementationFingerprintByCaseId = new Map(buildProductCenterGroupCaseFingerprintManifest(
  process.cwd(), bindings.filter((item) => item.generationAllowed
    || configuredSourceRecoveryCaseIds.has(item.caseId)), { includeSourceRecovery: true },
).cases
  .map((item) => [item.caseId, item.implementationFingerprint]));
const sourceBlockedCaseIds = new Set(sourceDecisionsDocument.cases
  .filter((item) => item.currentGoalBlocking === true)
  .map((item) => item.caseId));
const deferredCaseIds = new Set([...loadProductCenterExecutionDecisions(process.cwd()).values()]
  .filter((item) => item.module === 'brand-group' && item.status === 'deferred')
  .map((item) => item.caseId));

test.describe('商品中心商品管理组最终用例全量', () => {
  test.describe.configure({ mode: 'default', timeout: 300_000 });

  const selectedCaseIds = new Set((process.env.PC_GROUP_CASE_IDS ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean));
  const sourceRecoveryCaseIds = configuredSourceRecoveryCaseIds;
  const invalidSourceRecoveryCaseIds = [...sourceRecoveryCaseIds].filter((caseId) => {
    const binding = bindings.find((item) => item.caseId === caseId);
    return !selectedCaseIds.has(caseId)
      || !sourceBlockedCaseIds.has(caseId)
      || binding?.blockClassification !== 'source-evidence-blocked'
      || !binding.handlerId;
  });
  if (invalidSourceRecoveryCaseIds.length > 0) {
    throw new Error('来源恢复执行名单未通过适配器门禁：' + invalidSourceRecoveryCaseIds.join(','));
  }
  const selectedDeferredCaseIds = [...selectedCaseIds].filter((caseId) => deferredCaseIds.has(caseId));
  if (selectedDeferredCaseIds.length > 0) {
    throw new Error('组执行计划包含当前延期用例：' + selectedDeferredCaseIds.join(','));
  }
  for (const binding of bindings.filter((item) => (item.generationAllowed
    && !sourceBlockedCaseIds.has(item.caseId) || sourceRecoveryCaseIds.has(item.caseId))
    && !deferredCaseIds.has(item.caseId)
    && (selectedCaseIds.size === 0 || selectedCaseIds.has(item.caseId)))) {
    const reportReceiptContract = reportReceiptContractByCaseId.get(binding.caseId);
    const implementationFingerprint = implementationFingerprintByCaseId.get(binding.caseId);
    if (!reportReceiptContract) throw new Error('组报告收据合同缺失：' + binding.caseId);
    if (!implementationFingerprint) throw new Error('组局部实现指纹缺失：' + binding.caseId);
    test(
      binding.title,
      {
        tag: ['@product-center-group', `@case-${binding.caseId}`],
        annotation: [
          { type: 'group-case-id', description: binding.caseId },
          { type: 'group-generation', description: 'generated' },
          { type: 'group-source-authority', description: sourceRecoveryCaseIds.has(binding.caseId)
            ? 'recovery-validation-only' : 'verified-source' },
          { type: 'group-execution-profile', description: binding.executionProfile },
          { type: 'group-key', description: reportReceiptContract.groupKey },
          { type: 'group-report-contract', description: reportContractFingerprint },
        ],
      },
      async ({ page, productCenterApi, cleanupRegistry, executionLedger }, testInfo) => {
        const progressRunId = process.env.PC_GROUP_RUN_ID ?? ['playwright', testInfo.project.name, testInfo.workerIndex].join('-');
        writeProductCenterGroupProgress({ runId: progressRunId, caseId: binding.caseId, phase: 'started' });
        testInfo.annotations.push({ type: 'group-binding', description: binding.traceabilityId });
        try {
          const result = await runProductCenterGroupCase({
            binding,
            page,
            productCenterApi,
            cleanupRegistry,
            executionLedger,
          });
          const coverage = evaluateGroupEvidence(binding, result, {
            allowSourceRecovery: sourceRecoveryCaseIds.has(binding.caseId),
          });
          const operationReceipts = consumeExecutableOperationReceipts(testInfo.testId);
          assertObservedExecutableOperations(operationReceipts, binding.caseId);
          const applicationVersion = await readProductCenterApplicationVersion(page);
          const locale = await page.evaluate(() => document.documentElement.lang || 'unknown');
          const cleanupComplete = result.cleanup === null
            || (result.cleanup.entries.length > 0
              && result.cleanup.entries.every((entry) => entry.phase === 'residue-verified'));
          const verifiedAssertionIds = result.assertionReceipts?.length
            ? result.assertionReceipts.filter((receipt) => receipt.status === 'verified').map((receipt) => receipt.claimId)
            : coverage.missingAssertions.length === 0 ? result.assertionIds : [];
          const standardReceipt = {
            receiptVersion: '3.1.0' as const,
            caseId: binding.caseId,
            caseFingerprint: binding.bindingFingerprint,
            implementationFingerprint,
            executionContext: {
              applicationVersionFingerprint: applicationVersion.fingerprint ?? undefined,
              environmentId: process.env.MC_TEST_ENV ?? 'unknown',
              tenantScope: runtimeConfig.brandId,
              locale,
              roleId: process.env.MC_TEST_ROLE ?? 'merchant-operator',
              route: binding.route,
            },
            releaseObservation: {
              status: applicationVersion.status,
              fingerprint: applicationVersion.fingerprint,
              source: applicationVersion.source,
              stable: applicationVersion.stable,
              observedAt: new Date().toISOString(),
            },
            executionEpochId: progressRunId,
            claims: {
              required: binding.assertionIds,
              observed: result.assertionIds,
              verified: verifiedAssertionIds,
            },
            operationReceipts,
            ...(result.assertionReceipts?.length ? { assertionReceipts: result.assertionReceipts } : {}),
            cleanup: {
              apiZeroResidue: cleanupComplete,
              uiZeroResidue: cleanupComplete,
            },
          };
          const evidenceFingerprint = fingerprintReceiptEvidence(standardReceipt);
          await testInfo.attach('product-center-group-runtime-evidence', {
            body: Buffer.from(JSON.stringify({
              ...standardReceipt,
              evidenceFingerprint,
              caseId: binding.caseId,
              bindingFingerprint: binding.bindingFingerprint,
              handlerId: result.handlerId,
              executionFingerprint,
              requiredEvidence: binding.requiredEvidence,
              observedEvidence: result.evidence,
              requiredAssertionIds: binding.assertionIds,
              observedAssertionIds: result.assertionIds,
              applicationVersionFingerprint: applicationVersion.fingerprint,
              applicationVersionSignalCount: applicationVersion.signals.length,
              applicationVersionSignals: applicationVersion.signals,
              cleanupDetails: result.cleanup,
              reportContractFingerprint,
              declaredOperations: reportReceiptContract.operations,
              declaredAssertions: reportReceiptContract.assertions,
              declaredCleanup: reportReceiptContract.cleanup,
              ...coverage,
            }, null, 2)),
            contentType: 'application/json',
          });
          expect(coverage.missingEvidence).toEqual([]);
          expect(coverage.missingAssertions).toEqual([]);
          expect(coverage.unexpectedAssertions).toEqual([]);
          expect(coverage.complete).toBe(true);
          writeProductCenterGroupProgress({ runId: progressRunId, caseId: binding.caseId, phase: 'completed' });
        } catch (error) {
          const observedDifference = readProductCenterGroupObservedDifferenceEvidence(error);
          if (observedDifference) {
            await testInfo.attach('product-center-group-product-difference-evidence', {
              body: Buffer.from(JSON.stringify(observedDifference, null, 2)),
              contentType: 'application/json',
            });
          }
          writeProductCenterGroupProgress({ runId: progressRunId, caseId: binding.caseId, phase: 'failed' });
          throw error;
        }
      },
    );
  }
});
