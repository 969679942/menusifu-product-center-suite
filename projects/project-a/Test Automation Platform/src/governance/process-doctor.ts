export type ProcessDoctorFinding = {
  findingId: string;
  category: string;
  severity: 'P0' | 'P1' | 'P2';
  status: 'open' | 'deferred' | 'informational';
  evidence: string[];
  owner: string;
  nextAction: string;
  expectedImpact: string;
  resultImpact: 'unchanged' | 'revalidation-required' | 'governance-only';
};

export type ProcessDoctorSnapshot = {
  scope: string;
  pageContract?: { status?: string; findings?: number; evidencePath: string };
  technicalApproval?: { pending?: number; evidencePath: string };
  sourceGovernance?: { currentGoalBlockingCases?: number; evidencePath: string };
  migration?: { status?: string; unowned?: number; bridgeViolations?: number; inventoryChanged?: number; evidencePath: string };
  maintainability?: { highPriorityFiles?: number; baselineMaxHighPriorityFiles?: number; directIdentityTemplates?: number; evidencePath: string };
  readiness?: { status?: string; crossSystemReady?: boolean; readinessPath: string; verdictPath: string };
  checkpointGaps?: Array<{ file: string; gaps: string[] }>;
  labels?: Partial<Record<'projectOwner' | 'approvalOwner' | 'sourceOwner' | 'migrationOwner' | 'maintenanceOwner' | 'pilotOwner', string>>;
  guardrails?: { crossSystemPilot?: string; businessUiWrites?: boolean; rerunPassedCases?: boolean };
};

export type ProcessDoctorReport = {
  schemaVersion: '1.0.0';
  generatedAt: string;
  scope: string;
  executionScope: 'report-only';
  guardrails: Required<NonNullable<ProcessDoctorSnapshot['guardrails']>>;
  summary: { status: 'blocked' | 'open-findings' | 'clear'; totalFindings: number; open: number; deferred: number };
  findings: ProcessDoctorFinding[];
  checkpointGaps: Array<{ file: string; gaps: string[] }>;
  conclusions: string[];
};

export function buildProcessDoctorReport(snapshot: ProcessDoctorSnapshot, generatedAt = new Date().toISOString()): ProcessDoctorReport {
  const labels = {
    projectOwner: '项目自动化负责人', approvalOwner: '技术绑定审批人', sourceOwner: '各模块产品负责人',
    migrationOwner: '平台迁移责任人', maintenanceOwner: '自动化开发负责人', pilotOwner: '平台明确启动人',
    ...snapshot.labels,
  };
  const findings: ProcessDoctorFinding[] = [];
  const add = (finding: ProcessDoctorFinding) => findings.push(finding);
  if (snapshot.pageContract && (snapshot.pageContract.status === 'review-required' || (snapshot.pageContract.findings ?? 0) > 0)) add({ findingId: 'PAGE-CONTRACT-DRIFT', category: '页面合同偏移', severity: 'P1', status: 'open', evidence: [snapshot.pageContract.evidencePath, `findings=${snapshot.pageContract.findings ?? 0}`], owner: labels.projectOwner, nextAction: '逐条确认技术指纹变化是否影响业务语义；仅对受影响用例安排定向重验', expectedImpact: '避免旧定位器或发布证据被误复用', resultImpact: 'revalidation-required' });
  if (snapshot.technicalApproval && (snapshot.technicalApproval.pending ?? 0) > 0) add({ findingId: 'TECHNICAL-BINDING-APPROVAL', category: '技术绑定审批', severity: 'P1', status: 'open', evidence: [snapshot.technicalApproval.evidencePath, `pending=${snapshot.technicalApproval.pending}`], owner: labels.approvalOwner, nextAction: '基于最新页面观察指纹逐条审批；拒绝项进入补证或修复队列', expectedImpact: '防止未审批绑定进入正式运行', resultImpact: 'governance-only' });
  if (snapshot.sourceGovernance && (snapshot.sourceGovernance.currentGoalBlockingCases ?? 0) > 0) add({ findingId: 'SOURCE-BLOCKED', category: '来源阻断', severity: 'P1', status: 'open', evidence: [snapshot.sourceGovernance.evidencePath, `currentGoalBlockingCases=${snapshot.sourceGovernance.currentGoalBlockingCases}`], owner: labels.sourceOwner, nextAction: '补齐可审计来源或明确延期；不得用经验补写规则', expectedImpact: '解除测试方案生成与追溯阻断', resultImpact: 'governance-only' });
  if (snapshot.migration && (snapshot.migration.status !== 'complete' || (snapshot.migration.unowned ?? 0) > 0 || (snapshot.migration.bridgeViolations ?? 0) > 0 || (snapshot.migration.inventoryChanged ?? 0) > 0)) add({ findingId: 'MIGRATION-CLOSURE', category: '迁移闭环', severity: 'P1', status: 'open', evidence: [snapshot.migration.evidencePath, `status=${snapshot.migration.status ?? 'unknown'}`, `unowned=${snapshot.migration.unowned ?? 'n/a'}`, `bridgeViolations=${snapshot.migration.bridgeViolations ?? 'n/a'}`, `inventoryChanged=${snapshot.migration.inventoryChanged ?? 'n/a'}`], owner: labels.migrationOwner, nextAction: '归属未拥有文件、补齐兼容桥并对清单变化完成证据化验收', expectedImpact: '恢复项目迁移与系统测试构建门禁', resultImpact: 'governance-only' });
  if (snapshot.maintainability && (snapshot.maintainability.highPriorityFiles ?? 0) > (snapshot.maintainability.baselineMaxHighPriorityFiles ?? Number.MAX_SAFE_INTEGER)) add({ findingId: 'MAINTAINABILITY-HOTSPOTS', category: '维护性热点', severity: 'P2', status: 'open', evidence: [snapshot.maintainability.evidencePath, `highPriorityFiles=${snapshot.maintainability.highPriorityFiles}`, `baseline=${snapshot.maintainability.baselineMaxHighPriorityFiles}`], owner: labels.maintenanceOwner, nextAction: '拆分超大实现并统一动态身份模板；拆分后对受影响收据做定向重验', expectedImpact: '降低定位器漂移和修复成本', resultImpact: 'revalidation-required' });
  const readinessEligible = snapshot.readiness?.status === 'eligible-for-human-platform-review' || snapshot.readiness?.status === 'ready';
  if (snapshot.readiness && (!readinessEligible || snapshot.readiness.crossSystemReady !== true)) add({ findingId: 'CROSS-SYSTEM-DEFERRED', category: '跨系统试点', severity: 'P1', status: 'deferred', evidence: [snapshot.readiness.readinessPath, snapshot.readiness.verdictPath], owner: labels.pilotOwner, nextAction: '保持 deferred；仅在收到明确启动指令后再做跨应用认证与真实试点', expectedImpact: '遵守跨系统启动门禁，不影响项目模块治理', resultImpact: 'unchanged' });
  const checkpointGaps = snapshot.checkpointGaps ?? [];
  if (checkpointGaps.length) add({ findingId: 'CHECKPOINT-METADATA', category: 'checkpoint 元数据', severity: 'P1', status: 'open', evidence: checkpointGaps.slice(0, 20).flatMap((item) => [item.file, `missing=${item.gaps.join(',')}`]), owner: '公共平台执行合同负责人', nextAction: '恢复前强制校验意图、选择集与终态集合指纹；缺字段仅生成诊断，不启动认证、造数或浏览器', expectedImpact: '避免断点恢复错选用例或重复执行', resultImpact: 'governance-only' });
  const guardrails = { crossSystemPilot: 'deferred', businessUiWrites: false, rerunPassedCases: false, ...snapshot.guardrails };
  return { schemaVersion: '1.0.0', generatedAt, scope: snapshot.scope, executionScope: 'report-only', guardrails, summary: { status: findings.some((f) => f.severity === 'P0') ? 'blocked' : findings.some((f) => f.status === 'open') ? 'open-findings' : 'clear', totalFindings: findings.length, open: findings.filter((f) => f.status === 'open').length, deferred: findings.filter((f) => f.status === 'deferred').length }, findings, checkpointGaps, conclusions: ['本诊断只汇总治理状态，不改变业务用例状态或历史收据。', '页面、实现或上下文变化只会使受影响旧结果进入定向重验，不自动判定业务失败。'] };
}
