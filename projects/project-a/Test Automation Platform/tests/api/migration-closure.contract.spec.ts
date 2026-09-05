import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import {
  auditMigrationClosure,
  writeMigrationInventoryBaseline,
  type MigrationClosureManifest,
} from '../../src/governance/migration-closure';

test.describe('通用迁移闭环治理', () => {
  test('完整归属、公共桥接、引用和历史声明均有效时应通过', () => {
    const fixture = createFixture();
    try {
      const report = auditMigrationClosure(fixture.manifest, fixture.root);
      expect(report.status).toBe('complete');
      expect(report.summary).toMatchObject({
        unowned: 0,
        bridgeViolations: 0,
        duplicateImplementations: 0,
        brokenReferences: 0,
        documentationContradictions: 0,
        misplacedTransients: 0,
      });
      expect(report.retainedLegacySources).toEqual([expect.objectContaining({
        disposition: 'retained-with-active-references',
        activeReferenceTargets: 1,
      })]);
      expect(report.universalPlatformCompletionAsserted).toBe(false);
    } finally {
      fs.rmSync(fixture.root, { recursive: true, force: true });
    }
  });

  test('未知文件和断裂相对引用必须阻断迁移完成', () => {
    const fixture = createFixture();
    try {
      write(fixture.root, 'project/unknown/new-core.ts', "export * from './missing';\n");
      const report = auditMigrationClosure(fixture.manifest, fixture.root);
      expect(report.status).toBe('incomplete');
      expect(report.failures.unowned).toEqual([expect.objectContaining({ code: 'UNOWNED_FILE' })]);
      expect(report.failures.brokenReferences).toEqual([expect.objectContaining({ code: 'RELATIVE_IMPORT_MISSING' })]);
    } finally {
      fs.rmSync(fixture.root, { recursive: true, force: true });
    }
  });

  test('兼容桥包含本地实现时必须识别为重复维护风险', () => {
    const fixture = createFixture();
    try {
      write(fixture.root, 'project/bridge/core.ts', [
        "export * from '../../platform/src/core';",
        'export const localCopy = true;',
        '',
      ].join('\n'));
      const report = auditMigrationClosure(fixture.manifest, fixture.root);
      expect(report.status).toBe('incomplete');
      expect(report.failures.bridgeViolations).toEqual([expect.objectContaining({
        code: 'BRIDGE_CONTAINS_IMPLEMENTATION',
      })]);
    } finally {
      fs.rmSync(fixture.root, { recursive: true, force: true });
    }
  });

  test('历史来源仍被引用但文档未声明保留时必须阻断', () => {
    const fixture = createFixture();
    try {
      write(fixture.root, 'project/history/README.md', '# 已废弃\n');
      const report = auditMigrationClosure(fixture.manifest, fixture.root);
      expect(report.status).toBe('incomplete');
      expect(report.failures.documentationContradictions).toEqual([expect.objectContaining({
        code: 'LEGACY_DOCUMENTATION_CONTRADICTS_ACTIVE_REFERENCES',
      })]);
    } finally {
      fs.rmSync(fixture.root, { recursive: true, force: true });
    }
  });

  test('瞬态文件出现在未批准位置时必须阻断', () => {
    const fixture = createFixture();
    try {
      write(fixture.root, 'project/source/debug.tmp', 'temporary');
      const report = auditMigrationClosure(fixture.manifest, fixture.root);
      expect(report.status).toBe('incomplete');
      expect(report.failures.misplacedTransients).toEqual([expect.objectContaining({
        code: 'TRANSIENT_FILE_MISPLACED',
      })]);
    } finally {
      fs.rmSync(fixture.root, { recursive: true, force: true });
    }
  });

  test('冻结历史快照的断裂引用必须报告但不得冒充当前合同阻断', () => {
    const fixture = createFixture();
    try {
      write(fixture.root, 'project/contracts/snapshot.json', JSON.stringify({ source: 'sample:/history/moved.md' }));
      fixture.manifest.structuredReferences.push({
        id: 'historical-source', scanRootId: 'project', scanPatterns: ['contracts/snapshot.json'],
        prefix: 'sample:/', targetRootId: 'project', missingDisposition: 'historical-diagnostic',
      });
      fixture.manifest.structuredReferences[0].scanPatterns = ['contracts/references.json'];
      const report = auditMigrationClosure(fixture.manifest, fixture.root);
      expect(report.status).toBe('complete');
      expect(report.summary.brokenReferences).toBe(0);
      expect(report.historicalReferenceGaps).toEqual([expect.objectContaining({
        code: 'HISTORICAL_STRUCTURED_REFERENCE_MISSING',
      })]);
    } finally {
      fs.rmSync(fixture.root, { recursive: true, force: true });
    }
  });

  test('结构化引用可通过显式迁移映射解析，但映射目标仍必须真实存在', () => {
    const fixture = createFixture();
    try {
      write(fixture.root, 'project/contracts/snapshot.json', JSON.stringify({ source: 'sample:/history/old.md' }));
      write(fixture.root, 'project/history/current.md', '# Current\n');
      fixture.manifest.structuredReferences.push({
        id: 'historical-source', scanRootId: 'project', scanPatterns: ['contracts/snapshot.json'],
        prefix: 'sample:/', targetRootId: 'project', missingDisposition: 'historical-diagnostic',
        targetAliases: [{ from: 'history/old.md', to: 'history/current.md', reason: '历史资产迁移' }],
      });
      fixture.manifest.structuredReferences[0].scanPatterns = ['contracts/references.json'];

      const resolved = auditMigrationClosure(fixture.manifest, fixture.root);
      expect(resolved.status).toBe('complete');
      expect(resolved.historicalReferenceGaps).toEqual([]);

      fixture.manifest.structuredReferences[1].targetAliases![0].to = 'history/missing.md';
      const missing = auditMigrationClosure(fixture.manifest, fixture.root);
      expect(missing.historicalReferenceGaps).toEqual([expect.objectContaining({
        code: 'HISTORICAL_STRUCTURED_REFERENCE_MISSING',
        detail: expect.stringContaining('history/missing.md'),
      })]);
    } finally {
      fs.rmSync(fixture.root, { recursive: true, force: true });
    }
  });

  test('公共目录出现项目身份或项目专属路径必须阻断物理隔离完成', () => {
    const fixture = createFixture();
    try {
      fixture.manifest.publicBoundary = {
        rootId: 'platform',
        forbiddenPatterns: ['fixture-app'],
        forbiddenPathPatterns: ['deliverables/project-*'],
      };
      write(fixture.root, 'platform/deliverables/project-readiness.json', '{"application":"fixture-app"}');
      const report = auditMigrationClosure(fixture.manifest, fixture.root);
      expect(report.status).toBe('incomplete');
      expect(report.failures.publicBoundaryViolations).toEqual(expect.arrayContaining([
        expect.objectContaining({ code: 'PUBLIC_BOUNDARY_PATH_FORBIDDEN' }),
        expect.objectContaining({ code: 'PUBLIC_BOUNDARY_CONTENT_FORBIDDEN' }),
      ]));
    } finally {
      fs.rmSync(fixture.root, { recursive: true, force: true });
    }
  });

  test('禁止内容引用和缺失迁移目标必须阻断迁移完成', () => {
    const fixture = createFixture();
    try {
      fixture.manifest.contentPolicies = [{
        id: 'no-old-state-path',
        rootId: 'project',
        patterns: ['history/README.md'],
        forbiddenPatterns: ['old-platform-state'],
      }];
      fixture.manifest.requiredAssets = [{
        id: 'required-project-state',
        rootId: 'project',
        paths: ['generated/readiness.json'],
      }];
      write(fixture.root, 'project/history/README.md', '# 历史来源（暂不可删除）\nold-platform-state\n');
      const report = auditMigrationClosure(fixture.manifest, fixture.root);
      expect(report.status).toBe('incomplete');
      expect(report.failures.contentPolicyViolations).toEqual([
        expect.objectContaining({ code: 'FORBIDDEN_CONTENT_REFERENCE' }),
      ]);
      expect(report.failures.requiredAssetMissing).toEqual([
        expect.objectContaining({ code: 'REQUIRED_MIGRATION_ASSET_MISSING' }),
      ]);
    } finally {
      fs.rmSync(fixture.root, { recursive: true, force: true });
    }
  });

  test('迁移哈希基线必须识别受管资产内容漂移', () => {
    const fixture = createFixture();
    try {
      fixture.manifest.exclusions.push({
        id: 'inventory-baseline',
        rootId: 'project',
        patterns: ['inventory.baseline.json'],
        reason: '基线自身不参与扫描',
      });
      fixture.manifest.inventory = {
        rootId: 'project',
        baselinePath: 'inventory.baseline.json',
        acceptanceReceiptPath: 'generated/migration-baseline-acceptance.jsonl',
        categories: ['domain-asset'],
      };
      fixture.manifest.ownershipRules.push({
        id: 'project-generated', rootId: 'project', category: 'generated-evidence',
        patterns: ['generated/**'], rationale: '生成治理收据',
      });
      const manifestPath = path.join(fixture.root, 'migration.manifest.json');
      fs.writeFileSync(manifestPath, JSON.stringify(fixture.manifest), 'utf8');
      const accepted = writeMigrationInventoryBaseline(manifestPath, {
        approvedBy: 'contract-test',
        reason: '建立合同测试基线',
        acceptedAt: '2026-08-22T00:00:00.000Z',
      });
      expect(fs.readFileSync(accepted.acceptanceReceiptPath, 'utf8')).toContain('contract-test');
      expect(() => writeMigrationInventoryBaseline(manifestPath, {
        approvedBy: 'contract-test', reason: '重复接受', acceptedAt: '2026-08-22T00:01:00.000Z',
      })).toThrow('无需重复写入');
      write(fixture.root, 'project/source/domain.ts', 'export const domain = false;\n');
      const report = auditMigrationClosure(fixture.manifest, fixture.root);
      expect(report.status).toBe('incomplete');
      expect(report.failures.inventory).toEqual([
        expect.objectContaining({ code: 'MIGRATION_ASSET_CHANGED' }),
      ]);
    } finally {
      fs.rmSync(fixture.root, { recursive: true, force: true });
    }
  });

  test('迁移基线必须有批准参数且篡改接受收据后门禁失败', () => {
    const fixture = createFixture();
    try {
      fixture.manifest.exclusions.push({
        id: 'inventory-baseline', rootId: 'project', patterns: ['inventory.baseline.json'], reason: '基线自身不参与扫描',
      });
      fixture.manifest.ownershipRules.push({
        id: 'project-generated', rootId: 'project', category: 'generated-evidence',
        patterns: ['generated/**'], rationale: '生成治理收据',
      });
      fixture.manifest.inventory = {
        rootId: 'project',
        baselinePath: 'inventory.baseline.json',
        acceptanceReceiptPath: 'generated/migration-baseline-acceptance.jsonl',
        categories: ['domain-asset'],
      };
      const manifestPath = path.join(fixture.root, 'migration.manifest.json');
      fs.writeFileSync(manifestPath, JSON.stringify(fixture.manifest), 'utf8');
      expect(() => writeMigrationInventoryBaseline(manifestPath, { approvedBy: '', reason: '' }))
        .toThrow('缺少 approvedBy');
      const accepted = writeMigrationInventoryBaseline(manifestPath, {
        approvedBy: 'contract-test', reason: '验证收据防篡改', acceptedAt: '2026-08-22T00:00:00.000Z',
      });
      fs.appendFileSync(accepted.acceptanceReceiptPath, '{"receiptHash":"tampered"}\n', 'utf8');
      const report = auditMigrationClosure(fixture.manifest, fixture.root);
      expect(report.status).toBe('incomplete');
      expect(report.summary.inventoryAcceptanceInvalid).toBe(1);
      expect(report.failures.inventory).toEqual([
        expect.objectContaining({ code: 'MIGRATION_BASELINE_ACCEPTANCE_INVALID' }),
      ]);
    } finally {
      fs.rmSync(fixture.root, { recursive: true, force: true });
    }
  });

  test('基线建立后新增已归属受管文件也必须显式接受', () => {
    const fixture = createFixture();
    try {
      fixture.manifest.exclusions.push({
        id: 'inventory-baseline', rootId: 'project', patterns: ['inventory.baseline.json'], reason: '基线自身不参与扫描',
      });
      fixture.manifest.ownershipRules.push({
        id: 'project-generated', rootId: 'project', category: 'generated-evidence',
        patterns: ['generated/**'], rationale: '生成治理收据',
      });
      fixture.manifest.inventory = {
        rootId: 'project',
        baselinePath: 'inventory.baseline.json',
        acceptanceReceiptPath: 'generated/migration-baseline-acceptance.jsonl',
        categories: ['domain-asset'],
      };
      const manifestPath = path.join(fixture.root, 'migration.manifest.json');
      fs.writeFileSync(manifestPath, JSON.stringify(fixture.manifest), 'utf8');
      writeMigrationInventoryBaseline(manifestPath, {
        approvedBy: 'contract-test', reason: '建立新增文件检测基线', acceptedAt: '2026-08-22T00:00:00.000Z',
      });
      write(fixture.root, 'project/source/new-domain.ts', 'export const added = true;\n');
      const report = auditMigrationClosure(fixture.manifest, fixture.root);
      expect(report.status).toBe('incomplete');
      expect(report.failures.inventory).toEqual([
        expect.objectContaining({ code: 'MIGRATION_ASSET_ADDED', path: 'project:source/new-domain.ts' }),
      ]);
    } finally {
      fs.rmSync(fixture.root, { recursive: true, force: true });
    }
  });

  test('受管文件在扫描后被并发删除时必须使用稳定快照而不是二次读取崩溃', () => {
    const fixture = createFixture();
    const originalReadFileSync = fs.readFileSync;
    try {
      const volatilePath = path.join(fixture.root, 'project/snapshot/volatile.json');
      write(fixture.root, 'project/snapshot/volatile.json', '{"contract":true}\n');
      fixture.manifest.ownershipRules.push({
        id: 'project-snapshot', rootId: 'project', category: 'domain-asset',
        patterns: ['snapshot/**'], rationale: '模拟并发清理的受管合同文件',
      });
      fixture.manifest.inventory = {
        rootId: 'project', baselinePath: 'inventory.baseline.json',
        acceptanceReceiptPath: 'generated/migration-baseline-acceptance.jsonl', categories: ['domain-asset'],
      };
      let volatileReads = 0;
      fs.readFileSync = ((filePath: fs.PathOrFileDescriptor, options?: unknown) => {
        const value = originalReadFileSync(filePath, options as never);
        if (typeof filePath === 'string' && path.resolve(filePath) === path.resolve(volatilePath)) {
          volatileReads += 1;
          if (volatileReads === 1) fs.rmSync(volatilePath, { force: true });
        }
        return value;
      }) as typeof fs.readFileSync;

      const report = auditMigrationClosure(fixture.manifest, fixture.root);
      expect(report.summary.inventoryBaselineMissing).toBe(1);
      expect(volatileReads).toBe(1);
      expect(report.ownership).toContainEqual(expect.objectContaining({
        path: 'snapshot/volatile.json', category: 'domain-asset',
      }));
    } finally {
      fs.readFileSync = originalReadFileSync;
      fs.rmSync(fixture.root, { recursive: true, force: true });
    }
  });

  test('迁移基线挂起事务必须阻断审计，不能被误判为完成', () => {
    const fixture = createFixture();
    try {
      fixture.manifest.exclusions.push({
        id: 'inventory-baseline', rootId: 'project', patterns: ['inventory.baseline.json'], reason: '基线自身不参与扫描',
      });
      fixture.manifest.ownershipRules.push({
        id: 'project-generated', rootId: 'project', category: 'generated-evidence',
        patterns: ['generated/**'], rationale: '生成治理收据',
      });
      fixture.manifest.inventory = {
        rootId: 'project', baselinePath: 'inventory.baseline.json',
        acceptanceReceiptPath: 'generated/migration-baseline-acceptance.jsonl', categories: ['domain-asset'],
      };
      const manifestPath = path.join(fixture.root, 'migration.manifest.json');
      fs.writeFileSync(manifestPath, JSON.stringify(fixture.manifest), 'utf8');
      const accepted = writeMigrationInventoryBaseline(manifestPath, {
        approvedBy: 'contract-test', reason: '验证挂起事务门禁', acceptedAt: '2026-08-22T00:00:00.000Z',
      });
      fs.writeFileSync(`${accepted.acceptanceReceiptPath}.transaction.json`, '{"schemaVersion":"1.0.0"}\n', 'utf8');

      const report = auditMigrationClosure(fixture.manifest, fixture.root);
      expect(report.status).toBe('incomplete');
      expect(report.failures.inventory).toEqual([
        expect.objectContaining({ code: 'MIGRATION_BASELINE_ACCEPTANCE_TRANSACTION_PENDING' }),
      ]);
    } finally {
      fs.rmSync(fixture.root, { recursive: true, force: true });
    }
  });

  test('迁移基线挂起事务可按当前资产和哈希链恢复且不丢失变更摘要', () => {
    const fixture = createFixture();
    try {
      fixture.manifest.exclusions.push({
        id: 'inventory-baseline', rootId: 'project', patterns: ['inventory.baseline.json'], reason: '基线自身不参与扫描',
      });
      fixture.manifest.ownershipRules.push({
        id: 'project-generated', rootId: 'project', category: 'generated-evidence',
        patterns: ['generated/**'], rationale: '生成治理收据',
      });
      fixture.manifest.inventory = {
        rootId: 'project', baselinePath: 'inventory.baseline.json',
        acceptanceReceiptPath: 'generated/migration-baseline-acceptance.jsonl', categories: ['domain-asset'],
      };
      const manifestPath = path.join(fixture.root, 'migration.manifest.json');
      fs.writeFileSync(manifestPath, JSON.stringify(fixture.manifest), 'utf8');
      const first = writeMigrationInventoryBaseline(manifestPath, {
        approvedBy: 'contract-test', reason: '建立可恢复事务基线', acceptedAt: '2026-08-22T00:00:00.000Z',
      });
      const firstBaseline = fs.readFileSync(first.baselinePath, 'utf8');
      const firstReceipts = fs.readFileSync(first.acceptanceReceiptPath, 'utf8');
      write(fixture.root, 'project/source/domain.ts', 'export const domain = false;\n');
      const second = writeMigrationInventoryBaseline(manifestPath, {
        approvedBy: 'contract-test', reason: '生成可恢复事务样本', acceptedAt: '2026-08-22T00:01:00.000Z',
      });
      const secondBaseline = fs.readFileSync(second.baselinePath, 'utf8');
      fs.writeFileSync(first.baselinePath, firstBaseline, 'utf8');
      fs.writeFileSync(first.acceptanceReceiptPath, firstReceipts, 'utf8');
      fs.writeFileSync(`${first.acceptanceReceiptPath}.transaction.json`, JSON.stringify({
        schemaVersion: '1.0.0', baseline: JSON.parse(secondBaseline), receipt: second.receipt,
      }), 'utf8');

      const recovered = writeMigrationInventoryBaseline(manifestPath, {
        approvedBy: 'contract-test', reason: '恢复中断事务', acceptedAt: '2026-08-22T00:02:00.000Z',
      });
      expect(recovered.receipt).toEqual(second.receipt);
      expect(fs.existsSync(`${first.acceptanceReceiptPath}.transaction.json`)).toBe(false);
      expect(JSON.parse(fs.readFileSync(first.baselinePath, 'utf8')).fingerprint).toBe(second.receipt.acceptedFingerprint);
      expect(fs.readFileSync(first.acceptanceReceiptPath, 'utf8')).toContain('project:source/domain.ts');
      expect(auditMigrationClosure(fixture.manifest, fixture.root).status).toBe('complete');
    } finally {
      fs.rmSync(fixture.root, { recursive: true, force: true });
    }
  });
});

function createFixture(): { root: string; manifest: MigrationClosureManifest } {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'migration-closure-'));
  write(root, 'platform/src/core.ts', 'export const platformCore = true;\n'.repeat(5));
  write(root, 'platform/scripts/run.ts', "import '../src/core';\n");
  write(root, 'platform/tests/template.ts', "export const generated = \"import './missing'\";\n");
  write(root, 'platform/package.json', JSON.stringify({ scripts: { run: 'tsx scripts/run.ts' } }));
  write(root, 'project/bridge/core.ts', "export * from '../../platform/src/core';\n");
  write(root, 'project/source/domain.ts', 'export const domain = true;\n');
  write(root, 'project/contracts/references.json', JSON.stringify({ source: 'sample:/history/formal.md' }));
  write(root, 'project/history/formal.md', '# Formal\n');
  write(root, 'project/history/README.md', '# 历史来源（暂不可删除）\n');
  write(root, 'project/package.json', JSON.stringify({ scripts: { verify: 'tsx source/domain.ts' } }));
  return {
    root,
    manifest: {
      schemaVersion: '1.0.0',
      auditId: 'fixture-migration',
      applicationId: 'fixture-app',
      roots: [
        { id: 'platform', path: 'platform' },
        { id: 'project', path: 'project' },
      ],
      exclusions: [],
      ownershipRules: [
        { id: 'platform-core', rootId: 'platform', category: 'public-core', patterns: ['src/**', 'scripts/**', 'tests/**', 'package.json'], rationale: '公共实现' },
        { id: 'project-adapter', rootId: 'project', category: 'project-adapter', patterns: ['bridge/**', 'package.json'], rationale: '项目适配' },
        { id: 'project-domain', rootId: 'project', category: 'domain-asset', patterns: ['source/**', 'contracts/**'], rationale: '领域资产' },
        { id: 'project-history', rootId: 'project', category: 'history', patterns: ['history/**'], rationale: '历史资产' },
      ],
      bridgeGroups: [{
        id: 'core-bridge', projectRootId: 'project', projectDirectory: 'bridge',
        platformRootId: 'platform', platformDirectory: 'src', requireEveryPlatformFile: true,
      }],
      exactDuplicateScan: {
        platformRootId: 'platform', platformPatterns: ['src/**/*.ts'],
        projectRootId: 'project', projectPatterns: ['source/**/*.ts'],
      },
      importScans: [
        { rootId: 'platform', patterns: ['src/**/*.ts', 'scripts/**/*.ts', 'tests/**/*.ts'] },
        { rootId: 'project', patterns: ['bridge/**/*.ts', 'source/**/*.ts', 'unknown/**/*.ts'] },
      ],
      packageScripts: [
        { rootId: 'platform', path: 'package.json' },
        { rootId: 'project', path: 'package.json' },
      ],
      structuredReferences: [{
        id: 'sample-source', scanRootId: 'project', scanPatterns: ['contracts/**/*.json'],
        prefix: 'sample:/', targetRootId: 'project', missingDisposition: 'blocking',
      }],
      legacySources: [{
        id: 'sample-history', rootId: 'project', path: 'history', documentationPath: 'history/README.md',
        requiredMarkerWhileReferenced: '# 历史来源（暂不可删除）',
      }],
      transientPolicies: [{
        id: 'temporary-files', rootId: 'project', patterns: ['**/*.tmp'], allowedPatterns: ['generated/**/*.tmp'],
      }],
      outputs: { rootId: 'platform', jsonPath: 'deliverables/closure.json', markdownPath: 'deliverables/closure.md' },
    },
  };
}

function write(root: string, relativePath: string, content: string): void {
  const target = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content, 'utf8');
}
