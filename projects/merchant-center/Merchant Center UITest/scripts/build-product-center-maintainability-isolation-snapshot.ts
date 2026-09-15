import fs from 'node:fs';
import path from 'node:path';

const projectRoot = path.resolve(__dirname, '..');
const planPath = path.join(projectRoot, 'output/quality/product-center-maintainability-responsibility-plan.json');
const outputPath = path.join(projectRoot, 'output/quality/product-center-maintainability-isolation-snapshot.json');

type Plan = {
  planId: string;
  regions: Array<{
    filePath: string;
    region: string;
    facade: string;
    extractionOrder: number;
    sourceSha256: string;
    lines: number;
    publicSurfaceNames: string[];
    affectedSurfaces: string[];
    implementationMoved?: boolean;
  }>;
};

const plan = JSON.parse(fs.readFileSync(planPath, 'utf8')) as Plan;
const regions = plan.regions.map((region) => ({
  ...region,
  isolationStatus: 'snapshot-only',
  implementationMoved: region.implementationMoved === true,
  facadePreserved: true,
  publicSurfaceFingerprint: stableFingerprint(region.publicSurfaceNames),
  verification: {
    businessExecutionStarted: false,
    existingPassedCasesInvalidated: false,
    requiredBeforeMove: ['区域行为合同', '兼容 facade 合同', '引用区域定向重验计划'],
  },
}));
const report = {
  schemaVersion: '1.0.0',
  snapshotId: 'product-center-maintainability-isolation-v1',
  generatedAt: new Date().toISOString(),
  sourcePlanId: plan.planId,
  purpose: '拆分实施前固化区域职责、公开接口和行为影响面；不执行业务写入',
  status: 'ready-for-facade-review',
  summary: {
    regionCount: regions.length,
    implementationMoved: regions.some((region) => region.implementationMoved),
    businessExecutionStarted: false,
    existingPassedCasesInvalidated: false,
  },
  regions,
  acceptance: [
    '区域行为合同通过后才允许移动实现',
    '原 facade 导出与构造方式保持兼容',
    '实现指纹变化只触发引用区域的定向重验',
    '不得以历史收据或汇总计数替代当前收据',
  ],
};
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ outputPath, regionCount: regions.length, implementationMoved: report.summary.implementationMoved }));

function stableFingerprint(values: string[]): string {
  let hash = 2166136261;
  for (const value of [...values].sort().join('\u0000')) {
    hash ^= value.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}
