import fs from 'node:fs';
import { publishImmutableArtifact } from '../utils/immutable-artifact';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { hasCurrentReverseScenarioEvidenceQueue } from './build-product-center-reverse-scenario-evidence-queue';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));

type GovernanceTask = {
  taskId: string;
  priority: string;
  status: string;
  purpose: string;
  blockers?: string[];
  downstreamImpact?: Record<string, unknown>;
};

const projectRoot = path.resolve(scriptDirectory, '..');
const workspaceRoot = path.resolve(projectRoot, '..');
const governancePath = path.join(projectRoot, 'output/governance/product-center-business-rule-governance-optimization.json');
const gitJenkinsPath = path.join(projectRoot, 'output/governance/product-center-git-jenkins-integration-audit.json');
const maintainabilityPath = path.join(projectRoot, 'output/quality/product-center-maintainability-report.json');
const maintainabilityApiSnapshotPath = path.join(projectRoot, 'output/quality/product-center-maintainability-api-snapshot.json');
const maintainabilityPlanPath = path.join(projectRoot, 'output/quality/product-center-maintainability-responsibility-plan.json');
const outputRoot = path.join(workspaceRoot, 'deliverables/test-plan-governance');
const outputJsonPath = path.join(outputRoot, 'product-center-governance-execution-task-queue-v1.json');
const outputMarkdownPath = path.join(outputRoot, 'product-center-governance-execution-task-queue-v1.md');

const staticReportByTask: Record<string, string[]> = {
  'BRG-OPT-004': ['Merchant Center UITest/output/governance/product-center-git-jenkins-integration-audit.json'],
  'BRG-OPT-011': ['Merchant Center UITest/output/governance/product-center-git-jenkins-integration-audit.json'],
  'BRG-OPT-016': [
    'deliverables/test-plan-governance/product-center-business-rule-time-context-evidence.json',
    'deliverables/test-plan-governance/product-center-business-rule-time-context-review.json',
  ],
  'BRG-OPT-022': ['deliverables/test-plan-governance/product-center-delegated-rule-approval-plan.json'],
  'BRG-OPT-024': [
    'deliverables/test-plan-governance/product-center-business-rule-promotion-readiness.json',
    'deliverables/test-plan-governance/product-center-business-rule-promotion-batch-plan.json',
    'deliverables/test-plan-governance/product-center-business-rule-optimization-completion.json',
  ],
  'BRG-OPT-020': ['deliverables/test-plan-governance/product-center-document-rule-promotion-plan.json'],
  'BRG-OPT-021': ['deliverables/test-plan-governance/product-center-business-rule-promotion-batch-plan.json'],
  'BRG-OPT-023': ['Merchant Center UITest/output/governance/product-center-business-rule-coverage.json'],
  'BRG-OPT-025': ['deliverables/test-plan-governance/product-center-business-rule-confirmation-queue.json'],
  'BRG-OPT-026': ['deliverables/test-plan-governance/product-center-business-rule-optimization-completion.json'],
  'PC-MAINTAINABILITY': [
    'Merchant Center UITest/output/quality/product-center-maintainability-report.json',
    'Merchant Center UITest/output/quality/product-center-maintainability-responsibility-plan.json',
    'Merchant Center UITest/output/quality/product-center-maintainability-isolation-snapshot.json',
    'Merchant Center UITest/output/quality/product-center-maintainability-behavior-contract.json',
    'Merchant Center UITest/utils/product-center-group-runner-helpers.ts',
    'Merchant Center UITest/adapters/product-center/product-center-group-combo-v2-cases.ts',
    'Merchant Center UITest/adapters/product-center/product-center-group-combo-v2-support.ts',
    'Merchant Center UITest/deliverables/system-test-platform/group-runner-extraction-proof.json',
  ],
};

const commandByTask: Record<string, string[]> = {
  'BRG-OPT-004': ['npm run audit:product-center:git-jenkins'],
  'BRG-OPT-005': [],
  'BRG-OPT-006': [],
  'BRG-OPT-008': [],
  'BRG-OPT-011': ['npm run audit:product-center:git-jenkins'],
  'BRG-OPT-016': ['npm run build:product-center:business-rule-time-context-review'],
  'BRG-OPT-022': ['npm run build:product-center:delegated-rule-approval-plan'],
  'BRG-OPT-024': [
    'npm run build:product-center:business-rule-promotion-readiness',
    'npm run build:product-center:business-rule-promotion-batch-plan',
    'npm run build:product-center:business-rule-optimization-completion',
  ],
  'BRG-OPT-020': ['npm run build:product-center:document-rule-promotion-plan'],
  'BRG-OPT-021': ['npm run build:product-center:business-rule-promotion-batch-plan'],
  'BRG-OPT-023': ['npm run build:product-center:business-rule-coverage'],
  'BRG-OPT-025': ['npm exec -- tsx scripts/build-product-center-business-rule-confirmation-queue.ts'],
  'BRG-OPT-026': ['npm run build:product-center:business-rule-optimization-completion'],
};

export function buildProductCenterGovernanceExecutionTaskQueue() {
  const governance = readRequiredJson<{ assessment: { fingerprint: string }; tasks: GovernanceTask[] }>(governancePath, 'GOVERNANCE_OPTIMIZATION_REPORT_MISSING');
  const integrationAudit = readOptionalJson(gitJenkinsPath);
  const maintainability = readOptionalJson<{ summary?: { highPriorityFiles?: number; directIdentityTemplates?: number } }>(maintainabilityPath);
  const maintainabilitySummary = maintainability?.summary ?? {};
  const maintainabilityApi = readOptionalJson<{ summary?: { publicSurfaceCount?: number }; files?: Array<{ classes?: Array<{ methods?: unknown[] }>; exportedFunctions?: unknown[] }> }>(maintainabilityApiSnapshotPath);
  const maintainabilityPlan = readOptionalJson<{ summary?: { completedExtractionCount?: number } }>(maintainabilityPlanPath);
  const completedExtractionCount = maintainabilityPlan?.summary?.completedExtractionCount ?? 0;
  const publicSurfaceCount = maintainabilityApi?.summary?.publicSurfaceCount ?? maintainabilityApi?.files?.reduce((total, file) => total
    + (file.classes ?? []).reduce((count, klass) => count + (klass.methods?.length ?? 0), 0)
    + (file.exportedFunctions?.length ?? 0), 0);
  const openTasks = governance.tasks.filter((task) => task.status !== 'completed');
  const tasks = [
    buildTechnicalQueueTask('PC-ITEM-RELEASE-RECEIPT', '商品当前发布收据准入', '核对正式正文、重建稿和生成声明的来源差异；已批准派生稿不能直接授权改写正文。执行代理继续补齐当前逐案操作与上下文合同，并验收实际收据，不转交技术映射缺口或伪造合同。', 'static-executed-awaiting-current-contract', 'npm run audit:product-center:item-source-derivation; npm run audit:product-center:item-release-readiness', ['Merchant Center UITest/deliverables/system-test-platform/product-center-item-release-readiness.json', 'Merchant Center UITest/deliverables/system-test-platform/product-center-item-source-derivation-audit.json']),
    ...openTasks.map((task) => buildQueueTask(task, integrationAudit)),
    buildTechnicalQueueTask('PC-REV-READINESS', '反向场景就绪', '逐场景证据队列已生成；缺真实项目适配器、标准操作/断言/清理收据和 execution grant。', 'static-executed-awaiting-runtime-evidence', 'npm run build:process-reverse-scenario-readiness; npm run build:product-center:reverse-scenario-evidence-queue', ['deliverables/test-plan-governance/product-center-reverse-scenario-readiness-v1.json', 'deliverables/test-plan-governance/product-center-reverse-scenario-evidence-queue-v1.json']),
    buildTechnicalQueueTask('PC-HIST-LINEAGE', '历史收据血缘', '历史收据兼容性报告缺失时保持开放，禁止以协调报告或 blocked 诊断冒充正式兼容性结果。', 'static-executed-awaiting-precondition', 'npm run reconcile:test-plan:evidence; npm run audit:test-plan:historical-receipt-compatibility', ['deliverables/test-plan-governance/product-center-historical-evidence-reconciliation.json', 'deliverables/test-plan-governance/product-center-historical-receipt-compatibility.json']),
    buildTechnicalQueueTask('PC-PAGE-CONTRACT', '页面合同技术复验', '页面合同正式 diff/impact 或当前评审队列缺失时保持开放，blocked 诊断不计为正式证据。', 'static-executed-awaiting-current-release-evidence', 'npm run build:page-contract-finding-review-queue', ['Merchant Center UITest/output/page-contract/product-center-page-contract-finding-review-queue.json']),
    buildTechnicalQueueTask(
      'PC-MAINTAINABILITY',
      '维护性债务',
      `${maintainabilitySummary.highPriorityFiles ?? '未知'} 个高优先级文件、${maintainabilitySummary.directIdentityTemplates ?? '未知'} 个 direct identity templates、${publicSurfaceCount ?? '未知'} 个公开接口；已完成 ${completedExtractionCount} 个纯职责抽离，职责计划、区域隔离快照和逐接口行为合同已完成，剩余区域仍需兼容 facade 评审后实施工程拆分。`,
      'engineering-refactor-backlog',
      'npm run audit:product-center:maintainability',
      staticReportByTask['PC-MAINTAINABILITY'],
    ),
  ];
  const report = {
    schemaVersion: '1.0.0',
    reportId: 'product-center-governance-execution-task-queue-v1',
    generatedAt: new Date().toISOString(),
    scope: 'project-adapter+generated-evidence',
    source: {
      governanceReport: 'Merchant Center UITest/output/governance/product-center-business-rule-governance-optimization.json',
      governanceFingerprint: governance.assessment.fingerprint,
      integrationAudit: integrationAudit ? 'Merchant Center UITest/output/governance/product-center-git-jenkins-integration-audit.json' : null,
    },
    summary: {
      totalOpenTasks: tasks.filter((task) => task.closureStatus !== 'closed').length,
      staticTasksRun: tasks.filter((task) => task.staticExecutionCompleted).length,
      staticAwaitingExternalRuntime: tasks.filter((task) => task.disposition === 'static-complete-awaiting-external-runtime').length,
      awaitingExternalConnector: tasks.filter((task) => task.disposition === 'awaiting-external-connector').length,
      deferredExplicitStart: tasks.filter((task) => task.disposition === 'deferred-explicit-start').length,
      awaitingExecutionGrant: tasks.filter((task) => task.disposition === 'awaiting-execution-grant' || task.disposition === 'static-executed-awaiting-execution-grant').length,
      businessSemanticManualTasks: tasks.filter((task) => task.businessSemanticManualRequired).length,
      closedStaticTasks: tasks.filter((task) => task.closureStatus === 'closed').length,
    },
    policy: {
      jenkinsInfoRequiredForRuntimeTriggerOnly: true,
      businessExecutionStarted: false,
      existingPassedCasesInvalidated: false,
      formalRulesModified: false,
      missingEvidenceMayNotBeInferred: true,
      onlyRealBusinessSemanticConflictMayEnterManualQueue: true,
    },
    tasks,
  };
  writeJson(outputJsonPath, report);
  writeText(outputMarkdownPath, renderMarkdown(report));
  return report;
}

function readRequiredJson<T>(filePath: string, code: string): T {
  if (!fs.existsSync(filePath)) {
    throw new Error(`${code}:${path.relative(projectRoot, filePath).replaceAll(path.sep, '/')}`);
  }
  return readJson<T>(filePath);
}

function buildQueueTask(task: GovernanceTask, integrationAudit: any) {
  const taskId = task.taskId;
  const reports = staticReportByTask[taskId] ?? [];
  const reportsPresent = reports.length > 0 && reports.every((relative) => fs.existsSync(path.join(workspaceRoot, relative)));
  let disposition: string;
  let executionAllowed: 'static-only' | 'external-only' | 'none';
  let reason: string;
  let closureStatus: 'open' | 'closed' = 'open';
  const businessSemanticManualRequired = false;
  switch (taskId) {
    case 'BRG-OPT-004':
      disposition = reportsPresent ? 'static-complete-awaiting-external-runtime' : 'static-auto-ready';
      executionAllowed = 'static-only';
      reason = 'Git 固定版本和供应链门禁已静态检查；运行态仍取决于 CI 环境变量和只读凭据。';
      break;
    case 'BRG-OPT-005':
      disposition = 'awaiting-external-connector';
      executionAllowed = 'external-only';
      reason = 'PRD 系统连接器和稳定来源格式未配置，不能虚构来源或编译结果。';
      break;
    case 'BRG-OPT-006':
      disposition = 'awaiting-external-connector';
      executionAllowed = 'external-only';
      reason = '通知通道未配置；属于可选外部集成，不影响商品中心交付。';
      break;
    case 'BRG-OPT-008':
      disposition = 'deferred-explicit-start';
      executionAllowed = 'none';
      reason = '跨 applicationId 真实试点必须由用户明确启动，且需目标系统认证、可逆数据和标准收据。';
      break;
    case 'BRG-OPT-011':
      disposition = reportsPresent ? 'static-complete-awaiting-external-runtime' : 'static-auto-ready';
      executionAllowed = 'static-only';
      reason = `Jenkinsfile 与静态审计合同已验证；当前运行态为 ${integrationAudit?.runtimeConnection?.jenkins?.status ?? 'unknown'}，不因缺少连接信息重做本地静态任务。`;
      break;
    case 'BRG-OPT-016':
      disposition = reportsPresent ? 'static-executed-awaiting-evidence' : 'static-auto-ready';
      executionAllowed = 'static-only';
      reason = '仅扫描规则、绑定和标准收据补齐时间/上下文证据，不修改规则语义、不启动业务用例。';
      break;
    case 'BRG-OPT-022':
      disposition = reportsPresent ? 'static-executed-awaiting-formal-decision' : 'static-auto-ready';
      executionAllowed = 'static-only';
      reason = '仅生成低风险代理晋级预审计划；正式规则写入仍需已有批准收据，禁止由报告臆造批准。';
      break;
    case 'BRG-OPT-024':
      disposition = reportsPresent ? 'static-executed-awaiting-execution-grant' : 'awaiting-execution-grant';
      executionAllowed = 'none';
      reason = '已生成最小验证候选和完成门禁；真实 UI/API 执行必须有公共 execution grant、精确 caseId 和标准清理收据。';
      break;
    case 'BRG-OPT-020':
      disposition = reportsPresent ? 'static-executed-awaiting-evidence' : 'static-auto-ready';
      executionAllowed = 'static-only';
      reason = '文档规则来源、结构和义务已生成标准化计划；22 条来源修复、69 条用例设计和 37 条收据关联仍需证据补齐，不自动晋级正式规则。';
      break;
    case 'BRG-OPT-021':
      disposition = reportsPresent ? 'static-executed-awaiting-downstream' : 'static-auto-ready';
      executionAllowed = 'static-only';
      reason = '规则族、风险等级和冲突簇已静态分流；当前候选仍需按批前置条件和当前收据继续处理。';
      break;
    case 'BRG-OPT-023':
      disposition = reportsPresent ? 'static-executed-awaiting-evidence' : 'static-auto-ready';
      executionAllowed = 'static-only';
      reason = '义务级覆盖已静态生成；151/151 必选义务结构覆盖通过，但当前执行验证仍为 0，不将结构覆盖当作运行通过。';
      break;
    case 'BRG-OPT-025':
      {
        const confirmation = reportsPresent
          ? readJson<{ summary?: { total?: number } }>(path.join(workspaceRoot, 'deliverables/test-plan-governance/product-center-business-rule-confirmation-queue.json'))
          : undefined;
        const noBusinessDecision = confirmation?.summary?.total === 0;
        disposition = noBusinessDecision ? 'closed-static' : reportsPresent ? 'static-executed-awaiting-decision' : 'static-auto-ready';
        closureStatus = noBusinessDecision ? 'closed' : 'open';
      }
      executionAllowed = 'static-only';
      reason = closureStatus === 'closed'
        ? '业务确认队列已生成且当前待确认数量为 0；本轮无真实业务语义裁决项。未来新冲突仍按人工边界进入裁决，不转交技术缺口。'
        : '业务确认队列待生成或仍有待确认项；真实语义冲突按人工边界进入裁决，不转交技术缺口。';
      break;
    case 'BRG-OPT-026':
      disposition = reportsPresent ? 'static-executed-awaiting-execution-grant' : 'awaiting-execution-grant';
      executionAllowed = 'none';
      reason = '公共优化完成门禁已接入并生成当前 incomplete 结果；中风险最小验证仍需 execution grant，不能以静态结果放行。';
      break;
    default:
      disposition = 'awaiting-execution-grant';
      executionAllowed = 'none';
      reason = '未识别的未闭环任务保持受控，不自动推断执行权限。';
  }
  return {
    taskId,
    sourceStatus: task.status,
    priority: task.priority,
    purpose: task.purpose,
    blockers: task.blockers ?? [],
    disposition,
    executionAllowed,
    commands: commandByTask[taskId] ?? [],
    staticEvidenceRefs: reports,
    staticEvidencePresent: reportsPresent,
    staticExecutionCompleted: reportsPresent && (commandByTask[taskId]?.length ?? 0) > 0,
    closureStatus,
    reason,
    businessSemanticManualRequired,
    passedCasesImpact: task.downstreamImpact?.passedCases ?? 'preserved',
    rerunCaseIds: task.downstreamImpact?.rerunCaseIds ?? [],
    guardrails: {
      businessExecutionStarted: false,
      formalRulesModified: false,
      existingPassedCasesInvalidated: false,
    },
  };
}

function buildTechnicalQueueTask(taskId: string, purpose: string, reason: string, disposition: string, command: string, refs: string[]) {
  const refsPresent = refs.length > 0 && refs.every((reference) => fs.existsSync(path.join(workspaceRoot, reference)))
    && (taskId !== 'PC-REV-READINESS' || hasCurrentReverseScenarioEvidenceQueue(projectRoot));
  const blockedDiagnosticOnly = refs.some((reference) => reference.endsWith('product-center-page-contract-finding-review-queue.json'))
    && !refsPresent
    && fs.existsSync(path.join(projectRoot, 'output/page-contract/product-center-page-contract-finding-review-queue.blocked.json'));
  const closed = disposition === 'closed-static' && refsPresent && !blockedDiagnosticOnly;
  const effectiveDisposition = closed ? 'closed-static' : (refsPresent ? disposition : 'static-executed-awaiting-precondition');
  return {
    taskId,
    sourceStatus: closed ? 'completed' : 'open',
    priority: 'must',
    purpose,
    blockers: [],
    disposition: effectiveDisposition,
    executionAllowed: 'static-only' as const,
    commands: [command],
    staticEvidenceRefs: refs,
    staticEvidencePresent: refsPresent,
    staticExecutionCompleted: refsPresent,
    closureStatus: closed ? 'closed' : 'open',
    reason: refsPresent ? reason : `${reason} 当前正式证据未齐全。`,
    businessSemanticManualRequired: false,
    passedCasesImpact: 'preserved',
    rerunCaseIds: [],
    guardrails: { businessExecutionStarted: false, formalRulesModified: false, existingPassedCasesInvalidated: false },
  };
}

function renderMarkdown(report: any): string {
  const lines = [
    '# 商品中心未闭环治理执行任务队列', '',
    `- 未闭环任务：${report.summary.totalOpenTasks}`,
    `- 已执行但仍未闭环的安全静态任务：${report.summary.staticTasksRun}`,
    `- 等待外部运行态：${report.summary.staticAwaitingExternalRuntime}`,
    `- 等待外部连接器：${report.summary.awaitingExternalConnector}`,
    `- 明确启动门禁：${report.summary.deferredExplicitStart}`,
    `- 等待执行授权：${report.summary.awaitingExecutionGrant}`,
    `- 真实业务语义人工项：${report.summary.businessSemanticManualTasks}`,
    '',
    '| 任务 | 原状态 | 当前处置 | 可执行范围 | 原因 |', '|---|---|---|---|---|',
    ...report.tasks.map((task: any) => `| ${task.taskId} | ${task.sourceStatus} | ${task.disposition} | ${task.executionAllowed} | ${task.reason} |`),
    '',
    'Jenkins 信息仅用于外部运行态触发和回执验证；本地静态任务不以 Jenkins 连通为前置条件。',
    '本队列不授权业务执行、不修改正式业务规则、不使现有通过用例失效。',
    '',
  ];
  return lines.join('\n');
}

function readJson<T>(filePath: string): T { return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T; }
function readOptionalJson(filePath: string): any | null { return fs.existsSync(filePath) ? readJson<any>(filePath) : null; }
function writeJson(filePath: string, value: unknown): void { writeText(filePath, `${JSON.stringify(value, null, 2)}\n`); }
function writeText(filePath: string, value: string): void {
  publishImmutableArtifact({ outputRoot: workspaceRoot, relativePath: path.relative(workspaceRoot, filePath),
    content: value, reason: 'refresh-governance-execution-queue' });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const report = buildProductCenterGovernanceExecutionTaskQueue();
    process.stdout.write(`${JSON.stringify({ status: 'generated', summary: report.summary })}\n`);
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
