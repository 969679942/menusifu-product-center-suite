const fs = require('node:fs');
const path = require('node:path');

function fail(message) {
  console.error(`SUITE_CONFIG_INVALID: ${message}`);
  process.exitCode = 1;
}

const root = path.resolve(__dirname, '..');
const file = path.join(root, 'suite.json');
let suite;
try {
  suite = JSON.parse(fs.readFileSync(file, 'utf8'));
} catch (error) {
  fail(`cannot read suite.json: ${error.message}`);
  process.exit(1);
}

const projects = Array.isArray(suite.projects) ? suite.projects : [];
const ids = projects.map((item) => item && item.id).filter(Boolean);
const apps = projects.map((item) => item && item.applicationId).filter(Boolean);
if (suite.suiteId !== 'product-center-suite') fail('suiteId must be product-center-suite');
if (projects.length === 0) fail('at least one project is required');
if (new Set(ids).size !== ids.length) fail('project ids must be unique');
if (new Set(apps).size !== apps.length) fail('application ids must be unique');
if (projects.some((item) => /project-[ab]/i.test(String(item.root)))) fail('legacy project path remains in active projects');

for (const project of projects) {
  for (const field of ['root', 'testRoot', 'adapterRoot', 'artifactRoot']) {
    if (!project[field]) continue;
    const value = String(project[field]);
    if (path.isAbsolute(value) || value.split(/[\\/]/).includes('..')) fail(`${project.id || 'project'} ${field} must be relative`);
  }
}

const tapRoot = suite.platform && suite.platform.root;
if (tapRoot !== 'tap') fail('platform.root must identify the single tap source');
if (!fs.existsSync(path.join(root, tapRoot, 'package.json'))) fail('tap/package.json is missing');
if (fs.existsSync(path.join(root, 'projects', 'project-b'))) fail('legacy project-b must be archived outside projects');
for (const project of projects) {
  const projectRoot = path.join(root, project.root);
  if (!fs.existsSync(projectRoot)) fail(`${project.id} root is missing: ${project.root}`);
}

if (!process.exitCode) console.log(JSON.stringify({ valid: true, suiteId: suite.suiteId, projects: ids, tapRoot }));
