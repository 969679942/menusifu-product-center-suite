import fs from 'node:fs';
import path from 'node:path';

export type ProductCenterExecutionDecision = {
  caseId: string;
  module: 'brand-item' | 'brand-group';
  status: 'handled' | 'deferred' | 'not-applicable';
  reason: string;
  evidenceRefs?: string[];
  resumeWhen?: string;
  replacementCaseIds?: string[];
};

type DecisionDocument = {
  generatedAt: string;
  decisions: ProductCenterExecutionDecision[];
};

export function loadProductCenterExecutionDecisions(
  projectRoot = path.resolve(__dirname, '..'),
): ReadonlyMap<string, ProductCenterExecutionDecision> {
  const filePath = path.join(projectRoot, 'contracts/product-center/reviews/product-center-execution-decisions.json');
  const document = JSON.parse(fs.readFileSync(filePath, 'utf8')) as DecisionDocument;
  const decisions = new Map<string, ProductCenterExecutionDecision>();
  for (const decision of document.decisions) {
    if (decisions.has(decision.caseId)) throw new Error(`执行决策用例重复：${decision.caseId}`);
    if (!decision.reason) throw new Error(`执行决策缺少原因：${decision.caseId}`);
    if (decision.status === 'handled' && !decision.evidenceRefs?.length) {
      throw new Error(`已处理决策缺少逐条证据：${decision.caseId}`);
    }
    if (decision.status === 'deferred' && !decision.resumeWhen) {
      throw new Error(`延期执行决策缺少恢复条件：${decision.caseId}`);
    }
    if (decision.status === 'not-applicable' && !decision.evidenceRefs?.length) {
      throw new Error(`当前版本不适用决策缺少审计证据：${decision.caseId}`);
    }
    if (decision.status === 'not-applicable'
      && !decision.replacementCaseIds?.length
      && !decision.resumeWhen?.startsWith('不再恢复')) {
      throw new Error(`当前版本不适用决策缺少替代用例或终止恢复条件：${decision.caseId}`);
    }
    decisions.set(decision.caseId, decision);
  }
  return decisions;
}

export function formatProductCenterExecutionDecisionReason(
  decision: ProductCenterExecutionDecision,
): string {
  if (decision.status === 'deferred') {
    return `${decision.reason}；恢复条件：${decision.resumeWhen}`;
  }
  if (decision.replacementCaseIds?.length) {
    return `${decision.reason}；替代用例：${decision.replacementCaseIds.join('、')}`;
  }
  return `${decision.reason}；替代用例：无；${decision.resumeWhen}`;
}
