import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import {
  buildProductCenterRuleChangeImpact,
  type ProductCenterRuleConfirmation,
} from '../../utils/product-center-rule-change-impact';
import {
  readProductCenterRuleChangeVerificationManifest,
  runProductCenterRuleChangeVerification,
} from '../../scripts/verify-product-center-rule-change';

const projectRoot = path.resolve(__dirname, '../..');

const singleRule: ProductCenterRuleConfirmation = {
  confirmationId: 'product-confirmation:BR-SINGLE',
  ruleId: 'BR-SINGLE',
  ruleGroupId: 'single-rule',
  statement: '单条规则',
  linkedCanonicalIds: ['TC-ITEM-STD-001'],
};

test.describe('商品中心规则校正分级验证合同', () => {
  test('单条无关联且不修改共享实现时应选择 L1 定向验证', async () => {
    const impact = buildProductCenterRuleChangeImpact({
      ruleId: singleRule.ruleId,
      confirmations: [singleRule],
      changedFiles: ['contracts/product-center/reviews/single-rule.json'],
    });

    expect(impact).toMatchObject({
      level: 'L1',
      profileId: 'targeted',
      executionAllowed: true,
      associatedRuleIds: ['BR-SINGLE'],
      associatedCaseIds: ['TC-ITEM-STD-001'],
    });
  });

  test('同一结构化规则组应形成 L2 关联闭包且不得按标题猜测', async () => {
    const source = JSON.parse(fs.readFileSync(path.join(
      projectRoot,
      'contracts/product-center/reviews/product-center-item-rule-confirmations.json',
    ), 'utf8')) as { confirmations: ProductCenterRuleConfirmation[] };
    const impact = buildProductCenterRuleChangeImpact({
      ruleId: 'BR-ITEM-CATEGORY-LEAF-SELECTION',
      confirmations: source.confirmations,
      changedFiles: [
        'contracts/product-center/reviews/product-center-item-rule-confirmations.json',
      ],
    });

    expect(impact).toMatchObject({
      level: 'L2',
      profileId: 'associated',
      executionAllowed: true,
      associatedRuleIds: [
        'BR-ITEM-CATEGORY-DIRECT-PARENT-CREATE',
        'BR-ITEM-CATEGORY-LEAF-SELECTION',
        'BR-ITEM-CATEGORY-OPTIONAL',
      ],
      associatedCaseIds: ['TC-ITEM-STD-006', 'TC-ITEM-STD-007', 'TC-ITEM-STD-037'],
    });
    expect(impact.reasons).toContain('RULE_GROUP_HAS_MULTIPLE_RULES');
  });

  test('修改共享生成器时必须升级为 L3 完整静态合同', async () => {
    const impact = buildProductCenterRuleChangeImpact({
      ruleId: singleRule.ruleId,
      confirmations: [singleRule],
      changedFiles: ['utils/product-center-canonical-item-test-plan.ts'],
    });

    expect(impact).toMatchObject({
      level: 'L3',
      profileId: 'shared-static',
      executionAllowed: true,
    });
    expect(impact.reasons).toContain('SHARED_IMPLEMENTATION_CHANGED');
  });

  test('页面 Probe、定位器或写操作必须升级为 L4 并阻止自动执行', async () => {
    for (const uiIntent of ['probe', 'locator-change', 'create'] as const) {
      const impact = buildProductCenterRuleChangeImpact({
        ruleId: singleRule.ruleId,
        confirmations: [singleRule],
        changedFiles: [],
        uiIntent,
      });

      expect(impact).toMatchObject({
        level: 'L4',
        profileId: 'authorization-required',
        executionAllowed: false,
      });
      expect(impact.reasons).toContain('UI_AUTHORIZATION_REQUIRED');
    }
  });

  test('未知规则和不安全变更路径必须 fail-closed', async () => {
    expect(() => buildProductCenterRuleChangeImpact({
      ruleId: 'BR-UNKNOWN',
      confirmations: [singleRule],
      changedFiles: [],
    })).toThrow('未找到结构化产品确认规则');
    expect(() => buildProductCenterRuleChangeImpact({
      ruleId: singleRule.ruleId,
      confirmations: [singleRule],
      changedFiles: ['../outside.ts'],
    })).toThrow('规则校正变更路径无效');
  });

  test('验证 manifest 必须只包含静态/API 命令且 L4 无执行命令', async () => {
    const manifest = readProductCenterRuleChangeVerificationManifest(projectRoot);
    const serialized = JSON.stringify(manifest).toLowerCase();

    expect(manifest.profiles.map((item) => item.id)).toEqual([
      'targeted',
      'associated',
      'shared-static',
      'authorization-required',
    ]);
    expect(manifest.profiles.find((item) => item.id === 'authorization-required')?.commands)
      .toEqual([]);
    expect(serialized).not.toContain('--project=chrome');
    expect(serialized).not.toContain('gold');
    expect(serialized).not.toContain('main-recipes');
    expect(serialized).not.toContain('pipeline:product-center:full');
  });

  test('plan-only 回放 STD-007 应生成 L2 报告且不调用命令执行器', async () => {
    const outputRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'rule-change-verification-'));
    let executions = 0;
    try {
      const result = runProductCenterRuleChangeVerification({
        projectRoot,
        outputRoot,
        ruleId: 'BR-ITEM-CATEGORY-LEAF-SELECTION',
        changedFiles: [
          'contracts/product-center/reviews/product-center-item-rule-confirmations.json',
        ],
        planOnly: true,
        execute: () => {
          executions += 1;
          return 0;
        },
      });
      const report = JSON.parse(fs.readFileSync(result.reportPath, 'utf8'));

      expect(executions).toBe(0);
      expect(result.exitCode).toBe(0);
      expect(report).toMatchObject({
        status: 'planned',
        impact: {
          level: 'L2',
          associatedCaseIds: ['TC-ITEM-STD-006', 'TC-ITEM-STD-007', 'TC-ITEM-STD-037'],
        },
        safety: { uiExecutionAllowed: false, uiCommands: 0 },
      });
      expect(report.commands.length).toBeGreaterThan(0);
    } finally {
      fs.rmSync(outputRoot, { recursive: true, force: true });
    }
  });
});
