import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import baseline from '../../contracts/product-center/failure-analysis/product-center-failure-classification-baseline.json';
import {
  analyzeProductCenterFailures,
  evaluateFailureClassificationBaseline,
  summarizeFailureAnalysisForPipeline,
  type ProductCenterFailureAnalysisInput,
} from '../../utils/product-center-failure-analysis';
import { isProductCenterServerErrorText } from '../../utils/product-center-page-health';
import { sanitizeFailureDiagnostic } from '../../reporters/product-center-timing.reporter';
import { deriveFailureRunEvidenceVerification } from '../../scripts/build-product-center-failure-analysis';

const projectRoot = path.resolve(__dirname, '../..');

test.describe('商品中心统一失败分析', () => {
  test('应准确区分八类失败且平台瞬态与未知不得晋级产品失败', async () => {
    const evaluation = evaluateFailureClassificationBaseline(
      baseline.samples as ProductCenterFailureAnalysisInput[],
    );

    expect(evaluation.total).toBe(10);
    expect(evaluation.correct).toBe(10);
    expect(evaluation.accuracy).toBe(1);
    expect(evaluation.falseProductPromotions).toBe(0);
    expect(evaluation.categories).toEqual([
      'automation-defect',
      'cleanup-residue',
      'environment',
      'execution-platform-transient',
      'locator-drift',
      'product-behavior',
      'test-data',
      'unknown',
    ]);
  });

  test('栈溢出应归类为自动化缺陷且浏览器网络超时应归类为 transient', async () => {
    const automation = evaluateFailureClassificationBaseline([{
      input: { status: 'failed', diagnostic: 'RangeError: Maximum call stack size exceeded' },
      expectedCategory: 'automation-defect',
      expectedProductFailure: false,
    }]);
    const transient = evaluateFailureClassificationBaseline([{
      input: { status: 'failed', diagnostic: 'page.goto: net::ERR_TIMED_OUT' },
      expectedCategory: 'execution-platform-transient',
      expectedProductFailure: false,
    }]);

    expect(automation).toMatchObject({ total: 1, correct: 1, falseProductPromotions: 0 });
    expect(transient).toMatchObject({ total: 1, correct: 1, falseProductPromotions: 0 });
  });

  test('等待器条件超时只能进入未决观测，不得升级为产品失败；探测超时才允许按平台瞬态重试', async () => {
    const conditionTimeout = evaluateFailureClassificationBaseline([{
      input: {
        status: 'failed',
        diagnostic: '[WAIT_UNTIL_CONDITION_TIMEOUT] channel=api operation=product-detail.attribute-option-synchronization',
      },
      expectedCategory: 'unknown',
      expectedProductFailure: false,
    }]);
    const probeTimeout = evaluateFailureClassificationBaseline([{
      input: {
        status: 'failed',
        diagnostic: '[WAIT_UNTIL_PROBE_TIMEOUT] channel=api operation=product-detail.attribute-option-synchronization',
      },
      expectedCategory: 'execution-platform-transient',
      expectedProductFailure: false,
    }]);

    expect(conditionTimeout).toMatchObject({ total: 1, correct: 1, falseProductPromotions: 0 });
    expect(probeTimeout).toMatchObject({ total: 1, correct: 1, falseProductPromotions: 0 });
  });

  test('Server Error 页面应优先归类为环境异常并由创建页提前识别', async () => {
    const environment = evaluateFailureClassificationBaseline([{
      input: { status: 'failed', diagnostic: '商品中心环境页面异常：Server Error' },
      expectedCategory: 'environment',
      expectedProductFailure: false,
    }]);
    const createPageSource = fs.readFileSync(
      path.join(projectRoot, 'pages/product-center/product-center-create-sop.page.ts'),
      'utf8',
    );

    expect(environment).toMatchObject({ total: 1, correct: 1, falseProductPromotions: 0 });
    expect(isProductCenterServerErrorText('System Error')).toBe(true);
    expect(isProductCenterServerErrorText('Server Error')).toBe(true);
    expect(isProductCenterServerErrorText('正常商品列表')).toBe(false);
    expect(createPageSource).toContain('assertNoProductCenterServerError');
  });

  test('产品行为必须由运行闭环证据证明且不得从失败文本反推业务规则', async () => {
    const result = analyzeProductCenterFailures({
      generatedAt: '2026-07-27T00:00:00.000Z',
      feedbackSources: [{
        path: 'output/recipes/feedback.json',
        document: {
          entries: [{
            recipeId: 'recipe-1',
            caseId: 'case-1',
            title: '某业务断言',
            status: 'failed',
            diagnostic: 'expected enabled but received disabled',
            classification: 'assertion',
          }],
        },
      }],
      evidenceSources: [{
        path: 'output/recipes/evidence.json',
        document: {
          entries: [{
            recipeId: 'recipe-1',
            caseId: 'case-1',
            claimCoverageComplete: false,
            sidebarEntryVerified: true,
          }],
        },
      }],
      cleanup: { status: 'verified-clean', evidenceRefs: ['output/checkpoints'] },
      environmentVerified: true,
      testDataVerified: true,
      pageContract: { status: 'clean', evidenceRef: 'output/page-contract/diff.json' },
    });

    expect(result.entries).toHaveLength(1);
    expect(result.entries[0].category).toBe('unknown');
    expect(result.entries[0].productFailure).toBe(false);
    expect(result.entries[0].unresolved).toBe(true);
    expect(result.entries[0].pendingConfirmations).toContain('claim-runtime-verification-required');
    expect(JSON.stringify(result)).not.toContain('businessRule');
  });

  test('全绿真实反馈应输出零未决失败并保留来源引用', async () => {
    const result = analyzeProductCenterFailures({
      generatedAt: '2026-07-27T00:00:00.000Z',
      feedbackSources: [{
        path: 'output/recipes/passed-feedback.json',
        document: {
          entries: [{
            recipeId: 'recipe-1',
            caseId: 'case-1',
            title: '已通过用例',
            status: 'passed',
          }],
        },
      }],
      evidenceSources: [],
      cleanup: { status: 'verified-clean', evidenceRefs: ['output/checkpoints'] },
      environmentVerified: true,
      testDataVerified: true,
      pageContract: { status: 'clean', evidenceRef: 'output/page-contract/diff.json' },
    });

    expect(result.summary).toMatchObject({
      failedCases: 0,
      unresolvedFailures: 0,
      productFailures: 0,
      transientFailures: 0,
      falseProductPromotions: 0,
    });
    expect(result.entries).toEqual([]);
    expect(result.sources.feedback).toEqual(['output/recipes/passed-feedback.json']);
  });

  test('环境与测试数据验证必须来自反馈和证据的同一 runId', async () => {
    const valid = deriveFailureRunEvidenceVerification({
      feedbackSources: [{
        path: 'output/recipes/sample-feedback.json',
        document: {
          runId: 'run-1',
          entries: [{ recipeId: 'recipe-1', caseId: 'case-1', status: 'failed' }],
        },
      }],
      evidenceSources: [{
        path: 'output/recipes/sample-evidence.json',
        document: {
          runId: 'run-1',
          entries: [{
            recipeId: 'recipe-1',
            caseId: 'case-1',
            context: { environmentId: 'balamxqa' },
            release: {
              runId: 'run-1',
              environmentFingerprint: 'environment',
              applicationFingerprint: 'application',
            },
            api: {},
            cleanup: { required: true, completed: true, residueCount: 0 },
            execution: { phaseDurationsMs: { seed: 1, cleanup: 1 } },
          }],
        },
      }],
    });
    expect(valid).toMatchObject({
      runIds: ['run-1'],
      evidenceEntries: 1,
      environmentVerified: true,
      testDataVerified: true,
      issues: [],
    });

    const stale = deriveFailureRunEvidenceVerification({
      feedbackSources: [{
        path: 'output/recipes/sample-feedback.json',
        document: {
          runId: 'run-2',
          entries: [{ recipeId: 'recipe-1', caseId: 'case-1', status: 'failed' }],
        },
      }],
      evidenceSources: [{
        path: 'output/recipes/sample-evidence.json',
        document: { runId: 'run-1', entries: [] },
      }],
    });
    expect(stale.environmentVerified).toBe(false);
    expect(stale.testDataVerified).toBe(false);
    expect(stale.issues).toContain('RUN_ID_MISMATCH:output/recipes/sample-feedback.json');
  });

  test('测试超时存在长耗时 locator 步骤时应按定位器漂移而不是平台瞬态分类', async () => {
    const result = analyzeProductCenterFailures({
      generatedAt: '2026-07-27T00:00:00.000Z',
      feedbackSources: [{
        path: 'output/recipes/feedback.json',
        document: { entries: [{
          recipeId: 'recipe-menu',
          caseId: 'delete:menu',
          title: '菜单删除',
          status: 'timedOut',
          diagnostic: 'Test timeout of 240000ms exceeded.',
        }] },
      }],
      evidenceSources: [],
      timingSources: [{
        path: 'output/performance/timing.json',
        document: { cases: [{
          title: '菜单删除',
          status: 'timedOut',
          diagnostic: 'Test timeout of 240000ms exceeded.',
          steps: [{
            title: "Click locator('.ant-menu-submenu-title:visible').nth(1)",
            durationMs: 232_634,
            children: [],
          }],
        }] } as never,
      }],
      cleanup: { status: 'verified-clean', evidenceRefs: ['output/checkpoints'] },
      environmentVerified: false,
      testDataVerified: false,
      pageContract: { status: 'clean' },
    });

    expect(result.entries[0].category).toBe('locator-drift');
    expect(result.entries[0].retryable).toBe(false);
    expect(result.entries[0].productFailure).toBe(false);
  });

  test('诊断必须脱敏并以不可逆指纹进入分析产物', async () => {
    const secretDiagnostic = 'authorization=Bearer-secret token=secret-token user@example.com';
    const sanitized = sanitizeFailureDiagnostic(secretDiagnostic);
    expect(sanitized).not.toContain('Bearer-secret');
    expect(sanitized).not.toContain('secret-token');
    expect(sanitized).not.toContain('user@example.com');

    const result = analyzeProductCenterFailures({
      generatedAt: '2026-07-27T00:00:00.000Z',
      feedbackSources: [{
        path: 'output/recipes/feedback.json',
        document: {
          entries: [{
            recipeId: 'recipe-1',
            caseId: 'case-1',
            title: '失败用例',
            status: 'failed',
            diagnostic: secretDiagnostic,
          }],
        },
      }],
      evidenceSources: [],
      cleanup: { status: 'not-applicable', evidenceRefs: [] },
      environmentVerified: false,
      testDataVerified: false,
      pageContract: { status: 'unknown' },
    });
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain('Bearer-secret');
    expect(serialized).not.toContain('secret-token');
    expect(serialized).not.toContain('user@example.com');
    expect(result.entries[0].diagnosticFingerprint).toMatch(/^[a-f0-9]{64}$/);
    expect(result.entries[0]).not.toHaveProperty('diagnostic');
  });

  test('构建入口、pipeline 阶段和技术就绪门禁必须接入失败分析', async () => {
    const packageJson = JSON.parse(fs.readFileSync(path.join(projectRoot, 'package.json'), 'utf8')) as {
      scripts: Record<string, string>;
    };
    const pipelineSource = fs.readFileSync(
      path.join(projectRoot, 'scripts/run-product-center-quality-pipeline.ts'),
      'utf8',
    );
    const readinessSource = fs.readFileSync(
      path.join(projectRoot, 'utils/product-center-quality-pipeline.ts'),
      'utf8',
    );

    expect(packageJson.scripts['build:product-center:failure-analysis'])
      .toContain('build-product-center-failure-analysis.ts');
    expect(packageJson.scripts['test:product-center:contract'])
      .toContain('run-product-center-contract-tests.ts');
    expect(fs.readFileSync(path.join(
      projectRoot,
      'contracts/product-center/test-manifests/product-center-contract-tests.json',
    ), 'utf8')).toContain('product-center-failure-analysis.contract.spec.ts');
    expect(pipelineSource).toContain("'failure-analysis'");
    expect(pipelineSource).toContain('summarizeFailureAnalysisForPipeline');
    expect(readinessSource).toContain("'failure-analysis'");
  });

  test('pipeline 应采用统一分析分类且 UI 瞬态仍需状态核验后恢复', async () => {
    expect(summarizeFailureAnalysisForPipeline({
      summary: { failedCases: 1, unresolvedFailures: 0, productFailures: 0 },
      entries: [{ category: 'locator-drift', retryable: false }],
    })).toEqual({
      category: 'locator-drift',
      retryable: false,
      diagnostic: 'failure-analysis:categories=locator-drift;failed=1;unresolved=0;product=0',
    });
    expect(summarizeFailureAnalysisForPipeline({
      summary: { failedCases: 1, unresolvedFailures: 0, productFailures: 0 },
      entries: [{ category: 'execution-platform-transient', retryable: true }],
    })?.retryable).toBe(true);

    const pipelineSource = fs.readFileSync(
      path.join(projectRoot, 'scripts/run-product-center-quality-pipeline.ts'),
      'utf8',
    );
    expect(pipelineSource.match(/'state-verification-required'/g)).toHaveLength(6);
  });
});
