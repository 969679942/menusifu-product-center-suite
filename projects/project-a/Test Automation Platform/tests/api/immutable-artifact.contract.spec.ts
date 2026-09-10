import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { test, expect } from '@playwright/test';
import { publishImmutableArtifact } from '../../src/utils/immutable-artifact';

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'immutable-artifact-'));
  return { root, write: (content: string, relativePath = 'reports/latest.json') => publishImmutableArtifact({
    outputRoot: root, relativePath, content, reason: 'synthetic-observation-correction' }),
  cleanup: () => fs.rmSync(root, { recursive: true, force: true }) };
}

test('更新前后内容与原始修正链必须保留，重复发布不产生伪变化', () => {
  const f = fixture();
  try {
    const first = f.write('{"attempts":7}');
    const second = f.write('{"attempts":2}');
    expect(second.previous).toEqual(first.current);
    expect(fs.readFileSync(path.join(f.root, second.previous!.snapshot), 'utf8')).toBe('{"attempts":7}');
    expect(fs.readFileSync(path.join(f.root, second.current.snapshot), 'utf8')).toBe('{"attempts":2}');
    const transition = JSON.parse(fs.readFileSync(path.join(f.root, second.transitionPath!), 'utf8'));
    expect(transition).toMatchObject({ state: 'prepared', previous: first.current, current: second.current, reason: 'synthetic-observation-correction' });
    expect(f.write('{"attempts":2}').changed).toBe(false);
    expect(fs.readdirSync(path.join(f.root, '.artifact-history/transitions'))).toHaveLength(2);
  } finally { f.cleanup(); }
});

test('快照损坏必须阻断最新视图覆盖并保留原内容', () => {
  const f = fixture();
  try {
    const first = f.write('old');
    fs.writeFileSync(path.join(f.root, first.current.snapshot), 'tampered');
    expect(() => f.write('new')).toThrow('ARTIFACT_SNAPSHOT_CORRUPT');
    expect(fs.readFileSync(path.join(f.root, 'reports/latest.json'), 'utf8')).toBe('old');
    expect(fs.existsSync(path.join(f.root, 'reports/latest.json.publish-lock'))).toBe(false);
  } finally { f.cleanup(); }
});

test('路径越界、链接重定向和并发锁必须在覆盖前阻断', () => {
  const f = fixture();
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'immutable-outside-'));
  try {
    expect(() => f.write('x', '../outside.json')).toThrow('ARTIFACT_PATH_OUTSIDE_ROOT');
    expect(() => f.write('x', path.join(outside, 'x'))).toThrow('ARTIFACT_PATH_OUTSIDE_ROOT');
    fs.symlinkSync(outside, path.join(f.root, 'link'), 'junction');
    expect(() => f.write('x', 'link/latest.json')).toThrow('ARTIFACT_SYMLINK_FORBIDDEN');
    f.write('old');
    fs.writeFileSync(path.join(f.root, 'reports/latest.json.publish-lock'), 'other-owner');
    expect(() => f.write('new')).toThrow();
    expect(fs.readFileSync(path.join(f.root, 'reports/latest.json'), 'utf8')).toBe('old');
    expect(fs.readFileSync(path.join(f.root, 'reports/latest.json.publish-lock'), 'utf8')).toBe('other-owner');
  } finally { f.cleanup(); fs.rmSync(outside, { recursive: true, force: true }); }
});

test('新快照无法持久化时不得替换旧视图', () => {
  const f = fixture();
  try {
    f.write('old');
    const hash = createHash('sha256').update('new').digest('hex');
    fs.mkdirSync(path.join(f.root, `.artifact-history/objects/${hash}.bin`));
    expect(() => f.write('new')).toThrow();
    expect(fs.readFileSync(path.join(f.root, 'reports/latest.json'), 'utf8')).toBe('old');
  } finally { f.cleanup(); }
});
