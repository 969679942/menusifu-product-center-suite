import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { ProductCenterItemFullReviewDocument } from '../utils/product-center-item-full-review';
import type {
  ProductCenterItemRebuiltCase,
  ProductCenterItemXmindRebuildPlan,
} from '../utils/product-center-item-xmind-rebuild';
import { loadProductCenterExecutionDecisions } from '../utils/product-center-execution-decisions';
import { scanGeneratedArtifacts } from '../utils/product-center-run-safety';

type TechnicalEntry = {
  caseId: string;
  priority: 'P0' | 'P1' | 'P2';
  currentStatus: string;
  runtimeSource: string;
  canonicalCompatibility: string;
  generationAllowed: boolean;
  remainingGapCodes: string[];
};

type TechnicalStatusDocument = {
  fingerprint: string;
  entries: TechnicalEntry[];
};

type LaneGroup = {
  groupId: string;
  templateKey: string;
  evidenceShapes: Record<string, string>;
  lane: 'green' | 'yellow';
  productType: ProductCenterItemRebuiltCase['productType'];
  scenarioFamily: string;
  operation: string;
  riskLevel: 'L0' | 'L1' | 'L2' | 'L3';
  caseIds: string[];
  representativeCaseId: string;
  reusableAcceptedTemplateCaseIds: string[];
  fullReviewApproved: true;
  humanReviewRequired: false;
  sampleReviewCount: number;
  sampleMode: 'none' | 'automated-controlled-probe';
  nextAction: string;
};

const manualRuleGroups = [
  {
    groupId: 'MR01',
    title: '分类叶子规则 canonical 来源统一',
    decisionType: 'canonical-source-reconciliation',
    caseIds: ['TC-ITEM-STD-007'],
  },
  {
    groupId: 'MR02',
    title: '商品名称唯一性范围 canonical 来源统一',
    decisionType: 'canonical-source-reconciliation',
    caseIds: ['TC-ITEM-STD-011', 'TC-ITEM-STD-012', 'TC-ITEM-STD-013', 'TC-ITEM-STD-014'],
  },
  {
    groupId: 'MR03',
    title: '加料商品字段范围产品确认',
    decisionType: 'product-rule-confirmation',
    caseIds: ['TC-ITEM-ADD-001'],
  },
  {
    groupId: 'MR04',
    title: '套餐负价格归一规则产品确认',
    decisionType: 'product-rule-confirmation',
    caseIds: ['TC-ITEM-PKG-019'],
  },
  {
    groupId: 'MR05',
    title: '套餐分类父级选择规则产品确认',
    decisionType: 'product-rule-confirmation',
    caseIds: ['TC-ITEM-PKG-013'],
  },
  {
    groupId: 'MR06',
    title: '跨商品类型名称唯一性产品确认',
    decisionType: 'product-rule-confirmation',
    caseIds: ['TC-ITEM-ADD-015'],
  },
] as const;

export function buildProductCenterItemAutomationFastLaneArtifacts(options: {
  projectRoot?: string;
  outputRoot?: string;
  generatedAt?: string;
} = {}) {
  const projectRoot = path.resolve(options.projectRoot ?? path.resolve(__dirname, '..'));
  const outputRoot = path.resolve(options.outputRoot ?? projectRoot);
  const canonicalRoot = path.join(projectRoot, 'contracts/product-center/test-cases/canonical');
  const statusPath = path.join(canonicalRoot, 'product-center-item-current-technical-status.json');
  const planPath = path.join(canonicalRoot, 'product-center-item-xmind-rebuild-pilot.json');
  const reviewPath = path.join(canonicalRoot, 'product-center-item-full-review.json');
  const status = readJson<TechnicalStatusDocument>(statusPath);
  const plan = readJson<ProductCenterItemXmindRebuildPlan>(planPath);
  const review = readJson<ProductCenterItemFullReviewDocument>(reviewPath);
  const executionDecisions = loadProductCenterExecutionDecisions(projectRoot);
  if (review.sourcePlanFingerprint !== plan.fingerprint) {
    throw new Error('快车道拒绝使用与当前 canonical 不一致的全审结果');
  }
  const planById = new Map(plan.cases.map((item) => [item.id, item]));
  const reviewById = new Map(review.entries.map((item) => [item.caseId, item]));
  const excluded = status.entries.filter((item) => (
    !item.generationAllowed
    && executionDecisions.get(item.caseId)?.status !== 'not-applicable'
  ));
  const automaticEntries = excluded.filter((item) => (
    item.currentStatus === 'capability-mapping-required'
    || item.currentStatus === 'page-observation-required'
    || item.currentStatus === 'recipe-drift-repair-required'
  ));
  const manualRuleReviewCaseIds = excluded.filter((item) => (
    item.canonicalCompatibility === 'canonical-reconciliation-required'
    || item.currentStatus === 'product-rule-confirmation-required'
  )).map((item) => item.caseId).sort();
  const productDefectCaseIds = excluded
    .filter((item) => item.currentStatus === 'product-defect-open')
    .map((item) => item.caseId)
    .sort();
  const environmentBlockedCaseIds = excluded
    .filter((item) => item.currentStatus === 'blocked-until-terminal-access')
    .map((item) => item.caseId)
    .sort();
  const acceptedTemplates = status.entries
    .filter((item) => item.generationAllowed)
    .map((item) => planById.get(item.caseId))
    .filter((item): item is ProductCenterItemRebuiltCase => Boolean(item));
  const acceptedTemplateIds = new Map<string, string[]>();
  for (const item of acceptedTemplates) {
    const key = templateKey(item);
    acceptedTemplateIds.set(key, [...(acceptedTemplateIds.get(key) ?? []), item.id].sort());
  }
  const groupsByKey = new Map<string, ProductCenterItemRebuiltCase[]>();
  for (const entry of automaticEntries) {
    const item = requireApprovedCase(entry.caseId, planById, reviewById);
    const key = templateKey(item);
    groupsByKey.set(key, [...(groupsByKey.get(key) ?? []), item]);
  }
  const groups: LaneGroup[] = [...groupsByKey.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, items], index) => {
      const sorted = [...items].sort(compareCases);
      const representative = sorted[0];
      const reusableAcceptedTemplateCaseIds = acceptedTemplateIds.get(key) ?? [];
      const lane = reusableAcceptedTemplateCaseIds.length > 0 && riskLevel(representative) !== 'L3'
        ? 'green' as const
        : 'yellow' as const;
      return {
        groupId: `AT${String(index + 1).padStart(2, '0')}`,
        templateKey: key,
        evidenceShapes: Object.fromEntries(sorted.map((item) => [item.id, evidenceShape(item)])),
        lane,
        productType: representative.productType,
        scenarioFamily: representative.scenarioFamily,
        operation: operation(representative),
        riskLevel: riskLevel(representative),
        caseIds: sorted.map((item) => item.id),
        representativeCaseId: representative.id,
        reusableAcceptedTemplateCaseIds,
        fullReviewApproved: true as const,
        humanReviewRequired: false as const,
        sampleReviewCount: lane === 'green' ? 0 : sorted.length,
        sampleMode: lane === 'green' ? 'none' as const : 'automated-controlled-probe' as const,
        nextAction: lane === 'green'
          ? '复用已验收模板，批量生成并编译；编译通过后整组共享运行。'
          : '复用共享页面与数据链执行整组，但每条用例独立断言、独立证据和独立判定。',
      };
    });
  const automaticCaseIds = groups.flatMap((group) => group.caseIds).sort();
  const manualGroupCaseIds = manualRuleGroups.flatMap((group) => [...group.caseIds]).sort();
  if (!sameSet(manualRuleReviewCaseIds, manualGroupCaseIds)) {
    throw new Error('人工规则决策组未精确覆盖当前来源/PRD 门禁');
  }
  const staticSemanticReReviewRequired = automaticEntries.filter((entry) => {
    const reviewed = reviewById.get(entry.caseId);
    return reviewed?.decision !== 'approved' || reviewed.issues.length > 0;
  }).length;
  const allIds = [
    ...automaticCaseIds,
    ...manualRuleReviewCaseIds,
    ...productDefectCaseIds,
    ...environmentBlockedCaseIds,
  ];
  assertUnique(allIds, '快车道分流包含重复用例');
  if (!sameSet(allIds, excluded.map((item) => item.caseId))) {
    throw new Error(`快车道分流未完整覆盖当前未生成用例：${excluded.length}`);
  }
  const semanticValue = {
    sourceFingerprints: {
      technicalStatus: status.fingerprint,
      canonicalPlan: plan.fingerprint,
      fullReview: review.fingerprint,
      technicalStatusFile: sha256File(statusPath),
      canonicalPlanFile: sha256File(planPath),
      fullReviewFile: sha256File(reviewPath),
    },
    summary: {
      excludedFromAccurateRelease: excluded.length,
      automaticTechnicalPipeline: automaticCaseIds.length,
      automaticGreen: groups.filter((group) => group.lane === 'green')
        .flatMap((group) => group.caseIds).length,
      automaticYellow: groups.filter((group) => group.lane === 'yellow')
        .flatMap((group) => group.caseIds).length,
      automaticTemplateGroups: groups.length,
      greenTemplateGroups: groups.filter((group) => group.lane === 'green').length,
      yellowTemplateGroups: groups.filter((group) => group.lane === 'yellow').length,
      manualRuleReview: manualRuleReviewCaseIds.length,
      manualRuleReviewGroups: manualRuleGroups.length,
      productDefectQueue: productDefectCaseIds.length,
      environmentBlocked: environmentBlockedCaseIds.length,
      staticSemanticReReviewRequired,
    },
    policy: {
      reviewByTemplateNotCase: true as const,
      fullReviewApprovalReused: true as const,
      runtimeEvidenceReusedBySharedChain: true as const,
      runtimeEvidenceInheritanceRequiresIdenticalShape: true as const,
      runtimeEvidenceInheritanceAllowed: false as const,
      caseLevelEvidenceRequired: true as const,
      sharedChainSetupReuseAllowed: true as const,
      greenHumanReviewRequired: false as const,
      yellowReviewScope: 'all-cases-in-shared-chain' as const,
      yellowSampleMode: 'automated-controlled-probe' as const,
      redCasesMayGenerateAutomation: false as const,
      productDefectsRequireCaseRewrite: false as const,
      environmentBlockRequiresCaseReview: false as const,
    },
    automaticTechnicalPipeline: {
      caseIds: automaticCaseIds,
      groups,
    },
    manualRuleReview: {
      caseIds: manualRuleReviewCaseIds,
      groups: manualRuleGroups,
    },
    productDefectQueue: {
      caseIds: productDefectCaseIds,
      action: '保留 canonical，研发修复后整批复测；无需重新做静态语义审核。',
    },
    environmentBlocked: {
      caseIds: environmentBlockedCaseIds,
      action: '等待可控 POS、订单查询和取消能力；无需重新做静态语义审核。',
    },
    executionOrder: [
      '绿色模板直接批量生成和编译。',
      '黄色模板复用共享执行链，但组内每条用例都生成独立证据，禁止代表证据继承。',
      'MR01-MR06 由产品负责人批量确认，不逐条审核。',
      '产品缺陷和环境阻断独立排队，不占用用例审核工时。',
    ],
  };
  if (semanticValue.summary.excludedFromAccurateRelease !== 136
    || semanticValue.summary.automaticTechnicalPipeline !== 120
    || semanticValue.summary.manualRuleReview !== 9
    || semanticValue.summary.manualRuleReviewGroups !== 6
    || semanticValue.summary.productDefectQueue !== 6
    || semanticValue.summary.environmentBlocked !== 1
    || semanticValue.summary.staticSemanticReReviewRequired !== 0) {
    throw new Error(`快车道分母漂移：${JSON.stringify(semanticValue.summary)}`);
  }
  const document = {
    schemaVersion: '1.0.0' as const,
    collectionId: 'product-center-item-automation-fast-lane' as const,
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    status: 'ready' as const,
    ...semanticValue,
    fingerprint: hashValue(semanticValue),
  };
  const outputDirectory = path.join(outputRoot, 'contracts/product-center/reviews/automation-fast-lane');
  const jsonPath = path.join(outputDirectory, 'product-center-item-automation-fast-lane.json');
  const markdownPath = path.join(outputDirectory, 'product-center-item-automation-fast-lane.md');
  writeJson(jsonPath, document);
  writeText(markdownPath, renderMarkdown(document));
  const findings = scanGeneratedArtifacts(outputDirectory);
  if (findings.length > 0) throw new Error(`快车道产物安全扫描未通过：${findings.length}`);
  return { document, jsonPath, markdownPath };
}

function requireApprovedCase(
  caseId: string,
  planById: Map<string, ProductCenterItemRebuiltCase>,
  reviewById: Map<string, ProductCenterItemFullReviewDocument['entries'][number]>,
): ProductCenterItemRebuiltCase {
  const item = planById.get(caseId);
  const reviewed = reviewById.get(caseId);
  if (!item || reviewed?.decision !== 'approved' || reviewed.issues.length > 0) {
    throw new Error(`自动技术流水线缺少已批准 canonical：${caseId}`);
  }
  return item;
}

function templateKey(item: ProductCenterItemRebuiltCase): string {
  return [item.productType, item.scenarioFamily, operation(item), riskLevel(item)].join('|');
}

function operation(item: ProductCenterItemRebuiltCase): string {
  const text = item.actions.join(' ');
  if (/失败|不可|不能|校验|为空|未填写|重复|超过|少于|大于|小于|非数字|无效/.test(item.title)) return 'negative';
  if (/删除|移除/.test(text)) return 'delete';
  if (/新增|创建|添加|上传|加入/.test(text)) return 'create';
  if (/编辑|修改|更新|启用|停用|调整|改选|设置|勾选|取消勾选|切换|保存|提交/.test(text)) return 'update';
  if (/搜索|查询|筛选/.test(text)) return 'search';
  return 'read';
}

function evidenceShape(item: ProductCenterItemRebuiltCase): string {
  const semanticSteps = {
    actions: item.actions.map(normalizeEvidenceText),
    expectedResults: item.expectedResults.map(normalizeEvidenceText),
  };
  return hashValue(semanticSteps).slice(0, 12);
}

function normalizeEvidenceText(value: string): string {
  return value
    .normalize('NFKC')
    .replace(/AUTO_AUDIT[_A-Z0-9-]*/gi, '{identity}')
    .replace(/\{当前时间戳毫秒\}|\d{10,}/g, '{timestamp}')
    .replace(/\d+(?:\.\d+)?/g, '{number}')
    .replace(/\s+/g, ' ')
    .trim();
}

function riskLevel(item: ProductCenterItemRebuiltCase): 'L0' | 'L1' | 'L2' | 'L3' {
  const text = [item.title, ...item.actions, ...item.expectedResults].join(' ');
  if (/下发|门店|渠道|终端|订单|C\s*端|点单|加购/.test(text)) return 'L3';
  const action = operation(item);
  if (action === 'negative') return 'L1';
  if (action === 'create' || action === 'update' || action === 'delete') return 'L2';
  return 'L0';
}

function compareCases(left: ProductCenterItemRebuiltCase, right: ProductCenterItemRebuiltCase): number {
  const priority = { P0: 0, P1: 1, P2: 2 };
  return priority[left.priority] - priority[right.priority] || left.id.localeCompare(right.id);
}

function renderMarkdown(document: ReturnType<typeof buildProductCenterItemAutomationFastLaneArtifacts>['document']): string {
  return `${[
    '# 商品中心自动化快车道分类',
    '',
    `- 未进入准确发布：${document.summary.excludedFromAccurateRelease} 条`,
    `- 自动技术流水线：${document.summary.automaticTechnicalPipeline} 条 / ${document.summary.automaticTemplateGroups} 组`,
    `- 绿色：${document.summary.automaticGreen} 条 / ${document.summary.greenTemplateGroups} 组`,
    `- 黄色：${document.summary.automaticYellow} 条 / ${document.summary.yellowTemplateGroups} 组`,
    `- 人工规则审核：${document.summary.manualRuleReview} 条 / ${document.summary.manualRuleReviewGroups} 组`,
    `- 产品缺陷队列：${document.summary.productDefectQueue} 条`,
    `- 环境阻断：${document.summary.environmentBlocked} 条`,
    `- 静态语义重新审核：${document.summary.staticSemanticReReviewRequired} 条`,
    '- 黄色策略：每组复用页面与数据链，但每条用例独立断言和留证，禁止用代表证据替代组内用例。',
    '',
    '## 自动技术模板',
    '',
    ...document.automaticTechnicalPipeline.groups.map((group) => (
      `- ${group.groupId} [${group.lane}] ${group.productType}/${group.scenarioFamily}/${group.operation}/${group.riskLevel}：${group.caseIds.length} 条；共享链锚点=${group.representativeCaseId}；逐用例证据=true；人工审核=false`
    )),
    '',
    '## 人工规则决策',
    '',
    ...document.manualRuleReview.groups.map((group) => (
      `- ${group.groupId} ${group.title}：${group.caseIds.join('、')}`
    )),
    '',
    '## 执行顺序',
    '',
    ...document.executionOrder.map((item, index) => `${index + 1}. ${item}`),
  ].join('\n').trim()}\n`;
}

function readJson<T>(filePath: string): T {
  return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T;
}

function writeJson(filePath: string, value: unknown): void {
  writeText(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function writeText(filePath: string, value: string): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.${process.pid}.tmp`;
  fs.writeFileSync(temporaryPath, value, 'utf8');
  fs.renameSync(temporaryPath, filePath);
}

function sha256File(filePath: string): string {
  return createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function hashValue(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function assertUnique(values: readonly string[], message: string): void {
  if (new Set(values).size !== values.length) throw new Error(message);
}

function sameSet(left: readonly string[], right: readonly string[]): boolean {
  return [...left].sort().join(',') === [...right].sort().join(',');
}

if (require.main === module) {
  try {
    const { document, jsonPath, markdownPath } = buildProductCenterItemAutomationFastLaneArtifacts();
    process.stdout.write(
      `商品中心自动化快车道已生成：${jsonPath}\n${markdownPath}\n自动=${document.summary.automaticTechnicalPipeline}；人工规则=${document.summary.manualRuleReview}；缺陷=${document.summary.productDefectQueue}；环境=${document.summary.environmentBlocked}\n`,
    );
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
