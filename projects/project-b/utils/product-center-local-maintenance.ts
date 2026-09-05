export type ProductCenterLocalMaintenanceInput = {
  generatedAt?: string;
  allure: {
    status: 'passed' | 'failed';
    deletedFiles: number;
    remainingFiles: number;
  };
  pipeline: {
    status: 'passed' | 'failed';
    stages: number;
    technicalReady: boolean;
    runId?: string;
    mode?: string;
    immutableReport?: string;
    retainedRevisions?: number;
    expiredCandidates?: number;
  };
  owner: {
    status: string;
    technicalReady: boolean;
    blockers: number;
    actions: number;
  };
  safety: {
    sensitiveFindings: number;
    incompleteCheckpoints: number;
    authStateArtifacts: number;
  };
};

type LocalMaintenanceIssue = {
  code: string;
  detail: string;
};

export function buildProductCenterLocalMaintenanceSummary(
  input: ProductCenterLocalMaintenanceInput,
) {
  const issues: LocalMaintenanceIssue[] = [];
  if (input.allure.status !== 'passed') {
    issues.push({ code: 'ALLURE_RETENTION_FAILED', detail: `remaining=${input.allure.remainingFiles}` });
  }
  if (input.pipeline.status !== 'passed' || !input.pipeline.technicalReady) {
    issues.push({
      code: 'PIPELINE_FAILED',
      detail: `status=${input.pipeline.status};stages=${input.pipeline.stages};technicalReady=${input.pipeline.technicalReady}`,
    });
  }
  if (!input.owner.technicalReady || input.owner.blockers > 0) {
    issues.push({
      code: 'OWNER_SUMMARY_BLOCKED',
      detail: `status=${input.owner.status};blockers=${input.owner.blockers}`,
    });
  }
  if (input.safety.sensitiveFindings > 0) {
    issues.push({ code: 'SENSITIVE_ARTIFACTS_PRESENT', detail: `count=${input.safety.sensitiveFindings}` });
  }
  if (input.safety.incompleteCheckpoints > 0) {
    issues.push({
      code: 'INCOMPLETE_CHECKPOINTS_PRESENT',
      detail: `count=${input.safety.incompleteCheckpoints}`,
    });
  }
  if (input.safety.authStateArtifacts > 0) {
    issues.push({ code: 'AUTH_STATE_RESIDUE_PRESENT', detail: `count=${input.safety.authStateArtifacts}` });
  }

  return {
    schemaVersion: '1.0.0' as const,
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    status: issues.length === 0 ? 'passed' as const : 'failed' as const,
    allure: { ...input.allure },
    pipeline: { ...input.pipeline },
    owner: { ...input.owner },
    safety: { ...input.safety },
    issues,
  };
}

export function renderProductCenterLocalMaintenanceMarkdown(
  summary: ReturnType<typeof buildProductCenterLocalMaintenanceSummary>,
): string {
  const issueRows = summary.issues.length > 0
    ? summary.issues.map((issue) => `| ${issue.code} | ${issue.detail} |`)
    : ['| 无 | 本地维护门禁全部通过 |'];
  return [
    '# 商品中心本地维护摘要',
    '',
    `状态：${summary.status}`,
    '',
    '| 维度 | 状态 | 详情 |',
    '| --- | --- | --- |',
    `| Allure 保留 | ${summary.allure.status} | deleted=${summary.allure.deletedFiles};remaining=${summary.allure.remainingFiles} |`,
    `| 质量流水线 | ${summary.pipeline.status} | stages=${summary.pipeline.stages};technicalReady=${summary.pipeline.technicalReady};mode=${summary.pipeline.mode ?? 'unknown'};runId=${summary.pipeline.runId ?? 'unknown'} |`,
    `| 不可变报告 | ${summary.pipeline.immutableReport ? 'verified' : 'missing'} | revisions=${summary.pipeline.retainedRevisions ?? 0};expiredCandidates=${summary.pipeline.expiredCandidates ?? 0} |`,
    `| 负责人摘要 | ${summary.owner.status} | blockers=${summary.owner.blockers};actions=${summary.owner.actions} |`,
    `| 敏感扫描 | ${summary.safety.sensitiveFindings === 0 ? 'clean' : 'blocked'} | ${summary.safety.sensitiveFindings} |`,
    `| 未完成检查点 | ${summary.safety.incompleteCheckpoints === 0 ? 'clean' : 'blocked'} | ${summary.safety.incompleteCheckpoints} |`,
    `| 登录态残留 | ${summary.safety.authStateArtifacts === 0 ? 'clean' : 'blocked'} | ${summary.safety.authStateArtifacts} |`,
    '',
    '## 问题',
    '',
    '| 代码 | 详情 |',
    '| --- | --- |',
    ...issueRows,
    '',
  ].join('\n');
}
