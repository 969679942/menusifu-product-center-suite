const fs = require('node:fs');

const IDENTITY_ERRORS = new Set([
  'gitSha-mismatch', 'buildNumber-mismatch', 'requestId-mismatch',
  'intentId-mismatch', 'runScope-mismatch', 'envelope-or-identity-missing',
]);
function normalizedErrors(errors) {
  return [...new Set((Array.isArray(errors) ? errors : []).filter(error => typeof error === 'string' && error.trim()).map(error => error.trim()))].sort();
}
function categoryForError(error) {
  if (IDENTITY_ERRORS.has(error) || error.startsWith('bundle-gitSha-mismatch')
    || error.startsWith('bundle-buildNumber-mismatch') || error.startsWith('bundle-requestId-mismatch')
    || error.startsWith('bundle-intentId-mismatch') || error.startsWith('bundle-runScope-mismatch')
    || /application.*mismatch|authorization.*mismatch/i.test(error)) return 'configuration-blocked';
  if (error.startsWith('bundle-') || error === 'result-envelope-missing') return 'transport-blocked';
  if (error.startsWith('selection-') || error === 'duplicate-case-id' || error === 'execution-incomplete') return 'execution-incomplete';
  if (error.startsWith('standard-') || error === 'allure-evidence-incomplete' || error === 'report-pass-without-receipt') return 'evidence-incomplete';
  if (/timeout|connection-reset|429|exceeded-retry|agent-lost|process-interrupted/i.test(error)) return 'infrastructure-interrupted';
  return 'automation-gap';
}
function sameUniqueSet(left, right) {
  return Array.isArray(left) && left.length > 0 && Array.isArray(right)
    && new Set(left).size === left.length && new Set(right).size === right.length
    && JSON.stringify([...left].sort()) === JSON.stringify([...right].sort());
}
function explicitFailureCategories(envelope) {
  const report = envelope && typeof envelope.runReport === 'object' ? envelope.runReport : {};
  const categories = Array.isArray(report.failureCategories) ? report.failureCategories : [];
  const caseCategories = Array.isArray(envelope?.caseAudit) ? envelope.caseAudit.map(item => item && item.failureCategory) : [];
  return [...new Set([...categories, ...caseCategories].filter(category => typeof category === 'string' && category.trim()))].sort();
}
function arbitrateBuildResult(input) {
  const errors = normalizedErrors(input?.errors);
  const envelope = input?.envelope && typeof input.envelope === 'object' ? input.envelope : {};
  const selectionComplete = sameUniqueSet(envelope.selectedCaseIds, envelope.terminalCaseIds) && envelope.status !== 'blocked';
  const derivedCategories = errors.map(categoryForError);
  if (!selectionComplete && !derivedCategories.includes('execution-incomplete')) derivedCategories.push('execution-incomplete');
  if (input?.jenkinsResult && !['SUCCESS', 'UNSTABLE'].includes(input.jenkinsResult)
    && errors.length === 0 && explicitFailureCategories(envelope).length === 0) derivedCategories.push('infrastructure-interrupted');
  const failureCategories = [...new Set([...explicitFailureCategories(envelope), ...derivedCategories])].sort();
  const evidenceStatus = failureCategories.some(category => ['evidence-incomplete', 'transport-blocked', 'configuration-blocked'].includes(category)) ? 'incomplete' : 'complete';
  const hasFindings = errors.length > 0 || failureCategories.length > 0 || envelope.status === 'completed-with-findings' || input?.jenkinsResult !== 'SUCCESS';
  const executionStatus = !selectionComplete ? 'blocked' : hasFindings ? 'completed-with-findings' : 'completed';
  const businessPassAuthority = executionStatus === 'completed' && evidenceStatus === 'complete' && envelope.publicReceiptAccepted === true;
  const technicalCategories = failureCategories.filter(category => category !== 'product-failure');
  const actionRequired = businessPassAuthority ? 'none' : technicalCategories.length > 0 ? 'technical-remediation-required'
    : failureCategories.includes('product-failure') ? 'business-review-required'
      : executionStatus === 'completed' ? 'none' : 'technical-remediation-required';
  return { executionStatus, evidenceStatus,
    identityVerified: !errors.some(error => categoryForError(error) === 'configuration-blocked'),
    executionComplete: selectionComplete, businessPassAuthority, failureCategories, actionRequired,
    reviewAuthority: 'tap-deterministic-result-arbiter' };
}
module.exports = { arbitrateBuildResult, categoryForError };
if (require.main === module) {
  let input = ''; process.stdin.setEncoding('utf8');
  process.stdin.on('data', chunk => { input += chunk; });
  process.stdin.on('end', () => process.stdout.write(JSON.stringify(arbitrateBuildResult(JSON.parse(input)))));
}
