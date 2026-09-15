import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import { test, expect } from '@playwright/test';
import { withSystemTestRunLease } from '../../../Test Automation Platform/src/governance/run-execution-lease';

test('项目清单经公共flow启动时，共享租约在编译及检查点覆盖前阻断', async () => {
  const project = path.resolve(__dirname, '../..');
  const manifest = JSON.parse(fs.readFileSync(path.join(project, 'systems/merchant-center-product-center-seasoning/manifest.json'), 'utf8'));
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'project-public-startup-'));
  try {
    const checkpoint = path.join(root, 'output/system-test-flow', manifest.system.systemId, 'checkpoint.json');
    fs.mkdirSync(path.dirname(checkpoint), { recursive: true }); fs.writeFileSync(checkpoint, 'preserved-project-checkpoint');
    fs.writeFileSync(path.join(root, 'manifest.json'), JSON.stringify(manifest));
    const script = path.join(root, 'flow.ts');
    fs.writeFileSync(script, `import { runSystemTestFlow } from ${JSON.stringify(path.resolve(project, '../Test Automation Platform/scripts/run-system-test-flow.ts'))};
runSystemTestFlow({ manifestPath: 'manifest.json', planPath: 'must-not-read-plan.json', flowId: 'project-flow' })
.then(() => { process.exitCode = 1; }).catch(error => { process.stdout.write(error.message); });`);
    await withSystemTestRunLease({ projectRoot: root, systemId: manifest.system.systemId, runId: 'project-run' }, async () => {
      const result = spawnSync(process.execPath, ['--import', pathToFileURL(require.resolve('tsx')).href, script], {
        env: { ...process.env, SYSTEM_TEST_PROJECT_ROOT: root }, windowsHide: true, encoding: 'utf8', timeout: 15_000,
      });
      expect(result.status).toBe(0);
      expect(result.stdout).toBe('SYSTEM_TEST_RUN_ALREADY_ACTIVE');
      expect(fs.readFileSync(checkpoint, 'utf8')).toBe('preserved-project-checkpoint');
      expect(fs.existsSync(path.join(root, 'output/system-test'))).toBe(false);
    });
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
