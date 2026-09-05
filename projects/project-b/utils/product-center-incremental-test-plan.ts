import { createHash } from 'node:crypto';
import type { ProductCenterContractDiff } from './product-center-contract-diff';
import type { ProductCenterTestContract } from './product-center-test-contract';
import { stableStringify } from './product-center-test-contract';
import { buildIncrementalTestPlan, type IncrementalTestPlan } from './incremental-test-plan';

export function buildProductCenterIncrementalTestPlan(
  diff: ProductCenterContractDiff,
  contract: ProductCenterTestContract,
  options: { recipeCaseIds?: ReadonlySet<string> } = {},
): IncrementalTestPlan {
  return buildIncrementalTestPlan({
    contractVersion: contract.metadata.contractVersion,
    diffFingerprint: createHash('sha256').update(stableStringify(diff)).digest('hex'),
    changedRecords: diff.changes.map((change) => ({
      collection: change.collection,
      id: change.id,
      ...(change.route ? { route: change.route } : {}),
    })),
    impactedCases: diff.impactedCaseDetails,
    traceability: (contract.traceability ?? []).flatMap((record) => {
      const caseId = record.evidence.caseId;
      const automation = record.evidence.automation;
      if (typeof caseId !== 'string' || !automation || typeof automation !== 'object') return [];
      const values = automation as Record<string, unknown>;
      if (typeof values.specFile !== 'string' || typeof values.testTitle !== 'string' || typeof values.rerunGrep !== 'string') return [];
      return [{
        caseId,
        sourceIds: Array.isArray(record.evidence.sourceIds)
          ? record.evidence.sourceIds.filter((sourceId): sourceId is string => typeof sourceId === 'string')
          : [],
        specFile: options.recipeCaseIds?.has(caseId)
          ? 'tests/generated/product-center-recipe-pilot.generated.spec.ts'
          : values.specFile,
        testTitle: values.testTitle,
        rerunGrep: values.rerunGrep,
      }];
    }),
  });
}
