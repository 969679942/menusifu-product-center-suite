import fs from 'node:fs';
import path from 'node:path';

const projectRoot = process.cwd();
const shardReportDir = path.resolve(projectRoot, 'output/brand-menu-api-shards');
const aggregateReportPath = path.resolve(projectRoot, 'output/brand-menu-api-tests.json');

fs.rmSync(shardReportDir, { recursive: true, force: true });
fs.mkdirSync(shardReportDir, { recursive: true });
fs.rmSync(aggregateReportPath, { force: true });
console.log('已清理品牌接口测试旧分片报告和总报告。');
