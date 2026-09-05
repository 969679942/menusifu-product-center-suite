import type { Locator } from '@playwright/test';
import { waitUntil } from './wait';

type CountProbe = {
  count: () => Promise<number>;
  isVisible?: () => Promise<boolean>;
  isEnabled?: () => Promise<boolean>;
};

type ClickTarget = CountProbe & {
  click: () => Promise<void>;
};

export type AsyncTableSelectionDiagnostic = {
  dialogCount: number;
  loadingVisible: boolean;
  rowCount: number;
  targetCount: number;
  targetVisible: boolean;
  targetEnabled: boolean;
  requestCompleted: boolean;
};

export async function selectUniqueAsyncTableTarget(input: {
  dialog: CountProbe;
  loading: CountProbe;
  rows: CountProbe;
  target: ClickTarget;
  requestCompleted: () => boolean | Promise<boolean>;
  timeout?: number;
  interval?: number;
}): Promise<void> {
  const probe = () => readDiagnostic(input);
  try {
    await waitUntil(
      async () => {
        const state = await probe();
        if (state.requestCompleted && !state.loadingVisible && state.rowCount === 0) {
          throw new Error(`异步表格请求已完成但无可选数据：${JSON.stringify(state)}`);
        }
        return state;
      },
      (state) => state.dialogCount === 1
        && !state.loadingVisible
        && state.rowCount > 0
        && state.targetCount === 1
        && state.targetVisible
        && state.targetEnabled,
      {
        timeout: input.timeout ?? 10_000,
        interval: input.interval ?? 100,
        message: '异步表格尚未达到唯一可选终态',
      },
    );
  } catch {
    const diagnostic = await probe();
    // Once the table request has completed, an empty result cannot become a
    // valid unique selection without another user action. Fail immediately
    // instead of consuming the full locator timeout on every affected case.
    if (diagnostic.requestCompleted && !diagnostic.loadingVisible && diagnostic.rowCount === 0) {
      throw new Error(`异步表格请求已完成但无可选数据：${JSON.stringify(diagnostic)}`);
    }
    throw new Error(`异步表格唯一选择失败：${JSON.stringify(diagnostic)}`);
  }
  await input.target.click();
}

export async function clickStableAsyncSelectionConfirm(input: {
  confirmButton: Locator;
  dialog: Locator;
  selectedControl: Locator;
  label: string;
}): Promise<void> {
  await waitUntil(
    async () => ({
      dialogVisible: await input.dialog.isVisible().catch(() => false),
      selected: await input.selectedControl.isChecked().catch(() => false),
    }),
    (state) => state.dialogVisible && state.selected,
    { timeout: 10_000, interval: 100, message: `${input.label} 选择状态未收敛。` },
  );
  await clickStableLocator({ locator: input.confirmButton, label: `${input.label} 确认按钮` });
}

export async function clickStableLocator(input: { locator: Locator; label: string; timeout?: number }): Promise<void> {
  let previousBox = '';
  let stableSince = 0;
  await waitUntil(
    async () => {
      const count = await input.locator.count();
      const visible = count === 1 && await input.locator.isVisible().catch(() => false);
      const enabled = visible && await input.locator.isEnabled().catch(() => false);
      const box = visible ? await input.locator.boundingBox().catch(() => null) : null;
      const boxSignature = box
        ? [box.x, box.y, box.width, box.height].map((value) => value.toFixed(2)).join(':')
        : '';
      if (!enabled || !boxSignature) {
        previousBox = '';
        stableSince = 0;
      } else if (boxSignature !== previousBox) {
        previousBox = boxSignature;
        stableSince = Date.now();
      } else if (stableSince === 0) {
        stableSince = Date.now();
      }
      return { count, visible, enabled, stableForMs: stableSince === 0 ? 0 : Date.now() - stableSince };
    },
    (state) => state.count === 1 && state.visible && state.enabled && state.stableForMs >= 300,
    { timeout: input.timeout ?? 10_000, interval: 100, message: `${input.label} 未进入稳定可点击终态。` },
  );
  await input.locator.click({ timeout: input.timeout ?? 10_000 });
}

async function readDiagnostic(input: {
  dialog: CountProbe;
  loading: CountProbe;
  rows: CountProbe;
  target: ClickTarget;
  requestCompleted: () => boolean | Promise<boolean>;
}): Promise<AsyncTableSelectionDiagnostic> {
  const [dialogCount, loadingCount, rowCount, targetCount, requestCompleted] = await Promise.all([
    input.dialog.count(),
    input.loading.count(),
    input.rows.count(),
    input.target.count(),
    input.requestCompleted(),
  ]);
  const [targetVisible, targetEnabled] = targetCount === 1
    ? await Promise.all([
      input.target.isVisible?.() ?? Promise.resolve(false),
      input.target.isEnabled?.() ?? Promise.resolve(false),
    ])
    : [false, false];
  return {
    dialogCount,
    loadingVisible: loadingCount > 0,
    rowCount,
    targetCount,
    targetVisible,
    targetEnabled,
    requestCompleted,
  };
}
