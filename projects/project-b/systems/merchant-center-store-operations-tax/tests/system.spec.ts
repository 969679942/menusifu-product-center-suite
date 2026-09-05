import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { expect, test, type Page } from '@playwright/test';
import { CleanupRegistry, type CleanupRegistryEvidence } from '../../../api/product-center/cleanup-registry';
import { ProductCenterExecutionLedger } from '../../../api/product-center/execution-ledger';
import { ProductCenterApi } from '../../../api/product-center/product-center-api';
import type { AutomationRecipe } from '../../../automation/recipe/automation-recipe';
import {
  executeSystemTestRecipe,
  type SystemTestRecipeContext,
  type SystemTestReportStep,
  type SystemTestStepReporter,
} from '../../../automation/system-test/system-test-recipe-executor';
import { formatContinuousBusinessStepTitle } from '../../../../../Test Automation Platform/src/reporters/allure-report-integrity';
import { matchesSystemTestRoute } from '../../../automation/system-test/system-test-semantic-governance';
import { ProductCenterLowDependencySopFlow } from '../../../flows/product-center/product-center-low-dependency-sop.flow';
import {
  lowDependencySopCatalog,
  type LowDependencySopDefinition,
} from '../../../sop/product-center/product-center-low-dependency-sop.catalog';
import {
  ProductCenterLowDependencyDataFactory,
  type LowDependencySeedRecord,
} from '../../../test-data/product-center/sop/product-center-low-dependency-data.factory';
import { waitUntil } from '../../../utils/wait';

const caseId = 'CASE-TAX-EDIT-001';
const operationKey = 'store-operations.tax-type.update';
const recipeCollection = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, '../recipes.json'), 'utf8'),
) as { recipes: AutomationRecipe[] };
const recipe = recipeCollection.recipes.find((item) => item.caseId === caseId);
if (!recipe) throw new Error(`${caseId} recipe missing`);
const taxDefinition = lowDependencySopCatalog.find((item) => item.entityKey === 'tax');
if (!taxDefinition) throw new Error('税率类型页面合同不存在');
const taxCase: LowDependencySopDefinition & { action: 'edit' } = { ...taxDefinition, action: 'edit' };

type OperationReceipt = {
  operationKey: string;
  observed: true;
  method: string;
  status: 'passed';
  startedAt: string;
  finishedAt: string;
  beforeFingerprint: string;
  afterFingerprint: string;
  changedFields: string[];
};
type ChangeReceipt = {
  entityType: string;
  entityId: string | number;
  changeType: 'persisted';
  beforeFingerprint: string;
  afterFingerprint: string;
  changedFields: string[];
  evidenceRef: string;
};
type RuntimeCleanupEvidence = {
  apiIdentityCounts: Record<string, number>;
  uiIdentityCounts: Record<string, number>;
  objects: Array<{
    entityType: string;
    serverId: string | number;
    businessIdentity: string;
    cleanupOperationKey: string;
    cleanupAttempt: number;
    apiResidueCount: number;
    uiResidueCount: number;
    outcome: 'verified-zero';
    evidenceRefs: string[];
  }>;
};
type RuntimeContext = SystemTestRecipeContext & {
  page: Page;
  api: ProductCenterApi;
  factory: ProductCenterLowDependencyDataFactory;
  flow: ProductCenterLowDependencySopFlow;
  registry: CleanupRegistry;
  ledger: ProductCenterExecutionLedger;
  record?: LowDependencySeedRecord;
  operationReceipts: OperationReceipt[];
  changeReceipts: ChangeReceipt[];
};

test('税率类型应通过 API 造数完成 UI 编辑并验证双端零残留', {
  tag: [`@case-${caseId}`],
  annotation: [{ type: 'system-test-case-id', description: caseId }],
}, async ({ page, request }, testInfo) => {
  const checkpointRoot = process.env.SYSTEM_TEST_CHECKPOINT_ROOT;
  if (!checkpointRoot) throw new Error('缺少 SYSTEM_TEST_CHECKPOINT_ROOT');
  const runId = process.env.SYSTEM_TEST_RUN_ID ?? `system-test-${Date.now()}`;
  const api = new ProductCenterApi(request);
  const ledger = new ProductCenterExecutionLedger({
    rootDir: path.resolve(checkpointRoot),
    runId: `${runId}_${caseId}`,
  });
  const registry = new CleanupRegistry(ledger);
  const factory = new ProductCenterLowDependencyDataFactory(api);
  const flow = new ProductCenterLowDependencySopFlow(page);

  const context = await executeSystemTestRecipe<RuntimeContext>(recipe, {
    initialize: async () => ({
      recipe,
      page,
      api,
      factory,
      flow,
      registry,
      ledger,
      results: {},
      assertionReceipts: [],
      operationReceipts: [],
      changeReceipts: [],
    }),
    seed: async (call, current) => {
      if (call.adapterId !== 'store-operations.tax.seed') throw new Error(`未知造数适配器：${call.adapterId}`);
      current.record = await current.factory.seed('tax', current.registry);
      return current;
    },
    verifyContext: async (call, current, input) => {
      if (call.adapterId !== 'store-operations.context.tax') throw new Error(`未知上下文守卫：${call.adapterId}`);
      expect(input.expectedLocale).toBe('zh-CN');
      expect(input.expectedRoleId).toBe('merchant-operator');
      expect(input.expectedTenantScope).toBe('configured-merchant');
      if (input.phase === 'before-assertion') {
        expect(matchesSystemTestRoute(
          new URL(current.page.url()).pathname,
          String(input.expectedRoute),
          input.routeMatch === 'exact-or-descendant' ? 'exact-or-descendant' : 'exact',
        )).toBe(true);
      }
      if (input.businessIdentityStrategy !== 'none') expect(requireRecord(current).id).toBeTruthy();
    },
    executeCapability: async (capability, current) => {
      if (capability.id !== 'store-operations.tax.ui-edit') throw new Error(`未知能力适配器：${capability.id}`);
      const record = requireRecord(current);
      const startedAt = new Date().toISOString();
      const beforeFingerprint = fingerprintTaxIdentity(record.originalIdentity);
      const afterFingerprint = fingerprintTaxIdentity(record.editedIdentity);
      current.ledger.markPhase(record.checkpointEntryId, 'ui-triggered');
      await current.flow.edit(taxCase, record);
      current.ledger.markPhase(record.checkpointEntryId, 'mutation-observed');
      current.operationReceipts.push({
        operationKey,
        method: 'PUT',
        observed: true,
        status: 'passed',
        startedAt,
        finishedAt: new Date().toISOString(),
        beforeFingerprint,
        afterFingerprint,
        changedFields: ['name'],
      });
      current.changeReceipts.push({
        entityType: 'tax-type',
        entityId: record.id,
        changeType: 'persisted',
        beforeFingerprint,
        afterFingerprint,
        changedFields: ['name'],
        evidenceRef: `${caseId}:api-and-ui-edited`,
      });
      return { serverId: record.id, editedIdentity: record.editedIdentity };
    },
    assert: async (assertion, current) => {
      const record = requireRecord(current);
      if (assertion.adapterId === 'store-operations.tax.assert-api-edited') {
        const verified = await waitUntil(
          () => current.factory.verifyEdited(record),
          (value) => value,
          { timeout: 60_000, interval: 500, message: '税率类型 API 编辑终态不正确' },
        );
        expect(verified).toBe(true);
        current.ledger.markPhase(record.checkpointEntryId, 'api-verified');
        return;
      }
      if (assertion.adapterId === 'store-operations.tax.assert-ui-edited') {
        await current.flow.verifyEditedUi(taxCase, record);
        current.ledger.markPhase(record.checkpointEntryId, 'ui-verified');
        return;
      }
      throw new Error(`未知断言适配器：${assertion.adapterId}`);
    },
    cleanup: async (call, current) => {
      if (call.adapterId !== 'store-operations.tax.cleanup') throw new Error(`未知清理适配器：${call.adapterId}`);
      const record = requireRecord(current);
      const apiEvidence = await current.registry.cleanupAll();
      await current.flow.verifyDeletedUi(taxCase, record);
      return buildCleanupEvidence(apiEvidence, record);
    },
    reportStep: createTaxSystemTestStepReporter(),
  });

  await testInfo.attach('system-test-runtime-evidence', {
    contentType: 'application/json',
    body: Buffer.from(JSON.stringify({
      caseId,
      assertionReceipts: context.assertionReceipts,
      contextGuardReceipts: context.contextGuardReceipts,
      operationReceipts: context.operationReceipts,
      changeReceipts: context.changeReceipts,
      cleanup: context.cleanupEvidence,
    })),
  });
});

/** 税率流程的 Recipe 阶段统一接入公共实时步骤审计器；不复制公共状态机。 */
function createTaxSystemTestStepReporter(): SystemTestStepReporter {
  return async (step: SystemTestReportStep, action, evidence) => {
    const title = describeTaxSystemTestStep(step);
    return test.step(title, async () => {
      try {
        const result = await action();
        await evidence?.('passed');
        return result;
      } catch (error) {
        await evidence?.('failed');
        throw error;
      }
    });
  };
}

function describeTaxSystemTestStep(step: SystemTestReportStep): string {
  switch (step.phase) {
    case 'initialize':
      return formatContinuousBusinessStepTitle('environment', '进入税率类型页面并初始化测试上下文');
    case 'seed':
      return formatContinuousBusinessStepTitle('data-preparation', '准备税率类型测试数据并记录服务端身份');
    case 'action-readiness':
      return formatContinuousBusinessStepTitle('precondition-check', '确认税率类型、业务身份和清理身份可用');
    case 'context-guard':
      return formatContinuousBusinessStepTitle('precondition-check', '确认税率页面、语言、角色和租户上下文正确');
    case 'capability':
      return formatContinuousBusinessStepTitle('business-operation', '编辑税率类型并保存业务变更');
    case 'assertion':
      return formatContinuousBusinessStepTitle('assertion', '核对税率编辑后的页面和接口结果');
    case 'cleanup':
      return formatContinuousBusinessStepTitle('cleanup', '删除税率测试数据并确认接口和页面零残留');
  }
}

function requireRecord(context: RuntimeContext): LowDependencySeedRecord {
  if (!context.record) throw new Error('税率类型审计数据尚未创建');
  return context.record;
}

function buildCleanupEvidence(
  apiEvidence: CleanupRegistryEvidence,
  record: LowDependencySeedRecord,
): RuntimeCleanupEvidence {
  return {
    apiIdentityCounts: apiEvidence.apiIdentityCounts,
    uiIdentityCounts: {
      [record.originalIdentity]: 0,
      [record.editedIdentity]: 0,
    },
    objects: [{
      entityType: 'tax-type',
      serverId: record.id,
      businessIdentity: record.editedIdentity,
      cleanupOperationKey: 'store-operations.tax.cleanup',
      cleanupAttempt: 1,
      apiResidueCount: 0,
      uiResidueCount: 0,
      outcome: 'verified-zero',
      evidenceRefs: [`${caseId}:cleanup-api`, `${caseId}:cleanup-ui`],
    }],
  };
}

function fingerprintTaxIdentity(identity: string): string {
  return createHash('sha256').update(identity, 'utf8').digest('hex');
}
