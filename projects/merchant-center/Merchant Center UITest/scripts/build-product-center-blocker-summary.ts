import fs from 'node:fs';
import { publishImmutableArtifact } from '../utils/immutable-artifact';
import path from 'node:path';
import { readJsonEvidence } from '../utils/json-evidence';
import { ITEM_CURRENT_RECEIPT_CONTRACT_PATH, isProductCenterItemReleaseReceiptManifest } from '../adapters/product-center/product-center-item-release-receipts';

type Row = { id: string; status: string; problem: string; owner: string; minimumMaterials: string; nextAction: string; impact: string };
type RecordValue = Record<string, unknown>;
const record = (value: unknown): value is RecordValue => Boolean(value && typeof value === 'object' && !Array.isArray(value));
const count = (value: unknown): value is number => Number.isSafeInteger(value) && Number(value) >= 0;
const statusIn = (values: string[]) => (value: unknown): value is RecordValue & { status: string } => record(value) && typeof value.status === 'string' && values.includes(value.status);

export function buildProductCenterBlockerSummary(options: { projectRoot?: string; workspaceRoot?: string } = {}) {
  const root = path.resolve(options.projectRoot ?? path.join(__dirname, '..'));
  const workspace = path.resolve(options.workspaceRoot ?? path.join(root, '..'));
  const output = path.join(root, 'output/governance/product-center-blocker-summary.json');
  const blockers: Row[] = [];
  const evidence: Array<{ id: string; status: string; reason?: string }> = [];
  const add = (id: string, status: string, problem: string, nextAction: string, minimumMaterials = '当前有效证据') => blockers.push({
    id, status, problem, owner: '执行代理', minimumMaterials, nextAction,
    impact: '仅更新治理摘要；不启动业务执行，不改变已有通过用例；证据缺口不判为产品失败',
  });
  function read<T>(id: string, file: string, validate: (value: unknown) => value is T): T | undefined {
    const result = readJsonEvidence(file, validate);
    evidence.push({ id, status: result.status, ...(result.status === 'available' ? {} : { reason: result.reason }) });
    if (result.status === 'available') return result.value;
    add(`${id}_EVIDENCE`, 'evidence-incomplete', `输入证据不可用：${result.status}/${result.reason}`, '修复或生成该输入证据后重新构建摘要');
    return undefined;
  }

  const auth = read('MC_AUTHORIZATION', path.join(root, 'output/governance/product-center-jenkins-auth-preflight.json'), statusIn(['ready-for-readonly-probe', 'external-authorization-blocked', 'configuration-invalid']));
  if (auth) {
    add('MC_AUTHORIZATION', auth.status, auth.status === 'configuration-invalid'
      ? '认证配置源读取或解析失败，执行代理需先修复技术配置问题'
      : auth.status === 'external-authorization-blocked'
      ? '最近配置预检显示认证前置条件未满足；此结果不代表当前登录探针结论'
      : '认证配置预检已就绪，仍缺当前只读认证探针结论',
    '刷新配置可用性检查，满足条件后执行只读认证探针；通过后按执行意图恢复', '受保护凭据来源、租户上下文和当前只读探针证据');
  }

  const verdict = read('PLATFORM_VERDICT', path.join(root, 'deliverables/system-test-platform/final-goal-verdict.json'),
    (value): value is { status: string; blockers: string[] } => record(value)
      && ['complete', 'incomplete'].includes(String(value.status)) && Array.isArray(value.blockers)
      && value.blockers.every((item) => typeof item === 'string' && /^[A-Z][A-Z0-9_]+$/.test(item))
      && (value.status !== 'complete' || value.blockers.length === 0));
  if (verdict) {
    const definitions: Record<string, [string, string, string]> = {
      CROSS_APPLICATION_PILOT_REQUIRED: ['CROSS_APPLICATION_PILOT', '缺不同 applicationId 的合格真实试点', '保持登记；收到明确启动指令后执行授权范围内的隔离试点'],
      CROSS_DOMAIN_PILOT_REQUIRED: ['CROSS_DOMAIN_PILOT', '缺合格跨域真实试点', '保持登记；收到明确启动指令后执行授权范围内的隔离试点'],
      REFERENCE_BASELINE_NOT_READY: ['REFERENCE_BASELINE', '参考基线尚未满足当前完整收据要求', '按当前 readiness 缺口和公共执行意图恢复；不复用历史汇总通过数'],
    };
    for (const code of verdict.blockers) {
      const definition = definitions[code];
      if (definition) add(definition[0], 'incomplete', definition[1], definition[2]);
      else if (!blockers.some((item) => item.id === 'PLATFORM_OTHER_BLOCKER')) add('PLATFORM_OTHER_BLOCKER', 'incomplete', '公共最终门禁仍存在其他阻断', '读取当前最终门禁并自动处理技术缺口');
    }
    if (verdict.status === 'incomplete' && verdict.blockers.length === 0) {
      add('PLATFORM_VERDICT_EVIDENCE', 'evidence-incomplete', '公共门禁未完成但缺少阻断明细', '修复公共门禁证据后重建摘要');
    }
  }

  const maintenance = read('MAINTAINABILITY', path.join(root, 'output/quality/product-center-maintainability-report.json'),
    (value): value is { status: string; summary: { highPriorityFiles: number }; baseline: { maxHighPriorityFiles: number } } => record(value)
      && ['passed', 'blocked'].includes(String(value.status)) && record(value.summary) && count(value.summary.highPriorityFiles)
      && record(value.baseline) && count(value.baseline.maxHighPriorityFiles));
  if (maintenance && (maintenance.status === 'blocked' || maintenance.summary.highPriorityFiles > maintenance.baseline.maxHighPriorityFiles)) {
    add('MAINTAINABILITY', 'open', `维护性门禁未通过：高优先级文件 ${maintenance.summary.highPriorityFiles}，基线上限 ${maintenance.baseline.maxHighPriorityFiles}`, '按当前维护性报告修复；保留兼容接口并验证明确影响集');
  }

  read('ITEM_FINAL_RELEASE_CONTRACT', path.join(root, ITEM_CURRENT_RECEIPT_CONTRACT_PATH), isProductCenterItemReleaseReceiptManifest);

  const efficiency = read('EFFICIENCY_TELEMETRY', path.join(workspace, 'deliverables/system-test-platform/product-center-lifecycle-efficiency-audit.json'),
    (value): value is { status: string; summary: { telemetryGapCount: number; artifactMissingStageCount: number } } => record(value)
      && ['complete', 'incomplete'].includes(String(value.status)) && record(value.summary)
      && count(value.summary.telemetryGapCount) && count(value.summary.artifactMissingStageCount));
  if (efficiency && (efficiency.status === 'incomplete' || efficiency.summary.telemetryGapCount > 0 || efficiency.summary.artifactMissingStageCount > 0)) {
    add('EFFICIENCY_TELEMETRY', 'open', `全生命周期阶段遥测不完整（${efficiency.summary.telemetryGapCount} 项缺口，${efficiency.summary.artifactMissingStageCount} 个产物缺失）`, '补齐当前阶段产物和统一遥测；真实运行耗时仅从授权执行采集');
  }

  const schedulerRoot = path.join(workspace, 'deliverables/product-center-item');
  let schedulerPath: string | undefined;
  try {
    schedulerPath = fs.readdirSync(schedulerRoot).filter((name) => name.endsWith('-scheduler.json'))
      .map((name) => ({ file: path.join(schedulerRoot, name), mtime: fs.statSync(path.join(schedulerRoot, name)).mtimeMs }))
      .sort((a, b) => b.mtime - a.mtime || a.file.localeCompare(b.file))[0]?.file;
  } catch (error) {
    const missing = (error as NodeJS.ErrnoException).code === 'ENOENT';
    evidence.push({ id: 'ITEM_STRICT_REVALIDATION', status: missing ? 'missing' : 'unreadable' });
    add('ITEM_STRICT_REVALIDATION_EVIDENCE', 'evidence-incomplete', missing ? '严格重验证调度目录缺失' : '严格重验证调度目录不可读取', '恢复调度输入证据后重建摘要');
  }
  if (schedulerPath) {
    const scheduler = read('ITEM_STRICT_REVALIDATION', schedulerPath, statusIn(['running', 'passed', 'completed-with-findings', 'failed', 'blocked']));
    if (scheduler && scheduler.status !== 'passed') {
      add('ITEM_STRICT_REVALIDATION', scheduler.status, '最近严格重验证尚未取得完整通过结果', '读取调度检查点和失败证据后分类恢复；不得仅凭 blocked 推断认证失败');
    }
  } else if (!evidence.some((item) => item.id === 'ITEM_STRICT_REVALIDATION')) {
    evidence.push({ id: 'ITEM_STRICT_REVALIDATION', status: 'missing' });
    add('ITEM_STRICT_REVALIDATION_EVIDENCE', 'evidence-incomplete', '严格重验证调度证据缺失', '恢复调度输入证据后重建摘要');
  }

  const report = {
    schemaVersion: '1.1.0', generatedAt: new Date().toISOString(), status: blockers.length ? 'incomplete' : 'complete',
    scope: 'product-center-blocker-summary', businessExecutionStarted: false, blockerCount: blockers.length, blockers, evidence,
  };
  fs.mkdirSync(path.dirname(output), { recursive: true });
  publishImmutableArtifact({ outputRoot: root, relativePath: path.relative(root, output),
    content: `${JSON.stringify(report, null, 2)}\n`, reason: 'refresh-governance-blocker-summary' });
  return { output, blockerCount: report.blockers.length, status: report.status };
}

if (require.main === module) process.stdout.write(`${JSON.stringify(buildProductCenterBlockerSummary())}\n`);
