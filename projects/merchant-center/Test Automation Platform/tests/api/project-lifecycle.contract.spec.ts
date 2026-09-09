import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { scaffoldProjectAdapter } from '../../scripts/scaffold-project-adapter';
import { runProjectLifecycle } from '../../scripts/run-project-lifecycle';
import { writeMigrationInventoryBaseline } from '../../src/governance/migration-closure';

test.describe('公共项目生命周期', () => {
  test('仅凭项目根目录应完成派生状态刷新和迁移收口', () => {
    const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'project-lifecycle-'));
    try {
      fs.writeFileSync(path.join(projectRoot, 'package.json'), JSON.stringify({ scripts: {} }), 'utf8');
      fs.mkdirSync(path.join(projectRoot, 'deliverables'), { recursive: true });
      fs.writeFileSync(
        path.join(projectRoot, 'deliverables/reference-closure.json'),
        JSON.stringify({ cases: [] }),
        'utf8',
      );
      const scaffold = scaffoldProjectAdapter({
        projectRoot,
        applicationId: 'sample-application',
        projectId: 'sample-project',
        lifecycle: {
          businessDomainId: 'sample-domain',
          workspaceRoot: '.',
          governanceRoot: '.',
          referenceClosureAuditPath: 'deliverables/reference-closure.json',
          referenceModule: '样例模块',
          governanceFiles: [],
        },
      });
      writeMigrationInventoryBaseline(
        path.join(projectRoot, scaffold.descriptor.migrationManifestPath),
        { approvedBy: 'contract-test', reason: '建立独立项目生命周期基线', acceptedAt: '2026-08-22T00:00:00.000Z' },
      );

      const result = runProjectLifecycle({ projectRoot, action: 'close' });
      expect(result.migrationStatus).toBe('complete');
      expect(result.readinessPath).toBe(path.join(projectRoot, 'deliverables/system-test-platform/readiness.json'));
      expect(JSON.parse(fs.readFileSync(result.verdictPath!, 'utf8'))).toMatchObject({
        scope: 'platform-universal-completion',
        status: 'incomplete',
        moduleDeliveryBlocked: false,
      });
      expect(JSON.parse(fs.readFileSync(result.externalDependencyPath!, 'utf8'))).toMatchObject({
        applicationId: 'sample-application',
        businessDomainId: 'sample-domain',
        moduleDeliveryBlocked: false,
      });
    } finally {
      fs.rmSync(projectRoot, { recursive: true, force: true });
    }
  });

  test('生命周期身份缺失时必须在生成任何新状态前停止', () => {
    const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'project-lifecycle-identity-'));
    try {
      fs.writeFileSync(path.join(projectRoot, 'package.json'), JSON.stringify({ scripts: {} }), 'utf8');
      const scaffold = scaffoldProjectAdapter({
        projectRoot,
        applicationId: 'sample-application',
        projectId: 'sample-project',
        lifecycle: {
          businessDomainId: 'sample-domain',
          workspaceRoot: '.',
          governanceRoot: '.',
          referenceClosureAuditPath: 'deliverables/reference-closure.json',
          referenceModule: '样例模块',
          governanceFiles: [],
        },
      });
      fs.rmSync(scaffold.artifactIdentityPath);
      expect(() => runProjectLifecycle({ projectRoot, action: 'readiness' }))
        .toThrow('缺少项目产物身份清单');
      expect(fs.existsSync(scaffold.artifactIdentityPath)).toBe(false);
    } finally {
      fs.rmSync(projectRoot, { recursive: true, force: true });
    }
  });

  test('迁移漂移时 close 必须在 readiness 写入前停止', () => {
    const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'project-lifecycle-drift-'));
    try {
      fs.writeFileSync(path.join(projectRoot, 'package.json'), JSON.stringify({ scripts: {} }), 'utf8');
      fs.mkdirSync(path.join(projectRoot, 'deliverables'), { recursive: true });
      fs.writeFileSync(path.join(projectRoot, 'deliverables/reference-closure.json'), JSON.stringify({ cases: [] }), 'utf8');
      const scaffold = scaffoldProjectAdapter({
        projectRoot,
        applicationId: 'sample-application',
        projectId: 'sample-project',
        lifecycle: {
          businessDomainId: 'sample-domain',
          workspaceRoot: '.',
          governanceRoot: '.',
          referenceClosureAuditPath: 'deliverables/reference-closure.json',
          referenceModule: '样例模块',
          governanceFiles: [],
        },
      });
      const manifestPath = path.join(projectRoot, scaffold.descriptor.migrationManifestPath);
      writeMigrationInventoryBaseline(manifestPath, {
        approvedBy: 'contract-test', reason: '建立漂移预检基线', acceptedAt: '2026-08-22T00:00:00.000Z',
      });
      fs.writeFileSync(path.join(projectRoot, 'package.json'), JSON.stringify({ scripts: { changed: 'node changed.js' } }), 'utf8');

      const result = runProjectLifecycle({ projectRoot, action: 'close' });
      expect(result.migrationStatus).toBe('incomplete');
      expect(result.readinessPath).toBeUndefined();
      expect(fs.existsSync(path.join(projectRoot, 'deliverables/system-test-platform/readiness.json'))).toBe(false);
    } finally {
      fs.rmSync(projectRoot, { recursive: true, force: true });
    }
  });

  test('单独执行 verdict 也必须刷新 readiness，不能消费旧派生状态', () => {
    const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'project-lifecycle-refresh-'));
    try {
      fs.writeFileSync(path.join(projectRoot, 'package.json'), JSON.stringify({ scripts: {} }), 'utf8');
      fs.mkdirSync(path.join(projectRoot, 'deliverables'), { recursive: true });
      fs.writeFileSync(path.join(projectRoot, 'deliverables/reference-closure.json'), JSON.stringify({ cases: [] }), 'utf8');
      const scaffold = scaffoldProjectAdapter({
        projectRoot,
        applicationId: 'sample-application',
        projectId: 'sample-project',
        lifecycle: {
          businessDomainId: 'sample-domain',
          workspaceRoot: '.',
          governanceRoot: '.',
          referenceClosureAuditPath: 'deliverables/reference-closure.json',
          referenceModule: '样例模块',
          governanceFiles: [],
        },
      });
      writeMigrationInventoryBaseline(path.join(projectRoot, scaffold.descriptor.migrationManifestPath), {
        approvedBy: 'contract-test', reason: '验证单独入口刷新', acceptedAt: '2026-08-22T00:00:00.000Z',
      });
      runProjectLifecycle({ projectRoot, action: 'readiness' });
      fs.writeFileSync(path.join(projectRoot, 'deliverables/system-test-platform/readiness.json'), JSON.stringify({ status: 'stale' }), 'utf8');

      const result = runProjectLifecycle({ projectRoot, action: 'verdict' });
      expect(result.readinessStatus).toBe('candidate');
      expect(JSON.parse(fs.readFileSync(result.verdictPath!, 'utf8'))).toMatchObject({
        status: 'incomplete', commonImplementationReady: true,
      });
    } finally {
      fs.rmSync(projectRoot, { recursive: true, force: true });
    }
  });
});
