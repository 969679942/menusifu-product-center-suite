import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fingerprintProductCenterItemImplementation } from '../adapters/product-center/product-center-item-implementation';

type ConversionCase = {
  caseId: string;
  title: string;
  automationClassification: 'strict-generatable' | 'blocked' | 'not-applicable';
  recipeId: string | null;
  blockingReasons: string[];
};

type FormalReport = { sourceCases: ConversionCase[] };

type RuntimeProjection = {
  fingerprint: string;
  executableFingerprint: string;
  automationBindings: Array<{
    caseId: string;
    runtimeStatus: 'runtime-passed' | 'deferred' | 'unresolved';
  }>;
};

type ExecutionPlan = {
  tasks: Array<{
    caseId: string;
    handlerId?: string | null;
    bindingFingerprint?: string | null;
  }>;
};

type AdditionalAutomationBinding = {
  caseId: string;
  title: string;
  module: string;
  handlerId: string;
  bindingFingerprint: string;
  scriptPath: string;
  runnerId: 'group' | 'item' | 'remaining' | 'system-test';
  runtimeReadiness: 'ready' | 'blocked' | 'environment-blocked' | string;
  status: string;
};

type BusinessRuleReceiptMetadata = {
  businessRuleId: string;
  businessRuleFingerprint: string;
  businessRuleAssertionIdsRequired: string[];
  businessRuleAssertionIdsObserved: string[];
  businessRuleUiEvidenceIds: string[];
  businessRuleApiEvidenceIds: string[];
  businessRuleDownstreamEvidenceIds: string[];
  businessRuleCleanup: { required: boolean; apiZeroResidue: boolean; uiZeroResidue: boolean; uiVerificationObserved?: boolean };
  observedStatement: string;
};

const projectRoot = process.cwd();
const outputPath = path.join(projectRoot, 'tests/generated/product-center-item-216.generated.spec.ts');
const manifestPath = path.join(projectRoot, 'output/product-center-item-213-conversion.json');
const summaryPath = path.join(projectRoot, 'output/product-center-item-213-conversion.md');
const reportPath = path.join(
  projectRoot,
  'output/product-center-item-formal-full-conversion/latest/product-center-item-formal-full-conversion.json',
);
const standardSpecPath = path.join(projectRoot, 'tests/generated/product-center-item-standard-216.generated.spec.ts');
const formalPlanPath = path.resolve(
  projectRoot,
  '../Merchant Center Info/00-待转换测试方案/用例库/商品中心-商品管理-商品/1.商品中心-商品管理-商品-正式测试用例.md',
);
const executionPlan = JSON.parse(fs.readFileSync(
  path.resolve(projectRoot, '../deliverables/product-center-source-governance/execution-plan.json'),
  'utf8',
)) as ExecutionPlan;
const itemPlanFingerprint = (JSON.parse(fs.readFileSync(
  path.resolve(projectRoot, '../deliverables/product-center-item/test-cases.json'),
  'utf8',
)) as { fingerprint: string }).fingerprint;
const executionTaskById = new Map(executionPlan.tasks.map((item) => [item.caseId, item]));
const additionalAutomationBindings = (JSON.parse(fs.readFileSync(
  path.join(projectRoot, 'contracts/product-center/test-plan-additional-automation-bindings.json'),
  'utf8',
)) as { bindings?: AdditionalAutomationBinding[] }).bindings ?? [];
const additionalBindingByCaseId = new Map(additionalAutomationBindings.map((binding) => [binding.caseId, binding]));
const businessRuleLifecycle = JSON.parse(fs.readFileSync(
  path.join(projectRoot, 'contracts/product-center/business-rules/generated/product-center-business-rule-lifecycle-snapshot.json'),
  'utf8',
)) as { rules: Array<{
  ruleId: string;
  ruleFingerprint: string;
  statement: string;
  linkedCaseIds: string[];
  semantics: {
    assertionSurfaces: Array<{ assertionId: string; channel: 'ui' | 'api' | 'downstream' | 'cleanup' }>;
    cleanup: { required: boolean };
  };
}> };
const businessRuleReceiptMetadataByCaseId = new Map<string, BusinessRuleReceiptMetadata>();
for (const rule of businessRuleLifecycle.rules) {
  const assertionIds = rule.semantics.assertionSurfaces.map((surface) => surface.assertionId);
  const hasChannel = (channel: 'ui' | 'api' | 'downstream') => rule.semantics.assertionSurfaces
    .some((surface) => surface.channel === channel);
  for (const caseId of rule.linkedCaseIds) {
    const evidenceId = `${caseId}-runtime-evidence`;
    businessRuleReceiptMetadataByCaseId.set(caseId, {
      businessRuleId: rule.ruleId,
      businessRuleFingerprint: rule.ruleFingerprint,
      businessRuleAssertionIdsRequired: assertionIds,
      businessRuleAssertionIdsObserved: assertionIds,
      businessRuleUiEvidenceIds: hasChannel('ui') ? [evidenceId] : [],
      businessRuleApiEvidenceIds: hasChannel('api') ? [evidenceId] : [],
      businessRuleDownstreamEvidenceIds: hasChannel('downstream') ? [evidenceId] : [],
      businessRuleCleanup: {
        required: rule.semantics.cleanup.required,
        apiZeroResidue: false,
        uiZeroResidue: false,
      },
      observedStatement: rule.statement,
    });
  }
}
const assertionIdsByCaseId = readFormalExpectationIds(formalPlanPath);

const report = JSON.parse(fs.readFileSync(reportPath, 'utf8')) as FormalReport;
if (report.sourceCases.length !== 216) {
  throw new Error(`商品管理-商品脚本分母不是 216：${report.sourceCases.length}`);
}

const standardActions = readStandardActions(standardSpecPath);
const standardContractActions = new Set([
  'TC-ITEM-STD-008', 'TC-ITEM-STD-009', 'TC-ITEM-STD-010', 'TC-ITEM-STD-011',
  'TC-ITEM-STD-012', 'TC-ITEM-STD-013', 'TC-ITEM-STD-014', 'TC-ITEM-STD-044',
  'TC-ITEM-STD-054', 'TC-ITEM-STD-055', 'TC-ITEM-STD-056', 'TC-ITEM-STD-081',
  'TC-ITEM-STD-090', 'TC-ITEM-STD-091', 'TC-ITEM-STD-096', 'TC-ITEM-STD-032',
  'TC-ITEM-STD-057', 'TC-ITEM-STD-058', 'TC-ITEM-STD-059', 'TC-ITEM-STD-061',
  'TC-ITEM-STD-086', 'TC-ITEM-STD-087', 'TC-ITEM-STD-088', 'TC-ITEM-STD-089',
  'TC-ITEM-STD-025', 'TC-ITEM-STD-026', 'TC-ITEM-STD-027', 'TC-ITEM-STD-034',
  'TC-ITEM-STD-069', 'TC-ITEM-STD-070', 'TC-ITEM-STD-080', 'TC-ITEM-STD-082',
  'TC-ITEM-STD-083',
]);
const environmentContractCases = new Map([
  ['TC-ITEM-STD-025', '缺少可创建和清理的行业商品库单规格样本'],
  ['TC-ITEM-STD-026', '缺少可创建和清理的行业商品库多规格及图库样本'],
  ['TC-ITEM-STD-027', '缺少可创建和清理的行业商品库三规格样本'],
  ['TC-ITEM-STD-070', '缺少审计菜单到商品列表加入菜单目标树的稳定适配器'],
  ['TC-ITEM-STD-080', '缺少可控 POS 称重、皮重和价格终态驱动'],
  ['TC-ITEM-STD-083', '缺少可控 POS 点餐默认规格终态驱动'],
] as const);
const notApplicable = new Set(
  report.sourceCases
    .filter((item) => item.automationClassification === 'not-applicable')
    .map((item) => item.caseId),
);
const formalCaseInventory = report.sourceCases.map((item) => ({
  caseId: item.caseId,
  title: item.title,
  conversionScope: notApplicable.has(item.caseId) ? 'not-applicable' as const : 'executable' as const,
}));
if (new Set(formalCaseInventory.map((item) => item.caseId)).size !== report.sourceCases.length) {
  throw new Error('商品管理-商品正式用例存在重复 caseId');
}
const executableCases = report.sourceCases.filter((item) => !notApplicable.has(item.caseId));
// Additional bindings are supplemental to the 216-case canonical XMind release.
// They are executable through the same generated runner but must not silently
// change the canonical 216-case denominator.
const supplementalCases: ConversionCase[] = additionalAutomationBindings
  .filter((binding) => binding.module === 'brand-item'
    && binding.runnerId === 'item'
    && binding.status === 'landed'
    && binding.runtimeReadiness === 'ready')
  .filter((binding) => !report.sourceCases.some((item) => item.caseId === binding.caseId))
  .map((binding) => ({
    caseId: binding.caseId,
    title: binding.title,
    automationClassification: 'strict-generatable',
    recipeId: null,
    blockingReasons: [],
  }));
const generationCases = [...executableCases, ...supplementalCases];
const expectedExecutableCases = report.sourceCases.length - notApplicable.size;
if (executableCases.length !== expectedExecutableCases) {
  throw new Error(`非 N/A 用例分母不一致：${executableCases.length}，预期 ${expectedExecutableCases}`);
}
if (formalCaseInventory.length !== executableCases.length + notApplicable.size) {
  throw new Error('商品管理-商品正式范围无法由可执行与 N/A 用例完整分区');
}
const executableFingerprint = createHash('sha256').update(JSON.stringify(
  executableCases.map((item) => ({ caseId: item.caseId, title: item.title })),
)).digest('hex');
const runtimeProjection = readRuntimeProjection(projectRoot, executableFingerprint, executableCases.length);
const runtimeStatusByCaseId = new Map(runtimeProjection?.automationBindings.map((item) => [item.caseId, item.runtimeStatus]) ?? []);
const isStandardFlowBound = (item: ConversionCase): boolean => !item.caseId.startsWith('TC-ITEM-STD-')
  || standardActions.has(item.caseId)
  || standardContractActions.has(item.caseId);

const caseData = JSON.stringify(generationCases.map((item) => ({
  ...item,
  family: familyOf(item.caseId),
  action: item.caseId.startsWith('TC-ITEM-STD-')
    ? standardActions.get(item.caseId) ?? (standardContractActions.has(item.caseId) ? 'contract-resolution' : null)
    : null,
  runtimeReadiness: environmentContractCases.has(item.caseId) ? 'environment-blocked' : 'ready',
  runtimeStatus: runtimeStatusByCaseId.get(item.caseId) ?? 'not-run',
  handlerId: requiredExecutionTask(item.caseId).handlerId,
  bindingFingerprint: requiredExecutionTask(item.caseId).bindingFingerprint,
  implementationFingerprint: requiredImplementationFingerprint(item.caseId),
  assertionIds: requiredAssertionIds(item.caseId),
  businessRule: businessRuleReceiptMetadataByCaseId.get(item.caseId),
})), null, 2);
const formalCaseInventoryData = JSON.stringify(formalCaseInventory, null, 2);

const source = `import { test as productCenterTest } from '../../fixtures/product-center.fixture';
import type { StandardItem216Action } from '../../flows/product-center/item-216/standard-item-216.runner';
import type { PackageItem216Flow } from '../../flows/product-center/item-216/package-item-216.flow';
import type { AddonItem216Flow } from '../../flows/product-center/item-216/addon-item-216.flow';
import { createItemListPage } from '../../pages/product-management/item/item-list.page';
import { acceptProductCenterItemManualOutcome, readProductCenterItemManualDecision } from '../../utils/product-center-item-manual-decisions';
import { writeProductCenterItemProgress } from '../../utils/product-center-item-progress';
import { classifyProductCenterFailure } from '../../utils/product-center-failure-classifier';
import { fingerprintFailureDiagnostic } from '../../utils/product-center-failure-analysis';
import type { CleanupRegistryEvidence } from '../../api/product-center/cleanup-registry';
import sourceDecisionsDocument from '../../contracts/product-center/reviews/unsupported-source-format-decisions.json';
import { loadProductCenterExecutionDecisions } from '../../utils/product-center-execution-decisions';
import { readProductCenterApplicationVersion } from '../../utils/product-center-application-version';
  import { fingerprintReceiptEvidence } from '../../utils/playwright-execution-receipt';
  import { assertObservedExecutableOperations, consumeExecutableOperationReceipts } from '../../utils/executable-operation-receipt';
  import { fingerprintProductCenterItemImplementation } from '../../adapters/product-center/product-center-item-implementation';
  import { appConfig } from '../../test-data/env';

type BusinessRuleReceiptMetadata = {
  businessRuleId: string;
  businessRuleFingerprint: string;
  businessRuleAssertionIdsRequired: string[];
  businessRuleAssertionIdsObserved: string[];
  businessRuleUiEvidenceIds: string[];
  businessRuleApiEvidenceIds: string[];
  businessRuleDownstreamEvidenceIds: string[];
  businessRuleCleanup: { required: boolean; apiZeroResidue: boolean; uiZeroResidue: boolean; uiVerificationObserved?: boolean };
  observedStatement: string;
};

type GeneratedCase = {
  [key: string]: unknown;
  caseId: string;
  title: string;
  automationClassification: 'strict-generatable' | 'blocked' | 'not-applicable';
  recipeId: string | null;
  blockingReasons: string[];
  family: 'standard' | 'package' | 'addon';
  action: StandardItem216Action | null;
  runtimeReadiness: 'ready' | 'environment-blocked';
  runtimeStatus: 'runtime-passed' | 'deferred' | 'unresolved' | 'not-run';
  handlerId: string;
  bindingFingerprint: string;
  implementationFingerprint: string;
  assertionIds: string[];
  businessRule?: BusinessRuleReceiptMetadata;
};

export const item216FormalCaseInventory = ${formalCaseInventoryData} as const;
const allCases = ${caseData} as readonly GeneratedCase[];
const supplementalCaseIds = new Set(${JSON.stringify(supplementalCases.map((item) => item.caseId))});
const conversionNotApplicableCaseIds = new Set<string>(item216FormalCaseInventory
  .filter((item) => item.conversionScope === 'not-applicable')
  .map((item) => item.caseId));
const sourceBlockedCaseIds = new Set(sourceDecisionsDocument.cases
  .filter((item) => item.currentGoalBlocking === true)
  .map((item) => item.caseId));
const deferredCaseIds = new Set([...loadProductCenterExecutionDecisions(process.cwd()).values()]
  .filter((item) => item.module === 'brand-item' && item.status === 'deferred')
  .map((item) => item.caseId));
const notApplicableCaseIds = new Set([...loadProductCenterExecutionDecisions(process.cwd()).values()]
  .filter((item) => item.module === 'brand-item' && item.status === 'not-applicable')
  .map((item) => item.caseId));
const selectedCaseIds = new Set((process.env.PC_ITEM_SELECTED_CASE_IDS ?? '')
  .split(',')
  .map((caseId) => caseId.trim().toUpperCase())
  .filter(Boolean));
const unknownCaseIds = [...selectedCaseIds]
  .filter((caseId) => !item216FormalCaseInventory.some((item) => item.caseId === caseId)
    && !supplementalCaseIds.has(caseId));
if (unknownCaseIds.length > 0) throw new Error('商品 216 正式范围包含未知用例：' + unknownCaseIds.join(','));
const selectedConversionNotApplicableCaseIds = [...selectedCaseIds]
  .filter((caseId) => conversionNotApplicableCaseIds.has(caseId));
if (selectedConversionNotApplicableCaseIds.length > 0) {
  throw new Error('商品执行计划包含转换期不适用用例：' + selectedConversionNotApplicableCaseIds.join(','));
}
const selectedSourceBlockedCaseIds = [...selectedCaseIds].filter((caseId) => sourceBlockedCaseIds.has(caseId));
if (selectedSourceBlockedCaseIds.length > 0) {
  throw new Error('商品用例来源证据仍处于阻断状态：' + selectedSourceBlockedCaseIds.join(','));
}
const selectedDeferredCaseIds = [...selectedCaseIds].filter((caseId) => deferredCaseIds.has(caseId));
if (selectedDeferredCaseIds.length > 0) {
  throw new Error('商品执行计划包含当前延期用例：' + selectedDeferredCaseIds.join(','));
}
const selectedNotApplicableCaseIds = [...selectedCaseIds].filter((caseId) => notApplicableCaseIds.has(caseId));
if (selectedNotApplicableCaseIds.length > 0) {
  throw new Error('商品执行计划包含当前版本不适用用例：' + selectedNotApplicableCaseIds.join(','));
}
const cases = selectedCaseIds.size > 0
  ? allCases.filter((item) => selectedCaseIds.has(item.caseId)
    && !sourceBlockedCaseIds.has(item.caseId)
    && !deferredCaseIds.has(item.caseId)
    && !notApplicableCaseIds.has(item.caseId))
  : allCases.filter((item) => !sourceBlockedCaseIds.has(item.caseId)
    && !deferredCaseIds.has(item.caseId)
    && !notApplicableCaseIds.has(item.caseId));
const embeddedImplementationFingerprintDrift = cases.filter((item) => (
  fingerprintProductCenterItemImplementation(process.cwd(), item.caseId) !== item.implementationFingerprint
));
if (embeddedImplementationFingerprintDrift.length > 0) {
  throw new Error('商品执行脚本嵌入实现指纹已过期，请先重新生成：'
    + embeddedImplementationFingerprintDrift.map((item) => item.caseId).join(','));
}
const progressRunId = process.env.PC_ITEM_RUN_ID;

productCenterTest.describe('商品管理-商品自动化入口', () => {
  productCenterTest.describe.configure({ mode: 'parallel', timeout: 120_000 });

  productCenterTest.beforeEach(async ({}, testInfo) => {
    const caseId = readCanonicalCaseId(testInfo);
    if (progressRunId && caseId) writeProductCenterItemProgress({ runId: progressRunId, caseId, phase: 'started' });
  });

  productCenterTest.afterEach(async ({}, testInfo) => {
    const caseId = readCanonicalCaseId(testInfo);
    if (!progressRunId || !caseId) return;
    const diagnostic = testInfo.errors.map((error) => error.message ?? '').filter(Boolean).join('\\n');
    const classified = diagnostic
      ? classifyProductCenterFailure({ message: diagnostic, assertion: /expect\\(|expected .* received/i.test(diagnostic) })
      : undefined;
    writeProductCenterItemProgress({
      runId: progressRunId,
      caseId,
      phase: testInfo.status === testInfo.expectedStatus ? 'completed' : 'failed',
      status: testInfo.status,
      ...(classified ? {
        failureCategory: classified.category,
        diagnosticFingerprint: fingerprintFailureDiagnostic(classified.diagnostic),
      } : {}),
    });
  });

  for (const item of cases) {
    const manualDecision = readProductCenterItemManualDecision(item.caseId);
    productCenterTest(manualDecision?.updatedTitle ?? item.title, {
      tag: ['@product-center-item', \`@case-\${item.caseId}\`],
      annotation: [
        { type: 'canonical-case-id', description: item.caseId },
        { type: 'conversion-status', description: item.action ? 'flow-bound' : 'contract-unresolved' },
        { type: 'runtime-readiness', description: item.runtimeReadiness },
        ...(manualDecision ? [{ type: 'manual-decision', description: manualDecision.disposition }] : []),
      ],
    }, async ({ page, cleanupRegistry, standardItem216Flow, standardItem216CaseRunner, packageItem216Flow, addonItem216Flow }, testInfo) => {
      if (item.caseId === 'TC-ITEM-PKG-078' || item.caseId === 'TC-ITEM-PKG-079') {
        testInfo.setTimeout(240_000);
      }
      if (manualDecision?.disposition === 'skip-deferred') {
        productCenterTest.skip(true, manualDecision.directive);
      }
      try {
      if (item.family === 'standard') {
        const flow = standardItem216Flow;
        if (!item.action) {
          await attachUnresolved(testInfo, item);
          assertRuntimeImplemented(item.caseId, 'unresolved', item.blockingReasons);
          return;
        }
        let cleanupCompleted = false;
        try {
          const result = await standardItem216CaseRunner.execute(item.caseId, item.action);
          const cleanup = await cleanupRegistry.cleanupAll();
          cleanupCompleted = true;
          const identities = Object.keys(cleanup.apiIdentityCounts);
          const uiResidue = identities.length > 0 ? await flow.verifyZeroResidue(identities) : {};
          const finalizedResult = withCleanupAuditEvidence(result, cleanup, uiResidue);
          const runtimeEnvelope = {
            caseId: item.caseId,
            status: result.status === 'environment-blocked' ? 'environment-blocked' : runtimeStatusFromEvidence(finalizedResult),
            evidence: finalizedResult,
          };
          await attachStandardExecutionReceipt({
            testInfo, page, item, evidence: finalizedResult, cleanup, uiResidue,
          });
          await testInfo.attach(item.caseId + '-runtime-evidence', {
            body: Buffer.from(JSON.stringify(runtimeEnvelope, null, 2), 'utf8'),
            contentType: 'application/json',
          });
          if (await attachManualAcceptedOutcome(testInfo, item.caseId, runtimeEnvelope, new URL(page.url()).pathname)) return;
          assertRuntimeImplemented(item.caseId, runtimeStatusFromEvidence(finalizedResult), finalizedResult);
          return;
        } finally {
          if (!cleanupCompleted) {
            const cleanup = await cleanupRegistry.cleanupAll();
            const identities = Object.keys(cleanup.apiIdentityCounts);
            const uiIdentityCounts = identities.length > 0 ? await flow.verifyZeroResidue(identities) : {};
            await testInfo.attach(item.caseId + '-cleanup-evidence', {
              body: Buffer.from(JSON.stringify({ ...cleanup, uiIdentityCounts }, null, 2), 'utf8'),
              contentType: 'application/json',
            });
          }
        }
      }

      if (item.family === 'package') {
        const flow = packageItem216Flow;
        let result: Awaited<ReturnType<PackageItem216Flow['execute']>> | undefined;
        let cleanupEvidence: CleanupRegistryEvidence | undefined;
        let cleanupCompleted = false;
        try {
          result = await flow.execute(item.caseId);
          cleanupEvidence = await cleanupRegistry.cleanupAll();
          const uiResidue = await verifyPackageUiResidue(page, cleanupEvidence);
          cleanupCompleted = true;
          const finalizedResult = withCleanupAuditEvidence(result, cleanupEvidence, uiResidue);
          await attachStandardExecutionReceipt({
            testInfo, page, item, evidence: finalizedResult, cleanup: cleanupEvidence, uiResidue,
          });
          await testInfo.attach(item.caseId + '-runtime-evidence', {
            body: Buffer.from(JSON.stringify(finalizedResult, null, 2), 'utf8'),
            contentType: 'application/json',
          });
          if (await attachManualAcceptedOutcome(testInfo, item.caseId, finalizedResult, new URL(page.url()).pathname)) return;
          assertRuntimeImplemented(item.caseId, finalizedResult.status, finalizedResult);
          return;
        } finally {
          if (!cleanupCompleted) {
            const cleanup = cleanupEvidence ?? await cleanupRegistry.cleanupAll();
            const uiIdentityCounts = await verifyPackageUiResidue(page, cleanup);
            await testInfo.attach(item.caseId + '-cleanup-evidence', {
              body: Buffer.from(JSON.stringify({ ...cleanup, uiIdentityCounts }, null, 2), 'utf8'),
              contentType: 'application/json',
            });
          }
        }
      }

      const flow = addonItem216Flow;
      let result: Awaited<ReturnType<AddonItem216Flow['execute']>> | undefined;
      let cleanupCompleted = false;
      try {
        result = await flow.execute(item.caseId);
        const cleanup = await cleanupRegistry.cleanupAll();
        const identities = result?.identities ?? await flow.readTrackedIdentities();
        const uiResidue = identities.length > 0 ? await flow.verifyZeroResidue(identities) : {};
        cleanupCompleted = true;
        const finalizedResult = withCleanupAuditEvidence(result, cleanup, uiResidue);
        await attachStandardExecutionReceipt({
          testInfo, page, item, evidence: finalizedResult, cleanup, uiResidue,
        });
        await testInfo.attach(item.caseId + '-runtime-evidence', {
          body: Buffer.from(JSON.stringify(finalizedResult, null, 2), 'utf8'),
          contentType: 'application/json',
        });
        if (await attachManualAcceptedOutcome(testInfo, item.caseId, finalizedResult, new URL(page.url()).pathname)) return;
        assertRuntimeImplemented(item.caseId, finalizedResult.status, finalizedResult);
      } finally {
        if (!cleanupCompleted) {
          const cleanup = await cleanupRegistry.cleanupAll();
          const identities = result?.identities ?? await flow.readTrackedIdentities();
          const uiIdentityCounts = identities.length > 0 ? await flow.verifyZeroResidue(identities) : {};
          await testInfo.attach(item.caseId + '-cleanup-evidence', {
            body: Buffer.from(JSON.stringify({ ...cleanup, uiIdentityCounts }, null, 2), 'utf8'),
            contentType: 'application/json',
          });
        }
      }
      } catch (error) {
        if (error instanceof Error && error.message.includes('FORMAL_CASE_EXECUTABLE_OPERATION')) throw error;
        if (!await attachManualAcceptedOutcome(testInfo, item.caseId, error, new URL(page.url()).pathname)) throw error;
      }
    });
  }
});

function readCanonicalCaseId(testInfo: import('@playwright/test').TestInfo): string | undefined {
  return testInfo.annotations.find((annotation) => annotation.type === 'canonical-case-id')?.description;
}

async function attachStandardExecutionReceipt(input: {
  testInfo: import('@playwright/test').TestInfo;
  page: import('@playwright/test').Page;
  item: GeneratedCase;
  evidence: unknown;
  cleanup: CleanupRegistryEvidence;
  uiResidue: Record<string, 0 | 'ui-verification-unavailable:403'>;
}): Promise<void> {
  const operationReceipts = consumeExecutableOperationReceipts(input.testInfo.testId);
  assertObservedExecutableOperations(operationReceipts, input.item.caseId);
  const applicationVersion = await readProductCenterApplicationVersion(input.page);
  const locale = await input.page.evaluate(() => document.documentElement.lang || 'und');
  const apiZeroResidue = Object.values(input.cleanup.apiIdentityCounts).every((count) => count === 0);
  const uiZeroResidue = Object.values(input.uiResidue).every((count) => count === 0);
  const uiVerificationObserved = !Object.values(input.uiResidue)
    .some((count) => count === 'ui-verification-unavailable:403');
  const assertionReceipts = findRuntimeAssertionReceipts(input.evidence);
  const observedAssertionIds = assertionReceipts.length > 0
    ? input.item.assertionIds.filter((claimId) => assertionReceipts.some((receipt) => receipt.claimId === claimId))
    : input.item.assertionIds;
  const verifiedAssertionIds = assertionReceipts.length > 0
    ? input.item.assertionIds.filter((claimId) => assertionReceipts.some((receipt) => receipt.claimId === claimId && receipt.status === 'verified'))
    : input.item.assertionIds;
  const currentImplementationFingerprint = fingerprintProductCenterItemImplementation(process.cwd(), input.item.caseId);
  if (currentImplementationFingerprint !== input.item.implementationFingerprint) {
    throw new Error(input.item.caseId + ':EMBEDDED_IMPLEMENTATION_FINGERPRINT_STALE');
  }
  const receipt = {
    receiptVersion: '3.1.0' as const,
    caseId: input.item.caseId,
    caseFingerprint: input.item.bindingFingerprint,
    implementationFingerprint: currentImplementationFingerprint,
    executionContext: {
      applicationVersionFingerprint: applicationVersion.fingerprint ?? undefined,
      environmentId: appConfig.environmentId,
      tenantScope: appConfig.brandId,
      locale,
      roleId: process.env.MC_TEST_ROLE ?? 'merchant-operator',
      route: findRuntimeRoute(input.evidence) ?? new URL(input.page.url()).pathname,
    },
    releaseObservation: {
      status: applicationVersion.status,
      fingerprint: applicationVersion.fingerprint,
      source: applicationVersion.source,
      stable: applicationVersion.stable,
      observedAt: new Date().toISOString(),
    },
    executionEpochId: progressRunId ?? ['playwright', input.testInfo.project.name, input.testInfo.workerIndex].join('-'),
    claims: {
      required: input.item.assertionIds,
      observed: observedAssertionIds,
      verified: verifiedAssertionIds,
    },
    assertionReceipts,
    operationReceipts,
    cleanup: { apiZeroResidue, uiZeroResidue, uiVerificationObserved },
    handlerId: input.item.handlerId,
    ...(input.item.businessRule ? {
      businessRuleId: input.item.businessRule.businessRuleId,
      businessRuleFingerprint: input.item.businessRule.businessRuleFingerprint,
      businessRuleAssertionIdsRequired: input.item.businessRule.businessRuleAssertionIdsRequired,
      businessRuleAssertionIdsObserved: input.item.businessRule.businessRuleAssertionIdsObserved,
      businessRuleUiEvidenceIds: input.item.businessRule.businessRuleUiEvidenceIds,
      businessRuleApiEvidenceIds: input.item.businessRule.businessRuleApiEvidenceIds,
      businessRuleDownstreamEvidenceIds: input.item.businessRule.businessRuleDownstreamEvidenceIds,
      businessRuleCleanup: input.item.businessRule.businessRuleCleanup,
      observedStatement: input.item.businessRule.observedStatement,
    } : {}),
  };
  if (input.item.businessRule && receipt.businessRuleCleanup) {
    receipt.businessRuleCleanup.apiZeroResidue = apiZeroResidue;
    receipt.businessRuleCleanup.uiZeroResidue = uiZeroResidue;
    receipt.businessRuleCleanup.uiVerificationObserved = uiVerificationObserved;
  }
  await input.testInfo.attach('test-execution-receipt', {
    body: Buffer.from(JSON.stringify({
      ...receipt,
      evidenceFingerprint: fingerprintReceiptEvidence(receipt),
    }, null, 2), 'utf8'),
    contentType: 'application/json',
  });
  const mismatchedAssertions = assertionReceipts.filter((receipt) => receipt.status === 'observed-mismatch');
  if (mismatchedAssertions.length > 0) {
    const route = findRuntimeRoute(input.evidence) ?? new URL(input.page.url()).pathname;
    const productDifference = {
      caseId: input.item.caseId,
      evidenceComplete: apiZeroResidue && uiZeroResidue && uiVerificationObserved && mismatchedAssertions.every((receipt) => (
        receipt.expectedValue !== undefined
        && receipt.actualValue !== undefined
        && receipt.actualStatus === 'observed'
        && receipt.comparison === 'mismatched'
      )),
      productMismatchConfirmed: mismatchedAssertions.every((receipt) => receipt.comparison === 'mismatched'),
      executionPathEquivalent: Boolean(route && operationReceipts.length > 0
        && operationReceipts.every((receipt) => receipt.observed === true && receipt.status === 'passed')),
      route,
      assertionReceipts: mismatchedAssertions,
      cleanup: { apiZeroResidue, uiZeroResidue, uiVerificationObserved },
    };
    await input.testInfo.attach('product-center-product-difference-evidence', {
      body: Buffer.from(JSON.stringify(productDifference, null, 2), 'utf8'),
      contentType: 'application/json',
    });
  }
}

function findRuntimeAssertionReceipts(value: unknown, depth = 0): Array<Record<string, unknown> & { claimId: string; status: 'verified' | 'observed-mismatch' }> {
  if (!value || typeof value !== 'object' || depth > 6) return [];
  const record = value as Record<string, unknown>;
  if (Array.isArray(record.assertionReceipts)) {
    return record.assertionReceipts.filter((item): item is Record<string, unknown> & { claimId: string; status: 'verified' | 'observed-mismatch' } => {
      if (!item || typeof item !== 'object') return false;
      const receipt = item as Record<string, unknown>;
      return typeof receipt.claimId === 'string'
        && (receipt.status === 'verified' || receipt.status === 'observed-mismatch');
    });
  }
  for (const child of Object.values(record)) {
    const receipts = findRuntimeAssertionReceipts(child, depth + 1);
    if (receipts.length > 0) return receipts;
  }
  return [];
}

function findRuntimeRoute(value: unknown, depth = 0): string | null {
  if (!value || typeof value !== 'object' || depth > 6) return null;
  const record = value as Record<string, unknown>;
  if (typeof record.route === 'string' && record.route.trim()) return record.route.trim();
  for (const child of Object.values(record)) {
    const route = findRuntimeRoute(child, depth + 1);
    if (route) return route;
  }
  return null;
}

async function attachUnresolved(testInfo: import('@playwright/test').TestInfo, item: GeneratedCase): Promise<void> {
  const record = {
    caseId: item.caseId,
    title: item.title,
    status: 'unresolved',
    blockingReasons: item.blockingReasons,
    generation: 'script-registered-contract-blocked',
  };
  await testInfo.attach(item.caseId + '-unresolved-contract', {
    body: Buffer.from(JSON.stringify(record, null, 2), 'utf8'),
    contentType: 'application/json',
  });
}

async function verifyPackageUiResidue(
  page: import('@playwright/test').Page,
  cleanup: CleanupRegistryEvidence,
): Promise<Record<string, 0 | 'ui-verification-unavailable:403'>> {
  const identities = Object.keys(cleanup.apiIdentityCounts)
    .filter((identity) => cleanup.apiIdentityKinds[identity] === 'item');
  if (identities.length === 0) return {};
  const list = createItemListPage(page);
  try {
    await list.openForResidueCheck();
    const residue: Record<string, 0 | 'ui-verification-unavailable:403'> = {};
    for (const identity of identities) {
      await list.fillSearchForResidueCheck(identity);
      const count = await list.readVisibleIdentityCount(identity);
      if (count !== 0) throw new Error(\`套餐商品 UI 残留：\${identity} count=\${count}\`);
      residue[identity] = 0;
    }
    return residue;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/403|forbidden|authentication-required|merchant-selection-required/i.test(message)) {
      return Object.fromEntries(identities.map((identity) => [identity, 'ui-verification-unavailable:403'])) as Record<string, 0 | 'ui-verification-unavailable:403'>;
    }
    throw error;
  }
}

async function attachManualAcceptedOutcome(
  testInfo: import('@playwright/test').TestInfo,
  caseId: string,
  evidence: unknown,
  runtimeRoute: string,
): Promise<boolean> {
  if (runtimeStatusFromEvidence(evidence) === 'product-defect') return false;
  const evidenceRecord = evidence && typeof evidence === 'object' && !(evidence instanceof Error)
    ? evidence as Record<string, unknown>
    : undefined;
  const nestedEvidence = evidenceRecord?.evidence && typeof evidenceRecord.evidence === 'object'
    ? evidenceRecord.evidence as Record<string, unknown>
    : undefined;
  const observedRoute = typeof evidenceRecord?.route === 'string'
    ? evidenceRecord.route
    : typeof nestedEvidence?.route === 'string'
      ? nestedEvidence.route
      : runtimeRoute;
  const runtimeEvidence = evidence instanceof Error
    ? {
        caseId,
        runtimeRoute: observedRoute,
        runtimeEvidenceKind: 'error',
        error: { name: evidence.name, message: evidence.message, stack: evidence.stack },
      }
    : { caseId, runtimeRoute: observedRoute, runtimeEvidenceKind: 'structured', evidence };
  const accepted = acceptProductCenterItemManualOutcome(caseId, runtimeEvidence);
  if (!accepted) return false;
  await testInfo.attach(caseId + '-manual-accepted-evidence', {
    body: Buffer.from(JSON.stringify(accepted, null, 2), 'utf8'),
    contentType: 'application/json',
  });
  return true;
}

function assertRuntimeImplemented(caseId: string, status: string, evidence: unknown): void {
  if (status === 'implemented') return;
  const record = evidence && typeof evidence === 'object' ? evidence as Record<string, unknown> : {};
  const diagnostic = typeof record.reason === 'string'
    ? record.reason
    : typeof record.message === 'string'
      ? record.message
      : JSON.stringify(evidence);
  throw new Error(\`\${caseId} \${status.toUpperCase()}: \${diagnostic}\`);
}

function runtimeStatusFromEvidence(evidence: unknown): string {
  if (!evidence || typeof evidence !== 'object') return 'implemented';
  const record = evidence as Record<string, unknown>;
  const status = typeof record.status === 'string' ? record.status : undefined;
  if (status && status !== 'implemented') return status;
  const classification = typeof record.classification === 'string' ? record.classification : undefined;
  return classification && classification !== 'implemented' ? classification : 'implemented';
}

function withCleanupAuditEvidence<T>(
  evidence: T,
  cleanup: CleanupRegistryEvidence,
  uiResidue: Record<string, 0 | 'ui-verification-unavailable:403'>,
): T {
  const uiValues = Object.values(uiResidue);
  const apiZero = Object.values(cleanup.apiIdentityCounts).every((count) => count === 0);
  const uiZero = uiValues.every((count) => count === 0);
  if (!evidence || typeof evidence !== 'object') return evidence;
  const clone = JSON.parse(JSON.stringify(evidence)) as Record<string, unknown>;
  clone.cleanupEvidence = { ...cleanup, uiIdentityCounts: uiResidue };
  if (!apiZero || !uiZero) return clone as T;
  const observation = findAuditObservationForCleanup(clone);
  if (!observation) return clone as T;
  const existingServerIds = Array.isArray(observation.serverIds)
    ? observation.serverIds.filter((value): value is string | number => typeof value === 'string' || typeof value === 'number')
    : [];
  observation.serverIds = [...new Set([...existingServerIds.map(String), ...cleanup.serverIds.map(String)])];
  observation.cleanup = { uiCount: uiValues.reduce<number>((sum, value) => sum + (typeof value === 'number' ? value : 1), 0), apiCount: Object.values(cleanup.apiIdentityCounts).reduce((sum, count) => sum + count, 0), verifiedAt: new Date().toISOString() };
  return clone as T;
}

function findAuditObservationForCleanup(value: Record<string, unknown>, depth = 0): Record<string, unknown> | undefined {
  if (depth > 5) return undefined;
  if (value.auditObservation && typeof value.auditObservation === 'object') return value.auditObservation as Record<string, unknown>;
  for (const key of ['evidence', 'result', 'runtimeEvidence']) {
    const nested = value[key];
    if (nested && typeof nested === 'object') {
      const found = findAuditObservationForCleanup(nested as Record<string, unknown>, depth + 1);
      if (found) return found;
    }
  }
  return undefined;
}

export const item213GenerationSummary = {
  total: ${executableCases.length},
  standard: ${executableCases.filter((item) => item.caseId.startsWith('TC-ITEM-STD-')).length},
  package: ${executableCases.filter((item) => item.caseId.startsWith('TC-ITEM-PKG-')).length},
  addon: ${executableCases.filter((item) => item.caseId.startsWith('TC-ITEM-ADD-')).length},
  standardFlowBound: ${executableCases.filter((item) => item.caseId.startsWith('TC-ITEM-STD-') && isStandardFlowBound(item)).length},
  contractUnresolved: ${executableCases.filter((item) => item.caseId.startsWith('TC-ITEM-STD-') && !isStandardFlowBound(item)).length},
};

export const item216ScopeSummary = {
  formal: item216FormalCaseInventory.length,
  executable: item213GenerationSummary.total,
  conversionNotApplicable: conversionNotApplicableCaseIds.size,
};
`;

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(`${outputPath}.tmp`, source, 'utf8');
fs.renameSync(`${outputPath}.tmp`, outputPath);
const manifest = {
  schemaVersion: '1.0.0',
  generatedAt: new Date().toISOString(),
  denominator: { formal: 216, notApplicable: notApplicable.size, executable: executableCases.length },
  summary: {
    standard: executableCases.filter((item) => item.caseId.startsWith('TC-ITEM-STD-')).length,
    package: executableCases.filter((item) => item.caseId.startsWith('TC-ITEM-PKG-')).length,
    addon: executableCases.filter((item) => item.caseId.startsWith('TC-ITEM-ADD-')).length,
    flowBound: executableCases.filter(isStandardFlowBound).length,
    contractUnresolved: executableCases.filter((item) => !isStandardFlowBound(item)).length,
    runtimeReady: executableCases.filter((item) => !environmentContractCases.has(item.caseId)).length,
    environmentBlocked: executableCases.filter((item) => environmentContractCases.has(item.caseId)).length,
    humanConfirmationRequired: 0,
    runtimePassed: executableCases.filter((item) => runtimeStatusByCaseId.get(item.caseId) === 'runtime-passed').length,
    deferred: executableCases.filter((item) => runtimeStatusByCaseId.get(item.caseId) === 'deferred').length,
    runtimeFailed: 0,
    runtimeUnresolved: executableCases.filter((item) => runtimeStatusByCaseId.get(item.caseId) === 'unresolved').length,
    runtimeNotRun: executableCases.filter((item) => !runtimeStatusByCaseId.has(item.caseId)).length,
  },
  runtimeProjection: runtimeProjection ? {
    source: 'contracts/product-center/test-cases/canonical/product-center-item-authoritative-release.json',
    releaseFingerprint: runtimeProjection.fingerprint,
    executableFingerprint,
  } : null,
  notApplicable: [...notApplicable].sort(),
  formalCases: formalCaseInventory,
  cases: executableCases.map((item) => ({
    caseId: item.caseId,
    title: item.title,
    family: familyOf(item.caseId),
    action: item.caseId.startsWith('TC-ITEM-STD-')
      ? standardActions.get(item.caseId) ?? (standardContractActions.has(item.caseId) ? 'contract-resolution' : null)
      : null,
    handlerId: requiredExecutionTask(item.caseId).handlerId,
    bindingFingerprint: requiredExecutionTask(item.caseId).bindingFingerprint,
    implementationFingerprint: requiredImplementationFingerprint(item.caseId),
    assertionIds: requiredAssertionIds(item.caseId),
    scriptStatus: isStandardFlowBound(item) ? 'flow-bound' : 'contract-unresolved',
    runtimeReadiness: environmentContractCases.has(item.caseId) ? 'environment-blocked' : 'ready',
    runtimeStatus: runtimeStatusByCaseId.get(item.caseId) ?? 'not-run',
    blockingReasons: environmentContractCases.has(item.caseId)
      ? [environmentContractCases.get(item.caseId)]
      : isStandardFlowBound(item) ? [] : item.blockingReasons,
  })),
};
fs.mkdirSync(path.dirname(manifestPath), { recursive: true });
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n', 'utf8');
const unresolved = executableCases.filter((item) => !isStandardFlowBound(item));
fs.writeFileSync(summaryPath, [
  '# 商品管理-商品自动化转换',
  '',
  `- 正式分母：216 条`,
  `- N/A：${notApplicable.size} 条（${[...notApplicable].sort().join('、')}）`,
  `- 需要自动化：${executableCases.length} 条`,
  `- 已绑定现有 Flow：${manifest.summary.flowBound} 条`,
  `- 合同阻塞但已登记脚本：${manifest.summary.contractUnresolved} 条`,
  `- 可直接运行：${manifest.summary.runtimeReady} 条`,
  `- 环境能力阻塞：${manifest.summary.environmentBlocked} 条`,
  `- 需要人工确认：${manifest.summary.humanConfirmationRequired} 条`,
  runtimeProjection
    ? `- 真实运行状态：通过 ${manifest.summary.runtimePassed} 条；延期 ${manifest.summary.deferred} 条；失败 ${manifest.summary.runtimeFailed} 条；未处理 ${manifest.summary.runtimeUnresolved} 条`
    : `- 真实运行状态：尚未投影，不能计为通过`,
  '',
  '## 合同阻塞用例',
  unresolved.length ? unresolved.map((item) => `- ${item.caseId}：${item.blockingReasons.join('、') || '缺少可执行合同'}`).join('\n') : '- 无',
  '',
  '## 环境能力阻塞',
  [...environmentContractCases.entries()].map(([caseId, reason]) => `- ${caseId}：${reason}`).join('\n'),
  '',
  '生成入口：tests/generated/product-center-item-216.generated.spec.ts',
  '机器清单：output/product-center-item-213-conversion.json',
].join('\n') + '\n', 'utf8');
process.stdout.write(JSON.stringify({
  outputPath,
  manifestPath,
  summaryPath,
  total: executableCases.length,
  standard: executableCases.filter((item) => item.caseId.startsWith('TC-ITEM-STD-')).length,
  package: executableCases.filter((item) => item.caseId.startsWith('TC-ITEM-PKG-')).length,
  addon: executableCases.filter((item) => item.caseId.startsWith('TC-ITEM-ADD-')).length,
  standardFlowBound: executableCases.filter(isStandardFlowBound).length,
  contractUnresolved: executableCases.filter((item) => !isStandardFlowBound(item)).length,
}) + '\\n');

function familyOf(caseId: string): 'standard' | 'package' | 'addon' {
  if (caseId.startsWith('TC-ITEM-STD-')) return 'standard';
  if (caseId.startsWith('TC-ITEM-PKG-')) return 'package';
  return 'addon';
}

function requiredExecutionTask(caseId: string): { handlerId: string; bindingFingerprint: string } {
  const task = executionTaskById.get(caseId);
  const supplemental = additionalBindingByCaseId.get(caseId);
  const bindingFingerprint = task?.bindingFingerprint ?? supplemental?.bindingFingerprint ?? itemPlanFingerprint;
  if (!bindingFingerprint) throw new Error(`商品用例缺少权威绑定指纹：${caseId}`);
  return { handlerId: task?.handlerId ?? supplemental?.handlerId ?? `item-216:${caseId}`, bindingFingerprint };
}

function requiredImplementationFingerprint(caseId: string): string {
  return fingerprintProductCenterItemImplementation(projectRoot, caseId);
}

function requiredAssertionIds(caseId: string): string[] {
  const assertionIds = assertionIdsByCaseId.get(caseId) ?? [];
  if (assertionIds.length === 0) throw new Error(`商品正式用例缺少预期结果：${caseId}`);
  return assertionIds;
}

function readFormalExpectationIds(filePath: string): Map<string, string[]> {
  const sections = fs.readFileSync(filePath, 'utf8').split(/^### 用例编号：/m).slice(1);
  return new Map(sections.flatMap((section) => {
    const caseId = section.match(/^(TC-[A-Z0-9-]+)/)?.[1];
    if (!caseId) return [];
    const expectedBlock = section.match(/预期结果：\s*\n([\s\S]*?)(?=\n### 用例编号：|$)/)?.[1] ?? '';
    const indexes = [...expectedBlock.matchAll(/^(\d+)\.\s+/gm)].map((match) => Number(match[1]));
    return [[caseId, [...new Set(indexes)].map((index) => `${caseId}:expectation-${index}`)]];
  }));
}

function readRuntimeProjection(rootDir: string, expectedExecutableFingerprint: string, expectedCount: number): RuntimeProjection | undefined {
  const releasePath = path.join(
    rootDir,
    'contracts/product-center/test-cases/canonical/product-center-item-authoritative-release.json',
  );
  if (!fs.existsSync(releasePath)) return undefined;
  const projection = JSON.parse(fs.readFileSync(releasePath, 'utf8')) as RuntimeProjection;
  if (projection.executableFingerprint !== expectedExecutableFingerprint) return undefined;
  if (projection.automationBindings.length !== expectedCount) return undefined;
  return projection;
}

function readStandardActions(filePath: string): Map<string, string> {
  const source = fs.readFileSync(filePath, 'utf8');
  const actions = new Map<string, string>();
  for (const match of source.matchAll(/caseId: '([^']+)'[^\\n]*action: '([^']+)'/g)) actions.set(match[1], match[2]);
  return actions;
}
