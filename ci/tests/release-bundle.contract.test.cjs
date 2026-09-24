const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createBundle, validateBundle, bundleFingerprint } = require('../release-bundle.cjs');

const manifest = {
  projectId: 'merchant-center',
  repositories: {
    pcs: { role: 'orchestrator', branch: 'main', revision: 'a'.repeat(40) },
    mc: { role: 'business-source', branch: 'main', revision: 'b'.repeat(40) },
    tap: { role: 'public-runtime', branch: 'main', revision: 'c'.repeat(40) },
  },
};

test('creates an immutable three-repository bundle with a stable fingerprint', () => {
  const bundle = createBundle({ manifest, createdAt: '2026-09-24T00:00:00.000Z' });
  assert.equal(validateBundle(bundle).length, 0);
  assert.equal(bundle.bundleId, bundleFingerprint(bundle));
  assert.equal(bundle.policy.freeShaParameters, false);
  assert.deepEqual(bundle.contract.adapterContracts, { tap: '1.0.0', merchantCenter: '1.0.0' });
  assert.deepEqual(bundle.contract.phases, ['preflight', 'contract', 'pilot', 'full-regression']);
});

test('rejects revision drift and mutable bundle metadata', () => {
  const bundle = createBundle({ manifest, createdAt: '2026-09-24T00:00:00.000Z' });
  assert.ok(validateBundle({ ...bundle, bundleId: '0'.repeat(64) }).includes('bundle-id-mismatch'));
  assert.ok(validateBundle({ ...bundle, repositories: { ...bundle.repositories, mc: { ...bundle.repositories.mc, revision: 'd'.repeat(40) } } }).includes('bundle-id-mismatch'));
  assert.ok(validateBundle({ ...bundle, policy: { ...bundle.policy, freeShaParameters: true } }).includes('bundle-policy-invalid'));
});

test('rejects any repository that is not sourced from remote main', () => {
  const bundle = createBundle({ manifest, createdAt: '2026-09-24T00:00:00.000Z' });
  assert.ok(validateBundle({ ...bundle, repositories: { ...bundle.repositories, pcs: { ...bundle.repositories.pcs, branch: 'master' } } }).includes('bundle-pcs-branch-must-be-main'));
  assert.ok(validateBundle({ ...bundle, repositories: { ...bundle.repositories, tap: { ...bundle.repositories.tap, sourceRef: 'refs/heads/codex/test' } } }).includes('bundle-tap-source-ref-must-be-main'));
});
