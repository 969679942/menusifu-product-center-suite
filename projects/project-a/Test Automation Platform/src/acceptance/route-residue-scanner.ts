import type { AcceptanceProjectManifest, AcceptanceRoute } from './acceptance-manifest';
import {
  RouteScanCheckpoint,
  type RouteScanCheckpointEntry,
} from './route-scan-checkpoint';

export type RouteProbeResult = {
  uiMarkers: string[];
  apiMarkers: string[];
};

export type RouteProbe = (route: AcceptanceRoute, markerPrefix: string) => Promise<RouteProbeResult>;

export type RetryOptions = {
  delaysMs?: readonly number[];
  sleep?: (delayMs: number) => Promise<void>;
  random?: () => number;
};

export type ScanRouteResidueInput = {
  manifest: AcceptanceProjectManifest;
  checkpoint: RouteScanCheckpoint;
  probe: RouteProbe;
  retry?: RetryOptions;
};

export type RouteResidueScanReport = {
  schemaVersion: '1.0.0';
  generatedAt: string;
  projectId: string;
  status: 'passed' | 'failed';
  summary: {
    total: number;
    passed: number;
    failed: number;
    uiMatches: number;
    apiMatches: number;
  };
  routes: RouteScanCheckpointEntry[];
};

const defaultDelaysMs = [5_000, 15_000, 30_000, 60_000] as const;
const transientFailure = /429|too many requests|econnreset|etimedout|timeout|connection reset|socket hang up|network|fetch failed/i;

export async function scanRouteResidue(input: ScanRouteResidueInput): Promise<RouteResidueScanReport> {
  for (const route of input.checkpoint.pendingRoutes()) {
    await scanRoute(route, input);
  }

  const routes = input.checkpoint.snapshot().routes;
  const passed = routes.filter((route) => route.state === 'passed').length;
  const failed = routes.length - passed;
  return {
    schemaVersion: '1.0.0',
    generatedAt: new Date().toISOString(),
    projectId: input.manifest.projectId,
    status: failed === 0 ? 'passed' : 'failed',
    summary: {
      total: routes.length,
      passed,
      failed,
      uiMatches: routes.reduce((total, route) => total + route.uiMatches, 0),
      apiMatches: routes.reduce((total, route) => total + route.apiMatches, 0),
    },
    routes,
  };
}

async function scanRoute(route: AcceptanceRoute, input: ScanRouteResidueInput): Promise<void> {
  const delaysMs = input.retry?.delaysMs ?? defaultDelaysMs;
  const sleep = input.retry?.sleep ?? ((delayMs) => new Promise((resolve) => setTimeout(resolve, delayMs)));
  const random = input.retry?.random ?? Math.random;

  for (let retryIndex = 0; ; retryIndex += 1) {
    input.checkpoint.markRunning(route.path);
    try {
      const result = await input.probe(route, input.manifest.markerPrefix);
      const uiMatches = countMarkers(result.uiMarkers, input.manifest.markerPrefix);
      const apiMatches = countMarkers(result.apiMarkers, input.manifest.markerPrefix);
      if (uiMatches > 0 || apiMatches > 0) {
        input.checkpoint.markFailed(
          route.path,
          `发现审计残留：ui=${uiMatches},api=${apiMatches}`,
          { uiMatches, apiMatches },
        );
      } else {
        input.checkpoint.markPassed(route.path, { uiMatches: 0, apiMatches: 0 });
      }
      return;
    } catch (error) {
      if (retryIndex < delaysMs.length && transientFailure.test(String(error))) {
        await sleep(delaysMs[retryIndex] + Math.round(random() * 1_000));
        continue;
      }
      input.checkpoint.markFailed(route.path, String(error));
      return;
    }
  }
}

function countMarkers(markers: readonly string[], markerPrefix: string): number {
  return new Set(markers.filter((marker) => marker.includes(markerPrefix))).size;
}
