import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export type ProductCenterQualityPipelineReportArtifact = {
  schemaVersion: string;
  generatedAt: string;
  pipelineId: string;
  mode: string;
  status: string;
  checkpoint: string;
  pipeline: {
    runId: string;
    status: string;
    stages: unknown[];
    [key: string]: unknown;
  };
  technicalReadiness: unknown;
  [key: string]: unknown;
};

export type ProductCenterPipelineArtifactPointer = {
  schemaVersion: '1.0.0';
  kind: 'product-center-quality-pipeline-pointer';
  generatedAt: string;
  pipelineId: string;
  mode: string;
  runId: string;
  status: string;
  reportPath: string;
  reportSha256: string;
  checkpointPath: string;
  checkpointSha256: string;
  manifestPath: string;
};

type ProductCenterPipelineArtifactManifest = Omit<ProductCenterPipelineArtifactPointer, 'kind'> & {
  kind: 'product-center-quality-pipeline-artifact';
  revision: string;
};

export function publishProductCenterPipelineArtifacts(input: {
  rootDir: string;
  checkpointPath: string;
  report: ProductCenterQualityPipelineReportArtifact;
}): {
  pointerPath: string;
  reportPath: string;
  checkpointPath: string;
  manifestPath: string;
  pointer: ProductCenterPipelineArtifactPointer;
} {
  validateReport(input.report);
  const rootDir = path.resolve(input.rootDir);
  const checkpointSourcePath = path.resolve(input.checkpointPath);
  if (!fs.existsSync(checkpointSourcePath)) throw new Error('流水线检查点不存在，禁止发布报告');
  const reportContent = jsonContent(input.report);
  const checkpointContent = fs.readFileSync(checkpointSourcePath);
  const checkpoint = parseJson(checkpointContent.toString('utf8'), '流水线检查点 JSON 无效') as {
    runId?: unknown;
  };
  if (checkpoint.runId !== input.report.pipeline.runId) {
    throw new Error('流水线报告与检查点 runId 不一致');
  }
  const reportSha256 = sha256(reportContent);
  const checkpointSha256 = sha256(checkpointContent);
  const revision = sha256(`${reportSha256}:${checkpointSha256}`);
  const runId = safeSegment(input.report.pipeline.runId, 'runId');
  const revisionDirectory = path.join(
    rootDir,
    'output/pipeline/runs',
    runId,
    revision,
  );
  const reportPath = path.join(revisionDirectory, 'report.json');
  const immutableCheckpointPath = path.join(revisionDirectory, 'checkpoint.json');
  const manifestPath = path.join(revisionDirectory, 'manifest.json');
  const relative = (filePath: string) => normalize(path.relative(rootDir, filePath));
  const pointer: ProductCenterPipelineArtifactPointer = {
    schemaVersion: '1.0.0',
    kind: 'product-center-quality-pipeline-pointer',
    generatedAt: input.report.generatedAt,
    pipelineId: input.report.pipelineId,
    mode: input.report.mode,
    runId,
    status: input.report.status,
    reportPath: relative(reportPath),
    reportSha256,
    checkpointPath: relative(immutableCheckpointPath),
    checkpointSha256,
    manifestPath: relative(manifestPath),
  };
  const manifest: ProductCenterPipelineArtifactManifest = {
    ...pointer,
    kind: 'product-center-quality-pipeline-artifact',
    revision,
  };

  writeImmutable(reportPath, reportContent);
  writeImmutable(immutableCheckpointPath, checkpointContent);
  writeImmutable(manifestPath, jsonContent(manifest));
  const pointerPath = latestPointerPath(rootDir);
  writeAtomic(pointerPath, jsonContent(pointer));
  return {
    pointerPath,
    reportPath,
    checkpointPath: immutableCheckpointPath,
    manifestPath,
    pointer,
  };
}

export function readLatestProductCenterPipelineArtifact(rootDir: string): {
  pointer: ProductCenterPipelineArtifactPointer;
  report: ProductCenterQualityPipelineReportArtifact;
  reportPath: string;
  checkpointPath: string;
} {
  const resolvedRoot = path.resolve(rootDir);
  const pointer = parseJson(
    fs.readFileSync(latestPointerPath(resolvedRoot), 'utf8'),
    '流水线 latest 指针 JSON 无效',
  ) as ProductCenterPipelineArtifactPointer;
  validatePointer(pointer);
  const reportPath = resolveArtifactPath(resolvedRoot, pointer.reportPath);
  const checkpointPath = resolveArtifactPath(resolvedRoot, pointer.checkpointPath);
  verifyFileHash(reportPath, pointer.reportSha256, '流水线报告');
  verifyFileHash(checkpointPath, pointer.checkpointSha256, '流水线检查点');
  const report = parseJson(
    fs.readFileSync(reportPath, 'utf8'),
    '流水线不可变报告 JSON 无效',
  ) as ProductCenterQualityPipelineReportArtifact;
  validateReport(report);
  if (report.pipeline.runId !== pointer.runId
    || report.mode !== pointer.mode
    || report.status !== pointer.status) {
    throw new Error('流水线 latest 指针与不可变报告不一致');
  }
  return { pointer, report, reportPath, checkpointPath };
}

export function readLatestProductCenterPipelineReport(
  rootDir: string,
): ProductCenterQualityPipelineReportArtifact {
  return readLatestProductCenterPipelineArtifact(rootDir).report;
}

export function buildProductCenterPipelineArtifactRetentionAudit(input: {
  rootDir: string;
  now?: string;
  retentionDays?: number;
  maxRevisions?: number;
}) {
  const rootDir = path.resolve(input.rootDir);
  const now = parseDate(input.now ?? new Date().toISOString(), '流水线保留审计时间无效');
  const retentionDays = positiveInteger(input.retentionDays ?? 90, '流水线保留天数无效');
  const maxRevisions = positiveInteger(input.maxRevisions ?? 50, '流水线最大修订数无效');
  const latest = fs.existsSync(latestPointerPath(rootDir))
    ? readLatestProductCenterPipelineArtifact(rootDir)
    : undefined;
  const latestDirectory = latest ? path.dirname(latest.reportPath) : undefined;
  const records = listManifestPaths(rootDir).map((manifestPath) => {
    const manifest = parseJson(
      fs.readFileSync(manifestPath, 'utf8'),
      `流水线 manifest JSON 无效：${manifestPath}`,
    ) as ProductCenterPipelineArtifactManifest;
    validateManifest(manifest);
    const directory = path.dirname(manifestPath);
    const generatedAt = parseDate(manifest.generatedAt, `流水线 manifest 时间无效：${manifestPath}`);
    const ageDays = Math.floor((now.getTime() - generatedAt.getTime()) / 86_400_000);
    return {
      directory,
      generatedAt: manifest.generatedAt,
      ageDays,
      runId: manifest.runId,
      mode: manifest.mode,
      status: manifest.status,
      protectedFromDeletion: directory === latestDirectory,
    };
  }).sort((left, right) => right.generatedAt.localeCompare(left.generatedAt));
  const expiredCandidates = records
    .filter((record, index) => !record.protectedFromDeletion
      && (record.ageDays > retentionDays || index >= maxRevisions))
    .map((record) => normalize(record.directory))
    .sort();
  return {
    schemaVersion: '1.0.0' as const,
    generatedAt: now.toISOString(),
    deletionMode: 'report-only' as const,
    policy: { retentionDays, maxRevisions, latestAutoDeleteAllowed: false },
    summary: {
      revisions: records.length,
      expiredCandidates: expiredCandidates.length,
      protected: records.filter((record) => record.protectedFromDeletion).length,
    },
    expiredCandidates,
    protectedPaths: records
      .filter((record) => record.protectedFromDeletion)
      .map((record) => normalize(record.directory)),
    records: records.map((record) => ({ ...record, directory: normalize(record.directory) })),
  };
}

function validateReport(report: ProductCenterQualityPipelineReportArtifact): void {
  if (!report || typeof report !== 'object') throw new Error('流水线报告必须为对象');
  for (const [name, value] of [
    ['generatedAt', report.generatedAt],
    ['pipelineId', report.pipelineId],
    ['mode', report.mode],
    ['status', report.status],
    ['checkpoint', report.checkpoint],
    ['runId', report.pipeline?.runId],
  ] as const) {
    if (typeof value !== 'string' || value.trim().length === 0) {
      throw new Error(`流水线报告缺少 ${name}`);
    }
  }
  parseDate(report.generatedAt, '流水线报告 generatedAt 无效');
  safeSegment(report.pipeline.runId, 'runId');
}

function validatePointer(pointer: ProductCenterPipelineArtifactPointer): void {
  if (pointer?.schemaVersion !== '1.0.0'
    || pointer.kind !== 'product-center-quality-pipeline-pointer') {
    throw new Error('流水线 latest 指针类型无效');
  }
  safeSegment(pointer.runId, 'runId');
  for (const [name, value] of [
    ['reportSha256', pointer.reportSha256],
    ['checkpointSha256', pointer.checkpointSha256],
  ] as const) {
    if (!/^[a-f0-9]{64}$/.test(value)) throw new Error(`流水线指针 ${name} 无效`);
  }
}

function validateManifest(manifest: ProductCenterPipelineArtifactManifest): void {
  if (manifest?.schemaVersion !== '1.0.0'
    || manifest.kind !== 'product-center-quality-pipeline-artifact'
    || !/^[a-f0-9]{64}$/.test(manifest.revision)) {
    throw new Error('流水线不可变 manifest 无效');
  }
  safeSegment(manifest.runId, 'runId');
}

function resolveArtifactPath(rootDir: string, relativePath: string): string {
  if (typeof relativePath !== 'string' || relativePath.length === 0 || path.isAbsolute(relativePath)) {
    throw new Error('流水线指针产物路径无效');
  }
  const runsRoot = path.resolve(rootDir, 'output/pipeline/runs');
  const resolved = path.resolve(rootDir, relativePath);
  if (resolved !== runsRoot && !resolved.startsWith(`${runsRoot}${path.sep}`)) {
    throw new Error('流水线指针产物路径越界');
  }
  return resolved;
}

function verifyFileHash(filePath: string, expected: string, label: string): void {
  if (!fs.existsSync(filePath)) throw new Error(`${label}不存在`);
  const actual = sha256(fs.readFileSync(filePath));
  if (actual !== expected) throw new Error(`${label} SHA-256 校验失败`);
}

function listManifestPaths(rootDir: string): string[] {
  const runsRoot = path.join(rootDir, 'output/pipeline/runs');
  if (!fs.existsSync(runsRoot)) return [];
  return fs.readdirSync(runsRoot, { withFileTypes: true }).flatMap((runEntry) => {
    if (!runEntry.isDirectory()) return [];
    const runDirectory = path.join(runsRoot, runEntry.name);
    return fs.readdirSync(runDirectory, { withFileTypes: true }).flatMap((revisionEntry) => {
      if (!revisionEntry.isDirectory()) return [];
      const manifestPath = path.join(runDirectory, revisionEntry.name, 'manifest.json');
      return fs.existsSync(manifestPath) ? [manifestPath] : [];
    });
  });
}

function latestPointerPath(rootDir: string): string {
  return path.join(rootDir, 'output/pipeline/product-center-quality-pipeline-latest.json');
}

function writeImmutable(filePath: string, content: string | Buffer): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  if (fs.existsSync(filePath)) {
    const existing = fs.readFileSync(filePath);
    const incoming = Buffer.isBuffer(content) ? content : Buffer.from(content, 'utf8');
    if (!existing.equals(incoming)) throw new Error(`禁止覆盖不可变流水线产物：${filePath}`);
    return;
  }
  fs.writeFileSync(filePath, content, { flag: 'wx' });
}

function writeAtomic(filePath: string, content: string): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.${process.pid}.tmp`;
  fs.writeFileSync(temporaryPath, content, 'utf8');
  fs.renameSync(temporaryPath, filePath);
}

function jsonContent(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function parseJson(value: string, message: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    throw new Error(message);
  }
}

function safeSegment(value: string, name: string): string {
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(value)) {
    throw new Error(`流水线 ${name} 无效`);
  }
  return value;
}

function positiveInteger(value: number, message: string): number {
  if (!Number.isInteger(value) || value <= 0) throw new Error(message);
  return value;
}

function parseDate(value: string, message: string): Date {
  const result = new Date(value);
  if (Number.isNaN(result.getTime())) throw new Error(message);
  return result;
}

function sha256(value: string | Buffer): string {
  return createHash('sha256').update(value).digest('hex');
}

function normalize(value: string): string {
  return value.replace(/\\/g, '/');
}
