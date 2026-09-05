import fs from 'node:fs';
import path from 'node:path';
import { resolveMerchantCenterPlaywrightConcurrency } from '../adapters/test-automation-platform/playwright-concurrency';

const general = resolveMerchantCenterPlaywrightConcurrency({
  maxWorkers: 3,
  requestedWorkers: Number(process.env.PW_WORKERS || 3),
});
const seasoning = resolveMerchantCenterPlaywrightConcurrency({
  maxWorkers: 2,
  requestedWorkers: Number(process.env.SYSTEM_TEST_WORKERS || 2),
  selectedCaseCount: 82,
});
const report = {
  schemaVersion: '1.0.0',
  generatedAt: new Date().toISOString(),
  machine: general.machine,
  decisions: { general, seasoning },
  guidance: {
    closeIdleBrowsersBeforeBusinessRun: general.machine.availableMemoryMb < 4_096,
    generalWorkers: general.effectiveWorkers,
    seasoningWorkers: seasoning.effectiveWorkers,
  },
};
const outputPath = path.resolve('output/runtime-concurrency/latest.json');
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, JSON.stringify(report, null, 2));
process.stdout.write(`商品中心运行时并发报告：${outputPath}
`);
process.stdout.write(`通用 worker=${general.effectiveWorkers}，调味系统 worker=${seasoning.effectiveWorkers}
`);
