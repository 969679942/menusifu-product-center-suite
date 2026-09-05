import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { createProductCenterAuthBatchSession } from '../utils/product-center-auth-batch-session';

const projectRoot = path.resolve(__dirname, '..');
const bindingsPath = path.join(projectRoot, 'contracts/product-center/group/product-center-group-bindings.json');
const document = JSON.parse(fs.readFileSync(bindingsPath, 'utf8')) as {
  cases: Array<{ caseId: string; generationAllowed: boolean }>;
};
const requestedIds = new Set((process.env.PC_GROUP_CASE_IDS ?? '')
  .split(',')
  .map((value) => value.trim())
  .filter(Boolean));
const executableIds = document.cases
  .filter((binding) => binding.caseId.startsWith('TC-GRP-PKG-') && binding.generationAllowed)
  .map((binding) => binding.caseId)
  .filter((caseId) => requestedIds.size === 0 || requestedIds.has(caseId));

if (executableIds.length === 0) throw new Error('套餐组 V2 没有可执行且已精确绑定的自动化用例');

const plan = {
  scope: 'combo-v2-human-review',
  executableCount: executableIds.length,
  executableCaseIds: executableIds,
  excludedRule: '废弃、自动化缺口、外部依赖和产品偏差用例不进入执行集合',
};
process.stdout.write(`${JSON.stringify(plan, null, 2)}\n`);

if (process.argv.includes('--plan-only')) process.exit(0);
if (process.env.PC_GROUP_COMBO_V2_LIVE !== '1') {
  throw new Error('实时套餐组自动化包含创建和清理操作；确认后设置 PC_GROUP_COMBO_V2_LIVE=1 再执行');
}

const playwrightCli = path.join(projectRoot, 'node_modules', 'playwright', 'cli.js');
if (!fs.existsSync(playwrightCli)) throw new Error(`缺少本地 Playwright CLI：${playwrightCli}`);
const authSession = createProductCenterAuthBatchSession('pc-group-combo-v2-');
try {
  const result = spawnSync(process.execPath, [
    playwrightCli,
    'test',
    'tests/generated/product-center-group.generated.spec.ts',
    '--project=chrome',
    '--workers=1',
    '--reporter=line',
  ], {
    cwd: projectRoot,
    env: {
      ...authSession.env({ requiredRoutes: ['/pp/brand/combo'] }),
      PC_GROUP_CASE_IDS: executableIds.join(','),
    },
    stdio: 'inherit',
  });
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
} finally {
  authSession.cleanup();
}
