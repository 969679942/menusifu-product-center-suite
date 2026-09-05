export type RecipeExecutionStatus = 'passed' | 'failed' | 'timedOut' | 'skipped' | 'interrupted';
export type RecipeFailureClassification = 'passed' | 'capability' | 'assertion' | 'cleanup' | 'timeout' | 'unknown';

export type RecipeFeedbackInput = {
  observationId?: string;
  recipeId: string;
  caseId: string;
  title: string;
  status: RecipeExecutionStatus;
  durationMs: number;
  retry?: number;
  error?: string;
};

export type RecipeFeedbackCollection = {
  id: string;
  fingerprint: string;
  recipeIds: readonly string[];
};

export function buildRecipeFeedback(fingerprint: string, inputs: readonly RecipeFeedbackInput[]) {
  const finalInputs = new Map<string, RecipeFeedbackInput>();
  for (const input of inputs) {
    const current = finalInputs.get(input.recipeId);
    if (!current || (input.retry ?? 0) >= (current.retry ?? 0)) finalInputs.set(input.recipeId, input);
  }

  const entries = [...finalInputs.values()]
    .map((input) => feedbackEntry(input))
    .sort((left, right) => left.recipeId.localeCompare(right.recipeId));

  return {
    schemaVersion: '1.0.0' as const,
    fingerprint,
    generatedAt: new Date().toISOString(),
    summary: {
      total: entries.length,
      passed: entries.filter((entry) => entry.status === 'passed').length,
      failed: entries.filter((entry) => ['failed', 'timedOut', 'interrupted'].includes(entry.status)).length,
      skipped: entries.filter((entry) => entry.status === 'skipped').length,
      durationMs: entries.reduce((total, entry) => total + entry.durationMs, 0),
    },
    observations: inputs.map((input, index) => ({
      observationId: input.observationId ?? `${input.recipeId}:observation-${index + 1}`,
      ...feedbackEntry(input),
    })).sort((left, right) => left.observationId.localeCompare(right.observationId)),
    entries,
  };
}

export function buildRecipeFeedbackCollections(
  collections: readonly RecipeFeedbackCollection[],
  inputs: readonly RecipeFeedbackInput[],
): Map<string, ReturnType<typeof buildRecipeFeedback>> {
  const collectionByRecipeId = new Map<string, RecipeFeedbackCollection>();
  for (const collection of collections) {
    for (const recipeId of collection.recipeIds) {
      const existing = collectionByRecipeId.get(recipeId);
      if (existing) throw new Error(`Recipe ID 在反馈集合中重复：${recipeId}（${existing.id}、${collection.id}）`);
      collectionByRecipeId.set(recipeId, collection);
    }
  }

  const inputsByCollectionId = new Map<string, RecipeFeedbackInput[]>();
  for (const input of inputs) {
    const collection = collectionByRecipeId.get(input.recipeId);
    if (!collection) throw new Error(`运行反馈引用了未注册 Recipe：${input.recipeId}`);
    const groupedInputs = inputsByCollectionId.get(collection.id) ?? [];
    groupedInputs.push(input);
    inputsByCollectionId.set(collection.id, groupedInputs);
  }

  return new Map(collections.flatMap((collection) => {
    const groupedInputs = inputsByCollectionId.get(collection.id);
    return groupedInputs
      ? [[collection.id, buildRecipeFeedback(collection.fingerprint, groupedInputs)] as const]
      : [];
  }));
}

export function classifyRecipeFailure(message: string): RecipeFailureClassification {
  if (/清理|cleanup|残留/i.test(message)) return 'cleanup';
  if (/timeout|timed out|超时/i.test(message)) return 'timeout';
  if (/断言|终态|\bassert(?:ion)?\b|\bexpect(?:ation)?\b/i.test(message)) return 'assertion';
  if (/能力|capability|Page 上下文|locator/i.test(message)) return 'capability';
  return 'unknown';
}

export function redactRecipeDiagnostic(message: string): string {
  return message
    .replace(/(authorization|password|cookie|token)\s*[:=]\s*(?:bearer\s+)?[^,;\s]+/gi, '$1=<redacted>')
    .replace(/bearer\s+[^,;\s]+/gi, 'Bearer <redacted>')
    .slice(0, 2_000);
}

function feedbackEntry(input: RecipeFeedbackInput) {
  return {
    recipeId: input.recipeId,
    caseId: input.caseId,
    title: input.title,
    status: input.status,
    durationMs: input.durationMs,
    ...(input.retry === undefined ? {} : { retry: input.retry }),
    classification: input.status === 'passed' ? 'passed' as const : classifyRecipeFailure(input.error ?? ''),
    ...(input.error ? { diagnostic: redactRecipeDiagnostic(input.error) } : {}),
  };
}
