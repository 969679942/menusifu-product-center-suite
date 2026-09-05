import type {
  ProductCenterTestCaseClaim,
  ProductCenterTestCaseInput,
} from './product-center-test-case-ir';

export type ProductCenterItemPilotCapability = {
  capabilityIds: string[];
  automationPreference: 'candidate' | 'manual';
};

export type ProductCenterItemIntakePilotSource = {
  fileName: string;
  markdown: string;
  selectedCaseIds: string[];
  sourceBindings: Record<string, string[]>;
  sourceIds: ReadonlySet<string>;
  capabilityByCaseId: ReadonlyMap<string, ProductCenterItemPilotCapability>;
};

export type ProductCenterItemIntakePilotGap = {
  caseId: string;
  reason: 'CASE_NOT_FOUND' | 'MISSING_SOURCE_BINDING' | 'UNKNOWN_SOURCE_ID';
  detail?: string;
};

export function buildProductCenterItemIntakePilot(source: ProductCenterItemIntakePilotSource): {
  cases: ProductCenterTestCaseInput[];
  unresolved: ProductCenterItemIntakePilotGap[];
} {
  const parsed = parseCaseBlocks(source.markdown, new Set(source.selectedCaseIds));
  const unresolved: ProductCenterItemIntakePilotGap[] = [];
  const cases = source.selectedCaseIds.flatMap((caseId) => {
    const block = parsed.get(caseId);
    if (!block) {
      unresolved.push({ caseId, reason: 'CASE_NOT_FOUND' });
      return [];
    }
    const sourceRef = `TEST-SCHEME:${source.fileName}#${caseId}`;
    const boundSourceIds = source.sourceBindings[sourceRef];
    if (!boundSourceIds) {
      unresolved.push({ caseId, reason: 'MISSING_SOURCE_BINDING' });
    } else {
      const unknown = boundSourceIds.filter((sourceId) => !source.sourceIds.has(sourceId));
      if (unknown.length > 0) {
        unresolved.push({ caseId, reason: 'UNKNOWN_SOURCE_ID', detail: unknown.join(', ') });
      }
    }
    return [toTestCase(block, sourceRef, boundSourceIds ?? [], source.capabilityByCaseId.get(caseId))];
  });
  return { cases, unresolved };
}

type ParsedCaseBlock = {
  id: string;
  title: string;
  priority: 'P0' | 'P1' | 'P2';
  preconditions: string[];
  actions: string[];
  expectedResults: string[];
};

function parseCaseBlocks(markdown: string, selectedCaseIds: ReadonlySet<string>): Map<string, ParsedCaseBlock> {
  const starts = [...markdown.matchAll(/^### 用例编号：(TC-[A-Z0-9-]+)\s*$/gm)];
  const blocks = new Map<string, ParsedCaseBlock>();
  starts.forEach((match, index) => {
    const id = match[1];
    if (!selectedCaseIds.has(id)) return;
    const start = match.index ?? 0;
    const end = starts[index + 1]?.index ?? markdown.length;
    const content = markdown.slice(start, end);
    const title = requiredField(content, '用例标题');
    const priority = requiredField(content, '优先级');
    if (priority !== 'P0' && priority !== 'P1' && priority !== 'P2') {
      throw new Error(`用例优先级无效：${id} ${priority}`);
    }
    blocks.set(id, {
      id,
      title,
      priority,
      preconditions: parseNumberedSection(content, '前置条件', '测试步骤'),
      actions: parseNumberedSection(content, '测试步骤', '预期结果'),
      expectedResults: parseNumberedSection(content, '预期结果'),
    });
  });
  return blocks;
}

function requiredField(content: string, label: string): string {
  const match = content.match(new RegExp(`^${label}：(.+)$`, 'm'));
  if (!match) throw new Error(`用例字段缺失：${label}`);
  return match[1].trim();
}

function parseNumberedSection(content: string, heading: string, nextHeading?: string): string[] {
  const startMatch = content.match(new RegExp(`^${heading}：\\s*$`, 'm'));
  if (!startMatch || startMatch.index === undefined) return [];
  const start = startMatch.index + startMatch[0].length;
  const remainder = content.slice(start);
  const endMatch = nextHeading ? remainder.match(new RegExp(`^${nextHeading}：\\s*$`, 'm')) : undefined;
  const section = remainder.slice(0, endMatch?.index ?? remainder.length);
  const items: string[] = [];
  for (const rawLine of section.split(/\r?\n/)) {
    const numbered = rawLine.match(/^\s*\d+(?:\.\d+)?[.、]\s*(.+)$/);
    if (numbered) {
      items.push(cleanText(numbered[1]));
      continue;
    }
    const continuation = rawLine.trim();
    if (continuation && items.length > 0 && !continuation.startsWith('#')) {
      items[items.length - 1] = `${items[items.length - 1]}；${cleanText(continuation)}`;
    }
  }
  return items.filter(Boolean);
}

function cleanText(value: string): string {
  return value.trim().replace(/[。；;]+$/u, '');
}

function toTestCase(
  block: ParsedCaseBlock,
  sourceRef: string,
  sourceIds: string[],
  capability: ProductCenterItemPilotCapability | undefined,
): ProductCenterTestCaseInput {
  const mutatesData = /创建|新增|保存|编辑|删除|启用|停用/u.test(block.title);
  const automationPreference = capability?.automationPreference ?? 'manual';
  const claims: ProductCenterTestCaseClaim[] = [
    ...buildClaims(block.id, 'precondition', block.preconditions, sourceIds, sourceRef),
    ...buildClaims(block.id, 'action', block.actions, sourceIds, sourceRef),
    ...buildClaims(block.id, 'expectation', block.expectedResults, sourceIds, sourceRef),
  ];
  return {
    id: block.id,
    module: 'brand-item',
    route: '/pp/brand/list',
    title: block.title,
    priority: block.priority,
    sourceIds: [...sourceIds],
    sourceRefs: [sourceRef],
    preconditions: block.preconditions,
    actions: block.actions,
    expectedResults: block.expectedResults,
    mutatesData,
    cleanup: mutatesData ? ['通过 API 按服务端 ID 清理本用例数据并验证零残留'] : [],
    automationPreference,
    claims,
    coverageIds: [],
    execution: {
      roleIds: ['merchant-center-product-admin'],
      environmentIds: ['balamxqa'],
      capabilityIds: capability?.capabilityIds ?? [],
      mutationMode: mutatesData ? 'api-seeded-ui-action' : 'none',
      verificationSignals: mutatesData ? ['api', 'ui'] : ['ui'],
      seedAdapterIds: mutatesData ? ['productCenter.seedItem'] : [],
      cleanupAdapterIds: mutatesData ? ['productCenter.cleanupItem'] : [],
      asyncPolicy: 'none',
    },
  };
}

function buildClaims(
  caseId: string,
  kind: ProductCenterTestCaseClaim['kind'],
  texts: string[],
  sourceIds: string[],
  sourceRef: string,
): ProductCenterTestCaseClaim[] {
  return texts.map((text, index) => ({
    id: `claim:${caseId}:${kind}:${index + 1}`,
    kind,
    text,
    sourceIds: [...sourceIds],
    sourceRefs: [sourceRef],
    evidenceLevel: 'confirmed',
  }));
}
