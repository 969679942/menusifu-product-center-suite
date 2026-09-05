import fs from 'node:fs';
import path from 'node:path';
import {
  resolvePlaywrightExecutionTerminalCaseIds,
  type PlaywrightExecutionReportManifest,
} from '../../../../Test Automation Platform/src/governance/execution-terminal-receipts';

export function resolveProductCenterSourceTerminalCaseIds(input: {
  projectRoot: string;
  manifestPath: string;
  selectedCaseIds: readonly string[];
}): string[] {
  if (!fs.existsSync(input.manifestPath)) return [];
  const manifest = readJson<PlaywrightExecutionReportManifest>(input.manifestPath);
  return resolvePlaywrightExecutionTerminalCaseIds({
    selectedCaseIds: input.selectedCaseIds,
    manifest,
    readReport: (reportPath) => {
      const absolutePath = path.resolve(input.projectRoot, reportPath);
      const relativePath = path.relative(input.projectRoot, absolutePath);
      if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) return null;
      if (!fs.existsSync(absolutePath)) return null;
      try {
        return readJson<{ suites?: unknown[] }>(absolutePath);
      } catch {
        return null;
      }
    },
  });
}

function readJson<T>(filePath: string): T {
  return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T;
}
