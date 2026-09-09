import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { buildProjectRemediationScopeArtifact } from '../../../../Test Automation Platform/scripts/build-project-remediation-scope';
import { assertProjectRemediationExecutionScope } from '../../../../Test Automation Platform/src/governance/project-remediation-scope';

const projectRoot = path.resolve(__dirname, '../..');

test.describe('商品中心当前已落地脚本整改范围合同', () => {
  test('五类模块、非执行分类和唯一注册证据必须完整', () => {
    const result = buildProjectRemediationScopeArtifact({
      projectRoot,
      generatedAt: '2026-08-29T00:00:00.000Z',
    });
    expect(result.artifact.summary).toEqual({
      expectedLanded: 432,
      actualLanded: 432,
      expectedExclusions: 194,
      actualExclusions: 194,
    });
    expect(result.artifact.expectedLandedByModule).toEqual({
      group: 128,
      image: 4,
      item: 202,
      seasoning: 83,
      tag: 15,
    });
    expect(result.artifact.status).toBe('ready');
    expect(result.artifact.issues).toEqual([]);
    expect(fs.existsSync(result.outputPath)).toBe(true);
  });

  test('调味单模块计划不得冒充商品中心全面整改计划', () => {
    const { artifact } = buildProjectRemediationScopeArtifact({
      projectRoot,
      generatedAt: '2026-08-29T00:00:00.000Z',
    });
    const seasoningCaseIds = artifact.cases.filter((item) => item.module === 'seasoning').map((item) => item.caseId);
    expect(() => assertProjectRemediationExecutionScope({
      scope: artifact,
      plannedCaseIds: seasoningCaseIds,
      classifiedExclusionCaseIds: [],
    })).toThrow('PROJECT_REMEDIATION_SCOPE_INCOMPLETE');
  });
});
