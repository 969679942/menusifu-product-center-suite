import fs from 'node:fs';
import path from 'node:path';

export type ProductCenterMaintainabilityReport = {
  schemaVersion: '1.0.0';
  generatedAt: string;
  status: 'passed' | 'blocked';
  summary: { files: number; highPriorityFiles: number; directIdentityTemplates: number };
  baseline: ProductCenterMaintainabilityBaseline;
  issues: string[];
  files: Array<{ path: string; lines: number; category: 'page' | 'flow' | 'factory' | 'runner' | 'utility'; reviewPriority: 'high' | 'medium' | 'normal' }>;
  directIdentityTemplates: Array<{ path: string; line: number; text: string }>;
  recommendations: string[];
};

export type ProductCenterMaintainabilityBaseline = {
  maxHighPriorityFiles: number;
  maxDirectIdentityTemplates: number;
};

export function buildProductCenterMaintainabilityReport(
  projectRoot = process.cwd(),
  baseline: ProductCenterMaintainabilityBaseline = {
    maxHighPriorityFiles: Number.POSITIVE_INFINITY,
    maxDirectIdentityTemplates: Number.POSITIVE_INFINITY,
  },
): ProductCenterMaintainabilityReport {
  const roots: Array<{ directory: string; category: ProductCenterMaintainabilityReport['files'][number]['category'] }> = [
    { directory: 'pages', category: 'page' },
    { directory: 'flows', category: 'flow' },
    { directory: 'test-data', category: 'factory' },
    { directory: 'utils', category: 'utility' },
  ];
  const files = roots.flatMap(({ directory, category }) => listTypeScriptFiles(path.join(projectRoot, directory))
    .map((filePath) => {
      const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/).length;
      const isRunner = filePath.endsWith('product-center-group-runner.ts');
      const reviewPriority: 'high' | 'medium' | 'normal' = lines > 2_000 || isRunner
        ? 'high'
        : lines > 900
          ? 'medium'
          : 'normal';
      return { path: path.relative(projectRoot, filePath), lines, category: isRunner ? 'runner' as const : category, reviewPriority };
    }))
    .sort((left, right) => right.lines - left.lines || left.path.localeCompare(right.path));
  const directIdentityTemplates = files.flatMap((file) => {
    const source = fs.readFileSync(path.join(projectRoot, file.path), 'utf8');
    return source.split(/\r?\n/).flatMap((line, index) => /AUTO_AUDIT_.*(?:Date\.now|timestamp)/.test(line)
      ? [{ path: file.path, line: index + 1, text: line.trim() }]
      : []);
  });
  const summary = {
    files: files.length,
    highPriorityFiles: files.filter((file) => file.reviewPriority === 'high').length,
    directIdentityTemplates: directIdentityTemplates.length,
  };
  const issues = [
    ...(summary.highPriorityFiles > baseline.maxHighPriorityFiles
      ? [`HIGH_PRIORITY_FILES_INCREASED:${summary.highPriorityFiles}>${baseline.maxHighPriorityFiles}`]
      : []),
    ...(summary.directIdentityTemplates > baseline.maxDirectIdentityTemplates
      ? [`DIRECT_IDENTITY_TEMPLATES_INCREASED:${summary.directIdentityTemplates}>${baseline.maxDirectIdentityTemplates}`]
      : []),
  ];
  return {
    schemaVersion: '1.0.0',
    generatedAt: new Date().toISOString(),
    status: issues.length === 0 ? 'passed' : 'blocked',
    summary,
    baseline,
    issues,
    files,
    directIdentityTemplates,
    recommendations: [
      '优先拆分超过 2000 行的 runner、page object 和 flow，保留页面动作、业务编排、断言适配器三层边界。',
      '将 directIdentityTemplates 迁移到 createAuditFieldValue，并按页面字段 maxlength 传入上限。',
      '将 API 路径、响应形状和清理逻辑保留在共享适配器，生成用例只引用 adapterId，不复制调用细节。',
    ],
  };
}

function listTypeScriptFiles(directory: string): string[] {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return listTypeScriptFiles(entryPath);
    return entry.isFile() && entry.name.endsWith('.ts') ? [entryPath] : [];
  });
}
