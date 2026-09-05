import fs from 'node:fs';
import path from 'node:path';
import {
  buildProductCenterAcceptanceTrend,
  mergeProductCenterAcceptanceRuns,
  type ProductCenterAcceptanceRun,
} from './product-center-quality-operations';

type ImmutableArtifactInput = {
  rootDir: string;
  collectionId: string;
  runId: string;
  scope: string;
  artifactName: 'feedback' | 'evidence' | 'acceptance' | 'selection' | 'performance';
  value: unknown;
  publishLatest: boolean;
  latestRelativePath?: string;
};

export function writeProductCenterImmutableRunArtifact(input: ImmutableArtifactInput) {
  const collectionId = safeSegment(input.collectionId, 'collectionId');
  const runId = safeSegment(input.runId, 'runId');
  const runDirectory = path.join(
    input.rootDir,
    'output/recipes/runs',
    collectionId,
    runId,
  );
  const runArtifactPath = path.join(runDirectory, `${input.artifactName}.json`);
  const manifestPath = path.join(runDirectory, 'manifest.json');
  fs.mkdirSync(runDirectory, { recursive: true });
  writeJsonAtomic(runArtifactPath, input.value);

  const previous = fs.existsSync(manifestPath)
    ? JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as { createdAt?: string; artifacts?: string[] }
    : {};
  const manifest = {
    schemaVersion: '1.0.0',
    collectionId,
    runId,
    scope: input.scope,
    createdAt: previous.createdAt ?? new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    artifacts: [...new Set([...(previous.artifacts ?? []), `${input.artifactName}.json`])].sort(),
  };
  writeJsonAtomic(manifestPath, manifest);

  let latestPath: string | undefined;
  if (input.publishLatest) {
    latestPath = path.join(
      input.rootDir,
      input.latestRelativePath
        ?? `output/recipes/${collectionId}-${input.artifactName}.json`,
    );
    writeJsonAtomic(latestPath, input.value);
  }
  return { runArtifactPath, manifestPath, latestPath };
}

export function appendProductCenterAcceptanceRun(
  rootDir: string,
  current: ProductCenterAcceptanceRun,
): { historyPath: string; trendPath: string } {
  const historyPath = path.join(rootDir, 'output/recipes/product-center-acceptance-history.json');
  const trendPath = path.join(rootDir, 'output/recipes/product-center-acceptance-trend.json');
  const previous = fs.existsSync(historyPath)
    ? JSON.parse(fs.readFileSync(historyPath, 'utf8')) as { runs?: ProductCenterAcceptanceRun[] }
    : {};
  const runs = mergeProductCenterAcceptanceRuns(previous.runs ?? [], [current]);
  const trend = buildProductCenterAcceptanceTrend(runs);
  writeJsonAtomic(historyPath, { schemaVersion: '1.0.0', runs });
  writeJsonAtomic(trendPath, {
    schemaVersion: '1.0.0',
    generatedAt: new Date().toISOString(),
    ...trend,
  });
  return { historyPath, trendPath };
}

function safeSegment(value: string, label: string): string {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(value)) {
    throw new Error(`${label} 包含不安全字符`);
  }
  return value;
}

function writeJsonAtomic(filePath: string, value: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.tmp`;
  fs.writeFileSync(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  fs.renameSync(temporaryPath, filePath);
}
