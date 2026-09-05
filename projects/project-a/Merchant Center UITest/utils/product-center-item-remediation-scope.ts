import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

type ScopeDocument = {
  scopeId: string;
  fingerprint: string;
  cases: Array<{ caseId: string; module: string }>;
};

type AuthoritativeAutomationDocument = {
  collectionId: string;
  releaseFingerprint: string;
  executableFingerprint: string;
  bindings: Array<{
    caseId: string;
    scriptPath: string;
    runtimeReadiness: string;
    runtimeStatus: string;
    blockingReasons: string[];
  }>;
};

type AdditionalAutomationDocument = {
  collectionId: string;
  bindings: Array<{
    caseId: string;
    module: string;
    scriptPath: string;
    runtimeReadiness: string;
    status: string;
  }>;
};

export function buildProductCenterItemRemediationScope(projectRoot: string) {
  const scopePath = path.join(projectRoot, 'deliverables/system-test-platform/product-center-remediation-scope.json');
  const authoritativeBindingsPath = path.join(
    projectRoot,
    'contracts/product-center/test-cases/canonical/product-center-item-authoritative-automation-bindings.json',
  );
  const generatedSpecPath = path.join(projectRoot, 'tests/generated/product-center-item-216.generated.spec.ts');
  const additionalBindingsPath = path.join(
    projectRoot,
    'contracts/product-center/test-plan-additional-automation-bindings.json',
  );
  const scope = readJson<ScopeDocument>(scopePath);
  const authoritative = readJson<AuthoritativeAutomationDocument>(authoritativeBindingsPath);
  const additional = readJson<AdditionalAutomationDocument>(additionalBindingsPath);
  if (authoritative.collectionId !== 'product-center-item-authoritative-automation-bindings') {
    throw new Error('ITEM_AUTHORITATIVE_BINDINGS_INVALID');
  }
  if (additional.collectionId !== 'product-center-test-plan-additional-automation-bindings') {
    throw new Error('ITEM_ADDITIONAL_BINDINGS_INVALID');
  }

  const generatedCaseIds = new Set(readGeneratedCaseIds(generatedSpecPath));
  const scopeCaseIds = scope.cases.filter((item) => item.module === 'item').map((item) => item.caseId);
  const scopeSet = new Set(scopeCaseIds);
  const readyCaseIds = [...new Set([
    ...authoritative.bindings.filter(isAuthoritativeRuntimeReady).map((item) => item.caseId),
    ...additional.bindings.filter(isAdditionalRuntimeReady).map((item) => item.caseId),
  ])];
  const readySet = new Set(readyCaseIds);
  const readyInScope = scopeCaseIds.filter((caseId) => readySet.has(caseId));
  const readyOutsideScope = readyCaseIds.filter((caseId) => !scopeSet.has(caseId));
  const scopeNotReady = scopeCaseIds.filter((caseId) => !readySet.has(caseId));
  const cases = scopeCaseIds.map((caseId) => ({
    caseId,
    authoritativeRuntimeReady: readySet.has(caseId),
    registeredInGeneratedSpec: generatedCaseIds.has(caseId),
    disposition: readySet.has(caseId) ? 'optimization-eligible' : 'static-blocked',
    staticIssueCode: readySet.has(caseId) ? null : 'ITEM_AUTHORITATIVE_RUNTIME_READY_REQUIRED',
  }));
  const sourceFingerprints = {
    remediationScope: scope.fingerprint,
    authoritativeRelease: authoritative.releaseFingerprint,
    authoritativeExecutable: authoritative.executableFingerprint,
    additionalBindings: sha256File(additionalBindingsPath),
    generatedSpec: sha256File(generatedSpecPath),
  };
  const semanticValue = {
    scopeId: scope.scopeId,
    authoritativeCollectionId: authoritative.collectionId,
    sourceFingerprints,
    summary: {
      scope: scopeCaseIds.length,
      authoritativeRuntimeReady: readyCaseIds.length,
      readyInScope: readyInScope.length,
      readyOutsideScope: readyOutsideScope.length,
      scopeNotReady: scopeNotReady.length,
      scopeMissingGeneratedRegistration: cases.filter((item) => !item.registeredInGeneratedSpec).length,
    },
    readyInScope,
    readyOutsideScope,
    scopeNotReady,
    cases,
  };
  return {
    schemaVersion: '1.0.0' as const,
    artifactId: 'product-center-item-remediation-scope',
    generatedAt: new Date().toISOString(),
    ...semanticValue,
    fingerprint: sha256(JSON.stringify(semanticValue)),
  };
}

function isAdditionalRuntimeReady(item: AdditionalAutomationDocument['bindings'][number]): boolean {
  return (item.module === 'brand-item' || item.module === 'item')
    && item.runtimeReadiness === 'ready'
    && item.status === 'landed'
    && item.scriptPath === 'tests/generated/product-center-item-216.generated.spec.ts';
}

function isAuthoritativeRuntimeReady(item: AuthoritativeAutomationDocument['bindings'][number]): boolean {
  return item.runtimeReadiness === 'ready'
    && item.runtimeStatus === 'runtime-passed'
    && item.blockingReasons.length === 0
    && item.scriptPath === 'tests/generated/product-center-item-216.generated.spec.ts';
}

function readGeneratedCaseIds(filePath: string): string[] {
  const source = fs.readFileSync(filePath, 'utf8');
  const start = source.indexOf('const allCases = ');
  const endMarker = ' as readonly GeneratedCase[];';
  const end = source.indexOf(endMarker, start);
  if (start < 0 || end < 0) throw new Error(`ITEM_GENERATED_REGISTRATION_INVALID:${filePath}`);
  const cases = JSON.parse(source.slice(start + 'const allCases = '.length, end)) as Array<{ caseId: string }>;
  return cases.map((item) => item.caseId);
}

function readJson<T>(filePath: string): T {
  return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T;
}

function sha256File(filePath: string): string {
  return sha256(fs.readFileSync(filePath));
}

function sha256(value: string | Buffer): string {
  return createHash('sha256').update(value).digest('hex');
}
