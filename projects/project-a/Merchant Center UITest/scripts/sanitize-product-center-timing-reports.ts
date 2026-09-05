import fs from 'node:fs';
import path from 'node:path';
import { sanitizeStepTitle } from '../reporters/product-center-timing.reporter';

export function sanitizeProductCenterTimingReports(directory: string): number {
  return sanitizeJsonReports(directory, false);
}

export function sanitizeGeneratedTestReports(
  directory: string,
  options: { modifiedAfterMs?: number } = {},
): number {
  return sanitizeJsonReports(directory, true, options);
}

function sanitizeJsonReports(
  directory: string,
  recursive: boolean,
  options: { modifiedAfterMs?: number } = {},
): number {
  if (!fs.existsSync(directory)) return 0;
  let changedFiles = 0;
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory() && recursive) {
      changedFiles += sanitizeJsonReports(path.join(directory, entry.name), true, options);
      continue;
    }
    if (!entry.isFile() || path.extname(entry.name).toLowerCase() !== '.json') continue;
    const filePath = path.join(directory, entry.name);
    if (
      options.modifiedAfterMs !== undefined
      && fs.statSync(filePath).mtimeMs < options.modifiedAfterMs
    ) continue;
    const document = JSON.parse(fs.readFileSync(filePath, 'utf8')) as unknown;
    const changed = sanitizeValue(document);
    if (changed === 0) continue;
    fs.writeFileSync(filePath, `${JSON.stringify(document, null, 2)}\n`, 'utf8');
    changedFiles += 1;
  }
  return changedFiles;
}

function sanitizeValue(value: unknown): number {
  let changed = 0;
  if (Array.isArray(value)) {
    for (const [index, item] of value.entries()) {
      if (typeof item === 'string') {
        const sanitized = sanitizeSensitiveString(sanitizeStepTitle(item));
        if (sanitized !== item) {
          value[index] = sanitized;
          changed += 1;
        }
      } else {
        changed += sanitizeValue(item);
      }
    }
    return changed;
  }
  if (!isRecord(value)) return 0;
  for (const [key, item] of Object.entries(value)) {
    if (isSensitiveKey(key) && item !== '<redacted>') {
      value[key] = '<redacted>';
      changed += 1;
      continue;
    }
    if (typeof item === 'string') {
      const sanitized = sanitizeSensitiveString(sanitizeStepTitle(item));
      if (sanitized !== item) {
        value[key] = sanitized;
        changed += 1;
      }
    } else {
      changed += sanitizeValue(item);
    }
  }
  return changed;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isSensitiveKey(key: string): boolean {
  return /^(?:authorization|password|cookie|set-cookie|token|access[_-]?token|refresh[_-]?token)$/i.test(key);
}

function sanitizeSensitiveString(value: string): string {
  return value
    .replace(/bearer\s+(?!<redacted>)[a-z0-9._-]{8,}/gi, 'Bearer <redacted>')
    .replace(/eyJ[a-z0-9_-]{10,}\.[a-z0-9_-]{10,}\.[a-z0-9_-]{10,}/gi, '<redacted-jwt>');
}

function main(): void {
  const directories = process.argv.slice(2);
  const targets = directories.length > 0
    ? directories.map((directory) => path.resolve(directory))
    : ['output/performance', 'allure-results', 'test-results'].map((directory) => path.resolve(directory));
  const changedFiles = targets.reduce(
    (count, directory) => count + sanitizeGeneratedTestReports(directory),
    0,
  );
  process.stdout.write(`已净化生成测试报告：${changedFiles} 个文件\n`);
}

if (require.main === module) main();
