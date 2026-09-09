import type {
  ProductCenterContractCurationSource,
  ProductCenterModuleAddition,
  ProductCenterModuleOverride,
  ProductCenterModuleTombstone,
} from '../contracts/product-center/modules/product-center-module.types';

export type HumanReviewDecisionDocument = {
  schemaVersion: '1.0.0';
  project: string;
  contractVersion: string;
  decisions: Array<{
    id: string;
    reviewedBy: string;
    reviewedAt: string;
    source: { path: string; locator?: string };
    fieldLimits?: Array<{ recordId: string; label: string; maxLength: number }>;
    automationExclusions?: Array<{ ruleId: string; request: string; method: string }>;
    resolves?: Array<{ collection: 'unresolved'; recordId: string; reason: string }>;
  }>;
};

export function compileHumanReviewDecisions(document: HumanReviewDecisionDocument): ProductCenterContractCurationSource {
  if (document.schemaVersion !== '1.0.0') throw new Error(`不支持的人工审核决定版本：${document.schemaVersion}`);
  if (!document.project.trim()) throw new Error('人工审核决定缺少项目标识');
  if (!document.contractVersion.trim()) throw new Error('人工审核决定缺少合同版本');
  const overrides: ProductCenterModuleOverride[] = [];
  const additions: ProductCenterModuleAddition[] = [];
  const tombstones: ProductCenterModuleTombstone[] = [];

  for (const decision of document.decisions) {
    validateDecision(decision);
    const source = { ...decision.source };
    for (const field of decision.fieldLimits ?? []) {
      if (!field.recordId.trim() || !field.label.trim() || !Number.isInteger(field.maxLength) || field.maxLength <= 0) {
        throw new Error(`人工审核字段边界无效：${decision.id}`);
      }
      overrides.push({
        collection: 'fields',
        id: field.recordId,
        reason: `人工确认${field.label}最大长度为 ${field.maxLength}`,
        source,
        patch: {
          status: 'confirmed',
          sourceType: 'human-review',
          confidence: 1,
          generationAllowed: true,
          conflictStatus: 'resolved',
          evidence: {
            label: field.label,
            semanticMaxLength: { exact: field.maxLength, source: 'human-review' },
            boundaryGenerationAllowed: true,
            reviewDecision: { decisionId: decision.id, reviewedBy: decision.reviewedBy, reviewedAt: decision.reviewedAt },
          },
        },
      });
    }
    for (const exclusion of decision.automationExclusions ?? []) {
      if (!exclusion.ruleId.trim() || !exclusion.request.trim() || !exclusion.method.trim()) {
        throw new Error(`人工审核自动化排除无效：${decision.id}`);
      }
      additions.push({
        collection: 'businessRules',
        record: {
          id: exclusion.ruleId,
          status: 'confirmed',
          sourceType: 'human-review',
          confidence: 1,
          generationAllowed: true,
          source: [source],
          verifiedAt: decision.reviewedAt,
          version: document.contractVersion,
          module: '商品中心 / 自动化治理',
          evidence: {
            request: exclusion.request,
            method: exclusion.method,
            automationPolicy: 'unsupported',
            operationGenerationAllowed: false,
            reviewDecision: { decisionId: decision.id, reviewedBy: decision.reviewedBy, reviewedAt: decision.reviewedAt },
          },
        },
      });
    }
    for (const resolution of decision.resolves ?? []) {
      if (!resolution.recordId.trim() || !resolution.reason.trim()) {
        throw new Error(`人工审核未决项解决无效：${decision.id}`);
      }
      tombstones.push({
        collection: resolution.collection,
        id: resolution.recordId,
        reason: resolution.reason,
        reviewedBy: decision.reviewedBy,
      });
    }
  }
  assertUnique(overrides.map((item) => `${item.collection}:${item.id}`), '字段覆盖');
  assertUnique(additions.map((item) => `${item.collection}:${item.record.id}`), '补充规则');
  assertUnique(tombstones.map((item) => `${item.collection}:${item.id}`), '未决项解决');
  return { id: `${document.project}-human-review-decisions`, curations: { overrides, additions, tombstones } };
}

function validateDecision(decision: HumanReviewDecisionDocument['decisions'][number]): void {
  if (!decision.id.trim()) throw new Error('人工审核决定缺少 ID');
  if (!decision.reviewedBy.trim()) throw new Error('人工审核决定缺少审核人');
  if (!decision.reviewedAt.trim()) throw new Error(`人工审核决定缺少审核日期：${decision.id}`);
  if (!decision.source.path.trim()) throw new Error(`人工审核决定缺少来源：${decision.id}`);
}

function assertUnique(values: readonly string[], label: string): void {
  const duplicate = values.find((value, index) => values.indexOf(value) !== index);
  if (duplicate) throw new Error(`人工审核${label}目标重复：${duplicate}`);
}
