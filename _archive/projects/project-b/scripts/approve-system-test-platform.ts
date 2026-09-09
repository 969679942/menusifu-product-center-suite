import fs from 'node:fs';
import path from 'node:path';
import {
  applySystemTestPlatformReviewDecision,
  type SystemTestPlatformRelease,
  type SystemTestPlatformReviewDecision,
  type SystemTestPlatformReviewQueue,
} from '../automation/system-test/system-test-platform-review';
import { resolveSystemTestPlatformArtifact } from '../utils/system-test-platform-paths';

const rootDir = path.resolve(__dirname, '..');
const workspaceRoot = path.resolve(rootDir, '..');
const queuePath = resolveSystemTestPlatformArtifact('platform-review-queue.json');

export function approveSystemTestPlatform(input: {
  queue: SystemTestPlatformReviewQueue;
  decision: SystemTestPlatformReviewDecision;
}): SystemTestPlatformRelease {
  return applySystemTestPlatformReviewDecision(input);
}

function argument(name: string): string | undefined {
  return process.argv.find((item) => item.startsWith(`--${name}=`))?.slice(name.length + 3);
}

if (require.main === module) {
  const decisionPath = argument('decision');
  if (!decisionPath) throw new Error('用法：--decision=<人工评审决定 JSON 路径>');
  const queue = JSON.parse(fs.readFileSync(queuePath, 'utf8')) as SystemTestPlatformReviewQueue;
  const decision = JSON.parse(fs.readFileSync(path.resolve(decisionPath), 'utf8')) as SystemTestPlatformReviewDecision;
  const release = approveSystemTestPlatform({ queue, decision });
  const outputPath = resolveSystemTestPlatformArtifact('platform-release.json');
  fs.writeFileSync(outputPath, `${JSON.stringify({ ...release, generatedAt: new Date().toISOString() }, null, 2)}\n`, 'utf8');
  process.stdout.write(`平台评审结果：${outputPath}\n`);
}
