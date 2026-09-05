export type AllureReportAttachment = {
  name?: string;
  source?: string;
  type?: string;
};

export type AllureReportStep = {
  name?: string;
  status?: string;
  stage?: string;
  start?: number;
  stop?: number;
  steps?: AllureReportStep[];
  attachments?: AllureReportAttachment[];
  parameters?: unknown[];
  statusDetails?: Record<string, unknown>;
};

export type AllureBusinessReportResult = {
  name?: string;
  status?: string;
  steps?: AllureReportStep[];
  attachments?: AllureReportAttachment[];
};

export type AllureReportIntegrityPolicy = {
  localizedTextPattern: RegExp;
  forbiddenTechnicalTitlePatterns: readonly RegExp[];
  unresolvedTitlePatterns: readonly RegExp[];
  minimumTitleLength: number;
  requireStepStatus: boolean;
  requireAttachmentBinding: boolean;
  bindFailureAttachmentsToFailedStep: boolean;
  failureAttachmentNamesPattern: RegExp;
  attachmentGroupTitle: (attachmentName: string) => string;
  rejectDuplicateContextSteps: boolean;
};

export type AllureReportIntegrityFindingCode =
  | 'MISSING_STEP_TITLE'
  | 'NON_LOCALIZED_STEP_TITLE'
  | 'TECHNICAL_STEP_TITLE'
  | 'UNRESOLVED_STEP_TITLE'
  | 'MISSING_STEP_STATUS'
  | 'MISSING_ATTACHMENT_NAME'
  | 'NON_LOCALIZED_ATTACHMENT_NAME'
  | 'ATTACHMENT_NOT_BOUND_TO_STEP'
  | 'DUPLICATE_CONTEXT_STEP';

export type AllureReportIntegrityFinding = {
  code: AllureReportIntegrityFindingCode;
  path: string;
  title?: string;
  attachmentName?: string;
  message: string;
};

export type BusinessStepAttachment = {
  name: string;
  body?: string | Buffer;
  path?: string;
  contentType?: string;
};

export type BusinessStepDetail = {
  title: string;
  attachments?: readonly BusinessStepAttachment[];
};

export type BusinessStepReportEvidence = {
  attachments?: readonly BusinessStepAttachment[];
  details?: readonly BusinessStepDetail[];
};

export type BusinessOperationReceiptDetailInput = {
  purpose: string;
  triggerSource?: string;
  result: string;
  technicalDetails: Readonly<Record<string, unknown>>;
  attachmentName?: string;
};

export type ContinuousBusinessStepKind =
  | 'environment'
  | 'data-preparation'
  | 'precondition-check'
  | 'business-operation'
  | 'assertion'
  | 'cleanup';

const CONTINUOUS_BUSINESS_STEP_LABELS: Record<ContinuousBusinessStepKind, string> = {
  environment: '环境',
  'data-preparation': '准备数据',
  'precondition-check': '前置校验',
  'business-operation': '业务操作',
  assertion: '断言',
  cleanup: '清理',
};

export function formatContinuousBusinessStepTitle(kind: ContinuousBusinessStepKind, title: string): string {
  return `[${CONTINUOUS_BUSINESS_STEP_LABELS[kind]}] ${title.trim()}`;
}

export function isBusinessOperationStepTitle(title: string | undefined): boolean {
  return Boolean(title && (/^\[业务操作\]\s+/.test(title) || /^业务操作：/.test(title)));
}

export function formatBusinessExecutionConclusionTitle(status: 'passed' | 'failed', caseId: string): string {
  return `执行结论：${status === 'passed' ? '通过' : '失败'}｜${caseId}`;
}

export function createBusinessOperationReceiptDetail(
  input: BusinessOperationReceiptDetailInput,
): BusinessStepDetail {
  const trigger = input.triggerSource?.trim();
  return {
    title: `${input.purpose.trim()}${trigger ? `｜触发方式：${trigger}` : ''}｜结果：${input.result.trim()}`,
    attachments: [{
      name: input.attachmentName ?? '接口执行明细（点击查看）',
      body: Buffer.from(`${JSON.stringify(input.technicalDetails, null, 2)}\n`),
      contentType: 'application/json',
    }],
  };
}

export type BusinessAttachmentStepInfo = {
  attach: (name: string, options: {
    body?: string | Buffer;
    path?: string;
    contentType?: string;
  }) => Promise<void>;
};

export type BusinessAttachmentStepRunner = <Result>(
  title: string,
  action: (step: BusinessAttachmentStepInfo) => Promise<Result>,
) => Promise<Result>;

export async function renderBusinessStepDetails(input: {
  details: readonly BusinessStepDetail[];
  runStep: BusinessAttachmentStepRunner;
}): Promise<void> {
  for (const detail of input.details) {
    await input.runStep(detail.title, async (step) => {
      for (const attachment of detail.attachments ?? []) {
        const options = attachment.path
          ? { path: attachment.path, contentType: attachment.contentType }
          : { body: attachment.body ?? '', contentType: attachment.contentType };
        await step.attach(createStepBoundAttachmentName(detail.title, attachment.name), options);
      }
    });
  }
}

const DEFAULT_TECHNICAL_TITLE_PATTERNS = [
  /\blocator\b/i,
  /\bfill\b/i,
  /\bexpect\b/i,
  /\btobe(?:visible|hidden|enabled|disabled|checked|editable|empty|focused|attached)?\b/i,
  /\bgetby(?:role|text|label|placeholder|testid)\b/i,
  /\bwaitfor(?:timeout|selector|url|loadstate)?\b/i,
  /\bselectoption\b/i,
  /\bpresssequentially\b/i,
  /\b(?:GET|POST|PUT|PATCH|DELETE)\s+\/[A-Za-z0-9_{}./:-]+/,
  /(?:^|[｜\s])方法：(?:GET|POST|PUT|PATCH|DELETE|UI)(?:[｜\s]|$)/,
];

const DEFAULT_UNRESOLVED_TITLE_PATTERNS = [
  /\{[^{}]+\}/,
  /未提供(?:第\d+个参数|[^：\s]+)/,
];

const STEP_ATTACHMENT_BINDING_PREFIX = '__allure_step_binding__:';

export function createAllureReportIntegrityPolicy(input: {
  localizedTextPattern: RegExp;
  attachmentGroupTitle: (attachmentName: string) => string;
  forbiddenTechnicalTitlePatterns?: readonly RegExp[];
  unresolvedTitlePatterns?: readonly RegExp[];
  minimumTitleLength?: number;
  requireStepStatus?: boolean;
  requireAttachmentBinding?: boolean;
  bindFailureAttachmentsToFailedStep?: boolean;
  failureAttachmentNamesPattern?: RegExp;
  rejectDuplicateContextSteps?: boolean;
}): AllureReportIntegrityPolicy {
  return {
    localizedTextPattern: input.localizedTextPattern,
    attachmentGroupTitle: input.attachmentGroupTitle,
    forbiddenTechnicalTitlePatterns: input.forbiddenTechnicalTitlePatterns ?? DEFAULT_TECHNICAL_TITLE_PATTERNS,
    unresolvedTitlePatterns: input.unresolvedTitlePatterns ?? DEFAULT_UNRESOLVED_TITLE_PATTERNS,
    minimumTitleLength: input.minimumTitleLength ?? 4,
    requireStepStatus: input.requireStepStatus ?? true,
    requireAttachmentBinding: input.requireAttachmentBinding ?? true,
    bindFailureAttachmentsToFailedStep: input.bindFailureAttachmentsToFailedStep ?? true,
    failureAttachmentNamesPattern: input.failureAttachmentNamesPattern
      ?? /失败|错误|截图|上下文|追踪|trace|screenshot|error|failure/i,
    rejectDuplicateContextSteps: input.rejectDuplicateContextSteps ?? true,
  };
}

export function auditAllureBusinessReport(
  result: AllureBusinessReportResult,
  policy: AllureReportIntegrityPolicy,
): AllureReportIntegrityFinding[] {
  const findings: AllureReportIntegrityFinding[] = [];
  for (const [index, attachment] of (result.attachments ?? []).entries()) {
    auditAttachmentName(attachment, `attachments[${index}]`, policy, findings);
    if (policy.requireAttachmentBinding) {
      findings.push({
        code: 'ATTACHMENT_NOT_BOUND_TO_STEP',
        path: `attachments[${index}]`,
        attachmentName: attachment.name,
        message: '附件位于用例根节点，无法证明它属于哪个业务步骤。',
      });
    }
  }
  for (const [index, step] of (result.steps ?? []).entries()) {
    auditStep(step, `steps[${index}]`, undefined, policy, findings);
  }
  if (policy.rejectDuplicateContextSteps) auditDuplicateContextSteps(result.steps ?? [], findings);
  return findings;
}

function auditDuplicateContextSteps(
  steps: readonly AllureReportStep[],
  findings: AllureReportIntegrityFinding[],
): void {
  const occurrences = new Map<string, string[]>();
  const visit = (items: readonly AllureReportStep[], prefix: string): void => {
    items.forEach((step, index) => {
      const title = step.name?.trim() ?? '';
      if (/^\[(?:环境|前置校验)\]/.test(title)) {
        const paths = occurrences.get(title) ?? [];
        paths.push(`${prefix}[${index}]`);
        occurrences.set(title, paths);
      }
      visit(step.steps ?? [], `${prefix}[${index}].steps`);
    });
  };
  visit(steps, 'steps');
  for (const [title, paths] of occurrences) {
    if (paths.length < 2) continue;
    for (const path of paths.slice(1)) {
      findings.push({
        code: 'DUPLICATE_CONTEXT_STEP',
        path,
        title,
        message: '同一上下文守卫步骤重复出现；除非发生新的上下文切换，否则应只保留一次。',
      });
    }
  }
}

export function bindDetachedAllureAttachments(
  result: AllureBusinessReportResult,
  policy: AllureReportIntegrityPolicy,
): number {
  const steps = result.steps ?? [];
  const detachedSteps = steps.filter((step) => isDetachedAttachmentStep(step));
  const rootAttachments = result.attachments ?? [];
  if (detachedSteps.length === 0 && rootAttachments.length === 0) return 0;

  const retainedSteps = steps.filter((step) => !detachedSteps.includes(step));
  const grouped = new Map<string, { attachments: AllureReportAttachment[]; start?: number; stop?: number }>();
  for (const step of detachedSteps) {
    for (const attachment of step.attachments ?? []) {
      if (bindAttachmentToDeclaredStep(retainedSteps, attachment)) continue;
      if (bindFailureAttachmentToFailedStep(retainedSteps, attachment, policy)) continue;
      addGroupedAttachment(grouped, attachment, policy, step.start, step.stop);
    }
  }
  for (const attachment of rootAttachments) {
    if (bindAttachmentToDeclaredStep(retainedSteps, attachment)) continue;
    if (bindFailureAttachmentToFailedStep(retainedSteps, attachment, policy)) continue;
    addGroupedAttachment(grouped, attachment, policy);
  }

  for (const [title, group] of grouped) {
    const existing = retainedSteps.find((step) => step.name === title && step.status && (step.steps?.length ?? 0) === 0);
    if (existing) {
      existing.attachments = [...(existing.attachments ?? []), ...group.attachments];
      continue;
    }
    retainedSteps.push({
      name: title,
      status: 'passed',
      stage: 'finished',
      start: group.start,
      stop: group.stop ?? group.start,
      steps: [],
      attachments: group.attachments,
      parameters: [],
      statusDetails: {},
    });
  }
  result.steps = retainedSteps;
  result.attachments = [];
  return detachedSteps.length + (rootAttachments.length > 0 ? 1 : 0);
}

export async function attachBusinessEvidenceStep(input: {
  title: string;
  attachments: readonly BusinessStepAttachment[];
  runStep: BusinessAttachmentStepRunner;
}): Promise<void> {
  await input.runStep(input.title, async (step) => {
    for (const attachment of input.attachments) {
      const options = attachment.path
        ? { path: attachment.path, contentType: attachment.contentType }
        : { body: attachment.body ?? '', contentType: attachment.contentType };
      await step.attach(createStepBoundAttachmentName(input.title, attachment.name), options);
    }
  });
}

export function createStepBoundAttachmentName(stepTitle: string, attachmentName: string): string {
  const encodedTitle = Buffer.from(stepTitle, 'utf8').toString('base64url');
  return `${STEP_ATTACHMENT_BINDING_PREFIX}${encodedTitle.length}:${encodedTitle}:${attachmentName}`;
}

function auditStep(
  step: AllureReportStep,
  path: string,
  parentTitle: string | undefined,
  policy: AllureReportIntegrityPolicy,
  findings: AllureReportIntegrityFinding[],
): void {
  const title = step.name?.trim() ?? '';
  if (!title) {
    findings.push({ code: 'MISSING_STEP_TITLE', path, message: '报告步骤缺少可读标题。' });
  } else {
    if (title.length < policy.minimumTitleLength || !matches(policy.localizedTextPattern, title)) {
      findings.push({
        code: 'NON_LOCALIZED_STEP_TITLE',
        path,
        title,
        message: '步骤标题不是清晰的本地化业务描述。',
      });
    }
    if (policy.forbiddenTechnicalTitlePatterns.some((pattern) => matches(pattern, title))) {
      findings.push({
        code: 'TECHNICAL_STEP_TITLE',
        path,
        title,
        message: '步骤标题暴露了 Playwright、定位器或断言实现细节。',
      });
    }
    if (policy.unresolvedTitlePatterns.some((pattern) => matches(pattern, title))) {
      findings.push({
        code: 'UNRESOLVED_STEP_TITLE',
        path,
        title,
        message: '步骤标题仍包含未解析占位符或缺失参数提示。',
      });
    }
  }

  const detachedAttachmentStep = isDetachedAttachmentStep(step);
  if (policy.requireStepStatus && !detachedAttachmentStep && !step.status) {
    findings.push({
      code: 'MISSING_STEP_STATUS',
      path,
      title: step.name,
      message: '业务步骤缺少执行结果，无法判断该步骤成功还是失败。',
    });
  }

  for (const [index, attachment] of (step.attachments ?? []).entries()) {
    const attachmentPath = `${path}.attachments[${index}]`;
    auditAttachmentName(attachment, attachmentPath, policy, findings);
    if (policy.requireAttachmentBinding && detachedAttachmentStep && !parentTitle) {
      findings.push({
        code: 'ATTACHMENT_NOT_BOUND_TO_STEP',
        path: attachmentPath,
        title: step.name,
        attachmentName: attachment.name,
        message: '附件仅形成独立附件节点，未绑定到产生证据的业务或诊断步骤。',
      });
    }
  }
  for (const [index, child] of (step.steps ?? []).entries()) {
    auditStep(child, `${path}.steps[${index}]`, title || parentTitle, policy, findings);
  }
}

function auditAttachmentName(
  attachment: AllureReportAttachment,
  path: string,
  policy: AllureReportIntegrityPolicy,
  findings: AllureReportIntegrityFinding[],
): void {
  const name = attachment.name?.trim() ?? '';
  if (!name) {
    findings.push({ code: 'MISSING_ATTACHMENT_NAME', path, message: '附件缺少可读名称。' });
    return;
  }
  if (!matches(policy.localizedTextPattern, name)) {
    findings.push({
      code: 'NON_LOCALIZED_ATTACHMENT_NAME',
      path,
      attachmentName: name,
      message: '附件名称不是本地化业务或诊断描述。',
    });
  }
}

function isDetachedAttachmentStep(step: AllureReportStep): boolean {
  const attachments = step.attachments ?? [];
  return attachments.length > 0
    && (!step.status || step.status === 'passed')
    && (step.steps?.length ?? 0) === 0
    && attachments.every((attachment) => attachment.name === step.name);
}

const TRACE_REDACTED_VALUE = '[REDACTED]';
const SENSITIVE_TRACE_FIELD_PATTERN = /^(?:authorization|proxy-authorization|cookie|set-cookie|token|access[-_]?token|refresh[-_]?token|x-api-key|api[-_]?key)$/i;
const BROWSER_STORAGE_ENTRY_COLLECTION_PATTERN = /^(?:cookies|localStorage|sessionStorage)$/i;

export function sanitizePlaywrightTraceText(input: string): { text: string; redactedFields: number } {
  const wholeDocument = parseJson(input);
  if (wholeDocument !== undefined) {
    const redactedFields = redactSensitiveTraceValue(wholeDocument);
    return {
      text: redactedFields > 0 ? JSON.stringify(wholeDocument) : input,
      redactedFields,
    };
  }

  let redactedFields = 0;
  const trailingNewline = input.endsWith('\n');
  const lines = input.split(/\r?\n/);
  if (trailingNewline) lines.pop();
  const sanitized = lines.map((line) => {
    if (!line.trim()) return line;
    const document = parseJson(line);
    if (document === undefined) return line;
    const count = redactSensitiveTraceValue(document);
    redactedFields += count;
    return count > 0 ? JSON.stringify(document) : line;
  });
  return {
    text: `${sanitized.join('\n')}${trailingNewline ? '\n' : ''}`,
    redactedFields,
  };
}

function redactSensitiveTraceValue(value: unknown): number {
  if (Array.isArray(value)) return value.reduce((total, item) => total + redactSensitiveTraceValue(item), 0);
  if (!value || typeof value !== 'object') return 0;
  const record = value as Record<string, unknown>;
  let redactedFields = 0;
  for (const [key, item] of Object.entries(record)) {
    if (BROWSER_STORAGE_ENTRY_COLLECTION_PATTERN.test(key) && Array.isArray(item)) {
      redactedFields += redactBrowserStorageEntryValues(item);
      continue;
    }
    if (SENSITIVE_TRACE_FIELD_PATTERN.test(key)) {
      if (item !== TRACE_REDACTED_VALUE) {
        record[key] = TRACE_REDACTED_VALUE;
        redactedFields += 1;
      }
      continue;
    }
    if ((key === 'name' || key === 'key')
      && typeof item === 'string'
      && SENSITIVE_TRACE_FIELD_PATTERN.test(item)
      && Object.hasOwn(record, 'value')
      && record.value !== TRACE_REDACTED_VALUE) {
      record.value = TRACE_REDACTED_VALUE;
      redactedFields += 1;
    }
    redactedFields += redactSensitiveTraceValue(record[key]);
  }
  return redactedFields;
}

function redactBrowserStorageEntryValues(entries: unknown[]): number {
  let redactedFields = 0;
  for (const entry of entries) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) continue;
    const record = entry as Record<string, unknown>;
    if (Object.hasOwn(record, 'value') && record.value !== TRACE_REDACTED_VALUE) {
      record.value = TRACE_REDACTED_VALUE;
      redactedFields += 1;
    }
    redactedFields += redactSensitiveTraceValue(record);
  }
  return redactedFields;
}

function parseJson(value: string): unknown | undefined {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return undefined;
  }
}

function addGroupedAttachment(
  groups: Map<string, { attachments: AllureReportAttachment[]; start?: number; stop?: number }>,
  attachment: AllureReportAttachment,
  policy: AllureReportIntegrityPolicy,
  start?: number,
  stop?: number,
): void {
  const declaredBinding = parseStepBoundAttachmentName(attachment.name ?? '');
  if (declaredBinding) attachment.name = declaredBinding.attachmentName;
  const title = policy.attachmentGroupTitle(attachment.name ?? '');
  const group = groups.get(title) ?? { attachments: [] };
  group.attachments.push(attachment);
  if (start !== undefined) group.start = group.start === undefined ? start : Math.min(group.start, start);
  if (stop !== undefined) group.stop = group.stop === undefined ? stop : Math.max(group.stop, stop);
  groups.set(title, group);
}

function bindAttachmentToDeclaredStep(
  steps: AllureReportStep[],
  attachment: AllureReportAttachment,
): boolean {
  const binding = parseStepBoundAttachmentName(attachment.name ?? '');
  if (!binding) return false;
  const target = findStepByTitle(steps, binding.stepTitle);
  attachment.name = binding.attachmentName;
  if (!target) return false;
  target.attachments = [...(target.attachments ?? []), attachment];
  return true;
}

function bindFailureAttachmentToFailedStep(
  steps: AllureReportStep[],
  attachment: AllureReportAttachment,
  policy: AllureReportIntegrityPolicy,
): boolean {
  if (!policy.bindFailureAttachmentsToFailedStep
    || !matches(policy.failureAttachmentNamesPattern, attachment.name ?? '')) return false;
  const target = findDeepestFailedStep(steps);
  if (!target) return false;
  const binding = parseStepBoundAttachmentName(attachment.name ?? '');
  if (binding) attachment.name = binding.attachmentName;
  target.attachments = [...(target.attachments ?? []), attachment];
  return true;
}

function findDeepestFailedStep(steps: readonly AllureReportStep[]): AllureReportStep | undefined {
  for (let index = steps.length - 1; index >= 0; index -= 1) {
    const step = steps[index];
    const child = findDeepestFailedStep(step.steps ?? []);
    if (child) return child;
    if (step.status === 'failed' || step.status === 'broken') return step;
  }
  return undefined;
}

function findStepByTitle(steps: readonly AllureReportStep[], title: string): AllureReportStep | undefined {
  for (const step of steps) {
    if (step.name === title) return step;
    const child = findStepByTitle(step.steps ?? [], title);
    if (child) return child;
  }
  return undefined;
}

export function parseStepBoundAttachmentName(name: string): { stepTitle: string; attachmentName: string } | undefined {
  if (!name.startsWith(STEP_ATTACHMENT_BINDING_PREFIX)) return undefined;
  const payload = name.slice(STEP_ATTACHMENT_BINDING_PREFIX.length);
  const lengthSeparator = payload.indexOf(':');
  if (lengthSeparator < 1) return undefined;
  const encodedLength = Number(payload.slice(0, lengthSeparator));
  if (!Number.isInteger(encodedLength) || encodedLength < 1) return undefined;
  const encodedStart = lengthSeparator + 1;
  const encodedTitle = payload.slice(encodedStart, encodedStart + encodedLength);
  if (payload[encodedStart + encodedLength] !== ':') return undefined;
  const attachmentName = payload.slice(encodedStart + encodedLength + 1);
  if (!attachmentName) return undefined;
  try {
    return {
      stepTitle: Buffer.from(encodedTitle, 'base64url').toString('utf8'),
      attachmentName,
    };
  } catch {
    return undefined;
  }
}

function matches(pattern: RegExp, value: string): boolean {
  pattern.lastIndex = 0;
  return pattern.test(value);
}
