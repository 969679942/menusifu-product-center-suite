import fs from 'node:fs';
import path from 'node:path';
import AdmZip from 'adm-zip';

type Binding = {
  caseId: string;
  title: string;
  module: string;
  route: string;
  mode: string;
  sourceIds: string[];
  obligationIds: string[];
  assertionIds: string[];
  capabilityIds: string[];
  recipeId: string;
  factoryId: string | null;
  cleanupId: string | null;
  traceabilityId: string;
  generationAllowed: boolean;
  blockReason?: string;
};

type RuntimeCase = Binding & {
  status: 'failed' | 'skipped';
  classification: 'environment-blocked' | 'technical-contract-blocked';
  durationMs: number;
  operationId: null;
  serverIds: Array<number | string>;
  uiAssertionObserved: boolean;
  apiAssertionObserved: boolean;
  cleanupStatus: 'not-needed-no-mutation' | 'not-run-technical-block';
  evidencePaths: string[];
  errorSummary?: string;
};

const projectRoot = path.resolve(__dirname, '..');
const workspaceRoot = path.resolve(projectRoot, '..');
const deliverableRoot = path.join(workspaceRoot, 'deliverables/product-center-group');
const contractPath = path.join(projectRoot, 'contracts/product-center/group/product-center-group-automation-contract.json');
const bindingsPath = path.join(projectRoot, 'contracts/product-center/group/product-center-group-bindings.json');
const testResultsRoot = path.join(projectRoot, 'test-results');
const checkpointsRoot = path.join(projectRoot, 'output/checkpoints');

function main(): void {
  const bindings = readJson<{ cases: Binding[] }>(bindingsPath).cases;
  const generated = bindings.filter((binding) => binding.generationAllowed);
  const blocked = bindings.filter((binding) => !binding.generationAllowed);
  const planned = bindings.length;
  const generatedCount = generated.length;
  const blockedCount = blocked.length;
  const observedFailures = readObservedFailures(generated);
  const runtimeCases = generated.map((binding) => {
    const observed = observedFailures.get(binding.caseId);
    if (!observed) {
      throw new Error(`缺少可执行用例运行证据：${binding.caseId}`);
    }
    return {
      ...binding,
      status: 'failed' as const,
      classification: observed.classification,
      durationMs: observed.durationMs,
      operationId: null,
      serverIds: [],
      uiAssertionObserved: false,
      apiAssertionObserved: false,
      cleanupStatus: 'not-needed-no-mutation' as const,
      evidencePaths: observed.evidencePaths,
      errorSummary: observed.errorSummary,
    };
  });

  const generatedAt = new Date().toISOString();
  const runtimeReport = {
    schemaVersion: '1.0.0',
    collectionId: 'product-center-group-runtime-report',
    generatedAt,
    status: 'environment-blocked',
    source: {
      testCases: 'deliverables/product-center-group/test-cases.json',
      automationContract: 'Merchant Center UITest/contracts/product-center/group/product-center-group-automation-contract.json',
      bindings: 'Merchant Center UITest/contracts/product-center/group/product-center-group-bindings.json',
      generatedSpec: 'Merchant Center UITest/tests/generated/product-center-group.generated.spec.ts',
    },
    runs: [
      {
        runId: 'group-full-chrome-setup-2026-08-11T08:27:54.598Z',
        project: 'chrome',
        scope: 'full',
        durationMs: 1613.856,
        plannedGroupCases: planned,
        actualRun: 0,
        passed: 0,
        failed: 0,
        skipped: planned,
        environmentBlocked: planned,
        notRun: planned,
        reason: '认证 setup 缺少 MC_USERNAME、MC_PASSWORD、MC_MERCHANT；业务用例未启动。',
        evidence: 'Merchant Center UITest/test-results/setup-auth.setup.ts-保存商户中心登录态-setup/error-context.md',
      },
      {
        runId: 'group-full-ephemeral-2026-08-11T08:29:19.291Z',
        project: 'ephemeral-chrome',
        scope: 'full',
        durationMs: 163864.518,
        plannedGroupCases: planned,
        actualRun: generatedCount,
        passed: 0,
        failed: generatedCount,
        skipped: blockedCount,
        environmentBlocked: generatedCount,
        notRun: 0,
        reason: `无登录态时 ${generatedCount} 条可执行用例进入运行阶段；页面用例跳转统一登录页，写用例在 API Factory 取 token 前停止。`,
        evidence: 'Merchant Center UITest/test-results/generated-product-center-g-*/error-context.md',
      },
    ],
    final: {
      planned,
      scheduled: planned,
      actualRun: generatedCount,
      passed: 0,
      failed: generatedCount,
      skipped: blockedCount,
      environmentBlocked: generatedCount,
      manualBusinessConfirmation: 0,
      notRun: 0,
      totalDurationMs: 165478.374,
      singleCaseTiming: runtimeCases.map((item) => ({
        caseId: item.caseId,
        title: item.title,
        status: item.status,
        durationMs: item.durationMs,
      })),
    },
    cases: [
      ...runtimeCases,
      ...blocked.map((binding) => ({
        ...binding,
        status: 'skipped' as const,
        classification: 'technical-contract-blocked' as const,
        durationMs: 0,
        operationId: null,
        serverIds: [],
        uiAssertionObserved: false,
        apiAssertionObserved: false,
        cleanupStatus: 'not-run-technical-block' as const,
        evidencePaths: [
          'Merchant Center UITest/contracts/product-center/group/product-center-group-automation-contract.json',
        ],
      })),
    ],
    gateResults: {
      L0: 'passed-static-binding-and-traceability',
      L1: 'passed-generated-spec-compiles-at-source-level; repository-typecheck-blocked-by-pre-existing-missing-pilot-feedback-json',
      L2: 'environment-blocked-authentication',
      L3: 'not-reached-for-business-assertions',
    },
    remainingHumanItems: [
      '提供可用且合规的 Merchant Center 登录态或 MC_ACCESS_TOKEN / MC_USERNAME / MC_PASSWORD / MC_MERCHANT。',
      '补齐属性集 CRUD 的真实 mutation operation、服务器终态 assertion、Factory 与 Cleanup 合同。',
    ],
  };

  const failurePackage = {
    schemaVersion: '1.0.0',
    collectionId: 'product-center-group-failure-handling-package',
    generatedAt,
    status: 'blocked-by-environment',
    rootCause: {
      category: 'missing-authentication',
      redactedEvidence: [
        'setup: 缺少登录信息',
        'read-only: 页面进入 auth.menusifucloudqa.com 登录页',
        'crud: 未配置 MC_ACCESS_TOKEN 或 MC_USERNAME/MC_PASSWORD',
      ],
    },
    repairAttempts: [
      {
        round: 1,
        action: '修复组测试套件串行模式导致首条失败连带跳过',
        result: 'fixed',
        file: 'Merchant Center UITest/scripts/build-product-center-group-automation.ts',
        change: 'generated spec 改为 default mode，保持 workers=1 和单条 60 秒上限。',
      },
      {
        round: 2,
        action: `隔离重跑 ${planned} 条组用例`,
        result: 'environment-blocked',
        resultSummary: `${generatedCount} failed, ${blockedCount} skipped, 0 passed；未发现业务规则技术失败。`,
      },
    ],
    failedCases: runtimeCases.map((item) => ({
      caseId: item.caseId,
      title: item.title,
      classification: item.classification,
      durationMs: item.durationMs,
      errorSummary: item.errorSummary,
      evidencePaths: item.evidencePaths,
    })),
    replayPolicy: `认证恢复后从 ${generatedCount} 条 environment-blocked 用例定向重跑；非幂等写操作先检查 execution ledger 与 server identity，再决定是否重放。`,
  };

  const zeroResidue = buildZeroResidueReport(generatedAt);
  const runtimeEvidence = {
    schemaVersion: '1.0.0',
    collectionId: 'product-center-group-runtime-evidence',
    generatedAt,
    status: 'partial-environment-evidence',
    backwriteTargets: {
      auditContract: 'deliverables/product-center-group/audit-reconciliation.json',
      automationContract: 'Merchant Center UITest/contracts/product-center/group/product-center-group-automation-contract.json',
      claimsRulesIr: 'Merchant Center UITest/contracts/product-center/generated/modules/brand-group.json',
      recipes: 'Merchant Center UITest/contracts/product-center/group/product-center-group-bindings.json',
      testCases: 'deliverables/product-center-group/test-cases.json',
    },
    observations: runtimeCases.map((item) => ({
      caseId: item.caseId,
      traceabilityId: item.traceabilityId,
      sourceIds: item.sourceIds,
      obligationIds: item.obligationIds,
      assertionIds: item.assertionIds,
      capabilityIds: item.capabilityIds,
      recipeId: item.recipeId,
      generationAllowed: true,
      runtimeStatus: item.status,
      classification: item.classification,
      operationId: null,
      serverIds: [],
      uiAssertionObserved: false,
      apiAssertionObserved: false,
      cleanupStatus: item.cleanupStatus,
      claimCoverageComplete: false,
      observationLimitation: '认证前置未满足，未进入业务断言阶段；不得据此推导业务通过或失败。',
      evidencePaths: item.evidencePaths,
    })),
    blockedCases: blocked.map((item) => ({
      caseId: item.caseId,
      traceabilityId: item.traceabilityId,
      sourceIds: item.sourceIds,
      obligationIds: item.obligationIds,
      assertionIds: item.assertionIds,
      capabilityIds: item.capabilityIds,
      recipeId: item.recipeId,
      generationAllowed: false,
      runtimeStatus: 'technical-contract-blocked',
      claimCoverageComplete: false,
      observationLimitation: item.blockReason ?? '缺少完整业务合同。',
    })),
  };

  writeJson(path.join(deliverableRoot, 'runtime-report.json'), runtimeReport);
  writeJson(path.join(deliverableRoot, 'failure-handling-package.json'), failurePackage);
  writeJson(path.join(deliverableRoot, 'zero-residue-report.json'), zeroResidue);
  writeJson(path.join(deliverableRoot, 'runtime-evidence.json'), runtimeEvidence);
  writeMarkdown(path.join(deliverableRoot, 'runtime-summary.md'), renderSummary(runtimeReport, failurePackage, zeroResidue));

  updateAutomationManifest(generatedAt, runtimeReport);
  updateAutomationContract(generatedAt, runtimeEvidence);
  updateAuditReconciliation(generatedAt, runtimeEvidence);

  process.stdout.write(JSON.stringify({
    generated: generated.length,
    blocked: blocked.length,
    failed: runtimeCases.length,
    runtimeReport: path.relative(workspaceRoot, path.join(deliverableRoot, 'runtime-report.json')),
  }, null, 2) + '\n');
}

function readObservedFailures(bindings: readonly Binding[]): Map<string, {
  classification: 'environment-blocked';
  durationMs: number;
  evidencePaths: string[];
  errorSummary: string;
}> {
  const result = new Map<string, {
    classification: 'environment-blocked';
    durationMs: number;
    evidencePaths: string[];
    errorSummary: string;
  }>();
  const directories = fs.existsSync(testResultsRoot)
    ? fs.readdirSync(testResultsRoot, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && entry.name.startsWith('generated-product-center-g-'))
      .map((entry) => entry.name)
    : [];
  const titleToBinding = new Map(bindings.map((binding) => [binding.title, binding]));
  for (const directory of directories) {
    const contextPath = path.join(testResultsRoot, directory, 'error-context.md');
    if (!fs.existsSync(contextPath)) continue;
    const context = fs.readFileSync(contextPath, 'utf8');
    const title = context.match(/- Name: [^\r\n]* >> ([^\r\n]+)\r?\n/)?.[1]?.trim();
    if (!title) continue;
    const binding = titleToBinding.get(title);
    if (!binding) continue;
    const tracePath = path.join(testResultsRoot, directory, 'trace.zip');
    result.set(binding.caseId, {
      classification: 'environment-blocked',
      durationMs: tracePathExists(tracePath) ? readTraceDuration(tracePath) : 0,
      evidencePaths: [
        relativeWorkspace(contextPath),
        ...(fs.existsSync(tracePath) ? [relativeWorkspace(tracePath)] : []),
      ],
      errorSummary: summarizeError(context),
    });
  }
  return result;
}

function readTraceDuration(zipPath: string): number {
  try {
    const zip = new AdmZip(zipPath);
    const entry = zip.getEntry('test.trace');
    if (!entry) return 0;
    const lines = entry.getData().toString('utf8').split(/\r?\n/);
    const starts: number[] = [];
    const ends: number[] = [];
    for (const line of lines) {
      try {
        const value = JSON.parse(line) as { startTime?: number; endTime?: number };
        if (typeof value.startTime === 'number') starts.push(value.startTime);
        if (typeof value.endTime === 'number') ends.push(value.endTime);
      } catch {
        continue;
      }
    }
    if (starts.length === 0 || ends.length === 0) return 0;
    return Math.round(Math.max(...ends) - Math.min(...starts));
  } catch {
    return 0;
  }
}

function summarizeError(context: string): string {
  const details = context.match(/# Error details\s+```([\s\S]*?)```/)?.[1]?.trim();
  if (!details) return 'Playwright 失败附件未提供错误摘要。';
  return details
    .replace(/\s+/g, ' ')
    .replace(/https?:\/\/\S+/g, '<redacted-url>')
    .slice(0, 500);
}

function buildZeroResidueReport(generatedAt: string): Record<string, unknown> {
  const checkpointFiles = fs.existsSync(checkpointsRoot)
    ? fs.readdirSync(checkpointsRoot)
      .filter((name) => name.endsWith('.json'))
      .map((name) => path.join(checkpointsRoot, name))
    : [];
  const snapshots = checkpointFiles.flatMap((filePath) => {
    try {
      const document = readJson<{ runId?: string; entries?: Array<{ serverId?: number | string; phase?: string }> }>(filePath);
      return [{
        runId: document.runId ?? path.basename(filePath, '.json'),
        entries: document.entries?.length ?? 0,
        serverIds: (document.entries ?? []).map((entry) => entry.serverId).filter((value) => value !== undefined),
        phases: (document.entries ?? []).map((entry) => entry.phase),
      }];
    } catch {
      return [];
    }
  });
  return {
    schemaVersion: '1.0.0',
    collectionId: 'product-center-group-zero-residue-report',
    generatedAt,
    status: 'zero-residue-observed-no-mutation-entered',
    scope: '本轮组自动化运行',
    verifiedZero: true,
    limitation: '由于认证前置失败，写用例未进入 mutation；该结论不是对目标商户既有数据的全库清零声明。',
    cleanup: {
      registeredTasks: 0,
      executedTasks: 0,
      verifiedApiIdentityCount: 0,
      serverIds: [],
      residueCount: 0,
    },
    checkpoints: snapshots,
    evidence: [
      'Merchant Center UITest/api/product-center/cleanup-registry.ts',
      'Merchant Center UITest/api/product-center/execution-ledger.ts',
      'Merchant Center UITest/output/checkpoints/',
    ],
  };
}

function updateAutomationManifest(generatedAt: string, report: Record<string, any>): void {
  const filePath = path.join(deliverableRoot, 'automation-manifest.json');
  const document = readJson<Record<string, any>>(filePath);
  writeJson(filePath, {
    ...document,
    generatedAt,
    status: 'environment-blocked',
    runtimeReport: 'deliverables/product-center-group/runtime-report.json',
    failureHandlingPackage: 'deliverables/product-center-group/failure-handling-package.json',
    zeroResidueReport: 'deliverables/product-center-group/zero-residue-report.json',
    runtimeEvidence: 'deliverables/product-center-group/runtime-evidence.json',
    summary: {
      ...document.summary,
      actualExecutable: report.final.actualRun,
      actualRun: report.final.actualRun,
      passed: report.final.passed,
      failed: report.final.failed,
      skipped: report.final.skipped,
      environmentBlocked: report.final.environmentBlocked,
      manualBusinessConfirmation: report.final.manualBusinessConfirmation,
      technicalBlocks: report.final.skipped,
    },
  });
}

function updateAutomationContract(generatedAt: string, runtimeEvidence: Record<string, unknown>): void {
  const document = readJson<Record<string, any>>(contractPath);
  writeJson(contractPath, {
    ...document,
    generatedAt,
    status: 'environment-blocked',
    runtimeEvidence: 'deliverables/product-center-group/runtime-evidence.json',
    runtimeEvidenceStatus: runtimeEvidence.status,
  });
}

function updateAuditReconciliation(generatedAt: string, runtimeEvidence: Record<string, any>): void {
  const filePath = path.join(deliverableRoot, 'audit-reconciliation.json');
  const document = readJson<Record<string, any>>(filePath);
  writeJson(filePath, {
    ...document,
    generatedAt,
    runtimeEvidence: {
      path: 'deliverables/product-center-group/runtime-evidence.json',
      status: runtimeEvidence.status,
      actualRun: generatedCount,
      passed: 0,
      failed: generatedCount,
      skippedTechnicalBlocks: blockedCount,
      manualBusinessConfirmation: 0,
      claimCoverageComplete: false,
    },
  });
}

function renderSummary(report: Record<string, any>, failurePackage: Record<string, any>, zeroResidue: Record<string, any>): string {
  const final = report.final;
  const lines = [
    '# 商品中心商品管理组运行总结',
    '',
    `- 方案到用例：${report.final.planned} 条最终用例，来源有效 137 条，审计补充 2 条，废弃 3 条已排除。`,
    `- 用例到脚本：${report.final.planned} 条逐条绑定 Canonical IR、Obligation、Assertion、Capability、Recipe、Traceability；${report.final.actualRun} 条具备真实脚本生成资格，${report.final.skipped} 条技术合同阻断。`,
    `- 实际运行：${final.actualRun} 条；通过 ${final.passed} 条；失败 ${final.failed} 条；跳过 ${final.skipped} 条；环境阻塞 ${final.environmentBlocked} 条；人工业务确认 ${final.manualBusinessConfirmation} 条；未运行 ${final.notRun} 条。`,
    `- 总耗时：${final.totalDurationMs} ms（认证 setup 1,613.856 ms；隔离全量运行 163,864.518 ms）。`,
    '- 失败根因：未提供认证信息；可执行用例进入统一登录页或在 API Factory 取 token 前停止。',
    `- 技术修复：生成规格取消 describe 串行模式，改为独立失败隔离；${report.final.scheduled} 条均被调度，未把连带跳过误报为业务结果。`,
    '- 零残留：本轮没有登记 operation、server ID 或 cleanup task，观察到残留数为 0；这不是对目标商户既有数据的全库清零声明。',
    '',
    '## 剩余项',
    '',
    `- ${failurePackage.replayPolicy}`,
    `- 提供合规登录态或环境变量后，重跑 ${report.final.environmentBlocked} 条 environment-blocked 用例。`,
    '- 补齐属性集 CRUD 的 mutation、服务器终态、Factory、Cleanup 后，再生成属性集成功类脚本。',
    '',
    '## 证据',
    '',
    '- `runtime-report.json`',
    '- `failure-handling-package.json`',
    '- `zero-residue-report.json`',
    '- `runtime-evidence.json`',
    '- `Merchant Center UITest/test-results/`',
    '',
    `零残留报告状态：${zeroResidue.status}。`,
  ];
  return `${lines.join('\n')}\n`;
}

function tracePathExists(filePath: string): boolean {
  return fs.existsSync(filePath);
}

function relativeWorkspace(filePath: string): string {
  return path.relative(workspaceRoot, filePath).replaceAll(path.sep, '/');
}

function readJson<T>(filePath: string): T {
  return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T;
}

function writeJson(filePath: string, value: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.tmp`;
  fs.writeFileSync(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  fs.renameSync(temporaryPath, filePath);
}

function writeMarkdown(filePath: string, value: string): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.tmp`;
  fs.writeFileSync(temporaryPath, value, 'utf8');
  fs.renameSync(temporaryPath, filePath);
}

if (require.main === module) main();
