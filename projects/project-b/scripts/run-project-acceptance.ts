import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from '@playwright/test';
import type { AcceptanceProject } from '../acceptance/projects/acceptance-project';
import { productCenterAcceptanceProject } from '../acceptance/projects/product-center.acceptance';
import { storeProductAcceptanceProject } from '../acceptance/projects/store-product.acceptance';
import { appConfig } from '../test-data/env';
import { runAcceptanceOrchestrator } from '../utils/acceptance/acceptance-orchestrator';
import { createPlaywrightRouteProbe } from '../utils/acceptance/playwright-route-probe';
import { redactAcceptanceDiagnostic } from '../utils/acceptance/redaction';
import { scanRouteResidue } from '../utils/acceptance/route-residue-scanner';
import { RouteScanCheckpoint } from '../utils/acceptance/route-scan-checkpoint';
import { findIncompleteCheckpointFiles, scanGeneratedArtifacts } from '../utils/product-center-run-safety';

async function main(): Promise<void> {
  const projectRoot = path.resolve(__dirname, '..');
  const argumentsList = process.argv.slice(2);
  const projectId = readOption(argumentsList, '--project') ?? 'product-center';
  const scanOnly = argumentsList.includes('--scan-only');
  const fresh = argumentsList.includes('--fresh');
  const project = resolveProject(projectId);
  const outputDirectory = path.join(projectRoot, 'output/acceptance', project.manifest.projectId);
  const checkpointPath = path.join(outputDirectory, 'route-checkpoint.json');
  const resultPath = path.join(outputDirectory, 'latest.json');
  const routeResultPath = path.join(outputDirectory, 'route-scan.json');

  if (fresh && fs.existsSync(checkpointPath)) fs.rmSync(checkpointPath, { force: true });

  const report = await runAcceptanceOrchestrator({
    manifest: project.manifest,
    commands: scanOnly ? [] : fullCommands(project.manifest.projectId),
    outputPath: resultPath,
    runCommand: async (command) => {
      const result = spawnSync(command.command, [...command.args], {
        cwd: projectRoot,
        env: process.env,
        stdio: 'inherit',
        shell: false,
      });
      return {
        exitCode: result.status ?? 1,
        ...(result.error ? { diagnostic: result.error.message } : {}),
      };
    },
    scanRoutes: async () => {
      const browser = await chromium.launch({ headless: true });
      try {
        const context = await project.auth.createContext(browser);
        try {
          const checkpoint = new RouteScanCheckpoint(checkpointPath, project.manifest);
          const probe = createPlaywrightRouteProbe(context, {
            baseURL: project.manifest.baseURL,
            apiHosts: project.apiHosts,
          });
          const scan = await scanRouteResidue({ manifest: project.manifest, checkpoint, probe });
          fs.mkdirSync(outputDirectory, { recursive: true });
          fs.writeFileSync(routeResultPath, `${JSON.stringify(scan, null, 2)}\n`, 'utf8');
          return scan;
        } finally {
          await context.close();
        }
      } finally {
        await browser.close();
      }
    },
    inspectSafety: async () => ({
      incompleteCheckpoints: findIncompleteCheckpointFiles().length,
      sensitiveArtifacts: scanGeneratedArtifacts().length,
      savedAuthStates: fs.existsSync(appConfig.storageStatePath) ? 1 : 0,
    }),
  });

  process.stdout.write(`验收结果：${resultPath}\n状态：${report.status}\n`);
  if (report.status !== 'passed') process.exitCode = 1;
}

function resolveProject(id: string): AcceptanceProject {
  if (id === 'product-center') return productCenterAcceptanceProject;
  if (id === 'store-product') return storeProductAcceptanceProject;
  throw new Error(`未知验收项目：${id}`);
}

function fullCommands(id: string) {
  if (id !== 'product-center') throw new Error(`项目未配置全量验收命令：${id}`);
  const npmCli = process.env.npm_execpath;
  if (!npmCli) throw new Error('当前进程缺少 npm CLI 路径，无法执行全量验收。');
  return [
    { id: 'contract-tests', command: process.execPath, args: [npmCli, 'run', 'test:product-center:sop:all:contracts'] },
    { id: 'full-ui', command: process.execPath, args: [npmCli, 'run', 'test:product-center:sop:full'] },
  ];
}

function readOption(args: string[], name: string): string | undefined {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

if (require.main === module) {
  void main().catch((error: unknown) => {
    process.stderr.write(`${redactAcceptanceDiagnostic(String(error))}\n`);
    process.exitCode = 1;
  });
}
