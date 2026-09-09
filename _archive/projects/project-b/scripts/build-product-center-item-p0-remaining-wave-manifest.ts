import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { loadProductCenterItemRemainingWaveEvidence } from '../utils/product-center-item-remaining-wave-evidence';
import { loadProductCenterItemConflictDecisions } from '../utils/product-center-item-conflict-decisions';

type TechnicalStatus = {
  fingerprint: string;
  remainingWaveEvidence: { caseIds: string[] };
};

type WaveDefinition = {
  waveId: string;
  name: string;
  caseIds: string[];
  safetyLevel: string;
  mutationMode: string;
  accessScope: 'merchant-center' | 'merchant-center-and-channel' | 'external-terminal-required';
  readiness: 'authenticated-ui-required' | 'blocked-until-terminal-access';
  sharedChain: string;
  reusableEvidencePaths: string[];
  requiredEvidence: string[];
  cleanupProtocol: string[];
};

const waves: WaveDefinition[] = [
  {
    waveId: 'W1',
    name: '列表、类型选择与三类创建页结构',
    caseIds: [
      'TC-ITEM-STD-002', 'TC-ITEM-ADD-001', 'TC-ITEM-ADD-029', 'TC-ITEM-ADD-030',
      'TC-ITEM-ADD-031', 'TC-ITEM-ADD-032', 'TC-ITEM-PKG-001',
    ],
    safetyLevel: 'L0-read-only',
    mutationMode: 'none',
    accessScope: 'merchant-center',
    readiness: 'authenticated-ui-required',
    sharedChain: '登录一次，依次进入商品列表、商品类型选择及三类创建页，只观察可见字段与入口，不提交。',
    reusableEvidencePaths: [
      'contracts/product-center/test-cases/canonical/product-center-item-page-gap.json',
      'output/page-contract/product-center-page-contract-observation.json',
    ],
    requiredEvidence: ['route、页面状态、可见字段和入口的当前 DOM/截图证据'],
    cleanupProtocol: ['关闭未提交页面并确认没有商品创建 mutation'],
  },
  {
    waveId: 'W2',
    name: '必填、格式、数值与分类拒绝矩阵',
    caseIds: [
      'TC-ITEM-STD-039', 'TC-ITEM-STD-093', 'TC-ITEM-STD-021', 'TC-ITEM-STD-022',
      'TC-ITEM-STD-023', 'TC-ITEM-STD-097', 'TC-ITEM-STD-043', 'TC-ITEM-ADD-006',
      'TC-ITEM-ADD-008', 'TC-ITEM-ADD-047', 'TC-ITEM-ADD-010', 'TC-ITEM-ADD-048',
      'TC-ITEM-ADD-016', 'TC-ITEM-PKG-015', 'TC-ITEM-PKG-019', 'TC-ITEM-PKG-077',
      'TC-ITEM-PKG-026', 'TC-ITEM-PKG-076', 'TC-ITEM-PKG-013',
    ],
    safetyLevel: 'L1-controlled-negative',
    mutationMode: 'submit-intent-no-record-expected',
    accessScope: 'merchant-center',
    readiness: 'authenticated-ui-required',
    sharedChain: '每种商品复用一个创建页会话，原位切换无效输入并逐项提交，记录前端与后端拒绝终态。',
    reusableEvidencePaths: [
      'output/audit/product-center-item-p0-wave-a-AUTO_AUDIT_P0_WAVE_A_20260729_20.json',
      'output/audit/product-center-item-p0-wave-d-AUTO_AUDIT_P0_WAVE_D_20260731_14.json',
    ],
    requiredEvidence: ['字段输入、提交意图、校验文案、mutation 是否发生、列表/API 前后不变'],
    cleanupProtocol: ['每次提交后按唯一身份与响应 ID 对账', '若意外落库则按 ID 删除并验证 UI/API 双零残留'],
  },
  {
    waveId: 'W3',
    name: '编码、同名与跨类型重复约束',
    caseIds: [
      'TC-ITEM-STD-010', 'TC-ITEM-STD-044', 'TC-ITEM-ADD-014',
      'TC-ITEM-ADD-015', 'TC-ITEM-PKG-024', 'TC-ITEM-PKG-025',
    ],
    safetyLevel: 'L3-shared-seed-mutation',
    mutationMode: 'seed-create-and-negative-submit',
    accessScope: 'merchant-center',
    readiness: 'authenticated-ui-required',
    sharedChain: '建立一次共享分类与最少 seed，跨三类创建页验证重复约束，严禁操作现存固定记录。',
    reusableEvidencePaths: ['output/audit/product-center-item-p0-wave-d-AUTO_AUDIT_P0_WAVE_D_20260731_14.json'],
    requiredEvidence: ['seed 服务端 ID、重复提交请求、拒绝终态、原 seed 保持不变'],
    cleanupProtocol: ['先清理引用，再按服务端 ID 删除 seed', 'UI/API 搜索全部身份变体并证明零残留'],
  },
  {
    waveId: 'W4',
    name: '标准商品正向创建、格式化、多规格与称重',
    caseIds: [
      'TC-ITEM-STD-036', 'TC-ITEM-STD-037', 'TC-ITEM-STD-008',
      'TC-ITEM-STD-016', 'TC-ITEM-STD-017', 'TC-ITEM-STD-018',
    ],
    safetyLevel: 'L3-create-mutation',
    mutationMode: 'create',
    accessScope: 'merchant-center',
    readiness: 'authenticated-ui-required',
    sharedChain: '共享一个自建规格组，连续完成六个独立商品结果，最后在列表和 API 集中回查。',
    reusableEvidencePaths: ['output/audit/product-center-item-p0-wave-c-AUTO_AUDIT_P0_WAVE_C_20260730_13.json'],
    requiredEvidence: ['创建请求与响应 ID、格式化终态、规格/称重配置、列表/API 一致性'],
    cleanupProtocol: ['按服务端 ID 删除六个商品', '删除自建规格组', '验证 UI/API 双零残留'],
  },
  {
    waveId: 'W5',
    name: '图片、标签、角标与默认选中边界',
    caseIds: [
      'TC-ITEM-STD-081', 'TC-ITEM-STD-090', 'TC-ITEM-STD-091', 'TC-ITEM-STD-089',
      'TC-ITEM-ADD-046', 'TC-ITEM-PKG-073', 'TC-ITEM-PKG-074', 'TC-ITEM-PKG-075',
    ],
    safetyLevel: 'L3-resource-mutation',
    mutationMode: 'mixed-create-update',
    accessScope: 'merchant-center',
    readiness: 'authenticated-ui-required',
    sharedChain: '三类商品各使用一个临时商品，共享标签、角标和选项资源，仅在需要持久化时保存。',
    reusableEvidencePaths: [
      'output/audit/product-center-item-p0-wave-c-AUTO_AUDIT_P0_WAVE_C_20260730_13.json',
      'output/audit/product-center-item-p0-wave-d-AUTO_AUDIT_P0_WAVE_D_20260731_14.json',
    ],
    requiredEvidence: ['资源选择/上传、边界配置、保存响应、编辑页和列表回显'],
    cleanupProtocol: ['先解除商品资源引用', '删除临时商品与自建资源', '验证图片、资源、商品 UI/API 双零残留'],
  },
  {
    waveId: 'W6',
    name: '三类商品编辑与组内配置隔离',
    caseIds: [
      'TC-ITEM-STD-032', 'TC-ITEM-STD-087', 'TC-ITEM-STD-088', 'TC-ITEM-ADD-024',
      'TC-ITEM-PKG-035', 'TC-ITEM-PKG-069', 'TC-ITEM-PKG-071', 'TC-ITEM-PKG-072',
    ],
    safetyLevel: 'L3-update-mutation',
    mutationMode: 'create-and-update',
    accessScope: 'merchant-center',
    readiness: 'authenticated-ui-required',
    sharedChain: '共享口味、做法、加料组和三类临时商品，编辑后验证商品内配置与主数据隔离。',
    reusableEvidencePaths: [
      'output/audit/product-center-item-p0-wave-c-AUTO_AUDIT_P0_WAVE_C_20260730_13.json',
      'output/audit/product-center-item-p0-wave-d-AUTO_AUDIT_P0_WAVE_D_20260731_14.json',
    ],
    requiredEvidence: ['创建/更新 ID、编辑前后差异、主数据未变、列表/API 回查'],
    cleanupProtocol: ['先删除商品引用', '再删除组与资源', '验证原名、编辑名及 ID 的 UI/API 双零残留'],
  },
  {
    waveId: 'W7',
    name: '加料与套餐删除、引用阻断和确认弹窗',
    caseIds: [
      'TC-ITEM-ADD-026', 'TC-ITEM-ADD-027', 'TC-ITEM-ADD-028', 'TC-ITEM-ADD-034',
      'TC-ITEM-ADD-036', 'TC-ITEM-PKG-037', 'TC-ITEM-PKG-038',
    ],
    safetyLevel: 'L3-delete-mutation',
    mutationMode: 'create-reference-delete',
    accessScope: 'merchant-center',
    readiness: 'authenticated-ui-required',
    sharedChain: '在一个列表会话中使用临时商品共享菜单、加料组和标准商品引用，依次观察阻断与最终删除。',
    reusableEvidencePaths: ['output/audit/product-center-item-p0-wave-b-AUTO_AUDIT_P0_WAVE_B_20260730_09.json'],
    requiredEvidence: ['删除预检、二次确认、最终 DELETE、引用阻断、UI/API 终态'],
    cleanupProtocol: ['禁止删除现存记录', '先解除引用再删除临时实体', '对全部身份变体与 ID 做联合零残留扫描'],
  },
  {
    waveId: 'W8',
    name: '三类商品停用、下发与渠道不可见',
    caseIds: ['TC-ITEM-STD-067', 'TC-ITEM-ADD-044', 'TC-ITEM-PKG-039'],
    safetyLevel: 'L3-cross-channel-mutation',
    mutationMode: 'status-update-and-publish',
    accessScope: 'merchant-center-and-channel',
    readiness: 'authenticated-ui-required',
    sharedChain: '共享一个测试菜单绑定三类临时商品，逐一探测停用；若命中菜单引用阻断则记录 canonical conflict 并跳过下发。',
    reusableEvidencePaths: ['output/audit/product-center-item-p0-wave-b-AUTO_AUDIT_P0_WAVE_B_20260730_09.json'],
    requiredEvidence: ['状态更新响应、目标商品 ID、BITEM-2013 引用阻断、API/UI 状态保持启用、下发跳过原因'],
    cleanupProtocol: ['删除菜单引用后清理商品', '验证 Merchant Center、UI 与渠道三侧零残留'],
  },
  {
    waveId: 'W9',
    name: '称重商品终端皮重边界',
    caseIds: ['TC-ITEM-STD-080'],
    safetyLevel: 'L3-external-terminal-transaction',
    mutationMode: 'product-create-and-terminal-transaction',
    accessScope: 'external-terminal-required',
    readiness: 'blocked-until-terminal-access',
    sharedChain: '创建唯一称重商品，在可控终端输入小于皮重的重量，核对金额为零并取消交易。',
    reusableEvidencePaths: [],
    requiredEvidence: ['商品 ID、终端交易输入、金额终态、取消交易结果、订单与商品残留扫描'],
    cleanupProtocol: ['取消终端交易并验证无订单残留', '按服务端 ID 删除称重商品', 'Merchant Center、终端及 API 联合零残留'],
  },
];

export function buildProductCenterItemP0RemainingWaveManifest(options: {
  projectRoot?: string;
  generatedAt?: string;
} = {}) {
  const projectRoot = path.resolve(options.projectRoot ?? path.resolve(__dirname, '..'));
  const statusPath = path.join(
    projectRoot,
    'contracts/product-center/test-cases/canonical/product-center-item-current-technical-status.json',
  );
  const status = readJson<TechnicalStatus>(statusPath);
  const remainingWaveEvidence = loadProductCenterItemRemainingWaveEvidence(projectRoot);
  const conflictDecisions = loadProductCenterItemConflictDecisions(projectRoot);
  if (!sameSet(conflictDecisions.caseIds, remainingWaveEvidence.canonicalConflictCaseIds)) {
    throw new Error('C01-C09 决策未精确覆盖 manifest canonical conflict');
  }
  const reconciled = new Set(conflictDecisions.updateCanonicalCaseIds);
  const productDefects = new Set(conflictDecisions.productDefectOpenCaseIds);
  const productRuleConfirmations = new Set(conflictDecisions.productRuleConfirmationRequiredCaseIds);
  const targetCaseIds = status.remainingWaveEvidence.caseIds.slice().sort();
  const manifestCaseIds = waves.flatMap((wave) => wave.caseIds);
  assertUnique(manifestCaseIds, '剩余 P0 共享波次存在重复用例');
  if (!sameSet(targetCaseIds, manifestCaseIds)) {
    const missing = targetCaseIds.filter((caseId) => !manifestCaseIds.includes(caseId));
    const unexpected = manifestCaseIds.filter((caseId) => !targetCaseIds.includes(caseId));
    throw new Error(`剩余 P0 共享波次分母漂移：missing=${missing.join(',')};unexpected=${unexpected.join(',')}`);
  }
  const productTypes = {
    standard: manifestCaseIds.filter((caseId) => caseId.includes('-STD-')).length,
    addon: manifestCaseIds.filter((caseId) => caseId.includes('-ADD-')).length,
    combo: manifestCaseIds.filter((caseId) => caseId.includes('-PKG-')).length,
  };
  const normalizedWaves = waves.map((wave) => {
    const evidence = remainingWaveEvidence.waves.find((item) => item.waveId === wave.waveId);
    if (!evidence || !sameSet(wave.caseIds, evidence.caseIds)) {
      throw new Error(`${wave.waveId} manifest 与运行证据分母不一致`);
    }
    const acceptedAfterReconciliationCount = evidence.canonicalConflictCaseIds
      .filter((caseId) => reconciled.has(caseId)).length;
    const productDefectOpenCount = evidence.canonicalConflictCaseIds
      .filter((caseId) => productDefects.has(caseId)).length;
    const productRuleConfirmationRequiredCount = evidence.canonicalConflictCaseIds
      .filter((caseId) => productRuleConfirmations.has(caseId)).length;
    return {
      ...wave,
      readiness: wave.waveId === 'W9'
        ? 'blocked-until-terminal-access' as const
        : 'executed' as const,
      evidencePath: evidence.evidencePath,
      evidenceSha256: evidence.sha256,
      acceptedCount: evidence.acceptedCaseIds.length,
      canonicalConflictCount: evidence.canonicalConflictCaseIds.length,
      acceptedAfterReconciliationCount,
      effectiveAcceptedCount: evidence.acceptedCaseIds.length + acceptedAfterReconciliationCount,
      unresolvedCanonicalConflictCount: evidence.canonicalConflictCaseIds.length - acceptedAfterReconciliationCount,
      productDefectOpenCount,
      productRuleConfirmationRequiredCount,
      blockedCount: evidence.blockedCaseIds.length,
      harnessErrorCount: evidence.harnessErrorCaseIds.length,
      cleanupVerified: evidence.cleanupVerified,
      caseCount: wave.caseIds.length,
      executionMode: 'wave-shared-chain' as const,
      caseLevelExecutionAllowed: false as const,
    };
  });
  const semanticValue = {
    source: {
      technicalStatusPath: relativePath(projectRoot, statusPath),
      technicalStatusFingerprint: status.fingerprint,
      runtimeEvidenceFingerprints: Object.fromEntries(remainingWaveEvidence.waves.map((wave) => [
        wave.waveId,
        wave.sha256,
      ])),
      conflictDecisionPath: relativePath(projectRoot, conflictDecisions.filePath),
      conflictDecisionFingerprint: conflictDecisions.sha256,
    },
    selection: {
      priority: 'P0' as const,
      currentStatus: 'page-observation-required' as const,
      canonicalStatus: 'active' as const,
    },
    summary: {
      total: manifestCaseIds.length,
      waves: normalizedWaves.length,
      productTypes,
      existingBusinessObservationReusable: 0,
      accepted: remainingWaveEvidence.acceptedCaseIds.length,
      canonicalConflict: remainingWaveEvidence.canonicalConflictCaseIds.length,
      effectiveAccepted: remainingWaveEvidence.acceptedCaseIds.length + conflictDecisions.updateCanonicalCaseIds.length,
      acceptedAfterReconciliation: conflictDecisions.updateCanonicalCaseIds.length,
      unresolvedCanonicalConflict: remainingWaveEvidence.canonicalConflictCaseIds.length
        - conflictDecisions.updateCanonicalCaseIds.length,
      productDefectOpen: conflictDecisions.productDefectOpenCaseIds.length,
      productRuleConfirmationRequired: conflictDecisions.productRuleConfirmationRequiredCaseIds.length,
      blocked: remainingWaveEvidence.blockedCaseIds.length,
      harnessError: remainingWaveEvidence.harnessErrorCaseIds.length,
      authenticatedUiRequired: 0,
      externalTerminalRequired: remainingWaveEvidence.blockedCaseIds.length,
    },
    executionPolicy: {
      mode: 'wave-shared-chain' as const,
      caseLevelExecutionAllowed: false as const,
      uniqueBusinessIdentityRequired: true as const,
      serverIdsRecordedImmediately: true as const,
      nonIdempotentReplayRequiresReconciliation: true as const,
      cleanupInFinally: true as const,
      uiAndApiZeroResidueRequired: true as const,
      authenticationArtifactsPersisted: false as const,
      businessRulesMayBeInferredFromUi: false as const,
    },
    waves: normalizedWaves,
  };
  const document = {
    schemaVersion: '1.1.0' as const,
    collectionId: 'product-center-item-p0-remaining-waves' as const,
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    status: 'executed-with-reconciled-conflicts-and-terminal-gate' as const,
    ...semanticValue,
    fingerprint: hashValue(semanticValue),
  };
  if (document.summary.total !== 65
    || document.summary.waves !== 9
    || document.summary.productTypes.standard !== 25
    || document.summary.productTypes.addon !== 21
    || document.summary.productTypes.combo !== 19
    || document.summary.accepted !== 45
    || document.summary.canonicalConflict !== 19
    || document.summary.effectiveAccepted !== 54
    || document.summary.acceptedAfterReconciliation !== 9
    || document.summary.unresolvedCanonicalConflict !== 10
    || document.summary.productDefectOpen !== 6
    || document.summary.productRuleConfirmationRequired !== 4
    || document.summary.blocked !== 1
    || document.summary.harnessError !== 0) {
    throw new Error(`剩余 P0 共享波次数量漂移：${JSON.stringify(document.summary)}`);
  }
  const outputRoot = path.join(projectRoot, 'contracts/product-center/test-manifests');
  const jsonPath = path.join(outputRoot, 'product-center-item-p0-remaining-waves.json');
  const markdownPath = path.join(outputRoot, 'product-center-item-p0-remaining-waves.md');
  writeText(jsonPath, `${JSON.stringify(document, null, 2)}\n`);
  writeText(markdownPath, renderMarkdown(document));
  return { document, jsonPath, markdownPath };
}

function renderMarkdown(document: ReturnType<typeof buildProductCenterItemP0RemainingWaveManifest>['document']): string {
  return `${[
    '# 商品中心剩余 P0 共享波次',
    '',
    `- 状态：${document.status}`,
    `- 用例：${document.summary.total}`,
    `- 波次：${document.summary.waves}`,
    `- 商品类型：标准=${document.summary.productTypes.standard}；加料=${document.summary.productTypes.addon}；套餐=${document.summary.productTypes.combo}`,
    `- 执行结果：accepted=${document.summary.accepted}；canonical-conflict=${document.summary.canonicalConflict}；blocked=${document.summary.blocked}；harness-error=${document.summary.harnessError}`,
    `- 决策后结果：effective-accepted=${document.summary.effectiveAccepted}；reconciled=${document.summary.acceptedAfterReconciliation}；unresolved=${document.summary.unresolvedCanonicalConflict}；product-defect=${document.summary.productDefectOpen}；needs-PRD=${document.summary.productRuleConfirmationRequired}`,
    '- 执行原则：禁止逐条运行；所有写操作必须对账、登记 ID、finally cleanup、UI/API 双零残留。',
    '',
    ...document.waves.flatMap((wave) => [
      `## ${wave.waveId} ${wave.name}`,
      '',
      `- 数量：${wave.caseCount}`,
      `- 安全等级：${wave.safetyLevel}`,
      `- 就绪状态：${wave.readiness}`,
      `- 结果：accepted=${wave.acceptedCount}；canonical-conflict=${wave.canonicalConflictCount}；blocked=${wave.blockedCount}；harness-error=${wave.harnessErrorCount}`,
      `- 决策后：effective-accepted=${wave.effectiveAcceptedCount}；reconciled=${wave.acceptedAfterReconciliationCount}；unresolved=${wave.unresolvedCanonicalConflictCount}；product-defect=${wave.productDefectOpenCount}；needs-PRD=${wave.productRuleConfirmationRequiredCount}`,
      `- 证据：${wave.evidencePath} (${wave.evidenceSha256})`,
      `- 共享链：${wave.sharedChain}`,
      `- 用例：${wave.caseIds.join('、')}`,
      `- 所需证据：${wave.requiredEvidence.join('；')}`,
      `- 清理：${wave.cleanupProtocol.join('；')}`,
      '',
    ]),
  ].join('\n').trim()}\n`;
}

function readJson<T>(filePath: string): T {
  return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T;
}

function writeText(filePath: string, content: string): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.${process.pid}.tmp`;
  fs.writeFileSync(temporaryPath, content, 'utf8');
  fs.renameSync(temporaryPath, filePath);
}

function assertUnique(values: readonly string[], message: string): void {
  if (new Set(values).size !== values.length) throw new Error(message);
}

function sameSet(left: readonly string[], right: readonly string[]): boolean {
  return [...left].sort().join(',') === [...right].sort().join(',');
}

function relativePath(rootPath: string, filePath: string): string {
  return path.relative(rootPath, filePath).replace(/\\/g, '/');
}

function hashValue(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

if (require.main === module) {
  try {
    const { document, jsonPath } = buildProductCenterItemP0RemainingWaveManifest();
    process.stdout.write(`剩余 P0 共享波次已生成：${jsonPath}\n${document.summary.waves} 波覆盖 ${document.summary.total} 条\n`);
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
