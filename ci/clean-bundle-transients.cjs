const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(process.argv[process.argv.indexOf('--root') + 1] || path.join(__dirname, '..'));
const mode = process.argv.includes('--clean') ? 'clean' : 'check';
const forbidden = [
  'projects/project-a/.memory',
  'projects/project-a/MEMORY.md',
  'projects/project-a/Merchant Center UITest/allure-report',
  'projects/project-a/Merchant Center UITest/output',
  'projects/project-a/contracts',
  'projects/project-b',
];
const present = forbidden.filter((item) => fs.existsSync(path.join(root, item)));
if (mode === 'clean') {
  for (const item of present) fs.rmSync(path.join(root, item), { recursive: true, force: true });
  process.stdout.write(JSON.stringify({ mode, removed: present }) + '\n');
} else {
  if (present.length) throw new Error(`BUNDLE_TRANSIENTS_PRESENT:${present.join(',')}`);
  process.stdout.write(JSON.stringify({ mode, removed: [] }) + '\n');
}
