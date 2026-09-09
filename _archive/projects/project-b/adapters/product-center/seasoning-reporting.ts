import { test } from '@playwright/test';
import type {
  SystemTestReportStep,
  SystemTestStepReporter,
} from '../../../../Test Automation Platform/src/automation/system-test/system-test-recipe-executor';
import type {
  BusinessStepAttachment,
  BusinessStepReportEvidence,
} from '../../../../Test Automation Platform/src/reporters/allure-report-integrity';
import { renderBusinessStepDetails } from '../../../../Test Automation Platform/src/reporters/allure-report-integrity';
import { createStepBoundAttachmentName } from '../../../../Test Automation Platform/src/reporters/allure-report-integrity';
import { formatContinuousBusinessStepTitle } from '../../../../Test Automation Platform/src/reporters/allure-report-integrity';
import {
  finishExecutableOperation,
  startExecutableOperation,
} from '../../../../Test Automation Platform/src/utils/executable-operation-receipt';

const routeTitles: Record<string, string> = {
  '/pp/brand/seasoning/list': '品牌调味列表页',
  '/pp/brand/seasoning/template': '调味模板页',
  '/pp/brand/seasoning/addtemplate': '调味模板新增页',
  '/pp/brand/seasoning/record': '调味下发记录页',
  '/poi/location/seasoning': '门店调味列表页',
};

const operationPurposes: Record<string, string> = {
  'brand-menu:POST /ops-brand/global-modifier': '创建品牌调味',
  'brand-menu:POST /ops-brand/global-modifier/batch': '创建或准备品牌调味数据',
  'brand-menu:GET /ops-brand/global-modifier/list': '查询品牌调味列表并回读结果',
  'brand-menu:GET /ops-brand/global-modifier/{id}': '查询品牌调味详情并回读结果',
  'brand-menu:GET /ops-brand/global-modifier/platform-presets': '查询行业通用调味数据',
  'brand-menu:PUT /ops-brand/global-modifier/{id}': '保存品牌调味编辑结果',
  'brand-menu:DELETE /ops-brand/global-modifier/{id}': '删除品牌调味并确认无残留',
  'brand-menu:DELETE /ops-brand/global-modifier/options/{optionId}': '删除品牌调味项',
  'brand-menu:PUT /ops-brand/global-modifier/options/{optionId}': '保存品牌调味项编辑结果',
  'brand-menu:POST /ops-brand/global-modifier/options/batch-move': '批量移动调味项到目标调味组',
  'brand-menu:PUT /ops-brand/global-modifier/options/batch-status': '批量更新调味项启用状态',
  'brand-menu:PUT /ops-brand/global-modifier/sort': '保存调味组排序',
  'brand-menu:POST /ops-brand/modifier-template': '创建调味模板',
  'brand-menu:GET /ops-brand/modifier-template/page': '查询调味模板列表并回读结果',
  'brand-menu:PUT /ops-brand/modifier-template/{id}': '保存调味模板编辑结果',
  'brand-menu:DELETE /ops-brand/modifier-template/{id}': '删除调味模板并确认无残留',
  'brand-menu:POST /ops-brand/brand-modifier-sync/by-template': '按调味模板下发到目标门店',
  'brand-menu:POST /ops-brand/brand-modifier-sync/all': '一键下发品牌调味到门店',
  'brand-menu:POST /ops-brand/brand-modifier-sync/job/list': '查询调味下发记录',
  'brand-menu:PUT /ops-brand/brand-modifier-sync/task/resume/{taskId}': '恢复调味同步任务',
  'brand-menu:PUT /ops-brand/brand-modifier-sync/job/resume/{jobId}': '恢复调味同步作业',
  'brand-menu:POST /ops-brand/merchants/page': '查询可下发门店列表',
  'brand-menu:POST /item/v1/ops-brand/merchants/page': '查询调味模板可下发门店列表',
  'brand-menu:GET /pp/brand/seasoning/template': '检查调味模板页面入口',
  'brand-menu:GET /ops-poi/global-modifier/list': '查询门店调味并回读结果',
  'brand-menu:DELETE /ops-poi/global-modifier/{id}': '删除门店调味组并确认无残留',
  'brand-menu:DELETE /ops-poi/global-modifier/option/{optionId}': '删除门店调味项并确认无残留',
  'brand-menu:POST /ops-poi/global-modifier/batch-delete': '批量删除门店调味并确认无残留',
  'brand-menu:GET /ops-poi/poi-modifiers/push': '触发门店调味同步到 POS',
  'brand-menu:GET /internal/pos/pull/global-modifier': '回读 POS 调味同步结果',
  'ui:click seasoning-template-save': '点击保存调味模板并读取校验结果',
  'ui:click seasoning-create-confirm': '点击保存品牌调味并读取校验结果',
  'ui:click seasoning-delete-cancel': '取消删除调味组',
  'ui:click seasoning-edit-cancel': '取消编辑调味组',
  'ui:click seasoning-industry-select-duplicate': '重复选择行业通用调味',
  'ui:click seasoning-option-add-at-limit': '达到上限后继续添加调味项',
  'ui:seasoning-create': '通过页面创建品牌调味',
  'ui:seasoning-delete': '通过页面删除品牌调味',
  'ui:seasoning-edit': '通过页面编辑品牌调味',
  'ui:seasoning-record-query': '通过页面查询调味下发记录',
  'ui:seasoning-template': '通过页面操作调味模板',
  'ui:seasoning-template-create': '通过页面创建调味模板',
  'ui:store-seasoning-list': '通过页面读取门店调味列表',
};

export type SeasoningOperationPresentation = {
  purpose: string;
  triggerSource?: string;
  attachmentName: string;
};

export function buildSeasoningOperationChangeEvidence(value: unknown): {
  before: unknown;
  after: unknown;
} | undefined {
  const snapshots = findSeasoningOperationSnapshots(value);
  return snapshots;
}

function findSeasoningOperationSnapshots(
  value: unknown,
  seen: WeakSet<object> = new WeakSet<object>(),
): { before: unknown; after: unknown } | undefined {
  if (!value || typeof value !== 'object') return undefined;
  if (seen.has(value)) return undefined;
  seen.add(value);
  if (Array.isArray(value)) {
    for (const item of value) {
      const snapshots = findSeasoningOperationSnapshots(item, seen);
      if (snapshots) return snapshots;
    }
    return undefined;
  }
  const record = value as Record<string, unknown>;
  if (Object.prototype.hasOwnProperty.call(record, 'before')
    && Object.prototype.hasOwnProperty.call(record, 'after')) {
    return { before: record.before, after: record.after };
  }
  for (const nested of Object.values(record)) {
    const snapshots = findSeasoningOperationSnapshots(nested, seen);
    if (snapshots) return snapshots;
  }
  return undefined;
}

export function describeSeasoningOperation(
  operationKey: string,
  context: { caseId?: string; phase?: string } = {},
): SeasoningOperationPresentation {
  const purpose = operationPurposes[operationKey] ?? '执行调味业务操作（业务作用映射待补齐）';
  let triggerSource: string | undefined;
  if (context.caseId === 'TC-FLV-SEA-041' && operationKey === 'brand-menu:PUT /ops-brand/global-modifier/sort') {
    triggerSource = '点击排序弹窗“确定”';
  } else if (operationKey.startsWith('ui:click ')) {
    triggerSource = '页面点击';
  } else if (context.phase === 'seed') {
    triggerSource = '测试数据准备';
  } else if (context.phase === 'cleanup') {
    triggerSource = '测试数据清理';
  }
  return {
    purpose,
    triggerSource,
    attachmentName: operationKey.startsWith('ui:')
      ? '页面操作明细（点击查看）'
      : '接口执行明细（点击查看）',
  };
}

export function buildSeasoningOperationTechnicalDetails(input: {
  operationKey: string;
  observed: boolean;
  responseStatus?: unknown;
  durationMs?: unknown;
  details?: unknown;
  purpose: string;
  triggerSource?: string;
}): Record<string, unknown> {
  const parsed = input.operationKey.match(/^([^:]+):(GET|POST|PUT|PATCH|DELETE)\s+(.+)$/);
  const responseStatus = typeof input.responseStatus === 'number'
    ? `HTTP ${input.responseStatus}`
    : input.responseStatus && !String(input.responseStatus).includes('未提供')
      ? input.responseStatus
      : '未单独记录（以业务回读和断言结果为准）';
  const duration = typeof input.durationMs === 'number'
    ? `${input.durationMs}ms`
    : input.durationMs && !String(input.durationMs).includes('未提供')
      ? input.durationMs
      : '未单独记录';
  if (!parsed) {
    return {
      操作作用: input.purpose,
      触发来源: input.triggerSource ?? '页面业务操作',
      操作标识: input.operationKey,
      执行结果: input.observed ? '成功' : '失败',
      执行耗时: duration,
      补充明细: input.details ?? undefined,
    };
  }
  return {
    接口作用: input.purpose,
    触发来源: input.triggerSource ?? '业务步骤执行或结果回读',
    所属服务: parsed[1],
    请求方法: parsed[2],
    接口路径: parsed[3],
    响应状态: responseStatus,
    执行结果: input.observed ? '成功' : '失败',
    执行耗时: duration,
    补充明细: input.details ?? undefined,
  };
}

const capabilityTitles: Record<string, string> = {
  'merchant-center.seasoning.create-boundary': '业务操作：新增调味并覆盖价格边界与非法输入',
  'merchant-center.seasoning.create-minimal': '业务操作：新增调味组并仅填写必填字段保存',
  'merchant-center.seasoning.delete-empty-group': '业务操作：删除无调味项的调味组',
  'merchant-center.seasoning.edit-group': '业务操作：编辑已有调味组并保存变更',
  'merchant-center.seasoning.price-correction': '业务操作：输入非法或边界价格并验证页面纠正',
  'merchant-center.seasoning.record-reset': '业务操作：查询调味下发记录后重置筛选条件',
  'merchant-center.seasoning.record-task-search': '业务操作：按任务名称查询调味下发记录',
  'merchant-center.seasoning.rounding': '业务操作：输入价格并验证金额舍入规则',
  'merchant-center.seasoning.single-store-template-absence': '页面读取：核对单门店不展示调味模板入口',
  'merchant-center.seasoning.static-contract': '页面读取：读取当前调味页面的字段、列表和操作入口',
  'merchant-center.seasoning.store-batch-delete': '业务操作：勾选门店调味后执行批量删除并确认',
  'merchant-center.seasoning.store-delete-group': '业务操作：从门店调味组操作菜单删除调味组并确认',
  'merchant-center.seasoning.store-delete-option': '业务操作：从门店调味项操作菜单删除单个调味项',
  'merchant-center.seasoning.store-redeliver-restore': '业务操作：删除门店调味后再次下发并恢复',
  'merchant-center.seasoning.store-replace-distribution': '业务操作：再次下发模板并覆盖门店已有调味',
  'merchant-center.seasoning.template-create-audit': '业务操作：填写调味模板信息并保存',
  'merchant-center.seasoning.template-distribution-audit': '业务操作：从调味模板下发到目标门店',
  'merchant-center.seasoning.template-name-normalization': '业务操作：填写模板名称并验证名称规范化',
};

const uiMutationTitles: Record<string, string> = {
  'TC-FLV-SEA-010': '业务操作：选择行业通用调味并确认加入品牌调味列表',
  'TC-FLV-SEA-022': '业务操作：填写并提交第51个调味项，验证50项上限拦截',
  'TC-FLV-SEA-023': '业务操作：两次导入同组行业调味并保存合并结果',
  'TC-FLV-SEA-024': '业务操作：提交第二名称重复的品牌调味并读取校验反馈',
  'TC-FLV-SEA-025': '业务操作：提交跨语言重复的品牌调味并读取校验反馈',
  'TC-FLV-SEA-026': '业务操作：提交调味组名称重复的品牌调味并读取校验反馈',
  'TC-FLV-SEA-027': '业务操作：提交同组重复调味项并读取校验反馈',
  'TC-FLV-SEA-028': '业务操作：删除编辑页中的调味项并直接保存',
  'TC-FLV-SEA-033': '业务操作：编辑调味项名称并保存后回读详情',
  'TC-FLV-SEA-034': '业务操作：填写新增调味后取消并确认未保存',
  'TC-FLV-SEA-035': '业务操作：修改调味组后取消并确认未保存',
  'TC-FLV-SEA-036': '业务操作：打开调味组删除确认后取消操作',
  'TC-FLV-SEA-037': '业务操作：勾选调味项并批量变更所属调味组',
  'TC-FLV-SEA-040': '业务操作：拖动同组调味项排序并保存结果',
  'TC-FLV-SEA-041': '业务操作：打开排序弹窗，拖动调味组并点击“确定”保存',
  'TC-FLV-TPL-021': '业务操作：删除调味模板并完成二次确认',
  'TC-FLV-TPL-023': '业务操作：先后下发两个模板并核对门店覆盖结果',
  'TC-FLV-TPL-024': '业务操作：编辑模板后分别核对未下发和再次下发结果',
};

const assertionTitles: Record<string, string> = {
  'merchant-center.seasoning.assert-api-created': '断言：核对接口已创建目标调味及其业务身份',
  'merchant-center.seasoning.assert-api-deleted': '断言：核对接口已删除目标调味且无残留',
  'merchant-center.seasoning.assert-api-edited': '断言：核对接口已保存编辑后的调味信息',
  'merchant-center.seasoning.assert-api-identity': '断言：核对接口回读的调味业务身份和字段',
  'merchant-center.seasoning.assert-create-price-correction': '断言：核对新增价格已按业务规则纠正',
  'merchant-center.seasoning.assert-edit-price-reversion': '断言：核对编辑价格已恢复为预期值',
  'merchant-center.seasoning.assert-record-reset': '断言：核对重置后调味下发记录恢复全量结果',
  'merchant-center.seasoning.assert-record-task-search': '断言：核对调味下发记录查询结果',
  'merchant-center.seasoning.assert-round-down': '断言：核对价格按舍去规则计算',
  'merchant-center.seasoning.assert-round-half-up': '断言：核对价格按四舍五入规则计算',
  'merchant-center.seasoning.assert-single-store-template-absence': '断言：核对单门店页面不展示调味模板入口',
  'merchant-center.seasoning.assert-static-contract': '断言：核对页面字段、列表数据和操作入口',
  'merchant-center.seasoning.assert-store-mutation': '断言：核对门店调味操作后的最终数据状态',
  'merchant-center.seasoning.assert-template-create-fields': '断言：核对调味模板新增页面字段展示',
  'merchant-center.seasoning.assert-template-create-required': '断言：核对调味模板必填字段保存结果',
  'merchant-center.seasoning.assert-template-distribution-menu': '断言：核对调味模板下发操作入口和结果',
  'merchant-center.seasoning.assert-template-store-dialog': '断言：核对调味模板下发门店选择弹窗',
  'merchant-center.seasoning.assert-ui-created': '断言：核对页面显示新建调味业务身份',
  'merchant-center.seasoning.assert-ui-deleted': '断言：核对页面已删除目标调味且无残留',
  'merchant-center.seasoning.assert-ui-edited': '断言：核对页面显示编辑后的调味信息',
  'merchant-center.seasoning.assert-ui-mutation': '断言：核对业务操作的期望结果、实际结果和服务端回读',
};

const uiMutationAssertionTitles: Record<string, string> = {
  'TC-FLV-SEA-010': '断言：调味项已加入品牌调味列表且业务身份正确',
  'TC-FLV-SEA-022': '断言：第51项提交被明确拒绝且服务端仍保留原50项',
  'TC-FLV-SEA-023': '断言：相同调味项覆盖去重、不同调味项累加且保存成功',
  'TC-FLV-SEA-024': '断言：第二名称重复被拦截并给出反馈',
  'TC-FLV-SEA-025': '断言：跨语言名称重复被拦截并给出反馈',
  'TC-FLV-SEA-026': '断言：调味组名称重复被拦截并给出反馈',
  'TC-FLV-SEA-027': '断言：同组重复调味项被拦截并给出反馈',
  'TC-FLV-SEA-028': '断言：删除调味项后保存结果符合预期',
  'TC-FLV-SEA-033': '断言：编辑后的调味项名称已保存并回读一致',
  'TC-FLV-SEA-034': '断言：取消新增后数据未保存',
  'TC-FLV-SEA-035': '断言：取消编辑后原调味组信息保持不变',
  'TC-FLV-SEA-036': '断言：取消删除后原调味组仍保留',
  'TC-FLV-SEA-037': '断言：调味项已移动到目标调味组且源组已移除',
  'TC-FLV-SEA-040': '断言：调味项排序保存成功且列表回读顺序一致',
  'TC-FLV-SEA-041': '断言：调味组排序保存成功且列表回读顺序一致',
  'TC-FLV-TPL-021': '断言：调味模板删除结果符合预期',
  'TC-FLV-TPL-023': '断言：后下发模板覆盖先下发模板',
  'TC-FLV-TPL-024': '断言：未再次下发保持原结果，再次下发后与编辑模板一致',
};

export function createSeasoningSystemTestStepReporter(): SystemTestStepReporter {
  let pendingContextAttachments: BusinessStepAttachment[] = [];
  return async (step, action, evidence) => {
    const title = describeSeasoningSystemTestStep(step);
    const testInfo = test.info();
    const operation = startExecutableOperation({
      executionId: testInfo.testId,
      operationKey: operationKeyForReportStep(step),
      title,
      method: 'UI',
    });
    if (step.phase === 'context-guard' && step.input?.phase === 'before-assertion') {
      try {
        const result = await action();
        pendingContextAttachments.push(...readBusinessStepAttachments(await evidence?.('passed')));
        finishExecutableOperation(operation, 'passed');
        return result;
      } catch (error) {
        const failureTitle = formatContinuousBusinessStepTitle('precondition-check', `失败：断言前未确认${navigationPathForRoute(step.recipe.route)}`);
        try {
          await test.step(failureTitle, async (allureStep) => {
            await attachReportEvidence(allureStep, failureTitle, evidence, 'failed');
            throw error;
          });
        } catch {
          finishExecutableOperation(operation, 'failed');
          throw error;
        }
        finishExecutableOperation(operation, 'failed');
        throw error;
      }
    }
    if (step.phase === 'context-guard') {
      try {
        const result = await action();
        pendingContextAttachments.push(...readBusinessStepAttachments(await evidence?.('passed')));
        finishExecutableOperation(operation, 'passed');
        return result;
      } catch (error) {
        const failureTitle = formatContinuousBusinessStepTitle('precondition-check', `失败：操作前未确认${navigationPathForRoute(step.recipe.route)}`);
        try {
          await test.step(failureTitle, async (allureStep) => {
            await attachReportEvidence(allureStep, failureTitle, evidence, 'failed');
            throw error;
          });
        } catch {
          finishExecutableOperation(operation, 'failed');
          throw error;
        }
        finishExecutableOperation(operation, 'failed');
        throw error;
      }
    }
    try {
      const result = await test.step(title, async (allureStep) => {
        try {
          await attachBusinessStepAttachments(allureStep, title, pendingContextAttachments);
          pendingContextAttachments = [];
          const result = await action();
          await attachReportEvidence(allureStep, title, evidence, 'passed');
          return result;
        } catch (error) {
          await attachReportEvidence(allureStep, title, evidence, 'failed');
          throw error;
        }
      });
      finishExecutableOperation(operation, 'passed', buildSeasoningOperationChangeEvidence(result));
      return result;
    } catch (error) {
      finishExecutableOperation(operation, 'failed');
      throw error;
    }
  };
}

async function attachReportEvidence(
  step: { attach: (name: string, options: { body?: string | Buffer; path?: string; contentType?: string }) => Promise<void> },
  title: string,
  evidence?: (status: 'passed' | 'failed') => Promise<readonly BusinessStepAttachment[] | BusinessStepReportEvidence>
    | readonly BusinessStepAttachment[]
    | BusinessStepReportEvidence,
  status: 'passed' | 'failed' = 'passed',
): Promise<void> {
  if (!evidence) return;
  const reported = await evidence(status);
  const attachments = isBusinessStepReportEvidence(reported) ? (reported.attachments ?? []) : reported;
  const details = isBusinessStepReportEvidence(reported) ? (reported.details ?? []) : [];
  await renderBusinessStepDetails({
    details,
    runStep: (detailTitle, action) => test.step(detailTitle, action),
  });
  await attachBusinessStepAttachments(step, title, attachments);
}

function isBusinessStepReportEvidence(
  value: readonly BusinessStepAttachment[] | BusinessStepReportEvidence,
): value is BusinessStepReportEvidence {
  return !Array.isArray(value);
}

async function attachBusinessStepAttachments(
  step: { attach: (name: string, options: { body?: string | Buffer; path?: string; contentType?: string }) => Promise<void> },
  title: string,
  attachments: readonly BusinessStepAttachment[],
): Promise<void> {
  for (const attachment of attachments) {
    const options = attachment.path
      ? { path: attachment.path, contentType: attachment.contentType }
      : { body: attachment.body ?? '', contentType: attachment.contentType };
    await step.attach(createStepBoundAttachmentName(title, attachment.name), options);
  }
}

function operationKeyForReportStep(step: SystemTestReportStep): string {
  if (step.phase === 'capability' && step.recipe.mutation?.operationKey) {
    return step.recipe.mutation.operationKey;
  }
  if (step.phase === 'seed') {
    return step.adapterId?.includes('template')
      ? 'brand-menu:POST /ops-brand/modifier-template'
      : 'brand-menu:POST /ops-brand/global-modifier/batch';
  }
  return `ui:${step.phase}:${step.adapterId ?? step.recipe.route}`;
}

export function describeSeasoningSystemTestStep(step: SystemTestReportStep): string {
  switch (step.phase) {
    case 'initialize':
      return formatContinuousBusinessStepTitle('environment', `${navigationPathForRoute(step.recipe.route)}，确认页面加载完成`);
    case 'seed':
      return seedTitle(step.adapterId);
    case 'action-readiness':
      return formatContinuousBusinessStepTitle('precondition-check', '确认操作对象、业务身份和清理身份可用');
    case 'context-guard':
      return formatContinuousBusinessStepTitle('precondition-check', `确认${navigationPathForRoute(step.recipe.route)}和当前商户业务上下文`);
    case 'capability':
      if (step.adapterId === 'merchant-center.seasoning.ui-mutation') {
        return toBusinessStepTitle(uiMutationTitles[step.recipe.caseId] ?? `业务操作：执行“${step.recipe.title}”`);
      }
      return toBusinessStepTitle(capabilityTitles[step.adapterId ?? ''] ?? `业务操作：执行“${step.recipe.title}”`);
    case 'assertion':
      if (step.adapterId === 'merchant-center.seasoning.assert-ui-mutation') {
        return toAssertionStepTitle(uiMutationAssertionTitles[step.recipe.caseId] ?? assertionTitles[step.adapterId]);
      }
      return toAssertionStepTitle(assertionTitles[step.adapterId ?? ''] ?? `断言：核对“${step.recipe.title}”的预期结果`);
    case 'cleanup':
      return formatContinuousBusinessStepTitle('cleanup', '删除本用例产生的调味数据并确认无残留');
  }
}

function seedTitle(adapterId?: string): string {
  switch (adapterId) {
    case 'merchant-center.seasoning.seed-single-store-distribution':
      return formatContinuousBusinessStepTitle('data-preparation', '创建单门店调味模板下发数据并回读身份');
    case 'merchant-center.seasoning.seed-multi-store-distribution':
      return formatContinuousBusinessStepTitle('data-preparation', '创建多门店调味模板下发数据并回读身份');
    default:
      return formatContinuousBusinessStepTitle('data-preparation', '创建本用例业务数据并回读服务端身份');
  }
}

function toBusinessStepTitle(title: string): string {
  return formatContinuousBusinessStepTitle('business-operation', title.replace(/^业务操作：/, ''));
}

function toAssertionStepTitle(title: string): string {
  return formatContinuousBusinessStepTitle('assertion', title.replace(/^断言：/, ''));
}

function readBusinessStepAttachments(
  evidence: readonly BusinessStepAttachment[] | BusinessStepReportEvidence | undefined,
): BusinessStepAttachment[] {
  if (!evidence) return [];
  return isBusinessStepReportEvidence(evidence) ? [...(evidence.attachments ?? [])] : [...evidence];
}

export function navigationPathForRoute(route: string): string {
  const leaf = routeTitles[route] ?? '目标业务页面';
  return `登录 → 商品中心 → 商品管理 → 调味管理 → ${leaf}`;
}
