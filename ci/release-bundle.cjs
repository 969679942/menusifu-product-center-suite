const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const BUNDLE_SCHEMA_VERSION = 1;
const PUBLIC_CONTRACT_VERSION = '1.0.0';
const RUNNER_CONTRACT_VERSION = '1.0.0';
const ADAPTER_CONTRACT_VERSIONS = { tap: '1.0.0', merchantCenter: '1.0.0' };
const PHASES = ['preflight', 'contract', 'pilot', 'full-regression'];
const REQUIRED_BRANCH = 'main';
const REQUIRED_SOURCE_REF = 'refs/heads/main';
const SHA_PATTERN = /^[0-9a-f]{40}$/i;

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function bundleFingerprint(bundle) {
  const payload = { ...bundle };
  delete payload.bundleId;
  return crypto.createHash('sha256').update(canonical(payload)).digest('hex');
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(path.resolve(filePath), 'utf8').replace(/^\uFEFF/, ''));
}

function repositoryFromManifest(manifest, key, revision, checkout) {
  const source = manifest.repositories?.[key] || {};
  return {
    role: source.role,
    repository: source.repository || null,
    branch: source.branch,
    sourceRef: source.sourceRef || REQUIRED_SOURCE_REF,
    sourceKind: source.sourceKind || 'remote-main',
    revision: String(revision || source.revision || '').toLowerCase(),
    checkout: checkout || source.checkout,
  };
}

function createBundle({ manifest, pcsRevision, mcRevision, tapRevision, createdAt = new Date().toISOString() }) {
  const bundle = {
    schemaVersion: BUNDLE_SCHEMA_VERSION,
    projectId: manifest.projectId,
    createdAt,
    repositories: {
      pcs: repositoryFromManifest(manifest, 'pcs', pcsRevision, 'suite-src'),
      mc: repositoryFromManifest(manifest, 'mc', mcRevision, 'suite-src/projects/merchant-center'),
      tap: repositoryFromManifest(manifest, 'tap', tapRevision, 'suite-src/tap'),
    },
    contract: {
      publicContractVersion: PUBLIC_CONTRACT_VERSION,
      runnerContractVersion: RUNNER_CONTRACT_VERSION,
      adapterContracts: { ...ADAPTER_CONTRACT_VERSIONS },
      phases: [...PHASES],
      exactRevisionRequired: true,
    },
    policy: {
      exactRevisionRequired: true,
      freeShaParameters: false,
      immutable: true,
    },
  };
  const errors = validateBundle(bundle, { allowMissingFingerprint: true });
  if (errors.length) throw new Error(`BUNDLE_INVALID:${errors.join(',')}`);
  return { ...bundle, bundleId: bundleFingerprint(bundle) };
}

function resolveRemoteMainRevision(repository) {
  if (!repository) throw new Error('BUNDLE_REMOTE_REPOSITORY_REQUIRED');
  const output = execFileSync('git', ['ls-remote', repository, REQUIRED_SOURCE_REF], {
    encoding: 'utf8',
    timeout: 120000,
    env: { ...process.env, GIT_TERMINAL_PROMPT: '0', GCM_INTERACTIVE: 'Never' },
  }).trim();
  const revision = output.split(/\s+/)[0]?.toLowerCase();
  if (!SHA_PATTERN.test(revision || '')) throw new Error(`BUNDLE_REMOTE_MAIN_UNAVAILABLE:${repository}`);
  return revision;
}

function validateBundle(bundle, options = {}) {
  const errors = [];
  if (!bundle || typeof bundle !== 'object') return ['bundle-object-required'];
  if (bundle.schemaVersion !== BUNDLE_SCHEMA_VERSION) errors.push('bundle-schema-version-invalid');
  if (bundle.projectId !== 'merchant-center') errors.push('bundle-project-invalid');
  if (!bundle.createdAt || Number.isNaN(Date.parse(bundle.createdAt))) errors.push('bundle-createdAt-invalid');
  if (bundle.contract?.publicContractVersion !== PUBLIC_CONTRACT_VERSION) errors.push('bundle-public-contract-version-invalid');
  if (bundle.contract?.runnerContractVersion !== RUNNER_CONTRACT_VERSION) errors.push('bundle-runner-contract-version-invalid');
  if (bundle.contract?.adapterContracts?.tap !== ADAPTER_CONTRACT_VERSIONS.tap) errors.push('bundle-tap-adapter-contract-version-invalid');
  if (bundle.contract?.adapterContracts?.merchantCenter !== ADAPTER_CONTRACT_VERSIONS.merchantCenter) errors.push('bundle-merchant-center-adapter-contract-version-invalid');
  if (JSON.stringify(bundle.contract?.phases) !== JSON.stringify(PHASES)) errors.push('bundle-phases-invalid');
  if (bundle.contract?.exactRevisionRequired !== true) errors.push('bundle-contract-not-exact');
  if (bundle.policy?.exactRevisionRequired !== true || bundle.policy?.freeShaParameters !== false || bundle.policy?.immutable !== true) {
    errors.push('bundle-policy-invalid');
  }
  const repositories = bundle.repositories || {};
  const checkoutPaths = new Set();
  for (const key of ['pcs', 'mc', 'tap']) {
    const repository = repositories[key];
    if (!repository || !SHA_PATTERN.test(String(repository.revision || ''))) {
      errors.push(`bundle-${key}-revision-invalid`);
      continue;
    }
    if (repository.branch !== REQUIRED_BRANCH) errors.push(`bundle-${key}-branch-must-be-main`);
    if (repository.sourceRef !== REQUIRED_SOURCE_REF) errors.push(`bundle-${key}-source-ref-must-be-main`);
    if (repository.sourceKind !== 'remote-main') errors.push(`bundle-${key}-source-kind-invalid`);
    if (!repository.checkout || path.isAbsolute(repository.checkout) || repository.checkout.split(/[\\/]/).includes('..')) {
      errors.push(`bundle-${key}-checkout-invalid`);
    }
    if (checkoutPaths.has(repository.checkout)) errors.push('bundle-checkout-path-duplicate');
    checkoutPaths.add(repository.checkout);
  }
  if (!options.allowMissingFingerprint) {
    if (!/^[0-9a-f]{64}$/.test(String(bundle.bundleId || ''))) errors.push('bundle-id-invalid');
    else if (bundle.bundleId !== bundleFingerprint(bundle)) errors.push('bundle-id-mismatch');
  }
  return [...new Set(errors)];
}

function currentSha(root) {
  return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: path.resolve(root), encoding: 'utf8' }).trim().toLowerCase();
}

function validateRoots(bundle, roots) {
  const errors = [];
  for (const key of ['pcs', 'mc', 'tap']) {
    if (!roots[key]) continue;
    let actual;
    try { actual = currentSha(roots[key]); } catch { errors.push(`bundle-${key}-checkout-unreadable`); continue; }
    if (actual !== bundle.repositories[key].revision) errors.push(`bundle-${key}-checkout-mismatch`);
  }
  return errors;
}

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (!value.startsWith('--')) continue;
    args[value.slice(2)] = argv[index + 1];
    index += 1;
  }
  return args;
}

function main(argv) {
  const [command, ...rest] = argv;
  const args = parseArgs(rest);
  if (command === 'create') {
    const manifest = readJson(args.manifest || path.join(__dirname, 'dependency-manifest.json'));
    if (args['pcs-sha'] || args['mc-sha'] || args['tap-sha']) throw new Error('FREE_SHA_PARAMETERS_FORBIDDEN');
    const repositories = manifest.repositories || {};
    const bundle = createBundle({
      manifest,
      pcsRevision: resolveRemoteMainRevision(repositories.pcs?.repository),
      mcRevision: resolveRemoteMainRevision(repositories.mc?.repository),
      tapRevision: resolveRemoteMainRevision(repositories.tap?.repository),
    });
    if (args.output) fs.writeFileSync(path.resolve(args.output), `${JSON.stringify(bundle, null, 2)}\n`);
    process.stdout.write(`${JSON.stringify(bundle)}\n`);
    return;
  }
  if (command === 'validate') {
    const bundle = readJson(args.file);
    const errors = [...validateBundle(bundle), ...validateRoots(bundle, { pcs: args['pcs-root'], mc: args['mc-root'], tap: args['tap-root'] })];
    if (errors.length) throw new Error(`BUNDLE_INVALID:${[...new Set(errors)].join(',')}`);
    process.stdout.write(`${JSON.stringify({ valid: true, bundleId: bundle.bundleId })}\n`);
    return;
  }
  throw new Error('Usage: release-bundle.cjs create|validate');
}

if (require.main === module) {
  try { main(process.argv.slice(2)); } catch (error) { process.stderr.write(`${error.message}\n`); process.exitCode = 2; }
}

module.exports = { BUNDLE_SCHEMA_VERSION, PUBLIC_CONTRACT_VERSION, PHASES, REQUIRED_BRANCH, REQUIRED_SOURCE_REF, bundleFingerprint, createBundle, resolveRemoteMainRevision, validateBundle, validateRoots };
