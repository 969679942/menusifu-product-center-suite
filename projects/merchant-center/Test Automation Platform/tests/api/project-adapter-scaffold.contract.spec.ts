import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { scaffoldProjectAdapter } from '../../scripts/scaffold-project-adapter';

test.describe('通用项目适配器脚手架', () => {
  test('应为新项目创建独立适配描述和产物身份清单', () => {
    const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'project-adapter-'));
    try {
      const result = scaffoldProjectAdapter({
        projectRoot,
        applicationId: 'war-application',
        projectId: 'war-application-tests',
      });
      expect(fs.existsSync(result.descriptorPath)).toBe(true);
      expect(fs.existsSync(result.artifactIdentityPath)).toBe(true);
      expect(fs.existsSync(path.join(projectRoot, result.descriptor.migrationManifestPath))).toBe(true);
      expect(JSON.parse(fs.readFileSync(result.artifactIdentityPath, 'utf8'))).toMatchObject({
        applicationId: 'war-application',
        projectId: 'war-application-tests',
        artifactRoot: 'deliverables/system-test-platform',
      });
    } finally {
      fs.rmSync(projectRoot, { recursive: true, force: true });
    }
  });

  test('产物根目录越界时必须拒绝初始化', () => {
    const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'project-adapter-boundary-'));
    try {
      expect(() => scaffoldProjectAdapter({
        projectRoot,
        applicationId: 'war-application',
        projectId: 'war-application-tests',
        artifactRoot: '../outside',
      })).toThrow('项目产物根目录必须位于项目内');
    } finally {
      fs.rmSync(projectRoot, { recursive: true, force: true });
    }
  });

  test('重复初始化不得覆盖已有项目身份或适配描述', () => {
    const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'project-adapter-existing-'));
    try {
      const first = scaffoldProjectAdapter({
        projectRoot,
        applicationId: 'war-application',
        projectId: 'war-application-tests',
      });
      const originalDescriptor = fs.readFileSync(first.descriptorPath, 'utf8');
      expect(() => scaffoldProjectAdapter({
        projectRoot,
        applicationId: 'other-application',
        projectId: 'other-application-tests',
      })).toThrow('项目适配描述已存在且 applicationId 不匹配');
      expect(fs.readFileSync(first.descriptorPath, 'utf8')).toBe(originalDescriptor);
    } finally {
      fs.rmSync(projectRoot, { recursive: true, force: true });
    }
  });

  test('基础描述应允许通过同一脚手架补齐生命周期且拒绝后续冲突', () => {
    const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'project-adapter-lifecycle-'));
    try {
      const initial = scaffoldProjectAdapter({
        projectRoot,
        applicationId: 'war-application',
        projectId: 'war-application-tests',
      });
      expect(initial.descriptor.status).toBe('configuration-required');
      const lifecycle = {
        businessDomainId: 'order-domain',
        workspaceRoot: '.',
        governanceRoot: '.',
        referenceClosureAuditPath: 'deliverables/closure.json',
        referenceModule: '订单',
        governanceFiles: [],
      };
      const upgraded = scaffoldProjectAdapter({
        projectRoot,
        applicationId: 'war-application',
        projectId: 'war-application-tests',
        lifecycle,
      });
      expect(upgraded.descriptor).toMatchObject({ status: 'initialized', lifecycle });
      expect(() => scaffoldProjectAdapter({
        projectRoot,
        applicationId: 'war-application',
        projectId: 'war-application-tests',
        lifecycle: { ...lifecycle, businessDomainId: 'other-domain' },
      })).toThrow('lifecycle 不匹配');
    } finally {
      fs.rmSync(projectRoot, { recursive: true, force: true });
    }
  });
});
