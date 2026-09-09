import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import {
  buildProductCenterGroupReportContractFingerprint,
  buildProductCenterGroupReportReceiptContract,
  buildProductCenterGroupReportReceiptContracts,
} from '../../flows/product-center/group/group-report-receipt.adapter';
import type { GroupAutomationBinding } from '../../utils/product-center-group-automation';

const projectRoot = path.resolve(__dirname, '../..');
const bindings = (JSON.parse(fs.readFileSync(
  path.join(projectRoot, 'contracts/product-center/group/product-center-group-bindings.json'),
  'utf8',
)) as { cases: GroupAutomationBinding[] }).cases;

test.describe('商品中心组报告收据适配合同', () => {
  test('全部可执行用例必须逐条提供当前身份和真实依赖分组输入', () => {
    const eligibleBindings = bindings.filter((binding) => binding.generationAllowed);
    const contracts = buildProductCenterGroupReportReceiptContracts(bindings);

    expect(eligibleBindings.length).toBeGreaterThan(0);
    expect(contracts).toHaveLength(eligibleBindings.length);
    expect(new Set(contracts.map((contract) => contract.caseId)).size).toBe(eligibleBindings.length);
    expect(new Set(contracts.map((contract) => contract.groupKey)).size).toBeGreaterThan(0);

    for (const binding of eligibleBindings) {
      const contract = contracts.find((candidate) => candidate.caseId === binding.caseId);
      expect(contract, binding.caseId).toBeDefined();
      expect(contract).toMatchObject({
        caseId: binding.caseId,
        traceabilityId: binding.traceabilityId,
        bindingFingerprint: binding.bindingFingerprint,
        groupKeyInput: {
          businessDomainId: 'merchant-center-product-center-group',
          module: binding.module,
          route: binding.route,
          executionProfile: binding.executionProfile,
          handlerId: binding.handlerId,
          factoryId: binding.factoryId,
          cleanupId: binding.cleanupId,
        },
      });
      expect(contract?.groupKey).toMatch(/^merchant-center:product-center:group:[a-f0-9]{20}$/);
      expect(contract?.groupKeyInput.capabilityIds).toEqual([...new Set(binding.capabilityIds)].sort());
      expect(contract?.groupKeyInput.requiredEvidence).toEqual([...new Set(binding.requiredEvidence)].sort());
    }
  });

  test('已确认产品偏差只在项目优化适配中保留并要求当前收据', () => {
    const productFinding = bindings.find((binding) => binding.blockClassification === 'observed-product-drift');
    expect(productFinding).toBeDefined();
    expect(() => buildProductCenterGroupReportReceiptContract(productFinding!)).toThrow(/未获得组模块报告收据适配资格/);
    expect(buildProductCenterGroupReportReceiptContract(
      productFinding!,
      { includeObservedProductDrift: true },
    ).caseId).toBe('TC-GRP-PKG-040');
  });

  test('来源恢复用例只在显式恢复模式下生成标准收据合同', () => {
    const current = bindings.find((binding) => binding.caseId === 'TC-GRP-PKG-002');
    expect(current).toBeDefined();
    const recovery = {
      ...current!,
      generationAllowed: false,
      blockClassification: 'source-evidence-blocked' as const,
    };
    expect(() => buildProductCenterGroupReportReceiptContract(recovery))
      .toThrow(/未获得组模块报告收据适配资格/);
    expect(buildProductCenterGroupReportReceiptContract(recovery, { includeSourceRecovery: true }))
      .toMatchObject({ caseId: 'TC-GRP-PKG-002', cleanup: { expectedTerminalState: 'api-and-ui-zero-residue' } });
  });

  test('正式步骤、预期结果和清理声明必须无遗漏映射', () => {
    for (const binding of bindings.filter((candidate) => candidate.generationAllowed)) {
      const contract = buildProductCenterGroupReportReceiptContract(binding);
      expect(contract.operations.map((operation) => operation.businessDescription), binding.caseId)
        .toEqual(binding.steps);
      expect(contract.operations.map((operation) => operation.sourceStepNumber), binding.caseId)
        .toEqual(binding.steps.map((_, index) => index + 1));
      expect(contract.assertions.map((assertion) => assertion.assertionId), binding.caseId)
        .toEqual(binding.assertionIds);
      expect(contract.assertions.map((assertion) => assertion.expectedValue), binding.caseId)
        .toEqual(binding.expectedResults);
      expect(contract.cleanup.required, binding.caseId)
        .toBe(binding.cleanupId !== null || binding.requiredEvidence.includes('cleanup'));
      expect(contract.cleanup.cleanupId, binding.caseId).toBe(binding.cleanupId);
    }
  });

  test('groupKey 只能由已登记依赖生成，不得读取 caseId 或标题', () => {
    const source = bindings.find((binding) => binding.generationAllowed);
    expect(source).toBeDefined();
    const first = buildProductCenterGroupReportReceiptContract(source!);
    const sameDependencies = buildProductCenterGroupReportReceiptContract({
      ...source!,
      caseId: 'TC-GRP-CONTRACT-CHECK',
      title: '仅用于验证分组键不读取标题',
      traceabilityId: 'trace:group:TC-GRP-CONTRACT-CHECK',
      assertionIds: source!.assertionIds.map((_, index) => `assertion:contract-check:${index + 1}`),
    });

    expect(sameDependencies.groupKey).toBe(first.groupKey);
    expect(sameDependencies.groupKeyInput).toEqual(first.groupKeyInput);
  });

  test('适配合同变化必须进入独立报告指纹', () => {
    const contracts = buildProductCenterGroupReportReceiptContracts(bindings);
    const current = buildProductCenterGroupReportContractFingerprint(contracts);
    const changed = buildProductCenterGroupReportContractFingerprint([
      { ...contracts[0], groupKey: `${contracts[0].groupKey}-changed` },
      ...contracts.slice(1),
    ]);

    expect(current).toMatch(/^[a-f0-9]{64}$/);
    expect(changed).not.toBe(current);
  });

  test('断言数量不一致或清理声明缺失时必须静态阻断', () => {
    const source = bindings.find((binding) => binding.generationAllowed && binding.cleanupId !== null);
    expect(source).toBeDefined();
    expect(() => buildProductCenterGroupReportReceiptContract({
      ...source!,
      assertionIds: [],
    })).toThrow(/断言合同数量不一致/);
    expect(() => buildProductCenterGroupReportReceiptContract({
      ...source!,
      cleanupId: null,
    })).toThrow(/要求清理证据但缺少 cleanupId/);
  });

  test('生成入口必须消费适配合同并保留原 runner 边界', () => {
    const source = fs.readFileSync(
      path.join(projectRoot, 'tests/generated/product-center-group.generated.spec.ts'),
      'utf8',
    );
    expect(source).toContain('buildProductCenterGroupReportReceiptContracts');
    expect(source).toContain('buildProductCenterGroupReportContractFingerprint');
    expect(source).toContain('reportContractFingerprint');
    expect(source).toContain('buildProductCenterGroupCaseFingerprintManifest');
    expect(source).toContain('implementationFingerprintByCaseId');
    expect(source).toContain("{ type: 'group-key', description: reportReceiptContract.groupKey }");
    expect(source).toContain('declaredOperations: reportReceiptContract.operations');
    expect(source).toContain('declaredAssertions: reportReceiptContract.assertions');
    expect(source).toContain('declaredCleanup: reportReceiptContract.cleanup');
    expect(source).toContain("from '../../utils/product-center-group-runner'");
  });
});
