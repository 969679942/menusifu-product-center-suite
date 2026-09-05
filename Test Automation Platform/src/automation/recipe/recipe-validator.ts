import { createHash } from 'node:crypto';
import type {
  AutomationRecipe,
  RecipeCapabilityContract,
  RecipeValue,
} from './automation-recipe';

export type RecipeValidationIssue = {
  code:
    | 'SOURCE_REQUIRED'
    | 'TRACEABILITY_REQUIRED'
    | 'UNKNOWN_CAPABILITY'
    | 'CAPABILITY_INPUT_REQUIRED'
    | 'CAPABILITY_ACTION_MISMATCH'
    | 'DUPLICATE_CAPABILITY'
    | 'MUTATION_REQUIRED'
    | 'SEED_REQUIRED'
    | 'CLEANUP_REQUIRED'
    | 'BOUNDARY_MUTATION_FORBIDDEN'
    | 'BOUNDARY_SEED_FORBIDDEN'
    | 'BOUNDARY_CLEANUP_FORBIDDEN'
    | 'READ_MUTATION_FORBIDDEN'
    | 'READ_SEED_FORBIDDEN'
    | 'READ_CLEANUP_FORBIDDEN'
    | 'RAW_SELECTOR_FORBIDDEN'
    | 'INVALID_VALUE_BINDING'
    | 'SIDEBAR_NAVIGATION_REQUIRED'
    | 'WAVE_EXECUTION_POLICY_INVALID';
  path: string;
  message: string;
};

const allowedBindingRoots = new Set(['$record', '$case', '$recipe', '$result']);
const rawSelectorKey = /^(selector|locator|xpath|css)$/i;

export function validateAutomationRecipe(
  recipe: AutomationRecipe,
  capabilityContracts: readonly RecipeCapabilityContract[],
): RecipeValidationIssue[] {
  const issues: RecipeValidationIssue[] = [];
  const contracts = new Map(capabilityContracts.map((contract) => [contract.id, contract]));
  const seenCapabilities = new Set<string>();

  if (!recipe.traceabilityId || !recipe.traceabilityId.startsWith('trace:sop:')) {
    issues.push({ code: 'TRACEABILITY_REQUIRED', path: 'traceabilityId', message: 'Recipe 必须绑定统一合同追溯记录' });
  }
  if (recipe.sourceIds.length === 0) {
    issues.push({ code: 'SOURCE_REQUIRED', path: 'sourceIds', message: 'Recipe 必须至少声明一个来源' });
  }
  if (recipe.capabilities[0]?.id !== 'navigation.sidebar.open') {
    issues.push({
      code: 'SIDEBAR_NAVIGATION_REQUIRED',
      path: 'capabilities[0].id',
      message: '所有 Recipe 必须把侧边栏导航声明为第一项能力',
    });
  }

  const waveSharedChain = recipe.executionPolicy?.mode === 'wave-shared-chain';
  if (recipe.executionPolicy?.mode === 'wave-shared-chain') {
    const executionPolicy = recipe.executionPolicy;
    if (executionPolicy.caseLevelExecutionAllowed !== false
      || !executionPolicy.waveId
      || !executionPolicy.orchestratorSpecPath
      || !executionPolicy.runtimeAcceptanceId) {
      issues.push({
        code: 'WAVE_EXECUTION_POLICY_INVALID',
        path: 'executionPolicy',
        message: '共享整波 Recipe 必须禁止单例执行并声明波次、执行规格和运行验收',
      });
    }
  }

  for (const [index, capability] of recipe.capabilities.entries()) {
    const path = `capabilities[${index}]`;
    const contract = contracts.get(capability.id);
    if (!contract) {
      issues.push({ code: 'UNKNOWN_CAPABILITY', path: `${path}.id`, message: `未知能力：${capability.id}` });
    } else {
      if (!contract.actions.includes(recipe.action)) {
        issues.push({
          code: 'CAPABILITY_ACTION_MISMATCH',
          path: `${path}.id`,
          message: `能力 ${capability.id} 不支持动作 ${recipe.action}`,
        });
      }
      for (const requiredInput of contract.requiredInputs) {
        if (!(requiredInput in (capability.input ?? {}))) {
          issues.push({
            code: 'CAPABILITY_INPUT_REQUIRED',
            path: `${path}.input.${requiredInput}`,
            message: `能力 ${capability.id} 缺少输入 ${requiredInput}`,
          });
        }
      }
    }

    if (seenCapabilities.has(capability.id)) {
      issues.push({ code: 'DUPLICATE_CAPABILITY', path: `${path}.id`, message: `能力重复：${capability.id}` });
    }
    seenCapabilities.add(capability.id);
  }

  if (waveSharedChain) {
    if (recipe.seed || recipe.mutation || recipe.cleanup) {
      issues.push({
        code: 'WAVE_EXECUTION_POLICY_INVALID',
        path: 'executionPolicy',
        message: '共享整波 Recipe 的数据生命周期必须由整波执行规格统一管理',
      });
    }
  } else if (recipe.action === 'create' || recipe.action === 'edit' || recipe.action === 'delete') {
    if (!recipe.mutation) issues.push({ code: 'MUTATION_REQUIRED', path: 'mutation', message: '编辑和删除 Recipe 必须声明 mutation' });
    if (!recipe.seed) issues.push({ code: 'SEED_REQUIRED', path: 'seed', message: '编辑和删除 Recipe 必须声明 seed' });
    if (!recipe.cleanup) issues.push({ code: 'CLEANUP_REQUIRED', path: 'cleanup', message: '编辑和删除 Recipe 必须声明 cleanup' });
  } else if (recipe.action === 'boundary') {
    if (recipe.mutation) issues.push({ code: 'BOUNDARY_MUTATION_FORBIDDEN', path: 'mutation', message: '边界 Recipe 不得声明 mutation' });
    if (recipe.seed) issues.push({ code: 'BOUNDARY_SEED_FORBIDDEN', path: 'seed', message: '边界 Recipe 不得声明 seed' });
    if (recipe.cleanup) issues.push({ code: 'BOUNDARY_CLEANUP_FORBIDDEN', path: 'cleanup', message: '边界 Recipe 不得声明 cleanup' });
  } else if (recipe.action === 'read') {
    if (recipe.mutation) issues.push({ code: 'READ_MUTATION_FORBIDDEN', path: 'mutation', message: '只读 Recipe 不得声明 mutation' });
    if (recipe.seed) issues.push({ code: 'READ_SEED_FORBIDDEN', path: 'seed', message: '只读 Recipe 不得声明 seed' });
    if (recipe.cleanup) issues.push({ code: 'READ_CLEANUP_FORBIDDEN', path: 'cleanup', message: '只读 Recipe 不得声明 cleanup' });
  } else {
    if (recipe.mutation) issues.push({ code: 'BOUNDARY_MUTATION_FORBIDDEN', path: 'mutation', message: '负向 Recipe 不得声明 mutation' });
    if (Boolean(recipe.seed) !== Boolean(recipe.cleanup)) {
      issues.push({
        code: recipe.seed ? 'CLEANUP_REQUIRED' : 'SEED_REQUIRED',
        path: recipe.seed ? 'cleanup' : 'seed',
        message: '负向 Recipe 的 seed 与 cleanup 必须成对声明',
      });
    }
  }

  scanRecipeValues(recipe, '', issues);
  return issues;
}

export function recipeFingerprint(recipe: AutomationRecipe): string {
  return createHash('sha256').update(stableSerialize(recipe)).digest('hex');
}

export function recipeCollectionFingerprint(recipes: readonly AutomationRecipe[]): string {
  const normalized = [...recipes].sort((left, right) => left.id.localeCompare(right.id));
  return createHash('sha256').update(stableSerialize(normalized)).digest('hex');
}

function scanRecipeValues(value: unknown, path: string, issues: RecipeValidationIssue[]): void {
  if (Array.isArray(value)) {
    value.forEach((item, index) => scanRecipeValues(item, `${path}[${index}]`, issues));
    return;
  }
  if (!value || typeof value !== 'object') return;

  const record = value as Record<string, unknown>;
  if (typeof record.$ref === 'string' && !isValidBinding(record as RecipeValue)) {
    issues.push({ code: 'INVALID_VALUE_BINDING', path: `${path}.$ref`, message: `无效值绑定：${record.$ref}` });
  }

  for (const [key, child] of Object.entries(record)) {
    const childPath = path ? `${path}.${key}` : key;
    if (rawSelectorKey.test(key)) {
      issues.push({ code: 'RAW_SELECTOR_FORBIDDEN', path: childPath, message: `Recipe 禁止保存原始 selector 字段：${key}` });
    }
    scanRecipeValues(child, childPath, issues);
  }
}

function isValidBinding(value: RecipeValue): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value) || !('$ref' in value)) return true;
  const reference = (value as { $ref?: unknown }).$ref;
  if (typeof reference !== 'string') return false;
  const root = reference.split('.')[0];
  return allowedBindingRoots.has(root) && /^\$(record|case|recipe|result)(\.[A-Za-z_][A-Za-z0-9_]*)*$/.test(reference);
}

function stableSerialize(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableSerialize).join(',')}]`;
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => `${JSON.stringify(key)}:${stableSerialize(child)}`);
    return `{${entries.join(',')}}`;
  }
  return JSON.stringify(value);
}
