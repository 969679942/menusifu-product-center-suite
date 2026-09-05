import { createHash } from 'node:crypto';
import type { Page } from '@playwright/test';
import type { ProductCenterAuditCandidate } from './product-center-unified-audit-source';
import { waitUntil } from './wait';

export const PRODUCT_CENTER_REMAINING_SCENARIOS = [
  {
    id: 'S03',
    name: '重定向、登录页与最终路由识别',
    evidence: ['redirectChain', 'finalPath', 'loginPageSignal', 'routeGuard'],
  },
  {
    id: 'S06',
    name: '登录态、权限缓存、角色与租户切换识别',
    evidence: ['authState', 'permissionState', 'roleId', 'tenantScope'],
  },
  {
    id: 'S08',
    name: 'SPA 异步页面稳定态观测',
    evidence: ['stableSamples', 'loadingCount', 'domFingerprint'],
  },
  {
    id: 'S09',
    name: '隐藏控件、顺序弹窗与二级操作探索',
    evidence: ['visibleControls', 'dialogSequence', 'coverageUnknown'],
  },
  {
    id: 'S10',
    name: '虚拟列表、分页与懒加载覆盖',
    evidence: ['pagination', 'lazyLoad', 'rowWindow'],
  },
  {
    id: 'S15',
    name: '步骤、预期、观察通道逐项绑定',
    evidence: ['stepTrace', 'expectationTrace', 'observationChannel'],
  },
  {
    id: 'S16',
    name: '有来源约束的负向场景发现',
    evidence: ['negativeSourceRefs', 'negativeCoverageDecision'],
  },
  {
    id: 'S17',
    name: '数据工厂、清理适配器与零残留验证',
    evidence: ['dataProfile', 'cleanupAdapter', 'apiZero', 'uiZero'],
  },
  {
    id: 'S21',
    name: '大型 XMind 分模块、分页与摘要产物',
    evidence: ['segmentManifest', 'moduleSummary', 'sourceFingerprint'],
  },
  {
    id: 'S30',
    name: '完整失败分类与责任路由',
    evidence: ['taxonomy', 'classificationEvidence', 'productFailureGuard'],
  },
] as const;

export type ProductCenterRemainingScenarioId = typeof PRODUCT_CENTER_REMAINING_SCENARIOS[number]['id'];
export type ProductCenterRemainingScenarioStatus = 'resolved' | 'partial' | 'blocked';
export type ProductCenterRemainingFailureCategory =
  | 'product-behavior'
  | 'automation-gap'
  | 'technical-binding-missing'
  | 'auth-blocked'
  | 'permission-blocked'
  | 'environment-blocked'
  | 'page-observation-incomplete'
  | 'test-data-missing'
  | 'cleanup-residue'
  | 'external-dependency'
  | 'execution-platform-transient'
  | 'evidence-gap'
  | 'unknown';

export type ProductCenterPageObservationEvidence = {
  schemaVersion: '1.0.0';
  observedAt: string;
  sourceRefs: string[];
  navigation: {
    targetPath: string;
    finalPath: string;
    redirectChain: string[];
    finalPathVerified: boolean;
    loginPageVisible: boolean;
    routeGuardVerified: boolean;
  };
  context: {
    authState: 'authenticated' | 'login' | 'expired' | 'unknown';
    permissionState: 'allowed' | 'denied' | 'unknown';
    environmentId: string | null;
    roleId: string | null;
    tenantScope: string | null;
    locale: string | null;
  };
  stability: {
    sampleCount: number;
    stableSampleCount: number;
    loadingCounts: number[];
    domFingerprints: string[];
    stable: boolean;
  };
  controls: {
    visibleControlCount: number;
    hiddenControlCount: number;
    visibleDialogCount: number;
    dialogNames: string[];
    dialogSequenceObserved: boolean;
    coverageUnknown: string[];
  };
  collection: {
    visibleRowCounts: number[];
    paginationControlCount: number;
    nextControlVisible: boolean;
    lazyLoadObserved: boolean;
    rowWindowObserved: boolean;
  };
};

export type ProductCenterStepTraceEntry = {
  traceId: string;
  caseId: string;
  stepKind: 'precondition' | 'action' | 'expectation';
  stepIndex: number;
  text: string;
  sourceRefs: string[];
  linkedStepTraceIds: string[];
  observationChannel: 'ui' | 'api' | 'downstream' | 'cleanup' | null;
  evidenceRefs: string[];
  status: 'bound' | 'unbound';
};

export type ProductCenterCaseStepTrace = {
  caseId: string;
  sourceRefs: string[];
  entries: ProductCenterStepTraceEntry[];
  issues: string[];
  complete: boolean;
};

export type ProductCenterTraceBinding = {
  observationChannel: 'ui' | 'api' | 'downstream' | 'cleanup';
  evidenceRefs: string[];
};

export type ProductCenterCleanupEvidence = {
  required: boolean;
  dataProfileId?: string;
  cleanupAdapterId?: string;
  apiZero?: boolean;
  uiZero?: boolean;
  evidenceRefs?: string[];
};

export type ProductCenterRemainingScenarioResult = {
  id: ProductCenterRemainingScenarioId;
  name: string;
  status: ProductCenterRemainingScenarioStatus;
  reason: string;
  evidenceRefs: string[];
  nextActions: string[];
  affectsExistingResults: 'unchanged' | 'revalidation-required';
};

export type ProductCenterRemainingScenarioReport = {
  schemaVersion: '1.0.0';
  collectionId: 'product-center-remaining-scenarios-execution';
  generatedAt: string;
  status: 'completed-with-findings' | 'blocked-by-evidence';
  scope: 'project-adapter + generated-evidence';
  executionAllowed: false;
  businessMutationAllowed: false;
  sourceFingerprint: string;
  summary: {
    total: number;
    resolved: number;
    partial: number;
    blocked: number;
    readyForBusinessExecution: false;
  };
  scenarios: ProductCenterRemainingScenarioResult[];
  traceSummary: {
    candidateCount: number;
    caseCount: number;
    stepCount: number;
    completeCaseCount: number;
    unboundStepCount: number;
    mismatchCaseCount: number;
    negativeCandidateCount: number;
  };
  xmindSummary: {
    candidateCount: number;
    segmentCount: number;
    maxSegmentSize: number;
    modules: Array<{ module: string; candidateCount: number; segmentCount: number }>;
  };
  guardrails: {
    canonicalCaseMutationAllowed: false;
    existingResultsRerun: false;
    existingResultsInvalidated: false;
    formalExecutionGrantRequired: true;
  };
};

export type ProductCenterFailureClassificationInput = {
  diagnostic?: string;
  statusCode?: number;
  assertionObserved?: boolean;
  pageObserved?: boolean;
  contextVerified?: boolean;
  permissionVerified?: boolean;
  dataVerified?: boolean;
  cleanupVerified?: boolean;
  productMismatchConfirmed?: boolean;
  externalDependency?: boolean;
};

export function collectProductCenterPageObservationEvidence(
  page: Page,
  input: {
    targetPath: string;
    sourceRefs?: readonly string[];
    context?: Partial<ProductCenterPageObservationEvidence['context']>;
    redirectChain?: readonly string[];
    routeGuardVerified?: boolean;
    sampleCount?: number;
  },
): Promise<ProductCenterPageObservationEvidence> {
  return collectPageEvidence(page, input);
}

export function buildProductCenterCaseStepTrace(
  candidate: ProductCenterAuditCandidate,
  bindings: Readonly<Record<string, ProductCenterTraceBinding>> = {},
): ProductCenterCaseStepTrace {
  const entries: ProductCenterStepTraceEntry[] = [];
  const issues: string[] = [];
  const addEntries = (
    values: readonly string[],
    stepKind: ProductCenterStepTraceEntry['stepKind'],
  ): void => {
    values.forEach((text, index) => {
      const traceId = `${candidate.candidateId}:${stepKind}:${index + 1}`;
      const binding = bindings[traceId];
      entries.push({
        traceId,
        caseId: candidate.formalCaseId ?? candidate.candidateId,
        stepKind,
        stepIndex: index + 1,
        text,
        sourceRefs: [...candidate.sourceRefs],
        linkedStepTraceIds: [],
        observationChannel: binding?.observationChannel ?? null,
        evidenceRefs: [...(binding?.evidenceRefs ?? [])],
        status: binding ? 'bound' : 'unbound',
      });
    });
  };
  addEntries(candidate.preconditions, 'precondition');
  addEntries(candidate.actions, 'action');
  addEntries(candidate.expectedResults, 'expectation');

  const actionEntries = entries.filter((entry) => entry.stepKind === 'action');
  const expectationEntries = entries.filter((entry) => entry.stepKind === 'expectation');
  if (actionEntries.length !== expectationEntries.length) issues.push('ACTION_EXPECTATION_COUNT_MISMATCH');
  actionEntries.forEach((action, index) => {
    const expectation = expectationEntries[index];
    if (expectation) {
      action.linkedStepTraceIds.push(expectation.traceId);
      expectation.linkedStepTraceIds.push(action.traceId);
    }
  });
  if (candidate.preconditions.length === 0) issues.push('PRECONDITION_MISSING');
  if (candidate.actions.length === 0) issues.push('ACTION_MISSING');
  if (candidate.expectedResults.length === 0) issues.push('EXPECTATION_MISSING');
  return {
    caseId: candidate.formalCaseId ?? candidate.candidateId,
    sourceRefs: [...candidate.sourceRefs],
    entries,
    issues,
    complete: issues.length === 0 && entries.every((entry) => entry.status === 'bound'),
  };
}

export function discoverProductCenterNegativeCandidates(
  candidates: readonly ProductCenterAuditCandidate[],
): ProductCenterAuditCandidate[] {
  const negativeSignal = /缺失|为空|空值|非法|无效|重复|超长|越界|不可提交|禁止|失败|异常|不存在|未找到|无权限|过期|冲突|错误/i;
  return candidates.filter((candidate) => negativeSignal.test([
    candidate.title ?? '',
    ...candidate.preconditions,
    ...candidate.actions,
    ...candidate.expectedResults,
  ].join('\n')) && candidate.sourceRefs.length > 0);
}

export function buildProductCenterXmindSegments(
  candidates: readonly ProductCenterAuditCandidate[],
  options: { maxSegmentSize?: number } = {},
) {
  const maxSegmentSize = options.maxSegmentSize ?? 250;
  if (!Number.isInteger(maxSegmentSize) || maxSegmentSize <= 0) throw new Error('XMind 分段大小必须是正整数');
  const xmindCandidates = candidates.filter((candidate) => candidate.sourceRefs.some((ref) => ref.startsWith('xmind:')));
  const grouped = new Map<string, ProductCenterAuditCandidate[]>();
  for (const candidate of xmindCandidates) {
    const module = normalizeXmindModule(candidate.module);
    grouped.set(module, [...(grouped.get(module) ?? []), candidate]);
  }
  const segments: Array<{ segmentId: string; module: string; index: number; candidateIds: string[]; sourceRefs: string[] }> = [];
  for (const [module, moduleCandidates] of [...grouped.entries()].sort(([left], [right]) => left.localeCompare(right))) {
    const sorted = [...moduleCandidates].sort((left, right) => left.candidateId.localeCompare(right.candidateId));
    for (let offset = 0; offset < sorted.length; offset += maxSegmentSize) {
      const batch = sorted.slice(offset, offset + maxSegmentSize);
      const index = Math.floor(offset / maxSegmentSize) + 1;
      segments.push({
        segmentId: `xmind:${hash(`${module}:${index}`).slice(0, 16)}`,
        module,
        index,
        candidateIds: batch.map((candidate) => candidate.candidateId),
        sourceRefs: [...new Set(batch.flatMap((candidate) => candidate.sourceRefs))].sort(),
      });
    }
  }
  return {
    candidateCount: xmindCandidates.length,
    segmentCount: segments.length,
    maxSegmentSize,
    segments,
    modules: [...grouped.entries()].map(([module, moduleCandidates]) => ({
      module,
      candidateCount: moduleCandidates.length,
      segmentCount: Math.ceil(moduleCandidates.length / maxSegmentSize),
    })).sort((left, right) => left.module.localeCompare(right.module)),
  };
}

function normalizeXmindModule(value: string | null): string {
  const parts = (value ?? '').split(' / ').map((part) => part.trim()).filter(Boolean);
  const typeIndex = parts.findIndex((part) => /^(标准商品|套餐商品|加料商品|页面补充)$/.test(part));
  if (typeIndex >= 0) {
    const type = parts[typeIndex];
    const family = parts[typeIndex + 1];
    return family && !/^\[P[012]\]/.test(family) ? `${type} / ${family}` : type;
  }
  return parts.find((part) => !/商品中心|重建试点|P[012] .+/.test(part)) ?? '未分模块';
}

export function classifyProductCenterRemainingFailure(
  input: ProductCenterFailureClassificationInput,
): { category: ProductCenterRemainingFailureCategory; retryable: boolean; productFailure: boolean; reason: string } {
  const diagnostic = (input.diagnostic ?? '').toLowerCase();
  if (input.externalDependency || /external dependency|下游能力|pos|terminal|c-side|c端/.test(diagnostic)) {
    return failure('external-dependency', false, false, '外部能力未满足，登记恢复条件，不判定商品失败');
  }
  if (input.statusCode === 401 || /unauthorized|login required|登录态|认证失效|token expired/.test(diagnostic)) {
    return failure('auth-blocked', false, false, '认证上下文未建立或已失效');
  }
  if (input.statusCode === 403 || /forbidden|permission denied|无权限|权限不足/.test(diagnostic)) {
    return failure('permission-blocked', false, false, '权限或角色能力不足');
  }
  if (input.statusCode === 429 || /429|too many requests|connection reset|econnreset|upstream timeout|平台瞬态/.test(diagnostic)) {
    return failure('execution-platform-transient', true, false, '执行平台瞬态失败，按有界策略恢复');
  }
  if (!input.pageObserved || /page observation|页面观测|route not reached|目标路由/.test(diagnostic)) {
    return failure('page-observation-incomplete', false, false, '页面观测不足，不能把定位或断言差异判为产品失败');
  }
  if (/technical binding|handler|locator|selector|technical-binding|绑定缺失/.test(diagnostic)) {
    return failure('technical-binding-missing', false, false, '技术绑定或定位实现缺失');
  }
  if (/seed|fixture|test data|前置数据|测试数据/.test(diagnostic) || input.dataVerified === false) {
    return failure('test-data-missing', false, false, '测试数据或前置数据未验证');
  }
  if (input.cleanupVerified === false || /cleanup|residue|残留|零残留/.test(diagnostic)) {
    return failure('cleanup-residue', false, false, '清理收据不完整或检测到残留');
  }
  if (input.assertionObserved && input.contextVerified && input.permissionVerified
    && input.dataVerified && input.productMismatchConfirmed) {
    return failure('product-behavior', false, true, '上下文、权限、数据和断言均完整，稳定终态证明预期不成立');
  }
  if (input.assertionObserved || /expected .* received|预期.*实际|断言/.test(diagnostic)) {
    return failure('evidence-gap', false, false, '存在断言差异但缺少完整闭环证据');
  }
  if (/automation|playwright|typeerror|referenceerror|脚本/.test(diagnostic)) {
    return failure('automation-gap', false, false, '自动化实现异常，先修复脚本和合同');
  }
  if (/timeout|超时|network|网络|dns|server unavailable|环境/.test(diagnostic)) {
    return failure('environment-blocked', false, false, '环境或网络不可用，保留检查点后恢复');
  }
  return failure('unknown', false, false, '证据不足以安全归因，进入诊断队列');
}

export function buildProductCenterRemainingScenarioReport(input: {
  candidates: readonly ProductCenterAuditCandidate[];
  generatedAt?: string;
  pageObservation?: ProductCenterPageObservationEvidence;
  traceBindings?: Readonly<Record<string, ProductCenterTraceBinding>>;
  cleanupEvidenceByCaseId?: Readonly<Record<string, ProductCenterCleanupEvidence>>;
  negativeCoverageDecision?: 'complete' | 'partial' | 'unknown';
  sourceFingerprint?: string;
  xmindMaxSegmentSize?: number;
}): {
  report: ProductCenterRemainingScenarioReport;
  traces: ProductCenterCaseStepTrace[];
  xmind: ReturnType<typeof buildProductCenterXmindSegments>;
} {
  const generatedAt = input.generatedAt ?? new Date().toISOString();
  const traces = input.candidates.map((candidate) => buildProductCenterCaseStepTrace(candidate, input.traceBindings));
  const negativeCandidates = discoverProductCenterNegativeCandidates(input.candidates);
  const xmind = buildProductCenterXmindSegments(input.candidates, { maxSegmentSize: input.xmindMaxSegmentSize });
  const page = input.pageObservation;
  const scenarioResults: ProductCenterRemainingScenarioResult[] = [
    result('S03', page?.navigation.redirectChain.length && page.navigation.finalPathVerified && page.navigation.routeGuardVerified ? 'resolved' : page ? 'partial' : 'blocked', page ? '已采集最终路径，但必须有重定向链和路由守卫证据才能关闭' : '缺少认证上下文中的页面观测', page ? page.sourceRefs : [], ['补充重定向链、登录页识别和最终路由守卫收据']),
    result('S06', page?.context.authState === 'authenticated' && page.context.permissionState === 'allowed' && Boolean(page.context.roleId) && Boolean(page.context.tenantScope) ? 'resolved' : page ? 'partial' : 'blocked', page ? '认证/权限/角色/租户字段尚未全部满足关闭条件' : '缺少认证、角色和租户上下文', page ? page.sourceRefs : [], ['在真实上下文中记录角色、租户、权限和登录态变化']),
    result('S08', page?.stability.stable ? 'resolved' : page ? 'partial' : 'blocked', page ? `稳定采样 ${page.stability.stableSampleCount}/${page.stability.sampleCount}，loading 计数已记录` : '缺少 SPA 页面稳定采样', page ? page.sourceRefs : [], ['至少取得 3 次相同 DOM 指纹且 loading 归零后再进入断言']),
    result('S09', page && page.controls.coverageUnknown.length === 0 && page.controls.dialogSequenceObserved ? 'resolved' : page ? 'partial' : 'blocked', page ? '已观测可见控件和弹窗，但仍需关闭未知覆盖区域' : '缺少页面控件和弹窗观测', page ? page.sourceRefs : [], ['补齐隐藏/二级操作覆盖清单；未知区域不得生成正式断言']),
    result('S10', page && page.collection.rowWindowObserved && (page.collection.paginationControlCount > 0 || page.collection.lazyLoadObserved) ? 'resolved' : page ? 'partial' : 'blocked', page ? '已记录行窗口、分页和懒加载信号，但未覆盖的页码仍需明确' : '缺少列表分页和懒加载观测', page ? page.sourceRefs : [], ['按页码/游标登记选择集，并对虚拟窗口前后状态分别留证']),
    result('S15', traces.length > 0 && traces.every((trace) => trace.complete) ? 'resolved' : traces.length > 0 ? 'partial' : 'blocked', traces.length > 0 ? `已生成 ${traces.length} 条逐步骤追踪；仍有 ${traces.filter((trace) => !trace.complete).length} 条未完成` : '缺少可追踪候选', traces.flatMap((trace) => trace.sourceRefs).slice(0, 20), ['为每个 action/expectation 绑定观察通道和收据引用']),
    result('S16', negativeCandidates.length > 0 && input.negativeCoverageDecision === 'complete' ? 'resolved' : negativeCandidates.length > 0 ? 'partial' : 'blocked', negativeCandidates.length > 0 ? `从来源识别 ${negativeCandidates.length} 条负向候选；不凭经验扩展业务规则` : '来源未提供可识别的负向语义', [...new Set(negativeCandidates.flatMap((candidate) => candidate.sourceRefs))].slice(0, 20), ['补充负向覆盖决策；没有来源的负向场景保持阻断']),
    result('S17', cleanupReady(input.candidates, input.cleanupEvidenceByCaseId) ? 'resolved' : input.candidates.length > 0 ? 'partial' : 'blocked', input.candidates.length > 0 ? '已识别候选的数据/清理要求，但零残留必须逐用例有 API/UI 收据' : '缺少候选用例', cleanupRefs(input.cleanupEvidenceByCaseId), ['为每个写数据用例绑定 dataProfile、cleanup adapter、API 零残留和 UI 零残留收据']),
    result('S21', xmind.candidateCount === 0 ? 'partial' : xmind.segmentCount > 0 && xmind.segments.every((segment) => segment.sourceRefs.length > 0) ? 'resolved' : 'partial', xmind.candidateCount === 0 ? '当前来源没有 XMind 候选' : `XMind 已分为 ${xmind.segmentCount} 段，最大段大小 ${xmind.maxSegmentSize}`, xmind.segments.flatMap((segment) => segment.sourceRefs).slice(0, 20), ['分段只输出候选索引，正式用例仍需逐条来源和语义审核']),
    result('S30', taxonomyComplete() ? 'resolved' : 'partial', '已建立分类优先级：外部/认证/权限/环境/平台瞬态先于产品归因，产品失败必须有完整闭环', [], ['所有失败收据写入分类、重试性、证据引用和责任路由']),
  ];
  const summary = {
    total: scenarioResults.length,
    resolved: scenarioResults.filter((scenario) => scenario.status === 'resolved').length,
    partial: scenarioResults.filter((scenario) => scenario.status === 'partial').length,
    blocked: scenarioResults.filter((scenario) => scenario.status === 'blocked').length,
    readyForBusinessExecution: false as const,
  };
  const report: ProductCenterRemainingScenarioReport = {
    schemaVersion: '1.0.0',
    collectionId: 'product-center-remaining-scenarios-execution',
    generatedAt,
    status: summary.blocked > 0 ? 'blocked-by-evidence' : 'completed-with-findings',
    scope: 'project-adapter + generated-evidence',
    executionAllowed: false,
    businessMutationAllowed: false,
    sourceFingerprint: input.sourceFingerprint ?? hash(input.candidates.map((candidate) => ({
      candidateId: candidate.candidateId,
      sourceRefs: candidate.sourceRefs,
      actions: candidate.actions,
      expectedResults: candidate.expectedResults,
    }))),
    summary,
    scenarios: scenarioResults,
    traceSummary: {
      candidateCount: input.candidates.length,
      caseCount: new Set(traces.map((trace) => trace.caseId)).size,
      stepCount: traces.reduce((total, trace) => total + trace.entries.length, 0),
      completeCaseCount: traces.filter((trace) => trace.complete).length,
      unboundStepCount: traces.reduce((total, trace) => total + trace.entries.filter((entry) => entry.status === 'unbound').length, 0),
      mismatchCaseCount: traces.filter((trace) => trace.issues.includes('ACTION_EXPECTATION_COUNT_MISMATCH')).length,
      negativeCandidateCount: negativeCandidates.length,
    },
    xmindSummary: {
      candidateCount: xmind.candidateCount,
      segmentCount: xmind.segmentCount,
      maxSegmentSize: xmind.maxSegmentSize,
      modules: xmind.modules,
    },
    guardrails: {
      canonicalCaseMutationAllowed: false,
      existingResultsRerun: false,
      existingResultsInvalidated: false,
      formalExecutionGrantRequired: true,
    },
  };
  return { report, traces, xmind };
}

async function collectPageEvidence(
  page: Page,
  input: Parameters<typeof collectProductCenterPageObservationEvidence>[1],
): Promise<ProductCenterPageObservationEvidence> {
  const observedAt = new Date().toISOString();
  const sampleCount = input.sampleCount ?? 3;
  if (!Number.isInteger(sampleCount) || sampleCount < 2) throw new Error('页面稳定观测至少需要 2 次采样');
  const body = page.locator('body');
  const domFingerprints: string[] = [];
  const loadingCounts: number[] = [];
  const visibleRowCounts: number[] = [];
  for (let sampleIndex = 0; sampleIndex < sampleCount; sampleIndex += 1) {
    const bodyText = await body.innerText({ timeout: 5_000 }).catch(() => '');
    domFingerprints.push(hash(bodyText.replace(/\s+/g, ' ').trim()));
    loadingCounts.push(await page.locator('[aria-busy="true"]:visible, .ant-spin-spinning:visible, [data-loading="true"]:visible').count());
    visibleRowCounts.push(await page.locator('tr:visible,[role="row"]:visible').count());
    if (sampleIndex < sampleCount - 1) {
      // Sample only after the page reaches a settled state; this avoids a
      // blind sleep while still giving SPA rendering a bounded opportunity
      // to finish between observations.
      await page.waitForLoadState('networkidle', { timeout: 1_000 }).catch(() => undefined);
    }
  }
  const bodyText = await body.innerText({ timeout: 5_000 }).catch(() => '');
  const loginPageVisible = /登录|sign in|log in|oauth/i.test(bodyText) || /login|signin|sign-in/i.test(new URL(page.url()).pathname);
  const permissionDenied = /forbidden|无权限|权限不足|access denied/i.test(bodyText);
  const visibleDialogCount = await page.locator('[role="dialog"]:visible,.ant-modal:visible,.ant-drawer:visible').count();
  const dialogNames = (await page.locator('[role="dialog"]:visible [role="heading"],.ant-modal:visible [class*="title"],.ant-drawer:visible [class*="title"]').allTextContents()).map((value) => value.trim()).filter(Boolean);
  const visibleControlCount = await page.locator('button:visible,[role="button"]:visible,a:visible,input:visible,select:visible,textarea:visible').count();
  const hiddenControlCount = await page.locator('button:not(:visible),[role="button"]:not(:visible),a:not(:visible),input:not(:visible),select:not(:visible),textarea:not(:visible)').count();
  const paginationControlCount = await page.locator('[aria-label*="next" i]:visible,[aria-label*="page" i]:visible,.ant-pagination:visible,[class*="pagination"]:visible').count();
  const nextControlVisible = await page.locator('[aria-label*="next" i]:visible,button:visible').allTextContents().then((values) => values.some((value) => /下一页|next/i.test(value)));
  const beforeScrollRows = visibleRowCounts.at(-1) ?? 0;
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight)).catch(() => undefined);
  await waitUntil(
    () => page.locator('tr:visible,[role="row"]:visible').count(),
    (count) => count >= beforeScrollRows,
    { timeout: 1_000, interval: 100, message: '滚动后列表未达到可观测稳定态。' },
  ).catch(() => undefined);
  const afterScrollRows = await page.locator('tr:visible,[role="row"]:visible').count();
  const stableSampleCount = domFingerprints.filter((fingerprint, index) => index === 0 || fingerprint === domFingerprints[0]).length;
  const context = input.context ?? {};
  const htmlLocale = await page.locator('html').getAttribute('lang').catch(() => null);
  return {
    schemaVersion: '1.0.0',
    observedAt,
    sourceRefs: [...(input.sourceRefs ?? [])],
    navigation: {
      targetPath: input.targetPath,
      finalPath: new URL(page.url()).pathname,
      redirectChain: [...(input.redirectChain ?? [])],
      finalPathVerified: new URL(page.url()).pathname === input.targetPath,
      loginPageVisible,
      routeGuardVerified: input.routeGuardVerified === true,
    },
    context: {
      authState: context.authState ?? (loginPageVisible ? 'login' : 'unknown'),
      permissionState: context.permissionState ?? (permissionDenied ? 'denied' : 'unknown'),
      environmentId: context.environmentId ?? null,
      roleId: context.roleId ?? null,
      tenantScope: context.tenantScope ?? null,
      locale: context.locale ?? htmlLocale ?? null,
    },
    stability: {
      sampleCount,
      stableSampleCount,
      loadingCounts,
      domFingerprints,
      stable: stableSampleCount === sampleCount && loadingCounts.every((count) => count === 0),
    },
    controls: {
      visibleControlCount,
      hiddenControlCount,
      visibleDialogCount,
      dialogNames,
      dialogSequenceObserved: visibleDialogCount > 0,
      coverageUnknown: ['nested overlays', 'keyboard-only controls'],
    },
    collection: {
      visibleRowCounts: [...visibleRowCounts, afterScrollRows],
      paginationControlCount,
      nextControlVisible,
      lazyLoadObserved: afterScrollRows > beforeScrollRows,
      rowWindowObserved: beforeScrollRows !== afterScrollRows || beforeScrollRows > 0,
    },
  };
}

function cleanupReady(
  candidates: readonly ProductCenterAuditCandidate[],
  cleanupEvidenceByCaseId: Readonly<Record<string, ProductCenterCleanupEvidence>> | undefined,
): boolean {
  const mutationCandidates = candidates.filter((candidate) => /创建|新增|编辑|修改|删除|保存|导入|启用|停用|create|edit|delete|save|import|enable|disable/i.test([...candidate.actions, candidate.title ?? ''].join(' ')));
  if (mutationCandidates.length === 0) return true;
  return mutationCandidates.every((candidate) => {
    const caseId = candidate.formalCaseId ?? candidate.candidateId;
    const evidence = cleanupEvidenceByCaseId?.[caseId];
    return Boolean(evidence?.dataProfileId && evidence.cleanupAdapterId && evidence.apiZero && evidence.uiZero);
  });
}

function cleanupRefs(cleanupEvidenceByCaseId: Readonly<Record<string, ProductCenterCleanupEvidence>> | undefined): string[] {
  return [...new Set(Object.values(cleanupEvidenceByCaseId ?? {}).flatMap((evidence) => evidence.evidenceRefs ?? []))].slice(0, 20);
}

function taxonomyComplete(): boolean {
  const samples: Array<[string, ProductCenterFailureClassificationInput, ProductCenterRemainingFailureCategory]> = [
    ['login required', {}, 'auth-blocked'],
    ['forbidden', {}, 'permission-blocked'],
    ['page observation incomplete', {}, 'page-observation-incomplete'],
    ['technical binding missing', { pageObserved: true }, 'technical-binding-missing'],
    ['cleanup residue', { pageObserved: true }, 'cleanup-residue'],
    ['external dependency', {}, 'external-dependency'],
    ['429 Too Many Requests', {}, 'execution-platform-transient'],
    ['expected enabled but received disabled', { pageObserved: true, assertionObserved: true, contextVerified: true, permissionVerified: true, dataVerified: true, cleanupVerified: true, productMismatchConfirmed: true }, 'product-behavior'],
  ];
  return PRODUCT_CENTER_REMAINING_SCENARIOS.length === 10
    && samples.every(([diagnostic, input, expected]) => classifyProductCenterRemainingFailure({ ...input, diagnostic }).category === expected);
}

function result(
  id: ProductCenterRemainingScenarioId,
  status: ProductCenterRemainingScenarioStatus,
  reason: string,
  evidenceRefs: readonly string[],
  nextActions: readonly string[],
): ProductCenterRemainingScenarioResult {
  return {
    id,
    name: PRODUCT_CENTER_REMAINING_SCENARIOS.find((scenario) => scenario.id === id)!.name,
    status,
    reason,
    evidenceRefs: [...new Set(evidenceRefs)],
    nextActions: [...nextActions],
    affectsExistingResults: 'unchanged',
  };
}

function failure(
  category: ProductCenterRemainingFailureCategory,
  retryable: boolean,
  productFailure: boolean,
  reason: string,
) {
  return { category, retryable, productFailure, reason };
}

function hash(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}
