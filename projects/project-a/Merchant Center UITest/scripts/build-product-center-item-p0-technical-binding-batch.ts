import fs from 'node:fs';
import path from 'node:path';
import {
  buildProductCenterItemP0TechnicalBindingBatch,
  renderProductCenterItemP0TechnicalBindingBatchMarkdown,
  type ProductCenterItemP0TechnicalBindingBatchDocument,
  type ProductCenterItemP0TechnicalEvidenceIntakeDocument,
  type ProductCenterItemP0TechnicalEvidenceRequestDocument,
  type ProductCenterItemP0WaveRecipeCollection,
  type ProductCenterItemP0WaveRuntimeAcceptanceDocument,
} from '../utils/product-center-item-p0-technical-binding-batch';
import type { ProductCenterItemTechnicalBindingGapDocument } from '../utils/product-center-item-technical-binding-gap';

export function buildProductCenterItemP0TechnicalBindingBatchArtifacts(options: {
  projectRoot?: string;
  generatedAt?: string;
} = {}): {
  batch: ProductCenterItemP0TechnicalBindingBatchDocument;
  evidenceRequest: ProductCenterItemP0TechnicalEvidenceRequestDocument;
  batchPath: string;
  markdownPath: string;
  evidenceRequestPath: string;
} {
  const projectRoot = path.resolve(options.projectRoot ?? path.resolve(__dirname, '..'));
  const root = path.join(projectRoot, 'contracts/product-center/test-cases/canonical');
  const canonical = readJson<any>(path.join(root, 'product-center-item-xmind-rebuild-pilot.json'));
  const fullReview = readJson<any>(path.join(root, 'product-center-item-full-review.json'));
  const technicalGap = readJson<ProductCenterItemTechnicalBindingGapDocument>(path.join(
    root,
    'product-center-item-technical-binding-gap.json',
  ));
  const evidenceIntake = readJson<ProductCenterItemP0TechnicalEvidenceIntakeDocument>(path.join(
    projectRoot,
    'contracts/product-center/reviews/product-center-item-p0-technical-evidence-intake.json',
  ));
  const runtimeAcceptances = ['a', 'b', 'c', 'd'].map((wave) => readJson<ProductCenterItemP0WaveRuntimeAcceptanceDocument>(path.join(
    projectRoot,
    `contracts/product-center/reviews/product-center-item-p0-wave-${wave}-runtime-acceptance.json`,
  )));
  const waveRecipeCollections = ['a', 'b', 'c', 'd'].map((wave) => readJson<ProductCenterItemP0WaveRecipeCollection>(path.join(
    projectRoot,
    `contracts/product-center/recipes/product-center-item-p0-wave-${wave}-recipes.json`,
  )));
  const { batch, evidenceRequest } = buildProductCenterItemP0TechnicalBindingBatch({
    canonical,
    fullReview,
    technicalGap,
    evidenceIntake,
    runtimeAcceptances,
    waveRecipeCollections,
    generatedAt: options.generatedAt,
  });
  assertExpectedBatchDenominator(batch);
  const batchPath = path.join(root, 'product-center-item-p0-technical-binding-batch.json');
  const markdownPath = path.join(root, 'product-center-item-p0-technical-binding-batch.md');
  const evidenceRequestPath = path.join(root, 'product-center-item-p0-technical-evidence-request.json');
  writeJson(batchPath, batch);
  writeText(markdownPath, renderProductCenterItemP0TechnicalBindingBatchMarkdown(batch));
  writeJson(evidenceRequestPath, evidenceRequest);
  return { batch, evidenceRequest, batchPath, markdownPath, evidenceRequestPath };
}

function assertExpectedBatchDenominator(batch: ProductCenterItemP0TechnicalBindingBatchDocument): void {
  if (batch.summary.total !== 36
    || batch.summary.uniqueCases !== 36
    || batch.summary.technicalEvidenceRequired !== 0
    || batch.summary.recipeRepairRequired !== 0
    || batch.summary.workPackages !== 17
    || batch.summary.readyForRecipeGeneration !== 36
    || batch.summary.generatedRecipes !== 36
    || batch.summary.runtimeSelected !== 36
    || batch.summary.authenticatedAccepted !== 36
    || batch.waves.map((wave) => wave.caseCount).join(',') !== '8,12,8,8'
    || batch.waves.some((wave) => wave.status !== 'runtime-accepted' || !wave.executionAllowed)) {
    throw new Error(
      `P0 技术绑定批次分母漂移：total=${batch.summary.total};unique=${batch.summary.uniqueCases};evidence=${batch.summary.technicalEvidenceRequired};repair=${batch.summary.recipeRepairRequired};packages=${batch.summary.workPackages};waves=${batch.waves.map((wave) => wave.caseCount).join(',')}`,
    );
  }
}

function readJson<T>(filePath: string): T {
  return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T;
}

function writeJson(filePath: string, value: unknown): void {
  writeText(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function writeText(filePath: string, content: string): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.tmp`;
  fs.writeFileSync(temporaryPath, content, 'utf8');
  fs.renameSync(temporaryPath, filePath);
}

if (require.main === module) {
  try {
    const artifacts = buildProductCenterItemP0TechnicalBindingBatchArtifacts();
    process.stdout.write(`P0 技术绑定批次已生成：${artifacts.batchPath}\n`);
    process.stdout.write(`P0 技术证据请求已生成：${artifacts.evidenceRequestPath}\n`);
    process.stdout.write(`用例=${artifacts.batch.summary.total}；能力包=${artifacts.batch.summary.workPackages}；Recipe=${artifacts.batch.summary.generatedRecipes}\n`);
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
