import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';

const projectRoot = path.resolve(__dirname, '../..');
const platformPipeline = path.resolve(projectRoot, '../../Test Automation Platform/src/utils/idempotent-pipeline.ts');
const timingReport = path.resolve(projectRoot, '../deliverables/test-plan-governance/product-center-seven-hour-time-analysis.md');

test.describe('商品中心长耗时治理合同', () => {
  test('幂等流水线检查点记录阶段墙钟耗时并兼容旧检查点', () => {
    const source = fs.readFileSync(platformPipeline, 'utf8');
    expect(source).toContain('durationMs?: number');
    expect(source).toContain('durationMs: Date.now() - stageStartedAt');
    expect(source).toContain('stageStartedAt = Date.now()');
  });

  test('七小时报告明确区分已实施、剩余缺口和业务结果', () => {
    const source = fs.readFileSync(timingReport, 'utf8');
    expect(source).toContain('已实施优化');
    expect(source).toContain('后续流程整改');
    expect(source).toContain('不重跑业务用例');
    expect(source).toContain('不能宣称“债务已清零”');
  });
});
