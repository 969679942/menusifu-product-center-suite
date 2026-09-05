import { createHash } from 'node:crypto';

export type ItemTechnicalBindingGapClassification =
  | 'runtime-accepted'
  | 'recipe-existing-runtime-required'
  | 'recipe-drift-repair-required'
  | 'page-observation-required'
  | 'capability-mapping-required';

export type ItemTechnicalBindingGapEntry = {
  caseId: string;
  title: string;
  priority: 'P0' | 'P1' | 'P2';
  canonicalStatus: string;
  classification: ItemTechnicalBindingGapClassification;
  evidenceKind: 'direct-recipe' | 'approved-external-source' | 'legacy-binding' | 'page-observation' | 'none';
  evidence: {
    recipeIds: string[];
    acceptanceCaseIds: string[];
    approvedBindingIds: string[];
    pageCapabilityIds: string[];
    sourceRefs: string[];
  };
  currentCanonicalClaimCount: number;
  recipeClaimCount: number;
  claimAlignment: 'exact' | 'source-ref-exact' | 'drifted' | 'missing';
  technicalDimensions: {
    navigation: 'observed' | 'evidence-covered' | 'required';
    capabilities: 'evidence-covered' | 'partial' | 'required';
    assertions: 'evidence-covered' | 'partial' | 'required';
    apiOperation: 'evidence-covered' | 'assessment-required';
    testDataFactory: 'evidence-covered' | 'assessment-required';
    cleanupAdapter: 'evidence-covered' | 'assessment-required';
    runtimeAcceptance: 'accepted' | 'required' | 'blocked-by-drift';
    technicalApproval: 'accepted' | 'required';
  };
  gapCodes: string[];
  firstP0BatchEligible: boolean;
  reason: string;
};

export type ProductCenterItemTechnicalBindingGapDocument = {
  schemaVersion: '1.0.0';
  collectionId: 'product-center-item-technical-binding-gap';
  generatedAt: string;
  sourceFingerprints: Record<string, string>;
  summary: {
    canonicalTotal: number;
    activeTotal: number;
    deprecated: number;
    runtimeAccepted: number;
    recipeExistingRuntimeRequired: number;
    recipeDriftRepairRequired: number;
    pageObservationRequired: number;
    capabilityMappingRequired: number;
    firstP0BatchEligible: number;
    firstP0BatchBlocked: number;
    byPriority: Record<string, number>;
    byGapCode: Record<string, number>;
  };
  firstP0Batch: {
    readyCaseIds: string[];
    blockedCaseIds: string[];
    newRecipeGenerationCount: 0;
    note: string;
  };
  guardrails: {
    pageObservationMayNotDefineBusinessRule: true;
    sourceRefMappingMustBeExact: true;
    runtimeAcceptanceRequiresClaimAlignmentOrExactSourceRef: true;
    noNewRecipeGeneratedByMatrix: true;
  };
  entries: ItemTechnicalBindingGapEntry[];
  fingerprint: string;
};

type CanonicalCase = {
  id: string;
  title: string;
  priority: 'P0' | 'P1' | 'P2';
  status: string;
  preconditions?: string[];
  actions?: string[];
  expectedResults?: string[];
};

type CanonicalPlan = {
  fingerprint: string;
  cases: CanonicalCase[];
};

type Recipe = {
  id: string;
  caseId: string;
  claimIds?: string[];
  capabilities?: Array<{ id: string }>;
  assertions?: Array<{ adapterId: string }>;
  seed?: { adapterId: string };
  cleanup?: { adapterId: string };
  mutation?: { operationKey?: string };
};

type Binding = {
  canonicalId: string;
  internalCaseId?: string;
  sourceBindings?: Array<{ ref?: string; sourceIds?: string[] }>;
  capabilityIds?: string[];
  assertionAdapterIds?: string[];
  seedAdapterIds?: string[];
  cleanupAdapterIds?: string[];
  status?: string;
};

type PageCapability = {
  id: string;
  formalCaseIds?: string[];
};

type Acceptance = {
  acceptedCaseIds?: string[];
  caseAcceptance?: Array<{ caseId: string; accepted: boolean }>;
  fingerprint?: string;
  runId?: string;
};

type SourceFingerprintDocument = { fingerprint?: string };

export type ProductCenterItemTechnicalBindingGapInput = {
  canonical: CanonicalPlan;
  recipes: Recipe[];
  directAcceptances: Acceptance[];
  approvedBindings: Binding[];
  approvedRecipes: Recipe[];
  approvedAcceptance: Acceptance;
  pageCapabilities: PageCapability[];
  sourceFingerprints?: Record<string, string>;
  generatedAt?: string;
};

export function buildProductCenterItemTechnicalBindingGap(
  input: ProductCenterItemTechnicalBindingGapInput,
): ProductCenterItemTechnicalBindingGapDocument {
  const recipeByCaseId = new Map(input.recipes.map((recipe) => [recipe.caseId, recipe]));
  const approvedRecipeByCaseId = new Map(input.approvedRecipes.map((recipe) => [recipe.caseId, recipe]));
  const pageCapabilityIdsByCaseId = new Map<string, string[]>();
  for (const capability of input.pageCapabilities) {
    for (const caseId of capability.formalCaseIds ?? []) {
      pageCapabilityIdsByCaseId.set(caseId, [
        ...(pageCapabilityIdsByCaseId.get(caseId) ?? []),
        capability.id,
      ]);
    }
  }
  const directAcceptedCaseIds = new Set(input.directAcceptances.flatMap(acceptedCaseIds));
  const approvedAcceptedCaseIds = new Set(input.approvedAcceptance.acceptedCaseIds ?? []);
  const externalMappings = buildExternalMappings(
    input.approvedBindings,
    approvedRecipeByCaseId,
    approvedAcceptedCaseIds,
  );
  const entries = input.canonical.cases.map((item) => buildEntry({
    item,
    directRecipe: recipeByCaseId.get(item.id),
    directAccepted: directAcceptedCaseIds.has(item.id),
    externalMapping: externalMappings.get(item.id),
    pageCapabilityIds: [...new Set(pageCapabilityIdsByCaseId.get(item.id) ?? [])],
    approvedBindings: input.approvedBindings,
  }));
  const summary = buildSummary(entries);
  const value = {
    schemaVersion: '1.0.0' as const,
    collectionId: 'product-center-item-technical-binding-gap' as const,
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    sourceFingerprints: input.sourceFingerprints ?? {},
    summary,
    firstP0Batch: {
      readyCaseIds: entries.filter((entry) => entry.firstP0BatchEligible).map((entry) => entry.caseId),
      blockedCaseIds: entries
        .filter((entry) => entry.priority === 'P0' && !entry.firstP0BatchEligible && entry.canonicalStatus !== 'deprecated')
        .map((entry) => entry.caseId),
      newRecipeGenerationCount: 0 as const,
      note: '当前矩阵只筛选已有精确 Recipe 与运行验收证据的 P0，不凭矩阵自动生成新 Recipe。',
    },
    guardrails: {
      pageObservationMayNotDefineBusinessRule: true as const,
      sourceRefMappingMustBeExact: true as const,
      runtimeAcceptanceRequiresClaimAlignmentOrExactSourceRef: true as const,
      noNewRecipeGeneratedByMatrix: true as const,
    },
    entries,
  };
  return { ...value, fingerprint: hashValue(value) };
}

export function renderProductCenterItemTechnicalBindingGapMarkdown(
  document: ProductCenterItemTechnicalBindingGapDocument,
): string {
  const lines = [
    '# 商品中心商品技术绑定差距矩阵',
    '',
    `- canonical 总数：${document.summary.canonicalTotal}`,
    `- 活动用例：${document.summary.activeTotal}`,
    `- 已废弃：${document.summary.deprecated}`,
    `- 当前运行验收通过：${document.summary.runtimeAccepted}`,
    `- 已有 Recipe 但需运行验收：${document.summary.recipeExistingRuntimeRequired}`,
    `- Recipe 与当前 canonical 漂移：${document.summary.recipeDriftRepairRequired}`,
    `- 需页面观测：${document.summary.pageObservationRequired}`,
    `- 需能力映射：${document.summary.capabilityMappingRequired}`,
    `- 首批可直接进入 Recipe 的 P0：${document.summary.firstP0BatchEligible}`,
    `- 首批暂不可进入 Recipe 的 P0：${document.summary.firstP0BatchBlocked}`,
    '',
    `- 首批 P0：${document.firstP0Batch.readyCaseIds.join('、') || '无'}`,
    `- P0 阻塞：${document.firstP0Batch.blockedCaseIds.join('、') || '无'}`,
    `- 新生成 Recipe：${document.firstP0Batch.newRecipeGenerationCount}`,
    '',
    '## 差距分布',
    '',
    ...Object.entries(document.summary.byGapCode).map(([code, count]) => `- ${code}：${count}`),
    '',
    '## 全量明细',
    '',
    '| 用例 | 优先级 | 分类 | 证据 | Claim 对齐 | 剩余门禁 | 首批 P0 |',
    '| --- | --- | --- | --- | --- | --- | --- |',
  ];
  for (const entry of document.entries) {
    lines.push(
      `| ${entry.caseId} ${entry.title} | ${entry.priority} | ${entry.classification} | ${entry.evidenceKind} | ${entry.claimAlignment} (${entry.currentCanonicalClaimCount}/${entry.recipeClaimCount}) | ${entry.gapCodes.join(', ') || '无'} | ${entry.firstP0BatchEligible ? '是' : '否'} |`,
    );
  }
  return `${lines.join('\n').trim()}\n`;
}

function buildEntry(input: {
  item: CanonicalCase;
  directRecipe?: Recipe;
  directAccepted: boolean;
  externalMapping?: ExternalMapping;
  pageCapabilityIds: string[];
  approvedBindings: Binding[];
}): ItemTechnicalBindingGapEntry {
  const { item, directRecipe, directAccepted, externalMapping, pageCapabilityIds } = input;
  const legacyBinding = input.approvedBindings.find((binding) => binding.canonicalId === item.id);
  const recipe = directRecipe ?? externalMapping?.recipe;
  const recipeClaimIds = recipe?.claimIds ?? [];
  const currentClaimCount = claimCount(item);
  const claimAlignment = directRecipe
    ? compareClaims(item, directRecipe)
    : externalMapping
      ? 'source-ref-exact'
      : 'missing';
  const accepted = directAccepted || Boolean(externalMapping?.accepted);
  const hasRecipe = Boolean(recipe);
  const staleRecipe = Boolean(directRecipe && directAccepted && claimAlignment === 'drifted');
  const classification: ItemTechnicalBindingGapClassification = item.status === 'deprecated'
    ? 'page-observation-required'
    : staleRecipe
      ? 'recipe-drift-repair-required'
      : accepted && (!directRecipe || claimAlignment === 'exact')
        ? 'runtime-accepted'
        : hasRecipe
          ? 'recipe-existing-runtime-required'
          : pageCapabilityIds.length > 0 || legacyBinding
            ? 'capability-mapping-required'
            : 'page-observation-required';
  const hasCapabilityEvidence = Boolean(
    recipe?.capabilities?.length
    || pageCapabilityIds.length
    || legacyBinding?.capabilityIds?.length,
  );
  const hasNavigationEvidence = Boolean(
    recipe?.capabilities?.some((capability) => capability.id === 'navigation.sidebar.open')
    || legacyBinding?.capabilityIds?.includes('navigation.sidebar.open')
    || pageCapabilityIds.length > 0,
  );
  const hasAssertionEvidence = Boolean(
    recipe?.assertions?.length
    || externalMapping?.binding.assertionAdapterIds?.length
    || legacyBinding?.assertionAdapterIds?.some((adapterId) => adapterId !== 'canonical.manual-review'),
  );
  const gapCodes: string[] = [];
  if (classification === 'recipe-drift-repair-required') gapCodes.push('recipe-drift-repair-required', 'claim-alignment-required');
  if (!hasRecipe) {
    gapCodes.push('capability-mapping-required', 'assertion-mapping-required', 'technical-approval-required');
  } else if (!accepted) {
    gapCodes.push('runtime-acceptance-required');
  }
  if (!hasCapabilityEvidence && classification !== 'runtime-accepted') gapCodes.push('capability-evidence-required');
  if (!hasAssertionEvidence && classification !== 'runtime-accepted') gapCodes.push('assertion-evidence-required');
  if (classification === 'page-observation-required') gapCodes.push('page-observation-required');
  const needsLifecycleAssessment = classification !== 'runtime-accepted';
  if (needsLifecycleAssessment && !recipe?.mutation?.operationKey) gapCodes.push('api-operation-mapping-required');
  if (needsLifecycleAssessment && !recipe?.seed?.adapterId) gapCodes.push('test-data-factory-required');
  if (needsLifecycleAssessment && !recipe?.cleanup?.adapterId) gapCodes.push('cleanup-adapter-required');
  const uniqueGapCodes = [...new Set(gapCodes)];
  const firstP0BatchEligible = item.priority === 'P0'
    && item.status !== 'deprecated'
    && classification === 'runtime-accepted'
    && uniqueGapCodes.length === 0;
  return {
    caseId: item.id,
    title: item.title,
    priority: item.priority,
    canonicalStatus: item.status,
    classification,
    evidenceKind: directRecipe
      ? 'direct-recipe'
      : externalMapping
        ? 'approved-external-source'
        : legacyBinding
          ? 'legacy-binding'
          : pageCapabilityIds.length > 0
            ? 'page-observation'
            : 'none',
    evidence: {
      recipeIds: recipe ? [recipe.id] : [],
      acceptanceCaseIds: directAccepted
        ? [item.id]
        : externalMapping?.accepted
          ? [externalMapping.recipe.caseId]
          : [],
      approvedBindingIds: externalMapping?.binding.canonicalId
        ? [externalMapping.binding.canonicalId]
        : legacyBinding?.canonicalId
          ? [legacyBinding.canonicalId]
          : [],
      pageCapabilityIds,
      sourceRefs: externalMapping?.sourceRefs ?? [],
    },
    currentCanonicalClaimCount: currentClaimCount,
    recipeClaimCount: recipeClaimIds.length,
    claimAlignment,
    technicalDimensions: {
      navigation: hasRecipe ? 'evidence-covered' : hasNavigationEvidence ? 'observed' : 'required',
      capabilities: classification === 'runtime-accepted' ? 'evidence-covered' : hasCapabilityEvidence ? 'partial' : 'required',
      assertions: classification === 'runtime-accepted' ? 'evidence-covered' : hasAssertionEvidence ? 'partial' : 'required',
      apiOperation: !needsLifecycleAssessment || Boolean(recipe?.mutation?.operationKey) ? 'evidence-covered' : 'assessment-required',
      testDataFactory: !needsLifecycleAssessment || Boolean(recipe?.seed?.adapterId) ? 'evidence-covered' : 'assessment-required',
      cleanupAdapter: !needsLifecycleAssessment || Boolean(recipe?.cleanup?.adapterId) ? 'evidence-covered' : 'assessment-required',
      runtimeAcceptance: classification === 'runtime-accepted' ? 'accepted' : staleRecipe ? 'blocked-by-drift' : 'required',
      technicalApproval: classification === 'runtime-accepted' ? 'accepted' : 'required',
    },
    gapCodes: uniqueGapCodes,
    firstP0BatchEligible,
    reason: buildReason(classification, item, pageCapabilityIds, claimAlignment),
  };
}

type ExternalMapping = {
  binding: Binding;
  recipe: Recipe;
  accepted: boolean;
  sourceRefs: string[];
};

function buildExternalMappings(
  bindings: Binding[],
  recipes: Map<string, Recipe>,
  acceptedCaseIds: ReadonlySet<string>,
): Map<string, ExternalMapping> {
  const mappings = new Map<string, ExternalMapping>();
  for (const binding of bindings) {
    const sourceRefs = (binding.sourceBindings ?? []).flatMap((source) => source.ref ? [source.ref] : []);
    const caseIds = [...new Set(sourceRefs.flatMap(extractItemCaseIds))];
    const recipe = recipes.get(binding.internalCaseId ?? binding.canonicalId);
    if (!recipe) continue;
    for (const caseId of caseIds) {
      mappings.set(caseId, {
        binding,
        recipe,
        accepted: acceptedCaseIds.has(recipe.caseId),
        sourceRefs,
      });
    }
  }
  return mappings;
}

function extractItemCaseIds(value: string): string[] {
  return value.match(/TC-ITEM-(?:STD|PKG|ADD)-\d{3}/g) ?? [];
}

function claimCount(item: CanonicalCase): number {
  return (item.preconditions?.length ?? 0) + (item.actions?.length ?? 0) + (item.expectedResults?.length ?? 0);
}

function compareClaims(item: CanonicalCase, recipe: Recipe): 'exact' | 'drifted' {
  const expected = [
    ...(item.preconditions ?? []).map((_, index) => `${item.id}:precondition:${index + 1}`),
    ...(item.actions ?? []).map((_, index) => `${item.id}:action:${index + 1}`),
    ...(item.expectedResults ?? []).map((_, index) => `${item.id}:expectation:${index + 1}`),
  ];
  const actual = (recipe.claimIds ?? []).map((claimId) => claimId
    .replace(/^claim:/, '')
    .replace(/:(precondition|action|expectation)-(\d+)$/, ':$1:$2'));
  return expected.length === actual.length && expected.every((claimId) => actual.includes(claimId)) ? 'exact' : 'drifted';
}

function buildReason(
  classification: ItemTechnicalBindingGapClassification,
  item: CanonicalCase,
  pageCapabilityIds: string[],
  claimAlignment: ItemTechnicalBindingGapEntry['claimAlignment'],
): string {
  if (classification === 'runtime-accepted') {
    return claimAlignment === 'source-ref-exact'
      ? '已通过精确 TC-ITEM 来源引用连接已批准绑定，并已有运行验收，可进入技术执行。'
      : '已有精确技术证据、当前 Claim 对齐和运行验收，可进入首批技术执行。';
  }
  if (classification === 'recipe-drift-repair-required') return `已有运行验收，但当前 canonical Claim 未对齐（${claimAlignment}），需先修复 Recipe。`;
  if (classification === 'recipe-existing-runtime-required') return '已有 Recipe，但缺少当前可核验的运行验收证据。';
  if (classification === 'capability-mapping-required') return `已发现部分技术事实${pageCapabilityIds.length > 0 ? `（页面能力：${pageCapabilityIds.join('、')}）` : ''}，尚未形成完整绑定。`;
  if (item.status === 'deprecated') return '用例已废弃，不进入技术绑定。';
  return '当前没有足够页面或 Recipe 技术证据，必须先做受控页面观测。';
}

function buildSummary(entries: ItemTechnicalBindingGapEntry[]): ProductCenterItemTechnicalBindingGapDocument['summary'] {
  const active = entries.filter((entry) => entry.canonicalStatus !== 'deprecated');
  const count = (classification: ItemTechnicalBindingGapClassification) =>
    active.filter((entry) => entry.classification === classification).length;
  const byPriority: Record<string, number> = {};
  for (const entry of active) byPriority[entry.priority] = (byPriority[entry.priority] ?? 0) + 1;
  const byGapCode: Record<string, number> = {};
  for (const entry of active) {
    for (const code of entry.gapCodes) byGapCode[code] = (byGapCode[code] ?? 0) + 1;
  }
  return {
    canonicalTotal: entries.length,
    activeTotal: active.length,
    deprecated: entries.length - active.length,
    runtimeAccepted: count('runtime-accepted'),
    recipeExistingRuntimeRequired: count('recipe-existing-runtime-required'),
    recipeDriftRepairRequired: count('recipe-drift-repair-required'),
    pageObservationRequired: count('page-observation-required'),
    capabilityMappingRequired: count('capability-mapping-required'),
    firstP0BatchEligible: entries.filter((entry) => entry.firstP0BatchEligible).length,
    firstP0BatchBlocked: active.filter((entry) => entry.priority === 'P0' && !entry.firstP0BatchEligible).length,
    byPriority,
    byGapCode,
  };
}

function acceptedCaseIds(acceptance: Acceptance): string[] {
  return [...new Set([
    ...(acceptance.acceptedCaseIds ?? []),
    ...(acceptance.caseAcceptance ?? [])
      .filter((item) => item.accepted)
      .map((item) => item.caseId),
  ])];
}

function hashValue(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}
