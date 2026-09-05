import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

type Readiness =
  | 'ready-existing-capability'
  | 'adapter-required'
  | 'controlled-fixture-required'
  | 'rule-evidence-required';

type FastLaneGroup = {
  groupId: string;
  templateKey: string;
  lane: string;
  riskLevel: string;
  productType: string;
  scenarioFamily: string;
  operation: string;
  caseIds: string[];
};

type CanonicalCase = {
  id: string;
  title: string;
  preconditions: string[];
  actions: string[];
  expectedResults: string[];
  source: string;
};

const firstBatchCaseIds = new Set([
  'TC-ITEM-STD-030',
  'TC-ITEM-ADD-041',
  'TC-ITEM-ADD-002',
  'TC-ITEM-PKG-048',
  'TC-ITEM-UI-004',
  'TC-ITEM-UI-005',
  'TC-ITEM-UI-006',
  'TC-ITEM-UI-007',
  'TC-ITEM-UI-008',
]);

const secondBatchCaseIds = new Set([
  'TC-ITEM-STD-019',
  'TC-ITEM-STD-084',
  'TC-ITEM-STD-085',
  'TC-ITEM-STD-086',
  'TC-ITEM-ADD-025',
  'TC-ITEM-ADD-007',
  'TC-ITEM-ADD-009',
  'TC-ITEM-ADD-022',
  'TC-ITEM-ADD-011',
  'TC-ITEM-ADD-049',
  'TC-ITEM-ADD-038',
]);

const controlledFixtureCaseIds = new Set([
  'TC-ITEM-STD-025',
  'TC-ITEM-STD-026',
  'TC-ITEM-STD-027',
  'TC-ITEM-ADD-033',
  'TC-ITEM-ADD-039',
  'TC-ITEM-ADD-018',
  'TC-ITEM-ADD-019',
  'TC-ITEM-ADD-020',
  'TC-ITEM-ADD-021',
  'TC-ITEM-ADD-045',
  'TC-ITEM-PKG-036',
  'TC-ITEM-PKG-020',
  'TC-ITEM-PKG-042',
  'TC-ITEM-PKG-043',
  'TC-ITEM-UI-003',
]);

const ruleEvidenceCaseIds = new Set([
  'TC-ITEM-ADD-012',
  'TC-ITEM-ADD-013',
]);

const dependencyOverrides: Record<string, string[]> = {
  'TC-ITEM-UI-004': ['temporary-standard-item'],
  'TC-ITEM-UI-005': ['temporary-standard-item'],
  'TC-ITEM-UI-006': ['temporary-standard-item'],
  'TC-ITEM-STD-025': ['industry-library-single-spec-item'],
  'TC-ITEM-STD-026': ['industry-library-multi-spec-item', 'brand-image-library-category'],
  'TC-ITEM-STD-027': ['industry-library-three-spec-item'],
  'TC-ITEM-STD-086': ['temporary-flavor-group-with-three-options', 'temporary-standard-item'],
  'TC-ITEM-ADD-025': ['detail-image-file', 'description-label', 'statistics-label'],
  'TC-ITEM-ADD-033': ['temporary-side-item', 'temporary-add-on-group'],
  'TC-ITEM-ADD-018': ['two-description-labels'],
  'TC-ITEM-ADD-019': ['corner-mark'],
  'TC-ITEM-ADD-020': ['two-statistics-labels'],
  'TC-ITEM-ADD-021': ['ingredient', 'allergen', 'nutrition'],
  'TC-ITEM-ADD-039': ['brand-image-library-image'],
  'TC-ITEM-ADD-045': ['two-corner-marks'],
  'TC-ITEM-PKG-020': ['temporary-fixed-combo-group'],
  'TC-ITEM-PKG-036': ['temporary-fixed-combo-group', 'two-detail-images', 'two-description-labels', 'corner-mark', 'two-statistics-labels'],
  'TC-ITEM-PKG-042': ['temporary-fixed-combo-group'],
  'TC-ITEM-PKG-043': ['temporary-optional-combo-group'],
  'TC-ITEM-UI-003': ['temporary-standard-item-with-print-stall'],
};

export function buildProductCenterItemYellowY3ExecutionMatrix(options: {
  projectRoot?: string;
  generatedAt?: string;
} = {}) {
  const projectRoot = path.resolve(options.projectRoot ?? path.resolve(__dirname, '..'));
  const fastLanePath = path.join(
    projectRoot,
    'contracts/product-center/reviews/automation-fast-lane/product-center-item-automation-fast-lane.json',
  );
  const canonicalPath = path.join(
    projectRoot,
    'contracts/product-center/test-cases/canonical/product-center-item-xmind-rebuild-pilot.json',
  );
  const fastLane = readJson<{ automaticTechnicalPipeline: { groups: FastLaneGroup[] } }>(fastLanePath);
  const canonical = readJson<{ cases: CanonicalCase[] }>(canonicalPath);
  const canonicalById = new Map(canonical.cases.map((item) => [item.id, item]));
  const sourceGroups = fastLane.automaticTechnicalPipeline.groups
    .filter((group) => group.lane === 'yellow' && group.riskLevel === 'L2');
  const sourceCaseIds = sourceGroups.flatMap((group) => group.caseIds);
  if (sourceGroups.length !== 19 || sourceCaseIds.length !== 37 || new Set(sourceCaseIds).size !== 37) {
    throw new Error(`Y3 来源数量漂移：groups=${sourceGroups.length}, cases=${sourceCaseIds.length}`);
  }

  const cases = sourceGroups.flatMap((group) => group.caseIds.map((caseId) => {
    const canonicalCase = canonicalById.get(caseId);
    if (!canonicalCase) throw new Error(`Y3 canonical 用例缺失：${caseId}`);
    const readiness = resolveReadiness(caseId);
    return {
      caseId,
      groupId: group.groupId,
      title: canonicalCase.title,
      productType: group.productType,
      scenarioFamily: group.scenarioFamily,
      operation: group.operation,
      readiness,
      firstBatch: firstBatchCaseIds.has(caseId),
      secondBatch: secondBatchCaseIds.has(caseId),
      dependencyTypes: dependencyOverrides[caseId] ?? [],
      source: canonicalCase.source,
      evidencePolicy: {
        caseLevelEvidenceRequired: true,
        evidenceInheritanceAllowed: false,
        canonicalConflictAllowed: true,
      },
      sourceShape: {
        preconditions: canonicalCase.preconditions.length,
        actions: canonicalCase.actions.length,
        expectedResults: canonicalCase.expectedResults.length,
      },
    };
  }));
  const caseById = new Map(cases.map((item) => [item.caseId, item]));
  const groups = sourceGroups.map((group) => {
    const groupCases = group.caseIds.map((caseId) => caseById.get(caseId)!);
    const readiness = [...new Set(groupCases.map((item) => item.readiness))];
    return {
      groupId: group.groupId,
      templateKey: group.templateKey,
      productType: group.productType,
      scenarioFamily: group.scenarioFamily,
      operation: group.operation,
      caseIds: group.caseIds,
      readiness,
      setupReuseKey: setupReuseKey(group),
      firstBatch: groupCases.every((item) => item.firstBatch),
      secondBatchCaseIds: groupCases.filter((item) => item.secondBatch).map((item) => item.caseId),
      sharedSetupAllowed: true,
      caseLevelEvidenceRequired: group.caseIds.length,
    };
  });
  const counts = countByReadiness(cases);
  const semanticValue = {
    source: {
      fastLanePath: relativePath(projectRoot, fastLanePath),
      fastLaneSha256: sha256File(fastLanePath),
      canonicalPath: relativePath(projectRoot, canonicalPath),
      canonicalSha256: sha256File(canonicalPath),
    },
    summary: {
      groups: groups.length,
      cases: cases.length,
      firstBatchGroups: groups.filter((group) => group.firstBatch).length,
      firstBatchCases: cases.filter((item) => item.firstBatch).length,
      secondBatchGroups: groups.filter((group) => group.secondBatchCaseIds.length > 0).length,
      secondBatchCases: cases.filter((item) => item.secondBatch).length,
      ...counts,
      humanReviewRequired: 0,
    },
    policy: {
      executionMode: 'wave-shared-chain' as const,
      caseLevelRunsAllowed: false,
      caseLevelEvidenceRequired: true,
      evidenceInheritanceAllowed: false,
      sharedSetupReuseAllowed: true,
      nonIdempotentReplayRequiresReconciliation: true,
      cleanupInFinally: true,
      zeroResidueRequired: true,
    },
    firstBatch: {
      batchId: 'Y3-B1',
      caseIds: cases.filter((item) => item.firstBatch).map((item) => item.caseId),
      groupIds: groups.filter((group) => group.firstBatch).map((group) => group.groupId),
      executionOrder: ['list-filter-memory', 'create-page-actions', 'other-settings-capability', 'batch-menu'],
    },
    secondBatch: {
      batchId: 'Y3-B2',
      caseIds: cases.filter((item) => item.secondBatch).map((item) => item.caseId),
      groupIds: groups.filter((group) => group.secondBatchCaseIds.length > 0).map((group) => group.groupId),
      executionOrder: ['weighted-unit', 'multi-spec-order', 'attribute-removal', 'side-create', 'side-price', 'side-image', 'side-other-settings'],
    },
    groups,
    cases,
  };
  const artifact = {
    schemaVersion: '1.0.0' as const,
    collectionId: 'product-center-item-yellow-y3-execution-matrix' as const,
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    status: 'ready-for-batched-execution' as const,
    ...semanticValue,
    fingerprint: createHash('sha256').update(JSON.stringify(semanticValue)).digest('hex'),
  };
  const outputPath = path.join(
    projectRoot,
    'contracts/product-center/recipes/yellow-probes/product-center-item-yellow-y3-execution-matrix.json',
  );
  writeJson(outputPath, artifact);
  return { artifact, outputPath };
}

function resolveReadiness(caseId: string): Readiness {
  if (firstBatchCaseIds.has(caseId)) return 'ready-existing-capability';
  if (controlledFixtureCaseIds.has(caseId)) return 'controlled-fixture-required';
  if (ruleEvidenceCaseIds.has(caseId)) return 'rule-evidence-required';
  return 'adapter-required';
}

function countByReadiness(cases: Array<{ readiness: Readiness }>) {
  return {
    readyExistingCapability: cases.filter((item) => item.readiness === 'ready-existing-capability').length,
    adapterRequired: cases.filter((item) => item.readiness === 'adapter-required').length,
    controlledFixtureRequired: cases.filter((item) => item.readiness === 'controlled-fixture-required').length,
    ruleEvidenceRequired: cases.filter((item) => item.readiness === 'rule-evidence-required').length,
  };
}

function setupReuseKey(group: FastLaneGroup): string {
  if (group.groupId === 'AT04' || group.groupId === 'AT24' || group.groupId === 'AT38') return 'item-list-filter-memory';
  if (group.groupId === 'AT52') return 'item-create-action-surface';
  if (group.groupId === 'AT54') return 'item-list-batch-menu';
  if (group.groupId === 'AT32') return 'side-item-other-settings';
  return `${group.productType}|${group.scenarioFamily}|${group.operation}`;
}

function readJson<T>(filePath: string): T {
  return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T;
}

function writeJson(filePath: string, value: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.${process.pid}.tmp`;
  fs.writeFileSync(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  fs.renameSync(temporaryPath, filePath);
}

function sha256File(filePath: string): string {
  return createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function relativePath(rootPath: string, filePath: string): string {
  return path.relative(rootPath, filePath).replace(/\\/g, '/');
}

if (require.main === module) {
  try {
    const { artifact, outputPath } = buildProductCenterItemYellowY3ExecutionMatrix();
    process.stdout.write(`Y3 execution matrix 已生成：${outputPath}\n`);
    process.stdout.write(`groups=${artifact.summary.groups}, cases=${artifact.summary.cases}, firstBatch=${artifact.summary.firstBatchCases}\n`);
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
