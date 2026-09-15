import fs from 'node:fs';
import path from 'node:path';
import { publishImmutableArtifact } from '../utils/immutable-artifact';
import { fingerprintExecutionContext } from '../../Test Automation Platform/src/utils/test-execution-state';
import { fingerprintProductCenterItemImplementation } from '../adapters/product-center/product-center-item-implementation';

const root = process.cwd();
const manifestPath = 'contracts/product-center/test-cases/canonical/product-center-item-current-receipt-contract.json';
const applicationVersionFingerprint = '2eefe1ec99a8da9518802fca8b1015b9f1750c4ae3caaed4b9b9a428d4db7a7c';
const context = {
  applicationVersionFingerprint,
  environmentId: 'balamxqa',
  tenantScope: '000407',
  locale: 'und',
  roleId: 'merchant-operator',
  route: '/pp/brand/create/side',
};
const definitions = [
  {
    caseId: 'TC-ITEM-ADD-017',
    semanticCaseFingerprint: '535a3aebc6d49f38f683735d00226c223a2e9bb37bf4a0c0a5e527da2797b8e6',
    requiredAssertionIds: ['TC-ITEM-ADD-017:expectation-1', 'TC-ITEM-ADD-017:expectation-2'],
    operations: [
      ['TC-ITEM-ADD-017:action-1', 'ItemCreateSidePage.uploadDetailImages'],
      ['TC-ITEM-ADD-017:action-2', 'ItemCreateSidePage.clickSave'],
    ],
  },
  {
    caseId: 'TC-ITEM-ADD-018',
    semanticCaseFingerprint: 'a5ecf5de65d3f1585fd938f36083dd239ddcd0d39c8060bf7b594fc88d013097',
    requiredAssertionIds: ['TC-ITEM-ADD-018:expectation-1', 'TC-ITEM-ADD-018:expectation-2'],
    operations: [
      ['TC-ITEM-ADD-018:action-1', 'ItemCreateSidePage.selectDescriptionTagsByName'],
      ['TC-ITEM-ADD-018:action-2', 'ItemCreateSidePage.clickSave'],
    ],
  },
  {
    caseId: 'TC-ITEM-ADD-019',
    semanticCaseFingerprint: '2457c6f9dafb47033fcd5dc96d3d995c9cdad5bfee62e979cb18af1a8fa6699',
    requiredAssertionIds: ['TC-ITEM-ADD-019:expectation-1', 'TC-ITEM-ADD-019:expectation-2'],
    operations: [
      ['TC-ITEM-ADD-019:action-1', 'ItemCreateSidePage.selectCornerMarkByName'],
      ['TC-ITEM-ADD-019:action-2', 'ItemCreateSidePage.clickSave'],
    ],
  },
] as const;

const manifest = JSON.parse(fs.readFileSync(path.resolve(root, manifestPath), 'utf8').replace(/^\uFEFF/, '')) as any;
const existingById = new Map(manifest.cases.map((entry: any) => [entry.caseId, entry]));
for (const definition of definitions) {
  const existing = existingById.get(definition.caseId);
  if (existing) throw new Error(`ADDON_CONTRACT_ALREADY_EXISTS:${definition.caseId}`);
  const sourceStepIds = definition.operations.map(([sourceStepId]) => sourceStepId);
  const entry = {
    caseId: definition.caseId,
    caseFingerprint: 'fa126b1f6dd0304ce090f706dda4f8d87816fb6144bd36910696ab443c0a606b',
    semanticCaseFingerprint: definition.semanticCaseFingerprint,
    implementationFingerprint: fingerprintProductCenterItemImplementation(root, definition.caseId),
    executionContextFingerprint: fingerprintExecutionContext(context),
    requiredOperationKeys: sourceStepIds,
    requiredAssertionIds: [...definition.requiredAssertionIds],
    cleanupRequired: true,
    operationMapping: {
      schemaVersion: '1.0.0',
      sourceStepIds,
      business: definition.operations.map(([sourceStepId, executableOperationKey]) => ({
        operationKey: sourceStepId,
        sourceStepId,
        executableOperationKey,
        occurrence: 1,
      })),
      supporting: [],
    },
  };
  manifest.cases.push(entry);
}
publishImmutableArtifact({
  outputRoot: root,
  relativePath: manifestPath,
  content: `${JSON.stringify(manifest, null, 2)}\n`,
  reason: 'register-addon-017-019-current-receipt-contract-before-targeted-execution',
});
console.log(JSON.stringify({ registered: definitions.map(({ caseId }) => caseId), executionContextFingerprint: fingerprintExecutionContext(context) }, null, 2));
