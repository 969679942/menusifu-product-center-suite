import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import {
  LEGACY_REMAINING_OWNED_CASE_IDS,
  LEGACY_REMAINING_SPEC_PATH,
  resolveLegacyRemainingSelection,
} from '../../contracts/product-center/test-cases/canonical/product-center-legacy-remaining-ownership';

const projectRoot = path.resolve(__dirname, '../..');
const seasoningCaseIds = ['TC-FLV-SEA-015', 'TC-FLV-SEA-016', 'TC-FLV-SEA-046'];

test.describe('商品中心历史剩余用例唯一归属门禁', () => {
  test('旧入口必须只归属四条图片和十五条标签用例', () => {
    const imageCaseIds = LEGACY_REMAINING_OWNED_CASE_IDS.filter((caseId) => caseId.startsWith('TC-IMG-'));
    const tagCaseIds = LEGACY_REMAINING_OWNED_CASE_IDS.filter((caseId) => caseId.startsWith('TC-TAG-'));

    expect(LEGACY_REMAINING_OWNED_CASE_IDS).toHaveLength(19);
    expect(new Set(LEGACY_REMAINING_OWNED_CASE_IDS).size).toBe(19);
    expect(imageCaseIds).toHaveLength(4);
    expect(tagCaseIds).toHaveLength(15);
    expect(LEGACY_REMAINING_OWNED_CASE_IDS).not.toEqual(expect.arrayContaining(seasoningCaseIds));
  });

  test('旧入口必须拒绝调味用例和未声明用例的执行选择', () => {
    expect([...resolveLegacyRemainingSelection(undefined)])
      .toEqual(LEGACY_REMAINING_OWNED_CASE_IDS);
    expect([...resolveLegacyRemainingSelection('TC-IMG-LIB-025,TC-TAG-BDG-020')])
      .toEqual(['TC-IMG-LIB-025', 'TC-TAG-BDG-020']);
    expect(() => resolveLegacyRemainingSelection('TC-FLV-SEA-015'))
      .toThrow('PC_REMAINING_CASE_IDS 包含非本入口归属用例：TC-FLV-SEA-015');
    expect(() => resolveLegacyRemainingSelection('TC-IMG-LIB-025,TC-IMG-LIB-025'))
      .toThrow('PC_REMAINING_CASE_IDS 存在重复 caseId：TC-IMG-LIB-025');
  });

  test('三条调味用例必须仅由 seasoning system-test 入口持有', () => {
    const additionalBindings = JSON.parse(fs.readFileSync(path.join(
      projectRoot,
      'contracts/product-center/test-plan-additional-automation-bindings.json',
    ), 'utf8')) as {
      bindings: Array<{ caseId: string; handlerId: string; scriptPath: string; runnerId: string; runtimeReadiness: string }>;
    };
    const seasoningRegistry = JSON.parse(fs.readFileSync(path.join(
      projectRoot,
      'systems/merchant-center-product-center-seasoning/binding-registry.json',
    ), 'utf8')) as { bindings: Array<{ caseId: string; generationAllowed: boolean }> };
    const remainingSpec = fs.readFileSync(path.join(projectRoot, LEGACY_REMAINING_SPEC_PATH), 'utf8');

    for (const caseId of seasoningCaseIds) {
      expect(additionalBindings.bindings.find((binding) => binding.caseId === caseId)).toMatchObject({
        handlerId: `merchant-center-product-center-seasoning:${caseId}`,
        scriptPath: 'Merchant Center UITest/systems/merchant-center-product-center-seasoning/tests/system.spec.ts',
        runnerId: 'system-test',
        runtimeReadiness: 'ready',
      });
      expect(seasoningRegistry.bindings.find((binding) => binding.caseId === caseId))
        .toMatchObject({ generationAllowed: true });
      expect(remainingSpec).not.toContain(caseId);
    }
    expect(remainingSpec).not.toContain('SeasoningBoundaryPage');
  });

  test('每条图片和标签绑定都必须在唯一 owning spec 中保留注册定义', () => {
    const remainingSpec = fs.readFileSync(path.join(projectRoot, LEGACY_REMAINING_SPEC_PATH), 'utf8');
    for (const caseId of LEGACY_REMAINING_OWNED_CASE_IDS) {
      expect(remainingSpec).toContain(caseId);
    }
  });
});
