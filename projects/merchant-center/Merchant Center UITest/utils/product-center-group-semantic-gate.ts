import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export type GroupSemanticCase = {
  id: string;
  title: string;
  module?: string;
  source?: string;
  steps: string[];
  expectedResults: string[];
};

export type GroupSemanticIssue = {
  kind:
    | 'case-spec-conflict'
    | 'assertion-surface-mismatch'
    | 'field-identity-ambiguous'
    | 'source-rule-conflict';
  message: string;
  owner: 'automation';
};

export type GroupAssertionSurface = 'list-ui' | 'detail-ui' | 'api' | 'terminal-ui';

export const productCenterGroupAssertionSurfaceContract: ReadonlyArray<{
  fieldId: string;
  aliases: readonly string[];
  authoritativeSurfaces: readonly GroupAssertionSurface[];
}> = [
  { fieldId: 'group.name', aliases: ['组名称', '规格组名称', '口味组名称', '做法组名称'], authoritativeSurfaces: ['list-ui', 'detail-ui', 'api'] },
  { fieldId: 'detail.name', aliases: ['明细名称', '规格明细名称', '口味明细名称', '做法明细名称'], authoritativeSurfaces: ['list-ui', 'detail-ui', 'api'] },
  { fieldId: 'spec.value', aliases: ['规格值', 'Spec Value'], authoritativeSurfaces: ['detail-ui', 'api'] },
  { fieldId: 'spec.device-code', aliases: ['设备编码', 'Device Code'], authoritativeSurfaces: ['detail-ui', 'api'] },
  { fieldId: 'group.second-name', aliases: ['第二语言名称', 'Second Name'], authoritativeSurfaces: ['detail-ui', 'api'] },
  { fieldId: 'group.description', aliases: ['组描述', 'Description'], authoritativeSurfaces: ['detail-ui', 'api'] },
  { fieldId: 'addon.product-base-price', aliases: ['价格($)', '加料商品标准价'], authoritativeSurfaces: ['detail-ui', 'api'] },
  { fieldId: 'addon.single-surcharge', aliases: ['单次加价', 'additionalPrice'], authoritativeSurfaces: ['detail-ui', 'api'] },
  { fieldId: 'addon.group-products', aliases: ['组内商品', '加料商品关系'], authoritativeSurfaces: ['detail-ui', 'api'] },
];

export const productCenterGroupSourceRuleSemanticContract = [{
  ruleId: 'BR-FMT-005',
  fieldCategory: 'price-input',
  decimalOverflowBehavior: 'round-to-two-decimals-and-save',
  fieldIdentityRequired: true,
}] as const;

export type GroupDriftComparisonSurface =
  | 'business-data'
  | 'validation-feedback'
  | 'lifecycle'
  | 'ui-capability';

export type GroupDriftDecision = {
  decisionId: string;
  caseId: string;
  ruleId: string;
  sourceRef: string;
  sourceTitle: string;
  expectedClaims: string[];
  expectedClaimsHash: string;
  observedClaim: string;
  comparisonSurface: GroupDriftComparisonSurface;
  evidence: Array<{ path: string; sha256: string; bytes: number }>;
  decisionStatus: 'evidence-confirmed' | 'human-confirmed';
  confirmedBy: string;
  decidedAt: string;
  rationale: string;
};

export type GroupDriftDecisionRegistry = {
  schemaVersion: '1.0.0';
  registryId: 'product-center-group-drift-decisions';
  generatedAt: string;
  decisions: GroupDriftDecision[];
};

export function evaluateProductCenterGroupSemanticGate(testCase: GroupSemanticCase): GroupSemanticIssue | null {
  const title = testCase.title;
  const steps = testCase.steps.join(' ');
  const expected = testCase.expectedResults.join(' ');
  const allText = `${title} ${steps} ${expected}`;
  const detailPopupTitle = /新增(?:规格|口味|做法)明细弹窗/.test(title);
  const editsExistingGroup = /编辑.+组/.test(steps) && /添加(?:规格|口味|做法)?明细|添加规格|添加口味|添加做法/.test(steps);
  if (detailPopupTitle && editsExistingGroup && /取消/.test(`${steps}${expected}`)) {
    return {
      kind: 'case-spec-conflict',
      message: `${testCase.id} 标题要求新增明细弹窗，但步骤描述编辑已有组后行内添加明细；交互容器不是业务不变量，应先修正用例语义。`,
      owner: 'automation',
    };
  }

  const listClauses = expected.split(/[。；]/).filter((clause) => /列表/.test(clause));
  const unsupportedListFields = productCenterGroupAssertionSurfaceContract
    .filter((field) => !field.authoritativeSurfaces.includes('list-ui'))
    .filter((field) => listClauses.some((clause) => field.aliases.some((alias) => clause.includes(alias))));
  if (/列表[^。；]*展示(?:全部|所有|各项|已填).*(?:字段|信息)/.test(expected) || unsupportedListFields.length > 0) {
    return {
      kind: 'assertion-surface-mismatch',
      message: `${testCase.id} 将详情/API字段要求放到了列表断言面；必须按字段权威展示层拆分断言${unsupportedListFields.length ? `：${unsupportedListFields.map((item) => item.fieldId).join(', ')}` : '。'}`,
      owner: 'automation',
    };
  }

  if (testCase.module?.endsWith('加料组')
    && /加料(?:明细)?价格/.test(allText)
    && !/(单次加价|加料商品标准价|价格\(\$\))/.test(allText)) {
    return {
      kind: 'field-identity-ambiguous',
      message: `${testCase.id} 使用“加料价格/加料明细价格”但未区分只读商品标准价与可编辑单次加价；必须绑定明确字段后才能执行或登记产品偏差。`,
      owner: 'automation',
    };
  }

  if (testCase.source?.includes('BR-FMT-005')
    && /(?:超过两位小数|1\.999|三位小数)/.test(`${steps} ${expected}`)
    && /(?:精度错误|保存失败|不发送保存请求|不发送创建请求|拒绝保存)/.test(expected)) {
    return {
      kind: 'source-rule-conflict',
      message: `${testCase.id} 将超过两位小数断言为拒绝保存，但 BR-FMT-005 要求四舍五入保留两位后保存；必须先修正来源与预期冲突。`,
      owner: 'automation',
    };
  }
  return null;
}

export function auditProductCenterGroupGeneratedCaseSemantics(
  cases: readonly GroupSemanticCase[],
): {
  status: 'passed' | 'blocked';
  checkedCases: number;
  issues: Array<GroupSemanticIssue & { caseId: string }>;
} {
  const issues = cases.flatMap((testCase) => {
    const issue = evaluateProductCenterGroupSemanticGate(testCase);
    return issue ? [{ caseId: testCase.id, ...issue }] : [];
  });
  return {
    status: issues.length === 0 ? 'passed' : 'blocked',
    checkedCases: cases.length,
    issues,
  };
}

export function stableClaimsHash(claims: readonly string[]): string {
  return `sha256:${crypto.createHash('sha256').update(JSON.stringify([...claims])).digest('hex')}`;
}

export function loadProductCenterGroupDriftDecisionRegistry(projectRoot: string): GroupDriftDecisionRegistry {
  const registryPath = path.join(projectRoot, 'contracts/product-center/group/product-center-group-drift-decisions.json');
  if (!fs.existsSync(registryPath)) throw new Error(`缺少产品偏差决策登记：${registryPath}`);
  const registry = JSON.parse(fs.readFileSync(registryPath, 'utf8')) as GroupDriftDecisionRegistry;
  if (registry.schemaVersion !== '1.0.0' || registry.registryId !== 'product-center-group-drift-decisions') {
    throw new Error(`产品偏差决策登记版本错误：${registryPath}`);
  }
  const ids = new Set<string>();
  const workspaceRoot = path.resolve(projectRoot, '..');
  const allowedSurfaces = new Set<GroupDriftComparisonSurface>([
    'business-data',
    'validation-feedback',
    'lifecycle',
    'ui-capability',
  ]);
  for (const decision of registry.decisions) {
    if (ids.has(decision.caseId)) throw new Error(`产品偏差决策重复：${decision.caseId}`);
    ids.add(decision.caseId);
    if (!decision.sourceRef.includes(decision.caseId)) throw new Error(`产品偏差缺少用例来源锚点：${decision.caseId}`);
    const sourcePath = decision.sourceRef.split('#', 1)[0];
    const absoluteSourcePath = path.resolve(workspaceRoot, sourcePath);
    if (!isWithin(workspaceRoot, absoluteSourcePath) || !fs.existsSync(absoluteSourcePath)) {
      throw new Error(`产品偏差来源文件不存在或越界：${decision.caseId}=${sourcePath}`);
    }
    if (!decision.observedClaim || !decision.rationale) throw new Error(`产品偏差决策内容不完整：${decision.caseId}`);
    if (decision.expectedClaimsHash !== stableClaimsHash(decision.expectedClaims)) {
      throw new Error(`产品偏差登记预期哈希不自洽：${decision.caseId}`);
    }
    if (!decision.ruleId || !decision.confirmedBy || !Date.parse(decision.decidedAt)) {
      throw new Error(`产品偏差决策缺少资格元数据：${decision.caseId}`);
    }
    if (decision.decisionStatus !== 'evidence-confirmed' && decision.decisionStatus !== 'human-confirmed') {
      throw new Error(`产品偏差决策状态不可用于阻断：${decision.caseId}`);
    }
    if (!allowedSurfaces.has(decision.comparisonSurface)) throw new Error(`产品偏差比较面非法：${decision.caseId}`);
    if (!decision.evidence.length || decision.evidence.some((item) => !item.path || !/^sha256:[a-f0-9]{64}$/.test(item.sha256))) {
      throw new Error(`产品偏差缺少完整证据哈希：${decision.caseId}`);
    }
    for (const evidence of decision.evidence) {
      const absolutePath = path.resolve(workspaceRoot, evidence.path);
      if (!isWithin(workspaceRoot, absolutePath) || !fs.existsSync(absolutePath)) {
        throw new Error(`产品偏差证据不存在或越界：${decision.caseId}=${evidence.path}`);
      }
      const actual = fs.readFileSync(absolutePath);
      const actualHash = `sha256:${crypto.createHash('sha256').update(actual).digest('hex')}`;
      if (actualHash !== evidence.sha256 || actual.length !== evidence.bytes) {
        throw new Error(`产品偏差证据哈希不一致：${decision.caseId}=${evidence.path}`);
      }
    }
  }
  return registry;
}

export function qualifyProductCenterGroupDrift(
  testCase: GroupSemanticCase,
  registry: GroupDriftDecisionRegistry,
): GroupDriftDecision | null {
  const decision = registry.decisions.find((item) => item.caseId === testCase.id);
  if (!decision) return null;
  const semanticIssue = evaluateProductCenterGroupSemanticGate(testCase);
  if (semanticIssue) throw new Error(`${testCase.id} 先触发 ${semanticIssue.kind}，禁止登记为产品偏差：${semanticIssue.message}`);
  if (decision.sourceTitle !== testCase.title) throw new Error(`产品偏差来源标题已变化：${testCase.id}`);
  if (decision.expectedClaimsHash !== stableClaimsHash(testCase.expectedResults)) {
    throw new Error(`产品偏差原始预期已变化，必须重新审查：${testCase.id}`);
  }
  return decision;
}

function isWithin(root: string, target: string): boolean {
  const relative = path.relative(root, target);
  return relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative);
}
