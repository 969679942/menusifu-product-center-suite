import { expect, test } from '@playwright/test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { discoverIncompleteCheckpointRunIds } from '../../scripts/product-center-resume-cleanup';

test.describe('商品中心独立恢复命令', () => {
  test('只应返回包含未完成审计条目的运行检查点', async () => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'product-center-resume-cli-'));
    fs.writeFileSync(path.join(rootDir, 'complete.json'), JSON.stringify({
      schemaVersion: '1.0.0', runId: 'AUTO_AUDIT_COMPLETE', updatedAt: new Date(0).toISOString(),
      entries: [{ entryId: 'category-1', entityKind: 'category', entity: '商品分类', serverId: 1,
        identity: 'AUTO_AUDIT_CATEGORY_1', identityVariants: ['AUTO_AUDIT_CATEGORY_1'], cleanupOrder: 40,
        phase: 'residue-verified', updatedAt: new Date(0).toISOString() }],
    }));
    fs.writeFileSync(path.join(rootDir, 'incomplete.json'), JSON.stringify({
      schemaVersion: '1.0.0', runId: 'AUTO_AUDIT_INCOMPLETE', updatedAt: new Date(0).toISOString(),
      entries: [{ entryId: 'category-2', entityKind: 'category', entity: '商品分类', serverId: 2,
        identity: 'AUTO_AUDIT_CATEGORY_2', identityVariants: ['AUTO_AUDIT_CATEGORY_2'], cleanupOrder: 40,
        phase: 'failed', updatedAt: new Date(0).toISOString() }],
    }));
    fs.writeFileSync(path.join(rootDir, 'ignore.txt'), 'not a checkpoint');
    fs.writeFileSync(path.join(rootDir, 'onboarding.json'), JSON.stringify({
      schemaVersion: '1.0.0',
      caseId: 'case-a',
      nextStage: 'full',
      stages: { single: { runId: 'run-single' } },
    }));

    expect(discoverIncompleteCheckpointRunIds(rootDir)).toEqual(['AUTO_AUDIT_INCOMPLETE']);
  });

  test('应递归发现组批次目录中的未完成检查点', async () => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'product-center-resume-nested-'));
    const nestedDir = path.join(rootDir, 'group', 'run-1', 'mutation-01');
    fs.mkdirSync(nestedDir, { recursive: true });
    fs.writeFileSync(path.join(nestedDir, 'ledger.json'), JSON.stringify({
      schemaVersion: '1.0.0', runId: 'AUTO_AUDIT_NESTED', updatedAt: new Date(0).toISOString(),
      entries: [{ entryId: 'item-1', entityKind: 'item', entity: '商品', serverId: 1,
        identity: 'AUTO_AUDIT_ITEM_1', identityVariants: ['AUTO_AUDIT_ITEM_1'], cleanupOrder: 20,
        phase: 'seeded', updatedAt: new Date(0).toISOString() }],
    }));

    expect(discoverIncompleteCheckpointRunIds(rootDir)).toEqual(['AUTO_AUDIT_NESTED']);
  });
});
