const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const output = path.join(root, 'output', 'ci');
const read = (name) => JSON.parse(fs.readFileSync(path.join(output, name), 'utf8').replace(/^\uFEFF/, ''));
const invocation = read('jenkins-invocation.json');
const pilot = read('pilot-envelope.json');

if (pilot.runScope !== 'pilot') throw new Error('PILOT_AUTHORIZATION_SCOPE_INVALID');
if (pilot.status !== 'completed') throw new Error('PILOT_AUTHORIZATION_NOT_COMPLETED');
if (pilot.publicReceiptAccepted !== true || pilot.receiptAudit?.status !== 'complete') throw new Error('PILOT_AUTHORIZATION_RECEIPT_INCOMPLETE');
const selected = [...new Set(pilot.selectedCaseIds || [])].sort();
const terminal = [...new Set(pilot.terminalCaseIds || [])].sort();
if (!selected.length || JSON.stringify(selected) !== JSON.stringify(terminal)) throw new Error('PILOT_AUTHORIZATION_SELECTION_INCOMPLETE');
if (pilot.gitSha !== invocation.pcsGitSha || pilot.requestId !== invocation.requestId || pilot.intentId !== invocation.intentId) {
  throw new Error('PILOT_AUTHORIZATION_BUNDLE_IDENTITY_MISMATCH');
}
process.stdout.write(JSON.stringify({ authorized: true, bundleId: invocation.bundleId, pilotBuildNumber: pilot.buildNumber, selectedCaseCount: selected.length }) + '\n');
