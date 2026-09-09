import { buildReviewBatches, type GroupedReviewItem, type ReviewBatchSet } from './review-batch';

type P0ReviewItem = {
  id: string;
  category: string;
  priority: string;
  reason: string;
  source: Array<{ path: string; locator?: string }>;
};

type ContractRecord = {
  id: string;
  evidence?: Record<string, unknown>;
};

type ProductCenterContractForReview = {
  unresolved: ContractRecord[];
  apiOperations: ContractRecord[];
};

export type ProductCenterReviewPayload = {
  category: string;
  priority: string;
  reason: string;
  source: P0ReviewItem['source'];
  evidence: Record<string, unknown>;
  question: string;
  allowedDecisions: readonly ['confirm', 'exclude', 'defer'];
};

export function buildProductCenterReviewBatchSet(
  items: readonly P0ReviewItem[],
  contract: ProductCenterContractForReview,
  maxBatchSize: number,
): ReviewBatchSet<ProductCenterReviewPayload> {
  const unresolved = new Map(contract.unresolved.map((record) => [record.id, record]));
  const operations = new Map(contract.apiOperations.flatMap((record) => {
    const operationKey = record.evidence?.operationKey;
    return typeof operationKey === 'string' ? [[operationKey, record] as const] : [];
  }));

  const grouped: Array<GroupedReviewItem<ProductCenterReviewPayload>> = items.map((item) => {
    const unresolvedRecord = unresolved.get(item.id);
    if (!unresolvedRecord) throw new Error(`P0 项缺少统一合同未决记录：${item.id}`);
    const evidence = unresolvedRecord.evidence ?? {};
    return {
      id: item.id,
      group: resolveApiReviewGroup(evidence, operations),
      payload: {
        category: item.category,
        priority: item.priority,
        reason: item.reason,
        source: item.source,
        evidence,
        question: buildReviewQuestion(evidence),
        allowedDecisions: ['confirm', 'exclude', 'defer'],
      },
    };
  });
  return buildReviewBatches(grouped, maxBatchSize);
}

function resolveApiReviewGroup(
  evidence: Record<string, unknown>,
  operations: Map<string, ContractRecord>,
): string {
  const service = typeof evidence.service === 'string' ? evidence.service : 'shared';
  const operationKey = typeof evidence.operationKey === 'string' ? evidence.operationKey : undefined;
  const operation = operationKey ? operations.get(operationKey) : undefined;
  const tags = operation?.evidence?.tags;
  const controller = Array.isArray(tags) && typeof tags[0] === 'string'
    ? tags[0]
    : operationKey ? operationPathGroup(operationKey) : String(evidence.type ?? 'unclassified');
  return `${service}:${controller}`;
}

function operationPathGroup(operationKey: string): string {
  const pathValue = operationKey.split(' ').slice(1).join(' ');
  const segments = pathValue.split('/').filter(Boolean).slice(0, 2);
  return segments.join('/') || 'unclassified';
}

function buildReviewQuestion(evidence: Record<string, unknown>): string {
  const type = String(evidence.type ?? 'unclassified');
  const operationKey = typeof evidence.operationKey === 'string' ? evidence.operationKey : '无具体接口';
  if (type === 'missing-summary') return `请确认 ${operationKey} 的业务用途、操作对象及是否允许进入自动化。`;
  if (type === 'missing-security-schemes') return `请确认 ${operationKey} 的鉴权要求和可复用身份范围。`;
  if (type === 'relative-server') return `请确认 ${operationKey} 所属服务的运行时基础地址。`;
  return `请确认 ${operationKey} 的 ${type} 未决项应确认、排除还是暂缓。`;
}

