import fs from 'node:fs';
import path from 'node:path';
import {
  buildTestPlanAssetIndex,
  parseMarkdownTestCases,
  renderTestPlanAssetIndex,
  validateTestPlanAssetIndex,
  type TestPlanAssetCase,
} from '../utils/test-plan-asset-governance';
import {
  productCenterCompletedTestPlanRoot,
  productCenterUnlandedTestPlanRoot,
} from '../utils/product-center-test-plan-source';
import {
  loadProductCenterTestPlanRegistry,
  productCenterRegisteredFormalPath,
  validateProductCenterTestPlanRegistry,
  type ProductCenterTestPlanRegistry,
} from '../utils/product-center-test-plan-registry';
import {
  formatProductCenterExecutionDecisionReason,
  loadProductCenterExecutionDecisions,
} from '../utils/product-center-execution-decisions';

export type AutomationDisposition = {
  scriptPath?: string;
  runtimeStatus?: string;
  status: 'landed' | 'unlanded' | 'not-applicable';
  reason?: string;
  runnerId?: string;
};

const defaultProjectRoot = path.resolve(__dirname, '..');

export function buildTestPlanAssetStatus(options: {
  projectRoot?: string;
  infoRoot?: string;
  registryPath?: string;
  registry?: ProductCenterTestPlanRegistry;
  automationDispositions?: ReadonlyMap<string, AutomationDisposition>;
  generatedAt?: string;
  write?: boolean;
} = {}) {
  const projectRoot = path.resolve(options.projectRoot ?? defaultProjectRoot);
  const workspaceRoot = path.resolve(projectRoot, '..');
  const infoRoot = path.resolve(options.infoRoot ?? path.join(workspaceRoot, 'Merchant Center Info'));
  const registry = options.registry ?? loadProductCenterTestPlanRegistry(projectRoot, options.registryPath);
  validateProductCenterTestPlanRegistry(registry, infoRoot);
  const dispositionByCaseId = options.automationDispositions ?? loadAutomationDispositions(projectRoot, workspaceRoot);
  const canonicalCases = registry.plans.flatMap((plan): TestPlanAssetCase[] => {
    const formalPath = productCenterRegisteredFormalPath(infoRoot, plan);
    const relativeCanonicalPath = relativeWorkspace(formalPath);
    return parseMarkdownTestCases(fs.readFileSync(formalPath, 'utf8')).map((testCase) => ({
      ...testCase,
      module: plan.module,
      canonicalPath: `${relativeCanonicalPath}#${testCase.caseId}`,
      ...(dispositionByCaseId.get(testCase.caseId) ?? {
        status: 'unlanded' as const,
        reason: '尚无可执行自动化绑定',
      }),
    }));
  });
  const canonicalIds = new Set(canonicalCases.map((item) => item.caseId));
  const orphanedAutomation = [...dispositionByCaseId.entries()]
    .filter(([, disposition]) => disposition.status === 'landed')
    .map(([caseId]) => caseId)
    .filter((caseId) => !canonicalIds.has(caseId));
  if (orphanedAutomation.length > 0) {
    throw new Error(`自动化脚本用例未进入权威测试方案：${orphanedAutomation.join(',')}`);
  }

  const index = buildTestPlanAssetIndex(infoRoot, canonicalCases, options.generatedAt);
  validateTestPlanAssetIndex(index, infoRoot, registry.plans, workspaceRoot);
  const completedCases = index.cases.filter((item) => item.status === 'landed');
  const unlandedCases = index.cases.filter((item) => item.status !== 'landed');
  const completedIndex = { ...index, summary: { landed: completedCases.length }, cases: completedCases };
  const unlandedIndex = {
    ...index,
    summary: {
      unlanded: unlandedCases.filter((item) => item.status === 'unlanded').length,
      notApplicable: unlandedCases.filter((item) => item.status === 'not-applicable').length,
    },
    cases: unlandedCases,
  };
  const completedRoot = productCenterCompletedTestPlanRoot(infoRoot);
  const unlandedRoot = productCenterUnlandedTestPlanRoot(infoRoot);
  const outputs = {
    completedJson: path.join(completedRoot, 'index.json'),
    completedMarkdown: path.join(completedRoot, 'index.md'),
    unlandedJson: path.join(unlandedRoot, 'index.json'),
    unlandedMarkdown: path.join(unlandedRoot, 'index.md'),
  };
  if (options.write !== false) {
    writeJson(outputs.completedJson, completedIndex);
    writeText(outputs.completedMarkdown, renderTestPlanAssetIndex(completedIndex, '已落地自动化用例索引'));
    writeJson(outputs.unlandedJson, unlandedIndex);
    writeText(outputs.unlandedMarkdown, renderTestPlanAssetIndex(unlandedIndex, '未落地自动化用例索引'));
  }
  return { index, completedIndex, unlandedIndex, completedCases, unlandedCases, outputs, registry };

  function relativeWorkspace(filePath: string): string {
    return path.relative(workspaceRoot, filePath).replaceAll('\\', '/');
  }
}

export function loadAutomationDispositions(projectRoot: string, workspaceRoot: string): Map<string, AutomationDisposition> {
  const dispositions = new Map<string, AutomationDisposition>();
  const executionDecisions = loadProductCenterExecutionDecisions(projectRoot);
  const itemRelease = readJson<{
    cases: Array<{
      caseId: string;
      scope?: string;
      automation?: { bound?: boolean; scriptPath?: string; blockingReasons?: string[] };
      runtime?: { status?: string };
    }>;
  }>(path.join(workspaceRoot, 'deliverables/product-center-item/test-cases.json'));
  for (const item of itemRelease.cases) {
    const executionDecision = executionDecisions.get(item.caseId);
    if (executionDecision?.status === 'deferred') {
      dispositions.set(item.caseId, {
        status: 'unlanded',
        runtimeStatus: 'deferred',
        reason: `延期跳过：${executionDecision.reason}；恢复条件：${executionDecision.resumeWhen}`,
      });
      continue;
    }
    if (executionDecision?.status === 'not-applicable') {
      dispositions.set(item.caseId, {
        status: 'not-applicable',
        runtimeStatus: 'not-applicable',
        reason: formatProductCenterExecutionDecisionReason(executionDecision),
      });
      continue;
    }
    dispositions.set(item.caseId, item.automation?.bound
      ? {
          status: 'landed',
          scriptPath: normalizeWorkspaceScriptPath(item.automation.scriptPath),
          runnerId: 'item',
        }
      : {
          status: item.scope === 'not-applicable' ? 'not-applicable' : 'unlanded',
          runtimeStatus: item.runtime?.status,
          reason: item.automation?.blockingReasons?.join('；') || item.scope || '尚无可执行自动化绑定',
        });
  }

  const groupBindings = readJson<{
    cases: Array<{
      caseId: string;
      generationAllowed?: boolean;
      handlerId?: string | null;
      blockClassification?: string | null;
      blockedReasons?: string[];
    }>;
  }>(path.join(projectRoot, 'contracts/product-center/group/product-center-group-bindings.json'));
  for (const binding of groupBindings.cases) {
    const executionDecision = executionDecisions.get(binding.caseId);
    if (executionDecision?.status === 'deferred') {
      dispositions.set(binding.caseId, {
        status: 'unlanded',
        reason: `延期跳过：${executionDecision.reason}；恢复条件：${executionDecision.resumeWhen}`,
      });
      continue;
    }
    if (executionDecision?.status === 'not-applicable') {
      dispositions.set(binding.caseId, {
        status: 'not-applicable',
        reason: formatProductCenterExecutionDecisionReason(executionDecision),
      });
      continue;
    }
    dispositions.set(binding.caseId, binding.generationAllowed && binding.handlerId
      ? {
          status: 'landed',
          scriptPath: 'Merchant Center UITest/tests/generated/product-center-group.generated.spec.ts',
          runnerId: 'group',
        }
      : {
          status: binding.blockClassification === 'not-applicable' ? 'not-applicable' : 'unlanded',
          reason: binding.blockedReasons?.join('；') || binding.blockClassification || '尚无可执行自动化绑定',
        });
  }

  const legacyBindings = readJson<{
    bindings: Array<{ caseId: string; scriptPath: string }>;
  }>(path.join(
    projectRoot,
    'contracts/product-center/test-cases/canonical/product-center-legacy-remaining-automation-bindings.json',
  ));
  for (const binding of legacyBindings.bindings) {
    dispositions.set(binding.caseId, {
      status: 'landed',
      scriptPath: `Merchant Center UITest/${binding.scriptPath}`,
      runnerId: 'remaining',
    });
  }
  const additionalBindings = readJson<{
    // Additional bindings may carry descriptive metadata such as `module`
    // and `title`. Only the disposition fields belong in the shared asset
    // index; spreading the source object would overwrite the canonical plan
    // module (for example, `item` with `brand-item`).
    bindings: Array<{
      caseId: string;
      status: AutomationDisposition['status'];
      scriptPath?: string;
      runtimeStatus?: string;
      reason?: string;
      runnerId?: string;
    }>;
  }>(path.join(projectRoot, 'contracts/product-center/test-plan-additional-automation-bindings.json'));
  for (const binding of additionalBindings.bindings) {
    dispositions.set(binding.caseId, {
      status: binding.status,
      ...(binding.runtimeStatus ? { runtimeStatus: binding.runtimeStatus } : {}),
      ...(binding.reason ? { reason: binding.reason } : {}),
      ...(binding.runnerId ? { runnerId: binding.runnerId } : {}),
      ...(binding.scriptPath ? { scriptPath: normalizeWorkspaceScriptPath(binding.scriptPath) } : {}),
    });
  }
  // The seasoning system-test adapter is the authoritative binding source for
  // the seasoning plan. Keep its formal cases in the same index pipeline as
  // item/group adapters; classified exclusions remain unlanded here.
  const seasoningBindingsPath = path.join(
    projectRoot,
    'systems/merchant-center-product-center-seasoning/binding-registry.json',
  );
  if (fs.existsSync(seasoningBindingsPath)) {
    const seasoningBindings = readJson<{
      bindings: Array<{ caseId: string; generationAllowed: boolean }>;
    }>(seasoningBindingsPath);
    for (const binding of seasoningBindings.bindings) {
      dispositions.set(binding.caseId, binding.generationAllowed
        ? {
            status: 'landed',
            scriptPath: 'Merchant Center UITest/systems/merchant-center-product-center-seasoning/tests/system.spec.ts',
            runnerId: 'system-test-seasoning',
          }
        : {
            status: 'unlanded',
            runnerId: 'system-test-seasoning',
            reason: '调味正式用例已登记但当前未允许生成自动化绑定',
          });
    }
  }
  return dispositions;

  function normalizeWorkspaceScriptPath(scriptPath: string | undefined): string | undefined {
    if (!scriptPath) return undefined;
    const normalized = scriptPath.replaceAll('\\', '/');
    return normalized.startsWith('Merchant Center UITest/') ? normalized : `Merchant Center UITest/${normalized}`;
  }
}

function readJson<T>(filePath: string): T {
  return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T;
}

function writeJson(filePath: string, value: unknown): void {
  writeText(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function writeText(filePath: string, value: string): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.tmp`;
  fs.writeFileSync(temporaryPath, value, 'utf8');
  fs.renameSync(temporaryPath, filePath);
}

if (require.main === module) {
  const checkOnly = process.argv.includes('--check');
  const completedPath = path.join(
    path.resolve(defaultProjectRoot, '../Merchant Center Info'),
    '00-待转换测试方案/已完成/index.json',
  );
  const generatedAt = checkOnly && fs.existsSync(completedPath)
    ? readJson<{ generatedAt: string }>(completedPath).generatedAt
    : undefined;
  const result = buildTestPlanAssetStatus({ generatedAt, write: !checkOnly });
  if (checkOnly) {
    const expectedFiles = [
      [result.outputs.completedJson, `${JSON.stringify(result.completedIndex, null, 2)}\n`],
      [result.outputs.completedMarkdown, renderTestPlanAssetIndex(result.completedIndex, '已落地自动化用例索引')],
      [result.outputs.unlandedJson, `${JSON.stringify(result.unlandedIndex, null, 2)}\n`],
      [result.outputs.unlandedMarkdown, renderTestPlanAssetIndex(result.unlandedIndex, '未落地自动化用例索引')],
    ] as const;
    const stale = expectedFiles.filter(([filePath, expected]) => (
      !fs.existsSync(filePath) || normalizeNewlines(fs.readFileSync(filePath, 'utf8')) !== normalizeNewlines(expected)
    )).map(([filePath]) => filePath);
    if (stale.length > 0) throw new Error(`正式用例资产索引已过期：${stale.join('、')}`);
  }
  process.stdout.write(`${JSON.stringify({
    total: result.index.cases.length,
    landed: result.completedCases.length,
    unlanded: result.unlandedCases.length,
    modules: result.registry.plans.length,
    checked: checkOnly,
  })}\n`);
}

function normalizeNewlines(value: string): string {
  return value.replaceAll('\r\n', '\n').replaceAll('\r', '\n');
}
