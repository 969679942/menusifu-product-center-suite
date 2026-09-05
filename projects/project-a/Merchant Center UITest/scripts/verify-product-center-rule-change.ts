import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {
  buildProductCenterRuleChangeImpact,
  type ProductCenterRuleChangeProfileId,
  type ProductCenterRuleChangeUiIntent,
  type ProductCenterRuleConfirmation,
} from '../utils/product-center-rule-change-impact';

type NpmScriptCommand = {
  id: string;
  kind: 'npm-script';
  script: string;
};

type PlaywrightContractCommand = {
  id: string;
  kind: 'playwright-contract';
  tests: string[];
};

export type ProductCenterRuleChangeVerificationCommand =
  | NpmScriptCommand
  | PlaywrightContractCommand;

export type ProductCenterRuleChangeVerificationManifest = {
  schemaVersion: '1.0.0';
  collectionId: 'product-center-rule-change-verification';
  profiles: Array<{
    id: ProductCenterRuleChangeProfileId;
    commands: ProductCenterRuleChangeVerificationCommand[];
  }>;
};

export function readProductCenterRuleChangeVerificationManifest(
  projectRoot = process.cwd(),
): ProductCenterRuleChangeVerificationManifest {
  const manifestPath = path.join(
    projectRoot,
    'contracts/product-center/test-manifests/product-center-rule-change-verification.json',
  );
  const manifest = readJson<ProductCenterRuleChangeVerificationManifest>(manifestPath);
  validateManifest(manifest, projectRoot);
  return manifest;
}

export function runProductCenterRuleChangeVerification(options: {
  projectRoot?: string;
  outputRoot?: string;
  ruleId: string;
  changedFiles: string[];
  uiIntent?: ProductCenterRuleChangeUiIntent;
  sourceConflict?: boolean;
  planOnly?: boolean;
  execute?: (command: ProductCenterRuleChangeVerificationCommand, cwd: string) => number;
}): { reportPath: string; exitCode: number } {
  const projectRoot = path.resolve(options.projectRoot ?? path.resolve(__dirname, '..'));
  const outputRoot = path.resolve(options.outputRoot ?? projectRoot);
  const confirmationPath = path.join(
    projectRoot,
    'contracts/product-center/reviews/product-center-item-rule-confirmations.json',
  );
  const confirmationSource = readJson<{
    sourceRole: string;
    confirmations: ProductCenterRuleConfirmation[];
  }>(confirmationPath);
  if (confirmationSource.sourceRole !== 'product-confirmed-rule') {
    throw new Error('规则校正产品确认来源角色无效');
  }
  const impact = buildProductCenterRuleChangeImpact({
    ruleId: options.ruleId,
    confirmations: confirmationSource.confirmations,
    changedFiles: options.changedFiles,
    uiIntent: options.uiIntent,
    sourceConflict: options.sourceConflict,
  });
  const manifest = readProductCenterRuleChangeVerificationManifest(projectRoot);
  const profile = manifest.profiles.find((item) => item.id === impact.profileId);
  if (!profile) throw new Error(`规则校正验证 profile 不存在：${impact.profileId}`);
  if (!impact.executionAllowed && profile.commands.length > 0) {
    throw new Error('L4 规则校正不得包含自动执行命令');
  }

  const reportPath = path.join(
    outputRoot,
    'output/test-case-audit/product-center/rule-change-verification-latest.json',
  );
  const baseReport = {
    schemaVersion: '1.0.0',
    collectionId: 'product-center-rule-change-verification',
    generatedAt: new Date().toISOString(),
    status: !impact.executionAllowed
      ? 'authorization-required'
      : options.planOnly
        ? 'planned'
        : 'running',
    impact,
    commands: profile.commands,
    results: [] as Array<{ commandId: string; status: 'passed' | 'failed'; exitCode: number }>,
    safety: {
      uiExecutionAllowed: false,
      uiCommands: 0,
      sensitiveFieldsPersisted: 0,
    },
  };
  writeJsonAtomic(reportPath, baseReport);
  if (!impact.executionAllowed) return { reportPath, exitCode: 2 };
  if (options.planOnly) return { reportPath, exitCode: 0 };

  const execute = options.execute ?? executeStaticCommand;
  for (const command of profile.commands) {
    const exitCode = execute(command, projectRoot);
    baseReport.results.push({
      commandId: command.id,
      status: exitCode === 0 ? 'passed' : 'failed',
      exitCode,
    });
    if (exitCode !== 0) {
      writeJsonAtomic(reportPath, { ...baseReport, status: 'failed' });
      return { reportPath, exitCode };
    }
    writeJsonAtomic(reportPath, baseReport);
  }
  writeJsonAtomic(reportPath, { ...baseReport, status: 'passed' });
  return { reportPath, exitCode: 0 };
}

function validateManifest(
  manifest: ProductCenterRuleChangeVerificationManifest,
  projectRoot: string,
): void {
  if (manifest.schemaVersion !== '1.0.0'
    || manifest.collectionId !== 'product-center-rule-change-verification') {
    throw new Error('规则校正验证 manifest 元数据无效');
  }
  const expectedProfiles: ProductCenterRuleChangeProfileId[] = [
    'targeted',
    'associated',
    'shared-static',
    'authorization-required',
  ];
  if (JSON.stringify(manifest.profiles.map((item) => item.id)) !== JSON.stringify(expectedProfiles)) {
    throw new Error('规则校正验证 profile 分母或顺序无效');
  }
  const packageJson = readJson<{ scripts?: Record<string, string> }>(path.join(projectRoot, 'package.json'));
  for (const profile of manifest.profiles) {
    if (profile.id !== 'authorization-required' && profile.commands.length === 0) {
      throw new Error(`规则校正验证命令分母为零：${profile.id}`);
    }
    if (new Set(profile.commands.map((item) => item.id)).size !== profile.commands.length) {
      throw new Error(`规则校正验证命令重复：${profile.id}`);
    }
    for (const command of profile.commands) {
      if (!command.id.trim()) throw new Error(`规则校正验证命令 ID 为空：${profile.id}`);
      if (command.kind === 'npm-script') {
        if (!packageJson.scripts?.[command.script]) {
          throw new Error(`规则校正 npm script 不存在：${command.script}`);
        }
        if (!['typecheck', 'build:product-center:item-canonical', 'test:product-center:contract']
          .includes(command.script)) {
          throw new Error(`规则校正 npm script 未获静态白名单授权：${command.script}`);
        }
      } else {
        if (command.tests.length === 0 || new Set(command.tests).size !== command.tests.length) {
          throw new Error(`规则校正合同命令分母无效：${command.id}`);
        }
        for (const testPath of command.tests) {
          if (!/^tests\/api\/[a-z0-9-]+\.contract\.spec\.ts$/.test(testPath)
            || !fs.existsSync(path.join(projectRoot, testPath))) {
            throw new Error(`规则校正合同路径无效：${testPath}`);
          }
        }
      }
    }
  }
  const serialized = JSON.stringify(manifest).toLowerCase();
  if (/--project=chrome|gold|main-recipes|pipeline:product-center:(?:live|full)/.test(serialized)) {
    throw new Error('规则校正 manifest 包含未授权 UI 命令');
  }
}

function executeStaticCommand(
  command: ProductCenterRuleChangeVerificationCommand,
  cwd: string,
): number {
  if (command.kind === 'npm-script') {
    const npmCli = process.env.npm_execpath;
    if (!npmCli) throw new Error('缺少 npm CLI 路径，无法执行规则校正静态验证');
    const result = spawnSync(process.execPath, [npmCli, 'run', command.script], {
      cwd,
      env: process.env,
      stdio: 'inherit',
      shell: false,
    });
    return result.status ?? 1;
  }
  const cliPath = require.resolve('@playwright/test/cli');
  const result = spawnSync(process.execPath, [
    cliPath,
    'test',
    ...command.tests,
    '--project=api',
    '--reporter=line',
  ], {
    cwd,
    env: process.env,
    stdio: 'inherit',
    shell: false,
  });
  return result.status ?? 1;
}

function parseCliArguments(argumentsList: readonly string[]): {
  ruleId: string;
  changedFiles: string[];
  uiIntent?: ProductCenterRuleChangeUiIntent;
  sourceConflict: boolean;
  planOnly: boolean;
} {
  const ruleId = argumentsList.find((argument) => argument.startsWith('--rule-id='))
    ?.slice('--rule-id='.length).trim() ?? '';
  if (!ruleId) throw new Error('规则校正验证缺少 --rule-id');
  const changedFiles = argumentsList
    .filter((argument) => argument.startsWith('--changed-file='))
    .map((argument) => argument.slice('--changed-file='.length));
  const uiIntentValue = argumentsList.find((argument) => argument.startsWith('--ui-intent='))
    ?.slice('--ui-intent='.length);
  const allowedUiIntents: ProductCenterRuleChangeUiIntent[] = [
    'probe',
    'locator-change',
    'create',
    'update',
    'delete',
  ];
  if (uiIntentValue && !allowedUiIntents.includes(uiIntentValue as ProductCenterRuleChangeUiIntent)) {
    throw new Error(`规则校正 UI 意图无效：${uiIntentValue}`);
  }
  return {
    ruleId,
    changedFiles,
    uiIntent: uiIntentValue as ProductCenterRuleChangeUiIntent | undefined,
    sourceConflict: argumentsList.includes('--source-conflict'),
    planOnly: argumentsList.includes('--plan-only'),
  };
}

function readJson<T>(filePath: string): T {
  return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T;
}

function writeJsonAtomic(filePath: string, value: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.tmp`;
  fs.writeFileSync(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  fs.renameSync(temporaryPath, filePath);
}

if (require.main === module) {
  try {
    const result = runProductCenterRuleChangeVerification({
      ...parseCliArguments(process.argv.slice(2)),
    });
    process.stdout.write(`规则校正验证报告：${result.reportPath}\n`);
    process.exitCode = result.exitCode;
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}

