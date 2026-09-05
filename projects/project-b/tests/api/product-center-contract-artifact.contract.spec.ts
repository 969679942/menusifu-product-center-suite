import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import type { ProductCenterTestContract } from '../../utils/product-center-test-contract';

const projectRoot = path.resolve(__dirname, '../..');
const contractPath = path.join(projectRoot, 'contracts/product-center/product-center-test-contract.json');
const reviewPath = path.join(projectRoot, 'contracts/product-center/product-center-rule-review.json');
const traceabilityPath = path.join(projectRoot, 'contracts/product-center/product-center-traceability.json');
const generatedPath = path.join(projectRoot, 'contracts/product-center/generated');

test.describe('商品中心真实合同产物', () => {
  test('应覆盖 13 个合同集合并形成 46 条 SOP 闭环', async () => {
    const contract = JSON.parse(fs.readFileSync(contractPath, 'utf8')) as ProductCenterTestContract;
    const review = JSON.parse(fs.readFileSync(reviewPath, 'utf8')) as { summary: { total: number; p0: number; p1: number } };
    const traceability = JSON.parse(fs.readFileSync(traceabilityPath, 'utf8')) as {
      executableDescriptorCount: number;
      complete: boolean;
      stageGaps: { requirement: number; apiMapping: number };
      records: Array<{ id: string; evidence: Record<string, unknown> }>;
    };

    expect(contract.metadata.collections).toHaveLength(13);
    expect(contract.metadata.contractVersion).toBe('1.0.0');
    expect(traceability.executableDescriptorCount).toBe(46);
    expect(traceability.complete).toBe(true);
    expect(traceability.records).toHaveLength(46);
    expect(traceability.records.every((record) => record.evidence.automation && record.evidence.resultRef)).toBe(true);
    expect(traceability.stageGaps.apiMapping).toBe(0);
    expect(review.summary.total).toBe(review.summary.p0 + review.summary.p1);
    expect(review.summary.p0).toBeGreaterThan(0);
  });

  test('每条真实合同记录都保留来源置信度状态和版本', async () => {
    const contract = JSON.parse(fs.readFileSync(contractPath, 'utf8')) as ProductCenterTestContract;
    for (const collection of contract.metadata.collections) {
      for (const record of contract[collection] ?? []) {
        expect(record.id).toBeTruthy();
        expect(record.source.length).toBeGreaterThan(0);
        expect(record.status).toBeTruthy();
        expect(record.sourceType).toBeTruthy();
        expect(record.confidence).toBeGreaterThanOrEqual(0);
        expect(record.confidence).toBeLessThanOrEqual(1);
        expect(record.version).toBe('1.0.0');
      }
    }
  });

  test('模块视图和索引应是可直接读取的生成产物', async () => {
    const contract = JSON.parse(fs.readFileSync(contractPath, 'utf8')) as ProductCenterTestContract;
    const manifest = JSON.parse(fs.readFileSync(path.join(generatedPath, 'manifest.json'), 'utf8')) as {
      modules: Array<{ id: string; routes: number }>;
      sharedRecords: number;
    };
    const snapshot = JSON.parse(fs.readFileSync(path.join(projectRoot, 'contracts/product-center/snapshots/product-center-test-contract.snapshot.json'), 'utf8')) as {
      records: Array<{ key: string; sha256: string }>;
    };
    const byId = JSON.parse(fs.readFileSync(path.join(generatedPath, 'indexes/byId.json'), 'utf8')) as Record<string, unknown>;
    const expectedRecordCount = contract.metadata.collections.reduce(
      (total, collection) => total + (contract.metadata.counts[collection] ?? 0),
      0,
    );

    expect(manifest.modules).toHaveLength(9);
    expect(manifest.modules.reduce((total, module) => total + module.routes, 0)).toBe(34);
    expect(manifest.sharedRecords).toBeGreaterThan(0);
    expect(Object.keys(byId)).toHaveLength(expectedRecordCount);
    expect(snapshot.records).toHaveLength(expectedRecordCount);
    expect(snapshot.records.every((record) => /^[a-f0-9]{64}$/.test(record.sha256))).toBe(true);
  });

  test('人工审核包应只呈现候选差异与发布入口', async () => {
    const diff = JSON.parse(fs.readFileSync(path.join(projectRoot, 'contracts/product-center/product-center-contract-diff.json'), 'utf8')) as {
      metadataChanged: boolean;
      summary: { added: number; removed: number; changed: number; unchanged: number };
    };
    const review = JSON.parse(fs.readFileSync(path.join(projectRoot, 'contracts/product-center/reviews/current-contract-review.json'), 'utf8')) as {
      status: string;
      metadataChanged: boolean;
      recordChanges: { added: number; removed: number; changed: number; unchanged: number };
      modules: unknown[];
      promotionCommand: string;
    };

    expect(review.status).toBe('pending-human-review');
    expect(review.metadataChanged).toBe(diff.metadataChanged);
    expect(review.recordChanges).toEqual(diff.summary);
    expect(review.modules).toHaveLength(9);
    expect(review.promotionCommand).toContain('--reviewed-by <审核人>');
  });
});
