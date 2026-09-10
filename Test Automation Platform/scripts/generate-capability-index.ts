import fs from 'node:fs';
import path from 'node:path';
import {
  buildCapabilityIndex,
  renderCapabilityIndexMarkdown,
  type CapabilityIndexConfig,
} from '../src/governance/capability-index';

const args = process.argv.slice(2);
const projectRoot = path.resolve(readArg('--project-root') ?? process.cwd());
const configPath = path.resolve(projectRoot, readArg('--config') ?? 'config/capability-index.json');
const outputPath = path.resolve(projectRoot, readArg('--output') ?? 'docs/项目能力索引.md');
const check = args.includes('--check');
const config = JSON.parse(fs.readFileSync(configPath, 'utf8')) as CapabilityIndexConfig;
const content = renderCapabilityIndexMarkdown(buildCapabilityIndex({ projectRoot, config }));

if (check) {
  const current = fs.existsSync(outputPath) ? fs.readFileSync(outputPath, 'utf8').replaceAll('\r\n', '\n') : '';
  if (current !== content.replaceAll('\r\n', '\n')) {
    process.stderr.write(`项目能力索引已过期：${outputPath}\n`);
    process.exitCode = 1;
  } else {
    process.stdout.write('项目能力索引校验通过。\n');
  }
} else {
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, content, 'utf8');
  process.stdout.write(`项目能力索引已更新：${outputPath}\n`);
}

function readArg(name: string): string | undefined {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}
