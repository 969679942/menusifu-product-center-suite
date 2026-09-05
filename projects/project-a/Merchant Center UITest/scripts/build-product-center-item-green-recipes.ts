import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { productCenterRecipeCapabilityContracts } from '../adapters/product-center/product-center-recipe-capabilities';
import type { AutomationRecipe, RecipeAction } from '../automation/recipe/automation-recipe';
import { recipeCollectionFingerprint, validateAutomationRecipe } from '../automation/recipe/recipe-validator';
import { sidebarNavigationCapability } from '../automation/recipe/sidebar-navigation-capability';
import { scanGeneratedArtifacts } from '../utils/product-center-run-safety';

type GreenGroup = {
  groupId: string;
  lane: 'green' | 'yellow';
  productType: '标准商品' | '套餐商品' | '加料商品' | '页面补充';
  scenarioFamily: string;
  operation: string;
  riskLevel: 'L0' | 'L1' | 'L2' | 'L3';
  caseIds: string[];
  representativeCaseId: string;
  reusableAcceptedTemplateCaseIds: string[];
  evidenceShapes: Record<string, string>;
};

type FastLaneDocument = {
  fingerprint: string;
  automaticTechnicalPipeline: { groups: GreenGroup[] };
};

export function buildProductCenterItemGreenRecipeArtifacts(options: {
  projectRoot?: string;
  outputRoot?: string;
  generatedAt?: string;
} = {}) {
  const projectRoot = path.resolve(options.projectRoot ?? path.resolve(__dirname, '..'));
  const outputRoot = path.resolve(options.outputRoot ?? projectRoot);
  const fastLanePath = path.join(
    projectRoot,
    'contracts/product-center/reviews/automation-fast-lane/product-center-item-automation-fast-lane.json',
  );
  const fastLane = readJson<FastLaneDocument>(fastLanePath);
  const greenGroups = fastLane.automaticTechnicalPipeline.groups.filter((group) => group.lane === 'green');
  const recipes = greenGroups.flatMap((group) => group.caseIds.map((caseId) => buildRecipe(group, caseId)));
  const compilation = recipes.map((recipe) => ({
    caseId: recipe.caseId,
    issues: validateAutomationRecipe(recipe, productCenterRecipeCapabilityContracts),
  }));
  const blocked = compilation.filter((item) => item.issues.length > 0);
  const runtimeExecutable = recipes.filter((recipe) => recipe.generationAllowed).length;
  const summary = {
    greenCases: recipes.length,
    sharedBindingGroups: greenGroups.length,
    caseRecipes: recipes.length,
    structurallyCompiled: recipes.length - blocked.length,
    compileBlocked: blocked.length,
    exactBindingRequired: recipes.length - runtimeExecutable,
    runtimeExecutable,
    humanReviewRequired: 0,
  };
  if (summary.greenCases !== 65
    || summary.sharedBindingGroups !== 20
    || summary.structurallyCompiled !== 65
    || summary.runtimeExecutable !== 65
    || summary.exactBindingRequired !== 0
    || blocked.length !== 0) {
    throw new Error(`绿色 Recipe 草案分母或编译结果漂移：${JSON.stringify(summary)}`);
  }
  const generatedAt = options.generatedAt ?? new Date().toISOString();
  const collection = {
    schemaVersion: '1.0.0' as const,
    collectionId: 'product-center-item-green-binding-draft-recipes' as const,
    generatedAt,
    status: 'fully-bound' as const,
    source: {
      fastLanePath: relativePath(projectRoot, fastLanePath),
      fastLaneFingerprint: fastLane.fingerprint,
      fastLaneSha256: sha256File(fastLanePath),
    },
    summary,
    recipes,
    fingerprint: recipeCollectionFingerprint(recipes),
  };
  const report = {
    schemaVersion: '1.0.0' as const,
    collectionId: 'product-center-item-green-binding-draft-compile-report' as const,
    generatedAt,
    status: collection.status,
    sourceFingerprint: collection.fingerprint,
    compile: {
      total: compilation.length,
      passed: compilation.length - blocked.length,
      blocked: blocked.length,
      diagnostics: blocked,
    },
    policy: {
      coarseTemplateReuseDoesNotGrantRuntime: true as const,
      exactCapabilityBindingRequired: true as const,
      exactAssertionBindingRequired: true as const,
      caseLevelEvidenceRequired: true as const,
      humanSemanticReviewRequired: false as const,
      runtimePromotionBeforeExecution: true as const,
    },
    groups: greenGroups.map((group) => ({
      groupId: group.groupId,
      caseIds: group.caseIds,
      reusableAcceptedTemplateCaseIds: group.reusableAcceptedTemplateCaseIds,
      runnableCaseIds: group.caseIds.filter((caseId) => exactBindingFor(caseId) !== undefined),
      missingBindings: group.caseIds.filter((caseId) => exactBindingFor(caseId) === undefined).map((caseId) => ({
        caseId,
        capabilityBinding: 'required',
        assertionBinding: 'required',
        evidenceShape: group.evidenceShapes[caseId],
      })),
    })),
  };
  const manifest = {
    schemaVersion: '1.0.0' as const,
    collectionId: 'product-center-item-green-binding-draft-manifest' as const,
    generatedAt,
    sourceFingerprint: collection.fingerprint,
    executionPolicy: {
      mode: 'wave-shared-chain' as const,
      caseLevelExecutionAllowed: false as const,
      sharedBindingGroups: greenGroups.length,
      caseRecipes: recipes.length,
      runtimeExecutable,
      exactBindingRequired: recipes.length - runtimeExecutable,
    },
    groups: greenGroups.map((group) => ({
      groupId: group.groupId,
      caseIds: group.caseIds,
      anchorCaseIds: group.reusableAcceptedTemplateCaseIds,
      orchestratorSpecPath: group.caseIds.some((caseId) => exactBindingFor(caseId) !== undefined)
        ? exactBindingFor(group.caseIds.find((caseId) => exactBindingFor(caseId) !== undefined)!)!.orchestratorSpecPath
        : `tests/generated/product-center-item-green-${group.groupId.toLowerCase()}.generated.spec.ts`,
      runtimeExecutableCaseIds: group.caseIds.filter((caseId) => exactBindingFor(caseId) !== undefined),
    })),
  };
  const outputDirectory = path.join(outputRoot, 'contracts/product-center/recipes/green-drafts');
  const recipePath = path.join(outputDirectory, 'product-center-item-green-binding-draft-recipes.json');
  const reportPath = path.join(outputDirectory, 'product-center-item-green-binding-draft-compile-report.json');
  const manifestPath = path.join(outputDirectory, 'product-center-item-green-binding-draft-manifest.json');
  writeJson(recipePath, collection);
  writeJson(reportPath, report);
  writeJson(manifestPath, manifest);
  const findings = scanGeneratedArtifacts(outputDirectory);
  if (findings.length > 0) throw new Error(`绿色 Recipe 草案安全扫描未通过：${findings.length}`);
  return { collection, report, manifest, recipePath, reportPath, manifestPath };
}

function buildRecipe(group: GreenGroup, caseId: string): AutomationRecipe {
  const route = routeFor(group);
  const exactBinding = exactBindingFor(caseId);
  return {
    schemaVersion: '1.0.0',
    id: `product-center:green-draft:${group.groupId.toLowerCase()}:${caseId.toLowerCase()}`,
    caseId,
    title: `绿色组 ${group.groupId} 用例 ${caseId} 精确绑定草案`,
    tags: ['@recipe', '@generated', '@green-draft', `@${group.groupId.toLowerCase()}`],
    route,
    action: exactBinding?.action ?? recipeAction(group.operation),
    traceabilityId: `trace:sop:green:${caseId}`,
    sourceIds: [
      `canonical:product-center-item-xmind-rebuild-pilot.json#${caseId}`,
      `fast-lane:${group.groupId}`,
      ...group.reusableAcceptedTemplateCaseIds.map((anchor) => `runtime-template:${anchor}`),
    ],
    coverageIds: [`canonical:${caseId}`],
    generationAllowed: exactBinding !== undefined,
    executionPolicy: {
      mode: 'wave-shared-chain',
      caseLevelExecutionAllowed: false,
      waveId: `GREEN-${group.groupId}`,
      orchestratorSpecPath: exactBinding
        ? exactBinding.orchestratorSpecPath
        : `tests/generated/product-center-item-green-${group.groupId.toLowerCase()}.generated.spec.ts`,
      runtimeAcceptanceId: `product-center-item-green-${group.groupId.toLowerCase()}-runtime`,
    },
    capabilities: [
      sidebarNavigationCapability(route),
      ...(exactBinding ? [{ ...exactBinding.capability, saveAs: 'result' }] : []),
    ],
    assertions: exactBinding ? [{
      adapterId: exactBinding.assertionAdapterId,
      input: { result: { $ref: '$result' } },
    }] : [{
      adapterId: 'greenRecipe.exactBindingRequired',
      input: {
        groupId: group.groupId,
        caseId,
        evidenceShape: group.evidenceShapes[caseId],
        reusableAcceptedTemplateCaseIds: group.reusableAcceptedTemplateCaseIds,
      },
    }],
  };
}

function exactBindingFor(caseId: string): {
  action?: RecipeAction;
  capability: AutomationRecipe['capabilities'][number];
  assertionAdapterId: string;
  orchestratorSpecPath: string;
} | undefined {
  switch (caseId) {
    case 'TC-ITEM-STD-064':
      return {
        capability: { id: 'item.list.searchSecondLanguage', input: { keyword: 'taco' } },
        assertionAdapterId: 'productCenter.verifySecondLanguageSearch',
        orchestratorSpecPath: 'tests/generated/product-center-item-green-readonly-pilot.generated.spec.ts',
      };
    case 'TC-ITEM-PKG-057':
      return {
        capability: { id: 'item.combo.readOptionalGroupDialog' },
        assertionAdapterId: 'productCenter.verifyOptionalComboDialog',
        orchestratorSpecPath: 'tests/generated/product-center-item-green-readonly-pilot.generated.spec.ts',
      };
    case 'TC-ITEM-PKG-054':
      return {
        capability: { id: 'item.list.probeImagePreview', input: { typeLabel: 'Combo' } },
        assertionAdapterId: 'productCenter.verifyImagePreview',
        orchestratorSpecPath: 'tests/generated/product-center-item-green-readonly-pilot.generated.spec.ts',
      };
    case 'TC-ITEM-STD-078':
      return {
        capability: {
          id: 'item.standard.probeMainImageReplacement',
          input: {
            firstImagePath: { $ref: '$case.firstImagePath' },
            secondImagePath: { $ref: '$case.secondImagePath' },
          },
        },
        assertionAdapterId: 'productCenter.verifyMainImageReplacement',
        orchestratorSpecPath: 'tests/generated/product-center-item-green-at15.generated.spec.ts',
      };
    case 'TC-ITEM-PKG-016':
      return {
        action: 'create',
        capability: {
          id: 'item.createComboRequiredOnly',
          input: {
            record: { $ref: '$record' },
            price: '10.00',
            minimumOrderQuantity: '2',
            comboGroupName: { $ref: '$record.comboGroupName' },
          },
        },
        assertionAdapterId: 'productCenter.verifyComboMinimumOrderQuantity',
        orchestratorSpecPath: 'tests/generated/product-center-item-green-at39.generated.spec.ts',
      };
    case 'TC-ITEM-STD-020':
      return {
        capability: {
          id: 'item.createStandard',
          input: {
            record: { $ref: '$record' },
            specification: 'single',
            price: '1.99',
            minimumOrderQuantity: '1',
          },
        },
        assertionAdapterId: 'productCenter.verifyStandardPricePersistence',
        orchestratorSpecPath: 'tests/generated/product-center-item-green-at09.generated.spec.ts',
      };
    case 'TC-ITEM-STD-048':
      return {
        action: 'read',
        capability: { id: 'item.standard.probeSpecGroupCreateNavigation' },
        assertionAdapterId: 'productCenter.verifySpecGroupCreateNavigation',
        orchestratorSpecPath: 'tests/generated/product-center-item-green-at09.generated.spec.ts',
      };
    case 'TC-ITEM-STD-050':
      return {
        capability: {
          id: 'item.createStandard',
          input: {
            record: { $ref: '$record' },
            specification: 'single',
            price: '10.00',
            minimumOrderQuantity: '1',
            packagingFee: '1.00',
          },
        },
        assertionAdapterId: 'productCenter.verifyStandardPackagingFeePersistence',
        orchestratorSpecPath: 'tests/generated/product-center-item-green-at09.generated.spec.ts',
      };
    case 'TC-ITEM-STD-098':
      return {
        capability: {
          id: 'item.createStandard',
          input: {
            record: { $ref: '$record' },
            specification: 'single',
            price: '10.00',
            minimumOrderQuantity: '1',
            cost: '5.00',
          },
        },
        assertionAdapterId: 'productCenter.verifyStandardCostPersistence',
        orchestratorSpecPath: 'tests/generated/product-center-item-green-at09.generated.spec.ts',
      };
    case 'TC-ITEM-STD-035':
      return validationBinding(
        { id: 'category.attemptAddChildBlockedByProduct', input: { record: { $ref: '$record' } } },
        'productCenter.verifyCategoryChildBlockedByProduct',
      );
    case 'TC-ITEM-STD-046':
      return validationBinding(
        { id: 'item.standard.probeFieldValidation', input: { field: 'mnemonicCode', value: 'M'.repeat(21) } },
        'productCenter.verifyMnemonicCodeMaximum',
      );
    case 'TC-ITEM-STD-094':
      return validationBinding(
        { id: 'item.standard.probeFieldValidation', input: { field: 'posName', value: '  POS名称-autocreate-094  ' } },
        'productCenter.verifyPosNameWhitespaceValidation',
      );
    case 'TC-ITEM-STD-101':
      return validationBinding(
        { id: 'item.standard.probeFieldValidation', input: { field: 'deviceCode', value: 'D'.repeat(21) } },
        'productCenter.verifyDeviceCodeMaximum',
      );
    case 'TC-ITEM-STD-095':
      return validationBinding(
        { id: 'item.standard.createRoundedPricePair', input: { values: ['10.235', '10.234'] } },
        'productCenter.verifyStandardPriceRoundingPair',
        'create',
      );
    case 'TC-ITEM-STD-049':
      return validationBinding(
        { id: 'item.standard.probeMultiSpecWeightDisabled' },
        'productCenter.verifyMultiSpecWeightDisabled',
      );
    case 'TC-ITEM-STD-051':
      return validationBinding(
        { id: 'item.standard.probeFieldValidation', input: { field: 'standardPrice', value: '1000000.00' } },
        'productCenter.verifyStandardPriceMaximum',
      );
    case 'TC-ITEM-STD-045':
      return validationBinding(
        { id: 'item.standard.probeDescriptionLengthBoundary', input: { acceptedLength: 500, rejectedLength: 501 } },
        'productCenter.verifyDescriptionMaximum',
      );
    case 'TC-ITEM-STD-054':
      return validationBinding(
        { id: 'item.standard.probeDetailImageLimit', input: { maximum: 10, attempted: 11 } },
        'productCenter.verifyDetailImageMaximum',
      );
    case 'TC-ITEM-STD-059':
      return validationBinding(
        { id: 'item.standard.probeReferencedGroupChildControls', input: { record: { $ref: '$record' } } },
        'productCenter.verifyReferencedGroupChildControls',
      );
    case 'TC-ITEM-ADD-017':
      return validationBinding(
        { id: 'item.side.createWithDetailImageLimit', input: { maximum: 10 } },
        'productCenter.verifySideDetailImageMaximum',
        'create',
      );
    case 'TC-ITEM-STD-033':
      return standardMegaBinding('item.standard.mega.editOtherInformation', 'productCenter.verifyStandardOtherInformationEdit', 'edit');
    case 'TC-ITEM-STD-006':
      return standardMegaBinding('item.standard.mega.createWithParentCategory', 'productCenter.verifyParentCategoryCreate', 'create');
    case 'TC-ITEM-STD-052':
      return standardMegaBinding('item.standard.mega.createWithLibraryMainImage', 'productCenter.verifyLibraryMainImageCreate', 'create');
    case 'TC-ITEM-STD-053':
      return standardMegaBinding('item.standard.mega.createWithLocalMainImage', 'productCenter.verifyLocalMainImageCreate', 'create');
    case 'TC-ITEM-STD-009':
      return standardMegaBinding('item.standard.mega.createFormattedNames', 'productCenter.verifyFormattedNames', 'create');
    case 'TC-ITEM-STD-055':
      return standardMegaBinding('item.standard.mega.editDescriptionTags', 'productCenter.verifyDescriptionTagsEdit', 'edit');
    case 'TC-ITEM-STD-056':
      return standardMegaBinding('item.standard.mega.editMaterialInformation', 'productCenter.verifyMaterialInformationEdit', 'edit');
    case 'TC-ITEM-STD-099':
      return standardMegaBinding('item.standard.mega.editCornerMark', 'productCenter.verifyCornerMarkEdit', 'edit');
    case 'TC-ITEM-STD-100':
      return standardMegaBinding('item.standard.mega.editStatisticsTags', 'productCenter.verifyStatisticsTagsEdit', 'edit');
    case 'TC-ITEM-STD-003':
      return standardMegaBinding('item.list.mega.probeColumnSelection', 'productCenter.verifyColumnSelection', 'edit');
    case 'TC-ITEM-STD-004':
      return standardMegaBinding('item.list.mega.probeLanguageSwitch', 'productCenter.verifyLanguageSwitch', 'edit');
    case 'TC-ITEM-STD-034':
      return standardMegaBinding('item.standard.mega.probeTasteGroupSync', 'productCenter.verifyTasteGroupSync', 'edit');
    case 'TC-ITEM-STD-042':
      return standardMegaBinding('item.standard.mega.probeAdvancedFields', 'productCenter.verifyAdvancedFields', 'read');
    case 'TC-ITEM-STD-063':
      return standardMegaBinding('item.list.mega.probePageSizes', 'productCenter.verifyPageSizes', 'read');
    case 'TC-ITEM-STD-072':
      return standardMegaBinding('item.list.mega.probeDefaultColumns', 'productCenter.verifyDefaultColumns', 'read');
    case 'TC-ITEM-STD-073':
      return standardMegaBinding('item.list.mega.probeRestoreColumns', 'productCenter.verifyRestoreColumns', 'edit');
    case 'TC-ITEM-STD-065':
      return standardMegaBinding('item.list.mega.enableDisabledItem', 'productCenter.verifyEnableDisabledItem', 'edit');
    case 'TC-ITEM-PKG-050':
      return comboMegaBinding('item.combo.mega.removeAllGroupItems', 'productCenter.verifyComboEmptyGroupHidden', 'delete');
    case 'TC-ITEM-PKG-055':
      return comboMegaBinding('item.combo.mega.probeDeleteConfirmation', 'productCenter.verifyComboDeleteConfirmation', 'delete');
    case 'TC-ITEM-PKG-011':
      return comboMegaBinding('item.combo.mega.createWithoutCategory', 'productCenter.verifyComboCreateWithoutCategory', 'create');
    case 'TC-ITEM-PKG-012':
      return comboMegaBinding('item.combo.mega.createWithParentCategory', 'productCenter.verifyComboParentCategoryCreate', 'create');
    case 'TC-ITEM-PKG-018':
      return comboMegaBinding('item.combo.mega.createWithZeroPrice', 'productCenter.verifyComboZeroPriceCreate', 'create');
    case 'TC-ITEM-PKG-033':
      return comboMegaBinding('item.combo.mega.createWithLibraryMainImage', 'productCenter.verifyComboLibraryMainImageCreate', 'create');
    case 'TC-ITEM-PKG-058':
      return comboMegaBinding('item.combo.mega.readOptionalGroupRules', 'productCenter.verifyComboOptionalGroupRules', 'create');
    case 'TC-ITEM-PKG-067':
      return comboMegaBinding('item.combo.mega.createWithLocalMainImage', 'productCenter.verifyComboLocalMainImageCreate', 'create');
    case 'TC-ITEM-PKG-068':
      return comboMegaBinding('item.combo.mega.probeMainImageReplacement', 'productCenter.verifyComboMainImageReplacement', 'create');
    case 'TC-ITEM-PKG-023':
      return comboMegaBinding('item.combo.mega.probeMnemonicMaximum', 'productCenter.verifyComboMnemonicMaximum', 'negative');
    case 'TC-ITEM-PKG-027':
      return comboMegaBinding('item.combo.mega.probeDescriptionMaximum', 'productCenter.verifyComboDescriptionMaximum', 'negative');
    case 'TC-ITEM-PKG-028':
      return comboMegaBinding('item.combo.mega.probeDetailImageLimit', 'productCenter.verifyComboDetailImageMaximum', 'negative');
    case 'TC-ITEM-PKG-065':
      return comboMegaBinding('item.combo.mega.probeReferencedGroupChildControls', 'productCenter.verifyComboReferencedGroupChildControls', 'negative');
    case 'TC-ITEM-PKG-005':
      return comboMegaBinding('item.combo.mega.readOtherSettings', 'productCenter.verifyComboOtherSettings', 'edit');
    case 'TC-ITEM-PKG-021':
      return comboMegaBinding('item.combo.mega.createFormattedName', 'productCenter.verifyComboFormattedName', 'edit');
    case 'TC-ITEM-PKG-022':
      return comboMegaBinding('item.combo.mega.createFormattedNames', 'productCenter.verifyComboFormattedNames', 'edit');
    case 'TC-ITEM-PKG-029':
      return comboMegaBinding('item.combo.mega.editDescriptionTags', 'productCenter.verifyComboDescriptionTagsEdit', 'edit');
    case 'TC-ITEM-PKG-030':
      return comboMegaBinding('item.combo.mega.editCornerMark', 'productCenter.verifyComboCornerMarkEdit', 'edit');
    case 'TC-ITEM-PKG-031':
      return comboMegaBinding('item.combo.mega.editStatisticsTags', 'productCenter.verifyComboStatisticsTagsEdit', 'edit');
    case 'TC-ITEM-PKG-032':
      return comboMegaBinding('item.combo.mega.editMaterialInformation', 'productCenter.verifyComboMaterialInformationEdit', 'edit');
    case 'TC-ITEM-PKG-049':
      return comboMegaBinding('item.combo.mega.createWithFixedAndCustomGroups', 'productCenter.verifyComboFixedAndCustomGroups', 'edit');
    case 'TC-ITEM-PKG-052':
      return comboMegaBinding('item.combo.mega.editTasteGroup', 'productCenter.verifyComboTasteGroupEdit', 'edit');
    case 'TC-ITEM-PKG-053':
      return comboMegaBinding('item.combo.mega.probeMutualExclusion', 'productCenter.verifyComboMutualExclusion', 'edit');
    case 'TC-ITEM-PKG-063':
      return comboMegaBinding('item.combo.mega.editMethodGroup', 'productCenter.verifyComboMethodGroupEdit', 'edit');
    case 'TC-ITEM-PKG-064':
      return comboMegaBinding('item.combo.mega.editAddonGroup', 'productCenter.verifyComboAddonGroupEdit', 'edit');
    case 'TC-ITEM-PKG-034':
      return comboMegaBinding('item.combo.mega.searchByCombinedFilters', 'productCenter.verifyComboCombinedFilters', 'edit');
    case 'TC-ITEM-PKG-061':
      return comboMegaBinding('item.combo.mega.enableDisabledItem', 'productCenter.verifyComboEnableDisabledItem', 'edit');
    case 'TC-ITEM-PKG-062':
      return comboMegaBinding('item.combo.mega.disableEnabledItem', 'productCenter.verifyComboDisableEnabledItem', 'edit');
    default:
      return undefined;
  }
}

function standardMegaBinding(
  capabilityId: AutomationRecipe['capabilities'][number]['id'],
  assertionAdapterId: string,
  action: RecipeAction,
): NonNullable<ReturnType<typeof exactBindingFor>> {
  return {
    action,
    capability: { id: capabilityId },
    assertionAdapterId,
    orchestratorSpecPath: 'tests/generated/product-center-item-green-standard-mega.generated.spec.ts',
  };
}

function comboMegaBinding(
  capabilityId: AutomationRecipe['capabilities'][number]['id'],
  assertionAdapterId: string,
  action: RecipeAction,
): NonNullable<ReturnType<typeof exactBindingFor>> {
  return {
    action,
    capability: { id: capabilityId },
    assertionAdapterId,
    orchestratorSpecPath: 'tests/generated/product-center-item-green-combo-mega.generated.spec.ts',
  };
}

function validationBinding(
  capability: AutomationRecipe['capabilities'][number],
  assertionAdapterId: string,
  action?: RecipeAction,
): NonNullable<ReturnType<typeof exactBindingFor>> {
  return {
    action,
    capability,
    assertionAdapterId,
    orchestratorSpecPath: 'tests/generated/product-center-item-green-validation-01.generated.spec.ts',
  };
}

function routeFor(group: GreenGroup): `/${string}` {
  if (group.scenarioFamily === '查询筛选'
    || group.scenarioFamily === '状态生命周期'
    || group.scenarioFamily === '删除') return '/pp/brand/list';
  if (group.productType === '套餐商品') return '/pp/brand/create/combo';
  if (group.productType === '加料商品') return '/pp/brand/create/side';
  return '/pp/brand/create/standard';
}

function recipeAction(operation: string): RecipeAction {
  if (operation === 'negative') return 'negative';
  if (operation === 'create') return 'create';
  if (operation === 'update') return 'edit';
  if (operation === 'delete') return 'delete';
  return 'read';
}

function readJson<T>(filePath: string): T {
  return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T;
}

function writeJson(filePath: string, value: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.${process.pid}.tmp`;
  fs.writeFileSync(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  fs.renameSync(temporaryPath, filePath);
}

function sha256File(filePath: string): string {
  return createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function relativePath(rootPath: string, filePath: string): string {
  return path.relative(rootPath, filePath).replace(/\\/g, '/');
}

if (require.main === module) {
  try {
    const artifacts = buildProductCenterItemGreenRecipeArtifacts();
    process.stdout.write(
      `绿色 Recipe 草案已生成：${artifacts.recipePath}\n${artifacts.reportPath}\n${artifacts.manifestPath}\n编译=${artifacts.report.compile.passed}/${artifacts.report.compile.total}；runtime=${artifacts.collection.summary.runtimeExecutable}\n`,
    );
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
