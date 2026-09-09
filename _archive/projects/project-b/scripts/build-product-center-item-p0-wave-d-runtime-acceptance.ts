import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type {
  ProductCenterItemP0WaveRecipeCollection,
  ProductCenterItemP0WaveRuntimeAcceptanceDocument,
} from '../utils/product-center-item-p0-technical-binding-batch';

const runId = 'AUTO_AUDIT_P0_WAVE_D_20260731_14';
const waveId = 'wave-d-edit-and-rules' as const;
const acceptanceId = 'product-center-item-p0-wave-d-runtime-acceptance';
const orchestratorSpecPath = 'tests/generated/product-center-item-p0-wave-d.generated.spec.ts';
const caseIds = [
  'TC-ITEM-STD-031',
  'TC-ITEM-STD-092',
  'TC-ITEM-STD-096',
  'TC-ITEM-STD-011',
  'TC-ITEM-STD-012',
  'TC-ITEM-STD-013',
  'TC-ITEM-STD-014',
  'TC-ITEM-STD-007',
] as const;

type RuntimeReport = {
  runId: string;
  waveId: string;
  status: string;
  caseIds: string[];
  acceptedCaseIds: string[];
  mutationIntents: Array<{ phase: string }>;
  cleanupEvidence: {
    apiItemResidue: Record<string, number>;
    apiCategoryResidue: Record<string, number>;
    apiBrandImageResidue: Record<string, number>;
    uiItemResidue: Record<string, number>;
    uiCategoryResidue: Record<string, number>;
    uiBrandImageResidue: Record<string, number>;
    ledgerEntries: number;
    residueVerified: number;
    incompleteLedgerEntries: number;
    cleanupDiagnostic?: string;
  };
  executionDiagnostic?: string;
};

type CanonicalPlan = { cases: Array<{ canonicalId: string; title: string }> };
type PilotPlan = { cases: Array<{ id: string; title: string }> };

export function buildProductCenterItemP0WaveDRuntimeArtifacts(options: {
  projectRoot?: string;
} = {}): {
  acceptance: ProductCenterItemP0WaveRuntimeAcceptanceDocument;
  recipeCollection: ProductCenterItemP0WaveRecipeCollection;
  acceptancePath: string;
  recipePath: string;
} {
  const projectRoot = path.resolve(options.projectRoot ?? path.resolve(__dirname, '..'));
  const sourcePath = path.join(projectRoot, `output/audit/product-center-item-p0-wave-d-${runId}.json`);
  const sourceText = fs.readFileSync(sourcePath, 'utf8');
  const report = JSON.parse(sourceText) as RuntimeReport;
  const canonical = readJson<CanonicalPlan>(path.join(
    projectRoot,
    'contracts/product-center/test-cases/canonical/product-center-item-canonical-release.json',
  ));
  const pilot = readJson<PilotPlan>(path.join(
    projectRoot,
    'contracts/product-center/test-cases/canonical/product-center-item-xmind-rebuild-pilot.json',
  ));
  assertAcceptedReport(report);
  const titleById = new Map<string, { title: string; sourceId: string }>();
  for (const item of pilot.cases) {
    titleById.set(item.id, {
      title: item.title,
      sourceId: `canonical:product-center-item-xmind-rebuild-pilot.json#${item.id}`,
    });
  }
  for (const item of canonical.cases) {
    titleById.set(item.canonicalId, {
      title: item.title,
      sourceId: `canonical:product-center-item-canonical-release.json#${item.canonicalId}`,
    });
  }
  const sourceSha256 = createHash('sha256').update(sourceText).digest('hex');
  const acceptance: ProductCenterItemP0WaveRuntimeAcceptanceDocument = {
    schemaVersion: '1.0.0',
    acceptanceId,
    waveId,
    status: 'accepted',
    executionMode: 'wave-shared-chain',
    runId,
    sourceArtifact: {
      workspaceRole: 'main-workspace-live-audit',
      path: path.relative(projectRoot, sourcePath).replaceAll('\\', '/'),
      sha256: sourceSha256,
    },
    orchestratorSpecPath,
    caseIds: [...caseIds],
    acceptedCaseIds: [...caseIds],
    evidenceScope: { sharedRunCount: 1, caseCount: caseIds.length, caseLevelRunsClaimed: 0 },
    mutationIntentClosure: {
      total: report.mutationIntents.length,
      cleanupComplete: report.mutationIntents.filter((intent) => intent.phase === 'cleanup-complete').length,
      incomplete: 0,
    },
    executionLedger: {
      entries: report.cleanupEvidence.ledgerEntries,
      residueVerified: report.cleanupEvidence.residueVerified,
      incomplete: 0,
    },
    cleanupEvidence: {
      apiItemResidue: 0,
      apiCategoryResidue: 0,
      apiBrandImageResidue: 0,
      uiItemResidue: 0,
      uiCategoryResidue: 0,
      uiBrandImageResidue: 0,
    },
    security: {
      credentialsPersisted: false,
      authorizationArtifactsPersisted: false,
      storageStatePersisted: false,
    },
  };
  const recipeCollection: ProductCenterItemP0WaveRecipeCollection = {
    schemaVersion: '1.0.0',
    collectionId: 'product-center-item-p0-wave-d-recipes',
    waveId,
    executionMode: 'wave-shared-chain',
    caseLevelExecutionAllowed: false,
    runtimeAcceptanceId: acceptanceId,
    orchestratorSpecPath,
    recipes: caseIds.map((caseId) => {
      const canonicalCase = titleById.get(caseId);
      if (!canonicalCase) throw new Error(`Wave D canonical 缺少用例：${caseId}`);
      return {
        schemaVersion: '1.0.0',
        id: `product-center:item-p0-wave-d:${caseId}`,
        caseId,
        title: canonicalCase.title,
        tags: ['@recipe', '@generated', '@item', '@standard', priorityTag(caseId), '@wave-d'],
        route: '/pp/brand/list',
        action: recipeAction(caseId),
        traceabilityId: `trace:sop:${caseId}`,
        sourceIds: [
          canonicalCase.sourceId,
          `runtime-acceptance:${acceptanceId}#${caseId}`,
        ],
        coverageIds: [`wave:${waveId}`],
        generationAllowed: true,
        executionPolicy: {
          mode: 'wave-shared-chain',
          caseLevelExecutionAllowed: false,
          waveId,
          orchestratorSpecPath,
          runtimeAcceptanceId: acceptanceId,
        },
        capabilities: [{
          id: 'navigation.sidebar.open',
          saveAs: 'navigation',
          input: { targetPath: '/pp/brand/list' },
        }],
        assertions: [],
      };
    }),
  };
  const acceptancePath = path.join(
    projectRoot,
    'contracts/product-center/reviews/product-center-item-p0-wave-d-runtime-acceptance.json',
  );
  const recipePath = path.join(
    projectRoot,
    'contracts/product-center/recipes/product-center-item-p0-wave-d-recipes.json',
  );
  writeJson(acceptancePath, acceptance);
  writeJson(recipePath, recipeCollection);
  return { acceptance, recipeCollection, acceptancePath, recipePath };
}

function assertAcceptedReport(report: RuntimeReport): void {
  const residueMaps = [
    report.cleanupEvidence.apiItemResidue,
    report.cleanupEvidence.apiCategoryResidue,
    report.cleanupEvidence.apiBrandImageResidue,
    report.cleanupEvidence.uiItemResidue,
    report.cleanupEvidence.uiCategoryResidue,
    report.cleanupEvidence.uiBrandImageResidue,
  ];
  if (report.runId !== runId
    || report.waveId !== waveId
    || report.status !== 'accepted'
    || !sameSet(report.caseIds, caseIds)
    || !sameSet(report.acceptedCaseIds, caseIds)
    || report.executionDiagnostic
    || report.cleanupEvidence.cleanupDiagnostic) {
    throw new Error('Wave D runtime 报告未满足 8 条共享整波验收条件');
  }
  if (report.mutationIntents.some((intent) => intent.phase !== 'cleanup-complete')
    || report.cleanupEvidence.ledgerEntries !== report.cleanupEvidence.residueVerified
    || report.cleanupEvidence.incompleteLedgerEntries !== 0
    || residueMaps.some((entries) => Object.values(entries).some((count) => count !== 0))) {
    throw new Error('Wave D runtime 报告未完成 Intent、Ledger 或 UI/API 零残留闭环');
  }
}

function priorityTag(caseId: string): string {
  return caseId === 'TC-ITEM-STD-007' ? '@p1' : '@p0';
}

function recipeAction(caseId: string): 'read' | 'edit' | 'negative' {
  if (caseId === 'TC-ITEM-STD-007' || caseId === 'TC-ITEM-STD-092') return 'read';
  if (caseId.startsWith('TC-ITEM-STD-01')) return 'negative';
  return 'edit';
}

function sameSet(left: readonly string[], right: readonly string[]): boolean {
  return [...left].sort().join(',') === [...right].sort().join(',');
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

if (require.main === module) {
  try {
    const artifacts = buildProductCenterItemP0WaveDRuntimeArtifacts();
    process.stdout.write(`Wave D runtime acceptance 已生成：${artifacts.acceptancePath}\n`);
    process.stdout.write(`Wave D Recipe 已生成：${artifacts.recipePath}\n`);
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
