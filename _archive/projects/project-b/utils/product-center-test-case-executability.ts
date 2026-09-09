import type { ProductCenterTestCaseInput } from './product-center-test-case-ir';

export type ProductCenterExecutabilityIssueCode =
  | 'EXECUTION_CONTRACT_REQUIRED'
  | 'ROLE_REQUIRED'
  | 'UNKNOWN_ROLE'
  | 'ENVIRONMENT_REQUIRED'
  | 'UNKNOWN_ENVIRONMENT'
  | 'CAPABILITY_REQUIRED'
  | 'UNKNOWN_CAPABILITY'
  | 'SEED_ADAPTER_REQUIRED'
  | 'API_VERIFY_REQUIRED'
  | 'UI_VERIFY_REQUIRED'
  | 'CLEANUP_ADAPTER_REQUIRED'
  | 'ASYNC_SIGNAL_REQUIRED';

export function auditProductCenterTestCaseExecutability(
  cases: readonly ProductCenterTestCaseInput[],
  known: {
    roleIds?: ReadonlySet<string>;
    environmentIds?: ReadonlySet<string>;
    capabilityIds?: ReadonlySet<string>;
  } = {},
) {
  const auditedCases = cases.map((item) => auditCase(item, known));
  return {
    cases: auditedCases,
    summary: {
      total: auditedCases.length,
      executable: auditedCases.filter((item) => item.decision === 'executable').length,
      reviewRequired: auditedCases.filter((item) => item.decision === 'review-required').length,
      manual: auditedCases.filter((item) => item.decision === 'manual').length,
    },
  };
}

function auditCase(
  input: ProductCenterTestCaseInput,
  known: {
    roleIds?: ReadonlySet<string>;
    environmentIds?: ReadonlySet<string>;
    capabilityIds?: ReadonlySet<string>;
  },
) {
  const issues: Array<{ code: ProductCenterExecutabilityIssueCode; message: string }> = [];
  const execution = input.execution;
  if (!execution) {
    issues.push({ code: 'EXECUTION_CONTRACT_REQUIRED', message: '用例缺少执行合同' });
  } else {
    if (execution.roleIds.length === 0) issues.push({ code: 'ROLE_REQUIRED', message: '执行合同必须声明角色' });
    appendUnknown(issues, execution.roleIds, known.roleIds, 'UNKNOWN_ROLE', '未知角色');
    if (execution.environmentIds.length === 0) {
      issues.push({ code: 'ENVIRONMENT_REQUIRED', message: '执行合同必须声明环境' });
    }
    appendUnknown(issues, execution.environmentIds, known.environmentIds, 'UNKNOWN_ENVIRONMENT', '未知环境');
    if (input.automationPreference !== 'manual' && execution.capabilityIds.length === 0) {
      issues.push({ code: 'CAPABILITY_REQUIRED', message: '自动化候选必须声明能力' });
    }
    appendUnknown(issues, execution.capabilityIds, known.capabilityIds, 'UNKNOWN_CAPABILITY', '未知能力');
    if (input.mutatesData && execution.mutationMode === 'api-seeded-ui-action'
      && execution.seedAdapterIds.length === 0) {
      issues.push({ code: 'SEED_ADAPTER_REQUIRED', message: 'API 前置场景必须声明 Seed 适配器' });
    }
    if (input.mutatesData && !execution.verificationSignals.includes('api')) {
      issues.push({ code: 'API_VERIFY_REQUIRED', message: '变更用例必须验证 API 终态' });
    }
    if (!execution.verificationSignals.includes('ui')) {
      issues.push({ code: 'UI_VERIFY_REQUIRED', message: '用例必须验证 UI 终态' });
    }
    if (input.mutatesData && execution.cleanupAdapterIds.length === 0) {
      issues.push({ code: 'CLEANUP_ADAPTER_REQUIRED', message: '变更用例必须声明清理适配器' });
    }
    if (execution.asyncPolicy !== 'none'
      && !execution.verificationSignals.some((signal) => ['api', 'network', 'background-job'].includes(signal))) {
      issues.push({ code: 'ASYNC_SIGNAL_REQUIRED', message: '异步用例必须声明可观察终态信号' });
    }
  }

  return {
    caseId: input.id,
    issues,
    decision: issues.length > 0
      ? 'review-required' as const
      : input.automationPreference === 'manual'
        ? 'manual' as const
        : 'executable' as const,
  };
}

function appendUnknown(
  issues: Array<{ code: ProductCenterExecutabilityIssueCode; message: string }>,
  values: readonly string[],
  known: ReadonlySet<string> | undefined,
  code: ProductCenterExecutabilityIssueCode,
  label: string,
): void {
  if (!known) return;
  const unknown = values.filter((value) => !known.has(value));
  if (unknown.length > 0) issues.push({ code, message: `${label}：${unknown.join(', ')}` });
}
