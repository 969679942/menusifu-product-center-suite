import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import {
  assertAllureAttachmentSourcesExist,
  normalizeMerchantCenterAllureResults,
} from '../adapters/test-automation-platform/allure-reporting';

const options = parseArgs(process.argv.slice(2));
const resultsDir = path.resolve(options.resultsDir);
const reportDir = path.resolve(options.reportDir);
if (resultsDir === path.resolve('allure-results')) {
  throw new Error('禁止从共享 allure-results 生成正式报告，请传入独立 runId 结果目录。');
}
if (!fs.existsSync(resultsDir)) throw new Error(`Allure 结果目录不存在：${resultsDir}`);
normalizeMerchantCenterAllureResults(resultsDir);
assertAllureAttachmentSourcesExist(resultsDir);
const resultFiles = fs.readdirSync(resultsDir).filter((name) => name.endsWith('-result.json'));
if (resultFiles.length === 0) throw new Error(`Allure 结果目录没有用例结果：${resultsDir}`);
const cli = process.platform === 'win32'
  ? require.resolve('allure-commandline/dist/bin/allure.bat', { paths: [process.cwd()] })
  : require.resolve('allure-commandline/dist/bin/allure', { paths: [process.cwd()] });
const generated = process.platform === 'win32'
  ? spawnSync(process.env.ComSpec ?? 'cmd.exe', ['/d', '/c', 'call', cli, 'generate', resultsDir, '--clean', '-o', reportDir], {
    cwd: process.cwd(), stdio: 'inherit', windowsHide: true,
  })
  : spawnSync(cli, ['generate', resultsDir, '--clean', '-o', reportDir], {
    cwd: process.cwd(), stdio: 'inherit', windowsHide: true,
  });
if ((generated.status ?? 1) !== 0) process.exit(generated.status ?? 1);
const manifestPath = path.join(reportDir, 'run-manifest.json');
fs.writeFileSync(manifestPath, JSON.stringify({
  schemaVersion: '1.0.0',
  generatedAt: new Date().toISOString(),
  resultsDir,
  reportDir,
  resultCount: resultFiles.length,
}, null, 2));
process.stdout.write(`隔离 Allure 报告：${reportDir}
`);

function parseArgs(args: readonly string[]): { resultsDir: string; reportDir: string } {
  const values = Object.fromEntries(args.map((arg) => arg.split('=', 2)));
  const resultsDir = values['--results'];
  const reportDir = values['--report'];
  if (!resultsDir || !reportDir) throw new Error('用法：--results=<独立结果目录> --report=<报告目录>');
  return { resultsDir, reportDir };
}
