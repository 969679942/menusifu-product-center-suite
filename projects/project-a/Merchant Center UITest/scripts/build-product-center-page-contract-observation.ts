import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { redactAcceptanceDiagnostic } from '../utils/acceptance/redaction';
import { readProductCenterGoldContractSummary } from '../utils/product-center-gold-contract';
import {
  deriveProductCenterRuntimeEvidenceForCurrentRoutes,
  type ProductCenterBrowserContractSignals,
  type ProductCenterReleaseEvidence,
} from '../utils/product-center-release-evidence';
import {
  assertProductCenterPageContractBaselineEligible,
  assertProductCenterPageContractBaselinePromotionEligible,
  buildProductCenterPageContractImpact,
  buildProductCenterPageContractObservation,
  diffProductCenterPageContractObservations,
  type ProductCenterPageContractAcceptanceInput,
  type ProductCenterPageContractEvidenceInput,
  type ProductCenterPageContractObservation,
  type ProductCenterPageContractRecipeInput,
} from '../utils/product-center-page-contract-observation';

type RecipeArtifact = {
  fingerprint: string;
  recipes: ProductCenterPageContractRecipeInput[];
};

type EvidenceArtifact = {
  fingerprint: string;
  runId?: string;
  entries: ProductCenterPageContractEvidenceInput[];
};

type CurrentReleaseProbeArtifact = {
  sourceRunId: string;
  evidenceRunId: string;
  release: ProductCenterReleaseEvidence;
  routes: Array<{
    route: string;
    release: ProductCenterReleaseEvidence;
    browserSignals: ProductCenterBrowserContractSignals;
  }>;
};

function main(): void {
  const projectRoot = path.resolve(__dirname, '..');
  const argumentsList = process.argv.slice(2);
  const initializeBaseline = argumentsList.includes('--initialize-baseline');
  const promoteBaseline = argumentsList.includes('--promote-baseline');
  const approvedAddedCaseIds = argumentsList
    .filter((argument) => argument.startsWith('--approved-case-id='))
    .map((argument) => argument.slice('--approved-case-id='.length))
    .filter(Boolean);
  const approvedCapabilityChangedCaseIds = argumentsList
    .filter((argument) => argument.startsWith('--approved-capability-case-id='))
    .map((argument) => argument.slice('--approved-capability-case-id='.length))
    .filter(Boolean);
  const approvedFindings = argumentsList
    .filter((argument) => argument.startsWith('--approved-finding='))
    .map((argument) => parseApprovedFinding(argument.slice('--approved-finding='.length)));
  const approvedSourceMappingCaseIds = argumentsList
    .filter((argument) => argument.startsWith('--approved-source-mapping-case-id='))
    .map((argument) => argument.slice('--approved-source-mapping-case-id='.length))
    .filter(Boolean);
  const expectedGoldCaseCount = readProductCenterGoldContractSummary(projectRoot).caseCount;
  if (initializeBaseline && promoteBaseline) {
    throw new Error('页面合同 baseline 初始化与晋级参数不能同时使用');
  }
  const recipesPath = path.join(
    projectRoot,
    'contracts/product-center/recipes/product-center-test-plan-gold-set-recipes.json',
  );
  const mainRecipesPath = path.join(
    projectRoot,
    'contracts/product-center/recipes/product-center-pilot-recipes.json',
  );
  const evidencePaths = [
    path.join(
    projectRoot,
    'output/recipes/product-center-test-plan-gold-set-evidence.json',
    ),
    path.join(
      projectRoot,
      'output/recipes/product-center-item-combo-audit-probe-evidence.json',
    ),
  ].filter((filePath) => fs.existsSync(filePath));
  const currentReleaseProbePath = path.join(
    projectRoot,
    'output/page-contract/product-center-current-release-probe.json',
  );
  const acceptancePath = path.join(
    projectRoot,
    'output/recipes/product-center-test-plan-gold-set-acceptance.json',
  );
  const baselinePath = path.join(
    projectRoot,
    'contracts/product-center/snapshots/product-center-page-contract-baseline.json',
  );
  const outputDirectory = path.join(projectRoot, 'output/page-contract');
  const observationPath = path.join(outputDirectory, 'product-center-page-contract-observation.json');
  const diffPath = path.join(outputDirectory, 'product-center-page-contract-diff.json');
  const impactPath = path.join(outputDirectory, 'product-center-page-contract-impact.json');

  const recipes = readJson<RecipeArtifact>(recipesPath);
  const mainRecipes = readJson<RecipeArtifact>(mainRecipesPath);
  const evidence = mergeEvidenceArtifacts(evidencePaths.map((filePath) => (
    readJson<EvidenceArtifact>(filePath)
  )));
  const acceptance = readJson<ProductCenterPageContractAcceptanceInput>(acceptancePath);
  const currentReleaseProbe = readJson<CurrentReleaseProbeArtifact>(currentReleaseProbePath);
  if (evidence.runId !== currentReleaseProbe.evidenceRunId) {
    throw new Error('页面合同 evidence 与当前版本 Probe 引用的 evidence runId 不一致');
  }
  assertCurrentRouteProbeCoverage(recipes.recipes, currentReleaseProbe.routes);
  const derivedEvidence = deriveProductCenterRuntimeEvidenceForCurrentRoutes({
    artifact: evidence,
    currentRelease: currentReleaseProbe.release,
    routes: currentReleaseProbe.routes,
  });
  const observation = buildProductCenterPageContractObservation({
    recipes: recipes.recipes,
    evidenceEntries: derivedEvidence.entries,
    acceptance,
    recipeFingerprint: recipes.fingerprint,
    evidenceFingerprint: evidence.fingerprint,
    releaseGate: {
      current: currentReleaseProbe.release,
      maxAgeMs: readProbeEvidenceMaxAgeMs(projectRoot),
    },
  });
  writeJsonAtomic(observationPath, observation);

  if (initializeBaseline) {
    if (fs.existsSync(baselinePath)) {
      throw new Error('页面合同 baseline 已存在，禁止自动覆盖');
    }
    assertProductCenterPageContractBaselineEligible(observation, acceptance, expectedGoldCaseCount);
    writeJsonAtomic(baselinePath, observation);
  }
  if (!fs.existsSync(baselinePath)) {
    throw new Error('页面合同 baseline 不存在；首次需显式使用 --initialize-baseline');
  }

  let baseline = readJson<ProductCenterPageContractObservation>(baselinePath);
  let diff = diffProductCenterPageContractObservations(baseline, observation);
  if (promoteBaseline) {
    const approvedSourceMappings = buildApprovedSourceMappings(
      projectRoot,
      approvedSourceMappingCaseIds,
    );
    assertProductCenterPageContractBaselinePromotionEligible({
      baseline,
      current: observation,
      diff,
      acceptance,
      approvedAddedCaseIds,
      approvedCapabilityChangedCaseIds,
      approvedFindings,
      approvedSourceMappings,
      expectedCaseCount: expectedGoldCaseCount,
    });
    writeJsonAtomic(baselinePath, observation);
    baseline = observation;
    diff = diffProductCenterPageContractObservations(baseline, observation);
  }
  const generatedAt = new Date().toISOString();
  const diffArtifact = {
    ...diff,
    generatedAt,
    pipelineRunId: process.env.PC_QUALITY_PIPELINE_RUN_ID,
    probeRunId: currentReleaseProbe.sourceRunId,
    evidenceRunId: currentReleaseProbe.evidenceRunId,
  };
  const impact = buildProductCenterPageContractImpact(
    diff,
    mergeRecipeReferences([...mainRecipes.recipes, ...recipes.recipes]),
  );
  writeJsonAtomic(diffPath, diffArtifact);
  writeJsonAtomic(impactPath, {
    ...impact,
    generatedAt,
    pipelineRunId: process.env.PC_QUALITY_PIPELINE_RUN_ID,
    probeRunId: currentReleaseProbe.sourceRunId,
  });

  process.stdout.write(
    `页面合同观测：cases=${observation.summary.totalCases};findings=${observation.summary.blockingFindings};diff=${diff.summary.findings};impacted=${impact.impactedCases.length}\n`,
  );
  if (diff.status === 'review-required') process.exitCode = 1;
}

function mergeEvidenceArtifacts(artifacts: readonly EvidenceArtifact[]): EvidenceArtifact {
  const runIds = artifacts
    .map((artifact) => artifact.runId)
    .filter((value): value is string => typeof value === 'string' && value.length > 0);
  if (runIds.length !== artifacts.length) throw new Error('页面合同 evidence 缺少 runId');
  const entries = artifacts.flatMap((artifact) => artifact.entries);
  return {
    fingerprint: createHash('sha256').update(JSON.stringify(entries)).digest('hex'),
    runId: runIds.join('+'),
    entries,
  };
}

function assertCurrentRouteProbeCoverage(
  recipes: readonly ProductCenterPageContractRecipeInput[],
  routes: readonly { route: string }[],
): void {
  const observedRoutes = new Set(routes.map((entry) => entry.route));
  const missingRoutes = [...new Set(recipes.map((recipe) => recipe.route))]
    .filter((route) => !observedRoutes.has(route))
    .sort();
  if (missingRoutes.length > 0) {
    throw new Error(`当前版本路由 Probe 缺少 Gold 路由：${missingRoutes.join(',')}`);
  }
}

function mergeRecipeReferences(
  recipes: readonly ProductCenterPageContractRecipeInput[],
): ProductCenterPageContractRecipeInput[] {
  const byCaseId = new Map<string, ProductCenterPageContractRecipeInput>();
  for (const recipe of recipes) {
    const current = byCaseId.get(recipe.caseId);
    byCaseId.set(recipe.caseId, current
      ? {
        ...current,
        sourceIds: [...new Set([...current.sourceIds, ...recipe.sourceIds])].sort(),
      }
      : recipe);
  }
  return [...byCaseId.values()].sort((left, right) => left.caseId.localeCompare(right.caseId));
}

function readJson<T>(filePath: string): T {
  return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T;
}

function writeJsonAtomic(filePath: string, value: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.tmp`;
  fs.writeFileSync(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  fs.renameSync(temporaryPath, filePath);
}

function positiveDurationMs(raw: string | undefined, fallback: number): number {
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) throw new Error('证据新鲜度窗口必须为正数');
  return value;
}

function readProbeEvidenceMaxAgeMs(projectRoot: string): number {
  const policy = readJson<{ evidenceMaxAgeMs?: number }>(path.join(
    projectRoot,
    'contracts/product-center/drift/product-center-probe-policy.json',
  ));
  return positiveDurationMs(
    process.env.PC_PAGE_CONTRACT_EVIDENCE_MAX_AGE_MS,
    Number(policy.evidenceMaxAgeMs),
  );
}

function parseApprovedFinding(value: string): {
  code: import('../utils/product-center-page-contract-observation').ProductCenterPageContractFindingCode;
  caseId: string;
} {
  const separator = value.indexOf(':');
  if (separator <= 0 || separator === value.length - 1) {
    throw new Error('--approved-finding 格式必须为 CODE:caseId');
  }
  return {
    code: value.slice(0, separator) as import('../utils/product-center-page-contract-observation').ProductCenterPageContractFindingCode,
    caseId: value.slice(separator + 1),
  };
}

function buildApprovedSourceMappings(
  projectRoot: string,
  caseIds: readonly string[],
): Array<{ caseId: string; approvedSourceIds: string[]; approvalRef: string }> {
  if (caseIds.length === 0) return [];
  const reviewPath = path.join(
    projectRoot,
    'contracts/product-center/reviews/menu-publish-business-rule-change.json',
  );
  const review = readJson<{
    id?: string;
    status?: string;
    confirmedSourceRules?: Array<{ id?: string; status?: string }>;
  }>(reviewPath);
  if (review.status !== 'product-confirmed-change-request' || !review.id) {
    throw new Error('菜单来源映射缺少正式产品确认审批');
  }
  const approvedSourceIds = (review.confirmedSourceRules ?? [])
    .filter((entry) => entry.status === 'confirmed' && typeof entry.id === 'string')
    .map((entry) => entry.id as string)
    .sort();
  if (approvedSourceIds.length === 0) throw new Error('菜单来源映射审批未包含确认规则');
  return caseIds.map((caseId) => {
    if (caseId !== 'delete:menu') throw new Error(`来源映射审批不覆盖用例：${caseId}`);
    return { caseId, approvedSourceIds, approvalRef: review.id! };
  });
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    process.stderr.write(`${redactAcceptanceDiagnostic(String(error))}\n`);
    process.exitCode = 1;
  }
}
