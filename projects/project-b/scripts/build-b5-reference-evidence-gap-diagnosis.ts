import fs from 'node:fs';
import path from 'node:path';

type Plan = {
  executionEligibleCaseIds: string[];
  fingerprint: string;
  selectionFingerprint: string;
};

const projectRoot = path.resolve(__dirname, '..');
const deliverablesRoot = path.join(projectRoot, 'deliverables/system-test-platform');
const planPath = path.resolve(projectRoot, argument('plan')
  ?? path.join(deliverablesRoot, 'b5-reference-evidence-gap-optimization-plan-20260905.json'));
const plan = JSON.parse(fs.readFileSync(planPath, 'utf8')) as Plan;
const outputPath = path.resolve(projectRoot, argument('output')
  ?? path.join(deliverablesRoot, 'b5-reference-evidence-gap-repair-diagnosis-20260905.json'));
const diagnosis = {
  schemaVersion: '1.0.0',
  applicationId: 'merchant-center-product-center',
  caseIds: [...plan.executionEligibleCaseIds].sort(),
  classification: 'evidence-gap',
  phase: 'pre-execution-repair-governance',
  rootCause: '当前组用例具备来源、绑定和唯一执行路由，但缺少与当前用例指纹、业务实现指纹和执行上下文一致的完整标准收据；B5 v2 因并发会话 teardown 阻断，B5 v3 因旧计划实现指纹过期而在浏览器前阻断，均没有业务写入。',
  correctiveAction: '仅执行优化计划中 84 条 evidence-gap 影响用例，逐条保存操作、断言、清理和失败诊断收据；独立用例失败后继续，非业务失败自动修复，TC-GRP-PKG-040 不进入选择集。',
  evidenceRefs: [
    'deliverables/system-test-platform/b5-reference-evidence-gap-impact-20260905.json',
    path.relative(projectRoot, planPath).replaceAll(path.sep, '/'),
    'deliverables/system-test-platform/b5-reference-evidence-gap-v2-checkpoint-20260905.json',
    'deliverables/system-test-platform/b5-reference-evidence-gap-v3-checkpoint-20260905.json',
  ],
  planFingerprint: plan.fingerprint,
  selectionFingerprint: plan.selectionFingerprint,
  existingPassedCasesImpact: 'unchanged',
  rerunScope: [...plan.executionEligibleCaseIds].sort(),
};
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(`${outputPath}.tmp`, `${JSON.stringify(diagnosis, null, 2)}\n`, 'utf8');
fs.renameSync(`${outputPath}.tmp`, outputPath);
process.stdout.write(`${JSON.stringify({ caseCount: diagnosis.caseIds.length, outputPath })}\n`);

function argument(name: string): string | undefined {
  const prefix = `--${name}=`;
  return process.argv.find((value) => value.startsWith(prefix))?.slice(prefix.length);
}
