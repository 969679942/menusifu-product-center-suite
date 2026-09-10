import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { readJsonEvidence } from '../../src/utils/json-evidence';

test('证据读取应区分缺失、损坏、不可读取和最新有效值', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'json-evidence-'));
  const file = path.join(root, 'evidence.json');
  const valid = (value: unknown): value is { count: number } => typeof (value as { count?: unknown } | null)?.count === 'number';
  try {
    expect(readJsonEvidence(file, valid)).toEqual({ status: 'missing', reason: 'not-found' });
    fs.writeFileSync(file, '{"synthetic-secret":"must-not-appear"');
    expect(readJsonEvidence(file, valid)).toEqual({ status: 'invalid', reason: 'json-invalid' });
    fs.writeFileSync(file, '{"count":"must-not-appear"}');
    expect(readJsonEvidence(file, valid)).toEqual({ status: 'invalid', reason: 'schema-invalid' });
    fs.writeFileSync(file, '\uFEFF{"count":1}');
    expect(readJsonEvidence(file, valid)).toEqual({ status: 'available', value: { count: 1 } });
    fs.writeFileSync(file, '{"count":2}');
    expect(readJsonEvidence(file, valid)).toEqual({ status: 'available', value: { count: 2 } });
    expect(readJsonEvidence(root, valid)).toEqual({ status: 'unreadable', reason: 'read-failed' });
    expect(readJsonEvidence(file, (_): _ is { count: number } => { throw new Error('must-not-appear'); })).toEqual({ status: 'invalid', reason: 'schema-invalid' });
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
