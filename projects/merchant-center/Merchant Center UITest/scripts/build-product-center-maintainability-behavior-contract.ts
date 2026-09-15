import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

type PlanRegion = {
  filePath: string;
  facade: string;
  region: string;
  extractionOrder: number;
  sourceSha256: string;
  publicSurfaceNames: string[];
  affectedSurfaces: string[];
  implementationMoved?: boolean;
};

const projectRoot = path.resolve(__dirname, '..');
const planPath = path.join(projectRoot, 'output/quality/product-center-maintainability-responsibility-plan.json');
const outputPath = path.join(projectRoot, 'output/quality/product-center-maintainability-behavior-contract.json');
const plan = JSON.parse(fs.readFileSync(planPath, 'utf8')) as { planId: string; regions: PlanRegion[] };

const regions = plan.regions.map((region) => {
  const sourcePath = path.resolve(projectRoot, region.filePath);
  if (!sourcePath.startsWith(`${projectRoot}${path.sep}`)) throw new Error(`MAINTAINABILITY_SOURCE_OUTSIDE_PROJECT:${region.filePath}`);
  const source = fs.readFileSync(sourcePath, 'utf8');
  const sourceSha256 = crypto.createHash('sha256').update(source).digest('hex');
  if (sourceSha256 !== region.sourceSha256) throw new Error(`MAINTAINABILITY_SOURCE_DRIFT:${region.filePath}`);
  const lines = source.split(/\r?\n/);
  const surfaces = region.publicSurfaceNames.map((name) => {
    const line = lines.findIndex((candidate) => candidate.includes(name)) + 1;
    if (line <= 0) throw new Error(`MAINTAINABILITY_PUBLIC_SURFACE_MISSING:${region.filePath}:${name}`);
    const declaration = lines[line - 1].trim();
    return {
      name,
      sourceLine: line,
      declaration: declaration.slice(0, 240),
      verification: 'runtime-receipt-required',
    };
  });
  return {
    filePath: region.filePath,
    facade: region.facade,
    region: region.region,
    extractionOrder: region.extractionOrder,
    sourceSha256,
    affectedSurfaces: region.affectedSurfaces,
    publicSurfaceCount: surfaces.length,
    publicSurfaces: surfaces,
    status: 'static-boundary-ready',
    implementationMoved: region.implementationMoved === true,
    businessExecutionStarted: false,
    existingPassedCasesInvalidated: false,
  };
});

const report = {
  schemaVersion: '1.0.0',
  contractId: 'product-center-maintainability-behavior-v1',
  generatedAt: new Date().toISOString(),
  sourcePlanId: plan.planId,
  scope: 'static-boundary-and-targeted-revalidation-plan',
  status: 'ready-for-engineering-review',
  summary: {
    regionCount: regions.length,
    publicSurfaceCount: regions.reduce((total, region) => total + region.publicSurfaceCount, 0),
    implementationMoved: regions.some((region) => region.implementationMoved),
    businessExecutionStarted: false,
    existingPassedCasesInvalidated: false,
  },
  regions,
  acceptance: [
    '每个公开接口必须绑定当前源码行和 SHA-256 指纹',
    '静态结构拆分由声明一致性和合同测试验证；业务运行通过仍须当前标准收据',
    '源码或区域接口变化只触发引用该区域的定向重验',
    '静态合同不得被解释为业务运行通过',
  ],
};

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ outputPath, regionCount: regions.length, publicSurfaceCount: report.summary.publicSurfaceCount }));
