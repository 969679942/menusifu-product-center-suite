import { expect, test } from '@playwright/test';
import {
  assessProductCenterSourceRecovery,
  buildProductCenterRecoveredRule,
  type ProductCenterSourceRecoveryBinding,
} from '../../adapters/product-center/product-center-source-recovery-adapter';

const hash = (value: string) => value.repeat(64);
const binding: ProductCenterSourceRecoveryBinding = {
  caseId: 'TC-GRP-PKG-036',
  title: '新增套餐组页展示三种类型及说明',
  bindingFingerprint: `sha256:${hash('a')}`,
  handlerId: 'combo-v2-form-contract',
  preconditions: ['进入新增套餐组页。'],
  steps: ['依次切换三种套餐类型。'],
  expectedResults: ['展示三种类型且字段随类型切换。'],
  assertionIds: ['assertion:group:expected:TC-GRP-PKG-036:1'],
  requiredEvidence: ['navigation', 'ui-assertion', 'cleanup'],
};

test.describe('商品中心旧用例来源恢复适配合同', () => {
  test('完整当前收据生成显式标注的恢复规则', () => {
    const assessment = assessProductCenterSourceRecovery({
      sourcePath: '用例库/商品中心-商品管理-组.md', binding,
      currentImplementationFingerprint: hash('b'), runtimeStatus: 'passed',
      runtimeEvidence: {
        receiptVersion: '3.1.0', caseId: binding.caseId,
        caseFingerprint: binding.bindingFingerprint, implementationFingerprint: hash('b'),
        executionContext: {
          applicationVersionFingerprint: hash('c'), environmentId: 'qa', tenantScope: 'brand-1',
          locale: 'zh-CN', roleId: 'merchant-operator', route: '/pp/brand/combo',
        },
        claims: { required: binding.assertionIds, observed: binding.assertionIds, verified: binding.assertionIds },
        operationReceipts: [{ operationKey: 'combo.form.read', method: 'GET', observed: true, status: 'passed' }],
        complete: true, missingEvidence: [], missingAssertions: [], unexpectedAssertions: [],
        cleanup: { apiZeroResidue: true, uiZeroResidue: true },
      },
    });
    const rule = buildProductCenterRecoveredRule({
      sourcePath: '用例库/商品中心-商品管理-组.md', binding, assessment,
      evidence: { path: 'output/current.json', sha256: hash('d'), startedAt: '2026-09-04T00:00:00.000Z', applicationVersionFingerprint: hash('c') },
    });
    expect(assessment).toMatchObject({ disposition: 'reconstructed-current-baseline', humanRequired: false });
    expect(rule).toMatchObject({
      ruleId: 'BR-RECOVERED-TC-GRP-PKG-036', authority: 'reconstructed-current-baseline',
      originalRequirementRecovered: false,
      semantics: { outcomes: ['展示三种类型且字段随类型切换。'] },
    });
  });

  test('旧收据只获得自动恢复性重验资格，不能生成规则', () => {
    const assessment = assessProductCenterSourceRecovery({
      sourcePath: '用例库/商品中心-商品管理-组.md', binding,
      currentImplementationFingerprint: hash('b'), runtimeStatus: 'passed',
      runtimeEvidence: {
        receiptVersion: '2.0.0', caseFingerprint: binding.bindingFingerprint,
        complete: true, missingEvidence: [], missingAssertions: [], unexpectedAssertions: [],
        requiredAssertionIds: binding.assertionIds, observedAssertionIds: binding.assertionIds,
        operationReceipts: [], cleanup: { apiZeroResidue: true, uiZeroResidue: true },
      },
    });
    expect(assessment).toMatchObject({
      disposition: 'source-recovery-pending', executionAllowed: true, promotionAllowed: false, humanRequired: false,
    });
    expect(() => buildProductCenterRecoveredRule({
      sourcePath: '用例库/商品中心-商品管理-组.md', binding, assessment,
      evidence: { path: 'output/legacy.json', sha256: hash('d'), startedAt: '', applicationVersionFingerprint: null },
    })).toThrow('PRODUCT_CENTER_SOURCE_RECOVERY_NOT_PROMOTABLE');
  });
});
