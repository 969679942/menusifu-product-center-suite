const fs = require('node:fs');
const path = require('node:path');

function resolveRoot(value, fallback) {
  return path.resolve(value || fallback);
}

function validateEntrypoints({ pcsRoot, mcRoot, tapRoot }) {
  const errors = [];
  const mcRuntimeValidator = path.join(mcRoot, 'Merchant Center UITest', 'scripts', 'validate-product-center-runtime-config.ts');
  const tapBundle = path.join(tapRoot, 'src', 'ci', 'result-bundle.cjs');
  const pcsPilot = path.join(pcsRoot, 'ci', 'run-pilot.ts');
  const pcsFinalizer = path.join(pcsRoot, 'ci', 'finalize-allure.cjs');

  if (!fs.existsSync(mcRuntimeValidator)) errors.push('mc-runtime-validator-missing');
  if (!fs.existsSync(tapBundle)) errors.push('tap-result-bundle-missing');
  if (!fs.existsSync(pcsPilot)) errors.push('pcs-pilot-runner-missing');
  if (!fs.existsSync(pcsFinalizer)) errors.push('pcs-finalizer-missing');

  if (fs.existsSync(tapBundle)) {
    let bundleExports;
    try { bundleExports = require(tapBundle); } catch (error) { errors.push(`tap-result-bundle-load-failed:${error.message}`); }
    for (const name of ['verifyAllureAttachments', 'writeBundleManifest', 'verifyReportSelection', 'writeTechnicalAllureDiagnostic', 'redactDiagnosticText']) {
      if (!bundleExports || typeof bundleExports[name] !== 'function') errors.push(`tap-export-missing:${name}`);
    }
  }

  if (fs.existsSync(pcsPilot)) {
    const source = fs.readFileSync(pcsPilot, 'utf8');
    if (!source.includes('validate-product-center-runtime-config.ts')) errors.push('pcs-pilot-runtime-validator-reference-missing');
  }
  if (fs.existsSync(pcsFinalizer)) {
    const source = fs.readFileSync(pcsFinalizer, 'utf8');
    if (!source.includes('redactDiagnosticText')) errors.push('pcs-finalizer-redactor-reference-missing');
  }
  return [...new Set(errors)];
}

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (!item.startsWith('--')) continue;
    args[item.slice(2)] = argv[index + 1] && !argv[index + 1].startsWith('--') ? argv[++index] : true;
  }
  return args;
}

if (require.main === module) {
  const args = parseArgs(process.argv.slice(2));
  const errors = validateEntrypoints({
    pcsRoot: resolveRoot(args['pcs-root'], path.resolve(__dirname, '..')),
    mcRoot: resolveRoot(args['mc-root'], path.resolve(__dirname, '../projects/merchant-center')),
    tapRoot: resolveRoot(args['tap-root'], path.resolve(__dirname, '../tap')),
  });
  if (errors.length) {
    process.stderr.write(`${JSON.stringify({ status: 'invalid', errors })}\n`);
    process.exitCode = 2;
  } else {
    process.stdout.write(JSON.stringify({ status: 'valid' }) + '\n');
  }
}

module.exports = { validateEntrypoints };
