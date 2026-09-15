const crypto = require('node:crypto');

const RUN_SCOPES = new Set(['contracts', 'reports', 'pilot', 'full-regression']);
const TRIGGER_SOURCES = new Set([
  'explicit-local-submit',
  'github-webhook',
  'scm-trigger',
  'workflow-dispatch',
  'jenkins-schedule',
]);

function isSha(value) {
  return typeof value === 'string' && /^[0-9a-f]{40}$/.test(value);
}

function isRequestId(value) {
  return typeof value === 'string' && /^[A-Za-z0-9-]{1,80}$/.test(value);
}

function isUuid(value) {
  return typeof value === 'string'
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

/**
 * Validate the immutable request sent to the dedicated Jenkins job.
 * This function is deliberately system-neutral: adapters supply the exact
 * repository SHA, while TAP owns identity, scope and trigger invariants.
 */
function validateJenkinsTriggerRequest(request, options = {}) {
  const errors = [];
  const value = request && typeof request === 'object' ? request : {};
  if (!isSha(value.gitSha)) errors.push('gitSha-must-be-exact-40-hex');
  if (options.remoteSha !== undefined && value.gitSha !== options.remoteSha) {
    errors.push('gitSha-not-equal-remote-head');
  }
  if (!isRequestId(value.requestId)) errors.push('requestId-invalid');
  if (!isUuid(value.intentId)) errors.push('intentId-invalid');
  if (!RUN_SCOPES.has(value.runScope)) errors.push('runScope-invalid');
  if (!TRIGGER_SOURCES.has(value.triggerSource)) errors.push('triggerSource-invalid');
  if (value.runScope === 'full-regression' && value.optimizationPlan) {
    errors.push('full-regression-cannot-carry-optimization-plan');
  }
  if (value.runScope !== 'full-regression' && value.fullRegression === true) {
    errors.push('fullRegression-flag-scope-mismatch');
  }
  return errors;
}

function assertJenkinsTriggerRequest(request, options = {}) {
  const errors = validateJenkinsTriggerRequest(request, options);
  if (errors.length) throw new Error(`JENKINS_TRIGGER_CONTRACT_INVALID:${errors.join(',')}`);
  return normalizeJenkinsTriggerRequest(request);
}

function normalizeJenkinsTriggerRequest(request) {
  return {
    schemaVersion: 1,
    gitSha: request.gitSha.toLowerCase(),
    requestId: request.requestId,
    intentId: request.intentId.toLowerCase(),
    runScope: request.runScope,
    triggerSource: request.triggerSource,
  };
}

function fingerprintJenkinsTriggerRequest(request) {
  const normalized = normalizeJenkinsTriggerRequest(request);
  return crypto.createHash('sha256').update(JSON.stringify(normalized)).digest('hex');
}

function validateJenkinsInvocation(input, options = {}) {
  const value = input && typeof input === 'object' ? input : {};
  const errors = validateJenkinsTriggerRequest(value, { remoteSha: options.remoteSha });
  for (const [field, label] of [['mcGitSha', 'mcGitSha'], ['tapGitSha', 'tapGitSha']]) {
    if (!isSha(value[field])) errors.push(`${label}-must-be-exact-40-hex`);
  }
  if (options.remoteMcSha !== undefined && value.mcGitSha !== options.remoteMcSha) errors.push('mcGitSha-not-equal-remote-head');
  if (options.remoteTapSha !== undefined && value.tapGitSha !== options.remoteTapSha) errors.push('tapGitSha-not-equal-remote-head');
  return [...new Set(errors)];
}

function assertJenkinsInvocation(input, options = {}) {
  const errors = validateJenkinsInvocation(input, options);
  if (errors.length) throw new Error(`JENKINS_INVOCATION_CONTRACT_INVALID:${errors.join(',')}`);
  return input;
}

module.exports = {
  RUN_SCOPES,
  TRIGGER_SOURCES,
  validateJenkinsTriggerRequest,
  assertJenkinsTriggerRequest,
  normalizeJenkinsTriggerRequest,
  fingerprintJenkinsTriggerRequest,
  validateJenkinsInvocation,
  assertJenkinsInvocation,
};
