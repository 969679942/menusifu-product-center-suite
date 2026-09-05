import fs from 'node:fs';
import path from 'node:path';
import { fingerprintSystemTestImplementationSource, fingerprintSystemTestValue } from '../../../Test Automation Platform/src/automation/system-test/system-test-contract';

const projectRoot = path.resolve(__dirname, '..');
const adaptersPath = path.join(projectRoot, 'systems/merchant-center-product-center-seasoning/adapters.json');
const manifestPath = path.join(projectRoot, 'systems/merchant-center-product-center-seasoning/manifest.json');
const adapters = JSON.parse(fs.readFileSync(adaptersPath, 'utf8')) as { adapters: Array<{ implementation: { path: string; sourceSection?: string; sha256: string; dependencies?: Array<{ path: string; sourceSection?: string; sha256: string }> } }> };
for (const adapter of adapters.adapters) {
  adapter.implementation.sha256 = fingerprintSystemTestImplementationSource(projectRoot, adapter.implementation);
  for (const dependency of adapter.implementation.dependencies ?? []) {
    dependency.sha256 = fingerprintSystemTestImplementationSource(projectRoot, dependency);
  }
}
fs.writeFileSync(adaptersPath, `${JSON.stringify(adapters, null, 2)}\n`, 'utf8');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as { sources: { adapterCatalogFingerprint: string } };
manifest.sources.adapterCatalogFingerprint = fingerprintSystemTestValue(adapters);
fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
process.stdout.write(JSON.stringify({ adapters: adapters.adapters.length, adapterCatalogFingerprint: manifest.sources.adapterCatalogFingerprint }) + '\n');
