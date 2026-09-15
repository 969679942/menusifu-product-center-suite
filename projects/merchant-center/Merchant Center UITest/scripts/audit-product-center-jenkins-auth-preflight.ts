import path from 'node:path';
import { inspectProductCenterAuthentication, type ProductCenterAuthMode } from '../adapters/product-center/authentication-preflight';
import { publishImmutableArtifact } from '../utils/immutable-artifact';

export function auditProductCenterJenkinsAuthPreflight(options: { projectRoot?: string; mode?: ProductCenterAuthMode } = {}) {
  const projectRoot = path.resolve(options.projectRoot ?? path.join(__dirname, '..'));
  const mode = options.mode ?? 'ui';
  if (mode !== 'ui' && mode !== 'api') throw new Error('PRODUCT_CENTER_AUTH_MODE_INVALID');
  let assessment: ReturnType<typeof inspectProductCenterAuthentication> | null = null;
  try { assessment = inspectProductCenterAuthentication(mode); }
  catch { /* Never include secret source bytes or exception messages in diagnostics. */ }
  const report = {
    schemaVersion: '2.0.0', reportId: 'product-center-jenkins-auth-preflight', generatedAt: new Date().toISOString(), mode,
    status: assessment?.status ?? 'configuration-invalid', assessment,
    credentials: assessment?.capabilities.map(({ id, configured }) => ({ name: id, configured })) ?? [],
    policy: { secretsPersisted: false, loginAttempted: false, businessExecutionStarted: false, executionAuthorized: false },
    nextAction: assessment?.status === 'ready-for-readonly-probe'
      ? '配置具备只读认证探针前置条件；仍须独立执行意图和授权，不能据配置状态启动业务。'
      : assessment ? `从运行器支持的配置来源补齐 ${mode} 模式缺失凭据或上下文后重新预检。`
        : '执行代理修复配置源读取或解析问题后重新预检；不输出秘密原文。',
  };
  const relativePath = `output/governance/product-center-jenkins-auth-preflight${mode === 'api' ? '.api' : ''}.json`;
  const publication = publishImmutableArtifact({ outputRoot: projectRoot, relativePath,
    content: JSON.stringify(report, null, 2) + '\n', reason: 'refresh-effective-runner-authentication-preflight' });
  return { report, outputJson: path.join(projectRoot, relativePath), publication };
}

if (require.main === module) {
  const args = process.argv.slice(2);
  if (args.some((arg) => !/^--mode=(ui|api)$/.test(arg)) || args.length > 1) throw new Error('PRODUCT_CENTER_AUTH_MODE_INVALID');
  const result = auditProductCenterJenkinsAuthPreflight({ mode: (args[0]?.slice(7) ?? 'ui') as ProductCenterAuthMode });
  process.stdout.write(JSON.stringify({ status: result.report.status, mode: result.report.mode,
    credentials: result.report.credentials, outputJson: result.outputJson }) + '\n');
  if (result.report.status !== 'ready-for-readonly-probe') process.exitCode = 2;
}
