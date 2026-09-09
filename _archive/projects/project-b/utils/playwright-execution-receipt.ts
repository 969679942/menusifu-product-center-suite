import {
  fingerprintReceiptEvidence,
  readPlaywrightExecutionReceipts as readPublicPlaywrightExecutionReceipts,
} from '../../../Test Automation Platform/src/utils/playwright-execution-receipt';

export { fingerprintReceiptEvidence };

export function readPlaywrightExecutionReceipts(
  input: Parameters<typeof readPublicPlaywrightExecutionReceipts>[0],
): ReturnType<typeof readPublicPlaywrightExecutionReceipts> {
  return readPublicPlaywrightExecutionReceipts({
    ...input,
    attachmentNames: [
      ...(input.attachmentNames ?? []),
      'product-center-group-runtime-evidence',
    ],
  });
}
