export type ProductCenterCiMode = 'verify' | 'full';
export type ProductCenterCiTrigger = 'manual' | 'schedule' | 'local';

export type ProductCenterCiIssue = {
  code: string;
  detail: string;
};

export type ProductCenterCiConfiguration = {
  pass: boolean;
  mode: ProductCenterCiMode;
  trigger: ProductCenterCiTrigger;
  controlledRepair: boolean;
  pipelineScript:
    | 'pipeline:product-center'
    | 'pipeline:product-center:full'
    | 'pipeline:product-center:full:repair';
  environment: {
    id: string;
    baseHost: string | null;
    authHost: string | null;
  };
  secretPresence: {
    username: boolean;
    password: boolean;
    merchant: boolean;
    brandId: boolean;
  };
  artifactRetentionDays: 30;
  notificationChannel: 'github-step-summary';
  issues: ProductCenterCiIssue[];
};

type ResolveCiInput = {
  mode: ProductCenterCiMode;
  environmentId: string;
  controlledRepair: boolean;
  trigger: ProductCenterCiTrigger;
  env: Readonly<Record<string, string | undefined>>;
};

type ProductCenterPipelineReport = {
  status: string;
  pipeline?: {
    status?: string;
    failedStage?: string | null;
    stages?: unknown[];
  };
  technicalReadiness?: {
    technicalReady?: boolean;
    sourceActions?: Record<string, number>;
  } | null;
  controlledRepair?: { status?: string };
};

export type ProductCenterCiSummary = {
  schemaVersion: '1.0.0';
  generatedAt: string;
  status: string;
  environment: string;
  mode: ProductCenterCiMode;
  trigger: ProductCenterCiTrigger;
  controlledRepair: boolean;
  configurationPassed: boolean;
  issueCodes: string[];
  pipelineStatus: string | null;
  stages: number;
  failedStage: string | null;
  technicalReady: boolean | null;
  controlledRepairStatus: string;
  sourceActions: Record<string, number>;
  artifactRetentionDays: 30;
  notificationChannel: 'github-step-summary';
};

export function resolveProductCenterCiConfiguration(input: ResolveCiInput): ProductCenterCiConfiguration {
  const issues: ProductCenterCiIssue[] = [];
  const environmentId = input.environmentId.trim();
  if (!environmentId) issues.push(issue('ENVIRONMENT_REQUIRED', '缺少 CI 环境标识'));
  else if (!/^[a-z0-9][a-z0-9-]{0,62}$/.test(environmentId)) {
    issues.push(issue('ENVIRONMENT_INVALID', 'CI 环境标识格式无效'));
  }

  const baseURL = readValue(input.env.PLAYWRIGHT_BASE_URL ?? input.env.MC_BASE_URL);
  const authBaseURL = readValue(input.env.PLAYWRIGHT_AUTH_BASE_URL ?? input.env.MC_AUTH_BASE_URL);
  const baseHost = validateUrl(baseURL, 'BASE_URL', issues);
  const authHost = validateUrl(authBaseURL, 'AUTH_BASE_URL', issues);

  const secretPresence = {
    username: Boolean(readValue(input.env.MC_USERNAME)),
    password: Boolean(readValue(input.env.MC_PASSWORD)),
    merchant: Boolean(readValue(input.env.MC_MERCHANT ?? input.env.MC_MERCHANT_NAME)),
    brandId: Boolean(readValue(input.env.MC_BRAND_ID)),
  };
  const storageStatePath = readValue(input.env.MC_STORAGE_STATE_PATH) || 'output/auth-state.json';
  const normalizedStorageStatePath = storageStatePath.replace(/\\/g, '/');
  if (pathIsUnsafe(normalizedStorageStatePath)) {
    issues.push(issue('STORAGE_STATE_PATH_UNSAFE', '登录态路径必须位于 output/ 且不得越界'));
  }
  if (input.mode === 'full') {
    if (!secretPresence.username) issues.push(issue('USERNAME_REQUIRED', 'full 模式缺少用户名 Secret'));
    if (!secretPresence.password) issues.push(issue('PASSWORD_REQUIRED', 'full 模式缺少密码 Secret'));
    if (!secretPresence.merchant) issues.push(issue('MERCHANT_REQUIRED', 'full 模式缺少商户 Secret'));
    if (!secretPresence.brandId) issues.push(issue('BRAND_ID_REQUIRED', 'full 模式缺少品牌 Secret'));
  }
  if (input.controlledRepair && input.mode !== 'full') {
    issues.push(issue('REPAIR_REQUIRES_FULL', 'controlled repair 只允许 full 模式'));
  }
  if (input.controlledRepair && input.trigger === 'schedule') {
    issues.push(issue('SCHEDULED_REPAIR_FORBIDDEN', '定时任务禁止执行 controlled repair'));
  }

  return {
    pass: issues.length === 0,
    mode: input.mode,
    trigger: input.trigger,
    controlledRepair: input.controlledRepair,
    pipelineScript: input.controlledRepair
      ? 'pipeline:product-center:full:repair'
      : input.mode === 'full'
        ? 'pipeline:product-center:full'
        : 'pipeline:product-center',
    environment: { id: environmentId, baseHost, authHost },
    secretPresence,
    artifactRetentionDays: 30,
    notificationChannel: 'github-step-summary',
    issues,
  };
}

export function buildProductCenterCiSummary(input: {
  config: ProductCenterCiConfiguration;
  pipelineExitCode: number;
  pipelineReport?: ProductCenterPipelineReport | null;
  generatedAt?: string;
}): ProductCenterCiSummary {
  const report = input.pipelineReport;
  const pipelinePassed = input.pipelineExitCode === 0 && report?.pipeline?.status === 'passed';
  const status = !input.config.pass
    ? 'blocked'
    : !pipelinePassed
      ? 'failed'
      : report?.status ?? 'failed';
  return {
    schemaVersion: '1.0.0',
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    status,
    environment: input.config.environment.id,
    mode: input.config.mode,
    trigger: input.config.trigger,
    controlledRepair: input.config.controlledRepair,
    configurationPassed: input.config.pass,
    issueCodes: input.config.issues.map((item) => item.code),
    pipelineStatus: report?.pipeline?.status ?? null,
    stages: report?.pipeline?.stages?.length ?? 0,
    failedStage: report?.pipeline?.failedStage ?? null,
    technicalReady: report?.technicalReadiness?.technicalReady ?? null,
    controlledRepairStatus: report?.controlledRepair?.status ?? 'disabled',
    sourceActions: { ...(report?.technicalReadiness?.sourceActions ?? {}) },
    artifactRetentionDays: input.config.artifactRetentionDays,
    notificationChannel: input.config.notificationChannel,
  };
}

export function renderProductCenterCiSummaryMarkdown(summary: ProductCenterCiSummary): string {
  const sourceActions = Object.entries(summary.sourceActions)
    .map(([key, value]) => `${key}=${value}`)
    .join(', ') || 'none';
  return [
    '# 商品中心质量流水线',
    '',
    `- 状态：${summary.status}`,
    `- 环境：${summary.environment}`,
    `- 模式：${summary.mode}`,
    `- 受控修复：${summary.controlledRepairStatus}`,
    `- 阶段：${summary.stages}`,
    `- 失败阶段：${summary.failedStage ?? 'none'}`,
    `- 技术就绪：${summary.technicalReady ?? 'unknown'}`,
    `- 来源待办：${sourceActions}`,
    `- 配置问题：${summary.issueCodes.join(', ') || 'none'}`,
    '',
  ].join('\n');
}

function validateUrl(
  value: string,
  prefix: 'BASE_URL' | 'AUTH_BASE_URL',
  issues: ProductCenterCiIssue[],
): string | null {
  if (!value) {
    issues.push(issue(`${prefix}_REQUIRED`, `缺少 ${prefix} 环境变量`));
    return null;
  }
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== 'https:' || parsed.username || parsed.password) throw new Error('unsafe URL');
    return parsed.host;
  } catch {
    issues.push(issue(`${prefix}_INVALID`, `${prefix} 必须是不含凭据的 HTTPS URL`));
    return null;
  }
}

function readValue(value: string | undefined): string {
  return value?.trim() ?? '';
}

function issue(code: string, detail: string): ProductCenterCiIssue {
  return { code, detail };
}

function pathIsUnsafe(value: string): boolean {
  return value.startsWith('/')
    || /^[a-z]:\//i.test(value)
    || value.includes('../')
    || !value.startsWith('output/');
}
