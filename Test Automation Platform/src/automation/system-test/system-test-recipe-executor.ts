import path from 'node:path';
import type {
  BusinessStepAttachment,
  BusinessStepReportEvidence,
} from '../../reporters/allure-report-integrity';
import type {
  AutomationRecipe,
  RecipeActionReadinessContract,
  RecipeAdapterCall,
  RecipeCapabilityStep,
  RecipeValue,
} from '../recipe/automation-recipe';
import { assertSystemTestExecutionGrant } from './system-test-execution-grant';

export type SystemTestAssertionReceipt = {
  claimId: string;
  assertionAdapterId: string;
  status: 'verified' | 'observed-mismatch';
  expectedValue?: unknown;
  actualValue?: unknown;
  actualStatus?: 'observed' | 'unobserved';
  unobservedReason?: string;
  observationChannel?: 'ui' | 'api' | 'downstream' | 'cleanup';
  authority?: 'user-visible' | 'persistence' | 'integration-terminal' | 'residue';
  comparison?: 'matched' | 'mismatched';
};

export type SystemTestContextGuardReceipt = {
  contextGuardAdapterId: string;
  phase: 'before-action' | 'before-assertion';
  status: 'verified';
};

export type SystemTestActionReadinessReceipt = {
  actionReadinessAdapterId: string;
  status: 'verified';
  contractIds: string[];
  verifiedIdentityKeys: string[];
  durationMs: number;
};

export type SystemTestExecutionTiming = {
  phase: 'initialize' | 'seed' | 'action-readiness' | 'context-guard' | 'capability' | 'assertion' | 'cleanup';
  id: string;
  durationMs: number;
  status: 'passed' | 'failed';
};

export type SystemTestReportPhase =
  | 'initialize'
  | 'seed'
  | 'action-readiness'
  | 'context-guard'
  | 'capability'
  | 'assertion'
  | 'cleanup';

export type SystemTestReportStep = {
  phase: SystemTestReportPhase;
  recipe: AutomationRecipe;
  adapterId?: string;
  index?: number;
  input?: Readonly<Record<string, unknown>>;
};

/** 每个 Recipe 阶段的可核对步骤账本。它是过程证据，不替代业务操作/断言/清理收据。 */
export type SystemTestStepReceipt = {
  stepId: string;
  phase: SystemTestReportPhase;
  adapterId?: string;
  index?: number;
  title?: string;
  status: 'passed' | 'failed' | 'interrupted';
  startedAt: string;
  finishedAt?: string;
  durationMs?: number;
};

export type SystemTestStepReporter = <Result>(
  step: SystemTestReportStep,
  action: () => Promise<Result>,
  evidence?: (status: 'passed' | 'failed') => Promise<readonly BusinessStepAttachment[] | BusinessStepReportEvidence>
    | readonly BusinessStepAttachment[]
    | BusinessStepReportEvidence,
) => Promise<Result>;

export type SystemTestReportEvidenceBuilder<Context extends SystemTestRecipeContext> = (
  step: SystemTestReportStep,
  context: Context,
  stepResult?: unknown,
) => Promise<readonly BusinessStepAttachment[] | BusinessStepReportEvidence>
  | readonly BusinessStepAttachment[]
  | BusinessStepReportEvidence;

export type SystemTestRecipeContext = {
  recipe: AutomationRecipe;
  record?: unknown;
  results: Record<string, unknown>;
  assertionReceipts: SystemTestAssertionReceipt[];
  contextGuardReceipts?: SystemTestContextGuardReceipt[];
  actionReadinessReceipts?: SystemTestActionReadinessReceipt[];
  stepReceipts?: SystemTestStepReceipt[];
  executionTimings?: SystemTestExecutionTiming[];
  cleanupEvidence?: unknown;
  [key: string]: unknown;
};

export type SystemTestRecipePort<Context extends SystemTestRecipeContext> = {
  initialize: (recipe: AutomationRecipe) => Promise<Context>;
  seed: (call: RecipeAdapterCall, context: Context) => Promise<Context>;
  verifyContext: (
    call: RecipeAdapterCall,
    context: Context,
    input: Readonly<Record<string, unknown>>,
  ) => Promise<void>;
  verifyActionReadiness?: (
    contract: RecipeActionReadinessContract,
    context: Context,
    input: Readonly<Record<string, unknown>>,
  ) => Promise<{ verifiedIdentityKeys: string[] }>;
  executeCapability: (
    capability: RecipeCapabilityStep,
    context: Context,
    input: Readonly<Record<string, unknown>>,
  ) => Promise<unknown>;
  assert: (
    call: RecipeAdapterCall,
    context: Context,
    input: Readonly<Record<string, unknown>>,
  ) => Promise<void>;
  cleanup: (call: RecipeAdapterCall, context: Context) => Promise<unknown>;
  reportStep?: SystemTestStepReporter;
  buildReportEvidence?: SystemTestReportEvidenceBuilder<Context>;
};

export async function executeSystemTestRecipe<Context extends SystemTestRecipeContext>(
  recipe: AutomationRecipe,
  port: SystemTestRecipePort<Context>,
): Promise<Context> {
  assertSystemTestExecutionGrant({
    rootDir: path.resolve(process.env.SYSTEM_TEST_PROJECT_ROOT ?? process.cwd()),
    applicationId: process.env.SYSTEM_TEST_EXECUTION_APPLICATION_ID ?? '',
    caseId: recipe.caseId,
  });
  if (recipe.executionPolicy?.mode === 'wave-shared-chain') {
    throw new Error(`Recipe ${recipe.caseId} requires wave orchestrator ${recipe.executionPolicy.orchestratorSpecPath}`);
  }
  const initializeStartedAt = Date.now();
  let context = await runReportedStep(port, { phase: 'initialize', recipe }, () => port.initialize(recipe));
  context.assertionReceipts = [];
  context.contextGuardReceipts = [];
  context.actionReadinessReceipts = [];
  context.stepReceipts = context.stepReceipts ?? [];
  context.stepReceipts.push({
    stepId: 'initialize', phase: 'initialize', title: recipe.title,
    status: 'passed', startedAt: new Date(initializeStartedAt).toISOString(),
    finishedAt: new Date().toISOString(), durationMs: Date.now() - initializeStartedAt,
  });
  context.executionTimings = [{
    phase: 'initialize',
    id: 'initialize',
    durationMs: Date.now() - initializeStartedAt,
    status: 'passed',
  }];
  try {
    if (recipe.seed) context = await timed(context, 'seed', recipe.seed.adapterId, () => runReportedStep(port, { phase: 'seed', recipe, adapterId: recipe.seed!.adapterId }, () => port.seed(recipe.seed!, context), context));
    if (recipe.actionReadiness) await executeActionReadiness(recipe.actionReadiness, port, context);
    await executeContextGuards('before-action', recipe, port, context);
    for (const capability of recipe.capabilities) {
      const capabilityInput = resolveSystemTestRecipeInput(capability.input ?? {}, context);
      const result = await timed(context, 'capability', capability.id, () => runReportedStep(
        port,
        { phase: 'capability', recipe, adapterId: capability.id, index: recipe.capabilities.indexOf(capability), input: capabilityInput },
        () => port.executeCapability(capability, context, capabilityInput),
        context,
      ));
      context.results[capability.saveAs ?? capability.id] = result;
    }
    await executeContextGuards('before-assertion', recipe, port, context);
    for (const assertion of recipe.assertions) {
      const assertionInput = resolveSystemTestRecipeInput(assertion.input ?? {}, context);
      await timed(context, 'assertion', assertion.adapterId, () => runReportedStep(
        port,
        { phase: 'assertion', recipe, adapterId: assertion.adapterId, index: recipe.assertions.indexOf(assertion), input: assertionInput },
        () => port.assert(assertion, context, assertionInput),
        context,
        () => {
          for (const claimId of assertion.claimIds ?? []) {
            const existing = context.assertionReceipts.find((receipt) => receipt.claimId === claimId);
            if (existing) continue;
            context.assertionReceipts.push({ claimId, assertionAdapterId: assertion.adapterId, status: 'verified' });
          }
        },
      ));
    }
    return context;
  } finally {
    if (recipe.cleanup) context.cleanupEvidence = await timed(
      context, 'cleanup', recipe.cleanup.adapterId, () => runReportedStep(
        port,
        { phase: 'cleanup', recipe, adapterId: recipe.cleanup!.adapterId },
        () => port.cleanup(recipe.cleanup!, context),
        context,
      ),
    );
  }
}

async function executeActionReadiness<Context extends SystemTestRecipeContext>(
  contract: RecipeActionReadinessContract,
  port: SystemTestRecipePort<Context>,
  context: Context,
): Promise<void> {
  if (!port.verifyActionReadiness) throw new Error(`ACTION_READINESS_PORT_REQUIRED:${context.recipe.caseId}`);
  const input = resolveSystemTestRecipeInput(contract.input ?? {}, context);
  for (const key of contract.requiredIdentityKeys) {
    const value = input[key];
    if (value === undefined || value === null || (typeof value === 'string' && value.trim().length === 0)) {
      throw new Error(`ACTION_READINESS_IDENTITY_MISSING:${context.recipe.caseId}:${key}`);
    }
  }
  const startedAt = Date.now();
  const result = await timed(context, 'action-readiness', contract.adapterId, () => runReportedStep(
    port,
    { phase: 'action-readiness', recipe: context.recipe, adapterId: contract.adapterId, input },
    () => port.verifyActionReadiness!(contract, context, input),
    context,
  ));
  const verified = [...new Set(result.verifiedIdentityKeys)];
  const missing = contract.requiredIdentityKeys.filter((key) => !verified.includes(key));
  if (missing.length > 0) throw new Error(`ACTION_READINESS_IDENTITY_UNVERIFIED:${context.recipe.caseId}:${missing.join(',')}`);
  context.actionReadinessReceipts!.push({
    actionReadinessAdapterId: contract.adapterId,
    status: 'verified',
    contractIds: [...contract.contractIds],
    verifiedIdentityKeys: verified.sort(),
    durationMs: Date.now() - startedAt,
  });
}

async function executeContextGuards<Context extends SystemTestRecipeContext>(
  phase: SystemTestContextGuardReceipt['phase'],
  recipe: AutomationRecipe,
  port: SystemTestRecipePort<Context>,
  context: Context,
): Promise<void> {
  for (const guard of recipe.contextGuards ?? []) {
    const input = resolveSystemTestRecipeInput(guard.input ?? {}, context);
    if (input.phase !== phase) continue;
    await timed(context, 'context-guard', `${guard.adapterId}:${phase}`, () => runReportedStep(
      port,
      { phase: 'context-guard', recipe, adapterId: guard.adapterId, input },
      () => port.verifyContext(guard, context, input),
      context,
    ));
    context.contextGuardReceipts!.push({ contextGuardAdapterId: guard.adapterId, phase, status: 'verified' });
  }
}

async function runReportedStep<Context extends SystemTestRecipeContext, Result>(
  port: SystemTestRecipePort<Context>,
  step: SystemTestReportStep,
  action: () => Promise<Result>,
  context?: Context,
  finalizeSuccess?: () => void,
): Promise<Result> {
  const stepStartedAt = Date.now();
  const receiptId = `${step.phase}:${step.adapterId ?? step.recipe.route}:${step.index ?? 0}:${context?.stepReceipts?.length ?? 0}`;
  const receipt = context ? {
    stepId: receiptId,
    phase: step.phase,
    adapterId: step.adapterId,
    index: step.index,
    startedAt: new Date(stepStartedAt).toISOString(),
  } : undefined;
  if (receipt && context) {
    context.stepReceipts = context.stepReceipts ?? [];
    context.stepReceipts.push({ ...receipt, status: 'interrupted' });
  }
  const finishReceipt = (status: SystemTestStepReceipt['status']) => {
    if (!receipt || !context) return;
    const current = context.stepReceipts?.find((item) => item.stepId === receipt.stepId && item.startedAt === receipt.startedAt);
    if (current) {
      current.status = status;
      current.finishedAt = new Date().toISOString();
      current.durationMs = Date.now() - stepStartedAt;
    }
  };
  let stepResult: Result | undefined;
  let finalized = false;
  const finalize = () => {
    if (finalized) return;
    finalized = true;
    finalizeSuccess?.();
  };
  const evidence = context && port.buildReportEvidence
    ? async (status: 'passed' | 'failed') => {
      if (status === 'passed') finalize();
      return port.buildReportEvidence!(step, context, stepResult);
    }
    : undefined;
  const reportAction = async (): Promise<Result> => {
    try {
      stepResult = await action();
      finalize();
      finishReceipt('passed');
      return stepResult;
    } catch (error) {
      finishReceipt('failed');
      throw error;
    }
  };
  try {
    const result = port.reportStep ? await port.reportStep(step, reportAction, evidence) : await reportAction();
    finishReceipt('passed');
    return result;
  } catch (error) {
    finishReceipt('failed');
    throw error;
  }
}

async function timed<Context extends SystemTestRecipeContext, Result>(
  context: Context,
  phase: SystemTestExecutionTiming['phase'],
  id: string,
  action: () => Promise<Result>,
): Promise<Result> {
  const startedAt = Date.now();
  try {
    const result = await action();
    context.executionTimings!.push({ phase, id, durationMs: Date.now() - startedAt, status: 'passed' });
    return result;
  } catch (error) {
    context.executionTimings!.push({ phase, id, durationMs: Date.now() - startedAt, status: 'failed' });
    throw error;
  }
}

export function resolveSystemTestRecipeInput(
  input: Readonly<Record<string, RecipeValue>>,
  context: SystemTestRecipeContext,
): Record<string, unknown> {
  return resolveValue(input, context) as Record<string, unknown>;
}

function resolveValue(value: RecipeValue, context: SystemTestRecipeContext): unknown {
  if (Array.isArray(value)) return value.map((item) => resolveValue(item, context));
  if (value && typeof value === 'object') {
    if ('$ref' in value && typeof value.$ref === 'string') return readReference(value.$ref, context);
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, resolveValue(item as RecipeValue, context)]));
  }
  return value;
}

function readReference(reference: string, context: SystemTestRecipeContext): unknown {
  const segments = reference.replace(/^\$/, '').split('.').filter(Boolean);
  let current: unknown = context;
  for (const segment of segments) {
    if (!current || typeof current !== 'object' || !(segment in current)) {
      throw new Error(`Recipe binding not found: ${reference}`);
    }
    current = (current as Record<string, unknown>)[segment];
  }
  return current;
}









