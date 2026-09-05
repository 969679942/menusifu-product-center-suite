import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type {
  ItemTechnicalBindingGapClassification,
  ProductCenterItemTechnicalBindingGapDocument,
} from '../utils/product-center-item-technical-binding-gap';
import type {
  ProductCenterItemP0WaveRecipeCollection,
  ProductCenterItemP0WaveRuntimeAcceptanceDocument,
} from '../utils/product-center-item-p0-technical-binding-batch';
import { loadProductCenterItemRemainingWaveEvidence } from '../utils/product-center-item-remaining-wave-evidence';
import { loadProductCenterItemConflictDecisions } from '../utils/product-center-item-conflict-decisions';

type CurrentTechnicalStatus = ItemTechnicalBindingGapClassification
  | 'canonical-reconciliation-required'
  | 'product-defect-open'
  | 'product-rule-confirmation-required'
  | 'blocked-until-terminal-access';

type RuleConfirmations = {
  confirmations: Array<{ linkedCanonicalIds: string[] }>;
};

export function buildProductCenterItemCurrentTechnicalStatus(options: {
  projectRoot?: string;
  generatedAt?: string;
} = {}) {
  const projectRoot = path.resolve(options.projectRoot ?? path.resolve(__dirname, '..'));
  const canonicalRoot = path.join(projectRoot, 'contracts/product-center/test-cases/canonical');
  const gapPath = path.join(canonicalRoot, 'product-center-item-technical-binding-gap.json');
  const baselineCanonicalPath = path.join(canonicalRoot, 'product-center-item-xmind-rebuild-pilot.json');
  const alternateCanonicalPath = path.join(canonicalRoot, 'product-center-item-canonical-release.json');
  const confirmationsPath = path.join(
    projectRoot,
    'contracts/product-center/reviews/product-center-item-rule-confirmations.json',
  );
  const gap = readJson<ProductCenterItemTechnicalBindingGapDocument>(gapPath);
  const waveKeys = ['a', 'b', 'c', 'd'] as const;
  const acceptances = waveKeys.map((wave) => readJson<ProductCenterItemP0WaveRuntimeAcceptanceDocument>(path.join(
    projectRoot,
    `contracts/product-center/reviews/product-center-item-p0-wave-${wave}-runtime-acceptance.json`,
  )));
  const recipeCollections = waveKeys.map((wave) => readJson<ProductCenterItemP0WaveRecipeCollection>(path.join(
    projectRoot,
    `contracts/product-center/recipes/product-center-item-p0-wave-${wave}-recipes.json`,
  )));
  const confirmations = readJson<RuleConfirmations>(confirmationsPath);
  const remainingWaveEvidence = loadProductCenterItemRemainingWaveEvidence(projectRoot);
  const conflictDecisions = loadProductCenterItemConflictDecisions(projectRoot);
  const activeEntries = gap.entries.filter((entry) => entry.canonicalStatus !== 'deprecated');
  const activeCaseIds = new Set(activeEntries.map((entry) => entry.caseId));
  const baselineAcceptedCaseIds = activeEntries
    .filter((entry) => entry.classification === 'runtime-accepted')
    .map((entry) => entry.caseId);
  const waveAcceptedCaseIds = acceptances.flatMap((acceptance) => {
    if (acceptance.status !== 'accepted'
      || acceptance.acceptedCaseIds.length !== acceptance.caseIds.length) {
      throw new Error(`当前技术状态拒绝未完整验收波次：${acceptance.waveId}`);
    }
    return acceptance.acceptedCaseIds;
  });
  assertUnique(waveAcceptedCaseIds, '四波 runtime acceptance 存在重复用例');
  const unknownWaveCases = waveAcceptedCaseIds.filter((caseId) => !activeCaseIds.has(caseId));
  if (unknownWaveCases.length > 0) {
    throw new Error(`四波 runtime acceptance 包含非活动 canonical：${unknownWaveCases.join(',')}`);
  }
  const baselineAccepted = new Set(baselineAcceptedCaseIds);
  const waveAccepted = new Set(waveAcceptedCaseIds);
  if (!sameSet(conflictDecisions.caseIds, remainingWaveEvidence.canonicalConflictCaseIds)) {
    throw new Error('C01-C09 决策未精确覆盖 W1-W8 canonical conflict');
  }
  const acceptedAfterReconciliation = new Set(conflictDecisions.updateCanonicalCaseIds);
  const remainingWaveAcceptedCaseIds = [
    ...remainingWaveEvidence.acceptedCaseIds,
    ...conflictDecisions.updateCanonicalCaseIds,
  ].sort();
  const remainingWaveAccepted = new Set(remainingWaveAcceptedCaseIds);
  const remainingWaveCanonicalConflictCaseIds = remainingWaveEvidence.canonicalConflictCaseIds
    .filter((caseId) => !acceptedAfterReconciliation.has(caseId))
    .sort();
  const remainingWaveCanonicalConflict = new Set(remainingWaveCanonicalConflictCaseIds);
  const productDefectOpen = new Set(conflictDecisions.productDefectOpenCaseIds);
  const productRuleConfirmationRequired = new Set(conflictDecisions.productRuleConfirmationRequiredCaseIds);
  const externalTerminalBlocked = new Set(remainingWaveEvidence.blockedCaseIds);
  const overlappingAcceptedCaseIds = waveAcceptedCaseIds.filter((caseId) => baselineAccepted.has(caseId));
  const remainingWaveOverlap = remainingWaveAcceptedCaseIds.filter((caseId) => (
    baselineAccepted.has(caseId) || waveAccepted.has(caseId)
  ));
  if (remainingWaveOverlap.length > 0) {
    throw new Error(`W1-W8 accepted 与既有运行证据重叠：${remainingWaveOverlap.join(',')}`);
  }
  const unknownRemainingCases = remainingWaveEvidence.caseIds.filter((caseId) => !activeCaseIds.has(caseId));
  if (unknownRemainingCases.length > 0) {
    throw new Error(`W1-W9 证据包含非活动 canonical：${unknownRemainingCases.join(',')}`);
  }
  const recipesByCaseId = new Map(recipeCollections.flatMap((collection) => (
    collection.recipes.map((recipe) => [recipe.caseId, recipe] as const)
  )));
  const alternateCanonicalReference = 'canonical:product-center-item-canonical-release.json#';
  const canonicalReconciliationCaseIds = waveAcceptedCaseIds
    .filter((caseId) => recipesByCaseId.get(caseId)?.sourceIds.some((sourceId) => (
      sourceId.startsWith(alternateCanonicalReference)
    )))
    .sort();
  const canonicalReconciliation = new Set(canonicalReconciliationCaseIds);
  const confirmedCaseIds = new Set(confirmations.confirmations.flatMap((item) => item.linkedCanonicalIds));
  const baselineCompatibleCaseIds = [
    ...baselineAcceptedCaseIds,
    ...waveAcceptedCaseIds,
    ...remainingWaveAcceptedCaseIds,
  ]
    .filter((caseId) => !canonicalReconciliation.has(caseId))
    .sort();
  const entries = activeEntries.map((entry) => {
    const runtimeSource = acceptedAfterReconciliation.has(entry.caseId)
      ? 'p0-remaining-wave-reconciled-evidence' as const
      : remainingWaveAccepted.has(entry.caseId)
      ? 'p0-remaining-wave-runtime-evidence' as const
      : waveAccepted.has(entry.caseId)
      ? 'p0-wave-runtime-acceptance' as const
      : baselineAccepted.has(entry.caseId)
        ? 'baseline-runtime-acceptance' as const
        : 'not-runtime-accepted' as const;
    const currentStatus: CurrentTechnicalStatus = runtimeSource !== 'not-runtime-accepted'
      ? 'runtime-accepted'
      : productDefectOpen.has(entry.caseId)
        ? 'product-defect-open'
        : productRuleConfirmationRequired.has(entry.caseId)
          ? 'product-rule-confirmation-required'
          : remainingWaveCanonicalConflict.has(entry.caseId)
            ? 'canonical-reconciliation-required'
        : externalTerminalBlocked.has(entry.caseId)
          ? 'blocked-until-terminal-access'
          : entry.classification;
    const canonicalCompatibility = currentStatus !== 'runtime-accepted'
      ? 'not-runtime-accepted' as const
      : canonicalReconciliation.has(entry.caseId)
        ? 'canonical-reconciliation-required' as const
        : 'baseline-compatible' as const;
    const releaseEligible = canonicalCompatibility === 'baseline-compatible';
    return {
      caseId: entry.caseId,
      title: entry.title,
      priority: entry.priority,
      baselineClassification: entry.classification,
      currentStatus,
      runtimeSource,
      canonicalCompatibility,
      productRuleConfirmed: canonicalReconciliation.has(entry.caseId)
        ? confirmedCaseIds.has(entry.caseId)
        : undefined,
      releaseEligible,
      generationAllowed: releaseEligible,
      remainingWaveDisposition: acceptedAfterReconciliation.has(entry.caseId)
        ? 'accepted-after-canonical-reconciliation' as const
        : remainingWaveAccepted.has(entry.caseId)
        ? 'accepted' as const
        : productDefectOpen.has(entry.caseId)
          ? 'retain-canonical-file-bug' as const
          : productRuleConfirmationRequired.has(entry.caseId)
            ? 'needs-prd' as const
        : remainingWaveCanonicalConflict.has(entry.caseId)
          ? 'canonical-conflict' as const
          : externalTerminalBlocked.has(entry.caseId)
            ? 'blocked-until-terminal-access' as const
            : undefined,
      remainingGapCodes: canonicalCompatibility === 'canonical-reconciliation-required'
        ? ['canonical-reconciliation-required']
        : currentStatus === 'runtime-accepted'
          ? []
          : currentStatus === 'canonical-reconciliation-required'
            ? ['canonical-reconciliation-required']
            : currentStatus === 'product-defect-open'
              ? ['product-defect-open']
              : currentStatus === 'product-rule-confirmation-required'
                ? ['product-rule-confirmation-required']
            : currentStatus === 'blocked-until-terminal-access'
              ? ['blocked-until-terminal-access']
              : entry.gapCodes,
    };
  });
  const byPriority = Object.fromEntries((['P0', 'P1', 'P2'] as const).map((priority) => {
    const selected = entries.filter((entry) => entry.priority === priority);
    const runtimeAccepted = selected.filter((entry) => entry.currentStatus === 'runtime-accepted').length;
    const baselineCompatible = selected.filter((entry) => entry.canonicalCompatibility === 'baseline-compatible').length;
    const canonicalReconciliationRequired = selected.filter((entry) => (
      entry.canonicalCompatibility === 'canonical-reconciliation-required'
    )).length;
    return [priority, {
      total: selected.length,
      runtimeAccepted,
      baselineCompatible,
      canonicalReconciliationRequired,
      remaining: selected.length - runtimeAccepted,
    }];
  }));
  const runtimeAccepted = entries.filter((entry) => entry.currentStatus === 'runtime-accepted').length;
  const baselineCompatible = baselineCompatibleCaseIds.length;
  const semanticValue = {
    sourceFingerprints: {
      technicalBindingGap: gap.fingerprint,
      baselineCanonical: sha256File(baselineCanonicalPath),
      alternateCanonical: sha256File(alternateCanonicalPath),
      ruleConfirmations: sha256File(confirmationsPath),
      runtimeAcceptances: Object.fromEntries(acceptances.map((acceptance) => [
        acceptance.waveId,
        acceptance.sourceArtifact.sha256,
      ])),
      remainingWaveEvidence: Object.fromEntries(remainingWaveEvidence.waves.map((wave) => [
        wave.waveId,
        wave.sha256,
      ])),
      conflictDecisions: conflictDecisions.sha256,
      waveRecipeCollections: Object.fromEntries(recipeCollections.map((collection) => [
        collection.waveId,
        hashValue(collection),
      ])),
    },
    summary: {
      total: entries.length,
      runtimeAccepted,
      remaining: entries.length - runtimeAccepted,
      runtimeCoverage: {
        accepted: runtimeAccepted,
        remaining: entries.length - runtimeAccepted,
      },
      baselineCompatibility: {
        accepted: baselineCompatible,
        canonicalReconciliationRequired: canonicalReconciliationCaseIds.length,
        notRuntimeAccepted: entries.length - runtimeAccepted,
      },
      capabilityMappingRequired: countStatus(entries, 'capability-mapping-required'),
      pageObservationRequired: countStatus(entries, 'page-observation-required'),
      canonicalConflictRequired: countStatus(entries, 'canonical-reconciliation-required'),
      productDefectOpen: countStatus(entries, 'product-defect-open'),
      productRuleConfirmationRequired: countStatus(entries, 'product-rule-confirmation-required'),
      externalTerminalBlocked: countStatus(entries, 'blocked-until-terminal-access'),
      recipeExistingRuntimeRequired: countStatus(entries, 'recipe-existing-runtime-required'),
      recipeDriftRepairRequired: countStatus(entries, 'recipe-drift-repair-required'),
      byPriority,
    },
    runtimeSources: {
      baselineAccepted: baselineAcceptedCaseIds.length,
      waveAccepted: waveAcceptedCaseIds.length,
      remainingWaveAccepted: remainingWaveAcceptedCaseIds.length,
      acceptedAfterReconciliation: conflictDecisions.updateCanonicalCaseIds.length,
      remainingWaveCanonicalConflict: remainingWaveCanonicalConflictCaseIds.length,
      productDefectOpen: conflictDecisions.productDefectOpenCaseIds.length,
      productRuleConfirmationRequired: conflictDecisions.productRuleConfirmationRequiredCaseIds.length,
      externalTerminalBlocked: remainingWaveEvidence.blockedCaseIds.length,
      overlap: overlappingAcceptedCaseIds.length,
      alternateCanonicalAccepted: canonicalReconciliationCaseIds.length,
    },
    remainingWaveEvidence: {
      scope: remainingWaveEvidence.caseIds.length,
      accepted: remainingWaveEvidence.acceptedCaseIds.length,
      canonicalConflict: remainingWaveEvidence.canonicalConflictCaseIds.length,
      blocked: remainingWaveEvidence.blockedCaseIds.length,
      harnessError: remainingWaveEvidence.harnessErrorCaseIds.length,
      runtimeReports: remainingWaveEvidence.waves.filter((wave) => wave.waveId !== 'W9').length,
      terminalGates: remainingWaveEvidence.waves.filter((wave) => wave.waveId === 'W9').length,
      acceptedAfterReconciliation: conflictDecisions.updateCanonicalCaseIds.length,
      unresolvedCanonicalConflict: remainingWaveCanonicalConflictCaseIds.length,
      caseIds: remainingWaveEvidence.caseIds,
      waves: remainingWaveEvidence.waves,
    },
    canonicalReconciliation: {
      baselineCanonicalPath: relativePath(projectRoot, baselineCanonicalPath),
      alternateCanonicalPath: relativePath(projectRoot, alternateCanonicalPath),
      reasonCode: 'RUNTIME_ACCEPTANCE_CANONICAL_SOURCE_DIVERGENCE' as const,
      confirmedCaseIds: canonicalReconciliationCaseIds.filter((caseId) => confirmedCaseIds.has(caseId)),
      unconfirmedCaseIds: canonicalReconciliationCaseIds.filter((caseId) => !confirmedCaseIds.has(caseId)),
    },
    baselineAcceptedCaseIds,
    waveAcceptedCaseIds,
    remainingWaveAcceptedCaseIds,
    acceptedAfterReconciliationCaseIds: conflictDecisions.updateCanonicalCaseIds,
    remainingWaveCanonicalConflictCaseIds,
    productDefectOpenCaseIds: conflictDecisions.productDefectOpenCaseIds,
    productRuleConfirmationRequiredCaseIds: conflictDecisions.productRuleConfirmationRequiredCaseIds,
    externalTerminalBlockedCaseIds: remainingWaveEvidence.blockedCaseIds,
    overlappingAcceptedCaseIds,
    baselineCompatibleCaseIds,
    canonicalReconciliationCaseIds,
    entries,
  };
  const document = {
    schemaVersion: '1.1.0' as const,
    collectionId: 'product-center-item-current-technical-status' as const,
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    status: runtimeAccepted === entries.length
      ? 'runtime-accepted' as const
      : 'partial-runtime-accepted' as const,
    ...semanticValue,
    fingerprint: createHash('sha256').update(JSON.stringify(semanticValue)).digest('hex'),
  };
  if (document.summary.total !== activeEntries.length
    || document.runtimeSources.baselineAccepted !== 4
    || document.runtimeSources.waveAccepted !== 36
    || document.runtimeSources.remainingWaveAccepted !== 54
    || document.runtimeSources.acceptedAfterReconciliation !== 9
    || document.runtimeSources.remainingWaveCanonicalConflict !== 10
    || document.runtimeSources.productDefectOpen !== 6
    || document.runtimeSources.productRuleConfirmationRequired !== 4
    || document.runtimeSources.externalTerminalBlocked !== 1
    || document.runtimeSources.overlap !== 0
    || document.summary.baselineCompatibility.accepted !== 89
    || document.summary.baselineCompatibility.canonicalReconciliationRequired !== 5) {
    throw new Error(
      `当前技术状态分母漂移：total=${document.summary.total};baseline=${document.runtimeSources.baselineAccepted};wave=${document.runtimeSources.waveAccepted};remainingAccepted=${document.runtimeSources.remainingWaveAccepted};reconciled=${document.runtimeSources.acceptedAfterReconciliation};remainingConflict=${document.runtimeSources.remainingWaveCanonicalConflict};defect=${document.runtimeSources.productDefectOpen};prd=${document.runtimeSources.productRuleConfirmationRequired};blocked=${document.runtimeSources.externalTerminalBlocked};overlap=${document.runtimeSources.overlap};compatible=${document.summary.baselineCompatibility.accepted};reconciliation=${document.summary.baselineCompatibility.canonicalReconciliationRequired}`,
    );
  }
  const jsonPath = path.join(canonicalRoot, 'product-center-item-current-technical-status.json');
  const markdownPath = path.join(canonicalRoot, 'product-center-item-current-technical-status.md');
  writeText(jsonPath, `${JSON.stringify(document, null, 2)}\n`);
  writeText(markdownPath, renderMarkdown(document));
  return { document, jsonPath, markdownPath };
}

function countStatus(
  entries: Array<{ currentStatus: CurrentTechnicalStatus }>,
  status: CurrentTechnicalStatus,
): number {
  return entries.filter((entry) => entry.currentStatus === status).length;
}

function assertUnique(values: readonly string[], message: string): void {
  if (new Set(values).size !== values.length) throw new Error(message);
}

function sameSet(left: readonly string[], right: readonly string[]): boolean {
  return [...left].sort().join(',') === [...right].sort().join(',');
}

function renderMarkdown(document: ReturnType<typeof buildProductCenterItemCurrentTechnicalStatus>['document']): string {
  const lines = [
    '# 商品中心商品当前技术闭环状态',
    '',
    `- 状态：${document.status}`,
    `- 活动用例：${document.summary.total}`,
    `- Runtime accepted：${document.summary.runtimeAccepted}`,
    `- 剩余：${document.summary.remaining}`,
    `- 当前 canonical 基线兼容闭环：${document.summary.baselineCompatibility.accepted}`,
    `- Canonical reconciliation 待处理：${document.summary.baselineCompatibility.canonicalReconciliationRequired}`,
    `- Capability mapping required：${document.summary.capabilityMappingRequired}`,
    `- Page observation required：${document.summary.pageObservationRequired}`,
    `- Canonical conflict required：${document.summary.canonicalConflictRequired}`,
    `- Product defect open：${document.summary.productDefectOpen}`,
    `- Product rule confirmation required：${document.summary.productRuleConfirmationRequired}`,
    `- External terminal blocked：${document.summary.externalTerminalBlocked}`,
    `- Acceptance 来源：既有=${document.runtimeSources.baselineAccepted}；P0四波=${document.runtimeSources.waveAccepted}；剩余W1-W8=${document.runtimeSources.remainingWaveAccepted}（其中 reconciliation=${document.runtimeSources.acceptedAfterReconciliation}）；重叠=${document.runtimeSources.overlap}`,
    `- 剩余 P0 证据：observed accepted=${document.remainingWaveEvidence.accepted}；observed canonical-conflict=${document.remainingWaveEvidence.canonicalConflict}；reconciled=${document.remainingWaveEvidence.acceptedAfterReconciliation}；unresolved=${document.remainingWaveEvidence.unresolvedCanonicalConflict}；blocked=${document.remainingWaveEvidence.blocked}；harness-error=${document.remainingWaveEvidence.harnessError}`,
    '',
    '## 优先级',
    '',
    ...Object.entries(document.summary.byPriority).map(([priority, summary]) =>
      `- ${priority}：总数=${summary.total}；运行覆盖=${summary.runtimeAccepted}；基线兼容=${summary.baselineCompatible}；待 reconciliation=${summary.canonicalReconciliationRequired}；剩余=${summary.remaining}`),
    '',
    '## Canonical Reconciliation',
    '',
    ...document.canonicalReconciliationCaseIds.map((caseId) => {
      const entry = document.entries.find((item) => item.caseId === caseId);
      return `- ${caseId} [${entry?.priority}] product-rule-confirmed=${entry?.productRuleConfirmed ?? false}：${entry?.title}`;
    }),
    '',
    '## 剩余用例',
    '',
    ...document.entries
      .filter((entry) => entry.currentStatus !== 'runtime-accepted')
      .map((entry) => `- ${entry.caseId} [${entry.priority}] ${entry.currentStatus}：${entry.title}`),
  ];
  return `${lines.join('\n')}\n`;
}

function readJson<T>(filePath: string): T {
  return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T;
}

function writeText(filePath: string, content: string): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.${process.pid}.tmp`;
  fs.writeFileSync(temporaryPath, content, 'utf8');
  fs.renameSync(temporaryPath, filePath);
}

function sha256File(filePath: string): string {
  return createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function hashValue(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function relativePath(rootPath: string, filePath: string): string {
  return path.relative(rootPath, filePath).replace(/\\/g, '/');
}

if (require.main === module) {
  try {
    const { document, jsonPath } = buildProductCenterItemCurrentTechnicalStatus();
    process.stdout.write(
      `商品当前技术闭环视图已生成：${jsonPath}\n运行覆盖=${document.summary.runtimeAccepted}/${document.summary.total}；基线兼容=${document.summary.baselineCompatibility.accepted}；待reconciliation=${document.summary.baselineCompatibility.canonicalReconciliationRequired}；剩余=${document.summary.remaining}\n`,
    );
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
