import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import {
  evaluateProductCenterControlledRepairPipeline,
  resolveControlledRepairPipelineOption,
  type ControlledRepairPipelineInput,
} from '../../utils/product-center-controlled-repair-pipeline';
import { buildProductCenterControlledRepairClosure } from '../../utils/product-center-quality-operations';

test.describe('商品中心受控修复流水线分支', () => {
  test('默认应关闭且只允许在 full 模式显式启用', async () => {
    expect(resolveControlledRepairPipelineOption([], 'verify')).toEqual({ enabled: false });
    expect(resolveControlledRepairPipelineOption([], 'full')).toEqual({ enabled: false });
    expect(resolveControlledRepairPipelineOption(['--controlled-repair'], 'full'))
      .toEqual({ enabled: true });
    expect(() => resolveControlledRepairPipelineOption(['--controlled-repair'], 'verify'))
      .toThrow('受控修复分支只允许在 full 模式启用');
  });

  test('审批、回归和 closure 均匹配时应幂等识别为已关闭', async () => {
    const result = evaluateProductCenterControlledRepairPipeline(fixture());

    expect(result).toMatchObject({
      status: 'already-closed',
      executionAllowed: true,
      runIncrementalRegression: false,
      closeAllowed: false,
      planFingerprint: fingerprint,
      issues: [],
    });
  });

  test('未审批 proposal 必须阻断执行', async () => {
    const input = fixture();
    input.approvalGate.status = 'approval-required';
    input.approvalGate.executionAllowed = false;
    input.approvalGate.approvedProposalIds = [];
    input.approvalGate.pendingProposalIds = [proposalId];
    input.closure = null;
    input.incrementalResult = null;

    const result = evaluateProductCenterControlledRepairPipeline(input);

    expect(result.status).toBe('approval-required');
    expect(result.executionAllowed).toBe(false);
    expect(result.issues.map((issue) => issue.code)).toContain('APPROVAL_REQUIRED');
  });

  test('计划指纹不一致或增量回归失败必须阻断', async () => {
    const mismatched = fixture();
    if (!mismatched.incrementalResult) throw new Error('测试 fixture 缺少增量结果');
    mismatched.incrementalResult.planFingerprint = 'b'.repeat(64);
    expect(evaluateProductCenterControlledRepairPipeline(mismatched).issues.map((item) => item.code))
      .toContain('PLAN_FINGERPRINT_MISMATCH');

    const failed = fixture();
    failed.closure = null;
    if (!failed.incrementalResult) throw new Error('测试 fixture 缺少增量结果');
    failed.incrementalResult.status = 'failed';
    failed.incrementalResult.caseResults[0].status = 'failed';
    expect(evaluateProductCenterControlledRepairPipeline(failed)).toMatchObject({
      status: 'blocked',
      executionAllowed: false,
    });
    expect(evaluateProductCenterControlledRepairPipeline(failed).issues.map((item) => item.code))
      .toContain('INCREMENTAL_REGRESSION_FAILED');
  });

  test('业务规则修改权限或结果出现变化时必须保持硬阻断', async () => {
    const permissionChanged = fixture();
    permissionChanged.repairPlan.guardrails.businessRuleMutationAllowed = true;
    expect(evaluateProductCenterControlledRepairPipeline(permissionChanged).issues.map((item) => item.code))
      .toContain('BUSINESS_RULE_MUTATION_FORBIDDEN');

    const mutated = fixture();
    if (!mutated.closure) throw new Error('测试 fixture 缺少 closure');
    mutated.closure.businessRuleMutation = true;
    mutated.closure.codeChanges = ['contracts/product-center/business-rules.json'];
    const result = evaluateProductCenterControlledRepairPipeline(mutated);
    expect(result.status).toBe('blocked');
    expect(result.issues.map((item) => item.code)).toContain('BUSINESS_RULE_MUTATION_FORBIDDEN');
  });

  test('增量 Recipe 未从侧边栏进入时必须阻断', async () => {
    const input = fixture();
    input.repairPlan.impactedRecipes[0].capabilityIds = ['negative.execute'];

    const result = evaluateProductCenterControlledRepairPipeline(input);

    expect(result.status).toBe('blocked');
    expect(result.issues.map((item) => item.code)).toContain('SIDEBAR_ENTRY_REQUIRED');
  });

  test('页面复核观察到新边界时必须另行提交产品确认', async () => {
    expect(() => buildProductCenterControlledRepairClosure({
      approvalGate: {
        status: 'ready-for-incremental-regression',
        executionAllowed: true,
        relevantProposalIds: [proposalId],
      },
      incrementalPlan: {
        planFingerprint: fingerprint,
        cases: [{ caseId }],
      },
      incrementalResult: {
        status: 'passed',
        planFingerprint: fingerprint,
        caseResults: [{ caseId, status: 'passed' }],
      },
      observations: [{
        proposalId,
        caseId,
        expectedMaxLength: 50,
        observedMaxLength: 51,
        acceptedLength: 51,
        rejectedLength: 51,
        locatorCount: 1,
        visible: true,
        enabled: true,
        sidebarEntryVerified: true,
        firstCapabilityId: 'navigation.sidebar.open',
      }],
    })).toThrow(`观察到新边界，必须另行提交产品确认：${proposalId}`);
  });

  test('CLI 和 npm 必须提供显式 repair 与 resume 入口且合同纳入集合', async () => {
    const projectRoot = process.cwd();
    const source = fs.readFileSync(path.join(
      projectRoot,
      'scripts/run-product-center-quality-pipeline.ts',
    ), 'utf8');
    const optionSource = fs.readFileSync(path.join(
      projectRoot,
      'utils/product-center-controlled-repair-pipeline.ts',
    ), 'utf8');
    const packageJson = JSON.parse(fs.readFileSync(path.join(projectRoot, 'package.json'), 'utf8'));

    expect(source).toContain('resolveControlledRepairPipelineOption');
    expect(optionSource).toContain("'--controlled-repair'");
    expect(source).toContain("'controlled-repair-gate'");
    expect(source).toContain("'controlled-repair-incremental-ui'");
    expect(source).toContain("'controlled-repair-closure'");
    expect(packageJson.scripts['pipeline:product-center:full:repair']).toContain('--controlled-repair');
    expect(packageJson.scripts['pipeline:product-center:full:repair:resume']).toContain('--resume');
    expect(packageJson.scripts['test:product-center:contract'])
      .toContain('run-product-center-contract-tests.ts');
    expect(fs.readFileSync(path.join(
      projectRoot,
      'contracts/product-center/test-manifests/product-center-contract-tests.json',
    ), 'utf8')).toContain('product-center-controlled-repair-pipeline.contract.spec.ts');
  });
});

const fingerprint = 'a'.repeat(64);
const proposalId = 'repair:fields:field-a';
const caseId = 'negative:field-a-boundary';

function fixture(): ControlledRepairPipelineInput {
  return {
    repairPlan: {
      guardrails: {
        approvalRequired: true,
        autoApplyAllowed: false,
        businessRuleMutationAllowed: false,
      },
      impactedCases: [caseId],
      impactedRecipes: [{
        caseId,
        capabilityIds: ['navigation.sidebar.open', 'negative.execute'],
      }],
      proposals: [{ id: proposalId }],
    },
    approvalGate: {
      status: 'ready-for-incremental-regression',
      executionAllowed: true,
      guardrails: {
        approvalRequired: true,
        autoApplyAllowed: false,
        businessRuleMutationAllowed: false,
      },
      relevantProposalIds: [proposalId],
      approvedProposalIds: [proposalId],
      rejectedProposalIds: [] as string[],
      deferredProposalIds: [] as string[],
      pendingProposalIds: [] as string[],
      incrementalRegression: {
        planFingerprint: fingerprint,
        caseIds: [caseId],
      },
    },
    incrementalPlan: {
      planFingerprint: fingerprint,
      cases: [{ caseId }],
    },
    incrementalResult: {
      status: 'passed',
      planFingerprint: fingerprint,
      caseResults: [{ caseId, status: 'passed' }],
    },
    closure: {
      status: 'completed-no-code-change',
      planFingerprint: fingerprint,
      closedProposalIds: [proposalId],
      codeChanges: [] as string[],
      businessRuleMutation: false,
    },
  };
}
