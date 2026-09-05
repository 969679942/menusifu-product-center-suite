import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type {
  ProductCenterItemP0WaveRecipeCollection,
  ProductCenterItemP0WaveRuntimeAcceptanceDocument,
} from '../utils/product-center-item-p0-technical-binding-batch';

const runId = 'AUTO_AUDIT_P0_WAVE_B_20260730_09';
const waveId = 'wave-b-list' as const;
const acceptanceId = 'product-center-item-p0-wave-b-runtime-acceptance';
const orchestratorSpecPath = 'tests/generated/product-center-item-p0-wave-b.generated.spec.ts';
const caseIds = [
  'TC-ITEM-PKG-047',
  'TC-ITEM-STD-069',
  'TC-ITEM-STD-028',
  'TC-ITEM-STD-029',
  'TC-ITEM-ADD-023',
  'TC-ITEM-ADD-040',
  'TC-ITEM-STD-066',
  'TC-ITEM-ADD-042',
  'TC-ITEM-ADD-043',
  'TC-ITEM-STD-068',
  'TC-ITEM-STD-070',
  'TC-ITEM-STD-075',
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
    uiItemResidue: Record<string, number>;
    ledgerEntries: number;
    residueVerified: number;
    incompleteLedgerEntries: number;
    cleanupDiagnostic?: string;
  };
  executionDiagnostic?: string;
};

type CanonicalPlan = {
  cases: Array<{ id: string; title: string }>;
};

export function buildProductCenterItemP0WaveBRuntimeArtifacts(options: {
  projectRoot?: string;
} = {}): {
  acceptance: ProductCenterItemP0WaveRuntimeAcceptanceDocument;
  recipeCollection: ProductCenterItemP0WaveRecipeCollection;
  acceptancePath: string;
  recipePath: string;
} {
  const projectRoot = path.resolve(options.projectRoot ?? path.resolve(__dirname, '..'));
  const sourcePath = path.join(projectRoot, `output/audit/product-center-item-p0-wave-b-${runId}.json`);
  const sourceText = fs.readFileSync(sourcePath, 'utf8');
  const report = JSON.parse(sourceText) as RuntimeReport;
  const canonical = readJson<CanonicalPlan>(path.join(
    projectRoot,
    'contracts/product-center/test-cases/canonical/product-center-item-xmind-rebuild-pilot.json',
  ));
  assertAcceptedReport(report);
  const titleById = new Map(canonical.cases.map((item) => [item.id, item.title]));
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
      uiItemResidue: 0,
    },
    security: {
      credentialsPersisted: false,
      authorizationArtifactsPersisted: false,
      storageStatePersisted: false,
    },
  };
  const recipeCollection: ProductCenterItemP0WaveRecipeCollection = {
    schemaVersion: '1.0.0',
    collectionId: 'product-center-item-p0-wave-b-recipes',
    waveId,
    executionMode: 'wave-shared-chain',
    caseLevelExecutionAllowed: false,
    runtimeAcceptanceId: acceptanceId,
    orchestratorSpecPath,
    recipes: caseIds.map((caseId) => {
      const title = titleById.get(caseId);
      if (!title) throw new Error(`Wave B canonical 缺少用例：${caseId}`);
      return {
        schemaVersion: '1.0.0',
        id: `product-center:item-p0-wave-b:${caseId}`,
        caseId,
        title,
        tags: ['@recipe', '@generated', '@item', productTag(caseId), '@p0', '@wave-b'],
        route: '/pp/brand/list',
        action: recipeAction(caseId),
        traceabilityId: `trace:sop:${caseId}`,
        sourceIds: [
          `canonical:product-center-item-xmind-rebuild-pilot.json#${caseId}`,
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
    'contracts/product-center/reviews/product-center-item-p0-wave-b-runtime-acceptance.json',
  );
  const recipePath = path.join(
    projectRoot,
    'contracts/product-center/recipes/product-center-item-p0-wave-b-recipes.json',
  );
  writeJson(acceptancePath, acceptance);
  writeJson(recipePath, recipeCollection);
  return { acceptance, recipeCollection, acceptancePath, recipePath };
}

function assertAcceptedReport(report: RuntimeReport): void {
  if (report.runId !== runId
    || report.waveId !== waveId
    || report.status !== 'accepted'
    || !sameSet(report.caseIds, caseIds)
    || !sameSet(report.acceptedCaseIds, caseIds)
    || report.executionDiagnostic
    || report.cleanupEvidence.cleanupDiagnostic) {
    throw new Error('Wave B runtime 报告未满足 12 条共享整波验收条件');
  }
  if (report.mutationIntents.some((intent) => intent.phase !== 'cleanup-complete')
    || report.cleanupEvidence.ledgerEntries !== report.cleanupEvidence.residueVerified
    || report.cleanupEvidence.incompleteLedgerEntries !== 0
    || Object.values(report.cleanupEvidence.apiItemResidue).some((count) => count !== 0)
    || Object.values(report.cleanupEvidence.uiItemResidue).some((count) => count !== 0)
    || Object.keys(report.cleanupEvidence.apiItemResidue).length !== Object.keys(report.cleanupEvidence.uiItemResidue).length) {
    throw new Error('Wave B runtime 报告未完成 Intent、Ledger 或 UI/API 零残留闭环');
  }
}

function productTag(caseId: string): string {
  if (caseId.startsWith('TC-ITEM-PKG-')) return '@combo';
  if (caseId.startsWith('TC-ITEM-ADD-')) return '@side';
  return '@standard';
}

function recipeAction(caseId: string): 'read' | 'edit' | 'delete' | 'negative' | 'boundary' {
  if (['TC-ITEM-STD-068'].includes(caseId)) return 'delete';
  if (['TC-ITEM-STD-069', 'TC-ITEM-STD-070'].includes(caseId)) return 'negative';
  if (['TC-ITEM-STD-066', 'TC-ITEM-ADD-042', 'TC-ITEM-ADD-043'].includes(caseId)) return 'edit';
  if (caseId === 'TC-ITEM-STD-075') return 'boundary';
  return 'read';
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
    const artifacts = buildProductCenterItemP0WaveBRuntimeArtifacts();
    process.stdout.write(`Wave B runtime acceptance 已生成：${artifacts.acceptancePath}\n`);
    process.stdout.write(`Wave B Recipe 已生成：${artifacts.recipePath}\n`);
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
