const crypto = require('node:crypto');
const fs = require('node:fs');
function selectionFingerprint(ids) {
  return crypto.createHash('sha256').update(JSON.stringify([...ids].sort())).digest('hex');
}
function verifyBuildEnvelope(envelope, expected) {
  const errors=[];
  if(!envelope || !expected) return ['envelope-or-identity-missing'];
  for(const key of ['gitSha','buildNumber','requestId']) {
    if(!envelope[key] || String(envelope[key])!==String(expected[key])) errors.push(key+'-mismatch');
  }
  const selected=envelope.selectedCaseIds, terminal=envelope.terminalCaseIds;
  if(!Array.isArray(selected)||!selected.length||!Array.isArray(terminal)) return [...errors,'selection-missing'];
  if(new Set(selected).size!==selected.length || new Set(terminal).size!==terminal.length) errors.push('duplicate-case-id');
  if(JSON.stringify([...selected].sort())!==JSON.stringify([...terminal].sort())) errors.push('selection-drift-or-incomplete');
  if(selectionFingerprint(selected)!==envelope.selectionFingerprint) errors.push('selection-fingerprint-mismatch');
  if(envelope.status==='blocked') errors.push('execution-incomplete');
  return errors;
}
module.exports={selectionFingerprint,verifyBuildEnvelope};
if(require.main===module) {
  const envelope=JSON.parse(fs.readFileSync(process.argv[2],'utf8').replace(/^\uFEFF/,''));
  process.stdout.write(JSON.stringify(verifyBuildEnvelope(envelope,JSON.parse(process.argv[3]))));
}
