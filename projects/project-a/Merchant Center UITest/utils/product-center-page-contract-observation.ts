import { createHash } from 'node:crypto';
import { planContractChangeImpact, type ImpactedCase } from './contract-change-impact';
import { stableStringify } from './product-center-test-contract';
import {
  evaluateProductCenterEvidenceFreshness,
  type ProductCenterReleaseEvidence,
} from './product-center-release-evidence';

export type ProductCenterPageContractRecipeInput = {
  id: string;
  caseId: string;
  route: string;
  sourceIds: readonly string[];
  capabilities: ReadonlyArray<{ id: string }>;
  assertions: ReadonlyArray<{ adapterId: string }>;
};

export type ProductCenterPageContractEvidenceInput = {
  generatedAt?: string;
  recipeId: string;
  caseId: string;
  navigation?: {
    mode?: string;
    targetPath?: string;
    arrivedPath?: string;
    verifiedPaths?: readonly string[];
  };
  visibleUi?: Record<string, unknown>;
  locatorUniqueness?: Record<string, unknown>;
  execution?: {
    capabilityIds?: readonly string[];
    assertionAdapterIds?: readonly string[];
    boundaryEvidence?: Record<string, unknown>;
  };
  claimCoverageComplete?: boolean;
  sidebarEntryVerified?: boolean;
  network?: {
    method?: string;
    operation?: string;
    requestCount?: number | null;
  };
  api?: {
    responseShape?: readonly string[];
    [key: string]: unknown;
  };
  technicalSignals?: {
    apiSignatureStatus: 'observed' | 'unknown';
    apiSignatureFingerprint: string;
  };
  release?: ProductCenterReleaseEvidence;
  browserSignals?: {
    documentTitleFingerprint?: string;
    visibleHeadingFingerprints?: readonly string[];
    visibleTestIdFingerprints?: readonly string[];
    visibleRoleNameFingerprints?: readonly string[];
    visibleDialogCount?: number;
    visibleLoadingCount?: number;
    visibleRowCount?: number;
    requiredFieldCount?: number;
    inputTypes?: readonly string[];
    maxLengths?: readonly number[];
  };
};

export type ProductCenterPageContractAcceptanceInput = {
  generatedAt?: string;
  accepted: boolean;
  acceptedCaseIds: readonly string[];
  issues: readonly unknown[];
  safety: {
    incompleteCheckpoints: number;
    sensitiveFindings: number;
    authStateArtifacts: number;
    forbiddenPatterns: number;
  };
};

export type ProductCenterPageContractFindingCode =
  | 'ASSERTION_DRIFT'
  | 'API_TECHNICAL_SIGNATURE_DRIFT'
  | 'CAPABILITY_DRIFT'
  | 'CLAIM_EVIDENCE_INCOMPLETE'
  | 'EVIDENCE_SEMANTIC_MISMATCH'
  | 'HIDDEN_UI_EVIDENCE'
  | 'LOCATOR_NOT_UNIQUE'
  | 'OBSERVATION_SIGNAL_BASELINE_MISSING'
  | 'RELEASE_EVIDENCE_INVALID'
  | 'RELEASE_EVIDENCE_MISSING'
  | 'RELEASE_EVIDENCE_STALE'
  | 'RELEASE_EVIDENCE_FROM_FUTURE'
  | 'RELEASE_FINGERPRINT_MISMATCH'
  | 'ROUTE_FINGERPRINT_MISMATCH'
  | 'ENVIRONMENT_FINGERPRINT_MISMATCH'
  | 'PAGE_OBSERVATION_ADDED'
  | 'PAGE_OBSERVATION_MISSING'
  | 'ROUTE_PATH_MISMATCH'
  | 'RUNTIME_ACCEPTANCE_MISSING'
  | 'SIDEBAR_ENTRY_MISMATCH'
  | 'SOURCE_MAPPING_DRIFT';

export type ProductCenterPageContractFinding = {
  code: ProductCenterPageContractFindingCode;
  caseId: string;
  route: string;
  sourceIds: string[];
  detail: string;
  blocking: true;
};

export type ProductCenterPageContractObservationEntry = {
  recipeId: string;
  caseId: string;
  route: string;
  sourceIds: string[];
  navigation: {
    mode: string;
    targetPath: string;
    arrivedPath: string;
    verifiedPaths: string[];
  };
  visibleUiRoute: string;
  locatorCounts: Record<string, number>;
  capabilityIds: string[];
  assertionAdapterIds: string[];
  claimCoverageComplete: boolean;
  sidebarEntryVerified: boolean;
  runtimeAccepted: boolean;
  release?: {
    applicationFingerprint: string;
    environmentFingerprint: string;
    routeFingerprint: string;
    observedAt: string;
  };
  browserSignals?: {
    documentTitleFingerprint: string;
    visibleHeadingFingerprints: string[];
    visibleTestIdFingerprints: string[];
    visibleRoleNameFingerprints: string[];
    visibleDialogCount: number;
    visibleLoadingCount: number;
    visibleRowCount: number;
    requiredFieldCount: number;
    inputTypes: string[];
    maxLengths: number[];
  };
  technicalSignals?: {
    apiSignatureStatus: 'observed' | 'unknown';
    apiSignatureFingerprint: string;
  };
};

export type ProductCenterPageContractObservation = {
  schemaVersion: '1.0.0';
  collectionId: 'product-center-page-contract-observation';
  recipeFingerprint: string;
  evidenceFingerprint: string;
  fingerprint: string;
  status: 'clean' | 'review-required';
  summary: {
    totalCases: number;
    acceptedCases: number;
    blockingFindings: number;
  };
  observations: ProductCenterPageContractObservationEntry[];
  findings: ProductCenterPageContractFinding[];
  contractMutationAllowed: false;
  businessRuleMutationAllowed: false;
};

export type ProductCenterPageContractDiff = {
  schemaVersion: '1.0.0';
  baselineFingerprint: string;
  currentFingerprint: string;
  changed: boolean;
  status: 'clean' | 'review-required';
  summary: {
    baselineCases: number;
    currentCases: number;
    findings: number;
  };
  findings: ProductCenterPageContractFinding[];
  contractMutationAllowed: false;
  businessRuleMutationAllowed: false;
  generatedAt?: string;
  pipelineRunId?: string;
  probeRunId?: string;
};

export type ProductCenterPageContractImpact = {
  schemaVersion: '1.0.0';
  status: 'no-impact' | 'review-required';
  findingCodes: ProductCenterPageContractFindingCode[];
  impactedRoutes: string[];
  impactedSourceIds: string[];
  impactedCases: ImpactedCase[];
  contractMutationAllowed: false;
  businessRuleMutationAllowed: false;
};

export function buildProductCenterPageContractObservation(input: {
  recipes: readonly ProductCenterPageContractRecipeInput[];
  evidenceEntries: readonly ProductCenterPageContractEvidenceInput[];
  acceptance: ProductCenterPageContractAcceptanceInput;
  recipeFingerprint: string;
  evidenceFingerprint: string;
  releaseGate?: {
    current: ProductCenterReleaseEvidence;
    now?: string;
    maxAgeMs: number;
  };
}): ProductCenterPageContractObservation {
  const evidenceByCaseId = new Map(input.evidenceEntries.map((entry) => [entry.caseId, entry]));
  const acceptedCaseIds = new Set(input.acceptance.acceptedCaseIds);
  const observations: ProductCenterPageContractObservationEntry[] = [];
  const findings: ProductCenterPageContractFinding[] = [];

  for (const recipe of [...input.recipes].sort((left, right) => left.caseId.localeCompare(right.caseId))) {
    const evidence = evidenceByCaseId.get(recipe.caseId);
    const observation = normalizeObservation(recipe, evidence, acceptedCaseIds.has(recipe.caseId));
    observations.push(observation);
    findings.push(...validateObservation(recipe, evidence, observation, input.releaseGate));
  }

  const sortedFindings = sortAndDedupeFindings(findings);
  const fingerprint = fingerprintValue(observations.map(stableObservationFingerprintInput));
  return {
    schemaVersion: '1.0.0',
    collectionId: 'product-center-page-contract-observation',
    recipeFingerprint: input.recipeFingerprint,
    evidenceFingerprint: input.evidenceFingerprint,
    fingerprint,
    status: sortedFindings.length === 0 ? 'clean' : 'review-required',
    summary: {
      totalCases: observations.length,
      acceptedCases: observations.filter((entry) => entry.runtimeAccepted).length,
      blockingFindings: sortedFindings.length,
    },
    observations,
    findings: sortedFindings,
    contractMutationAllowed: false,
    businessRuleMutationAllowed: false,
  };
}

export function assertProductCenterPageContractBaselineEligible(
  observation: ProductCenterPageContractObservation,
  acceptance: ProductCenterPageContractAcceptanceInput,
  expectedCaseCount = 9,
): void {
  if (observation.observations.length !== expectedCaseCount) {
    throw new Error(`页面合同 baseline 必须包含 ${expectedCaseCount} 条 Gold，实际 ${observation.observations.length}`);
  }
  if (!acceptance.accepted || acceptance.acceptedCaseIds.length !== expectedCaseCount || acceptance.issues.length > 0) {
    throw new Error('页面合同 baseline 仅允许从完整 runtime acceptance 生成');
  }
  if (Object.values(acceptance.safety).some((count) => count !== 0)) {
    throw new Error('页面合同 baseline 安全门禁必须全部为零');
  }
  if (observation.status !== 'clean' || observation.observations.some((entry) => (
    !entry.runtimeAccepted || !entry.claimCoverageComplete || !entry.sidebarEntryVerified
  ))) {
    throw new Error('页面合同 baseline 存在未通过的技术观测');
  }
}

export function assertProductCenterPageContractBaselinePromotionEligible(input: {
  baseline: ProductCenterPageContractObservation;
  current: ProductCenterPageContractObservation;
  diff: ProductCenterPageContractDiff;
  acceptance: ProductCenterPageContractAcceptanceInput;
  approvedAddedCaseIds: readonly string[];
  approvedCapabilityChangedCaseIds?: readonly string[];
  approvedFindings?: ReadonlyArray<{
    caseId: string;
    code: ProductCenterPageContractFindingCode;
  }>;
  approvedSourceMappings?: ReadonlyArray<{
    caseId: string;
    approvedSourceIds: readonly string[];
    approvalRef: string;
  }>;
  expectedCaseCount: number;
}): void {
  assertProductCenterPageContractBaselineEligible(
    input.current,
    input.acceptance,
    input.expectedCaseCount,
  );
  if (input.baseline.status !== 'clean' || input.baseline.findings.length > 0) {
    throw new Error('页面合同 baseline 自身不是 clean，禁止晋级');
  }

  const approvedCaseIds = uniqueStrings(input.approvedAddedCaseIds);
  const approvedCapabilityCaseIds = uniqueStrings(input.approvedCapabilityChangedCaseIds ?? []);
  const approvals = dedupeFindingApprovals([
    ...(input.approvedFindings ?? []),
    ...approvedCaseIds.map((caseId) => ({
      caseId,
      code: 'PAGE_OBSERVATION_ADDED' as const,
    })),
    ...approvedCapabilityCaseIds.map((caseId) => ({
      caseId,
      code: 'CAPABILITY_DRIFT' as const,
    })),
    ...(input.approvedSourceMappings ?? []).map((entry) => ({
      caseId: entry.caseId,
      code: 'SOURCE_MAPPING_DRIFT' as const,
    })),
  ]);
  if (approvals.length === 0) {
    throw new Error('页面合同 baseline 晋级必须逐 finding 指定正式批准');
  }
  const promotableCodes = new Set<ProductCenterPageContractFindingCode>([
    'API_TECHNICAL_SIGNATURE_DRIFT',
    'ASSERTION_DRIFT',
    'CAPABILITY_DRIFT',
    'EVIDENCE_SEMANTIC_MISMATCH',
    'ENVIRONMENT_FINGERPRINT_MISMATCH',
    'LOCATOR_NOT_UNIQUE',
    'OBSERVATION_SIGNAL_BASELINE_MISSING',
    'PAGE_OBSERVATION_ADDED',
    'RELEASE_FINGERPRINT_MISMATCH',
    'ROUTE_FINGERPRINT_MISMATCH',
    'ROUTE_PATH_MISMATCH',
    'SIDEBAR_ENTRY_MISMATCH',
    'SOURCE_MAPPING_DRIFT',
  ]);
  if (approvals.some((approval) => !promotableCodes.has(approval.code))) {
    throw new Error('页面合同 baseline 晋级包含不可批准的阻断 finding');
  }
  const approvedAddedCaseIds = uniqueStrings(approvals
    .filter((approval) => approval.code === 'PAGE_OBSERVATION_ADDED')
    .map((approval) => approval.caseId));
  if (input.current.observations.length !== input.baseline.observations.length + approvedAddedCaseIds.length) {
    throw new Error('页面合同 baseline 晋级数量与获批变更不一致');
  }
  if (
    input.diff.baselineFingerprint !== input.baseline.fingerprint
    || input.diff.currentFingerprint !== input.current.fingerprint
  ) {
    throw new Error('页面合同 baseline 晋级使用了过期 Diff');
  }
  const actualApprovals = dedupeFindingApprovals(input.diff.findings.map((finding) => ({
    caseId: finding.caseId,
    code: finding.code,
  })));
  if (input.diff.findings.some((finding) => !promotableCodes.has(finding.code))) {
    throw new Error('页面合同 baseline 晋级包含不可晋级的证据、来源或运行阻断');
  }
  for (const approval of input.approvedSourceMappings ?? []) {
    const before = input.baseline.observations.find((entry) => entry.caseId === approval.caseId);
    const after = input.current.observations.find((entry) => entry.caseId === approval.caseId);
    if (!before || !after || !approval.approvalRef) {
      throw new Error('页面合同来源映射批准缺少 baseline/current 或正式审批引用');
    }
    const added = after.sourceIds.filter((sourceId) => !before.sourceIds.includes(sourceId)).sort();
    const removed = before.sourceIds.filter((sourceId) => !after.sourceIds.includes(sourceId)).sort();
    if (removed.length > 0 || !sameStrings(added, uniqueStrings(approval.approvedSourceIds))) {
      throw new Error('页面合同来源映射变化与正式审批规则引用不一致');
    }
  }
  const approvedSourceCases = new Set((input.approvedSourceMappings ?? []).map((entry) => entry.caseId));
  if (input.diff.findings.some((finding) => (
    finding.code === 'SOURCE_MAPPING_DRIFT' && !approvedSourceCases.has(finding.caseId)
  ))) {
    throw new Error('页面合同来源映射变化缺少正式产品规则审批，不可批准或晋级');
  }
  if (!sameFindingApprovals(actualApprovals, approvals)) {
    throw new Error('页面合同 baseline Diff 与逐 finding 批准不一致');
  }

  const baselineCaseIds = new Set(input.baseline.observations.map((entry) => entry.caseId));
  const currentCaseIds = new Set(input.current.observations.map((entry) => entry.caseId));
  if (approvedAddedCaseIds.some((caseId) => baselineCaseIds.has(caseId) || !currentCaseIds.has(caseId))) {
    throw new Error('页面合同 baseline 获批新增用例状态无效');
  }
  if (approvals.filter((approval) => approval.code !== 'PAGE_OBSERVATION_ADDED')
    .some((approval) => !baselineCaseIds.has(approval.caseId) || !currentCaseIds.has(approval.caseId))) {
    throw new Error('页面合同 baseline 获批变更用例状态无效');
  }
}

export function diffProductCenterPageContractObservations(
  baseline: ProductCenterPageContractObservation,
  current: ProductCenterPageContractObservation,
): ProductCenterPageContractDiff {
  const baselineByCaseId = new Map(baseline.observations.map((entry) => [entry.caseId, entry]));
  const currentByCaseId = new Map(current.observations.map((entry) => [entry.caseId, entry]));
  const findings = [...current.findings];
  const caseIds = [...new Set([...baselineByCaseId.keys(), ...currentByCaseId.keys()])].sort();

  for (const caseId of caseIds) {
    const before = baselineByCaseId.get(caseId);
    const after = currentByCaseId.get(caseId);
    if (!before && after) {
      findings.push(finding('PAGE_OBSERVATION_ADDED', after, 'baseline 中不存在该页面观测'));
      continue;
    }
    if (before && !after) {
      findings.push(finding('PAGE_OBSERVATION_MISSING', before, '当前运行缺少 baseline 页面观测'));
      continue;
    }
    if (!before || !after) continue;

    if (
      before.route !== after.route
      || before.navigation.targetPath !== after.navigation.targetPath
      || before.navigation.arrivedPath !== after.navigation.arrivedPath
      || !sameStrings(before.navigation.verifiedPaths, after.navigation.verifiedPaths)
      || before.visibleUiRoute !== after.visibleUiRoute
    ) {
      findings.push(finding('ROUTE_PATH_MISMATCH', after, '当前路由观测与 baseline 不一致'));
    }
    if (!sameRecord(before.locatorCounts, after.locatorCounts)) {
      findings.push(finding('LOCATOR_NOT_UNIQUE', after, '定位器唯一性计数与 baseline 不一致'));
    }
    if (!sameStrings(before.capabilityIds, after.capabilityIds)) {
      findings.push(finding('CAPABILITY_DRIFT', after, 'capability 列表与 baseline 不一致'));
    }
    if (!sameStrings(before.assertionAdapterIds, after.assertionAdapterIds)) {
      findings.push(finding('ASSERTION_DRIFT', after, 'assertion adapter 列表与 baseline 不一致'));
    }
    if (!sameStrings(before.sourceIds, after.sourceIds)) {
      findings.push(finding('SOURCE_MAPPING_DRIFT', after, 'sourceIds 与 baseline 不一致'));
    }
    if (before.claimCoverageComplete !== after.claimCoverageComplete) {
      findings.push(finding('CLAIM_EVIDENCE_INCOMPLETE', after, 'Claim 覆盖状态与 baseline 不一致'));
    }
    if (before.sidebarEntryVerified !== after.sidebarEntryVerified) {
      findings.push(finding('SIDEBAR_ENTRY_MISMATCH', after, '侧边栏进入状态与 baseline 不一致'));
    }
    if (before.runtimeAccepted !== after.runtimeAccepted) {
      findings.push(finding('RUNTIME_ACCEPTANCE_MISSING', after, 'runtime acceptance 状态与 baseline 不一致'));
    }
    const beforeRelease = releaseOf(before);
    const afterRelease = releaseOf(after);
    const beforeTechnical = technicalSignalsOf(before);
    const afterTechnical = technicalSignalsOf(after);
    const missingSignals = [
      ...(!beforeRelease.routeFingerprint && afterRelease.routeFingerprint ? ['route-fingerprint'] : []),
      ...(!hasBrowserSignalBaseline(before) && hasBrowserSignalBaseline(after) ? ['browser-signals'] : []),
      ...(beforeTechnical.apiSignatureStatus === 'unknown'
        && afterTechnical.apiSignatureStatus === 'observed'
        ? ['api-signature']
        : []),
    ];
    if (beforeRelease.applicationFingerprint
      && (!beforeRelease.routeFingerprint || !afterRelease.routeFingerprint)
      && beforeRelease.applicationFingerprint !== afterRelease.applicationFingerprint) {
      findings.push(finding('RELEASE_FINGERPRINT_MISMATCH', after, '应用版本指纹与 baseline 不一致'));
    }
    if (beforeRelease.environmentFingerprint
      && beforeRelease.environmentFingerprint !== afterRelease.environmentFingerprint) {
      findings.push(finding('ENVIRONMENT_FINGERPRINT_MISMATCH', after, '环境指纹与 baseline 不一致'));
    }
    if (beforeRelease.routeFingerprint
      && beforeRelease.routeFingerprint !== afterRelease.routeFingerprint) {
      findings.push(finding('ROUTE_FINGERPRINT_MISMATCH', after, '路由资源指纹与 baseline 不一致'));
    }
    if (hasBrowserSignalBaseline(before)
      && !sameRecord(
        comparableBrowserSignals(browserSignalsOf(before)),
        comparableBrowserSignals(browserSignalsOf(after)),
      )) {
      findings.push(finding('EVIDENCE_SEMANTIC_MISMATCH', after, '浏览器页面语义信号与 baseline 不一致'));
    }
    if (beforeTechnical.apiSignatureStatus === 'observed'
      && (afterTechnical.apiSignatureStatus !== 'observed'
        || beforeTechnical.apiSignatureFingerprint !== afterTechnical.apiSignatureFingerprint)) {
      findings.push(finding('API_TECHNICAL_SIGNATURE_DRIFT', after, 'API 技术签名与 baseline 不一致'));
    }
    if (missingSignals.length > 0) {
      findings.push(finding(
        'OBSERVATION_SIGNAL_BASELINE_MISSING',
        after,
        `baseline 尚未包含技术观测信号，必须逐用例审批迁移：${missingSignals.sort().join(',')}`,
      ));
    }
  }

  const sortedFindings = sortAndDedupeFindings(findings);
  return {
    schemaVersion: '1.0.0',
    baselineFingerprint: baseline.fingerprint,
    currentFingerprint: current.fingerprint,
    changed: baseline.fingerprint !== current.fingerprint,
    status: sortedFindings.length === 0 ? 'clean' : 'review-required',
    summary: {
      baselineCases: baseline.observations.length,
      currentCases: current.observations.length,
      findings: sortedFindings.length,
    },
    findings: sortedFindings,
    contractMutationAllowed: false,
    businessRuleMutationAllowed: false,
  };
}

export function buildProductCenterPageContractImpact(
  diff: ProductCenterPageContractDiff,
  recipes: readonly ProductCenterPageContractRecipeInput[],
): ProductCenterPageContractImpact {
  const changes = diff.findings.flatMap((item) => (
    item.sourceIds.length > 0
      ? item.sourceIds.map((sourceId) => ({ collection: 'page-observation', id: sourceId, route: item.route }))
      : [{ collection: 'page-observation', id: `page-observation:${item.caseId}:${item.code}`, route: item.route }]
  ));
  const impactedCases = planContractChangeImpact(changes, recipes.map((recipe) => ({
    caseId: recipe.caseId,
    route: recipe.route,
    sourceIds: recipe.sourceIds,
  })));
  return {
    schemaVersion: '1.0.0',
    status: diff.findings.length === 0 ? 'no-impact' : 'review-required',
    findingCodes: [...new Set(diff.findings.map((item) => item.code))].sort(),
    impactedRoutes: [...new Set(diff.findings.map((item) => item.route))].sort(),
    impactedSourceIds: [...new Set(diff.findings.flatMap((item) => item.sourceIds))].sort(),
    impactedCases,
    contractMutationAllowed: false,
    businessRuleMutationAllowed: false,
  };
}

function normalizeObservation(
  recipe: ProductCenterPageContractRecipeInput,
  evidence: ProductCenterPageContractEvidenceInput | undefined,
  runtimeAccepted: boolean,
): ProductCenterPageContractObservationEntry {
  const navigation = evidence?.navigation;
  const locatorCounts = numericRecord(evidence?.locatorUniqueness);
  const boundaryLocatorCount = evidence?.execution?.boundaryEvidence?.locatorCount;
  if (typeof boundaryLocatorCount === 'number' && Number.isFinite(boundaryLocatorCount)) {
    locatorCounts.boundaryLocatorCount = boundaryLocatorCount;
  }
  return {
    recipeId: recipe.id,
    caseId: recipe.caseId,
    route: recipe.route,
    sourceIds: uniqueStrings(recipe.sourceIds),
    navigation: {
      mode: stringValue(navigation?.mode),
      targetPath: stringValue(navigation?.targetPath),
      arrivedPath: stringValue(navigation?.arrivedPath),
      verifiedPaths: uniqueStrings(navigation?.verifiedPaths ?? []),
    },
    visibleUiRoute: stringValue(evidence?.visibleUi?.route),
    locatorCounts,
    capabilityIds: validStrings(evidence?.execution?.capabilityIds ?? []),
    assertionAdapterIds: validStrings(evidence?.execution?.assertionAdapterIds ?? []),
    claimCoverageComplete: evidence?.claimCoverageComplete === true,
    sidebarEntryVerified: evidence?.sidebarEntryVerified === true,
    runtimeAccepted,
    release: {
      applicationFingerprint: stringValue(evidence?.release?.applicationFingerprint),
      environmentFingerprint: stringValue(evidence?.release?.environmentFingerprint),
      routeFingerprint: stringValue(evidence?.release?.routeFingerprint),
      observedAt: stringValue(evidence?.release?.observedAt),
    },
    browserSignals: normalizeBrowserSignals(evidence?.browserSignals),
    technicalSignals: buildApiTechnicalSignals(evidence),
  };
}

function validateObservation(
  recipe: ProductCenterPageContractRecipeInput,
  evidence: ProductCenterPageContractEvidenceInput | undefined,
  observation: ProductCenterPageContractObservationEntry,
  releaseGate: {
    current: ProductCenterReleaseEvidence;
    now?: string;
    maxAgeMs: number;
  } | undefined,
): ProductCenterPageContractFinding[] {
  const findings: ProductCenterPageContractFinding[] = [];
  const arrivedPathVerified = observation.navigation.verifiedPaths.length > 0
    ? observation.navigation.verifiedPaths.includes(observation.navigation.arrivedPath)
    : observation.navigation.arrivedPath === observation.navigation.targetPath;
  const sidebarValid = recipe.capabilities[0]?.id === 'navigation.sidebar.open'
    && observation.navigation.mode === 'sidebar'
    && observation.sidebarEntryVerified
    && arrivedPathVerified;
  if (!sidebarValid) {
    findings.push(finding('SIDEBAR_ENTRY_MISMATCH', observation, 'Recipe 或运行证据未证明从侧边栏进入'));
  }
  if (
    observation.navigation.targetPath !== recipe.route
    || !arrivedPathVerified
    || (observation.visibleUiRoute.length > 0
      && !new Set([
        recipe.route,
        observation.navigation.targetPath,
        observation.navigation.arrivedPath,
        ...observation.navigation.verifiedPaths,
      ]).has(observation.visibleUiRoute))
  ) {
    findings.push(finding('ROUTE_PATH_MISMATCH', observation, 'Recipe 路由与可验证运行落点不一致'));
  }
  const invalidLocatorCounts = Object.entries(observation.locatorCounts)
    .filter(([, count]) => count !== 1)
    .map(([key, count]) => `${key}=${count}`);
  if (invalidLocatorCounts.length > 0) {
    findings.push(finding('LOCATOR_NOT_UNIQUE', observation, invalidLocatorCounts.join(',')));
  }
  if (!sameStrings(recipe.capabilities.map((item) => item.id), observation.capabilityIds)) {
    findings.push(finding('CAPABILITY_DRIFT', observation, 'Recipe 与 runtime capabilityIds 不一致'));
  }
  if (!sameStrings(recipe.assertions.map((item) => item.adapterId), observation.assertionAdapterIds)) {
    findings.push(finding('ASSERTION_DRIFT', observation, 'Recipe 与 runtime assertionAdapterIds 不一致'));
  }
  if (!observation.claimCoverageComplete) {
    findings.push(finding('CLAIM_EVIDENCE_INCOMPLETE', observation, '运行证据未完成 Claim 覆盖'));
  }
  if (!observation.runtimeAccepted) {
    findings.push(finding('RUNTIME_ACCEPTANCE_MISSING', observation, 'runtime acceptance 未接受该用例'));
  }
  if (stringValue(evidence?.visibleUi?.observableVisibility) === 'hidden') {
    findings.push(finding('HIDDEN_UI_EVIDENCE', observation, 'visibleUi 不得使用隐藏 DOM 证据'));
  }
  const semanticKey = stringValue(evidence?.visibleUi?.semanticKey);
  const observableSemanticKey = stringValue(evidence?.visibleUi?.observableSemanticKey);
  if (semanticKey && observableSemanticKey && semanticKey !== observableSemanticKey) {
    findings.push(finding('EVIDENCE_SEMANTIC_MISMATCH', observation, 'visibleUi 语义键与可观测语义键不一致'));
  }
  if (releaseGate) {
    const freshness = evaluateProductCenterEvidenceFreshness({
      evidence: evidence?.release,
      current: releaseGate.current,
      now: releaseGate.now,
      maxAgeMs: releaseGate.maxAgeMs,
    });
    for (const code of freshness.issues) {
      findings.push(finding(code, observation, `当前版本证据门禁未通过：${code}`));
    }
  }
  return findings;
}

function finding(
  code: ProductCenterPageContractFindingCode,
  observation: Pick<ProductCenterPageContractObservationEntry, 'caseId' | 'route' | 'sourceIds'>,
  detail: string,
): ProductCenterPageContractFinding {
  return {
    code,
    caseId: observation.caseId,
    route: observation.route,
    sourceIds: [...observation.sourceIds],
    detail,
    blocking: true,
  };
}

function sortAndDedupeFindings(
  findings: readonly ProductCenterPageContractFinding[],
): ProductCenterPageContractFinding[] {
  const byKey = new Map<string, ProductCenterPageContractFinding>();
  for (const item of findings) byKey.set(`${item.code}\0${item.caseId}\0${item.detail}`, item);
  return [...byKey.values()].sort((left, right) => (
    left.code.localeCompare(right.code)
    || left.caseId.localeCompare(right.caseId)
    || left.detail.localeCompare(right.detail)
  ));
}

function fingerprintValue(value: unknown): string {
  return createHash('sha256').update(stableStringify(value)).digest('hex');
}

function stableObservationFingerprintInput(entry: ProductCenterPageContractObservationEntry) {
  const release = releaseOf(entry);
  return {
    caseId: entry.caseId,
    route: entry.route,
    sourceIds: entry.sourceIds,
    navigation: entry.navigation,
    visibleUiRoute: entry.visibleUiRoute,
    locatorCounts: entry.locatorCounts,
    capabilityIds: entry.capabilityIds,
    assertionAdapterIds: entry.assertionAdapterIds,
    claimCoverageComplete: entry.claimCoverageComplete,
    sidebarEntryVerified: entry.sidebarEntryVerified,
    runtimeAccepted: entry.runtimeAccepted,
    release: {
      applicationFingerprint: release.applicationFingerprint,
      environmentFingerprint: release.environmentFingerprint,
      routeFingerprint: release.routeFingerprint,
    },
    browserSignals: comparableBrowserSignals(browserSignalsOf(entry)),
    technicalSignals: technicalSignalsOf(entry),
  };
}

function numericRecord(value: Record<string, unknown> | undefined): Record<string, number> {
  if (!value) return {};
  return Object.fromEntries(Object.entries(value)
    .filter((entry): entry is [string, number] => (
      typeof entry[1] === 'number' && Number.isFinite(entry[1])
    ))
    .sort(([left], [right]) => left.localeCompare(right)));
}

function normalizeBrowserSignals(
  value: ProductCenterPageContractEvidenceInput['browserSignals'],
): NonNullable<ProductCenterPageContractObservationEntry['browserSignals']> {
  return {
    documentTitleFingerprint: stringValue(value?.documentTitleFingerprint),
    visibleHeadingFingerprints: uniqueStrings(value?.visibleHeadingFingerprints ?? []),
    visibleTestIdFingerprints: uniqueStrings(value?.visibleTestIdFingerprints ?? []),
    visibleRoleNameFingerprints: uniqueStrings(value?.visibleRoleNameFingerprints ?? []),
    visibleDialogCount: finiteNumber(value?.visibleDialogCount),
    visibleLoadingCount: finiteNumber(value?.visibleLoadingCount),
    visibleRowCount: finiteNumber(value?.visibleRowCount),
    requiredFieldCount: finiteNumber(value?.requiredFieldCount),
    inputTypes: uniqueStrings(value?.inputTypes ?? []),
    maxLengths: [...new Set((value?.maxLengths ?? []).filter(Number.isFinite))]
      .sort((left, right) => left - right),
  };
}

function finiteNumber(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function hasBrowserSignalBaseline(entry: ProductCenterPageContractObservationEntry): boolean {
  const signals = browserSignalsOf(entry);
  return signals.visibleTestIdFingerprints.length > 0
    || signals.documentTitleFingerprint.length > 0
    || signals.visibleHeadingFingerprints.length > 0
    || signals.visibleRoleNameFingerprints.length > 0
    || signals.inputTypes.length > 0
    || signals.maxLengths.length > 0;
}

function releaseOf(entry: ProductCenterPageContractObservationEntry) {
  return entry.release ?? {
    applicationFingerprint: '',
    environmentFingerprint: '',
    routeFingerprint: '',
    observedAt: '',
  };
}

function browserSignalsOf(entry: ProductCenterPageContractObservationEntry) {
  return normalizeBrowserSignals(entry.browserSignals);
}

function comparableBrowserSignals(
  signals: NonNullable<ProductCenterPageContractObservationEntry['browserSignals']>,
) {
  // 列表行、行内操作和筛选输入会随测试数据与 cleanup 状态变化；页面合同只比较稳定结构信号。
  return {
    documentTitleFingerprint: signals.documentTitleFingerprint,
    visibleHeadingFingerprints: signals.visibleHeadingFingerprints,
    visibleTestIdFingerprints: signals.visibleTestIdFingerprints,
    visibleDialogCount: signals.visibleDialogCount,
    visibleLoadingCount: signals.visibleLoadingCount,
    requiredFieldCount: signals.requiredFieldCount,
  };
}

function buildApiTechnicalSignals(
  evidence: ProductCenterPageContractEvidenceInput | undefined,
): NonNullable<ProductCenterPageContractObservationEntry['technicalSignals']> {
  if (evidence?.technicalSignals?.apiSignatureStatus === 'observed'
    && /^[a-f0-9]{64}$/.test(evidence.technicalSignals.apiSignatureFingerprint)) {
    return { ...evidence.technicalSignals };
  }
  if (evidence?.technicalSignals?.apiSignatureStatus === 'unknown') {
    return { apiSignatureStatus: 'unknown', apiSignatureFingerprint: '' };
  }
  const method = stringValue(evidence?.network?.method).trim().toUpperCase();
  const operation = normalizeApiOperation(stringValue(evidence?.network?.operation));
  const responseShape = uniqueStrings(evidence?.api?.responseShape ?? []);
  if (!method && !operation && responseShape.length === 0) {
    return { apiSignatureStatus: 'unknown', apiSignatureFingerprint: '' };
  }
  return {
    apiSignatureStatus: 'observed',
    apiSignatureFingerprint: fingerprintValue({ method, operation, responseShape }),
  };
}

function technicalSignalsOf(entry: ProductCenterPageContractObservationEntry) {
  return entry.technicalSignals ?? {
    apiSignatureStatus: 'unknown' as const,
    apiSignatureFingerprint: '',
  };
}

function normalizeApiOperation(value: string): string {
  if (!value) return '';
  let pathname: string;
  try {
    pathname = new URL(value, 'https://local.invalid').pathname;
  } catch {
    pathname = value.split(/[?#]/, 1)[0];
  }
  return pathname.split('/').map((segment) => (
    /^\d+$/.test(segment)
      || /^[a-f0-9]{16,}$/i.test(segment)
      || /^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(segment)
      ? ':id'
      : segment
  )).join('/');
}

function sameStrings(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function sameRecord(left: Record<string, unknown>, right: Record<string, unknown>): boolean {
  return stableStringify(left) === stableStringify(right);
}

function dedupeFindingApprovals(
  approvals: ReadonlyArray<{ caseId: string; code: ProductCenterPageContractFindingCode }>,
) {
  return [...new Map(approvals.map((approval) => [
    `${approval.code}\0${approval.caseId}`,
    { caseId: approval.caseId, code: approval.code },
  ])).values()].sort((left, right) => (
    left.code.localeCompare(right.code) || left.caseId.localeCompare(right.caseId)
  ));
}

function sameFindingApprovals(
  left: ReadonlyArray<{ caseId: string; code: ProductCenterPageContractFindingCode }>,
  right: ReadonlyArray<{ caseId: string; code: ProductCenterPageContractFindingCode }>,
): boolean {
  return stableStringify(left) === stableStringify(right);
}

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function validStrings(values: readonly string[]): string[] {
  return values.filter((value) => typeof value === 'string' && value.length > 0);
}

function uniqueStrings(values: readonly string[]): string[] {
  return [...new Set(validStrings(values))].sort();
}
