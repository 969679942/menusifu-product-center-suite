const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

function planNext({enabled, result, scope, invocation, envelope, audit}) {
  if (!enabled) return {status:'standalone', nextScope:null};
  if (result !== 'SUCCESS') return {status:'stopped', nextScope:null};
  if (!['contracts','reports','pilot'].includes(scope)) throw new Error('CHAIN_SCOPE_INVALID');
  for (const key of ['gitSha','mcGitSha','tapGitSha']) {
    if (!/^[0-9a-f]{40}$/.test(invocation[key] || '')) throw new Error('CHAIN_SHA_INVALID:'+key);
  }
  if (invocation.runScope !== scope || !/^[a-zA-Z0-9-]{1,60}$/.test(invocation.requestId || '')) throw new Error('CHAIN_IDENTITY_INVALID');
  if (!envelope || envelope.status !== 'completed' || envelope.requestId !== invocation.requestId || envelope.gitSha !== invocation.gitSha || String(envelope.buildNumber) !== String(invocation.buildNumber) || envelope.intentId !== invocation.intentId) throw new Error('CHAIN_ENVELOPE_INVALID');
  const selected = envelope.selectedCaseIds || [], terminal = envelope.terminalCaseIds || [];
  if (!selected.length || new Set(selected).size !== selected.length || new Set(terminal).size !== terminal.length || JSON.stringify([...selected].sort()) !== JSON.stringify([...terminal].sort())) throw new Error('CHAIN_SELECTION_INCOMPLETE');
  if (envelope.selectionFingerprint !== crypto.createHash('sha256').update(JSON.stringify([...selected].sort())).digest('hex')) throw new Error('CHAIN_SELECTION_FINGERPRINT_INVALID');
  if (scope !== 'contracts' && audit?.status !== 'complete') throw new Error('CHAIN_REPORT_INCOMPLETE');
  if (scope === 'pilot' && (!envelope.publicReceiptAccepted || audit?.selection?.status !== 'complete')) throw new Error('CHAIN_BUSINESS_EVIDENCE_INCOMPLETE');
  const nextScope = {contracts:'reports',reports:'pilot',pilot:null}[scope];
  return {status:nextScope?'ready':'completed',nextScope,nextRequestId:nextScope?`${invocation.requestId}-${nextScope}`:null,sourceBuild:invocation.buildNumber,pcs:invocation.gitSha,mc:invocation.mcGitSha,tap:invocation.tapGitSha,intentId:invocation.intentId};
}

if (require.main === module) {
  const out = path.resolve(__dirname,'../output/ci');
  const read = name => fs.existsSync(path.join(out,name)) ? JSON.parse(fs.readFileSync(path.join(out,name),'utf8')) : null;
  const scope = process.env.RUN_SCOPE;
  const plan = planNext({enabled:process.env.AUTO_CHAIN === 'true',result:process.env.CHAIN_BUILD_RESULT,scope,invocation:read('jenkins-invocation.json'),envelope:read(scope==='pilot'?'pilot-envelope.json':'result-envelope.json'),audit:read('allure-audit.json')});
  fs.writeFileSync(path.join(out,'chain-checkpoint.json'),JSON.stringify(plan,null,2));
  process.stdout.write(plan.nextScope || '');
}
module.exports = {planNext};
