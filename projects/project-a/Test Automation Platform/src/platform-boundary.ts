import fs from 'node:fs';
import path from 'node:path';

export type PlatformBoundaryViolation = {
  path: string;
  pattern: string;
};

const DEFAULT_FORBIDDEN_PATTERNS: readonly string[] = [];

export function readPlatformForbiddenPatterns(rootDir: string): { patterns: string[]; configured: boolean } {
  const ownershipPath = path.join(path.resolve(rootDir), 'ownership.json');
  if (!fs.existsSync(ownershipPath)) return { patterns: [...DEFAULT_FORBIDDEN_PATTERNS], configured: false };
  try {
    const ownership = JSON.parse(fs.readFileSync(ownershipPath, 'utf8')) as { publicCore?: { forbiddenDomainTerms?: unknown } };
    const values = ownership.publicCore?.forbiddenDomainTerms;
    if (!Array.isArray(values)) return { patterns: [...DEFAULT_FORBIDDEN_PATTERNS], configured: false };
    const patterns = values.filter((value): value is string => typeof value === 'string' && value.trim().length > 0);
    return { patterns, configured: patterns.length > 0 };
  } catch {
    return { patterns: [...DEFAULT_FORBIDDEN_PATTERNS], configured: false };
  }
}

export function inspectPlatformBoundary(input: {
  rootDir: string;
  sourceRoots?: readonly string[];
  forbiddenPatterns?: readonly string[];
}): PlatformBoundaryViolation[] {
  const rootDir = path.resolve(input.rootDir);
  const sourceRoots = input.sourceRoots ?? ['src'];
  const forbiddenPatterns = input.forbiddenPatterns ?? readPlatformForbiddenPatterns(rootDir).patterns;
  const violations: PlatformBoundaryViolation[] = [];
  for (const sourceRoot of sourceRoots) {
    const absoluteRoot = path.resolve(rootDir, sourceRoot);
    for (const filePath of walkTypeScriptFiles(absoluteRoot)) {
      const content = fs.readFileSync(filePath, 'utf8').toLowerCase();
      for (const pattern of forbiddenPatterns) {
        if (path.basename(filePath) === 'platform-boundary.ts') continue;
        if (content.includes(pattern.toLowerCase())) {
          violations.push({
            path: path.relative(rootDir, filePath).replaceAll(path.sep, '/'),
            pattern,
          });
        }
      }
    }
  }
  return violations.sort((left, right) => `${left.path}:${left.pattern}`.localeCompare(`${right.path}:${right.pattern}`));
}

function walkTypeScriptFiles(rootDir: string): string[] {
  if (!fs.existsSync(rootDir)) return [];
  return fs.readdirSync(rootDir, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(rootDir, entry.name);
    if (entry.isDirectory()) return walkTypeScriptFiles(entryPath);
    return entry.isFile() && /\.tsx?$/.test(entry.name) ? [entryPath] : [];
  });
}
