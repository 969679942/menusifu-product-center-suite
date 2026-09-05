import type { PlaywrightAuditStepKind } from '../../../../Test Automation Platform/src/audit/playwright-step-audit';

export const MERCHANT_CENTER_CASE_ID_ANNOTATION_TYPES = [
  'system-test-case-id', 'canonical-case-id', 'group-case-id', 'recipe-case-id', 'case-id',
] as const;

export function configureMerchantCenterAuditStepEnvironment(): void {
  process.env.SYSTEM_TEST_CASE_ID_ANNOTATION_TYPES ??= MERCHANT_CENTER_CASE_ID_ANNOTATION_TYPES.join(',');
}

/** Merchant Center wording classifier. It labels telemetry only; receipts remain the sole pass authority. */
export function classifyMerchantCenterAuditStep(input: { title: string; category: string }): PlaywrightAuditStepKind {
  const title = input.title.trim();
  if (/^(?:\[清理\]|清理：|执行清理|核对.*(?:残留|零残留)|验证.*(?:残留|零残留))/.test(title)) return 'cleanup';
  if (/^(?:\[断言\]|断言：|校验\d*：|验证(?: UI| API| 下游| 页面| 结果| 终态))/.test(title)) return 'assertion';
  if (/^(?:\[前置校验\]|前置：|上下文守卫|验证(?:路由|语言|角色|租户)|确认执行上下文)/.test(title)) return 'context-guard';
  if (/^(?:\[业务操作\]|业务操作：|执行 |创建|新增|编辑|更新|删除|提交|保存|同步|导入|发布|复制|批量|点击.*(?:保存|提交|确认|删除|同步))/.test(title)) return 'business-operation';
  return 'technical';
}
