import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {
  validateRequirementsChangeEvent,
  type RequirementsChangeEvent,
} from '../automation/system-test/requirements-change-event';

const projectRoot = path.resolve(__dirname, '..');
const workspaceRoot = path.resolve(projectRoot, '..');
const outputPath = path.join(projectRoot, 'output/governance/product-center-prd-change-event.json');

export function validateProductCenterPrdChangeEvent(raw: unknown, rootDir = workspaceRoot) {
  const event = normalizeEvent(raw);
  const sourcePath = path.resolve(rootDir, event.sourcePath);
  const sourceInsideWorkspace = isInside(rootDir, sourcePath);
  const sourceFingerprint = sourceInsideWorkspace && fs.existsSync(sourcePath) && fs.statSync(sourcePath).isFile()
    ? createHash('sha256').update(fs.readFileSync(sourcePath)).digest('hex')
    : null;
  const result = validateRequirementsChangeEvent({
    event,
    expectedApplicationId: 'merchant-center',
    expectedBusinessDomainId: 'product-center',
    sourceFingerprint,
  });
  const diagnostics = [...new Set([
    ...result.diagnostics,
    ...(!sourceInsideWorkspace ? ['PRD_EVENT_SOURCE_PATH_INVALID'] : []),
    ...(sourceInsideWorkspace && sourceFingerprint === null ? ['PRD_EVENT_SOURCE_FILE_MISSING'] : []),
  ])].sort();
  return {
    schemaVersion: '1.0.0' as const,
    status: diagnostics.length === 0 ? 'accepted' as const : 'rejected' as const,
    event,
    eventFingerprint: result.eventFingerprint,
    diagnostics,
    nextAction: diagnostics.length === 0
      ? 'RUN_SOURCE_GOVERNED_COMPILATION'
      : 'BLOCK_BEFORE_COMPILATION',
    businessExecutionAuthorized: false,
  };
}

function normalizeEvent(raw: unknown): RequirementsChangeEvent {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('PRD_EVENT_OBJECT_REQUIRED');
  const value = raw as Record<string, unknown>;
  return {
    schemaVersion: String(value.schemaVersion ?? '') as '1.0.0',
    eventId: String(value.eventId ?? ''),
    eventType: String(value.eventType ?? '') as RequirementsChangeEvent['eventType'],
    applicationId: String(value.applicationId ?? ''),
    businessDomainId: String(value.businessDomainId ?? ''),
    sourceId: String(value.sourceId ?? ''),
    sourcePath: String(value.sourcePath ?? ''),
    sourceVersion: String(value.sourceVersion ?? ''),
    sourceFingerprint: String(value.sourceFingerprint ?? ''),
    publishedAt: String(value.publishedAt ?? ''),
    correlationId: String(value.correlationId ?? ''),
  };
}

function isInside(rootDir: string, targetPath: string): boolean {
  const relative = path.relative(path.resolve(rootDir), path.resolve(targetPath));
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function writeJsonAtomic(filePath: string, value: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.tmp`;
  fs.writeFileSync(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  fs.renameSync(temporaryPath, filePath);
}

if (require.main === module) {
  try {
    const raw = JSON.parse(process.env.PRD_CHANGE_EVENT_JSON ?? 'null') as unknown;
    const result = validateProductCenterPrdChangeEvent(raw);
    writeJsonAtomic(outputPath, result);
    process.stdout.write(`${JSON.stringify({ status: result.status, diagnostics: result.diagnostics })}\n`);
    if (result.status !== 'accepted') process.exitCode = 1;
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
