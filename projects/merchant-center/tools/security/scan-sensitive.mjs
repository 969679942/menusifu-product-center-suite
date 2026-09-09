import fs from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(process.argv[2] || '.');
const ignored = new Set(['node_modules', '.git', '.secrets', 'allure-results', 'allure-report', 'test-results', 'playwright-report']);
const patterns = [
  ['password', /(?:password|密码)\s*[:=：]\s*["'](?!\{\{|process\.env)[^"']{4,}["']/gi],
  ['bearer-token', /bearer\s+[a-z0-9._~-]{20,}/gi],
  ['jwt', /eyJ[a-z0-9_-]{10,}\.[a-z0-9_-]{10,}\.[a-z0-9_-]{10,}/gi],
  ['api-key', /(?:x-api-key|api[_-]?key)\s*[:=]\s*["']?[a-z0-9._~-]{12,}/gi],
  ['cookie', /(?:cookie|set-cookie)\s*[:=]\s*[^\r\n]{20,}/gi],
];
const textExtensions = new Set(['.json','.md','.txt','.ts','.js','.mjs','.yml','.yaml','.env','.properties','.html']);
const findings = [];
async function walk(dir) {
  for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
    if (ignored.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) { await walk(full); continue; }
    if (!textExtensions.has(path.extname(entry.name)) && !entry.name.startsWith('.env')) continue;
    const text = await fs.readFile(full, 'utf8').catch(() => '');
    for (const [type, pattern] of patterns) {
      pattern.lastIndex = 0;
      if (pattern.test(text)) findings.push({ file: path.relative(root, full).replaceAll('\\','/'), type });
    }
  }
}
await walk(root);
console.log(JSON.stringify({ root, findingCount: findings.length, findings }, null, 2));
process.exitCode = findings.length ? 1 : 0;
