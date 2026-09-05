import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { parseProductCenterMarkdownTestPlan } from '../../utils/product-center-test-plan-markdown';
import {
  fingerprintSystemTestImplementationSource,
  fingerprintSystemTestValue,
  type SystemTestDataProfile,
} from '../../../../Test Automation Platform/src/automation/system-test/system-test-contract';
import { fingerprintSystemTestSemanticSource } from '../../../../Test Automation Platform/src/automation/system-test/system-test-governance';
import {
  compileSystemTestPlan,
  type SystemTestPlan,
} from '../../../../Test Automation Platform/src/automation/system-test/system-test-plan-compiler';
import {
  assertBlockedSourceClassification,
  classifySystemTestSourceStatus,
  type SystemTestApiCatalog,
  type SystemTestSourceStatus,
} from '../../../../Test Automation Platform/src/automation/system-test/system-test-source-status';
import { contextForCase } from '../../test-data/seasoning-context';

type FormalCase = {
  id: string;
  title: string;
  module: string;
  priority: 'P0' | 'P1' | 'P2';
};

type SeasoningBindingRegistry = {
  bindings: Array<{
    caseId: string;
    generationAllowed: boolean;
    executionAllowed?: boolean;
    sourceIds: string[];
    capabilities: Array<{ id: string }>;
    assertions: Array<{ adapterId: string }>;
  }>;
};

const systemId = 'merchant-center-product-center-seasoning';
const systemRoot = path.resolve(__dirname);
const projectRoot = path.resolve(systemRoot, '../..');
const formalPath = path.resolve(
  projectRoot,
  '../Merchant Center Info/00-待转换测试方案/用例库/商品中心-商品管理-调味管理/3.商品中心-商品管理-调味管理-正式测试用例.md',
);
const runtimeAuditPath = path.join(systemRoot, 'runtime-audit.json');
const pageContractAuditPath = path.join(systemRoot, 'page-contract-live-audit.json');
const routeContractDiscoveryPath = path.join(systemRoot, 'route-contract-discovery.json');
const templateAuditPath = path.join(systemRoot, 'template-distribution-live-audit-000420.json');
const templateCreateAuditPath = path.join(systemRoot, 'template-create-live-audit.json');
const fullPageMultiStoreAuditPath = path.join(systemRoot, 'full-page-contract-multi-store-000420.json');
const fullPageSingleStoreAuditPath = path.join(systemRoot, 'full-page-contract-single-store-000407.json');
const apiCatalogPath = path.resolve(projectRoot, '../contracts/api/operations/brand-menu.operations.json');
const intakePath = path.resolve(projectRoot, 'deliverables/system-test-platform/seasoning-intake.json');
const unlandedPath = path.resolve(projectRoot, 'deliverables/system-test-platform/seasoning-unlanded.json');
const blockedSourceAuditQueuePath = path.join(systemRoot, 'blocked-source-audit-queue.json');
const bindingRegistryPath = path.join(systemRoot, 'binding-registry.json');
const route = '/pp/brand/seasoning/list' as const;
const templateRoute = '/pp/brand/seasoning/template' as const;
const templateCreateRoute = '/pp/brand/seasoning/addtemplate' as const;
const recordRoute = '/pp/brand/seasoning/record' as const;
const storeRoute = '/poi/location/seasoning' as const;
const createOperationKey = process.env.PC_SEASONING_CREATE_OPERATION_KEY
  || 'brand-menu:POST /ops-brand/global-modifier';
const seedOperationKey = 'brand-menu:POST /ops-brand/global-modifier/batch';
const updateOperationKey = 'brand-menu:PUT /ops-brand/global-modifier/{id}';
const deleteOperationKey = 'brand-menu:DELETE /ops-brand/global-modifier/{id}';
const featureFlagFingerprint = process.env.PC_FEATURE_FLAG_FINGERPRINT
  || sha256('merchant-center-product-center-seasoning:feature-flags:configured');

type Source = {
  sourceId: string;
  kind: 'formal-case' | 'ui-audit' | 'network-audit';
  path: string;
  fingerprint: string;
  verified: true;
  routes: Array<typeof route | typeof templateRoute | typeof templateCreateRoute | typeof recordRoute | typeof storeRoute>;
  contractIds: string[];
  observationChannels: Array<'ui' | 'api' | 'cleanup'>;
};

function relativeToProject(filePath: string): string {
  return path.relative(projectRoot, filePath).replace(/\\/g, '/');
}

function source(
  sourceId: string,
  kind: Source['kind'],
  filePath: string,
  contractIds: string[],
  observationChannels: Source['observationChannels'],
  routes: Source['routes'] = [route],
): Source {
  return {
    sourceId,
    kind,
    path: relativeToProject(filePath),
    fingerprint: fs.existsSync(filePath)
      ? semanticSourceFingerprint(kind, filePath)
      : sha256(`pending:${sourceId}`),
    verified: true,
    routes,
    contractIds,
    observationChannels,
  };
}

function semanticSourceFingerprint(kind: Source['kind'], filePath: string): string {
  if (kind !== 'ui-audit') return sha256File(filePath);
  try {
    return fingerprintSystemTestSemanticSource(JSON.parse(fs.readFileSync(filePath, 'utf8')));
  } catch {
    return sha256File(filePath);
  }
}

function buildPlan() {
  const formalMarkdown = fs.readFileSync(formalPath, 'utf8');
  const apiCatalog = readApiCatalog(apiCatalogPath);
  const bindingRegistry = readBindingRegistry(bindingRegistryPath);
  const apiOperationKeys = apiCatalog.operationKeys;
  const seasoningApiCandidates = apiOperationKeys.filter((key) => key.includes('/ops-brand/global-modifier'));
  let sourceFormatIssue: string | null = null;
  let formalCases: FormalCase[];
  try {
    formalCases = parseProductCenterMarkdownTestPlan(formalMarkdown).map(({ id, title, module, priority }) => ({ id, title, module, priority }));
  } catch (error) {
    sourceFormatIssue = error instanceof Error ? error.message : String(error);
    formalCases = extractFormalCaseIndex(formalMarkdown);
  }
  const formalCaseById = new Map(formalCases.map((item) => [item.id, item]));
  const executionRegistry = buildExecutionRegistry(formalCaseById, bindingRegistry);
  const executionEligibleCaseIds = executionRegistry.map((item) => item.caseId);

  const formalSource = source(
    'formal:seasoning-test-plan',
    'formal-case',
    formalPath,
    ['route:brand-seasoning-list', 'ui:seasoning-create', 'api:seasoning-record'],
    ['ui', 'api', 'cleanup'],
    [route, templateRoute, templateCreateRoute, recordRoute],
  );
  const auditSource = source(
    'runtime:seasoning-audit',
    'ui-audit',
    runtimeAuditPath,
    ['route:brand-seasoning-list', 'ui:seasoning-create', 'api:seasoning-create'],
    ['ui', 'api'],
  );
  const pageContractSource = source(
    'runtime:seasoning-page-contract',
    'ui-audit',
    pageContractAuditPath,
    ['route:brand-seasoning-list', 'ui:seasoning-create', 'api:seasoning-record'],
    ['ui', 'api'],
    [route, templateRoute, recordRoute],
  );
  const routeContractSource = source(
    'runtime:seasoning-route-contract',
    'ui-audit',
    routeContractDiscoveryPath,
    ['route:brand-seasoning-list', 'route:brand-seasoning-record', 'ui:seasoning-record-query', 'api:seasoning-record'],
    ['ui', 'api'],
    [route, templateRoute, recordRoute],
  );
  const apiSource = source(
    'api:brand-menu-catalog',
    'network-audit',
    apiCatalogPath,
    ['api:seasoning-catalog'],
    ['api'],
    [route, templateRoute, recordRoute],
  );
  const templateAuditSource = source(
    'runtime:seasoning-template-audit',
    'ui-audit',
    templateAuditPath,
    ['route:brand-seasoning-template', 'ui:seasoning-template', 'api:seasoning-template-distribution'],
    ['ui', 'api'],
    [templateRoute],
  );
  const templateCreateSource = source(
    'runtime:seasoning-template-create-audit',
    'ui-audit',
    templateCreateAuditPath,
    ['route:brand-seasoning-template-create', 'ui:seasoning-template-create', 'api:seasoning-template'],
    ['ui', 'api'],
    [templateCreateRoute],
  );
  const fullPageMultiStoreSource = source(
    'runtime:seasoning-full-page-multi-store',
    'ui-audit',
    fullPageMultiStoreAuditPath,
    ['route:store-seasoning-list', 'ui:store-seasoning-list', 'api:store-seasoning-list'],
    ['ui', 'api'],
    [storeRoute],
  );
  const fullPageSingleStoreSource = source(
    'runtime:seasoning-full-page-single-store',
    'ui-audit',
    fullPageSingleStoreAuditPath,
    ['route:store-seasoning-list', 'ui:store-seasoning-list', 'api:store-seasoning-list'],
    ['ui', 'api'],
    [storeRoute],
  );

  const context = {
    environmentId: process.env.MC_TEST_ENV || 'balamxqa',
    locale: process.env.MC_UI_LOCALE || 'zh-CN',
    roleId: 'merchant-operator',
    tenantScope: 'configured-merchant',
    featureFlagFingerprint,
  };

  const plan = {
    schemaVersion: '1.0.0' as const,
    systemId,
    runtimeAuditPath: relativeToProject(runtimeAuditPath),
    executionSelection: {
      strategy: 'new-or-changed-executable-bindings' as const,
    },
    executionContext: context,
    sourceRegistry: {
      schemaVersion: '1.0.0' as const,
      sources: [formalSource, auditSource, pageContractSource, routeContractSource, apiSource, templateAuditSource, templateCreateSource, fullPageMultiStoreSource, fullPageSingleStoreSource],
    },
    governance: {
      schemaVersion: '1.0.0' as const,
      semanticDuplicatePolicy: { enabled: true, requireVariantEvidence: true },
      assertionSurfaces: [
        {
          surfaceId: 'ui.seasoning-list',
          observationChannel: 'ui' as const,
          authority: 'user-visible' as const,
          routes: [route],
          fieldIds: ['seasoning.group-name', 'seasoning.price'],
        },
        {
          surfaceId: 'ui.seasoning-create',
          observationChannel: 'ui' as const,
          authority: 'user-visible' as const,
          routes: [route],
          fieldIds: ['seasoning.group-name', 'seasoning.price'],
        },
        {
          surfaceId: 'api.seasoning-record',
          observationChannel: 'api' as const,
          authority: 'persistence' as const,
          routes: [route],
          fieldIds: ['seasoning.server-id', 'seasoning.price', 'seasoning.group-name'],
        },
        {
          surfaceId: 'ui.seasoning-record',
          observationChannel: 'ui' as const,
          authority: 'user-visible' as const,
          routes: [recordRoute],
          fieldIds: ['seasoning.record-task-name', 'seasoning.record-list'],
        },
        {
          surfaceId: 'ui.seasoning-template',
          observationChannel: 'ui' as const,
          authority: 'user-visible' as const,
          routes: [templateRoute],
          fieldIds: ['seasoning.template-distribution', 'seasoning.store-fields', 'seasoning.template-entry'],
        },
        {
          surfaceId: 'ui.seasoning-template-create',
          observationChannel: 'ui' as const,
          authority: 'user-visible' as const,
          routes: [templateCreateRoute],
          fieldIds: ['seasoning.template-fields', 'seasoning.template-name'],
        },
        {
          surfaceId: 'ui.store-seasoning-list',
          observationChannel: 'ui' as const,
          authority: 'user-visible' as const,
          routes: [storeRoute],
          fieldIds: ['seasoning.store-list', 'seasoning.store-search'],
        },
      ],
      contextGuardPolicy: {
        adapterId: 'merchant-center.seasoning.context',
        phases: ['before-action', 'before-assertion'] as ['before-action', 'before-assertion'],
        requiredChecks: ['route', 'locale', 'role', 'tenant', 'business-identity'],
      },
      feedbackPolicy: {
        exactFeedbackRequiresRuntimeEvidence: true,
        mutationFeedbackRequiresOperationCorrelation: true,
      },
    },
    cases: executionRegistry.map((item) => ({ ...item.build(), executionContextProfile: contextForCase(item.caseId).profile })),
    classifiedExclusions: formalCases
      .filter((item) => !executionEligibleCaseIds.includes(item.id))
      .map((item) => buildClassifiedExclusion(item, apiOperationKeys)),
  };

  const classifiedById = new Map(plan.classifiedExclusions.map((item) => [item.caseId, item]));
  const intakeCases = formalCases.map((item) => {
    const selected = executionEligibleCaseIds.includes(item.id);
    const classification = classifiedById.get(item.id);
    const sourceStatus = selected || classification?.disposition !== 'blocked-source'
      ? null
      : classifySystemTestSourceStatus({
          apiCatalog,
          requiredOperationKeys: classification.apiMappings
            .flatMap((mapping) => mapping.operationKey ? [mapping.operationKey] : []),
          candidateOperationKeys: seasoningApiCandidates,
          mappedOperationKeys: classification.apiMappings
            .filter((mapping) => mapping.status === 'mapped')
            .flatMap((mapping) => mapping.operationKey ? [mapping.operationKey] : []),
          requiredObservationChannels: classification.assertionSurfaceAssessment.requiredChannels,
          availableObservationChannels: classification.assertionSurfaceAssessment.availableChannels,
        });
    if (!selected && classification?.disposition === 'blocked-source' && sourceStatus) {
      assertBlockedSourceClassification({ apiCatalog, sourceStatus });
    }
    return {
      caseId: item.id,
      title: item.title,
      module: item.module,
      priority: item.priority,
      formalSource: relativeToProject(formalPath),
      status: selected ? 'ready' : classification!.disposition,
      sourceStatus,
      reason: selected
        ? '当前正式绑定的实现或断言面发生变化，已进入定向重验选择。'
        : classification!.reason,
      recoveryCondition: selected
        ? '定向执行完成并生成覆盖全部断言面的当前标准收据。'
        : classification!.recoveryCondition,
      ...(classification ? {
        assertionSurfaceAssessment: classification.assertionSurfaceAssessment,
        apiMappings: classification.apiMappings,
        missingCapabilities: classification.missingCapabilities,
      } : {}),
    };
  });
  writeJson(intakePath, {
    schemaVersion: '1.0.0',
    collectionId: 'merchant-center-seasoning-intake',
    generatedAt: new Date().toISOString(),
    formalSource: relativeToProject(formalPath),
    formalSourceFingerprint: sha256File(formalPath),
    summary: {
      formalCases: formalCases.length,
      executionEligible: executionEligibleCaseIds.length,
      executable: executionEligibleCaseIds.length,
      classifiedExclusions: formalCases.length - executionEligibleCaseIds.length,
      dispositions: countDispositions(plan.classifiedExclusions),
      sourceStatus: countSourceStatuses(intakeCases),
      apiCatalog: {
        path: relativeToProject(apiCatalogPath),
        fingerprint: apiCatalog.fingerprint,
        operationCount: apiCatalog.operationKeys.length,
      },
      sourceFormatIssue,
    },
    cases: intakeCases,
  });
  writeJson(unlandedPath, {
    schemaVersion: '1.0.0',
    collectionId: 'merchant-center-seasoning-unlanded',
    generatedAt: new Date().toISOString(),
    reason: '未落地不等于删除，表示当前未满足来源与自动化绑定门禁。',
    sourceStatusPolicy: '生成 blocked-source 前必须完成 API 文档目录检查，并记录五类来源状态之一。',
    apiCatalog: {
      path: relativeToProject(apiCatalogPath),
      fingerprint: apiCatalog.fingerprint,
      operationCount: apiCatalog.operationKeys.length,
    },
    cases: intakeCases.filter((item) => item.status !== 'ready'),
  });
  const blockedSourceCases = intakeCases
    .filter((item) => item.status === 'blocked-source')
    .map((item) => {
      const classification = classifiedById.get(item.caseId);
      return {
        caseId: item.caseId,
        title: item.title,
        queueStatus: 'pending-auto-audit' as const,
        owner: 'automation' as const,
        humanActionRequired: false,
        executionContextProfile: contextForCase(item.caseId).profile,
        route: classification?.route ?? null,
        scenarioFamilyId: classification?.semantics.scenarioFamilyId ?? 'unknown',
        requiredObservationChannels: classification?.assertionSurfaceAssessment.requiredChannels ?? [],
        missingEvidence: classification?.assertionSurfaceAssessment.missingEvidence ?? [],
        auditActions: [
          '使用 UI OAuth 登录流进入真实路由。',
          '采集可见控件、字段、弹窗顺序、稳定终态与实际请求映射。',
          '涉及写入时使用 AUTO_AUDIT 身份、记录服务端 ID，并在 finally 中执行 UI/API 零残留清理。',
          '合同完整后重新编译并把该 caseId 放入增量 execution-selection。',
        ],
        recoveryCondition: '逐用例页面合同、请求映射和清理证据完成后重新编译。',
      };
    });
  writeJson(blockedSourceAuditQueuePath, {
    schemaVersion: '1.0.0',
    queueId: `${systemId}:blocked-source-audit`,
    generatedAt: new Date().toISOString(),
    policy: {
      disposition: 'blocked-source',
      queueStatus: 'pending-auto-audit',
      humanActionRequired: false,
      note: '来源阻断仅表示自动化合同尚未补齐；不得要求业务人员提供控件或手工执行，也不得直接生成空壳绑定。',
    },
    summary: {
      total: blockedSourceCases.length,
      byProfile: blockedSourceCases.reduce<Record<string, number>>((acc, item) => {
        acc[item.executionContextProfile] = (acc[item.executionContextProfile] ?? 0) + 1;
        return acc;
      }, {}),
      byScenarioFamily: blockedSourceCases.reduce<Record<string, number>>((acc, item) => {
        acc[item.scenarioFamilyId] = (acc[item.scenarioFamilyId] ?? 0) + 1;
        return acc;
      }, {}),
    },
    cases: blockedSourceCases,
  });
  return { plan, formalCases, context, createOperationKey, sourceFormatIssue };
}

function readBindingRegistry(filePath: string): SeasoningBindingRegistry {
  if (!fs.existsSync(filePath)) throw new Error(`调味绑定注册表不存在：${filePath}`);
  const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8')) as SeasoningBindingRegistry;
  if (!Array.isArray(parsed.bindings)) throw new Error(`调味绑定注册表格式无效：${filePath}`);
  return parsed;
}

type RegisteredPlanCase =
  | ReturnType<typeof buildBoundaryCase>
  | ReturnType<typeof buildNegativeCase>
  | ReturnType<typeof buildMinimalCreateCase>
  | ReturnType<typeof buildDeleteEmptyGroupCase>
  | ReturnType<typeof buildEditGroupCase>
  | ReturnType<typeof buildRoundingCase>
  | ReturnType<typeof buildRecordTaskSearchCase>
  | ReturnType<typeof buildRecordResetCase>
  | ReturnType<typeof buildTemplateCreateAuditCase>
  | ReturnType<typeof buildTemplateDistributionAuditCase>
  | ReturnType<typeof buildSingleStoreTemplateAbsenceCase>
  | ReturnType<typeof buildStoreMutationCase>
  | ReturnType<typeof buildUiMutationCase>
  | ReturnType<typeof buildStaticContractCase>;
type RegisteredCase = { caseId: string; build: () => RegisteredPlanCase };

function buildExecutionRegistry(formalCases: ReadonlyMap<string, FormalCase>, bindingRegistry: SeasoningBindingRegistry): RegisteredCase[] {
  const buildersByCapability: Record<string, (formalCase: FormalCase) => RegisteredPlanCase> = {
    'merchant-center.seasoning.create-boundary': buildBoundaryCase,
    'merchant-center.seasoning.price-correction': buildNegativeCase,
    'merchant-center.seasoning.create-minimal': buildMinimalCreateCase,
    'merchant-center.seasoning.delete-empty-group': buildDeleteEmptyGroupCase,
    'merchant-center.seasoning.edit-group': buildEditGroupCase,
    'merchant-center.seasoning.rounding': buildRoundingCase,
    'merchant-center.seasoning.record-task-search': buildRecordTaskSearchCase,
    'merchant-center.seasoning.record-reset': buildRecordResetCase,
    'merchant-center.seasoning.template-create-audit': buildTemplateCreateAuditCase,
    'merchant-center.seasoning.template-distribution-audit': buildTemplateDistributionAuditCase,
    'merchant-center.seasoning.single-store-template-absence': buildSingleStoreTemplateAbsenceCase,
    'merchant-center.seasoning.store-replace-distribution': buildStoreMutationCase,
    'merchant-center.seasoning.store-delete-group': buildStoreMutationCase,
    'merchant-center.seasoning.store-delete-option': buildStoreMutationCase,
    'merchant-center.seasoning.store-batch-delete': buildStoreMutationCase,
    'merchant-center.seasoning.store-redeliver-restore': buildStoreMutationCase,
    'merchant-center.seasoning.template-name-normalization': buildStaticContractCase,
    'merchant-center.seasoning.ui-mutation': buildUiMutationCase,
    'merchant-center.seasoning.static-contract': buildStaticContractCase,
  };
  const registered = bindingRegistry.bindings
    .filter((binding) => binding.generationAllowed === true && binding.executionAllowed !== false)
    .map((binding) => {
      const formalCase = formalCases.get(binding.caseId);
      if (!formalCase) throw new Error(`${binding.caseId}:BINDING_REGISTRY_FORMAL_CASE_NOT_FOUND`);
      if (!binding.sourceIds.length || !binding.capabilities.length || !binding.assertions.length) {
        throw new Error(`${binding.caseId}:BINDING_REGISTRY_CONTRACT_INCOMPLETE`);
      }
      const builder = binding.capabilities
        .map((capability) => buildersByCapability[capability.id])
        .find((candidate): candidate is ((formalCase: FormalCase) => RegisteredPlanCase) => Boolean(candidate));
      if (!builder) throw new Error(`${binding.caseId}:BINDING_REGISTRY_IMPLEMENTATION_BUILDER_NOT_FOUND`);
      const planCase = builder(formalCase);
      assertSameBindingValues(binding.caseId, 'SOURCE', binding.sourceIds, planCase.sourceIds);
      assertSameBindingValues(
        binding.caseId,
        'CAPABILITY',
        binding.capabilities.map((item) => item.id),
        planCase.capabilities.map((item) => item.id),
      );
      assertSameBindingValues(
        binding.caseId,
        'ASSERTION_ADAPTER',
        binding.assertions.map((item) => item.adapterId),
        planCase.expectations.map((item) => item.assertionAdapterId),
      );
      return { caseId: binding.caseId, build: () => planCase };
    })
    .filter((item): item is RegisteredCase => Boolean(item));
  const ids = new Set<string>();
  for (const item of registered) {
    if (ids.has(item.caseId)) throw new Error(`${item.caseId}:BINDING_REGISTRY_CASE_DUPLICATE`);
    ids.add(item.caseId);
  }
  return registered.sort((left, right) => left.caseId.localeCompare(right.caseId));
}

function assertSameBindingValues(
  caseId: string,
  surface: 'SOURCE' | 'CAPABILITY' | 'ASSERTION_ADAPTER',
  declared: readonly string[],
  implemented: readonly string[],
): void {
  const normalize = (values: readonly string[]) => [...new Set(values)].sort();
  if (JSON.stringify(normalize(declared)) !== JSON.stringify(normalize(implemented))) {
    throw new Error(`${caseId}:BINDING_REGISTRY_${surface}_MISMATCH`);
  }
}

function readApiCatalog(filePath: string): SystemTestApiCatalog {
  if (!fs.existsSync(filePath)) throw new Error(`生成 blocked-source 前缺少 API 文档目录：${filePath}`);
  const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8')) as unknown;
  if (!Array.isArray(parsed)) throw new Error(`API 文档目录格式无效，必须是 operation 数组：${filePath}`);
  const operationKeys = parsed
    .map((item) => (item && typeof item === 'object' ? (item as { operationKey?: unknown }).operationKey : undefined))
    .filter((value): value is string => typeof value === 'string' && value.trim().length > 0);
  const catalog: SystemTestApiCatalog = {
    checked: true,
    sourcePath: relativeToProject(filePath),
    fingerprint: sha256File(filePath),
    operationKeys,
  };
  return catalog;
}

function countSourceStatuses(cases: readonly { sourceStatus: SystemTestSourceStatus | null }[]): Partial<Record<SystemTestSourceStatus, number>> {
  const counts: Partial<Record<SystemTestSourceStatus, number>> = {};
  for (const item of cases) {
    if (item.sourceStatus) counts[item.sourceStatus] = (counts[item.sourceStatus] ?? 0) + 1;
  }
  return counts;
}

function countDispositions(cases: readonly { disposition: string }[]): Record<string, number> {
  return cases.reduce<Record<string, number>>((counts, item) => {
    counts[item.disposition] = (counts[item.disposition] ?? 0) + 1;
    return counts;
  }, {});
}

function buildClassifiedExclusion(formalCase: FormalCase, apiOperationKeys: readonly string[]) {
  const disposition = exclusionDisposition(formalCase.id);
  const requiredChannels = requiredObservationChannels(formalCase.id, formalCase.title);
  const apiMappings = mappedOperations(formalCase.id, apiOperationKeys);
  const mappedApi = apiMappings.some((item) => item.status === 'mapped');
  const availableChannels = mappedApi && requiredChannels.includes('api') ? ['api' as const] : [];
  const missingEvidence = requiredChannels
    .filter((channel) => !availableChannels.includes(channel as 'api'))
    .map((channel) => ({ channel, reason: missingEvidenceReason(channel, formalCase.id) }));
  const missingCapabilities = missingCapabilitiesFor(formalCase.id, disposition);
  const caseRoute = formalCase.id.includes('-REC-')
    ? recordRoute
    : formalCase.id.includes('-TPL-') ? templateRoute
      : formalCase.id.includes('-SEA-') ? route
        : formalCase.id.includes('-XMOD-') ? storeRoute : null;
  const family = semanticFamily(formalCase.title);
  const exclusionSourceIds = formalCase.id === 'TC-FLV-SEA-042'
    ? ['formal:seasoning-test-plan', 'runtime:seasoning-full-page-single-store', 'api:brand-menu-catalog']
    : formalCase.id.includes('-XMOD-')
      ? ['formal:seasoning-test-plan', 'runtime:seasoning-full-page-multi-store', 'api:brand-menu-catalog']
      : ['formal:seasoning-test-plan', 'api:brand-menu-catalog'];
  return {
    caseId: formalCase.id,
    title: formalCase.title,
    disposition,
    executionContextProfile: contextForCase(formalCase.id).profile,
    sourceIds: exclusionSourceIds,
    route: caseRoute,
    semantics: {
      businessObjectId: businessObjectFor(formalCase.id),
      scenarioFamilyId: family,
      stateTransitionId: semanticTransition(family),
      scopeId: scopeFor(formalCase.id),
      variantId: formalCase.id.toLowerCase(),
      variantSourceIds: ['formal:seasoning-test-plan'],
      businessIdentityStrategy: family === 'display' || family === 'search' || family === 'reset' ? 'none' as const : 'unique-marker' as const,
    },
    assertionSurfaceAssessment: { requiredChannels, availableChannels, missingEvidence },
    contextAssessment: {
      status: disposition === 'deferred'
        ? 'blocked-technical' as const
        : disposition === 'blocked-technical' ? 'blocked-technical' as const : 'blocked-source' as const,
      reason: contextReason(formalCase.id, disposition),
    },
    apiMappings,
    missingCapabilities: refinedMissingCapabilities(formalCase.id, missingCapabilities),
    reason: disposition === 'deferred'
      ? ['TC-FLV-XMOD-007', 'TC-FLV-XMOD-008', 'TC-FLV-XMOD-009', 'TC-FLV-XMOD-010'].includes(formalCase.id)
        ? '按用户确认的本轮范围跳过 POS 验证；正式用例保留，未执行且不得判通过。'
        : `正式用例保留，但当前缺少 ${refinedMissingCapabilities(formalCase.id, missingCapabilities).join('、')}，本轮不得执行或判通过。`
      : disposition === 'blocked-technical'
        ? `现有接口合同不足以替代页面/下游终态，且当前缺少 ${refinedMissingCapabilities(formalCase.id, missingCapabilities).join('、')}。`
        : `正式来源存在，但 ${missingEvidence.map((item) => item.reason).join('；')}，禁止猜测绑定。`,
    recoveryCondition: disposition === 'blocked-source'
      ? '完成该 caseId 的定向页面/网络审计，登记唯一 locator、字段、终态、操作键和清理策略后重新编译。'
      : `提供并验证 ${refinedMissingCapabilities(formalCase.id, missingCapabilities).join('、')}，取得当前上下文的 UI/API/下游证据后重新编译并定向执行。`,
  };
}

function refinedMissingCapabilities(caseId: string, capabilities: string[]): string[] {
  if (caseId.includes('-TPL-')) {
    return caseId === 'TC-FLV-TPL-006'
      ? ['SCH 单门店入口页面合同']
      : capabilities.filter((item) => item !== '多门店品牌租户');
  }
  if (caseId.includes('-XMOD-')) return capabilities.filter((item) => item !== '已认证门店上下文');
  return capabilities;
}

function exclusionDisposition(caseId: string): 'deferred' | 'blocked-source' | 'blocked-technical' {
  if (caseId.includes('-POS-') || ['TC-FLV-SEA-001', 'TC-FLV-SEA-038', 'TC-FLV-SEA-039'].includes(caseId)) return 'deferred';
  // POS is an explicit scope exclusion for these store cases. The store-side
  // contract remains executable for XMOD-011 because its POS assertion is optional.
  if (['TC-FLV-XMOD-007', 'TC-FLV-XMOD-008', 'TC-FLV-XMOD-009', 'TC-FLV-XMOD-010'].includes(caseId)) return 'deferred';
  if (caseId.includes('-XMOD-') || caseId.includes('-TPL-') || caseId === 'TC-FLV-SEA-042') {
    return 'blocked-technical';
  }
  return 'blocked-source';
}

function requiredObservationChannels(caseId: string, title: string): Array<'ui' | 'api' | 'downstream' | 'cleanup'> {
  if (caseId.includes('-POS-')) return ['downstream'];
  if (['TC-FLV-SEA-038', 'TC-FLV-SEA-039', 'TC-FLV-XMOD-007', 'TC-FLV-XMOD-008', 'TC-FLV-XMOD-009', 'TC-FLV-XMOD-010'].includes(caseId)) {
    return ['ui', 'api', 'downstream'];
  }
  if (/新增|删除|编辑|保存|批量|排序|下发|选择|启用|停用|同步|覆盖/.test(title) || caseId.includes('-REC-') || caseId.includes('-XMOD-')) {
    return ['ui', 'api'];
  }
  return ['ui'];
}

function mappedOperations(caseId: string, knownOperations: readonly string[]) {
  const candidates: Array<{ operationKey: string | null; status: 'mapped' | 'conditional' | 'missing' | 'not-required'; reason: string }> = [];
  const add = (operationKey: string, reason: string, status: 'mapped' | 'conditional' = 'mapped') => {
    candidates.push({
      operationKey,
      status: knownOperations.includes(operationKey) ? status : 'missing',
      reason: knownOperations.includes(operationKey) ? reason : `当前 API 目录未找到 ${operationKey}。`,
    });
  };
  if (caseId.includes('-SEA-')) {
    if (/-(009|010|011|012|013|014|017|019|020|021|022|023|024|025|026|027|044|045)$/.test(caseId)) add(createOperationKey, '品牌调味创建或创建校验的持久化候选。');
    if (/-(028)$/.test(caseId)) add('brand-menu:DELETE /ops-brand/global-modifier/options/{optionId}', '删除单个调味项。');
    if (/-(029|031|036)$/.test(caseId)) add(deleteOperationKey, '删除品牌调味组。');
    if (/-(033|035)$/.test(caseId)) add('brand-menu:PUT /ops-brand/global-modifier/options/{optionId}', '更新单个调味项。');
    if (/-(037)$/.test(caseId)) add('brand-menu:POST /ops-brand/global-modifier/options/batch-move', '批量移动调味项。');
    if (/-(038|039)$/.test(caseId)) {
      add('brand-menu:PUT /ops-brand/global-modifier/options/batch-status', '批量更新调味项状态。');
      add('brand-menu:GET /internal/pos/pull/global-modifier', 'POS 拉取全局调味的直接观测接口。');
    }
    if (/-(040)$/.test(caseId)) add(updateOperationKey, '保存调味组内调味项排序。');
    if (/-(041)$/.test(caseId)) add('brand-menu:PUT /ops-brand/global-modifier/sort', '保存调味组排序。');
    if (/-(042)$/.test(caseId)) add('brand-menu:POST /ops-brand/brand-modifier-sync/all', '品牌调味下发。');
  }
  if (caseId.includes('-TPL-')) {
    add('brand-menu:GET /ops-brand/modifier-template/page', '调味模板列表与查询。');
    if (/-(010|011|012|013|014|015|016)$/.test(caseId)) add('brand-menu:POST /ops-brand/modifier-template', '创建调味模板。');
    if (/-(017|018|019|024|025)$/.test(caseId)) add('brand-menu:PUT /ops-brand/modifier-template/{id}', '更新调味模板。');
    if (/-(020|021)$/.test(caseId)) add('brand-menu:DELETE /ops-brand/modifier-template/{id}', '删除调味模板。');
    if (/-(022|023|024)$/.test(caseId)) add('brand-menu:POST /ops-brand/brand-modifier-sync/by-template', '按模板创建下发作业。');
  }
  if (caseId.includes('-REC-')) add('brand-menu:POST /ops-brand/brand-modifier-sync/job/list', '调味下发记录列表。');
  if (caseId.includes('-XMOD-')) {
    add('brand-menu:GET /ops-poi/global-modifier/list', '门店全局调味列表。');
    if (/-(004)$/.test(caseId)) add('brand-menu:DELETE /ops-poi/global-modifier/{id}', '删除门店调味组。');
    if (/-(005)$/.test(caseId)) add('brand-menu:DELETE /ops-poi/global-modifier/option/{optionId}', '删除门店调味项。');
    if (/-(006)$/.test(caseId)) add('brand-menu:POST /ops-poi/global-modifier/batch-delete', '门店批量删除调味。');
    if (/-(007|008|010)$/.test(caseId)) add('brand-menu:GET /internal/pos/pull/global-modifier', 'POS 拉取门店全局调味的直接观测接口。');
    if (/-(008)$/.test(caseId)) add('brand-menu:GET /ops-poi/poi-modifiers/push', '门店手动同步至 POS。');
    if (/-(009)$/.test(caseId)) {
      add('brand-menu:PUT /ops-brand/brand-modifier-sync/task/resume/{taskId}', '恢复调味同步任务。');
      add('brand-menu:PUT /ops-brand/brand-modifier-sync/job/resume/{jobId}', '恢复调味同步作业。');
    }
  }
  if (caseId === 'TC-FLV-SEA-042') {
    add('brand-menu:GET /ops-poi/global-modifier/list', '下发后门店调味列表终态。');
  }
  if (caseId.includes('-POS-') && /-(001|002|003|004|005)$/.test(caseId)) {
    add('brand-menu:GET /internal/pos/pull/global-modifier', 'POS 拉取全局调味的直接观测接口。');
  }
  if (candidates.length === 0) {
    candidates.push({ operationKey: null, status: 'not-required', reason: '当前正式预期以 UI 展示为权威，未找到必要 API 断言面。' });
  }
  return candidates.map((item) => ({ ...item, sourceIds: ['api:brand-menu-catalog'] }));
}

function missingCapabilitiesFor(caseId: string, disposition: string): string[] {
  if (disposition === 'blocked-source') return [];
  if (caseId === 'TC-FLV-SEA-001') return ['专用空数据商户或经验证可恢复快照'];
  if (caseId.includes('-POS-')) return ['已认证 POS 终端', '订单与支付测试数据', '打印或客显/KDS 设备能力'];
  if (['TC-FLV-SEA-038', 'TC-FLV-SEA-039'].includes(caseId)) return ['已认证 POS 终端', '品牌调味下发上下文'];
  if (caseId === 'TC-FLV-SEA-042') return ['单门店品牌租户', '门店全局调味页面合同'];
  if (caseId.startsWith('TC-FLV-TPL-')) return ['多门店品牌租户', '调味模板下发与门店回读适配器'];
  return ['已认证门店上下文', '门店全局调味页面适配器', '可核验 POS 同步终态'];
}

function missingEvidenceReason(channel: 'ui' | 'api' | 'downstream' | 'cleanup', caseId: string): string {
  if (channel === 'ui') return `缺少 ${caseId} 当前精确控件、字段、弹窗顺序与可见终态证据`;
  if (channel === 'api') return `缺少 ${caseId} 页面动作与具体请求载荷/服务端身份的逐字段映射`;
  if (channel === 'downstream') return `缺少 ${caseId} POS、门店或终端当前可观察终态`;
  return `缺少 ${caseId} 全部身份变体的零残留证据`;
}

function contextReason(caseId: string, disposition: string): string {
  if (caseId === 'TC-FLV-SEA-001') return '用户已明确延期；当前缺少可安全制造并恢复品牌调味空态的数据环境。';
  if (caseId.includes('-POS-')) return '当前浏览器与 Playwright 配置没有可复用的 POS 终端身份和设备上下文。';
  if (caseId.includes('-XMOD-')) return '当前执行上下文仅证明品牌商户身份，未证明目标门店上下文。';
  if (disposition === 'blocked-technical') return '正式场景要求单/多门店品牌或下发终态，当前租户能力未验证。';
  return '目标品牌路由已知，但该 caseId 的精确页面状态和业务数据前置尚未审计。';
}

function businessObjectFor(caseId: string): string {
  if (caseId.includes('-TPL-')) return 'merchant-center.seasoning-template';
  if (caseId.includes('-REC-')) return 'merchant-center.seasoning-distribution-record';
  if (caseId.includes('-XMOD-')) return 'merchant-center.store-global-seasoning';
  if (caseId.includes('-POS-')) return 'menusifu.pos-global-seasoning';
  return 'merchant-center.seasoning-group';
}

function scopeFor(caseId: string): string {
  if (caseId.includes('-POS-')) return 'configured-pos-terminal';
  if (caseId.includes('-XMOD-')) return 'configured-store-global-seasoning';
  if (caseId.includes('-TPL-')) return 'configured-merchant-seasoning-template';
  if (caseId.includes('-REC-')) return 'configured-merchant-seasoning-record';
  return 'configured-merchant-brand-seasoning';
}

function semanticFamily(title: string): string {
  if (/展示|字段/.test(title)) return 'display';
  if (/查询/.test(title)) return 'search';
  if (/重置/.test(title)) return 'reset';
  if (/新增|创建|选择.*成功/.test(title)) return 'create';
  if (/删除/.test(title)) return 'delete';
  if (/编辑|修改|改价/.test(title)) return 'edit';
  if (/批量/.test(title)) return 'batch-change';
  if (/排序|拖动/.test(title)) return 'sort';
  if (/下发|覆盖/.test(title)) return 'distribution';
  if (/同步/.test(title)) return 'sync';
  if (/打印/.test(title)) return 'print';
  if (/点单|订单|支付/.test(title)) return 'order';
  return 'validation';
}

function semanticTransition(family: string): string {
  return ({
    display: 'state-to-visible', search: 'unfiltered-to-filtered', reset: 'filtered-to-default', create: 'absent-to-created',
    delete: 'existing-to-absent', edit: 'existing-to-edited', 'batch-change': 'selected-to-batch-updated',
    sort: 'unordered-to-ordered', distribution: 'source-to-store-synchronized', sync: 'store-to-pos-synchronized',
    print: 'order-to-printed', order: 'draft-to-paid', validation: 'input-to-validated',
  } as Record<string, string>)[family] ?? 'state-to-observed';
}

function buildMinimalCreateCase(formalCase: FormalCase) {
  return {
    caseId: formalCase.id,
    ruleId: `RULE-${formalCase.id}`,
    title: formalCase.title,
    sourceIds: ['formal:seasoning-test-plan', 'runtime:seasoning-audit'],
    route,
    action: 'create' as const,
    dataProfileId: 'seasoning-create-reversible',
    coverageIds: ['route:brand-seasoning-list', 'ui:seasoning-create', 'api:seasoning-create', 'cleanup:seasoning-zero-residue'],
    contractIds: ['route:brand-seasoning-list', 'ui:seasoning-create', 'api:seasoning-create'],
    conditions: ['已建立目标商户认证会话。', '当前审计已确认调味新增入口、必填名称字段和创建请求合同。'],
    actions: ['打开调味列表并进入自定义新增页面。', '仅填写调味组名称和调味项名称后确认保存。'],
    expectations: [
      {
        expected: '调味列表显示本次新增的调味组名称和调味项名称。',
        assertionAdapterId: 'merchant-center.seasoning.assert-ui-created',
        observationChannel: 'ui' as const,
        authority: 'user-visible' as const,
        terminalCondition: '列表接口稳定后，唯一调味组身份和调味项名称均可见。',
        fieldId: 'seasoning.group-name',
        assertionSurfaceId: 'ui.seasoning-list',
        sourceIds: ['formal:seasoning-test-plan', 'runtime:seasoning-audit'],
        contractIds: ['route:brand-seasoning-list', 'ui:seasoning-create'],
      },
      {
        expected: '调味查询接口可按服务端 ID 取得本次新增记录。',
        assertionAdapterId: 'merchant-center.seasoning.assert-api-identity',
        observationChannel: 'api' as const,
        authority: 'persistence' as const,
        terminalCondition: '服务端详情记录 ID 与唯一业务身份一致。',
        fieldId: 'seasoning.server-id',
        assertionSurfaceId: 'api.seasoning-record',
        sourceIds: ['formal:seasoning-test-plan', 'runtime:seasoning-audit'],
        contractIds: ['api:seasoning-record'],
      },
    ],
    capabilities: [{ id: 'merchant-center.seasoning.create-minimal' }],
    mutation: { method: 'POST' as const, operationKey: createOperationKey },
    semantics: {
      businessObjectId: 'merchant-center.seasoning-group',
      scenarioFamilyId: `minimal-create-${formalCase.id}`,
      stateTransitionId: 'absent-to-created',
      scopeId: 'configured-merchant-brand-seasoning',
      variantId: formalCase.id === 'TC-FLV-SEA-018' ? 'required-fields-only' : `formal-variant-${formalCase.id}`,
      variantSourceIds: ['formal:seasoning-test-plan'],
      businessIdentityStrategy: 'unique-marker' as const,
    },
  };
}

function buildEditGroupCase(formalCase: FormalCase) {
  return {
    caseId: formalCase.id,
    ruleId: `RULE-${formalCase.id}`,
    title: formalCase.title,
    sourceIds: ['formal:seasoning-test-plan', 'runtime:seasoning-audit'],
    route,
    action: 'edit' as const,
    dataProfileId: 'seasoning-edit-reversible',
    coverageIds: ['route:brand-seasoning-list', 'ui:seasoning-edit', 'api:seasoning-edit', 'cleanup:seasoning-zero-residue'],
    contractIds: ['route:brand-seasoning-list', 'ui:seasoning-create', 'api:seasoning-record'],
    conditions: ['API 已创建并登记唯一调味组服务端 ID。'],
    actions: ['在调味列表精确定位唯一调味组。', '通过该组操作菜单进入编辑页，修改组名称并确认保存。'],
    expectations: [
      {
        expected: '列表显示编辑后组名且不再显示原组名。',
        assertionAdapterId: 'merchant-center.seasoning.assert-ui-edited',
        observationChannel: 'ui' as const,
        authority: 'user-visible' as const,
        terminalCondition: '列表稳定后仅编辑身份可见。',
        fieldId: 'seasoning.group-name',
        assertionSurfaceId: 'ui.seasoning-list',
        sourceIds: ['formal:seasoning-test-plan', 'runtime:seasoning-audit'],
        contractIds: ['route:brand-seasoning-list', 'ui:seasoning-create'],
      },
      {
        expected: 'API 详情与列表均保存编辑后组名。',
        assertionAdapterId: 'merchant-center.seasoning.assert-api-edited',
        observationChannel: 'api' as const,
        authority: 'persistence' as const,
        terminalCondition: '原身份不存在，编辑身份仍绑定原服务端 ID。',
        fieldId: 'seasoning.group-name',
        assertionSurfaceId: 'api.seasoning-record',
        sourceIds: ['formal:seasoning-test-plan', 'runtime:seasoning-audit'],
        contractIds: ['api:seasoning-record'],
      },
    ],
    capabilities: [{ id: 'merchant-center.seasoning.edit-group' }],
    mutation: { method: 'PUT' as const, operationKey: updateOperationKey },
    semantics: {
      businessObjectId: 'merchant-center.seasoning-group',
      scenarioFamilyId: 'edit-group',
      stateTransitionId: 'existing-to-edited',
      scopeId: 'configured-merchant-brand-seasoning',
      variantId: 'group-name',
      variantSourceIds: ['formal:seasoning-test-plan'],
      businessIdentityStrategy: 'server-id' as const,
    },
  };
}

function buildDeleteEmptyGroupCase(formalCase: FormalCase) {
  return {
    caseId: formalCase.id,
    ruleId: `RULE-${formalCase.id}`,
    title: formalCase.title,
    sourceIds: ['formal:seasoning-test-plan', 'runtime:seasoning-audit'],
    route,
    action: 'delete' as const,
    dataProfileId: 'seasoning-delete-reversible',
    coverageIds: ['route:brand-seasoning-list', 'ui:seasoning-delete', 'api:seasoning-delete', 'cleanup:seasoning-zero-residue'],
    contractIds: ['route:brand-seasoning-list', 'ui:seasoning-create', 'api:seasoning-record'],
    conditions: ['API 已创建并登记不含调味项的唯一调味组服务端 ID。'],
    actions: ['在调味列表精确定位唯一空调味组。', '通过该组操作菜单删除并完成二次确认。'],
    expectations: [
      {
        expected: '确认删除后列表不再显示该调味组。',
        assertionAdapterId: 'merchant-center.seasoning.assert-ui-deleted',
        observationChannel: 'ui' as const,
        authority: 'user-visible' as const,
        terminalCondition: '列表稳定后原身份和编辑身份均不可见。',
        fieldId: 'seasoning.group-name',
        assertionSurfaceId: 'ui.seasoning-list',
        sourceIds: ['formal:seasoning-test-plan', 'runtime:seasoning-audit'],
        contractIds: ['route:brand-seasoning-list', 'ui:seasoning-create'],
      },
      {
        expected: 'API 列表与详情均不存在该服务端记录。',
        assertionAdapterId: 'merchant-center.seasoning.assert-api-deleted',
        observationChannel: 'api' as const,
        authority: 'persistence' as const,
        terminalCondition: '按服务端 ID 和全部身份变体均查询不到记录。',
        fieldId: 'seasoning.server-id',
        assertionSurfaceId: 'api.seasoning-record',
        sourceIds: ['formal:seasoning-test-plan', 'runtime:seasoning-audit'],
        contractIds: ['api:seasoning-record'],
      },
    ],
    capabilities: [{ id: 'merchant-center.seasoning.delete-empty-group' }],
    mutation: { method: 'DELETE' as const, operationKey: deleteOperationKey },
    semantics: {
      businessObjectId: 'merchant-center.seasoning-group',
      scenarioFamilyId: `delete-group-${formalCase.id}`,
      stateTransitionId: 'existing-to-absent',
      scopeId: 'configured-merchant-brand-seasoning',
      variantId: formalCase.id === 'TC-FLV-SEA-030' ? 'empty-group' : `formal-variant-${formalCase.id}`,
      variantSourceIds: ['formal:seasoning-test-plan'],
      businessIdentityStrategy: 'server-id' as const,
    },
  };
}

function buildBoundaryCase(formalCase: FormalCase) {
  return {
    caseId: formalCase.id,
    ruleId: `RULE-${formalCase.id}`,
    title: formalCase.title,
    sourceIds: ['formal:seasoning-test-plan', 'runtime:seasoning-audit'],
    route,
    action: 'boundary' as const,
    dataProfileId: 'seasoning-create-reversible',
    coverageIds: ['route:brand-seasoning-list', 'ui:seasoning-create', 'api:seasoning-create', 'cleanup:seasoning-zero-residue'],
    contractIds: ['route:brand-seasoning-list', 'ui:seasoning-create', 'api:seasoning-create'],
    conditions: ['已建立目标商户认证会话。', '当前页面审计已确认调味列表、新增入口、价格字段和创建请求合同。'],
    actions: ['打开调味列表并进入自定义新增页面。', '依次保存价格为 0、10.50、999999.99 的唯一调味组。', '通过 UI 列表和 API 详情核对每个服务端记录。'],
    expectations: [
      {
        expected: '调味列表显示本批次创建的 3 个调味组。',
        assertionAdapterId: 'merchant-center.seasoning.assert-ui-created',
        observationChannel: 'ui' as const,
        authority: 'user-visible' as const,
        terminalCondition: '调味列表稳定后，3 个唯一业务身份均可见。',
        fieldId: 'seasoning.group-name',
        assertionSurfaceId: 'ui.seasoning-list',
        sourceIds: ['formal:seasoning-test-plan', 'runtime:seasoning-audit'],
        contractIds: ['route:brand-seasoning-list', 'ui:seasoning-create'],
      },
      {
        expected: 'API 查询到每个调味组且价格分别为 0、10.50、999999.99。',
        assertionAdapterId: 'merchant-center.seasoning.assert-api-created',
        observationChannel: 'api' as const,
        authority: 'persistence' as const,
        terminalCondition: '按服务端 ID 查询详情，价格与输入边界逐条一致。',
        fieldId: 'seasoning.price',
        assertionSurfaceId: 'api.seasoning-record',
        sourceIds: ['formal:seasoning-test-plan', 'runtime:seasoning-audit'],
        contractIds: ['api:seasoning-record'],
      },
    ],
    capabilities: [
      { id: 'merchant-center.seasoning.create-boundary' },
    ],
    mutation: { method: 'POST' as const, operationKey: createOperationKey },
    semantics: {
      businessObjectId: 'merchant-center.seasoning-group',
      scenarioFamilyId: 'price-boundary-save',
      stateTransitionId: 'absent-to-created',
      scopeId: 'configured-merchant-brand-seasoning',
      variantId: 'three-price-boundaries',
      variantSourceIds: ['formal:seasoning-test-plan'],
      businessIdentityStrategy: 'unique-marker',
    },
  };
}

function buildNegativeCase(formalCase: FormalCase) {
  return {
    caseId: formalCase.id,
    ruleId: `RULE-${formalCase.id}`,
    title: formalCase.title,
    sourceIds: ['formal:seasoning-test-plan', 'runtime:seasoning-audit'],
    route,
    action: 'negative' as const,
    dataProfileId: 'seasoning-negative-reversible',
    coverageIds: ['route:brand-seasoning-list', 'validation:seasoning-price-correction'],
    contractIds: ['route:brand-seasoning-list', 'ui:seasoning-create'],
    conditions: ['已建立目标商户认证会话。', '已有可进入详情编辑的调味项，并记录其原价格。'],
    actions: ['分别新增价格为非数字字符、负数和留空的唯一调味项并回读价格。', '进入已有调味详情，分别输入非数字字符和负数后失焦，核对恢复值、确定按钮状态和更新请求。'],
    expectations: [
      {
        expected: '新增价格输入非数字字符、负数或留空后均保存成功，服务端最终价格为0。',
        assertionAdapterId: 'merchant-center.seasoning.assert-create-price-correction',
        observationChannel: 'api' as const,
        authority: 'persistence' as const,
        terminalCondition: '三种新增输入均完成保存，服务端详情回读价格为0。',
        fieldId: 'seasoning.price',
        assertionSurfaceId: 'api.seasoning-record',
        feedback: { mode: 'state' as const, trigger: 'post-submit' as const },
        sourceIds: ['formal:seasoning-test-plan', 'runtime:seasoning-audit'],
        contractIds: ['api:seasoning-record'],
      },
      {
        expected: '编辑详情输入非数字字符或负数后恢复原价，确定按钮置灰且不发送更新请求。',
        assertionAdapterId: 'merchant-center.seasoning.assert-edit-price-reversion',
        observationChannel: 'ui' as const,
        authority: 'user-visible' as const,
        terminalCondition: '编辑页价格恢复原值、确定按钮为 disabled 且无 PUT。',
        fieldId: 'seasoning.price',
        assertionSurfaceId: 'ui.seasoning-create',
        sourceIds: ['formal:seasoning-test-plan', 'runtime:seasoning-audit'],
        contractIds: ['ui:seasoning-create'],
      },
    ],
    capabilities: [
      { id: 'merchant-center.seasoning.price-correction' },
    ],
    mutation: { method: 'POST' as const, operationKey: createOperationKey },
    cleanup: { adapterId: 'merchant-center.seasoning.cleanup' },
    semantics: {
      businessObjectId: 'merchant-center.seasoning-group',
      scenarioFamilyId: 'price-correction',
      stateTransitionId: 'draft-to-created-or-original',
      scopeId: 'configured-merchant-brand-seasoning',
      variantId: formalCase.id === 'TC-FLV-SEA-017'
        ? 'invalid-or-empty-price-correction-edit'
        : 'invalid-or-empty-price-correction',
      variantSourceIds: formalCase.id === 'TC-FLV-SEA-017'
        ? ['runtime:seasoning-audit']
        : ['formal:seasoning-test-plan'],
      businessIdentityStrategy: 'unique-marker',
    },
  };
}

function buildRoundingCase(formalCase: FormalCase) {
  return {
    caseId: formalCase.id,
    ruleId: `RULE-${formalCase.id}`,
    title: formalCase.title,
    sourceIds: ['formal:seasoning-test-plan', 'runtime:seasoning-audit'],
    route,
    action: 'boundary' as const,
    dataProfileId: 'seasoning-create-reversible',
    coverageIds: ['route:brand-seasoning-list', 'api:seasoning-create', 'cleanup:seasoning-zero-residue'],
    contractIds: ['route:brand-seasoning-list', 'api:seasoning-create'],
    conditions: ['已进入新增调味项页面。', '当前审计已确认价格输入、创建请求和详情回读合同。'],
    actions: ['保存价格为 1.235 的唯一调味项。', '保存价格为 1.234 的另一条唯一调味项。', '通过 API 详情核对最终价格。'],
    expectations: [
      {
        expected: '价格 1.235 保存后为 1.24。',
        assertionAdapterId: 'merchant-center.seasoning.assert-round-half-up',
        observationChannel: 'api' as const,
        authority: 'persistence' as const,
        terminalCondition: '服务端详情回读第一条调味项价格为 1.24。',
        fieldId: 'seasoning.price',
        assertionSurfaceId: 'api.seasoning-record',
        sourceIds: ['formal:seasoning-test-plan', 'runtime:seasoning-audit'],
        contractIds: ['api:seasoning-record'],
      },
      {
        expected: '价格 1.234 保存后为 1.23。',
        assertionAdapterId: 'merchant-center.seasoning.assert-round-down',
        observationChannel: 'api' as const,
        authority: 'persistence' as const,
        terminalCondition: '服务端详情回读第二条调味项价格为 1.23。',
        fieldId: 'seasoning.price',
        assertionSurfaceId: 'api.seasoning-record',
        sourceIds: ['formal:seasoning-test-plan', 'runtime:seasoning-audit'],
        contractIds: ['api:seasoning-record'],
      },
    ],
    capabilities: [
      { id: 'merchant-center.seasoning.rounding' },
    ],
    mutation: { method: 'POST' as const, operationKey: createOperationKey },
    semantics: {
      businessObjectId: 'merchant-center.seasoning-group',
      scenarioFamilyId: 'price-formatting',
      stateTransitionId: 'absent-to-created',
      scopeId: 'configured-merchant-brand-seasoning',
      variantId: 'three-decimal-rounding',
      variantSourceIds: ['formal:seasoning-test-plan'],
      businessIdentityStrategy: 'unique-marker',
    },
  };
}

function buildRecordTaskSearchCase(formalCase: FormalCase) {
  return {
    caseId: formalCase.id,
    ruleId: `RULE-${formalCase.id}`,
    title: formalCase.title,
    sourceIds: ['formal:seasoning-test-plan', 'runtime:seasoning-route-contract'],
    route: recordRoute,
    action: 'read' as const,
    dataProfileId: 'seasoning-negative-read',
    coverageIds: ['route:brand-seasoning-record', 'ui:seasoning-record-query', 'api:seasoning-record'],
    contractIds: ['route:brand-seasoning-record', 'ui:seasoning-record-query', 'api:seasoning-record'],
    conditions: ['当前下发记录列表至少存在一条可见任务记录。'],
    actions: ['打开调味下发记录。', '读取一条现有任务名称并按完整任务名称查询。', '核对返回行均属于该任务名称。'],
    expectations: [{
      expected: '按任务名称精确查询后，列表仅显示匹配任务记录。',
      assertionAdapterId: 'merchant-center.seasoning.assert-record-task-search',
      observationChannel: 'ui' as const,
      authority: 'user-visible' as const,
      terminalCondition: '下发记录列表请求完成后，至少一行可见且每行包含查询任务名称。',
      fieldId: 'seasoning.record-task-name',
      assertionSurfaceId: 'ui.seasoning-record',
      sourceIds: ['formal:seasoning-test-plan', 'runtime:seasoning-route-contract'],
      contractIds: ['ui:seasoning-record-query'],
    }],
    capabilities: [{ id: 'merchant-center.seasoning.record-task-search' }],
    semantics: {
      businessObjectId: 'merchant-center.seasoning-distribution-record',
      scenarioFamilyId: 'search',
      stateTransitionId: 'query-to-filtered-list',
      scopeId: 'configured-merchant-seasoning-record',
      variantId: 'exact-task-name',
      variantSourceIds: ['formal:seasoning-test-plan'],
      businessIdentityStrategy: 'none' as const,
    },
  };
}

function buildRecordResetCase(formalCase: FormalCase) {
  return {
    caseId: formalCase.id,
    ruleId: `RULE-${formalCase.id}`,
    title: formalCase.title,
    sourceIds: ['formal:seasoning-test-plan', 'runtime:seasoning-route-contract'],
    route: recordRoute,
    action: 'read' as const,
    dataProfileId: 'seasoning-negative-read',
    coverageIds: ['route:brand-seasoning-record', 'ui:seasoning-record-query', 'api:seasoning-record'],
    contractIds: ['route:brand-seasoning-record', 'ui:seasoning-record-query', 'api:seasoning-record'],
    conditions: ['调味下发记录页面可访问。'],
    actions: ['打开调味下发记录。', '输入任务名称查询条件。', '点击重置并等待列表请求完成。'],
    expectations: [{
      expected: '重置后任务名称查询条件清空并恢复列表请求。',
      assertionAdapterId: 'merchant-center.seasoning.assert-record-reset',
      observationChannel: 'ui' as const,
      authority: 'user-visible' as const,
      terminalCondition: '重置触发列表请求后，任务名称输入框值为空。',
      fieldId: 'seasoning.record-task-name',
      assertionSurfaceId: 'ui.seasoning-record',
      sourceIds: ['formal:seasoning-test-plan', 'runtime:seasoning-route-contract'],
      contractIds: ['ui:seasoning-record-query'],
    }],
    capabilities: [{ id: 'merchant-center.seasoning.record-reset' }],
    semantics: {
      businessObjectId: 'merchant-center.seasoning-distribution-record',
      scenarioFamilyId: 'reset',
      stateTransitionId: 'filtered-to-default-list',
      scopeId: 'configured-merchant-seasoning-record',
      variantId: 'task-name-reset',
      variantSourceIds: ['formal:seasoning-test-plan'],
      businessIdentityStrategy: 'none' as const,
    },
  };
}

function buildTemplateCreateAuditCase(formalCase: FormalCase) {
  return buildTemplateReadCase(formalCase, 'merchant-center.seasoning.template-create-audit', 'template-create', 'multi-store-000420', [
    { expected: '新增模板页展示模板名称、第二语言、模板说明、调味列表、组排序和选择调味控件。', assertionAdapterId: 'merchant-center.seasoning.assert-template-create-fields', fieldId: 'seasoning.template-fields' },
    { expected: '模板名称为空保存时高亮必填项且不发送创建请求。', assertionAdapterId: 'merchant-center.seasoning.assert-template-create-required', fieldId: 'seasoning.template-name' },
  ], ['formal:seasoning-test-plan', 'runtime:seasoning-template-create-audit'], {
    route: templateCreateRoute,
    routeContractId: 'route:brand-seasoning-template-create',
    uiContractId: 'ui:seasoning-template-create',
    assertionSurfaceId: 'ui.seasoning-template-create',
  });
}

function buildTemplateDistributionAuditCase(formalCase: FormalCase) {
  return buildTemplateReadCase(formalCase, 'merchant-center.seasoning.template-distribution-audit', 'template-distribution', 'multi-store-000420', [
    { expected: '模板卡片操作菜单展示编辑、下发、删除；点击下发打开下发到门店弹窗。', assertionAdapterId: 'merchant-center.seasoning.assert-template-distribution-menu', fieldId: 'seasoning.template-distribution' },
    { expected: '下发到门店弹窗展示门店名称、商户ID、区域、邮编、地址信息，未选门店时确认按钮禁用。', assertionAdapterId: 'merchant-center.seasoning.assert-template-store-dialog', fieldId: 'seasoning.store-fields' },
  ]);
}

function buildSingleStoreTemplateAbsenceCase(formalCase: FormalCase) {
  return buildTemplateReadCase(formalCase, 'merchant-center.seasoning.single-store-template-absence', 'single-store-template-absence', 'single-store-000407', [
    { expected: 'SCH 单门店品牌访问模板路由无权限且导航不展示调味模版入口。', assertionAdapterId: 'merchant-center.seasoning.assert-single-store-template-absence', fieldId: 'seasoning.template-entry' },
  ]);
}

function buildStaticContractCase(formalCase: FormalCase) {
  const storeDistributionCase = formalCase.id === 'TC-FLV-SEA-042' || /^TC-FLV-XMOD-(004|005|006|011)$/.test(formalCase.id);
  const caseRoute = storeDistributionCase
    ? storeRoute
    : formalCase.id.startsWith('TC-FLV-REC-')
      ? recordRoute
    : formalCase.id.startsWith('TC-FLV-TPL-')
      ? (['TC-FLV-TPL-003', 'TC-FLV-TPL-004', 'TC-FLV-TPL-010', 'TC-FLV-TPL-011', 'TC-FLV-TPL-012', 'TC-FLV-TPL-013', 'TC-FLV-TPL-014', 'TC-FLV-TPL-025'].includes(formalCase.id) ? templateCreateRoute : templateRoute)
      : formalCase.id.startsWith('TC-FLV-XMOD-') ? storeRoute
      : route;
  const templateCase = formalCase.id.startsWith('TC-FLV-TPL-');
  const storeCase = formalCase.id.startsWith('TC-FLV-XMOD-') || formalCase.id === 'TC-FLV-SEA-042';
  const sourceIds = storeCase
    ? formalCase.id === 'TC-FLV-SEA-042'
      ? ['formal:seasoning-test-plan', 'runtime:seasoning-full-page-single-store']
      : ['formal:seasoning-test-plan', 'runtime:seasoning-full-page-multi-store']
    : templateCase
    ? ['formal:seasoning-test-plan', 'runtime:seasoning-template-audit', 'runtime:seasoning-template-create-audit']
    : ['formal:seasoning-test-plan', 'runtime:seasoning-page-contract', 'runtime:seasoning-route-contract'];
  const recordCase = formalCase.id.startsWith('TC-FLV-REC-');
  const templateCreateCase = caseRoute === templateCreateRoute;
  const coverageIds = formalCase.id === 'TC-FLV-TPL-011'
    ? ['route:brand-seasoning-template', 'route:brand-seasoning-template-create', 'ui:seasoning-template', 'ui:seasoning-template-create']
    : storeCase
    ? ['route:store-seasoning-list', 'ui:store-seasoning-list', 'api:store-seasoning-list']
    : recordCase
    ? ['route:brand-seasoning-record', 'ui:seasoning-record-query', 'api:seasoning-record']
    : templateCreateCase
      ? ['route:brand-seasoning-template-create', 'ui:seasoning-template-create']
      : templateCase
        ? ['route:brand-seasoning-template', 'ui:seasoning-template']
        : ['route:brand-seasoning-list', 'ui:seasoning-create', 'api:seasoning-record'];
  const assertionSurfaceId = formalCase.id === 'TC-FLV-TPL-011'
    ? 'ui.seasoning-template-create'
    : storeCase
    ? 'ui.store-seasoning-list'
    : recordCase
    ? 'ui.seasoning-record'
    : templateCreateCase ? 'ui.seasoning-template-create' : templateCase ? 'ui.seasoning-template' : 'ui.seasoning-list';
  const fieldId = formalCase.id === 'TC-FLV-TPL-011'
    ? 'seasoning.template-name'
    : storeCase
    ? 'seasoning.store-list'
    : recordCase
    ? 'seasoning.record-list'
    : templateCreateCase ? 'seasoning.template-fields' : templateCase ? 'seasoning.template-distribution' : 'seasoning.group-name';
  const storeSeededRead = /^TC-FLV-XMOD-(001|002|003)$/.test(formalCase.id);
  const templateMutation = /^TC-FLV-TPL-(011|012|013|015|016|017|018|019|020|021|022|023|024|025)$/.test(formalCase.id);
  const templateSeeded = /^TC-FLV-TPL-(015|016|017|018|019|020|021|022|023|024)$/.test(formalCase.id);
  const seasoningSeeded = new Set([
    'TC-FLV-SEA-007',
    'TC-FLV-SEA-022', 'TC-FLV-SEA-023', 'TC-FLV-SEA-024', 'TC-FLV-SEA-025', 'TC-FLV-SEA-026', 'TC-FLV-SEA-027',
    'TC-FLV-SEA-028', 'TC-FLV-SEA-033', 'TC-FLV-SEA-034', 'TC-FLV-SEA-035', 'TC-FLV-SEA-036', 'TC-FLV-SEA-037',
    'TC-FLV-SEA-040', 'TC-FLV-SEA-041',
  ]).has(formalCase.id) && !['TC-FLV-SEA-022', 'TC-FLV-SEA-034'].includes(formalCase.id);
  const reversibleBoundary = ['TC-FLV-SEA-013', 'TC-FLV-SEA-014', 'TC-FLV-SEA-017', 'TC-FLV-SEA-030'].includes(formalCase.id)
    || seasoningSeeded || storeSeededRead || templateMutation;
  const lifecycleProfile = /TPL-(017|018|019)$/.test(formalCase.id)
    ? 'seasoning-template-edit-reversible'
    : /TPL-(020|021)$/.test(formalCase.id)
      ? 'seasoning-template-delete-reversible'
        : /TPL-(012|013|015|016|025)$/.test(formalCase.id)
        ? 'seasoning-template-create-reversible'
        : /TPL-(022|023|024)$/.test(formalCase.id)
          ? 'seasoning-template-distribution-reversible'
        : undefined;
  const seasoningLifecycleProfile = formalCase.id === 'TC-FLV-SEA-037'
    ? 'seasoning-batch-move-reversible'
    : formalCase.id === 'TC-FLV-SEA-041'
      ? 'seasoning-sort-reversible'
      : ['TC-FLV-SEA-028', 'TC-FLV-SEA-033', 'TC-FLV-SEA-035', 'TC-FLV-SEA-036', 'TC-FLV-SEA-040'].includes(formalCase.id)
        ? 'seasoning-edit-reversible'
        : undefined;
  const expected = formalCase.id === 'TC-FLV-TPL-011'
    ? '输入含表情的模板名称后保存成功；返回模板列表时表情被删除，支持的中英文、数字及 -._ 字符保持不变。'
    : formalCase.id === 'TC-FLV-TPL-014'
      ? '未选择调味组点击保存时精确提示“调味模版至少需要一个调味组”；停留新增页、不发送创建请求且服务端无新增记录。'
      : formalCase.title;
  const seasoningMutation = seasoningSeeded && !['TC-FLV-SEA-022', 'TC-FLV-SEA-034', 'TC-FLV-SEA-035', 'TC-FLV-SEA-036'].includes(formalCase.id)
    ? {
      method: ['TC-FLV-SEA-040', 'TC-FLV-SEA-041'].includes(formalCase.id) ? 'PUT' as const : formalCase.id === 'TC-FLV-SEA-037' ? 'POST' as const : formalCase.id === 'TC-FLV-SEA-028' || formalCase.id === 'TC-FLV-SEA-033' ? 'PUT' as const : 'POST' as const,
      operationKey: formalCase.id === 'TC-FLV-SEA-037'
        ? 'brand-menu:POST /ops-brand/global-modifier/options/batch-move'
        : formalCase.id === 'TC-FLV-SEA-040'
          ? updateOperationKey
        : formalCase.id === 'TC-FLV-SEA-041'
          ? 'brand-menu:PUT /ops-brand/global-modifier/sort'
          : formalCase.id === 'TC-FLV-SEA-028' || formalCase.id === 'TC-FLV-SEA-033'
            ? updateOperationKey
            : seedOperationKey,
    }
    : undefined;
  const actions = formalCase.id === 'TC-FLV-SEA-028'
    ? [
      '打开已登记调味组编辑页。',
      '点击目标调味项删除后直接保存，不等待或断言二次确认弹窗。',
      '返回调味列表并核对目标调味项已删除，同时读取服务端详情确认无残留。',
    ]
    : formalCase.id === 'TC-FLV-TPL-024'
      ? [
        '通过 UI 将模板下发到 Ces test（门店 ID：M000023918）并记录该门店调味快照。',
        '编辑模板但不再次下发，确认左下角当前门店仍为 Ces test（门店 ID：M000023918），核对门店快照不变。',
        '再次通过 UI 将模板下发到 Ces test（门店 ID：M000023918），再次确认当前门店身份后核对门店调味更新。',
      ]
      : [formalCase.id === 'TC-FLV-TPL-011'
        ? '进入新增模板页输入含表情名称并保存，返回列表读取持久化后的可见名称。'
        : '按正式用例在当前可见页面合同上执行只读操作或前端校验，不产生未登记业务写入。'];
  return {
    caseId: formalCase.id,
    ruleId: `RULE-${formalCase.id}`,
    title: formalCase.title,
    sourceIds,
    route: caseRoute,
    action: reversibleBoundary ? 'boundary' as const : 'read' as const,
    dataProfileId: lifecycleProfile ?? seasoningLifecycleProfile ?? (formalCase.id === 'TC-FLV-SEA-013'
      ? 'seasoning-fixture-only-reversible'
      : formalCase.id === 'TC-FLV-TPL-011'
      ? 'seasoning-template-name-reversible'
      : ['TC-FLV-SEA-013', 'TC-FLV-SEA-014'].includes(formalCase.id)
        ? 'seasoning-negative-batch-reversible'
      : storeSeededRead || templateMutation
      ? 'seasoning-distribution-reversible'
      : formalCase.id === 'TC-FLV-SEA-007'
        ? 'seasoning-search-reversible'
      : reversibleBoundary ? 'seasoning-negative-reversible' : 'seasoning-negative-read'),
    coverageIds,
    contractIds: coverageIds,
    conditions: ['已通过 UI OAuth 自动化建立正式用例指定的单门店或多门店商户上下文。'],
    actions,
    expectations: [{
      expected,
      assertionAdapterId: 'merchant-center.seasoning.assert-static-contract',
      observationChannel: 'ui' as const,
      authority: 'user-visible' as const,
      terminalCondition: '目标业务请求完成，页面进入稳定可见终态，逐项断言均成立。',
      fieldId,
      assertionSurfaceId,
      sourceIds,
      contractIds: coverageIds,
    }],
    capabilities: [{ id: formalCase.id === 'TC-FLV-TPL-011'
      ? 'merchant-center.seasoning.template-name-normalization'
      : 'merchant-center.seasoning.static-contract' }],
    ...(reversibleBoundary && !seasoningSeeded ? {
      mutation: {
        method: storeSeededRead
          ? 'POST' as const
          : /TPL-(017|018|019)$/.test(formalCase.id)
            ? 'PUT' as const
            : /TPL-(020|021)$/.test(formalCase.id)
              ? 'DELETE' as const
              : 'POST' as const,
        operationKey: formalCase.id === 'TC-FLV-SEA-037'
          ? 'brand-menu:POST /ops-brand/global-modifier/options/batch-move'
          : ['TC-FLV-SEA-040', 'TC-FLV-SEA-041'].includes(formalCase.id)
            ? 'brand-menu:PUT /ops-brand/global-modifier/sort'
            : storeSeededRead
          ? 'brand-menu:POST /ops-brand/brand-modifier-sync/by-template'
          : /TPL-(017|018|019)$/.test(formalCase.id)
            ? 'brand-menu:PUT /ops-brand/modifier-template/{id}'
            : /TPL-(020|021)$/.test(formalCase.id)
              ? 'brand-menu:DELETE /ops-brand/modifier-template/{id}'
              : templateMutation ? 'brand-menu:POST /ops-brand/modifier-template'
                : ['TC-FLV-SEA-013', 'TC-FLV-SEA-014'].includes(formalCase.id)
                  ? seedOperationKey
                  : createOperationKey,
      },
      cleanup: { adapterId: 'merchant-center.seasoning.cleanup' },
    } : seasoningMutation ? { mutation: seasoningMutation, cleanup: { adapterId: 'merchant-center.seasoning.cleanup' } } : reversibleBoundary ? { cleanup: { adapterId: 'merchant-center.seasoning.cleanup' } } : {}),
    ...((templateSeeded || seasoningSeeded || ['TC-FLV-SEA-013', 'TC-FLV-SEA-014'].includes(formalCase.id)) ? { seed: { adapterId: 'merchant-center.seasoning.seed' } } : {}),
    semantics: {
      businessObjectId: storeCase ? 'merchant-center.store-global-seasoning' : templateCase ? 'merchant-center.seasoning-template' : recordCase ? 'merchant-center.seasoning-distribution-record' : 'merchant-center.seasoning-group',
      scenarioFamilyId: staticScenarioFamily(formalCase.id),
      stateTransitionId: staticStateTransition(formalCase.id),
      scopeId: contextForCase(formalCase.id).profile,
      variantId: formalCase.id,
      variantSourceIds: ['formal:seasoning-test-plan'],
      businessIdentityStrategy: reversibleBoundary ? 'unique-marker' as const : 'none' as const,
    },
  };
}

function buildStoreMutationCase(formalCase: FormalCase) {
  const isSingleStore = formalCase.id === 'TC-FLV-SEA-042';
  const sourceIds = isSingleStore
    ? ['formal:seasoning-test-plan', 'runtime:seasoning-full-page-single-store']
    : ['formal:seasoning-test-plan', 'runtime:seasoning-full-page-multi-store'];
  const operationKey = formalCase.id === 'TC-FLV-SEA-042'
    ? 'brand-menu:POST /ops-brand/brand-modifier-sync/all'
    : formalCase.id === 'TC-FLV-XMOD-004'
      ? 'brand-menu:DELETE /ops-poi/global-modifier/{id}'
      : formalCase.id === 'TC-FLV-XMOD-005'
        ? 'brand-menu:DELETE /ops-poi/global-modifier/option/{optionId}'
        : formalCase.id === 'TC-FLV-XMOD-006'
          ? 'brand-menu:POST /ops-poi/global-modifier/batch-delete'
          : 'brand-menu:POST /ops-brand/brand-modifier-sync/by-template';
  const capability = formalCase.id === 'TC-FLV-SEA-042'
    ? 'merchant-center.seasoning.store-replace-distribution'
    : formalCase.id === 'TC-FLV-XMOD-004'
      ? 'merchant-center.seasoning.store-delete-group'
      : formalCase.id === 'TC-FLV-XMOD-005'
        ? 'merchant-center.seasoning.store-delete-option'
        : formalCase.id === 'TC-FLV-XMOD-006'
          ? 'merchant-center.seasoning.store-batch-delete'
          : 'merchant-center.seasoning.store-redeliver-restore';
  const requiredIdentityKeys = isSingleStore
    ? ['groupId', 'groupName']
    : formalCase.id === 'TC-FLV-XMOD-005' || formalCase.id === 'TC-FLV-XMOD-006'
      ? ['groupId', 'groupName', 'optionId', 'optionName', 'templateId', 'templateName']
      : ['groupId', 'groupName', 'templateId', 'templateName'];
  const readinessInput = {
    groupId: { $ref: '$records.0.id' as const },
    groupName: { $ref: '$records.0.name' as const },
    ...(isSingleStore ? {} : {
      templateId: { $ref: '$templateSeed.id' as const },
      templateName: { $ref: '$templateSeed.name' as const },
    }),
    ...(requiredIdentityKeys.includes('optionId') ? {
      optionId: { $ref: '$templateSeed.optionId' as const },
      optionName: { $ref: '$templateSeed.optionName' as const },
    } : {}),
  };
  const readinessAdapterId = formalCase.id === 'TC-FLV-SEA-042'
    ? 'merchant-center.seasoning.single-store-action-readiness'
    : formalCase.id === 'TC-FLV-XMOD-004'
      ? 'merchant-center.seasoning.store-group-delete-action-readiness'
      : formalCase.id === 'TC-FLV-XMOD-005'
        ? 'merchant-center.seasoning.store-option-delete-action-readiness'
        : formalCase.id === 'TC-FLV-XMOD-006'
          ? 'merchant-center.seasoning.store-batch-delete-action-readiness'
          : 'merchant-center.seasoning.store-redeliver-action-readiness';
  return {
    caseId: formalCase.id,
    ruleId: `RULE-${formalCase.id}`,
    title: formalCase.title,
    sourceIds,
    route: storeRoute,
    action: formalCase.id === 'TC-FLV-SEA-042' || formalCase.id === 'TC-FLV-XMOD-011'
      ? 'create' as const
      : 'delete' as const,
    dataProfileId: isSingleStore
      ? 'seasoning-single-store-replace-reversible'
      : formalCase.id === 'TC-FLV-XMOD-004'
        ? 'seasoning-store-delete-group-reversible'
        : formalCase.id === 'TC-FLV-XMOD-005'
          ? 'seasoning-store-delete-option-reversible'
          : formalCase.id === 'TC-FLV-XMOD-006'
            ? 'seasoning-store-batch-delete-reversible'
            : 'seasoning-store-redeliver-reversible',
    coverageIds: ['route:store-seasoning-list', 'ui:store-seasoning-list', 'api:store-seasoning-list', 'cleanup:seasoning-zero-residue'],
    contractIds: ['route:store-seasoning-list', 'ui:store-seasoning-list', 'api:store-seasoning-list'],
    conditions: [isSingleStore
      ? '已通过 UI OAuth 建立 SCH 单门店 Brand 000407 上下文。'
      : '已通过 UI OAuth 切换多门店商户 23918 / Brand 000420，并选定门店上下文。',
      '门店调味列表、品牌/模板下发与门店删除 API 合同已登记。'],
    actions: [formalCase.title],
    expectations: [{
      expected: formalCase.id === 'TC-FLV-SEA-042'
        ? '品牌全部调味下发完成后，门店调味页面可见数据与品牌调味一致。'
        : formalCase.id === 'TC-FLV-XMOD-004'
          ? '确认删除后目标调味组及组内调味项均从门店列表消失。'
          : formalCase.id === 'TC-FLV-XMOD-005'
            ? '确认删除后目标调味项从门店列表消失且调味组仍可见。'
            : formalCase.id === 'TC-FLV-XMOD-006'
              ? '未选择时批量操作置灰；选择后启用并确认删除，目标项从门店列表消失。'
              : '删除门店调味后再次模板下发，目标调味恢复并与模板内容一致；POS 断言按本轮范围跳过。',
      assertionAdapterId: 'merchant-center.seasoning.assert-store-mutation',
      observationChannel: 'ui' as const,
      authority: 'user-visible' as const,
      terminalCondition: '真实门店页面完成业务动作并进入稳定可见终态，API 仅用于身份、持久化和清理核验。',
      fieldId: 'seasoning.store-list',
      assertionSurfaceId: 'ui.store-seasoning-list',
      sourceIds,
      contractIds: ['route:store-seasoning-list', 'ui:store-seasoning-list', 'api:store-seasoning-list'],
    }],
    capabilities: [{ id: capability }],
    actionReadiness: {
      adapterId: readinessAdapterId,
      input: readinessInput,
      status: 'observed' as const,
      generationAllowed: true as const,
      sourceIds,
      contractIds: ['route:store-seasoning-list', 'ui:store-seasoning-list', 'api:store-seasoning-list'],
      controlIds: formalCase.id === 'TC-FLV-SEA-042'
        ? ['brand-seasoning.distribute-all']
        : formalCase.id === 'TC-FLV-XMOD-005'
          ? ['store-seasoning.group-expand', 'store-seasoning.option-delete', 'store-seasoning.confirm-delete']
          : formalCase.id === 'TC-FLV-XMOD-006'
            ? ['store-seasoning.option-checkbox', 'store-seasoning.batch-menu', 'store-seasoning.confirm-delete']
            : formalCase.id === 'TC-FLV-XMOD-011'
              ? ['store-seasoning.group-delete', 'store-seasoning.confirm-delete', 'seasoning-template.distribute-dialog']
              : ['store-seasoning.group-delete', 'store-seasoning.confirm-delete'],
      sequence: formalCase.id === 'TC-FLV-SEA-042'
        ? ['locate-brand-distribute', 'observe-distribution-request', 'verify-store-terminal']
        : formalCase.id === 'TC-FLV-XMOD-011'
          ? ['locate-store-group', 'open-delete-confirmation', 'observe-delete-request', 'open-template-distribution', 'verify-restored-terminal']
          : ['locate-store-identity', 'open-action', 'open-confirmation', 'observe-mutation-request', 'verify-absent-terminal'],
      terminalConditionIds: formalCase.id === 'TC-FLV-SEA-042' || formalCase.id === 'TC-FLV-XMOD-011'
        ? ['store-seasoning.identity-visible']
        : ['store-seasoning.identity-absent'],
      operationKeys: [operationKey],
      requiredIdentityKeys,
      cleanupIdentityKeys: requiredIdentityKeys,
    },
    seed: { adapterId: isSingleStore
      ? 'merchant-center.seasoning.seed-single-store-distribution'
      : 'merchant-center.seasoning.seed-multi-store-distribution' },
    mutation: { method: formalCase.id === 'TC-FLV-XMOD-004' || formalCase.id === 'TC-FLV-XMOD-005' ? 'DELETE' as const : 'POST' as const, operationKey },
    cleanup: { adapterId: 'merchant-center.seasoning.cleanup' },
    semantics: {
      businessObjectId: 'merchant-center.store-global-seasoning',
      scenarioFamilyId: formalCase.id === 'TC-FLV-SEA-042' ? 'distribution' : formalCase.id === 'TC-FLV-XMOD-006' ? 'batch-change' : formalCase.id === 'TC-FLV-XMOD-004' ? 'delete-group' : formalCase.id === 'TC-FLV-XMOD-005' ? 'delete-option' : 'distribution',
      stateTransitionId: formalCase.id === 'TC-FLV-SEA-042' || formalCase.id === 'TC-FLV-XMOD-011' ? 'source-to-store-synchronized' : 'existing-to-absent',
      scopeId: contextForCase(formalCase.id).profile,
      variantId: formalCase.id,
      variantSourceIds: ['formal:seasoning-test-plan'],
      businessIdentityStrategy: 'unique-marker' as const,
    },
  };
}

function staticScenarioFamily(caseId: string): string {
  const families: Record<string, string> = {
    'TC-FLV-SEA-002': 'preset-group-option-layout',
    'TC-FLV-SEA-001': 'brand-seasoning-empty-state',
    'TC-FLV-SEA-010': 'industry-seasoning-create',
    'TC-FLV-SEA-013': 'option-required-with-existing-group',
    'TC-FLV-SEA-014': 'seasoning-name-character-validation',
    'TC-FLV-SEA-022': 'option-count-upper-bound',
    'TC-FLV-SEA-023': 'industry-option-union-merge',
    'TC-FLV-SEA-024': 'group-global-duplicate',
    'TC-FLV-SEA-025': 'group-cross-language-duplicate',
    'TC-FLV-SEA-026': 'group-or-option-duplicate-feedback',
    'TC-FLV-SEA-027': 'same-group-option-duplicate',
    'TC-FLV-SEA-028': 'option-delete',
    'TC-FLV-SEA-033': 'option-edit',
    'TC-FLV-SEA-034': 'create-cancel',
    'TC-FLV-SEA-035': 'edit-cancel',
    'TC-FLV-SEA-036': 'delete-cancel',
    'TC-FLV-SEA-037': 'batch-group-change',
    'TC-FLV-SEA-040': 'option-drag-sort',
    'TC-FLV-SEA-041': 'group-sort',
    'TC-FLV-SEA-003': 'brand-seasoning-group-summary',
    'TC-FLV-SEA-004': 'brand-seasoning-option-summary',
    'TC-FLV-SEA-005': 'brand-seasoning-create-fields',
    'TC-FLV-SEA-006': 'brand-seasoning-batch-selection-state',
    'TC-FLV-SEA-007': 'brand-seasoning-name-search',
    'TC-FLV-SEA-008': 'brand-seasoning-search-reset',
    'TC-FLV-SEA-011': 'brand-seasoning-required-fields-validation',
    'TC-FLV-SEA-012': 'brand-seasoning-group-required-validation',
    'TC-FLV-SEA-017': 'brand-seasoning-price-correction-boundary',
    'TC-FLV-SEA-043': 'multi-store-direct-distribution-absence',
    'TC-FLV-REC-001': 'seasoning-distribution-record-columns',
    'TC-FLV-REC-003': 'seasoning-record-store-status-search',
    'TC-FLV-REC-004': 'seasoning-record-combined-search',
    'TC-FLV-REC-006': 'seasoning-record-store-detail',
    'TC-FLV-REC-007': 'seasoning-record-task-name-pattern',
    'TC-FLV-TPL-001': 'template-list-columns',
    'TC-FLV-TPL-003': 'template-seasoning-selection-layout',
    'TC-FLV-TPL-004': 'template-selected-seasoning-summary',
    'TC-FLV-TPL-007': 'template-name-search',
    'TC-FLV-TPL-008': 'template-distribution-store-search',
    'TC-FLV-TPL-009': 'template-search-reset',
    'TC-FLV-TPL-010': 'template-name-required-validation',
    'TC-FLV-TPL-011': 'template-name-character-validation',
    'TC-FLV-TPL-012': 'template-create-required-only',
    'TC-FLV-TPL-013': 'template-create-all-fields',
    'TC-FLV-TPL-014': 'template-create-without-seasoning',
    'TC-FLV-TPL-015': 'template-name-duplicate-rejection',
    'TC-FLV-TPL-016': 'template-name-duplicate-feedback',
    'TC-FLV-TPL-017': 'template-edit-save',
    'TC-FLV-TPL-018': 'template-add-seasoning',
    'TC-FLV-TPL-019': 'template-remove-seasoning',
    'TC-FLV-TPL-020': 'template-delete-with-seasoning',
    'TC-FLV-TPL-021': 'template-delete-confirmation',
    'TC-FLV-TPL-022': 'template-distribution-store-readback',
    'TC-FLV-TPL-023': 'template-repeat-distribution-overwrite',
    'TC-FLV-TPL-024': 'template-edit-distribution-boundary',
    'TC-FLV-TPL-025': 'template-description-250-boundary',
    'TC-FLV-XMOD-001': 'store-seasoning-columns',
    'TC-FLV-XMOD-002': 'store-seasoning-name-search',
    'TC-FLV-XMOD-003': 'store-seasoning-search-reset',
    'TC-FLV-XMOD-004': 'store-seasoning-delete-group',
    'TC-FLV-XMOD-005': 'store-seasoning-delete-option',
    'TC-FLV-XMOD-006': 'store-seasoning-batch-delete',
    'TC-FLV-XMOD-011': 'store-seasoning-redeliver-restore',
    'TC-FLV-SEA-042': 'single-store-seasoning-replace-distribution',
  };
  const family = families[caseId];
  if (!family) throw new Error(`${caseId}:STATIC_SCENARIO_FAMILY_NOT_REGISTERED`);
  return family;
}

function staticStateTransition(caseId: string): string {
  if (['TC-FLV-SEA-007', 'TC-FLV-TPL-007', 'TC-FLV-TPL-008', 'TC-FLV-REC-003', 'TC-FLV-REC-004', 'TC-FLV-XMOD-002'].includes(caseId)) return 'default-to-filtered-results';
  if (['TC-FLV-SEA-008', 'TC-FLV-TPL-009', 'TC-FLV-XMOD-003'].includes(caseId)) return 'filtered-to-default-results';
  if (['TC-FLV-SEA-006', 'TC-FLV-TPL-004'].includes(caseId)) return 'unselected-to-selected';
  if (['TC-FLV-SEA-011', 'TC-FLV-SEA-012', 'TC-FLV-SEA-017', 'TC-FLV-TPL-010'].includes(caseId)) return 'invalid-draft-to-rejected';
  if (caseId === 'TC-FLV-TPL-011') return 'created-name-normalized';
  return 'route-to-observed-contract';
}

function buildTemplateReadCase(
  formalCase: FormalCase,
  capabilityId: string,
  variantId: string,
  executionContextProfile: string,
  expectations: Array<{ expected: string; assertionAdapterId: string; fieldId: string }>,
  sourceIds: string[] = ['formal:seasoning-test-plan', 'runtime:seasoning-template-audit'],
  contract: {
    route: typeof templateRoute | typeof templateCreateRoute;
    routeContractId: string;
    uiContractId: string;
    assertionSurfaceId: string;
  } = {
    route: templateRoute,
    routeContractId: 'route:brand-seasoning-template',
    uiContractId: 'ui:seasoning-template',
    assertionSurfaceId: 'ui.seasoning-template',
  },
) {
  return {
    caseId: formalCase.id,
    ruleId: `RULE-${formalCase.id}`,
    title: formalCase.title,
    sourceIds,
    route: contract.route,
    action: 'read' as const,
    dataProfileId: 'seasoning-negative-read',
    coverageIds: [contract.routeContractId, contract.uiContractId],
    contractIds: [contract.routeContractId, contract.uiContractId],
    conditions: ['已通过 UI OAuth 认证流建立指定商户上下文。'],
    actions: ['进入调味模板页面并按已审计控件执行只读检查。'],
    expectations: expectations.map((item, index) => ({
      ...item,
      observationChannel: 'ui' as const,
      authority: 'user-visible' as const,
      terminalCondition: '页面状态稳定且断言对象可见。',
      assertionSurfaceId: contract.assertionSurfaceId,
      sourceIds,
      contractIds: [contract.routeContractId, contract.uiContractId],
      claimId: `${formalCase.id}:expectation-${index + 1}`,
    })),
    capabilities: [{ id: capabilityId }],
    semantics: {
      businessObjectId: 'merchant-center.seasoning-template',
      scenarioFamilyId: 'template-audit',
      stateTransitionId: 'route-to-observed',
      scopeId: executionContextProfile,
      variantId,
      variantSourceIds: ['formal:seasoning-test-plan'],
      businessIdentityStrategy: 'none' as const,
    },
  };
}

function buildUiMutationCase(formalCase: FormalCase) {
  const templateCase = formalCase.id.startsWith('TC-FLV-TPL-');
  const createCase = new Set([
    'TC-FLV-SEA-010', 'TC-FLV-SEA-019', 'TC-FLV-SEA-021', 'TC-FLV-SEA-044', 'TC-FLV-SEA-045',
    'TC-FLV-TPL-012', 'TC-FLV-TPL-013', 'TC-FLV-TPL-025',
  ]).has(formalCase.id);
  const negativeCase = new Set([
    'TC-FLV-SEA-011', 'TC-FLV-SEA-012', 'TC-FLV-SEA-024', 'TC-FLV-SEA-025', 'TC-FLV-SEA-026', 'TC-FLV-SEA-027',
    'TC-FLV-SEA-034', 'TC-FLV-SEA-035', 'TC-FLV-SEA-036',
    'TC-FLV-TPL-010', 'TC-FLV-TPL-014', 'TC-FLV-TPL-015', 'TC-FLV-TPL-016',
  ]).has(formalCase.id);
  const boundaryCase = new Set(['TC-FLV-SEA-022', 'TC-FLV-SEA-037', 'TC-FLV-SEA-040', 'TC-FLV-SEA-041']).has(formalCase.id);
  const distributionCase = formalCase.id === 'TC-FLV-TPL-022';
  const action = distributionCase || boundaryCase ? 'boundary' as const : createCase ? 'create' as const : negativeCase ? 'negative' as const : 'edit' as const;
  const base = ['TC-FLV-SEA-010', 'TC-FLV-SEA-019', 'TC-FLV-SEA-021', 'TC-FLV-SEA-044', 'TC-FLV-SEA-045'].includes(formalCase.id)
    ? buildMinimalCreateCase(formalCase)
    : buildStaticContractCase(formalCase);
  const actions: Record<string, string[]> = {
    'TC-FLV-SEA-010': ['打开品牌调味缺省页，进入“使用行业通用调味”选择页。', '选择已审计的行业调味组和调味项并点击确定。', '回到品牌调味列表，按唯一业务身份核对创建结果。'],
    'TC-FLV-SEA-011': ['进入品牌调味新增页，仅填写已审计的非目标字段。', '点击确定，读取必填字段高亮、提示文本和创建请求计数。'],
    'TC-FLV-SEA-012': ['进入品牌调味新增页，填写第二名称和 POS 名称，保持调味组名称为空。', '点击确定，读取“调味组名称必填”字段级反馈且确认未发送创建请求。'],
    'TC-FLV-SEA-013': ['打开已登记的品牌调味组编辑页。', '点击添加调味，仅填写第二名称并保存。', '核对新增项被拒绝且原调味组身份和原有调味项保持不变。'],
    'TC-FLV-SEA-019': ['进入品牌调味新增页，填写已审计的组名称、第二名称、POS 名称、调味项名称、第二名称、送厨名称和价格。', '点击确定并回读列表和服务端详情。'],
    'TC-FLV-SEA-021': ['打开已登记的品牌调味组编辑页。', '点击添加调味，填写调味项名称、第二名称和价格后保存。', '回读原组和新增项的页面及服务端身份。'],
    'TC-FLV-SEA-022': ['打开包含 50 个已审计调味项的调味组编辑页。', '点击添加调味，读取按钮状态和页面限制反馈。', '核对调味项数量仍为 50 个且未发送保存请求。'],
    'TC-FLV-SEA-023': ['读取一个当前商户尚未导入且至少含两个当前可选项的行业调味组，首次选择两个真实调味项并保存。', '再次导入同组中的一个已选调味项并保存。', '核对两次请求均成功、最终调味项集合等于并集、重复项仅一份且调味组仅一条。'],
    'TC-FLV-SEA-024': ['打开已有调味组并进入新增调味页。', '填写与已有第二名称重复的业务身份后点击确定。', '核对重复校验反馈、未发送有效创建结果且原数据保持不变。'],
    'TC-FLV-SEA-025': ['打开已有调味组并进入新增调味页。', '填写与已有调味组第二名称冲突的业务身份后点击确定。', '核对跨语言重复校验反馈且未产生重复调味组。'],
    'TC-FLV-SEA-026': ['打开已有调味组并进入新增调味页。', '填写与已有调味组名称冲突的业务身份后点击确定。', '核对组名或调味项重复反馈且未产生重复数据。'],
    'TC-FLV-SEA-027': ['打开已有调味组编辑页并点击添加调味。', '填写与组内既有调味项同名的调味项后点击确定。', '核对同组重复反馈、保存未生效且原调味项仍保持一份。'],
    'TC-FLV-SEA-028': ['打开已登记调味组编辑页。', '点击目标调味项删除后直接保存，不等待或断言二次确认弹窗。', '返回调味列表并核对目标调味项已删除，同时读取服务端详情确认无残留。'],
    'TC-FLV-SEA-033': ['打开已登记调味组编辑页。', '修改已登记调味项名称并保存。', '核对页面操作成功且服务端详情回读新调味项名称。'],
    'TC-FLV-SEA-034': ['进入品牌调味新增页填写唯一业务身份。', '点击取消/返回，不发送创建请求并核对服务端无残留。'],
    'TC-FLV-SEA-035': ['打开已登记调味组编辑页。', '修改调味组名称后点击取消，不保存临时名称。', '核对返回列表、服务端仍保留原组名且临时名称不存在。'],
    'TC-FLV-SEA-036': ['打开已登记调味组删除入口。', '打开二次确认后点击取消。', '核对返回列表、服务端仍保留原调味组。'],
    'TC-FLV-SEA-037': ['准备两个已登记且身份唯一的调味组。', '勾选源组调味项并执行批量变更调味组，选择目标组。', '核对批量请求成功且源组不再拥有该调味项。'],
    'TC-FLV-SEA-040': ['打开含两个调味项的已登记调味组编辑页。', '通过调味项排序拖动合同调整两个调味项顺序并保存。', '核对更新响应成功且服务端详情中的调味项顺序与页面一致。'],
    'TC-FLV-SEA-041': ['打开调味组排序弹窗。', '拖动两个真实调味组调整顺序并点击保存。', '核对排序保存操作完成且列表仍可正常展示。'],
    'TC-FLV-SEA-044': ['准备两个不同的调味组，第一组已有唯一调味项。', '通过 UI 新增第二组并添加同名调味项。', '核对两个组均展示该调味项且无重复名称错误。'],
    'TC-FLV-SEA-045': ['通过 UI 新增 100 字符组名并保存。', '在该组编辑页通过 UI 新增 100 字符调味项并保存。', '回读页面和服务端详情中的完整身份。'],
    'TC-FLV-TPL-010': ['进入调味模板新增页，保持模板名称为空。', '点击保存，核对名称字段高亮、必填提示且未发送创建请求。'],
    'TC-FLV-TPL-012': ['进入调味模板新增页，仅填写模板名称并选择一个已审计调味组。', '点击保存并在模板列表回读唯一模板身份。'],
    'TC-FLV-TPL-013': ['进入调味模板新增页，填写模板名称、第二语言、说明并选择一个已审计调味组。', '点击保存并回读模板页面和服务端详情。'],
    'TC-FLV-TPL-014': ['进入调味模板新增页，填写唯一模板名称但不选择调味组。', '点击保存，核对精确必选提示、路由未离开且未发送创建请求。'],
    'TC-FLV-TPL-015': ['使用已登记模板身份进入新增流程并选择调味组。', '点击保存，核对重复模板被拒绝且未产生新模板。'],
    'TC-FLV-TPL-016': ['使用已登记模板身份进入新增流程并选择调味组。', '点击保存，读取页面重复内容反馈和请求结果。'],
    'TC-FLV-TPL-017': ['打开已登记模板操作菜单进入编辑页。', '修改模板说明并保存，核对页面与服务端详情均为新说明。'],
    'TC-FLV-TPL-018': ['打开已登记模板编辑页。', '在选择调味弹窗勾选一个未选调味项并保存。', '核对模板内调味数量和服务端明细增加。'],
    'TC-FLV-TPL-019': ['打开含两个调味项的已登记模板编辑页。', '在选择调味弹窗取消一个已选项并保存。', '核对模板内目标调味项被移除且保留项仍存在。'],
    'TC-FLV-TPL-020': ['打开含调味项的已登记模板操作菜单。', '点击删除并完成二次确认，核对模板列表和服务端均无该模板。'],
    'TC-FLV-TPL-021': ['打开已登记调味模板的删除入口。', '读取删除模板二次确认文案并确认删除。', '核对删除响应成功且服务端模板列表不再包含该模板。'],
    'TC-FLV-TPL-022': ['打开已登记模板操作菜单，进入下发门店弹窗。', '选择已审计目标门店并确认下发。', '回读门店全局调味并与模板明细逐项比对。'],
    'TC-FLV-TPL-023': ['准备模板 A 和模板 B，并分别通过 UI 下发到同一门店。', '先下发模板 A，再下发模板 B。', '核对两次下发成功且门店最终仅展示模板 B 的调味数据。'],
    'TC-FLV-TPL-024': ['通过 UI 将模板下发到 Ces test（门店 ID：M000023918）并记录该门店调味快照。', '编辑模板但不再次下发，确认左下角当前门店仍为 Ces test（门店 ID：M000023918），核对门店快照不变。', '再次通过 UI 将模板下发到 Ces test（门店 ID：M000023918），再次确认当前门店身份后核对门店调味更新。'],
    'TC-FLV-TPL-025': ['进入调味模板新增页，填写唯一模板名称和恰好 250 个字符的模板说明。', '选择一个已审计调味组后保存，回读请求和模板详情。'],
    'TC-FLV-REC-003': ['打开调味下发记录并读取门店、执行状态、任务名称和重置控件。', '分别使用现有记录值组合查询。', '核对查询请求带有已选条件且返回行均匹配任务、门店和状态。'],
  };
  const sourceIds = ['TC-FLV-SEA-011', 'TC-FLV-SEA-012', 'TC-FLV-SEA-013'].includes(formalCase.id)
    ? base.sourceIds
    : templateCase
    ? ['formal:seasoning-test-plan', 'runtime:seasoning-template-audit', 'runtime:seasoning-template-create-audit']
    : ['formal:seasoning-test-plan', 'runtime:seasoning-audit'];
  const routeValue = templateCase
    ? ['TC-FLV-TPL-010', 'TC-FLV-TPL-012', 'TC-FLV-TPL-013', 'TC-FLV-TPL-014', 'TC-FLV-TPL-025'].includes(formalCase.id) ? templateCreateRoute : templateRoute
    : route;
  const mutation = formalCase.id === 'TC-FLV-SEA-010' || formalCase.id === 'TC-FLV-SEA-019' || formalCase.id === 'TC-FLV-SEA-021' || formalCase.id === 'TC-FLV-SEA-044' || formalCase.id === 'TC-FLV-SEA-045'
    ? { method: 'POST' as const, operationKey: createOperationKey }
    : formalCase.id === 'TC-FLV-SEA-013'
      ? undefined
    : formalCase.id === 'TC-FLV-SEA-023'
      ? { method: 'POST' as const, operationKey: seedOperationKey }
    : ['TC-FLV-SEA-024', 'TC-FLV-SEA-025', 'TC-FLV-SEA-026'].includes(formalCase.id)
      ? { method: 'POST' as const, operationKey: createOperationKey }
    : formalCase.id === 'TC-FLV-SEA-027'
      ? { method: 'PUT' as const, operationKey: updateOperationKey }
    : ['TC-FLV-SEA-028', 'TC-FLV-SEA-033'].includes(formalCase.id)
      ? { method: 'PUT' as const, operationKey: updateOperationKey }
    : formalCase.id === 'TC-FLV-SEA-037'
      ? { method: 'POST' as const, operationKey: 'brand-menu:POST /ops-brand/global-modifier/options/batch-move' }
    : formalCase.id === 'TC-FLV-SEA-040'
      ? { method: 'PUT' as const, operationKey: updateOperationKey }
    : formalCase.id === 'TC-FLV-SEA-041'
      ? { method: 'PUT' as const, operationKey: 'brand-menu:PUT /ops-brand/global-modifier/sort' }
    : formalCase.id === 'TC-FLV-TPL-022'
      ? { method: 'POST' as const, operationKey: 'brand-menu:POST /ops-brand/brand-modifier-sync/by-template' }
    : formalCase.id === 'TC-FLV-TPL-021'
      ? { method: 'DELETE' as const, operationKey: 'brand-menu:DELETE /ops-brand/modifier-template/{id}' }
    : ['TC-FLV-TPL-023', 'TC-FLV-TPL-024'].includes(formalCase.id)
      ? { method: 'POST' as const, operationKey: 'brand-menu:POST /ops-brand/brand-modifier-sync/by-template' }
    : (base as { mutation?: { method: 'POST' | 'PUT' | 'PATCH' | 'DELETE'; operationKey: string } }).mutation;
  const requiresSeed = [
    'TC-FLV-SEA-013', 'TC-FLV-SEA-021', 'TC-FLV-SEA-022', 'TC-FLV-SEA-024', 'TC-FLV-SEA-025', 'TC-FLV-SEA-026', 'TC-FLV-SEA-027',
    'TC-FLV-SEA-028', 'TC-FLV-SEA-033', 'TC-FLV-SEA-035', 'TC-FLV-SEA-036', 'TC-FLV-SEA-037', 'TC-FLV-SEA-040', 'TC-FLV-SEA-041',
    'TC-FLV-SEA-044', 'TC-FLV-SEA-045', 'TC-FLV-TPL-015', 'TC-FLV-TPL-016', 'TC-FLV-TPL-017', 'TC-FLV-TPL-018', 'TC-FLV-TPL-019',
    'TC-FLV-TPL-020', 'TC-FLV-TPL-021', 'TC-FLV-TPL-022', 'TC-FLV-TPL-023', 'TC-FLV-TPL-024',
  ].includes(formalCase.id);
  const expectation = base.expectations[0];
  return {
    ...base,
    sourceIds,
    route: routeValue,
    action,
    dataProfileId: templateCase
      ? formalCase.id === 'TC-FLV-TPL-020' || formalCase.id === 'TC-FLV-TPL-021'
        ? 'seasoning-template-delete-reversible'
        : ['TC-FLV-TPL-022', 'TC-FLV-TPL-023', 'TC-FLV-TPL-024'].includes(formalCase.id)
          ? 'seasoning-template-distribution-reversible'
          : ['TC-FLV-TPL-017', 'TC-FLV-TPL-018', 'TC-FLV-TPL-019'].includes(formalCase.id)
            ? 'seasoning-template-edit-reversible'
            : ['TC-FLV-TPL-010', 'TC-FLV-TPL-014'].includes(formalCase.id)
              ? 'seasoning-negative-read'
              : 'seasoning-template-create-reversible'
      : formalCase.id === 'TC-FLV-SEA-037'
        ? 'seasoning-batch-move-reversible'
      : formalCase.id === 'TC-FLV-SEA-041'
        ? 'seasoning-sort-reversible'
      : formalCase.id === 'TC-FLV-SEA-022'
        ? 'seasoning-fixture-only-reversible'
      : formalCase.id === 'TC-FLV-SEA-013'
        ? 'seasoning-fixture-only-reversible'
      : ['TC-FLV-SEA-035', 'TC-FLV-SEA-036'].includes(formalCase.id)
        ? 'seasoning-cancel-reversible'
      : formalCase.id === 'TC-FLV-SEA-040'
            ? 'seasoning-edit-reversible'
          : formalCase.id === 'TC-FLV-SEA-027'
            ? 'seasoning-edit-reversible'
          : formalCase.id === 'TC-FLV-SEA-023'
            ? 'seasoning-industry-import-reversible'
          : ['TC-FLV-SEA-024', 'TC-FLV-SEA-025', 'TC-FLV-SEA-026'].includes(formalCase.id)
        ? 'seasoning-negative-reversible'
          : negativeCase ? 'seasoning-negative-read' : createCase ? 'seasoning-create-reversible' : 'seasoning-edit-reversible',
    actions: actions[formalCase.id] ?? [`按正式用例 ${formalCase.id} 执行已审计的真实业务操作并读取最终状态。`],
    expectations: [{
      ...expectation,
      expected: formalCase.title,
      assertionAdapterId: 'merchant-center.seasoning.assert-ui-mutation',
      sourceIds,
      contractIds: base.contractIds,
      assertionSurfaceId: templateCase ? (routeValue === templateCreateRoute ? 'ui.seasoning-template-create' : 'ui.seasoning-template') : 'ui.seasoning-list',
    }],
    capabilities: [{ id: 'merchant-center.seasoning.ui-mutation' }],
    mutation,
    ...(requiresSeed ? { seed: { adapterId: 'merchant-center.seasoning.seed' } } : {}),
    ...((mutation || requiresSeed) ? { cleanup: { adapterId: 'merchant-center.seasoning.cleanup' } } : {}),
    semantics: {
      ...base.semantics,
      scenarioFamilyId: `ui-mutation-${formalCase.id}`,
      stateTransitionId: formalCase.id === 'TC-FLV-SEA-023'
        ? 'existing-options-to-deduplicated-union'
        : action === 'create' ? 'absent-to-created' : action === 'negative' ? 'invalid-draft-to-rejected' : 'existing-to-edited',
      variantId: formalCase.id,
      variantSourceIds: ['formal:seasoning-test-plan'],
      businessIdentityStrategy: (mutation || requiresSeed) ? 'unique-marker' : base.semantics.businessIdentityStrategy,
    },
  };
}

function sha256(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function sha256File(filePath: string): string {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function extractFormalCaseIndex(markdown: string): FormalCase[] {
  const normalized = markdown.replace(/\r\n/g, '\n');
  const headings = [...normalized.matchAll(/^### 用例编号：(.+)$/gm)];
  return headings.map((heading, index) => {
    const start = heading.index ?? 0;
    const end = headings[index + 1]?.index ?? normalized.length;
    const block = normalized.slice(start, end);
    const field = (label: string): string => {
      const match = block.match(new RegExp(`^${label}(.+)$`, 'm'));
      if (!match?.[1]?.trim()) throw new Error(`调味正式方案索引字段缺失：${heading[1]} -> ${label}`);
      return match[1].trim();
    };
    const priority = field('优先级：');
    if (!['P0', 'P1', 'P2'].includes(priority)) throw new Error(`调味正式方案优先级无效：${heading[1]}`);
    return { id: heading[1].trim(), title: field('用例标题：'), module: field('所属模块：'), priority: priority as FormalCase['priority'] };
  });
}

function writeJson(filePath: string, value: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.tmp`;
  fs.writeFileSync(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  fs.renameSync(temporaryPath, filePath);
}

if (require.main === module) {
  const { plan } = buildPlan();
  writeJson(path.join(systemRoot, 'test-plan.json'), plan);
  const adapters = buildAdapters();
  writeJson(path.join(systemRoot, 'adapters.json'), adapters);
  const manifestPath = path.join(systemRoot, 'manifest.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as {
    sources: Record<string, string>;
    dataProfiles: Record<string, SystemTestDataProfile>;
    cases: Array<{
      caseId: string;
      ruleId: string;
      recipeId: string;
      dataProfileId: string;
      executionContextProfile: string;
    }>;
  };
  const compiled = compileSystemTestPlan({ plan: plan as SystemTestPlan, dataProfiles: manifest.dataProfiles });
  if (compiled.errors.length > 0) throw new Error(compiled.errors.join('\n'));
  writeJson(path.join(systemRoot, 'recipes.json'), compiled.recipeCollection);
  writeJson(path.join(systemRoot, 'rules.json'), compiled.ruleLedger);
  writeJson(path.join(systemRoot, 'classification-ledger.json'), compiled.classificationLedger);
  manifest.cases = compiled.bindings.map((item) => ({
    ...item,
    executionContextProfile: item.executionContextProfile ?? '',
  }));
  manifest.sources.recipeCollectionFingerprint = compiled.recipeCollection.fingerprint;
  manifest.sources.ruleLedgerFingerprint = compiled.ruleLedger.fingerprint;
  manifest.sources.adapterCatalogFingerprint = fingerprintSystemTestValue(adapters);
  writeJson(manifestPath, manifest);
  process.stdout.write(`调味管理正式方案：${plan.classifiedExclusions.length + plan.cases.length} 条；可执行选择：${plan.cases.length} 条；结构化分类排除：${plan.classifiedExclusions.length} 条。\n`);
}

function buildAdapters() {
  const implementation = (relativePath: string, sourceSection?: string) => {
    const source = {
      path: relativePath.replace(/\\/g, '/'),
      ...(sourceSection ? { sourceSection } : {}),
    };
    return {
      ...source,
      sha256: fingerprintSystemTestImplementationSource(projectRoot, source),
    };
  };
  const systemSpecPath = 'systems/merchant-center-product-center-seasoning/tests/system.spec.ts';
  const seasoningPagePath = 'pages/product-center/seasoning-boundary.page.ts';
  const systemSpec = {
    ...implementation('systems/merchant-center-product-center-seasoning/tests/system.spec.ts'),
    dependencies: [
      implementation('adapters/product-center/seasoning-reporting.ts'),
      implementation('adapters/product-center/seasoning-read-assertions.ts'),
      implementation('pages/product-center/seasoning-boundary.page.ts'),
      implementation('pages/product-center/product-center-sop.page.ts'),
      implementation('flows/auth.flow.ts'),
      implementation('pages/auth-login.page.ts'),
    ],
  };
  const setupSpec = {
    ...implementation('systems/merchant-center-product-center-seasoning/tests/setup.spec.ts'),
    dependencies: [
      implementation('flows/auth.flow.ts'),
      implementation('pages/auth-login.page.ts'),
      implementation('test-data/seasoning-context.ts'),
    ],
  };
  const preflightSpec = implementation('systems/merchant-center-product-center-seasoning/tests/preflight.spec.ts');
  const recoverySpec = implementation('systems/merchant-center-product-center-seasoning/tests/recovery.spec.ts');
  type AdapterImplementation = {
    path: string;
    sha256: string;
    sourceSection?: string;
    dependencies?: Array<{ path: string; sha256: string; sourceSection?: string }>;
  };
  const systemSection = (sourceSection: string, dependencies: AdapterImplementation['dependencies'] = []): AdapterImplementation => ({
    ...implementation(systemSpecPath, sourceSection),
    ...(dependencies.length ? { dependencies } : {}),
  });
  const storeCommonDependencies = [
    implementation(systemSpecPath, 'seasoning-store-mutation-common-before'),
    implementation(systemSpecPath, 'seasoning-store-mutation-common-after'),
    implementation(seasoningPagePath, 'seasoning-page-store-mutation-common'),
  ];
  const storeReadiness = (...pageSections: string[]) => systemSection('seasoning-store-action-readiness', [
    implementation(systemSpecPath, 'seasoning-store-readiness-identity-helpers'),
    implementation(seasoningPagePath, 'seasoning-page-store-action-readiness-dispatch'),
    implementation(seasoningPagePath, 'seasoning-page-store-mutation-common'),
    ...pageSections.map((sourceSection) => implementation(seasoningPagePath, sourceSection)),
  ]);
  const singleStoreSeed = systemSection('seasoning-seed-single-store-distribution', [
    implementation(systemSpecPath, 'seasoning-seed-store-common'),
  ]);
  const multiStoreSeed = systemSection('seasoning-seed-multi-store-distribution', [
    implementation(systemSpecPath, 'seasoning-seed-store-common'),
    implementation(seasoningPagePath, 'seasoning-page-distribute-template'),
  ]);
  const common = (id: string, kind: string, actions: string[], file: AdapterImplementation = systemSpec, observationChannels?: string[]) => ({
    id,
    kind,
    actions,
    ...(observationChannels ? { observationChannels } : {}),
    implementation: file,
  });
  return {
    schemaVersion: '1.0.0',
    systemId,
    adapters: [
      common('merchant-center.seasoning.auth', 'auth', ['read'], setupSpec),
      common('merchant-center.seasoning.context', 'context-guard', ['read', 'create', 'edit', 'delete', 'negative', 'boundary'], systemSection('seasoning-context-guard')),
      common('merchant-center.seasoning.preflight', 'probe', ['read', 'create', 'edit', 'delete', 'negative', 'boundary'], preflightSpec),
      common('merchant-center.seasoning.seed', 'seed', ['create', 'edit', 'delete', 'negative', 'boundary'], systemSpec),
      common('merchant-center.seasoning.seed-single-store-distribution', 'seed', ['create'], singleStoreSeed),
      common('merchant-center.seasoning.seed-multi-store-distribution', 'seed', ['create', 'delete'], multiStoreSeed),
      common('merchant-center.seasoning.single-store-action-readiness', 'action-readiness', ['create'], storeReadiness('seasoning-page-single-store-action-readiness')),
      common('merchant-center.seasoning.store-group-delete-action-readiness', 'action-readiness', ['delete'], storeReadiness('seasoning-page-store-group-delete-action-readiness')),
      common('merchant-center.seasoning.store-option-delete-action-readiness', 'action-readiness', ['delete'], storeReadiness('seasoning-page-store-option-delete-action-readiness')),
      common('merchant-center.seasoning.store-batch-delete-action-readiness', 'action-readiness', ['delete'], storeReadiness('seasoning-page-store-batch-delete-action-readiness')),
      common('merchant-center.seasoning.store-redeliver-action-readiness', 'action-readiness', ['create'], storeReadiness(
        'seasoning-page-store-group-delete-action-readiness',
        'seasoning-page-template-distribution-action-readiness',
      )),
      common('merchant-center.seasoning.cleanup', 'cleanup', ['create', 'edit', 'delete', 'negative', 'boundary'], systemSection('seasoning-cleanup')),
      common('merchant-center.seasoning.api-zero-residue', 'api-residue', ['create', 'edit', 'delete', 'negative', 'boundary'], systemSection('seasoning-cleanup'), ['cleanup']),
      common('merchant-center.seasoning.ui-zero-residue', 'ui-residue', ['create', 'edit', 'delete', 'negative', 'boundary'], systemSection('seasoning-cleanup'), ['cleanup']),
      common('merchant-center.seasoning.recovery', 'recovery', ['read'], recoverySpec),
      common('merchant-center.seasoning.create-boundary', 'capability', ['boundary'], systemSpec),
      common('merchant-center.seasoning.create-minimal', 'capability', ['create'], systemSpec),
      common('merchant-center.seasoning.edit-group', 'capability', ['edit'], systemSpec),
      common('merchant-center.seasoning.delete-empty-group', 'capability', ['delete'], systemSpec),
      common('merchant-center.seasoning.price-correction', 'capability', ['negative'], systemSpec),
      common('merchant-center.seasoning.rounding', 'capability', ['boundary'], systemSpec),
      common('merchant-center.seasoning.record-task-search', 'capability', ['read'], systemSpec),
      common('merchant-center.seasoning.record-reset', 'capability', ['read'], systemSpec),
      common('merchant-center.seasoning.template-create-audit', 'capability', ['read'], systemSpec),
      common('merchant-center.seasoning.template-distribution-audit', 'capability', ['read'], systemSpec),
      common('merchant-center.seasoning.single-store-template-absence', 'capability', ['read'], systemSpec),
      common('merchant-center.seasoning.store-replace-distribution', 'capability', ['create', 'boundary'], systemSection('seasoning-store-replace-distribution', [
        ...storeCommonDependencies,
        implementation(seasoningPagePath, 'seasoning-page-distribute-all-single-store'),
      ])),
      common('merchant-center.seasoning.store-delete-group', 'capability', ['delete'], systemSection('seasoning-store-delete-group', [
        ...storeCommonDependencies,
        implementation(seasoningPagePath, 'seasoning-page-delete-store-group'),
      ])),
      common('merchant-center.seasoning.store-delete-option', 'capability', ['delete'], systemSection('seasoning-store-delete-option', [
        ...storeCommonDependencies,
        implementation(seasoningPagePath, 'seasoning-page-delete-store-option'),
      ])),
      common('merchant-center.seasoning.store-batch-delete', 'capability', ['delete', 'boundary'], systemSection('seasoning-store-batch-delete', [
        ...storeCommonDependencies,
        implementation(seasoningPagePath, 'seasoning-page-batch-delete-store'),
      ])),
      common('merchant-center.seasoning.store-redeliver-restore', 'capability', ['create', 'delete'], systemSection('seasoning-store-redeliver-restore', [
        ...storeCommonDependencies,
        implementation(seasoningPagePath, 'seasoning-page-delete-store-group'),
        implementation(seasoningPagePath, 'seasoning-page-distribute-template'),
      ])),
      common('merchant-center.seasoning.static-contract', 'capability', ['read', 'negative', 'boundary'], systemSpec),
      common('merchant-center.seasoning.template-name-normalization', 'capability', ['boundary'], systemSpec),
      common('merchant-center.seasoning.ui-mutation', 'capability', ['create', 'edit', 'negative', 'boundary'], systemSpec),
      common('merchant-center.seasoning.assert-static-contract', 'assertion', ['read', 'boundary'], systemSpec, ['ui']),
      common('merchant-center.seasoning.assert-ui-mutation', 'assertion', ['create', 'edit', 'negative', 'boundary'], systemSpec, ['ui', 'api']),
      common('merchant-center.seasoning.assert-ui-created', 'assertion', ['create', 'boundary'], systemSpec, ['ui']),
      common('merchant-center.seasoning.assert-api-created', 'assertion', ['boundary'], systemSpec, ['api']),
      common('merchant-center.seasoning.assert-api-identity', 'assertion', ['create'], systemSpec, ['api']),
      common('merchant-center.seasoning.assert-ui-edited', 'assertion', ['edit'], systemSpec, ['ui']),
      common('merchant-center.seasoning.assert-api-edited', 'assertion', ['edit'], systemSpec, ['api']),
      common('merchant-center.seasoning.assert-ui-deleted', 'assertion', ['delete'], systemSpec, ['ui']),
      common('merchant-center.seasoning.assert-api-deleted', 'assertion', ['delete'], systemSpec, ['api']),
      common('merchant-center.seasoning.assert-create-price-correction', 'assertion', ['negative'], systemSpec, ['api']),
      common('merchant-center.seasoning.assert-edit-price-reversion', 'assertion', ['negative'], systemSpec, ['ui']),
      common('merchant-center.seasoning.assert-round-half-up', 'assertion', ['boundary'], systemSpec, ['api']),
      common('merchant-center.seasoning.assert-round-down', 'assertion', ['boundary'], systemSpec, ['api']),
      common('merchant-center.seasoning.assert-record-task-search', 'assertion', ['read'], systemSpec, ['ui']),
      common('merchant-center.seasoning.assert-record-reset', 'assertion', ['read'], systemSpec, ['ui']),
      common('merchant-center.seasoning.assert-template-create-fields', 'assertion', ['read'], systemSpec, ['ui']),
      common('merchant-center.seasoning.assert-template-create-required', 'assertion', ['read'], systemSpec, ['ui']),
      common('merchant-center.seasoning.assert-template-distribution-menu', 'assertion', ['read'], systemSpec, ['ui']),
      common('merchant-center.seasoning.assert-template-store-dialog', 'assertion', ['read'], systemSpec, ['ui']),
      common('merchant-center.seasoning.assert-single-store-template-absence', 'assertion', ['read'], systemSpec, ['ui']),
      common('merchant-center.seasoning.assert-store-mutation', 'assertion', ['create', 'delete', 'boundary'], systemSection('seasoning-assert-store-mutation'), ['ui', 'api']),
    ],
    operationKeys: [
      createOperationKey,
      seedOperationKey,
      updateOperationKey,
      deleteOperationKey,
      'brand-menu:POST /ops-brand/global-modifier/options/batch-move',
      'brand-menu:PUT /ops-brand/global-modifier/sort',
      'brand-menu:POST /ops-brand/brand-modifier-sync/all',
      'brand-menu:POST /ops-brand/brand-modifier-sync/by-template',
      'brand-menu:POST /ops-brand/modifier-template',
      'brand-menu:GET /ops-brand/modifier-template/page',
      'brand-menu:PUT /ops-brand/modifier-template/{id}',
      'brand-menu:DELETE /ops-brand/modifier-template/{id}',
      'brand-menu:GET /ops-poi/global-modifier/list',
      'brand-menu:DELETE /ops-poi/global-modifier/{id}',
      'brand-menu:DELETE /ops-poi/global-modifier/option/{optionId}',
      'brand-menu:POST /ops-poi/global-modifier/batch-delete',
    ],
    externalCapabilities: [],
  };
}

export { buildPlan, systemId };
