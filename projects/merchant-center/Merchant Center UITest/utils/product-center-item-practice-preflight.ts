import fs from 'node:fs';
import path from 'node:path';
import type {
  ProductCenterItemExternalCapability,
  ProductCenterItemPracticeContract,
} from './product-center-item-practice-contract';

export type ProductCenterItemPreflightCategory =
  | 'automation-gap'
  | 'environment-failure'
  | 'external-dependency';

export type ProductCenterItemPreflightIssue = {
  code: string;
  category: ProductCenterItemPreflightCategory;
  caseIds: string[];
  detail: string;
};

export type ProductCenterItemStaticPreflight = {
  schemaVersion: '1.0.0';
  collectionId: 'product-center-item-practice-static-preflight';
  generatedAt: string;
  contractFingerprint: string;
  status: 'passed' | 'blocked';
  credentials: {
    usernameConfigured: boolean;
    passwordConfigured: boolean;
    merchantConfigured: boolean;
    brandIdConfigured: boolean;
  };
  checkedOperationKeys: string[];
  checkedExternalCapabilities: ProductCenterItemExternalCapability[];
  issues: ProductCenterItemPreflightIssue[];
};

type OperationRecord = { operationKey?: string };

export function evaluateProductCenterItemStaticPreflight(input: {
  contract: ProductCenterItemPracticeContract;
  rootDir: string;
  credentials: { username: string; password: string; merchant: string; brandId: string };
  env?: NodeJS.ProcessEnv;
  operationCatalogPath?: string;
}): ProductCenterItemStaticPreflight {
  const issues: ProductCenterItemPreflightIssue[] = [];
  const operationKeys = unique(input.contract.cases.flatMap((item) => item.requiredOperationKeys));
  const operationsPath = input.operationCatalogPath
    ? path.resolve(input.operationCatalogPath)
    : path.resolve(input.rootDir, '..', 'contracts', 'api', 'operations', 'all.operations.json');
  let catalog = new Set<string>();
  try {
    const operations = JSON.parse(fs.readFileSync(operationsPath, 'utf8')) as OperationRecord[];
    catalog = new Set(operations.flatMap((item) => item.operationKey ? [item.operationKey] : []));
  } catch {
    issues.push({
      code: 'OPERATION_CATALOG_UNAVAILABLE',
      category: 'automation-gap',
      caseIds: input.contract.cases.map((item) => item.caseId),
      detail: path.relative(input.rootDir, operationsPath).replaceAll(path.sep, '/'),
    });
  }
  for (const operationKey of operationKeys) {
    if (catalog.has(operationKey)) continue;
    issues.push({
      code: 'OPERATION_KEY_MISSING',
      category: 'automation-gap',
      caseIds: input.contract.cases.filter((item) => item.requiredOperationKeys.includes(operationKey)).map((item) => item.caseId),
      detail: operationKey,
    });
  }

  const credentials = {
    usernameConfigured: Boolean(input.credentials.username),
    passwordConfigured: Boolean(input.credentials.password),
    merchantConfigured: Boolean(input.credentials.merchant),
    brandIdConfigured: Boolean(input.credentials.brandId),
  };
  if (Object.values(credentials).some((configured) => !configured)) {
    issues.push({
      code: 'AUTH_CONTEXT_INCOMPLETE',
      category: 'environment-failure',
      caseIds: input.contract.cases.map((item) => item.caseId),
      detail: Object.entries(credentials).filter(([, configured]) => !configured).map(([key]) => key).join(','),
    });
  }

  const capabilities = unique(input.contract.cases.flatMap((item) => item.externalCapabilities));
  for (const capability of capabilities) {
    if (hasFreshCapabilityEvidence(capability, input.env ?? process.env)) continue;
    issues.push({
      code: 'EXTERNAL_CAPABILITY_MISSING',
      category: 'external-dependency',
      caseIds: input.contract.cases.filter((item) => item.externalCapabilities.includes(capability)).map((item) => item.caseId),
      detail: capability,
    });
  }

  return {
    schemaVersion: '1.0.0',
    collectionId: 'product-center-item-practice-static-preflight',
    generatedAt: new Date().toISOString(),
    contractFingerprint: input.contract.fingerprint,
    status: issues.length === 0 ? 'passed' : 'blocked',
    credentials,
    checkedOperationKeys: operationKeys,
    checkedExternalCapabilities: capabilities,
    issues,
  };
}

function hasFreshCapabilityEvidence(
  capability: ProductCenterItemExternalCapability,
  env: NodeJS.ProcessEnv,
): boolean {
  const variable = capability === 'terminal-sync'
    ? 'PC_TERMINAL_SYNC_CAPABILITY_EVIDENCE'
    : 'PC_INDUSTRY_PRODUCT_FIXTURE_EVIDENCE';
  const configuredPath = env[variable];
  if (!configuredPath || !fs.existsSync(configuredPath)) return false;
  const ageMs = Date.now() - fs.statSync(configuredPath).mtimeMs;
  return ageMs >= 0 && ageMs <= 24 * 60 * 60 * 1_000;
}

function unique<T extends string>(values: readonly T[]): T[] {
  return [...new Set(values)].sort();
}
