import fs from 'node:fs';
import path from 'node:path';
import {
  buildGroupAutomationBindings,
  readGroupCases,
  readGroupValidationFeedbackContract,
} from '../utils/product-center-group-automation';
import {
  loadProductCenterGroupDriftDecisionRegistry,
  productCenterGroupAssertionSurfaceContract,
  productCenterGroupSourceRuleSemanticContract,
} from '../utils/product-center-group-semantic-gate';
import { loadProductCenterSourceGovernance } from '../utils/product-center-source-governance';

const projectRoot = path.resolve(__dirname, '..');
const contractPath = path.join(projectRoot, 'contracts/product-center/generated/modules/brand-group.json');
const outputRoot = path.join(projectRoot, 'contracts/product-center/group');
const specPath = path.join(projectRoot, 'tests/generated/product-center-group.generated.spec.ts');

function main(): void {
  const cases = readGroupCases(projectRoot);
  const contract = JSON.parse(fs.readFileSync(contractPath, 'utf8'));
  const feedbackContract = readGroupValidationFeedbackContract(projectRoot);
  const sourceGovernance = loadProductCenterSourceGovernance(projectRoot);
  const bindings = buildGroupAutomationBindings(cases, contract, feedbackContract, sourceGovernance);
  const driftRegistry = loadProductCenterGroupDriftDecisionRegistry(projectRoot);
  const generated = bindings.filter((item) => item.generationAllowed);
  const blocked = bindings.filter((item) => !item.generationAllowed);
  const semanticGateBlocked = blocked.filter((item) => [
    'case-spec-conflict',
    'assertion-surface-mismatch',
    'field-identity-ambiguous',
    'source-rule-conflict',
  ].includes(String(item.blockClassification)));
  if (semanticGateBlocked.length > 0) {
    throw new Error(`P0 语义资格门禁失败：${semanticGateBlocked.map((item) => `${item.caseId}:${item.blockClassification}`).join(', ')}`);
  }
  const registeredDriftCaseIds = [...driftRegistry.decisions.map((item) => item.caseId)].sort();
  const classifiedDriftCaseIds = [...blocked
    .filter((item) => item.blockClassification === 'observed-product-drift')
    .map((item) => item.caseId)].sort();
  if (JSON.stringify(registeredDriftCaseIds) !== JSON.stringify(classifiedDriftCaseIds)) {
    throw new Error(`P0 产品偏差登记与分类不一致：registered=${registeredDriftCaseIds.length} classified=${classifiedDriftCaseIds.length}`);
  }

  writeJson(path.join(outputRoot, 'product-center-group-automation-contract.json'), {
    schemaVersion: '1.0.0',
    collectionId: 'product-center-group-automation-contract',
    generatedAt: new Date().toISOString(),
    status: 'review-required',
    summary: {
      totalCases: bindings.length,
      generated: generated.length,
      blocked: blocked.length,
      readOnly: bindings.filter((item) => item.mode === 'read-only').length,
      crudSop: bindings.filter((item) => item.mode === 'crud-sop').length,
      manual: 0,
      profiles: Object.fromEntries([...new Set(bindings.map((item) => item.executionProfile))].sort().map((profile) => [profile, bindings.filter((item) => item.executionProfile === profile).length])),
    },
    executionModel: {
      strategy: 'explicit-handler-and-evidence-gate',
      skippedByGenerator: 0,
      unsupportedProfilesFailExplicitly: true,
    },
    cases: bindings,
  });
  writeJson(path.join(outputRoot, 'product-center-group-bindings.json'), {
    schemaVersion: '1.0.0',
    collectionId: 'product-center-group-bindings',
    generatedAt: new Date().toISOString(),
    cases: bindings,
  });
  fs.mkdirSync(path.dirname(specPath), { recursive: true });
  fs.writeFileSync(specPath, renderSpec(), 'utf8');

  writeJson(path.join(projectRoot, '..', 'deliverables/product-center-group/automation-manifest.json'), {
    schemaVersion: '1.0.0',
    collectionId: 'product-center-group-automation-manifest',
    generatedAt: new Date().toISOString(),
    status: 'review-required',
    source: 'deliverables/product-center-group/test-cases.json',
    bindings: 'Merchant Center UITest/contracts/product-center/group/product-center-group-bindings.json',
    spec: 'Merchant Center UITest/tests/generated/product-center-group.generated.spec.ts',
    summary: {
      total: bindings.length,
      generated: generated.length,
      blocked: blocked.length,
      actualExecutable: generated.length,
      manualBusinessConfirmation: 0,
      technicalBlocks: blocked.length,
      semanticGateBlocked: 0,
    },
  });
  writeJson(path.join(projectRoot, '..', 'deliverables/product-center-group/p0-semantic-gate-report.json'), {
    schemaVersion: '1.0.0',
    reportId: 'product-center-group-p0-semantic-gate',
    generatedAt: new Date().toISOString(),
    status: 'passed',
    sourceCases: cases.length,
    executableCases: generated.length,
    caseSpecConflict: 0,
    assertionSurfaceMismatch: 0,
    fieldIdentityAmbiguous: 0,
    sourceRuleConflict: 0,
    registeredProductDrifts: registeredDriftCaseIds.length,
    classifiedProductDrifts: classifiedDriftCaseIds.length,
    driftRegistry: 'Merchant Center UITest/contracts/product-center/group/product-center-group-drift-decisions.json',
    assertionSurfaceContract: productCenterGroupAssertionSurfaceContract,
    sourceRuleSemanticContract: productCenterGroupSourceRuleSemanticContract,
    gates: {
      interactionContainerIsBusinessInvariant: false,
      productDriftRequiresCurrentSourceHash: true,
      productDriftRequiresEvidenceHash: true,
      productDriftRegistryMustMatchClassification: true,
      priceFieldIdentityRequired: true,
      sourceRuleEntailmentRequired: true,
      semanticIssuesFailBuild: true,
    },
  });
  process.stdout.write(JSON.stringify({ total: bindings.length, generated: generated.length, blocked: blocked.length }, null, 2) + '\n');
}

function renderSpec(): string {
  return `import { expect, test } from '../../fixtures/product-center.fixture';
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
        tag: ['@product-center-group', \`@case-\${binding.caseId}\`],
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
`;
}

function writeJson(filePath: string, value: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.tmp`;
  fs.writeFileSync(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  fs.renameSync(temporaryPath, filePath);
}

if (require.main === module) main();
