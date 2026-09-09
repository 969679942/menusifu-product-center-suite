import fs from 'node:fs';
import path from 'node:path';
import { buildProductCenterGroupRemainingLedger } from '../utils/product-center-group-remaining-ledger';

const projectRoot = path.resolve(__dirname, '..');
const bindingsPath = path.join(projectRoot, 'contracts/product-center/group/product-center-group-bindings.json');
const outputRoot = path.resolve(projectRoot, '..', 'deliverables/product-center-group');
const bindings = JSON.parse(fs.readFileSync(bindingsPath, 'utf8')) as { cases: Parameters<typeof buildProductCenterGroupRemainingLedger>[0]['bindings'] };
const ledger = buildProductCenterGroupRemainingLedger({ projectRoot, bindings: bindings.cases });
fs.mkdirSync(outputRoot, { recursive: true });
fs.writeFileSync(path.join(outputRoot, 'remaining-58-ledger.json'), `${JSON.stringify(ledger, null, 2)}\n`, 'utf8');
fs.writeFileSync(path.join(outputRoot, 'remaining-58-summary.md'), [
  '# 商品管理组原 58 条处理台账',
  '',
  `- 原始队列：${ledger.summary.cohortTotal}`,
  `- 已由自动化闭环：${ledger.summary.automatedClosed}`,
  `- 当前剩余：${ledger.summary.remaining}`,
  `- 产品发现：${ledger.summary.productFindings}`,
  `- 当前证据与清理完整：${ledger.summary.productFindingsEvidenceComplete}`,
  `- 必须严格重放：${ledger.summary.strictReplayRequired}`,
  `- 行业服务授权缺失：${ledger.summary.industryAuthorizationRequired}`,
  `- 终端驱动缺失：${ledger.summary.terminalCapabilityRequired}`,
  `- 自动化实现缺口：${ledger.summary.automationGap}`,
  '',
  '产品发现不等于用例通过，也不会自动升级为正式业务规则。',
  '',
].join('\n'), 'utf8');
process.stdout.write(`${JSON.stringify(ledger.summary)}\n`);
