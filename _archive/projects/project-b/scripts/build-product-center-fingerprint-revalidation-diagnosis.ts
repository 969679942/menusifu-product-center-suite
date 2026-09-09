import fs from 'node:fs';
import path from 'node:path';

type Plan = {
  changeId: string;
  executionEligibleCaseIds: string[];
  fingerprint: string;
  selectionFingerprint: string;
};

type ImpactManifest = {
  changeId: string;
  defaultImpactType: string;
  impactedCaseIds: string[];
  source?: { module?: string };
};

const projectRoot = path.resolve(__dirname, '..');
const planPath = path.resolve(projectRoot, requiredArgument('plan'));
const impactPath = path.resolve(projectRoot, requiredArgument('impact-manifest'));
const outputPath = path.resolve(projectRoot, requiredArgument('output'));
const plan = readJson<Plan>(planPath);
const impact = readJson<ImpactManifest>(impactPath);
const selectedCaseIds = [...new Set(plan.executionEligibleCaseIds)].sort();
const impactedCaseIds = [...new Set(impact.impactedCaseIds)].sort();
if (plan.changeId !== impact.changeId) throw new Error('FINGERPRINT_REVALIDATION_DIAGNOSIS_CHANGE_ID_MISMATCH');
if (selectedCaseIds.join(',') !== impactedCaseIds.join(',')) {
  throw new Error('FINGERPRINT_REVALIDATION_DIAGNOSIS_SELECTION_MISMATCH');
}
if (selectedCaseIds.length === 0) throw new Error('FINGERPRINT_REVALIDATION_DIAGNOSIS_SELECTION_EMPTY');

const moduleName = impact.source?.module ?? inferModule(selectedCaseIds);
const diagnosis = {
  schemaVersion: '1.0.0',
  applicationId: 'merchant-center-product-center',
  caseIds: selectedCaseIds,
  classification: impact.defaultImpactType,
  phase: 'pre-execution-repair-governance',
  rootCause: rootCause(moduleName, impact.defaultImpactType),
  correctiveAction: `仅执行当前计划中的 ${selectedCaseIds.length} 条${moduleLabel(moduleName)}定向重验证用例；逐条保存操作、断言、上下文与清理收据，独立失败继续执行并按产品、自动化、证据、环境或瞬时平台问题分类。`,
  evidenceRefs: [
    path.relative(projectRoot, impactPath).replaceAll(path.sep, '/'),
    path.relative(projectRoot, planPath).replaceAll(path.sep, '/'),
    'deliverables/system-test-platform/product-center-asset-lifecycle.json',
    'deliverables/system-test-platform/product-center-asset-remediation-queues.json',
  ],
  planFingerprint: plan.fingerprint,
  selectionFingerprint: plan.selectionFingerprint,
  existingPassedCasesImpact: '仅重验当前整改队列用例；指纹匹配的既有通过结果保持不变。',
  rerunScope: selectedCaseIds,
};

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(`${outputPath}.tmp`, `${JSON.stringify(diagnosis, null, 2)}\n`, 'utf8');
fs.renameSync(`${outputPath}.tmp`, outputPath);
process.stdout.write(`${JSON.stringify({ module: moduleName, caseCount: selectedCaseIds.length, output: outputPath })}\n`);

function rootCause(moduleName: string, impactType: string): string {
  if (impactType === 'evidence-gap') {
    return `${moduleLabel(moduleName)}历史收据缺少可证明当前逐案语义指纹的谱系，不能通过批量替换指纹继续授权 passed；当前用例、绑定和执行路由已具备，只缺当前标准执行收据。`;
  }
  return `${moduleLabel(moduleName)}整改队列显示当前实现、用例或上下文指纹与历史标准收据不一致；历史结果保留但不能授权当前状态，必须按当前稳定实现定向重验证。`;
}

function moduleLabel(moduleName: string): string {
  return ({ item: '商品', group: '组', seasoning: '调味', image: '图片', tag: '标签' } as Record<string, string>)[moduleName]
    ?? moduleName;
}

function inferModule(caseIds: readonly string[]): string {
  const modules = new Set(caseIds.map((caseId) => {
    if (caseId.startsWith('TC-ITEM-')) return 'item';
    if (caseId.startsWith('TC-GRP-')) return 'group';
    if (caseId.startsWith('TC-FLV-')) return 'seasoning';
    if (caseId.startsWith('TC-IMG-')) return 'image';
    if (caseId.startsWith('TC-TAG-')) return 'tag';
    return 'unknown';
  }));
  if (modules.size !== 1) throw new Error(`FINGERPRINT_REVALIDATION_DIAGNOSIS_MODULE_AMBIGUOUS:${[...modules].join(',')}`);
  return [...modules][0];
}

function readJson<T>(filePath: string): T {
  if (!fs.existsSync(filePath)) throw new Error(`FINGERPRINT_REVALIDATION_DIAGNOSIS_INPUT_MISSING:${filePath}`);
  return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T;
}

function requiredArgument(name: string): string {
  const value = argument(name)?.trim();
  if (!value) throw new Error(`FINGERPRINT_REVALIDATION_DIAGNOSIS_ARGUMENT_REQUIRED:${name}`);
  return value;
}

function argument(name: string): string | undefined {
  const prefix = `--${name}=`;
  return process.argv.find((value) => value.startsWith(prefix))?.slice(prefix.length);
}
