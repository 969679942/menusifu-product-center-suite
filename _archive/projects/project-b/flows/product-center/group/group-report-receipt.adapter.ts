import { createHash } from 'node:crypto';
import type {
  GroupAutomationBinding,
  GroupEvidenceKind,
  GroupExecutionHandlerId,
} from '../../../utils/product-center-group-automation';

export type ProductCenterGroupKeyInput = {
  businessDomainId: 'merchant-center-product-center-group';
  module: string;
  route: string;
  executionProfile: GroupAutomationBinding['executionProfile'];
  handlerId: GroupExecutionHandlerId;
  capabilityIds: string[];
  factoryId: string | null;
  cleanupId: string | null;
  requiredEvidence: GroupEvidenceKind[];
};

export type ProductCenterGroupOperationContract = {
  operationId: string;
  sourceStepNumber: number;
  businessDescription: string;
  handlerId: GroupExecutionHandlerId;
  executableReceiptRequired: true;
};

export type ProductCenterGroupAssertionContract = {
  assertionId: string;
  sourceExpectedResultNumber: number;
  expectedValue: string;
  caseEvidenceRequirements: GroupEvidenceKind[];
};

export type ProductCenterGroupCleanupContract = {
  required: boolean;
  cleanupId: string | null;
  expectedTerminalState: 'api-and-ui-zero-residue' | 'not-required';
};

export type ProductCenterGroupReportReceiptContract = {
  schemaVersion: '1.0.0';
  caseId: string;
  traceabilityId: string;
  bindingFingerprint: string;
  groupKey: string;
  groupKeyInput: ProductCenterGroupKeyInput;
  operations: ProductCenterGroupOperationContract[];
  assertions: ProductCenterGroupAssertionContract[];
  cleanup: ProductCenterGroupCleanupContract;
};

export function buildProductCenterGroupReportReceiptContract(
  binding: GroupAutomationBinding,
  options: { includeObservedProductDrift?: boolean; includeSourceRecovery?: boolean } = {},
): ProductCenterGroupReportReceiptContract {
  const acceptedProductFinding = options.includeObservedProductDrift === true
    && binding.blockClassification === 'observed-product-drift'
    && binding.blockEvidencePaths.length > 0;
  const acceptedSourceRecovery = options.includeSourceRecovery === true
    && binding.blockClassification === 'source-evidence-blocked';
  if ((!binding.generationAllowed && !acceptedProductFinding && !acceptedSourceRecovery) || !binding.handlerId) {
    throw new Error(`${binding.caseId} 未获得组模块报告收据适配资格`);
  }
  if (binding.steps.length === 0) {
    throw new Error(`${binding.caseId} 缺少正式业务步骤，无法建立操作合同`);
  }
  if (binding.assertionIds.length !== binding.expectedResults.length) {
    throw new Error(
      `${binding.caseId} 断言合同数量不一致：assertionIds=${binding.assertionIds.length}, expectedResults=${binding.expectedResults.length}`,
    );
  }

  const groupKeyInput: ProductCenterGroupKeyInput = {
    businessDomainId: 'merchant-center-product-center-group',
    module: binding.module,
    route: binding.route,
    executionProfile: binding.executionProfile,
    handlerId: binding.handlerId,
    capabilityIds: uniqueSorted(binding.capabilityIds),
    factoryId: binding.factoryId,
    cleanupId: binding.cleanupId,
    requiredEvidence: uniqueSorted(binding.requiredEvidence),
  };
  const cleanupRequired = binding.cleanupId !== null || binding.requiredEvidence.includes('cleanup');
  if (cleanupRequired && binding.cleanupId === null) {
    throw new Error(`${binding.caseId} 要求清理证据但缺少 cleanupId`);
  }

  return {
    schemaVersion: '1.0.0',
    caseId: binding.caseId,
    traceabilityId: binding.traceabilityId,
    bindingFingerprint: binding.bindingFingerprint,
    groupKey: `merchant-center:product-center:group:${sha256(stableJson({
      businessDomainId: groupKeyInput.businessDomainId,
      executionProfile: groupKeyInput.executionProfile,
      handlerId: groupKeyInput.handlerId,
      requiredEvidence: groupKeyInput.requiredEvidence,
      cleanupRequired,
    })).slice(0, 20)}`,
    groupKeyInput,
    operations: binding.steps.map((businessDescription, index) => ({
      operationId: `operation:group:${binding.caseId}:${index + 1}`,
      sourceStepNumber: index + 1,
      businessDescription,
      handlerId: binding.handlerId as GroupExecutionHandlerId,
      executableReceiptRequired: true,
    })),
    assertions: binding.assertionIds.map((assertionId, index) => ({
      assertionId,
      sourceExpectedResultNumber: index + 1,
      expectedValue: binding.expectedResults[index],
      caseEvidenceRequirements: uniqueSorted(binding.requiredEvidence),
    })),
    cleanup: {
      required: cleanupRequired,
      cleanupId: binding.cleanupId,
      expectedTerminalState: cleanupRequired ? 'api-and-ui-zero-residue' : 'not-required',
    },
  };
}

export function buildProductCenterGroupReportReceiptContracts(
  bindings: readonly GroupAutomationBinding[],
  options: { includeObservedProductDrift?: boolean; includeSourceRecovery?: boolean } = {},
): ProductCenterGroupReportReceiptContract[] {
  const eligibleBindings = bindings.filter((binding) => binding.generationAllowed
    || options.includeObservedProductDrift === true && binding.blockClassification === 'observed-product-drift'
    || options.includeSourceRecovery === true && binding.blockClassification === 'source-evidence-blocked');
  const duplicateCaseIds = duplicates(eligibleBindings.map((binding) => binding.caseId));
  if (duplicateCaseIds.length > 0) {
    throw new Error(`组模块存在重复 caseId：${duplicateCaseIds.join(',')}`);
  }
  return eligibleBindings.map((binding) => buildProductCenterGroupReportReceiptContract(binding, options));
}

export function buildProductCenterGroupReportContractFingerprint(
  contracts: readonly ProductCenterGroupReportReceiptContract[],
): string {
  return sha256(stableJson({
    adapterSchemaVersion: '1.0.0',
    contracts,
  }));
}

function uniqueSorted<T extends string>(values: readonly T[]): T[] {
  return [...new Set(values)].sort();
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

function stableJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort()
    .map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`)
    .join(',')}}`;
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}
