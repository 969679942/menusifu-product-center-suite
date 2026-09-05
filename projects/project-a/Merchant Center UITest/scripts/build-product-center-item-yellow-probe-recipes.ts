import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { productCenterRecipeCapabilityContracts } from '../adapters/product-center/product-center-recipe-capabilities';
import type { AutomationRecipe, RecipeAction } from '../automation/recipe/automation-recipe';
import {
  recipeCollectionFingerprint,
  validateAutomationRecipe,
  type RecipeValidationIssue,
} from '../automation/recipe/recipe-validator';
import { scanGeneratedArtifacts } from '../utils/product-center-run-safety';

type FastLaneGroup = {
  groupId: string;
  lane: 'green' | 'yellow';
  riskLevel: 'L0' | 'L1' | 'L2' | 'L3';
  operation: string;
  caseIds: string[];
  representativeCaseId: string;
};

type FastLaneDocument = {
  fingerprint: string;
  automaticTechnicalPipeline: { groups: FastLaneGroup[] };
};

const waveByRisk = {
  L0: { waveId: 'Y1', name: 'Merchant Center 只读共享链探测', execution: 'executor-required' },
  L1: { waveId: 'Y2', name: 'Merchant Center 受控负向共享链探测', execution: 'executor-required' },
  L2: { waveId: 'Y3', name: 'Merchant Center mutation 共享链探测', execution: 'executor-required' },
  L3: { waveId: 'Y4', name: '跨渠道与终端共享链探测', execution: 'blocked-until-controlled-channel' },
} as const;

export function buildProductCenterItemYellowProbeRecipeArtifacts(options: {
  projectRoot?: string;
  outputRoot?: string;
  generatedAt?: string;
} = {}) {
  const projectRoot = path.resolve(options.projectRoot ?? path.resolve(__dirname, '..'));
  const outputRoot = path.resolve(options.outputRoot ?? projectRoot);
  const fastLanePath = path.join(
    projectRoot,
    'contracts/product-center/reviews/automation-fast-lane/product-center-item-automation-fast-lane.json',
  );
  const fastLane = readJson<FastLaneDocument>(fastLanePath);
  const yellowGroups = fastLane.automaticTechnicalPipeline.groups.filter((group) => group.lane === 'yellow');
  const recipes = yellowGroups.flatMap((group) => group.caseIds.map((caseId) => buildRecipe(group, caseId)));
  const compilation = recipes.map((recipe) => ({
    caseId: recipe.caseId,
    issues: validateAutomationRecipe(recipe, productCenterRecipeCapabilityContracts),
  }));
  const blocked = compilation.filter((item) => item.issues.length > 0);
  const waveSummary = Object.fromEntries((Object.keys(waveByRisk) as Array<keyof typeof waveByRisk>).map((risk) => {
    const wave = waveByRisk[risk];
    const selected = yellowGroups.filter((group) => group.riskLevel === risk);
    return [wave.waveId, {
      templates: selected.length,
      cases: selected.flatMap((group) => group.caseIds).length,
      riskLevel: risk,
    }];
  })) as Record<'Y1' | 'Y2' | 'Y3' | 'Y4', { templates: number; cases: number; riskLevel: string }>;
  const summary = {
    yellowCases: yellowGroups.flatMap((group) => group.caseIds).length,
    yellowTemplates: yellowGroups.length,
    caseRecipes: recipes.length,
    executorGroups: yellowGroups.length,
    structurallyCompiled: recipes.length - blocked.length,
    compileBlocked: blocked.length,
    humanReviewRequired: 0,
    waves: waveSummary,
  };
  if (summary.yellowCases !== 58
    || summary.yellowTemplates !== 34
    || waveSummary.Y1.templates !== 8
    || waveSummary.Y1.cases !== 14
    || waveSummary.Y2.templates !== 1
    || waveSummary.Y2.cases !== 1
    || waveSummary.Y3.templates !== 19
    || waveSummary.Y3.cases !== 37
    || waveSummary.Y4.templates !== 6
    || waveSummary.Y4.cases !== 6
    || blocked.length !== 0) {
    throw new Error(`黄色共享链 Recipe 分母或编译结果漂移：${JSON.stringify(summary)}`);
  }
  const semanticValue = {
    source: {
      fastLanePath: relativePath(projectRoot, fastLanePath),
      fastLaneFingerprint: fastLane.fingerprint,
      fastLaneSha256: sha256File(fastLanePath),
    },
    summary,
    recipes,
  };
  const collection = {
    schemaVersion: '1.0.0' as const,
    collectionId: 'product-center-item-yellow-shared-chain-probe-recipes' as const,
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    status: 'compiled-awaiting-wave-executors' as const,
    ...semanticValue,
    fingerprint: recipeCollectionFingerprint(recipes),
  };
  const report = {
    schemaVersion: '1.0.0' as const,
    collectionId: 'product-center-item-yellow-shared-chain-probe-compile-report' as const,
    generatedAt: collection.generatedAt,
    status: collection.status,
    sourceFingerprint: collection.fingerprint,
    compile: {
      total: compilation.length,
      passed: compilation.length - blocked.length,
      blocked: blocked.length,
      diagnostics: blocked.map((item) => ({ caseId: item.caseId, issues: item.issues })),
    },
    execution: {
      Y1: waveByRisk.L0.execution,
      Y2: waveByRisk.L1.execution,
      Y3: waveByRisk.L2.execution,
      Y4: waveByRisk.L3.execution,
    },
    policy: {
      representativeOnly: false as const,
      evidenceInheritanceAllowed: false as const,
      caseLevelEvidenceRequired: true as const,
      sharedChainSetupReuseAllowed: true as const,
      nonIdempotentReplayRequiresReconciliation: true as const,
      cleanupInFinally: true as const,
      runtimePromotionBeforeExecution: false as const,
    },
  };
  const manifest = {
    schemaVersion: '1.0.0' as const,
    collectionId: 'product-center-item-yellow-shared-chain-probe-manifest' as const,
    generatedAt: collection.generatedAt,
    sourceFingerprint: collection.fingerprint,
    executionPolicy: {
      mode: 'wave-shared-chain' as const,
      caseLevelExecutionAllowed: false as const,
      caseRecipes: recipes.length,
      executorGroups: yellowGroups.length,
      caseEvidenceRequired: summary.yellowCases,
      evidenceInheritanceAllowed: false as const,
    },
    waves: (Object.keys(waveByRisk) as Array<keyof typeof waveByRisk>).map((risk) => {
      const wave = waveByRisk[risk];
      const groups = yellowGroups.filter((group) => group.riskLevel === risk);
      return {
        waveId: wave.waveId,
        name: wave.name,
        riskLevel: risk,
        status: wave.execution,
        templateCount: groups.length,
        caseCount: groups.flatMap((group) => group.caseIds).length,
        caseIds: groups.flatMap((group) => group.caseIds),
        sharedChainAnchorCaseIds: groups.map((group) => group.representativeCaseId),
        groupIds: groups.map((group) => group.groupId),
        orchestratorSpecPath: `tests/generated/product-center-item-yellow-${wave.waveId.toLowerCase()}.generated.spec.ts`,
      };
    }),
  };
  const outputDirectory = path.join(outputRoot, 'contracts/product-center/recipes/yellow-probes');
  const recipePath = path.join(outputDirectory, 'product-center-item-yellow-representative-probe-recipes.json');
  const reportPath = path.join(outputDirectory, 'product-center-item-yellow-representative-probe-compile-report.json');
  const manifestPath = path.join(outputDirectory, 'product-center-item-yellow-representative-probe-manifest.json');
  writeJson(recipePath, collection);
  writeJson(reportPath, report);
  writeJson(manifestPath, manifest);
  const findings = scanGeneratedArtifacts(outputDirectory);
  if (findings.length > 0) throw new Error(`黄色代表 Recipe 产物安全扫描未通过：${findings.length}`);
  return { collection, report, manifest, recipePath, reportPath, manifestPath };
}

function buildRecipe(group: FastLaneGroup, caseId: string): AutomationRecipe {
  const wave = waveByRisk[group.riskLevel];
  const action = recipeAction(group.operation);
  return {
    schemaVersion: '1.0.0',
    id: `product-center:yellow-probe:${group.groupId.toLowerCase()}:${caseId.toLowerCase()}`,
    caseId,
    title: `黄色模板 ${group.groupId} 用例 ${caseId} 共享链受控探测`,
    tags: ['@recipe', '@generated', '@yellow-probe', `@${wave.waveId.toLowerCase()}`],
    route: '/pp/brand/list',
    action,
    traceabilityId: `trace:sop:yellow:${caseId}`,
    sourceIds: [
      `canonical:product-center-item-xmind-rebuild-pilot.json#${caseId}`,
      `fast-lane:${group.groupId}`,
    ],
    coverageIds: [`canonical:${caseId}`],
    generationAllowed: false,
    executionPolicy: {
      mode: 'wave-shared-chain',
      caseLevelExecutionAllowed: false,
      waveId: wave.waveId,
      orchestratorSpecPath: `tests/generated/product-center-item-yellow-${wave.waveId.toLowerCase()}.generated.spec.ts`,
      runtimeAcceptanceId: `product-center-item-yellow-${wave.waveId.toLowerCase()}-runtime`,
    },
    capabilities: [{
      id: 'navigation.sidebar.open',
      saveAs: 'navigation',
      input: { targetPath: '/pp/brand/list' },
    }],
    assertions: [{
      adapterId: 'yellowProbe.captureCaseEvidence',
      input: {
        groupId: group.groupId,
        caseId,
        sharedChainAnchorCaseId: group.representativeCaseId,
        evidenceInheritanceAllowed: false,
      },
    }],
  };
}

function recipeAction(operation: string): RecipeAction {
  if (operation === 'negative') return 'negative';
  if (operation === 'create') return 'create';
  if (operation === 'update') return 'edit';
  if (operation === 'delete') return 'delete';
  return 'read';
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
    const artifacts = buildProductCenterItemYellowProbeRecipeArtifacts();
    process.stdout.write(
      `黄色共享链 Recipe 已生成：${artifacts.recipePath}\n${artifacts.reportPath}\n${artifacts.manifestPath}\n编译=${artifacts.report.compile.passed}/${artifacts.report.compile.total}\n`,
    );
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
