import fs from 'node:fs';
import path from 'node:path';
import { fingerprintProductCenterItemImplementation } from '../adapters/product-center/product-center-item-implementation';

type ExecutionCase = {
  caseId: string;
  module: string;
  title: string | null;
  status: 'passed' | 'failed' | 'skipped';
  action?: 'execute' | 'deferred' | 'blocked-source' | 'blocked-technical' | 'product-defect' | 'not-applicable';
  latestAttempt?: { evidencePath?: string | null };
  bindingFingerprint?: string | null;
};

type ExecutionResult = {
  generatedAt: string;
  summary: Record<string, number>;
  evidence?: { reportDiscovery?: 'manifest-index' | 'legacy-directory-scan' };
  executionCases: ExecutionCase[];
  nonExecutionTasks?: ExecutionCase[];
};

type PlaywrightSpec = {
  title?: string;
  ok?: boolean;
  tests?: Array<{ results?: Array<{
    errors?: Array<{ message?: string }>;
    attachments?: Array<{ name?: string; body?: string; contentType?: string }>;
  }> }>;
};

type PlaywrightSuite = {
  suites?: PlaywrightSuite[];
  specs?: PlaywrightSpec[];
};

type PlaywrightReport = {
  suites?: PlaywrightSuite[];
};

type RepairItem = {
  caseId: string;
  module: string;
  title: string | null;
  classification: 'transient-platform' | 'environment-failure' | 'ui-contract-drift' | 'product-behavior' | 'data-factory' | 'needs-diagnostic';
  diagnostic: string;
  evidencePath: string | null;
  evidenceRecordedAt: string | null;
  caseFingerprintAtObservation: string | null;
  implementationFingerprintAtObservation: string | null;
  evidenceStatus: 'complete' | 'incomplete';
  nextAction: string;
};

export type ExecutionRepairQueue = {
  schemaVersion: '2.0.0';
  collectionId: 'product-center-execution-repair-queue';
  generatedAt: string;
  source: string;
  summary: {
    failed: number;
    transientPlatform: number;
    environmentFailure: number;
    uiContractDrift: number;
    productBehavior: number;
    dataFactory: number;
    needsDiagnostic: number;
  };
  items: RepairItem[];
};

const projectRoot = path.resolve(__dirname, '..');
const workspaceRoot = path.resolve(projectRoot, '..');
const sourcePath = path.join(workspaceRoot, 'deliverables/product-center-source-governance/execution-result.json');
const executionPlanPath = path.join(workspaceRoot, 'deliverables/product-center-source-governance/execution-plan.json');
const outputRoot = path.join(workspaceRoot, 'deliverables/test-plan-governance');
const outputJsonPath = path.join(outputRoot, 'product-center-execution-repair-queue.json');
const outputMarkdownPath = path.join(outputRoot, 'product-center-execution-repair-queue.md');

export function buildProductCenterExecutionRepairQueue(input?: {
  executionResult?: ExecutionResult;
  sourcePath?: string;
}): ExecutionRepairQueue {
  const result = input?.executionResult ?? readJson<ExecutionResult>(input?.sourcePath ?? sourcePath);
  const executionPlanTasks = fs.existsSync(executionPlanPath)
    ? new Map(readJson<{ tasks: Array<{ caseId: string; bindingFingerprint?: string | null }> }>(executionPlanPath)
      .tasks.map((item) => [item.caseId, item]))
    : new Map<string, { caseId: string; bindingFingerprint?: string | null }>();
  const authoritativeExecutionCases = result.evidence?.reportDiscovery === 'legacy-directory-scan'
    ? []
    : result.executionCases;
  const nonExecutionTasks = result.nonExecutionTasks ?? [];
  const currentCaseIds = new Set([...authoritativeExecutionCases, ...nonExecutionTasks].map((item) => item.caseId));
  const currentItems = authoritativeExecutionCases
    .filter((item) => item.status === 'failed')
    .map((item) => {
      const evidencePath = item.latestAttempt?.evidencePath ?? null;
      const evidence = findDiagnostic(evidencePath, item.title);
      const classification = classifyProductCenterExecutionDiagnostic(evidence.diagnostic, {
        evidenceComplete: evidence.evidenceComplete,
        productMismatchConfirmed: evidence.productMismatchConfirmed,
        executionPathEquivalent: evidence.executionPathEquivalent,
      });
      const caseFingerprintAtObservation = normalizeFingerprint(
        item.bindingFingerprint ?? executionPlanTasks.get(item.caseId)?.bindingFingerprint,
      );
      const implementationFingerprintAtObservation = item.caseId.startsWith('TC-ITEM-')
        ? normalizeFingerprint(fingerprintProductCenterItemImplementation(projectRoot, item.caseId))
        : null;
      const evidenceStatus = classification === 'product-behavior'
        && evidence.complete
        && evidence.cleanupComplete
        && Boolean(caseFingerprintAtObservation)
        && Boolean(implementationFingerprintAtObservation)
        ? 'complete' as const
        : 'incomplete' as const;
      return {
        caseId: item.caseId,
        module: item.module,
        title: item.title,
        classification,
        diagnostic: evidence.diagnostic,
        evidencePath,
        evidenceRecordedAt: evidence.recordedAt,
        caseFingerprintAtObservation,
        implementationFingerprintAtObservation,
        evidenceStatus,
        nextAction: nextActionFor(classification),
      } satisfies RepairItem;
    });
  const previousQueueItems = process.env.PC_REPAIR_QUEUE_RESET === 'true' || !fs.existsSync(outputJsonPath)
    ? []
    : readJson<ExecutionRepairQueue>(outputJsonPath).items;
  const currentProductDefects = new Map(nonExecutionTasks
    .filter((item) => item.action === 'product-defect')
    .map((item) => [item.caseId, item]));
  const carriedProductDefects = previousQueueItems
    .filter((item) => item.classification === 'product-behavior' && currentProductDefects.has(item.caseId))
    .map((item) => {
      const executionCase = currentProductDefects.get(item.caseId)!;
      const evidence = findDiagnostic(item.evidencePath, executionCase.title);
      const caseFingerprintAtObservation = normalizeFingerprint(
        executionCase.bindingFingerprint ?? executionPlanTasks.get(item.caseId)?.bindingFingerprint,
      );
      const implementationFingerprintAtObservation = item.caseId.startsWith('TC-ITEM-')
        ? normalizeFingerprint(fingerprintProductCenterItemImplementation(projectRoot, item.caseId))
        : null;
      return {
        ...item,
        caseFingerprintAtObservation,
        implementationFingerprintAtObservation,
        evidenceStatus: evidence.complete && evidence.cleanupComplete
          && Boolean(caseFingerprintAtObservation) && Boolean(implementationFingerprintAtObservation)
          ? 'complete' as const
          : 'incomplete' as const,
      };
    });
  const previousItems = previousQueueItems
      .filter((item) => !currentCaseIds.has(item.caseId)
        && item.evidenceStatus === 'complete'
        && Boolean(item.caseFingerprintAtObservation)
        && Boolean(item.implementationFingerprintAtObservation)
        && Boolean(item.evidencePath));
  const items = [...currentItems, ...carriedProductDefects, ...previousItems]
    .sort((left, right) => left.caseId.localeCompare(right.caseId));
  const summary = {
    failed: items.length,
    transientPlatform: items.filter((item) => item.classification === 'transient-platform').length,
    environmentFailure: items.filter((item) => item.classification === 'environment-failure').length,
    uiContractDrift: items.filter((item) => item.classification === 'ui-contract-drift').length,
    productBehavior: items.filter((item) => item.classification === 'product-behavior').length,
    dataFactory: items.filter((item) => item.classification === 'data-factory').length,
    needsDiagnostic: items.filter((item) => item.classification === 'needs-diagnostic').length,
  };
  return {
    schemaVersion: '2.0.0',
    collectionId: 'product-center-execution-repair-queue',
    generatedAt: new Date().toISOString(),
    source: path.relative(workspaceRoot, input?.sourcePath ?? sourcePath),
    summary,
    items,
  };
}

function findDiagnostic(evidencePath: string | null | undefined, title: string | null): {
  diagnostic: string;
  recordedAt: string | null;
  complete: boolean;
  cleanupComplete: boolean;
  evidenceComplete: boolean;
  productMismatchConfirmed: boolean;
  executionPathEquivalent: boolean;
} {
  if (!evidencePath) return {
    diagnostic: '执行报告未提供证据路径。', recordedAt: null, complete: false, cleanupComplete: false,
    evidenceComplete: false, productMismatchConfirmed: false, executionPathEquivalent: false,
  };
  const reportPath = resolveReportPath(evidencePath);
  if (!fs.existsSync(reportPath)) return {
    diagnostic: `执行报告不存在：${evidencePath}`, recordedAt: null, complete: false, cleanupComplete: false,
    evidenceComplete: false, productMismatchConfirmed: false, executionPathEquivalent: false,
  };
  const report = readJson<PlaywrightReport>(reportPath);
  const spec = findSpec(report.suites ?? [], title);
  const result = spec?.tests?.[0]?.results?.at(-1);
  const diagnostic = result?.errors?.[0]?.message?.trim() ?? '失败收据未提供错误诊断。';
  const productDifference = readProductDifferenceEvidence(result?.attachments ?? []);
  return {
    diagnostic,
    recordedAt: typeof (result as { startTime?: unknown } | undefined)?.startTime === 'string'
      ? String((result as { startTime?: string }).startTime)
      : null,
    complete: Boolean(result?.errors?.[0]?.message),
    cleanupComplete: hasVerifiedZeroCleanup(result?.attachments ?? []),
    ...productDifference,
  };
}

function readProductDifferenceEvidence(attachments: Array<{ name?: string; body?: string; contentType?: string }>): {
  evidenceComplete: boolean;
  productMismatchConfirmed: boolean;
  executionPathEquivalent: boolean;
} {
  const attachment = attachments.find((candidate) => (
    (candidate.name === 'product-center-product-difference-evidence'
      || candidate.name === 'product-center-group-product-difference-evidence')
    && candidate.contentType === 'application/json'
    && Boolean(candidate.body)
  ));
  if (!attachment?.body) return {
    evidenceComplete: false, productMismatchConfirmed: false, executionPathEquivalent: false,
  };
  try {
    const evidence = JSON.parse(Buffer.from(attachment.body, 'base64').toString('utf8')) as Record<string, unknown>;
    return {
      evidenceComplete: evidence.evidenceComplete === true,
      productMismatchConfirmed: evidence.productMismatchConfirmed === true,
      executionPathEquivalent: evidence.executionPathEquivalent === true,
    };
  } catch {
    return { evidenceComplete: false, productMismatchConfirmed: false, executionPathEquivalent: false };
  }
}

function hasVerifiedZeroCleanup(attachments: Array<{ name?: string; body?: string; contentType?: string }>): boolean {
  return attachments.some((attachment) => {
    if (attachment.contentType !== 'application/json' || !attachment.body) return false;
    try {
      const payload = JSON.parse(Buffer.from(attachment.body, 'base64').toString('utf8')) as {
        verifiedZero?: unknown;
        cleanup?: { apiZeroResidue?: unknown; uiZeroResidue?: unknown; uiVerificationObserved?: unknown };
      };
      if (attachment.name?.endsWith('-cleanup-evidence')) return payload.verifiedZero === true;
      // Standard execution receipts carry cleanup proof inline.  Treat it as
      // equivalent to the legacy standalone cleanup attachment only when all
      // API/UI zero-residue and UI-observation fields are explicitly true.
      return attachment.name === 'test-execution-receipt'
        && payload.cleanup?.apiZeroResidue === true
        && payload.cleanup.uiZeroResidue === true
        && payload.cleanup.uiVerificationObserved === true;
    } catch {
      return false;
    }
  });
}

function findSpec(suites: PlaywrightSuite[], title: string | null): PlaywrightSpec | null {
  for (const suite of suites) {
    const match = suite.specs?.find((spec) => spec.title === title);
    if (match) return match;
    const nested = findSpec(suite.suites ?? [], title);
    if (nested) return nested;
  }
  return null;
}

function resolveReportPath(reference: string): string {
  if (path.isAbsolute(reference)) return reference;
  return path.resolve(workspaceRoot, reference);
}

export function classifyProductCenterExecutionDiagnostic(
  diagnostic: string,
  evidence: {
    evidenceComplete?: boolean;
    productMismatchConfirmed?: boolean;
    executionPathEquivalent?: boolean;
  } = {},
): RepairItem['classification'] {
  if (/403|forbidden|无权限|permissions-loading|authentication|authenticated merchant|login required|auth(?:entication)?(?: stage| flow)? failed/i.test(diagnostic)) {
    return 'environment-failure';
  }
  if (/语言菜单项|中文界面|locale|语言.*(?:就绪|切换)|permissions.*(?:未|不可)/i.test(diagnostic)) {
    return 'environment-failure';
  }
  if (/429|too many requests|econnreset|etimedout|connection reset|socket hang up|network error|fetch failed|page\.goto:\s*Timeout/i.test(diagnostic)) {
    return 'transient-platform';
  }
  if (/上传 operation 完成后未找到唯一品牌图片|图片工厂|fixture identity|资源唯一索引/i.test(diagnostic)) {
    return 'data-factory';
  }
  if (evidence.evidenceComplete === true
    && evidence.productMismatchConfirmed === true
    && evidence.executionPathEquivalent === true) {
    return 'product-behavior';
  }
  if (/product[_-]behavior[_-]confirmed\b|产品行为证据完整/i.test(diagnostic)) {
    return 'product-behavior';
  }
  if (/Expected pattern|Expected\s+-|Received\s+\+|data:image\/svg|WAIT_UNTIL_(?:CONDITION|PROBE)_TIMEOUT|missing|缺少|not found|未找到|not visible|不可见|not stable|未稳定|locator|定位|column|菜单项|surface-unavailable|route|未出现唯一.*按钮|UI 数量未达到/i.test(diagnostic)) {
    return 'ui-contract-drift';
  }
  return 'needs-diagnostic';
}

function normalizeFingerprint(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().replace(/^sha256:/i, '').toLowerCase();
  return /^[a-f0-9]{64}$/.test(normalized) ? normalized : null;
}

function nextActionFor(classification: RepairItem['classification']): string {
  if (classification === 'transient-platform') return '仅对幂等读操作按退避策略重试；不得重放创建、保存、删除或停用。';
  if (classification === 'environment-failure') return '记录权限、认证或语言环境阻断；环境恢复后仅定向重跑，不判定为产品缺陷。';
  if (classification === 'ui-contract-drift') return '重新审计当前页面控件与路由，修复绑定后定向重跑。';
  if (classification === 'product-behavior') return '保留页面、API、清理证据，确认产品修复或更新精确预期后定向重跑。';
  if (classification === 'data-factory') return '修复数据工厂的服务端 ID/资源唯一索引和清理校验后定向重跑。';
  return '补充诊断证据后再决定重跑、产品偏差或技术阻断。';
}

export function writeProductCenterExecutionRepairQueue(queue: ExecutionRepairQueue): void {
  writeJson(outputJsonPath, queue);
  writeMarkdown(queue);
}

function writeJson(filePath: string, value: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.tmp`;
  fs.writeFileSync(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  fs.renameSync(temporaryPath, filePath);
}

function writeMarkdown(queue: ExecutionRepairQueue): void {
  const lines = [
    '# 商品中心执行修复队列',
    '',
    `生成时间：${queue.generatedAt}`,
    '',
    `- 失败：${queue.summary.failed}`,
    `- 瞬时平台失败：${queue.summary.transientPlatform}`,
    `- 环境失败：${queue.summary.environmentFailure}`,
    `- UI 合同漂移：${queue.summary.uiContractDrift}`,
    `- 产品行为偏差：${queue.summary.productBehavior}`,
    `- 数据工厂问题：${queue.summary.dataFactory}`,
    `- 待诊断：${queue.summary.needsDiagnostic}`,
    '',
    '| 用例 | 分类 | 诊断 | 下一动作 |',
    '| --- | --- | --- | --- |',
    ...queue.items.map((item) => `| ${item.caseId} | ${item.classification} | ${item.diagnostic.replace(/\r?\n/g, ' ').replace(/\|/g, '\\|').slice(0, 240)} | ${item.nextAction} |`),
    '',
  ];
  fs.writeFileSync(outputMarkdownPath, `${lines.join('\n')}\n`, 'utf8');
}

function readJson<T>(filePath: string): T {
  return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T;
}

if (require.main === module) {
  const queue = buildProductCenterExecutionRepairQueue();
  writeProductCenterExecutionRepairQueue(queue);
  process.stdout.write(`${JSON.stringify(queue, null, 2)}\n`);
}
