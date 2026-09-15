import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { publishImmutableArtifact } from '../utils/immutable-artifact';
const root = process.cwd();
const read = (p: string) => JSON.parse(fs.readFileSync(path.join(root, p), 'utf8').replace(/^\uFEFF/, ''));
const write = (p: string, value: unknown) => publishImmutableArtifact({ outputRoot: root, relativePath: p,
  content: JSON.stringify(value, null, 2) + '\n', reason: 'checkpoint-incomplete-addon016-semantic-repair' });
const resultPath = 'deliverables/system-test-platform/addon016-implementation-checkpoint.json';
const record = {
  schemaVersion: '1.0.0', updatedAt: new Date().toISOString(), status: 'implementation-incomplete',
  businessExecuted: 0, qualifiedAdded: 0, currentQualified: 16, remaining: 188,
  completed: ['撤销无语义依据的映射，保留原始运行报告', '移除 ADD014/015 未执行编辑却声称验证的断言',
    'ADD016 增加尝试身份登记、清理兜底和 UI 列表查询；尚未真实重验'],
  validation: { typecheck: 'passed', architecture: { status: 'failed',
    code: 'ARCHITECTURE_HOTSPOT_LINES_INCREASE', actual: 1656, max: 1636 }, businessRuntime: 'not-started' },
  nextAction: '架构拆分与能力索引已通过；API 认证预检确认缺少 username/password/access-token。补齐运行器支持的凭据来源后，恢复同一 ADD016 执行意图并核对收据登记。',
  humanInputRequired: false, authorization: { status: 'external-authorization-blocked', evidence: 'output/governance/product-center-jenkins-auth-preflight.api.json', missing: ['username', 'password', 'access-token'], configuredNonSecretContext: ['merchant', 'brand'] }, sourceAudit: 'deliverables/system-test-platform/addon-014-016-semantic-correction.json',
  cost: { source: 'get_goal.tokensUsed', start: 3881820, endSample: 3911449, delta: 29629,
    hardPolicyTokens: 12000, enforcement: 'exceeded-recorded-not-achieved', providerBilling: null },
  files: ['flows/product-center/item-216/addon-item-216.flow.ts',
    'contracts/product-center/test-cases/canonical/product-center-item-current-receipt-contract.json'].map(p => ({ path: p,
    sha256: createHash('sha256').update(fs.readFileSync(path.join(root, p))).digest('hex') })),
};
write(resultPath, record);
const goalsPath = 'deliverables/system-test-platform/seven-current-goals.json';
const goals = read(goalsPath);
goals.updatedAt = record.updatedAt;
goals.nextUnit = 'ADD016-name-conflict-flow-extraction-and-directed-validation';
goals.latestImplementationCheckpoint = resultPath;
goals.goals[3].status = 'enforcement-incomplete';
goals.goals[3].latestEvidence = 'goal 计数 3881820→3911449，采样增量29629超过12000；保存原值，不作为供应方账单或业务成本。';
write(goalsPath, goals);
const checkpointPath = 'deliverables/system-test-platform/remediation-checkpoint.json';
const checkpoint = read(checkpointPath);
Object.assign(checkpoint.sevenGoalCheckpoint, { currentResult: resultPath, nextAction: record.nextAction,
  currentQualified: 16, remaining: 188, businessExecutionStarted: false });
write(checkpointPath, checkpoint);
console.log(JSON.stringify({ checkpoint: resultPath, status: record.status, currentQualified: 16, remaining: 188 }));



