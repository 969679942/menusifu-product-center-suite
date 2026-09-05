import fs from 'node:fs';
import path from 'node:path';

export type ProductCenterSourceDecision = {
  caseId: string;
  module: string;
  status: 'verified' | 'blocked' | 'not-applicable';
  disposition: 'verified-source-evidence' | 'blocked-source-review' | 'not-applicable';
  currentGoalBlocking: boolean;
  blockCode?: string;
  blockReason?: string;
  sourceRaw?: string;
};

export type ProductCenterSourceGovernanceDocument = {
  generatedAt: string;
  cases: ProductCenterSourceDecision[];
};

export type ProductCenterSourceGovernanceRegistry = {
  generatedAt: string;
  decisions: ReadonlyMap<string, ProductCenterSourceDecision>;
};

export function loadProductCenterSourceGovernance(
  projectRoot: string,
): ProductCenterSourceGovernanceRegistry {
  const filePath = path.join(
    projectRoot,
    'contracts/product-center/reviews/unsupported-source-format-decisions.json',
  );
  const document = JSON.parse(fs.readFileSync(filePath, 'utf8')) as ProductCenterSourceGovernanceDocument;
  const decisions = new Map<string, ProductCenterSourceDecision>();
  for (const decision of document.cases) {
    if (decisions.has(decision.caseId)) throw new Error(`来源治理用例重复：${decision.caseId}`);
    decisions.set(decision.caseId, decision);
  }
  return { generatedAt: document.generatedAt, decisions };
}

export function sourceDecisionBlocksExecution(
  decision: ProductCenterSourceDecision | undefined,
): boolean {
  return decision?.status === 'blocked' && decision.currentGoalBlocking === true;
}

export function sourceGovernanceReason(decision: ProductCenterSourceDecision): string {
  const code = decision.blockCode ?? 'FORMAL_SOURCE_REQUIRED';
  return `来源证据阻断 ${code}：${decision.blockReason ?? '缺少可自动验证的正式来源证据'}`;
}
