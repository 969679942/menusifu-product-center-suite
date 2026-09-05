import { expect, test } from '@playwright/test';
import {
  assessSystemTestSourceRecovery,
  type SystemTestSourceRecoveryInput,
} from '../../src/automation/system-test/system-test-source-recovery';

const fingerprint = (character: string) => character.repeat(64);

function validInput(): SystemTestSourceRecoveryInput {
  return {
    source: {
      kind: 'existing-test-case',
      path: 'test-cases/inventory.md#TC-INVENTORY-001',
      caseDefinitionComplete: true,
    },
    currentIdentity: {
      caseFingerprint: fingerprint('a'),
      implementationFingerprint: fingerprint('b'),
    },
    runtimeReceipt: {
      receiptVersion: '3.1.0',
      status: 'passed',
      caseFingerprint: fingerprint('a'),
      implementationFingerprint: fingerprint('b'),
      executionContext: {
        applicationVersionFingerprint: fingerprint('c'),
        environmentId: 'qa', tenantScope: 'tenant-1', locale: 'zh-CN',
        roleId: 'inventory-admin', route: '/inventory',
      },
      requiredClaimIds: ['assertion:inventory:001'],
      observedClaimIds: ['assertion:inventory:001'],
      verifiedClaimIds: ['assertion:inventory:001'],
      declaredOperationCount: 1,
      operationReceipts: [{
        operationKey: 'inventory.item.read', method: 'GET', observed: true, status: 'passed',
      }],
      evidenceComplete: true,
      cleanupRequired: true,
      cleanup: { apiZeroResidue: true, uiZeroResidue: true },
    },
  };
}

test.describe('系统无关的旧用例来源恢复合同', () => {
  test('旧用例与当前标准收据完全匹配时只晋级为恢复基线', () => {
    expect(assessSystemTestSourceRecovery(validInput())).toEqual({
      disposition: 'reconstructed-current-baseline',
      executionAllowed: false,
      promotionAllowed: true,
      humanRequired: false,
      sourceAuthority: 'reconstructed-current-baseline',
      reasonCodes: [],
    });
  });

  test('旧收据、缺操作收据或指纹漂移只能触发自动定向重验', () => {
    const input = validInput();
    input.runtimeReceipt = {
      ...input.runtimeReceipt!,
      receiptVersion: '2.0.0',
      caseFingerprint: fingerprint('d'),
      operationReceipts: [],
    };
    const result = assessSystemTestSourceRecovery(input);
    expect(result).toMatchObject({
      disposition: 'source-recovery-pending', executionAllowed: true,
      promotionAllowed: false, humanRequired: false,
    });
    expect(result.reasonCodes).toEqual(expect.arrayContaining([
      'RUNTIME_RECEIPT_VERSION_UNSUPPORTED',
      'RUNTIME_CASE_FINGERPRINT_MISMATCH',
      'RUNTIME_OPERATION_RECEIPTS_INCOMPLETE',
    ]));
  });

  test('报告或平台变更不使完整业务收据失效，业务实现变更仍拒绝复用', () => {
    const reportOnly = validInput();
    reportOnly.currentIdentity = {
      ...reportOnly.currentIdentity,
      implementationFingerprint: fingerprint('d'),
      implementationImpactType: 'platform-only',
    };
    expect(assessSystemTestSourceRecovery(reportOnly)).toMatchObject({
      disposition: 'reconstructed-current-baseline', promotionAllowed: true,
    });
    reportOnly.currentIdentity.implementationImpactType = 'business-implementation';
    expect(assessSystemTestSourceRecovery(reportOnly).reasonCodes)
      .toContain('RUNTIME_IMPLEMENTATION_FINGERPRINT_MISMATCH');
  });

  test('只有业务冲突进入人工，自动化代码和单独现网观察不得恢复来源', () => {
    expect(assessSystemTestSourceRecovery({ ...validInput(), businessRuleConflict: true }))
      .toMatchObject({ disposition: 'business-decision-required', humanRequired: true, executionAllowed: false });
    expect(assessSystemTestSourceRecovery({
      ...validInput(), source: { kind: 'automation-code', path: 'tests/generated.spec.ts', caseDefinitionComplete: true },
    })).toMatchObject({
      disposition: 'invalid-recovery-source', humanRequired: false, promotionAllowed: false,
      reasonCodes: ['AUTOMATION_CODE_CANNOT_AUTHORIZE_BUSINESS_SOURCE'],
    });
    expect(assessSystemTestSourceRecovery({
      ...validInput(), source: { kind: 'runtime-observation-only', path: 'output/audit.json', caseDefinitionComplete: true },
    })).toMatchObject({
      disposition: 'invalid-recovery-source', humanRequired: false, promotionAllowed: false,
      reasonCodes: ['RUNTIME_OBSERVATION_REQUIRES_EXISTING_CASE_SOURCE'],
    });
  });
});
