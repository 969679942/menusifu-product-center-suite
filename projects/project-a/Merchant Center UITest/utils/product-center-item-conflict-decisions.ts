import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export type ProductCenterItemConflictDecision =
  | 'update-canonical'
  | 'retain-canonical-file-bug'
  | 'needs-prd';

export type ProductCenterItemConflictDecisionDocument = {
  schemaVersion: '1.0.0';
  collectionId: 'product-center-item-canonical-conflict-decisions';
  confirmedBy: string;
  summary: {
    groups: number;
    cases: number;
    updateCanonical: number;
    retainCanonicalFileBug: number;
    needsPrd: number;
  };
  groups: Array<{ groupId: string; caseIds: string[] }>;
  caseDecisions: Array<{
    caseId: string;
    groupId: string;
    decision: ProductCenterItemConflictDecision;
    reason: string;
    evidencePaths: string[];
    generationDisposition: string;
  }>;
};

export function loadProductCenterItemConflictDecisions(projectRoot: string) {
  const filePath = path.join(
    projectRoot,
    'contracts/product-center/reviews/product-center-item-canonical-conflict-decisions.json',
  );
  const document = JSON.parse(fs.readFileSync(filePath, 'utf8')) as ProductCenterItemConflictDecisionDocument;
  const caseIds = document.caseDecisions.map((item) => item.caseId);
  const groupIds = document.groups.map((item) => item.groupId);
  if (document.schemaVersion !== '1.0.0'
    || document.collectionId !== 'product-center-item-canonical-conflict-decisions'
    || document.confirmedBy !== '金将军'
    || document.summary.groups !== 9
    || document.summary.cases !== 19
    || document.summary.updateCanonical !== 9
    || document.summary.retainCanonicalFileBug !== 6
    || document.summary.needsPrd !== 4
    || groupIds.join(',') !== 'C01,C02,C03,C04,C05,C06,C07,C08,C09'
    || new Set(caseIds).size !== caseIds.length) {
    throw new Error('C01-C09 canonical conflict 决策记录不满足确认合同');
  }
  const byDecision = (decision: ProductCenterItemConflictDecision) => document.caseDecisions
    .filter((item) => item.decision === decision)
    .map((item) => item.caseId)
    .sort();
  const updateCanonicalCaseIds = byDecision('update-canonical');
  const productDefectOpenCaseIds = byDecision('retain-canonical-file-bug');
  const productRuleConfirmationRequiredCaseIds = byDecision('needs-prd');
  if (updateCanonicalCaseIds.length !== 9
    || productDefectOpenCaseIds.length !== 6
    || productRuleConfirmationRequiredCaseIds.length !== 4) {
    throw new Error('C01-C09 canonical conflict 决策数量漂移');
  }
  return {
    document,
    filePath,
    sha256: createHash('sha256').update(fs.readFileSync(filePath)).digest('hex'),
    caseIds: caseIds.sort(),
    updateCanonicalCaseIds,
    productDefectOpenCaseIds,
    productRuleConfirmationRequiredCaseIds,
  };
}
