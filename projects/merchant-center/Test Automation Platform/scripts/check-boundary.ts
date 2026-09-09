import path from 'node:path';
import { inspectPlatformBoundary, readPlatformForbiddenPatterns } from '../src/platform-boundary';

const rootDir = path.resolve(__dirname, '..');
const rules = readPlatformForbiddenPatterns(rootDir);
if (!rules.configured) {
  process.stderr.write('PUBLIC_PLATFORM_BOUNDARY_RULES_UNCONFIGURED: ownership.json 未配置 forbiddenDomainTerms；边界检查结果不可作为完整门禁。\n');
}
const violations = inspectPlatformBoundary({ rootDir, forbiddenPatterns: rules.patterns });
if (violations.length > 0) {
  for (const violation of violations) {
    process.stderr.write(`PUBLIC_PLATFORM_DOMAIN_LEAK:${violation.path}:${violation.pattern}\n`);
  }
  process.exitCode = 1;
} else {
  process.stdout.write('公共平台边界检查通过：未发现项目域硬编码。\n');
}
