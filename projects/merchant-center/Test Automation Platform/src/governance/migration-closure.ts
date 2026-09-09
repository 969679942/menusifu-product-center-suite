import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

export type MigrationOwnershipCategory =
  | 'public-core'
  | 'project-adapter'
  | 'domain-asset'
  | 'generated-evidence'
  | 'history'
  | 'transient';

export type MigrationClosureManifest = {
  schemaVersion: '1.0.0';
  auditId: string;
  applicationId: string;
  roots: Array<{
    id: string;
    path: string;
  }>;
  exclusions: Array<{
    id: string;
    rootId: string;
    patterns: string[];
    reason: string;
  }>;
  ownershipRules: Array<{
    id: string;
    rootId: string;
    category: MigrationOwnershipCategory;
    patterns: string[];
    rationale: string;
  }>;
  bridgeGroups: Array<{
    id: string;
    projectRootId: string;
    projectDirectory: string;
    platformRootId: string;
    platformDirectory: string;
    requireEveryPlatformFile: boolean;
    adapterFiles?: string[];
    ignoredPlatformFiles?: string[];
  }>;
  exactDuplicateScan?: {
    platformRootId: string;
    platformPatterns: string[];
    projectRootId: string;
    projectPatterns: string[];
  };
  importScans: Array<{
    rootId: string;
    patterns: string[];
  }>;
  packageScripts: Array<{
    rootId: string;
    path: string;
  }>;
  structuredReferences: Array<{
    id: string;
    scanRootId: string;
    scanPatterns: string[];
    prefix: string;
    targetRootId: string;
    missingDisposition?: 'blocking' | 'historical-diagnostic';
    targetAliases?: Array<{
      from: string;
      to: string;
      reason: string;
    }>;
  }>;
  legacySources: Array<{
    id: string;
    rootId: string;
    path: string;
    documentationPath: string;
    requiredMarkerWhileReferenced: string;
  }>;
  transientPolicies: Array<{
    id: string;
    rootId: string;
    patterns: string[];
    allowedPatterns: string[];
  }>;
  publicBoundary?: {
    rootId: string;
    forbiddenPatterns: string[];
    forbiddenPathPatterns?: string[];
  };
  contentPolicies?: Array<{
    id: string;
    rootId: string;
    patterns: string[];
    forbiddenPatterns: string[];
  }>;
  requiredAssets?: Array<{
    id: string;
    rootId: string;
    paths: string[];
  }>;
  inventory?: {
    rootId: string;
    baselinePath: string;
    acceptanceReceiptPath: string;
    categories?: MigrationOwnershipCategory[];
  };
  outputs: {
    rootId: string;
    jsonPath: string;
    markdownPath: string;
  };
};

export type MigrationClosureFailure = {
  code: string;
  path: string;
  detail: string;
};

export type MigrationClosureReport = {
  schemaVersion: '1.0.0';
  auditId: string;
  applicationId: string;
  scope: 'migration-closure';
  status: 'complete' | 'incomplete';
  inputFingerprint: string;
  universalPlatformCompletionAsserted: false;
  summary: {
    scannedFiles: number;
    excludedDirectories: number;
    publicCore: number;
    projectAdapter: number;
    domainAsset: number;
    generatedEvidence: number;
    history: number;
    transient: number;
    unowned: number;
    bridgeViolations: number;
    duplicateImplementations: number;
    brokenReferences: number;
    documentationContradictions: number;
    misplacedTransients: number;
    publicBoundaryViolations: number;
    contentPolicyViolations: number;
    requiredAssetMissing: number;
    inventoryBaselineMissing: number;
    inventoryMissing: number;
    inventoryChanged: number;
    inventoryAcceptanceInvalid: number;
    historicalReferenceGaps: number;
  };
  ownership: Array<{
    rootId: string;
    path: string;
    category: MigrationOwnershipCategory;
    ruleId: string;
  }>;
  excluded: Array<{
    rootId: string;
    path: string;
    exclusionId: string;
    reason: string;
  }>;
  failures: {
    unowned: MigrationClosureFailure[];
    bridgeViolations: MigrationClosureFailure[];
    duplicateImplementations: MigrationClosureFailure[];
    brokenReferences: MigrationClosureFailure[];
    documentationContradictions: MigrationClosureFailure[];
    misplacedTransients: MigrationClosureFailure[];
    publicBoundaryViolations: MigrationClosureFailure[];
    contentPolicyViolations: MigrationClosureFailure[];
    requiredAssetMissing: MigrationClosureFailure[];
    inventory: MigrationClosureFailure[];
  };
  retainedLegacySources: Array<{
    id: string;
    path: string;
    activeReferenceFiles: number;
    activeReferenceTargets: number;
    disposition: 'retained-with-active-references' | 'eligible-for-disposition-review';
  }>;
  historicalReferenceGaps: MigrationClosureFailure[];
  inventory: {
    baselinePath: string | null;
    baselineFingerprint: string | null;
    currentFingerprint: string | null;
    missing: MigrationClosureFailure[];
    changed: MigrationClosureFailure[];
  };
};

export type MigrationInventoryEntry = {
  rootId: string;
  path: string;
  category: MigrationOwnershipCategory;
  ruleId: string;
  bytes: number;
  sha256: string;
};

export type MigrationInventoryBaseline = {
  schemaVersion: '1.0.0';
  auditId: string;
  applicationId: string;
  entries: MigrationInventoryEntry[];
  fingerprint: string;
};

export type MigrationInventoryAcceptanceReceipt = {
  schemaVersion: '1.0.0';
  auditId: string;
  applicationId: string;
  approvedBy: string;
  reason: string;
  acceptedAt: string;
  previousFingerprint: string | null;
  acceptedFingerprint: string;
  changes: {
    added: string[];
    removed: string[];
    changed: string[];
  };
  previousReceiptHash: string | null;
  receiptHash: string;
};

type MigrationInventoryAcceptanceTransaction = {
  schemaVersion: '1.0.0';
  baseline: MigrationInventoryBaseline;
  receipt: MigrationInventoryAcceptanceReceipt;
};

type ResolvedRoot = {
  id: string;
  absolutePath: string;
};

type ScannedFile = {
  rootId: string;
  relativePath: string;
  absolutePath: string;
  bytes: number;
  modifiedMs: number;
  sha256?: string;
  category?: MigrationOwnershipCategory;
  ruleId?: string;
};

type StructuredReference = {
  sourceRootId: string;
  sourcePath: string;
  value: string;
  targetRootId: string;
  targetPath: string;
  resolvedTargetPath: string;
  absoluteTarget: string;
  exists: boolean;
  missingDisposition: 'blocking' | 'historical-diagnostic';
};

export function loadMigrationClosureManifest(manifestPath: string): MigrationClosureManifest {
  return JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as MigrationClosureManifest;
}

export function auditMigrationClosureFile(manifestPath: string): MigrationClosureReport {
  const absoluteManifestPath = path.resolve(manifestPath);
  const manifest = loadMigrationClosureManifest(absoluteManifestPath);
  return auditMigrationClosure(manifest, path.dirname(absoluteManifestPath));
}

export function writeMigrationInventoryBaseline(
  manifestPath: string,
  approval: { approvedBy: string; reason: string; acceptedAt?: string },
): { baselinePath: string; acceptanceReceiptPath: string; receipt: MigrationInventoryAcceptanceReceipt } {
  if (!approval.approvedBy.trim()) throw new Error('迁移基线接受缺少 approvedBy');
  if (!approval.reason.trim()) throw new Error('迁移基线接受缺少 reason');
  const absoluteManifestPath = path.resolve(manifestPath);
  const manifest = loadMigrationClosureManifest(absoluteManifestPath);
  if (!manifest.inventory) throw new Error('迁移清单未配置 inventory，无法建立迁移基线');
  if (!manifest.inventory.acceptanceReceiptPath) throw new Error('迁移清单未配置 inventory.acceptanceReceiptPath');
  const report = auditMigrationClosure(manifest, path.dirname(absoluteManifestPath), { skipInventory: true });
  if (report.status !== 'complete') {
    throw new Error(`迁移基线建立前必须清零现有门禁：${formatMigrationFailures(report)}`);
  }
  const roots = resolveRoots(manifest, path.dirname(absoluteManifestPath));
  const excluded: MigrationClosureReport['excluded'] = [];
  const files = manifest.roots.flatMap((root) => scanRoot(
    roots.get(root.id)!,
    manifest.exclusions.filter((item) => item.rootId === root.id),
    excluded,
  ));
  const unowned = classifyFiles(manifest, files);
  if (unowned.length > 0) throw new Error(`迁移基线存在未归属文件：${unowned.length}`);
  const entries = buildInventoryEntries(manifest, files);
  const baseline: MigrationInventoryBaseline = {
    schemaVersion: '1.0.0',
    auditId: manifest.auditId,
    applicationId: manifest.applicationId,
    entries,
    fingerprint: fingerprintInventory(entries),
  };
  const root = roots.get(manifest.inventory.rootId)!;
  const outputPath = path.resolve(root.absolutePath, manifest.inventory.baselinePath);
  const acceptanceReceiptPath = path.resolve(root.absolutePath, manifest.inventory.acceptanceReceiptPath);
  if (!isInside(root.absolutePath, outputPath) || !isInside(root.absolutePath, acceptanceReceiptPath)) {
    throw new Error('迁移基线或接受收据路径越界');
  }
  const previousBaseline = readExistingMigrationBaseline(outputPath);
  const existingReceipts = readMigrationAcceptanceReceipts(acceptanceReceiptPath);
  assertMigrationAcceptanceChain(existingReceipts, manifest);
  const transactionPath = migrationAcceptanceTransactionPath(acceptanceReceiptPath);
  const pendingTransaction = readMigrationAcceptanceTransaction(transactionPath);
  if (pendingTransaction) {
    assertMigrationAcceptanceTransaction(pendingTransaction, manifest);
    if (pendingTransaction.baseline.fingerprint !== baseline.fingerprint) {
      throw new Error('迁移基线存在未完成事务且当前资产再次变化，必须先人工处理');
    }
    const recovered = recoverMigrationAcceptanceTransaction(
      pendingTransaction,
      outputPath,
      acceptanceReceiptPath,
      previousBaseline,
      existingReceipts,
    );
    fs.rmSync(transactionPath, { force: true });
    return { baselinePath: outputPath, acceptanceReceiptPath, receipt: recovered };
  }
  const previousReceiptHash = existingReceipts.at(-1)?.receiptHash ?? null;
  const changes = diffMigrationInventory(previousBaseline?.entries ?? [], entries);
  const latestReceipt = existingReceipts.at(-1);
  if (latestReceipt?.acceptedFingerprint === baseline.fingerprint
    && changes.added.length === 0
    && changes.removed.length === 0
    && changes.changed.length === 0) {
    throw new Error(`迁移基线已由 ${latestReceipt.approvedBy} 接受，无需重复写入`);
  }
  const receiptWithoutHash = {
    schemaVersion: '1.0.0' as const,
    auditId: manifest.auditId,
    applicationId: manifest.applicationId,
    approvedBy: approval.approvedBy.trim(),
    reason: approval.reason.trim(),
    acceptedAt: approval.acceptedAt ?? new Date().toISOString(),
    previousFingerprint: previousBaseline?.fingerprint ?? null,
    acceptedFingerprint: baseline.fingerprint,
    changes,
    previousReceiptHash,
  };
  const receipt: MigrationInventoryAcceptanceReceipt = {
    ...receiptWithoutHash,
    receiptHash: createHash('sha256').update(stableJson(receiptWithoutHash)).digest('hex'),
  };
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.mkdirSync(path.dirname(acceptanceReceiptPath), { recursive: true });
  writeFileAtomically(transactionPath, `${JSON.stringify({ schemaVersion: '1.0.0', baseline, receipt }, null, 2)}\n`);
  try {
    writeFileAtomically(outputPath, `${JSON.stringify(baseline, null, 2)}\n`);
    writeFileAtomically(
      acceptanceReceiptPath,
      `${[...existingReceipts, receipt].map((item) => JSON.stringify(item)).join('\n')}\n`,
    );
    fs.rmSync(transactionPath, { force: true });
  } catch (error) {
    throw new Error(`迁移基线事务未完成，可重试恢复：${errorMessage(error)}`);
  }
  return { baselinePath: outputPath, acceptanceReceiptPath, receipt };
}

export function auditMigrationClosure(
  manifest: MigrationClosureManifest,
  manifestDirectory: string,
  options: { skipInventory?: boolean } = {},
): MigrationClosureReport {
  validateManifest(manifest);
  const roots = resolveRoots(manifest, manifestDirectory);
  const excluded: MigrationClosureReport['excluded'] = [];
  const files = manifest.roots.flatMap((root) => scanRoot(
    roots.get(root.id)!,
    manifest.exclusions.filter((item) => item.rootId === root.id),
    excluded,
  ));

  const unowned = classifyFiles(manifest, files);

  const bridgeViolations = inspectBridgeGroups(manifest, roots);
  const duplicateImplementations = inspectExactDuplicates(manifest, roots, files);
  const brokenReferences = [
    ...inspectRelativeImports(manifest, files),
    ...inspectPackageScripts(manifest, roots),
  ];
  const structuredReferences = inspectStructuredReferences(manifest, roots, files);
  brokenReferences.push(...structuredReferences
    .filter((item) => !item.exists && item.missingDisposition === 'blocking')
    .map((item) => failure(
      'STRUCTURED_REFERENCE_MISSING',
      item.sourceRootId,
      item.sourcePath,
      `${item.value} -> ${item.targetRootId}:${item.targetPath}`,
    )));
  const legacyResult = inspectLegacySources(manifest, roots, structuredReferences);
  const misplacedTransients = inspectTransientPolicies(manifest, files);
  const publicBoundaryViolations = inspectPublicBoundary(manifest, files);
  const contentPolicyViolations = inspectContentPolicies(manifest, files);
  const requiredAssetMissing = inspectRequiredAssets(manifest, roots);
  const inventoryResult = options.skipInventory
    ? emptyInventoryResult()
    : compareMigrationInventory(manifest, roots, files);

  const failures = {
    unowned: sortFailures(unowned),
    bridgeViolations: sortFailures(bridgeViolations),
    duplicateImplementations: sortFailures(duplicateImplementations),
    brokenReferences: sortFailures(brokenReferences),
    documentationContradictions: sortFailures(legacyResult.failures),
    misplacedTransients: sortFailures(misplacedTransients),
    publicBoundaryViolations: sortFailures(publicBoundaryViolations),
    contentPolicyViolations: sortFailures(contentPolicyViolations),
    requiredAssetMissing: sortFailures(requiredAssetMissing),
    inventory: sortFailures([
      ...inventoryResult.missing,
      ...inventoryResult.changed,
      ...inventoryResult.acceptanceFailures,
    ]),
  };
  const historicalReferenceGaps = sortFailures(structuredReferences
    .filter((item) => !item.exists && item.missingDisposition === 'historical-diagnostic')
    .map((item) => failure(
      'HISTORICAL_STRUCTURED_REFERENCE_MISSING',
      item.sourceRootId,
      item.sourcePath,
      `${item.value} -> ${item.targetRootId}:${item.resolvedTargetPath}`,
    )));
  const failureCount = Object.values(failures).reduce((sum, items) => sum + items.length, 0);
  const countCategory = (category: MigrationOwnershipCategory) => files.filter((item) => item.category === category).length;
  const ownership = files
    .filter((item): item is ScannedFile & Required<Pick<ScannedFile, 'category' | 'ruleId'>> => Boolean(item.category && item.ruleId))
    .map((item) => ({
      rootId: item.rootId,
      path: item.relativePath,
      category: item.category,
      ruleId: item.ruleId,
    }))
    .sort((left, right) => `${left.rootId}:${left.path}`.localeCompare(`${right.rootId}:${right.path}`));

  return {
    schemaVersion: '1.0.0',
    auditId: manifest.auditId,
    applicationId: manifest.applicationId,
    scope: 'migration-closure',
    status: failureCount === 0 ? 'complete' : 'incomplete',
    inputFingerprint: fingerprintInputs(manifest, files, failures),
    universalPlatformCompletionAsserted: false,
    summary: {
      scannedFiles: files.length,
      excludedDirectories: excluded.length,
      publicCore: countCategory('public-core'),
      projectAdapter: countCategory('project-adapter'),
      domainAsset: countCategory('domain-asset'),
      generatedEvidence: countCategory('generated-evidence'),
      history: countCategory('history'),
      transient: countCategory('transient'),
      unowned: failures.unowned.length,
      bridgeViolations: failures.bridgeViolations.length,
      duplicateImplementations: failures.duplicateImplementations.length,
      brokenReferences: failures.brokenReferences.length,
      documentationContradictions: failures.documentationContradictions.length,
      misplacedTransients: failures.misplacedTransients.length,
      publicBoundaryViolations: failures.publicBoundaryViolations.length,
      contentPolicyViolations: failures.contentPolicyViolations.length,
      requiredAssetMissing: failures.requiredAssetMissing.length,
      inventoryBaselineMissing: inventoryResult.baselineMissing ? 1 : 0,
      inventoryMissing: inventoryResult.missing.length,
      inventoryChanged: inventoryResult.changed.length,
      inventoryAcceptanceInvalid: inventoryResult.acceptanceFailures.length,
      historicalReferenceGaps: historicalReferenceGaps.length,
    },
    ownership,
    excluded: excluded.sort((left, right) => `${left.rootId}:${left.path}`.localeCompare(`${right.rootId}:${right.path}`)),
    failures,
    retainedLegacySources: legacyResult.sources,
    historicalReferenceGaps,
    inventory: {
      baselinePath: inventoryResult.baselinePath,
      baselineFingerprint: inventoryResult.baselineFingerprint,
      currentFingerprint: inventoryResult.currentFingerprint,
      missing: inventoryResult.missing,
      changed: inventoryResult.changed,
    },
  };
}

export function writeMigrationClosureReport(
  manifestPath: string,
  report: MigrationClosureReport,
): { jsonPath: string; markdownPath: string } {
  const absoluteManifestPath = path.resolve(manifestPath);
  const manifest = loadMigrationClosureManifest(absoluteManifestPath);
  const roots = resolveRoots(manifest, path.dirname(absoluteManifestPath));
  const outputRoot = roots.get(manifest.outputs.rootId);
  if (!outputRoot) throw new Error(`迁移闭环输出根目录不存在：${manifest.outputs.rootId}`);
  const jsonPath = path.resolve(outputRoot.absolutePath, manifest.outputs.jsonPath);
  const markdownPath = path.resolve(outputRoot.absolutePath, manifest.outputs.markdownPath);
  fs.mkdirSync(path.dirname(jsonPath), { recursive: true });
  fs.mkdirSync(path.dirname(markdownPath), { recursive: true });
  fs.writeFileSync(jsonPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  fs.writeFileSync(markdownPath, renderMigrationClosureMarkdown(report), 'utf8');
  return { jsonPath, markdownPath };
}

export function renderMigrationClosureMarkdown(report: MigrationClosureReport): string {
  const lines = [
    '# 迁移闭环审计',
    '',
    `- 审计 ID：\`${report.auditId}\``,
    `- 应用 ID：\`${report.applicationId}\``,
    `- 迁移闭环状态：\`${report.status}\``,
    `- 输入指纹：\`${report.inputFingerprint}\``,
    '- 范围说明：本报告只判定迁移和文件治理闭环，不声明跨系统平台最终完成。',
    '',
    '## 文件归属',
    '',
    '| 分类 | 数量 |',
    '| --- | ---: |',
    `| 公共核心 | ${report.summary.publicCore} |`,
    `| 项目适配器 | ${report.summary.projectAdapter} |`,
    `| 领域资产 | ${report.summary.domainAsset} |`,
    `| 生成证据 | ${report.summary.generatedEvidence} |`,
    `| 历史资产 | ${report.summary.history} |`,
    `| 瞬态文件 | ${report.summary.transient} |`,
    `| 扫描总数 | ${report.summary.scannedFiles} |`,
    '',
    '## 闭环门禁',
    '',
    '| 门禁 | 问题数 |',
    '| --- | ---: |',
    `| 未归属文件 | ${report.summary.unowned} |`,
    `| 公共桥接违规 | ${report.summary.bridgeViolations} |`,
    `| 重复公共实现 | ${report.summary.duplicateImplementations} |`,
    `| 断裂引用 | ${report.summary.brokenReferences} |`,
    `| 文档与机器引用冲突 | ${report.summary.documentationContradictions} |`,
    `| 错位瞬态文件 | ${report.summary.misplacedTransients} |`,
    `| 公共目录项目内容 | ${report.summary.publicBoundaryViolations} |`,
    `| 禁止内容引用 | ${report.summary.contentPolicyViolations} |`,
    `| 必需迁移资产缺失 | ${report.summary.requiredAssetMissing} |`,
    `| 迁移基线缺失 | ${report.summary.inventoryBaselineMissing} |`,
    `| 迁移后缺失文件 | ${report.summary.inventoryMissing} |`,
    `| 迁移后变更文件 | ${report.summary.inventoryChanged} |`,
    `| 迁移基线接受收据无效 | ${report.summary.inventoryAcceptanceInvalid} |`,
    `| 历史快照断裂引用（非阻断） | ${report.summary.historicalReferenceGaps} |`,
    '',
  ];
  const failureGroups: Array<[string, MigrationClosureFailure[]]> = [
    ['未归属文件', report.failures.unowned],
    ['公共桥接违规', report.failures.bridgeViolations],
    ['重复公共实现', report.failures.duplicateImplementations],
    ['断裂引用', report.failures.brokenReferences],
    ['文档冲突', report.failures.documentationContradictions],
    ['错位瞬态文件', report.failures.misplacedTransients],
    ['公共目录项目内容', report.failures.publicBoundaryViolations],
    ['禁止内容引用', report.failures.contentPolicyViolations],
    ['必需迁移资产缺失', report.failures.requiredAssetMissing],
    ['迁移完整性基线', report.failures.inventory],
  ];
  for (const [title, items] of failureGroups) {
    if (items.length === 0) continue;
    lines.push(`## ${title}`, '');
    for (const item of items) lines.push(`- \`${item.path}\`：${item.code}，${item.detail}`);
    lines.push('');
  }
  lines.push('## 历史来源', '');
  if (report.retainedLegacySources.length === 0) lines.push('- 无登记历史来源。');
  for (const item of report.retainedLegacySources) {
    lines.push(`- \`${item.path}\`：${item.disposition}，引用文件 ${item.activeReferenceFiles} 个，引用目标 ${item.activeReferenceTargets} 个。`);
  }
  if (report.historicalReferenceGaps.length > 0) {
    lines.push('', '## 历史引用诊断', '');
    lines.push('- 以下断裂只存在于冻结历史快照，不参与当前合同执行；保留诊断，等待来源迁移决策。');
    for (const item of report.historicalReferenceGaps) lines.push(`- \`${item.path}\`：${item.detail}`);
  }
  lines.push('', '## 验收结论', '');
  lines.push(report.status === 'complete'
    ? '- 所有在管文件已有唯一归属，公共实现桥接、引用、历史来源声明和瞬态文件位置均通过门禁。'
    : '- 迁移闭环未完成；必须清零全部门禁问题后才能声明本次迁移结束。');
  lines.push('');
  return `${lines.join('\n')}\n`;
}

function validateManifest(manifest: MigrationClosureManifest): void {
  if (manifest.schemaVersion !== '1.0.0') throw new Error(`不支持的迁移闭环清单版本：${manifest.schemaVersion}`);
  const rootIds = new Set<string>();
  for (const root of manifest.roots) {
    if (rootIds.has(root.id)) throw new Error(`迁移闭环根目录重复：${root.id}`);
    rootIds.add(root.id);
  }
  const referencedRootIds = [
    ...manifest.exclusions.map((item) => item.rootId),
    ...manifest.ownershipRules.map((item) => item.rootId),
    ...manifest.bridgeGroups.flatMap((item) => [item.projectRootId, item.platformRootId]),
    ...manifest.importScans.map((item) => item.rootId),
    ...manifest.packageScripts.map((item) => item.rootId),
    ...manifest.structuredReferences.flatMap((item) => [item.scanRootId, item.targetRootId]),
    ...manifest.legacySources.map((item) => item.rootId),
    ...manifest.transientPolicies.map((item) => item.rootId),
    ...(manifest.publicBoundary ? [manifest.publicBoundary.rootId] : []),
    ...(manifest.contentPolicies ?? []).map((item) => item.rootId),
    ...(manifest.requiredAssets ?? []).map((item) => item.rootId),
    ...(manifest.inventory ? [manifest.inventory.rootId] : []),
    manifest.outputs.rootId,
  ];
  const unknown = referencedRootIds.filter((rootId) => !rootIds.has(rootId));
  if (unknown.length > 0) throw new Error(`迁移闭环引用未知根目录：${[...new Set(unknown)].join(',')}`);
}

function resolveRoots(manifest: MigrationClosureManifest, manifestDirectory: string): Map<string, ResolvedRoot> {
  return new Map(manifest.roots.map((root) => {
    const absolutePath = path.resolve(manifestDirectory, root.path);
    if (!fs.existsSync(absolutePath)) throw new Error(`迁移闭环根目录不存在：${root.id}:${absolutePath}`);
    return [root.id, { id: root.id, absolutePath }];
  }));
}

function classifyFiles(
  manifest: MigrationClosureManifest,
  files: ScannedFile[],
): MigrationClosureFailure[] {
  const unowned: MigrationClosureFailure[] = [];
  for (const file of files) {
    const rule = manifest.ownershipRules.find((item) => (
      item.rootId === file.rootId
      && item.patterns.some((pattern) => matchesGlob(file.relativePath, pattern))
    ));
    if (!rule) {
      unowned.push(failure('UNOWNED_FILE', file.rootId, file.relativePath, '文件未匹配任何归属规则'));
      continue;
    }
    file.category = rule.category;
    file.ruleId = rule.id;
  }
  return unowned;
}

function buildInventoryEntries(
  manifest: MigrationClosureManifest,
  files: readonly ScannedFile[],
): MigrationInventoryEntry[] {
  const categories = new Set(manifest.inventory?.categories ?? [
    'public-core',
    'project-adapter',
    'domain-asset',
    'history',
  ]);
  return files
    .filter((file): file is ScannedFile & Required<Pick<ScannedFile, 'category' | 'ruleId'>> => (
      Boolean(file.category && file.ruleId && categories.has(file.category))
    ))
    .flatMap((file) => {
      const sha256 = snapshotFileHash(file);
      return sha256 ? [{
        rootId: file.rootId,
        path: file.relativePath,
        category: file.category,
        ruleId: file.ruleId,
        bytes: file.bytes,
        sha256,
      }] : [];
    })
    .sort((left, right) => `${left.rootId}:${left.path}`.localeCompare(`${right.rootId}:${right.path}`));
}

function fingerprintInventory(entries: readonly MigrationInventoryEntry[]): string {
  return createHash('sha256').update(stableJson(entries)).digest('hex');
}

function readExistingMigrationBaseline(filePath: string): MigrationInventoryBaseline | null {
  if (!fs.existsSync(filePath)) return null;
  return JSON.parse(fs.readFileSync(filePath, 'utf8')) as MigrationInventoryBaseline;
}

function readMigrationAcceptanceReceipts(filePath: string): MigrationInventoryAcceptanceReceipt[] {
  if (!fs.existsSync(filePath)) return [];
  return fs.readFileSync(filePath, 'utf8')
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => JSON.parse(line) as MigrationInventoryAcceptanceReceipt);
}

function migrationAcceptanceTransactionPath(receiptPath: string): string {
  return `${receiptPath}.transaction.json`;
}

function readMigrationAcceptanceTransaction(filePath: string): MigrationInventoryAcceptanceTransaction | null {
  if (!fs.existsSync(filePath)) return null;
  return JSON.parse(fs.readFileSync(filePath, 'utf8')) as MigrationInventoryAcceptanceTransaction;
}

function assertMigrationAcceptanceTransaction(
  transaction: MigrationInventoryAcceptanceTransaction,
  manifest: MigrationClosureManifest,
): void {
  if (transaction.schemaVersion !== '1.0.0') throw new Error('迁移基线事务版本无效');
  const { receiptHash, ...unsigned } = transaction.receipt;
  const expectedHash = createHash('sha256').update(stableJson(unsigned)).digest('hex');
  if (transaction.baseline.auditId !== manifest.auditId
    || transaction.baseline.applicationId !== manifest.applicationId
    || transaction.receipt.auditId !== manifest.auditId
    || transaction.receipt.applicationId !== manifest.applicationId
    || receiptHash !== expectedHash
    || transaction.baseline.fingerprint !== fingerprintInventory(transaction.baseline.entries)
    || transaction.receipt.acceptedFingerprint !== transaction.baseline.fingerprint) {
    throw new Error('迁移基线事务内容或哈希无效');
  }
}

function recoverMigrationAcceptanceTransaction(
  transaction: MigrationInventoryAcceptanceTransaction,
  baselinePath: string,
  acceptanceReceiptPath: string,
  currentBaseline: MigrationInventoryBaseline | null,
  currentReceipts: readonly MigrationInventoryAcceptanceReceipt[],
): MigrationInventoryAcceptanceReceipt {
  const latest = currentReceipts.at(-1);
  if (latest?.acceptedFingerprint !== transaction.receipt.acceptedFingerprint) {
    if (transaction.receipt.previousReceiptHash !== (latest?.receiptHash ?? null)) {
      throw new Error('迁移基线事务收据无法接入当前哈希链');
    }
    writeFileAtomically(
      acceptanceReceiptPath,
      `${[...currentReceipts, transaction.receipt].map((item) => JSON.stringify(item)).join('\n')}\n`,
    );
  }
  if (currentBaseline?.fingerprint !== transaction.baseline.fingerprint) {
    writeFileAtomically(baselinePath, `${JSON.stringify(transaction.baseline, null, 2)}\n`);
  }
  return transaction.receipt;
}

function writeFileAtomically(filePath: string, content: string): void {
  const temporaryPath = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  fs.writeFileSync(temporaryPath, content, 'utf8');
  try {
    fs.renameSync(temporaryPath, filePath);
  } catch (error) {
    if (!['EEXIST', 'EPERM', 'ENOTEMPTY'].includes((error as NodeJS.ErrnoException).code ?? '')) throw error;
    fs.rmSync(filePath, { force: true });
    fs.renameSync(temporaryPath, filePath);
  } finally {
    fs.rmSync(temporaryPath, { force: true });
  }
}

function assertMigrationAcceptanceChain(
  receipts: readonly MigrationInventoryAcceptanceReceipt[],
  manifest: MigrationClosureManifest,
): void {
  let previousReceiptHash: string | null = null;
  for (const receipt of receipts) {
    const { receiptHash, ...unsigned } = receipt;
    const expectedHash = createHash('sha256').update(stableJson(unsigned)).digest('hex');
    if (receipt.schemaVersion !== '1.0.0'
      || receipt.auditId !== manifest.auditId
      || receipt.applicationId !== manifest.applicationId
      || receipt.previousReceiptHash !== previousReceiptHash
      || receiptHash !== expectedHash) {
      throw new Error(`迁移基线接受收据哈希链无效：${receipt.acceptedAt ?? 'unknown'}`);
    }
    previousReceiptHash = receiptHash;
  }
}

function diffMigrationInventory(
  previousEntries: readonly MigrationInventoryEntry[],
  currentEntries: readonly MigrationInventoryEntry[],
): MigrationInventoryAcceptanceReceipt['changes'] {
  const previous = new Map(previousEntries.map((entry) => [`${entry.rootId}:${entry.path}`, entry]));
  const current = new Map(currentEntries.map((entry) => [`${entry.rootId}:${entry.path}`, entry]));
  const added = [...current.keys()].filter((key) => !previous.has(key)).sort();
  const removed = [...previous.keys()].filter((key) => !current.has(key)).sort();
  const changed = [...current.keys()].filter((key) => {
    const before = previous.get(key);
    const after = current.get(key)!;
    return Boolean(before && (
      before.sha256 !== after.sha256
      || before.bytes !== after.bytes
      || before.category !== after.category
      || before.ruleId !== after.ruleId
    ));
  }).sort();
  return { added, removed, changed };
}

function compareMigrationInventory(
  manifest: MigrationClosureManifest,
  roots: ReadonlyMap<string, ResolvedRoot>,
  files: readonly ScannedFile[],
): {
  baselinePath: string | null;
  baselineFingerprint: string | null;
  currentFingerprint: string | null;
  baselineMissing: boolean;
  missing: MigrationClosureFailure[];
  changed: MigrationClosureFailure[];
  acceptanceFailures: MigrationClosureFailure[];
} {
  if (!manifest.inventory) {
    return {
      baselinePath: null,
      baselineFingerprint: null,
      currentFingerprint: null,
      baselineMissing: false,
      missing: [],
      changed: [],
      acceptanceFailures: [],
    };
  }
  const root = roots.get(manifest.inventory.rootId)!;
  const baselinePath = path.resolve(root.absolutePath, manifest.inventory.baselinePath);
  const currentEntries = buildInventoryEntries(manifest, files);
  const currentFingerprint = fingerprintInventory(currentEntries);
  if (!fs.existsSync(baselinePath)) {
    return {
      baselinePath,
      baselineFingerprint: null,
      currentFingerprint,
      baselineMissing: true,
      missing: [failure('MIGRATION_BASELINE_MISSING', manifest.inventory.rootId, manifest.inventory.baselinePath, '迁移前后文件哈希基线不存在')],
      changed: [],
      acceptanceFailures: [],
    };
  }
  let baseline: MigrationInventoryBaseline;
  try {
    baseline = JSON.parse(fs.readFileSync(baselinePath, 'utf8')) as MigrationInventoryBaseline;
  } catch (error) {
    return {
      baselinePath,
      baselineFingerprint: null,
      currentFingerprint,
      baselineMissing: true,
      missing: [failure('MIGRATION_BASELINE_INVALID', manifest.inventory.rootId, manifest.inventory.baselinePath, errorMessage(error))],
      changed: [],
      acceptanceFailures: [],
    };
  }
  const currentByKey = new Map(currentEntries.map((entry) => [`${entry.rootId}:${entry.path}`, entry]));
  const baselineKeys = new Set(baseline.entries.map((entry) => `${entry.rootId}:${entry.path}`));
  const missing: MigrationClosureFailure[] = [];
  const changed: MigrationClosureFailure[] = [];
  for (const entry of baseline.entries) {
    const key = `${entry.rootId}:${entry.path}`;
    const current = currentByKey.get(key);
    if (!current) {
      missing.push(failure('MIGRATION_ASSET_MISSING', entry.rootId, entry.path, '迁移后未找到基线文件'));
      continue;
    }
    if (current.sha256 !== entry.sha256 || current.bytes !== entry.bytes || current.category !== entry.category) {
      changed.push(failure('MIGRATION_ASSET_CHANGED', entry.rootId, entry.path, `基线 ${entry.sha256}/${entry.bytes}，当前 ${current.sha256}/${current.bytes}`));
    }
  }
  for (const entry of currentEntries) {
    const key = `${entry.rootId}:${entry.path}`;
    if (baselineKeys.has(key)) continue;
    changed.push(failure(
      'MIGRATION_ASSET_ADDED',
      entry.rootId,
      entry.path,
      `新增受管资产 ${entry.sha256}/${entry.bytes} 尚未接受`,
    ));
  }
  const acceptanceFailures = inspectMigrationAcceptance(
    manifest,
    root,
    baseline.fingerprint ?? fingerprintInventory(baseline.entries),
  );
  return {
    baselinePath,
    baselineFingerprint: baseline.fingerprint ?? fingerprintInventory(baseline.entries),
    currentFingerprint,
    baselineMissing: false,
    missing,
    changed,
    acceptanceFailures,
  };
}

function inspectMigrationAcceptance(
  manifest: MigrationClosureManifest,
  root: ResolvedRoot,
  baselineFingerprint: string,
): MigrationClosureFailure[] {
  const receiptPath = manifest.inventory?.acceptanceReceiptPath;
  if (!receiptPath) {
    return [failure(
      'MIGRATION_BASELINE_ACCEPTANCE_NOT_CONFIGURED',
      root.id,
      manifest.inventory?.baselinePath ?? 'unknown',
      '迁移基线未配置接受收据路径',
    )];
  }
  const absolutePath = path.resolve(root.absolutePath, receiptPath);
  const transactionPath = migrationAcceptanceTransactionPath(absolutePath);
  if (isInside(root.absolutePath, absolutePath) && fs.existsSync(transactionPath)) {
    return [failure(
      'MIGRATION_BASELINE_ACCEPTANCE_TRANSACTION_PENDING',
      root.id,
      path.relative(root.absolutePath, transactionPath).replaceAll(path.sep, '/'),
      '迁移基线存在未完成事务，必须重新执行基线接受命令恢复或完成提交',
    )];
  }
  if (!isInside(root.absolutePath, absolutePath) || !fs.existsSync(absolutePath)) {
    return [failure('MIGRATION_BASELINE_ACCEPTANCE_MISSING', root.id, receiptPath, '迁移基线缺少接受收据')];
  }
  let receipts: MigrationInventoryAcceptanceReceipt[];
  try {
    receipts = readMigrationAcceptanceReceipts(absolutePath);
    assertMigrationAcceptanceChain(receipts, manifest);
  } catch (error) {
    return [failure('MIGRATION_BASELINE_ACCEPTANCE_INVALID', root.id, receiptPath, errorMessage(error))];
  }
  const latest = receipts.at(-1);
  if (!latest || latest.acceptedFingerprint !== baselineFingerprint) {
    return [failure(
      'MIGRATION_BASELINE_ACCEPTANCE_FINGERPRINT_MISMATCH',
      root.id,
      receiptPath,
      `当前基线 ${baselineFingerprint} 未被最后一条收据接受`,
    )];
  }
  return [];
}

function emptyInventoryResult(): ReturnType<typeof compareMigrationInventory> {
  return {
    baselinePath: null,
    baselineFingerprint: null,
    currentFingerprint: null,
    baselineMissing: false,
    missing: [],
    changed: [],
    acceptanceFailures: [],
  };
}

function formatMigrationFailures(report: MigrationClosureReport): string {
  return Object.values(report.failures)
    .flat()
    .map((item) => `${item.code}:${item.path}`)
    .join(',') || 'unknown';
}

function scanRoot(
  root: ResolvedRoot,
  exclusions: MigrationClosureManifest['exclusions'],
  excluded: MigrationClosureReport['excluded'],
): ScannedFile[] {
  const files: ScannedFile[] = [];
  const visit = (absoluteDirectory: string) => {
    for (const entry of fs.readdirSync(absoluteDirectory, { withFileTypes: true })) {
      const absolutePath = path.join(absoluteDirectory, entry.name);
      const relativePath = normalizePath(path.relative(root.absolutePath, absolutePath));
      const exclusion = exclusions.find((item) => item.patterns.some((pattern) => matchesGlob(relativePath, pattern)));
      if (exclusion) {
        excluded.push({ rootId: root.id, path: relativePath, exclusionId: exclusion.id, reason: exclusion.reason });
        continue;
      }
      if (entry.isSymbolicLink()) {
        excluded.push({ rootId: root.id, path: relativePath, exclusionId: 'symbolic-link', reason: '符号链接不跟随，避免重复或越界扫描' });
        continue;
      }
      if (entry.isDirectory()) {
        visit(absolutePath);
        continue;
      }
      if (!entry.isFile()) continue;
      let stat: fs.Stats;
      try {
        stat = fs.statSync(absolutePath);
      } catch (error) {
        // A file may be removed between readdir and stat. It was never part of
        // the stable audit snapshot, so skip it instead of crashing later.
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') continue;
        throw error;
      }
      files.push({
        rootId: root.id,
        relativePath,
        absolutePath,
        bytes: stat.size,
        modifiedMs: stat.mtimeMs,
      });
    }
  };
  visit(root.absolutePath);
  return files.sort((left, right) => left.relativePath.localeCompare(right.relativePath));
}

function inspectBridgeGroups(
  manifest: MigrationClosureManifest,
  roots: ReadonlyMap<string, ResolvedRoot>,
): MigrationClosureFailure[] {
  const failures: MigrationClosureFailure[] = [];
  for (const group of manifest.bridgeGroups) {
    const projectRoot = roots.get(group.projectRootId)!;
    const platformRoot = roots.get(group.platformRootId)!;
    const projectDirectory = path.resolve(projectRoot.absolutePath, group.projectDirectory);
    const platformDirectory = path.resolve(platformRoot.absolutePath, group.platformDirectory);
    const platformFiles = fs.existsSync(platformDirectory)
      ? fs.readdirSync(platformDirectory, { withFileTypes: true }).filter((item) => (
        item.isFile()
        && item.name.endsWith('.ts')
        && !(group.ignoredPlatformFiles ?? []).includes(item.name)
      ))
      : [];
    const projectFiles = fs.existsSync(projectDirectory)
      ? new Set(fs.readdirSync(projectDirectory, { withFileTypes: true }).filter((item) => item.isFile()).map((item) => item.name))
      : new Set<string>();
    for (const platformFile of platformFiles) {
      const projectRelativePath = normalizePath(path.join(group.projectDirectory, platformFile.name));
      const projectFile = path.join(projectDirectory, platformFile.name);
      const platformFilePath = path.join(platformDirectory, platformFile.name);
      if (!projectFiles.has(platformFile.name)) {
        if (group.requireEveryPlatformFile) {
          failures.push(failure('BRIDGE_MISSING', group.projectRootId, projectRelativePath, `缺少公共文件 ${group.platformDirectory}/${platformFile.name} 的兼容桥`));
        }
        continue;
      }
      const source = fs.readFileSync(projectFile, 'utf8').trim();
      const adapter = new Set(group.adapterFiles ?? []).has(platformFile.name);
      const specifiers = extractModuleSpecifiers(source);
      const referencesTarget = specifiers.some((specifier) => {
        const resolved = resolveModuleSpecifier(projectFile, specifier);
        return resolved !== null && samePath(resolved, platformFilePath);
      });
      if (!referencesTarget) {
        failures.push(failure('BRIDGE_TARGET_MISMATCH', group.projectRootId, projectRelativePath, `未引用公共目标 ${group.platformDirectory}/${platformFile.name}`));
        continue;
      }
      if (!adapter && !isSingleReExport(source, projectFile, platformFilePath)) {
        failures.push(failure('BRIDGE_CONTAINS_IMPLEMENTATION', group.projectRootId, projectRelativePath, '公共兼容桥包含本地实现，存在双份维护风险'));
      }
    }
  }
  return failures;
}

function inspectExactDuplicates(
  manifest: MigrationClosureManifest,
  roots: ReadonlyMap<string, ResolvedRoot>,
  files: readonly ScannedFile[],
): MigrationClosureFailure[] {
  const scan = manifest.exactDuplicateScan;
  if (!scan) return [];
  const platformFiles = files.filter((item) => (
    item.rootId === scan.platformRootId
    && scan.platformPatterns.some((pattern) => matchesGlob(item.relativePath, pattern))
    && item.bytes >= 100
  ));
  const projectFiles = files.filter((item) => (
    item.rootId === scan.projectRootId
    && scan.projectPatterns.some((pattern) => matchesGlob(item.relativePath, pattern))
    && item.bytes >= 100
  ));
  const platformHashes = new Map<string, ScannedFile[]>();
  for (const file of platformFiles) {
    const hash = snapshotFileHash(file);
    if (!hash) continue;
    platformHashes.set(hash, [...(platformHashes.get(hash) ?? []), file]);
  }
  const bridgePaths = new Set(manifest.bridgeGroups.flatMap((group) => {
    if (group.projectRootId !== scan.projectRootId) return [];
    const platformRoot = roots.get(group.platformRootId)!;
    const platformDirectory = path.resolve(platformRoot.absolutePath, group.platformDirectory);
    if (!fs.existsSync(platformDirectory)) return [];
    return fs.readdirSync(platformDirectory, { withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.endsWith('.ts'))
      .map((entry) => `${group.projectRootId}:${normalizePath(path.join(group.projectDirectory, entry.name))}`.toLowerCase());
  }));
  const failures: MigrationClosureFailure[] = [];
  for (const file of projectFiles) {
    if (bridgePaths.has(`${file.rootId}:${file.relativePath}`.toLowerCase())) continue;
    const hash = snapshotFileHash(file);
    if (!hash) continue;
    const matches = platformHashes.get(hash);
    if (!matches) continue;
    failures.push(failure(
      'EXACT_PUBLIC_IMPLEMENTATION_DUPLICATE',
      file.rootId,
      file.relativePath,
      `与公共实现完全相同：${matches.map((item) => `${item.rootId}:${item.relativePath}`).join(',')}`,
    ));
  }
  return failures;
}

function inspectRelativeImports(
  manifest: MigrationClosureManifest,
  files: readonly ScannedFile[],
): MigrationClosureFailure[] {
  const failures: MigrationClosureFailure[] = [];
  for (const scan of manifest.importScans) {
    for (const file of files.filter((item) => (
      item.rootId === scan.rootId
      && scan.patterns.some((pattern) => matchesGlob(item.relativePath, pattern))
    ))) {
      const source = fs.readFileSync(file.absolutePath, 'utf8');
      for (const specifier of extractModuleSpecifiers(source).filter((item) => item.startsWith('.'))) {
        if (resolveModuleSpecifier(file.absolutePath, specifier)) continue;
        failures.push(failure('RELATIVE_IMPORT_MISSING', file.rootId, file.relativePath, `无法解析相对引用 ${specifier}`));
      }
    }
  }
  return failures;
}

function inspectPackageScripts(
  manifest: MigrationClosureManifest,
  roots: ReadonlyMap<string, ResolvedRoot>,
): MigrationClosureFailure[] {
  const failures: MigrationClosureFailure[] = [];
  for (const packagePolicy of manifest.packageScripts) {
    const root = roots.get(packagePolicy.rootId)!;
    const packagePath = path.resolve(root.absolutePath, packagePolicy.path);
    if (!fs.existsSync(packagePath)) {
      failures.push(failure('PACKAGE_JSON_MISSING', packagePolicy.rootId, packagePolicy.path, '包命令清单不存在'));
      continue;
    }
    const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8')) as { scripts?: Record<string, string> };
    const packageDirectory = path.dirname(packagePath);
    for (const [scriptName, command] of Object.entries(packageJson.scripts ?? {})) {
      for (const target of extractCommandTargets(command)) {
        const absoluteTarget = path.resolve(packageDirectory, target);
        if (fs.existsSync(absoluteTarget)) continue;
        failures.push(failure('PACKAGE_SCRIPT_TARGET_MISSING', packagePolicy.rootId, packagePolicy.path, `${scriptName} -> ${target}`));
      }
    }
  }
  return failures;
}

function inspectStructuredReferences(
  manifest: MigrationClosureManifest,
  roots: ReadonlyMap<string, ResolvedRoot>,
  files: readonly ScannedFile[],
): StructuredReference[] {
  const references: StructuredReference[] = [];
  for (const policy of manifest.structuredReferences) {
    const targetRoot = roots.get(policy.targetRootId)!;
    const targetAliases = new Map((policy.targetAliases ?? []).map((alias) => [
      normalizePath(alias.from).replace(/^\/+/, ''),
      normalizePath(alias.to).replace(/^\/+/, ''),
    ]));
    const sourceFiles = files.filter((item) => (
      item.rootId === policy.scanRootId
      && policy.scanPatterns.some((pattern) => matchesGlob(item.relativePath, pattern))
    ));
    for (const sourceFile of sourceFiles) {
      const values = readStringValues(sourceFile.absolutePath);
      for (const value of values.filter((item) => item.startsWith(policy.prefix))) {
        const targetPath = normalizePath(value.slice(policy.prefix.length).replace(/^\/+/, ''));
        const resolvedTargetPath = targetAliases.get(targetPath) ?? targetPath;
        const absoluteTarget = path.resolve(targetRoot.absolutePath, resolvedTargetPath);
        references.push({
          sourceRootId: sourceFile.rootId,
          sourcePath: sourceFile.relativePath,
          value,
          targetRootId: policy.targetRootId,
          targetPath,
          resolvedTargetPath,
          absoluteTarget,
          exists: isInside(targetRoot.absolutePath, absoluteTarget) && fs.existsSync(absoluteTarget),
          missingDisposition: policy.missingDisposition ?? 'blocking',
        });
      }
    }
  }
  return references;
}

function inspectLegacySources(
  manifest: MigrationClosureManifest,
  roots: ReadonlyMap<string, ResolvedRoot>,
  references: readonly StructuredReference[],
): {
  failures: MigrationClosureFailure[];
  sources: MigrationClosureReport['retainedLegacySources'];
} {
  const failures: MigrationClosureFailure[] = [];
  const sources: MigrationClosureReport['retainedLegacySources'] = [];
  for (const policy of manifest.legacySources) {
    const root = roots.get(policy.rootId)!;
    const legacyPath = path.resolve(root.absolutePath, policy.path);
    const documentationPath = path.resolve(root.absolutePath, policy.documentationPath);
    const active = references.filter((item) => isInside(legacyPath, item.absoluteTarget));
    const sourceFiles = new Set(active.map((item) => `${item.sourceRootId}:${item.sourcePath}`));
    const targetFiles = new Set(active.map((item) => item.absoluteTarget.toLowerCase()));
    if (active.length > 0) {
      const documentation = fs.existsSync(documentationPath) ? fs.readFileSync(documentationPath, 'utf8') : '';
      if (!documentation.includes(policy.requiredMarkerWhileReferenced)) {
        failures.push(failure(
          'LEGACY_DOCUMENTATION_CONTRADICTS_ACTIVE_REFERENCES',
          policy.rootId,
          policy.documentationPath,
          `历史来源仍被 ${sourceFiles.size} 个文件引用，但文档缺少标记：${policy.requiredMarkerWhileReferenced}`,
        ));
      }
    }
    sources.push({
      id: policy.id,
      path: `${policy.rootId}:${normalizePath(policy.path)}`,
      activeReferenceFiles: sourceFiles.size,
      activeReferenceTargets: targetFiles.size,
      disposition: active.length > 0 ? 'retained-with-active-references' : 'eligible-for-disposition-review',
    });
  }
  return { failures, sources };
}

function inspectTransientPolicies(
  manifest: MigrationClosureManifest,
  files: readonly ScannedFile[],
): MigrationClosureFailure[] {
  const failures: MigrationClosureFailure[] = [];
  for (const policy of manifest.transientPolicies) {
    for (const file of files.filter((item) => (
      item.rootId === policy.rootId
      && policy.patterns.some((pattern) => matchesGlob(item.relativePath, pattern))
    ))) {
      if (policy.allowedPatterns.some((pattern) => matchesGlob(file.relativePath, pattern))) continue;
      failures.push(failure('TRANSIENT_FILE_MISPLACED', file.rootId, file.relativePath, `违反瞬态文件策略 ${policy.id}`));
    }
  }
  return failures;
}

function inspectPublicBoundary(
  manifest: MigrationClosureManifest,
  files: readonly ScannedFile[],
): MigrationClosureFailure[] {
  const policy = manifest.publicBoundary;
  if (!policy) return [];
  const failures: MigrationClosureFailure[] = [];
  for (const file of files.filter((item) => item.rootId === policy.rootId)) {
    if (policy.forbiddenPathPatterns?.some((pattern) => matchesGlob(file.relativePath, pattern))) {
      failures.push(failure(
        'PUBLIC_BOUNDARY_PATH_FORBIDDEN',
        file.rootId,
        file.relativePath,
        '公共平台目录不能保存项目专属路径',
      ));
    }
    const content = readTextForBoundary(file.absolutePath);
    if (!content) continue;
    for (const pattern of policy.forbiddenPatterns) {
      if (!content.toLocaleLowerCase().includes(pattern.toLocaleLowerCase())) continue;
      failures.push(failure(
        'PUBLIC_BOUNDARY_CONTENT_FORBIDDEN',
        file.rootId,
        file.relativePath,
        `公共平台文件包含禁止的项目身份或业务内容：${pattern}`,
      ));
    }
  }
  return failures;
}

function inspectContentPolicies(
  manifest: MigrationClosureManifest,
  files: readonly ScannedFile[],
): MigrationClosureFailure[] {
  const failures: MigrationClosureFailure[] = [];
  for (const policy of manifest.contentPolicies ?? []) {
    for (const file of files.filter((item) => (
      item.rootId === policy.rootId
      && policy.patterns.some((pattern) => matchesGlob(item.relativePath, pattern))
    ))) {
      const content = readTextForBoundary(file.absolutePath);
      if (!content) continue;
      for (const pattern of policy.forbiddenPatterns) {
        if (!content.toLocaleLowerCase().includes(pattern.toLocaleLowerCase())) continue;
        failures.push(failure(
          'FORBIDDEN_CONTENT_REFERENCE',
          file.rootId,
          file.relativePath,
          `${policy.id} 禁止引用：${pattern}`,
        ));
      }
    }
  }
  return failures;
}

function inspectRequiredAssets(
  manifest: MigrationClosureManifest,
  roots: ReadonlyMap<string, ResolvedRoot>,
): MigrationClosureFailure[] {
  const failures: MigrationClosureFailure[] = [];
  for (const policy of manifest.requiredAssets ?? []) {
    const root = roots.get(policy.rootId)!;
    for (const requiredPath of policy.paths) {
      const absolutePath = path.resolve(root.absolutePath, requiredPath);
      if (isInside(root.absolutePath, absolutePath) && fs.existsSync(absolutePath)) continue;
      failures.push(failure(
        'REQUIRED_MIGRATION_ASSET_MISSING',
        policy.rootId,
        normalizePath(requiredPath),
        `缺少迁移目标资产，策略 ${policy.id}`,
      ));
    }
  }
  return failures;
}

function readTextForBoundary(filePath: string): string | null {
  const buffer = fs.readFileSync(filePath);
  if (buffer.includes(0)) return null;
  return buffer.toString('utf8');
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function fingerprintInputs(
  manifest: MigrationClosureManifest,
  files: readonly ScannedFile[],
  failures: MigrationClosureReport['failures'],
): string {
  const hash = createHash('sha256');
  hash.update(stableJson(manifest));
  for (const file of files) {
    hash.update(`${file.rootId}\0${file.relativePath}\0${file.category ?? 'unowned'}\0`);
    if (file.category !== 'generated-evidence' && file.category !== 'transient') {
      hash.update(snapshotFileHash(file) ?? 'file-removed-before-snapshot');
    }
    hash.update('\0');
  }
  hash.update(stableJson(failures));
  return hash.digest('hex');
}

function extractModuleSpecifiers(source: string): string[] {
  const values: string[] = [];
  const sourceFile = ts.createSourceFile('migration-audit.ts', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const visit = (node: ts.Node) => {
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node))
      && node.moduleSpecifier
      && ts.isStringLiteralLike(node.moduleSpecifier)) {
      values.push(node.moduleSpecifier.text);
    } else if (ts.isImportEqualsDeclaration(node)
      && ts.isExternalModuleReference(node.moduleReference)
      && node.moduleReference.expression
      && ts.isStringLiteralLike(node.moduleReference.expression)) {
      values.push(node.moduleReference.expression.text);
    } else if (ts.isCallExpression(node)
      && node.arguments.length === 1
      && ts.isStringLiteralLike(node.arguments[0])
      && (node.expression.kind === ts.SyntaxKind.ImportKeyword
        || (ts.isIdentifier(node.expression) && node.expression.text === 'require'))) {
      values.push(node.arguments[0].text);
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return [...new Set(values)];
}

function resolveModuleSpecifier(importerPath: string, specifier: string): string | null {
  if (!specifier.startsWith('.') && !path.isAbsolute(specifier)) return null;
  const unresolved = path.resolve(path.dirname(importerPath), specifier);
  const extension = path.extname(unresolved);
  const baseWithoutJavaScriptExtension = /\.(?:mjs|cjs|js)$/.test(extension)
    ? unresolved.slice(0, -extension.length)
    : unresolved;
  const candidates = [
    unresolved,
    `${unresolved}.ts`,
    `${unresolved}.tsx`,
    `${unresolved}.js`,
    `${unresolved}.mjs`,
    `${unresolved}.cjs`,
    `${unresolved}.json`,
    `${baseWithoutJavaScriptExtension}.ts`,
    `${baseWithoutJavaScriptExtension}.tsx`,
    path.join(unresolved, 'index.ts'),
    path.join(unresolved, 'index.tsx'),
    path.join(unresolved, 'index.js'),
  ];
  return candidates.find((candidate) => fs.existsSync(candidate) && fs.statSync(candidate).isFile()) ?? null;
}

function isSingleReExport(source: string, importerPath: string, targetPath: string): boolean {
  if (source.split(/\r?\n/).filter((line) => line.trim()).length !== 1) return false;
  const match = source.match(/^export \* from ['"]([^'"]+)['"];?$/);
  if (!match) return false;
  const resolved = resolveModuleSpecifier(importerPath, match[1]);
  return resolved !== null && samePath(resolved, targetPath);
}

function extractCommandTargets(command: string): string[] {
  const targets: string[] = [];
  const runtimePattern = /(?:^|[;&|]\s*)(?:npx\s+)?(?:tsx|node)\s+(?:"([^"]+)"|'([^']+)'|([^\s]+))/g;
  for (const match of command.matchAll(runtimePattern)) {
    const target = match[1] ?? match[2] ?? match[3];
    if (isFileTarget(target)) targets.push(target);
  }
  const playwrightPattern = /(?:npx\s+)?playwright\s+test\s+([^;&|]+)/g;
  for (const match of command.matchAll(playwrightPattern)) {
    const tokenPattern = /"([^"]+)"|'([^']+)'|([^\s]+)/g;
    for (const tokenMatch of match[1].matchAll(tokenPattern)) {
      const token = tokenMatch[1] ?? tokenMatch[2] ?? tokenMatch[3];
      if (token.startsWith('-')) continue;
      if (isFileTarget(token)) targets.push(token);
    }
  }
  return [...new Set(targets.map((item) => item.replace(/[),]$/, '')))];
}

function isFileTarget(value: string): boolean {
  if (!value || value.startsWith('-') || value.includes('${') || value.includes('*')) return false;
  return /\.(?:ts|tsx|js|mjs|cjs)$/.test(value) || /^(?:\.{1,2}[\\/]|tests?[\\/]|scripts?[\\/])/.test(value);
}

function readStringValues(filePath: string): string[] {
  if (path.extname(filePath).toLowerCase() === '.json') {
    try {
      const values: string[] = [];
      collectStrings(JSON.parse(fs.readFileSync(filePath, 'utf8')), values);
      return values;
    } catch {
      return [];
    }
  }
  return [...fs.readFileSync(filePath, 'utf8').matchAll(/["']([^"']+)["']/g)].map((match) => match[1]);
}

function collectStrings(value: unknown, output: string[]): void {
  if (typeof value === 'string') {
    output.push(value);
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectStrings(item, output);
    return;
  }
  if (value && typeof value === 'object') {
    for (const item of Object.values(value as Record<string, unknown>)) collectStrings(item, output);
  }
}

function matchesGlob(value: string, pattern: string): boolean {
  return globToRegExp(normalizePath(pattern)).test(normalizePath(value));
}

function globToRegExp(pattern: string): RegExp {
  let source = '^';
  for (let index = 0; index < pattern.length; index += 1) {
    const character = pattern[index];
    if (character === '*') {
      const next = pattern[index + 1];
      if (next === '*') {
        index += 1;
        if (pattern[index + 1] === '/') {
          index += 1;
          source += '(?:.*/)?';
        } else source += '.*';
      } else source += '[^/]*';
      continue;
    }
    if (character === '?') {
      source += '[^/]';
      continue;
    }
    source += character.replace(/[|\\{}()[\]^$+?.]/g, '\\$&');
  }
  return new RegExp(`${source}$`, 'i');
}

function normalizePath(value: string): string {
  return value.replaceAll('\\', '/').replace(/^\.\//, '').replace(/\/$/, '');
}

function samePath(left: string, right: string): boolean {
  return path.resolve(left).toLowerCase() === path.resolve(right).toLowerCase();
}

function isInside(rootPath: string, targetPath: string): boolean {
  const root = path.resolve(rootPath).toLowerCase();
  const target = path.resolve(targetPath).toLowerCase();
  return target === root || target.startsWith(`${root}${path.sep}`);
}

function sha256File(filePath: string): string {
  return createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function snapshotFileHash(file: ScannedFile): string | null {
  if (file.sha256) return file.sha256;
  try {
    file.sha256 = sha256File(file.absolutePath);
    return file.sha256;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

function failure(code: string, rootId: string, relativePath: string, detail: string): MigrationClosureFailure {
  return { code, path: `${rootId}:${normalizePath(relativePath)}`, detail };
}

function sortFailures(items: readonly MigrationClosureFailure[]): MigrationClosureFailure[] {
  return [...new Map(items.map((item) => [`${item.code}:${item.path}:${item.detail}`, item])).values()]
    .sort((left, right) => `${left.code}:${left.path}:${left.detail}`.localeCompare(`${right.code}:${right.path}:${right.detail}`));
}
