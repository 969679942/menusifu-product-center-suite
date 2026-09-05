import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export type ProductCenterItemFamily = 'standard' | 'package' | 'addon';
export type ProductCenterItemMutationMode = 'none' | 'api-seeded-ui-action';
export type ProductCenterItemLiveProbeId = 'product-page' | 'combo-group-list' | 'addon-group-list';
export type ProductCenterItemExternalCapability = 'terminal-sync' | 'industry-product-fixture';

export type ProductCenterItemDataProfile = {
  family: ProductCenterItemFamily;
  mutationMode: ProductCenterItemMutationMode;
  requiredRoutes: string[];
  requiredOperationKeys: string[];
  liveProbeIds: ProductCenterItemLiveProbeId[];
  factoryPaths: string[];
  cleanupAdapterPaths: string[];
  externalCapabilities: ProductCenterItemExternalCapability[];
};

export type ProductCenterItemPracticeManifest = {
  schemaVersion: string;
  collectionId: string;
  sourceRelease: { path: string; fingerprint: string; executableFingerprint: string };
  selectionPolicy: { targetSize: number; familyQuota: Record<ProductCenterItemFamily, number> };
  dataProfiles: Record<string, ProductCenterItemDataProfile>;
  caseBindings: Array<{ caseId: string; ruleId: string; dataProfile: string }>;
  circuitBreaker: ProductCenterItemCircuitBreakerPolicy;
  evidencePolicy: ProductCenterItemEvidencePolicy;
  families: Record<ProductCenterItemFamily, string[]>;
};

export type ProductCenterItemCircuitBreakerPolicy = {
  stallMs: number;
  pollMs: number;
  maxRunMs: number;
  maxConsecutiveFailures: number;
  maxDuplicateFailureFingerprint: number;
  minimumCompletedForFailureRate: number;
  maximumEnvironmentFailureRate: number;
};

export type ProductCenterItemEvidencePolicy = {
  requireRuntimeEvidence: boolean;
  requireIndependentExpectationReceipts: boolean;
  requireApiZeroResidue: boolean;
  requireUiZeroResidue: boolean;
};

type AuthoritativeRelease = {
  fingerprint: string;
  executableFingerprint: string;
  cases: Array<{
    caseId: string;
    title: string;
    scope: string;
    automation: { runtimeReadiness: string };
    runtime: { status: string };
  }>;
};

type CandidateLedger = {
  fingerprint: string;
  candidates: Array<{
    ruleId: string;
    caseId: string;
    currentStatus: string;
    sourceCaseFingerprint: string;
    outcomeClaims: string[];
    outcomes: string[];
    formalPromotionAllowed: boolean;
  }>;
};

export type ProductCenterItemCompiledCase = {
  caseId: string;
  title: string;
  family: ProductCenterItemFamily;
  ruleId: string;
  ruleStatus: string;
  ruleSourceFingerprint: string;
  formalPromotionAllowed: false;
  dataProfile: string;
  mutationMode: ProductCenterItemMutationMode;
  requiredRoutes: string[];
  requiredOperationKeys: string[];
  liveProbeIds: ProductCenterItemLiveProbeId[];
  externalCapabilities: ProductCenterItemExternalCapability[];
  expectationClaims: Array<{ claimId: string; expected: string }>;
};

export type ProductCenterItemPracticeContract = {
  schemaVersion: '1.0.0';
  collectionId: 'product-center-item-practice-contract';
  generatedAt: string;
  source: {
    manifestCollectionId: string;
    releaseFingerprint: string;
    executableFingerprint: string;
    ruleLedgerFingerprint: string;
  };
  summary: {
    selectedCases: number;
    standard: number;
    package: number;
    addon: number;
    mutationCases: number;
    expectationClaims: number;
  };
  profiles: Record<string, ProductCenterItemDataProfile>;
  cases: ProductCenterItemCompiledCase[];
  circuitBreaker: ProductCenterItemCircuitBreakerPolicy;
  evidencePolicy: ProductCenterItemEvidencePolicy;
  fingerprint: string;
};

export type ProductCenterItemPracticeContractBuildResult = {
  contract: ProductCenterItemPracticeContract;
  errors: string[];
};

export function buildProductCenterItemPracticeContract(input: {
  manifest: ProductCenterItemPracticeManifest;
  release: AuthoritativeRelease;
  rules: CandidateLedger;
  rootDir: string;
  selectedCaseIds?: readonly string[];
}): ProductCenterItemPracticeContractBuildResult {
  const errors: string[] = [];
  const selectedIds = input.selectedCaseIds?.length
    ? new Set(input.selectedCaseIds)
    : new Set(input.manifest.caseBindings.map((item) => item.caseId));
  const releaseById = new Map(input.release.cases.map((item) => [item.caseId, item]));
  const ruleById = new Map(input.rules.candidates.map((item) => [item.ruleId, item]));
  const bindings = input.manifest.caseBindings.filter((item) => selectedIds.has(item.caseId));

  if (input.release.fingerprint !== input.manifest.sourceRelease.fingerprint) errors.push('RELEASE_FINGERPRINT_MISMATCH');
  if (input.release.executableFingerprint !== input.manifest.sourceRelease.executableFingerprint) {
    errors.push('EXECUTABLE_FINGERPRINT_MISMATCH');
  }
  if (bindings.length !== selectedIds.size) errors.push('UNKNOWN_SELECTED_CASE_ID');
  if (new Set(bindings.map((item) => item.caseId)).size !== bindings.length) errors.push('CASE_ID_DUPLICATE');
  if (!input.selectedCaseIds?.length && bindings.length !== input.manifest.selectionPolicy.targetSize) {
    errors.push('TARGET_SIZE_MISMATCH');
  }

  const compiledCases = bindings.flatMap((binding): ProductCenterItemCompiledCase[] => {
    const releaseCase = releaseById.get(binding.caseId);
    const rule = ruleById.get(binding.ruleId);
    const profile = input.manifest.dataProfiles[binding.dataProfile];
    if (!releaseCase) errors.push(`${binding.caseId}:RELEASE_CASE_REQUIRED`);
    if (!rule || rule.caseId !== binding.caseId) errors.push(`${binding.caseId}:RULE_BINDING_INVALID`);
    if (!profile) errors.push(`${binding.caseId}:DATA_PROFILE_REQUIRED`);
    if (!releaseCase || !rule || !profile) return [];

    const family = familyOf(binding.caseId);
    if (profile.family !== family) errors.push(`${binding.caseId}:DATA_PROFILE_FAMILY_MISMATCH`);
    if (releaseCase.scope !== 'executable') errors.push(`${binding.caseId}:CASE_NOT_EXECUTABLE`);
    if (releaseCase.automation.runtimeReadiness !== 'ready') errors.push(`${binding.caseId}:RUNTIME_NOT_READY`);
    if (releaseCase.runtime.status !== 'runtime-passed') errors.push(`${binding.caseId}:RUNTIME_NOT_PASSED`);
    if (releaseCase.runtime.status === 'deferred') errors.push(`${binding.caseId}:DEFERRED_CASE_FORBIDDEN`);
    if (rule.currentStatus === 'formal' || rule.formalPromotionAllowed) errors.push(`${binding.caseId}:CANDIDATE_AUTHORITY_INVALID`);
    if (rule.outcomeClaims.length === 0 || rule.outcomeClaims.length !== rule.outcomes.length) {
      errors.push(`${binding.caseId}:EXPECTATION_CLAIMS_INCOMPLETE`);
    }
    for (const filePath of [...profile.factoryPaths, ...profile.cleanupAdapterPaths]) {
      if (!fs.existsSync(path.resolve(input.rootDir, filePath))) errors.push(`${binding.caseId}:ADAPTER_MISSING:${filePath}`);
    }
    if (profile.mutationMode !== 'none' && profile.cleanupAdapterPaths.length === 0) {
      errors.push(`${binding.caseId}:CLEANUP_ADAPTER_REQUIRED`);
    }
    if (profile.requiredRoutes.length === 0 || profile.requiredOperationKeys.length === 0 || profile.liveProbeIds.length === 0) {
      errors.push(`${binding.caseId}:PREFLIGHT_CAPABILITY_REQUIRED`);
    }

    return [{
      caseId: binding.caseId,
      title: releaseCase.title,
      family,
      ruleId: binding.ruleId,
      ruleStatus: rule.currentStatus,
      ruleSourceFingerprint: rule.sourceCaseFingerprint,
      formalPromotionAllowed: false,
      dataProfile: binding.dataProfile,
      mutationMode: profile.mutationMode,
      requiredRoutes: [...profile.requiredRoutes],
      requiredOperationKeys: [...profile.requiredOperationKeys],
      liveProbeIds: [...profile.liveProbeIds],
      externalCapabilities: [...profile.externalCapabilities],
      expectationClaims: rule.outcomeClaims.map((claimId, index) => ({ claimId, expected: rule.outcomes[index] })),
    }];
  });

  const contractWithoutFingerprint = {
    schemaVersion: '1.0.0' as const,
    collectionId: 'product-center-item-practice-contract' as const,
    generatedAt: new Date().toISOString(),
    source: {
      manifestCollectionId: input.manifest.collectionId,
      releaseFingerprint: input.release.fingerprint,
      executableFingerprint: input.release.executableFingerprint,
      ruleLedgerFingerprint: input.rules.fingerprint,
    },
    summary: {
      selectedCases: compiledCases.length,
      standard: compiledCases.filter((item) => item.family === 'standard').length,
      package: compiledCases.filter((item) => item.family === 'package').length,
      addon: compiledCases.filter((item) => item.family === 'addon').length,
      mutationCases: compiledCases.filter((item) => item.mutationMode !== 'none').length,
      expectationClaims: compiledCases.reduce((total, item) => total + item.expectationClaims.length, 0),
    },
    profiles: Object.fromEntries(
      [...new Set(compiledCases.map((item) => item.dataProfile))]
        .sort()
        .map((profileId) => [profileId, input.manifest.dataProfiles[profileId]]),
    ),
    cases: compiledCases.sort((left, right) => left.caseId.localeCompare(right.caseId)),
    circuitBreaker: { ...input.manifest.circuitBreaker },
    evidencePolicy: { ...input.manifest.evidencePolicy },
  };
  if (!input.selectedCaseIds?.length) {
    for (const family of ['standard', 'package', 'addon'] as const) {
      if (compiledCases.filter((item) => item.family === family).length !== input.manifest.selectionPolicy.familyQuota[family]) {
        errors.push(`${family.toUpperCase()}:FAMILY_QUOTA_MISMATCH`);
      }
    }
  }
  const fingerprint = sha256(stableJson({ ...contractWithoutFingerprint, generatedAt: undefined }));
  return { contract: { ...contractWithoutFingerprint, fingerprint }, errors: [...new Set(errors)].sort() };
}

export function loadProductCenterItemPracticeContractInputs(rootDir: string): {
  manifest: ProductCenterItemPracticeManifest;
  release: AuthoritativeRelease;
  rules: CandidateLedger;
} {
  const manifestPath = process.env.PC_ITEM_PRACTICE_MANIFEST
    ? path.resolve(rootDir, process.env.PC_ITEM_PRACTICE_MANIFEST)
    : path.resolve(rootDir, 'contracts/product-center/test-manifests/product-center-item-practice-batch-v1.json');
  const manifest = readJson<ProductCenterItemPracticeManifest>(
    rootDir,
    path.relative(rootDir, manifestPath),
  );
  return {
    manifest,
    release: readJson<AuthoritativeRelease>(rootDir, manifest.sourceRelease.path),
    rules: readJson<CandidateLedger>(
      rootDir,
      'contracts/product-center/business-rules/generated/product-center-item-test-plan-rule-candidates.json',
    ),
  };
}

function familyOf(caseId: string): ProductCenterItemFamily {
  if (caseId.startsWith('TC-ITEM-STD-')) return 'standard';
  if (caseId.startsWith('TC-ITEM-PKG-')) return 'package';
  if (caseId.startsWith('TC-ITEM-ADD-')) return 'addon';
  throw new Error(`未知商品用例族：${caseId}`);
}

function readJson<T>(rootDir: string, relativePath: string): T {
  return JSON.parse(fs.readFileSync(path.resolve(rootDir, relativePath), 'utf8')) as T;
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}
