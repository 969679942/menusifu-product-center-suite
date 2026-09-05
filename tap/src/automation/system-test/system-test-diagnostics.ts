import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import type { SystemTestFailureCategory } from './system-test-progress';

export type SystemTestFailureDiagnostic = {
  caseId: string;
  failureCategory: SystemTestFailureCategory | 'unknown';
  humanSummary: string;
  message?: string;
  route?: string;
  mutationObserved: boolean;
  evidenceComplete: boolean;
  errorArtifact?: string;
  requiredNextAction: SystemTestDiagnosticNextAction;
};

export type SystemTestDiagnosticNextAction =
  | 'audit-action-chain'
  | 'repair-seed-identity'
  | 'repair-context'
  | 'retry-transient'
  | 'inspect-automation';

export function formatSystemTestFailureSummary(input: {
  failureCategory: SystemTestFailureCategory | 'unknown';
  message?: string;
  phase?: string;
  expected?: string;
  actual?: string;
}): string {
  const labels: Record<SystemTestFailureCategory | 'unknown', string> = {
    'product-failure': '产品行为不符合预期',
    'automation-gap': '自动化证据或操作链不完整',
    'environment-failure': '环境、认证或网络不可用',
    'external-dependency': '外部依赖能力不可用',
    'transient-platform': '执行平台瞬时失败',
    'test-data': '测试数据准备或身份冲突',
    'locator-drift': '页面控件定位发生漂移',
    'cleanup-residue': '测试数据清理后仍有残留',
    unknown: '失败原因待进一步确认',
  };
  const details = [
    input.phase?.trim() ? `阶段：${input.phase.trim()}` : '',
    input.expected?.trim() ? `期望：${input.expected.trim()}` : '',
    input.actual?.trim() ? `实际：${input.actual.trim()}` : '',
    redactMessage(input.message)?.trim() ?? '',
  ].filter(Boolean);
  return `${labels[input.failureCategory]}${details.length > 0 ? `｜${details.join('｜')}` : ''}`;
}

export type SystemTestFailureDiagnosticDocument = {
  schemaVersion: '1.0.0';
  generatedAt: string;
  systemId: string;
  runId: string;
  contractFingerprint?: string;
  implementationFingerprint?: string;
  status: 'complete' | 'incomplete' | 'not-run';
  rerunGate:
    | 'action-chain-audit-required'
    | 'seed-identity-repair-required'
    | 'implementation-or-context-change-required'
    | 'none';
  requiredNextActions: SystemTestDiagnosticNextAction[];
  diagnostics: SystemTestFailureDiagnostic[];
};

export function buildSystemTestFailureDiagnosticDocument(input: {
  outputDir: string;
  systemId: string;
  runId: string;
  contractFingerprint?: string;
  implementationFingerprint?: string;
  evidence?: {
    cases?: Array<{
      caseId?: string;
      playwrightStatus?: string;
      failureCategory?: SystemTestFailureCategory;
      runtimeEvidence?: { mutationObserved?: boolean };
      evidence?: { status?: string };
    }>;
  };
}): SystemTestFailureDiagnosticDocument {
  const errorArtifacts = new Map<string, { path: string; message?: string; route?: string }>();
  const checkpointRoot = path.join(input.outputDir, '..', 'checkpoints');
  if (fs.existsSync(checkpointRoot)) {
    for (const file of fs.readdirSync(checkpointRoot)) {
      if (!file.endsWith('.error.json')) continue;
      try {
        const value = JSON.parse(fs.readFileSync(path.join(checkpointRoot, file), 'utf8')) as {
          caseId?: string; message?: string; url?: string;
        };
        if (value.caseId) errorArtifacts.set(value.caseId, {
          path: path.relative(input.outputDir, path.join(checkpointRoot, file)).replaceAll(path.sep, '/'),
          message: redactMessage(value.message),
          route: safeRoute(value.url),
        });
      } catch { /* retain ledger evidence even if an auxiliary error file is truncated */ }
    }
  }
  const diagnostics = (input.evidence?.cases ?? []).filter((item) => item.playwrightStatus !== 'passed' || item.evidence?.status !== 'complete')
    .map((item) => {
      const caseId = item.caseId ?? 'unknown';
      const artifact = errorArtifacts.get(caseId);
      return {
        caseId,
        failureCategory: item.failureCategory ?? 'unknown',
        humanSummary: formatSystemTestFailureSummary({
          failureCategory: item.failureCategory ?? 'unknown',
          message: artifact?.message,
          phase: '执行阶段',
        }),
        ...(artifact?.message ? { message: artifact.message } : {}),
        ...(artifact?.route ? { route: artifact.route } : {}),
        mutationObserved: item.runtimeEvidence?.mutationObserved === true,
        evidenceComplete: item.evidence?.status === 'complete',
        ...(artifact?.path ? { errorArtifact: artifact.path } : {}),
        requiredNextAction: classifyDiagnosticNextAction(
          item.failureCategory ?? 'unknown',
          artifact?.message,
        ),
      } satisfies SystemTestFailureDiagnostic;
    });
  const requiredNextActions = [...new Set(diagnostics.map((item) => item.requiredNextAction))];
  return {
    schemaVersion: '1.0.0',
    generatedAt: new Date().toISOString(),
    systemId: input.systemId,
    runId: input.runId,
    ...(input.contractFingerprint ? { contractFingerprint: input.contractFingerprint } : {}),
    ...(input.implementationFingerprint ? { implementationFingerprint: input.implementationFingerprint } : {}),
    status: diagnostics.length === 0 ? 'not-run' : 'complete',
    rerunGate: requiredNextActions.includes('audit-action-chain')
      ? 'action-chain-audit-required'
      : requiredNextActions.includes('repair-seed-identity')
        ? 'seed-identity-repair-required'
        : diagnostics.some((item) => item.failureCategory !== 'transient-platform')
          ? 'implementation-or-context-change-required' : 'none',
    requiredNextActions,
    diagnostics,
  };
}

export function buildSystemTestDiagnosticWorkQueue(document: SystemTestFailureDiagnosticDocument): {
  schemaVersion: '1.0.0';
  generatedAt: string;
  systemId: string;
  runId: string;
  status: 'ready' | 'empty';
  items: Array<{
    caseId: string;
    action: SystemTestDiagnosticNextAction;
    evidenceRefs: string[];
    recoveryCondition: string;
  }>;
} {
  const items = document.diagnostics.map((item) => ({
    caseId: item.caseId,
    action: item.requiredNextAction,
    evidenceRefs: item.errorArtifact ? [item.errorArtifact] : [],
    recoveryCondition: recoveryCondition(item.requiredNextAction),
  }));
  return {
    schemaVersion: '1.0.0',
    generatedAt: new Date().toISOString(),
    systemId: document.systemId,
    runId: document.runId,
    status: items.length > 0 ? 'ready' : 'empty',
    items,
  };
}

export function classifyDiagnosticNextAction(
  category: SystemTestFailureCategory | 'unknown',
  message: string | undefined,
): SystemTestDiagnosticNextAction {
  const value = message ?? '';
  if (category === 'transient-platform') return 'retry-transient';
  if (category === 'locator-drift' || /locator|控件|按钮|菜单|弹窗|dialog|不可唯一|not visible/i.test(value)) {
    return 'audit-action-chain';
  }
  if (/身份|identity|seed|造数|模板.*缺少|不存在|not found/i.test(value)) return 'repair-seed-identity';
  if (/上下文|context|route|tenant|brand|poi|商户|门店身份/i.test(value)) return 'repair-context';
  return 'inspect-automation';
}

function recoveryCondition(action: SystemTestDiagnosticNextAction): string {
  if (action === 'audit-action-chain') return '补齐控件唯一性、交互顺序、请求映射和终态证据后，更新动作链合同与适配器指纹。';
  if (action === 'repair-seed-identity') return '种子收据提供全部必需服务端身份且就绪适配器验证通过。';
  if (action === 'repair-context') return '目标应用、租户、门店和路由上下文指纹重新验证通过。';
  if (action === 'retry-transient') return '按瞬时失败退避策略完成恢复，且上下文与候选指纹未变化。';
  return '形成结构化根因、纠正动作和证据引用后再执行。';
}

export function fingerprintSystemTestFailureDiagnostic(document: SystemTestFailureDiagnosticDocument): string {
  return createHash('sha256').update(JSON.stringify(document)).digest('hex');
}

function safeRoute(value: string | undefined): string | undefined {
  if (!value) return undefined;
  try { return new URL(value).pathname; } catch { return undefined; }
}

function redactMessage(value: string | undefined): string | undefined {
  if (!value) return undefined;
  return value.replace(/(authorization|cookie|token|password|secret)\s*[:=]\s*[^\s,;]+/gi, '$1=<redacted>').slice(0, 2000);
}
