import fs from 'node:fs';
import path from 'node:path';
import {
  baselineDoesNotIncrease,
  createUiArchitectureBaseline,
  evaluateUiArchitectureBaseline,
  inspectUiArchitecture,
  type UiArchitectureBaseline,
  type UiArchitectureConfig,
} from '../src/governance/ui-architecture';

const args = process.argv.slice(2);
const projectRoot = path.resolve(readArg('--project-root') ?? process.cwd());
const configPath = path.resolve(projectRoot, readArg('--config') ?? 'config/ui-architecture.json');
const baselinePath = path.resolve(projectRoot, readArg('--baseline') ?? 'docs/ui-architecture-baseline.json');
const writeBaseline = args.includes('--write-baseline');
if (!fs.existsSync(configPath)) {
  fail([`ARCHITECTURE_CONFIG_NOT_FOUND:${configPath}`, '请显式传入 --project-root=<项目根目录>，或使用 --config=<配置文件>。']);
}
if (!fs.existsSync(baselinePath) && !writeBaseline) {
  fail([`ARCHITECTURE_BASELINE_NOT_FOUND:${baselinePath}`, '请先为目标项目生成基线，或使用 --write-baseline（不得抬高既有基线）。']);
}
const config = JSON.parse(fs.readFileSync(configPath, 'utf8')) as UiArchitectureConfig;
const report = inspectUiArchitecture({ projectRoot, config });

if (writeBaseline) {
  const next = createUiArchitectureBaseline(report);
  if (fs.existsSync(baselinePath)) {
    const previous = JSON.parse(fs.readFileSync(baselinePath, 'utf8')) as UiArchitectureBaseline;
    const violations = baselineDoesNotIncrease({ previous, next });
    if (violations.length > 0) fail(violations);
  }
  fs.mkdirSync(path.dirname(baselinePath), { recursive: true });
  fs.writeFileSync(baselinePath, `${JSON.stringify(next, null, 2)}\n`, 'utf8');
  process.stdout.write(`架构债务基线已写入：${baselinePath}\n`);
} else {
  const baseline = JSON.parse(fs.readFileSync(baselinePath, 'utf8')) as UiArchitectureBaseline;
  const violations = evaluateUiArchitectureBaseline({ report, baseline });
  if (violations.length > 0) fail(violations);
  process.stdout.write(`UI 架构门禁通过：${Object.values(report.metrics).reduce((sum, value) => sum + value, 0)} 项存量债务未增加。\n`);
}

function readArg(name: string): string | undefined {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

function fail(violations: readonly string[]): never {
  for (const violation of violations) process.stderr.write(`${violation}\n`);
  process.exit(1);
}
