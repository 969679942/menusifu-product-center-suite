import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import {
  assertSystemTestArtifactIdentity,
  initializeSystemTestArtifactIdentity,
  resolveSystemTestPlatformArtifact,
} from '../../src/platform-paths';

test.describe('公共平台项目产物身份', () => {
  test('身份清单匹配时允许解析项目产物', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'platform-artifact-'));
    try {
      initializeSystemTestArtifactIdentity(root, {
        applicationId: 'sample-app',
        projectId: 'sample-tests',
        artifactRoot: 'deliverables/system-test-platform',
      });
      expect(resolveSystemTestPlatformArtifact('readiness.json', root, {
        expectedApplicationId: 'sample-app',
        expectedProjectId: 'sample-tests',
        expectedArtifactRoot: 'deliverables/system-test-platform',
        requireIdentity: true,
      })).toBe(path.join(root, 'readiness.json'));
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test('身份或路径不匹配时必须拒绝继续', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'platform-artifact-boundary-'));
    try {
      initializeSystemTestArtifactIdentity(root, {
        applicationId: 'sample-app',
        projectId: 'sample-tests',
        artifactRoot: 'deliverables/system-test-platform',
      });
      expect(() => assertSystemTestArtifactIdentity(root, { applicationId: 'other-app' }))
        .toThrow('applicationId 不匹配');
      expect(() => resolveSystemTestPlatformArtifact('../outside.json', root))
        .toThrow('项目产物路径越界');
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test('身份清单缺失时不得由产物解析过程静默创建', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'platform-artifact-missing-'));
    try {
      expect(() => resolveSystemTestPlatformArtifact('readiness.json', root, {
        expectedApplicationId: 'sample-app',
        expectedProjectId: 'sample-tests',
        requireIdentity: true,
      })).toThrow('缺少项目产物身份清单');
      expect(fs.existsSync(path.join(root, 'artifact-manifest.json'))).toBe(false);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
