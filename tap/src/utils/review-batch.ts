import { createHash } from 'node:crypto';

export type GroupedReviewItem<T> = {
  id: string;
  group: string;
  payload: T;
};

export type ReviewBatch<T> = {
  id: string;
  group: string;
  sequence: number;
  items: Array<GroupedReviewItem<T>>;
};

export type ReviewBatchSet<T> = {
  schemaVersion: '1.0.0';
  summary: {
    total: number;
    batchCount: number;
    groups: Array<{ group: string; items: number; batches: number }>;
  };
  batches: Array<ReviewBatch<T>>;
};

export function buildReviewBatches<T>(
  items: readonly GroupedReviewItem<T>[],
  maxBatchSize: number,
): ReviewBatchSet<T> {
  if (!Number.isInteger(maxBatchSize) || maxBatchSize <= 0) {
    throw new Error(`审核批次大小无效：${maxBatchSize}`);
  }
  const ids = new Set<string>();
  for (const item of items) {
    if (!item.id) throw new Error('审核项 ID 为空');
    if (!item.group) throw new Error(`审核项分组为空：${item.id}`);
    if (ids.has(item.id)) throw new Error(`审核项重复：${item.id}`);
    ids.add(item.id);
  }

  const grouped = new Map<string, Array<GroupedReviewItem<T>>>();
  for (const item of [...items].sort((left, right) => left.id.localeCompare(right.id))) {
    const groupItems = grouped.get(item.group) ?? [];
    groupItems.push(item);
    grouped.set(item.group, groupItems);
  }

  const batches: Array<ReviewBatch<T>> = [];
  const groups: ReviewBatchSet<T>['summary']['groups'] = [];
  for (const [group, groupItems] of [...grouped.entries()].sort(([left], [right]) => left.localeCompare(right))) {
    const batchCount = Math.ceil(groupItems.length / maxBatchSize);
    groups.push({ group, items: groupItems.length, batches: batchCount });
    for (let offset = 0; offset < groupItems.length; offset += maxBatchSize) {
      const sequence = Math.floor(offset / maxBatchSize) + 1;
      batches.push({
        id: `batch-${shortHash(group)}-${String(sequence).padStart(2, '0')}`,
        group,
        sequence,
        items: groupItems.slice(offset, offset + maxBatchSize),
      });
    }
  }

  return {
    schemaVersion: '1.0.0',
    summary: { total: items.length, batchCount: batches.length, groups },
    batches,
  };
}

function shortHash(value: string): string {
  return createHash('sha256').update(value).digest('hex').slice(0, 10);
}
