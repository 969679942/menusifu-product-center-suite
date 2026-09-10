import fs from 'node:fs';
import { readJsonEvidence } from '../../utils/json-evidence';
import { resolveContainedArtifactPath } from '../../../Test Automation Platform/src/utils/immutable-artifact';
import { summarizeIndexedRunTelemetry } from '../../../Test Automation Platform/src/governance/indexed-run-telemetry';

const object = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === 'object' && !Array.isArray(value));
const id = (value: unknown): value is string => typeof value === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(value);
const manifestValid = (value: unknown): value is { system: { systemId: string } } => object(value) && object(value.system) && id(value.system.systemId);
const stateValid = (value: unknown): value is { systemId: string; runId: string } => object(value) && id(value.systemId) && id(value.runId);

/** Observe only explicitly registered systems' latest run references; never start a pilot or search historical results. */
export function readProductCenterRunTelemetry(projectRoot: string) {
  const findings: Array<{ source: string; reason: string }> = [];
  const runs: Array<{ systemId: string; runId: string; manifestPath: string; statePath: string;
    telemetry: ReturnType<typeof summarizeIndexedRunTelemetry> }> = [];
  let entries: fs.Dirent[] = [];
  try { entries = fs.readdirSync(resolveContainedArtifactPath(projectRoot, 'systems'), { withFileTypes: true }); }
  catch { findings.push({ source: 'systems', reason: 'REGISTERED_SYSTEMS_UNAVAILABLE' }); }
  for (const entry of entries.filter((item) => item.isSymbolicLink())) {
    findings.push({ source: `systems/${entry.name}`, reason: 'REGISTERED_SYSTEM_SYMLINK_FORBIDDEN' });
  }
  const seen = new Set<string>();
  for (const entry of entries.filter((item) => item.isDirectory()).sort((a, b) => a.name.localeCompare(b.name))) {
    const manifestPath = `systems/${entry.name}/manifest.json`;
    try {
      const manifest = readJsonEvidence(resolveContainedArtifactPath(projectRoot, manifestPath), manifestValid);
      if (manifest.status !== 'available') { findings.push({ source: manifestPath, reason: 'SYSTEM_MANIFEST_UNAVAILABLE' }); continue; }
      const systemId = manifest.value.system.systemId;
      if (seen.has(systemId)) { findings.push({ source: manifestPath, reason: 'SYSTEM_ID_DUPLICATE' }); continue; }
      seen.add(systemId);
      const statePath = `output/system-test/${systemId}/latest-run-state.json`;
      const state = readJsonEvidence(resolveContainedArtifactPath(projectRoot, statePath), stateValid);
      if (state.status !== 'available' || state.value.systemId !== systemId) {
        findings.push({ source: statePath, reason: 'LATEST_RUN_REFERENCE_UNAVAILABLE' }); continue;
      }
      const runId = state.value.runId;
      const runRoot = resolveContainedArtifactPath(projectRoot, `output/system-test/${systemId}/${runId}`);
      runs.push({ systemId, runId, manifestPath, statePath, telemetry: summarizeIndexedRunTelemetry(runRoot, runId) });
    } catch { findings.push({ source: manifestPath, reason: 'RUN_TELEMETRY_INPUT_UNAVAILABLE' }); }
  }
  return { scope: 'registered-system-latest-run-observation', businessCurrentnessAsserted: false,
    status: runs.length > 0 && findings.length === 0 && runs.every((run) => run.telemetry.coverageStatus === 'complete')
      ? 'available' as const : 'incomplete' as const,
    runs, findings };
}
