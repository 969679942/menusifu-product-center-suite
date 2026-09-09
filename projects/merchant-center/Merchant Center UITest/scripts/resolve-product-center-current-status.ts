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

const scope = value('scope') ?? '';
const reportDirs = values('report-dir');
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
