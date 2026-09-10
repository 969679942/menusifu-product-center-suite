import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { readGovernanceIntegrationSnapshot } from '../utils/integration-status';

const projectRoot = path.resolve(__dirname, '..');
const workspaceRoot = path.resolve(projectRoot, '..');
const outputDirectory = path.join(projectRoot, 'output/governance');
const outputJson = path.join(outputDirectory, 'product-center-git-jenkins-integration-audit.json');
const outputMarkdown = path.join(outputDirectory, 'product-center-git-jenkins-integration-audit.md');

const jenkinsfile = readText(path.join(workspaceRoot, 'Jenkinsfile'));
const workflow = readText(path.join(workspaceRoot, '.github/workflows/product-center-quality.yml'));
const jenkinsDocs = readText(path.join(projectRoot, 'docs/product-center-audit-jenkins.md'));
const packageJson = readJson<{ scripts?: Record<string, string> }>(path.join(projectRoot, 'package.json'));
const integration = readGovernanceIntegrationSnapshot();

const checks = [
  check('JENKINSFILE_PRESENT', jenkinsfile.length > 0, '根目录 Jenkinsfile 存在'),
  check('JENKINSFILE_PINNED_PLATFORM_VARS', hasAll(jenkinsfile, ['TEST_AUTOMATION_PLATFORM_REPOSITORY', 'TEST_AUTOMATION_PLATFORM_REF']), 'Jenkinsfile 校验公共平台仓库和 40 位 SHA'),
  check('JENKINSFILE_STATIC_AUDIT', jenkinsfile.includes('audit:product-center:git-jenkins'), 'Jenkinsfile 先执行 Git/Jenkins 静态审计'),
  check('JENKINSFILE_EVENT_LOG', hasAll(jenkinsfile, ['SYSTEM_TEST_AUDIT_EVENT_LOG', 'SYSTEM_TEST_RUN_ID', 'SYSTEM_TEST_APPLICATION_ID', 'SYSTEM_TEST_BUSINESS_DOMAIN_ID']), 'Jenkinsfile 配置实时审计事件链路'),
  check('JENKINSFILE_ARCHIVE', jenkinsfile.includes('archiveArtifacts'), 'Jenkinsfile 归档审计和治理产物'),
  check('GITHUB_IMMUTABLE_PLATFORM_GATE', hasAll(workflow, ['TEST_AUTOMATION_PLATFORM_REPOSITORY', 'TEST_AUTOMATION_PLATFORM_REF', 'CI_PLATFORM_IMMUTABLE_REF_REQUIRED']), 'GitHub Actions 在检出前校验固定平台 SHA'),
  check('GITHUB_GOVERNANCE_GATE', workflow.includes('npm run test:test-platform:gates'), 'GitHub Actions 执行公共治理门禁'),
  check('JENKINS_DOC_COMPLETENESS_GATE', jenkinsDocs.includes('verify-system-test-audit-completeness'), 'Jenkins 文档要求执行审计完整性门禁'),
  check('PACKAGE_SCRIPT_REGISTERED', packageJson.scripts?.['audit:product-center:git-jenkins'] === 'tsx scripts/audit-product-center-git-jenkins.ts', '静态审计命令已注册'),
  check('NO_SECRET_PRINTING', !/echo\s+.*(?:PASSWORD|TOKEN|COOKIE|AUTHORIZATION)/i.test(jenkinsfile), 'Jenkinsfile 不直接打印凭据'),
];

const report = {
  schemaVersion: '1.0.0',
  reportId: 'product-center-git-jenkins-integration-audit',
  generatedAt: new Date().toISOString(),
  scope: ['project-adapter', 'generated-evidence'],
  status: checks.every((item) => item.passed) ? 'contract-ready' : 'blocked',
  runtimeConnection: integration,
  git: readGitMetadata(),
  checks,
  executionPolicy: {
    staticAuditOnly: true,
    businessExecutionStarted: false,
    externalCredentialsPersisted: false,
    existingPassedCasesInvalidated: false,
  },
  nextActions: [
    '在 Jenkins 全局或 Job 环境配置 TEST_AUTOMATION_PLATFORM_REPOSITORY 和已审核的 40 位 TEST_AUTOMATION_PLATFORM_REF。',
    '配置 JENKINS_BASE_URL、JENKINS_JOB_NAME 和 JENKINS_WEBHOOK_URL 或 JENKINS_WEBHOOK_TOKEN 后重新运行本审计。',
    '仅当运行环境产生标准审计收据时，才执行审计完整性门禁；不因静态接入审计启动业务用例。',
  ],
};

fs.mkdirSync(outputDirectory, { recursive: true });
fs.writeFileSync(outputJson, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
fs.writeFileSync(outputMarkdown, renderMarkdown(report), 'utf8');
process.stdout.write(`${JSON.stringify({ status: report.status, runtimeGit: integration.git.status, runtimeJenkins: integration.jenkins.status, outputJson })}\n`);
if (report.status !== 'contract-ready') process.exitCode = 1;

function check(id: string, passed: boolean, detail: string) {
  return { id, passed, detail };
}

function hasAll(value: string, needles: readonly string[]): boolean {
  return needles.every((needle) => value.includes(needle));
}

function readText(filePath: string): string {
  return fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : '';
}

function readJson<T>(filePath: string): T {
  return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T;
}

function readGitMetadata() {
  try {
    const remote = execFileSync('git', ['config', '--get', 'remote.origin.url'], { cwd: workspaceRoot, encoding: 'utf8' }).trim();
    const head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: workspaceRoot, encoding: 'utf8' }).trim();
    return { repositoryConfigured: Boolean(remote), remoteRedacted: remote.replace(/\/\/[^/@]+:[^/@]+@/g, '//***:***@'), head, headIsImmutable: /^[a-f0-9]{40}$/i.test(head) };
  } catch {
    return { repositoryConfigured: false, remoteRedacted: null, head: null, headIsImmutable: false };
  }
}

function renderMarkdown(value: typeof report): string {
  return [
    '# 商品中心 Git/Jenkins 接入审计', '',
    `- 静态合同：${value.status}`,
    `- 运行时 Git：${value.runtimeConnection.git.status}`,
    `- 运行时 Jenkins：${value.runtimeConnection.jenkins.status}`,
    `- 本地 Git 仓库：${value.git.repositoryConfigured ? '已发现' : '未发现'}`,
    `- 业务执行：${value.executionPolicy.businessExecutionStarted ? '已启动' : '未启动'}`,
    '', '| 检查项 | 结果 | 说明 |', '|---|---|---|',
    ...value.checks.map((item) => `| ${item.id} | ${item.passed ? 'passed' : 'blocked'} | ${item.detail} |`),
    '', '说明：静态合同通过不等于外部 Jenkins 已连接；运行时连接仍以非空且实际可用的环境配置及 Job/Webhook 运行证据为准。', '',
  ].join('\n');
}
