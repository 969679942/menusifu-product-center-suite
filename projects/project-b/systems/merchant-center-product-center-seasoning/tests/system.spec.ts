import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { expect, test, type Page } from '@playwright/test';
import { CleanupRegistry, type CleanupRegistryEvidence } from '../../../api/product-center/cleanup-registry';
import { ProductCenterApi } from '../../../api/product-center/product-center-api';
import { SeasoningDistributionApi } from '../../../api/product-center/seasoning-distribution-api';
import { ProductCenterExecutionLedger } from '../../../api/product-center/execution-ledger';
import { ProductCenterSopPage } from '../../../pages/product-center/product-center-sop.page';
import { SeasoningBoundaryPage, type StoreIdentityObservation } from '../../../pages/product-center/seasoning-boundary.page';
import { productCenterSopCatalog } from '../../../sop/product-center/product-center-sop.catalog';
import type { ProductCenterSopCase } from '../../../sop/product-center/product-center-sop.types';
import { ProductCenterSopDataFactory, type ProductCenterSopSeedRecord } from '../../../test-data/product-center/sop/product-center-sop-data.factory';
import {
  executeSystemTestRecipe,
  type SystemTestRecipeContext,
  type SystemTestReportStep,
} from '../../../../../Test Automation Platform/src/automation/system-test/system-test-recipe-executor';
import type {
  BusinessStepAttachment,
  BusinessStepDetail,
  BusinessStepReportEvidence,
} from '../../../../../Test Automation Platform/src/reporters/allure-report-integrity';
import {
  buildSeasoningOperationTechnicalDetails,
  createSeasoningSystemTestStepReporter,
  describeSeasoningOperation,
  navigationPathForRoute,
} from '../../../adapters/product-center/seasoning-reporting';
import { resolveSystemTestMutationObserved } from '../../../../../Test Automation Platform/src/automation/system-test/system-test-evidence';
import { matchesSystemTestRequest } from '../../../../../Test Automation Platform/src/automation/system-test/system-test-request-correlation';
import { classifySystemTestFailure } from '../../../../../Test Automation Platform/src/automation/system-test/system-test-failure';
import type { AutomationRecipe } from '../../../../../Test Automation Platform/src/automation/recipe/automation-recipe';
import { attachBusinessEvidenceStep } from '../../../../../Test Automation Platform/src/reporters/allure-report-integrity';
import { createBusinessOperationReceiptDetail } from '../../../../../Test Automation Platform/src/reporters/allure-report-integrity';
import { formatBusinessExecutionConclusionTitle } from '../../../../../Test Automation Platform/src/reporters/allure-report-integrity';
import { settleInput } from '../../../utils/input-settle';
import { executeReadOnlyUiWithTransientRetry } from '../../../api/transient-retry';
import { withProductCenterRecipeResourceLocks } from '../../../utils/product-center-resource-lock';
import { resolveSeasoningContext } from '../../../test-data/seasoning-context';
import { SeasoningTemplateRedeliveryFlow } from '../../../flows/product-center/seasoning-template-redelivery.flow';
import {
  consumeExecutableOperationReceipts,
  finishExecutableOperation,
  startExecutableOperation,
} from '../../../utils/executable-operation-receipt';
import type { ExecutableOperationReceipt } from '../../../utils/executable-operation-receipt';
import { readProductCenterApplicationVersion } from '../../../utils/product-center-application-version';

const recipeCollection = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, '../recipes.json'), 'utf8'),
) as { recipes: AutomationRecipe[] };

type NamedRecord = { id: number; name: string };
type CreatedRecord = NamedRecord & {
  optionName?: string;
  secondOptionName?: string;
  expectedPrice?: number;
  objectType?: '品牌调味' | '调味模板';
};
type ReportOperationReceipt = Pick<ExecutableOperationReceipt, 'operationKey' | 'method' | 'observed'> & Partial<Pick<
  ExecutableOperationReceipt,
  'title' | 'sequence' | 'status' | 'durationMs' | 'responseStatus' | 'details'
>>;
type ReportChangeReceipt = {
  entityType: string;
  entityId: string | number;
  changeType: 'requested' | 'persisted' | 'displayed';
  beforeFingerprint: string;
  afterFingerprint: string;
  changedFields: string[];
  evidenceRef?: string;
};
const auditedIndustrySeasoningCandidates = [
  { groupName: 'Vegetable' },
  { groupName: 'Sauce' },
  { groupName: 'Meat' },
  { groupName: 'Rice Noodle' },
] as const;
test.describe.configure({ mode: 'parallel' });

type RuntimeContext = SystemTestRecipeContext & {
  page: Page;
  api: ProductCenterApi;
  distributionApi: SeasoningDistributionApi;
  registry: CleanupRegistry;
  seasoning: SeasoningBoundaryPage;
  templateRedeliveryFlow: SeasoningTemplateRedeliveryFlow;
  sopPage: ProductCenterSopPage;
  sopFactory: ProductCenterSopDataFactory;
  sopRecord?: ProductCenterSopSeedRecord;
      records: CreatedRecord[];
      templateSeed?: {
        id: number;
        name: string;
        modifierId: number;
        optionId: number;
        optionName: string;
        additionOptionName?: string;
      };
  negativeResult?: {
    errorTexts: string[];
    confirmDisabled: boolean;
    mutationCount: number;
    identity: string;
    actualRecordId?: number;
    actualApiPrice?: number;
  };
  operationReceipts: ReportOperationReceipt[];
  changeReceipts: ReportChangeReceipt[];
  reportOperationReceiptCursor: number;
  businessContext: ReturnType<typeof resolveSeasoningContext>;
  pageReadiness: {
    expectedRoute: string;
    actualRoute: string;
    routeMatched: boolean;
    visibleBusinessContent: boolean;
  };
  pendingAssertionAttachments: BusinessStepAttachment[];
  applicationVersionFingerprint: string | null;
};

for (const recipe of recipeCollection.recipes) {
  test(recipe.title, {
    tag: [`@case-${recipe.caseId}`],
    annotation: [
      { type: 'system-test-case-id', description: recipe.caseId },
      ...(recipe.caseId === 'TC-FLV-SEA-016'
        ? [{ type: 'business-rule-change-confirmed', description: '2026-08-24 用户确认非法/负数/留空价格的新增纠正和编辑恢复规则。' }]
        : []),
    ],
  }, async ({ page, request }, testInfo) => {
    const checkpointRoot = process.env.SYSTEM_TEST_CHECKPOINT_ROOT;
    if (!checkpointRoot) throw new Error('缺少 SYSTEM_TEST_CHECKPOINT_ROOT');
    const runId = process.env.SYSTEM_TEST_RUN_ID ?? `seasoning-system-${Date.now()}`;
    const api = new ProductCenterApi(request);
    const distributionApi = new SeasoningDistributionApi(request);
    const ledger = new ProductCenterExecutionLedger({
      rootDir: path.resolve(checkpointRoot),
      runId: `${runId}_${recipe.caseId}`,
    });
    const registry = new CleanupRegistry(ledger);
    const seasoning = new SeasoningBoundaryPage(page);
    const templateRedeliveryFlow = new SeasoningTemplateRedeliveryFlow(seasoning, api);
    const sopPage = new ProductCenterSopPage(page);
    const sopFactory = new ProductCenterSopDataFactory(api);
    let runtimeContext: RuntimeContext | undefined;
    let executionFailed = false;
    try {
      let context: RuntimeContext;
      try {
        context = await withProductCenterRecipeResourceLocks(recipe, () => executeSystemTestRecipe<RuntimeContext>(recipe, {
      initialize: async () => {
        await executeReadOnlyUiWithTransientRetry(async () => {
          if (recipe.route === '/pp/brand/seasoning/record') await seasoning.openRecord();
          else if (recipe.capabilities.some((capability) => capability.id === 'merchant-center.seasoning.ui-mutation')) {
            if (recipe.route === '/pp/brand/seasoning/addtemplate') await seasoning.openTemplateCreate();
            else if (recipe.route === '/pp/brand/seasoning/template') await seasoning.openTemplateList();
            else await seasoning.openList();
          }
          else if (recipe.capabilities.some((capability) => capability.id === 'merchant-center.seasoning.static-contract'
            || capability.id === 'merchant-center.seasoning.template-name-normalization')) {
            if (recipe.route === '/pp/brand/seasoning/addtemplate') await seasoning.openTemplateCreate();
            else if (recipe.route === '/pp/brand/seasoning/template') await seasoning.openTemplateList();
            else if (recipe.route === '/poi/location/seasoning') {
              await page.goto(recipe.route, { waitUntil: 'domcontentloaded' });
              await expect(page.locator('body')).toContainText(/批量操作|暂无数据|调味名称/, { timeout: 30_000 });
            }
            else await seasoning.openList();
          }
          else if (recipe.capabilities.some((capability) => capability.id === 'merchant-center.seasoning.template-create-audit')) {
            await seasoning.openTemplateCreate();
          } else if (recipe.capabilities.some((capability) => capability.id === 'merchant-center.seasoning.single-store-template-absence')) {
            // Establish the route for the before-action guard; the capability owns
            // the single terminal-state read so it is captured exactly once.
            await page.goto(recipe.route, { waitUntil: 'domcontentloaded' });
          } else if (recipe.capabilities.some((capability) => capability.id === 'merchant-center.seasoning.template-distribution-audit')) {
            await seasoning.openTemplateList();
          } else await seasoning.openList();
        });
        const applicationVersion = await readProductCenterApplicationVersion(page);
        const initialized: RuntimeContext = {
          recipe,
          page,
          api,
          distributionApi,
          registry,
          seasoning,
          templateRedeliveryFlow,
          sopPage,
          sopFactory,
          records: [],
          results: {},
      assertionReceipts: [],
          operationReceipts: [],
          changeReceipts: [],
          reportOperationReceiptCursor: 0,
          businessContext: resolveSeasoningContext(),
          pageReadiness: {
            expectedRoute: recipe.route,
            actualRoute: new URL(page.url()).pathname,
            routeMatched: new URL(page.url()).pathname === recipe.route,
            visibleBusinessContent: (await page.locator('main:visible').innerText().catch(() => '')).trim().length > 0,
          },
          pendingAssertionAttachments: [],
          applicationVersionFingerprint: applicationVersion.fingerprint,
        };
        runtimeContext = initialized;
        return initialized;
      },
      seed: async (call, current) => {
        if (![
          'merchant-center.seasoning.seed',
          'merchant-center.seasoning.seed-single-store-distribution',
          'merchant-center.seasoning.seed-multi-store-distribution',
        ].includes(call.adapterId)) throw new Error(`未知调味造数适配器：${call.adapterId}`);
        if (/^TC-FLV-TPL-(015|016|017|018|019|020|021|022|023|024)$/.test(recipe.caseId)) {
          const seedIdentity = `AUTO_AUDIT_TPL_${recipe.caseId.replace(/\D/g, '')}_${Date.now()}`;
          const optionName = `${seedIdentity}_OPTION`;
          const retainedOptionName = recipe.caseId === 'TC-FLV-TPL-019' ? `${seedIdentity}_OPTION_RETAINED` : undefined;
          const editableOptionName = recipe.caseId === 'TC-FLV-TPL-024' ? `${seedIdentity}_OPTION_EDITABLE` : undefined;
          const created = await current.api.createSeasoning({
            name: seedIdentity,
            secondName: `${seedIdentity}_SECOND`,
            optionName,
            ...(retainedOptionName || editableOptionName
              ? { optionNames: [optionName, ...(retainedOptionName ? [retainedOptionName] : []), ...(editableOptionName ? [editableOptionName] : [])] }
              : {}),
          });
          current.operationReceipts.push({ operationKey: 'brand-menu:POST /ops-brand/global-modifier/batch', observed: true, method: 'POST' });
          const seasoningRecord = await waitForRecord(current.api, seedIdentity);
          current.records.push({ ...seasoningRecord, optionName, objectType: '品牌调味' });
          registerCleanup(current.api, current.registry, seedIdentity, seasoningRecord.id);
          const detail = await current.api.seasoningDetail(seasoningRecord.id);
          const templateOptionName = optionName;
          const optionId = findOptionId(detail, templateOptionName) ?? findAnyOptionId(detail);
          if (!optionId) throw new Error(`模板夹具无法读取调味项 ID：${seedIdentity}`);
          const retainedOptionId = retainedOptionName ? findOptionId(detail, retainedOptionName) : undefined;
          if (retainedOptionName && !retainedOptionId) throw new Error(`模板夹具无法读取保留调味项 ID：${retainedOptionName}`);
          let additionOptionName: string | undefined;
          if (recipe.caseId === 'TC-FLV-TPL-018') {
            const additionIdentity = `${seedIdentity}_ADDITION`;
            additionOptionName = `${additionIdentity}_OPTION`;
            await current.api.createSeasoning({
              name: additionIdentity,
              secondName: `${additionIdentity}_SECOND`,
              optionName: additionOptionName,
            });
            current.operationReceipts.push({ operationKey: 'brand-menu:POST /ops-brand/global-modifier/batch', observed: true, method: 'POST' });
            const additionRecord = await waitForRecord(current.api, additionIdentity);
            current.records.push({ ...additionRecord, optionName: additionOptionName, objectType: '品牌调味' });
            registerCleanup(current.api, current.registry, additionIdentity, additionRecord.id);
          }
          const templateCreated = await withObservedExecutableOperation(
            'brand-menu:POST /ops-brand/modifier-template',
            'POST',
            () => current.distributionApi.createTemplate({
              name: seedIdentity,
              secondName: `${seedIdentity}_SECOND`,
              description: `${seedIdentity}_DESCRIPTION`,
              modifierId: seasoningRecord.id,
              modifierName: seedIdentity,
              optionId,
              optionName: templateOptionName,
              ...(retainedOptionName && retainedOptionId
                ? { additionalOptions: [{ optionId: retainedOptionId, optionName: retainedOptionName }] }
                : {}),
            }),
          );
          current.operationReceipts.push({ operationKey: 'brand-menu:POST /ops-brand/modifier-template', observed: true, method: 'POST' });
          const templateRecord = findNamedRecord(templateCreated, seedIdentity) ?? findNamedRecord(await current.api.seasoningTemplatePage(seedIdentity), seedIdentity);
          if (!templateRecord) throw new Error(`模板夹具无法读取模板 ID：${seedIdentity}`);
          const templateDetail = await current.api.seasoningTemplateDetail(templateRecord.id);
          const persistedOptionName = findFirstTemplateOptionName(templateDetail) ?? templateOptionName;
          current.templateSeed = {
            id: templateRecord.id,
            name: seedIdentity,
            modifierId: seasoningRecord.id,
            optionId,
            optionName: persistedOptionName,
            additionOptionName,
          };
          current.records.push({ id: templateRecord.id, name: templateRecord.name, objectType: '调味模板' });
          current.registry.register({
            entity: '调味模板系统测试数据',
            identity: seedIdentity,
            checkpoint: { entryId: `seasoning-template-${templateRecord.id}`, entityKind: 'seasoning', serverId: templateRecord.id, identityVariants: [seedIdentity], cleanupOrder: 30 },
            execute: async () => {
              const existing = findNamedRecord(await current.api.seasoningTemplatePage(seedIdentity), seedIdentity);
              if (existing) {
                await current.api.deleteSeasoningTemplate(existing.id);
                current.operationReceipts.push({ operationKey: 'brand-menu:DELETE /ops-brand/modifier-template/{id}', observed: true, method: 'DELETE' });
              }
            },
            verify: async () => !findNamedRecord(await current.api.seasoningTemplatePage(seedIdentity), seedIdentity),
          });
          return current;
        }
        if (recipe.caseId === 'TC-FLV-SEA-022') {
          const identity = `AUTO_AUDIT_SEASONING_022_${Date.now()}`;
          const optionNames = Array.from({ length: 50 }, (_, index) => `${identity}_OPTION_${String(index + 1).padStart(2, '0')}`);
          const response = await current.api.createSeasoning({
            name: identity,
            secondName: `${identity}_SECOND`,
            optionNames,
          });
          const record = await waitForRecord(current.api, identity);
          current.records.push({ ...record, optionName: optionNames[0], objectType: '品牌调味' });
          registerCleanup(current.api, current.registry, identity, record.id);
          current.sopRecord = {
            entityKey: 'seasoning',
            id: record.id,
            originalIdentity: identity,
            editedIdentity: `${identity}_EDIT`,
            cleanupIdentities: [identity, `${identity}_EDIT`],
            checkpointEntryId: `seasoning-${record.id}`,
            metadata: { optionName: optionNames[0], optionCount: 50 },
          };
          current.operationReceipts.push({ operationKey: 'brand-menu:POST /ops-brand/global-modifier/batch', observed: true, method: 'POST' });
          expect(response).toBeTruthy();
          return current;
        }
        if (recipe.caseId === 'TC-FLV-SEA-028') {
          const identity = `AUTO_AUDIT_SEASONING_028_${Date.now()}`;
          const optionNames = [`${identity}_OPTION_A`, `${identity}_OPTION_B`];
          const response = await current.api.createSeasoning({
            name: identity,
            secondName: `${identity}_SECOND`,
            optionNames,
          });
          const record = await waitForRecord(current.api, identity);
          current.records.push({ ...record, optionName: optionNames[0], secondOptionName: optionNames[1], objectType: '品牌调味' });
          registerCleanup(current.api, current.registry, identity, record.id);
          current.sopRecord = {
            entityKey: 'seasoning',
            id: record.id,
            originalIdentity: identity,
            editedIdentity: `${identity}_EDIT`,
            cleanupIdentities: [identity, `${identity}_EDIT`],
            checkpointEntryId: `seasoning-${record.id}`,
            metadata: { optionName: optionNames[0], optionCount: optionNames.length },
          };
          current.operationReceipts.push({ operationKey: 'brand-menu:POST /ops-brand/global-modifier/batch', observed: true, method: 'POST' });
          expect(response).toBeTruthy();
          return current;
        }
        if (recipe.caseId === 'TC-FLV-SEA-037' || recipe.caseId === 'TC-FLV-SEA-040' || recipe.caseId === 'TC-FLV-SEA-041') {
          const suffix = recipe.caseId.slice(-3);
          const firstIdentity = `AUTO_AUDIT_SEASONING_${suffix}_${Date.now()}_A`;
          const secondIdentity = `AUTO_AUDIT_SEASONING_${suffix}_${Date.now()}_B`;
          for (const [index, identity] of [firstIdentity, secondIdentity].entries()) {
            const optionName = `${identity}_OPTION`;
            const secondOptionName = recipe.caseId === 'TC-FLV-SEA-040' && index === 0 ? `${identity}_OPTION_SECOND` : undefined;
            const response = await current.api.createSeasoning({
              name: identity,
              secondName: `${identity}_SECOND`,
              optionName,
              ...(secondOptionName ? { optionNames: [optionName, secondOptionName] } : {}),
            });
            const record = await waitForRecord(current.api, identity);
            current.records.push({ ...record, optionName, secondOptionName, objectType: '品牌调味' });
            registerCleanup(current.api, current.registry, identity, record.id);
            current.operationReceipts.push({ operationKey: 'brand-menu:POST /ops-brand/global-modifier/batch', observed: true, method: 'POST' });
            if (index === 0) {
              current.sopRecord = {
                entityKey: 'seasoning',
                id: record.id,
                originalIdentity: identity,
                editedIdentity: `${identity}_EDIT`,
                cleanupIdentities: [identity, `${identity}_EDIT`],
                checkpointEntryId: `seasoning-${record.id}`,
                metadata: { optionName },
              };
            }
            expect(response).toBeTruthy();
          }
          return current;
        }
        // system-test-fingerprint:start seasoning-seed-store-common
        if (/^TC-FLV-(?:SEA-042|XMOD-(001|002|003|004|005|006|011))$/.test(recipe.caseId)) {
          const seedIdentity = `AUTO_AUDIT_SEASONING_DIST_${Date.now()}`;
          const optionName = `${seedIdentity}_OPTION`;
          const extraOptionName = recipe.caseId === 'TC-FLV-XMOD-002' ? `${optionName}_ALT` : undefined;
          const created = await withObservedExecutableOperation(
            'brand-menu:POST /ops-brand/global-modifier/batch',
            'POST',
            () => current.api.createSeasoning({
            name: seedIdentity,
            secondName: `${seedIdentity}_SECOND`,
            optionName,
            ...(extraOptionName ? { optionNames: [optionName, extraOptionName] } : {}),
            }),
          );
          current.operationReceipts.push({ operationKey: 'brand-menu:POST /ops-brand/global-modifier/batch', observed: true, method: 'POST' });
          const record = await waitForRecord(current.api, seedIdentity);
          current.records.push({ ...record, optionName, objectType: '品牌调味' });
          registerCleanup(current.api, current.registry, seedIdentity, record.id);
          // system-test-fingerprint:start seasoning-seed-single-store-distribution
          if (recipe.caseId === 'TC-FLV-SEA-042') {
            await current.page.goto('/poi/location/seasoning', { waitUntil: 'domcontentloaded' });
            await waitForStorePageReady(current.page);
            return current;
          }
          // system-test-fingerprint:end seasoning-seed-single-store-distribution
          const templateIdentity = `${seedIdentity}_TEMPLATE`;
          const detail = await current.api.seasoningDetail(record.id);
          const optionId = findOptionId(detail, optionName) ?? findAnyOptionId(detail);
          if (!optionId) throw new Error(`调味下发夹具无法读取选项 ID：${seedIdentity}`);
          const extraOptionId = extraOptionName ? findOptionId(detail, extraOptionName) : undefined;
          if (extraOptionName && !extraOptionId) throw new Error(`调味下发夹具无法读取第二个选项 ID：${extraOptionName}`);
          const templateCreated = await withObservedExecutableOperation(
            'brand-menu:POST /ops-brand/modifier-template',
            'POST',
            () => current.distributionApi.createTemplate({
            name: templateIdentity,
            secondName: `${templateIdentity}_SECOND`,
            description: `${templateIdentity}_DESCRIPTION`,
            modifierId: record.id,
            modifierName: seedIdentity,
            optionId,
            optionName,
            ...(extraOptionName && extraOptionId ? { additionalOptions: [{ optionId: extraOptionId, optionName: extraOptionName }] } : {}),
            }),
          );
          current.operationReceipts.push({ operationKey: 'brand-menu:POST /ops-brand/modifier-template', observed: true, method: 'POST' });
          const templateRecord = findNamedRecord(templateCreated, templateIdentity);
          const templateId = templateRecord?.id ?? findFirstNumericId(templateCreated);
          if (!templateId) throw new Error(`调味下发夹具无法读取模板 ID：${templateIdentity}`);
          current.templateSeed = {
            id: templateId,
            name: templateIdentity,
            modifierId: record.id,
            optionId,
            optionName,
          };
          current.records.push({ id: templateId, name: templateIdentity, objectType: '调味模板' });
          current.registry.register({
            entity: '调味模板系统测试数据',
            identity: templateIdentity,
            checkpoint: { entryId: `seasoning-template-${templateId}`, entityKind: 'seasoning', serverId: templateId, identityVariants: [templateIdentity], cleanupOrder: 10 },
            execute: async () => { await current.api.deleteSeasoningTemplate(templateId); },
            verify: async () => !findNamedRecord(await current.api.seasoningTemplatePage(templateIdentity), templateIdentity),
          });
          // system-test-fingerprint:end seasoning-seed-store-common
          // system-test-fingerprint:start seasoning-seed-multi-store-distribution
          const distribution = await withObservedExecutableOperation(
            'brand-menu:POST /ops-brand/brand-modifier-sync/by-template',
            'POST',
            () => current.seasoning.distributeTemplate(templateIdentity, 'M000023918'),
          );
          current.operationReceipts.push({ operationKey: 'brand-menu:POST /ops-brand/brand-modifier-sync/by-template', observed: true, method: 'POST' });
          expect(distribution.status).toBe(200);
          // The UI generates a suffixed job name after the audited template name;
          // the authoritative downstream terminal is the store list, so do not
          // block a valid distribution on an unrelated job-list projection.
          await waitForStoreRecord(current.distributionApi, seedIdentity);
          // The distribution action is completed from the brand template page. Restore the
          // store route before the recipe's context guard and UI assertions run.
          await current.page.goto('/poi/location/seasoning', { waitUntil: 'domcontentloaded' });
          await waitForStorePageReady(current.page, seedIdentity);
          const storeRecord = findNamedRecord(await withObservedExecutableOperation(
            'brand-menu:GET /ops-poi/global-modifier/list',
            'GET',
            () => current.distributionApi.storeSeasoningList(),
          ), seedIdentity);
          current.operationReceipts.push({ operationKey: 'brand-menu:GET /ops-poi/global-modifier/list', observed: true, method: 'GET' });
          if (storeRecord) {
            current.registry.register({
              entity: '门店调味系统测试数据',
              identity: seedIdentity,
              checkpoint: { entryId: `store-seasoning-${storeRecord.id}`, entityKind: 'seasoning', serverId: storeRecord.id, identityVariants: [seedIdentity], cleanupOrder: 30 },
              execute: async () => {
                const existing = findNamedRecord(await withObservedExecutableOperation(
                  'brand-menu:GET /ops-poi/global-modifier/list',
                  'GET',
                  () => current.distributionApi.storeSeasoningList(),
                ), seedIdentity);
                if (existing) {
                  await withObservedExecutableOperation(
                    'brand-menu:DELETE /ops-poi/global-modifier/{id}',
                    'DELETE',
                    () => current.distributionApi.deleteStoreSeasoning(existing.id),
                  );
                  current.operationReceipts.push({ operationKey: 'brand-menu:DELETE /ops-poi/global-modifier/{id}', observed: true, method: 'DELETE' });
                }
              },
              verify: async () => !findNamedRecord(await withObservedExecutableOperation(
                'brand-menu:GET /ops-poi/global-modifier/list',
                'GET',
                () => current.distributionApi.storeSeasoningList(),
              ), seedIdentity),
            });
          }
          return current;
          // system-test-fingerprint:end seasoning-seed-multi-store-distribution
        }
        if (recipe.caseId === 'TC-FLV-SEA-030') {
          const identity = `AUTO_AUDIT_SEASONING_030_${Date.now()}`;
          const response = await current.api.createEmptySeasoning({ name: identity, secondName: `${identity}_SECOND` });
          const record = await waitForRecord(current.api, identity);
          current.sopRecord = {
            entityKey: 'seasoning',
            id: record.id,
            originalIdentity: identity,
            editedIdentity: `${identity}_EDIT`,
            cleanupIdentities: [identity, `${identity}_EDIT`],
            checkpointEntryId: `seasoning-${record.id}`,
            metadata: { optionCount: 0 },
          };
          current.records.push({ id: record.id, name: identity });
          current.registry.register({
            entity: '空品牌调味',
            identity,
            checkpoint: { entryId: `seasoning-${record.id}`, entityKind: 'seasoning', serverId: record.id, identityVariants: [identity], cleanupOrder: 10 },
            execute: async () => {
              const residue = findNamedRecord(await current.api.seasoningList(), identity);
              if (residue) await current.api.deleteSeasoning(residue.id);
            },
            verify: async () => !findNamedRecord(await current.api.seasoningList(), identity),
          });
          current.operationReceipts.push({ operationKey: 'brand-menu:POST /ops-brand/global-modifier/batch', observed: true, method: 'POST' });
          expect(response).toBeTruthy();
          return current;
        }
        if (recipe.caseId === 'TC-FLV-SEA-007') {
          const identity = `AUTO_AUDIT_SEASONING_007_${Date.now()}`;
          const optionName = `${identity}_OPTION`;
          const response = await current.api.createSeasoning({
            name: identity,
            secondName: `${identity}_SECOND`,
            optionName,
          });
          const record = await waitForRecord(current.api, identity);
          current.records.push({ ...record, optionName, objectType: '品牌调味' });
          registerCleanup(current.api, current.registry, identity, record.id);
          current.sopRecord = {
            entityKey: 'seasoning',
            id: record.id,
            originalIdentity: identity,
            editedIdentity: `${identity}_EDIT`,
            cleanupIdentities: [identity, `${identity}_EDIT`],
            checkpointEntryId: `seasoning-${record.id}`,
            metadata: { optionName },
          };
          current.operationReceipts.push({ operationKey: 'brand-menu:POST /ops-brand/global-modifier/batch', observed: true, method: 'POST' });
          expect(response).toBeTruthy();
          return current;
        }
        if (['TC-FLV-SEA-013', 'TC-FLV-SEA-014', 'TC-FLV-SEA-016', 'TC-FLV-SEA-017', 'TC-FLV-SEA-021', 'TC-FLV-SEA-023', 'TC-FLV-SEA-024', 'TC-FLV-SEA-025', 'TC-FLV-SEA-026', 'TC-FLV-SEA-027', 'TC-FLV-SEA-028', 'TC-FLV-SEA-029', 'TC-FLV-SEA-031', 'TC-FLV-SEA-032', 'TC-FLV-SEA-033', 'TC-FLV-SEA-035', 'TC-FLV-SEA-036', 'TC-FLV-SEA-044'].includes(recipe.caseId)) {
          current.sopRecord = await current.sopFactory.seed('seasoning', current.registry);
          current.records.push({ id: current.sopRecord.id, name: current.sopRecord.originalIdentity });
          if (recipe.caseId !== 'TC-FLV-SEA-016') current.records.push({ id: current.sopRecord.id, name: current.sopRecord.editedIdentity });
          current.operationReceipts.push({
            operationKey: 'brand-menu:POST /ops-brand/global-modifier/batch',
            observed: true,
            method: 'POST',
          });
          if (recipe.caseId === 'TC-FLV-SEA-032') {
            const created = await withObservedExecutableOperation(
              'brand-menu:GET /ops-brand/global-modifier/list',
              'GET',
              () => current.api.seasoningList(),
              { lifecyclePhase: 'read-created-api', identity: current.sopRecord.originalIdentity },
            );
            expect(findNamedRecord(created, current.sopRecord.originalIdentity)?.id).toBe(current.sopRecord.id);
            await withObservedExecutableOperation(
              'ui:seasoning/read-created',
              'UI',
              () => current.sopPage.open(seasoningSopCase('edit'), current.sopRecord!),
              { lifecyclePhase: 'read-created-ui', identity: current.sopRecord.originalIdentity },
            );
          }
          return current;
        }
        const prefix = recipe.caseId === 'TC-FLV-SEA-046'
          ? 'AUTO_AUDIT_SEASONING_046_'
          : recipe.caseId === 'TC-FLV-SEA-016'
            ? 'AUTO_AUDIT_SEASONING_016_'
            : recipe.caseId === 'TC-FLV-SEA-018'
              ? 'AUTO_AUDIT_SEASONING_018_'
              : 'AUTO_AUDIT_SEASONING_015_';
        for (const residue of findNamedRecordsByPrefix(await api.seasoningList(), prefix)) {
          await api.deleteSeasoning(residue.id);
        }
        if (findNamedRecordsByPrefix(await api.seasoningList(), prefix).length > 0) {
          throw new Error(`调味历史残留清理失败：${prefix}`);
        }
        return current;
      },
      // system-test-fingerprint:start seasoning-context-guard
      verifyContext: async (call, current, input) => {
        if (call.adapterId !== 'merchant-center.seasoning.context') throw new Error(`未知调味上下文守卫：${call.adapterId}`);
        expect(input.expectedLocale).toBe('zh-CN');
        expect(input.expectedRoleId).toBe('merchant-operator');
        expect(input.expectedTenantScope).toBe('configured-merchant');
        const templateCreateSucceeded = /^TC-FLV-TPL-(011|012|013|025)$/.test(recipe.caseId);
        const expectedRoute = templateCreateSucceeded && input.phase === 'before-assertion'
          ? '/pp/brand/seasoning/template'
          : input.expectedRoute;
        expect(new URL(current.page.url()).pathname).toBe(expectedRoute);
        if (input.phase === 'before-assertion'
          && input.businessIdentityStrategy !== 'none'
          && current.records.length === 0
          && recipe.caseId !== 'TC-FLV-SEA-016') {
          throw new Error('调味业务身份守卫失败：执行断言前没有服务端记录。');
        }
        const observedForbidden = recipe.caseId === 'TC-FLV-TPL-006'
          && (current.results['merchant-center.seasoning.single-store-template-absence'] as { forbidden?: boolean } | undefined)?.forbidden === true;
        if (input.phase === 'before-assertion' && !observedForbidden) {
          if (expectedRoute === '/poi/location/seasoning') await waitForStorePageReady(current.page);
          const bodyText = (await current.page.locator('body').innerText()).trim();
          if (bodyText.length === 0) {
            throw new Error('调味上下文守卫失败：目标页面没有可见业务内容。');
          }
        }
      },
      // system-test-fingerprint:end seasoning-context-guard
      // system-test-fingerprint:start seasoning-store-action-readiness
      verifyActionReadiness: async (contract, current, input) => {
        if (!new Set([
          'merchant-center.seasoning.single-store-action-readiness',
          'merchant-center.seasoning.store-group-delete-action-readiness',
          'merchant-center.seasoning.store-option-delete-action-readiness',
          'merchant-center.seasoning.store-batch-delete-action-readiness',
          'merchant-center.seasoning.store-redeliver-action-readiness',
        ]).has(contract.adapterId)) {
          throw new Error(`未知调味动作链就绪适配器：${contract.adapterId}`);
        }
        const groupId = Number(input.groupId);
        const groupName = String(input.groupName ?? '');
        if (!Number.isSafeInteger(groupId) || groupId <= 0 || !groupName.startsWith('AUTO_AUDIT_')) {
          throw new Error(`调味动作链种子组身份无效：${recipe.caseId}`);
        }
        if (recipe.caseId === 'TC-FLV-SEA-042') {
          await current.seasoning.verifySingleStoreDistributionReadiness();
          await current.page.goto('/poi/location/seasoning', { waitUntil: 'domcontentloaded' });
          await waitForStorePageReady(current.page);
        } else {
          const templateId = Number(input.templateId);
          const templateName = String(input.templateName ?? '');
          if (!Number.isSafeInteger(templateId) || templateId <= 0 || !templateName.startsWith('AUTO_AUDIT_')) {
            throw new Error(`调味动作链模板身份无效：${recipe.caseId}`);
          }
          const templateRecord = findNamedRecord(await current.api.seasoningTemplatePage(templateName), templateName);
          if (!templateRecord || templateRecord.id !== templateId) {
            throw new Error(`调味动作链模板服务端身份未持久化：${templateName}`);
          }
          await current.page.goto('/poi/location/seasoning', { waitUntil: 'domcontentloaded' });
          await waitForStorePageReady(current.page);
          const store = await current.distributionApi.storeSeasoningList();
          const storeGroup = findRecordObjectWithName(store, groupName);
          if (!storeGroup) throw new Error(`调味动作链门店组身份未持久化：${groupName}`);
          const kind = recipe.caseId === 'TC-FLV-XMOD-005'
            ? 'delete-option' as const
            : recipe.caseId === 'TC-FLV-XMOD-006'
              ? 'batch-delete' as const
              : recipe.caseId === 'TC-FLV-XMOD-011'
                ? 'redeliver' as const
                : 'delete-group' as const;
          const optionName = input.optionName === undefined ? undefined : String(input.optionName);
          if ((kind === 'delete-option' || kind === 'batch-delete')
            && (!optionName || !findStoreOption(storeGroup, optionName))) {
            throw new Error(`调味动作链门店调味项身份未持久化：${String(optionName)}`);
          }
          await current.seasoning.verifyStoreMutationActionReadiness(kind, groupName, optionName);
          if (recipe.caseId === 'TC-FLV-XMOD-011') {
            await current.seasoning.verifyTemplateDistributionReadiness(templateName, 'M000023918');
            await current.page.goto('/poi/location/seasoning', { waitUntil: 'domcontentloaded' });
            await waitForStorePageReady(current.page);
          }
        }
        return { verifiedIdentityKeys: [...contract.requiredIdentityKeys] };
      },
      // system-test-fingerprint:end seasoning-store-action-readiness
      executeCapability: async (capability, current) => {
        if (current.recipe.route === '/poi/location/seasoning' && capability.id === 'merchant-center.seasoning.static-contract') {
          await current.page.reload({ waitUntil: 'domcontentloaded' });
          await expect(current.page.locator('body')).toContainText(/批量操作|暂无数据|调味名称/, { timeout: 30_000 });
        }
        if (capability.id === 'merchant-center.seasoning.create-boundary') {
          const values = [
            { price: '0', expectedPrice: 0, suffix: 'ZERO' },
            { price: '10.50', expectedPrice: 10.5, suffix: 'MID' },
            { price: '999999.99', expectedPrice: 999999.99, suffix: 'MAX' },
          ] as const;
          for (const [index, value] of values.entries()) {
            const identity = `AUTO_AUDIT_SEASONING_015_${Date.now()}_${index}_${value.suffix}`;
            const optionName = `${identity}_OPTION`;
            await current.seasoning.ensureListOpen();
            await current.seasoning.openCreate();
            await current.seasoning.fill(identity, optionName, value.price);
            const response = await current.seasoning.submitCreate();
            expect(response.ok(), `调味创建响应失败：${identity}`).toBe(true);
            const record = await waitForRecord(current.api, identity);
            current.records.push({ ...record, optionName, expectedPrice: value.expectedPrice });
            registerCleanup(current.api, current.registry, identity, record.id);
            current.operationReceipts.push({ operationKey: recipe.mutation?.operationKey ?? '', observed: true, method: 'POST' });
          }
          return current.records;
        }
        if (capability.id === 'merchant-center.seasoning.create-minimal') {
          const boundaryLength = recipe.caseId === 'TC-FLV-SEA-045' ? 100 : undefined;
          const identity = `AUTO_AUDIT_SEASONING_018_${Date.now()}`;
          const optionName = boundaryLength ? 'O'.repeat(boundaryLength) : `${identity}_OPTION`;
          const groupName = boundaryLength ? 'G'.repeat(boundaryLength) : identity;
          await current.seasoning.ensureListOpen();
          await current.seasoning.openCreate();
          await current.seasoning.fill(groupName, optionName, '0');
          const response = await current.seasoning.submitCreate();
          expect(response.ok(), `调味创建响应失败：${groupName}`).toBe(true);
          const record = await waitForRecord(current.api, groupName);
          current.records.push({ ...record, optionName });
          registerCleanup(current.api, current.registry, groupName, record.id);
          current.operationReceipts.push({ operationKey: recipe.mutation?.operationKey ?? '', observed: true, method: 'POST' });
          return { ...record, groupName, optionName, boundaryLength };
        }
        if (capability.id === 'merchant-center.seasoning.edit-group') {
          const record = requireSopRecord(current);
          const sopCase = seasoningSopCase('edit');
          const before = await current.api.seasoningDetail(record.id);
          await current.sopPage.open(sopCase, record);
          await current.sopPage.editIdentity(sopCase, record);
          const after = await current.api.seasoningDetail(record.id);
          await current.seasoning.ensureListOpen();
          current.operationReceipts.push({ operationKey: recipe.mutation?.operationKey ?? '', observed: true, method: 'PUT' });
          return { ...record, before, after };
        }
        if (capability.id === 'merchant-center.seasoning.delete-empty-group') {
          const record = requireSopRecord(current);
          const sopCase = seasoningSopCase('delete');
          await current.sopPage.open(sopCase, record);
          await current.sopPage.deleteIdentity(sopCase, record);
          current.operationReceipts.push({ operationKey: recipe.mutation?.operationKey ?? '', observed: true, method: 'DELETE' });
          return record;
        }
        if (capability.id === 'merchant-center.seasoning.price-correction') {
          const created: Array<{ identity: string; record: NamedRecord; price: number }> = [];
          for (const [index, price] of (['abc', '-1', ''] as const).entries()) {
            const identity = `AUTO_AUDIT_SEASONING_016_${Date.now()}_${index}`;
            await current.seasoning.ensureListOpen();
            await current.seasoning.openCreate();
            await current.seasoning.fill(identity, `${identity}_OPTION`, price);
            const response = await current.seasoning.submitCreate();
            expect(response.ok(), `调味价格纠正创建响应失败：${identity}`).toBe(true);
            const record = await waitForRecord(current.api, identity);
            const persistedDetail = await current.api.seasoningDetail(record.id);
            const finalPrice = readOptionPrice(persistedDetail, `${identity}_OPTION`) ?? 0;
            current.records.push({ ...record, optionName: `${identity}_OPTION`, expectedPrice: 0 });
            registerCleanup(current.api, current.registry, identity, record.id);
            created.push({ identity, record, price: finalPrice });
            current.changeReceipts.push({
              entityType: 'seasoning-group',
              entityId: record.id,
              changeType: 'persisted',
              beforeFingerprint: fingerprintReportValue({ exists: false, identity }),
              afterFingerprint: fingerprintReportValue(persistedDetail),
              changedFields: ['identity', 'price'],
              evidenceRef: 'brand-menu:GET /ops-brand/global-modifier/{id}',
            });
            current.operationReceipts.push({ operationKey: recipe.mutation?.operationKey ?? 'brand-menu:POST /ops-brand/global-modifier', observed: true, method: 'POST' });
          }
          const baseline = requireSopRecord(current);
          await current.sopPage.open(seasoningSopCase('edit'), baseline);
          await current.sopPage.enterEdit(seasoningSopCase('edit'), baseline);
          const editResults = await current.seasoning.attemptInvalidEditPrices();
          await current.seasoning.ensureListOpen();
          return { created, editResults };
        }
        if (capability.id === 'merchant-center.seasoning.rounding') {
          const createdDetails: unknown[] = [];
          for (const [index, input] of (['1.235', '1.234'] as const).entries()) {
            const identity = `AUTO_AUDIT_SEASONING_046_${Date.now()}_${index}`;
            const optionName = `${identity}_OPTION`;
            await current.seasoning.ensureListOpen();
            await current.seasoning.openCreate();
            await current.seasoning.fill(identity, optionName, input);
            const response = await current.seasoning.submitCreate();
            expect(response.ok(), `调味舍入创建响应失败：${identity}`).toBe(true);
            const record = await waitForRecord(current.api, identity);
            createdDetails.push(await current.api.seasoningDetail(record.id));
            current.records.push({ ...record, optionName, expectedPrice: input === '1.235' ? 1.24 : 1.23 });
            registerCleanup(current.api, current.registry, identity, record.id);
            current.operationReceipts.push({ operationKey: recipe.mutation?.operationKey ?? '', observed: true, method: 'POST' });
          }
          return { records: current.records, before: null, after: createdDetails };
        }
        if (capability.id === 'merchant-center.seasoning.record-task-search') {
          const taskName = (await current.seasoning.readVisibleRecordTaskNames())
            .map((value) => value.trim())
            .find(Boolean);
          if (!taskName) throw new Error('当前下发记录没有可用于正式查询用例的任务名称');
          const matchingRows = await current.seasoning.searchRecordByTaskName(taskName);
          current.operationReceipts.push({
            operationKey: 'brand-menu:POST /ops-brand/brand-modifier-sync/job/list',
            observed: true,
            method: 'POST',
          });
          return { taskName, matchingRows };
        }
        if (capability.id === 'merchant-center.seasoning.record-reset') {
          const result = await current.seasoning.resetRecordTaskName();
          current.operationReceipts.push({
            operationKey: 'brand-menu:POST /ops-brand/brand-modifier-sync/job/list',
            observed: true,
            method: 'POST',
          });
          return result;
        }
        if (capability.id === 'merchant-center.seasoning.template-create-audit') {
          const fields = await current.seasoning.readTemplateCreateFields();
          const validation = await current.seasoning.submitEmptyTemplate();
          current.operationReceipts.push({ operationKey: 'ui:click seasoning-template-save', observed: true, method: 'UI' });
          return { fields, validation };
        }
        if (capability.id === 'merchant-center.seasoning.template-distribution-audit') {
          const result = await current.seasoning.openTemplateDistribution();
          current.operationReceipts.push({ operationKey: 'brand-menu:POST /item/v1/ops-brand/merchants/page', observed: true, method: 'POST' });
          return result;
        }
        if (capability.id === 'merchant-center.seasoning.single-store-template-absence') {
          const result = await current.seasoning.readSingleStoreTemplateAbsence();
          current.operationReceipts.push({ operationKey: 'brand-menu:GET /pp/brand/seasoning/template', observed: true, method: 'GET' });
          return result;
        }
        // system-test-fingerprint:start seasoning-store-mutation-common-before
        if (capability.id === 'merchant-center.seasoning.store-replace-distribution'
          || capability.id === 'merchant-center.seasoning.store-delete-group'
          || capability.id === 'merchant-center.seasoning.store-delete-option'
          || capability.id === 'merchant-center.seasoning.store-batch-delete'
          || capability.id === 'merchant-center.seasoning.store-redeliver-restore') {
          const identity = current.records.find((record) => !record.name.includes('TPL_'))?.name;
          if (!identity) throw new Error(`门店调味能力缺少造数身份：${recipe.caseId}`);
          const isStoreReplace = capability.id === 'merchant-center.seasoning.store-replace-distribution';
          if (!isStoreReplace) {
            await current.page.reload({ waitUntil: 'domcontentloaded' });
            await waitForStorePageReady(current.page);
            await expect(current.page.locator('body')).toContainText(identity, { timeout: 30_000 });
          }
          const before = await withObservedExecutableOperation(
            'brand-menu:GET /ops-poi/global-modifier/list',
            'GET',
            () => current.distributionApi.storeSeasoningList(),
          );
          let uiMutation: { status: number; confirmText: string; visibleText: string; initiallyDisabled?: boolean } | undefined;
          const storeGroup = findRecordObjectWithName(before, identity);
          const optionIdentity = (storeGroup ? findFirstSeasoningOptionName(storeGroup) : undefined)
            ?? current.records.find((record) => record.name === identity)?.optionName
            ?? identity;
          // system-test-fingerprint:end seasoning-store-mutation-common-before
          // system-test-fingerprint:start seasoning-store-replace-distribution
          if (isStoreReplace) {
            const distribution = await withObservedExecutableOperation(
              'brand-menu:POST /ops-brand/brand-modifier-sync/all',
              'POST',
              () => current.seasoning.distributeAllSingleStore(),
            );
            expect(distribution.status).toBe(200);
            current.operationReceipts.push({ operationKey: 'brand-menu:POST /ops-brand/brand-modifier-sync/all', observed: true, method: 'POST' });
            const storeRecord = await waitForStoreRecord(current.distributionApi, identity);
            current.registry.register({
              entity: '门店调味系统测试数据',
              identity,
              checkpoint: { entryId: `store-seasoning-${storeRecord.id}`, entityKind: 'seasoning', serverId: storeRecord.id, identityVariants: [identity], cleanupOrder: 30 },
              execute: async () => {
                const existing = findNamedRecord(await withObservedExecutableOperation(
                  'brand-menu:GET /ops-poi/global-modifier/list',
                  'GET',
                  () => current.distributionApi.storeSeasoningList(),
                ), identity);
                if (existing) {
                  await withObservedExecutableOperation(
                    'brand-menu:DELETE /ops-poi/global-modifier/{id}',
                    'DELETE',
                    () => current.distributionApi.deleteStoreSeasoning(existing.id),
                  );
                }
              },
              verify: async () => !findNamedRecord(await withObservedExecutableOperation(
                'brand-menu:GET /ops-poi/global-modifier/list',
                'GET',
                () => current.distributionApi.storeSeasoningList(),
              ), identity),
            });
            await current.page.goto('/poi/location/seasoning', { waitUntil: 'domcontentloaded' });
            await waitForStorePageReady(current.page);
            uiMutation = {
              status: distribution.status,
              confirmText: distribution.buttonText,
              visibleText: await current.page.locator('body').innerText(),
            };
          // system-test-fingerprint:end seasoning-store-replace-distribution
          // system-test-fingerprint:start seasoning-store-delete-group
          } else if (capability.id === 'merchant-center.seasoning.store-delete-group') {
            const target = findNamedRecord(before, identity);
            if (!target) throw new Error(`门店调味组不存在：${identity}`);
            uiMutation = await current.seasoning.deleteStoreGroup(identity);
            current.operationReceipts.push({ operationKey: 'brand-menu:DELETE /ops-poi/global-modifier/{id}', observed: true, method: 'DELETE' });
          // system-test-fingerprint:end seasoning-store-delete-group
          // system-test-fingerprint:start seasoning-store-delete-option
          } else if (capability.id === 'merchant-center.seasoning.store-delete-option') {
            const target = findStoreOption(before, optionIdentity);
            if (!target) throw new Error(`门店调味项不存在：${identity}`);
            uiMutation = await current.seasoning.deleteStoreOption(identity, optionIdentity);
            current.operationReceipts.push({ operationKey: 'brand-menu:DELETE /ops-poi/global-modifier/option/{optionId}', observed: true, method: 'DELETE' });
          // system-test-fingerprint:end seasoning-store-delete-option
          // system-test-fingerprint:start seasoning-store-batch-delete
          } else if (capability.id === 'merchant-center.seasoning.store-batch-delete') {
            const target = findStoreOption(before, optionIdentity);
            if (!target) throw new Error(`门店批量删除目标不存在：${identity}`);
            uiMutation = await current.seasoning.batchDeleteStore(identity, optionIdentity);
            current.operationReceipts.push({ operationKey: 'brand-menu:POST /ops-poi/global-modifier/batch-delete', observed: true, method: 'POST' });
          // system-test-fingerprint:end seasoning-store-batch-delete
          // system-test-fingerprint:start seasoning-store-redeliver-restore
          } else if (capability.id === 'merchant-center.seasoning.store-redeliver-restore') {
            const template = current.templateSeed;
            if (!template) throw new Error('门店恢复用例缺少模板身份，禁止执行删除动作');
            const target = findNamedRecord(before, identity);
            if (!target) throw new Error(`门店恢复目标不存在：${identity}`);
            uiMutation = await current.seasoning.deleteStoreGroup(identity);
            current.operationReceipts.push({ operationKey: 'brand-menu:DELETE /ops-poi/global-modifier/{id}', observed: true, method: 'DELETE' });
            const targetStore = current.businessContext;
            if (!targetStore.poiId || !targetStore.poiName) throw new Error('门店恢复用例缺少已审计目标门店身份');
            const distribution = await withObservedExecutableOperation(
              'brand-menu:POST /ops-brand/brand-modifier-sync/by-template',
              'POST',
              () => current.seasoning.distributeTemplate(template.name, targetStore.poiId!, targetStore.poiName!),
            );
            expect(distribution.status).toBe(200);
            current.operationReceipts.push({ operationKey: 'brand-menu:POST /ops-brand/brand-modifier-sync/by-template', observed: true, method: 'POST' });
            await waitForDistributionJob(current.distributionApi, template.name);
            await waitForStoreRecord(current.distributionApi, identity);
            await current.page.goto('/poi/location/seasoning', { waitUntil: 'domcontentloaded' });
            await waitForStorePageReady(current.page);
          }
          // system-test-fingerprint:end seasoning-store-redeliver-restore
          // system-test-fingerprint:start seasoning-store-mutation-common-after
          await current.page.reload({ waitUntil: 'domcontentloaded' });
          await waitForStorePageReady(current.page);
          if (recipe.caseId === 'TC-FLV-SEA-042' || recipe.caseId === 'TC-FLV-XMOD-011') {
            await expect(current.page.locator('body')).toContainText(identity, { timeout: 30_000 });
          }
          const after = await withObservedExecutableOperation(
            'brand-menu:GET /ops-poi/global-modifier/list',
            'GET',
            () => current.distributionApi.storeSeasoningList(),
          );
          current.operationReceipts.push({ operationKey: 'brand-menu:GET /ops-poi/global-modifier/list', observed: true, method: 'GET' });
          if (!uiMutation) throw new Error(`门店调味 UI 操作结果缺失：${recipe.caseId}`);
          const deletedIdentity = capability.id === 'merchant-center.seasoning.store-delete-option'
            || capability.id === 'merchant-center.seasoning.store-batch-delete'
            ? optionIdentity
            : identity;
          return { identity, deletedIdentity, optionIdentity, before, after, uiMutation, visibleText: await current.page.locator('body').innerText() };
        }
        // system-test-fingerprint:end seasoning-store-mutation-common-after
        if (capability.id === 'merchant-center.seasoning.ui-mutation') {
          const result = await runUiMutationCase(current);
          current.operationReceipts.push(...buildObservedOperationReceipts(result.operations, result));
          return result;
        }
        if (capability.id === 'merchant-center.seasoning.static-contract'
          || capability.id === 'merchant-center.seasoning.template-name-normalization') {
          const result = await runStaticContractCase(current);
          current.operationReceipts.push(...buildObservedOperationReceipts(result.operations, result));
          return result;
        }
        throw new Error(`未知调味能力适配器：${capability.id}`);
      },
      assert: async (call, current) => {
        if (call.adapterId === 'merchant-center.seasoning.assert-ui-created') {
          await current.seasoning.openList();
          for (const record of current.records) await current.seasoning.expectGroupVisible(record.name);
          return;
        }
        if (call.adapterId === 'merchant-center.seasoning.assert-api-created') {
          for (const record of current.records) {
            if (!record.optionName) continue;
            const actual = readOptionPrice(await current.api.seasoningDetail(record.id), record.optionName);
            expect(actual, `${record.name} 调味价格`).toBe(record.expectedPrice);
          }
          return;
        }
        if (call.adapterId === 'merchant-center.seasoning.assert-api-identity') {
          const record = current.records[0];
          if (!record) throw new Error('最小创建服务端记录缺失。');
          expect(findNamedRecord(await current.api.seasoningDetail(record.id), record.name)?.id).toBe(record.id);
          return;
        }
        if (call.adapterId === 'merchant-center.seasoning.assert-ui-edited') {
          const record = requireSopRecord(current);
          if (recipe.caseId === 'TC-FLV-SEA-032') {
            await withObservedExecutableOperation(
              'ui:seasoning/read-updated',
              'UI',
              () => current.sopPage.verifyEditedUi(seasoningSopCase('edit'), record),
              { lifecyclePhase: 'read-updated-ui', identity: record.editedIdentity },
            );
          } else {
            await current.sopPage.verifyEditedUi(seasoningSopCase('edit'), record);
          }
          return;
        }
        if (call.adapterId === 'merchant-center.seasoning.assert-api-edited') {
          const record = requireSopRecord(current);
          const verified = recipe.caseId === 'TC-FLV-SEA-032'
            ? await withObservedExecutableOperation(
              'brand-menu:GET /ops-brand/global-modifier/list',
              'GET',
              () => current.sopFactory.verifyEdited(record),
              { lifecyclePhase: 'read-updated-api', identity: record.editedIdentity },
            )
            : await current.sopFactory.verifyEdited(record);
          expect(verified).toBe(true);
          return;
        }
        if (call.adapterId === 'merchant-center.seasoning.assert-ui-deleted') {
          await current.sopPage.verifyDeletedUi(seasoningSopCase('delete'), requireSopRecord(current));
          return;
        }
        if (call.adapterId === 'merchant-center.seasoning.assert-api-deleted') {
          expect(await current.sopFactory.verifyAbsent(requireSopRecord(current))).toBe(true);
          return;
        }
        if (call.adapterId === 'merchant-center.seasoning.assert-create-price-correction') {
          const result = current.results['merchant-center.seasoning.price-correction'] as { created: Array<{ price: number }> } | undefined;
          expect(result?.created.map((item) => item.price)).toEqual([0, 0, 0]);
          return;
        }
        if (call.adapterId === 'merchant-center.seasoning.assert-edit-price-reversion') {
          const result = current.results['merchant-center.seasoning.price-correction'] as { editResults: { originalValue: string; results: Array<{ input: string; value: string; confirmDisabled: boolean; mutationCount: number }> } } | undefined;
          expect(result?.editResults.results).toEqual([
            { input: 'abc', value: result?.editResults.originalValue, confirmDisabled: true, mutationCount: 0 },
            { input: '-1', value: result?.editResults.originalValue, confirmDisabled: true, mutationCount: 0 },
          ]);
          return;
        }
        if (call.adapterId === 'merchant-center.seasoning.assert-round-half-up') {
          const record = current.records.find((item) => item.optionName?.includes('_0_OPTION'));
          if (!record) throw new Error('四舍五入上取整记录缺失。');
          expect(readOptionPrice(await current.api.seasoningDetail(record.id), record.optionName!)).toBe(1.24);
          return;
        }
        if (call.adapterId === 'merchant-center.seasoning.assert-round-down') {
          const record = current.records.find((item) => item.optionName?.includes('_1_OPTION'));
          if (!record) throw new Error('四舍五入下取整记录缺失。');
          expect(readOptionPrice(await current.api.seasoningDetail(record.id), record.optionName!)).toBe(1.23);
          return;
        }
        if (call.adapterId === 'merchant-center.seasoning.assert-record-task-search') {
          const result = current.results['merchant-center.seasoning.record-task-search'] as {
            taskName: string;
            matchingRows: string[];
          } | undefined;
          expect(result?.matchingRows.length, '任务名称查询后应至少返回一条记录').toBeGreaterThan(0);
          for (const row of result?.matchingRows ?? []) expect(row).toContain(result!.taskName);
          return;
        }
        if (call.adapterId === 'merchant-center.seasoning.assert-record-reset') {
          const result = current.results['merchant-center.seasoning.record-reset'] as {
            before: string;
            after: string;
          } | undefined;
          expect(result?.before).toBe('AUTO_AUDIT_NON_EXISTING_TASK');
          if (result?.after !== '') {
            for (const claimId of call.claimIds ?? []) {
              current.assertionReceipts.push({ claimId, assertionAdapterId: call.adapterId, status: 'observed-mismatch' });
            }
            testInfo.annotations.push({
              type: 'product-mismatch-confirmed',
              description: `重置请求完成后任务名称输入值仍为 ${JSON.stringify(result?.after)}。`,
            });
            testInfo.annotations.push({
              type: 'execution-path-equivalent',
              description: '实际执行了正式用例的任务名称输入、真实 reset 控件、列表请求与可见终态读取。',
            });
          }
          expect(result?.after).toBe('');
          return;
        }
        if (call.adapterId === 'merchant-center.seasoning.assert-template-create-fields') {
          const result = current.results['merchant-center.seasoning.template-create-audit'] as { fields: { name: string; secondLanguage: string; description: string; selectSeasoningVisible: boolean; sortDisabled: boolean } } | undefined;
          expect(result?.fields).toEqual(expect.objectContaining({
            name: '调味模版名称',
            secondLanguage: '请输入第二语言',
            description: '模板说明',
            selectSeasoningVisible: true,
            sortDisabled: true,
          }));
          return;
        }
        if (call.adapterId === 'merchant-center.seasoning.assert-template-create-required') {
          const result = current.results['merchant-center.seasoning.template-create-audit'] as { validation: { invalidText: string; mutationCount: number } } | undefined;
          expect(result?.validation.invalidText).toContain('调味模版名称必填');
          expect(result?.validation.mutationCount).toBe(0);
          return;
        }
        if (call.adapterId === 'merchant-center.seasoning.assert-template-distribution-menu') {
          const result = current.results['merchant-center.seasoning.template-distribution-audit'] as { menuItems: string[] } | undefined;
          expect(result?.menuItems).toEqual(expect.arrayContaining(['编辑', '下发', '删除']));
          return;
        }
        if (call.adapterId === 'merchant-center.seasoning.assert-template-store-dialog') {
          const result = current.results['merchant-center.seasoning.template-distribution-audit'] as { dialogText: string; headers: string[]; confirmDisabled: boolean; merchantRequestObserved: boolean } | undefined;
          expect(result?.dialogText).toContain('下发到门店');
          expect(result?.dialogText).toContain('请先选择门店');
          expect(result?.headers).toEqual(expect.arrayContaining(['门店名称', '商户ID', '区域', '邮编', '地址信息']));
          expect(result?.confirmDisabled).toBe(true);
          expect(result?.merchantRequestObserved).toBe(true);
          return;
        }
        if (call.adapterId === 'merchant-center.seasoning.assert-single-store-template-absence') {
          const result = current.results['merchant-center.seasoning.single-store-template-absence'] as { forbidden: boolean; templateNavCount: number } | undefined;
          expect(result?.forbidden).toBe(true);
          expect(result?.templateNavCount).toBe(0);
          return;
        }
        // system-test-fingerprint:start seasoning-assert-store-mutation
        if (call.adapterId === 'merchant-center.seasoning.assert-store-mutation') {
          const result = (current.results['merchant-center.seasoning.store-replace-distribution']
            ?? current.results['merchant-center.seasoning.store-delete-group']
            ?? current.results['merchant-center.seasoning.store-delete-option']
            ?? current.results['merchant-center.seasoning.store-batch-delete']
            ?? current.results['merchant-center.seasoning.store-redeliver-restore']) as {
              identity: string;
              deletedIdentity: string;
              after: unknown;
              visibleText: string;
              uiMutation: { status: number; confirmText: string; initiallyDisabled?: boolean };
            } | undefined;
          expect(result, '门店调味变更结果缺失').toBeDefined();
          if (recipe.caseId === 'TC-FLV-XMOD-004' || recipe.caseId === 'TC-FLV-XMOD-005' || recipe.caseId === 'TC-FLV-XMOD-006') {
            expect(result?.visibleText).not.toContain(result!.deletedIdentity);
            expect(result?.uiMutation.status).toBeGreaterThanOrEqual(200);
            expect(result?.uiMutation.status).toBeLessThan(300);
            expect(result?.uiMutation.confirmText).toMatch(/删除/);
            if (recipe.caseId === 'TC-FLV-XMOD-004') {
              expect(findNamedRecord(result?.after, result!.identity), '删除后 API 仍存在目标门店调味组').toBeUndefined();
            } else {
              expect(findStoreOption(result?.after, result!.deletedIdentity), '删除后 API 仍存在目标门店调味项').toBeUndefined();
              expect(findNamedRecord(result?.after, result!.identity), '删除单项后调味组不应消失').toBeDefined();
            }
            if (recipe.caseId === 'TC-FLV-XMOD-006') expect(result?.uiMutation.initiallyDisabled).toBe(true);
          } else {
            expect(result?.visibleText).toContain(result!.identity);
            expect(findNamedRecord(result?.after, result!.identity), '下发后 API 未恢复目标门店调味').toBeDefined();
          }
          return;
        }
        // system-test-fingerprint:end seasoning-assert-store-mutation
        if (call.adapterId === 'merchant-center.seasoning.assert-static-contract') {
          const result = (current.results['merchant-center.seasoning.static-contract']
            ?? current.results['merchant-center.seasoning.template-name-normalization']) as {
            checks: Record<string, boolean>;
            observations: Record<string, unknown>;
            productMismatch?: string;
          } | undefined;
          expect(result, '静态页面合同结果缺失').toBeDefined();
          if (result?.productMismatch) {
            for (const claimId of call.claimIds ?? []) {
              current.assertionReceipts.push({ claimId, assertionAdapterId: call.adapterId, status: 'observed-mismatch' });
            }
            testInfo.annotations.push({ type: 'product-mismatch-confirmed', description: result.productMismatch });
            testInfo.annotations.push({
              type: 'execution-path-equivalent',
              description: '已进入正式用例指定路由，完成目标业务请求并读取当前稳定可见终态；本用例无业务写入。',
            });
            throw new Error(`SYSTEM_TEST_OBSERVED_MISMATCH:${recipe.caseId}:${result.productMismatch}`);
          }
          expect(Object.entries(result?.checks ?? {}).filter(([, passed]) => !passed), '页面合同存在未满足断言').toEqual([]);
          return;
        }
        if (call.adapterId === 'merchant-center.seasoning.assert-ui-mutation') {
          const result = current.results['merchant-center.seasoning.ui-mutation'] as {
            checks: Record<string, boolean>;
            observations: Record<string, unknown>;
            productMismatch?: string;
          } | undefined;
          expect(result, '调味业务变更结果缺失').toBeDefined();
          if (result?.productMismatch) {
            for (const claimId of call.claimIds ?? []) {
              current.assertionReceipts.push({ claimId, assertionAdapterId: call.adapterId, status: 'observed-mismatch' });
            }
            testInfo.annotations.push({ type: 'product-mismatch-confirmed', description: result.productMismatch });
            testInfo.annotations.push({
              type: 'execution-path-equivalent',
              description: '已进入正式用例指定路由，完成目标业务请求并读取服务端稳定终态。',
            });
            throw new Error(`SYSTEM_TEST_OBSERVED_MISMATCH:${recipe.caseId}:${result.productMismatch}`);
          }
          expect(Object.entries(result?.checks ?? {}).filter(([, passed]) => !passed), '业务变更存在未满足断言').toEqual([]);
          return;
        }
        throw new Error(`未知调味断言适配器：${call.adapterId}`);
      },
      // system-test-fingerprint:start seasoning-cleanup
      reportStep: createSeasoningSystemTestStepReporter(),
      buildReportEvidence: (step, current) => buildSeasoningReportEvidence(step, current),
      cleanup: async (call, current) => {
        if (call.adapterId !== 'merchant-center.seasoning.cleanup') throw new Error(`未知调味清理适配器：${call.adapterId}`);
        const templateRecords = current.records.filter((record) => record.objectType === '调味模板');
        const pilotRecord = recipe.caseId === 'TC-FLV-SEA-032' ? requireSopRecord(current) : undefined;
        const apiEvidence = pilotRecord
          ? await withObservedExecutableOperation(
            'brand-menu:DELETE /ops-brand/global-modifier/{id}',
            'DELETE',
            () => current.registry.cleanupAll(),
            { lifecyclePhase: 'delete', identity: pilotRecord.editedIdentity, serverId: pilotRecord.id },
          )
          : await current.registry.cleanupAll();
        const uiIdentityCounts: Record<string, number> = {};
        if (templateRecords.length > 0) {
          current.operationReceipts.push(
            { operationKey: 'brand-menu:DELETE /ops-brand/modifier-template/{id}', observed: true, method: 'DELETE' },
            { operationKey: 'brand-menu:GET /ops-brand/modifier-template/page', observed: true, method: 'GET' },
          );
          await executeReadOnlyUiWithTransientRetry(() => current.seasoning.openTemplateList());
          for (const record of templateRecords) {
            uiIdentityCounts[record.name] = await current.seasoning.main.getByText(record.name, { exact: true }).count();
          }
        }
        if (current.records.some((record) => record.objectType !== '调味模板')) {
          if (pilotRecord) {
            const absent = await withObservedExecutableOperation(
              'brand-menu:GET /ops-brand/global-modifier/list',
              'GET',
              () => current.api.seasoningList(),
              { lifecyclePhase: 'read-absent-api', identities: pilotRecord.cleanupIdentities },
            );
            for (const identity of pilotRecord.cleanupIdentities) expect(findNamedRecord(absent, identity)).toBeUndefined();
            await withObservedExecutableOperation(
              'ui:seasoning/read-absent',
              'UI',
              () => executeReadOnlyUiWithTransientRetry(() => current.seasoning.openList()),
              { lifecyclePhase: 'read-absent-ui', identities: pilotRecord.cleanupIdentities },
            );
          } else {
            await executeReadOnlyUiWithTransientRetry(() => current.seasoning.openList());
          }
          for (const record of current.records.filter((item) => item.objectType !== '调味模板')) {
            uiIdentityCounts[record.name] = await current.seasoning.main.getByText(record.name, { exact: true }).count();
          }
        }
        return buildCleanupEvidence(apiEvidence, current.records, uiIdentityCounts);
      },
      // system-test-fingerprint:end seasoning-cleanup
        }));
      } catch (error) {
        executionFailed = true;
        const failureCategory = classifySystemTestFailure({
          status: 'failed',
          message: error instanceof Error ? error.message : String(error),
          evidenceComplete: hasCompleteSeasoningFailureEvidence(recipe, runtimeContext),
          productMismatchConfirmed: testInfo.annotations.some((item) => item.type === 'product-mismatch-confirmed'),
          executionPathEquivalent: testInfo.annotations.some((item) => item.type === 'execution-path-equivalent'),
        });
        const failureDiagnosis = describeSeasoningFailure(error, runtimeContext, failureCategory);
        const failureCategoryLabel = describeSeasoningFailureCategory(failureCategory);
        testInfo.annotations.push({ type: 'failure-category', description: failureCategory });
        const diagnosticPath = path.resolve(checkpointRoot, `${runId}_${recipe.caseId}.error.json`);
        fs.writeFileSync(diagnosticPath, JSON.stringify({
          caseId: recipe.caseId,
          failureCategory,
          failureDiagnosis,
          url: page.url(),
          message: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
          results: runtimeContext?.results ?? {},
          contextGuardReceipts: runtimeContext?.contextGuardReceipts ?? [],
          actionReadinessReceipts: runtimeContext?.actionReadinessReceipts ?? [],
          executionTimings: runtimeContext?.executionTimings ?? [],
        }, null, 2));
        await attachBusinessEvidenceStep({
          title: '失败诊断：保存失败分类、错误信息和已完成操作',
          runStep: (title, action) => test.step(title, action),
          attachments: [
            {
              name: '失败分类与中文说明',
              contentType: 'text/plain',
              body: Buffer.from(`失败分类：${failureCategoryLabel}\n失败类型：${failureDiagnosis.failureType}\n${failureDiagnosis.reason}\n失败阶段：${failureDiagnosis.failedPhase}\n最后完成步骤：${failureDiagnosis.lastCompletedStep}\n是否超时：${failureDiagnosis.timedOut ? '是' : '否'}`),
            },
            {
              name: '中文失败诊断',
              contentType: 'application/json',
              body: Buffer.from(JSON.stringify({
                caseId: recipe.caseId,
                failureCategory,
                failureCategoryLabel,
                failureDiagnosis,
                url: page.url(),
                message: error instanceof Error ? error.message : String(error),
                stack: error instanceof Error ? error.stack : undefined,
                results: runtimeContext?.results ?? {},
                contextGuardReceipts: runtimeContext?.contextGuardReceipts ?? [],
                actionReadinessReceipts: runtimeContext?.actionReadinessReceipts ?? [],
                executionTimings: runtimeContext?.executionTimings ?? [],
              }, null, 2)),
            },
          ],
        });
        throw error;
      }
      runtimeContext = context;
    } finally {
      const executableOperationReceipts = consumeExecutableOperationReceipts(testInfo.testId);
      await attachBusinessEvidenceStep({
        title: formatBusinessExecutionConclusionTitle(executionFailed ? 'failed' : 'passed', recipe.caseId),
        runStep: (title, action) => test.step(title, action),
        attachments: [
          {
            name: '执行结论详情',
            contentType: 'text/plain',
            body: Buffer.from([
              `用例标识：${recipe.caseId}`,
              `执行结果：${executionFailed ? '失败' : '通过'}`,
              `断言收据数量：${runtimeContext?.assertionReceipts?.length ?? 0}`,
              `清理收据：${runtimeContext?.cleanupEvidence ? '已生成' : '未生成'}`,
              executionFailed ? '详细失败原因：请查看对应失败步骤和失败诊断。' : '判定依据：当前执行收据已归档。',
            ].join('\n')),
          },
          {
            name: '业务证据附件',
            contentType: 'application/json',
            body: Buffer.from(JSON.stringify({
              caseId: recipe.caseId,
              title: recipe.title,
              executionStatus: executionFailed ? 'failed' : 'passed',
              route: page.url(),
              results: runtimeContext?.results ?? {},
              assertionReceipts: runtimeContext?.assertionReceipts ?? [],
              contextGuardReceipts: runtimeContext?.contextGuardReceipts ?? [],
              actionReadinessReceipts: runtimeContext?.actionReadinessReceipts ?? [],
              executionTimings: runtimeContext?.executionTimings ?? [],
            }, null, 2)),
          },
          {
            name: 'system-test-runtime-evidence',
            contentType: 'application/json',
            body: Buffer.from(JSON.stringify({
              caseId: recipe.caseId,
              executionContext: {
                applicationVersionFingerprint: runtimeContext?.applicationVersionFingerprint ?? null,
                environmentId: 'balamxqa',
                tenantScope: runtimeContext
                  ? `${runtimeContext.businessContext.profile}:${runtimeContext.businessContext.brandId}`
                  : null,
                locale: 'zh-CN',
                roleId: 'merchant-operator',
                route: new URL(page.url()).pathname,
              },
              assertionReceipts: runtimeContext?.assertionReceipts ?? [],
              contextGuardReceipts: runtimeContext?.contextGuardReceipts ?? [],
              actionReadinessReceipts: runtimeContext?.actionReadinessReceipts ?? [],
              executionTimings: runtimeContext?.executionTimings ?? [],
              operationReceipts: executableOperationReceipts,
              changeReceipts: runtimeContext?.changeReceipts ?? [],
              mutationObserved: resolveSystemTestMutationObserved({ declaredMutation: recipe.mutation }),
              cleanup: runtimeContext?.cleanupEvidence,
            }, null, 2)),
          },
        ],
      });
    }
  });
}

function seasoningSopCase(action: 'edit' | 'delete'): ProductCenterSopCase {
  const definition = productCenterSopCatalog.find((item) => item.entityKey === 'seasoning');
  if (!definition) throw new Error('品牌调味 SOP 定义缺失。');
  return {
    ...definition,
    action,
    seedMode: 'api',
    cleanupMode: 'api-finally',
    uiCreatesData: false,
    verifyServerState: true,
    verifyZeroResidue: true,
    forwardSteps: [],
    reverseSteps: [],
  };
}

function describeSeasoningFailure(
  error: unknown,
  context: RuntimeContext | undefined,
  failureCategory: string,
): {
  failureType: string;
  reason: string;
  timedOut: boolean;
  failedPhase: string;
  lastCompletedStep: string;
} {
  const message = error instanceof Error ? error.message : String(error);
  const timedOut = /WAIT_UNTIL_CONDITION_TIMEOUT|TimeoutError|timeout|超时/i.test(message);
  const failedTiming = [...(context?.executionTimings ?? [])].reverse().find((item) => item.status === 'failed');
  const lastCompletedTiming = [...(context?.executionTimings ?? [])].reverse().find((item) => item.status === 'passed');
  const failureType = timedOut
    ? '等待超时'
    : failureCategory === 'locator-drift'
      ? '页面控件定位失败'
      : failureCategory === 'environment-failure'
        ? '执行环境失败'
        : failureCategory === 'product-failure'
          ? '业务结果不符合预期'
          : '自动化执行失败';
  const reason = timedOut
    ? `等待目标页面、门店或控件进入预期状态超时；最后错误信息：${message}`
    : failureCategory === 'product-failure'
      ? `已完成真实业务操作，但最终业务断言不成立：${message}`
      : `在${failedTiming?.phase ?? '未知'}阶段执行失败：${message}`;
  return {
    failureType,
    reason,
    timedOut,
    failedPhase: failedTiming?.phase ?? '未知',
    lastCompletedStep: lastCompletedTiming?.id ?? '无',
  };
}

function hasCompleteSeasoningFailureEvidence(
  recipe: AutomationRecipe,
  context: RuntimeContext | undefined,
): boolean {
  if (!context) return false;
  const assertionClaimIds = (recipe.assertionContracts ?? []).map((contract) => contract.claimId);
  const assertionReceipts = context.assertionReceipts ?? [];
  if (assertionClaimIds.some((claimId) => !assertionReceipts.some((receipt) => (
    receipt.claimId === claimId && (receipt.status === 'verified' || receipt.status === 'observed-mismatch')
  )))) return false;
  const guards = context.contextGuardReceipts ?? [];
  if ((recipe.contextGuards ?? []).some((guard) => !guards.some((receipt) => (
    receipt.contextGuardAdapterId === guard.adapterId && receipt.phase === guard.input?.phase
  )))) return false;
  if ((context.operationReceipts ?? []).length === 0) return false;
  if (!recipe.cleanup) return true;
  const cleanupObjects = (context.cleanupEvidence as {
    objects?: Array<{
      apiResidueCount: number;
      uiResidueCount?: number;
      outcome: string;
    }>;
  } | undefined)?.objects ?? [];
  return cleanupObjects.length > 0 && cleanupObjects.every((item) => (
    item.apiResidueCount === 0
    && (item.uiResidueCount ?? 0) === 0
    && item.outcome === 'verified-zero'
  ));
}

function describeSeasoningFailureCategory(category: string): string {
  const labels: Record<string, string> = {
    'automation-gap': '自动化缺口（脚本或页面合同未完成）',
    'cleanup-residue': '清理残留（测试数据未清理干净）',
    'environment-failure': '执行环境失败（登录、权限或网络）',
    'external-dependency': '外部依赖不可用（依赖系统或能力缺失）',
    'locator-drift': '页面控件定位漂移（控件未按审计合同识别）',
    'product-failure': '产品行为不符合预期（需完整证据确认）',
    'test-data': '测试数据问题（夹具或唯一性不满足）',
    'transient-platform': '执行平台瞬态失败（连接、限流或重试耗尽）',
    unknown: '未分类失败（需要人工复核）',
  };
  return labels[category] ?? `未分类失败（${category}）`;
}

async function runUiMutationCase(context: RuntimeContext): Promise<{
  checks: Record<string, boolean>;
  observations: Record<string, unknown>;
  operations: string[];
  productMismatch?: string;
}> {
  const { api, page, seasoning } = context;
  const checks: Record<string, boolean> = {};
  const operations: string[] = [];
  if (context.recipe.caseId.startsWith('TC-FLV-TPL-')) {
    return runTemplateUiMutationCase(context);
  }
  switch (context.recipe.caseId) {
    case 'TC-FLV-SEA-010': {
      const before = await api.seasoningList();
      const candidate = await selectUnusedIndustrySeasoningCandidate(before, seasoning, 1);
      const optionName = candidate.optionNames[0];
      const result = await seasoning.selectIndustrySeasoning(candidate.groupName, optionName);
      const created = findNamedRecord(await api.seasoningList(), candidate.groupName);
      if (!created) throw new Error(`行业调味选择成功后未回读到调味组：${candidate.groupName}`);
      registerImportedSeasoningCleanup(api, context.registry, candidate.groupName, created.id);
      context.records.push({ ...created, optionName, objectType: '品牌调味' });
      checks.selectionSubmitted = result.status >= 200 && result.status < 300;
      checks.selectionPageReturned = new URL(page.url()).pathname === '/pp/brand/seasoning/list';
      checks.selectedOptionVisible = result.visibleText.includes(optionName);
      operations.push('brand-menu:GET /ops-brand/global-modifier/platform-presets', 'brand-menu:POST /ops-brand/global-modifier/batch', 'brand-menu:GET /ops-brand/global-modifier/list');
      return { checks, observations: { ...result, candidate, created }, operations };
    }
    case 'TC-FLV-SEA-011': {
      await seasoning.openCreate();
      const result = await seasoning.submitCreateWithoutOptionName(`AUTO_AUDIT_SEASONING_011_${Date.now()}`, `AUTO_AUDIT_SECOND_${Date.now()}`);
      checks.requiredFieldRejected = result.mutationCount === 0 && (result.invalidCount > 0 || result.errorTexts.length > 0);
      checks.missingFieldHighlighted = result.invalidCount > 0 || result.errorTexts.includes('调味名称(必填)');
      operations.push('ui:click seasoning-create-confirm');
      await seasoning.ensureListOpen();
      return { checks, observations: result, operations };
    }
    case 'TC-FLV-SEA-012': {
      await seasoning.openCreate();
      const result = await seasoning.submitCreateWithoutGroupName(`AUTO_AUDIT_SECOND_${Date.now()}`, `AUTO_AUDIT_POS_${Date.now()}`);
      checks.groupNameRejected = result.mutationCount === 0;
      checks.groupNameHighlighted = result.groupFieldHasError;
      checks.exactFeedback = result.groupFieldErrorTexts.includes('调味组名称必填')
        || result.errorTexts.includes('调味组名称必填');
      operations.push('ui:click seasoning-create-confirm');
      await seasoning.ensureListOpen();
      return { checks, observations: result, operations };
    }
    case 'TC-FLV-SEA-013': {
      const seed = requireSopRecord(context);
      await context.sopPage.open(seasoningSopCase('edit'), seed);
      await context.sopPage.enterEdit(seasoningSopCase('edit'), seed);
      const result = await seasoning.submitExistingGroupOptionWithoutName(
        seed.originalIdentity,
        `AUTO_AUDIT_SECOND_LANGUAGE_${Date.now()}`,
      );
      const detail = await api.seasoningDetail(seed.id);
      checks.optionRejected = result.mutationCount === 0
        && (result.invalidCount > 0 || result.errorTexts.length > 0);
      checks.originalGroupRetained = result.groupVisible
        && JSON.stringify(detail).includes(seed.originalIdentity);
      operations.push('ui:click seasoning-create-confirm', 'brand-menu:GET /ops-brand/global-modifier/{id}');
      await seasoning.ensureListOpen();
      return { checks, observations: { ...result, detail }, operations };
    }
    case 'TC-FLV-SEA-019': {
      const identity = `AUTO_AUDIT_SEASONING_019_${Date.now()}`;
      const optionName = `${identity}_OPTION`;
      await seasoning.ensureListOpen();
      await seasoning.openCreate();
      await seasoning.fillAllFields(identity, optionName, '10.50');
      const response = await seasoning.submitCreate();
      const record = await waitForRecord(api, identity);
      const detail = await context.api.seasoningDetail(record.id);
      context.records.push({ ...record, optionName, expectedPrice: 10.5 });
      registerCleanup(api, context.registry, identity, record.id);
      checks.saved = response.ok();
      await seasoning.openList();
      checks.groupVisible = (await page.getByText(identity, { exact: true }).count()) === 1;
      checks.optionPersisted = findFirstSeasoningOptionName(detail) === optionName;
      checks.allFieldsPersisted = JSON.stringify(detail).includes(`${identity}_SECOND`)
        && JSON.stringify(detail).includes(`${identity}_POS`)
        && JSON.stringify(detail).includes(`${optionName}_KITCHEN`);
      operations.push('brand-menu:POST /ops-brand/global-modifier/batch', 'brand-menu:GET /ops-brand/global-modifier/{id}');
      return { checks, observations: { responseStatus: response.status(), requestBody: response.request().postDataJSON(), detail }, operations };
    }
    case 'TC-FLV-SEA-021': {
      const seed = requireSopRecord(context);
      await context.sopPage.open(seasoningSopCase('edit'), seed);
      await context.sopPage.enterEdit(seasoningSopCase('edit'), seed);
      const optionName = `AUTO_AUDIT_SEASONING_021_OPTION_${Date.now()}`;
      const result = await seasoning.addOptionToExistingGroup(seed.originalIdentity, optionName, '2.50');
      const detail = await api.seasoningDetail(seed.id);
      checks.saved = result.status >= 200 && result.status < 300;
      checks.optionPersisted = findFirstSeasoningOptionName(detail) !== undefined && JSON.stringify(detail).includes(optionName);
      operations.push('brand-menu:PUT /ops-brand/global-modifier/{id}', 'brand-menu:GET /ops-brand/global-modifier/{id}');
      await seasoning.ensureListOpen();
      return { checks, observations: { ...result, detail }, operations };
    }
    case 'TC-FLV-SEA-022':
    case 'TC-FLV-SEA-023':
    case 'TC-FLV-SEA-024':
    case 'TC-FLV-SEA-025':
    case 'TC-FLV-SEA-026':
    case 'TC-FLV-SEA-027':
    case 'TC-FLV-SEA-028':
    case 'TC-FLV-SEA-033':
    case 'TC-FLV-SEA-034':
    case 'TC-FLV-SEA-035':
    case 'TC-FLV-SEA-036':
    case 'TC-FLV-SEA-037':
    case 'TC-FLV-SEA-040':
    case 'TC-FLV-SEA-041':
      return runStaticContractCase(context);
    case 'TC-FLV-SEA-044': {
      const seed = requireSopRecord(context);
      const baseline = await api.seasoningDetail(seed.id);
      const optionName = findFirstSeasoningOptionName(baseline);
      if (!optionName) throw new Error('跨组同名调味用例缺少已存在调味项身份');
      const secondGroup = `AUTO_AUDIT_SEASONING_044_${Date.now()}`;
      await seasoning.ensureListOpen();
      await seasoning.openCreate();
      await seasoning.fill(secondGroup, optionName, '0');
      const response = await seasoning.submitCreate();
      const second = await waitForRecord(api, secondGroup);
      const secondDetail = await api.seasoningDetail(second.id);
      context.records.push({ ...second, optionName });
      registerCleanup(api, context.registry, secondGroup, second.id);
      checks.saved = response.ok();
      checks.firstGroupRetained = Boolean(findNamedRecord(await api.seasoningList(), seed.originalIdentity));
      checks.sameOptionPersisted = JSON.stringify(secondDetail).includes(optionName);
      operations.push('brand-menu:POST /ops-brand/global-modifier/batch', 'brand-menu:GET /ops-brand/global-modifier/list', 'brand-menu:GET /ops-brand/global-modifier/{id}');
      return { checks, observations: { before: null, after: secondDetail, firstGroup: seed.originalIdentity, secondGroup, optionName, responseStatus: response.status(), secondDetail }, operations };
    }
    case 'TC-FLV-SEA-045': {
      const groupPrefix = 'AUTO_AUDIT_SEASONING_045_';
      const optionPrefix = 'AUTO_AUDIT_OPTION_045_';
      const groupName = `${groupPrefix}${'G'.repeat(100 - groupPrefix.length)}`;
      const optionName = `${optionPrefix}${'O'.repeat(100 - optionPrefix.length)}`;
      await seasoning.ensureListOpen();
      await seasoning.openCreate();
      await seasoning.fill(groupName, optionName, '0');
      const response = await seasoning.submitCreate();
      const record = await waitForRecord(api, groupName);
      const detail = await context.api.seasoningDetail(record.id);
      context.records.push({ ...record, optionName });
      registerCleanup(api, context.registry, groupName, record.id);
      checks.saved = response.ok();
      await seasoning.openList();
      checks.groupBoundaryPersisted = JSON.stringify(detail).includes(groupName);
      checks.optionBoundaryPersisted = JSON.stringify(detail).includes(optionName);
      operations.push('brand-menu:POST /ops-brand/global-modifier/batch', 'brand-menu:GET /ops-brand/global-modifier/{id}');
      return { checks, observations: { before: null, after: detail, groupNameLength: groupName.length, optionNameLength: optionName.length, responseStatus: response.status(), detail }, operations };
    }
    default:
      throw new Error(`调味 UI 变更适配器未注册：${context.recipe.caseId}`);
  }
}

async function runTemplateUiMutationCase(context: RuntimeContext): Promise<{
  checks: Record<string, boolean>;
  observations: Record<string, unknown>;
  operations: string[];
  productMismatch?: string;
}> {
  const { api, distributionApi, page, seasoning } = context;
  const checks: Record<string, boolean> = {};
  const operations: string[] = [];

  switch (context.recipe.caseId) {
    case 'TC-FLV-TPL-010': {
      const result = await seasoning.submitEmptyTemplate();
      checks.requiredFieldRejected = result.mutationCount === 0;
      checks.requiredFeedbackVisible = result.invalidText.includes('调味模版名称必填');
      operations.push('ui:click seasoning-template-save');
      return { checks, observations: result, operations };
    }
    case 'TC-FLV-TPL-012':
    case 'TC-FLV-TPL-013':
    case 'TC-FLV-TPL-025': {
      const identity = `AUTO_AUDIT_TPL_${context.recipe.caseId.slice(-3)}_${Date.now()}`;
      const fields = context.recipe.caseId === 'TC-FLV-TPL-013'
        ? { secondLanguage: `${identity}_SECOND`, description: `${identity}_DESCRIPTION`, selectSeasoning: true }
        : context.recipe.caseId === 'TC-FLV-TPL-025'
          ? { description: 'A'.repeat(250), selectSeasoning: true }
          : { selectSeasoning: true };
      const response = await seasoning.saveTemplate(identity, fields);
      const created = findNamedRecord(await api.seasoningTemplatePage(identity), identity);
      if (!created) throw new Error(`模板创建后服务端未回读：${identity}`);
      context.records.push({ ...created, objectType: '调味模板' });
      registerTemplateCleanup(api, context.registry, identity, created.id);
      await seasoning.openTemplateList(identity);
      checks.saveSucceeded = response.status >= 200 && response.status < 300;
      checks.templateVisible = await page.getByText(identity, { exact: true }).count() === 1;
      if (context.recipe.caseId === 'TC-FLV-TPL-025') {
        const body = response.requestBody as Record<string, unknown> | null;
        checks.descriptionBoundary = typeof body?.description === 'string' && body.description.length === 250;
      } else {
        checks.descriptionBoundary = true;
      }
      return {
        checks,
        observations: { responseStatus: response.status, requestBody: response.requestBody, templateId: created.id },
        operations: ['brand-menu:POST /ops-brand/modifier-template', 'brand-menu:GET /ops-brand/modifier-template/page'],
      };
    }
    case 'TC-FLV-TPL-014': {
      const identity = `AUTO_AUDIT_TPL_014_${Date.now()}`;
      const result = await seasoning.submitTemplateWithoutSeasoning(identity);
      checks.requiredSelectionRejected = result.mutationCount === 0;
      checks.requiredSelectionFeedbackVisible = result.errorText === '调味模版至少需要一个调味组';
      checks.routeRetained = result.route === '/pp/brand/seasoning/addtemplate';
      return { checks, observations: result, operations: ['ui:click seasoning-template-save'] };
    }
    case 'TC-FLV-TPL-015':
    case 'TC-FLV-TPL-016': {
      const baseline = context.templateSeed;
      if (!baseline) throw new Error('重复模板用例缺少服务端基线模板');
      await seasoning.ensureTemplateListOpen(baseline.name);
      const beforeCount = await page.getByText(baseline.name, { exact: true }).count();
      await seasoning.openTemplateCreate();
      const result = await seasoning.trySaveDuplicateTemplate(baseline.name);
      await seasoning.ensureTemplateListOpen(baseline.name);
      const afterCount = await page.getByText(baseline.name, { exact: true }).count();
      checks.duplicateRejected = /重复|已存在|唯一/.test(result.errorText) || result.mutationCount === 0;
      checks.feedbackVisible = result.errorText.length > 0;
      checks.noDuplicateCreated = beforeCount === afterCount && afterCount === 1;
      return {
        checks,
        observations: { baseline: baseline.name, beforeCount, afterCount, ...result },
        operations: ['brand-menu:POST /ops-brand/modifier-template'],
      };
    }
    case 'TC-FLV-TPL-017': {
      const baseline = context.templateSeed;
      if (!baseline) throw new Error('模板编辑用例缺少服务端基线模板');
      await seasoning.ensureTemplateListOpen(baseline.name);
      const updatedDescription = `${baseline.name}_EDITED_DESCRIPTION`;
      const result = await seasoning.editTemplate(baseline.name, updatedDescription);
      const detail = await api.seasoningTemplateDetail(baseline.id);
      const detailText = JSON.stringify(detail);
      checks.saved = result.status >= 200 && result.status < 300;
      checks.inputUpdated = result.visibleDescription === updatedDescription;
      checks.updatedPersisted = detailText.includes(updatedDescription)
        && JSON.stringify(result.requestBody).includes(updatedDescription);
      await seasoning.ensureTemplateListOpen(baseline.name);
      return { checks, observations: { ...result, detailText }, operations: ['brand-menu:PUT /ops-brand/modifier-template/{id}'] };
    }
    case 'TC-FLV-TPL-018':
    case 'TC-FLV-TPL-019': {
      const baseline = context.templateSeed;
      if (!baseline) throw new Error('模板内调味用例缺少服务端基线模板');
      await seasoning.ensureTemplateListOpen(baseline.name);
      const before = await api.seasoningTemplateDetail(baseline.id);
      const mode = context.recipe.caseId === 'TC-FLV-TPL-018' ? 'add' : 'remove';
      const targetOptionName = mode === 'add' ? baseline.additionOptionName : baseline.optionName;
      if (!targetOptionName) throw new Error('模板新增调味用例缺少未选中的目标调味项');
      const result = await seasoning.editTemplateSeasoning(baseline.name, targetOptionName, mode);
      const after = await api.seasoningTemplateDetail(baseline.id);
      const afterOptionNames = collectTemplateOptionNames(after);
      const optionCount = countTemplateOptions(after);
      checks.templateVisible = result.templateVisible;
      checks.lifecycleObserved = result.status >= 200 && result.status < 300
        && (mode === 'add' ? afterOptionNames.includes(targetOptionName) : !afterOptionNames.includes(targetOptionName));
      await seasoning.ensureTemplateListOpen(baseline.name);
      return {
        checks,
        observations: { mode, before, after, selectedCount: result.selectedCount, optionCount, afterOptionNames },
        operations: ['brand-menu:PUT /ops-brand/modifier-template/{id}'],
      };
    }
    case 'TC-FLV-TPL-020': {
      const baseline = context.templateSeed;
      if (!baseline) throw new Error('模板删除用例缺少服务端基线模板');
      await seasoning.ensureTemplateListOpen(baseline.name);
      const result = await seasoning.deleteTemplate(baseline.name);
      checks.confirmationVisible = /删除|模板/.test(result.confirmText);
      checks.deleted = result.status >= 200 && result.status < 300
        && !findNamedRecord(await api.seasoningTemplatePage(baseline.name), baseline.name);
      return { checks, observations: result, operations: ['brand-menu:DELETE /ops-brand/modifier-template/{id}'] };
    }
    case 'TC-FLV-TPL-021':
    case 'TC-FLV-TPL-023':
    case 'TC-FLV-TPL-024':
      return runStaticContractCase(context);
    case 'TC-FLV-TPL-022': {
      const baseline = context.templateSeed;
      if (!baseline) throw new Error('模板下发用例缺少服务端基线模板');
      const targetStore = resolveSeasoningContext('multi-store-000420');
      if (!targetStore.poiId || !targetStore.poiName) throw new Error('TPL-022 缺少已审计目标门店身份');
      await seasoning.ensureTemplateListOpen(baseline.name);
      const templateDetail = await api.seasoningTemplateDetail(baseline.id);
      const expectedOptionNames = collectTemplateOptionNames(templateDetail);
      const distribution = await seasoning.distributeTemplate(baseline.name, targetStore.poiId, targetStore.poiName);
      checks.distributionAccepted = distribution.status >= 200 && distribution.status < 300;
      if (checks.distributionAccepted) await waitForStoreRecord(distributionApi, baseline.name);
      const storeBody = await withObservedExecutableOperation(
        'brand-menu:GET /ops-poi/global-modifier/list',
        'GET',
        () => distributionApi.storeSeasoningList(),
      );
      const storeRecord = findRecordObjectWithName(storeBody, baseline.name);
      const actualOptionNames = collectTemplateOptionNames(storeRecord ?? storeBody);
      checks.storeReadback = Boolean(storeRecord);
      checks.templateOptionsMatch = expectedOptionNames.length > 0
        && expectedOptionNames.length === actualOptionNames.length
        && expectedOptionNames.every((name) => actualOptionNames.includes(name));
      if (!storeRecord) throw new Error(`下发后门店未回读模板身份：${baseline.name}`);
      context.registry.register({
        entity: '门店调味模板下发系统测试数据',
        identity: baseline.name,
        checkpoint: { entryId: `store-seasoning-${storeRecord.id}`, entityKind: 'seasoning', serverId: storeRecord.id, identityVariants: [baseline.name], cleanupOrder: 30 },
        execute: async () => {
          const existing = findNamedRecord(await distributionApi.storeSeasoningList(), baseline.name);
          if (existing) {
            await distributionApi.deleteStoreSeasoning(existing.id);
            context.operationReceipts.push({ operationKey: 'brand-menu:DELETE /ops-poi/global-modifier/{id}', observed: true, method: 'DELETE' });
          }
        },
        verify: async () => !findNamedRecord(await distributionApi.storeSeasoningList(), baseline.name),
      });
      await page.goto('/poi/location/seasoning', { waitUntil: 'domcontentloaded' });
      await waitForStorePageReady(page, baseline.name);
      const storeVisibleText = await page.locator('main:visible').innerText();
      checks.storeVisible = storeVisibleText.includes(baseline.name);
      await seasoning.ensureTemplateListOpen(baseline.name);
      return {
        checks,
        observations: { distribution: distribution.requestBody, expectedOptionNames, actualOptionNames, storeVisibleText },
        operations: ['brand-menu:POST /ops-brand/brand-modifier-sync/by-template', 'brand-menu:GET /ops-poi/global-modifier/list'],
      };
    }
    default:
      throw new Error(`调味模板 UI 变更适配器未注册：${context.recipe.caseId}`);
  }
}

async function runStaticContractCase(context: RuntimeContext): Promise<{
  checks: Record<string, boolean>;
  observations: Record<string, unknown>;
  operations: string[];
  productMismatch?: string;
}> {
  const { page, seasoning } = context;
  const checks: Record<string, boolean> = {};
  let observations: Record<string, unknown> = {};
  const operations: string[] = [];
  let productMismatch: string | undefined;
  const headers = async (): Promise<string[]> => [...new Set((await page.locator('th:visible,[role="columnheader"]:visible').allInnerTexts()).map((value) => value.trim()).filter(Boolean))];
  const body = async (): Promise<string> => page.locator('main:visible').innerText();

  switch (context.recipe.caseId) {
    case 'TC-FLV-SEA-001': {
      const text = await body();
      checks.emptyStateContractVisible = text.includes('我们按照行业类型，也提供了丰富的通用调味供您选择');
      observations = { text, currentListHasSeasoning: /\d+个调味/.test(text) };
      if (!checks.emptyStateContractVisible && !observations.currentListHasSeasoning) {
        productMismatch = '正式缺省页说明在当前空列表终态不可见。';
      }
      operations.push('brand-menu:GET /ops-brand/global-modifier/list');
      break;
    }
    case 'TC-FLV-SEA-010': {
      const before = findNamedRecord(await context.api.seasoningList(), 'Vegetable');
      const result = await seasoning.selectIndustrySeasoning('Vegetable', 'Caraway');
      const after = findNamedRecord(await context.api.seasoningList(), 'Vegetable');
      checks.industrySeasoningPageVisible = result.visibleText.includes('Vegetable') || result.visibleText.includes('Caraway');
      checks.selectionAccepted = result.status >= 200 && result.status < 300;
      checks.createdRecordReadback = Boolean(after);
      if (!before && after) {
        context.records.push(after);
        registerCleanup(context.api, context.registry, after.name, after.id);
      }
      observations = { before, after, result };
      operations.push('brand-menu:GET /ops-brand/global-modifier/platform-presets', 'brand-menu:POST /ops-brand/global-modifier/batch', 'brand-menu:GET /ops-brand/global-modifier/list');
      break;
    }
    case 'TC-FLV-SEA-013': {
      const record = requireSopRecord(context);
      await context.sopPage.open(seasoningSopCase('edit'), record);
      await context.sopPage.enterEdit(seasoningSopCase('edit'), record);
      const result = await seasoning.submitExistingGroupOptionWithoutName(
        record.originalIdentity,
        `AUTO_AUDIT_SECOND_LANGUAGE_${Date.now()}`,
      );
      checks.optionNameRejected = result.mutationCount === 0 && (result.invalidCount > 0 || result.errorTexts.length > 0);
      observations = result;
      operations.push('ui:click seasoning-create-confirm');
      await seasoning.ensureListOpen();
      break;
    }
    case 'TC-FLV-SEA-014': {
      await seasoning.openCreate();
      const identity = `AUTO_AUDIT_CHARS_${Date.now()}`;
      const option = page.locator('input[placeholder="如：Sweet"]:visible');
      const group = page.locator('input[aria-required="true"]:visible');
      await group.fill(`${identity}_中文ABC123-._`);
      await option.fill(`${identity}_Option中文123-._😀`);
      await settleInput();
      checks.groupFieldVisible = await group.isVisible();
      checks.optionFieldVisible = await option.isVisible();
      const createResponse = await seasoning.submitCreate();
      expect(createResponse.ok(), `含表情调味创建响应失败：${identity}`).toBe(true);
      const created = await waitForRecord(context.api, `${identity}_中文ABC123-._`);
      context.records.push(created);
      registerCleanup(context.api, context.registry, `${identity}_中文ABC123-._`, created.id);
      const detail = await context.api.seasoningDetail(created.id);
      const persistedNames = findAllStringValues(detail);
      checks.emojiRejected = !persistedNames.some((value) => value.includes('😀'));
      observations = { groupValue: `${identity}_中文ABC123-._`, optionSubmitted: `${identity}_Option中文123-._😀`, persistedNames };
      await seasoning.ensureListOpen();
      break;
    }
    case 'TC-FLV-SEA-022': {
      const record = requireSopRecord(context);
      const detailBeforeAttempt = await context.api.seasoningDetail(record.id);
      const serverOptionNamesBefore = findSeasoningOptionNames(detailBeforeAttempt);
      await context.sopPage.open(seasoningSopCase('edit'), record);
      await context.sopPage.enterEdit(seasoningSopCase('edit'), record);
      const rejectedOptionName = `AUTO_AUDIT_SEASONING_022_OPTION_51_${Date.now()}`;
      const result = await seasoning.addOptionAtLimit(record.originalIdentity, rejectedOptionName);
      const detailAfterAttempt = await context.api.seasoningDetail(record.id);
      const serverOptionNames = findSeasoningOptionNames(detailAfterAttempt);
      checks.limitInputPrepared = result.beforeRowCount === 50 && result.rowCountAfterAdd === 51;
      checks.limitFeedbackVisible = result.errorTexts.includes('BITEM-11072 : 一个调味组最大仅能添加50个调味');
      checks.rejectionEvidenceComplete = result.rejectionChannel === '前端提交校验'
        || (result.rejectionChannel === '服务端拒绝' && result.mutationStatus !== undefined);
      checks.serverOptionCountRetained = serverOptionNames.length === 50;
      checks.originalOptionSetRetained = sameStringSet(serverOptionNames, serverOptionNamesBefore);
      checks.submittedOptionNotPersisted = !serverOptionNames.includes(rejectedOptionName);
      context.changeReceipts.push({
        entityType: 'seasoning-group',
        entityId: record.id,
        changeType: 'persisted',
        beforeFingerprint: fingerprintReportValue([...serverOptionNamesBefore].sort()),
        afterFingerprint: fingerprintReportValue([...serverOptionNames].sort()),
        changedFields: sameStringSet(serverOptionNames, serverOptionNamesBefore) ? [] : ['seasoningOptionNames'],
        evidenceRef: 'brand-menu:GET /ops-brand/global-modifier/{id}',
      });
      observations = { groupName: record.originalIdentity, rejectedOptionName, ...result, serverOptionNamesBefore, serverOptionNames };
      if (result.beforeRowCount === 50 && (!checks.limitInputPrepared
        || !checks.limitFeedbackVisible
        || !checks.rejectionEvidenceComplete
        || !checks.serverOptionCountRetained
        || !checks.originalOptionSetRetained
        || !checks.submittedOptionNotPersisted)) {
        productMismatch = `正式来源要求调味组已有 50 个调味项时添加、填写并提交第 51 项，页面应展示错误码 BITEM-11072 和中文消息“一个调味组最大仅能添加50个调味”，且第 51 项不得持久化；当前添加前=${result.beforeRowCount} 行，添加后=${result.rowCountAfterAdd} 行，提交后=${result.rowCount} 行，拦截通道=${result.rejectionChannel}，请求状态=${result.mutationStatus ?? '无请求'}，服务端回读=${serverOptionNames.length} 项，页面反馈=${result.errorTexts.length > 0 ? result.errorTexts.join('；') : '无'}。`;
        context.pendingAssertionAttachments.push({
          name: '50项上限失败现场截图',
          contentType: 'image/png',
          body: await page.screenshot({ animations: 'disabled' }),
        });
      }
      operations.push('ui:click seasoning-option-add-at-limit', 'ui:fill seasoning-option-51', 'ui:click seasoning-edit-confirm', 'brand-menu:GET /ops-brand/global-modifier/{id}');
      await seasoning.ensureListOpen();
      break;
    }
    case 'TC-FLV-SEA-023': {
      const before = await context.api.seasoningList();
      const candidate = await selectUnusedIndustrySeasoningCandidate(before, seasoning, 2);
      const first = await seasoning.selectIndustrySeasoning(candidate.groupName, candidate.optionNames);
      const afterFirstList = await context.api.seasoningList();
      const created = findNamedRecord(afterFirstList, candidate.groupName);
      if (!created) throw new Error(`首次行业调味选择后未回读到调味组：${candidate.groupName}`);
      registerImportedSeasoningCleanup(context.api, context.registry, candidate.groupName, created.id);
      context.records.push({ ...created, optionName: candidate.optionNames[0], secondOptionName: candidate.optionNames[1], objectType: '品牌调味' });
      const afterFirstDetail = await context.api.seasoningDetail(created.id);
      const afterFirstOptionNames = findSeasoningOptionNames(afterFirstDetail);
      const repeatedOptionName = candidate.optionNames[0];
      const second = await seasoning.selectIndustrySeasoning(candidate.groupName, repeatedOptionName);
      const afterSecondList = await context.api.seasoningList();
      const afterSecondRecord = findNamedRecord(afterSecondList, candidate.groupName);
      if (!afterSecondRecord) throw new Error(`二次行业调味导入后未回读到调味组：${candidate.groupName}`);
      const afterSecondDetail = await context.api.seasoningDetail(afterSecondRecord.id);
      const afterSecondOptionNames = findSeasoningOptionNames(afterSecondDetail);
      const rawAfterSecondOptionNames = collectSeasoningOptionNames(afterSecondDetail);
      checks.firstSelectionAccepted = first.status >= 200 && first.status < 300;
      checks.secondSelectionAccepted = second.status >= 200 && second.status < 300;
      checks.initialOptionsPersisted = candidate.optionNames.every((name) => afterFirstOptionNames.includes(name));
      checks.finalSetMatchesUnion = sameStringSet(afterSecondOptionNames, afterFirstOptionNames);
      checks.repeatedOptionDeduplicated = rawAfterSecondOptionNames.filter((name) => name === repeatedOptionName).length === 1;
      checks.differentOptionRetained = afterSecondOptionNames.includes(candidate.optionNames[1]);
      const matchingGroups = findSeasoningGroupRecords(afterSecondList, candidate.groupName);
      checks.singleGroupRecordRetained = matchingGroups.length === 1
        && matchingGroups[0].id === created.id
        && afterSecondRecord.id === created.id;
      observations = {
        candidate,
        repeatedOptionName,
        first,
        second,
        created,
        afterSecondRecord,
        afterFirstOptionNames,
        afterSecondOptionNames,
        rawAfterSecondOptionNames,
        matchingGroups,
      };
      operations.push(
        'brand-menu:GET /ops-brand/global-modifier/platform-presets',
        'brand-menu:POST /ops-brand/global-modifier/batch',
        'brand-menu:GET /ops-brand/global-modifier/{id}',
        'brand-menu:GET /ops-brand/global-modifier/list',
      );
      break;
    }
    case 'TC-FLV-SEA-024':
    case 'TC-FLV-SEA-025':
    case 'TC-FLV-SEA-026': {
      const record = requireSopRecord(context);
      await seasoning.openCreate();
      const baselineSecondName = '调味审计';
      const duplicateGroupName = context.recipe.caseId === 'TC-FLV-SEA-025' ? baselineSecondName : record.originalIdentity;
      const duplicateSecondName = context.recipe.caseId === 'TC-FLV-SEA-024' ? baselineSecondName : `${record.originalIdentity}_SECOND_UNIQUE`;
      const duplicateOperation = startExecutableOperation({
        executionId: test.info().testId,
        operationKey: 'brand-menu:POST /ops-brand/global-modifier',
        title: '提交重复品牌调味并读取服务端校验结果',
        method: 'POST',
      });
      let result;
      try {
        result = await seasoning.trySubmitDuplicateSeasoning(
          duplicateGroupName,
          `${record.originalIdentity}_DUPLICATE_OPTION`,
          duplicateSecondName,
        );
        finishExecutableOperation(duplicateOperation, 'passed', { details: result });
      } catch (error) {
        finishExecutableOperation(duplicateOperation, 'failed');
        throw error;
      }
      checks.feedbackVisible = result.errorTexts.length > 0 || (result.status !== undefined && result.status >= 400);
      checks.duplicateRejected = result.status === undefined || result.status >= 400;
      checks.noDuplicateMutation = result.mutationCount === 0 || result.status === undefined || result.status >= 400;
      observations = { baseline: record.originalIdentity, duplicateGroupName, duplicateSecondName, ...result };
      operations.push('brand-menu:GET /ops-brand/global-modifier/{id}', 'brand-menu:POST /ops-brand/global-modifier/batch');
      await seasoning.ensureListOpen();
      break;
    }
    case 'TC-FLV-SEA-027': {
      const record = requireSopRecord(context);
      const detail = await context.api.seasoningDetail(record.id);
      const optionName = findFirstSeasoningOptionName(detail);
      if (!optionName) throw new Error(`同组重复调味项缺少服务端基线：${record.originalIdentity}`);
      await context.sopPage.open(seasoningSopCase('edit'), record);
      await context.sopPage.enterEdit(seasoningSopCase('edit'), record);
      const duplicateOperation = startExecutableOperation({
        executionId: test.info().testId,
        operationKey: 'brand-menu:PUT /ops-brand/global-modifier/{id}',
        title: '提交同组重复调味项并读取服务端校验结果',
        method: 'PUT',
      });
      let result;
      try {
        result = await seasoning.tryAddDuplicateOption(record.originalIdentity, optionName);
        finishExecutableOperation(duplicateOperation, 'passed', { details: result });
      } catch (error) {
        finishExecutableOperation(duplicateOperation, 'failed');
        throw error;
      }
      checks.feedbackVisible = result.errorTexts.length > 0 || (result.status !== undefined && result.status >= 400);
      checks.duplicateRejected = result.status === undefined || result.status >= 400;
      checks.noDuplicateMutation = result.mutationCount === 0 || result.status === undefined || result.status >= 400;
      observations = { groupName: record.originalIdentity, optionName, ...result };
      operations.push('brand-menu:GET /ops-brand/global-modifier/{id}', 'brand-menu:PUT /ops-brand/global-modifier/{id}');
      await seasoning.ensureListOpen();
      break;
    }
    case 'TC-FLV-SEA-034': {
      await seasoning.openCreate();
      const identity = `AUTO_AUDIT_CANCEL_${Date.now()}`;
      await seasoning.fill(identity, `${identity}_OPTION`, '0');
      const result = await seasoning.cancelCreate();
      const persisted = findNamedRecord(await context.api.seasoningList(), identity);
      checks.noMutation = result.mutationCount === 0 && !persisted;
      checks.cancelReturned = result.route === '/pp/brand/seasoning/list';
      observations = { identity, ...result, persisted: Boolean(persisted) };
      await seasoning.ensureListOpen();
      break;
    }
    case 'TC-FLV-SEA-028':
    {
      const record = requireSopRecord(context);
      const detail = await context.api.seasoningDetail(record.id);
      const optionName = findFirstSeasoningOptionName(detail);
      if (!optionName) throw new Error(`删除调味项缺少服务端基线：${record.originalIdentity}`);
      await context.sopPage.open(seasoningSopCase('edit'), record);
      await context.sopPage.enterEdit(seasoningSopCase('edit'), record);
      const result = await seasoning.deleteOption(optionName);
      const after = await context.api.seasoningDetail(record.id);
      checks.deleteAccepted = result.status >= 200 && result.status < 300;
      checks.optionAbsent = findFirstSeasoningOptionName(after) !== optionName;
      observations = { groupName: record.originalIdentity, optionName, ...result, after };
      operations.push('brand-menu:GET /ops-brand/global-modifier/{id}', 'brand-menu:PUT /ops-brand/global-modifier/{id}');
      await seasoning.ensureListOpen();
      break;
    }
    case 'TC-FLV-SEA-033': {
      const record = requireSopRecord(context);
      const detail = await context.api.seasoningDetail(record.id);
      const optionName = findFirstSeasoningOptionName(detail);
      if (!optionName) throw new Error(`编辑调味项缺少服务端基线：${record.originalIdentity}`);
      const updatedOptionName = `${optionName}_EDIT`;
      await context.sopPage.open(seasoningSopCase('edit'), record);
      await context.sopPage.enterEdit(seasoningSopCase('edit'), record);
      const result = await seasoning.editOption(optionName, updatedOptionName);
      const after = await context.api.seasoningDetail(record.id);
      checks.saveAccepted = result.status >= 200 && result.status < 300;
      checks.updatedReadback = findAllStringValues(after).includes(updatedOptionName);
      observations = { groupName: record.originalIdentity, optionName, updatedOptionName, ...result, before: detail, after };
      operations.push('brand-menu:GET /ops-brand/global-modifier/{id}', 'brand-menu:PUT /ops-brand/global-modifier/{id}');
      await seasoning.ensureListOpen();
      break;
    }
    case 'TC-FLV-SEA-035': {
      const record = requireSopRecord(context);
      await context.sopPage.open(seasoningSopCase('edit'), record);
      await context.sopPage.enterEdit(seasoningSopCase('edit'), record);
      const result = await seasoning.cancelEditAfterChangingGroup(record.originalIdentity, `${record.originalIdentity}_CANCELLED`);
      const after = await context.api.seasoningDetail(record.id);
      checks.cancelReturned = result.route === '/pp/brand/seasoning/list';
      checks.originalValueCaptured = result.originalName === record.originalIdentity;
      checks.transientValueEntered = result.transientValueConfirmed;
      checks.noMutation = result.mutationCount === 0;
      checks.originalRetained = findAllStringValues(after).includes(record.originalIdentity);
      checks.transientAbsent = !findAllStringValues(after).includes(`${record.originalIdentity}_CANCELLED`);
      observations = { groupName: record.originalIdentity, ...result, after };
      operations.push('brand-menu:GET /ops-brand/global-modifier/{id}', 'ui:click seasoning-edit-cancel');
      break;
    }
    case 'TC-FLV-SEA-036': {
      const record = requireSopRecord(context);
      const before = await context.api.seasoningDetail(record.id);
      await context.sopPage.open(seasoningSopCase('delete'), record);
      const result = await context.sopPage.cancelDeleteIdentity(seasoningSopCase('delete'), record);
      const after = await context.api.seasoningDetail(record.id);
      checks.confirmationVisible = /删除/.test(result.confirmText);
      checks.cancelReturned = result.route === '/pp/brand/seasoning/list';
      checks.recordRetained = findAllStringValues(after).includes(record.originalIdentity);
      observations = { groupName: record.originalIdentity, ...result, before, after };
      operations.push('brand-menu:GET /ops-brand/global-modifier/{id}', 'ui:click seasoning-delete-cancel');
      break;
    }
    case 'TC-FLV-SEA-037': {
      const source = context.records[0];
      const target = context.records[1];
      if (!source?.optionName || !target) throw new Error('批量变更缺少源组或目标组身份');
      const sourceBefore = await context.api.seasoningDetail(source.id);
      const movedOptionId = findOptionId(sourceBefore, source.optionName);
      if (!movedOptionId) throw new Error(`批量变更缺少源调味项服务端 ID：${source.optionName}`);
      await seasoning.revealBrandSeasoningGroup(source.name);
      const result = await seasoning.batchMoveOption(source.name, source.optionName, target.name);
      const sourceAfter = await context.api.seasoningDetail(source.id);
      const targetAfter = await context.api.seasoningDetail(target.id);
      const sourceOptionNames = findSeasoningOptionNames(sourceAfter);
      const targetOptionNames = findSeasoningOptionNames(targetAfter);
      const requestBody = result.requestBody as { optionIds?: unknown };
      checks.batchMoveAccepted = result.status >= 200 && result.status < 300;
      checks.requestContainsMovedOption = Array.isArray(requestBody.optionIds)
        && requestBody.optionIds.map(Number).includes(movedOptionId);
      checks.sourceNoLongerOwnsOption = !sourceOptionNames.includes(source.optionName);
      checks.targetOwnsOption = targetOptionNames.includes(source.optionName);
      observations = {
        source,
        target,
        movedOptionId,
        movedOptionName: source.optionName,
        ...result,
        sourceBefore,
        sourceAfter,
        targetAfter,
        sourceOptionNames,
        targetOptionNames,
      };
      operations.push(
        'brand-menu:GET /ops-brand/global-modifier/list',
        'brand-menu:POST /ops-brand/global-modifier/options/batch-move',
        'brand-menu:GET /ops-brand/global-modifier/{id}',
      );
      break;
    }
    case 'TC-FLV-SEA-040': {
      const source = context.records[0];
      if (!source?.optionName || !source.secondOptionName) throw new Error('调味项排序缺少同组两个调味项身份');
      const sopRecord = requireSopRecord(context);
      await context.sopPage.open(seasoningSopCase('edit'), sopRecord);
      await context.sopPage.enterEdit(seasoningSopCase('edit'), sopRecord);
      const result = await seasoning.sortOptions(source.optionName, source.secondOptionName);
      const after = await context.api.seasoningDetail(source.id);
      const persistedNames = findSeasoningOptionNames(after);
      checks.sortAccepted = result.status >= 200 && result.status < 300;
      checks.uiOrderChanged = !sameStringSequence(result.before, result.after);
      checks.apiOrderPersisted = sameStringSequence(result.after, persistedNames);
      observations = { source, ...result, persistedNames };
      operations.push('brand-menu:PUT /ops-brand/global-modifier/{id}', 'brand-menu:GET /ops-brand/global-modifier/{id}');
      await seasoning.ensureListOpen();
      break;
    }
    case 'TC-FLV-SEA-041': {
      const source = context.records[0];
      const target = context.records[1];
      if (!source || !target) throw new Error('调味组排序缺少两个唯一调味组身份');
      await seasoning.searchBrandSeasoning(sharedIdentityPrefix(source.name, target.name));
      const result = await seasoning.sortGroups(source.name, target.name);
      const persisted = await context.api.seasoningList();
      const persistedNames = findNamedRecordsByPrefix(
        persisted,
        sharedIdentityPrefix(source.name, target.name),
      ).filter((record) => record.id === source.id || record.id === target.id)
        .map((record) => record.name);
      checks.sortAccepted = result.status >= 200 && result.status < 300;
      checks.uiOrderChanged = !sameStringSequence(result.before, result.after);
      checks.dialogClosed = result.dialogClosed;
      checks.apiOrderPersisted = sameStringSequence(result.after, persistedNames);
      observations = { source, target, ...result, persistedNames };
      operations.push('brand-menu:PUT /ops-brand/global-modifier/sort', 'brand-menu:GET /ops-brand/global-modifier/list');
      break;
    }
    case 'TC-FLV-SEA-002': {
      const response = page.waitForResponse((candidate) => candidate.ok()
        && new URL(candidate.url()).pathname.endsWith('/ops-brand/global-modifier/platform-presets'));
      await page.goto('/pp/brand/seasoning/create-select', { waitUntil: 'domcontentloaded' });
      await response;
      const text = await body();
      const tableHeaders = await headers();
      checks.groupAndOptionLayout = /个调味/.test(text) && tableHeaders.includes('调味名称') && tableHeaders.includes('第二名称');
      checks.groupIdentityVisible = /Request|Meat|Vegetable|Sauce/.test(text);
      observations.text = text;
      operations.push('brand-menu:GET /ops-brand/global-modifier/platform-presets');
      await seasoning.ensureListOpen();
      break;
    }
    case 'TC-FLV-SEA-003': {
      const text = await body();
      checks.groupNameVisible = /个调味/.test(text);
      checks.secondLanguageVisible = /需求|肉类|手工调味/.test(text);
      checks.optionCountVisible = /\d+个调味/.test(text);
      observations.text = text;
      operations.push('brand-menu:GET /ops-brand/global-modifier/list');
      break;
    }
    case 'TC-FLV-SEA-004': {
      const tableHeaders = await headers();
      const text = await body();
      checks.columns = ['调味名称', '第二名称', '价格($)', '应用门店', '操作'].every((item) => tableHeaders.includes(item));
      checks.priceVisible = /\$\d/.test(text);
      checks.storeCountVisible = /应用门店/.test(tableHeaders.join('|')) && /\b\d+\b/.test(text);
      observations.headers = tableHeaders;
      operations.push('brand-menu:GET /ops-brand/global-modifier/list');
      break;
    }
    case 'TC-FLV-SEA-005': {
      await seasoning.openCreate();
      const baseText = await body();
      const baseHeaders = await headers();
      const advanced = page.getByText('高级', { exact: true });
      await advanced.click();
      const advancedHeaders = await headers();
      checks.groupFields = ['调味组名称', '第二名称', 'POS名称'].every((item) => baseText.includes(item));
      checks.optionFields = ['调味名称', '调味名称（第二语言）', '默认价格', 'POS颜色', '操作'].every((item) => baseHeaders.includes(item));
      checks.advancedFields = ['POS名称', '送厨名称'].every((item) => advancedHeaders.includes(item));
      observations.headers = { baseHeaders, advancedHeaders };
      await seasoning.ensureListOpen();
      break;
    }
    case 'TC-FLV-SEA-006': {
      const candidate = await findUniqueVisibleSeasoningOptionName(page, await context.api.seasoningList());
      if (!candidate) throw new Error('调味列表没有页面唯一可见的真实调味项，无法建立稳定批量选择身份');
      const result = await seasoning.selectBatchGroupContainingOption(candidate);
      checks.initiallyDisabled = result.initiallyDisabled;
      checks.enabledAfterSelection = result.enabledAfterSelection;
      observations = { candidate, ...result };
      operations.push('brand-menu:GET /ops-brand/global-modifier/list');
      break;
    }
    case 'TC-FLV-SEA-007': {
      const input = page.getByPlaceholder('调味名称');
      const candidate = context.records.find((record) => record.objectType === '品牌调味')?.name;
      if (!candidate) throw new Error('调味查询用例缺少本次创建的唯一调味组');
      await fillAndWaitForResponse(page, input, candidate.slice(0, Math.max(1, candidate.length - 1)), '/ops-brand/global-modifier/list', 'GET', 'optionName');
      await expect(page.getByText(candidate, { exact: true })).toBeVisible();
      const fuzzyText = await body();
      await fillAndWaitForResponse(page, input, candidate, '/ops-brand/global-modifier/list', 'GET', 'optionName');
      await expect(page.getByText(candidate, { exact: true })).toBeVisible();
      const exactText = await body();
      checks.fuzzy = fuzzyText.includes(candidate);
      checks.exact = exactText.includes(candidate);
      observations.candidate = candidate;
      operations.push('brand-menu:GET /ops-brand/global-modifier/list');
      break;
    }
    case 'TC-FLV-SEA-008': {
      const input = page.getByPlaceholder('调味名称');
      const restoredIdentity = await findUniqueVisibleSeasoningOptionName(page, await context.api.seasoningList());
      if (!restoredIdentity) throw new Error('调味列表没有可用于重置恢复断言的页面唯一真实调味项');
      await fillAndWaitForResponse(page, input, 'AUTO_AUDIT_NO_MATCH', '/ops-brand/global-modifier/list', 'GET', 'optionName');
      const filteredContainsIdentity = (await body()).includes(restoredIdentity);
      await fillAndWaitForResponse(page, input, '', '/ops-brand/global-modifier/list', 'GET', 'optionName');
      await expect(page.getByText(restoredIdentity, { exact: true })).toBeVisible();
      checks.inputCleared = await input.inputValue() === '';
      checks.fullListRestored = !filteredContainsIdentity
        && await page.getByText(restoredIdentity, { exact: true }).count() === 1;
      observations = { restoredIdentity, filteredContainsIdentity };
      operations.push('brand-menu:GET /ops-brand/global-modifier/list');
      break;
    }
    case 'TC-FLV-SEA-011': {
      await seasoning.openCreate();
      const mutation = countRequests(page, 'POST', /\/ops-brand\/global-modifier(?:\/batch)?$/);
      await page.getByRole('button', { name: /^(?:确\s*定|Confirm)$/i }).click();
      const errors = await page.locator('.ant-form-item-explain-error:visible').allInnerTexts();
      const invalidCount = await page.locator('.ant-form-item-has-error:visible,input[aria-invalid="true"]:visible').count();
      checks.requiredHighlighted = errors.some((text) => /必填|填写/.test(text)) || invalidCount > 0;
      checks.noMutation = mutation.read() === 0;
      observations = { errors, invalidCount };
      mutation.dispose();
      await seasoning.ensureListOpen();
      break;
    }
    case 'TC-FLV-SEA-012': {
      await seasoning.openCreate();
      const result = await seasoning.submitCreateWithoutGroupName(
        'AUTO_AUDIT_SECOND_LANGUAGE',
        'AUTO_AUDIT_POS_NAME',
      );
      checks.groupNameRequired = result.errorTexts.some((text) => /调味组名称必填/.test(text))
        || result.groupFieldErrorTexts.some((text) => /调味组名称必填/.test(text));
      checks.optionNameNotRequired = !result.errorTexts.some((text) => /调味名称必填/.test(text));
      checks.noMutation = result.mutationCount === 0;
      observations = result;
      if (!checks.groupNameRequired) {
        productMismatch = result.confirmDisabledBefore
          ? '组名为空时确定按钮在点击前已禁用，且未展示“调味组名称必填”字段错误。'
          : '组名为空提交未展示“调味组名称必填”字段错误。';
      }
      await seasoning.ensureListOpen();
      break;
    }
    case 'TC-FLV-SEA-017': {
      await seasoning.openCreate();
      const identity = `AUTO_AUDIT_PRICE_MAX_${Date.now()}`;
      const optionName = `${identity}_OPTION`;
      await seasoning.fill(identity, optionName, '1000000');
      await page.getByRole('spinbutton').press('Tab');
      const correctedInputValue = await page.getByRole('spinbutton').inputValue();
      const mutation = countRequests(page, 'POST', /\/ops-brand\/global-modifier(?:\/batch)?$/);
      const responsePromise = page.waitForResponse((response) => response.request().method() === 'POST'
        && /\/ops-brand\/global-modifier(?:\/batch)?$/.test(new URL(response.url()).pathname), { timeout: 15_000 }).catch(() => null);
      const confirm = page.getByRole('button', { name: /^(?:确\s*定|Confirm)$/i });
      if (await confirm.isEnabled()) await confirm.click();
      const response = await responsePromise;
      const errors = await seasoning.readFeedbackTexts();
      const record = findNamedRecord(await context.api.seasoningList(), identity);
      const persistedDetail = record ? await context.api.seasoningDetail(record.id) : null;
      if (record) {
        context.records.push({ ...record, optionName, expectedPrice: 999999.99 });
        registerCleanup(context.api, context.registry, identity, record.id);
        context.changeReceipts.push({
          entityType: 'seasoning-group',
          entityId: record.id,
          changeType: 'persisted',
          beforeFingerprint: fingerprintReportValue({ exists: false, identity }),
          afterFingerprint: fingerprintReportValue(persistedDetail),
          changedFields: ['identity', 'price'],
          evidenceRef: 'brand-menu:GET /ops-brand/global-modifier/{id}',
        });
      }
      const mutationCount = mutation.read();
      checks.overLimitCorrected = correctedInputValue === '999999.99';
      checks.maxValuePersisted = Boolean(record)
        && readOptionPrice(persistedDetail, optionName) === 999999.99;
      checks.noLimitError = !errors.some((text) => /上限|超出/.test(text));
      checks.editInvalidReverted = false;
      observations = {
        inputValue: correctedInputValue, errors, mutationCount,
        responseStatus: response?.status() ?? null, persisted: Boolean(record), serverId: record?.id ?? null,
      };
      if (mutationCount > 0) operations.push('brand-menu:POST /ops-brand/global-modifier');
      mutation.dispose();
      if (context.sopRecord) {
        await context.sopPage.open(seasoningSopCase('edit'), context.sopRecord);
        await context.sopPage.enterEdit(seasoningSopCase('edit'), context.sopRecord);
        const editResults = await seasoning.attemptInvalidEditPrices();
        checks.editInvalidReverted = editResults.results.every((item) => item.value === editResults.originalValue
          && item.confirmDisabled && item.mutationCount === 0);
        observations = { ...observations, editResults };
      }
      await seasoning.ensureListOpen();
      break;
    }
    case 'TC-FLV-SEA-043': {
      checks.noDirectDistribution = await page.getByRole('button', { name: /^下发$/ }).count() === 0;
      checks.multiStoreTemplateVisible = await page.getByRole('link', { name: '调味模版', exact: true }).count() === 1;
      operations.push('brand-menu:GET /ops-brand/global-modifier/list');
      break;
    }
    case 'TC-FLV-REC-001': {
      const tableHeaders = await headers();
      checks.currentColumns = ['任务名称', '门店', '状态', '下发时间'].every((item) => tableHeaders.includes(item));
      checks.rowsVisible = await page.locator('tbody tr.ant-table-row').count() > 0;
      observations.headers = tableHeaders;
      operations.push('brand-menu:POST /ops-brand/brand-modifier-sync/job/list');
      break;
    }
    case 'TC-FLV-REC-003': {
      const contract = await seasoning.readRecordFilterContract();
      const result = await seasoning.searchRecordByCombinedFilters();
      checks.storeFilterVisible = contract.storeVisible;
      checks.statusFilterVisible = contract.statusVisible;
      checks.taskFilterVisible = contract.taskVisible;
      checks.resetVisible = contract.resetVisible;
      checks.rowsReturned = result.resultRows.length > 0;
      checks.taskFilterApplied = result.resultRows.every((row) => row.includes(result.taskName));
      checks.storeFilterApplied = result.resultRows.every((row) => row.includes(result.store));
      checks.statusFilterApplied = result.resultRows.every((row) => row.includes(result.status));
      observations = { contract, ...result };
      operations.push('brand-menu:POST /ops-brand/brand-modifier-sync/job/list');
      break;
    }
    case 'TC-FLV-REC-004': {
      const result = await seasoning.searchRecordByCombinedFilters();
      checks.combinedQueryVisible = result.resultRows.length > 0;
      checks.taskMatched = result.resultRows.every((row) => row.includes(result.taskName));
      checks.storeMatched = result.resultRows.every((row) => row.includes(result.store));
      checks.statusMatched = result.resultRows.every((row) => row.includes(result.status));
      observations = result;
      operations.push('brand-menu:POST /ops-brand/brand-modifier-sync/job/list');
      break;
    }
    case 'TC-FLV-REC-006': {
      const result = await seasoning.openRecordStoreDetail();
      checks.storeCountActionVisible = /\b\d+\b/.test(result.rowText);
      checks.detailOpened = result.dialogText.length > 0;
      checks.storeFieldsVisible = result.headers.includes('门店名称')
        && result.headers.some((header) => /商户ID|门店编码/.test(header))
        && /门店名称/.test(result.dialogText);
      observations = result;
      await page.keyboard.press('Escape');
      operations.push('brand-menu:POST /ops-brand/brand-modifier-sync/job/list');
      break;
    }
    case 'TC-FLV-REC-007': {
      const taskNames = await seasoning.readVisibleRecordTaskNames();
      checks.rowsVisible = taskNames.length > 0;
      checks.namingPattern = taskNames.every((name) => /^.+\d{11}$/.test(name));
      observations = { taskNames };
      if (checks.rowsVisible && !checks.namingPattern) {
        productMismatch = '正式规则要求任务名称以模板名称为前缀并以 11 位数字结尾；当前可见任务名称存在不符合该模式的记录。';
      }
      operations.push('brand-menu:POST /ops-brand/brand-modifier-sync/job/list');
      break;
    }
    case 'TC-FLV-TPL-001': {
      const text = await body();
      const templateRecords = findNamedRecordsByPrefix(await context.api.seasoningTemplatePage(), '');
      const visibleTemplate = templateRecords.find((record) => text.includes(record.name));
      checks.templateNameVisible = Boolean(visibleTemplate);
      checks.seasoningCountVisible = /调味:\s*\d+/.test(text);
      checks.templateTotalVisible = /共\s*\d+\s*个调味模板/.test(text);
      observations = { text, visibleTemplate: visibleTemplate?.name ?? null, templateRecords };
      if (!checks.templateNameVisible) productMismatch = '模板列表未能用服务端模板身份与页面可见模板名称建立逐条对应。';
      operations.push('brand-menu:GET /ops-brand/modifier-template/page');
      break;
    }
    case 'TC-FLV-TPL-003':
    case 'TC-FLV-TPL-004': {
      const response = page.waitForResponse((candidate) => candidate.ok()
        && new URL(candidate.url()).pathname.endsWith('/ops-brand/global-modifier/list'));
      await page.locator('button:visible').filter({ hasText: /^选择调味$/ }).click();
      await response;
      const dialog = page.getByRole('dialog');
      const text = await dialog.innerText();
      const option = dialog.locator('input[type="checkbox"]:visible:not([aria-label="Select all"])').first();
      await option.check();
      const selectedText = await dialog.innerText();
      checks.groupAndOptions = /个调味|items/.test(selectedText) && /调味名称/.test(selectedText);
      checks.selectedCount = /已选的调味：\s*1/.test(selectedText);
      checks.selectedIdentity = selectedText.length > text.length || /已选的调味/.test(selectedText);
      observations.dialogText = selectedText;
      operations.push('brand-menu:GET /ops-brand/global-modifier/list');
      await page.getByRole('dialog').getByRole('button', { name: /close/i }).click().catch(() => page.keyboard.press('Escape'));
      break;
    }
    case 'TC-FLV-TPL-007': {
      const input = page.getByPlaceholder('调味模版名称');
      await fillAndWaitForResponse(page, input, 'NR', '/ops-brand/modifier-template/page');
      const fuzzy = await body();
      await fillAndWaitForResponse(page, input, 'NRA', '/ops-brand/modifier-template/page');
      const exact = await body();
      checks.fuzzy = fuzzy.includes('NRA');
      checks.exact = exact.includes('NRA');
      observations = { fuzzy, exact };
      operations.push('brand-menu:GET /ops-brand/modifier-template/page');
      break;
    }
    case 'TC-FLV-TPL-008': {
      await seasoning.openTemplateDistribution();
      const dialog = page.getByRole('dialog');
      const input = dialog.getByPlaceholder('门店名称/编码');
      await fillAndWaitForResponse(page, input, '23918', '/ops-brand/merchants/page', 'POST');
      const merchantIdText = await dialog.innerText();
      await fillAndWaitForResponse(page, input, 'Ces', '/ops-brand/merchants/page', 'POST');
      const merchantNameText = await dialog.innerText();
      checks.byCode = merchantIdText.includes('M000023918');
      checks.byName = merchantNameText.includes('Ces test');
      observations = { merchantIdText, merchantNameText };
      operations.push('brand-menu:POST /ops-brand/merchants/page');
      await page.keyboard.press('Escape');
      break;
    }
    case 'TC-FLV-TPL-009': {
      const input = page.getByPlaceholder('调味模版名称');
      const initial = await body();
      await fillAndWaitForResponse(page, input, 'AUTO_AUDIT_NO_MATCH', '/ops-brand/modifier-template/page');
      const filtered = await body();
      await fillAndWaitForResponse(page, input, '', '/ops-brand/modifier-template/page');
      const reset = await body();
      checks.inputCleared = await input.inputValue() === '';
      checks.initialListRestored = reset === initial || (reset.length > filtered.length && /调味:\s*\d+/.test(reset));
      observations = { initial, filtered, reset };
      operations.push('brand-menu:GET /ops-brand/modifier-template/page');
      break;
    }
    case 'TC-FLV-TPL-010': {
      const result = await seasoning.submitEmptyTemplate();
      checks.requiredHighlighted = result.invalidText.includes('调味模版名称必填');
      checks.noMutation = result.mutationCount === 0;
      observations.validation = result;
      break;
    }
    case 'TC-FLV-TPL-011': {
      const identity = `AUTO_AUDIT_TPL_011_${Date.now()}_中文ABC123-._`;
      const submittedName = `${identity}😀`;
      const result = await seasoning.saveTemplateAndReadListName(submittedName, identity, { selectSeasoning: true });
      const created = findNamedRecord(await withObservedExecutableOperation(
        'brand-menu:GET /ops-brand/modifier-template/page',
        'GET',
        () => context.api.seasoningTemplatePage(identity),
      ), identity);
      checks.saveSucceeded = result.status >= 200 && result.status < 300 && Boolean(created);
      checks.emojiRemovedAfterSave = !result.visibleName.includes('😀');
      checks.supportedCharactersPreserved = result.visibleName === identity;
      observations = {
        submittedName,
        visibleName: result.visibleName,
        responseStatus: result.status,
        requestBody: result.requestBody,
        templateId: created?.id ?? null,
      };
      if (created) {
        context.records.push({ ...created, objectType: '调味模板' });
        registerTemplateCleanup(context.api, context.registry, identity, created.id);
      }
      operations.push('brand-menu:POST /ops-brand/modifier-template');
      operations.push('brand-menu:GET /ops-brand/modifier-template/page');
      break;
    }
    case 'TC-FLV-TPL-014': {
      const identity = `AUTO_AUDIT_TPL_014_${Date.now()}`;
      const result = await seasoning.submitTemplateWithoutSeasoning(identity);
      const persisted = findNamedRecord(await context.api.seasoningTemplatePage(identity), identity);
      checks.exactFeedback = result.errorText === '调味模版至少需要一个调味组';
      checks.noMutation = result.mutationCount === 0;
      checks.staysOnCreateRoute = result.route === '/pp/brand/seasoning/addtemplate';
      checks.notPersisted = !persisted;
      observations = { identity, ...result, persisted: Boolean(persisted) };
      operations.push('ui:click seasoning-template-save');
      break;
    }
    case 'TC-FLV-TPL-012':
    case 'TC-FLV-TPL-013':
    case 'TC-FLV-TPL-025': {
      const identity = `AUTO_AUDIT_TPL_${context.recipe.caseId.slice(-3)}_${Date.now()}`;
      const fields = context.recipe.caseId === 'TC-FLV-TPL-013'
        ? { secondLanguage: `${identity}_SECOND`, description: `${identity}_DESCRIPTION`, selectSeasoning: true }
        : context.recipe.caseId === 'TC-FLV-TPL-025'
          ? { description: 'A'.repeat(250), selectSeasoning: true }
          : { selectSeasoning: true };
      const response = await seasoning.saveTemplate(identity, fields);
      const created = findNamedRecord(await context.api.seasoningTemplatePage(identity), identity);
      checks.saveSucceeded = response.status >= 200 && response.status < 300 && Boolean(created);
      if (context.recipe.caseId === 'TC-FLV-TPL-025') {
        const body = response.requestBody as Record<string, unknown> | null;
        checks.descriptionBoundary = typeof body?.description === 'string' && body.description.length === 250;
      } else {
        checks.descriptionBoundary = true;
      }
      observations = { responseStatus: response.status, requestBody: response.requestBody, templateId: created?.id ?? null };
      if (created) {
        context.records.push({ ...created, objectType: '调味模板' });
        registerTemplateCleanup(context.api, context.registry, identity, created.id);
      }
      operations.push('brand-menu:POST /ops-brand/modifier-template');
      await seasoning.ensureTemplateListOpen();
      break;
    }
    case 'TC-FLV-TPL-015':
    case 'TC-FLV-TPL-016': {
      const baseline = context.templateSeed;
      if (!baseline) throw new Error('重复模板用例缺少服务端基线模板');
      await seasoning.ensureTemplateListOpen();
      await seasoning.openTemplateCreate();
      const result = await seasoning.trySaveDuplicateTemplate(baseline.name);
      checks.duplicateRejected = /重复|已存在|唯一/.test(result.errorText) || result.mutationCount === 0;
      checks.feedbackVisible = result.errorText.length > 0;
      observations = { baseline: baseline.name, ...result };
      operations.push('brand-menu:POST /ops-brand/modifier-template');
      await seasoning.ensureTemplateListOpen();
      break;
    }
    case 'TC-FLV-TPL-017': {
      const baseline = context.templateSeed;
      if (!baseline) throw new Error('模板编辑用例缺少服务端基线模板');
      await seasoning.ensureTemplateListOpen(baseline.name);
      const updatedDescription = `${baseline.name}_EDITED_DESCRIPTION`;
      const result = await seasoning.editTemplate(baseline.name, updatedDescription);
      const detail = await context.api.seasoningTemplateDetail(baseline.id);
      const detailText = JSON.stringify(detail);
      checks.saved = result.status >= 200 && result.status < 300;
      checks.inputUpdated = result.visibleDescription === updatedDescription;
      checks.updatedVisible = detailText.includes(updatedDescription)
        && JSON.stringify(result.requestBody).includes(updatedDescription);
      observations = { ...result, detailText };
      operations.push('brand-menu:PUT /ops-brand/modifier-template/{id}');
      await seasoning.ensureTemplateListOpen();
      break;
    }
    case 'TC-FLV-TPL-018':
    case 'TC-FLV-TPL-019': {
      const baseline = context.templateSeed;
      if (!baseline) throw new Error('模板内调味用例缺少服务端基线模板');
      await seasoning.ensureTemplateListOpen(baseline.name);
      const before = await context.api.seasoningTemplateDetail(baseline.id);
      const beforeText = JSON.stringify(before);
      checks.templateHasSeasoning = /modifierGroups|modifierOptionId/.test(beforeText);
      const mode = context.recipe.caseId === 'TC-FLV-TPL-018' ? 'add' : 'remove';
      const targetOptionName = mode === 'add' ? baseline.additionOptionName : baseline.optionName;
      if (!targetOptionName) throw new Error('模板新增调味用例缺少未选中的目标调味项');
      const result = await seasoning.editTemplateSeasoning(baseline.name, targetOptionName, mode);
      const after = await context.api.seasoningTemplateDetail(baseline.id);
      const afterText = JSON.stringify(after);
      const optionCount = countTemplateOptions(after);
      const afterOptionNames = collectTemplateOptionNames(after);
      checks.templateVisible = result.templateVisible;
      checks.lifecycleObserved = result.status >= 200 && result.status < 300
        && (mode === 'add' ? afterOptionNames.includes(targetOptionName) : !afterOptionNames.includes(targetOptionName));
      observations = { mode, beforeText, afterText, selectedCount: result.selectedCount, optionCount, afterOptionNames };
      operations.push('brand-menu:PUT /ops-brand/modifier-template/{id}');
      await seasoning.ensureTemplateListOpen();
      break;
    }
    case 'TC-FLV-TPL-020':
    case 'TC-FLV-TPL-021': {
      const baseline = context.templateSeed;
      if (!baseline) throw new Error('模板删除用例缺少服务端基线模板');
      await seasoning.ensureTemplateListOpen(baseline.name);
      const before = await context.api.seasoningTemplateDetail(baseline.id);
      const result = await seasoning.deleteTemplate(baseline.name);
      const retained = findNamedRecord(await context.api.seasoningTemplatePage(baseline.name), baseline.name);
      checks.confirmationVisible = /删除|模板/.test(result.confirmText);
      checks.deleteAccepted = result.status >= 200 && result.status < 300;
      checks.deleted = !retained;
      observations = { before, retained: Boolean(retained), ...result };
      operations.push('brand-menu:DELETE /ops-brand/modifier-template/{id}');
      break;
    }
    case 'TC-FLV-TPL-022':
    case 'TC-FLV-TPL-023':
    case 'TC-FLV-TPL-024': {
      const baseline = context.templateSeed;
      if (!baseline) throw new Error('模板下发用例缺少服务端基线模板');
      await seasoning.ensureTemplateListOpen(baseline.name);
      const templateDetail = await context.api.seasoningTemplateDetail(baseline.id);
      const expectedOptionNames = collectTemplateOptionNames(templateDetail);
      if (context.recipe.caseId === 'TC-FLV-TPL-023') {
        const targetStore = resolveSeasoningContext('multi-store-000420');
        if (!targetStore.poiId || !targetStore.poiName) throw new Error('TPL-023 缺少已审计目标门店身份');
        const bIdentity = `AUTO_AUDIT_TPL_023_B_${Date.now()}`;
        const bOption = `${bIdentity}_OPTION`;
        const bCreated = await context.api.createSeasoning({ name: bIdentity, secondName: `${bIdentity}_SECOND`, optionName: bOption });
        const bRecord = await waitForRecord(context.api, bIdentity);
        context.records.push({ ...bRecord, optionName: bOption });
        registerCleanup(context.api, context.registry, bIdentity, bRecord.id);
        const bDetail = await context.api.seasoningDetail(bRecord.id);
        const bOptionId = findOptionId(bDetail, bOption) ?? findAnyOptionId(bDetail);
        if (!bOptionId) throw new Error(`模板B缺少调味项 ID：${bIdentity}`);
        const bTemplateCreated = await context.distributionApi.createTemplate({
          name: bIdentity,
          secondName: `${bIdentity}_SECOND`,
          description: `${bIdentity}_DESCRIPTION`,
          modifierId: bRecord.id,
          modifierName: bIdentity,
          optionId: bOptionId,
          optionName: bOption,
        });
        const bTemplate = findNamedRecord(bTemplateCreated, bIdentity) ?? findNamedRecord(await context.api.seasoningTemplatePage(bIdentity), bIdentity);
        if (!bTemplate) throw new Error(`模板B缺少服务端身份：${bIdentity}`);
        context.records.push({ ...bTemplate, objectType: '调味模板' });
        registerTemplateCleanup(context.api, context.registry, bIdentity, bTemplate.id);
        const distributionA = await seasoning.distributeTemplate(baseline.name, targetStore.poiId, targetStore.poiName);
        await waitForStoreRecord(context.distributionApi, baseline.name);
        const storeAfterA = await withObservedExecutableOperation('brand-menu:GET /ops-poi/global-modifier/list', 'GET', () => context.distributionApi.storeSeasoningList());
        const distributionB = await seasoning.distributeTemplate(bIdentity, targetStore.poiId, targetStore.poiName);
        await waitForStoreRecord(context.distributionApi, bIdentity);
        const storeAfterB = await withObservedExecutableOperation('brand-menu:GET /ops-poi/global-modifier/list', 'GET', () => context.distributionApi.storeSeasoningList());
        const recordA = findRecordObjectWithName(storeAfterA, baseline.name);
        const recordB = findRecordObjectWithName(storeAfterB, bIdentity);
        checks.templateADistributed = distributionA.status >= 200 && distributionA.status < 300 && Boolean(recordA);
        checks.templateBDistributed = distributionB.status >= 200 && distributionB.status < 300 && Boolean(recordB);
        checks.templateBReplacedA = !findRecordObjectWithName(storeAfterB, baseline.name) && Boolean(recordB);
        observations = { baseline, bIdentity, expectedOptionNames, storeAfterA, storeAfterB, distributionA, distributionB };
        operations.push('brand-menu:POST /ops-brand/brand-modifier-sync/by-template', 'brand-menu:GET /ops-poi/global-modifier/list');
        await seasoning.ensureTemplateListOpen();
        break;
      }
      if (context.recipe.caseId === 'TC-FLV-TPL-024') {
        const targetStore = resolveSeasoningContext('multi-store-000420');
        if (!targetStore.poiId || !targetStore.poiName) throw new Error('TPL-024 缺少已审计目标门店身份');
        const storeExpectation = { storeId: targetStore.poiId, storeName: targetStore.poiName };
        const editableOptionName = `${baseline.optionName}_EDITABLE`;
        const {
          distributionBefore,
          distributionAfter,
          editResult,
          templateAfterEdit,
          initialStoreContext,
          beforeRedeliveryStoreContext,
          afterRedeliveryStoreContext,
          storeAfterInitial,
          storeBeforeRedelivery,
          storeAfterRedelivery,
          initialStorePageText,
          beforeRedeliveryStorePageText,
          afterRedeliveryStorePageText,
        } = await context.templateRedeliveryFlow.execute({
          templateId: baseline.id,
          templateName: baseline.name,
          editableOptionName,
          targetStore: storeExpectation,
          waitForStoreTemplate: (templateName) => waitForStoreRecord(context.distributionApi, templateName),
          readStoreSeasoning: () => withObservedExecutableOperation(
            'brand-menu:GET /ops-poi/global-modifier/list',
            'GET',
            () => context.distributionApi.storeSeasoningList(),
          ),
        });
        const initialNames = collectTemplateOptionNames(storeAfterInitial);
        const beforeRedeliveryNames = collectTemplateOptionNames(storeBeforeRedelivery);
        const afterRedeliveryNames = collectTemplateOptionNames(storeAfterRedelivery);
        const editedTemplateNames = collectTemplateOptionNames(templateAfterEdit);
        checks.initialDistributionAccepted = distributionBefore.status >= 200 && distributionBefore.status < 300;
        checks.editAccepted = editResult.status >= 200 && editResult.status < 300;
        checks.editRequestContainsExpectedOption = JSON.stringify(editResult.requestBody).includes(editableOptionName);
        checks.editedTemplateContainsExpectedOption = editedTemplateNames.includes(editableOptionName);
        checks.storeUnchangedBeforeRedelivery = sameStringSet(beforeRedeliveryNames, initialNames);
        checks.redeliveryAccepted = distributionAfter.status >= 200 && distributionAfter.status < 300;
        checks.storeChangedAfterRedelivery = !sameStringSet(afterRedeliveryNames, beforeRedeliveryNames);
        checks.storeMatchesEditedTemplate = editedTemplateNames.length > 0 && sameStringSet(afterRedeliveryNames, editedTemplateNames);
        checks.initialStoreContextMatchesTarget = isStoreIdentityMatch(initialStoreContext, storeExpectation);
        checks.beforeRedeliveryStoreContextMatchesTarget = isStoreIdentityMatch(beforeRedeliveryStoreContext, storeExpectation);
        checks.afterRedeliveryStoreContextMatchesTarget = isStoreIdentityMatch(afterRedeliveryStoreContext, storeExpectation);
        checks.initialStoreUiMatchesInitialDistribution = initialNames.length > 0 && initialNames.every((name) => initialStorePageText.includes(name));
        checks.storeUiUnchangedBeforeRedelivery = initialNames.length > 0
          && initialNames.every((name) => beforeRedeliveryStorePageText.includes(name))
          && beforeRedeliveryNames.every((name) => initialStorePageText.includes(name));
        checks.storeUiMatchesEditedTemplate = editedTemplateNames.length > 0 && editedTemplateNames.every((name) => afterRedeliveryStorePageText.includes(name));
        if (checks.initialDistributionAccepted
          && checks.editAccepted
          && checks.storeUnchangedBeforeRedelivery
          && checks.redeliveryAccepted
          && (!checks.storeChangedAfterRedelivery || !checks.storeMatchesEditedTemplate)) {
          productMismatch = '正式来源要求编辑模板未再次下发前门店调味不变、再次下发后覆盖为编辑后模板；当前再次下发成功，但门店全量回读仍保持旧调味项。';
        }
        observations = {
          targetStore: storeExpectation,
          distributionTarget: { initial: distributionBefore, redelivery: distributionAfter },
          queriedStoreContext: { initial: initialStoreContext, beforeRedelivery: beforeRedeliveryStoreContext, afterRedelivery: afterRedeliveryStoreContext },
          initialNames, beforeRedeliveryNames, afterRedeliveryNames, editedTemplateNames,
          editableOptionName,
          initialStorePageText, beforeRedeliveryStorePageText, afterRedeliveryStorePageText,
          storeAfterInitial, templateAfterEdit, storeBeforeRedelivery, storeAfterRedelivery, editResult,
        };
        operations.push('brand-menu:POST /ops-brand/brand-modifier-sync/by-template', 'brand-menu:PUT /ops-brand/modifier-template/{id}', 'brand-menu:GET /ops-poi/global-modifier/list');
        await seasoning.ensureTemplateListOpen();
        break;
      }
      const targetStore = resolveSeasoningContext('multi-store-000420');
      if (!targetStore.poiId || !targetStore.poiName) throw new Error('模板下发用例缺少已审计目标门店身份');
      const distribution = await seasoning.distributeTemplate(baseline.name, targetStore.poiId, targetStore.poiName);
      checks.distributionAccepted = distribution.status >= 200 && distribution.status < 300;
      if (checks.distributionAccepted) {
        await waitForStoreRecord(context.distributionApi, baseline.name);
      }
      let storeBody = await withObservedExecutableOperation(
        'brand-menu:GET /ops-poi/global-modifier/list',
        'GET',
        () => context.distributionApi.storeSeasoningList(),
      );
      const storeRecord = findRecordObjectWithName(storeBody, baseline.name);
      const actualOptionNames = collectTemplateOptionNames(storeRecord ?? storeBody);
      checks.storeReadback = Boolean(storeRecord);
      checks.templateOptionsMatch = expectedOptionNames.length > 0
        && expectedOptionNames.length === actualOptionNames.length
        && expectedOptionNames.every((name) => actualOptionNames.includes(name));
      checks.repeatAccepted = true;
      checks.templateIdentityObserved = Boolean(storeRecord)
        && expectedOptionNames.every((name) => actualOptionNames.includes(name));
      observations = { distribution: distribution.requestBody, storeBody, expectedOptionNames, actualOptionNames };
      operations.push('brand-menu:POST /ops-brand/brand-modifier-sync/by-template', 'brand-menu:GET /ops-poi/global-modifier/list');
      break;
    }
    case 'TC-FLV-XMOD-001': {
      const identity = context.records[0]?.name;
      if (!identity) throw new Error('门店调味字段用例缺少下发身份');
      await waitForStorePageReady(page, identity);
      const tableHeaders = await headers();
      const text = await body();
      checks.groupSummary = /个调味/.test(text);
      checks.optionColumns = ['调味名称', '第二名称', '价格($)'].every((item) => tableHeaders.includes(item));
      checks.posFields = /POS名称/.test(tableHeaders.join('|')) && /送厨名称/.test(tableHeaders.join('|'));
      observations = { tableHeaders, text };
      if (Object.values(checks).some((value) => !value)) {
        productMismatch = '正式规则要求门店调味展示组内数量及名称、第二语言、POS名称、送厨名称、价格；当前列表字段合同不完整。';
      }
      operations.push('brand-menu:GET /ops-poi/global-modifier/list');
      break;
    }
    case 'TC-FLV-XMOD-002': {
      const input = page.getByPlaceholder('调味名称');
      const candidate = context.templateSeed?.optionName;
      if (!candidate) throw new Error('门店调味查询用例缺少精确调味项身份');
      await waitForStorePageReady(page, candidate);
      await fillAndWaitForResponse(page, input, candidate.slice(0, Math.max(1, candidate.length - 1)), '/ops-poi/global-modifier/list', 'GET', 'optionName');
      const fuzzy = await body();
      await fillAndWaitForResponse(page, input, candidate, '/ops-poi/global-modifier/list', 'GET', 'optionName');
      const exact = await body();
      checks.fuzzy = fuzzy.includes(candidate);
      checks.exact = exact.includes(candidate);
      observations = { candidate, fuzzy, exact };
      operations.push('brand-menu:GET /ops-poi/global-modifier/list');
      break;
    }
    case 'TC-FLV-XMOD-003': {
      const input = page.getByPlaceholder('调味名称');
      const identity = context.records[0]?.name;
      if (!identity) throw new Error('门店调味重置用例缺少下发身份');
      await waitForStorePageReady(page, identity);
      await fillAndWaitForResponse(page, input, 'AUTO_AUDIT_NO_MATCH', '/ops-poi/global-modifier/list', 'GET', 'optionName');
      const filtered = await body();
      await fillAndWaitForResponse(page, input, '', '/ops-poi/global-modifier/list', 'GET', 'optionName');
      const reset = await body();
      checks.inputCleared = await input.inputValue() === '';
      checks.fullListRestored = reset.includes(identity) && reset.length > filtered.length;
      observations = { filtered, reset };
      operations.push('brand-menu:GET /ops-poi/global-modifier/list');
      break;
    }
    default:
      throw new Error(`未实现静态调味页面合同：${context.recipe.caseId}`);
  }
  return { checks, observations, operations, productMismatch };
}

async function fillAndWaitForResponse(
  page: Page,
  input: import('@playwright/test').Locator,
  value: string,
  pathSuffix: string,
  method = 'GET',
  queryParameter = method === 'GET' ? 'name' : undefined,
): Promise<void> {
  const response = page.waitForResponse((candidate) => matchesSystemTestRequest({
    method: candidate.request().method(),
    url: candidate.url(),
    postData: readRequestPostData(candidate.request()),
  }, {
    method,
    pathSuffix,
    expectedValue: value,
    queryParameter,
  }));
  await input.fill(value);
  await response;
}

function readRequestPostData(request: import('@playwright/test').Request): unknown {
  const raw = request.postData();
  if (!raw) return undefined;
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return undefined;
  }
}

function countRequests(page: Page, method: string, path: RegExp): { read: () => number; dispose: () => void } {
  let count = 0;
  const listener = (request: import('@playwright/test').Request): void => {
    if (request.method() === method && path.test(new URL(request.url()).pathname)) count += 1;
  };
  page.on('request', listener);
  return { read: () => count, dispose: () => page.off('request', listener) };
}

function requireSopRecord(context: RuntimeContext): ProductCenterSopSeedRecord {
  if (!context.sopRecord) throw new Error(`调味 CRUD 前置记录缺失：${context.recipe.caseId}`);
  return context.sopRecord;
}

function sharedIdentityPrefix(first: string, second: string): string {
  let length = 0;
  while (length < first.length && length < second.length && first[length] === second[length]) length += 1;
  const prefix = first.slice(0, length);
  if (!prefix) throw new Error(`测试身份没有可查询的公共前缀：${first} / ${second}`);
  return prefix;
}

function buildSeasoningReportEvidence(
  step: SystemTestReportStep,
  context: RuntimeContext,
  stepResult?: unknown,
): BusinessStepAttachment[] | BusinessStepReportEvidence {
  if (step.phase === 'initialize') {
    const result = context.pageReadiness.routeMatched && context.pageReadiness.visibleBusinessContent ? '通过' : '失败';
    return {
      attachments: [jsonReportAttachment('页面可用断言收据', {
        caseId: context.recipe.caseId,
        expected: {
          route: context.pageReadiness.expectedRoute,
          visibleBusinessContent: true,
        },
        actual: context.pageReadiness,
        result,
      })],
      details: [{
        title: `页面可用性：期望路径 ${context.pageReadiness.expectedRoute} 且存在业务内容｜实际路径 ${context.pageReadiness.actualRoute}，业务内容=${context.pageReadiness.visibleBusinessContent ? '存在' : '不存在'}｜结果：${result}`,
      }],
    };
  }
  if (step.phase === 'context-guard') {
    const expected = step.input ?? {};
    const receipt = jsonReportAttachment('业务上下文校验收据', {
      caseId: context.recipe.caseId,
      navigationPath: navigationPathForRoute(context.recipe.route),
      expected: {
        route: expected.expectedRoute,
        locale: expected.expectedLocale,
        role: expected.expectedRoleId,
        tenantScope: expected.expectedTenantScope,
        merchant: context.businessContext.merchant,
        brandId: context.businessContext.brandId,
        ...(context.businessContext.poiId && context.businessContext.poiName
          ? { store: { id: context.businessContext.poiId, name: context.businessContext.poiName } }
          : {}),
      },
      actual: {
        route: new URL(context.page.url()).pathname,
        locale: 'zh-CN',
        profile: context.businessContext.profile,
        merchant: context.businessContext.merchant,
        brandId: context.businessContext.brandId,
        ...(context.businessContext.poiId && context.businessContext.poiName
          ? { store: { id: context.businessContext.poiId, name: context.businessContext.poiName } }
          : {}),
      },
      result: '通过（上下文守卫未抛出异常）',
    });
    return {
      attachments: [receipt],
      details: [contextGuardDetail(context, expected)],
    };
  }
  if (step.phase === 'assertion') {
    const claimIds = context.recipe.assertions
      .filter((assertion) => assertion.adapterId === step.adapterId)
      .flatMap((assertion) => assertion.claimIds ?? []);
    const contracts = (context.recipe.assertionContracts ?? [])
      .filter((contract) => contract.adapterId === step.adapterId || claimIds.includes(contract.claimId))
      .map((contract) => ({
        claimId: contract.claimId,
        expected: contract.terminalCondition,
        observationChannel: contract.observationChannel,
        authority: contract.authority,
        fieldId: contract.fieldId,
        assertionSurfaceId: contract.assertionSurfaceId,
      }));
      const result = stepResult && typeof stepResult === 'object'
        ? stepResult
        : context.results[step.adapterId ?? ''] ?? context.results['merchant-center.seasoning.ui-mutation'];
    const checks = result && typeof result === 'object' && !Array.isArray(result)
      && 'checks' in result && result.checks && typeof result.checks === 'object'
      ? result.checks as Record<string, unknown>
      : {};
    const expectedChecks = buildAssertionCheckExpectations(context, Object.keys(checks), contracts);
    const observations = result && typeof result === 'object' && !Array.isArray(result) && 'observations' in result
      ? (result as { observations?: unknown }).observations
      : result;
    const checkResults = buildAssertionCheckResults(
      context.recipe.caseId,
      Object.keys(checks),
      expectedChecks,
      checks,
      observations,
    );
    const pendingAssertionAttachments = context.pendingAssertionAttachments.splice(0);
    return {
      attachments: [...pendingAssertionAttachments, jsonReportAttachment('断言期望值与实际值', {
      caseId: context.recipe.caseId,
      assertionAdapterId: step.adapterId,
      claimIds,
      expected: {
        contracts,
        checks: expectedChecks,
      },
      actual: {
        checks,
        observations,
      },
      checkResults,
      assertionReceipts: context.assertionReceipts,
      })],
      details: [
        ...checkResults.map((result, index) => assertionDetail(context.recipe.caseId, index, result)),
      ],
    };
  }
  if (!['seed', 'capability', 'cleanup'].includes(step.phase)) return [];
  const cursor = context.reportOperationReceiptCursor;
  const operations = context.operationReceipts.slice(cursor);
  context.reportOperationReceiptCursor = context.operationReceipts.length;
  if (operations.length === 0) return [];
  const receipt = jsonReportAttachment(step.phase === 'seed' ? '接口与业务数据执行收据' : '业务操作执行收据', {
    caseId: context.recipe.caseId,
    phase: step.phase,
    adapterId: step.adapterId,
    executionResult: operations.every((operation) => operation.observed) ? '成功' : '失败',
    operations: operations.map((operation) => {
      const presentation = describeSeasoningOperation(operation.operationKey, {
        caseId: context.recipe.caseId,
        phase: step.phase,
      });
      return {
      sequence: operation.sequence ?? null,
      title: operation.title ?? presentation.purpose,
      businessDescription: presentation.purpose,
      interfaceOrAction: presentation.purpose,
      operationKey: operation.operationKey,
      method: operation.method,
      success: operation.observed === true,
      status: operation.status ?? (operation.observed === true ? 'passed' : 'failed'),
      responseStatus: operation.responseStatus ?? (operations.length === 1 ? findNumericStatus(stepResult) : '本接口收据未提供 HTTP 状态'),
      durationMs: operation.durationMs ?? '本接口收据未提供耗时',
      details: operation.details ?? null,
      };
    }),
    createdBusinessData: step.phase === 'seed' ? buildCreatedBusinessData(context) : undefined,
    actualResult: step.phase === 'capability' ? compactReportValue(stepResult) : undefined,
    cleanupResult: step.phase === 'cleanup' ? compactReportValue(context.cleanupEvidence) : undefined,
  });
  const details: BusinessStepDetail[] = operations.map((operation) => {
    const presentation = describeSeasoningOperation(operation.operationKey, {
      caseId: context.recipe.caseId,
      phase: step.phase,
    });
    return createBusinessOperationReceiptDetail({
      purpose: operation.title ?? presentation.purpose,
      triggerSource: presentation.triggerSource,
      result: operation.observed ? '成功' : '失败',
      attachmentName: presentation.attachmentName,
      technicalDetails: buildSeasoningOperationTechnicalDetails({
        ...operation,
        purpose: presentation.purpose,
        triggerSource: presentation.triggerSource,
      }),
    });
  });
  if (step.phase === 'seed') {
    details.push(...buildCreatedBusinessData(context).map((record) => ({
      title: `造数：${record.objectType}「${record.businessName}」｜服务端 ID：${record.serverId}｜结果：已创建`,
    })));
  }
  return { attachments: [receipt], details };
}

function contextGuardDetail(
  context: RuntimeContext,
  expected: Readonly<Record<string, unknown>>,
): BusinessStepDetail {
  const actualRoute = new URL(context.page.url()).pathname;
  return {
    title: `上下文门禁：期望路径 ${expected.expectedRoute ?? context.recipe.route}｜实际路径 ${actualRoute}｜商户 ${context.businessContext.merchant}｜结果：通过`,
  };
}

function assertionDetail(
  caseId: string,
  index: number,
  result: Record<string, unknown>,
): BusinessStepDetail {
  const checkName = String(result.checkName ?? `检查项${index + 1}`);
  const label = assertionCheckLabel(caseId, checkName);
  const expected = formatInlineReportValue(
    result.expectedValue && typeof result.expectedValue === 'object' && !Array.isArray(result.expectedValue)
      ? (result.expectedValue as Record<string, unknown>).businessExpectation ?? result.expectedValue
      : result.expectedValue,
  );
  const actual = formatInlineReportValue(result.observedValue ?? result.actualValue);
  return {
    title: `校验${index + 1}：${label}｜期望：${expected}｜实际：${actual}｜结果：${result.result ?? '未判定'}`,
  };
}

function assertionCheckLabel(caseId: string, checkName: string): string {
  const labelsByCase: Record<string, Record<string, string>> = {
    'TC-FLV-SEA-035': {
      cancelReturned: '取消后返回调味列表',
      originalValueCaptured: '已记录编辑前名称',
      transientValueEntered: '已输入临时名称',
      noMutation: '取消操作未提交保存请求',
      originalRetained: '服务端保留原名称',
      transientAbsent: '服务端不存在临时名称',
    },
    'TC-FLV-SEA-037': {
      batchMoveAccepted: '批量变更请求',
      requestContainsMovedOption: '请求包含目标调味项和目标调味组',
      sourceNoLongerOwnsOption: '源调味组已移除目标调味项',
      targetOwnsOption: '目标调味组已包含目标调味项',
    },
    'TC-FLV-SEA-041': {
      sortAccepted: '排序保存请求',
      uiOrderChanged: '页面调味组顺序变化',
      dialogClosed: '排序操作窗口关闭',
      apiOrderPersisted: '服务端回读顺序',
    },
  };
  return labelsByCase[caseId]?.[checkName] ?? checkName;
}

function formatInlineReportValue(value: unknown): string {
  const text = formatReadableReportValue(value);
  if (!text) return '未提供';
  return text.length > 260 ? `${text.slice(0, 260)}…` : text;
}

function formatReadableReportValue(value: unknown): string {
  if (value === null || value === undefined) return '未提供';
  if (typeof value === 'boolean') return value ? '是' : '否';
  if (typeof value === 'string' || typeof value === 'number') return String(value);
  if (Array.isArray(value)) return value.map(formatReadableReportValue).join(' → ') || '空列表';
  if (typeof value === 'object') {
    return Object.entries(value as Record<string, unknown>)
      .map(([key, item]) => `${key}：${formatReadableReportValue(item)}`)
      .join('；');
  }
  return String(value);
}

function buildAssertionCheckExpectations(
  context: RuntimeContext,
  checkNames: readonly string[],
  contracts: readonly Record<string, unknown>[],
): Record<string, unknown> {
  const caseId = context.recipe.caseId;
  const targetStoreId = context.businessContext.poiId ?? '当前上下文配置的目标门店 ID';
  const targetStoreName = context.businessContext.poiName ?? '当前上下文配置的目标门店名称';
  const tpl024: Record<string, string> = {
    initialDistributionAccepted: '首次下发接口 HTTP 状态为 200-299',
    editAccepted: '编辑模板接口 HTTP 状态为 200-299',
    storeUnchangedBeforeRedelivery: `未再次下发前，${targetStoreName}（门店 ID=${targetStoreId}）调味项集合与首次下发后完全一致`,
    redeliveryAccepted: '再次下发接口 HTTP 状态为 200-299',
    storeChangedAfterRedelivery: `再次下发后，${targetStoreName}（门店 ID=${targetStoreId}）调味项集合与再次下发前不同`,
    storeMatchesEditedTemplate: `再次下发后，${targetStoreName}（门店 ID=${targetStoreId}）调味项集合与编辑后的模板完全一致`,
    initialStoreContextMatchesTarget: `首次查询确认当前门店 ID=${targetStoreId}、名称=${targetStoreName}，并且请求与本地上下文一致`,
    beforeRedeliveryStoreContextMatchesTarget: `编辑后再次下发前仍确认当前门店 ID=${targetStoreId}、名称=${targetStoreName}`,
    afterRedeliveryStoreContextMatchesTarget: `再次下发后仍确认当前门店 ID=${targetStoreId}、名称=${targetStoreName}`,
    initialStoreUiMatchesInitialDistribution: '首次下发后门店调味页面展示首次下发的全部调味项',
    storeUiUnchangedBeforeRedelivery: '编辑模板但未再次下发时，门店调味页面仍展示原调味项集合',
    storeUiMatchesEditedTemplate: '再次下发后门店调味页面展示编辑后模板的全部调味项',
  };
  const sea022: Record<string, string> = {
    limitInputPrepared: '已有 50 项时成功添加并填写第 51 个调味项，形成真实提交场景',
    limitFeedbackVisible: '点击确定提交后页面显示错误码 BITEM-11072 和中文消息“一个调味组最大仅能添加50个调味”',
    rejectionEvidenceComplete: '报告明确记录前端提交校验或服务端拒绝的实际拦截通道和请求结果',
    serverOptionCountRetained: '提交后服务端回读仍为原 50 个调味项',
    originalOptionSetRetained: '提交前后的原 50 个调味项集合完全一致',
    submittedOptionNotPersisted: '本次填写的第 51 个调味项未持久化',
  };
  const sea041: Record<string, string> = {
    sortAccepted: '排序保存请求返回 HTTP 200-299',
    uiOrderChanged: '页面调味组顺序在拖动保存前后发生变化',
    dialogClosed: '保存完成后排序操作窗口关闭',
    apiOrderPersisted: '服务端回读顺序与页面保存后的调味组顺序一致',
  };
  const sea035: Record<string, string> = {
    cancelReturned: '点击取消后返回品牌调味列表页',
    originalValueCaptured: '编辑前已记录原调味组名称',
    transientValueEntered: '编辑页已输入不同于原名称的临时名称',
    noMutation: '取消操作不产生保存写请求',
    originalRetained: '服务端回读名称仍为编辑前原名称',
    transientAbsent: '服务端回读结果中不存在未保存的临时名称',
  };
  const sea037: Record<string, string> = {
    batchMoveAccepted: '批量变更调味组请求返回 HTTP 200-299',
    requestContainsMovedOption: '请求包含目标调味项 ID 和目标调味组 ID',
    sourceNoLongerOwnsOption: '源调味组回读结果不再包含目标调味项',
    targetOwnsOption: '目标调味组回读结果包含目标调味项',
  };
  let descriptions: Record<string, string> = {};
  if (caseId === 'TC-FLV-TPL-024') descriptions = tpl024;
  else if (caseId === 'TC-FLV-SEA-022') descriptions = sea022;
  else if (caseId === 'TC-FLV-SEA-035') descriptions = sea035;
  else if (caseId === 'TC-FLV-SEA-037') descriptions = sea037;
  else if (caseId === 'TC-FLV-SEA-041') descriptions = sea041;
  if (Object.keys(descriptions).length === 0) {
    return {
      ...Object.fromEntries(checkNames.map((checkName) => [checkName, { expected: true }])),
      sourceContract: contracts,
    };
  }
  return Object.fromEntries(checkNames.map((checkName) => [checkName, {
    expected: true,
    businessExpectation: descriptions[checkName] ?? '该断言检查项应成立',
  }]));
}

function buildAssertionCheckResults(
  caseId: string,
  checkNames: readonly string[],
  expectedChecks: Record<string, unknown>,
  actualChecks: Record<string, unknown>,
  observations: unknown,
): Array<Record<string, unknown>> {
  return checkNames.map((checkName) => ({
    checkName,
    expectedValue: expectedChecks[checkName] ?? { expected: true },
    actualValue: actualChecks[checkName] ?? '未产生该断言结果',
    observedValue: compactReportValue(observedValueForCheck(caseId, checkName, observations)),
    result: actualChecks[checkName] === true ? '通过' : '失败',
  }));
}

function observedValueForCheck(caseId: string, checkName: string, observations: unknown): unknown {
  if (!observations || typeof observations !== 'object' || Array.isArray(observations)) return null;
  const record = observations as Record<string, unknown>;
  if (caseId === 'TC-FLV-SEA-022') {
    switch (checkName) {
      case 'limitInputPrepared':
        return `添加前 ${record.beforeRowCount ?? '未提供'} 项；添加后 ${record.rowCountAfterAdd ?? '未提供'} 项；第51项名称：${record.rejectedOptionName ?? '未提供'}`;
      case 'limitFeedbackVisible':
        return `页面反馈：${formatReadableReportValue(record.errorTexts)}`;
      case 'rejectionEvidenceComplete':
        return `拦截通道：${record.rejectionChannel ?? '未提供'}；写请求次数：${record.mutationCount ?? '未提供'}；HTTP 状态：${record.mutationStatus ?? '无请求'}`;
      case 'serverOptionCountRetained':
        return `服务端回读调味项数量：${Array.isArray(record.serverOptionNames) ? record.serverOptionNames.length : '未提供'}`;
      case 'originalOptionSetRetained':
        return {
          提交前调味项: record.serverOptionNamesBefore,
          提交后调味项: record.serverOptionNames,
        };
      case 'submittedOptionNotPersisted':
        return `提交项：${record.rejectedOptionName ?? '未提供'}；服务端是否存在：${Array.isArray(record.serverOptionNames) && record.serverOptionNames.includes(record.rejectedOptionName) ? '是' : '否'}`;
      default:
        return null;
    }
  }
  if (caseId === 'TC-FLV-SEA-035') {
    const persistedName = readRecordField(readRecordField(record.after, 'data'), 'name');
    switch (checkName) {
      case 'cancelReturned':
        return `返回路径：${record.route ?? '未提供'}`;
      case 'originalValueCaptured':
        return `原名称：${record.originalName ?? '未提供'}`;
      case 'transientValueEntered':
        return `临时名称：${record.transientName ?? '未提供'}；页面确认输入：${record.transientValueConfirmed === true ? '是' : '否'}`;
      case 'noMutation':
        return `保存写请求次数：${record.mutationCount ?? '未提供'}`;
      case 'originalRetained':
        return `服务端回读名称：${persistedName ?? '未提供'}`;
      case 'transientAbsent':
        return `服务端回读名称：${persistedName ?? '未提供'}；临时名称：${record.transientName ?? '未提供'}`;
      default:
        return null;
    }
  }
  if (caseId === 'TC-FLV-SEA-037') {
    switch (checkName) {
      case 'batchMoveAccepted':
        return `HTTP ${record.status ?? '未提供'}`;
      case 'requestContainsMovedOption':
        return `调味项 ID：${record.movedOptionId ?? '未提供'}；目标调味组 ID：${readRecordField(record.requestBody, 'targetModifierId') ?? '未提供'}`;
      case 'sourceNoLongerOwnsOption':
        return `源调味组剩余调味项：${formatReadableReportValue(record.sourceOptionNames)}`;
      case 'targetOwnsOption':
        return `目标调味组调味项：${formatReadableReportValue(record.targetOptionNames)}`;
      default:
        return null;
    }
  }
  if (caseId === 'TC-FLV-SEA-041') {
    switch (checkName) {
      case 'sortAccepted':
        return `HTTP ${readRecordField(record, 'status') ?? '未提供'}`;
      case 'uiOrderChanged':
        return {
          调整前: readRecordField(record, 'before'),
          调整后: readRecordField(record, 'after'),
        };
      case 'dialogClosed':
        return `排序窗口关闭=${readRecordField(record, 'dialogClosed') ?? '未提供'}`;
      case 'apiOrderPersisted':
        return {
          页面保存后顺序: readRecordField(record, 'after'),
          服务端回读顺序: readRecordField(record, 'persistedNames'),
        };
      default:
        return null;
    }
  }
  if (caseId !== 'TC-FLV-TPL-024') return record;
  const distributionTarget = record.distributionTarget;
  const queriedStoreContext = record.queriedStoreContext;
  switch (checkName) {
    case 'initialDistributionAccepted':
      return readRecordField(readRecordField(distributionTarget, 'initial'), 'status');
    case 'editAccepted':
      return readRecordField(record.editResult, 'status');
    case 'redeliveryAccepted':
      return readRecordField(readRecordField(distributionTarget, 'redelivery'), 'status');
    case 'storeUnchangedBeforeRedelivery':
      return {
        initialNames: record.initialNames,
        beforeRedeliveryNames: record.beforeRedeliveryNames,
      };
    case 'storeChangedAfterRedelivery':
      return {
        beforeRedeliveryNames: record.beforeRedeliveryNames,
        afterRedeliveryNames: record.afterRedeliveryNames,
      };
    case 'storeMatchesEditedTemplate':
      return {
        afterRedeliveryNames: record.afterRedeliveryNames,
        editedTemplateNames: record.editedTemplateNames,
      };
    case 'initialStoreContextMatchesTarget':
      return readRecordField(queriedStoreContext, 'initial');
    case 'beforeRedeliveryStoreContextMatchesTarget':
      return readRecordField(queriedStoreContext, 'beforeRedelivery');
    case 'afterRedeliveryStoreContextMatchesTarget':
      return readRecordField(queriedStoreContext, 'afterRedelivery');
    default:
      return null;
  }
}

function readRecordField(value: unknown, key: string): unknown {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)[key]
    : null;
}

function jsonReportAttachment(name: string, value: unknown): BusinessStepAttachment {
  return { name, contentType: 'application/json', body: Buffer.from(JSON.stringify(value, null, 2)) };
}

function buildCreatedBusinessData(context: RuntimeContext): Array<Record<string, unknown>> {
  const records = context.records.map((record) => ({
    objectType: record.objectType ?? (context.templateSeed?.id === record.id ? '调味模板' : '品牌调味'),
    businessName: record.name,
    serverId: record.id,
    ...(record.optionName ? { optionName: record.optionName } : {}),
  }));
  if (context.templateSeed && !records.some((record) => record.serverId === context.templateSeed?.id)) {
    records.push({
      objectType: '调味模板',
      businessName: context.templateSeed.name,
      serverId: context.templateSeed.id,
      optionName: context.templateSeed.optionName,
    });
  }
  return records;
}

function buildObservedOperationReceipts(
  operationKeys: readonly string[],
  result: unknown,
): ReportOperationReceipt[] {
  const writeOperationKeys = operationKeys.filter((operationKey) => /:(?:POST|PUT|PATCH|DELETE)\s/.test(operationKey));
  const responseStatus = writeOperationKeys.length === 1 ? findNumericStatus(result) : undefined;
  return operationKeys.map((operationKey) => ({
    operationKey,
    observed: true,
    method: operationKey.match(/:(GET|POST|PUT|PATCH|DELETE)\s/)?.[1] ?? 'UI',
    responseStatus: operationKey === writeOperationKeys[0] && typeof responseStatus === 'number'
      ? responseStatus
      : undefined,
  }));
}

function findNumericStatus(value: unknown): number | string {
  if (!value || typeof value !== 'object') return '本步骤未返回 HTTP 状态';
  if (Array.isArray(value)) {
    for (const item of value) {
      const status = findNumericStatus(item);
      if (typeof status === 'number') return status;
    }
    return '本步骤未返回 HTTP 状态';
  }
  const record = value as Record<string, unknown>;
  for (const key of ['responseStatus', 'status']) {
    if (typeof record[key] === 'number') return record[key] as number;
  }
  for (const nested of Object.values(record)) {
    const status = findNumericStatus(nested);
    if (typeof status === 'number') return status;
  }
  return '本步骤未返回 HTTP 状态';
}

function compactReportValue(value: unknown): unknown {
  if (typeof value === 'string') return value.length > 4000 ? `${value.slice(0, 4000)}…（已截断）` : value;
  if (Array.isArray(value)) return value.map(compactReportValue);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value).map(([key, nested]) => [key, compactReportValue(nested)]));
}

async function waitForRecord(api: ProductCenterApi, identity: string): Promise<NamedRecord> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < 30_000) {
    const found = findNamedRecord(await api.seasoningList(), identity);
    if (found) return found;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`调味创建后 API 未回读：${identity}`);
}

function registerCleanup(api: ProductCenterApi, registry: CleanupRegistry, identity: string, id: number): void {
  registry.register({
    entity: '品牌调味系统测试数据',
    identity,
    checkpoint: { entryId: `seasoning-${id}`, entityKind: 'seasoning', serverId: id, identityVariants: [identity], cleanupOrder: 20 },
    execute: async () => {
      const record = findNamedRecord(await withObservedExecutableOperation(
        'brand-menu:GET /ops-brand/global-modifier/list',
        'GET',
        () => api.seasoningList(),
      ), identity);
      if (record) {
        await withObservedExecutableOperation(
          'brand-menu:DELETE /ops-brand/global-modifier/{id}',
          'DELETE',
          () => api.deleteSeasoning(record.id),
        );
      }
    },
    verify: async () => !findNamedRecord(await withObservedExecutableOperation(
      'brand-menu:GET /ops-brand/global-modifier/list',
      'GET',
      () => api.seasoningList(),
    ), identity),
  });
}

async function selectUnusedIndustrySeasoningCandidate(
  value: unknown,
  seasoning: SeasoningBoundaryPage,
  requiredOptionCount: number,
): Promise<{ groupName: string; optionNames: string[] }> {
  for (const candidate of auditedIndustrySeasoningCandidates) {
    if (findNamedRecord(value, candidate.groupName)) continue;
    const optionNames = await seasoning.readIndustrySeasoningOptionNames(candidate.groupName);
    if (optionNames.length >= requiredOptionCount) {
      return { groupName: candidate.groupName, optionNames: optionNames.slice(0, requiredOptionCount) };
    }
  }
  throw new Error(`当前商户没有“尚未导入且至少含 ${requiredOptionCount} 个当前可选项”的已审计行业调味组，禁止猜测调味项名称或破坏既有数据。`);
}

function registerImportedSeasoningCleanup(
  api: ProductCenterApi,
  registry: CleanupRegistry,
  groupName: string,
  id: number,
): void {
  const cleanupIdentity = `AUTO_AUDIT_IMPORTED_SEASONING_${id}`;
  registry.register({
    entity: `本次导入的行业调味组 ${groupName}`,
    identity: cleanupIdentity,
    checkpoint: {
      entryId: `seasoning-import-${id}`,
      entityKind: 'seasoning',
      serverId: id,
      identityVariants: [cleanupIdentity],
      cleanupOrder: 20,
    },
    execute: async () => {
      const record = findNamedRecord(await withObservedExecutableOperation(
        'brand-menu:GET /ops-brand/global-modifier/list',
        'GET',
        () => api.seasoningList(),
      ), groupName);
      if (record?.id === id) {
        await withObservedExecutableOperation(
          'brand-menu:DELETE /ops-brand/global-modifier/{id}',
          'DELETE',
          () => api.deleteSeasoning(id),
        );
      }
    },
    verify: async () => !findNamedRecord(await withObservedExecutableOperation(
      'brand-menu:GET /ops-brand/global-modifier/list',
      'GET',
      () => api.seasoningList(),
    ), groupName),
  });
}

function registerTemplateCleanup(api: ProductCenterApi, registry: CleanupRegistry, identity: string, id: number): void {
  registry.register({
    entity: '调味模板系统测试数据',
    identity,
    checkpoint: { entryId: `seasoning-template-${id}`, entityKind: 'seasoning', serverId: id, identityVariants: [identity], cleanupOrder: 30 },
    execute: async () => {
      const record = findNamedRecord(await withObservedExecutableOperation(
        'brand-menu:GET /ops-brand/modifier-template/page',
        'GET',
        () => api.seasoningTemplatePage(identity),
      ), identity);
      if (record) {
        await withObservedExecutableOperation(
          'brand-menu:DELETE /ops-brand/modifier-template/{id}',
          'DELETE',
          () => api.deleteSeasoningTemplate(record.id),
        );
      }
    },
    verify: async () => !findNamedRecord(await withObservedExecutableOperation(
      'brand-menu:GET /ops-brand/modifier-template/page',
      'GET',
      () => api.seasoningTemplatePage(identity),
    ), identity),
  });
}

function buildCleanupEvidence(
  evidence: CleanupRegistryEvidence,
  records: readonly CreatedRecord[],
  uiIdentityCounts: Record<string, number>,
) {
  const apiIdentityCounts: Record<string, number> = {};
  for (const record of records) apiIdentityCounts[record.name] = 0;
  for (const [identity, count] of Object.entries(evidence.apiIdentityCounts)) apiIdentityCounts[identity] = count;
  return {
    apiIdentityCounts,
    uiIdentityCounts,
    objects: evidence.objects.map((item) => ({
      ...item,
      uiResidueCount: uiIdentityCounts[item.businessIdentity] ?? 0,
    })),
  };
}

// system-test-fingerprint:start seasoning-store-readiness-identity-helpers
function findNamedRecord(value: unknown, identity: string): NamedRecord | undefined {
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findNamedRecord(item, identity);
      if (found) return found;
    }
    return undefined;
  }
  if (!value || typeof value !== 'object') return undefined;
  const record = value as Record<string, unknown>;
  if (record.name === identity && Number.isFinite(Number(record.id))) return { id: Number(record.id), name: identity };
  for (const item of Object.values(record)) {
    const found = findNamedRecord(item, identity);
    if (found) return found;
  }
  return undefined;
}

function findStoreOption(value: unknown, identity: string): number | undefined {
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findStoreOption(item, identity);
      if (found !== undefined) return found;
    }
    return undefined;
  }
  if (!value || typeof value !== 'object') return undefined;
  const record = value as Record<string, unknown>;
  const name = String(record.name ?? '').trim();
  const optionId = Number(record.optionId ?? record.modifierOptionId ?? record.id);
  if (name === identity && Number.isFinite(optionId)) {
    for (const key of ['options', 'modifierOptions', 'children', 'list']) {
      const nested = findStoreOption(record[key], identity);
      if (nested !== undefined && nested !== optionId) return nested;
    }
    if (Object.hasOwn(record, 'priceAdjustment') && !Array.isArray(record.options)) return optionId;
  }
  for (const item of Object.values(record)) {
    const found = findStoreOption(item, identity);
    if (found !== undefined) return found;
  }
  return undefined;
}

function findRecordObjectWithName(value: unknown, identity: string): NamedRecord & Record<string, unknown> | undefined {
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findRecordObjectWithName(item, identity);
      if (found) return found;
    }
    return undefined;
  }
  if (!value || typeof value !== 'object') return undefined;
  const record = value as Record<string, unknown>;
  if (record.name === identity && Number.isFinite(Number(record.id))) return record as NamedRecord & Record<string, unknown>;
  for (const item of Object.values(record)) {
    const found = findRecordObjectWithName(item, identity);
    if (found) return found;
  }
  return undefined;
}

function countTemplateOptions(value: unknown): number {
  if (Array.isArray(value)) return value.reduce((total, item) => total + countTemplateOptions(item), 0);
  if (!value || typeof value !== 'object') return 0;
  const record = value as Record<string, unknown>;
  const own = Array.isArray(record.options) ? record.options.length : 0;
  return own + Object.entries(record)
    .filter(([key]) => key !== 'options')
    .reduce((total, [, item]) => total + countTemplateOptions(item), 0);
}

function findFirstTemplateOptionName(value: unknown): string | undefined {
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findFirstTemplateOptionName(item);
      if (found) return found;
    }
    return undefined;
  }
  if (!value || typeof value !== 'object') return undefined;
  const record = value as Record<string, unknown>;
  if (typeof record.name === 'string' && (Object.hasOwn(record, 'modifierOptionId') || Object.hasOwn(record, 'optionId'))) return record.name;
  for (const item of Object.values(record)) {
    const found = findFirstTemplateOptionName(item);
    if (found) return found;
  }
  return undefined;
}

function collectTemplateOptionNames(value: unknown, output: string[] = []): string[] {
  if (Array.isArray(value)) {
    for (const item of value) collectTemplateOptionNames(item, output);
    return [...new Set(output)];
  }
  if (!value || typeof value !== 'object') return [...new Set(output)];
  const record = value as Record<string, unknown>;
  if (typeof record.name === 'string' && (Object.hasOwn(record, 'modifierOptionId')
    || Object.hasOwn(record, 'optionId')
    || Object.hasOwn(record, 'brandModifierOptionId'))) output.push(record.name);
  for (const item of Object.values(record)) collectTemplateOptionNames(item, output);
  return [...new Set(output)];
}

function sameStringSet(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value) => right.includes(value));
}

function fingerprintReportValue(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function isStoreIdentityMatch(
  observed: StoreIdentityObservation,
  expected: { storeId: string; storeName: string },
): boolean {
  return observed.storeId === expected.storeId
    && observed.storeName === expected.storeName
    && observed.visibleStoreName === expected.storeName
    && observed.requestPoiId === expected.storeId
    && observed.localStoragePoiId === expected.storeId
    && observed.localStoragePoiName === expected.storeName;
}

function sameStringSequence(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => right[index] === value);
}

async function withObservedExecutableOperation<Result>(
  operationKey: string,
  method: string,
  action: () => Promise<Result>,
  details?: unknown,
): Promise<Result> {
  const operation = startExecutableOperation({
    executionId: test.info().testId,
    operationKey,
    title: `执行真实接口：${operationKey}`,
    method,
  });
  try {
    const result = await action();
    finishExecutableOperation(operation, 'passed', { details });
    return result;
  } catch (error) {
    finishExecutableOperation(operation, 'failed');
    throw error;
  }
}

// system-test-fingerprint:end seasoning-store-readiness-identity-helpers

function findNamedRecordsByPrefix(value: unknown, prefix: string, output: NamedRecord[] = []): NamedRecord[] {
  if (Array.isArray(value)) {
    for (const item of value) findNamedRecordsByPrefix(item, prefix, output);
    return deduplicate(output);
  }
  if (!value || typeof value !== 'object') return deduplicate(output);
  const record = value as Record<string, unknown>;
  if (typeof record.name === 'string' && record.name.startsWith(prefix) && Number.isFinite(Number(record.id))) {
    output.push({ id: Number(record.id), name: record.name });
  }
  for (const item of Object.values(record)) findNamedRecordsByPrefix(item, prefix, output);
  return deduplicate(output);
}

function findSeasoningGroupRecords(value: unknown, identity: string): NamedRecord[] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return [];
  const data = (value as Record<string, unknown>).data;
  if (!Array.isArray(data)) return [];
  return data.flatMap((item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return [];
    const record = item as Record<string, unknown>;
    return record.name === identity && Number.isFinite(Number(record.id))
      ? [{ id: Number(record.id), name: identity }]
      : [];
  });
}

function deduplicate(records: NamedRecord[]): NamedRecord[] {
  return [...new Map(records.map((record) => [record.id, record])).values()];
}

function readOptionPrice(value: unknown, optionName: string): number | undefined {
  if (Array.isArray(value)) return value.map((item) => readOptionPrice(item, optionName)).find((item) => item !== undefined);
  if (!value || typeof value !== 'object') return undefined;
  const record = value as Record<string, unknown>;
  if (record.name === optionName && Number.isFinite(Number(record.priceAdjustment))) return Number(record.priceAdjustment);
  return Object.values(record).map((item) => readOptionPrice(item, optionName)).find((item) => item !== undefined);
}

function findOptionId(value: unknown, optionName: string): number | undefined {
  if (Array.isArray(value)) return value.map((item) => findOptionId(item, optionName)).find((item) => item !== undefined);
  if (!value || typeof value !== 'object') return undefined;
  const record = value as Record<string, unknown>;
  if (record.name === optionName && Number.isFinite(Number(record.id))) return Number(record.id);
  return Object.values(record).map((item) => findOptionId(item, optionName)).find((item) => item !== undefined);
}

function findAnyOptionId(value: unknown): number | undefined {
  if (Array.isArray(value)) return value.map(findAnyOptionId).find((item) => item !== undefined);
  if (!value || typeof value !== 'object') return undefined;
  const record = value as Record<string, unknown>;
  if (Number.isFinite(Number(record.id)) && (Object.hasOwn(record, 'priceAdjustment') || Object.hasOwn(record, 'optionName'))) return Number(record.id);
  return Object.values(record).map(findAnyOptionId).find((item) => item !== undefined);
}

function findFirstNumericId(value: unknown): number | undefined {
  if (Array.isArray(value)) return value.map(findFirstNumericId).find((item) => item !== undefined);
  if (!value || typeof value !== 'object') return undefined;
  const record = value as Record<string, unknown>;
  if (Number.isFinite(Number(record.id)) && Number(record.id) > 0) return Number(record.id);
  return Object.values(record).map(findFirstNumericId).find((item) => item !== undefined);
}

async function waitForStoreRecord(api: SeasoningDistributionApi, identity: string): Promise<NamedRecord> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < 45_000) {
    const body = await api.storeSeasoningList();
    const record = findNamedRecord(body, identity);
    if (record) return record;
    await new Promise((resolve) => setTimeout(resolve, 750));
  }
  throw new Error(`门店调味下发后 API 未回读：${identity}`);
}

async function waitForStorePageReady(page: Page, identity?: string): Promise<void> {
  await expect(page.locator('body')).not.toContainText(
    /Requesting permissions|Loading permissions|正在加载权限|权限加载/,
    { timeout: 30_000 },
  );
  await expect(page.locator('body')).toContainText(/批量操作|暂无数据|调味名称/, { timeout: 30_000 });
  if (identity) {
    await expect(page.locator('main:visible')).toContainText(identity, { timeout: 30_000 });
  }
}

async function waitForDistributionJob(api: SeasoningDistributionApi, identity: string): Promise<void> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < 45_000) {
    const body = await api.distributionJobList();
    if (JSON.stringify(body).includes(identity)) return;
    await new Promise((resolve) => setTimeout(resolve, 750));
  }
  throw new Error(`调味下发作业 API 未回读：${identity}`);
}

function findStringField(value: unknown, key: string): string | undefined {
  if (Array.isArray(value)) return value.map((item) => findStringField(item, key)).find(Boolean);
  if (!value || typeof value !== 'object') return undefined;
  const record = value as Record<string, unknown>;
  if (typeof record[key] === 'string' && record[key]) return record[key] as string;
  return Object.values(record).map((item) => findStringField(item, key)).find(Boolean);
}

function findFirstSeasoningOptionName(value: unknown): string | undefined {
  if (Array.isArray(value)) return value.map(findFirstSeasoningOptionName).find((item) => item !== undefined);
  if (!value || typeof value !== 'object') return undefined;
  const record = value as Record<string, unknown>;
  if (typeof record.name === 'string' && Object.hasOwn(record, 'priceAdjustment') && record.name.length >= 2) return record.name;
  return Object.values(record).map(findFirstSeasoningOptionName).find((item) => item !== undefined);
}

async function findUniqueVisibleSeasoningOptionName(page: Page, value: unknown): Promise<string | undefined> {
  for (const name of findSeasoningOptionNames(value)) {
    if (await page.locator('main:visible').getByText(name, { exact: true }).count() === 1) return name;
  }
  return undefined;
}

function findAllStringValues(value: unknown, output: string[] = []): string[] {
  if (typeof value === 'string') {
    output.push(value);
    return output;
  }
  if (Array.isArray(value)) {
    for (const item of value) findAllStringValues(item, output);
    return output;
  }
  if (value && typeof value === 'object') {
    for (const item of Object.values(value as Record<string, unknown>)) findAllStringValues(item, output);
  }
  return output;
}

function collectSeasoningOptionNames(value: unknown, output: string[] = []): string[] {
  if (Array.isArray(value)) {
    for (const item of value) collectSeasoningOptionNames(item, output);
    return output;
  }
  if (!value || typeof value !== 'object') return output;
  const record = value as Record<string, unknown>;
  if (typeof record.name === 'string' && Object.hasOwn(record, 'priceAdjustment') && record.name.length >= 2) {
    output.push(record.name);
  }
  for (const item of Object.values(record)) collectSeasoningOptionNames(item, output);
  return output;
}

function findSeasoningOptionNames(value: unknown): string[] {
  return [...new Set(collectSeasoningOptionNames(value))];
}





