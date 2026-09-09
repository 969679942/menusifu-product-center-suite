import { createHash } from 'node:crypto';
import { stableStringify } from './product-center-test-contract';

export type ProductCenterAuditSafetyLevel =
  | 'L0-read-only'
  | 'L1-reversible'
  | 'L2-controlled-negative'
  | 'L3-crud';

export type ProductCenterAuditUnitDisposition = 'required' | 'blocked' | 'not-applicable';

export type ProductCenterAuditUnitInput = {
  route: string;
  stateId: string;
  actionId: string;
  overlayPath?: readonly string[];
  safetyLevel: ProductCenterAuditSafetyLevel;
  sourceIds: readonly string[];
  disposition?: ProductCenterAuditUnitDisposition;
  reason?: string;
  resourceKeys?: readonly string[];
  dependencyUnitIds?: readonly string[];
};

export type ProductCenterAuditUnit = {
  id: string;
  fingerprint: string;
  route: string;
  stateId: string;
  actionId: string;
  overlayPath: string[];
  overlayDepth: number;
  parentOverlayPath: string[];
  safetyLevel: ProductCenterAuditSafetyLevel;
  sourceIds: string[];
  disposition: ProductCenterAuditUnitDisposition;
  reason?: string;
  resourceKeys: string[];
  dependencyUnitIds: string[];
};

export type ProductCenterAuditUnitDenominator = {
  schemaVersion: '1.0.0';
  auditVersion: string;
  scopeKey: string;
  terminal: boolean;
  units: ProductCenterAuditUnit[];
};

export type ProductCenterAuditUnitObservation = {
  unitId: string;
  status: 'passed' | 'failed' | 'blocked' | 'not-applicable' | 'harness-error';
  evidenceIds: string[];
};

export function buildProductCenterAuditUnit(input: ProductCenterAuditUnitInput): ProductCenterAuditUnit {
  const route = normalizeRoute(input.route);
  const overlayPath = uniqueOrdered(input.overlayPath ?? []);
  const stableIdentity = {
    route,
    stateId: requiredToken(input.stateId, 'stateId'),
    actionId: requiredToken(input.actionId, 'actionId'),
    overlayPath,
  };
  const fingerprintInput = {
    ...stableIdentity,
    safetyLevel: input.safetyLevel,
    sourceIds: uniqueSorted(input.sourceIds),
    disposition: input.disposition ?? 'required',
    reason: input.reason ?? '',
    resourceKeys: uniqueSorted(input.resourceKeys ?? []),
    dependencyUnitIds: uniqueSorted(input.dependencyUnitIds ?? []),
  };
  return {
    id: `audit-unit:${fingerprint(stableIdentity).slice(0, 24)}`,
    fingerprint: fingerprint(fingerprintInput),
    ...stableIdentity,
    overlayDepth: overlayPath.length,
    parentOverlayPath: overlayPath.slice(0, -1),
    safetyLevel: input.safetyLevel,
    sourceIds: fingerprintInput.sourceIds,
    disposition: fingerprintInput.disposition,
    ...(input.reason ? { reason: input.reason } : {}),
    resourceKeys: fingerprintInput.resourceKeys,
    dependencyUnitIds: fingerprintInput.dependencyUnitIds,
  };
}

export function assertNonZeroProductCenterAuditUnitDenominator(
  denominator: ProductCenterAuditUnitDenominator,
): void {
  if (denominator.units.length === 0) {
    throw new Error(`审计单元分母为零：${denominator.scopeKey}@${denominator.auditVersion}`);
  }
}

export function mergeProductCenterAuditUnitDenominators(
  current: ProductCenterAuditUnitDenominator,
  incoming: ProductCenterAuditUnitDenominator,
): ProductCenterAuditUnitDenominator {
  if (current.auditVersion !== incoming.auditVersion || current.scopeKey !== incoming.scopeKey) {
    throw new Error('审计单元分母作用域或版本不一致');
  }
  if (current.terminal && !incoming.terminal) return cloneDenominator(current);
  if (incoming.terminal) return cloneDenominator({ ...incoming, units: sortedUnits(incoming.units) });
  const units = new Map(current.units.map((unit) => [unit.id, unit]));
  for (const unit of incoming.units) units.set(unit.id, unit);
  return cloneDenominator({ ...incoming, units: sortedUnits([...units.values()]) });
}

function cloneDenominator(value: ProductCenterAuditUnitDenominator): ProductCenterAuditUnitDenominator {
  return structuredClone({ ...value, units: sortedUnits(value.units) });
}

function sortedUnits(units: readonly ProductCenterAuditUnit[]): ProductCenterAuditUnit[] {
  return [...units].sort((left, right) => left.id.localeCompare(right.id));
}

function normalizeRoute(value: string): string {
  const route = value.trim();
  if (!route.startsWith('/')) throw new Error(`审计单元路由无效：${route || 'missing'}`);
  return route;
}

function requiredToken(value: string, field: string): string {
  const normalized = value.trim();
  if (!normalized) throw new Error(`审计单元缺少 ${field}`);
  return normalized;
}

function uniqueSorted(values: readonly string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))].sort();
}

function uniqueOrdered(values: readonly string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function fingerprint(value: unknown): string {
  return createHash('sha256').update(stableStringify(value)).digest('hex');
}

