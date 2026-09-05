import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import {
  evaluateUiArchitectureBaseline,
  inspectUiArchitecture,
  type UiArchitectureBaseline,
  type UiArchitectureConfig,
} from '../../../../Test Automation Platform/src/governance/ui-architecture';

const projectRoot = path.resolve(__dirname, '../..');

test.describe('商品中心 UI 自动化架构治理', () => {
  test('商品中心 AGENTS 应声明公共边界和正式步骤收据规则', async () => {
    const source = fs.readFileSync(path.join(projectRoot, 'AGENTS.md'), 'utf8');
    expect(source).toContain('## Executable Step Traceability');
    expect(source).toContain('## Dependency And Composition Boundaries');
    expect(source).toContain('## Architecture Gate');
    expect(source).toContain('## Capability Index');
    expect(source).toContain('## Formal UI Case Registry');
    expect(source).toContain('operationReceipts: []` is prohibited');
  });

  test('正式商品和组入口应使用组合根并强制真实步骤收据', async () => {
    const itemGenerator = read('scripts/generate-product-center-item-216-spec.ts');
    const itemSpec = read('tests/generated/product-center-item-216.generated.spec.ts');
    const groupGenerator = read('scripts/build-product-center-group-automation.ts');
    const groupSpec = read('tests/generated/product-center-group.generated.spec.ts');
    const fixture = read('fixtures/product-center.fixture.ts');

    for (const source of [itemGenerator, itemSpec, groupGenerator, groupSpec]) {
      expect(source).toContain('assertObservedExecutableOperations');
      expect(source).toContain('consumeExecutableOperationReceipts');
      expect(source).not.toContain('operationReceipts: []');
    }
    // Item receipts use the current semantic-fingerprint schema (4.0.0);
    // group receipts remain on the compatible 3.1.0 schema until their
    // independent migration is scheduled.
    expect(itemSpec).toContain("receiptVersion: '4.0.0'");
    expect(groupSpec).toContain("receiptVersion: '3.1.0'");
    expect(itemSpec).not.toContain("tag: ['@generated'");
    expect(itemSpec).not.toMatch(/new (StandardItem216Flow|PackageItem216Flow|AddonItem216Flow)/);
    expect(fixture).toContain('standardItem216CaseRunner');
    expect(fixture).toContain('packageItem216Flow');
    expect(fixture).toContain('addonItem216Flow');
  });

  test('当前架构不得超过只降不升基线', async () => {
    const config = JSON.parse(read('config/ui-architecture.json')) as UiArchitectureConfig;
    const baseline = JSON.parse(read('docs/ui-architecture-baseline.json')) as UiArchitectureBaseline;
    const report = inspectUiArchitecture({ projectRoot, config });
    expect(evaluateUiArchitectureBaseline({ report, baseline })).toEqual([]);
    expect(report.metrics.formalSpecsWithEmptyOperationReceipts).toBe(0);
    expect(report.metrics.formalSpecsWithGeneratedTag).toBe(0);
  });

  test('历史架构债务增量必须有显式对账和后续期限', async () => {
    const reconciliation = JSON.parse(read('docs/ui-architecture-debt-reconciliation.json')) as {
      policy: { newDebtAllowed: boolean; baselineRaiseIsApprovalOnly: boolean; followUpRequired: boolean; followUpDue: string };
      changes: Array<{ file: string; previous: number | string; current: number | string; remediation: string }>;
    };
    expect(reconciliation.policy).toMatchObject({
      newDebtAllowed: false,
      baselineRaiseIsApprovalOnly: true,
      followUpRequired: true,
    });
    expect(Number.isNaN(Date.parse(reconciliation.policy.followUpDue))).toBe(false);
    expect(reconciliation.changes.length).toBeGreaterThan(0);
    expect(reconciliation.changes.every((item) => item.file && item.remediation)).toBe(true);
  });
});

function read(relative: string): string {
  return fs.readFileSync(path.join(projectRoot, relative), 'utf8');
}
