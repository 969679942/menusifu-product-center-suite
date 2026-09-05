import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { SystemTestPlan } from '../src/automation/system-test/system-test-plan-compiler';
import { type TestExecutionIndexRecord, TestExecutionIndex } from '../src/utils/test-execution-index';
import { fingerprintExecutionContext } from '../src/utils/test-execution-state';

type EvidenceCase = {
  caseId: string;
  caseFingerprint?: string;
  implementationFingerprint?: string;
  playwrightStatus: string;
  evidence?: { status?: string };
  failureCategory?: string;
  runtimeEvidence?: {
    cleanup?: {
      apiZeroResidue?: boolean;
      uiZeroResidue?: boolean;
      apiIdentityCounts?: Record<string, number>;
      uiIdentityCounts?: Record<string, number>;
    };
  };
};

type IntakeCase = {
  caseId: string;
  title: string;
  module?: string;
  priority?: string;
  formalSource?: string;
  status: string;
  reason?: string;
  recoveryCondition?: string;
};

type ExecutionResult = {
  schemaVersion: '1.0.0';
  collectionId: 'system-test-execution-result';
  generatedAt: string;
  systemId: string;
  formalSource: string | null;
  runId: string | null;
  flowStatus: string;
  execution: {
    planCases: number;
    selected: number;
    executed: number;
    evidenceComplete: number;
    evidenceIncomplete: number;
  };
  summary: {
    passed: number;
    productDefect: number;
    failed: number;
    blockedSource: number;
    otherUnlanded: number;
    total: number;
  };
  sources: {
    plan: string;
    runReport: string;
    evidenceLedger: string;
    unlanded: string;
    executionIndex: string;
  };
  cases: Array<IntakeCase & {
    executionStatus: 'passed' | 'product-defect' | 'failed' | 'blocked-source' | 'blocked-technical' | 'not-applicable' | 'deferred';
    evidenceStatus: string | null;
    failureCategory: string | null;
  }>;
};

function readJson<T>(filePath: string): T {
  return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T;
}

function resolveInput(rootDir: string, input: string): string {
  return path.resolve(rootDir, input);
}

function classifyExecutionCase(item: EvidenceCase): ExecutionResult['cases'][number]['executionStatus'] {
  if (item.failureCategory === 'product-failure') return 'product-defect';
  if (item.playwrightStatus === 'passed' && item.evidence?.status === 'complete') return 'passed';
  return 'failed';
}

export function buildSystemTestExecutionResult(input: {
  planPath: string;
  runReportPath: string;
  evidenceLedgerPath: string;
  unlandedPath: string;
  outputJsonPath: string;
  outputMarkdownPath: string;
  flowStatus?: string;
  executionIndexPath?: string;
}): ExecutionResult {
  const plan = readJson<SystemTestPlan>(input.planPath);
  const report = readJson<{ runId?: string; status?: string }>(input.runReportPath);
  const ledger = readJson<{
    summary: { selected: number; executed: number; evidenceComplete: number; evidenceIncomplete: number };
    cases: EvidenceCase[];
  }>(input.evidenceLedgerPath);
  const unlanded = readJson<{ cases: IntakeCase[] }>(input.unlandedPath);
  const selected = new Map(ledger.cases.map((item) => [item.caseId, item]));
  const landedCases: ExecutionResult['cases'] = plan.cases.map((planCase) => {
    const evidence = selected.get(planCase.caseId);
    if (evidence) {
      return {
        caseId: planCase.caseId,
        title: planCase.title,
        status: 'ready',
        executionStatus: classifyExecutionCase(evidence),
        evidenceStatus: evidence.evidence?.status ?? null,
        failureCategory: evidence.failureCategory ?? null,
      };
    }
    return {
      caseId: planCase.caseId,
      title: planCase.title,
      status: 'ready',
      executionStatus: 'deferred',
      evidenceStatus: null,
      failureCategory: null,
    };
  });
  const sourceCases: ExecutionResult['cases'] = unlanded.cases.map((item) => ({
    ...item,
    status: item.status,
    executionStatus: item.status as ExecutionResult['cases'][number]['executionStatus'],
    evidenceStatus: null,
    failureCategory: null,
  }));
  const cases = [...landedCases, ...sourceCases];
  const projectRoot = path.resolve(input.planPath, '../../..');
  const workspaceRoot = path.resolve(projectRoot, '..');
  const executionIndexPath = input.executionIndexPath ?? path.join(projectRoot, 'deliverables/system-test-platform/execution-index.json');
  const records = ledger.cases.flatMap((item): TestExecutionIndexRecord[] => {
    const planCase = plan.cases.find((candidate) => candidate.caseId === item.caseId);
    if (!planCase) return [];
    const recordedAt = resultGeneratedAt(input.runReportPath);
    const evidenceStatus = item.evidence?.status === 'complete' ? 'complete' : 'incomplete';
    const cleanup = item.runtimeEvidence?.cleanup;
    const apiZeroResidue = cleanup?.apiZeroResidue === true
      || (cleanup?.apiIdentityCounts !== undefined
        && Object.values(cleanup.apiIdentityCounts).every((count) => count === 0));
    const uiZeroResidue = cleanup?.uiZeroResidue === true
      || (cleanup?.uiIdentityCounts !== undefined
        && Object.values(cleanup.uiIdentityCounts).every((count) => count === 0));
    const status = item.failureCategory === 'product-failure'
      ? 'failed'
      : item.playwrightStatus === 'passed' && evidenceStatus === 'complete' ? 'passed' : 'failed';
    return [{
      caseId: item.caseId,
      applicationVersionFingerprint: null,
      releaseObservation: { status: 'unavailable', fingerprint: null, source: 'system-test-runtime', stable: false, observedAt: recordedAt },
      executionEpochId: report.runId ?? `system-test-${recordedAt}`,
      executionContextFingerprint: fingerprintExecutionContext({
        environmentId: plan.executionContext.environmentId,
        tenantScope: plan.executionContext.tenantScope,
        locale: plan.executionContext.locale,
        roleId: plan.executionContext.roleId,
      }),
      caseFingerprint: item.caseFingerprint ?? sha256(JSON.stringify(planCase)),
      implementationFingerprint: item.implementationFingerprint ?? null,
      status,
      evidenceStatus,
      cleanupEvidence: cleanup ? {
        apiZeroResidue,
        uiZeroResidue,
      } : null,
      receiptEvidenceFingerprint: sha256(JSON.stringify(item.runtimeEvidence ?? {})),
      evidenceFileFingerprint: sha256File(input.evidenceLedgerPath),
      reuseStatus: status === 'passed' && evidenceStatus === 'complete' ? 'run-only' : 'invalidated',
      runId: report.runId ?? `system-test-${recordedAt}`,
      evidencePath: path.relative(workspaceRoot, input.evidenceLedgerPath).replaceAll(path.sep, '/'),
      durationMs: 0,
      recordedAt,
    }];
  });
  new TestExecutionIndex(executionIndexPath).upsert(records);
  const passed = cases.filter((item) => item.executionStatus === 'passed').length;
  const productDefect = cases.filter((item) => item.executionStatus === 'product-defect').length;
  const failed = cases.filter((item) => item.executionStatus === 'failed').length;
  const blockedSource = cases.filter((item) => item.executionStatus === 'blocked-source').length;
  const otherUnlanded = cases.filter((item) => ['deferred', 'blocked-technical', 'not-applicable'].includes(item.executionStatus)).length;
  const result: ExecutionResult = {
    schemaVersion: '1.0.0',
    collectionId: 'system-test-execution-result',
    generatedAt: new Date().toISOString(),
    systemId: plan.systemId,
    formalSource: plan.sourceRegistry.sources.find((item) => item.kind === 'formal-case')?.path ?? null,
    runId: report.runId ?? null,
    flowStatus: input.flowStatus ?? report.status ?? 'unknown',
    execution: {
      planCases: plan.cases.length,
      selected: ledger.summary.selected,
      executed: ledger.summary.executed,
      evidenceComplete: ledger.summary.evidenceComplete,
      evidenceIncomplete: ledger.summary.evidenceIncomplete,
    },
    summary: { passed, productDefect, failed, blockedSource, otherUnlanded, total: cases.length },
    sources: {
      plan: input.planPath,
      runReport: input.runReportPath,
      evidenceLedger: input.evidenceLedgerPath,
      unlanded: input.unlandedPath,
      executionIndex: executionIndexPath,
    },
    cases,
  };
  fs.mkdirSync(path.dirname(input.outputJsonPath), { recursive: true });
  fs.writeFileSync(input.outputJsonPath, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
  fs.writeFileSync(input.outputMarkdownPath, renderMarkdown(result), 'utf8');
  return result;
}

function resultGeneratedAt(runReportPath: string): string {
  return fs.statSync(runReportPath).mtime.toISOString();
}

function sha256(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function sha256File(filePath: string): string {
  return sha256(fs.readFileSync(filePath, 'utf8'));
}

function renderMarkdown(result: ExecutionResult): string {
  const lines = [
    `# ${result.systemId} 执行闭环结果`,
    '',
    `- 生成时间：${result.generatedAt}`,
    `- 流程状态：${result.flowStatus}`,
    `- 正式方案用例：${result.summary.total} 条`,
    `- 本次选择/执行：${result.execution.selected}/${result.execution.executed} 条`,
    `- 证据完整：${result.execution.evidenceComplete} 条；证据不完整：${result.execution.evidenceIncomplete} 条`,
    `- 通过：${result.summary.passed} 条；产品偏差：${result.summary.productDefect} 条；未落地来源阻断：${result.summary.blockedSource} 条`,
    '',
    '## 已选择执行',
    '| 用例 | 结果 | 证据 |',
    '| --- | --- | --- |',
  ];
  for (const item of result.cases.filter((caseItem) => caseItem.status === 'ready')) {
    lines.push(`| ${item.caseId} | ${item.executionStatus} | ${item.evidenceStatus ?? '-'} |`);
  }
  lines.push('', '## 未落地', '| 用例 | 状态 | 恢复条件 |', '| --- | --- | --- |');
  for (const item of result.cases.filter((caseItem) => caseItem.status !== 'ready')) {
    lines.push(`| ${item.caseId} | ${item.executionStatus} | ${item.recoveryCondition ?? '-'} |`);
  }
  return `${lines.join('\n')}\n`;
}

function argument(name: string): string | undefined {
  return process.argv.find((item) => item.startsWith(`--${name}=`))?.slice(name.length + 3);
}

if (require.main === module) {
  const rootDir = path.resolve(process.env.SYSTEM_TEST_PROJECT_ROOT ?? process.cwd());
  const plan = argument('plan');
  const runReport = argument('run-report');
  const evidenceLedger = argument('evidence-ledger');
  const unlanded = argument('unlanded');
  const outputJson = argument('output-json');
  const outputMarkdown = argument('output-md');
  if (!plan || !runReport || !evidenceLedger || !unlanded || !outputJson || !outputMarkdown) {
    throw new Error('用法：--plan=... --run-report=... --evidence-ledger=... --unlanded=... --output-json=... --output-md=...');
  }
  const result = buildSystemTestExecutionResult({
    planPath: resolveInput(rootDir, plan),
    runReportPath: resolveInput(rootDir, runReport),
    evidenceLedgerPath: resolveInput(rootDir, evidenceLedger),
    unlandedPath: resolveInput(rootDir, unlanded),
    outputJsonPath: resolveInput(rootDir, outputJson),
    outputMarkdownPath: resolveInput(rootDir, outputMarkdown),
    flowStatus: argument('flow-status'),
  });
  process.stdout.write(`系统测试闭环结果已生成：${result.summary.total} 条\n`);
}
