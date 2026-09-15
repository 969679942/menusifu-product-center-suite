import fs from 'node:fs';
import path from 'node:path';
import type { FullConfig } from '@playwright/test';
import setup from '../setup/global.setup';
import teardown from '../setup/global.teardown';

async function main() {
  const mode = process.argv[2];
  process.argv = ['node', 'playwright', ...(mode === 'mixed' ? ['--project=api,chrome'] : mode === 'business' ? ['--project=chrome'] : ['--project=api'])];
  const config = { reporter: [['allure-playwright']] } as unknown as FullConfig;
  let setupRejected = false;
  let teardownRejected = false;
  try { await setup(config); } catch { setupRejected = true; }
  try { await teardown(config); } catch { teardownRejected = true; }
  fs.writeFileSync(path.resolve('hook-result.json'), JSON.stringify({
    setupRejected, teardownRejected,
    authExists: fs.existsSync(process.env.MC_STORAGE_STATE_PATH!),
    telemetryUnchanged: process.env.TEST_WAIT_TELEMETRY_PATH === 'synthetic-unchanged',
  }));
}

void main();
