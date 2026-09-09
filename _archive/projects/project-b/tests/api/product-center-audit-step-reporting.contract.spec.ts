import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { classifyMerchantCenterAuditStep } from '../../adapters/test-automation-platform/audit-step-reporting';
import {
  MERCHANT_CENTER_CASE_ID_ANNOTATION_TYPES,
  configureMerchantCenterAuditStepEnvironment,
} from '../../adapters/test-automation-platform/audit-step-reporting';

test('商品中心只负责业务措辞分类并接入公共实时步骤审计器', {
  annotation: [{ type: 'canonical-case-id', description: 'TC-AUDIT-STEP-CONTRACT-001' }],
}, async () => {
  expect(classifyMerchantCenterAuditStep({ title: '[业务操作] 保存商品', category: 'test.step' })).toBe('business-operation');
  expect(classifyMerchantCenterAuditStep({ title: '[断言] 验证商品状态', category: 'test.step' })).toBe('assertion');
  expect(classifyMerchantCenterAuditStep({ title: '[清理] 验证 API/UI 零残留', category: 'test.step' })).toBe('cleanup');
  expect(classifyMerchantCenterAuditStep({ title: '[前置校验] 确认租户和路由', category: 'test.step' })).toBe('context-guard');
  expect(classifyMerchantCenterAuditStep({ title: '等待页面加载完成', category: 'test.step' })).toBe('technical');
  expect(MERCHANT_CENTER_CASE_ID_ANNOTATION_TYPES).toEqual(expect.arrayContaining([
    'system-test-case-id', 'canonical-case-id', 'group-case-id', 'recipe-case-id',
  ]));
  const previousTypes = process.env.SYSTEM_TEST_CASE_ID_ANNOTATION_TYPES;
  delete process.env.SYSTEM_TEST_CASE_ID_ANNOTATION_TYPES;
  configureMerchantCenterAuditStepEnvironment();
  expect(process.env.SYSTEM_TEST_CASE_ID_ANNOTATION_TYPES).toContain('canonical-case-id');
  if (previousTypes === undefined) delete process.env.SYSTEM_TEST_CASE_ID_ANNOTATION_TYPES;
  else process.env.SYSTEM_TEST_CASE_ID_ANNOTATION_TYPES = previousTypes;

  const root = path.resolve(__dirname, '../..');
  const bridge = fs.readFileSync(path.join(root, 'reporters/system-test-audit-step.reporter.ts'), 'utf8');
  expect(bridge).toContain('Test Automation Platform/src/reporters/playwright-audit-step.reporter');
  expect(bridge).toContain("includeCategories: ['test.step']");
  expect(bridge).toContain('MERCHANT_CENTER_CASE_ID_ANNOTATION_TYPES');
  for (const configPath of [
    'playwright.config.ts',
    'systems/merchant-center-product-center-seasoning/playwright.config.ts',
    'systems/merchant-center-store-operations-tax/playwright.config.ts',
  ]) {
    expect(fs.readFileSync(path.join(root, configPath), 'utf8')).toContain('system-test-audit-step.reporter');
  }
  await test.step('[业务操作] 执行系统无关的商品中心适配器合成步骤', async () => {});
});
