import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import {
  assertProductCenterGroupBindingsCurrent,
  buildGroupAutomationBindings,
  evaluateGroupEvidence,
  readGroupValidationFeedbackContract,
  type GroupCase,
} from '../../utils/product-center-group-automation';
import { groupQueryResetRestorationFailure } from '../../utils/product-center-group-runner';
import {
  compileProductCenterGroupHandler,
  matchingProductCenterGroupHandlerRules,
} from '../../utils/product-center-group-handler-compiler';
import { isAuthOnlyFailure } from '../../scripts/run-product-center-group-with-watchdog';
import { remainingCapabilityFor } from '../../scripts/build-product-center-group-final-report';
import {
  loadProductCenterGroupDriftDecisionRegistry,
  stableClaimsHash,
} from '../../utils/product-center-group-semantic-gate';
import { loadProductCenterSourceGovernance } from '../../utils/product-center-source-governance';

const projectRoot = path.resolve(__dirname, '../..');
const contract = JSON.parse(fs.readFileSync(
  path.join(projectRoot, 'contracts/product-center/generated/modules/brand-group.json'),
  'utf8',
));
const sourceCases = JSON.parse(fs.readFileSync(
  path.resolve(projectRoot, '../deliverables/product-center-group/test-cases.json'),
  'utf8',
)).cases as GroupCase[];
const sourceCaseById = new Map(sourceCases.map((item) => [item.id, item]));
const sourceTitle = (caseId: string): string => {
  const sourceCase = sourceCaseById.get(caseId);
  if (!sourceCase) throw new Error(`缺少正式组用例：${caseId}`);
  return sourceCase.title;
};

function groupCase(input: Partial<GroupCase> & Pick<GroupCase, 'id' | 'title'>): GroupCase {
  const sourceCase = sourceCaseById.get(input.id);
  return {
    id: input.id,
    title: input.title,
    module: input.module ?? sourceCase?.module ?? '商品管理 → 规格组',
    priority: input.priority ?? sourceCase?.priority ?? 'P0',
    source: input.source ?? sourceCase?.source ?? 'BR-GRP-TEST',
    preconditions: input.preconditions ?? sourceCase?.preconditions ?? ['存在唯一测试数据。'],
    steps: input.steps ?? sourceCase?.steps ?? ['执行明确业务动作。'],
    expectedResults: input.expectedResults ?? sourceCase?.expectedResults ?? ['验证明确业务终态。'],
  };
}

test.describe('商品中心组自动化防假通过合同', () => {
  test('正式执行前静态绑定必须与当前生成逻辑一致', async () => {
    expect(() => assertProductCenterGroupBindingsCurrent(projectRoot)).not.toThrow();
  });
  test('人工截图证据必须可追溯但不得冒充运行通过证据', async () => {
    const manifestPath = path.join(
      projectRoot,
      'contracts/product-center/group/product-center-group-human-evidence-manifest.json',
    );
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as {
      evidencePolicy: { screenshotAloneCannotPass: boolean; runtimePassRequiresExecutionReceipt: boolean };
      assets: Array<{
        path: string;
        sha256: string;
        bytes: number;
        caseIds: string[];
        evidenceRole: string;
        runtimeProofEligible: boolean;
        captureContext: Record<string, string | null>;
        limitations: string[];
      }>;
    };
    expect(manifest.evidencePolicy.screenshotAloneCannotPass).toBe(true);
    expect(manifest.evidencePolicy.runtimePassRequiresExecutionReceipt).toBe(true);
    expect(manifest.assets.length).toBeGreaterThan(0);
    const assetsByPath = new Map(manifest.assets.map((asset) => [asset.path, asset]));
    const bindings = buildGroupAutomationBindings(sourceCases, contract, readGroupValidationFeedbackContract(projectRoot));
    const referencedPaths = bindings.flatMap((binding) => [
      ...binding.blockEvidencePaths,
      ...(binding.expectedUiFeedback?.evidencePaths ?? []),
    ]).filter((value) => value.includes('/人工确认证据/') || value.includes('\\人工确认证据\\'));
    for (const relativePath of [...new Set(referencedPaths)]) {
      const normalizedPath = relativePath.replaceAll('\\', '/');
      const asset = assetsByPath.get(normalizedPath);
      expect(asset, normalizedPath).toBeDefined();
    }
    for (const asset of manifest.assets) {
      const absolutePath = path.resolve(projectRoot, '..', asset.path);
      const contents = fs.readFileSync(absolutePath);
      expect(contents.length, asset.path).toBe(asset.bytes);
      expect(crypto.createHash('sha256').update(contents).digest('hex'), asset.path).toBe(asset.sha256);
      expect(asset.evidenceRole, asset.path).toBe('human-rule-confirmation');
      expect(asset.runtimeProofEligible, asset.path).toBe(false);
      expect(asset.caseIds.length, asset.path).toBeGreaterThan(0);
      expect(asset.limitations.length, asset.path).toBeGreaterThan(0);
    }
  });

  test('来源治理阻断用例不得进入组执行合同', async () => {
    const governance = loadProductCenterSourceGovernance(projectRoot);
    const feedback = readGroupValidationFeedbackContract(projectRoot);
    const bindings = buildGroupAutomationBindings(sourceCases, contract, feedback, governance);
    const blockedGroupCaseIds = [...governance.decisions.values()]
      .filter((item) => item.module === 'brand-group' && item.currentGoalBlocking)
      .map((item) => item.caseId);
    expect(blockedGroupCaseIds).toContain('TC-GRP-ADD-031');
    for (const caseId of blockedGroupCaseIds) {
      const binding = bindings.find((item) => item.caseId === caseId);
      if (!binding) continue;
      expect(binding.generationAllowed, caseId).toBe(false);
      expect(binding.sourceGovernance.currentGoalBlocking, caseId).toBe(true);
      expect(binding.blockedReasons.join('\n'), caseId).toContain('来源证据阻断');
    }
    const verifiedExecutable = [...governance.decisions.values()]
      .filter((item) => item.status === 'verified')
      .filter((item) => bindings.some((binding) => binding.caseId === item.caseId && binding.generationAllowed));
    expect(verifiedExecutable.length).toBeGreaterThan(0);
  });

  test('套餐组精确提示必须来自审计合同而非 runner 硬编码', async () => {
    const feedback = readGroupValidationFeedbackContract(projectRoot);
    const bindings = buildGroupAutomationBindings(sourceCases, contract, feedback);
    const expected = feedback.cases.filter((item) => ['TC-GRP-PKG-030', 'TC-GRP-PKG-033'].includes(item.caseId));
    expect(expected).toHaveLength(2);
    for (const item of expected) {
      const binding = bindings.find((candidate) => candidate.caseId === item.caseId);
      expect(binding?.expectedUiFeedback).toEqual({
        locale: item.locale,
        exactMessage: item.exactMessage,
        evidencePaths: item.evidencePaths,
      });
    }
    const runnerSource = fs.readFileSync(
      path.join(projectRoot, 'utils/product-center-group-runner.ts'),
      'utf8',
    );
    expect(runnerSource).not.toContain('最多选择数量不能小于最少选择数量');
  });

  test('执行 handler 必须由业务语义唯一编译且不得维护 case ID 清单', async () => {
    const bindings = JSON.parse(fs.readFileSync(
      path.join(projectRoot, 'contracts/product-center/group/product-center-group-bindings.json'),
      'utf8',
    )).cases as Array<{ caseId: string; title: string; module: string; mode: string; handlerId: string | null }>;

    for (const binding of bindings.filter((item) => item.handlerId !== null)) {
      const input = { title: binding.title, module: binding.module, mode: binding.mode };
      expect(matchingProductCenterGroupHandlerRules(input), binding.caseId).toHaveLength(1);
      expect(compileProductCenterGroupHandler(input), binding.caseId).toBe(binding.handlerId);
    }

    const compilerSource = fs.readFileSync(
      path.join(projectRoot, 'utils/product-center-group-handler-compiler.ts'),
      'utf8',
    );
    const automationSource = fs.readFileSync(
      path.join(projectRoot, 'utils/product-center-group-automation.ts'),
      'utf8',
    );
    expect(compilerSource).not.toContain('TC-GRP-');
    expect(automationSource.slice(
      automationSource.indexOf('function executionProfileFor'),
      automationSource.indexOf('function externalDependencyFor'),
    )).not.toContain('TC-GRP-');
    expect(automationSource).not.toContain('function observedProductDriftFor');
    expect(automationSource).not.toContain('const drifts: Record');
  });

  test('P0 门禁必须先识别用例语义冲突和断言页面错配', async () => {
    const bindings = buildGroupAutomationBindings([
      groupCase({
        id: 'TC-GRP-SEMANTIC-001',
        title: '新增规格明细弹窗点击取消不保存',
        steps: ['编辑规格组 A，添加规格明细并填写后点击取消。'],
        expectedResults: ['取消后规格组 A 仍只有原明细。'],
      }),
      groupCase({
        id: 'TC-GRP-SEMANTIC-002',
        title: '新增规格组填写全部字段保存成功',
        steps: ['填写全部字段保存后返回列表查询。'],
        expectedResults: ['列表展示全部已填写字段。'],
      }),
      groupCase({
        id: 'TC-GRP-SEMANTIC-003',
        title: '新增规格组后在列表查看设备编码',
        steps: ['填写设备编码保存后返回列表查询。'],
        expectedResults: ['列表展示 Device Code。'],
      }),
      groupCase({
        id: 'TC-GRP-SEMANTIC-004',
        title: '加料价格仅允许数字',
        module: '商品管理 → 加料组',
        steps: ['在加料明细价格输入字母后保存。'],
        expectedResults: ['加料明细价格提示格式错误。'],
      }),
      groupCase({
        id: 'TC-GRP-SEMANTIC-005',
        title: '加料组内单次加价超过两位小数保存失败',
        module: '商品管理 → 加料组',
        source: 'BR-FMT-005',
        steps: ['在单次加价输入 1.999 后保存。'],
        expectedResults: ['显示精度错误且不发送保存请求。'],
      }),
    ], contract);

    expect(bindings[0]).toMatchObject({
      generationAllowed: false,
      blockClassification: 'case-spec-conflict',
    });
    expect(bindings[1]).toMatchObject({
      generationAllowed: false,
      blockClassification: 'assertion-surface-mismatch',
    });
    expect(bindings[2]).toMatchObject({
      generationAllowed: false,
      blockClassification: 'assertion-surface-mismatch',
    });
    expect(bindings[3]).toMatchObject({
      generationAllowed: false,
      blockClassification: 'field-identity-ambiguous',
    });
    expect(bindings[4]).toMatchObject({
      generationAllowed: false,
      blockClassification: 'source-rule-conflict',
    });
    expect(bindings.every((binding) => binding.blockedReasons[0].includes('产品偏差'))).toBe(false);
  });

  test('产品偏差登记必须与当前未闭环偏差完全一致', async () => {
    const registry = loadProductCenterGroupDriftDecisionRegistry(projectRoot);
    expect(registry.decisions).toHaveLength(1);
    expect(new Set(registry.decisions.map((item) => item.caseId))).toEqual(new Set(['TC-GRP-PKG-040']));
    expect(registry.decisions.some((item) => item.caseId === 'TC-GRP-ADD-005')).toBe(false);
    for (const decision of registry.decisions) {
      const sourceCase = sourceCaseById.get(decision.caseId);
      expect(sourceCase, decision.caseId).toBeDefined();
      expect(decision.expectedClaimsHash, decision.caseId).toBe(stableClaimsHash(sourceCase!.expectedResults));
      expect(decision.sourceTitle, decision.caseId).toBe(sourceCase!.title);
      expect(decision.sourceRef, decision.caseId).toContain(decision.caseId);
      expect(decision.evidence.length, decision.caseId).toBeGreaterThan(0);
      expect(['evidence-confirmed', 'human-confirmed']).toContain(decision.decisionStatus);
    }

  });

  test('P0 门禁报告必须证明语义问题为零且偏差登记完全对应', async () => {
    const report = JSON.parse(fs.readFileSync(
      path.resolve(projectRoot, '../deliverables/product-center-group/p0-semantic-gate-report.json'),
      'utf8',
    ));
    const bindings = JSON.parse(fs.readFileSync(
      path.join(projectRoot, 'contracts/product-center/group/product-center-group-bindings.json'),
      'utf8',
    )).cases as Array<{ generationAllowed: boolean }>;
    expect(report).toMatchObject({
      status: 'passed',
      sourceCases: 141,
      executableCases: bindings.filter((item) => item.generationAllowed).length,
      caseSpecConflict: 0,
      assertionSurfaceMismatch: 0,
      fieldIdentityAmbiguous: 0,
      sourceRuleConflict: 0,
      registeredProductDrifts: 1,
      classifiedProductDrifts: 1,
      gates: {
        interactionContainerIsBusinessInvariant: false,
        productDriftRequiresCurrentSourceHash: true,
        productDriftRequiresEvidenceHash: true,
        productDriftRegistryMustMatchClassification: true,
        priceFieldIdentityRequired: true,
        sourceRuleEntailmentRequired: true,
        semanticIssuesFailBuild: true,
      },
    });
    expect(report.assertionSurfaceContract).toEqual(expect.arrayContaining([
      expect.objectContaining({ fieldId: 'spec.value', authoritativeSurfaces: ['detail-ui', 'api'] }),
      expect.objectContaining({ fieldId: 'spec.device-code', authoritativeSurfaces: ['detail-ui', 'api'] }),
      expect.objectContaining({ fieldId: 'addon.group-products', authoritativeSurfaces: ['detail-ui', 'api'] }),
    ]));
  });

  test('快速审核不得保留已修复 UI 用例白名单', async () => {
    const source = fs.readFileSync(path.join(projectRoot, 'utils/product-center-group-fast-review.ts'), 'utf8');
    expect(source).not.toContain('const acceptCurrentUiContract');
    expect(source).not.toContain("'TC-GRP-SPEC-023'");
    expect(source).not.toContain("'TC-GRP-SPEC-028'");
    expect(source).not.toContain("'TC-GRP-TASTE-019'");
  });


  test('绑定必须原样保留来源前置步骤和预期', async () => {
    const source = groupCase({
      id: 'TC-GRP-SPEC-001',
      title: '规格组列表页展示正确',
      preconditions: ['前置 A'],
      steps: ['步骤 A', '步骤 B'],
      expectedResults: ['预期 A', '预期 B'],
    });
    const [binding] = buildGroupAutomationBindings([source], contract);

    expect(binding.preconditions).toEqual(source.preconditions);
    expect(binding.steps).toEqual(source.steps);
    expect(binding.expectedResults).toEqual(source.expectedResults);
  });

  test('商品编辑页加料组 locator 必须兼容前端下划线转义且保持精确匹配', async () => {
    const locatorSource = fs.readFileSync(
      path.join(projectRoot, 'pages/product-management/item/item-create-form-locators.ts'),
      'utf8',
    );
    expect(locatorSource).toContain("groupName.replace(/_/g, '\\\\_')");
    expect(locatorSource).toContain('.or(');
    expect(locatorSource).toContain("{ exact: true }");
  });

  test('商品残留搜索必须拒绝旧全量列表覆盖并通过幂等查询收敛', async () => {
    const pageSource = fs.readFileSync(
      path.join(projectRoot, 'pages/product-management/item/item-list.page.ts'),
      'utf8',
    );
    const residueSearch = pageSource.slice(
      pageSource.indexOf('async fillSearchForResidueCheck'),
      pageSource.indexOf("@step('进入新增商品类型选择页')"),
    );
    expect(residueSearch).toContain('await waitUntil(');
    expect(residueSearch).toContain('emptyVisible || rowsMatched');
    expect(residueSearch).toContain('rowTexts.every');
    expect(pageSource).toContain('private async performSearchAndWait(keyword: string)');
    expect(residueSearch).toContain('await this.performSearchAndWait(keyword)');
    expect(residueSearch).not.toContain('await this.fillSearchAndWait(keyword)');
    expect(residueSearch).toContain('state.stableForMs >= 1_000');
    expect(residueSearch).toContain('queryRequired = true');
  });

  test('缺少任一证据或断言不得判为覆盖完成', async () => {
    const [binding] = buildGroupAutomationBindings([
      groupCase({
        id: 'TC-GRP-SPEC-001',
        title: '规格组列表页展示正确',
        steps: ['进入列表。', '查看结构。'],
        expectedResults: ['路由加载成功。', '列表结构正确。'],
      }),
    ], contract);
    const coverage = evaluateGroupEvidence(binding, {
      handlerId: 'group-list-structure',
      evidence: ['navigation', 'ui-assertion'],
      assertionIds: binding.assertionIds.slice(0, 1),
    });

    expect(coverage.complete).toBe(false);
    expect(coverage.missingEvidence).toEqual(['api-read']);
    expect(coverage.missingAssertions).toHaveLength(1);
    expect(coverage.unexpectedAssertions).toEqual([]);
  });

  test('额外或伪造断言收据不得判为覆盖完成', async () => {
    const [binding] = buildGroupAutomationBindings([
      groupCase({ id: 'TC-GRP-SPEC-001', title: '规格组列表页展示正确' }),
    ], contract);
    const coverage = evaluateGroupEvidence(binding, {
      handlerId: 'group-list-structure',
      evidence: binding.requiredEvidence,
      assertionIds: [...binding.assertionIds, 'assertion:group:forged'],
    });

    expect(coverage.complete).toBe(false);
    expect(coverage.missingAssertions).toEqual([]);
    expect(coverage.unexpectedAssertions).toEqual(['assertion:group:forged']);
  });

  test('查询重置按身份与过滤解除判定，不把列表数量波动误判为失败', async () => {
    expect(groupQueryResetRestorationFailure({
      identity: 'AUTO_AUDIT_ADD_001',
      keyword: 'AUDIT',
      beforeCount: 13,
      matchedRows: ['AUTO_AUDIT_ADD_001'],
      resetRows: ['AUTO_AUDIT_ADD_001', 'Topping Choice'],
    })).toBeNull();

    expect(groupQueryResetRestorationFailure({
      identity: 'AUTO_AUDIT_ADD_001',
      keyword: 'AUDIT',
      beforeCount: 13,
      matchedRows: ['AUTO_AUDIT_ADD_001'],
      resetRows: ['AUTO_AUDIT_ADD_001'],
    })).toBe('重置后结果仍受原查询条件约束');

    expect(groupQueryResetRestorationFailure({
      identity: 'AUTO_AUDIT_ADD_001',
      keyword: 'AUDIT',
      beforeCount: 1,
      matchedRows: ['AUTO_AUDIT_ADD_001'],
      resetRows: ['Topping Choice'],
    })).toBe('重置后原始记录未恢复');
  });

  test('查询重置必须自建夹具并进入写通道完成清理闭环', async () => {
    const bindings = JSON.parse(fs.readFileSync(
      path.join(projectRoot, 'contracts/product-center/group/product-center-group-bindings.json'),
      'utf8',
    )).cases as Array<{
      handlerId: string | null;
      generationAllowed: boolean;
      executionProfile: string;
      requiredEvidence: string[];
    }>;
    const queryBindings = bindings.filter((binding) => binding.handlerId === 'group-query-reset');

    expect(queryBindings).toHaveLength(4);
    for (const binding of queryBindings) {
      expect(binding).toMatchObject({ generationAllowed: true, executionProfile: 'query-reset' });
      expect(binding.requiredEvidence).toEqual(expect.arrayContaining([
        'api-mutation',
        'api-read',
        'cleanup',
      ]));
    }

    const runnerSource = fs.readFileSync(path.join(projectRoot, 'utils/product-center-group-runner.ts'), 'utf8');
    expect(runnerSource).toContain('runGroupQueryResetCase(');
    expect(runnerSource).toContain('seedGroupRecord(entity, productCenterApi, cleanupRegistry)');
    expect(runnerSource).not.toContain('缺少可查询列表数据');
  });

  test('watchdog 仅在认证失败且业务零执行时允许批次级退避重试', async () => {
    const authOnlyDocument = {
      suites: [{
        specs: [{
          tags: ['case-TC-GRP-ADD-023'],
          tests: [{ results: [] }],
        }],
      }],
    };
    const failedSetup = { runId: 'run', caseId: '__setup__', phase: 'failed', updatedAt: new Date().toISOString() };

    expect(isAuthOnlyFailure(authOnlyDocument, failedSetup)).toBe(true);
    expect(isAuthOnlyFailure({
      suites: [{
        specs: [{
          tags: ['case-TC-GRP-ADD-023'],
          tests: [{ results: [{ status: 'failed' }] }],
        }],
      }],
    }, failedSetup)).toBe(false);
    expect(isAuthOnlyFailure(authOnlyDocument, { ...failedSetup, caseId: 'TC-GRP-ADD-023' })).toBe(false);

    const watchdogSource = fs.readFileSync(
      path.join(projectRoot, 'scripts/run-product-center-group-with-watchdog.ts'),
      'utf8',
    );
    expect(watchdogSource).toContain('[5_000, 15_000, 30_000, 60_000]');
    expect(watchdogSource).toContain('archiveAuthAttemptJson(attempt)');
    const progressSource = fs.readFileSync(
      path.join(projectRoot, 'utils/product-center-group-progress.ts'),
      'utf8',
    );
    expect(progressSource).toContain("'read-retrying'");
  });

  test('全部外部依赖必须归并为共享能力任务且不得漏配', async () => {
    const bindings = JSON.parse(fs.readFileSync(
      path.join(projectRoot, 'contracts/product-center/group/product-center-group-bindings.json'),
      'utf8',
    )).cases as Array<Record<string, unknown>>;
    const blocked = bindings.filter((item) => [
      'external-dependency-blocked',
      'observed-product-drift',
    ].includes(String(item.blockClassification)));
    const capabilities = blocked.map((item) => remainingCapabilityFor({
      ...item,
      classification: item.blockClassification,
    }));

    expect(blocked.length).toBeGreaterThan(0);
    expect(new Set(capabilities.map((item) => item.capabilityId))).toEqual(new Set([
      'fixture:terminal-observation',
      'product-decision:group-form-validation',
    ]));
    const industryCase = remainingCapabilityFor({
      caseId: 'TC-GRP-SPEC-024',
      title: '规格信息可从行业商品继承成功',
      classification: 'external-dependency-blocked',
    });
    expect(industryCase.capabilityId).toBe('fixture:industry-item-inheritance');
  });

  test('Playwright 状态不参与业务证据覆盖判定', async () => {
    const reportSource = fs.readFileSync(
      path.join(projectRoot, 'scripts/build-product-center-group-final-report.ts'),
      'utf8',
    );

    expect(reportSource).not.toContain("uiAssertionObserved: observed.status === 'passed'");
    expect(reportSource).not.toContain("claimCoverageComplete: item.status === 'passed'");
    expect(reportSource).toContain("classification === 'passed'");
  });

  test('最终报告不得复用其他用例的同类实体检查点', async () => {
    const reportSource = fs.readFileSync(
      path.join(projectRoot, 'scripts/build-product-center-group-final-report.ts'),
      'utf8',
    );

    expect(reportSource).not.toContain('findLatestCheckpoint');
    expect(reportSource).not.toContain('mutationCheckpoints');
    expect(reportSource).toContain('observed.runtimeEvidence?.cleanup');
    expect(reportSource).toContain('附件与 checkpoint 不一致');
    expect(reportSource).toContain('stableJson(checkpoint.entries) !== stableJson(cleanup.entries)');
  });

  test('正式运行和报告不得持久化包含认证流量的 trace', async () => {
    const configSource = fs.readFileSync(path.join(projectRoot, 'playwright.config.ts'), 'utf8');
    const reportSource = fs.readFileSync(
      path.join(projectRoot, 'scripts/build-product-center-group-final-report.ts'),
      'utf8',
    );

    expect(configSource).toContain("trace: 'off'");
    expect(reportSource).not.toContain("'trace.zip'");
  });

  test('登录态复用与每条商品中心用例必须校验目标商户上下文', async () => {
    const setupSource = fs.readFileSync(path.join(projectRoot, 'tests/setup/auth.setup.ts'), 'utf8');
    const flowSource = fs.readFileSync(path.join(projectRoot, 'flows/auth.flow.ts'), 'utf8');
    const fixtureSource = fs.readFileSync(path.join(projectRoot, 'fixtures/product-center.fixture.ts'), 'utf8');

    expect(setupSource).toContain('bootstrapMerchantCenterSession');
    expect(setupSource).toContain('expectedBrandId: appConfig.brandId');
    expect(flowSource).toContain('isCurrentMerchant(auth.merchant)');
    expect(flowSource).toContain('openMerchantSelection()');
    expect(flowSource).toContain('(brandId) => brandId === auth.brandId');
    expect(fixtureSource).toContain("{ auto: true }");
    expect(fixtureSource).toContain('establishMerchantCenterSession(page, auth, {');
  });

  test('多语言查询必须使用专用写入查询清理 handler', async () => {
    const [binding] = buildGroupAutomationBindings([
      groupCase({
        id: 'TC-GRP-SPEC-003',
        title: '规格组按第二语言多语言查询成功',
        preconditions: ['规格组 A 的第二语言为 `スペック`。'],
        steps: ['输入第二语言查询。'],
        expectedResults: ['列表展示规格组 A。'],
      }),
    ], contract);

    expect(binding).toMatchObject({
      handlerId: 'group-multilang-query',
      generationAllowed: true,
    });
    expect(binding.requiredEvidence).toEqual(expect.arrayContaining([
      'api-mutation',
      'api-read',
      'ui-assertion',
      'cleanup',
    ]));
  });


  test('被引用加料组新增明细必须使用真实 owner 专用 handler 自动执行', async () => {
    const [binding] = buildGroupAutomationBindings([
      groupCase({
        id: 'TC-GRP-ADD-012',
        title: '已被引用加料组新增明细不自动同步到商品',
        module: '商品管理 → 加料组',
        preconditions: ['存在一个已被商品引用的加料组。'],
        steps: ['向已被引用的加料组新增加料商品明细，查看引用商品。'],
        expectedResults: ['引用商品不自动增加新明细。'],
      }),
    ], contract);

    expect(binding).toMatchObject({
      handlerId: 'addon-added-option-not-propagated',
      generationAllowed: true,
      blockClassification: null,
      factoryId: 'factory:group:addon',
      cleanupId: 'cleanup:group:addon',
    });
    expect(binding.blockEvidencePaths).toEqual([]);
    expect(binding.capabilityIds).toEqual(expect.arrayContaining([
      'brand-product.single-sku.api',
      'brand-product.addon-candidate.api',
      'brand-product.group-reference-owner.ui',
      'brand-product.cleanup.api-ui',
    ]));
    expect(binding.requiredEvidence).toEqual(expect.arrayContaining([
      'navigation',
      'ui-assertion',
      'api-mutation',
      'api-read',
      'downstream',
      'cleanup',
    ]));
  });

  test('被引用加料明细删除同步必须使用真实 owner 专用 handler', async () => {
    const [binding] = buildGroupAutomationBindings([
      groupCase({
        id: 'TC-GRP-ADD-018',
        title: '被引用加料明细删除时弹出确认变更并同步影响关联商品',
        module: '商品管理 → 加料组',
        expectedResults: ['变更窗口正确。', '预览正确。', '组终态正确。', '所有 owner 同步。'],
      }),
    ], contract);

    expect(binding).toMatchObject({
      handlerId: 'addon-referenced-option-delete-sync',
      generationAllowed: true,
      blockClassification: null,
      factoryId: 'factory:group:addon',
      cleanupId: 'cleanup:group:addon',
    });
    expect(binding.requiredEvidence).toEqual(expect.arrayContaining([
      'navigation',
      'ui-assertion',
      'api-mutation',
      'api-read',
      'downstream',
      'cleanup',
    ]));
    expect(binding.assertionIds).toHaveLength(4);
  });



  test('报告不得要求技术阻断用例具备 Playwright 运行记录', async () => {
    const reportSource = fs.readFileSync(
      path.join(projectRoot, 'scripts/build-product-center-group-final-report.ts'),
      'utf8',
    );

    expect(reportSource).toContain('if (!observed && binding.generationAllowed)');
    expect(reportSource).toContain("'external-dependency-blocked'");
    expect(reportSource).toContain("'automation-gap'");
    expect(reportSource).toContain('claimCoverageComplete: false');
  });

  test('最终报告必须区分真实调度、技术阻断和产品偏差阻断', async () => {
    const reportSource = fs.readFileSync(
      path.join(projectRoot, 'scripts/build-product-center-group-final-report.ts'),
      'utf8',
    );

    expect(reportSource).toContain('scheduled: generatedCount');
    expect(reportSource).toContain('technicalContractBlocked,');
    expect(reportSource).toContain('automationGapBlocked,');
    expect(reportSource).toContain('externalDependencyBlocked,');
    expect(reportSource).toContain('observedProductDriftBlocked,');
    expect(reportSource).not.toContain('technicalContractBlocked: blockedCount');
  });

  test('最终报告必须独立校验运行附件的断言合同', async () => {
    const reportSource = fs.readFileSync(
      path.join(projectRoot, 'scripts/build-product-center-group-final-report.ts'),
      'utf8',
    );

    expect(reportSource).toContain('sameStringSet(runtimeEvidence.requiredAssertionIds, binding.assertionIds)');
    expect(reportSource).toContain('sameStringSet(runtimeEvidence.observedAssertionIds, binding.assertionIds)');
    expect(reportSource).toContain('runtimeEvidence.unexpectedAssertions.length === 0');
    expect(reportSource).toContain('runtimeEvidence.bindingFingerprint === binding.bindingFingerprint');
    expect(reportSource).toContain('运行证据绑定版本不匹配');
  });

  test('绑定内容变化必须改变指纹并使旧运行证据失效', async () => {
    const original = groupCase({
      id: 'TC-GRP-SPEC-001',
      title: '规格组列表页展示正确',
      expectedResults: ['原预期。'],
    });
    const changed = { ...original, expectedResults: ['已修改预期。'] };
    const [originalBinding] = buildGroupAutomationBindings([original], contract);
    const [changedBinding] = buildGroupAutomationBindings([changed], contract);

    expect(originalBinding.bindingFingerprint).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(changedBinding.bindingFingerprint).not.toBe(originalBinding.bindingFingerprint);
  });

  test('来源治理状态变化只改变执行资格，不得改变业务用例指纹', async () => {
    const testCase = groupCase({ id: 'TC-GRP-SPEC-001', title: '规格组列表页展示正确' });
    const feedback = readGroupValidationFeedbackContract(projectRoot);
    const verified = buildGroupAutomationBindings([testCase], contract, feedback, {
      generatedAt: '2026-09-04T00:00:00.000Z',
      decisions: new Map([[testCase.id, {
        caseId: testCase.id,
        module: 'brand-group',
        status: 'verified' as const,
        disposition: 'verified-source-evidence' as const,
        currentGoalBlocking: false,
      }]]),
    })[0];
    const blocked = buildGroupAutomationBindings([testCase], contract, feedback, {
      generatedAt: '2026-09-04T00:00:01.000Z',
      decisions: new Map([[testCase.id, {
        caseId: testCase.id,
        module: 'brand-group',
        status: 'blocked' as const,
        disposition: 'blocked-source-review' as const,
        currentGoalBlocking: true,
        blockCode: 'FORMAL_SOURCE_REQUIRED',
      }]]),
    })[0];

    expect(blocked.bindingFingerprint).toBe(verified.bindingFingerprint);
    expect(blocked.generationAllowed).toBe(false);
    expect(verified.generationAllowed).toBe(true);
  });

  test('最终报告必须拆分137条来源用例与2条审计补充用例', async () => {
    const reportSource = fs.readFileSync(
      path.join(projectRoot, 'scripts/build-product-center-group-final-report.ts'),
      'utf8',
    );

    expect(reportSource).toContain('sourcePlanned');
    expect(reportSource).toContain('auditAdded');
    expect(reportSource).toContain('sourcePlanned + auditAdded !== totalPlanned');
  });

  test('最终报告必须显式使用output内当前运行文件并拒绝teardown错误', async () => {
    const reportSource = fs.readFileSync(
      path.join(projectRoot, 'scripts/build-product-center-group-final-report.ts'),
      'utf8',
    );

    expect(reportSource).toContain('必须通过一个或多个 --json 显式指定');
    expect(reportSource).toContain('运行 JSON 必须位于项目 output 目录');
    expect(reportSource).toContain('resolveRunDefinitions().map(readRun)');
    expect(reportSource).toContain('Playwright 运行记录存在重复用例');
    expect(reportSource).toContain('run.teardownErrors > 0');
    expect(reportSource).toContain('observed.title !== binding.title');
  });

  test('生成用例和 watchdog 必须写入逐用例心跳并在停滞时返回124', async () => {
    const generatorSource = fs.readFileSync(
      path.join(projectRoot, 'scripts/build-product-center-group-automation.ts'),
      'utf8',
    );
    const watchdogSource = fs.readFileSync(
      path.join(projectRoot, 'scripts/run-product-center-group-with-watchdog.ts'),
      'utf8',
    );

    expect(generatorSource).toContain("phase: 'started'");
    expect(generatorSource).toContain("phase: 'completed'");
    expect(generatorSource).toContain("phase: 'failed'");
    expect(generatorSource).toContain('readProductCenterApplicationVersion(page)');
    expect(generatorSource).toContain('applicationVersionFingerprint: applicationVersion.fingerprint');
    expect(generatorSource).toContain('applicationVersionSignals: applicationVersion.signals');
    const versionSource = fs.readFileSync(
      path.join(projectRoot, 'utils/product-center-application-version.ts'),
      'utf8',
    );
    expect(versionSource).toContain('(main|runtime|app)');
    expect(versionSource).not.toContain('(main|index|runtime|app)');
    expect(versionSource).not.toContain('${url.pathname}${url.search}');
    expect(generatorSource).toContain('buildProductCenterGroupExecutionFingerprint(process.cwd()).fingerprint');
    expect(generatorSource).toContain('executionFingerprint,');
    expect(watchdogSource).toContain("status: 'stalled'");
    expect(watchdogSource).toContain('stalled ? 124');
    expect(watchdogSource).toContain('[watchdog] case=');
    expect(watchdogSource).toContain('[watchdog] alive');
    expect(watchdogSource).toContain("'--max-failures=0'");
  });

  test('最终报告必须生成候选规则账本、人工审核队列和正式规则产物', async () => {
    const reportSource = fs.readFileSync(
      path.join(projectRoot, 'scripts/build-product-center-group-final-report.ts'),
      'utf8',
    );
    expect(reportSource).toContain("'rule-candidate-ledger.json'");
    expect(reportSource).toContain("'formal-rule-review-queue.json'");
    expect(reportSource).toContain("'formal-rules.json'");
    expect(reportSource).toContain('runtimeMayGenerateCandidates: true');
    expect(reportSource).toContain('runtimeMayTriggerHumanReview: true');
    expect(reportSource).toContain('runtimeMayPromoteToFormal: false');
    expect(reportSource).toContain('humanApprovalRequiresCurrentCandidateFingerprint: true');
    expect(reportSource).toContain('运行证据自动化实现版本不匹配');
    expect(reportSource).toContain('同一汇总检测到多个发布身份，必须拆分执行批次');
    expect(reportSource).not.toContain('运行证据缺少有效应用版本指纹');
  });

  test('最终报告必须将阻断用例归并为共享能力任务并保留逐条追溯', async () => {
    const reportSource = fs.readFileSync(
      path.join(projectRoot, 'scripts/build-product-center-group-final-report.ts'),
      'utf8',
    );
    expect(reportSource).toContain('remainingHumanCapabilities');
    expect(reportSource).toContain('remainingBlockedCases');
    expect(reportSource).toContain('groupRemainingCapabilities(runtimeCases)');
    expect(reportSource).toContain('passed-semantic-source-surface-and-drift-qualification');
    expect(reportSource).toContain('P0 语义资格门禁报告与当前绑定不一致');
    expect(reportSource).toContain('product-decision:group-ui-contract');
    expect(reportSource).toContain('product-decision:group-form-validation');
    expect(reportSource).toContain('product-decision:group-delete-lifecycle');
    expect(reportSource).toContain('product-decision:group-reference-propagation');
    expect(reportSource).toContain('fixture:industry-item-inheritance');
    expect(reportSource).toContain('fixture:terminal-observation');
    expect(reportSource).toContain('产品偏差未登记共享决策类型');
    expect(reportSource).toContain('自动化缺口 ${final.automationGapBlocked} 条不转交人工');
  });

  test('仅具备字段级证据的取消和必填用例允许解锁', async () => {
    const bindings = buildGroupAutomationBindings([
      groupCase({ id: 'TC-GRP-SPEC-022', title: '新增规格组页点击取消不保存' }),
      groupCase({ id: 'TC-GRP-MTH-004', title: '新增做法组必填项缺失保存失败' }),
      groupCase({ id: 'TC-GRP-PKG-022', title: '新增组合搭配套餐组必填项缺失保存失败', module: '商品管理 → 套餐组' }),
      groupCase({ id: 'TC-GRP-SPEC-005', title: '新增规格组必填项缺失保存失败' }),
    ], contract);

    expect(bindings[0]).toMatchObject({
      executionProfile: 'cancel',
      handlerId: 'group-create-cancel',
      generationAllowed: true,
    });
    expect(bindings[0].requiredEvidence).toEqual(expect.arrayContaining(['no-write', 'api-read']));
    expect(bindings[1]).toMatchObject({
      executionProfile: 'form-validation',
      handlerId: 'group-required-validation',
      generationAllowed: true,
    });
    expect(bindings[1].requiredEvidence).toContain('no-persist');
    expect(bindings[1].requiredEvidence).not.toContain('no-write');
    expect(bindings[2]).toMatchObject({
      executionProfile: 'form-validation',
      handlerId: 'group-required-validation',
      generationAllowed: true,
    });
    expect(bindings[3].handlerId).toBe('group-required-validation');
    expect(bindings[3].handlerId).toBe('group-required-validation');
  });

  test('做法组正向创建必须要求写入读取和清理证据', async () => {
    const [binding] = buildGroupAutomationBindings([
      groupCase({ id: 'TC-GRP-MTH-003', title: '新增做法组仅填必填项保存成功', module: '商品管理 → 做法组' }),
    ], contract);

    expect(binding).toMatchObject({
      handlerId: 'method-create-required-only',
      generationAllowed: true,
    });
    expect(binding.requiredEvidence).toEqual(expect.arrayContaining(['api-mutation', 'api-read', 'cleanup']));
  });

  test('人工确认的规格口味做法空明细均进入执行', async () => {
    const bindings = buildGroupAutomationBindings([
      groupCase({ id: 'TC-GRP-SPEC-006', title: '新增规格组无规格明细保存失败' }),
      groupCase({ id: 'TC-GRP-TASTE-005', title: '新增口味组无口味明细时保存失败', module: '商品管理 → 口味组' }),
      groupCase({ id: 'TC-GRP-MTH-005', title: sourceTitle('TC-GRP-MTH-005'), module: '商品管理 → 做法组' }),
    ], contract);

    expect(bindings[0]).toMatchObject({ handlerId: 'group-empty-options-validation', generationAllowed: true, blockClassification: null });
    expect(bindings[1]).toMatchObject({ handlerId: 'group-empty-options-validation', generationAllowed: true, blockClassification: null });
    expect(bindings[2]).toMatchObject({ handlerId: 'group-required-validation', generationAllowed: true, blockClassification: null });
  });

  test('规格、口味和做法组明细取消必须复用同一真实编辑页闭环', async () => {
    const bindings = buildGroupAutomationBindings([
      groupCase({ id: 'TC-GRP-SPEC-023', title: '编辑规格组添加明细后点击取消不保存' }),
      groupCase({ id: 'TC-GRP-TASTE-019', title: '编辑口味组添加明细后点击取消不保存', module: '商品管理 → 口味组' }),
      groupCase({ id: 'TC-GRP-MTH-018', title: '编辑做法组添加明细后点击取消不保存', module: '商品管理 → 做法组' }),
    ], contract);

    for (const binding of bindings) {
      expect(binding).toMatchObject({
        handlerId: 'existing-detail-cancel',
        generationAllowed: true,
        blockClassification: null,
      });
      expect(binding.requiredEvidence).toEqual(expect.arrayContaining(['no-write', 'api-read', 'api-mutation', 'cleanup']));
    }
  });

  test('做法组新增行取消必须映射到已有组明细取消 handler', async () => {
    const [binding] = buildGroupAutomationBindings([
      groupCase({
        id: 'TC-GRP-MTH-018',
        title: '编辑做法组添加明细后点击取消不保存',
        module: '商品管理 → 做法组',
        expectedResults: ['做法组编辑面板关闭且未发送写请求。', '做法组 A 仍仅含 A1。'],
      }),
    ], contract);

    expect(binding).toMatchObject({
      handlerId: 'existing-detail-cancel',
      generationAllowed: true,
      blockClassification: null,
      requiredEvidence: expect.arrayContaining(['no-write', 'api-read', 'api-mutation', 'cleanup']),
    });
  });

  test('正向保存用例不得被标题关键词误分为 no-write 校验', async () => {
    const bindings = buildGroupAutomationBindings([
      groupCase({ id: 'TC-GRP-SPEC-004', title: '新增规格组仅填必填项保存成功' }),
      groupCase({ id: 'TC-GRP-PKG-004', title: '新增固定搭配仅填必填项保存成功', module: '商品管理 → 套餐组' }),
    ], contract);

    for (const binding of bindings) {
      expect(binding.executionProfile).toBe('mutation-probe');
      expect(binding.requiredEvidence).toEqual(expect.arrayContaining(['api-mutation', 'api-read', 'cleanup']));
      expect(binding.requiredEvidence).not.toContain('no-write');
    }
    expect(bindings[0].handlerId).toBe('option-group-create-required-only');
  });

  test('字段边界用例必须绑定专用创建 handler', async () => {
    const bindings = buildGroupAutomationBindings([
      groupCase({ id: 'TC-GRP-SPEC-010', title: '规格名称超长保存后截断为100字符' }),
      groupCase({ id: 'TC-GRP-TASTE-020', title: '口味明细名称超长保存后截断为100字符', module: '商品管理 → 口味组' }),
    ] , contract);
    for (const binding of bindings) {
      expect(binding.handlerId).toBe('option-group-boundary-create');
      expect(binding.generationAllowed).toBe(true);
      expect(binding.requiredEvidence).toEqual(expect.arrayContaining(['api-mutation', 'api-read', 'cleanup']));
    }
  });

  test('规格值和设备编码20字符边界必须走保存读取清理专用handler', async () => {
    const bindings = buildGroupAutomationBindings([
      groupCase({ id: 'TC-GRP-SPEC-011', title: '规格设备编码超过20字符按规则处理' }),
      groupCase({ id: 'TC-GRP-SPEC-027', title: '规格值超过20字符按规则处理' }),
    ], contract);

    for (const binding of bindings) {
      expect(binding).toMatchObject({
        executionProfile: 'mutation-probe',
        handlerId: 'spec-option-twenty-character-boundary',
        generationAllowed: true,
      });
      expect(binding.requiredEvidence).toEqual(expect.arrayContaining(['api-mutation', 'api-read', 'cleanup']));
      expect(binding.requiredEvidence).not.toContain('no-persist');
    }
  });

  test('单组名重复用例必须绑定造数拒绝清理专用 handler', async () => {
    const bindings = buildGroupAutomationBindings([
      groupCase({ id: 'TC-GRP-SPEC-008', title: '规格组名称品牌内重复保存失败' }),
      groupCase({ id: 'TC-GRP-SPEC-012', title: '规格组名称仅大小写不同视为重复' }),
      groupCase({ id: 'TC-GRP-TASTE-006', title: '口味组名称品牌内重复保存失败', module: '商品管理 → 口味组' }),
      groupCase({ id: 'TC-GRP-TASTE-022', title: '口味组名称仅大小写不同视为重复', module: '商品管理 → 口味组' }),
      groupCase({ id: 'TC-GRP-MTH-021', title: '做法组名称仅大小写不同视为重复', module: '商品管理 → 做法组' }),
    ], contract);

    for (const binding of bindings) {
      expect(binding).toMatchObject({
        handlerId: 'group-name-duplicate-validation',
        generationAllowed: true,
      });
      expect(binding.requiredEvidence).toEqual(expect.arrayContaining([
        'api-mutation',
        'api-read',
        'no-persist',
        'cleanup',
      ]));
    }
  });

  test('已有组明细必填与重名用例必须绑定造数对账清理专用 handler', async () => {
    const bindings = buildGroupAutomationBindings([
      groupCase({
        id: 'TC-GRP-SPEC-007',
        title: '已有规格组新增明细缺必填项保存失败',
        expectedResults: ['新增规格明细表单可见。', '规格名称字段显示必填错误，未发送新增明细写请求。', '规格组仍仅含原明细。'],
      }),
      groupCase({ id: 'TC-GRP-SPEC-009', title: '规格明细组内重名保存失败' }),
      groupCase({ id: 'TC-GRP-TASTE-007', title: '口味明细组内重名保存失败', module: '商品管理 → 口味组' }),
      groupCase({ id: 'TC-GRP-TASTE-015', title: '已有口味组新增明细缺必填项保存失败', module: '商品管理 → 口味组' }),
      groupCase({ id: 'TC-GRP-MTH-014', title: '已有做法组新增明细缺必填项保存失败', module: '商品管理 → 做法组' }),
    ], contract);

    expect(bindings.map((binding) => binding.handlerId)).toEqual([
      'existing-detail-required-validation',
      'existing-detail-duplicate-validation',
      'existing-detail-duplicate-validation',
      'existing-detail-required-validation',
      'existing-detail-required-validation',
    ]);
    for (const binding of bindings) {
      expect(binding.generationAllowed).toBe(true);
      expect(binding.requiredEvidence).toEqual(expect.arrayContaining([
        'api-mutation',
        'api-read',
        'no-persist',
        'cleanup',
      ]));
    }
    expect(bindings[0].requiredEvidence).toContain('no-write');
  });

  test('包含组名和明细名两项预期的复合重复用例必须绑定复合专用 handler', async () => {
    const [binding] = buildGroupAutomationBindings([
      groupCase({
        id: 'TC-GRP-MTH-006',
        title: '做法组及明细名称唯一性校验',
        module: '商品管理 → 做法组',
        expectedResults: ['重复组名提交失败。', '同组重复明细名提交失败。'],
      }),
    ], contract);

    expect(binding.handlerId).toBe('method-group-and-detail-duplicate-validation');
    expect(binding.generationAllowed).toBe(true);
    expect(binding.blockClassification).toBeNull();
    expect(binding.requiredEvidence).toEqual(expect.arrayContaining([
      'api-mutation',
      'api-read',
      'no-persist',
      'cleanup',
    ]));
  });

  test('本地商品引用能力不得误判外部依赖，终端和继承仍需外部能力', async () => {
    const bindings = buildGroupAutomationBindings([
      groupCase({ id: 'TC-GRP-SPEC-013', title: '已被商品引用的组新增子项不自动同步到商品' }),
      groupCase({ id: 'TC-GRP-ADD-029', title: '默认选中的加料子项在终端自动带入默认数量', module: '商品管理 → 加料组' }),
      groupCase({ id: 'TC-GRP-SPEC-024', title: '规格信息可从行业商品继承成功' }),
    ], contract);

    expect(bindings.map((item) => item.blockClassification)).toEqual([
      null,
      'external-dependency-blocked',
      'external-dependency-blocked',
    ]);
    expect(bindings[0].handlerId).toBe('added-option-not-propagated');
    expect(bindings[0].capabilityIds).toEqual(expect.arrayContaining([
      'brand-product.single-sku.api',
      'brand-product.group-reference-owner.ui',
      'brand-product.cleanup.api-ui',
    ]));
    expect(bindings[1].blockedReasons[0]).toContain('终端/C端');
    expect(bindings[2].blockedReasons[0]).toContain('行业商品');
  });

  test('新版套餐字段已恢复时应绑定精确规则执行器', async () => {
    const bindings = buildGroupAutomationBindings([
      groupCase({ id: 'TC-GRP-ADD-005', title: sourceTitle('TC-GRP-ADD-005'), module: '商品管理 → 加料组' }),
      groupCase({ id: 'TC-GRP-ADD-019', title: '新增加料组必填项缺失保存失败', module: '商品管理 → 加料组' }),
      groupCase({ id: 'TC-GRP-PKG-030', title: sourceTitle('TC-GRP-PKG-030'), module: '商品管理 → 套餐组' }),
      groupCase({ id: 'TC-GRP-PKG-029', title: sourceTitle('TC-GRP-PKG-029'), module: '商品管理 → 套餐组' }),
      groupCase({ id: 'TC-GRP-PKG-022', title: sourceTitle('TC-GRP-PKG-022'), module: '商品管理 → 套餐组' }),
    ], contract);
    expect(bindings.find((item) => item.caseId === 'TC-GRP-PKG-030')).toMatchObject({
      generationAllowed: true,
      blockClassification: null,
      handlerId: 'combo-v2-pkg030-validation',
    });
    expect(bindings.find((item) => item.caseId === 'TC-GRP-ADD-005')).toMatchObject({ generationAllowed: true, blockClassification: null, handlerId: 'addon-single-surcharge-format' });
    expect(bindings.find((item) => item.caseId === 'TC-GRP-PKG-029')).toMatchObject({
      generationAllowed: true,
      blockClassification: null,
      handlerId: 'combo-v2-create-contract',
    });
    expect(bindings.find((item) => item.caseId === 'TC-GRP-PKG-022')).toMatchObject({ generationAllowed: true });
  });

  test('新版套餐组不得复用不对应步骤和预期的通用创建 handler', async () => {
    const bindings = buildGroupAutomationBindings([
      groupCase({ id: 'TC-GRP-PKG-004', title: sourceTitle('TC-GRP-PKG-004'), module: '商品管理 → 套餐组' }),
      groupCase({ id: 'TC-GRP-PKG-007', title: sourceTitle('TC-GRP-PKG-007'), module: '商品管理 → 套餐组' }),
      groupCase({ id: 'TC-GRP-PKG-026', title: sourceTitle('TC-GRP-PKG-026'), module: '商品管理 → 套餐组' }),
      groupCase({ id: 'TC-GRP-PKG-036', title: sourceTitle('TC-GRP-PKG-036'), module: '商品管理 → 套餐组' }),
      groupCase({ id: 'TC-GRP-PKG-046', title: sourceTitle('TC-GRP-PKG-046'), module: '商品管理 → 套餐组' }),
    ], contract);
    expect(bindings.find((item) => item.caseId === 'TC-GRP-PKG-004')).toMatchObject({ generationAllowed: true, handlerId: 'combo-group-create' });
    expect(bindings.find((item) => item.caseId === 'TC-GRP-PKG-007')).toMatchObject({ generationAllowed: true, handlerId: 'combo-cross-type-name-create' });
    expect(bindings.find((item) => item.caseId === 'TC-GRP-PKG-026')).toMatchObject({ generationAllowed: true, handlerId: 'combo-product-selection' });
    expect(bindings.find((item) => item.caseId === 'TC-GRP-PKG-036')).toMatchObject({
      generationAllowed: true,
      blockClassification: null,
      handlerId: 'combo-v2-form-contract',
    });
    expect(bindings.find((item) => item.caseId === 'TC-GRP-PKG-046')).toMatchObject({
      generationAllowed: true,
      blockClassification: null,
      handlerId: 'combo-v2-create-contract',
    });
  });

  test('历史套餐默认选择数量字段在当前版本必须标记不适用', async () => {
    const [binding] = buildGroupAutomationBindings([groupCase({ id: 'TC-GRP-PKG-025', title: sourceTitle('TC-GRP-PKG-025'), module: '商品管理 → 套餐组' })], contract);
    expect(binding).toMatchObject({
      generationAllowed: false,
      blockClassification: 'not-applicable',
      handlerId: null,
    });
    expect(binding.blockEvidencePaths).toContain(
      'Merchant Center Info/00-待转换测试方案/来源资料/商品中心-商品管理-组/人工确认证据/20260819/21-PKG-009-新增套餐商品.png',
    );
  });

  test('多规格套餐组必须绑定 SKU 级创建和清理 handler', async () => {
    const [binding] = buildGroupAutomationBindings([
      groupCase({
        id: 'TC-GRP-PKG-019',
        title: '组合搭配支持添加多规格商品保存成功',
        module: '商品管理 → 套餐组',
      }),
    ], contract);
    expect(binding).toMatchObject({ generationAllowed: true, handlerId: 'combo-multi-sku-create' });
    expect(binding.capabilityIds).toEqual(expect.arrayContaining([
      'brand-product.multi-sku.ui',
      'brand-product.combo-candidate.api',
      'brand-product.cleanup.api-ui',
    ]));
    const pageSource = fs.readFileSync(path.join(projectRoot, 'pages/product-management/group-list.page.ts'), 'utf8');
    expect(pageSource).toContain('未出现在商品表');
    expect(pageSource).toContain('未自动选中商品表');
    expect(pageSource).toContain('未找到唯一规格表格');
    expect(pageSource).not.toContain("getByRole('row').filter({ hasText: identity })");
  });

  test('认证 setup 必须自动重试并写入运行心跳', async () => {
    const configSource = fs.readFileSync(path.join(projectRoot, 'playwright.config.ts'), 'utf8');
    const setupSource = fs.readFileSync(path.join(projectRoot, 'tests/setup/auth.setup.ts'), 'utf8');
    const fixtureSource = fs.readFileSync(path.join(projectRoot, 'fixtures/product-center.fixture.ts'), 'utf8');
    const authSource = fs.readFileSync(path.join(projectRoot, 'flows/auth.flow.ts'), 'utf8');

    expect(configSource).toMatch(/name: 'setup',[\s\S]*?retries: process\.env\.PC_BATCH_AUTH_ONCE === '1' \? 0 : 2/);
    expect(authSource).toContain('executeReadOnlyUiWithTransientRetry');
    expect(authSource).toContain('navigateWithTransientRetry');
    expect(authSource).toContain('ERR_CONNECTION_');
    expect(setupSource).toContain("caseId: '__setup__', phase: 'started'");
    expect(setupSource).toContain("caseId: '__setup__', phase: 'auth-retrying'");
    expect(setupSource).toContain("caseId: '__setup__', phase: 'completed'");
    expect(setupSource).toContain("caseId: '__setup__', phase: 'failed'");
    expect(fixtureSource).toContain("phase: 'auth-retrying'");
  });

  test('空组删除、跨组规格重名和规格全字段创建必须绑定专用闭环 handler', async () => {
    const bindings = buildGroupAutomationBindings([
      groupCase({ id: 'TC-GRP-SPEC-019', title: '无子项的规格组可删除成功' }),
      groupCase({ id: 'TC-GRP-ADD-023', title: '无加料明细的加料组可删除成功', module: '商品管理 → 加料组' }),
      groupCase({ id: 'TC-GRP-SPEC-025', title: '规格子项名称品牌内重复保存失败' }),
      groupCase({ id: 'TC-GRP-SPEC-028', title: '新增规格组填写全部字段保存成功' }),
    ], contract);

    expect(bindings.map((binding) => binding.handlerId)).toEqual([
      'empty-group-delete',
      'empty-group-delete',
      'spec-cross-group-option-duplicate-validation',
      'spec-full-field-create',
    ]);
    for (const binding of bindings.slice(0, 3)) {
      expect(binding.generationAllowed).toBe(true);
      expect(binding.requiredEvidence).toEqual(expect.arrayContaining(['api-mutation', 'api-read', 'cleanup']));
    }
    expect(bindings[2].requiredEvidence).toContain('no-persist');
    expect(bindings[3]).toMatchObject({
      handlerId: 'spec-full-field-create',
      generationAllowed: true,
      blockClassification: null,
    });
  });

  test('口味和做法唯一子项删除边界必须绑定保留原明细专用 handler', async () => {
    const bindings = buildGroupAutomationBindings([
      groupCase({ id: 'TC-GRP-TASTE-021', title: '口味组仅剩一个子项时删除该子项失败', module: '商品管理 → 口味组' }),
      groupCase({ id: 'TC-GRP-MTH-020', title: '做法组仅剩一个子项时删除该子项失败', module: '商品管理 → 做法组' }),
    ], contract);

    for (const binding of bindings) {
      expect(binding).toMatchObject({ handlerId: 'single-detail-delete-boundary', generationAllowed: true });
      expect(binding.requiredEvidence).toEqual(expect.arrayContaining(['api-mutation', 'api-read', 'cleanup']));
    }
  });

  test('规格组引用商品同步必须复用本地双 owner 造数闭环', async () => {
    const [binding] = buildGroupAutomationBindings([
      groupCase({
        id: 'TC-GRP-SPEC-020',
        title: '编辑规格组信息后引用商品同步更新',
        module: '商品管理 → 规格组',
      }),
    ], contract);
    expect(binding).toMatchObject({
      handlerId: 'referenced-attribute-group-sync',
      generationAllowed: true,
      blockClassification: null,
      factoryId: 'factory:group:spec',
      cleanupId: 'cleanup:group:spec',
    });
    expect(binding.requiredEvidence).toEqual(expect.arrayContaining([
      'api-mutation', 'api-read', 'downstream', 'cleanup',
    ]));
  });

  test('口味做法加料解除引用后删除必须走真实 owner 与零残留闭环', async () => {
    const bindings = buildGroupAutomationBindings([
      groupCase({ id: 'TC-GRP-TASTE-016', title: '解除引用后口味组可删除成功', module: '商品管理 → 口味组' }),
      groupCase({ id: 'TC-GRP-MTH-015', title: '解除引用后做法组可删除成功', module: '商品管理 → 做法组' }),
      groupCase({ id: 'TC-GRP-ADD-015', title: '解除引用后加料组可删除成功', module: '商品管理 → 加料组' }),
    ], contract);
    for (const binding of bindings) {
      expect(binding).toMatchObject({
        handlerId: 'detached-reference-group-delete',
        generationAllowed: true,
        blockClassification: null,
      });
      expect(binding.requiredEvidence).toEqual(expect.arrayContaining([
        'api-mutation', 'api-read', 'downstream', 'cleanup',
      ]));
    }
  });

  test('规格解除引用删除修复后必须进入正常自动化通道', async () => {
    const [binding] = buildGroupAutomationBindings([
      groupCase({ id: 'TC-GRP-SPEC-018', title: '解除引用后规格组可删除成功', module: '商品管理 → 规格组' }),
    ], contract);
    expect(binding).toMatchObject({
      handlerId: 'detached-reference-group-delete',
      generationAllowed: true,
      blockClassification: null,
      blockEvidencePaths: [],
    });
  });

  test('人工确认的删除规则必须绑定现有专用执行 handler', async () => {
    const bindings = buildGroupAutomationBindings([
      groupCase({ id: 'TC-GRP-SPEC-015', title: '未被引用的规格明细删除成功', module: '商品管理 → 规格组' }),
      groupCase({ id: 'TC-GRP-TASTE-009', title: '未被引用的口味明细删除成功', module: '商品管理 → 口味组' }),
      groupCase({ id: 'TC-GRP-MTH-009', title: '未被引用做法明细删除成功', module: '商品管理 → 做法组' }),
      groupCase({ id: 'TC-GRP-ADD-014', title: sourceTitle('TC-GRP-ADD-014'), module: '商品管理 → 加料组' }),
    ], contract);
    expect(bindings.map((binding) => binding.handlerId)).toEqual([
      'unreferenced-option-detail-delete',
      'unreferenced-option-detail-delete',
      'unreferenced-option-detail-delete',
      'addon-product-row-delete',
    ]);
    expect(bindings.every((binding) => binding.generationAllowed && binding.blockClassification === null)).toBe(true);
  });

  test('规格口味做法明细传播规则必须复用真实 owner 与完整更新 payload', async () => {
    const bindings = buildGroupAutomationBindings([
      groupCase({ id: 'TC-GRP-SPEC-013', title: '已被商品引用的组新增子项不自动同步到商品', module: '商品管理 → 规格组' }),
      groupCase({ id: 'TC-GRP-TASTE-008', title: '已被引用口味组新增明细不自动同步到商品', module: '商品管理 → 口味组' }),
      groupCase({ id: 'TC-GRP-MTH-007', title: '被引用做法组新增明细不自动同步到商品', module: '商品管理 → 做法组' }),
      groupCase({ id: 'TC-GRP-SPEC-021', title: sourceTitle('TC-GRP-SPEC-021'), module: '商品管理 → 规格组' }),
      groupCase({ id: 'TC-GRP-TASTE-013', title: '编辑被引用口味明细名称后商品同步', module: '商品管理 → 口味组' }),
      groupCase({ id: 'TC-GRP-MTH-012', title: '编辑被引用做法明细后商品侧名称同步', module: '商品管理 → 做法组' }),
    ], contract);
    expect(bindings.slice(0, 3).every((binding) => binding.handlerId === 'added-option-not-propagated')).toBe(true);
    expect(bindings.slice(3).every((binding) => binding.handlerId === 'renamed-option-propagated')).toBe(true);
    for (const binding of bindings) {
      expect(binding).toMatchObject({ generationAllowed: true, blockClassification: null });
      expect(binding.requiredEvidence).toEqual(expect.arrayContaining([
        'api-mutation', 'api-read', 'downstream', 'cleanup',
      ]));
    }

    const flowSource = fs.readFileSync(
      path.join(projectRoot, 'flows/product-center/item-216/standard-item-216.flow.ts'),
      'utf8',
    );
    const methodStart = flowSource.indexOf('async verifyRenamedAttributeOptionSynchronization(');
    const methodEnd = flowSource.indexOf("@step('验证编辑页移除已引用属性组选项", methodStart);
    const methodSource = flowSource.slice(methodStart, methodEnd);
    const uiObservation = methodSource.indexOf('UI 观测未在窗口内收敛为新规格名称');
    const apiObservation = methodSource.indexOf('API 观测未在窗口内收敛；UI 已观测到新明细名称');
    expect(methodStart).toBeGreaterThanOrEqual(0);
    expect(methodEnd).toBeGreaterThan(methodStart);
    expect(uiObservation).toBeGreaterThanOrEqual(0);
    expect(apiObservation).toBeGreaterThan(uiObservation);
    expect(methodSource).toContain('不能据此判定产品未同步');
    expect(methodSource).toContain("channel: 'ui'");
    expect(methodSource).toContain("channel: 'api'");
  });

  test('套餐空商品负向用例必须覆盖三种类型并绑定零落库 handler', async () => {
    const bindings = buildGroupAutomationBindings([
      groupCase({ id: 'TC-GRP-PKG-003', title: sourceTitle('TC-GRP-PKG-003'), module: '商品管理 → 套餐组' }),
      groupCase({ id: 'TC-GRP-PKG-027', title: sourceTitle('TC-GRP-PKG-027'), module: '商品管理 → 套餐组' }),
      groupCase({ id: 'TC-GRP-PKG-040', title: sourceTitle('TC-GRP-PKG-040'), module: '商品管理 → 套餐组' }),
    ], contract);
    for (const binding of bindings) {
      expect(binding).toMatchObject({ handlerId: 'combo-empty-items-validation' });
      expect(binding.requiredEvidence).toEqual(expect.arrayContaining(['api-read', 'no-persist']));
    }
    expect(bindings.filter((binding) => binding.caseId !== 'TC-GRP-PKG-040'))
      .toEqual(expect.arrayContaining([
        expect.objectContaining({ caseId: 'TC-GRP-PKG-003', generationAllowed: true, blockClassification: null }),
        expect.objectContaining({ caseId: 'TC-GRP-PKG-027', generationAllowed: true, blockClassification: null }),
      ]));
    expect(bindings.find((binding) => binding.caseId === 'TC-GRP-PKG-040')).toMatchObject({
      generationAllowed: false,
      blockClassification: 'observed-product-drift',
    });
  });

  test('加料空商品按已确认按钮阻断规则绑定零写入 handler', async () => {
    const [binding] = buildGroupAutomationBindings([
      groupCase({
        id: 'TC-GRP-ADD-003',
        title: '新增加料组无加料明细时保存失败',
        module: '商品管理 → 加料组',
        expectedResults: [
          '确定按钮保持置灰且无法提交，不要求显示指定错误提示文案；不发送创建请求。',
          'UI 与 API 均查询不到该加料组。',
        ],
      }),
    ], contract);

    expect(binding).toMatchObject({
      handlerId: 'group-empty-options-validation',
      generationAllowed: true,
      blockClassification: null,
    });
    expect(binding.requiredEvidence).toEqual(expect.arrayContaining(['ui-assertion', 'no-persist', 'api-read']));
  });


  test('未引用加料组内商品删除必须进入执行通道', async () => {
    const [binding] = buildGroupAutomationBindings([
      groupCase({ id: 'TC-GRP-ADD-013', title: sourceTitle('TC-GRP-ADD-013'), module: '商品管理 → 加料组' }),
    ], contract);

    expect(binding).toMatchObject({
      handlerId: 'addon-product-row-delete',
      generationAllowed: true,
      blockClassification: null,
    });
    expect(binding.blockedReasons).toEqual([]);
    expect(binding.blockEvidencePaths).toEqual([]);
  });

  test('人工确认的规格口味做法引用删除均进入执行', async () => {
    const bindings = buildGroupAutomationBindings([
      groupCase({ id: 'TC-GRP-SPEC-016', title: sourceTitle('TC-GRP-SPEC-016'), module: '商品管理 → 规格组' }),
      groupCase({ id: 'TC-GRP-TASTE-010', title: sourceTitle('TC-GRP-TASTE-010'), module: '商品管理 → 口味组' }),
      groupCase({ id: 'TC-GRP-MTH-008', title: sourceTitle('TC-GRP-MTH-008'), module: '商品管理 → 做法组' }),
    ], contract);

    expect(bindings[0]).toMatchObject({
      handlerId: 'referenced-option-detail-delete-blocked', generationAllowed: true, blockClassification: null,
    });
    expect(bindings[1]).toMatchObject({
      handlerId: 'referenced-option-detail-delete-confirmed', generationAllowed: true, blockClassification: null,
    });
    expect(bindings[2]).toMatchObject({
      handlerId: 'referenced-option-detail-delete-confirmed', generationAllowed: true, blockClassification: null,
    });
  });

  test('当前版本不存在的历史字段用例必须标记不适用且禁止注册', async () => {
    const bindings = buildGroupAutomationBindings([
      groupCase({ id: 'TC-GRP-ADD-010', title: sourceTitle('TC-GRP-ADD-010'), module: '商品管理 → 加料组' }),
      groupCase({ id: 'TC-GRP-ADD-011', title: sourceTitle('TC-GRP-ADD-011'), module: '商品管理 → 加料组' }),
      groupCase({ id: 'TC-GRP-PKG-015', title: sourceTitle('TC-GRP-PKG-015'), module: '商品管理 → 套餐组' }),
      groupCase({ id: 'TC-GRP-PKG-025', title: sourceTitle('TC-GRP-PKG-025'), module: '商品管理 → 套餐组' }),
      groupCase({ id: 'TC-GRP-PKG-032', title: sourceTitle('TC-GRP-PKG-032'), module: '商品管理 → 套餐组' }),
    ], contract);

    for (const binding of bindings) {
      expect(binding).toMatchObject({
        handlerId: null,
        generationAllowed: false,
        blockClassification: 'not-applicable',
        sourceGovernance: { status: 'not-applicable' },
      });
      expect(binding.blockedReasons[0]).toContain('当前字段证据确认场景不适用');
    }
  });

  test('未知 caseId 使用已确认不存在的字段时也必须被字段清单拦截', async () => {
    const [binding] = buildGroupAutomationBindings([
      groupCase({
        id: 'TC-GRP-FUTURE-001',
        title: '随心配子项默认数量填写 3 后保存成功',
        module: '商品管理 → 套餐组',
        steps: ['在随心配商品行填写子项默认数量 3 并保存。'],
        expectedResults: ['子项默认数量保存为 3。'],
      }),
    ], contract);

    expect(binding).toMatchObject({
      handlerId: null,
      generationAllowed: false,
      blockClassification: 'not-applicable',
    });
    expect(binding.blockedReasons[0]).toContain('不存在默认数量字段');
  });

  test('未被引用做法组删除应绑定二次确认删除闭环', async () => {
    const [binding] = buildGroupAutomationBindings([
      groupCase({ id: 'TC-GRP-MTH-010', title: sourceTitle('TC-GRP-MTH-010'), module: '商品管理 → 做法组' }),
    ], contract);

    expect(binding).toMatchObject({
      handlerId: 'unreferenced-group-delete-confirmed',
      generationAllowed: true,
      blockClassification: null,
    });
    expect(binding.requiredEvidence).toEqual(expect.arrayContaining(['api-mutation', 'api-read', 'cleanup']));
    expect(binding.requiredEvidence).not.toContain('downstream');
  });

  test('新建唯一规格组的未引用新增明细不得被引用关键词误阻断', async () => {
    const [binding] = buildGroupAutomationBindings([
      groupCase({ id: 'TC-GRP-SPEC-014', title: '未被引用的组新增子项保存成功', module: '商品管理 → 规格组' }),
    ], contract);
    expect(binding).toMatchObject({
      handlerId: 'unreferenced-spec-detail-add',
      generationAllowed: true,
      blockClassification: null,
    });
    expect(binding.requiredEvidence).toEqual(expect.arrayContaining(['api-mutation', 'api-read', 'cleanup']));
    expect(binding.requiredEvidence).not.toContain('downstream');
  });

  test('未被商品引用的组删除不得误要求下游同步证据', async () => {
    const [binding] = buildGroupAutomationBindings([
      groupCase({
        id: 'TC-GRP-MTH-010',
        title: '未被商品引用的做法组经二次确认后删除成功',
        module: '商品管理 → 做法组',
        expectedResults: ['二次确认弹窗显示当前引用商品数为 0。', '确认后删除请求成功。', 'UI 与 API 均查询不到原做法组。'],
      }),
    ], contract);
    expect(binding.requiredEvidence).not.toContain('downstream');
  });

  test('组编辑能力必须先等待离开列表并进入 create 编辑路由', async () => {
    const pageSource = fs.readFileSync(
      path.join(projectRoot, 'pages/product-management/group-list.page.ts'),
      'utf8',
    );
    expect(pageSource).toContain("pathname !== this.menuItem.path && pathname.endsWith('/create')");
    expect(pageSource).toContain('未进入编辑路由');
  });

  test('加料组内商品终态必须重开详情页断言且套餐引用核验必须恢复页面语言合同', async () => {
    const runnerSource = fs.readFileSync(
      path.join(projectRoot, 'utils/product-center-group-runner.ts'),
      'utf8',
    );
    expect(runnerSource).toContain('const capturedEditUrl = page.url();');
    expect(runnerSource).toContain('await groupPage.openCapturedEditSurface(capturedEditUrl);');
    expect(runnerSource).not.toContain('await groupPage.expectIdentityRowContainsAndExcludes(');
    const ownerReader = runnerSource.slice(
      runnerSource.indexOf('async function readComboV2OwnerCard('),
      runnerSource.indexOf('async function comboV2RemoveProductRow('),
    );
    expect(ownerReader.indexOf('await ensureEnglishValidationLocale(page);'))
      .toBeLessThan(ownerReader.indexOf('const list = createItemListPage(page);'));
  });

  test('加料组列表身份 locator 必须兼容前端下划线转义并复用唯一行门禁', async () => {
    const pageSource = fs.readFileSync(
      path.join(projectRoot, 'pages/product-management/group-list.page.ts'),
      'utf8',
    );
    expect(pageSource).toContain("identity.replace(/_/g, '\\\\_')");
    expect(pageSource).toContain('has: this.identityText(identity)');
    expect(pageSource).toContain('await this.expectUniqueVisible(row');
  });

  test('口味做法加料引用商品同步必须复用真实双 owner 流程并执行零残留', async () => {
    const bindings = buildGroupAutomationBindings([
      groupCase({
        id: 'TC-GRP-TASTE-012',
        title: '编辑口味组后引用商品同步更新',
        module: '商品管理 → 口味组',
        preconditions: ['口味组 T 被商品 P、Q 引用。'],
        steps: ['修改口味组名称并保存，查看商品 P、Q。'],
        expectedResults: ['商品 P、Q 中口味组基础信息与编辑后一致。'],
      }),
      groupCase({
        id: 'TC-GRP-MTH-011',
        title: '编辑做法组后引用商品同步更新',
        module: '商品管理 → 做法组',
      }),
      groupCase({
        id: 'TC-GRP-ADD-016',
        title: '编辑加料组后引用商品同步更新',
        module: '商品管理 → 加料组',
      }),
    ], contract);
    for (const binding of bindings.filter((item) => item.caseId !== 'TC-GRP-ADD-016')) {
      expect(binding).toMatchObject({
        handlerId: 'referenced-attribute-group-sync',
        generationAllowed: true,
        blockClassification: null,
      });
      expect(binding.requiredEvidence).toEqual(expect.arrayContaining([
        'api-mutation',
        'api-read',
        'downstream',
        'cleanup',
      ]));
    }
    expect(bindings.find((item) => item.caseId === 'TC-GRP-ADD-016')).toMatchObject({
      handlerId: 'addon-nonprice-field-sync',
      generationAllowed: true,
      blockClassification: null,
      blockEvidencePaths: [],
    });
    expect(bindings.find((item) => item.caseId === 'TC-GRP-ADD-016')?.blockedReasons).toEqual([]);
    const runnerSource = fs.readFileSync(path.join(projectRoot, 'utils/product-center-group-runner.ts'), 'utf8');
    expect(runnerSource).toContain('加料组变更弹窗缺少影响范围或 ${selectedCount}/${selectedCount} 统计');
    expect(runnerSource).not.toContain('加料组变更弹窗缺少影响范围或 1/1 统计');
    const flowSource = fs.readFileSync(path.join(projectRoot, 'flows/product-center/item-216/standard-item-216.flow.ts'), 'utf8');
    const factorySource = fs.readFileSync(path.join(projectRoot, 'test-data/product-center/item-216/standard-item-216.factory.ts'), 'utf8');
    expect(flowSource).toContain('verifyAttributeGroupSynchronization');
    expect(flowSource).toContain('readSelectedSpecGroupEvidence');
    expect(flowSource).toContain('confirmAdditionalPriceWarning');
    expect(flowSource).toContain('createAddonFixture(`${caseId}-${timestamp}`, candidates, this.cleanupRegistry)');
    expect(flowSource).toContain("const response = kind === 'addon'");
    expect(factorySource).toContain('renameAttributeFixture');
    expect(factorySource).toContain("fixture.kind === 'spec'");
    expect(factorySource).toContain('options: Array.isArray(detail.options) ? detail.options : []');
  });

  test('组表单收尾必须先关闭最上层弹窗且不得误点变更确认', async () => {
    const pageSource = fs.readFileSync(
      path.join(projectRoot, 'pages/product-management/group-list.page.ts'),
      'utf8',
    );
    const cancelSurface = pageSource.slice(
      pageSource.indexOf('async cancelCurrentSurface()'),
      pageSource.indexOf('private async expectUniqueVisible'),
    );
    expect(cancelSurface).toContain("'[role=dialog].ant-modal-confirm-info:visible'");
    expect(cancelSurface).toContain("'信息弹窗关闭按钮'");
    expect(cancelSurface).toContain("'[role=dialog]:visible, .ant-modal-wrap:visible'");
    expect(cancelSurface).toContain("state: 'hidden'");
    expect(cancelSurface).not.toContain('Confirm Modification');
  });

  test('加料组多层确认状态探测不得先 count 再 innerText 形成竞态', async () => {
    const source = fs.readFileSync(
      path.join(projectRoot, 'pages/product-management/group-list.page.ts'),
      'utf8',
    );
    const method = source.slice(
      source.indexOf('async saveAddonGroupEditAndReadMutation()'),
      source.indexOf("@step('读取组表单中目标商品的已选规格行数"),
    );
    expect(method).toContain('const dialogTexts = await dialog.allInnerTexts();');
    expect(method).not.toContain("await dialog.count() === 1 ? (await dialog.innerText()).trim() : ''");
  });

  test('规格组解除引用必须在价格区按唯一可访问名称定位删除按钮', async () => {
    const source = fs.readFileSync(
      path.join(projectRoot, 'pages/product-management/item/item-create-standard.page.ts'),
      'utf8',
    );
    const method = source.slice(
      source.indexOf('async removeSelectedSpecGroup('),
      source.indexOf("@step('拖动规格"),
    );
    expect(method).toContain("this.locators.priceSection.getByRole('button', { name: /delete/i })");
    expect(method).toContain('if (await groupNameLabel.count() !== 1)');
    expect(method).not.toContain("xpath=ancestor::div[.//button][1]");
  });

  test('规格组夹具必须使用运行级唯一身份避免删除后同名索引冲突', async () => {
    const source = fs.readFileSync(
      path.join(projectRoot, 'test-data/product-center/item-216/standard-item-216.factory.ts'),
      'utf8',
    );
    const method = source.slice(
      source.indexOf('async createSpecFixture('),
      source.indexOf('async createMethodFixture('),
    );
    expect(method).toContain('`${normalizeCaseId(caseId)}_${nextAuditTimestamp()}`');
    expect(method).toContain('checkpointEntryId: `standard-item-spec-${record.id}`');
    expect(method).toContain("if (await this.attributeFixtureExists('spec', cleanupIdentityVariants)) await this.api.deleteSpec(record.id)");
  });

  test('解除最后一个规格组引用必须切回单规格并补齐标准价后保存', async () => {
    const flowSource = fs.readFileSync(
      path.join(projectRoot, 'flows/product-center/item-216/standard-item-216.flow.ts'),
      'utf8',
    );
    const method = flowSource.slice(
      flowSource.indexOf('async detachReferencedAttributeGroup('),
      flowSource.indexOf("@step('验证属性组新增明细不自动传播"),
    );
    expect(method).toContain('await edit.removeSelectedSpecGroup(fixture.groupName);');
    expect(method).toContain('await edit.selectSingleSpec();');
    expect(method).toContain("await edit.fillStandardPrice('1.99');");
    expect(method.indexOf('await edit.selectSingleSpec();')).toBeLessThan(method.indexOf('await edit.clickSave();'));

    const pageSource = fs.readFileSync(
      path.join(projectRoot, 'pages/product-management/item/item-create-standard.page.ts'),
      'utf8',
    );
    const selectSingle = pageSource.slice(
      pageSource.indexOf('async selectSingleSpec()'),
      pageSource.indexOf("@step('选择多规格')"),
    );
    expect(selectSingle).toContain('this.locators.singleSpecRadio.isChecked()');
  });

  test('组执行器禁止批量或聚合签发断言收据', () => {
    const runnerSource = fs.readFileSync(path.join(projectRoot, 'utils/product-center-group-runner.ts'), 'utf8');
    expect(runnerSource).not.toContain('assertionIds.push(...');
    expect(runnerSource).not.toContain('expectedAssertionReceipts');
    expect(runnerSource).not.toMatch(/assertionIds\.push\(\s*assertionReceipt\([^)]+\)\s*,\s*assertionReceipt/);
    expect(runnerSource).not.toMatch(/\[assertionReceipt\([^\]]+assertionReceipt\(/s);
    const simpleCreate = runnerSource.slice(
      runnerSource.indexOf('async function runSimpleOptionGroupCreateCase'),
      runnerSource.indexOf('async function runOptionGroupBoundaryCase'),
    );
    expect(simpleCreate.indexOf('creation.groupValue !== identity')).toBeLessThan(simpleCreate.indexOf('assertionReceipt(binding, 0)'));
    expect(simpleCreate.indexOf('!creation.response.ok()')).toBeLessThan(simpleCreate.indexOf('assertionReceipt(binding, 1)'));
    expect(simpleCreate.indexOf('API 详情未包含创建的子项')).toBeLessThan(simpleCreate.lastIndexOf('assertionReceipt(binding'));
    const productSelection = runnerSource.slice(
      runnerSource.indexOf('async function runProductSelectionCase'),
      runnerSource.indexOf('async function runMultilangQueryCase'),
    );
    expect(productSelection.indexOf('加料选择页搜索或多选证据不完整'))
      .toBeLessThan(productSelection.indexOf('assertionReceipt(binding, 0)'));
    expect(productSelection.indexOf('套餐选择页搜索或多选证据不完整'))
      .toBeLessThan(productSelection.lastIndexOf('assertionReceipt(binding, 0)'));
    const readOnly = runnerSource.slice(
      runnerSource.indexOf('async function runReadOnlyCase'),
      runnerSource.indexOf('function assertionReceipt'),
    );
    expect(readOnly).toContain('const listReadEvidence = await pageObject.open()');
    expect(readOnly).toContain('组列表 API 读取证据无效');
  });

  test('唯一明细删除必须同时保留原明细并取得可见拦截反馈', async () => {
    const pageSource = fs.readFileSync(
      path.join(projectRoot, 'pages/product-management/group-list.page.ts'),
      'utf8',
    );
    const deleteBoundary = pageSource.slice(
      pageSource.indexOf('async attemptDeleteOnlyDetail'),
      pageSource.indexOf('async readCurrentDetailNames'),
    );
    expect(deleteBoundary).not.toContain('await this.openAddDetailSurface()');
    expect(deleteBoundary).toContain('confirmationDialog.waitFor');
    expect(deleteBoundary).toContain('informationDialogVisible');
    expect(deleteBoundary).toContain('value.messages.length > 0');
    expect(deleteBoundary).toContain('value.names[0] === optionIdentity');
    expect(deleteBoundary).toContain('await this.dismissInformationDialog');
  });

  test('组新增页必须分别唯一定位页头提交和取消按钮', async () => {
    const pageSource = fs.readFileSync(
      path.join(projectRoot, 'pages/product-management/group-list.page.ts'),
      'utf8',
    );
    const submitControl = pageSource.slice(
      pageSource.indexOf('groupFormSubmitControl('),
      pageSource.indexOf("@step('提交空表单并等待校验反馈')"),
    );
    expect(submitControl).toContain("surface.getByRole('button'");
    expect(submitControl).toContain('确\\s*定');
    expect(pageSource).toContain('const submit = this.groupFormSubmitControl(surface);');
    expect(pageSource).toContain('const submit = this.groupFormSubmitControl();');
  });

  test('套餐类型统一支持当前单选合同并兼容旧下拉合同', async () => {
    const pageSource = fs.readFileSync(
      path.join(projectRoot, 'pages/product-management/group-list.page.ts'),
      'utf8',
    );
    const comboTypeSelection = pageSource.slice(
      pageSource.indexOf('async selectComboType('),
      pageSource.indexOf("@step('在加料商品选择页搜索并设置商品选中状态"),
    );
    expect(comboTypeSelection).toContain('label.ant-radio-wrapper:visible');
    expect(comboTypeSelection).toContain('radio.isChecked()');
    expect(comboTypeSelection).toContain("surface.locator('.ant-select:visible')");
    expect(pageSource.match(/await this\.selectComboType\(/g)?.length).toBeGreaterThanOrEqual(2);
  });

  test('套餐选择数量统一支持当前 Quantity 与旧 items 合同', async () => {
    const pageSource = fs.readFileSync(
      path.join(projectRoot, 'pages/product-management/group-list.page.ts'),
      'utf8',
    );
    const quantity = pageSource.slice(
      pageSource.indexOf('async fillComboSelectionQuantity('),
      pageSource.indexOf("@step('提交组创建并等待成功响应')"),
    );
    expect(quantity).toContain('input[placeholder="Quantity"][role="spinbutton"]:visible');
    expect(quantity).toContain('input[placeholder="items"][role="spinbutton"]:visible');
    expect(quantity).toContain("await this.expectUniqueVisible(field, '套餐组选择数量字段')");
  });

  test('TC-GRP-PKG-030 必须按 3/1 执行且语言切换不得被当前中文状态短路', async () => {
    const runnerSource = fs.readFileSync(
      path.join(projectRoot, 'utils/product-center-group-runner.ts'),
      'utf8',
    );
    const boundary = runnerSource.slice(
      runnerSource.indexOf("binding.title.includes('最少选择数量大于最多选择数量')"),
      runnerSource.indexOf("binding.title.includes('最少和最多选择数量输入0')"),
    );
    expect(boundary).toContain("/Minimum Selection Quantity|最少选择数量/i, '3'");
    expect(boundary).toContain("/Maximum Selection Quantity|最多选择数量/i, '1'");
    expect(boundary).toContain('submitComboV2FormExpectRejected(binding, identity, main, productCenterApi)');
    const binding = buildGroupAutomationBindings([
      groupCase({ id: 'TC-GRP-PKG-030', title: sourceTitle('TC-GRP-PKG-030'), module: '商品管理 → 套餐组' }),
    ], contract)[0];
    expect(binding.handlerId).toBe('combo-v2-pkg030-validation');
    const dedicatedBranch = runnerSource.slice(
      runnerSource.indexOf("binding.handlerId === 'combo-v2-pkg030-validation'"),
      runnerSource.indexOf("binding.handlerId === 'combo-v2-create-contract'"),
    );
    expect(dedicatedBranch).toContain('await itemList.openForResidueCheck()');
    expect(dedicatedBranch).toContain('await itemList.expectLoaded()');
  });

  test('重名校验接受前端拦截或唯一后端拒绝但禁止无证据通过', async () => {
    const pageSource = fs.readFileSync(
      path.join(projectRoot, 'pages/product-management/group-list.page.ts'),
      'utf8',
    );
    const runnerSource = fs.readFileSync(
      path.join(projectRoot, 'utils/product-center-group-runner.ts'),
      'utf8',
    );
    const duplicateValidation = runnerSource.slice(
      runnerSource.indexOf('async function runProductBackedGroupDuplicateValidationCase('),
      runnerSource.indexOf('async function runAddonQuantityValidationCase('),
    );
    expect(duplicateValidation).toContain('rejection.mutationCount > 1');
    expect(duplicateValidation).toContain('responseIndicatesBusinessRejection');
    expect(duplicateValidation).toContain('!rejection.submitDisabled && !rejection.errorText');
    expect(duplicateValidation).toContain('/duplicat|already exists?|conflict|repeat|不可重复|重复|冲突/i');
    expect(duplicateValidation).toContain('重名提交后产生额外组记录');
    const rejectionCapture = pageSource.slice(
      pageSource.indexOf('async submitGroupAndCaptureRejection('),
      pageSource.indexOf("@step('填写套餐组选择数量"),
    );
    expect(rejectionCapture).toContain('.ant-form-item-explain-error:visible');
    expect(rejectionCapture).toContain('[role=alert].ant-alert-error:visible');
    expect(rejectionCapture).not.toContain(', [role=alert]:visible');
  });

  test('最终摘要必须描述严格证据合并且不得伪称单次全量', async () => {
    const reportSource = fs.readFileSync(
      path.join(projectRoot, 'scripts/build-product-center-group-final-report.ts'),
      'utf8',
    );
    expect(reportSource).toContain('orchestrationWallDurationMs');
    expect(reportSource).toContain('cumulativeCaseDurationMs');
    expect(reportSource).toContain('调度墙钟');
    expect(reportSource).toContain('并发用例累计');
    expect(reportSource).toContain('认证失败归档与失败诊断运行不计入通过统计');
    expect(reportSource).toContain('- 严格合并运行：');
    expect(reportSource).not.toContain('- 耗时：首轮全量');
    expect(reportSource).not.toContain('含两轮定向重跑');
  });

  test('产品发现重放必须使用独立通道并保留失败状态', async () => {
    const source = fs.readFileSync(
      path.join(projectRoot, 'tests/generated/product-center-group-finding-replay.generated.spec.ts'),
      'utf8',
    );
    expect(source).toContain("binding.blockClassification === 'observed-product-drift'");
    expect(source).toContain('allowObservedProductDrift: true');
    expect(source).toContain("testInfo.attach('product-center-group-runtime-evidence'");
    expect(source).toContain('evaluateGroupEvidence(binding, result, { allowObservedProductDrift: true })');
    expect(source).not.toContain('当前运行未再观察到已登记产品偏差，必须重新评估偏差绑定');
    expect(source).toContain("preliminary.category === 'unknown'");
    expect(source).toContain("message.includes('当前运行未再观察到已登记产品偏差')");
    expect(source).toContain('classifyProductCenterItemResponsibility(classification.category, evidenceComplete)');
    expect(source).toContain("testInfo.attach('product-center-group-finding-optimization-receipt'");
    expect(source).toContain('throw error');
    const runnerSource = fs.readFileSync(
      path.join(projectRoot, 'scripts/run-product-center-group-finding-replay.ts'),
      'utf8',
    );
    expect(runnerSource).toContain('issueSystemTestExecutionGrant');
    expect(runnerSource).toContain("binding.blockClassification !== 'observed-product-drift'");
    expect(runnerSource).toContain('plan.canaryCaseIds.includes(caseId)');
  });

  test('已登记产品偏差证据必须保持不可覆盖', async () => {
    const source = fs.readFileSync(
      path.join(projectRoot, 'utils/product-center-group-runner.ts'),
      'utf8',
    );
    const writer = source.slice(
      source.indexOf('function writeProductCenterGroupEvidence('),
      source.indexOf('async function createComboV2UiPricedProductFixture('),
    );
    expect(writer).toContain("flag: 'wx'");
    expect(writer).toContain("code !== 'EEXIST'");
    expect(writer).not.toContain("fs.writeFileSync(outputPath, `${JSON.stringify(value, null, 2)}\\n`, 'utf8')");
  });
});
