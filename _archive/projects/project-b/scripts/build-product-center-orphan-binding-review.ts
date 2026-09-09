import fs from 'node:fs';
import path from 'node:path';

const projectRoot = path.resolve(__dirname, '..');
const inputPath = path.join(projectRoot, 'deliverables/system-test-platform/product-center-asset-remediation-queues.json');
const outputPath = path.join(projectRoot, 'deliverables/system-test-platform/product-center-orphan-binding-review.json');

export function buildProductCenterOrphanBindingReview(options: { write?: boolean } = {}) {
  const queues = JSON.parse(fs.readFileSync(inputPath, 'utf8')) as {
    generatedAt: string;
    queues: { orphanBinding: Array<{ caseId: string; reason: string; recoveryCondition: string }> };
  };
  const result = {
    schemaVersion: '1.0.0' as const,
    generatedAt: new Date().toISOString(),
    source: {
      path: path.relative(projectRoot, inputPath).replaceAll(path.sep, '/'),
      generatedAt: queues.generatedAt,
    },
    policy: {
      historicalBindingsDeleted: false,
      formalCasesChanged: false,
      runtimeResultsChanged: false,
    },
    summary: {
      total: queues.queues.orphanBinding.length,
      pendingOwnerDecision: queues.queues.orphanBinding.length,
      migrated: 0,
      retiredWithEvidence: 0,
    },
    items: queues.queues.orphanBinding.map((item) => ({
      caseId: item.caseId,
      status: 'pending-owner-decision' as const,
      reason: item.reason,
      recoveryCondition: item.recoveryCondition,
      requiredDecision: '迁移到权威正式方案，或提供带来源与责任人信息的废弃决策。',
    })),
  };
  if (options.write !== false) writeJson(outputPath, result);
  return { outputPath, result };
}

function writeJson(filePath: string, value: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.tmp`;
  fs.writeFileSync(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  fs.renameSync(temporaryPath, filePath);
}

if (require.main === module) {
  process.stdout.write(`${JSON.stringify(buildProductCenterOrphanBindingReview().result.summary, null, 2)}\n`);
}
