import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { auditMigrationClosureFile } from '../../../../Test Automation Platform/src/governance/migration-closure';

const projectRoot = path.resolve(__dirname, '../..');
const manifestPath = path.join(
  projectRoot,
  'adapters/test-automation-platform/migration-closure.manifest.json',
);

test.describe('商品中心迁移闭环适配合同', () => {
  // 迁移审计需要扫描商品中心工作区与公共平台目录，属于 report-only 合同校验；
  // 给同步扫描留出完整窗口，避免测试超时后 finally 提前删除临时证据文件。
  test.setTimeout(120_000);

  test('迁移未接受差异必须保持未完成且不得伪报平台闭环', () => {
    const temporaryEvidencePath = path.join(
      projectRoot,
      'adapters',
      'test-automation-platform',
      `migration-closure-contract-${process.pid}-${Date.now()}.json`,
    );
    fs.writeFileSync(temporaryEvidencePath, '{"contractTest":true}\n', 'utf8');
    try {
      const report = auditMigrationClosureFile(manifestPath);
      expect(report.status).toBe('incomplete');
      expect(report.summary).toMatchObject({
        unowned: 0,
        duplicateImplementations: 0,
        documentationContradictions: 0,
        misplacedTransients: 0,
        publicBoundaryViolations: 0,
        contentPolicyViolations: 0,
        requiredAssetMissing: 0,
        inventoryBaselineMissing: 0,
        inventoryMissing: 0,
        inventoryAcceptanceInvalid: 0,
      });
      expect(report.summary.inventoryChanged).toBeGreaterThan(0);
      expect(report.summary.bridgeViolations).toBe(0);
      expect(report.summary.brokenReferences).toBe(0);
      expect(report.universalPlatformCompletionAsserted).toBe(false);
      expect(report.summary.inventoryAcceptanceInvalid).toBe(0);
    } finally {
      fs.rmSync(temporaryEvidencePath, { force: true });
    }
  });

  test('派生平台状态只能引用商品中心项目产物', () => {
    const artifactRoot = path.join(projectRoot, 'deliverables/system-test-platform');
    const readinessPath = path.join(artifactRoot, 'readiness.json');
    const finalGoalPath = path.resolve(
      projectRoot,
      '..',
      'Merchant Center Info/00-待转换测试方案/FINAL-GOAL.md',
    );
    const readiness = JSON.parse(fs.readFileSync(readinessPath, 'utf8')) as {
      source?: { executionIndex?: string };
    };
    expect(readiness.source?.executionIndex).toBe(
      'Merchant Center UITest/deliverables/system-test-platform/execution-index.json',
    );
    expect(fs.existsSync(path.join(projectRoot, readiness.source?.executionIndex?.replace('Merchant Center UITest/', '') ?? ''))).toBe(true);
    const governedDocumentation = [
      finalGoalPath,
      path.resolve(projectRoot, '..', 'Merchant Center Info/00-待转换测试方案/README.md'),
      path.join(projectRoot, 'docs/system-test-platform.md'),
    ];
    for (const filePath of governedDocumentation) {
      expect(fs.readFileSync(filePath, 'utf8'), filePath).not.toContain(
        'Test Automation Platform/deliverables/system-test-platform',
      );
    }
  });

  test('迁移基线必须由当前有效哈希链收据接受', () => {
    const baseline = JSON.parse(fs.readFileSync(
      path.join(projectRoot, 'adapters/test-automation-platform/reports/migration-inventory.baseline.json'),
      'utf8',
    )) as { fingerprint: string };
    const receipts = fs.readFileSync(
      path.join(projectRoot, 'deliverables/system-test-platform/migration-baseline-acceptance.jsonl'),
      'utf8',
    ).trim().split(/\r?\n/).map((line) => JSON.parse(line) as {
      acceptedFingerprint: string;
      approvedBy: string;
      reason: string;
    });
    expect(receipts.at(-1)).toMatchObject({
      acceptedFingerprint: baseline.fingerprint,
    });
    expect(receipts.at(-1)?.approvedBy).toBeTruthy();
    expect(receipts.at(-1)?.reason).toBeTruthy();
  });
});
