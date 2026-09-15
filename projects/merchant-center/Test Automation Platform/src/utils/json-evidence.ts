import fs from 'node:fs';

export type JsonEvidenceResult<T> =
  | { status: 'available'; value: T }
  | { status: 'missing' | 'invalid' | 'unreadable'; reason: 'not-found' | 'json-invalid' | 'schema-invalid' | 'read-failed' };

/** Read at invocation time. Diagnostics deliberately exclude source bytes and exception text. */
export function readJsonEvidence<T>(filePath: string, validate: (value: unknown) => value is T): JsonEvidenceResult<T> {
  let source: string;
  try {
    source = fs.readFileSync(filePath, 'utf8');
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'ENOENT'
      ? { status: 'missing', reason: 'not-found' }
      : { status: 'unreadable', reason: 'read-failed' };
  }
  let value: unknown;
  try {
    value = JSON.parse(source.replace(/^\uFEFF/, ''));
  } catch {
    return { status: 'invalid', reason: 'json-invalid' };
  }
  try {
    return validate(value) ? { status: 'available', value } : { status: 'invalid', reason: 'schema-invalid' };
  } catch {
    return { status: 'invalid', reason: 'schema-invalid' };
  }
}
