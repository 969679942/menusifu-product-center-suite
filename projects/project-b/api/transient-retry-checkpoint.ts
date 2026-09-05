import { createHash, randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

type RetryMetadata = {
  attempt: number;
  delayMs: number;
  reason: string;
  status?: number;
};

type RecoveredMetadata = {
  attempts: number;
};

export class TransientRetryCheckpoint {
  private readonly checkpointPath: string;
  private readonly operationFingerprint: string;

  constructor(operationKey: string, rootDir = path.resolve('output/retry-checkpoints')) {
    this.operationFingerprint = createHash('sha256').update(operationKey).digest('hex').slice(0, 16);
    this.checkpointPath = path.join(rootDir, `${this.operationFingerprint}-${process.pid}-${randomUUID()}.json`);
  }

  async recordRetry(metadata: RetryMetadata): Promise<void> {
    await this.write({
      operationFingerprint: this.operationFingerprint,
      status: 'retrying',
      attempts: metadata.attempt,
      delayMs: metadata.delayMs,
      reason: metadata.reason,
      httpStatus: metadata.status,
      updatedAt: new Date().toISOString(),
    });
  }

  async recordRecovered(metadata: RecoveredMetadata): Promise<void> {
    await this.write({
      operationFingerprint: this.operationFingerprint,
      status: 'recovered',
      attempts: metadata.attempts,
      updatedAt: new Date().toISOString(),
    });
  }

  private async write(value: Record<string, unknown>): Promise<void> {
    await fs.mkdir(path.dirname(this.checkpointPath), { recursive: true });
    const temporaryPath = `${this.checkpointPath}.tmp`;
    await fs.writeFile(temporaryPath, JSON.stringify(value, null, 2));
    await fs.rename(temporaryPath, this.checkpointPath);
  }
}
