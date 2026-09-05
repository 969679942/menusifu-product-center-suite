import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { runSystemTest } from '../projects/Test Automation Platform/scripts/run-system-test';
import { buildSystemTestArtifacts } from '../projects/Test Automation Platform/scripts/build-system-test-contract';
import { verifyCiBusinessReceipts } from '../tap/scripts/verify-ci-business-receipts';
import { sanitizePlaywrightTraceText } from '../tap/src/reporters/allure-report-integrity';
import { sanitizeMerchantCenterPlaywrightTraceArchive } from '../projects/project-a/Merchant Center UITest/adapters/test-automation-platform/allure-reporting';
const { selectionFingerprint } = require('../tap/src/ci/transport-contract.cjs');
const { sanitizeTraceSecrets } = require('./sanitize-trace.cjs');
const root = path.resolve(__dirname, '..');
const project = path.join(root, 'projects/project-a/Merchant Center UITest');
const out = path.join(root, 'output/ci');
const fullRegression = process.env.RUN_SCOPE === 'full-regression';
const pilotSelection = JSON.parse(fs.readFileSync(path.join(__dirname, 'business-selection.json'), 'utf8'));
const manifestPath = fullRegression ? 'systems/merchant-center-product-center-seasoning/manifest.json' : pilotSelection.manifest;
const manifest = JSON.parse(fs.readFileSync(path.join(project, manifestPath), 'utf8'));
const gitSha = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
const runId = `jenkins-${process.env.BUILD_NUMBER}-${process.env.REQUEST_ID}`;
const secretValues: string[] = [];
for (const line of (process.env.MC_RUNTIME_ENV || '').split(/\r?\n/)) {
  const split = line.indexOf('=');
  if (split < 1 || line.trimStart().startsWith('#')) continue;
  const key = line.slice(0, split).trim(), value = line.slice(split + 1);
  if (!/^(MC_|PLAYWRIGHT_)/.test(key)) continue;
  process.env[key] = value;
  if (/PASSWORD|TOKEN|SECRET/i.test(key) && value.length > 3) secretValues.push(value);
}
delete process.env.MC_RUNTIME_ENV;
process.env.CI = 'true';
process.env.SYSTEM_TEST_ADDITIONAL_REPORTERS = path.join(project, 'reporters/product-center-system-allure.reporter.ts');
// The public concurrency resolver clamps the requested worker count by the
// manifest cap, CPU, memory and selected-case count; Jenkins still owns one
// executor while Playwright workers run inside that executor.
function safeText(text: string) { let clean = sanitizePlaywrightTraceText(text).text; for (const secret of secretValues) clean = clean.split(secret).join('<redacted>'); return clean; }
function archive(dir: string, dest: string) {
  if (!fs.existsSync(dir)) return;
  fs.mkdirSync(dest, { recursive: true });
  for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
    const from = path.join(dir, item.name), to = path.join(dest, item.name);
    if (item.isSymbolicLink() || /auth-state|storage-state|execution-grant/i.test(item.name)) continue;
    if (item.isDirectory()) { archive(from, to); continue; }
    if (/\.(json|jsonl|log|txt|md|html|xml|csv|svg|properties)$/.test(item.name)) fs.writeFileSync(to, safeText(fs.readFileSync(from, 'utf8')));
    else if (/\.(png|webp|jpg|jpeg|webm|mp4|pdf)$/.test(item.name)) fs.copyFileSync(from, to);
    else if (/\.zip$/.test(item.name)) { fs.copyFileSync(from, to); sanitizeMerchantCenterPlaywrightTraceArchive(to); sanitizeTraceSecrets(to, secretValues); }
  }
}
type Group = { contextProfile: string; caseIds: string[] };
function groupsForRun(): Group[] {
  if (!fullRegression) return [{ contextProfile: pilotSelection.contextProfile, caseIds: pilotSelection.selectedCaseIds }];
  const groups = new Map<string, string[]>();
  for (const item of manifest.cases as Array<{ caseId: string; executionContextProfile: string }>) {
    const cases = groups.get(item.executionContextProfile) ?? [];
    cases.push(item.caseId); groups.set(item.executionContextProfile, cases);
  }
  return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([contextProfile, caseIds]) => ({ contextProfile, caseIds: [...caseIds].sort() }));
}
function contextBrand(contextProfile: string): string { return contextProfile === 'multi-store-000420' ? '000420' : '000407'; }
async function main() {
  fs.mkdirSync(out, { recursive: true });
  const allCaseIds = fullRegression ? (manifest.cases as Array<{ caseId: string }>).map((item) => item.caseId).sort() : pilotSelection.selectedCaseIds;
  if (process.argv.includes('--plan-only')) {
    const compiled = buildSystemTestArtifacts({ rootDir: project, manifestPath, caseIds: allCaseIds });
    process.stdout.write(JSON.stringify({ selected: compiled.contract.cases.length, errors: compiled.errors, onboarding: compiled.onboarding }, null, 2));
    process.exitCode = compiled.errors.length ? 2 : 0; return;
  }
  if (process.cwd().toLowerCase() !== project.toLowerCase()) throw new Error('Business regression must start from the MC project root');
  if (!fullRegression && (allCaseIds.length !== 10 || new Set(allCaseIds).size !== 10)) throw new Error('Exact ten-case selection required');
  let code = 0; const diagnostics: string[] = [];
  const groupResults: Array<{ runId: string; contextProfile: string; selectedCaseIds: string[]; terminalCaseIds: string[]; code: number; report: any; ledger: any; receiptAudit: any }> = [];
  for (const group of groupsForRun()) {
    const groupRunId = fullRegression ? `${runId}-${group.contextProfile}` : runId;
    const source = path.join(project, 'output/system-test/merchant-center-product-center-seasoning', groupRunId);
    process.env.MC_BRAND_ID = contextBrand(group.contextProfile);
    process.env.SYSTEM_TEST_EXECUTION_CONTEXT_PROFILE = group.contextProfile;
    process.env.MC_STORAGE_STATE_PATH = path.join(project, 'output/private', groupRunId, 'auth-state.json');
    process.env.SYSTEM_TEST_AUDIT_EVENT_LOG = path.join(source, 'events.jsonl');
    process.env.SYSTEM_TEST_RUN_ID = groupRunId;
    let groupCode = 2;
    try { groupCode = await runSystemTest({ manifestPath, runId: groupRunId, caseIds: group.caseIds, executionIntent: 'full-regression', fullRegressionAuthorized: true, auditEventLogPath: process.env.SYSTEM_TEST_AUDIT_EVENT_LOG }); }
    catch (error) { diagnostics.push(`${group.contextProfile}: ${safeText(error instanceof Error ? error.stack || error.message : String(error))}`); }
    finally {
      archive(source, path.join(out, 'business', groupRunId));
      const load = (name: string) => fs.existsSync(path.join(source, name)) ? JSON.parse(fs.readFileSync(path.join(source, name), 'utf8')) : null;
      const report = load('run-report.json'), ledger = load('evidence-ledger.json'), receiptAudit = verifyCiBusinessReceipts(ledger, load('contract.json'));
      const records = ledger?.cases || [], terminalCaseIds = records.map((item: any) => item.caseId), expected = group.caseIds.length;
      const accepted = groupCode === 0 && receiptAudit.status === 'complete' && report?.receiptImport?.records === expected && report?.receiptImport?.diagnostics?.length === 0 && records.length === expected;
      if (groupCode === 0 && !accepted) groupCode = 3; if (groupCode !== 0) code = groupCode;
      if (report?.diagnostic) diagnostics.push(`${group.contextProfile}: ${report.diagnostic}`);
      groupResults.push({ runId: groupRunId, contextProfile: group.contextProfile, selectedCaseIds: group.caseIds, terminalCaseIds, code: groupCode, report, ledger, receiptAudit });
      if (fs.existsSync(process.env.MC_STORAGE_STATE_PATH!)) fs.unlinkSync(process.env.MC_STORAGE_STATE_PATH!);
    }
  }
  const terminalCaseIds = groupResults.flatMap((group) => group.terminalCaseIds), receiptCases = groupResults.flatMap((group) => group.receiptAudit?.cases ?? []);
  const receiptAudit = { status: groupResults.length > 0 && groupResults.every((group) => group.receiptAudit?.status === 'complete') && terminalCaseIds.length === allCaseIds.length ? 'complete' : 'incomplete', selected: allCaseIds.length, received: terminalCaseIds.length, cases: receiptCases };
  const records = groupResults.flatMap((group) => group.ledger?.cases ?? []);
  const caseAudit = records.map((item: any) => ({ caseId: item.caseId, status: item.playwrightStatus ?? 'not-run', accepted: item.playwrightStatus === 'passed' && item.evidence?.status === 'complete' }));
  const envelope = { schemaVersion: 1, kind: fullRegression ? 'governed-business-full-regression' : pilotSelection.kind, gitSha, buildNumber: process.env.BUILD_NUMBER, requestId: process.env.REQUEST_ID, selectedCaseIds: allCaseIds, selectionFingerprint: selectionFingerprint(allCaseIds), terminalCaseIds, caseAudit, publicReceiptAccepted: code === 0 && receiptAudit.status === 'complete', receiptAudit, status: terminalCaseIds.length < allCaseIds.length ? 'blocked' : code === 0 ? 'completed' : 'completed-with-findings', passed: records.filter((item: any) => item.playwrightStatus === 'passed' && item.evidence?.status === 'complete').length, failed: records.filter((item: any) => item.playwrightStatus === 'failed').length, skipped: Math.max(0, allCaseIds.length - terminalCaseIds.length), exitCode: code, diagnostic: diagnostics.join('\n'), runId, contextRuns: groupResults.map((group) => ({ runId: group.runId, contextProfile: group.contextProfile, selectedCaseIds: group.selectedCaseIds, terminalCaseIds: group.terminalCaseIds, status: group.code === 0 ? 'passed' : 'completed-with-findings', passed: (group.ledger?.cases ?? []).filter((item: any) => item.playwrightStatus === 'passed' && item.evidence?.status === 'complete').length, failed: (group.ledger?.cases ?? []).filter((item: any) => item.playwrightStatus === 'failed').length })) };
  fs.writeFileSync(path.join(out, fullRegression ? 'result-envelope.json' : 'pilot-envelope.json'), safeText(JSON.stringify(envelope, null, 2)));
  process.exitCode = code;
}
void main().catch((error) => { process.stderr.write(`${safeText(error instanceof Error ? error.stack || error.message : String(error))}\n`); process.exitCode = 2; });
