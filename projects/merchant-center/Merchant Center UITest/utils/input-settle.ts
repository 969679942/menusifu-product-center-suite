export const INPUT_SETTLE_MS = 200 as const;

export async function settleInput(): Promise<void> {
  await new Promise((resolve) => {
    setTimeout(resolve, INPUT_SETTLE_MS);
  });
}
