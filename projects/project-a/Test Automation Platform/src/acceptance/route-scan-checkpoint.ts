import fs from 'node:fs';
import path from 'node:path';
import {
  fingerprintAcceptanceManifest,
  validateAcceptanceManifest,
  type AcceptanceProjectManifest,
  type AcceptanceRoute,
} from './acceptance-manifest';
import { redactAcceptanceDiagnostic } from './redaction';

export type RouteScanState = 'pending' | 'running' | 'passed' | 'failed';

export type RouteScanCheckpointEntry = AcceptanceRoute & {
  state: RouteScanState;
  attempts: number;
  uiMatches: number;
  apiMatches: number;
  diagnostic?: string;
  updatedAt: string;
};

export type RouteScanCheckpointSnapshot = {
  schemaVersion: '1.0.0';
  projectId: string;
  manifestFingerprint: string;
  updatedAt: string;
  routes: RouteScanCheckpointEntry[];
};

export class RouteScanCheckpoint {
  private state: RouteScanCheckpointSnapshot;

  constructor(private readonly filePath: string, manifest: AcceptanceProjectManifest) {
    const errors = validateAcceptanceManifest(manifest);
    if (errors.length > 0) throw new Error(`验收清单无效：${errors.join('；')}`);
    const fingerprint = fingerprintAcceptanceManifest(manifest);
    const persisted = readSnapshot(filePath);
    this.state = persisted?.projectId === manifest.projectId && persisted.manifestFingerprint === fingerprint
      ? persisted
      : createSnapshot(manifest, fingerprint);
    this.persist();
  }

  pendingRoutes(): AcceptanceRoute[] {
    return this.state.routes
      .filter((route) => route.state !== 'passed')
      .map(({ path: routePath, name }) => ({ path: routePath, name }));
  }

  markRunning(routePath: string): void {
    const route = this.requireRoute(routePath);
    route.state = 'running';
    route.attempts += 1;
    route.diagnostic = undefined;
    route.updatedAt = new Date().toISOString();
    this.persist();
  }

  markPassed(routePath: string, matches: { uiMatches: number; apiMatches: number }): void {
    const route = this.requireRoute(routePath);
    route.state = 'passed';
    route.uiMatches = matches.uiMatches;
    route.apiMatches = matches.apiMatches;
    route.diagnostic = undefined;
    route.updatedAt = new Date().toISOString();
    this.persist();
  }

  markFailed(
    routePath: string,
    diagnostic: string,
    matches: { uiMatches: number; apiMatches: number } = { uiMatches: 0, apiMatches: 0 },
  ): void {
    const route = this.requireRoute(routePath);
    route.state = 'failed';
    route.uiMatches = matches.uiMatches;
    route.apiMatches = matches.apiMatches;
    route.diagnostic = redactAcceptanceDiagnostic(diagnostic);
    route.updatedAt = new Date().toISOString();
    this.persist();
  }

  snapshot(): RouteScanCheckpointSnapshot {
    return structuredClone(this.state);
  }

  private requireRoute(routePath: string): RouteScanCheckpointEntry {
    const route = this.state.routes.find((candidate) => candidate.path === routePath);
    if (!route) throw new Error(`检查点路由不存在：${routePath}`);
    return route;
  }

  private persist(): void {
    this.state.updatedAt = new Date().toISOString();
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    const temporaryPath = `${this.filePath}.tmp`;
    fs.writeFileSync(temporaryPath, `${JSON.stringify(this.state, null, 2)}\n`, 'utf8');
    fs.renameSync(temporaryPath, this.filePath);
  }
}

function createSnapshot(
  manifest: AcceptanceProjectManifest,
  manifestFingerprint: string,
): RouteScanCheckpointSnapshot {
  const now = new Date().toISOString();
  return {
    schemaVersion: '1.0.0',
    projectId: manifest.projectId,
    manifestFingerprint,
    updatedAt: now,
    routes: manifest.routes.map((route) => ({
      ...route,
      state: 'pending',
      attempts: 0,
      uiMatches: 0,
      apiMatches: 0,
      updatedAt: now,
    })),
  };
}

function readSnapshot(filePath: string): RouteScanCheckpointSnapshot | undefined {
  if (!fs.existsSync(filePath)) return undefined;
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8')) as RouteScanCheckpointSnapshot;
  } catch {
    return undefined;
  }
}
