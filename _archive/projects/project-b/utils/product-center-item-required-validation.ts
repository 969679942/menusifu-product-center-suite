export type ProductCenterItemRequiredValidationResult = {
  route: string;
  requiredErrorCount: number;
  successMessageCount: number;
  mutationCount: number;
  beforeTotalCount: number;
  afterTotalCount: number;
};

export function readProductTotalCount(body: unknown): number {
  if (!isRecord(body) || !isRecord(body.data) || typeof body.data.totalCount !== 'number') {
    throw new Error('商品列表 API 响应缺少数字字段 data.totalCount');
  }
  return body.data.totalCount;
}

export function assertItemRequiredValidationUi(result: ProductCenterItemRequiredValidationResult): void {
  if (result.route !== '/pp/brand/create/standard') {
    throw new Error(`保存失败后未停留在标准商品创建页：${result.route}`);
  }
  if (result.requiredErrorCount !== 1) {
    throw new Error(`商品名称必填提示必须唯一可见，实际数量：${result.requiredErrorCount}`);
  }
  if (result.successMessageCount !== 0) {
    throw new Error(`保存失败时不应出现成功提示，实际数量：${result.successMessageCount}`);
  }
}

export function assertItemNotCreated(result: ProductCenterItemRequiredValidationResult): void {
  if (result.mutationCount !== 0) {
    throw new Error(`必填校验失败时不应发送商品创建请求，实际数量：${result.mutationCount}`);
  }
  if (result.afterTotalCount !== result.beforeTotalCount) {
    throw new Error(
      `必填校验失败后商品 API 总数发生变化：${result.beforeTotalCount} -> ${result.afterTotalCount}`,
    );
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
