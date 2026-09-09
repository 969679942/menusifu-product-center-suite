import type {
  ItemComboGroupRequiredAttempt,
  ItemComboOptionalCardBoundary,
  ItemComboOptionalDialogEvidence,
} from '../pages/product-management/item/item-create-combo.page';

export type ProductCenterItemComboGroupRequiredResult = {
  identity: string;
  beforeRecordCount: number;
  afterRecordCount: number;
  attempts: [ItemComboGroupRequiredAttempt, ItemComboGroupRequiredAttempt];
};

export type ProductCenterItemComboOptionalBoundaryResult = {
  identity: string;
  customGroupName: string;
  dependencyProductIdentity: string;
  itemCreateResponseMethod: string;
  itemCreateResponsePath: string;
  itemCreateResponseStatus: number;
  responseMethod: string;
  responsePath: string;
  responseStatus: number;
  mutationCount: number;
  itemRecordCount: number;
  customGroupRecordCount: number;
  mutationIntentId?: string;
  dialog?: ItemComboOptionalDialogEvidence;
  boundary: ItemComboOptionalCardBoundary;
};

export function assertItemComboGroupRequiredUi(
  result: ProductCenterItemComboGroupRequiredResult,
): void {
  const expectedTriggers = ['save', 'save-and-new'];
  for (const [index, attempt] of result.attempts.entries()) {
    if (attempt.trigger !== expectedTriggers[index]) {
      throw new Error(`套餐分组必填探测提交顺序无效：${attempt.trigger}`);
    }
    if (attempt.route !== '/pp/brand/create/combo') {
      throw new Error(`套餐分组缺失提交后未停留在套餐创建页：${attempt.route}`);
    }
    if (attempt.errorMessageCount !== 1 || !attempt.errorMessage.includes('BITEM-6003')) {
      throw new Error(`套餐分组缺失未唯一展示 BITEM-6003：${attempt.errorMessage}`);
    }
    if (attempt.successMessageCount !== 0) {
      throw new Error(`套餐分组缺失提交不应展示成功提示：${attempt.successMessageCount}`);
    }
    if (attempt.responseErrorCode !== 'BITEM-6003') {
      throw new Error(`套餐分组缺失响应错误码无效：${attempt.responseErrorCode}`);
    }
  }
}

export function assertItemComboGroupRequiredApi(
  result: ProductCenterItemComboGroupRequiredResult,
): void {
  if (result.beforeRecordCount !== 0 || result.afterRecordCount !== 0) {
    throw new Error(
      `套餐分组必填负向探测产生商品记录：${result.beforeRecordCount} -> ${result.afterRecordCount}`,
    );
  }
  for (const attempt of result.attempts) {
    if (
      attempt.responseMethod !== 'POST'
      || !attempt.responsePath.endsWith('/ops-brand/brand-items/combo')
      || attempt.mutationCount !== 1
    ) {
      throw new Error(`套餐分组必填负向探测网络证据无效：${JSON.stringify(attempt)}`);
    }
  }
}

export function assertItemComboOptionalBoundaryUi(
  result: ProductCenterItemComboOptionalBoundaryResult,
): void {
  const dialogCounts = Object.entries(result.dialog ?? {});
  if (dialogCounts.length > 0 && dialogCounts.some(([key, count]) => key === 'categoryFilterCount' ? count < 1 : count !== 1)) {
    throw new Error(`可选搭配弹窗字段覆盖不完整：${JSON.stringify(result.dialog)}`);
  }
  const boundary = result.boundary;
  if (boundary.route !== '/pp/brand/edit/combo') {
    throw new Error(`可选搭配边界探测未在套餐编辑页执行：${boundary.route}`);
  }
  if (
    boundary.cardCount !== 1
    || boundary.customTypeCount !== 1
    || boundary.groupEditButtonCount !== 1
    || boundary.groupDeleteButtonCount !== 1
    || boundary.repeatRuleCount !== 1
    || boundary.selectionQuantityRuleCount < 1
    || boundary.productRowCount !== 1
  ) {
    throw new Error(`可选搭配组卡片结构无效：${JSON.stringify(boundary)}`);
  }
  if (boundary.productRowButtonCount !== 0 || boundary.productRowDeleteIconCount !== 0) {
    throw new Error(`可选搭配商品行出现单项操作入口：${JSON.stringify(boundary)}`);
  }
  for (const marker of [
    'Allow duplicate item selection within group',
    'Selection Quantity',
    'Item Name',
    'Specification',
    'Min Qty',
    'Max Qty',
    'Default',
  ]) {
    if (!boundary.cardText.includes(marker)) throw new Error(`可选搭配组卡片缺少字段：${marker}`);
  }
}

export function assertItemComboOptionalBoundaryApi(
  result: ProductCenterItemComboOptionalBoundaryResult,
): void {
  const groupOperationValid = result.responseMethod === 'N/A'
    ? result.responsePath === 'N/A' && result.mutationCount === 1
    : result.responseMethod === 'POST'
      && result.responsePath.endsWith('/ops-brand/brand-sections')
      && result.responseStatus >= 200
      && result.responseStatus < 300
      && result.mutationCount === 2;
  if (
    result.itemCreateResponseMethod !== 'POST'
    || !result.itemCreateResponsePath.endsWith('/ops-brand/brand-items/combo')
    || result.itemCreateResponseStatus < 200
    || result.itemCreateResponseStatus >= 300
    || !groupOperationValid
    || result.itemRecordCount !== 1
    || result.customGroupRecordCount !== 1
  ) {
    throw new Error(`可选搭配边界探测 API 前置与登记无效：${JSON.stringify(result)}`);
  }
}
