import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { buildProjectRemediationOptimizationPlan } from '../../../../Test Automation Platform/src/governance/project-remediation-optimization';
import type { ProjectRemediationScopeArtifact } from '../../../../Test Automation Platform/src/governance/project-remediation-scope';
import { buildProductCenterProjectOptimizationCases } from '../../adapters/product-center/product-center-project-optimization';
import { buildProductCenterBatchExecutionIntent, buildProductCenterCanaryExecutionIntent } from '../../adapters/product-center/product-center-execution-intent';
import { assertExecutionIntentCheckpointState, assertExecutionIntentContract, assertExecutionIntentImpactScope } from '../../../../Test Automation Platform/src/governance/execution-intent';
import { buildProductCenterItemRemediationScope } from '../../utils/product-center-item-remediation-scope';

const projectRoot = path.resolve(__dirname, '../..');
const scope = JSON.parse(fs.readFileSync(path.join(projectRoot, 'deliverables/system-test-platform/product-center-remediation-scope.json'), 'utf8')) as ProjectRemediationScopeArtifact;

test('项目级优化适配覆盖全部 432 条当前已落地用例', () => {
  const cases = buildProductCenterProjectOptimizationCases({ projectRoot, scope });
  expect(cases).toHaveLength(432);
  expect(new Set(cases.map((item) => item.caseId)).size).toBe(432);
  expect(Object.fromEntries([...new Set(cases.map((item) => item.module))].sort().map((module) => [module, cases.filter((item) => item.module === module).length]))).toEqual({ group: 128, image: 4, item: 202, seasoning: 83, tag: 15 });
  expect(cases.every((item) => item.groupKey && item.caseFingerprint && item.implementationFingerprint)).toBe(true);
  expect(cases.every((item) => item.expectationClaimIds.length > 0)).toBe(true);
  const groupCases = cases.filter((item) => item.module === 'group');
  expect(new Set(groupCases.map((item) => item.groupKey)).size).toBe(59);
  expect(new Set(groupCases.map((item) => item.implementationFingerprint)).size).toBe(55);
  expect(groupCases.find((item) => item.caseId === 'TC-GRP-PKG-030')).toEqual(expect.objectContaining({
    requiredCanary: false,
  }));
});

test('项目优化适配接纳已正式落地的附加商品绑定', () => {
  const generated = fs.readFileSync(path.join(projectRoot, 'tests/generated/product-center-item-216.generated.spec.ts'), 'utf8');
  expect(generated).toContain('TC-ITEM-PKG-078');
  expect(scope.cases.some((item) => item.caseId === 'TC-ITEM-PKG-078')).toBe(true);
  expect(scope.cases.some((item) => item.caseId === 'TC-ITEM-PKG-079')).toBe(true);
  expect(() => buildProductCenterProjectOptimizationCases({ projectRoot, scope })).not.toThrow();
});

test('批次终态按逐条调味收据消费，单条门禁阻断不得吞掉同批其他用例', () => {
  const source = fs.readFileSync(path.join(projectRoot, 'scripts/run-product-center-optimization-batches.ts'), 'utf8');
  expect(source).toContain('resolveEvidenceLedgerTerminalCaseIds');
  expect(source).toContain('resolveProductCenterSourceTerminalCaseIds');
  expect(source).toContain('reconcileCheckpointTerminalCaseIds');
  expect(source).toContain('item.runId === expectedUnitRunId');
  expect(source).not.toContain('ledger.summary?.selected === unit.caseIds.length');
  expect(source).not.toContain('unit.caseIds.filter((caseId) => !blocked.has(caseId))');
});

test('B3 技术失败修复必须先导航再切换语言，并隔离当前运行清理检查点', () => {
  const groupRunner = fs.readFileSync(path.join(projectRoot, 'utils/product-center-group-runner.ts'), 'utf8');
  const sourceRunner = fs.readFileSync(path.join(projectRoot, 'scripts/run-product-center-source-governed.ts'), 'utf8');
  const watchdog = fs.readFileSync(path.join(projectRoot, 'scripts/run-product-center-group-with-watchdog.ts'), 'utf8');
  const resultBuilder = fs.readFileSync(path.join(projectRoot, 'scripts/build-product-center-source-governed-execution-result.ts'), 'utf8');
  for (const functionName of ['runRequiredValidationCase', 'runEmptyOptionsValidationCase']) {
    const start = groupRunner.indexOf(`async function ${functionName}`);
    const body = groupRunner.slice(start, groupRunner.indexOf('\nasync function ', start + 20));
    expect(body.indexOf('await pageObject.open();')).toBeLessThan(body.indexOf('await ensureChineseValidationLocale(page)'));
  }
  expect(groupRunner).not.toContain("page.locator('body').filter({ hasText: /商品|套餐|规格|做法|保存/ })");
  expect(sourceRunner).toContain('PC_CHECKPOINT_ROOT: `output/checkpoints/group/source-governed-${runId}`');
  expect(sourceRunner).toContain("PC_GROUP_TEST_TIMEOUT_MS: '420000'");
  expect(watchdog).toContain("`--timeout=${process.env.PC_GROUP_TEST_TIMEOUT_MS ?? '300000'}`");
  expect(resultBuilder).toContain('`source-governed-${reportManifest.runId}`');
});

test('B4 Seasoning pilot 必须输出同一用例的完整可逆生命周期与双身份零残留证据', () => {
  const source = fs.readFileSync(path.join(
    projectRoot,
    'systems/merchant-center-product-center-seasoning/tests/system.spec.ts',
  ), 'utf8');
  for (const phase of [
    'read-created-api',
    'read-created-ui',
    'read-updated-api',
    'read-updated-ui',
    'delete',
    'read-absent-api',
    'read-absent-ui',
  ]) expect(source).toContain(`lifecyclePhase: '${phase}'`);
  expect(source).toContain("recipe.caseId === 'TC-FLV-SEA-032'");
  expect(source).toContain('for (const identity of pilotRecord.cleanupIdentities)');
  expect(source).toContain('expect(findNamedRecord(absent, identity)).toBeUndefined()');
});

test('非调味 canary 与 batch 使用显式计划和隔离 checkpoint', () => {
  const canarySource = fs.readFileSync(path.join(projectRoot, 'scripts/run-product-center-project-canary.ts'), 'utf8');
  const batchSource = fs.readFileSync(path.join(projectRoot, 'scripts/run-product-center-optimization-batches.ts'), 'utf8');
  for (const source of [canarySource, batchSource]) {
    expect(source).toContain("argument('plan')");
    expect(source).toContain("argument('checkpoint')");
    expect(source).toContain('OPTIMIZATION_PLAN_REQUIRED_BEFORE_BROWSER');
    expect(source).not.toContain("?? 'deliverables/system-test-platform/product-center-optimization-plan.json'");
  }
  expect(batchSource).toContain('const expectedPlanCaseIds = cases.filter((item) => includedModules.has(item.module))');
  expect(batchSource).toContain('batchIds.length !== selectedCaseIds.length');
  expect(batchSource).not.toContain('plan.executionCaseIds.length !== 420');
  expect(batchSource).not.toContain('plan.executionEligibleCaseIds.length !== 418');
  expect(batchSource).toContain("throw new Error('SOURCE_PLAN_SELECTED_CASE_UNKNOWN')");
  expect(batchSource).not.toContain("throw new Error('SOURCE_PLAN_CASE_UNKNOWN')");
  expect(batchSource).toContain('assertExecutionIntentContract({');
  expect(batchSource).toContain('assertExecutionIntentCheckpointState({');
  expect(batchSource).toContain('assertExecutionIntentCompletion({');
  expect(batchSource).toContain('product-center-batch-execution-intent.json');
  expect(batchSource).toContain('const diagnosisPath = repairDiagnosisArgument');
  expect(batchSource).toContain('? sourceRepairDiagnosisPath');
});

test('定向批次执行意图完整固化选择、排除、分区和唯一执行路由', () => {
  const cases = buildProductCenterProjectOptimizationCases({ projectRoot, scope });
  const groupCases = cases.filter((item) => item.module === 'group');
  const selectedCaseIds = ['TC-GRP-ADD-009', 'TC-GRP-MTH-001'];
  const excludedCaseIds = ['TC-GRP-ADD-010', 'TC-GRP-ADD-011'];
  const plan = buildProjectRemediationOptimizationPlan({
    planId: 'merchant-center:targeted-intent-contract',
    scope,
    cases,
    maxBatchSize: 20,
    includedModules: ['group'],
    impactedCaseIds: selectedCaseIds,
    impactTypes: Object.fromEntries(groupCases.map((item) => [item.caseId, selectedCaseIds.includes(item.caseId) ? 'adapter-only' : 'platform-only'])),
    changeId: 'targeted-intent-contract',
  });
  const intent = buildProductCenterBatchExecutionIntent({
    runId: 'targeted-intent-contract-run',
    plan,
    cases,
    selectedCaseIds,
    classifiedExclusionCaseIds: excludedCaseIds,
  });
  expect(intent.plannedCaseIds).toEqual(selectedCaseIds.sort());
  expect(intent.classifiedExclusionCaseIds).toEqual(excludedCaseIds.sort());
  expect(intent.partitionCaseIds).toEqual({ group: selectedCaseIds.sort() });
  expect(intent.routes).toEqual({ sourceGoverned: selectedCaseIds.sort() });
  expect(() => assertExecutionIntentContract({ intent })).not.toThrow();
  expect(() => assertExecutionIntentCheckpointState({
    intent,
    terminalCaseIds: [selectedCaseIds[0]],
    incompleteCaseIds: [selectedCaseIds[1]],
  })).not.toThrow();
});

test('定向执行意图不把范围外可复用用例混入本次影响集', () => {
  const cases = buildProductCenterProjectOptimizationCases({ projectRoot, scope });
  const groupCases = cases.filter((item) => item.module === 'group');
  const selectedCaseIds = ['TC-GRP-ADD-009'];
  const plannedCaseIds = [...selectedCaseIds, 'TC-GRP-MTH-001'];
  const plan = buildProjectRemediationOptimizationPlan({
    planId: 'merchant-center:targeted-reuse-scope-contract',
    scope,
    cases,
    maxBatchSize: 20,
    includedModules: ['group'],
    impactedCaseIds: selectedCaseIds,
    impactTypes: Object.fromEntries(groupCases.map((item) => [
      item.caseId,
      selectedCaseIds.includes(item.caseId) ? 'adapter-only' : 'platform-only',
    ])),
    changeId: 'targeted-reuse-scope-contract',
  });
  plan.reusableCaseIds = ['TC-GRP-TASTE-001'];
  const intent = buildProductCenterBatchExecutionIntent({
    runId: 'targeted-reuse-scope-contract-run',
    plan,
    cases,
    plannedCaseIds,
    selectedCaseIds,
  });
  expect(intent.plannedCaseIds).toEqual(plannedCaseIds.sort());
  expect(intent.plannedCaseIds).not.toContain('TC-GRP-TASTE-001');
  expect(intent.partitionCaseIds).toEqual({ group: plannedCaseIds.sort() });
});

test('B5 当前证据缺口影响集严格守恒为 84 条定向执行', () => {
  const cases = buildProductCenterProjectOptimizationCases({ projectRoot, scope });
  const plan = JSON.parse(fs.readFileSync(path.join(
    projectRoot,
    'deliverables/system-test-platform/b5-reference-evidence-gap-optimization-plan-20260905.json',
  ), 'utf8')) as ReturnType<typeof buildProjectRemediationOptimizationPlan>;
  const impact = JSON.parse(fs.readFileSync(path.join(
    projectRoot,
    'deliverables/system-test-platform/b5-reference-evidence-gap-impact-20260905.json',
  ), 'utf8')) as { impactedCaseIds: string[]; classifiedExclusionCaseIds: string[] };
  const exclusionSet = new Set(impact.classifiedExclusionCaseIds);
  const plannedCaseIds = impact.impactedCaseIds.filter((caseId) => !exclusionSet.has(caseId));
  const intent = buildProductCenterBatchExecutionIntent({
    runId: 'b5-reference-evidence-gap-contract',
    plan,
    cases,
    plannedCaseIds,
    selectedCaseIds: plan.executionEligibleCaseIds,
    classifiedExclusionCaseIds: impact.classifiedExclusionCaseIds,
  });
  expect(intent.plannedCaseIds).toHaveLength(84);
  expect(intent.selectedCaseIds).toHaveLength(84);
  expect(intent.classifiedExclusionCaseIds).toHaveLength(0);
  expect(intent.plannedCaseIds).toEqual(intent.selectedCaseIds);
  expect(intent.plannedCaseIds).not.toContain('TC-GRP-PKG-040');
  expect(intent.plannedCaseIds.filter((caseId) => plan.reusableCaseIds.includes(caseId))).toEqual([]);
  expect(() => assertExecutionIntentContract({ intent })).not.toThrow();
  expect(() => assertExecutionIntentImpactScope({ intent, impactedCaseIds: impact.impactedCaseIds })).not.toThrow();
});

test('图片与标签优化指纹必须和 source-governed 权威绑定一致', () => {
  const cases = buildProductCenterProjectOptimizationCases({ projectRoot, scope });
  const executionPlan = JSON.parse(fs.readFileSync(path.resolve(
    projectRoot,
    '../deliverables/product-center-source-governance/execution-plan.json',
  ), 'utf8')) as { tasks: Array<{ caseId: string; bindingFingerprint?: string | null }> };
  const sourceFingerprintById = new Map(executionPlan.tasks.map((item) => [item.caseId, item.bindingFingerprint]));
  const legacyCases = cases.filter((item) => item.module === 'image' || item.module === 'tag');

  expect(legacyCases).toHaveLength(19);
  expect(legacyCases.every((item) => item.caseFingerprint === sourceFingerprintById.get(item.caseId))).toBe(true);
  expect(new Set(legacyCases.map((item) => item.caseFingerprint)).size).toBe(1);
  const implementationById = new Map(legacyCases.map((item) => [item.caseId, item.implementationFingerprint]));
  expect(implementationById.get('TC-TAG-BDG-009')).not.toBe(implementationById.get('TC-TAG-BDG-020'));
  expect(implementationById.get('TC-TAG-BDG-020')).toBe(implementationById.get('TC-IMG-LIB-025'));
});

test('项目未复用影响用例超过公共预算时只保留候选说明并静态阻断', () => {
  const cases = buildProductCenterProjectOptimizationCases({ projectRoot, scope });
  const plan = buildProjectRemediationOptimizationPlan({ planId: 'merchant-center:product-center-all-landed:contract', scope, cases, maxBatchSize: 20, generatedAt: '2026-08-29T00:00:00.000Z' });
  expect(plan.status).toBe('blocked');
  expect(plan.canaryCaseIds).toEqual([]);
  expect(plan.candidateCanaryCaseIds.length).toBeGreaterThan(30);
  expect(plan.staticIssues.some((issue) => issue.code.startsWith('CANARY_PARTITION_TOO_LARGE') || issue.code.startsWith('GROUP_PARTITION_TOO_FINE'))).toBe(true);
  expect(Object.keys(plan.moduleSummary)).toEqual(['group', 'image', 'item', 'seasoning', 'tag']);
  expect(Object.values(plan.moduleSummary).every((item) => item.canaryCaseCount === 0)).toBe(true);
  expect(plan.executionEligibleCaseIds).toEqual([]);
  expect(plan.staticIssues.filter((issue) => issue.code === 'ITEM_GENERATION_READY_REQUIRED')).toHaveLength(0);
  expect(plan.staticIssues.filter((issue) => issue.code === 'ITEM_AUTHORITATIVE_RUNTIME_READY_REQUIRED')).toHaveLength(0);
  expect(plan.staticIssues.some((issue) => issue.caseId.startsWith('TC-ITEM-'))).toBe(false);
});

test('商品整改范围以核心与附加正式绑定确认 202 条范围内用例全部可优化', () => {
  const artifact = buildProductCenterItemRemediationScope(projectRoot);
  expect(artifact.summary).toEqual({
    scope: 202,
    authoritativeRuntimeReady: 203,
    readyInScope: 202,
    readyOutsideScope: 1,
    scopeNotReady: 0,
    scopeMissingGeneratedRegistration: 0,
  });
  expect(artifact.readyOutsideScope).toEqual(['TC-ITEM-PKG-007']);
  expect(artifact.cases.filter((item) => item.disposition === 'optimization-eligible')).toHaveLength(202);
  expect(artifact.cases.every((item) => item.authoritativeRuntimeReady)).toBe(true);
});

test('商品项目整改资格不得回退到旧 generation-ready 中间产物', () => {
  const adapterSource = fs.readFileSync(path.join(projectRoot, 'adapters/product-center/product-center-project-optimization.ts'), 'utf8');
  const scopeSource = fs.readFileSync(path.join(projectRoot, 'utils/product-center-item-remediation-scope.ts'), 'utf8');
  for (const source of [adapterSource, scopeSource]) {
    expect(source).toContain('product-center-item-authoritative-automation-bindings.json');
    expect(source).not.toContain('product-center-item-generation-ready-v1.json');
  }
});

test('调味单模块输入不能生成商品中心项目计划', () => {
  const cases = buildProductCenterProjectOptimizationCases({ projectRoot, scope }).filter((item) => item.module === 'seasoning');
  expect(() => buildProjectRemediationOptimizationPlan({ planId: 'merchant-center:invalid-seasoning-only', scope, cases, maxBatchSize: 20 })).toThrow(/PROJECT_REMEDIATION_SCOPE_INCOMPLETE/);
});

test('非调味整改波次不得把调味用例带入 canary 或执行候选', () => {
  const cases = buildProductCenterProjectOptimizationCases({ projectRoot, scope });
  const plan = buildProjectRemediationOptimizationPlan({
    planId: 'merchant-center:product-center-non-seasoning:contract',
    scope,
    cases,
    maxBatchSize: 20,
    includedModules: ['group', 'image', 'item', 'tag'],
  });
  expect(plan.includedModules).toEqual(['group', 'image', 'item', 'tag']);
  expect(plan.executionCaseIds).toHaveLength(349);
  expect(plan.canaryCaseIds.every((caseId) => !caseId.startsWith('TC-FLV-'))).toBe(true);
  expect(plan.executionEligibleCaseIds.every((caseId) => !caseId.startsWith('TC-FLV-'))).toBe(true);
  expect(plan.moduleSummary.seasoning.canaryCaseCount).toBe(0);
});

test('非调味 337 条优化选择集必须全部具备唯一实际执行路由', () => {
  const executionPlan = JSON.parse(fs.readFileSync(path.resolve(
    projectRoot,
    '../deliverables/product-center-source-governance/execution-plan.json',
  ), 'utf8')) as {
    revalidation: {
      selectedCaseIds: string[];
      runners: Array<{ runnerId: string; selectedCaseIds: string[] }>;
    };
  };
  const plan = JSON.parse(fs.readFileSync(path.join(
    projectRoot,
    'deliverables/system-test-platform/product-center-non-seasoning-remediation-plan-20260831.json',
  ), 'utf8')) as { selectedCaseIds: string[]; excludedCaseIds: string[] };
  const routed = executionPlan.revalidation.runners.flatMap((runner) => runner.selectedCaseIds);
  expect(plan.selectedCaseIds).toHaveLength(337);
  expect(plan.selectedCaseIds.every((caseId) => !caseId.startsWith('TC-FLV-'))).toBe(true);
  expect(new Set(routed).size).toBe(routed.length);
  expect(plan.selectedCaseIds.every((caseId) => routed.includes(caseId))).toBe(true);
  expect(executionPlan.revalidation.selectedCaseIds.filter((caseId) => !plan.selectedCaseIds.includes(caseId)).sort()).toEqual([
    'TC-GRP-PKG-037',
    'TC-GRP-PKG-038',
    'TC-GRP-PKG-041',
    'TC-GRP-PKG-042',
    'TC-GRP-PKG-043',
    'TC-ITEM-PKG-078',
    'TC-ITEM-PKG-079',
  ]);
  expect(plan.excludedCaseIds.filter((caseId) => caseId.startsWith('TC-FLV-'))).toHaveLength(83);
});

test('商品中心超预算 canary 不得进入任何模块路由', () => {
  const cases = buildProductCenterProjectOptimizationCases({ projectRoot, scope });
  const plan = buildProjectRemediationOptimizationPlan({ planId: 'merchant-center:product-center-all-landed:contract', scope, cases, maxBatchSize: 20, generatedAt: '2026-08-29T00:00:00.000Z' });
  expect(plan.status).toBe('blocked');
  expect(plan.canaryCaseIds).toEqual([]);
  expect(() => buildProductCenterCanaryExecutionIntent({ runId: 'intent-contract', plan, cases })).not.toThrow();
  const executionIntent = buildProductCenterCanaryExecutionIntent({ runId: 'intent-contract', plan, cases });
  expect(executionIntent.selectedCaseIds).toEqual([]);
  expect(() => assertExecutionIntentContract({ intent: executionIntent })).toThrow();
});

test('项目 canary 必须向 source-governed 透传结构化修复诊断', () => {
  const source = fs.readFileSync(path.join(projectRoot, 'scripts/run-product-center-project-canary.ts'), 'utf8');
  expect(source).toContain('const sourceDiagnosis = ensureSourceGovernedRepairDiagnosis(');
  expect(source).toContain("actionableCanaryCaseIds.filter((caseId) => caseById.get(caseId)?.module !== 'seasoning')");
  expect(source).toContain('runProductCenterSourceGoverned({ execute: true, caseIds, repairDiagnosisPath })');
  expect(source).toContain("applicationId: 'merchant-center-product-center'");
  expect(source).toContain('product-center-source-canary-repair-diagnosis.json');
  expect(source).toContain('findSourceCanarySupersededAttempts');
  expect(source).toContain('supersedesAttemptIds: supersededAttempts.map');
  expect(source).toContain('!diagnosedSourceCaseIds.has(item.caseId)');
  expect(source).not.toContain("if (item.module === 'group') result.set(item.caseId, groupFingerprint)");
});

test('已接受产品发现不得进入 source-governed canary 分支', () => {
  const source = fs.readFileSync(path.join(projectRoot, 'scripts/run-product-center-project-canary.ts'), 'utf8');
  expect(source).toContain('const acceptedFindingCaseIds = new Set(plan.acceptedFindingCaseIds ?? []);');
  expect(source).toContain('const actionableCanaryCaseIds = selectedCanaryCaseIds.filter((caseId) => (');
  expect(source).toContain('!acceptedFindingCaseIds.has(caseId)');
  expect(source).not.toContain('observedProductFindingCaseIds.has(caseId)');
  expect(source).toContain('!sentinelCaseIds.has(item.caseId)');
  expect(source).toContain("actionableCanaryCaseIds.filter((caseId) => caseById.get(caseId)?.module !== 'seasoning')");
  expect(source).toContain("const sourceIds = selectedCaseIds.filter((caseId) => caseById.get(caseId)?.module !== 'seasoning');");
  expect(source).not.toContain("selectedCanaryCaseIds.filter((caseId) => caseById.get(caseId)?.module !== 'seasoning')");
});

test('canary 收据合并必须显式区分基础输入与定向替换', () => {
  const source = fs.readFileSync(path.join(projectRoot, 'scripts/merge-product-center-optimization-receipts.ts'), 'utf8');
  expect(source).toContain("argument('replacement-inputs')");
  expect(source).toContain('merged.set(receipt.caseId, receipt)');
  expect(source).toContain('RECEIPT_MERGE_REPLACEMENT_DUPLICATE');
  expect(source).toContain('RECEIPT_MERGE_MISSING');
  expect(source).toContain("process.argv.includes('--allow-partial')");
  expect(source).toContain('missing.length > 0 && !allowPartial');
});

test('canary 收据必须使用当前适配器指纹而不是报告内嵌旧指纹', () => {
  const source = fs.readFileSync(path.join(projectRoot, 'scripts/build-product-center-canary-optimization-receipts.ts'), 'utf8');
  expect(source).toContain('caseFingerprint: current.caseFingerprint');
  expect(source).toContain('implementationFingerprint: current.implementationFingerprint');
});

test('所有优化执行入口必须显式接收当前计划，禁止默认消费旧计划', () => {
  const entrypoints = [
    'scripts/run-product-center-project-canary.ts',
    'scripts/run-product-center-optimization-batches.ts',
    'scripts/merge-product-center-optimization-receipts.ts',
    'scripts/run-product-center-group-finding-replay.ts',
  ];
  for (const entrypoint of entrypoints) {
    const source = fs.readFileSync(path.join(projectRoot, entrypoint), 'utf8');
    expect(source).toMatch(/const planArgument = argument\('plan'\)/);
    expect(source).toMatch(/OPTIMIZATION_PLAN_REQUIRED_BEFORE_(BROWSER|RECEIPT_MERGE)/);
    expect(source).not.toContain("?? 'deliverables/system-test-platform/product-center-optimization-plan.json'");
  }
  const mergeSource = fs.readFileSync(path.join(projectRoot, 'scripts/merge-product-center-optimization-receipts.ts'), 'utf8');
  expect(mergeSource).toContain('OPTIMIZATION_PLAN_REQUIRED_BEFORE_RECEIPT_MERGE');
  expect(mergeSource).toContain('OPTIMIZATION_PLAN_METADATA_REQUIRED');
});
