import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { loadCurrentProductCenterBusinessRuleLifecycleSnapshot } from './build-product-center-business-rule-lifecycle-snapshot';
import { validateBusinessRuleDownstreamContract } from '../automation/system-test/business-rule-downstream-contract';

const projectRoot = path.resolve(__dirname, '..');
const workspaceRoot = path.resolve(projectRoot, '..');
const outputRoot = path.join(workspaceRoot, 'deliverables/test-plan-governance');
const outputJsonPath = path.join(outputRoot, 'product-center-business-rule-scenario-coverage.json');
const outputMarkdownPath = path.join(outputRoot, 'product-center-business-rule-scenario-coverage.md');
const observationLedgerPath = path.join(projectRoot, 'output/governance/product-center-business-rule-observation-ledger.json');

type ScenarioStatus = 'covered' | 'partially-covered' | 'not-defined' | 'not-applicable' | 'blocked';
type ScenarioCategory = 'rule-governance' | 'product-behavior';

export type ProductCenterBusinessRuleScenario = {
  scenarioId: string;
  category: ScenarioCategory;
  operation: string;
  status: ScenarioStatus;
  priority: 'P0' | 'P1' | 'P2';
  ruleIds: string[];
  caseIds: string[];
  sourceRefs: string[];
  expectedEvidence: string[];
  gapCode?: string;
  note: string;
};

type ProductCenterBusinessRuleScenarioCoverageReport = {
  schemaVersion: string;
  reportId: string;
  scope: string;
  status: string;
  purpose: string;
  source: {
    lifecyclePath: string;
    lifecycleFingerprint: string;
    sourceRefs: string[];
    observationLedgerPath: string;
    observationLedgerFingerprint: string | null;
  };
  summary: {
    totalScenarios: number;
    governanceScenarios: number;
    productBehaviorScenarios: number;
    covered: number;
    partiallyCovered: number;
    notDefined: number;
    notApplicable: number;
    blocked: number;
    formalRules: number;
    formalRulesWithBehaviorCoverage: number;
  };
  scenarios: ProductCenterBusinessRuleScenario[];
  gaps: Array<{
    scenarioId: string;
    gapCode: string;
    operation: string;
    ruleIds: string[];
    note: string;
  }>;
  executionEvidence: {
    status: string;
    summary: Record<string, number> | null;
    diagnostics: Array<{ ruleId: string; caseId: string; code: string; detail: string }>;
    observations: Array<{ caseId: string; ruleId: string; blockers: string[]; contextStatus: string; eligibleForCandidate: boolean }>;
  };
  executionImpact: {
    existingPassedCasesInvalidated: boolean;
    rerunCaseIds: string[];
    moduleDeliveryBlocked: boolean;
    businessExecutionStarted: boolean;
  };
  guardrails: {
    sourceBounded: boolean;
    missingSemanticsMayNotBeInferred: boolean;
    notDefinedDoesNotMeanProductFailure: boolean;
    reportMayNotAuthorizeExecution: boolean;
  };
};

const lifecycleSources = [
  'Merchant Center UITest/automation/system-test/business-rule-lifecycle.ts',
  'Merchant Center UITest/scripts/build-product-center-business-rule-lifecycle-snapshot.ts',
  'Merchant Center UITest/scripts/build-product-center-business-rule-event-ledger.ts',
  'Merchant Center UITest/scripts/build-product-center-business-rule-change-trigger.ts',
  'Test Automation Platform/tests/api/business-rule-lifecycle.contract.spec.ts',
  'Test Automation Platform/src/automation/system-test/business-rule-governance.ts',
];

const governanceScenarios: ProductCenterBusinessRuleScenario[] = [
  scenario('BR-SCENARIO-GOV-CANDIDATE-CREATE', 'rule-governance', 'create-candidate', 'covered', 'P0', [], [], ['buildBusinessRuleCandidate()', 'validateBusinessRule(candidate)'], '候选规则可从来源、范围、语义和指纹构建，并在进入评审前校验。'),
  scenario('BR-SCENARIO-GOV-FORMAL-READ', 'rule-governance', 'read-formal-rule', 'covered', 'P0', [], [], ['product-center-business-rule-lifecycle-snapshot.json', 'product-center-item-rule-registry.json'], '当前正式规则可从生命周期快照和规则注册表读取；两者必须按 ruleId 对账。'),
  scenario('BR-SCENARIO-GOV-CANDIDATE-READ', 'rule-governance', 'read-candidate-rules', 'covered', 'P1', [], [], ['product-center-item-test-plan-rule-candidates.json', 'product-center-item-rule-registry.json'], '候选规则可查询并保留候选指纹；当前 225 条候选仍未完成正式评审。'),
  scenario('BR-SCENARIO-GOV-REVISION', 'rule-governance', 'update-revise-rule', 'covered', 'P0', [], [], ['reviseBusinessRule()', 'BUSINESS_RULE_SEMANTICS_UNCHANGED'], '语义变化生成新 revision、previousRuleFingerprint 和 revalidation-required，不能原地覆盖历史语义。'),
  scenario('BR-SCENARIO-GOV-FORMAL-PROMOTION', 'rule-governance', 'approve-promote-formal-rule', 'covered', 'P0', [], [], ['approveBusinessRuleCandidate()', 'product-center-business-rule-baseline-promotion.json'], '批准必须绑定当前候选指纹、来源指纹、批准人、批准时间和生效版本，并生成 verified 正式规则。'),
  scenario('BR-SCENARIO-GOV-REJECT-HOLD', 'rule-governance', 'reject-or-hold-candidate', 'covered', 'P1', [], [], ['FileBusinessRuleGovernanceStore', 'queryBusinessRuleGovernance()', 'product-center-business-rule-governance-operations.json'], 'rejected/held 已定义追加式持久化事件、哈希完整性校验和独立查询投影视图；决定不晋级正式规则。'),
  scenario('BR-SCENARIO-GOV-DELETE-RETIRE', 'rule-governance', 'delete-or-retire-rule', 'covered', 'P0', [], [], ['rule-retired', 'effectiveTo', 'product-center-business-rule-governance-operations.json'], '规则删除采用可追溯废弃而非物理删除：formal 规则必须通过 rule-retired 事件和有效 effectiveTo 进入 retired，历史仍保留。'),
  scenario('BR-SCENARIO-GOV-RESTORE-ROLLBACK', 'rule-governance', 'restore-or-rollback-rule', 'covered', 'P1', [], [], ['rule-restored', 'rule-rolled-back', 'targetRuleFingerprint', 'resultingRuleFingerprint'], '恢复仅允许从 retired 返回 formal；回滚引用旧 revision/fingerprint 并生成新的结果 revision/fingerprint，不覆盖历史。'),
  scenario('BR-SCENARIO-GOV-APPROVAL-REVOKE', 'rule-governance', 'revoke-approval', 'covered', 'P1', [], [], ['approval-revoked', 'approval-expired', 'queryBusinessRuleGovernance()'], '批准撤回和过期已定义为独立终态；批准过期必须提供已到期 expiresAt，未来时间不得伪装过期。'),
  scenario('BR-SCENARIO-GOV-CONFLICT-ASSESSMENT', 'rule-governance', 'assess-conflict', 'covered', 'P0', [], [], ['product-center-business-rule-conflict-assessment.json', 'conflictAssessment.status'], '当前正式规则必须逐条登记冲突评估、优先级和冲突来源。'),
  scenario('BR-SCENARIO-GOV-OBSERVATION', 'rule-governance', 'observe-execution', 'covered', 'P0', [], [], ['observeBusinessRuleExecution()', 'product-center-business-rule-observation-ledger.json'], '完整当前执行收据可形成 observed 候选；相同语义不得伪造候选，不能自动晋级 formal。'),
  scenario('BR-SCENARIO-GOV-CHANGE-TRIGGER', 'rule-governance', 'trigger-impact-revalidation', 'covered', 'P0', [], [], ['buildBusinessRuleChangeImpact()', 'product-center-business-rule-change-trigger.json'], '规则、用例、绑定或实现指纹发生影响性变化时精确选择受影响用例；当前无新增重跑。'),
  scenario('BR-SCENARIO-GOV-HISTORY-IMPORT', 'rule-governance', 'import-history', 'covered', 'P1', [], [], ['product-center-business-rule-event-ledger.json', 'product-center-historical-business-rule-migration.json'], '历史导入只登记运行事实并保持幂等，不反推当前正式规则变化。'),
  scenario('BR-SCENARIO-GOV-AUDIT-CLOSURE', 'rule-governance', 'audit-and-close', 'covered', 'P0', [], [], ['scripts/run-product-center-business-rule-audit.ts', 'product-center-business-rule-coverage.json'], '审计重建生命周期、触发器、事件、观察、覆盖率和冻结状态，输出可复核缺口。'),
  scenario('BR-SCENARIO-GOV-TIME-CONTEXT', 'rule-governance', 'verify-time-and-effective-context', 'partially-covered', 'P1', [], [], ['validateBusinessRuleTemporalContext()', 'product-center-business-rule-time-context-review.json'], '公共合同已校验时间格式、先后顺序、有效期和显式上下文非空；当前正式规则的缺口进入系统自动证据收集，只有来源冲突才需要人工确认。', 'RULE_TIME_CONTEXT_EVIDENCE_PENDING'),
  scenario('BR-SCENARIO-GOV-CROSS-SYSTEM', 'rule-governance', 'cross-system-pilot', 'blocked', 'P1', [], [], ['platform-external-dependency.json', 'product-center-business-rule-governance-optimization.json'], '不同 applicationId 的真实试点尚未接入；当前保持冻结，不执行跨系统用例。', 'CROSS_SYSTEM_PILOT_REQUIRED'),
];

const behaviorDefinitions: Array<{
  ruleId: string;
  operations: Array<{ operation: string; status: ScenarioStatus; priority: 'P0' | 'P1' | 'P2'; evidence: string[]; note: string; gapCode?: string }>;
}> = [
  {
    ruleId: 'BR-ITEM-CATEGORY-OPTIONAL',
    operations: [
      op('create', 'covered', 'P0', ['UI 提交成功提示', '商品列表唯一记录'], 'TC-ITEM-STD-037 覆盖不选分类创建。'),
      op('read/query', 'covered', 'P1', ['列表按唯一名称查询'], '同一用例验证名称和标准价回显。'),
      op('update', 'covered', 'P1', ['保存成功提示', '列表按分类过滤', '编辑详情分类回显'], '编辑未修改分类时保留原分类，主动清空时允许保存为空；列表过滤和详情回显用于验证最终持久化。'),
      op('delete/cleanup', 'covered', 'P1', ['API/UI 零残留收据'], '规则用例声明 cleanupSeed 清理。'),
    ],
  },
  {
    ruleId: 'BR-ITEM-CATEGORY-LEAF-SELECTION',
    operations: [
      op('select/read-field', 'covered', 'P1', ['分类级联字段显示 A1', '一级分类不作为最终值'], 'TC-ITEM-STD-007 覆盖选择和字段终态。'),
      op('create', 'covered', 'P1', ['创建成功提示', '列表按叶子分类过滤'], '商品分类非必填；选择有子分类的一级分类时必须提交到叶子分类，创建结果通过列表分类过滤核对。'),
      op('update', 'covered', 'P1', ['列表按叶子分类过滤', '编辑详情回显叶子分类', '非叶子一级分类不可保存'], '编辑可重新选择合法一级/二级路径，但不能把有子分类的一级分类作为最终分类。'),
      op('delete/cleanup', 'not-applicable', 'P2', [], '该用例无写入商品，清理不适用。'),
    ],
  },
  {
    ruleId: 'BR-ITEM-CATEGORY-DIRECT-PARENT-CREATE',
    operations: [
      op('create', 'covered', 'P1', ['UI 成功提示', 'API 创建身份'], 'TC-ITEM-STD-006 已明确批准并取得当前执行闭环。'),
      op('read/query', 'covered', 'P1', ['列表第一行', '商品名称/类型/规格/价格/状态', '详情页分类'], '创建成功后必须在列表第一行可查询，核对核心字段和详情分类。'),
      op('update', 'covered', 'P1', ['编辑页分类回显', '列表按分类过滤', '商品状态保持不变'], '编辑允许修改或清空分类；保存后分类持久化且商品状态保持原状态。'),
      op('delete/cleanup', 'covered', 'P1', ['API/UI 零残留收据'], '规则 cleanup 要求双端零残留。'),
    ],
  },
  {
    ruleId: 'BR-ITEM-COMBO-GROUP-REQUIRED',
    operations: [
      op('create/negative', 'covered', 'P0', ['保存后 BITEM-6003', '保存并新建后 BITEM-6003'], 'TC-ITEM-PKG-046 覆盖两个提交入口和零记录。'),
      op('read/query', 'covered', 'P1', ['API 查询记录数为 0'], '失败创建的服务端终态已纳入断言。'),
      op('update', 'covered', 'P0', ['API BITEM-6003', 'UI BITEM-6003', '编辑页无保存并新建', '失败后原商品数据保持不变'], '编辑删除全部套餐分组后保存失败；编辑页不提供保存并新建，返回后原商品数据保持不变。'),
      op('delete/cleanup', 'not-applicable', 'P2', [], '负向创建未产生套餐记录，清理不适用。'),
    ],
  },
  {
    ruleId: 'BR-ITEM-COMBO-OPTIONAL-EDIT-BOUNDARY',
    operations: [
      op('read/detail', 'covered', 'P1', ['组规则摘要', '组级编辑/删除入口', '商品行字段', '无单项移除入口'], 'TC-ITEM-PKG-059 覆盖编辑页可观察边界。'),
      op('update/group-edit', 'partially-covered', 'P1', ['组配置保存成功', '重新打开商品配置一致'], '组级编辑保存持久化已确认；是否同步其他页面或下游尚无来源/运行证据，待核实。', 'RULE_BEHAVIOR_SYNC_NOT_VERIFIED'),
      op('delete/group-delete', 'partially-covered', 'P1', ['删除确认框', '取消保持原数据', '确认后页面和列表变化', '接口清理验证'], '删除交互、页面终态和接口清理已确认；是否同步其他页面或下游尚无来源/运行证据，待核实。', 'RULE_BEHAVIOR_SYNC_NOT_VERIFIED'),
      op('delete/item-row', 'covered', 'P1', ['商品行按钮和删除图标数量为 0'], '规则明确禁止商品行单项移除。'),
    ],
  },
  {
    ruleId: 'BR-ITEM-010',
    operations: [
      op('create', 'covered', 'P0', ['同类型同名失败', '跨类型同名成功'], '9 条关联用例覆盖三种商品类型和分类无关性。'),
      op('read/query', 'covered', 'P0', ['失败记录数不增加', '跨类型两条记录可查询'], '规则 assertion contract 同时要求 UI 和 API。'),
      op('update', 'covered', 'P1', ['UI BITEM-7014', 'API BITEM-7014', '列表新名称/原名称持久化'], '编辑同类型重复名称失败并提示 BITEM-7014；同类型无重复时允许改名，失败后原名称保持不变，分类不影响判重。'),
      op('delete/cleanup', 'covered', 'P1', ['API/UI 零残留收据'], '规则 cleanup 要求双端零残留。'),
    ],
  },
];

export function buildProductCenterBusinessRuleScenarioCoverage() {
  const lifecycle = loadCurrentProductCenterBusinessRuleLifecycleSnapshot();
  const observation = fs.existsSync(observationLedgerPath)
    ? readJson<any>(observationLedgerPath)
    : null;
  const formalRuleIds = new Set(lifecycle.rules.map((rule) => rule.ruleId));
  const behaviorScenarios = behaviorDefinitions.flatMap((definition) => {
    const rule = lifecycle.rules.find((item) => item.ruleId === definition.ruleId);
    if (!rule) return [];
    return definition.operations.map((item, index) => {
      // A downstream propagation scenario is covered when its structured
      // contract is present and valid on the current formal rule.  This keeps
      // the confirmation queue focused on genuine semantic gaps instead of
      // re-asking for a decision that has already been recorded in the rule.
      const contractAction = item.operation === 'update/group-edit'
        ? 'group-edit-confirm'
        : item.operation === 'delete/group-delete'
          ? 'group-delete-confirm'
          : null;
      const downstreamContract = contractAction
        ? (rule.semantics.downstreamSyncContracts ?? []).find((contract) => contract.changeAction === contractAction)
        : undefined;
      const downstreamContractCovered = Boolean(
        downstreamContract && validateBusinessRuleDownstreamContract(downstreamContract).length === 0,
      );
      const status = downstreamContractCovered ? 'covered' : item.status;
      const gapCode = downstreamContractCovered ? undefined : item.gapCode;
      const note = downstreamContractCovered
        ? `${item.note.replace(/；是否同步其他页面或下游尚无来源\/运行证据，待核实。$/, '')} 已由结构化下游同步契约校验通过。`
        : item.note;
      return {
      scenarioId: `BR-SCENARIO-BEHAVIOR-${definition.ruleId}-${String(index + 1).padStart(2, '0')}`,
      category: 'product-behavior' as const,
      operation: item.operation,
      status,
      priority: item.priority,
      ruleIds: [definition.ruleId],
      caseIds: [...rule.linkedCaseIds],
      sourceRefs: [`lifecycle:${definition.ruleId}`, ...rule.sourceRegistry.map((source) => source.sourceId)],
      expectedEvidence: item.evidence,
      ...(gapCode ? { gapCode } : {}),
      note,
      } satisfies ProductCenterBusinessRuleScenario;
    });
  });
  const explicitlyDefinedRuleIds = new Set(behaviorDefinitions.map((definition) => definition.ruleId));
  const traceabilityScenarios = lifecycle.rules
    .filter((rule) => !explicitlyDefinedRuleIds.has(rule.ruleId))
    .map((rule) => {
      const hasStructuralBehaviorContract = rule.linkedCaseIds.length > 0
        && rule.semantics.actions.length > 0
        && rule.semantics.outcomes.length > 0
        && rule.semantics.assertionSurfaces.length > 0;
      return {
        scenarioId: `BR-SCENARIO-BEHAVIOR-${rule.ruleId}-TRACE`,
        category: 'product-behavior' as const,
        operation: 'trace-linked-case-contract',
        status: hasStructuralBehaviorContract ? 'covered' as const : 'not-defined' as const,
        priority: 'P1' as const,
        ruleIds: [rule.ruleId],
        caseIds: [...rule.linkedCaseIds],
        sourceRefs: [`lifecycle:${rule.ruleId}`, ...rule.sourceRegistry.map((source) => source.sourceId)],
        expectedEvidence: rule.semantics.assertionSurfaces.map((surface) => (
          `${surface.channel}:${surface.authority}:${surface.terminalCondition}`
        )),
        ...(!hasStructuralBehaviorContract ? { gapCode: 'RULE_BEHAVIOR_CONTRACT_INCOMPLETE' } : {}),
        note: hasStructuralBehaviorContract
          ? '直接消费正式规则的结构化动作、预期、断言面和关联规范用例；covered 仅表示场景结构已登记，不代表当前执行已通过。'
          : '正式规则尚缺动作、预期、断言面或关联规范用例；不得从规则标题推断行为。',
      } satisfies ProductCenterBusinessRuleScenario;
    });
  const allBehaviorScenarios = [...behaviorScenarios, ...traceabilityScenarios];
  const scenarios = [...governanceScenarios, ...allBehaviorScenarios];
  const gaps = scenarios
    .filter((item) => item.status === 'not-defined' || item.status === 'partially-covered' || item.status === 'blocked')
    .map((item) => ({ scenarioId: item.scenarioId, gapCode: item.gapCode ?? 'SCENARIO_COVERAGE_REVIEW_REQUIRED', operation: item.operation, ruleIds: item.ruleIds, note: item.note }));
  const summary = {
    totalScenarios: scenarios.length,
    governanceScenarios: scenarios.filter((item) => item.category === 'rule-governance').length,
    productBehaviorScenarios: scenarios.filter((item) => item.category === 'product-behavior').length,
    covered: scenarios.filter((item) => item.status === 'covered').length,
    partiallyCovered: scenarios.filter((item) => item.status === 'partially-covered').length,
    notDefined: scenarios.filter((item) => item.status === 'not-defined').length,
    notApplicable: scenarios.filter((item) => item.status === 'not-applicable').length,
    blocked: scenarios.filter((item) => item.status === 'blocked').length,
    formalRules: lifecycle.rules.length,
    formalRulesWithBehaviorCoverage: [...formalRuleIds].filter((ruleId) => allBehaviorScenarios.some((item) => item.ruleIds.includes(ruleId))).length,
  };
  const report = {
    schemaVersion: '1.0.0',
    reportId: 'product-center-business-rule-scenario-coverage',
    scope: 'generated-evidence',
    status: gaps.length === 0 ? 'complete' : 'incomplete',
    purpose: '按当前正式规则和治理实现登记规则相关场景，覆盖规则生命周期 CRUD、审批、版本、生效、观察、审计及商品行为；未定义项仅登记缺口，不虚构规则。',
    source: {
      lifecyclePath: 'Merchant Center UITest/contracts/product-center/business-rules/generated/product-center-business-rule-lifecycle-snapshot.json',
      lifecycleFingerprint: lifecycle.fingerprint,
      sourceRefs: lifecycleSources,
      observationLedgerPath: 'Merchant Center UITest/output/governance/product-center-business-rule-observation-ledger.json',
      observationLedgerFingerprint: observation?.fingerprint ?? null,
    },
    summary,
    scenarios,
    gaps,
    executionEvidence: {
      status: observation?.status ?? 'unavailable',
      summary: observation?.summary ?? null,
      diagnostics: observation?.diagnostics ?? [],
      observations: (observation?.observations ?? []).map((item: any) => ({
        caseId: item.caseId,
        ruleId: item.ruleId,
        blockers: item.blockers ?? [],
        contextStatus: item.contextStatus,
        eligibleForCandidate: item.eligibleForCandidate === true,
      })),
    },
    executionImpact: {
      existingPassedCasesInvalidated: false,
      rerunCaseIds: [],
      moduleDeliveryBlocked: false,
      businessExecutionStarted: false,
    },
    guardrails: {
      sourceBounded: true,
      missingSemanticsMayNotBeInferred: true,
      notDefinedDoesNotMeanProductFailure: true,
      reportMayNotAuthorizeExecution: true,
    },
  };
  const withFingerprint = { ...report, fingerprint: sha256(stableStringify(report)), generatedAt: new Date().toISOString() };
  fs.mkdirSync(outputRoot, { recursive: true });
  fs.writeFileSync(outputJsonPath, `${JSON.stringify(withFingerprint, null, 2)}\n`, 'utf8');
  fs.writeFileSync(outputMarkdownPath, renderMarkdown(withFingerprint), 'utf8');
  return { ...withFingerprint, outputJsonPath, outputMarkdownPath };
}

function scenario(
  scenarioId: string,
  category: ScenarioCategory,
  operation: string,
  status: ScenarioStatus,
  priority: 'P0' | 'P1' | 'P2',
  ruleIds: string[],
  caseIds: string[],
  evidence: string[],
  note: string,
  gapCode?: string,
): ProductCenterBusinessRuleScenario {
  return { scenarioId, category, operation, status, priority, ruleIds, caseIds, sourceRefs: lifecycleSources, expectedEvidence: evidence, ...(gapCode ? { gapCode } : {}), note };
}

function op(operation: string, status: ScenarioStatus, priority: 'P0' | 'P1' | 'P2', evidence: string[], note: string, gapCode?: string) {
  return { operation, status, priority, evidence, note, ...(gapCode ? { gapCode } : {}) };
}

function renderMarkdown(report: ProductCenterBusinessRuleScenarioCoverageReport): string {
  return [
    '# 商品中心业务规则相关场景覆盖清单',
    '',
    `- 状态：${report.status}`,
    `- 场景总数：${report.summary.totalScenarios}；规则治理：${report.summary.governanceScenarios}；商品行为：${report.summary.productBehaviorScenarios}`,
    `- 已覆盖/部分覆盖/未定义/不适用/阻断：${report.summary.covered}/${report.summary.partiallyCovered}/${report.summary.notDefined}/${report.summary.notApplicable}/${report.summary.blocked}`,
    `- 正式规则行为覆盖：${report.summary.formalRulesWithBehaviorCoverage}/${report.summary.formalRules}`,
    `- 执行证据核对：${report.executionEvidence.status}；完整收据映射：${report.executionEvidence.summary?.completeReceiptsMapped ?? '未采集'}；证据诊断：${report.executionEvidence.diagnostics.length}`,
    '',
    '## 场景明细',
    '',
    '| 场景 ID | 类别 | 操作 | 状态 | 规则 | 用例 | 缺口 |',
    '|---|---|---|---|---|---|---|',
    ...report.scenarios.map((item) => `| ${item.scenarioId} | ${item.category} | ${item.operation} | ${item.status} | ${item.ruleIds.join('、') || '-'} | ${item.caseIds.join('、') || '-'} | ${item.gapCode ?? '-'} |`),
    '',
    '## 待处理偏差',
    '',
    ...report.gaps.map((item) => `- ${item.gapCode} · ${item.scenarioId} · ${item.ruleIds.join('、') || '-'} · ${item.note}`),
    '',
    '## 执行证据核对',
    '',
    ...report.executionEvidence.diagnostics.map((item) => `- ${item.ruleId}/${item.caseId}：${item.code}，${item.detail}`),
    ...report.executionEvidence.observations.map((item) => `- ${item.ruleId}/${item.caseId}：上下文=${item.contextStatus}；阻断=${item.blockers.join('、') || '无'}；候选资格=${item.eligibleForCandidate ? '是' : '否'}`),
    '',
    '说明：本清单只覆盖当前登记的正式规则、公共生命周期合同和已关联正式用例；未定义表示来源没有定义或实现没有提供该操作，不等同于产品失败。报告不修改规则、不更新用例状态、不触发业务执行。',
    '',
  ].join('\n');
}

function sha256(value: string): string { return createHash('sha256').update(value).digest('hex'); }
function readJson<T>(filePath: string): T { return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T; }

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

if (require.main === module) {
  try {
    const report = buildProductCenterBusinessRuleScenarioCoverage();
    process.stdout.write(`${JSON.stringify({ status: report.status, summary: report.summary, gaps: report.gaps.length, output: report.outputJsonPath })}\n`);
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
