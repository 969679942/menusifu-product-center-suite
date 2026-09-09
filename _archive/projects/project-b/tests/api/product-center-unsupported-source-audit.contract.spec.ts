import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { buildProductCenterUnsupportedSourceDecisions } from '../../scripts/audit-product-center-unsupported-sources';
import { discoverLatestAttempts } from '../../scripts/build-product-center-source-auto-resolution';

test.describe('商品中心不支持来源格式受控审计', () => {
  test('应为全部来源问题指定负责人并仅接受可验证治理证据', async () => {
    const outputRoot = await mkdtemp(path.join(tmpdir(), 'product-center-source-decisions-'));
    try {
      const outputPath = await buildProductCenterUnsupportedSourceDecisions({
        projectRoot: path.resolve(__dirname, '../..'),
        infoRoot: path.resolve(__dirname, '../../../Merchant Center Info'),
        outputRoot,
      });
      const decision = JSON.parse(await readFile(outputPath, 'utf8'));

      expect(decision.guardrails).toEqual({
        automationAsBusinessSourceAllowed: false,
        inferenceAllowed: false,
        unmatchedDisposition: 'blocked',
      });
      expect(decision.summary.baselineCases).toBe(
        decision.summary.totalCases + decision.summary.normalizedCases,
      );
      expect(decision.summary.normalizedCases).toBeGreaterThan(0);
      expect(decision.summary.totalCases).toBe(decision.cases.length);
      expect(decision.summary.originalRequestedCases).toBe(
        decision.summary.totalCases - decision.summary.newlySurfacedDeprecatedCases,
      );
      expect(decision.summary.newlySurfacedDeprecatedCases).toBe(2);
      expect(decision.summary.verifiedCases
        + decision.summary.blockedCases
        + decision.summary.notApplicableCases).toBe(decision.summary.totalCases);
      expect(decision.summary.deferredCases).toBe(
        decision.cases.filter((item: any) => item.executionDisposition === 'deferred').length,
      );
      expect(decision.summary.executionNotApplicableCases).toBe(
        decision.cases.filter((item: any) => item.executionDisposition === 'not-applicable').length,
      );
      expect(decision.summary.currentGoalBlockingCases).toBe(
        decision.cases.filter((item: any) => item.currentGoalBlocking).length,
      );
      expect(decision.summary.unassignedOwnerCases).toBe(0);

      expect(new Set(decision.cases.map((item: any) => item.caseId)).size)
        .toBe(decision.cases.length);
      expect(decision.cases.some((item: any) => item.caseId === 'TC-GRP-PKG-043')).toBe(false);
      decision.cases.forEach((item: any) => {
        expect(item.owner).toMatchObject({ type: 'role', status: 'assigned' });
        expect(item.owner.role).toMatch(/负责人$/);
        expect(item.evidenceFiles.every((file: string) => !file.includes('自动化测试用例'))).toBe(true);
        if (item.status === 'verified') {
          expect(item.disposition).toBe('verified-source-evidence');
          expect(item.currentGoalBlocking).toBe(false);
          expect(item.citations.length).toBeGreaterThan(0);
          expect(item.blockReason).toBeUndefined();
        } else if (item.status === 'blocked') {
          expect(item.status).toBe('blocked');
          expect(item.disposition).toBe('blocked-source-review');
          expect(item.currentGoalBlocking).toBe(item.executionDisposition === null);
          expect(item.citations).toEqual([]);
          expect(item.blockReason).toBeTruthy();
        } else {
          expect(item.status).toBe('not-applicable');
          expect(item.disposition).toBe('not-applicable');
          expect(item.currentGoalBlocking).toBe(false);
        }
      });
      expect(decision.generationWorkstream).toEqual({
        id: 'test-plan-to-test-case-generation',
        status: 'active',
        currentGoalBlocking: decision.summary.currentGoalBlockingCases > 0,
      });

      expect(decision.cases.find((item: any) => item.caseId === 'TC-GRP-ADD-031')).toMatchObject({
        status: 'blocked',
        executionDisposition: 'deferred',
        currentGoalBlocking: false,
      });
      expect(decision.cases.find((item: any) => item.caseId === 'TC-ITEM-STD-034')).toMatchObject({
        status: 'blocked',
        executionDisposition: 'not-applicable',
        currentGoalBlocking: false,
      });

      for (const caseId of ['TC-ITEM-STD-060', 'TC-ITEM-PKG-066']) {
        expect(decision.cases.find((item: any) => item.caseId === caseId)).toMatchObject({
          status: 'not-applicable',
        });
      }
      const packageCase017 = decision.cases.find((item: any) => item.caseId === 'TC-GRP-PKG-017');
      if (packageCase017) expect(packageCase017).toMatchObject({ status: 'not-applicable' });
      for (const caseId of ['TC-GRP-PKG-034', 'TC-GRP-PKG-035']) {
        expect(decision.cases.find((item: any) => item.caseId === caseId)).toMatchObject({
          status: 'verified',
        });
      }
      expect(decision.cases.find((item: any) => item.caseId === 'TC-GRP-PKG-046')).toMatchObject({
        status: 'verified',
        disposition: 'verified-source-evidence',
      });
      for (const caseId of [
        'TC-TAG-DESC-027',
        'TC-TAG-STAT-029',
        'TC-TAG-BDG-024',
        'TC-TAG-DESC-013',
        'TC-TAG-DESC-014',
        'TC-TAG-STAT-012',
        'TC-TAG-STAT-013',
        'TC-TAG-BDG-009',
        'TC-TAG-BDG-020',
        'TC-TAG-BDG-021',
        'TC-TAG-STAT-024',
      ]) {
        expect(decision.cases.find((item: any) => item.caseId === caseId)).toMatchObject({
          status: 'verified',
          disposition: 'verified-source-evidence',
        });
      }
    } finally {
      await rm(outputRoot, { recursive: true, force: true });
    }
  });

  test('相同来源连续审计时正式决策产物应保持字节稳定', async () => {
    const outputRoot = await mkdtemp(path.join(tmpdir(), 'product-center-source-stability-'));
    try {
      const options = {
        projectRoot: path.resolve(__dirname, '../..'),
        infoRoot: path.resolve(__dirname, '../../../Merchant Center Info'),
        outputRoot,
      };
      const outputPath = await buildProductCenterUnsupportedSourceDecisions(options);
      const first = await readFile(outputPath, 'utf8');
      await buildProductCenterUnsupportedSourceDecisions(options);
      const second = await readFile(outputPath, 'utf8');

      expect(second).toBe(first);
    } finally {
      await rm(outputRoot, { recursive: true, force: true });
    }
  });

  test('定向运行的跳过结果不得覆盖已有真实运行证据', async () => {
    const outputRoot = await mkdtemp(path.join(tmpdir(), 'product-center-runtime-attempts-'));
    try {
      const caseId = 'TC-TAG-BDG-009';
      const report = (status: 'passed' | 'skipped', startTime: string) => ({
        suites: [{
          specs: [{
            title: '角标名称重复校验',
            tags: [`case-${caseId}`],
            tests: [{
              status: status === 'passed' ? 'expected' : 'skipped',
              results: [{ status, startTime, attachments: [] }],
            }],
          }],
        }],
        stats: { startTime },
      });
      await writeFile(
        path.join(outputRoot, 'older-passed.json'),
        JSON.stringify(report('passed', '2026-08-17T10:00:00.000Z')),
        'utf8',
      );
      await writeFile(
        path.join(outputRoot, 'newer-skipped.json'),
        JSON.stringify(report('skipped', '2026-08-17T11:00:00.000Z')),
        'utf8',
      );

      const attempts = discoverLatestAttempts(outputRoot, new Set([caseId]), outputRoot);

      expect(attempts.get(caseId)).toMatchObject({
        caseId,
        status: 'passed',
        evidencePath: 'older-passed.json',
      });
    } finally {
      await rm(outputRoot, { recursive: true, force: true });
    }
  });
});
