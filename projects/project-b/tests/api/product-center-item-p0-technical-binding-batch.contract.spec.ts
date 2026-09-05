import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import type { AutomationRecipe } from '../../automation/recipe/automation-recipe';
import { validateAutomationRecipe } from '../../automation/recipe/recipe-validator';
import { productCenterRecipeCapabilityContracts } from '../../adapters/product-center/product-center-recipe-capabilities';
import { buildProductCenterItemP0TechnicalBindingBatchArtifacts } from '../../scripts/build-product-center-item-p0-technical-binding-batch';
import { buildProductCenterItemP0WaveDRuntimeArtifacts } from '../../scripts/build-product-center-item-p0-wave-d-runtime-acceptance';

const projectRoot = path.resolve(__dirname, '../..');

test.describe('商品中心商品 P0 批量技术绑定门禁', () => {
  test('应一次性锁定36条用例和17个能力包', async () => {
    const { batch } = buildProductCenterItemP0TechnicalBindingBatchArtifacts({
      projectRoot,
      generatedAt: '2026-07-30T00:00:00.000Z',
    });

    expect(batch.summary).toEqual({
      total: 36,
      uniqueCases: 36,
      contentApproved: 36,
      technicalEvidenceRequired: 0,
      recipeRepairRequired: 0,
      workPackages: 17,
      readyForRecipeGeneration: 36,
      generatedRecipes: 36,
      runtimeSelected: 36,
      evidenceIntakeReceived: 5,
      implementationCovered: 1,
      evidencePartial: 3,
      evidenceNotCovered: 1,
      authenticatedAccepted: 36,
    });
    expect(new Set(batch.entries.map((entry) => entry.caseId)).size).toBe(36);
    expect(batch.workPackages.reduce((total, item) => total + item.caseCount, 0)).toBe(36);
    expect(batch.waves.map((wave) => ({
      id: wave.id,
      caseCount: wave.caseCount,
      workPackageCount: wave.workPackageCount,
    }))).toEqual([
      { id: 'wave-a-combo', caseCount: 8, workPackageCount: 5 },
      { id: 'wave-b-list', caseCount: 12, workPackageCount: 4 },
      { id: 'wave-c-standard-create', caseCount: 8, workPackageCount: 5 },
      { id: 'wave-d-edit-and-rules', caseCount: 8, workPackageCount: 3 },
    ]);
  });

  test('应消费四个波次运行验收并整波放行36条', async () => {
    const { batch } = buildProductCenterItemP0TechnicalBindingBatchArtifacts({
      projectRoot,
      generatedAt: '2026-07-30T00:00:00.000Z',
    });
    const waveA = batch.waves.find((wave) => wave.id === 'wave-a-combo');
    const waveB = batch.waves.find((wave) => wave.id === 'wave-b-list');
    const waveC = batch.waves.find((wave) => wave.id === 'wave-c-standard-create');
    const mapped = batch.workPackages.filter((item) => item.waveId === 'wave-a-combo');

    expect(mapped.map((item) => item.evidenceIntake?.coverageStatus).sort()).toEqual([
      'covered',
      'not-covered',
      'partial',
      'partial',
      'partial',
    ]);
    expect(mapped.every((item) => item.generationAllowed === true)).toBe(true);
    expect(waveA).toMatchObject({
      status: 'runtime-accepted',
      generatedRecipeCount: 8,
      executionAllowed: true,
    });
    expect(waveB).toMatchObject({
      status: 'runtime-accepted',
      generatedRecipeCount: 12,
      executionAllowed: true,
    });
    expect(waveC).toMatchObject({
      status: 'runtime-accepted',
      generatedRecipeCount: 8,
      executionAllowed: true,
    });
    const waveD = batch.waves.find((wave) => wave.id === 'wave-d-edit-and-rules');
    expect(waveD).toMatchObject({
      status: 'runtime-accepted',
      generatedRecipeCount: 8,
      executionAllowed: true,
    });
    expect(batch.entries.filter((entry) => ['wave-b-list', 'wave-c-standard-create', 'wave-d-edit-and-rules'].includes(entry.waveId))
      .every((entry) => entry.generationAllowed === true)).toBe(true);
    expect(batch.summary.authenticatedAccepted).toBe(36);
  });

  test('Wave D 运行报告必须固化为8条 acceptance 与共享 Recipe', async () => {
    const artifacts = buildProductCenterItemP0WaveDRuntimeArtifacts({ projectRoot });

    expect(artifacts.acceptance).toMatchObject({
      acceptanceId: 'product-center-item-p0-wave-d-runtime-acceptance',
      waveId: 'wave-d-edit-and-rules',
      runId: 'AUTO_AUDIT_P0_WAVE_D_20260731_14',
      status: 'accepted',
      caseIds: expect.arrayContaining(['TC-ITEM-STD-007', 'TC-ITEM-STD-031', 'TC-ITEM-STD-096']),
    });
    expect(artifacts.acceptance.caseIds).toHaveLength(8);
    expect(artifacts.acceptance.acceptedCaseIds).toEqual(artifacts.acceptance.caseIds);
    expect(artifacts.acceptance.mutationIntentClosure).toEqual({ total: 7, cleanupComplete: 7, incomplete: 0 });
    expect(artifacts.acceptance.executionLedger).toEqual({ entries: 8, residueVerified: 8, incomplete: 0 });
    expect(Object.values(artifacts.acceptance.cleanupEvidence).every((count) => count === 0)).toBe(true);
    expect(artifacts.recipeCollection.recipes).toHaveLength(8);
    expect(artifacts.recipeCollection.recipes.find((recipe) => recipe.caseId === 'TC-ITEM-STD-011')?.title)
      .toBe('同一个一级分类下，新建相同商品名称的商品，创建失败');
    expect(artifacts.recipeCollection.recipes.find((recipe) => recipe.caseId === 'TC-ITEM-STD-031')?.title)
      .toBe('标准商品编辑基础信息后保存成功');
    expect(artifacts.recipeCollection.recipes.every((recipe) => (
      recipe.capabilities[0]?.id === 'navigation.sidebar.open'
      && recipe.executionPolicy.caseLevelExecutionAllowed === false
    ))).toBe(true);
  });

  test('应保持单例阻断并允许完整波次统一生成和运行', async () => {
    const { batch } = buildProductCenterItemP0TechnicalBindingBatchArtifacts({
      projectRoot,
      generatedAt: '2026-07-30T00:00:00.000Z',
    });

    expect(batch).toMatchObject({
      status: 'runtime-accepted',
      batchGate: {
        totalDenominatorLocked: true,
        caseLevelReleaseAllowed: false,
        waveLevelReleaseAllowed: true,
        generationAllowed: true,
        executionAllowed: true,
        releasedWaveIds: ['wave-a-combo', 'wave-b-list', 'wave-c-standard-create', 'wave-d-edit-and-rules'],
        reasonCode: 'ALL_WAVES_RUNTIME_ACCEPTED',
      },
      recipeCollection: {
        generatedRecipeCount: 36,
        executionMode: 'wave-shared-chain',
        caseLevelExecutionAllowed: false,
        executionAllowed: true,
      },
    });
    expect(batch.entries.filter((entry) => ['wave-a-combo', 'wave-b-list', 'wave-c-standard-create', 'wave-d-edit-and-rules'].includes(entry.waveId))
      .every((entry) => entry.generationAllowed === true)).toBe(true);
    expect(batch.waves.every((wave) =>
      wave.caseLevelReleaseAllowed === false && wave.waveLevelReleaseAllowed === true)).toBe(true);
  });

  test('Wave B 验收应绑定 Run 09 原始证据并完成零残留闭环', async () => {
    const acceptance = JSON.parse(fs.readFileSync(path.join(
      projectRoot,
      'contracts/product-center/reviews/product-center-item-p0-wave-b-runtime-acceptance.json',
    ), 'utf8')) as {
      runId: string;
      caseIds: string[];
      acceptedCaseIds: string[];
      sourceArtifact: { path: string; sha256: string };
      mutationIntentClosure: { total: number; cleanupComplete: number; incomplete: number };
      executionLedger: { entries: number; residueVerified: number; incomplete: number };
      cleanupEvidence: Record<string, number>;
    };
    const source = fs.readFileSync(path.join(projectRoot, acceptance.sourceArtifact.path));

    expect(acceptance.runId).toBe('AUTO_AUDIT_P0_WAVE_B_20260730_09');
    expect(acceptance.caseIds).toHaveLength(12);
    expect(new Set(acceptance.acceptedCaseIds)).toEqual(new Set(acceptance.caseIds));
    expect(createHash('sha256').update(source).digest('hex')).toBe(acceptance.sourceArtifact.sha256);
    expect(acceptance.mutationIntentClosure).toEqual({ total: 7, cleanupComplete: 7, incomplete: 0 });
    expect(acceptance.executionLedger).toEqual({ entries: 10, residueVerified: 10, incomplete: 0 });
    expect(Object.values(acceptance.cleanupEvidence).every((count) => count === 0)).toBe(true);
  });

  test('Wave C 验收应绑定 Run 13 原始证据并完成商品与依赖零残留闭环', async () => {
    const acceptance = JSON.parse(fs.readFileSync(path.join(
      projectRoot,
      'contracts/product-center/reviews/product-center-item-p0-wave-c-runtime-acceptance.json',
    ), 'utf8')) as {
      runId: string;
      caseIds: string[];
      acceptedCaseIds: string[];
      sourceArtifact: { path: string; sha256: string };
      mutationIntentClosure: { total: number; cleanupComplete: number; incomplete: number };
      executionLedger: { entries: number; residueVerified: number; incomplete: number };
      cleanupEvidence: Record<string, number>;
    };
    const source = fs.readFileSync(path.join(projectRoot, acceptance.sourceArtifact.path));

    expect(acceptance.runId).toBe('AUTO_AUDIT_P0_WAVE_C_20260730_13');
    expect(acceptance.caseIds).toHaveLength(8);
    expect(new Set(acceptance.acceptedCaseIds)).toEqual(new Set(acceptance.caseIds));
    expect(createHash('sha256').update(source).digest('hex')).toBe(acceptance.sourceArtifact.sha256);
    expect(acceptance.mutationIntentClosure).toEqual({ total: 6, cleanupComplete: 6, incomplete: 0 });
    expect(acceptance.executionLedger).toEqual({ entries: 12, residueVerified: 12, incomplete: 0 });
    expect(Object.values(acceptance.cleanupEvidence).every((count) => count === 0)).toBe(true);
  });

  test('Wave D 的TC-ITEM-STD-007必须遵循正式只读分类选择规则', async () => {
    const canonical = JSON.parse(fs.readFileSync(path.join(
      projectRoot,
      'contracts/product-center/test-cases/canonical/product-center-item-canonical-release.json',
    ), 'utf8')) as {
      cases: Array<{ canonicalId: string; priority: string; claimIds: string[] }>;
    };
    const case007 = canonical.cases.find((item) => item.canonicalId === 'TC-ITEM-STD-007');
    const source = fs.readFileSync(path.join(
      projectRoot,
      'tests/generated/product-center-item-p0-wave-d.generated.spec.ts',
    ), 'utf8');
    const execution = source.match(/async function verifyCategoryLeafSelection[\s\S]*?\n  }/)?.[0] ?? '';

    expect(case007).toMatchObject({ priority: 'P1' });
    expect(case007?.claimIds).toHaveLength(8);
    expect(execution).toContain('ProductCenterItemCategoryLeafProbeFlow');
    expect(execution).toContain('openStandardCreateFromCurrentList');
    expect(execution).toContain('selectParentWithChildren');
    expect(execution).toContain('selectLeaf');
    expect(execution).not.toContain('fillItemName');
    expect(execution).not.toContain('clickSave');
    expect(execution).not.toContain('recordIntent');
  });

  test('Wave D 的TC-ITEM-STD-031不得增加正式 Claim 之外的分类编辑动作', async () => {
    const source = fs.readFileSync(path.join(
      projectRoot,
      'tests/generated/product-center-item-p0-wave-d.generated.spec.ts',
    ), 'utf8');
    const editExecution = source.match(
      /await editPage\.fillItemName\(names\.editUpdated\);[\s\S]*?const updatePath/,
    )?.[0] ?? '';

    expect(source).toContain('categories.childC.id');
    expect(editExecution).toContain('readSelectedCategoryPath');
    expect(editExecution).not.toContain('selectCategoryPath');
  });

  test('证据请求不得推断业务规则或虚构适配器', async () => {
    const { evidenceRequest } = buildProductCenterItemP0TechnicalBindingBatchArtifacts({
      projectRoot,
      generatedAt: '2026-07-30T00:00:00.000Z',
    });

    expect(evidenceRequest.summary).toEqual({ workPackages: 0, cases: 0 });
    expect(evidenceRequest.waves).toEqual([]);
    expect(evidenceRequest.guardrails).toEqual({
      businessRulesMayBeInferred: false,
      adaptersMayBeInvented: false,
      mutationReplayWithoutReconciliation: false,
      serverIdsMustBeRecordedImmediately: true,
      cleanupMustVerifyUiAndApiZeroResidue: true,
    });
    expect(JSON.stringify(evidenceRequest)).not.toContain('proposedAdapterId');
    expect(JSON.stringify(evidenceRequest)).not.toContain('generationAllowed":true');
  });

  test('四个波次 Recipe 应全部通过标准校验且首能力为侧边栏导航', async () => {
    const recipes = ['a', 'b', 'c', 'd'].flatMap((wave) => {
      const document = JSON.parse(fs.readFileSync(path.join(
        projectRoot,
        `contracts/product-center/recipes/product-center-item-p0-wave-${wave}-recipes.json`,
      ), 'utf8')) as { recipes: AutomationRecipe[] };
      return document.recipes;
    });

    expect(recipes).toHaveLength(36);
    expect(recipes.every((recipe) => (
      recipe.capabilities[0]?.id === 'navigation.sidebar.open'
      && recipe.executionPolicy?.mode === 'wave-shared-chain'
      && recipe.executionPolicy.caseLevelExecutionAllowed === false
    ))).toBe(true);
    expect(recipes.every((recipe) => fs.existsSync(path.join(
      projectRoot,
      recipe.executionPolicy?.orchestratorSpecPath ?? '',
    )))).toBe(true);
    for (const recipe of recipes) {
      expect(validateAutomationRecipe(recipe, productCenterRecipeCapabilityContracts)).toEqual([]);
    }
  });
});
