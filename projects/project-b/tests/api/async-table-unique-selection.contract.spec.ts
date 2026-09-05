import { expect, test } from '@playwright/test';
import { selectUniqueAsyncTableTarget } from '../../utils/async-table-unique-selection';

test.describe('异步表格唯一选择助手合同', () => {
  test('应等待弹窗、加载结束、行与唯一目标稳定后再点击', async () => {
    let probeIndex = 0;
    let clicked = false;
    const states = [
      { dialogCount: 1, loadingCount: 1, rowCount: 0, targetCount: 0 },
      { dialogCount: 1, loadingCount: 0, rowCount: 2, targetCount: 1 },
    ];
    await selectUniqueAsyncTableTarget({
      dialog: probe(() => states[Math.min(probeIndex, 1)].dialogCount),
      loading: probe(() => states[Math.min(probeIndex, 1)].loadingCount),
      rows: probe(() => states[Math.min(probeIndex, 1)].rowCount),
      target: probe(() => states[Math.min(probeIndex++, 1)].targetCount, () => { clicked = true; }),
      requestCompleted: () => true,
      timeout: 100,
      interval: 1,
    });
    expect(clicked).toBe(true);
  });

  test('首次唯一性失败应输出脱敏结构化加载诊断', async () => {
    await expect(selectUniqueAsyncTableTarget({
      dialog: probe(() => 2),
      loading: probe(() => 1),
      rows: probe(() => 4),
      target: probe(() => 2),
      requestCompleted: () => false,
      timeout: 5,
      interval: 1,
    })).rejects.toThrow(
      /异步表格唯一选择失败.*"dialogCount":2.*"loadingVisible":true.*"rowCount":4.*"targetCount":2.*"requestCompleted":false/,
    );
  });

  test('请求已完成且无行时应立即短路，不等待完整选择超时', async () => {
    const startedAt = Date.now();
    await expect(selectUniqueAsyncTableTarget({
      dialog: probe(() => 1),
      loading: probe(() => 0),
      rows: probe(() => 0),
      target: probe(() => 0),
      requestCompleted: () => true,
      timeout: 500,
      interval: 1,
    })).rejects.toThrow(/请求已完成但无可选数据/);
    expect(Date.now() - startedAt).toBeLessThan(300);
  });
});

function probe(count: () => number, click = () => undefined) {
  return {
    count: async () => count(),
    isVisible: async () => true,
    isEnabled: async () => true,
    click: async () => { click(); },
  };
}
