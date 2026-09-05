import path from 'node:path';
import { expect, test } from '@playwright/test';
import {
  executeSystemTestRecipe,
  type SystemTestRecipeContext,
  type SystemTestReportPhase,
} from '../../src/automation/system-test/system-test-recipe-executor';
import {
  issueSystemTestExecutionGrant,
  revokeSystemTestExecutionGrant,
} from '../../src/automation/system-test/system-test-execution-grant';
import {
  createBusinessOperationReceiptDetail,
  formatBusinessExecutionConclusionTitle,
  formatContinuousBusinessStepTitle,
  isBusinessOperationStepTitle,
  renderBusinessStepDetails,
} from '../../src/reporters/allure-report-integrity';
import type { AutomationRecipe } from '../../src/automation/recipe/automation-recipe';

const grantEnvKeys = [
  'SYSTEM_TEST_EXECUTION_GRANT_PATH',
  'SYSTEM_TEST_EXECUTION_GRANT_TOKEN',
  'SYSTEM_TEST_EXECUTION_APPLICATION_ID',
  'SYSTEM_TEST_EXECUTION_RUN_ID',
  'SYSTEM_TEST_EXECUTION_CANDIDATE_FINGERPRINT',
] as const;

test.describe('通用系统测试 Recipe 业务步骤报告', () => {
  test('执行器必须按统一生命周期暴露可插拔业务步骤钩子', async () => {
    const rootDir = path.resolve(__dirname, '../..');
    const recipe: AutomationRecipe = {
      schemaVersion: '1.0.0',
      id: 'reporting-contract:CASE-001',
      caseId: 'CASE-001',
      title: '报告步骤合同用例',
      tags: ['@system-test'],
      route: '/reporting',
      action: 'read',
      traceabilityId: 'trace:sop:reporting-contract',
      sourceIds: ['contract'],
      coverageIds: ['contract'],
      generationAllowed: true,
      seed: { adapterId: 'seed.contract' },
      contextGuards: [
        { adapterId: 'context.contract', input: { phase: 'before-action' } },
        { adapterId: 'context.contract', input: { phase: 'before-assertion' } },
      ],
      capabilities: [{ id: 'capability.contract' }],
      assertions: [{ adapterId: 'assertion.contract', claimIds: ['claim-1'] }],
      cleanup: { adapterId: 'cleanup.contract' },
    };
    const phases: SystemTestReportPhase[] = [];
    const previous = Object.fromEntries(grantEnvKeys.map((key) => [key, process.env[key]]));
    const grant = issueSystemTestExecutionGrant({
      rootDir,
      applicationId: 'reporting-contract',
      runId: 'reporting-contract-run',
      caseIds: [recipe.caseId],
      ttlMs: 60_000,
      candidateFingerprint: 'a'.repeat(64),
    });
    Object.assign(process.env, grant.env);
    try {
      const result = await executeSystemTestRecipe<SystemTestRecipeContext>(recipe, {
        initialize: async () => ({ recipe, results: {}, assertionReceipts: [] }),
        seed: async (_call, context) => context,
        verifyContext: async () => undefined,
        executeCapability: async () => ({ observed: true }),
        assert: async (_call, context) => {
          context.assertionReceipts.push({claimId:'claim-1',assertionAdapterId:'assertion.contract',status:'verified',
            expectedValue:'visible',actualValue:'visible',actualStatus:'observed',observationChannel:'ui',authority:'user-visible',comparison:'matched'});
        },
        cleanup: async () => ({ apiIdentityCounts: {}, uiIdentityCounts: {} }),
        reportStep: async (step, action) => {
          phases.push(step.phase);
          return action();
        },
      });
      expect(phases).toEqual([
        'initialize',
        'seed',
        'context-guard',
        'capability',
        'context-guard',
        'assertion',
        'cleanup',
      ]);
      expect(result.stepReceipts).toHaveLength(7);
      expect(result.stepReceipts?.every((receipt) => receipt.status === 'passed' && receipt.startedAt && receipt.finishedAt)).toBe(true);
      expect(result.results['capability.contract']).toEqual({ observed: true });
      expect(result.assertionReceipts).toHaveLength(1);
      expect(result.assertionReceipts[0]).toMatchObject({expectedValue:'visible',actualValue:'visible',actualStatus:'observed',comparison:'matched'});
    } finally {
      for (const key of grantEnvKeys) {
        const value = previous[key];
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
      revokeSystemTestExecutionGrant(grant);
    }
  });

  test('断言成功收据不得依赖可选报告器', async () => {
    const rootDir = path.resolve(__dirname, '../..');
    const recipe: AutomationRecipe = {
      schemaVersion: '1.0.0',
      id: 'reporting-contract:CASE-002',
      caseId: 'CASE-002',
      title: '无报告器断言收据合同用例',
      tags: ['@system-test'],
      route: '/reporting',
      action: 'read',
      traceabilityId: 'trace:sop:reporting-contract',
      sourceIds: ['contract'],
      coverageIds: ['contract'],
      generationAllowed: true,
      capabilities: [{ id: 'capability.contract' }],
      assertions: [{ adapterId: 'assertion.contract', claimIds: ['CASE-002:expectation-1'] }],
    };
    const grant = issueSystemTestExecutionGrant({
      rootDir,
      applicationId: 'reporting-contract',
      runId: 'reporting-contract-no-reporter-run',
      caseIds: [recipe.caseId],
      ttlMs: 60_000,
      candidateFingerprint: 'b'.repeat(64),
    });
    const previous = Object.fromEntries(grantEnvKeys.map((key) => [key, process.env[key]]));
    Object.assign(process.env, grant.env);
    try {
      const result = await executeSystemTestRecipe<SystemTestRecipeContext>(recipe, {
        initialize: async () => ({ recipe, results: {}, assertionReceipts: [] }),
        seed: async (_call, context) => context,
        verifyContext: async () => undefined,
        executeCapability: async () => ({ observed: true }),
        assert: async () => undefined,
        cleanup: async () => undefined,
      });
      expect(result.assertionReceipts).toEqual([{
        claimId: 'CASE-002:expectation-1', assertionAdapterId: 'assertion.contract', status: 'verified',
      }]);
    } finally {
      for (const key of grantEnvKeys) {
        const value = previous[key];
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
      revokeSystemTestExecutionGrant(grant);
    }
  });

  test('公共报告层必须把期望实际详情渲染为业务子步骤', async () => {
    const titles: string[] = [];
    await renderBusinessStepDetails({
      details: [{ title: '校验：期望保存成功｜实际 HTTP 200｜结果：通过' }],
      runStep: async (title, action) => {
        titles.push(title);
        return action({ attach: async () => undefined });
      },
    });
    expect(titles).toEqual(['校验：期望保存成功｜实际 HTTP 200｜结果：通过']);
  });

  test('公共报告层必须提供系统无关的连续步骤流和执行结论标题', async () => {
    expect(formatContinuousBusinessStepTitle('environment', '进入目标页面')).toBe('[环境] 进入目标页面');
    expect(formatContinuousBusinessStepTitle('business-operation', '保存业务对象')).toBe('[业务操作] 保存业务对象');
    expect(formatContinuousBusinessStepTitle('assertion', '核对保存结果')).toBe('[断言] 核对保存结果');
    expect(isBusinessOperationStepTitle('[业务操作] 保存业务对象')).toBe(true);
    expect(isBusinessOperationStepTitle('Given - 保存业务对象')).toBe(false);
    expect(formatBusinessExecutionConclusionTitle('passed', 'CASE-001')).toBe('执行结论：通过｜CASE-001');
  });

  test('公共报告层必须折叠技术收据并只在主步骤展示业务作用', async () => {
    const detail = createBusinessOperationReceiptDetail({
      purpose: '保存业务对象排序',
      triggerSource: '点击排序窗口“确定”',
      result: '成功',
      technicalDetails: {
        接口作用: '保存业务对象排序',
        请求方法: 'PUT',
        接口路径: '/objects/sort',
        响应状态: 'HTTP 200',
      },
    });

    expect(detail.title).toBe('保存业务对象排序｜触发方式：点击排序窗口“确定”｜结果：成功');
    expect(detail.title).not.toContain('/objects/sort');
    expect(detail.title).not.toContain('PUT');
    expect(detail.attachments).toHaveLength(1);
    expect(detail.attachments?.[0]?.name).toBe('接口执行明细（点击查看）');
    expect(JSON.parse(detail.attachments?.[0]?.body?.toString() ?? '{}')).toEqual({
      接口作用: '保存业务对象排序',
      请求方法: 'PUT',
      接口路径: '/objects/sort',
      响应状态: 'HTTP 200',
    });
  });
});
