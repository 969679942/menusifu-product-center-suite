import { expect, test } from '@playwright/test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { buildProductCenterTestPlanIntakeV1Artifacts } from '../../scripts/build-product-center-test-plan-intake-v1';
import { adaptIntakeV1ToDraft } from '../../utils/product-center-intake-draft-adapter';
import { reconcileIntakeSourceSummary } from '../../utils/product-center-intake-source-summary';
import { processProductCenterTestCaseIntake, validateProductCenterTestCaseDraftDocument } from '../../utils/product-center-test-case-ir';

function fixture() {
  return {
    schemaVersion: '1.0.0', collectionId: 'product-center-test-plan-intake-v1',
    cases: [{
      canonicalId: 'CASE-1', internalCaseId: 'internal:one', module: 'neutral-module',
      route: '/reference', title: '读取记录名称', priority: 'P1',
      sourceTrace: [{ sourceRefs: ['RULE:1'], sourceIds: ['rule-1'] }],
      preconditions: [], actions: ['读取记录名称'], expectedResults: ['记录名称为示例'],
      mutatesData: false, cleanup: [], coverageIds: [],
      execution: {
        roleIds: ['reader'], environmentIds: ['isolated'], capabilityIds: ['read'],
        mutationMode: 'none', verificationSignals: ['api', 'ui'], seedAdapterIds: [],
        cleanupAdapterIds: [], asyncPolicy: 'none',
      },
      claims: [
        { id: 'A1', kind: 'action', text: '读取记录名称', sourceRefs: ['RULE:1'], evidenceLevel: 'confirmed' },
        { id: 'E1', kind: 'expectation', text: '记录名称为示例', sourceRefs: ['RULE:1'], evidenceLevel: 'confirmed' },
      ],
    }],
  };
}

function audit(document: unknown) {
  return processProductCenterTestCaseIntake(adaptIntakeV1ToDraft(document), [{ ref: 'RULE:1', sourceIds: ['rule-1'] }], {
    scope: 'case-only', knownSourceIds: new Set(['rule-1']), denominator: [],
    knownRoleIds: new Set(['reader']), knownEnvironmentIds: new Set(['isolated']), knownCapabilityIds: new Set(['read']),
  });
}

test.describe('接入转换不得制造证据', () => {
  test('保留显式身份、执行和语句证据且不改写输入', () => {
    const source = fixture();
    const before = structuredClone(source);
    const converted = adaptIntakeV1ToDraft(source) as typeof source & { cases: Array<{ id: string }> };
    expect(converted.cases[0].id).toBe('CASE-1');
    expect(converted.cases[0].internalCaseId).toBe('internal:one');
    expect(converted.cases[0].execution).toEqual(source.cases[0].execution);
    expect(converted.cases[0].claims).toEqual(source.cases[0].claims);
    expect(source).toEqual(before);
    expect(validateProductCenterTestCaseDraftDocument(converted).valid).toBe(true);
    expect(audit(source).status).toBe('passed');
  });

  test('缺少语句证据不得从用例来源继承或默认确认', () => {
    const source: any = fixture();
    delete source.cases[0].claims[1].evidenceLevel;
    delete source.cases[0].claims[1].sourceRefs;
    const result = audit(source);
    expect(result.status).toBe('invalid');
    expect(result.schemaIssues.map((issue) => issue.path)).toEqual(expect.arrayContaining([
      'cases[0].claims[1].evidenceLevel', 'cases[0].claims[1].sourceRefs',
    ]));
    const converted: any = adaptIntakeV1ToDraft(source);
    expect(converted.cases[0].claims[1]).not.toHaveProperty('sourceIds');
    expect(converted.cases[0].claims[1]).not.toHaveProperty('evidenceLevel');
  });

  test('缺少执行、变更声明和覆盖映射不得猜测补齐', () => {
    const source: any = fixture();
    delete source.cases[0].execution;
    delete source.cases[0].mutatesData;
    delete source.cases[0].coverageIds;
    const result = audit(source);
    expect(result.status).toBe('invalid');
    expect(result.schemaIssues.map((issue) => issue.path)).toEqual(expect.arrayContaining([
      'cases[0].execution', 'cases[0].mutatesData', 'cases[0].coverageIds',
    ]));
  });

  test('已有冲突等级不得被转换层升级为通过', () => {
    const source = fixture();
    source.cases[0].claims[1].evidenceLevel = 'conflicting';
    const result = audit(source);
    expect(result.status).toBe('review-required');
    expect(result.normalizedCases?.[0].claims?.[1].evidenceLevel).toBe('conflicting');
    expect(result.semanticAudit?.summary.reviewRequired).toBe(1);
  });

  test('非接入生成物不得因同名字段被自动转换', () => {
    const source = { ...fixture(), collectionId: 'some-other-format' };
    expect(adaptIntakeV1ToDraft(source)).toBe(source);
    expect(audit(source).status).toBe('invalid');
  });

  test('真实入口识别注册能力但拒绝虚构能力和缺失证据', () => {
    const projectRoot = path.resolve(__dirname, '../..');
    const outputRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'intake-fidelity-cli-'));
    try {
      const artifacts = buildProductCenterTestPlanIntakeV1Artifacts({ projectRoot, outputRoot });
      const release = JSON.parse(fs.readFileSync(artifacts.releasePath, 'utf8'));
      const output = path.join(outputRoot, 'audit.json');
      const run = (document: unknown) => {
        fs.writeFileSync(artifacts.releasePath, JSON.stringify(document));
        const processResult = spawnSync(process.execPath, [require.resolve('tsx/cli'),
          'scripts/audit-product-center-test-case-input.ts',
          '--input', artifacts.releasePath, '--bindings', artifacts.bindingsPath,
          '--scope', 'full', '--output', output,
        ], { cwd: projectRoot, encoding: 'utf8' });
        expect(processResult.error).toBeUndefined();
        expect(processResult.status).toBe(1); // Eleven examples do not cover the full denominator.
        return JSON.parse(fs.readFileSync(output, 'utf8'));
      };
      const valid = run(release);
      expect(valid.schemaIssues).toEqual([]);
      expect(valid.executabilityAudit.summary).toMatchObject({ total: 11, executable: 11, reviewRequired: 0 });
      expect(valid.coverageAudit.summary.missing).toBeGreaterThan(0);
      expect(valid.generationGate.status).toBe('blocked');

      const unknown = structuredClone(release);
      unknown.cases[0].execution.capabilityIds.push('unregistered.example');
      const unknownResult = run(unknown);
      expect(unknownResult.executabilityAudit.cases[0].issues).toContainEqual({
        code: 'UNKNOWN_CAPABILITY', message: '未知能力：unregistered.example',
      });

      const missing = structuredClone(release);
      delete missing.cases[0].claims[0].evidenceLevel;
      expect(run(missing).status).toBe('invalid');
    } finally {
      fs.rmSync(outputRoot, { recursive: true, force: true });
    }
  });
});

test.describe('来源阻断分母逐案对账', () => {
  const decisions = () => ({ summary: { totalCases: 3, blockedCases: 1 }, cases: [
    { caseId: 'A', status: 'verified' }, { caseId: 'B', status: 'blocked' }, { caseId: 'C', status: 'not-applicable' },
  ] });
  test('返回实际阻断身份并保留全部分母', () => {
    expect(reconcileIntakeSourceSummary(decisions())).toEqual({ totalCases: 3, blockedCases: 1, blockedCaseIds: ['B'] });
  });
  test('汇总少报、缺项、未知状态和重复身份必须阻断', () => {
    const summaryDrift = decisions();
    summaryDrift.summary.blockedCases = 0;
    expect(() => reconcileIntakeSourceSummary(summaryDrift)).toThrow('INTAKE_SOURCE_SUMMARY_DRIFT');
    expect(() => reconcileIntakeSourceSummary({ cases: [] })).toThrow('INTAKE_SOURCE_DECISIONS_REQUIRED');
    const unknown = decisions();
    unknown.cases[1].status = 'unknown';
    expect(() => reconcileIntakeSourceSummary(unknown)).toThrow('INTAKE_SOURCE_DECISION_INVALID');
    const duplicate = decisions();
    duplicate.cases[1].caseId = 'A';
    expect(() => reconcileIntakeSourceSummary(duplicate)).toThrow('INTAKE_SOURCE_DECISION_DUPLICATE:A');
  });
});
