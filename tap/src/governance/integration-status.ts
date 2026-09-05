export type GovernanceIntegrationStatus = 'connected' | 'not-connected' | 'misconfigured';

export type GovernanceIntegrationSnapshot = {
  git: {
    status: GovernanceIntegrationStatus;
    repositoryConfigured: boolean;
    immutableRefConfigured: boolean;
  };
  jenkins: {
    status: GovernanceIntegrationStatus;
    baseUrlConfigured: boolean;
    jobConfigured: boolean;
    webhookConfigured: boolean;
  };
  prd: {
    sourceMode: 'document-only' | 'system-event';
    connectorConfigured: boolean;
  };
};

export function readGovernanceIntegrationSnapshot(env: NodeJS.ProcessEnv = process.env): GovernanceIntegrationSnapshot {
  const repository = Boolean(env.TEST_AUTOMATION_PLATFORM_REPOSITORY?.trim());
  const immutableRef = /^[a-f0-9]{40}$/i.test(env.TEST_AUTOMATION_PLATFORM_REF?.trim() ?? '');
  const gitStatus: GovernanceIntegrationStatus = repository && immutableRef
    ? 'connected'
    : repository || Boolean(env.TEST_AUTOMATION_PLATFORM_REF?.trim())
      ? 'misconfigured'
      : 'not-connected';
  const jenkinsBaseUrl = Boolean(env.JENKINS_BASE_URL?.trim());
  const jenkinsJob = Boolean(env.JENKINS_JOB_NAME?.trim());
  const jenkinsWebhook = Boolean(env.JENKINS_WEBHOOK_URL?.trim() || env.JENKINS_WEBHOOK_TOKEN?.trim());
  const jenkinsStatus: GovernanceIntegrationStatus = jenkinsBaseUrl && jenkinsJob && jenkinsWebhook
    ? 'connected'
    : jenkinsBaseUrl || jenkinsJob || jenkinsWebhook
      ? 'misconfigured'
      : 'not-connected';
  const prdConnector = Boolean(env.PRD_SOURCE_CONNECTOR_URL?.trim());
  return {
    git: { status: gitStatus, repositoryConfigured: repository, immutableRefConfigured: immutableRef },
    jenkins: { status: jenkinsStatus, baseUrlConfigured: jenkinsBaseUrl, jobConfigured: jenkinsJob, webhookConfigured: jenkinsWebhook },
    prd: { sourceMode: prdConnector ? 'system-event' : 'document-only', connectorConfigured: prdConnector },
  };
}

export function buildGovernanceIntegrationPrompts(snapshot: GovernanceIntegrationSnapshot): string[] {
  const prompts: string[] = [];
  if (snapshot.git.status === 'connected') prompts.push('GIT_CONNECTED_REVIEW-BRG-OPT-004');
  if (snapshot.jenkins.status === 'connected') prompts.push('JENKINS_CONNECTED_REVIEW-BRG-OPT-011');
  if (snapshot.prd.sourceMode === 'system-event') prompts.push('PRD_SYSTEM_CONNECTED_REVIEW-BRG-OPT-005');
  if (snapshot.git.status === 'misconfigured') prompts.push('GIT_CONFIGURATION_INCOMPLETE_FIX_BEFORE_TRIGGER');
  if (snapshot.jenkins.status === 'misconfigured') prompts.push('JENKINS_CONFIGURATION_INCOMPLETE_FIX_BEFORE_TRIGGER');
  return prompts.sort();
}
