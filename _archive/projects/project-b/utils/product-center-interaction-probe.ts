import { createHash } from 'node:crypto';
import type { AutomationRecipe } from '../automation/recipe/automation-recipe';
import { stableStringify } from './product-center-test-contract';
import {
  evaluateProductCenterEvidenceFreshness,
  type ProductCenterReleaseEvidence,
} from './product-center-release-evidence';

type ProbeDefinition = {
  id: string;
  module: string;
  caseId: string;
  route: string;
  mode: 'cleanup-required' | 'read-only';
  capabilityIds: string[];
  evidenceRequirements: string[];
};

type ProbeContract = {
  schemaVersion: '1.0.0';
  collectionId: 'product-center-interaction-probes';
  policy?: { minimumPerModule?: number };
  probes: ProbeDefinition[];
};

type RuntimeEvidenceEntry = {
  recipeId?: string;
  caseId?: string;
  release?: ProductCenterReleaseEvidence;
  claimCoverageComplete?: boolean;
  sidebarEntryVerified?: boolean;
  [key: string]: unknown;
};

export function compileProductCenterInteractionProbeSelection(
  contract: ProbeContract,
  recipes: readonly AutomationRecipe[],
) {
  const recipeByCaseId = new Map(recipes.map((recipe) => [recipe.caseId, recipe]));
  const bindings = contract.probes.map((probe) => {
    const recipe = recipeByCaseId.get(probe.caseId);
    if (!recipe) throw new Error(`Probe 引用未知 caseId：${probe.id}`);
    const capabilityIds = recipe.capabilities.map((entry) => entry.id);
    if (capabilityIds[0] !== 'navigation.sidebar.open') {
      throw new Error(`Probe 第一 capability 必须是 navigation.sidebar.open：${probe.id}`);
    }
    if (probe.route !== recipe.route) throw new Error(`Probe 路由与 Recipe 不一致：${probe.id}`);
    return {
      probeId: probe.id,
      caseId: probe.caseId,
      recipeId: recipe.id,
      route: recipe.route,
      mode: probe.mode,
      capabilityIds,
      evidenceRequirements: [...probe.evidenceRequirements],
    };
  }).sort((left, right) => left.probeId.localeCompare(right.probeId));
  return {
    schemaVersion: '1.0.0' as const,
    collectionId: 'product-center-page-contract-probe-selection' as const,
    probeCount: bindings.length,
    selectedCaseIds: [...new Set(bindings.map((entry) => entry.caseId))].sort(),
    bindings,
    fingerprint: sha256(stableStringify(bindings)),
  };
}

export function buildProductCenterInteractionProbeEvidence(input: {
  probes: ProbeContract;
  recipes: readonly AutomationRecipe[];
  runtimeEvidence: { runId?: string; entries?: readonly RuntimeEvidenceEntry[] };
  acceptedCaseIds: readonly string[];
  currentRelease: ProductCenterReleaseEvidence;
  now?: string;
  maxAgeMs: number;
}) {
  const selection = compileProductCenterInteractionProbeSelection(input.probes, input.recipes);
  const evidenceByCaseId = new Map((input.runtimeEvidence.entries ?? [])
    .filter((entry): entry is RuntimeEvidenceEntry & { caseId: string } => Boolean(entry.caseId))
    .map((entry) => [entry.caseId, entry]));
  const acceptedCaseIds = new Set(input.acceptedCaseIds);
  const entries = selection.bindings.map((binding) => {
    const evidence = evidenceByCaseId.get(binding.caseId);
    const freshness = evaluateProductCenterEvidenceFreshness({
      evidence: evidence?.release,
      current: input.currentRelease,
      now: input.now,
      maxAgeMs: input.maxAgeMs,
    });
    const missingRequirements = binding.evidenceRequirements.filter((requirement) => (
      !hasEvidenceRequirement(evidence, requirement, binding.mode)
    ));
    const issues = [
      ...freshness.issues,
      ...(!acceptedCaseIds.has(binding.caseId) ? ['RUNTIME_ACCEPTANCE_MISSING'] : []),
      ...(evidence?.claimCoverageComplete !== true ? ['CLAIM_EVIDENCE_INCOMPLETE'] : []),
      ...(evidence?.sidebarEntryVerified !== true ? ['SIDEBAR_ENTRY_MISMATCH'] : []),
      ...missingRequirements.map((requirement) => `PROBE_EVIDENCE_MISSING:${requirement}`),
    ];
    return {
      probeId: binding.probeId,
      recipeId: binding.recipeId,
      caseId: binding.caseId,
      route: binding.route,
      mode: binding.mode,
      status: issues.length === 0 ? 'observed' as const : 'planned' as const,
      sourceRunId: input.runtimeEvidence.runId ?? '',
      releaseFingerprint: evidence?.release?.applicationFingerprint ?? '',
      environmentFingerprint: evidence?.release?.environmentFingerprint ?? '',
      observedAt: evidence?.release?.observedAt ?? '',
      capabilityIds: [...binding.capabilityIds],
      evidenceRequirements: [...binding.evidenceRequirements],
      missingRequirements,
      issues: [...new Set(issues)].sort(),
    };
  });
  const observed = entries.filter((entry) => entry.status === 'observed').length;
  return {
    schemaVersion: '1.0.0' as const,
    collectionId: 'product-center-interaction-probe-evidence' as const,
    generatedAt: input.now ?? new Date().toISOString(),
    runId: input.runtimeEvidence.runId ?? '',
    selectionFingerprint: selection.fingerprint,
    status: observed === entries.length && entries.length > 0
      ? 'accepted' as const
      : 'review-required' as const,
    summary: { total: entries.length, observed, planned: entries.length - observed },
    entries,
  };
}

export function validateProductCenterDriftContracts(input: {
  benchmark: unknown;
  historicalReplay: unknown;
  interactionProbes: unknown;
}): string[] {
  const issues: string[] = [];
  validateCollection(input.benchmark, 'product-center-drift-benchmark', 'scenarios', issues);
  validateCollection(
    input.historicalReplay,
    'product-center-historical-failure-replay',
    'replays',
    issues,
  );
  validateCollection(
    input.interactionProbes,
    'product-center-interaction-probes',
    'probes',
    issues,
  );
  if (isRecord(input.interactionProbes) && Array.isArray(input.interactionProbes.probes)) {
    for (const [index, probe] of input.interactionProbes.probes.entries()) {
      if (!isRecord(probe)) {
        issues.push(`probes[${index}] 必须为对象`);
        continue;
      }
      if (!Array.isArray(probe.capabilityIds)
        || probe.capabilityIds[0] !== 'navigation.sidebar.open') {
        issues.push(`probes[${index}] 第一 capability 必须是 navigation.sidebar.open`);
      }
      if (!Array.isArray(probe.evidenceRequirements) || probe.evidenceRequirements.length === 0) {
        issues.push(`probes[${index}] evidenceRequirements 不能为空`);
      }
    }
  }
  return issues;
}

function hasEvidenceRequirement(
  evidence: RuntimeEvidenceEntry | undefined,
  requirement: string,
  mode: ProbeDefinition['mode'],
): boolean {
  if (!evidence) return false;
  if (requirement === 'cleanup') {
    if (mode === 'read-only') return true;
    const cleanup = isRecord(evidence.cleanup) ? evidence.cleanup : undefined;
    return cleanup?.completed === true && cleanup?.residueCount === 0;
  }
  const value = evidence[requirement];
  return isRecord(value) && Object.keys(value).length > 0;
}

function validateCollection(
  value: unknown,
  collectionId: string,
  entriesKey: string,
  issues: string[],
): void {
  if (!isRecord(value)) {
    issues.push(`${collectionId} 必须为对象`);
    return;
  }
  if (value.schemaVersion !== '1.0.0') issues.push(`${collectionId} schemaVersion 无效`);
  if (value.collectionId !== collectionId) issues.push(`${collectionId} collectionId 无效`);
  const entries = value[entriesKey];
  if (!Array.isArray(entries) || entries.length === 0) {
    issues.push(`${collectionId} ${entriesKey} 不能为空`);
    return;
  }
  const ids = entries.flatMap((entry) => (
    isRecord(entry) && typeof entry.id === 'string' ? [entry.id] : []
  ));
  if (ids.length !== entries.length) issues.push(`${collectionId} 存在缺失 id 的条目`);
  if (new Set(ids).size !== ids.length) issues.push(`${collectionId} 存在重复 id`);
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function isRecord(value: unknown): value is Record<string, any> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
