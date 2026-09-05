import fs from 'node:fs';
import path from 'node:path';

const textExtensions = new Set(['.json', '.jsonl', '.log', '.md', '.txt', '.xml', '.csv']);
const sensitivePatterns = [
  /["']?(authorization|password|cookie|set-cookie|token|access[_-]?token|refresh[_-]?token)["']?\s*[:=]\s*["']?(?!<redacted>|\*{3})[^"',;\s}]{4,}/i,
  /bearer\s+(?!<redacted>)[a-z0-9._-]{8,}/i,
  /eyJ[a-z0-9_-]{10,}\.[a-z0-9_-]{10,}\.[a-z0-9_-]{10,}/i,
];

export type SystemTestArtifactFinding = { file: string };

export function scanSystemTestArtifacts(rootDir: string): SystemTestArtifactFinding[] {
  const absoluteRoot = path.resolve(rootDir);
  if (!fs.existsSync(absoluteRoot)) return [];
  const findings: SystemTestArtifactFinding[] = [];
  for (const filePath of walkFiles(absoluteRoot)) {
    if (!textExtensions.has(path.extname(filePath).toLowerCase())) continue;
    const content = fs.readFileSync(filePath, 'utf8');
    if (sensitivePatterns.some((pattern) => pattern.test(content))) {
      findings.push({ file: path.relative(process.cwd(), filePath) });
    }
  }
  return findings;
}

function* walkFiles(rootDir: string): Generator<string> {
  for (const entry of fs.readdirSync(rootDir, { withFileTypes: true })) {
    const filePath = path.join(rootDir, entry.name);
    if (entry.isDirectory()) yield* walkFiles(filePath);
    else yield filePath;
  }
}
