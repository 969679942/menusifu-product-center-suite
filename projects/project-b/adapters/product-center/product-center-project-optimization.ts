import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { buildSystemTestArtifacts } from '../../../../Test Automation Platform/scripts/build-system-test-contract';
import { buildSystemTestCaseImplementationFingerprints } from '../../../../Test Automation Platform/scripts/run-system-test';
import { fingerprintSystemTestValue } from '../../../../Test Automation Platform/src/automation/system-test/system-test-contract';
import { fingerprintImplementationSources } from '../../../../Test Automation Platform/src/automation/system-test/system-test-implementation-fingerprint';
import type { ProjectRemediationScopeArtifact } from '../../../../Test Automation Platform/src/governance/project-remediation-scope';
import type { ProjectRemediationOptimizationCase } from '../../../../Test Automation Platform/src/governance/project-remediation-optimization';
import {
  buildProductCenterGroupReportReceiptContracts,
} from '../../flows/product-center/group/group-report-receipt.adapter';
import { fingerprintProductCenterItemImplementation } from './product-center-item-implementation';
import type { GroupAutomationBinding } from '../../utils/product-center-group-automation';
import { buildProductCenterGroupCaseFingerprintManifest } from '../../utils/product-center-group-case-fingerprint';
import { mapMerchantCenterOptimizationCases } from '../../utils/system-test-optimization-gate';

type ItemOptimizationSource = {
  caseId: string;
  family: string;
  action: string | null;
  automationClassification: 'strict-generatable' | 'blocked' | 'not-applicable';
  blockingReasons: string[];
  handlerId: string;
  bindingFingerprint: string;
  implementationFingerprint: string;
  assertionIds: string[];
};

type LegacyOptimizationBinding = {
  caseId: string;
  handlerId: string;
  requiredEvidence: string[];
  assertionIds: string[];
};

type ItemAuthoritativeAutomationDocument = {
  collectionId: 'product-center-item-authoritative-automation-bindings';
  bindings: Array<{
    caseId: string;
    scriptPath: string;
    runtimeReadiness: string;
    runtimeStatus: string;
    blockingReasons: string[];
  }>;
};

type ItemAdditionalAutomationDocument = {
  collectionId: 'product-center-test-plan-additional-automation-bindings';
  bindings: Array<{
    caseId: string;
    module: string;
    scriptPath: string;
    runtimeReadiness: string;
    status: string;
  }>;
};

export function buildProductCenterProjectOptimizationCases(input: {
  projectRoot: string;
  scope: ProjectRemediationScopeArtifact;
}): ProjectRemediationOptimizationCase[] {
  const inScopeCaseIds = new Set(input.scope.cases.map((item) => item.caseId));
  const cases = [
    ...buildSeasoningCases(input.projectRoot, inScopeCaseIds),
    ...buildGroupCases(input.projectRoot),
    ...buildItemCases(input.projectRoot, inScopeCaseIds),
    ...buildLegacyCases(input.projectRoot),
  ];
  const byCaseId = new Map(cases.map((item) => [item.caseId, item]));
  return input.scope.cases.map((scopeCase) => {
    const item = byCaseId.get(scopeCase.caseId);
    if (!item) throw new Error(`PRODUCT_CENTER_PROJECT_OPTIMIZATION_CASE_MISSING:${scopeCase.caseId}`);
    if (item.module !== scopeCase.module) {
      throw new Error(`PRODUCT_CENTER_PROJECT_OPTIMIZATION_MODULE_MISMATCH:${scopeCase.caseId}:${item.module}:${scopeCase.module}`);
    }
    return item;
  });
}

export function buildProductCenterSeasoningOptimizationCases(projectRoot: string): ProjectRemediationOptimizationCase[] {
  return buildSeasoningCases(projectRoot, new Set());
}

function buildSeasoningCases(projectRoot: string, inScopeCaseIds: ReadonlySet<string>): ProjectRemediationOptimizationCase[] {
  const artifacts = buildSystemTestArtifacts({
    rootDir: projectRoot,
    manifestPath: 'systems/merchant-center-product-center-seasoning/manifest.json',
  });
  if (artifacts.errors.length > 0) {
    throw new Error(`SEASONING_SYSTEM_TEST_CONTRACT_INVALID:${artifacts.errors.join(',')}`);
  }
  const implementationFingerprints = buildSystemTestCaseImplementationFingerprints(
    artifacts,
    path.resolve(projectRoot, '../../Test Automation Platform/scripts/run-system-test.ts'),
  );
  const caseFingerprints = Object.fromEntries(artifacts.contract.cases.map((item) => [
    item.caseId,
    fingerprintSystemTestValue(item),
  ]));
  const executableCases = mapMerchantCenterOptimizationCases({
    cases: artifacts.contract.cases,
    caseFingerprints,
    implementationFingerprints,
  }).map((item) => ({ ...item, module: 'seasoning' }));
  const executableIds = new Set(executableCases.map((item) => item.caseId));
  const registryPath = path.join(projectRoot, 'systems/merchant-center-product-center-seasoning/binding-registry.json');
  const registry = readJson<{ bindings: Array<{
    caseId: string;
    executionAllowed?: boolean;
    sourceIds?: string[];
    capabilities?: Array<{ id: string }>;
    assertions?: Array<{ adapterId: string }>;
  }> }>(registryPath);
  const nonExecutableCases: ProjectRemediationOptimizationCase[] = registry.bindings
    .filter((binding) => inScopeCaseIds.has(binding.caseId) && !executableIds.has(binding.caseId))
    .map((binding) => {
      if (binding.executionAllowed !== false) {
        throw new Error(`SEASONING_EXECUTABLE_CASE_NOT_COMPILED:${binding.caseId}`);
      }
      const assertionIds = binding.assertions?.map((item) => item.adapterId).filter(Boolean) ?? [];
      if (assertionIds.length === 0) throw new Error(`SEASONING_NON_EXECUTABLE_ASSERTION_MISSING:${binding.caseId}`);
      return {
        caseId: binding.caseId,
        module: 'seasoning',
        groupKey: `merchant-center:seasoning:non-executable:${binding.caseId}`,
        caseFingerprint: fingerprint(binding),
        implementationFingerprint: fingerprintImplementationSources(projectRoot, [
          'systems/merchant-center-product-center-seasoning/binding-registry.json',
          'systems/merchant-center-product-center-seasoning/test-plan.json',
          'systems/merchant-center-product-center-seasoning/build.ts',
        ]).fingerprint,
        mutationMode: 'none',
        requiredOperationKeys: binding.capabilities?.map((item) => item.id).filter(Boolean) ?? [],
        expectationClaimIds: assertionIds,
        contextGuardPhases: ['before-action', 'before-assertion'],
        cleanupRequired: false,
        staticIssueCodes: ['SEASONING_EXECUTION_NOT_ALLOWED'],
      };
    });
  return [...executableCases, ...nonExecutableCases];
}

function buildGroupCases(projectRoot: string): ProjectRemediationOptimizationCase[] {
  const bindingPath = path.join(projectRoot, 'contracts/product-center/group/product-center-group-bindings.json');
  const bindings = readJson<{ cases: GroupAutomationBinding[] }>(bindingPath).cases;
  const reports = buildProductCenterGroupReportReceiptContracts(bindings, { includeObservedProductDrift: true });
  const bindingByCaseId = new Map(bindings.map((binding) => [binding.caseId, binding]));
  const implementationByCaseId = new Map(buildProductCenterGroupCaseFingerprintManifest(
    projectRoot,
    bindings,
    { includeObservedProductDrift: true },
  ).cases
    .map((item) => [item.caseId, item.implementationFingerprint]));
  return reports.map((report) => {
    const binding = requireValue(
      bindingByCaseId.get(report.caseId),
      `PRODUCT_CENTER_GROUP_BINDING_MISSING:${report.caseId}`,
    );
    return {
      caseId: report.caseId,
      module: 'group',
      groupKey: report.groupKey,
      caseFingerprint: report.bindingFingerprint,
      implementationFingerprint: requireValue(
        implementationByCaseId.get(report.caseId),
        `PRODUCT_CENTER_GROUP_IMPLEMENTATION_FINGERPRINT_MISSING:${report.caseId}`,
      ),
      mutationMode: report.cleanup.required ? 'fixture-reversible' as const : 'none' as const,
      requiredOperationKeys: report.operations.map((operation) => operation.operationId),
      expectationClaimIds: report.assertions.map((assertion) => assertion.assertionId),
      contextGuardPhases: ['before-action', 'before-assertion'] as Array<'before-action' | 'before-assertion'>,
      cleanupRequired: report.cleanup.required,
      requiredCanary: binding.blockClassification === 'observed-product-drift',
    };
  });
}

function buildItemCases(projectRoot: string, inScopeCaseIds: ReadonlySet<string>): ProjectRemediationOptimizationCase[] {
  const sourcePath = path.join(projectRoot, 'tests/generated/product-center-item-216.generated.spec.ts');
  const sourceText = fs.readFileSync(sourcePath, 'utf8');
  const start = sourceText.indexOf('const allCases = ');
  const endMarker = ' as readonly GeneratedCase[];';
  const end = sourceText.indexOf(endMarker, start);
  if (start < 0 || end < 0) throw new Error(`PRODUCT_CENTER_ITEM_REGISTRATION_INVALID:${sourcePath}`);
  const source = (JSON.parse(sourceText.slice(start + 'const allCases = '.length, end)) as ItemOptimizationSource[])
    .filter((item) => inScopeCaseIds.has(item.caseId));
  const authoritative = readJson<ItemAuthoritativeAutomationDocument>(path.join(
    projectRoot,
    'contracts/product-center/test-cases/canonical/product-center-item-authoritative-automation-bindings.json',
  ));
  if (authoritative.collectionId !== 'product-center-item-authoritative-automation-bindings') {
    throw new Error('PRODUCT_CENTER_ITEM_AUTHORITATIVE_BINDINGS_INVALID');
  }
  const duplicateBindingCaseIds = duplicates(authoritative.bindings.map((item) => item.caseId));
  if (duplicateBindingCaseIds.length > 0) {
    throw new Error(`PRODUCT_CENTER_ITEM_AUTHORITATIVE_BINDING_DUPLICATE:${duplicateBindingCaseIds.join(',')}`);
  }
  const authoritativeByCaseId = new Map(authoritative.bindings.map((item) => [item.caseId, item]));
  const additional = readJson<ItemAdditionalAutomationDocument>(path.join(
    projectRoot,
    'contracts/product-center/test-plan-additional-automation-bindings.json',
  ));
  if (additional.collectionId !== 'product-center-test-plan-additional-automation-bindings') {
    throw new Error('PRODUCT_CENTER_ITEM_ADDITIONAL_BINDINGS_INVALID');
  }
  const additionalItemBindings = additional.bindings.filter((item) => item.module === 'brand-item' || item.module === 'item');
  const duplicateAdditionalCaseIds = duplicates(additionalItemBindings.map((item) => item.caseId));
  if (duplicateAdditionalCaseIds.length > 0) {
    throw new Error(`PRODUCT_CENTER_ITEM_ADDITIONAL_BINDING_DUPLICATE:${duplicateAdditionalCaseIds.join(',')}`);
  }
  const additionalByCaseId = new Map(additionalItemBindings.map((item) => [item.caseId, item]));
  return source.map((item) => {
    requireStrings(item, ['caseId', 'family', 'handlerId', 'bindingFingerprint', 'implementationFingerprint']);
    if (!Array.isArray(item.assertionIds) || item.assertionIds.length === 0) {
      throw new Error(`PRODUCT_CENTER_ITEM_ASSERTIONS_REQUIRED:${item.caseId}`);
    }
    const authoritativeBinding = authoritativeByCaseId.get(item.caseId);
    const additionalBinding = additionalByCaseId.get(item.caseId);
    if (!authoritativeBinding && !additionalBinding) {
      throw new Error(`PRODUCT_CENTER_ITEM_EXECUTION_BINDING_MISSING:${item.caseId}`);
    }
    const authoritativeRuntimeReady = Boolean(authoritativeBinding
      && authoritativeBinding.runtimeReadiness === 'ready'
      && authoritativeBinding.runtimeStatus === 'runtime-passed'
      && authoritativeBinding.blockingReasons.length === 0
      && authoritativeBinding.scriptPath === 'tests/generated/product-center-item-216.generated.spec.ts');
    const additionalRuntimeReady = Boolean(additionalBinding
      && additionalBinding.runtimeReadiness === 'ready'
      && additionalBinding.status === 'landed'
      && additionalBinding.scriptPath === 'tests/generated/product-center-item-216.generated.spec.ts');
    const groupKeyInput = {
      businessDomainId: 'merchant-center-product-center-item',
      family: item.family,
      action: item.action,
    };
    return {
      caseId: item.caseId,
      module: 'item',
      groupKey: `merchant-center:product-center:item:${fingerprint(groupKeyInput).slice(0, 20)}`,
      caseFingerprint: item.bindingFingerprint,
      implementationFingerprint: fingerprintProductCenterItemImplementation(projectRoot, item.caseId),
      mutationMode: 'fixture-reversible' as const,
      requiredOperationKeys: [item.handlerId],
      expectationClaimIds: [...item.assertionIds],
      contextGuardPhases: ['before-action', 'before-assertion'] as Array<'before-action' | 'before-assertion'>,
      cleanupRequired: true,
      staticIssueCodes: authoritativeRuntimeReady || additionalRuntimeReady ? [] : ['ITEM_AUTHORITATIVE_RUNTIME_READY_REQUIRED'],
    };
  });
}

function buildLegacyCases(projectRoot: string): ProjectRemediationOptimizationCase[] {
  const bindingPath = path.join(
    projectRoot,
    'contracts/product-center/test-cases/canonical/product-center-legacy-remaining-automation-bindings.json',
  );
  const document = readJson<{ bindingFingerprint: string; bindings: LegacyOptimizationBinding[] }>(bindingPath);
  const sourcePlanPath = path.resolve(projectRoot, '..', 'deliverables/product-center-source-governance/execution-plan.json');
  const sourcePlan = readJson<{ tasks: Array<{ caseId: string; bindingFingerprint?: string | null }> }>(sourcePlanPath);
  const sourceTaskByCaseId = new Map(sourcePlan.tasks.map((task) => [task.caseId, task]));
  const scriptPath = path.join(projectRoot, 'tests/generated/product-center-legacy-remaining.generated.spec.ts');
  const scriptRelativePath = path.relative(projectRoot, scriptPath).replaceAll(path.sep, '/');
  return document.bindings.map((item) => {
    if (!Array.isArray(item.requiredEvidence) || item.requiredEvidence.length === 0) {
      throw new Error(`PRODUCT_CENTER_LEGACY_EVIDENCE_REQUIRED:${item.caseId}`);
    }
    if (!Array.isArray(item.assertionIds) || item.assertionIds.length === 0) {
      throw new Error(`PRODUCT_CENTER_LEGACY_ASSERTIONS_REQUIRED:${item.caseId}`);
    }
    const cleanupRequired = item.requiredEvidence.includes('cleanup');
    const module = item.caseId.startsWith('TC-IMG-') ? 'image' : item.caseId.startsWith('TC-TAG-') ? 'tag' : '';
    if (!module) throw new Error(`PRODUCT_CENTER_LEGACY_MODULE_UNKNOWN:${item.caseId}`);
    const sourceBindingFingerprint = sourceTaskByCaseId.get(item.caseId)?.bindingFingerprint;
    if (!sourceBindingFingerprint) {
      throw new Error(`PRODUCT_CENTER_LEGACY_SOURCE_BINDING_FINGERPRINT_MISSING:${item.caseId}`);
    }
    const implementationFingerprint = fingerprintImplementationSources(
      projectRoot,
      legacyImplementationSources(scriptRelativePath, item.caseId),
    ).fingerprint;
    return {
      caseId: item.caseId,
      module,
      groupKey: `merchant-center:product-center:${module}:${fingerprint({
        requiredEvidence: item.requiredEvidence,
        mutation: cleanupRequired,
      }).slice(0, 20)}`,
      caseFingerprint: sourceBindingFingerprint,
      implementationFingerprint,
      mutationMode: cleanupRequired ? 'fixture-reversible' : 'none',
      requiredOperationKeys: [item.handlerId],
      expectationClaimIds: [...item.assertionIds],
      contextGuardPhases: ['before-action', 'before-assertion'],
      cleanupRequired,
    };
  });
}

function legacyImplementationSources(scriptPath: string, caseId: string): string[] {
  const sources = [scriptPath];
  if (['TC-TAG-DESC-014', 'TC-TAG-STAT-013', 'TC-TAG-BDG-009'].includes(caseId)) {
    sources.push('pages/sidebar.page.ts', 'pages/product-center/tag-management.page.ts');
  }
  return sources;
}

function readJson<T>(filePath: string): T {
  if (!fs.existsSync(filePath)) throw new Error(`PRODUCT_CENTER_OPTIMIZATION_SOURCE_MISSING:${filePath}`);
  return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T;
}

function requireStrings(value: object, keys: readonly string[]): void {
  const record = value as Record<string, unknown>;
  for (const key of keys) {
    if (typeof record[key] !== 'string' || !record[key]) {
      throw new Error(`PRODUCT_CENTER_OPTIMIZATION_FIELD_REQUIRED:${String(record.caseId ?? 'unknown')}:${key}`);
    }
  }
}

function requireValue<T>(value: T | undefined, message: string): T {
  if (value === undefined) throw new Error(message);
  return value;
}

function duplicates(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const duplicateValues = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) duplicateValues.add(value);
    seen.add(value);
  }
  return [...duplicateValues].sort();
}

function fingerprint(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}
