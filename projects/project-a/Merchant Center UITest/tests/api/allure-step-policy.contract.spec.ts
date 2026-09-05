import fs from 'node:fs';
import path from 'node:path';
import AdmZip from 'adm-zip';
import { expect, test } from '@playwright/test';
import {
  createMerchantCenterAllureIntegrityPolicy,
  createMerchantCenterAllureOptions,
  MerchantCenterAllureReporter,
  normalizeMerchantCenterAllureResults,
} from '../../adapters/test-automation-platform/allure-reporting';
import {
  attachBusinessEvidenceStep,
  auditAllureBusinessReport,
  createStepBoundAttachmentName,
  type AllureBusinessReportResult,
} from '../../../../Test Automation Platform/src/reporters/allure-report-integrity';
import {
  buildSeasoningOperationChangeEvidence,
  createSeasoningSystemTestStepReporter,
  describeSeasoningOperation,
  describeSeasoningSystemTestStep,
} from '../../adapters/product-center/seasoning-reporting';
import ProductCenterSystemAllureReporter, {
  createProductCenterSystemAllureOptions,
} from '../../reporters/product-center-system-allure.reporter';
import MerchantCenterSeasoningAllureReporter from '../../systems/merchant-center-product-center-seasoning/allure.reporter';
import { renderStepTitle } from '../../utils/step';

const projectRoot = path.resolve(__dirname, '../..');

test.describe('Merchant Center Allure 步骤注释适配', () => {
  test('业务操作结果必须能从真实前后快照生成结构化 Diff', () => {
    const evidence = buildSeasoningOperationChangeEvidence({
      observations: {
        before: { id: 101, name: '旧调味' },
        after: { id: 101, name: '新调味' },
      },
    });

    expect(evidence).toEqual({
      before: { id: 101, name: '旧调味' },
      after: { id: 101, name: '新调味' },
    });
  });

  test('缺少前后快照时不能伪造结构化 Diff', () => {
    expect(buildSeasoningOperationChangeEvidence({ status: 200 })).toBeUndefined();
  });

  test('循环引用的操作结果不会导致报告递归溢出', () => {
    const response: Record<string, unknown> = { status: 200 };
    response.self = response;
    expect(buildSeasoningOperationChangeEvidence(response)).toBeUndefined();
  });

  test('项目适配器必须使用公共业务步骤策略', async () => {
    expect(createMerchantCenterAllureOptions()).toEqual({
      detail: false,
      outputFolder: 'allure-results',
      suiteTitle: false,
    });
  });

  test('Playwright 配置必须通过适配器接入 Allure 策略', async () => {
    const source = fs.readFileSync(path.join(projectRoot, 'playwright.config.ts'), 'utf8');
    expect(source).toContain("./adapters/test-automation-platform/allure-reporting");
    expect(source).toContain('createMerchantCenterAllurePlaywrightV3Options()');
    expect(source).not.toContain('detail: true');
  });

  test('独立 Allure 报告生成前必须复用中文结果归一化适配', async () => {
    const source = fs.readFileSync(path.join(projectRoot, 'scripts/generate-isolated-allure-report.ts'), 'utf8');
    expect(source).toMatch(/import\s*\{[^}]*\bnormalizeMerchantCenterAllureResults\b[^}]*\}\s*from\s*['"]\.\.\/adapters\/test-automation-platform\/allure-reporting['"]/);
    expect(source).toContain('normalizeMerchantCenterAllureResults(resultsDir);');
  });

  test('系统测试运行器必须注入商品中心 Allure 适配记者', async () => {
    const packageSource = fs.readFileSync(path.join(projectRoot, 'package.json'), 'utf8');
    const runnerSource = fs.readFileSync(path.join(projectRoot, 'scripts/run-merchant-system-test.ts'), 'utf8');
    const reporterSource = fs.readFileSync(path.join(projectRoot, 'reporters/product-center-system-allure.reporter.ts'), 'utf8');
    expect(packageSource).toContain('flow:system-test');
    expect(runnerSource).toContain('SYSTEM_TEST_ADDITIONAL_REPORTERS');
    expect(reporterSource).toContain('extends MerchantCenterAllureReporter');
  });

  test('调味运行器必须将操作、断言证据绑定到阶段步骤', async () => {
    const source = fs.readFileSync(path.join(projectRoot, 'systems/merchant-center-product-center-seasoning/tests/system.spec.ts'), 'utf8');
    const reportingSource = fs.readFileSync(path.join(projectRoot, 'adapters/product-center/seasoning-reporting.ts'), 'utf8');
    expect(source).toContain('buildReportEvidence: (step, current) => buildSeasoningReportEvidence(step, current)');
    expect(source).toContain("'接口与业务数据执行收据'");
    expect(source).toContain("'断言期望值与实际值'");
    expect(source).toContain('const checkResults = buildAssertionCheckResults');
    expect(source).toContain('details: [');
    expect(source).toContain('assertionDetail');
    expect(reportingSource).toContain('pendingContextAttachments');
    expect(source).toContain('businessDescription: presentation.purpose');
    expect(source).toContain('createBusinessOperationReceiptDetail');
    expect(source).toContain('failureCategoryLabel');
    expect(source).toContain('formatBusinessExecutionConclusionTitle');
  });

  test('调味全部操作键必须具有中文业务作用且不回退显示原始接口', async () => {
    const sources = [
      'systems/merchant-center-product-center-seasoning/tests/system.spec.ts',
      'systems/merchant-center-product-center-seasoning/build.ts',
      'systems/merchant-center-product-center-seasoning/recipes.json',
    ].map((relativePath) => fs.readFileSync(path.join(projectRoot, relativePath), 'utf8'));
    const operationKeys = new Set<string>();
    for (const source of sources) {
      for (const match of source.matchAll(/['"]((?:brand-menu:[^'"]+|ui:[^'"]+))['"]/g)) {
        operationKeys.add(match[1]);
      }
    }
    expect(operationKeys.size).toBeGreaterThan(20);
    for (const operationKey of operationKeys) {
      const presentation = describeSeasoningOperation(operationKey);
      expect(presentation.purpose, operationKey).toMatch(/[\u3400-\u9fff]/);
      expect(presentation.purpose, operationKey).not.toContain('映射待补齐');
      expect(presentation.purpose, operationKey).not.toBe(operationKey);
    }
  });

  test('调味失败证据必须绑定实际失败步骤而不是创建同名独立步骤', async () => {
    const source = fs.readFileSync(path.join(projectRoot, 'adapters/product-center/seasoning-reporting.ts'), 'utf8');
    expect(source).toContain("attachReportEvidence(allureStep, title, evidence, 'failed')");
    expect(source).not.toContain('attachReportEvidenceToCurrentStep');
    expect(source).not.toContain('await test.step(title, async (step)');
  });

  test('系统测试 Allure 记者必须将独立目录映射为 v3 resultsDir', async () => {
    const previousResultsDir = process.env.ALLURE_RESULTS_DIR;
    const isolatedResultsDir = path.join(projectRoot, 'output', 'contract', 'isolated-allure-results');
    process.env.ALLURE_RESULTS_DIR = isolatedResultsDir;
    try {
      expect(createProductCenterSystemAllureOptions()).toEqual({
        detail: false,
        suiteTitle: false,
        resultsDir: path.resolve(isolatedResultsDir),
      });
      const reporter = new ProductCenterSystemAllureReporter();
      expect(reporter.options).toEqual({
        detail: false,
        suiteTitle: false,
        resultsDir: path.resolve(isolatedResultsDir),
      });
      expect(reporter.options).not.toHaveProperty('outputFolder');
    } finally {
      if (previousResultsDir === undefined) delete process.env.ALLURE_RESULTS_DIR;
      else process.env.ALLURE_RESULTS_DIR = previousResultsDir;
    }
  });

  test('两个独立记者必须复用同一中文结果归一化适配', async ({}, testInfo) => {
    expect(new ProductCenterSystemAllureReporter()).toBeInstanceOf(MerchantCenterAllureReporter);
    expect(new MerchantCenterSeasoningAllureReporter()).toBeInstanceOf(MerchantCenterAllureReporter);

    const resultsDir = testInfo.outputPath('isolated-allure-results');
    fs.mkdirSync(resultsDir, { recursive: true });
    const resultPath = path.join(resultsDir, 'reporter-contract-result.json');
    const runtimeEvidenceSource = 'runtime-evidence.json';
    fs.writeFileSync(path.join(resultsDir, runtimeEvidenceSource), JSON.stringify({
      assertionReceipts: [],
      operationReceipts: [],
    }), 'utf8');
    fs.writeFileSync(resultPath, JSON.stringify({
      name: 'system-test-case-id: TC-ALLURE-001',
      status: 'passed',
      steps: [
        {
          name: 'failure-category: automation-gap',
          status: 'passed',
          attachments: [
            {
              name: createStepBoundAttachmentName('失败分类：automation-gap', 'system-test-runtime-evidence'),
              source: runtimeEvidenceSource,
            },
            { name: 'system-test-error' },
            { name: 'screenshot' },
            { name: 'error-context' },
            { name: 'trace' },
            { name: '业务证据附件' },
          ],
        },
      ],
    }), 'utf8');

    expect(normalizeMerchantCenterAllureResults(resultsDir)).toBe(1);
    const normalized = JSON.parse(fs.readFileSync(resultPath, 'utf8')) as {
      name: string;
      status: string;
      statusDetails: { message?: string };
      steps: Array<{ name: string; attachments: Array<{ name: string }> }>;
    };
    expect(normalized.name).toBe('用例标识：TC-ALLURE-001');
    expect(normalized.steps[0]?.name).toBe('失败分类：automation-gap');
    expect(normalized.steps[0]?.attachments.map((item) => item.name)).toEqual([
      '运行证据附件',
      '失败诊断附件',
      '失败截图附件',
      '失败上下文附件',
      '执行追踪附件',
      '业务证据附件',
    ]);
    expect(normalized.status).toBe('failed');
    expect(normalized.statusDetails.message).toContain('缺少可接受的真实业务操作证据');
    expect(normalizeMerchantCenterAllureResults(resultsDir)).toBe(0);
  });

  test(
    '业务步骤和证据附件应保留而技术动作不应展示',
    {
      tag: ['@case-ALLURE-STEP-001'],
    },
    async () => {
      await attachBusinessEvidenceStep({
        title: '证据：验证 Allure 仅展示中文业务动作',
        runStep: (title, action) => test.step(title, action),
        attachments: [{
          name: '步骤证据附件',
          body: Buffer.from('allure-step-policy-contract'),
          contentType: 'text/plain',
        }],
      });
      expect(true).toBe(true);
    },
  );
});

test.describe('商品中心调味业务步骤标题适配', () => {
  test('装饰器标题必须渲染真实业务参数而不是保留占位符', async () => {
    expect(renderStepTitle('填写品牌调味：{groupName} / {optionName} / {price}', [
      { groupName: 'AUTO_GROUP', optionName: 'AUTO_OPTION', price: 1.5 },
    ])).toBe('填写品牌调味：AUTO_GROUP / AUTO_OPTION / 1.5');
    expect(renderStepTitle('精确定位唯一审计记录：{2}', [
      { entity: '调味' },
      { id: 101 },
      'AUTO_GROUP',
    ])).toBe('精确定位唯一审计记录：AUTO_GROUP');
    const sopSource = fs.readFileSync(path.join(projectRoot, 'pages/product-center/product-center-sop.page.ts'), 'utf8');
    expect(sopSource).not.toContain('未提供第3个参数');
    expect(sopSource).not.toContain("@step('精确定位唯一审计记录：{2}')");
  });

  test('调味变更步骤必须展示完整业务对象和持久化回读意图', async () => {
    const sopSource = fs.readFileSync(path.join(projectRoot, 'pages/product-center/product-center-sop.page.ts'), 'utf8');
    const boundarySource = fs.readFileSync(path.join(projectRoot, 'pages/product-center/seasoning-boundary.page.ts'), 'utf8');
    const systemSource = fs.readFileSync(path.join(projectRoot, 'systems/merchant-center-product-center-seasoning/tests/system.spec.ts'), 'utf8');
    expect(sopSource).toContain("action === 'Edit' ? '选择编辑菜单动作' : '选择删除菜单动作'");
    expect(sopSource).toContain('打开调味组“${record.originalIdentity}”删除确认并取消');
    expect(boundarySource).toContain('将调味项“${optionName}”从调味组“${sourceGroupName}”移动到调味组“${targetGroupName}”');
    expect(boundarySource).toContain('下发调味模板“${templateName}”到门店“${expectedStoreName?.trim() || \'页面读取名称\'}”（${storeId}）');
    expect(boundarySource).toContain('编辑调味模板“${templateName}”中的调味项“${optionName}”：${mode === \'add\' ? \'新增\' : \'移除\'}');
    expect(boundarySource).toContain('transientValueConfirmed');
    expect(systemSource).toContain('checks.targetOwnsOption');
    expect(systemSource).toContain('checks.apiOrderPersisted');
    expect(systemSource).toContain('checks.editRequestContainsExpectedOption');
  });

  test('调味系统 Recipe 阶段必须产出中文业务语义步骤', async () => {
    const recipe = {
      caseId: 'TC-FLV-SEA-019',
      title: '新增调味组填写全部字段保存成功',
      route: '/pp/brand/seasoning/list',
      capabilities: [],
      assertions: [],
    } as never;
    expect(describeSeasoningSystemTestStep({
      phase: 'capability',
      recipe,
      adapterId: 'merchant-center.seasoning.create-minimal',
    })).toBe('[业务操作] 新增调味组并仅填写必填字段保存');
    expect(describeSeasoningSystemTestStep({
      phase: 'assertion',
      recipe,
      adapterId: 'merchant-center.seasoning.assert-ui-created',
    })).toBe('[断言] 核对页面显示新建调味业务身份');
    expect(describeSeasoningSystemTestStep({
      phase: 'capability',
      recipe,
      adapterId: 'merchant-center.seasoning.ui-mutation',
    })).toBe('[业务操作] 执行“新增调味组填写全部字段保存成功”');
    expect(describeSeasoningSystemTestStep({
      phase: 'initialize',
      recipe,
    })).toBe('[环境] 登录 → 商品中心 → 商品管理 → 调味管理 → 品牌调味列表页，确认页面加载完成');
    expect(describeSeasoningSystemTestStep({
      phase: 'seed',
      recipe,
      adapterId: 'merchant-center.seasoning.seed',
    })).toBe('[准备数据] 创建本用例业务数据并回读服务端身份');
    expect(describeSeasoningSystemTestStep({
      phase: 'cleanup',
      recipe,
    })).toBe('[清理] 删除本用例产生的调味数据并确认无残留');
  });

  test('项目严格审计必须逐步骤拒绝技术噪声和孤立附件', async () => {
    const findings = auditAllureBusinessReport({
      status: 'passed',
      steps: [
        { name: 'Fill locator("#name")', status: 'passed' },
        {
          name: '运行证据附件',
          attachments: [{ name: '运行证据附件', source: 'runtime.json' }],
        },
      ],
    }, createMerchantCenterAllureIntegrityPolicy());
    expect(findings.map((item) => item.code)).toEqual([
      'NON_LOCALIZED_STEP_TITLE',
      'TECHNICAL_STEP_TITLE',
      'ATTACHMENT_NOT_BOUND_TO_STEP',
    ]);
  });

  test('项目归一化必须把自动失败附件归入实际失败断言步骤', async ({}, testInfo) => {
    const resultsDir = testInfo.outputPath('detached-allure-results');
    fs.mkdirSync(resultsDir, { recursive: true });
    const resultPath = path.join(resultsDir, 'detached-result.json');
    fs.writeFileSync(resultPath, JSON.stringify({
      name: '失败附件归属合同',
      status: 'failed',
      attachments: [{ name: 'screenshot', source: 'failure.png', type: 'image/png' }],
      steps: [{ name: '断言：核对保存结果', status: 'failed', steps: [], attachments: [] }],
    }), 'utf8');

    expect(normalizeMerchantCenterAllureResults(resultsDir)).toBe(1);
    const normalized = JSON.parse(fs.readFileSync(resultPath, 'utf8')) as AllureBusinessReportResult;
    expect(normalized.attachments).toEqual([]);
    expect(normalized.steps).toEqual(expect.arrayContaining([
      expect.objectContaining({
        name: '[断言] 核对保存结果',
        status: 'failed',
        attachments: [{ name: '失败截图附件', source: 'failure.png', type: 'image/png' }],
      }),
    ]));
    expect(auditAllureBusinessReport(normalized, createMerchantCenterAllureIntegrityPolicy())).toEqual([]);
  });

  test('项目归一化必须隐藏框架元数据并保留业务子步骤', async ({}, testInfo) => {
    const resultsDir = testInfo.outputPath('framework-metadata-results');
    fs.mkdirSync(resultsDir, { recursive: true });
    const resultPath = path.join(resultsDir, 'framework-metadata-result.json');
    fs.writeFileSync(resultPath, JSON.stringify({
      name: 'system-test-case-id: TC-ALLURE-METADATA-001',
      status: 'passed',
      steps: [
        {
          name: 'Before Hooks',
          status: 'passed',
          steps: [{ name: '建立商户中心登录态', status: 'passed', steps: [], attachments: [] }],
          attachments: [],
        },
        { name: 'group-case-id: TC-ALLURE-METADATA-001', status: 'passed', steps: [], attachments: [] },
        { name: 'group-key: merchant-center:product-center:group:test', status: 'passed', steps: [], attachments: [] },
        { name: '业务操作：保存商品', status: 'passed', steps: [], attachments: [] },
      ],
    }), 'utf8');

    expect(normalizeMerchantCenterAllureResults(resultsDir)).toBe(1);
    const normalized = JSON.parse(fs.readFileSync(resultPath, 'utf8')) as AllureBusinessReportResult;
    expect(normalized.steps?.map((step) => step.name)).toEqual([
      '建立商户中心登录态',
      '[业务操作] 保存商品',
    ]);
    expect(normalized.steps?.some((step) => /Hooks|group-|canonical-case-id|conversion-status/.test(step.name ?? ''))).toBe(false);
    expect(normalizeMerchantCenterAllureResults(resultsDir)).toBe(0);
  });

  test('Allure v3 通过状态的失败附件节点必须绑定失败断言并保留 caseId 标签', async ({}, testInfo) => {
    const resultsDir = testInfo.outputPath('v3-detached-allure-results');
    fs.mkdirSync(resultsDir, { recursive: true });
    const resultPath = path.join(resultsDir, 'v3-detached-result.json');
    fs.writeFileSync(resultPath, JSON.stringify({
      name: '调味失败附件归属合同',
      status: 'failed',
      labels: [{ name: 'tag', value: 'case-TC-FLV-SEA-028' }],
      steps: [
        { name: '断言：核对删除后调味项不存在', status: 'failed', steps: [], attachments: [] },
        { name: 'screenshot', status: 'passed', steps: [], attachments: [{ name: 'screenshot', source: 'failure.png', type: 'image/png' }] },
      ],
    }), 'utf8');

    expect(normalizeMerchantCenterAllureResults(resultsDir)).toBe(1);
    const normalized = JSON.parse(fs.readFileSync(resultPath, 'utf8')) as AllureBusinessReportResult & {
      labels: Array<{ name: string; value: string }>;
    };
    expect(normalized.steps).toEqual(expect.arrayContaining([expect.objectContaining({
      name: '[断言] 核对删除后调味项不存在',
      status: 'failed',
      attachments: [{ name: '失败截图附件', source: 'failure.png', type: 'image/png' }],
    })]));
    expect(normalized.labels).toContainEqual({ name: 'caseId', value: 'TC-FLV-SEA-028' });
  });

  test('SEA-041 历史报告必须显示点击确定保存并折叠接口技术明细', async ({}, testInfo) => {
    const resultsDir = testInfo.outputPath('sea-041-folded-operation-results');
    fs.mkdirSync(resultsDir, { recursive: true });
    fs.writeFileSync(path.join(resultsDir, 'operation-receipt.json'), JSON.stringify({
      caseId: 'TC-FLV-SEA-041',
      phase: 'capability',
      operations: [
        {
          operationKey: 'brand-menu:PUT /ops-brand/global-modifier/sort',
          method: 'PUT',
          success: true,
          status: 'passed',
          responseStatus: '本接口收据未提供 HTTP 状态',
        },
        {
          operationKey: 'brand-menu:GET /ops-brand/global-modifier/list',
          method: 'GET',
          success: true,
          status: 'passed',
        },
      ],
    }), 'utf8');
    fs.writeFileSync(path.join(resultsDir, 'assertion-receipt.json'), JSON.stringify({
      actual: {
        observations: {
          status: 200,
          requestBody: { groups: [{ id: 1519, sortOrder: 0 }, { id: 1518, sortOrder: 1 }] },
        },
      },
      checkResults: [],
    }), 'utf8');
    const resultPath = path.join(resultsDir, 'sea-041-result.json');
    fs.writeFileSync(resultPath, JSON.stringify({
      name: '调味组排序保存成功',
      status: 'passed',
      labels: [{ name: 'tag', value: 'case-TC-FLV-SEA-041' }],
      steps: [
        {
          name: '业务操作：拖动调味组排序并确认列表状态',
          status: 'passed',
          attachments: [{ name: '业务操作执行收据', source: 'operation-receipt.json', type: 'application/json' }],
          steps: [{
            name: '执行1：brand-menu:PUT /ops-brand/global-modifier/sort｜方法：PUT｜结果：passed｜HTTP：未提供',
            status: 'passed',
          }],
        },
        {
          name: '断言：调味组排序保存成功且列表回读顺序一致',
          status: 'passed',
          attachments: [{ name: '断言期望值与实际值', source: 'assertion-receipt.json', type: 'application/json' }],
          steps: [],
        },
      ],
    }), 'utf8');

    expect(normalizeMerchantCenterAllureResults(resultsDir)).toBe(1);
    const normalized = JSON.parse(fs.readFileSync(resultPath, 'utf8')) as AllureBusinessReportResult;
    const operationStep = normalized.steps?.find((step) => step.name?.startsWith('[业务操作]'));
    expect(operationStep?.name).toBe('[业务操作] 打开排序弹窗，拖动调味组并点击“确定”保存');
    const visibleTitles = (operationStep?.steps ?? []).map((step) => step.name ?? '');
    expect(visibleTitles).toContain('保存调味组排序｜触发方式：点击排序弹窗“确定”｜结果：成功');
    expect(visibleTitles).toContain('查询品牌调味列表并回读结果｜结果：成功');
    expect(visibleTitles.join('\n')).not.toContain('/ops-brand/');
    expect(visibleTitles.join('\n')).not.toContain('｜方法：');
    const saveDetail = operationStep?.steps?.find((step) => step.name?.startsWith('保存调味组排序'));
    const detailSource = saveDetail?.attachments?.[0]?.source;
    expect(saveDetail?.attachments?.[0]?.name).toBe('接口执行明细（点击查看）');
    expect(detailSource).toBeTruthy();
    const detail = JSON.parse(fs.readFileSync(path.join(resultsDir, detailSource ?? ''), 'utf8')) as Record<string, unknown>;
    expect(detail).toEqual(expect.objectContaining({
      接口作用: '保存调味组排序',
      触发来源: '点击排序弹窗“确定”',
      请求方法: 'PUT',
      接口路径: '/ops-brand/global-modifier/sort',
      响应状态: 'HTTP 200',
      执行结果: '成功',
    }));
    expect(normalizeMerchantCenterAllureResults(resultsDir)).toBe(0);
  });

  test('通过用例的业务上下文附件不得生成失败诊断步骤', async ({}, testInfo) => {
    const resultsDir = testInfo.outputPath('passed-context-receipt-results');
    fs.mkdirSync(resultsDir, { recursive: true });
    const resultPath = path.join(resultsDir, 'passed-context-result.json');
    fs.writeFileSync(resultPath, JSON.stringify({
      name: '通过用例上下文附件归属合同',
      status: 'passed',
      labels: [{ name: 'tag', value: 'case-TC-FLV-SEA-041' }],
      steps: [
        { name: '业务操作：拖动调味组排序并确认列表状态', status: 'passed', steps: [] },
        { name: '断言：调味组排序保存成功且列表回读顺序一致', status: 'passed', steps: [] },
        {
          name: '失败诊断：保留失败分类、截图、上下文和执行追踪', status: 'passed', steps: [],
          attachments: [
            { name: '业务上下文校验收据', source: 'before-action.json', type: 'application/json' },
            { name: '业务上下文校验收据', source: 'before-assertion.json', type: 'application/json' },
          ],
        },
      ],
    }), 'utf8');

    expect(normalizeMerchantCenterAllureResults(resultsDir)).toBe(1);
    const normalized = JSON.parse(fs.readFileSync(resultPath, 'utf8')) as AllureBusinessReportResult;
    expect(normalized.steps?.some((step) => step.name?.startsWith('失败诊断'))).toBe(false);
    expect(normalized.steps?.find((step) => step.name?.startsWith('[业务操作]'))?.attachments).toEqual([
      expect.objectContaining({ source: 'before-action.json' }),
    ]);
    expect(normalized.steps?.find((step) => step.name?.startsWith('[断言]'))?.attachments).toEqual([
      expect.objectContaining({ source: 'before-assertion.json' }),
    ]);
  });

  test('断言标题过滤无事实的未提供字段', async ({}, testInfo) => {
    const resultsDir = testInfo.outputPath('assertion-unavailable-field-results');
    fs.mkdirSync(resultsDir, { recursive: true });
    fs.writeFileSync(path.join(resultsDir, 'assertion.json'), JSON.stringify({
      checkResults: [{
        checkName: 'duplicateRejected', expectedValue: { expected: true }, actualValue: true,
        observedValue: { beforeCount: 1, afterCount: 1, errorText: '调味模板名称不能重复', responseStatus: '未提供', responseBody: '未提供' },
        result: '通过',
      }],
    }), 'utf8');
    const resultPath = path.join(resultsDir, 'assertion-result.json');
    fs.writeFileSync(resultPath, JSON.stringify({
      name: '重复模板断言合同', status: 'passed', labels: [{ name: 'tag', value: 'case-TC-FLV-TPL-015' }],
      steps: [{
        name: '断言：核对业务操作的期望结果、实际结果和服务端回读', status: 'passed', steps: [],
        attachments: [{ name: '断言期望值与实际值', source: 'assertion.json', type: 'application/json' }],
      }],
    }), 'utf8');

    expect(normalizeMerchantCenterAllureResults(resultsDir)).toBe(1);
    const normalized = JSON.parse(fs.readFileSync(resultPath, 'utf8')) as AllureBusinessReportResult;
    const titles = normalized.steps?.flatMap((step) => step.steps ?? []).map((step) => step.name ?? '').join('\n') ?? '';
    expect(titles).toContain('beforeCount：1');
    expect(titles).not.toContain('未提供');
  });

  test('已生成断言标题中的无关响应占位字段必须可幂等清理', async ({}, testInfo) => {
    const resultsDir = testInfo.outputPath('historical-assertion-placeholder-results');
    fs.mkdirSync(resultsDir, { recursive: true });
    const resultPath = path.join(resultsDir, 'historical-assertion-result.json');
    fs.writeFileSync(resultPath, JSON.stringify({
      name: '历史断言标题合同', status: 'passed', labels: [{ name: 'tag', value: 'case-TC-FLV-TPL-015' }],
      steps: [{
        name: '[断言] 核对业务操作的期望结果、实际结果和服务端回读', status: 'passed',
        steps: [{ name: '校验1：重复名称｜实际：beforeCount：1；responseStatus：未提供；responseBody：未提供｜结果：通过', status: 'passed' }],
      }],
    }), 'utf8');

    expect(normalizeMerchantCenterAllureResults(resultsDir)).toBe(1);
    const normalized = JSON.parse(fs.readFileSync(resultPath, 'utf8')) as AllureBusinessReportResult;
    expect(normalized.steps?.[0]?.steps?.[0]?.name).toBe('校验1：重复名称｜实际：beforeCount：1｜结果：通过');
    expect(normalizeMerchantCenterAllureResults(resultsDir)).toBe(0);
  });

  test('项目归一化必须保留并脱敏 Playwright trace 归档', async ({}, testInfo) => {
    const resultsDir = testInfo.outputPath('trace-sanitizer-allure-results');
    fs.mkdirSync(resultsDir, { recursive: true });
    const traceSource = 'synthetic-trace-attachment.zip';
    const tracePath = path.join(resultsDir, traceSource);
    const archive = new AdmZip();
    archive.addFile('0-trace.network', Buffer.from(JSON.stringify({
      headers: [{ name: 'authorization', value: 'synthetic-credential' }],
      token: 'synthetic-token',
      storageState: {
        cookies: [{ name: 'code-verifier', value: 'synthetic-code-verifier', domain: 'example.test' }],
        origins: [{ origin: 'https://example.test', localStorage: [{ name: 'userInfo', value: 'synthetic-user-info' }] }],
      },
      method: 'GET',
    })));
    archive.writeZip(tracePath);
    fs.writeFileSync(path.join(resultsDir, 'trace-result.json'), JSON.stringify({
      name: 'trace 脱敏合同',
      status: 'failed',
      steps: [{
        name: 'trace',
        status: 'passed',
        steps: [],
        attachments: [{ name: 'trace', source: traceSource, type: 'application/zip' }],
      }],
    }), 'utf8');

    expect(normalizeMerchantCenterAllureResults(resultsDir)).toBe(1);
    const sanitized = new AdmZip(tracePath).readAsText('0-trace.network');
    expect(sanitized).not.toContain('synthetic-credential');
    expect(sanitized).not.toContain('synthetic-token');
    expect(sanitized).not.toContain('synthetic-code-verifier');
    expect(sanitized).not.toContain('synthetic-user-info');
    expect(sanitized).toContain('[REDACTED]');
    expect(normalizeMerchantCenterAllureResults(resultsDir)).toBe(0);
  });
});

test(
  '调味报告应按业务阶段形成清晰步骤树',
  { tag: ['@case-ALLURE-SEASONING-TREE-001'] },
  async () => {
    const recipe = {
      caseId: 'ALLURE-SEASONING-TREE-001',
      title: '调味报告步骤树合同',
      route: '/pp/brand/seasoning/list',
      capabilities: [],
      assertions: [],
    } as never;
    const reportStep = createSeasoningSystemTestStepReporter();

    await reportStep({ phase: 'initialize', recipe }, async () => {
      await test.step('页面读取：确认品牌调味列表页完成加载', async () => undefined);
    });
    await reportStep({
      phase: 'capability',
      recipe,
      adapterId: 'merchant-center.seasoning.create-minimal',
    }, async () => {
      await test.step('页面操作：填写调味组名称 AUTO_GROUP', async () => undefined);
      await test.step('页面操作：填写调味项 AUTO_OPTION，价格 1.5', async () => undefined);
      await test.step('页面操作：提交调味并等待保存完成', async () => undefined);
    });
    await reportStep({
      phase: 'assertion',
      recipe,
      adapterId: 'merchant-center.seasoning.assert-ui-created',
    }, async () => {
      await test.step('页面读取：核对列表显示调味组 AUTO_GROUP', async () => undefined);
    });
  },
);

test(
  '调味报告应把接口收据和断言期望实际绑定到对应步骤',
  { tag: ['@case-ALLURE-SEASONING-EVIDENCE-001'] },
  async () => {
    const recipe = {
      caseId: 'ALLURE-SEASONING-EVIDENCE-001',
      title: '调味报告证据绑定合同',
      route: '/pp/brand/seasoning/list',
      capabilities: [],
      assertions: [],
    } as never;
    const reportStep = createSeasoningSystemTestStepReporter();
    await reportStep({
      phase: 'capability',
      recipe,
      adapterId: 'merchant-center.seasoning.store-replace-distribution',
    }, async () => undefined, () => [{
      name: '接口与业务数据执行收据',
      contentType: 'application/json',
      body: Buffer.from(JSON.stringify({
        interfaceOrAction: '按调味模板下发到目标门店',
        operationKey: 'brand-menu:POST /ops-brand/brand-modifier-sync/all',
        success: true,
        createdBusinessData: [{ objectType: '调味模板', businessName: 'AUTO_TEMPLATE', serverId: 101 }],
      })),
    }]);
    await reportStep({
      phase: 'assertion',
      recipe,
      adapterId: 'merchant-center.seasoning.assert-store-mutation',
    }, async () => undefined, () => [{
      name: '断言期望值与实际值',
      contentType: 'application/json',
      body: Buffer.from(JSON.stringify({ expected: '目标数据存在', actual: { visible: true } })),
    }]);
  },
);

test(
  '调味失败报告应保留失败步骤分类和截图',
  { tag: ['@case-ALLURE-SEASONING-FAILURE-001'] },
  async ({ page }, testInfo) => {
    test.skip(process.env.ALLURE_FAILURE_SAMPLE !== '1', '仅用于无业务副作用的 Allure 失败展示验证');
    const caseId = 'ALLURE-SEASONING-FAILURE-001';
    const recipe = {
      caseId,
      title: '调味失败报告合同',
      route: '/pp/brand/seasoning/list',
      capabilities: [],
      assertions: [],
    } as never;
    const reportStep = createSeasoningSystemTestStepReporter();
    await page.setContent('<main><h1>品牌调味</h1><p>保存结果：失败</p></main>');

    try {
      await reportStep({ phase: 'initialize', recipe }, async () => {
        await test.step('页面读取：确认品牌调味页面标题可见', async () => {
          await expect(page.getByRole('heading', { name: '品牌调味' })).toBeVisible();
        });
      });
      await reportStep({
        phase: 'capability',
        recipe,
        adapterId: 'merchant-center.seasoning.create-minimal',
      }, async () => {
        await test.step('页面操作：填写调味组 AUTO_FAILURE_GROUP', async () => undefined);
        await test.step('页面操作：提交调味并等待保存结果', async () => undefined);
      });
      await reportStep({
        phase: 'assertion',
        recipe,
        adapterId: 'merchant-center.seasoning.assert-ui-created',
      }, async () => {
        await test.step('页面读取：核对保存结果显示成功', async () => {
          await expect(page.locator('main')).toContainText('保存结果：成功');
        });
      });
    } catch (error) {
      const failureCategory = 'automation-gap';
      testInfo.annotations.push({ type: 'failure-category', description: failureCategory });
      await testInfo.attach(`failure-category: ${failureCategory}`, {
        contentType: 'text/plain',
        body: Buffer.from(failureCategory),
      });
      await testInfo.attach('system-test-error', {
        contentType: 'application/json',
        body: Buffer.from(JSON.stringify({
          caseId,
          failureCategory,
          message: error instanceof Error ? error.message : String(error),
          completedOperations: [
            '页面读取：确认品牌调味页面标题可见',
            '页面操作：填写调味组 AUTO_FAILURE_GROUP',
            '页面操作：提交调味并等待保存结果',
          ],
          failedOperation: '页面读取：核对保存结果显示成功',
        }, null, 2)),
      });
      await testInfo.attach('system-test-runtime-evidence', {
        contentType: 'application/json',
        body: Buffer.from(JSON.stringify({
          caseId,
          failureCategory,
          executionTimings: [],
        }, null, 2)),
      });
      throw error;
    }
  },
);



