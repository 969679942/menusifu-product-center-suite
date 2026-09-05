import { expect, test } from '@playwright/test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  findIncompleteCheckpointFiles,
  pruneCompletedCheckpoints,
  pruneTimingReports,
  removeAuthState,
  scanGeneratedArtifacts,
} from '../../utils/product-center-run-safety';

test.describe('商品中心运行安全工具合同', () => {
  test('应删除临时登录态文件', async () => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mc-auth-state-'));
    const storageStatePath = path.join(rootDir, 'auth-state.json');
    fs.writeFileSync(storageStatePath, '{"cookies":[]}');

    expect(removeAuthState(storageStatePath)).toBe(true);
    expect(fs.existsSync(storageStatePath)).toBe(false);
    expect(removeAuthState(storageStatePath)).toBe(false);
  });

  test('应发现生成物中的敏感字段但不返回内容', async () => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mc-artifacts-'));
    fs.writeFileSync(path.join(rootDir, 'safe.json'), '{"status":"passed"}');
    fs.writeFileSync(path.join(rootDir, 'safe-label.json'), '{"label":"Password"}');
    fs.writeFileSync(path.join(rootDir, 'unsafe.json'), '{"authorization":"redacted"}');

    expect(scanGeneratedArtifacts(rootDir)).toEqual([{ file: path.relative(process.cwd(), path.join(rootDir, 'unsafe.json')) }]);
  });

  test('应只把未完成检查点列为待恢复', async () => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mc-checkpoints-'));
    fs.writeFileSync(path.join(rootDir, 'complete.json'), JSON.stringify({ runId: 'complete', entries: [{ phase: 'residue-verified' }] }));
    fs.writeFileSync(path.join(rootDir, 'incomplete.json'), JSON.stringify({ runId: 'incomplete', entries: [{ phase: 'failed' }] }));

    expect(findIncompleteCheckpointFiles(rootDir)).toEqual([path.relative(process.cwd(), path.join(rootDir, 'incomplete.json'))]);
  });

  test('应仅裁剪超过保留数的已完成检查点', async () => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mc-checkpoint-retention-'));
    const completeOld = path.join(rootDir, 'complete-old.json');
    const completeNew = path.join(rootDir, 'complete-new.json');
    const incomplete = path.join(rootDir, 'incomplete.json');
    fs.writeFileSync(completeOld, JSON.stringify({ runId: 'old', entries: [{ phase: 'residue-verified' }] }));
    fs.writeFileSync(completeNew, JSON.stringify({ runId: 'new', entries: [{ phase: 'residue-verified' }] }));
    fs.writeFileSync(incomplete, JSON.stringify({ runId: 'incomplete', entries: [{ phase: 'failed' }] }));
    fs.utimesSync(completeOld, new Date(1_000), new Date(1_000));
    fs.utimesSync(completeNew, new Date(2_000), new Date(2_000));

    expect(pruneCompletedCheckpoints(rootDir, 1)).toEqual([path.relative(process.cwd(), completeOld)]);
    expect(fs.existsSync(completeNew)).toBe(true);
    expect(fs.existsSync(incomplete)).toBe(true);
  });

  test('应只裁剪商品中心历史耗时报告', async () => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mc-timing-retention-'));
    const oldReport = path.join(rootDir, 'product-center-timing-1.json');
    const newReport = path.join(rootDir, 'product-center-timing-2.json');
    const namedReport = path.join(rootDir, 'full-final.json');
    fs.writeFileSync(oldReport, '{}');
    fs.writeFileSync(newReport, '{}');
    fs.writeFileSync(namedReport, '{}');
    fs.utimesSync(oldReport, new Date(1_000), new Date(1_000));
    fs.utimesSync(newReport, new Date(2_000), new Date(2_000));

    expect(pruneTimingReports(rootDir, 1)).toEqual([path.relative(process.cwd(), oldReport)]);
    expect(fs.existsSync(newReport)).toBe(true);
    expect(fs.existsSync(namedReport)).toBe(true);
  });
});
