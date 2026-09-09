import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import {
  buildProductCenterSourceGovernedExecutionResult,
  assertProductCenterSourceGovernedExecutionResultCurrent,
  mergeSourceGovernedExecutionCases,
  type SourceGovernedExecutionCase,
} from '../../scripts/build-product-center-source-governed-execution-result';
import {
  buildProductCenterSourceGovernedExecutionPlan,
  fingerprintProductCenterSourceGovernedSelection,
} from '../../scripts/build-product-center-source-governed-execution-plan';
import { matchesCurrentCaseAndImplementationFingerprints } from '../../automation/system-test/system-test-case-state-arbiter';
import { buildProductCenterCanonicalAutomationContractBatchArtifacts } from '../../scripts/build-product-center-canonical-automation-contract-batch';
import { buildProductCenterLegacy116Resolution } from '../../scripts/build-product-center-legacy-116-resolution';
import { loadProductCenterSourceGovernance } from '../../utils/product-center-source-governance';
import { loadProductCenterExecutionDecisions } from '../../utils/product-center-execution-decisions';
import { auditSemanticDuplicateCandidates } from '../../utils/product-center-semantic-duplicate-gate';

const projectRoot = path.resolve(__dirname, '../..');

test.describe('商品中心来源治理执行门禁', () => {
  test('计划与结果必须绑定当前内容和实际选择集指纹', () => {
    const { report: plan } = buildProductCenterSourceGovernedExecutionPlan({
      projectRoot,
      generatedAt: '2026-09-05T00:00:00.000Z',
      write: false,
    });
    expect(plan.planFingerprint).toMatch(/^[a-f0-9]{64}$/);
    expect(plan.selectionFingerprint).toBe(
      fingerprintProductCenterSourceGovernedSelection(plan.execution),
    );
    const executionSelection = {
      selectedCaseIds: [] as string[],
      runners: plan.execution.runners.map((runner) => ({
        runnerId: runner.runnerId,
        spec: runner.spec,
        selectedCaseIds: [] as string[],
        ...('sourceRecoveryCaseIds' in runner ? { sourceRecoveryCaseIds: [] as string[] } : {}),
      })),
    };
    const currentResult = {
      planFingerprint: plan.planFingerprint,
      selectionFingerprint: fingerprintProductCenterSourceGovernedSelection(executionSelection),
      executionSelection,
      executionCases: [],
    };
    expect(() => assertProductCenterSourceGovernedExecutionResultCurrent(plan, currentResult))
      .not.toThrow();
    expect(() => assertProductCenterSourceGovernedExecutionResultCurrent(plan, {
      ...currentResult,
      planFingerprint: '0'.repeat(64),
    })).toThrow('SYSTEM_TEST_ARTIFACT_STALE:UPSTREAM_FINGERPRINT_MISMATCH');
    expect(() => assertProductCenterSourceGovernedExecutionResultCurrent(plan, {
      ...currentResult,
      selectionFingerprint: '0'.repeat(64),
    })).toThrow('SYSTEM_TEST_ARTIFACT_STALE:SELECTION_FINGERPRINT_MISMATCH');
  });

  test('应按最新治理结论守恒分类并接入组与商品运行器', async () => {
    const governance = loadProductCenterSourceGovernance(projectRoot);
    const sourceBlockedCaseIds = [...governance.decisions.values()]
      .filter((item) => item.currentGoalBlocking)
      .map((item) => item.caseId);

    const { report } = buildProductCenterSourceGovernedExecutionPlan({
      projectRoot,
      generatedAt: '2026-08-17T00:00:00.000Z',
      write: false,
    });
    const executionDecisions = [...loadProductCenterExecutionDecisions(projectRoot).values()];
    expect(report.summary.total).toBeGreaterThanOrEqual(governance.decisions.size);
    expect(new Set(report.tasks.map((item) => item.caseId)).size).toBe(report.summary.total);
    expect(report.summary.execute
      + report.summary.sourceRecovery
      + report.summary.deferred
      + report.summary.blockedSource
      + report.summary.blockedTechnical
      + report.summary.productDefect
      + report.summary.handled
      + report.summary.notApplicable).toBe(report.summary.total);
    expect(report.summary.productDefect).toBe(1);
    const autoResolutionCases = JSON.parse(fs.readFileSync(path.join(
      projectRoot,
      'contracts/product-center/reviews/product-center-source-auto-resolution.json',
    ), 'utf8')).cases as Array<{
      caseId: string;
      sourceRecovery?: {
        disposition?: string;
        promotionAllowed?: boolean;
      } | null;
    }>;
    const recoveredSourceCaseIds = new Set(autoResolutionCases.filter((item) => (
      item.sourceRecovery?.promotionAllowed === true
      && item.sourceRecovery?.disposition === 'reconstructed-current-baseline'
    )).map((item) => item.caseId));
    const recoveredHandled = recoveredSourceCaseIds.size;
    expect(report.summary.handled).toBe(
      executionDecisions.filter((item) => item.status === 'handled').length + recoveredHandled,
    );
    expect(report.summary.notApplicable).toBe(
      report.tasks.filter((item) => item.action === 'not-applicable').length,
    );
    expect(report.summary.deferred).toBe(executionDecisions.filter((item) => item.status === 'deferred').length);
    expect(report.tasks.filter((item) => item.action === 'deferred').map((item) => item.caseId).sort())
      .toEqual(executionDecisions
        .filter((item) => item.status === 'deferred')
        .map((item) => item.caseId)
        .sort());
    expect(report.tasks.filter((item) => item.action === 'product-defect').map((item) => item.caseId).sort())
      .toEqual(['TC-GRP-PKG-040']);
    expect(report.tasks.filter((item) => item.action === 'not-applicable').map((item) => item.caseId).sort())
      .toEqual([
        'TC-GRP-ADD-010',
        'TC-GRP-ADD-011',
        'TC-GRP-MTH-013',
        'TC-GRP-PKG-015',
        'TC-GRP-PKG-025',
        'TC-GRP-PKG-032',
        'TC-GRP-SPEC-024',
        'TC-GRP-TASTE-014',
        'TC-ITEM-PKG-007',
        'TC-ITEM-PKG-066',
        'TC-ITEM-STD-025',
        'TC-ITEM-STD-026',
        'TC-ITEM-STD-027',
        'TC-ITEM-STD-034',
        'TC-ITEM-STD-040',
        'TC-ITEM-STD-060',
      ]);
    expect(report.tasks
      .filter((item) => item.action === 'execute')
      .map((item) => item.caseId))
      .toEqual(expect.arrayContaining([
        'TC-GRP-PKG-011',
        'TC-GRP-PKG-044',
      ]));
    const executionDecisionCaseIds = new Set(loadProductCenterExecutionDecisions(projectRoot).keys());
    const expectedBlockedSourceCaseIds = sourceBlockedCaseIds.filter((caseId) => (
      !executionDecisionCaseIds.has(caseId)
      && !recoveredSourceCaseIds.has(caseId)
    ));
    expect(report.summary.blockedSource).toBe(expectedBlockedSourceCaseIds.length);
    expect(report.tasks.filter((item) => item.action === 'blocked-source').map((item) => item.caseId).sort())
      .toEqual(expectedBlockedSourceCaseIds.sort());
    expect(report.execution.selectedCaseIds).not.toContain('TC-GRP-PKG-020');
    expect(report.execution.selectedCaseIds).not.toContain('TC-ITEM-PKG-007');
    expect(report.tasks.find((item) => item.caseId === 'TC-GRP-PKG-020')).toBeUndefined();
    expect(report.execution.runners.map((item) => item.runnerId)).toEqual(['group', 'item', 'remaining']);
    expect(report.execution.runners.find((item) => item.runnerId === 'group')?.selectedCaseIds)
      .toEqual(expect.arrayContaining([
        'TC-GRP-ATTR-001',
        'TC-GRP-ATTR-002',
        'TC-GRP-ADD-019',
        'TC-GRP-MTH-014',
        'TC-GRP-TASTE-015',
      ]));
    expect(report.tasks.find((item) => item.caseId === 'TC-GRP-ADD-031')?.action).toBe('deferred');
    expect(report.execution.runners.find((item) => item.runnerId === 'item')?.selectedCaseIds)
      .toEqual(expect.arrayContaining([
        'TC-ITEM-PKG-010',
        'TC-ITEM-PKG-017',
        'TC-ITEM-PKG-046',
      ]));
    expect(report.execution.runners.find((item) => item.runnerId === 'remaining')?.selectedCaseIds.sort())
      .toEqual([
        'TC-IMG-ITEM-029',
        'TC-IMG-ITEM-030',
        'TC-IMG-LIB-025',
        'TC-IMG-LIB-026',
        'TC-TAG-BDG-009',
        'TC-TAG-BDG-018',
        'TC-TAG-BDG-019',
        'TC-TAG-BDG-020',
        'TC-TAG-BDG-021',
        'TC-TAG-BDG-024',
        'TC-TAG-DESC-013',
        'TC-TAG-DESC-014',
        'TC-TAG-DESC-027',
        'TC-TAG-DESC-028',
        'TC-TAG-STAT-012',
        'TC-TAG-STAT-013',
        'TC-TAG-STAT-024',
        'TC-TAG-STAT-028',
        'TC-TAG-STAT-029',
      ]);
    expect(report.tasks.find((item) => item.caseId === 'TC-TAG-DESC-013')?.action).toBe('execute');
    expect(report.tasks.find((item) => item.caseId === 'TC-TAG-STAT-012')?.action).toBe('execute');
    expect(report.tasks.find((item) => item.caseId === 'TC-FLV-SEA-016')?.action).toBe('handled');
    expect(report.execution.runners.find((item) => item.runnerId === 'remaining')?.selectedCaseIds)
      .not.toEqual(expect.arrayContaining([
        'TC-FLV-SEA-015',
        'TC-FLV-SEA-016',
        'TC-FLV-SEA-046',
      ]));
    expect(report.tasks.find((item) => item.caseId === 'TC-GRP-PKG-030')?.action).toBe('execute');
    expect(report.tasks.find((item) => item.caseId === 'TC-ITEM-ADD-027')?.action).toBe('handled');
    expect(report.tasks.find((item) => item.caseId === 'TC-ITEM-ADD-034')?.action).toBe('handled');
    expect(report.revalidation.runners.find((item) => item.runnerId === 'group')?.selectedCaseIds)
      .toContain('TC-GRP-PKG-030');
    expect(report.revalidation.runners.find((item) => item.runnerId === 'item')?.selectedCaseIds)
      .toEqual(expect.arrayContaining(['TC-ITEM-ADD-027', 'TC-ITEM-ADD-034']));
    expect(new Set(report.revalidation.runners.flatMap((item) => item.selectedCaseIds)).size)
      .toBe(report.revalidation.selectedCaseIds.length);
  });

  test('实现指纹变化后旧产品偏差不得重新阻断当前用例', async () => {
    const repairQueuePath = path.join(
      projectRoot,
      '../deliverables/test-plan-governance/product-center-execution-repair-queue.json',
    );
    const repairQueue = JSON.parse(fs.readFileSync(repairQueuePath, 'utf8')) as {
      items: Array<{ caseId: string; classification: string; implementationFingerprintAtObservation?: string | null }>;
    };
    expect(repairQueue.items.find((item) => item.caseId === 'TC-ITEM-ADD-038')).toBeUndefined();
    expect(matchesCurrentCaseAndImplementationFingerprints({
      caseFingerprint: 'case-current',
      implementationFingerprint: 'implementation-old',
    }, 'case-current', 'implementation-new')).toBe(false);
    expect(matchesCurrentCaseAndImplementationFingerprints({
      caseFingerprint: 'case-current',
      implementationFingerprint: 'implementation-current',
    }, 'case-current', 'implementation-current')).toBe(true);

    const { report } = buildProductCenterSourceGovernedExecutionPlan({
      projectRoot,
      generatedAt: '2026-08-21T00:00:00.000Z',
      write: false,
    });
    const task038 = report.tasks.find((item) => item.caseId === 'TC-ITEM-ADD-038');
    expect(task038?.action).toBe('execute');
    expect(task038?.runnerId).toBe('item');
    expect(task038?.reason).toContain('已有可运行 flow 绑定');
  });

  test('组产品差异必须通过结构化附件交给公共失败分类器', async () => {
    const runner = fs.readFileSync(path.join(projectRoot, 'scripts/run-product-center-source-governed.ts'), 'utf8');
    const spec = fs.readFileSync(path.join(projectRoot, 'tests/generated/product-center-group.generated.spec.ts'), 'utf8');
    expect(spec).toContain('product-center-group-product-difference-evidence');
    expect(runner).toContain("'product-center-group-product-difference-evidence'");
    expect(runner).toContain("'product-center-product-difference-evidence'");
    expect(runner).toContain('productMismatchConfirmed: latest.productDifference?.productMismatchConfirmed');
    expect(runner).toContain('executionPathEquivalent: latest.productDifference?.executionPathEquivalent');
  });

  test('组、商品与历史剩余运行入口都必须包含来源阻断二次校验', async () => {
    const sourceRunner = fs.readFileSync(
      path.join(projectRoot, 'scripts/run-product-center-source-governed.ts'),
      'utf8',
    );
    const groupSpec = fs.readFileSync(
      path.join(projectRoot, 'tests/generated/product-center-group.generated.spec.ts'),
      'utf8',
    );
    const itemSpec = fs.readFileSync(
      path.join(projectRoot, 'tests/generated/product-center-item-216.generated.spec.ts'),
      'utf8',
    );
    const remainingSpec = fs.readFileSync(
      path.join(projectRoot, 'tests/generated/product-center-legacy-remaining.generated.spec.ts'),
      'utf8',
    );
    const productFixture = fs.readFileSync(
      path.join(projectRoot, 'fixtures/product-center.fixture.ts'),
      'utf8',
    );
    const groupRunner = fs.readFileSync(
      path.join(projectRoot, 'scripts/run-product-center-group-with-watchdog.ts'),
      'utf8',
    );
    const itemRunner = fs.readFileSync(
      path.join(projectRoot, 'scripts/run-product-center-item-213.ts'),
      'utf8',
    );
    const packageJson = JSON.parse(fs.readFileSync(path.join(projectRoot, 'package.json'), 'utf8')) as {
      scripts: Record<string, string>;
    };
    expect(groupSpec).toContain('sourceBlockedCaseIds');
    expect(groupSpec).toContain('!sourceBlockedCaseIds.has(item.caseId)');
    expect(groupSpec).toContain('deferredCaseIds');
    expect(groupSpec).toContain('selectedDeferredCaseIds');
    expect(groupSpec).toContain('!deferredCaseIds.has(item.caseId)');
    expect(itemSpec).toContain('selectedSourceBlockedCaseIds');
    expect(itemSpec).toContain('商品用例来源证据仍处于阻断状态');
    expect(itemSpec).toContain('selectedDeferredCaseIds');
    expect(itemSpec).toContain('商品执行计划包含当前延期用例');
    expect(itemSpec).toContain('!deferredCaseIds.has(item.caseId)');
    expect(itemSpec).toContain('selectedNotApplicableCaseIds');
    expect(itemSpec).toContain('商品执行计划包含当前版本不适用用例');
    expect(itemSpec).toContain('!notApplicableCaseIds.has(item.caseId)');
    expect(itemSpec).toContain("testInfo.attach('test-execution-receipt'");
    expect(itemSpec).toContain("receiptVersion: '4.0.0'");
    expect(itemSpec).toContain('fingerprintReceiptEvidence(receipt)');
    expect(remainingSpec).toContain('requireVerifiedSource');
    expect(remainingSpec).toContain('来源证据仍处于阻断状态');
    for (const caseId of [
      'TC-IMG-ITEM-029',
      'TC-IMG-ITEM-030',
      'TC-IMG-LIB-025',
      'TC-IMG-LIB-026',
    ]) {
      expect(remainingSpec).toContain(`tag: ['@case-${caseId}']`);
    }
    expect(remainingSpec).not.toContain('TC-FLV-SEA-');
    expect(remainingSpec).not.toMatch(/tag:\s*\['case-/);
    expect(sourceRunner).toContain('beginSystemTestRepairAttempt');
    expect(sourceRunner).toContain('REPAIR_GUARD_BLOCKED');
    expect(sourceRunner).toContain('--repair-diagnosis=');
    expect(sourceRunner).toContain('readSystemTestRepairDiagnosis');
    expect(sourceRunner).toContain('invalidatedAttemptIds: repairDiagnosis?.supersedesAttemptIds');
    expect(sourceRunner).toContain('issueSystemTestExecutionGrant');
    expect(sourceRunner).toContain('revokeSystemTestExecutionGrant');
    expect(sourceRunner).toContain("createProductCenterAuthBatchSession('pc-source-governed-auth-')");
    expect(sourceRunner).toContain('...authSession.env()');
    expect(sourceRunner).toContain('authSession.cleanup()');
    expect(sourceRunner).toContain("['canonical-case-id', 'group-case-id', 'case-id'].includes(item.type ?? '')");
    expect(sourceRunner).toContain("'pages/sidebar.page.ts'");
    expect(sourceRunner).toContain("'pages/product-center/tag-management.page.ts'");
    expect(productFixture).toContain('assertSystemTestExecutionGrant');
    expect(productFixture).toContain("item.type === 'canonical-case-id' || item.type === 'group-case-id'");
    expect(groupSpec).toContain("from '../../fixtures/product-center.fixture'");
    expect(itemSpec).toContain("from '../../fixtures/product-center.fixture'");
    expect(remainingSpec).toContain("from '../../fixtures/product-center.fixture'");
    expect(groupRunner).toContain('assertSystemTestExecutionGrant');
    expect(groupRunner).toContain('GOVERNED_EXECUTION_CASE_IDS_REQUIRED:group');
    expect(itemRunner).toContain('assertSystemTestExecutionGrant');
    expect(itemRunner).toContain('GOVERNED_EXECUTION_CASE_IDS_REQUIRED:item');
    expect(packageJson.scripts['test:product-center:group:raw']).toContain('run-product-center-source-governed.ts');
    expect(packageJson.scripts['test:product-center:item-213']).toContain('run-product-center-source-governed.ts');
  });

  test('原116条仅允许已确认的真实业务冲突进入人工决策', async () => {
    const { report } = buildProductCenterLegacy116Resolution({
      projectRoot,
      generatedAt: '2026-08-17T00:00:00.000Z',
      write: false,
    });
    expect(report.summary.total).toBe(116);
    expect(report.summary.humanRequired).toBe(1);
    expect(report.summary.aiProcessOwned).toBe(115);
    expect(report.cases.filter((item) => item.humanRequired).map((item) => item.caseId))
      .toEqual(['TC-GRP-PKG-040']);
    expect(report.summary.confirmedProductDefects).toBe(0);
    expect(report.cases.filter((item) => item.disposition === 'confirmed-product-defect').map((item) => item.caseId).sort())
      .toEqual([]);
    expect(report.cases.filter((item) => item.disposition === 'external-environment').map((item) => item.caseId))
      .toEqual(expect.arrayContaining(['TC-ITEM-PKG-070', 'TC-ITEM-STD-080', 'TC-ITEM-STD-083']));
    expect(report.cases.filter((item) => item.disposition === 'external-environment')).toHaveLength(14);
    expect(report.cases.filter((item) => item.disposition === 'isolated-dataset').map((item) => item.caseId))
      .toEqual(['TC-TAG-STAT-025']);
  });

  test('商品严格合同不得放行来源阻断用例', async () => {
    const governance = loadProductCenterSourceGovernance(projectRoot);
    const blockedItemCaseIds = new Set([...governance.decisions.values()]
      .filter((item) => item.module === 'brand-item' && item.currentGoalBlocking)
      .map((item) => item.caseId));
    const { report } = buildProductCenterCanonicalAutomationContractBatchArtifacts({
      rootDir: projectRoot,
      generatedAt: '2026-08-17T00:00:00.000Z',
      write: false,
    });
    const governedEntries = report.entries.filter((item) => blockedItemCaseIds.has(item.canonicalCaseId));
    expect(governedEntries.filter((item) => item.classification === 'strict-generatable')).toEqual([]);
    for (const entry of governedEntries.filter((item) => item.classification !== 'not-applicable')) {
      expect(entry.blockingReasons, entry.canonicalCaseId).toContain('SOURCE_EVIDENCE_BLOCKED');
    }
    for (const entry of report.entries.filter((item) => item.classification === 'strict-generatable')) {
      expect(
        governance.decisions.get(entry.canonicalCaseId)?.currentGoalBlocking ?? false,
        entry.canonicalCaseId,
      ).toBe(false);
    }
  });

  test('语义重复必须在来源治理阶段显式暴露，不得只靠 caseId 去重', async () => {
    const businessRules = JSON.parse(fs.readFileSync(
      path.join(projectRoot, 'contracts/product-center/business-rules/product-center-item-authoritative-business-rules.json'),
      'utf8',
    )) as { candidateRules: unknown[] };
    const candidates = auditSemanticDuplicateCandidates(businessRules.candidateRules as never[]);
    const duplicate = candidates.find((item) => item.caseIds.includes('TC-ITEM-ADD-027'));
    expect(duplicate?.caseIds).toEqual(['TC-ITEM-ADD-027', 'TC-ITEM-ADD-034']);
    expect(duplicate?.sourceCitation).toBe('BR-DEL-006');

    const { report } = buildProductCenterSourceGovernedExecutionPlan({
      projectRoot,
      generatedAt: '2026-08-17T00:00:00.000Z',
      write: false,
    });
    expect(report.semanticDuplicateCandidates).toEqual(expect.arrayContaining([
      expect.objectContaining({ caseIds: ['TC-ITEM-ADD-027', 'TC-ITEM-ADD-034'] }),
    ]));
    expect(report.execution.selectedCaseIds).not.toEqual(expect.arrayContaining(['TC-ITEM-ADD-027', 'TC-ITEM-ADD-034']));
  });

  test('引用加料商品删除不得用通用成功提示覆盖精确业务终态', async () => {
    const flowSource = fs.readFileSync(
      path.join(projectRoot, 'flows/product-center/item-216/addon-item-216.flow.ts'),
      'utf8',
    );
    const handlerSource = flowSource.slice(
      flowSource.indexOf('private async deleteReferencedByAddonGroup('),
      flowSource.indexOf('private async deleteReferencedByMenu('),
    );
    expect(handlerSource).toContain('const deletionBlocked = apiCount === 1;');
    expect(handlerSource).toContain("status: deletionBlocked ? 'verified' : 'observed-mismatch'");
    expect(handlerSource).toContain("comparison: deletionBlocked ? 'matched' : 'mismatched'");
    expect(handlerSource).toContain('BITEM-2014\\s*[:：]\\s*加料已被加料组使用');
    expect(handlerSource).not.toContain('/reference|引用|cannot|fail|解除/i');
  });

  test('应按最新计划汇总运行证据并确认已执行用例零残留', async () => {
    const { report } = buildProductCenterSourceGovernedExecutionResult({
      projectRoot,
      generatedAt: '2026-08-17T04:00:00.000Z',
      write: false,
    });
    expect(report.summary.total).toBe(report.executionCases.length + report.nonExecutionTasks.length);
    expect(report.summary.executed).toBe(
      report.summary.passed + report.summary.failed + report.summary.skipped + report.summary.notRun,
    );
    expect(report.summary.executed).toBe(report.executionCases.length);
    expect(report.summary.blockedSource
      + report.summary.deferred
      + report.summary.blockedTechnical
      + report.summary.productDefect
      + report.summary.handled
      + report.summary.notApplicable
      + report.executionCases.length).toBe(report.summary.total);
    expect(report.cleanup.status).not.toBe('residue-detected');
    expect(report.cleanup.residueVerifiedEntries).toBe(report.cleanup.entries);
    expect(report.executionCases.some((item) => [
      'TC-FLV-SEA-015',
      'TC-FLV-SEA-046',
    ].includes(item.caseId))).toBe(false);
    expect(Object.fromEntries(
      report.executionCases
        .filter((item) => [
          'TC-IMG-ITEM-029',
          'TC-IMG-ITEM-030',
          'TC-IMG-LIB-025',
          'TC-IMG-LIB-026',
        ].includes(item.caseId))
        .map((item) => [item.caseId, item.status]),
    )).toEqual({
      'TC-IMG-ITEM-029': 'failed',
      'TC-IMG-ITEM-030': 'passed',
      'TC-IMG-LIB-025': 'passed',
      'TC-IMG-LIB-026': 'passed',
    });
  });

  test('定向执行合并时只替换选中用例并保留其他当前结果', async () => {
    const createCase = (caseId: string, status: SourceGovernedExecutionCase['status']): SourceGovernedExecutionCase => ({
      caseId,
      module: 'brand-item',
      title: caseId,
      status,
      latestAttempt: null,
      attemptCount: 0,
      history: [],
    });
    const merged = mergeSourceGovernedExecutionCases(
      [createCase('TC-ITEM-STD-001', 'passed'), createCase('TC-ITEM-STD-002', 'failed')],
      [createCase('TC-ITEM-STD-001', 'failed')],
      ['TC-ITEM-STD-001'],
    );
    expect(merged.map((item) => [item.caseId, item.status])).toEqual([
      ['TC-ITEM-STD-001', 'failed'],
      ['TC-ITEM-STD-002', 'failed'],
    ]);
  });

  test('定向执行默认不得盲目合并全局历史结果', () => {
    const source = fs.readFileSync(path.join(projectRoot, 'scripts/run-product-center-source-governed.ts'), 'utf8');
    expect(source).toContain("PC_SOURCE_GOVERNED_MERGE_PREVIOUS: process.env.PC_SOURCE_GOVERNED_MERGE_PREVIOUS === 'true' ? 'true' : 'false'");
    expect(source).not.toContain("requestedCaseIds === null ? 'false' : 'true'");
  });
});
