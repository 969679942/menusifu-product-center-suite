import { test } from '../../fixtures/product-center.fixture';
import {
  readProductCenterGroupObservedDifferenceEvidence,
  runProductCenterGroupCase,
} from '../../utils/product-center-group-runner';
import { evaluateGroupEvidence } from '../../utils/product-center-group-automation';
import { classifyProductCenterFailure } from '../../utils/product-center-failure-classifier';
import { classifyProductCenterItemResponsibility } from '../../utils/product-center-item-practice-evidence';
import type { GroupAutomationBinding } from '../../utils/product-center-group-automation';
import { buildProductCenterGroupCaseFingerprintManifest } from '../../utils/product-center-group-case-fingerprint';
import { assertObservedExecutableOperations, consumeExecutableOperationReceipts } from '../../utils/executable-operation-receipt';
import { readProductCenterApplicationVersion } from '../../utils/product-center-application-version';
import { fingerprintReceiptEvidence } from '../../utils/playwright-execution-receipt';
import { runtimeConfig } from '../../api/runtime-config';
import bindingsDocument from '../../contracts/product-center/group/product-center-group-bindings.json';

const selectedCaseIds = new Set((process.env.PC_GROUP_FINDING_CASE_IDS ?? '')
  .split(',')
  .map((item) => item.trim())
  .filter(Boolean));
const bindings = (bindingsDocument.cases as unknown as GroupAutomationBinding[]).filter((binding) => (
  binding.blockClassification === 'observed-product-drift'
  && binding.handlerId !== null
  && (selectedCaseIds.size === 0 || selectedCaseIds.has(binding.caseId))
));
const implementationFingerprintByCaseId = new Map(buildProductCenterGroupCaseFingerprintManifest(
  process.cwd(),
  bindingsDocument.cases as unknown as GroupAutomationBinding[],
  { includeObservedProductDrift: true },
).cases.map((item) => [item.caseId, item.implementationFingerprint]));

test.describe('商品中心组产品发现严格重放', () => {
  test.describe.configure({ mode: 'default', timeout: 300_000 });

  for (const binding of bindings) {
    test(
      binding.title,
      {
        tag: ['@product-center-group-finding', `@case-${binding.caseId}`],
        annotation: [
          { type: 'group-case-id', description: binding.caseId },
          { type: 'recipe-case-id', description: binding.caseId },
          { type: 'group-finding-replay', description: 'expected-product-conflict' },
        ],
      },
      async ({ page, productCenterApi, cleanupRegistry, executionLedger }, testInfo) => {
        try {
          const result = await runProductCenterGroupCase({
            binding,
            page,
            productCenterApi,
            cleanupRegistry,
            executionLedger,
            allowObservedProductDrift: true,
          });
          const coverage = evaluateGroupEvidence(binding, result, { allowObservedProductDrift: true });
          const operationReceipts = consumeExecutableOperationReceipts(testInfo.testId);
          assertObservedExecutableOperations(operationReceipts, binding.caseId);
          const implementationFingerprint = implementationFingerprintByCaseId.get(binding.caseId);
          if (!implementationFingerprint) throw new Error(`${binding.caseId} 产品发现重放缺少当前实现指纹`);
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
            executionEpochId: process.env.PC_SOURCE_GOVERNED_RUN_ID ?? `group-finding-${Date.now()}`,
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
          await testInfo.attach('product-center-group-runtime-evidence', {
            body: Buffer.from(JSON.stringify({
              ...standardReceipt,
              evidenceFingerprint: fingerprintReceiptEvidence(standardReceipt),
              requiredEvidence: binding.requiredEvidence,
              observedEvidence: result.evidence,
              requiredAssertionIds: binding.assertionIds,
              observedAssertionIds: result.assertionIds,
              cleanupDetails: result.cleanup,
              ...coverage,
            }, null, 2)),
            contentType: 'application/json',
          });
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          const staleFinding = message.includes('当前运行未再观察到已登记产品偏差');
          const observedDifference = readProductCenterGroupObservedDifferenceEvidence(error);
          const evidenceComplete = observedDifference?.evidenceComplete === true
            && observedDifference.productMismatchConfirmed === true
            && observedDifference.executionPathEquivalent === true;
          const preliminary = classifyProductCenterFailure({
            message,
            evidenceComplete,
            productMismatchConfirmed: observedDifference?.productMismatchConfirmed === true,
            executionPathEquivalent: observedDifference?.executionPathEquivalent === true,
          });
          const classification = preliminary.category === 'unknown'
            ? classifyProductCenterFailure({ message, assertion: true })
            : preliminary;
          const responsibility = staleFinding
            ? 'automation-gap'
            : classifyProductCenterItemResponsibility(classification.category, evidenceComplete);
          const operationReceipts = consumeExecutableOperationReceipts(testInfo.testId);
          const implementationFingerprint = implementationFingerprintByCaseId.get(binding.caseId);
          const cleanupComplete = observedDifference?.cleanupVerifiedZero === true;
          if (!implementationFingerprint) throw new Error(`${binding.caseId} 产品发现重放缺少当前实现指纹`);
          await testInfo.attach('product-center-group-finding-observation', {
            body: Buffer.from(JSON.stringify({
              caseId: binding.caseId,
              bindingFingerprint: binding.bindingFingerprint,
              handlerId: binding.handlerId,
              failureCategory: classification.category,
              responsibility,
              staleFinding,
              assertionIds: binding.assertionIds,
              expectedResults: binding.expectedResults,
              observedConflict: classification.diagnostic,
              observedDifference,
              operationReceipts,
              checkpointPath: executionLedger.filePath,
            }, null, 2)),
            contentType: 'application/json',
          });
          await testInfo.attach('product-center-group-finding-optimization-receipt', {
            body: Buffer.from(JSON.stringify({
              caseId: binding.caseId,
              caseFingerprint: binding.bindingFingerprint,
              implementationFingerprint,
              status: 'failed',
              failureCategory: responsibility,
              evidenceComplete: responsibility === 'product-failure' && evidenceComplete,
              operationReceiptCount: operationReceipts.length,
              assertionReceiptCount: responsibility === 'product-failure' ? binding.assertionIds.length : 0,
              cleanupComplete,
            }, null, 2)),
            contentType: 'application/json',
          });
          throw error;
        }
      },
    );
  }
});
