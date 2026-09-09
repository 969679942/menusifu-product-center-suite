import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { stableClaimsHash, type GroupDriftComparisonSurface, type GroupDriftDecisionRegistry } from '../utils/product-center-group-semantic-gate';

const projectRoot = path.resolve(__dirname, '..');
const workspaceRoot = path.resolve(projectRoot, '..');
const bindingPath = path.join(projectRoot, 'contracts/product-center/group/product-center-group-bindings.json');
const outputPath = path.join(projectRoot, 'contracts/product-center/group/product-center-group-drift-decisions.json');

function main(): void {
  if (fs.existsSync(outputPath)) throw new Error(`迁移目标已存在，拒绝覆盖：${outputPath}`);
  const bindings = JSON.parse(fs.readFileSync(bindingPath, 'utf8')).cases as Array<{
    caseId: string;
    title: string;
    expectedResults: string[];
    blockedReasons: string[];
    blockEvidencePaths: string[];
    blockClassification: string | null;
  }>;
  const decisions = bindings
    .filter((binding) => binding.blockClassification === 'observed-product-drift')
    .map((binding) => {
      const evidence = [...new Set(binding.blockEvidencePaths)].map((relativePath) => {
        const absolutePath = path.join(workspaceRoot, relativePath);
        if (!fs.existsSync(absolutePath)) throw new Error(`产品偏差证据不存在：${relativePath}`);
        const content = fs.readFileSync(absolutePath);
        return {
          path: relativePath,
          sha256: `sha256:${crypto.createHash('sha256').update(content).digest('hex')}`,
          bytes: content.length,
        };
      });
      return {
        decisionId: `GRP-DRIFT-${binding.caseId}`,
        caseId: binding.caseId,
        ruleId: `test-expectation:${binding.caseId}`,
        sourceRef: `Merchant Center Info/00-待转换测试方案/用例库/商品中心-商品管理-组/2.商品中心-商品管理-组-正式测试用例.md#${binding.caseId}`,
        sourceTitle: binding.title,
        expectedClaims: binding.expectedResults,
        expectedClaimsHash: stableClaimsHash(binding.expectedResults),
        observedClaim: binding.blockedReasons[0] ?? '',
        comparisonSurface: comparisonSurfaceFor(binding.blockedReasons[0] ?? ''),
        evidence,
        decisionStatus: 'evidence-confirmed' as const,
        confirmedBy: 'runtime-evidence-gate',
        decidedAt: new Date().toISOString(),
        rationale: '运行证据确认当前行为与原始测试预期冲突；此登记仅允许产品偏差分类，不代表正式业务规则批准。',
      };
    })
    .sort((left, right) => left.caseId.localeCompare(right.caseId));
  const registry: GroupDriftDecisionRegistry = {
    schemaVersion: '1.0.0',
    registryId: 'product-center-group-drift-decisions',
    generatedAt: new Date().toISOString(),
    decisions,
  };
  fs.writeFileSync(outputPath, `${JSON.stringify(registry, null, 2)}\n`, 'utf8');
  process.stdout.write(JSON.stringify({ outputPath, decisions: decisions.length }, null, 2) + '\n');
}

function comparisonSurfaceFor(reason: string): GroupDriftComparisonSurface {
  if (/错误|提示|禁用|字段/.test(reason)) return 'validation-feedback';
  if (/删除|移除|保留原/.test(reason)) return 'lifecycle';
  if (/不存在|无法进入|无法形成|仅有|未提供|未展示/.test(reason)) return 'ui-capability';
  return 'business-data';
}

if (require.main === module) main();
