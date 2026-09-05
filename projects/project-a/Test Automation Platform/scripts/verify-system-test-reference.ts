import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { scaffoldSystemTest } from './scaffold-system-test';
import { runSystemTest } from './run-system-test';

async function main(): Promise<void> {
  const rootDir = path.resolve(process.env.SYSTEM_TEST_PROJECT_ROOT ?? process.cwd());
  const server = http.createServer((_request, response) => {
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    response.end('<!doctype html><html><body><main>Reference system</main></body></html>');
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('无法获取参考系统端口');
  const relativeRoot = 'output/system-test-reference-scaffold';
  try {
    const scaffold = scaffoldSystemTest({
      rootDir,
      relativeRoot,
      systemId: 'reference-system',
      baseURL: `http://127.0.0.1:${address.port}`,
      force: true,
    });
    const exitCode = await runSystemTest({
      manifestPath: path.relative(rootDir, scaffold.manifestPath),
      runId: `reference-${Date.now()}`,
      allowUnscopedSelection: true,
      executionIntent: 'full-regression',
      fullRegressionAuthorized: true,
    });
    if (exitCode !== 0) throw new Error(`参考系统运行失败：exit=${exitCode}`);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    fs.rmSync(path.join(rootDir, relativeRoot), { recursive: true, force: true });
  }
}

if (require.main === module) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
