import fs from 'node:fs';
import path from 'node:path';

const projectRoot = path.resolve(__dirname, '..');
const lifecyclePath = path.join(projectRoot, 'deliverables/system-test-platform/product-center-asset-lifecycle.json');
const outputPath = path.join(projectRoot, 'deliverables/system-test-platform/product-center-asset-remediation-queues.json');
const markdownPath = path.join(projectRoot, 'deliverables/system-test-platform/product-center-asset-remediation-queues.md');

type Lifecycle = {
  generatedAt: string;
  identity: { applicationId: string; businessDomainId: string; scope: string };
  sourceManifest: Array<{ kind: string; path: string; fingerprint: string }>;
  orphanReferenceCaseIds: { binding: string[]; execution: string[]; index: string[] };
  cases: Array<{
    caseId: string;
    title: string;
    module: string;
    lifecycleStatus: string;
    canonical: { caseFingerprint: string; sourcePath: string };
    binding: { fingerprint: string; scriptPath: string | null; status: string };
    execution: { caseFingerprint: string | null; implementationFingerprint: string | null; contextFingerprint: string | null; status: string; evidenceStatus: string | null; recordedAt: string | null };
    reconciliation: { issues: string[] };
  }>;
};

const fingerprintIssueDimensions = {
  EXECUTION_CASE_FINGERPRINT_MISMATCH: 'case',
  EXECUTION_IMPLEMENTATION_FINGERPRINT_MISMATCH: 'implementation',
  EXECUTION_CONTEXT_FINGERPRINT_MISMATCH: 'context',
} as const;

export function buildProductCenterAssetRemediationQueues(options: { write?: boolean; generatedAt?: string } = {}) {
  const lifecycle = readJson<Lifecycle>(lifecyclePath);
  const byId = new Map(lifecycle.cases.map((item) => [item.caseId, item]));
  const orphanBinding = lifecycle.orphanReferenceCaseIds.binding.map((caseId) => ({
    caseId,
    action: 'binding-source-review',
    status: 'blocked-source',
    reason: '绑定源存在但权威正式用例不存在；禁止删除历史资产，需确认迁移到正式方案或废弃处理。',
    recoveryCondition: '补充正式用例来源并纳入注册表，或由责任人提供带证据的废弃决策。',
  }));
  const fingerprintRevalidation = lifecycle.cases
    .map((item) => ({
      item,
      driftDimensions: Object.entries(fingerprintIssueDimensions)
        .filter(([issue]) => item.reconciliation.issues.includes(issue))
        .map(([, dimension]) => dimension),
    }))
    .filter(({ driftDimensions }) => driftDimensions.length > 0)
    .map(({ item, driftDimensions }) => ({
      caseId: item.caseId,
      title: item.title,
      module: item.module,
      action: 'execution-fingerprint-revalidation',
      status: 'revalidation-required',
      driftDimensions,
      currentCaseFingerprint: item.canonical.caseFingerprint,
      observedCaseFingerprint: item.execution.caseFingerprint,
      implementationFingerprint: item.execution.implementationFingerprint,
      contextFingerprint: item.execution.contextFingerprint,
      reason: `历史执行收据与当前执行身份不一致（${driftDimensions.join('、')}）；不能直接复用或判定业务失败。`,
      recoveryCondition: '按漂移维度完成证据谱系核对；无法证明当前语义一致时进入显式定向重跑审批。',
    }));
  const receiptAdaptation = lifecycle.cases
    .filter((item) => item.reconciliation.issues.includes('PASSED_RECEIPT_INCOMPLETE'))
    .map((item) => ({
      caseId: item.caseId,
      title: item.title,
      module: item.module,
      action: 'historical-receipt-adaptation',
      status: 'evidence-reconciliation-required',
      currentCaseFingerprint: item.canonical.caseFingerprint,
      reason: '历史记录状态为 passed，但标准收据字段不完整；先适配收据，失败后才审批重跑。',
      recoveryCondition: '补齐当前用例、上下文、断言、收据和清理证据的可验证链路。',
    }));
  const executableReady = lifecycle.cases
    .filter((item) => item.lifecycleStatus === 'ready')
    .map((item) => ({
      caseId: item.caseId,
      title: item.title,
      module: item.module,
      action: 'await-execution-grant',
      status: 'ready',
      reason: '绑定存在且当前未发现可复用的完整收据；正式执行仍需公共 execution grant。',
    }));
  const result = {
    schemaVersion: '1.0.0' as const,
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    identity: lifecycle.identity,
    source: {
      lifecyclePath: path.relative(projectRoot, lifecyclePath).replaceAll(path.sep, '/'),
      lifecycleGeneratedAt: lifecycle.generatedAt,
      lifecycleSourceManifest: lifecycle.sourceManifest,
    },
    policy: {
      pageExecutionTriggered: false,
      historicalBindingDeletion: false,
      automaticFingerprintReplacement: false,
      automaticPassPromotion: false,
      existingBusinessResults: 'unchanged',
    },
    summary: {
      orphanBinding: orphanBinding.length,
      fingerprintRevalidation: fingerprintRevalidation.length,
      receiptAdaptation: receiptAdaptation.length,
      executableReady: executableReady.length,
      totalQueued: orphanBinding.length + fingerprintRevalidation.length + receiptAdaptation.length + executableReady.length,
    },
    queues: { orphanBinding, fingerprintRevalidation, receiptAdaptation, executableReady },
    unreferencedCaseIds: [...new Set([
      ...orphanBinding.map((item) => item.caseId),
      ...fingerprintRevalidation.map((item) => item.caseId),
      ...receiptAdaptation.map((item) => item.caseId),
      ...executableReady.map((item) => item.caseId),
    ])].filter((caseId) => !byId.has(caseId)),
  };
  if (options.write !== false) {
    writeJson(outputPath, result);
    writeText(markdownPath, renderMarkdown(result));
  }
  return { outputPath, markdownPath, result };
}

function renderMarkdown(result: ReturnType<typeof buildProductCenterAssetRemediationQueues>['result']): string {
  return [
    '# 商品中心资产整改队列',
    '',
    '- 本产物只登记整改对象，不启动页面执行，不修改历史结果。',
    `- 孤儿绑定：${result.summary.orphanBinding}；指纹重验证：${result.summary.fingerprintRevalidation}；收据适配：${result.summary.receiptAdaptation}；待授权执行：${result.summary.executableReady}。`,
    '',
    '| 队列 | 用例数 | 处理原则 |',
    '| --- | ---: | --- |',
    `| orphanBinding | ${result.summary.orphanBinding} | 不删除，等待迁移或废弃决策 |`,
    `| fingerprintRevalidation | ${result.summary.fingerprintRevalidation} | 先核对指纹谱系，不能直接复用 |`,
    `| receiptAdaptation | ${result.summary.receiptAdaptation} | 先适配历史收据，失败后才审批重跑 |`,
    `| executableReady | ${result.summary.executableReady} | 需要公共 execution grant |`,
    '',
  ].join('\n');
}

function readJson<T>(filePath: string): T { return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T; }
function writeJson(filePath: string, value: unknown): void { writeText(filePath, `${JSON.stringify(value, null, 2)}\n`); }
function writeText(filePath: string, value: string): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.tmp`;
  fs.writeFileSync(temporaryPath, value, 'utf8');
  fs.renameSync(temporaryPath, filePath);
}

if (require.main === module) {
  const result = buildProductCenterAssetRemediationQueues();
  process.stdout.write(`${JSON.stringify(result.result.summary, null, 2)}\n`);
}
