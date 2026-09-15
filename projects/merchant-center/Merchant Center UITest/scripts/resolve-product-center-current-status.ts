import path from 'node:path';
import { resolveProductCenterCurrentStatus } from '../adapters/test-automation-platform/product-center-current-status';

function values(name: string): string[] {
  return process.argv.slice(2)
    .filter((argument) => argument.startsWith(`--${name}=`))
    .map((argument) => argument.slice(name.length + 3))
    .filter(Boolean);
}

function value(name: string): string | undefined {
  return values(name).at(-1);
}

const scope = value('scope');
if (!scope) throw new Error('PRODUCT_CENTER_CURRENT_STATUS_SCOPE_REQUIRED: 请传入 --scope=<execution-scope>');
const reportDirs = values('report-dir');
if (reportDirs.length === 0) throw new Error('PRODUCT_CENTER_CURRENT_STATUS_REPORT_REQUIRED: 请传入至少一个 --report-dir=<path>');
const projectRoot = path.resolve(__dirname, '..');
const artifact = resolveProductCenterCurrentStatus({
  projectRoot,
  scope,
  reportDirs,
  executionIndexPath: value('execution-index'),
  systemTestOutputRoot: value('system-test-output'),
  outputPath: value('output'),
  registryPath: value('registry'),
});

process.stdout.write(`${JSON.stringify(artifact, null, 2)}\n`);
