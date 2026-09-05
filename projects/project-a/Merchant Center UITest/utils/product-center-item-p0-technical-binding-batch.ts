import { createHash } from 'node:crypto';
import type { AutomationRecipe, RecipeExecutionPolicy } from '../automation/recipe/automation-recipe';
import type {
  ItemTechnicalBindingGapEntry,
  ProductCenterItemTechnicalBindingGapDocument,
} from './product-center-item-technical-binding-gap';

type CanonicalCase = {
  id: string;
  title: string;
  priority: 'P0' | 'P1' | 'P2';
  productType: string;
  scenarioFamily: string;
};

type CanonicalPlan = {
  fingerprint: string;
  cases: CanonicalCase[];
};

type FullReview = {
  fingerprint: string;
  entries: Array<{ caseId: string; decision: string }>;
};

export type ProductCenterItemP0TechnicalEvidenceIntakeMapping = {
  packageId: string;
  caseIds: string[];
  coverageStatus: 'covered' | 'partial' | 'not-covered';
  liveEvidenceStatus: 'pending-authenticated-run' | 'not-observed';
  unresolved: string[];
};

export type ProductCenterItemP0TechnicalEvidenceIntakeDocument = {
  schemaVersion: '1.0.0';
  collectionId: 'product-center-item-p0-technical-evidence-intake';
  sourceThreadId: string;
  sourceRunId: string;
  sourceArtifact: string;
  sourceArtifactSha256: string;
  sourceStatus: 'harness-blocked';
  sourceReason: 'authentication-source-unavailable';
  capturedAt: string;
  packageMappings: ProductCenterItemP0TechnicalEvidenceIntakeMapping[];
};

export type ProductCenterItemP0WaveRuntimeAcceptanceDocument = {
  schemaVersion: '1.0.0';
  acceptanceId: string;
  waveId: ProductCenterItemP0TechnicalWaveId;
  status: 'accepted';
  executionMode: 'wave-shared-chain';
  runId: string;
  sourceArtifact: { workspaceRole: string; path: string; sha256: string };
  orchestratorSpecPath: string;
  caseIds: string[];
  acceptedCaseIds: string[];
  evidenceScope: { sharedRunCount: 1; caseCount: number; caseLevelRunsClaimed: 0 };
  mutationIntentClosure: { total: number; cleanupComplete: number; incomplete: 0 };
  executionLedger: { entries: number; residueVerified: number; incomplete: 0 };
  cleanupEvidence: Record<string, 0>;
  security: {
    credentialsPersisted: false;
    authorizationArtifactsPersisted: false;
    storageStatePersisted: false;
  };
};

export type ProductCenterItemP0WaveRecipe = AutomationRecipe & {
  executionPolicy: RecipeExecutionPolicy;
};

export type ProductCenterItemP0WaveRecipeCollection = {
  schemaVersion: '1.0.0';
  collectionId: string;
  waveId: ProductCenterItemP0TechnicalWaveId;
  executionMode: 'wave-shared-chain';
  caseLevelExecutionAllowed: false;
  runtimeAcceptanceId: string;
  orchestratorSpecPath: string;
  recipes: ProductCenterItemP0WaveRecipe[];
};

export type ProductCenterItemP0TechnicalBindingEntry = {
  caseId: string;
  title: string;
  priority: 'P0';
  productType: string;
  scenarioFamily: string;
  workPackageId: string;
  waveId: ProductCenterItemP0TechnicalWaveId;
  status: 'technical-evidence-required' | 'recipe-repair-required' | 'runtime-accepted';
  contentReviewDecision: 'approved';
  currentCanonicalClaimCount: number;
  existingEvidence: {
    kind: ItemTechnicalBindingGapEntry['evidenceKind'];
    recipeIds: string[];
    bindingIds: string[];
    pageCapabilityIds: string[];
  };
  missingContracts: string[];
  generationAllowed: boolean;
};

export type ProductCenterItemP0TechnicalWorkPackage = {
  id: string;
  waveId: ProductCenterItemP0TechnicalWaveId;
  evidenceAnchor: string;
  caseIds: string[];
  caseCount: number;
  status: 'technical-evidence-required' | 'recipe-repair-required' | 'runtime-accepted';
  safetyClassification: 'assessment-required' | 'L3-accepted-with-zero-residue';
  requiredEvidence: string[];
  evidenceIntake?: ProductCenterItemP0TechnicalEvidenceIntakeMapping;
  generationAllowed: boolean;
};

export type ProductCenterItemP0TechnicalWaveId =
  | 'wave-a-combo'
  | 'wave-b-list'
  | 'wave-c-standard-create'
  | 'wave-d-edit-and-rules';

export type ProductCenterItemP0TechnicalWave = {
  id: ProductCenterItemP0TechnicalWaveId;
  name: string;
  caseIds: string[];
  caseCount: number;
  workPackageIds: string[];
  workPackageCount: number;
  status: 'blocked-by-technical-evidence' | 'runtime-accepted';
  caseLevelReleaseAllowed: false;
  waveLevelReleaseAllowed: true;
  generatedRecipeCount: number;
  executionAllowed: boolean;
};

export type ProductCenterItemP0TechnicalBindingBatchDocument = {
  schemaVersion: '1.0.0';
  collectionId: 'product-center-item-p0-technical-binding-batch';
  generatedAt: string;
  sourceFingerprints: {
    canonical: string;
    fullReview: string;
    technicalGap: string;
    runtimeAcceptances: Record<ProductCenterItemP0TechnicalWaveId, string | undefined>;
    waveRecipeCollections: Record<ProductCenterItemP0TechnicalWaveId, string | undefined>;
  };
  status: 'partially-runtime-accepted' | 'runtime-accepted';
  summary: {
    total: number;
    uniqueCases: number;
    contentApproved: number;
    technicalEvidenceRequired: number;
    recipeRepairRequired: number;
    workPackages: number;
    readyForRecipeGeneration: number;
    generatedRecipes: number;
    runtimeSelected: number;
    evidenceIntakeReceived: number;
    implementationCovered: number;
    evidencePartial: number;
    evidenceNotCovered: number;
    authenticatedAccepted: number;
  };
  batchGate: {
    totalDenominatorLocked: true;
    caseLevelReleaseAllowed: false;
    waveLevelReleaseAllowed: true;
    generationAllowed: true;
    executionAllowed: true;
    releasedWaveIds: ProductCenterItemP0TechnicalWaveId[];
    reasonCode: 'PARTIAL_WAVE_RUNTIME_ACCEPTED' | 'ALL_WAVES_RUNTIME_ACCEPTED';
  };
  recipeCollection: {
    collectionId: 'product-center-item-p0-technical-binding-batch-recipes';
    generatedRecipeCount: number;
    executionMode: 'wave-shared-chain';
    caseLevelExecutionAllowed: false;
    orchestratorSpecPaths: string[];
    executionAllowed: boolean;
  };
  entries: ProductCenterItemP0TechnicalBindingEntry[];
  workPackages: ProductCenterItemP0TechnicalWorkPackage[];
  waves: ProductCenterItemP0TechnicalWave[];
  fingerprint: string;
};

export type ProductCenterItemP0TechnicalEvidenceRequestDocument = {
  schemaVersion: '1.0.0';
  collectionId: 'product-center-item-p0-technical-evidence-request';
  batchFingerprint: string;
  summary: {
    workPackages: number;
    cases: number;
  };
  guardrails: {
    businessRulesMayBeInferred: false;
    adaptersMayBeInvented: false;
    mutationReplayWithoutReconciliation: false;
    serverIdsMustBeRecordedImmediately: true;
    cleanupMustVerifyUiAndApiZeroResidue: true;
  };
  workPackages: ProductCenterItemP0TechnicalWorkPackage[];
  waves: ProductCenterItemP0TechnicalWave[];
  fingerprint: string;
};

export function buildProductCenterItemP0TechnicalBindingBatch(input: {
  canonical: CanonicalPlan;
  fullReview: FullReview;
  technicalGap: ProductCenterItemTechnicalBindingGapDocument;
  evidenceIntake?: ProductCenterItemP0TechnicalEvidenceIntakeDocument;
  runtimeAcceptances: ProductCenterItemP0WaveRuntimeAcceptanceDocument[];
  waveRecipeCollections: ProductCenterItemP0WaveRecipeCollection[];
  generatedAt?: string;
}): {
  batch: ProductCenterItemP0TechnicalBindingBatchDocument;
  evidenceRequest: ProductCenterItemP0TechnicalEvidenceRequestDocument;
} {
  const canonicalById = new Map(input.canonical.cases.map((item) => [item.id, item]));
  const reviewById = new Map(input.fullReview.entries.map((item) => [item.caseId, item.decision]));
  assertReleasedWaves(input.runtimeAcceptances, input.waveRecipeCollections);
  const acceptedCaseIds = new Set(input.runtimeAcceptances.flatMap((acceptance) => acceptance.acceptedCaseIds));
  // The released wave acceptance is the authoritative 36-case scope for this
  // legacy P0 batch. Three accepted cases retain P1 metadata in the source
  // inventory; excluding them by priority alone would drift from the released
  // recipes and the evidence-intake mappings.
  const selected = input.technicalGap.entries.filter((entry) =>
    (entry.priority === 'P0' || acceptedCaseIds.has(entry.caseId))
    && entry.canonicalStatus !== 'deprecated'
    && ['capability-mapping-required', 'recipe-drift-repair-required'].includes(entry.classification));
  const entries = selected.map((gap): ProductCenterItemP0TechnicalBindingEntry => {
    const canonical = canonicalById.get(gap.caseId);
    if (!canonical) throw new Error(`P0 技术绑定批次缺少 canonical：${gap.caseId}`);
    if (reviewById.get(gap.caseId) !== 'approved') {
      throw new Error(`P0 技术绑定批次内容审核未通过：${gap.caseId}`);
    }
    const evidenceAnchor = evidenceAnchorFor(gap);
    const waveId = waveIdForEvidenceAnchor(evidenceAnchor);
    return {
      caseId: gap.caseId,
      title: gap.title,
      priority: 'P0',
      productType: canonical.productType,
      scenarioFamily: canonical.scenarioFamily,
      workPackageId: workPackageId(evidenceAnchor),
      waveId,
      status: acceptedCaseIds.has(gap.caseId)
        ? 'runtime-accepted'
        : gap.classification === 'recipe-drift-repair-required'
        ? 'recipe-repair-required'
        : 'technical-evidence-required',
      contentReviewDecision: 'approved',
      currentCanonicalClaimCount: gap.currentCanonicalClaimCount,
      existingEvidence: {
        kind: gap.evidenceKind,
        recipeIds: [...gap.evidence.recipeIds],
        bindingIds: [...gap.evidence.approvedBindingIds],
        pageCapabilityIds: [...gap.evidence.pageCapabilityIds],
      },
      missingContracts: acceptedCaseIds.has(gap.caseId) ? [] : [...gap.gapCodes],
      generationAllowed: acceptedCaseIds.has(gap.caseId),
    };
  });
  const workPackages = buildWorkPackages(entries, input.evidenceIntake);
  const waves = buildWaves(workPackages, input.waveRecipeCollections);
  const releasedWaveIds = input.runtimeAcceptances.map((acceptance) => acceptance.waveId);
  const generatedRecipes = input.waveRecipeCollections.flatMap((collection) => collection.recipes);
  const allCasesRuntimeAccepted = entries.length > 0
    && acceptedCaseIds.size === entries.length
    && entries.every((entry) => entry.status === 'runtime-accepted');
  const semanticValue = {
    sourceFingerprints: {
      canonical: input.canonical.fingerprint,
      fullReview: input.fullReview.fingerprint,
      technicalGap: input.technicalGap.fingerprint,
      runtimeAcceptances: fingerprintByWave(input.runtimeAcceptances, (acceptance) => acceptance.sourceArtifact.sha256),
      waveRecipeCollections: fingerprintByWave(input.waveRecipeCollections, (collection) => hashValue(collection)),
    },
    entries,
    workPackages,
    waves,
  };
  const batchFingerprint = hashValue(semanticValue);
  const batch: ProductCenterItemP0TechnicalBindingBatchDocument = {
    schemaVersion: '1.0.0',
    collectionId: 'product-center-item-p0-technical-binding-batch',
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    sourceFingerprints: semanticValue.sourceFingerprints,
    status: allCasesRuntimeAccepted ? 'runtime-accepted' : 'partially-runtime-accepted',
    summary: {
      total: entries.length,
      uniqueCases: new Set(entries.map((entry) => entry.caseId)).size,
      contentApproved: entries.filter((entry) => entry.contentReviewDecision === 'approved').length,
      technicalEvidenceRequired: entries.filter((entry) => entry.status === 'technical-evidence-required').length,
      recipeRepairRequired: entries.filter((entry) => entry.status === 'recipe-repair-required').length,
      workPackages: workPackages.length,
      readyForRecipeGeneration: acceptedCaseIds.size,
      generatedRecipes: generatedRecipes.length,
      runtimeSelected: acceptedCaseIds.size,
      evidenceIntakeReceived: workPackages.filter((item) => item.evidenceIntake).length,
      implementationCovered: workPackages.filter((item) => item.evidenceIntake?.coverageStatus === 'covered').length,
      evidencePartial: workPackages.filter((item) => item.evidenceIntake?.coverageStatus === 'partial').length,
      evidenceNotCovered: workPackages.filter((item) => item.evidenceIntake?.coverageStatus === 'not-covered').length,
      authenticatedAccepted: acceptedCaseIds.size,
    },
    batchGate: {
      totalDenominatorLocked: true,
      caseLevelReleaseAllowed: false,
      waveLevelReleaseAllowed: true,
      generationAllowed: true,
      executionAllowed: true,
      releasedWaveIds,
      reasonCode: allCasesRuntimeAccepted
        ? 'ALL_WAVES_RUNTIME_ACCEPTED'
        : 'PARTIAL_WAVE_RUNTIME_ACCEPTED',
    },
    recipeCollection: {
      collectionId: 'product-center-item-p0-technical-binding-batch-recipes',
      generatedRecipeCount: generatedRecipes.length,
      executionMode: 'wave-shared-chain',
      caseLevelExecutionAllowed: false,
      orchestratorSpecPaths: input.waveRecipeCollections.map((collection) => collection.orchestratorSpecPath),
      executionAllowed: allCasesRuntimeAccepted,
    },
    entries,
    workPackages,
    waves,
    fingerprint: batchFingerprint,
  };
  const evidenceRequestValue = {
    schemaVersion: '1.0.0' as const,
    collectionId: 'product-center-item-p0-technical-evidence-request' as const,
    batchFingerprint,
    summary: {
      workPackages: workPackages.filter((item) => item.status !== 'runtime-accepted').length,
      cases: entries.filter((item) => item.status !== 'runtime-accepted').length,
    },
    guardrails: {
      businessRulesMayBeInferred: false as const,
      adaptersMayBeInvented: false as const,
      mutationReplayWithoutReconciliation: false as const,
      serverIdsMustBeRecordedImmediately: true as const,
      cleanupMustVerifyUiAndApiZeroResidue: true as const,
    },
    workPackages: workPackages.filter((item) => item.status !== 'runtime-accepted'),
    waves: waves.filter((wave) => wave.status !== 'runtime-accepted'),
  };
  const evidenceRequest: ProductCenterItemP0TechnicalEvidenceRequestDocument = {
    ...evidenceRequestValue,
    fingerprint: hashValue(evidenceRequestValue),
  };
  return { batch, evidenceRequest };
}

export function renderProductCenterItemP0TechnicalBindingBatchMarkdown(
  document: ProductCenterItemP0TechnicalBindingBatchDocument,
): string {
  const lines = [
    '# 商品中心商品 P0 技术绑定批次',
    '',
    `- 批次状态：${document.status}`,
    `- 用例分母：${document.summary.total}`,
    `- 内容审核通过：${document.summary.contentApproved}`,
    `- 技术证据待补：${document.summary.technicalEvidenceRequired}`,
    `- Recipe 漂移修复：${document.summary.recipeRepairRequired}`,
    `- 能力包：${document.summary.workPackages}`,
    `- 可生成 Recipe：${document.summary.readyForRecipeGeneration}`,
    `- 已生成 Recipe：${document.summary.generatedRecipes}`,
    `- 已接收审计能力包：${document.summary.evidenceIntakeReceived}`,
    `- 实现层 covered/partial/not-covered：${document.summary.implementationCovered}/${document.summary.evidencePartial}/${document.summary.evidenceNotCovered}`,
    `- 认证运行验收：${document.summary.authenticatedAccepted}`,
    '- 发布策略：锁定 36 条总分母，禁止单用例放行；允许完整波次统一生成和验收。',
    '',
    '## 执行波次',
    '',
    ...document.waves.flatMap((wave) => [
      `- ${wave.id} ${wave.name}：用例=${wave.caseCount}；能力包=${wave.workPackageCount}；状态=${wave.status}`,
    ]),
    '',
    '## 能力包',
    '',
  ];
  for (const workPackage of document.workPackages) {
    lines.push(
      `### ${workPackage.id}`,
      '',
      `- 证据锚点：${workPackage.evidenceAnchor}`,
      `- 状态：${workPackage.status}`,
      `- 审计接入：${workPackage.evidenceIntake ? `${workPackage.evidenceIntake.coverageStatus}/${workPackage.evidenceIntake.liveEvidenceStatus}` : 'pending'}`,
      `- 用例（${workPackage.caseCount}）：${workPackage.caseIds.join('、')}`,
      `- 所需证据：${workPackage.requiredEvidence.join('；')}`,
      '',
    );
  }
  lines.push(
    '## 用例明细',
    '',
    '| 用例 | 场景族 | 证据 | 能力包 | 状态 | 缺失合同 |',
    '| --- | --- | --- | --- | --- | --- |',
  );
  for (const entry of document.entries) {
    lines.push(`| ${entry.caseId} ${entry.title} | ${entry.scenarioFamily} | ${entry.existingEvidence.kind} | ${entry.workPackageId} | ${entry.status} | ${entry.missingContracts.join(', ')} |`);
  }
  return `${lines.join('\n').trim()}\n`;
}

function buildWorkPackages(
  entries: ProductCenterItemP0TechnicalBindingEntry[],
  evidenceIntake?: ProductCenterItemP0TechnicalEvidenceIntakeDocument,
): ProductCenterItemP0TechnicalWorkPackage[] {
  const grouped = new Map<string, ProductCenterItemP0TechnicalBindingEntry[]>();
  for (const entry of entries) {
    grouped.set(entry.workPackageId, [...(grouped.get(entry.workPackageId) ?? []), entry]);
  }
  const packages = [...grouped.entries()]
    .map(([id, packageEntries]): ProductCenterItemP0TechnicalWorkPackage => {
      const evidenceAnchor = evidenceAnchorForEntry(packageEntries[0]);
      const repair = packageEntries.some((entry) => entry.status === 'recipe-repair-required');
      const runtimeAccepted = packageEntries.every((entry) => entry.status === 'runtime-accepted');
      return {
        id,
        waveId: packageEntries[0].waveId,
        evidenceAnchor,
        caseIds: packageEntries.map((entry) => entry.caseId),
        caseCount: packageEntries.length,
        status: runtimeAccepted
          ? 'runtime-accepted'
          : repair ? 'recipe-repair-required' : 'technical-evidence-required',
        safetyClassification: runtimeAccepted ? 'L3-accepted-with-zero-residue' : 'assessment-required',
        requiredEvidence: runtimeAccepted
          ? []
          : repair
          ? [
              '当前 10 个 canonical Claim 的逐项执行映射',
              '使用唯一 AUTO_AUDIT 数据执行父分类未选叶子后的受控负向提交',
              '提交请求、页面失败终态与商品记录前后不变证据',
              '非幂等重试对账、服务端 ID 登记规则和 UI/API 零残留验证',
            ]
          : [
              'route + state + action + overlay 的唯一定位与终态证据',
              'Capability 输入输出合同及运行适配器',
              'UI 与 API assertion 映射或有证据的明确不适用结论',
              'API operation 映射或有证据的明确不适用结论',
              '测试数据工厂与 cleanup adapter 或有证据的明确不适用结论',
              'L0/L1/L2/L3 安全等级、重试对账与零残留策略',
            ],
        generationAllowed: runtimeAccepted,
      };
    })
    .sort((left, right) => left.id.localeCompare(right.id));
  if (!evidenceIntake) return packages;
  if (evidenceIntake.sourceStatus !== 'harness-blocked'
    || evidenceIntake.sourceReason !== 'authentication-source-unavailable') {
    throw new Error('P0 技术证据 intake 的审计阻断状态与当前合同不一致');
  }
  const packageById = new Map(packages.map((item) => [item.id, item]));
  for (const mapping of evidenceIntake.packageMappings) {
    const workPackage = packageById.get(mapping.packageId);
    if (!workPackage) throw new Error(`P0 技术证据 intake 包含未知能力包：${mapping.packageId}`);
    if ([...workPackage.caseIds].sort().join(',') !== [...mapping.caseIds].sort().join(',')) {
      throw new Error(`P0 技术证据 intake 用例集合漂移：${mapping.packageId}`);
    }
    workPackage.evidenceIntake = {
      ...mapping,
      caseIds: [...mapping.caseIds],
      unresolved: [...mapping.unresolved],
    };
  }
  return packages;
}

function buildWaves(
  workPackages: ProductCenterItemP0TechnicalWorkPackage[],
  waveRecipeCollections: ProductCenterItemP0WaveRecipeCollection[],
): ProductCenterItemP0TechnicalWave[] {
  const definitions: Array<{ id: ProductCenterItemP0TechnicalWaveId; name: string }> = [
    { id: 'wave-a-combo', name: '套餐创建与套餐规则' },
    { id: 'wave-b-list', name: '商品列表查询与生命周期' },
    { id: 'wave-c-standard-create', name: '标准商品创建配置' },
    { id: 'wave-d-edit-and-rules', name: '编辑、唯一性与分类规则' },
  ];
  return definitions.map((definition) => {
    const selected = workPackages.filter((workPackage) => workPackage.waveId === definition.id);
    const runtimeAccepted = selected.length > 0
      && selected.every((workPackage) => workPackage.status === 'runtime-accepted');
    const generatedRecipeCount = waveRecipeCollections
      .filter((collection) => collection.waveId === definition.id)
      .flatMap((collection) => collection.recipes)
      .length;
    return {
      id: definition.id,
      name: definition.name,
      caseIds: selected.flatMap((workPackage) => workPackage.caseIds),
      caseCount: selected.reduce((total, workPackage) => total + workPackage.caseCount, 0),
      workPackageIds: selected.map((workPackage) => workPackage.id),
      workPackageCount: selected.length,
      status: runtimeAccepted ? 'runtime-accepted' : 'blocked-by-technical-evidence',
      caseLevelReleaseAllowed: false,
      waveLevelReleaseAllowed: true,
      generatedRecipeCount,
      executionAllowed: runtimeAccepted,
    };
  });
}

function assertReleasedWaves(
  acceptances: ProductCenterItemP0WaveRuntimeAcceptanceDocument[],
  recipeCollections: ProductCenterItemP0WaveRecipeCollection[],
): void {
  if (acceptances.length === 0 || new Set(acceptances.map((item) => item.waveId)).size !== acceptances.length) {
    throw new Error('P0 runtime acceptance 波次为空或重复');
  }
  if (new Set(recipeCollections.map((item) => item.waveId)).size !== recipeCollections.length) {
    throw new Error('P0 Recipe 集合波次重复');
  }
  const recipeCollectionByWave = new Map(recipeCollections.map((collection) => [collection.waveId, collection]));
  const allAcceptedCaseIds: string[] = [];
  for (const acceptance of acceptances) {
    const expectedCaseIds = expectedWaveCaseIds[acceptance.waveId];
    const recipeCollection = recipeCollectionByWave.get(acceptance.waveId);
    if (!recipeCollection) throw new Error(`${acceptance.waveId} 缺少 Recipe 集合`);
    assertWaveRelease(acceptance, recipeCollection, expectedCaseIds);
    allAcceptedCaseIds.push(...acceptance.acceptedCaseIds);
  }
  if (new Set(allAcceptedCaseIds).size !== allAcceptedCaseIds.length) {
    throw new Error('P0 runtime acceptance 存在跨波次重复用例');
  }
  if (recipeCollections.some((collection) => !acceptances.some((acceptance) => acceptance.waveId === collection.waveId))) {
    throw new Error('P0 Recipe 集合不得脱离 runtime acceptance 单独放行');
  }
}

function assertWaveRelease(
  acceptance: ProductCenterItemP0WaveRuntimeAcceptanceDocument,
  recipeCollection: ProductCenterItemP0WaveRecipeCollection,
  expectedCaseIds: readonly string[],
): void {
  if (acceptance.status !== 'accepted'
    || acceptance.executionMode !== 'wave-shared-chain'
    || acceptance.evidenceScope.sharedRunCount !== 1
    || acceptance.evidenceScope.caseLevelRunsClaimed !== 0
    || acceptance.evidenceScope.caseCount !== expectedCaseIds.length) {
    throw new Error(`${acceptance.waveId} runtime acceptance 未证明一次共享整波 ${expectedCaseIds.length} 条验收`);
  }
  if (!sameSet(acceptance.caseIds, expectedCaseIds)
    || !sameSet(acceptance.acceptedCaseIds, expectedCaseIds)) {
    throw new Error(`${acceptance.waveId} runtime acceptance 用例分母或通过集合漂移`);
  }
  if (acceptance.mutationIntentClosure.total !== acceptance.mutationIntentClosure.cleanupComplete
    || acceptance.mutationIntentClosure.incomplete !== 0
    || acceptance.executionLedger.entries !== acceptance.executionLedger.residueVerified
    || acceptance.executionLedger.incomplete !== 0
    || Object.values(acceptance.cleanupEvidence).some((count) => count !== 0)) {
    throw new Error(`${acceptance.waveId} runtime acceptance 未完成 Intent、Ledger 或 UI/API 零残留闭环`);
  }
  if (Object.values(acceptance.security).some(Boolean)) {
    throw new Error(`${acceptance.waveId} runtime acceptance 不得持久化认证或凭据制品`);
  }
  if (recipeCollection.waveId !== acceptance.waveId
    || recipeCollection.executionMode !== acceptance.executionMode
    || recipeCollection.caseLevelExecutionAllowed !== false
    || recipeCollection.runtimeAcceptanceId !== acceptance.acceptanceId
    || recipeCollection.orchestratorSpecPath !== acceptance.orchestratorSpecPath
    || !sameSet(recipeCollection.recipes.map((recipe) => recipe.caseId), expectedCaseIds)) {
    throw new Error(`${acceptance.waveId} Recipe 集合与 runtime acceptance 不一致`);
  }
  if (new Set(recipeCollection.recipes.map((recipe) => recipe.caseId)).size !== expectedCaseIds.length
    || recipeCollection.recipes.some((recipe) => (
      recipe.capabilities[0]?.id !== 'navigation.sidebar.open'
      || recipe.generationAllowed !== true
      || recipe.executionPolicy.mode !== 'wave-shared-chain'
      || recipe.executionPolicy.caseLevelExecutionAllowed !== false
      || recipe.executionPolicy.waveId !== acceptance.waveId
      || recipe.executionPolicy.runtimeAcceptanceId !== acceptance.acceptanceId
      || recipe.executionPolicy.orchestratorSpecPath !== acceptance.orchestratorSpecPath
    ))) {
    throw new Error(`${acceptance.waveId} Recipe 未满足侧边栏首能力或共享整波执行门禁`);
  }
}

const expectedWaveCaseIds: Record<ProductCenterItemP0TechnicalWaveId, readonly string[]> = {
  'wave-a-combo': [
    'TC-ITEM-PKG-002', 'TC-ITEM-PKG-004', 'TC-ITEM-PKG-006', 'TC-ITEM-PKG-007',
    'TC-ITEM-PKG-010', 'TC-ITEM-PKG-017', 'TC-ITEM-PKG-040', 'TC-ITEM-PKG-041',
  ],
  'wave-b-list': [
    'TC-ITEM-PKG-047', 'TC-ITEM-STD-069', 'TC-ITEM-STD-028', 'TC-ITEM-STD-029',
    'TC-ITEM-ADD-023', 'TC-ITEM-ADD-040', 'TC-ITEM-STD-066', 'TC-ITEM-ADD-042',
    'TC-ITEM-ADD-043', 'TC-ITEM-STD-068', 'TC-ITEM-STD-070', 'TC-ITEM-STD-075',
  ],
  'wave-c-standard-create': [
    'TC-ITEM-ADD-005', 'TC-ITEM-PKG-008', 'TC-ITEM-STD-001', 'TC-ITEM-STD-057',
    'TC-ITEM-STD-058', 'TC-ITEM-STD-082', 'TC-ITEM-STD-038', 'TC-ITEM-STD-047',
  ],
  'wave-d-edit-and-rules': [
    'TC-ITEM-STD-031', 'TC-ITEM-STD-092', 'TC-ITEM-STD-096', 'TC-ITEM-STD-011',
    'TC-ITEM-STD-012', 'TC-ITEM-STD-013', 'TC-ITEM-STD-014', 'TC-ITEM-STD-007',
  ],
};

function fingerprintByWave<T extends { waveId: ProductCenterItemP0TechnicalWaveId }>(
  values: T[],
  fingerprint: (value: T) => string,
): Record<ProductCenterItemP0TechnicalWaveId, string | undefined> {
  const byWave = new Map(values.map((value) => [value.waveId, fingerprint(value)]));
  return {
    'wave-a-combo': byWave.get('wave-a-combo'),
    'wave-b-list': byWave.get('wave-b-list'),
    'wave-c-standard-create': byWave.get('wave-c-standard-create'),
    'wave-d-edit-and-rules': byWave.get('wave-d-edit-and-rules'),
  };
}

function sameSet(left: readonly string[], right: readonly string[]): boolean {
  return [...left].sort().join(',') === [...right].sort().join(',');
}

function evidenceAnchorFor(gap: ItemTechnicalBindingGapEntry): string {
  if (gap.classification === 'recipe-drift-repair-required') return 'recipe-drift-repair';
  if (gap.evidence.pageCapabilityIds.length > 0) {
    return [...gap.evidence.pageCapabilityIds].sort().join('+');
  }
  return 'legacy-sidebar-only';
}

function evidenceAnchorForEntry(entry: ProductCenterItemP0TechnicalBindingEntry): string {
  if (entry.status === 'recipe-repair-required') return 'recipe-drift-repair';
  if (entry.existingEvidence.pageCapabilityIds.length > 0) {
    return [...entry.existingEvidence.pageCapabilityIds].sort().join('+');
  }
  return 'legacy-sidebar-only';
}

function workPackageId(evidenceAnchor: string): string {
  const stableId = evidenceAnchor.replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase();
  return `p0-item-binding:${stableId}`;
}

function waveIdForEvidenceAnchor(evidenceAnchor: string): ProductCenterItemP0TechnicalWaveId {
  if (evidenceAnchor.startsWith('item.combo.')) return 'wave-a-combo';
  if (evidenceAnchor.startsWith('item.list.')) return 'wave-b-list';
  if ([
    'item.create.type-selection',
    'item.standard.required-fields',
    'item.standard.spec-modes',
    'item.standard.print-stall',
    'item.standard.attributes',
  ].includes(evidenceAnchor)) return 'wave-c-standard-create';
  return 'wave-d-edit-and-rules';
}

function hashValue(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}
