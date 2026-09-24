const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');

test('full regression has an explicit same-bundle pilot authorization gate', () => {
  const pipeline = fs.readFileSync(path.join(root, 'pipeline.groovy'), 'utf8');
  const verifier = fs.readFileSync(path.join(root, 'verify-pilot-authorization.cjs'), 'utf8');
  assert.match(pipeline, /Technical Pilot authorization/);
  assert.match(pipeline, /RUN_SCOPE=pilot/);
  assert.match(pipeline, /verify-pilot-authorization\.cjs/);
  assert.match(verifier, /PILOT_AUTHORIZATION_BUNDLE_IDENTITY_MISMATCH/);
  assert.match(verifier, /receiptAudit\?\.status !== 'complete'/);
});
