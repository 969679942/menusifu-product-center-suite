import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';

const digest = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');

/** Explicit adapter-owned root; reject traversal and symlink/junction redirection. */
export function resolveContainedArtifactPath(root: string, relative: string): string {
  if (!root || !path.isAbsolute(root)) throw new Error('ARTIFACT_OUTPUT_ROOT_REQUIRED');
  if (!relative || path.isAbsolute(relative) || relative.split(/[\\/]/).includes('..')) throw new Error('ARTIFACT_PATH_OUTSIDE_ROOT');
  const target = path.resolve(root, relative);
  const rel = path.relative(root, target);
  if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) throw new Error('ARTIFACT_PATH_OUTSIDE_ROOT');
  let cursor = target;
  while (cursor !== path.dirname(cursor)) {
    if (fs.existsSync(cursor) && fs.lstatSync(cursor).isSymbolicLink()) throw new Error('ARTIFACT_SYMLINK_FORBIDDEN');
    cursor = path.dirname(cursor);
  }
  return target;
}
const contained = resolveContainedArtifactPath;

function preserve(root: string, bytes: Buffer): { sha256: string; snapshot: string } {
  const sha256 = digest(bytes);
  const snapshot = `.artifact-history/objects/${sha256}.bin`;
  const target = contained(root, snapshot);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  try { fs.writeFileSync(target, bytes, { flag: 'wx' }); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
    if (!fs.readFileSync(target).equals(bytes)) throw new Error('ARTIFACT_SNAPSHOT_CORRUPT');
  }
  return { sha256, snapshot };
}

/** Only for already-sanitized reports/evidence, never credentials or browser state.
 * Both versions and a prepared transition are durable before latest is replaced.
 * A lock conflict fails closed; callers must retry after inspecting the owner.
 */
export function publishImmutableArtifact(input: {
  outputRoot: string; relativePath: string; content: string | Buffer; reason: string;
}) {
  if (!input.outputRoot || !path.isAbsolute(input.outputRoot)) throw new Error('ARTIFACT_OUTPUT_ROOT_REQUIRED');
  if (!input.reason.trim()) throw new Error('ARTIFACT_CHANGE_REASON_REQUIRED');
  const root = path.resolve(input.outputRoot);
  const target = contained(root, input.relativePath);
  const lock = contained(root, `${input.relativePath}.publish-lock`);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const handle = fs.openSync(lock, 'wx');
  const temporary = `${target}.${randomUUID()}.tmp`;
  try {
    const before = fs.existsSync(target) ? fs.readFileSync(target) : null;
    const after = Buffer.isBuffer(input.content) ? input.content : Buffer.from(input.content, 'utf8');
    const previous = before === null ? null : preserve(root, before);
    const current = preserve(root, after);
    const changed = !before?.equals(after);
    if (!changed) return { changed, previous, current, transitionPath: null };
    const transitionPath = `.artifact-history/transitions/${randomUUID()}.json`;
    const transition = contained(root, transitionPath);
    fs.mkdirSync(path.dirname(transition), { recursive: true });
    fs.writeFileSync(transition, JSON.stringify({ schemaVersion: '1.0.0', state: 'prepared',
      artifactPath: input.relativePath.replaceAll('\\', '/'), reason: input.reason,
      recordedAt: new Date().toISOString(), previous, current }, null, 2) + '\n', { flag: 'wx' });
    fs.writeFileSync(temporary, after, { flag: 'wx' });
    // Check for writers outside this contract before replacing latest.
    const observed = fs.existsSync(target) ? fs.readFileSync(target) : null;
    if (before === null ? observed !== null : observed === null || !before.equals(observed)) throw new Error('ARTIFACT_CONCURRENT_CHANGE');
    fs.renameSync(temporary, target);
    return { changed, previous, current, transitionPath };
  } finally {
    if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
    fs.closeSync(handle);
    fs.unlinkSync(lock);
  }
}
