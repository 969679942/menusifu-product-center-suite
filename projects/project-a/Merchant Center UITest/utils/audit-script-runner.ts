import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';

export type CrudScript = { entity: string; file: string; artifactPrefix: string; env?: Record<string, string> };

async function latestArtifact(artifacts: string, prefix: string): Promise<string | null> {
  const entries = await fs.readdir(artifacts, { withFileTypes: true });
  const matches = await Promise.all(entries.filter(entry => entry.isDirectory() && entry.name.startsWith(prefix)).map(async entry => {
    const fullPath = path.join(artifacts, entry.name);
    return { fullPath, modifiedAt: (await fs.stat(fullPath)).mtimeMs };
  }));
  return matches.sort((left, right) => right.modifiedAt - left.modifiedAt)[0]?.fullPath ?? null;
}

export async function runCrudScript(script: CrudScript): Promise<any> {
  const runner = path.resolve(process.cwd(), '..', '..', 'TestOps', 'services', 'runner');
  const artifacts = path.resolve(process.cwd(), '..', '..', 'TestOps', 'artifacts');
  const before = await latestArtifact(artifacts, script.artifactPrefix);
  const child = spawn(process.execPath, ['--import', 'tsx', `src/${script.file}`], {
    cwd: runner,
    stdio: 'inherit',
    env: {
      ...process.env,
      MENUSIFU_AUDIT_EMAIL: process.env.MC_USERNAME ?? '',
      MENUSIFU_AUDIT_PASSWORD: process.env.MC_PASSWORD ?? '',
      ...script.env,
    },
  });
  const exitCode = await new Promise<number>(resolve => child.on('exit', code => resolve(code ?? 1)));
  const after = await latestArtifact(artifacts, script.artifactPrefix);
  if (!after || after === before) throw new Error(`${script.entity} 未生成新的 CRUD 产物`);
  const result = JSON.parse(await fs.readFile(path.join(after, 'result.json'), 'utf8'));
  if (exitCode !== 0 || result.error || result.residue !== 0) throw new Error(`${script.entity} CRUD 失败：${JSON.stringify({ exitCode, error: result.error, residue: result.residue, artifact: after })}`);
  return { ...result, artifact: after };
}
