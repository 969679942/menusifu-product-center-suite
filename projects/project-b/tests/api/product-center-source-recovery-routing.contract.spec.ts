import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { buildProductCenterSourceGovernedExecutionPlan } from '../../scripts/build-product-center-source-governed-execution-plan';

const expectedCaseIds = [
  'TC-GRP-MTH-018',
  'TC-GRP-PKG-002',
  'TC-GRP-PKG-008',
  'TC-GRP-PKG-036',
  'TC-GRP-SPEC-028',
  'TC-GRP-TASTE-019',
].sort();

test.describe('商品中心来源恢复执行路由合同', () => {
  test('仅适配器声明的六条来源缺失用例获得受控恢复性重验资格', () => {
    const projectRoot = path.resolve(__dirname, '../..');
    const { report } = buildProductCenterSourceGovernedExecutionPlan({ projectRoot, write: false });
    const recoveryTasks = report.tasks.filter((item) => item.action === 'source-recovery');
    const recoveryReport = JSON.parse(fs.readFileSync(path.join(
      projectRoot, 'contracts/product-center/reviews/product-center-source-auto-resolution.json',
    ), 'utf8')) as {
      cases: Array<{ caseId: string; sourceRecovery?: { disposition?: string } | null }>;
    };
    const recoveredIds = recoveryReport.cases
      .filter((item) => expectedCaseIds.includes(item.caseId)
        && item.sourceRecovery?.disposition === 'reconstructed-current-baseline')
      .map((item) => item.caseId);
    const candidateTasks = report.tasks.filter((item) => expectedCaseIds.includes(item.caseId));
    expect(candidateTasks.map((item) => item.caseId).sort()).toEqual(expectedCaseIds);
    expect(candidateTasks.filter((item) => !recoveredIds.includes(item.caseId)).every((item) => (
      item.action === 'source-recovery' || item.action === 'execute'
    ))).toBe(true);
    const recoveredTasks = report.tasks.filter((item) => recoveredIds.includes(item.caseId));
    expect(recoveredTasks.every((item) => (
      item.action === 'handled'
      && item.sourceStatus === 'verified'
      && item.blockCode === 'SOURCE_RECOVERY_COMPLETED'
    ))).toBe(true);
    expect(recoveryTasks.every((item) => (
      item.sourceStatus === 'blocked'
      && item.runnerId === 'group'
      && item.blockCode === 'SOURCE_RECOVERY_PENDING'
    ))).toBe(true);
    expect(report.summary.sourceRecovery).toBe(recoveryTasks.length);
    expect(report.revalidation.runners.find((item) => item.runnerId === 'group')?.sourceRecoveryCaseIds)
      .toEqual(recoveryTasks.map((item) => item.caseId));
  });

  test('组入口只能在计划传入恢复名单时绕过来源阻断', () => {
    const generatedSpec = fs.readFileSync(path.resolve(
      __dirname, '../../tests/generated/product-center-group.generated.spec.ts',
    ), 'utf8');
    expect(generatedSpec).toContain('PC_GROUP_SOURCE_RECOVERY_CASE_IDS');
    expect(generatedSpec).toContain("binding?.blockClassification !== 'source-evidence-blocked'");
    expect(generatedSpec).toContain("'recovery-validation-only'");
    expect(generatedSpec).toContain('来源恢复执行名单未通过适配器门禁');
    expect(generatedSpec).toContain('allowSourceRecovery: sourceRecoveryCaseIds.has(binding.caseId)');
    const runner = fs.readFileSync(path.resolve(__dirname, '../../utils/product-center-group-runner.ts'), 'utf8');
    expect(runner).toContain('PC_GROUP_SOURCE_RECOVERY_CASE_IDS');
    expect(runner).toContain("binding.blockClassification === 'source-evidence-blocked'");
  });

  test('后置证据评估默认拒绝来源阻断项，仅显式恢复模式允许进入完整性判定', () => {
    const evaluator = fs.readFileSync(path.resolve(
      __dirname, '../../utils/product-center-group-automation.ts',
    ), 'utf8');
    expect(evaluator).toContain('allowSourceRecovery?: boolean');
    expect(evaluator).toContain('options.allowSourceRecovery === true');
    expect(evaluator).toContain('!findingReplayAllowed && !sourceRecoveryAllowed');
  });
});
