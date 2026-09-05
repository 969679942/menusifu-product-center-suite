import fs from 'node:fs';
import path from 'node:path';
import type { Reporter, TestCase, TestResult, TestResultAttachment } from '@playwright/test/reporter';
import recipesDocument from '../contracts/product-center/recipes/product-center-pilot-recipes.json';
import itemIntakeRecipesDocument from '../contracts/product-center/recipes/product-center-item-intake-pilot-recipes.json';
import testPlanGoldSetRecipesDocument from '../contracts/product-center/recipes/product-center-test-plan-gold-set-recipes.json';
import approvedTechnicalBindingsRecipesDocument from '../contracts/product-center/recipes/product-center-approved-technical-bindings-recipes.json';
import itemCategoryLeafProbeRecipesDocument from '../contracts/product-center/recipes/product-center-item-category-leaf-probe-recipes.json';
import itemComboAuditProbeRecipesDocument from '../contracts/product-center/recipes/product-center-item-combo-audit-probe-recipes.json';
import {
  buildRecipeFeedbackCollections,
  type RecipeExecutionStatus,
  type RecipeFeedbackCollection,
  type RecipeFeedbackInput,
} from '../automation/recipe/recipe-feedback';
import { writeProductCenterImmutableRunArtifact } from '../utils/product-center-run-artifacts';

type RecipeRuntimeEvidenceEntry = {
  observationId?: string;
  recipeId: string;
  caseId: string;
  claimCoverageComplete?: boolean;
  sidebarEntryVerified?: boolean;
  [key: string]: unknown;
};

type RecipeCollectionOutput = RecipeFeedbackCollection & {
  runCollectionId: string;
  feedbackPath: string;
  evidencePath: string;
};

const baseCollections: readonly RecipeCollectionOutput[] = [
  {
    id: 'core',
    runCollectionId: 'product-center-pilot',
    fingerprint: recipesDocument.fingerprint,
    recipeIds: recipesDocument.recipes.map((recipe) => recipe.id),
    feedbackPath: path.resolve('output/recipes/product-center-pilot-feedback.json'),
    evidencePath: path.resolve('output/recipes/product-center-pilot-evidence.json'),
  },
  {
    id: 'item-intake',
    runCollectionId: 'product-center-item-intake-pilot',
    fingerprint: (itemIntakeRecipesDocument as { fingerprint: string }).fingerprint,
    recipeIds: itemIntakeRecipesDocument.recipes.map((recipe) => recipe.id),
    feedbackPath: path.resolve('output/recipes/product-center-item-intake-pilot-feedback.json'),
    evidencePath: path.resolve('output/recipes/product-center-item-intake-pilot-evidence.json'),
  },
  {
    id: 'test-plan-gold-set',
    runCollectionId: 'product-center-test-plan-gold-set',
    fingerprint: testPlanGoldSetRecipesDocument.fingerprint,
    recipeIds: testPlanGoldSetRecipesDocument.recipes.map((recipe) => recipe.id),
    feedbackPath: path.resolve('output/recipes/product-center-test-plan-gold-set-feedback.json'),
    evidencePath: path.resolve('output/recipes/product-center-test-plan-gold-set-evidence.json'),
  },
] as const;

const approvedTechnicalBindingsCollection: RecipeCollectionOutput = {
  id: 'approved-technical-bindings',
  runCollectionId: 'product-center-approved-technical-bindings',
  fingerprint: approvedTechnicalBindingsRecipesDocument.fingerprint,
  recipeIds: approvedTechnicalBindingsRecipesDocument.recipes.map((recipe) => recipe.id),
  feedbackPath: path.resolve('output/recipes/product-center-approved-technical-bindings-feedback.json'),
  evidencePath: path.resolve('output/recipes/product-center-approved-technical-bindings-evidence.json'),
};

const itemCategoryLeafProbeCollection: RecipeCollectionOutput = {
  id: 'item-category-leaf-probe',
  runCollectionId: 'product-center-item-category-leaf-probe',
  fingerprint: itemCategoryLeafProbeRecipesDocument.fingerprint,
  recipeIds: itemCategoryLeafProbeRecipesDocument.recipes.map((recipe) => recipe.id),
  feedbackPath: path.resolve('output/recipes/product-center-item-category-leaf-probe-feedback.json'),
  evidencePath: path.resolve('output/recipes/product-center-item-category-leaf-probe-evidence.json'),
};

const itemComboAuditProbeCollection: RecipeCollectionOutput = {
  id: 'item-combo-audit-probe',
  runCollectionId: 'product-center-item-combo-audit-probe',
  fingerprint: itemComboAuditProbeRecipesDocument.fingerprint,
  recipeIds: itemComboAuditProbeRecipesDocument.recipes.map((recipe) => recipe.id),
  feedbackPath: path.resolve('output/recipes/product-center-item-combo-audit-probe-feedback.json'),
  evidencePath: path.resolve('output/recipes/product-center-item-combo-audit-probe-evidence.json'),
};

const collections = selectCollections(process.env.PC_RECIPE_COLLECTION_ID);

function selectCollections(collectionId: string | undefined): readonly RecipeCollectionOutput[] {
  if (!collectionId) return baseCollections;
  const collection = [
    ...baseCollections,
    approvedTechnicalBindingsCollection,
    itemCategoryLeafProbeCollection,
    itemComboAuditProbeCollection,
  ]
    .find((item) => item.runCollectionId === collectionId);
  if (!collection) throw new Error(`未知 Recipe 运行集合：${collectionId}`);
  return [collection];
}

export default class ProductCenterRecipeReporter implements Reporter {
  private readonly feedbackEntries: RecipeFeedbackInput[] = [];
  private readonly evidenceEntries = new Map<string, RecipeRuntimeEvidenceEntry>();
  private readonly evidenceObservations: RecipeRuntimeEvidenceEntry[] = [];
  private readonly runId = process.env.PC_RECIPE_RUN_ID ?? `AUTO_AUDIT_RUN_${Date.now()}`;
  private readonly runScope = process.env.PC_RECIPE_RUN_SCOPE ?? 'full';

  onTestEnd(test: TestCase, result: TestResult): void {
    const recipeId = annotation(test, 'recipe-id');
    const caseId = annotation(test, 'recipe-case-id');
    if (!recipeId || !caseId) return;

    const observationId = `${test.id}:repeat-${test.repeatEachIndex}:retry-${result.retry}`;
    this.feedbackEntries.push({
      observationId,
      recipeId,
      caseId,
      title: test.title,
      status: result.status as RecipeExecutionStatus,
      durationMs: result.duration,
      retry: result.retry,
      error: result.error?.message,
    });

    const runtimeEvidence = parseRuntimeEvidenceAttachment(
      result.attachments,
      recipeId,
      caseId,
      observationId,
    );
    if (runtimeEvidence) {
      this.evidenceEntries.set(recipeId, runtimeEvidence);
      this.evidenceObservations.push(runtimeEvidence);
    }
  }

  onEnd(): void {
    if (this.feedbackEntries.length === 0 && this.evidenceEntries.size === 0) return;

    const feedbackByCollection = buildRecipeFeedbackCollections(collections, this.feedbackEntries);
    const evidenceByCollection = buildRecipeEvidenceCollections(collections, [...this.evidenceEntries.values()]);

    for (const collection of collections) {
      const feedback = feedbackByCollection.get(collection.id);
      if (feedback) {
        const document = mergeRunDocument(
          collection,
          'feedback',
          {
            ...feedback,
            runId: this.runId,
            scope: this.runScope,
            selectedCaseIds: feedback.entries.map((entry) => entry.caseId).sort(),
          },
        );
        writeProductCenterImmutableRunArtifact({
          rootDir: process.cwd(),
          collectionId: collection.runCollectionId,
          runId: this.runId,
          scope: this.runScope,
          artifactName: 'feedback',
          value: document,
          publishLatest: this.runScope === 'full',
          latestRelativePath: path.relative(process.cwd(), collection.feedbackPath),
        });
      }

      const evidence = evidenceByCollection.get(collection.id);
      if (evidence) {
        const document = mergeRunDocument(
          collection,
          'evidence',
          {
            ...evidence,
            runId: this.runId,
            scope: this.runScope,
            selectedCaseIds: evidence.entries.map((entry) => entry.caseId).sort(),
            observations: this.evidenceObservations
              .filter((entry) => collection.recipeIds.includes(entry.recipeId))
              .sort((left, right) => String(left.observationId).localeCompare(String(right.observationId))),
          },
        );
        writeProductCenterImmutableRunArtifact({
          rootDir: process.cwd(),
          collectionId: collection.runCollectionId,
          runId: this.runId,
          scope: this.runScope,
          artifactName: 'evidence',
          value: document,
          publishLatest: this.runScope === 'full',
          latestRelativePath: path.relative(process.cwd(), collection.evidencePath),
        });
      }
    }
  }
}

function buildRecipeEvidenceCollections(
  collectionInputs: readonly RecipeCollectionOutput[],
  inputs: readonly RecipeRuntimeEvidenceEntry[],
): Map<string, {
  schemaVersion: '1.0.0';
  fingerprint: string;
  generatedAt: string;
  entries: RecipeRuntimeEvidenceEntry[];
}> {
  const collectionByRecipeId = new Map<string, RecipeCollectionOutput>();
  for (const collection of collectionInputs) {
    for (const recipeId of collection.recipeIds) collectionByRecipeId.set(recipeId, collection);
  }

  const grouped = new Map<string, RecipeRuntimeEvidenceEntry[]>();
  for (const input of inputs) {
    const collection = collectionByRecipeId.get(input.recipeId);
    if (!collection) continue;
    const entries = grouped.get(collection.id) ?? [];
    entries.push(input);
    grouped.set(collection.id, entries);
  }

  return new Map(collectionInputs.flatMap((collection) => {
    const entries = grouped.get(collection.id);
    return entries
      ? [[collection.id, {
          schemaVersion: '1.0.0' as const,
          fingerprint: collection.fingerprint,
          generatedAt: new Date().toISOString(),
          entries: entries.sort((left, right) => left.recipeId.localeCompare(right.recipeId)),
        }]]
      : [];
  }));
}

function parseRuntimeEvidenceAttachment(
  attachments: readonly TestResultAttachment[],
  recipeId: string,
  caseId: string,
  observationId: string,
): RecipeRuntimeEvidenceEntry | undefined {
  const attachment = attachments.find((item) => item.name === 'product-center-runtime-evidence');
  if (!attachment) return undefined;
  const body = attachment.body?.toString('utf8');
  if (!body) return undefined;
  try {
    const parsed = JSON.parse(body) as Record<string, unknown>;
    return {
      ...parsed,
      observationId,
      recipeId,
      caseId,
    } as RecipeRuntimeEvidenceEntry;
  } catch {
    return undefined;
  }
}

function mergeRunDocument(
  collection: RecipeCollectionOutput,
  artifactName: 'feedback' | 'evidence',
  current: Record<string, any>,
): Record<string, any> {
  const filePath = path.resolve(
    `output/recipes/runs/${collection.runCollectionId}/${process.env.PC_RECIPE_RUN_ID ?? ''}/${artifactName}.json`,
  );
  if (!process.env.PC_RECIPE_RUN_ID || !fs.existsSync(filePath)) return current;
  const previous = JSON.parse(fs.readFileSync(filePath, 'utf8')) as Record<string, any>;
  const entries = mergeByKey(previous.entries ?? [], current.entries ?? [], 'recipeId');
  const observations = mergeByKey(previous.observations ?? [], current.observations ?? [], 'observationId');
  return {
    ...previous,
    ...current,
    generatedAt: current.generatedAt,
    selectedCaseIds: [...new Set(entries.map((entry) => entry.caseId))].sort(),
    entries,
    observations,
    ...(artifactName === 'feedback' ? {
      summary: {
        total: entries.length,
        passed: entries.filter((entry) => entry.status === 'passed').length,
        failed: entries.filter((entry) => ['failed', 'timedOut', 'interrupted'].includes(entry.status)).length,
        skipped: entries.filter((entry) => entry.status === 'skipped').length,
        durationMs: entries.reduce((total, entry) => total + Number(entry.durationMs ?? 0), 0),
      },
    } : {}),
  };
}

function mergeByKey(
  previous: readonly Record<string, any>[],
  current: readonly Record<string, any>[],
  key: string,
): Record<string, any>[] {
  const result = new Map(previous.map((entry) => [String(entry[key]), entry]));
  for (const entry of current) result.set(String(entry[key]), entry);
  return [...result.values()].sort((left, right) => String(left[key]).localeCompare(String(right[key])));
}

function annotation(test: TestCase, type: string): string | undefined {
  return test.annotations.find((item) => item.type === type)?.description;
}
