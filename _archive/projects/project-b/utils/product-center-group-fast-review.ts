export type ProductFindingReviewInput = {
  caseId: string;
  title: string;
  reason: string;
  expectationReceipts: Array<{ expected: string; observed: string; evidencePaths: string[] }>;
  evidence: Array<{ path: string; sha256: string }>;
};

export type ProductFindingFastReview = {
  schemaVersion: '1.0.0';
  generatedAt: string;
  summary: {
    sourceFindings: number;
    total: number;
    resolvedPassed: number;
    resolvedRebaselined: number;
    decisionPackages: number;
    acceptCurrentUiContract: number;
    acceptCurrentBlockingFeedback: number;
    productFixRecommended: number;
    packageScopeDecision: number;
  };
  decisionPackages: Array<{
    decisionId: 'GRP-DEC-UI' | 'GRP-DEC-DATA' | 'GRP-DEC-PACKAGE';
    title: string;
    recommendation: string;
    approvalEffect: string;
    caseIds: string[];
  }>;
  cases: Array<{
    caseId: string;
    title: string;
    decisionId: 'GRP-DEC-UI' | 'GRP-DEC-DATA' | 'GRP-DEC-PACKAGE';
    expected: string[];
    observed: string;
    recommendation: string;
    evidencePaths: string[];
    evidenceHashes: string[];
  }>;
  resolvedCases: Array<{
    caseId: string;
    title: string;
    result: 'passed' | 'rebaselined';
    expected: string[];
    observed: string;
    recommendation: string;
    evidencePaths: string[];
    evidenceHashes: string[];
  }>;
};

const confirmedBlockingRuleByCaseId = new Map<string, {
  expected: string[];
  observed: string;
  recommendation: string;
}>([
  ['TC-GRP-ADD-003', {
    expected: [
      '必填项全部填写但未添加加料明细时，“确定”按钮保持置灰，无法提交。',
      '不发送创建请求，UI 与 API 均查询不到该加料组。',
    ],
    observed: '运行时确认加料组必填项全部填写但未添加商品时，“确定”按钮保持置灰，未触发创建请求，且未生成加料组记录。',
    recommendation: '通过：符合加料组至少包含一个加料选项的前端预校验规则。',
  }],
  ['TC-GRP-ADD-032', {
    expected: [
      '删除组内唯一加料选项时，页面提示“该组只有一个选项，不能删除”。',
      '删除操作被阻止，不发送业务写请求，原加料明细保持不变。',
    ],
    observed: '界面确认删除唯一加料选项时弹出“该组只有一个选项，不能删除”提示，删除操作被阻止，原明细保持不变。',
    recommendation: '通过：提示文案及末项不可删除行为均符合已确认业务规则。',
  }],
  ['TC-GRP-MTH-005', {
    expected: [
      '填写组名称但未填写有效做法明细时，“确定”按钮保持置灰，无法提交。',
      '不发送创建请求，UI 与 API 均查询不到该做法组。',
    ],
    observed: '运行时确认仅填写组名并保留空做法行时，“确定”按钮保持置灰，未形成业务写入或空做法组记录。',
    recommendation: '通过：符合做法组至少包含一个有效做法明细的前端预校验规则。',
  }],
  ['TC-GRP-SPEC-006', {
    expected: [
      '填写组名称但未填写有效规格明细时，“确定”按钮保持置灰，无法提交。',
      '不发送创建请求，UI 与 API 均查询不到 `TC_SPEC_EMPTY`。',
    ],
    observed: '运行时确认仅填写组名并保留空规格行时，“确定”按钮保持置灰，未形成业务写入或空规格组记录。',
    recommendation: '通过：符合规格组至少包含一个有效规格明细的前端预校验规则。',
  }],
  ['TC-GRP-TASTE-004', {
    expected: [
      '组名称或口味明细名称未填写时，“确定”按钮保持置灰，无法提交。',
      '不发送创建请求，未生成不完整记录。',
    ],
    observed: '运行时确认口味组必填项未满足时，“确定”按钮保持置灰，未形成业务写入或不完整记录。',
    recommendation: '通过：符合口味组必填项未满足时的前端预校验规则。',
  }],
  ['TC-GRP-TASTE-005', {
    expected: [
      '填写组名称但未填写有效口味明细时，“确定”按钮保持置灰，无法提交。',
      '不发送创建请求，UI 与 API 均查询不到该口味组。',
    ],
    observed: '运行时确认仅填写组名并保留空口味行时，“确定”按钮保持置灰，未形成业务写入或空口味组记录。',
    recommendation: '通过：符合口味组至少包含一个有效口味明细的前端预校验规则。',
  }],
]);

const packageScopeDecision = new Set([
  'TC-GRP-PKG-008',
  'TC-GRP-PKG-009',
  'TC-GRP-PKG-010',
  'TC-GRP-PKG-011',
  'TC-GRP-PKG-012',
  'TC-GRP-PKG-013',
  'TC-GRP-PKG-014',
  'TC-GRP-PKG-015',
  'TC-GRP-PKG-017',
  'TC-GRP-PKG-018',
  'TC-GRP-PKG-024',
  'TC-GRP-PKG-025',
  'TC-GRP-PKG-030',
  'TC-GRP-PKG-031',
  'TC-GRP-PKG-032',
  'TC-GRP-PKG-033',
]);

const rebaselinedPackageRuleByCaseId = new Map<string, { expected: string[]; observed: string; recommendation: string }>([
  ['TC-GRP-PKG-008', { expected: ['固定搭配无组级数量；可选搭配使用单一选择数量；随心配使用最少/最多总数量。'], observed: '新版新增页三类型与字段矩阵已完成只读审计，旧“套餐组份数同加料组”合同已被三类型差异化规则替代。', recommendation: '已重基线：按新版三类型字段合同执行。' }],
  ['TC-GRP-PKG-009', { expected: ['通过套餐组名称进入编辑页；已引用可选搭配新增商品不自动应用到既有引用商品。'], observed: '列表名称已确认可进入 /create?id={id} 编辑页，原“无编辑入口”阻断已消失。', recommendation: '已重基线并恢复执行：保留 BR-GRP-031 传播规则。' }],
  ['TC-GRP-PKG-010', { expected: ['可选搭配移除商品后仍满足选择数量时可保存并同步引用商品。'], observed: '可选搭配编辑页存在选择数量和商品行操作，原双数量字段阻断不再成立。', recommendation: '已重基线并恢复执行。' }],
  ['TC-GRP-PKG-011', { expected: ['可选搭配移除商品后不足选择数量时保存失败。'], observed: '可选搭配当前以单一选择数量校验商品数量。', recommendation: '已重基线：不再依赖旧最少/最多字段。' }],
  ['TC-GRP-PKG-012', { expected: ['下调可选搭配选择数量后移除商品可保存并同步引用商品。'], observed: '编辑入口和选择数量字段均已确认存在。', recommendation: '已重基线并恢复执行。' }],
  ['TC-GRP-PKG-013', { expected: ['编辑套餐组基础信息后引用商品同步。'], observed: '固定搭配与可选搭配名称入口均可进入编辑页，基础信息可编辑。', recommendation: '已重基线并恢复执行。' }],
  ['TC-GRP-PKG-014', { expected: ['可选搭配开启重复选择后，可编辑子项最小/最大数量并按 BR-GRP-033 验证传播。'], observed: '可选搭配开启重复选择后已确认出现 Min Qty/Max Qty 列。', recommendation: '已重基线：使用当前子项数量字段。' }],
  ['TC-GRP-PKG-015', { expected: ['随心配默认数量合计超过最大选择数量时保存失败。'], observed: '随心配已确认存在组级最少/最多和子项默认数量字段。', recommendation: '已重基线到随心配规则。' }],
  ['TC-GRP-PKG-017', { expected: ['旧“保存空套餐组后删除”流程不再执行。'], observed: '三种类型无商品均显示 At least one option is required 且不落库，无法保存空套餐组。', recommendation: '已废弃：由无商品校验和删除专项替代。' }],
  ['TC-GRP-PKG-018', { expected: ['编辑套餐组选择商品后取消，不发送更新请求且商品不变。'], observed: '名称入口已确认可进入编辑页，商品选择弹层可打开。', recommendation: '已重基线并恢复执行。' }],
  ['TC-GRP-PKG-024', { expected: ['可选搭配移除默认商品后仍满足选择数量可保存。'], observed: '可选搭配当前存在选择数量、默认和商品行操作。', recommendation: '已重基线：使用单一选择数量。' }],
  ['TC-GRP-PKG-025', { expected: ['可选搭配默认选中数量超过选择数量时保存失败。'], observed: '旧默认数量/最多选择矩阵已替换为可选搭配选择数量与默认选中规则。', recommendation: '已重基线。' }],
  ['TC-GRP-PKG-030', { expected: ['随心配最少选择数量大于最多选择数量时保存失败。'], observed: '随心配已确认存在最少/最多选择数量字段。', recommendation: '已重基线到随心配。' }],
  ['TC-GRP-PKG-031', { expected: ['随心配最少和最多选择数量同时为 0 时保存失败。'], observed: '随心配已确认存在最少/最多选择数量字段。', recommendation: '已重基线到随心配。' }],
  ['TC-GRP-PKG-032', { expected: ['随心配子项默认数量超过最多选择数量时保存失败。'], observed: '随心配已确认存在最多选择数量和默认数量字段。', recommendation: '已重基线到随心配。' }],
  ['TC-GRP-PKG-033', { expected: ['随心配最多选择数量小于最少选择数量时保存失败。'], observed: '随心配组级最少/最多选择数量仍存在；子项最大数量属于独立的重复选择字段，不是本用例校验对象。', recommendation: '已重基线到随心配组级数量规则，移除对子项最大数量字段的依赖。' }],
]);

export function buildProductCenterGroupFastReview(
  findings: readonly ProductFindingReviewInput[],
): ProductFindingFastReview {
  const passedCases = findings
    .filter((finding) => confirmedBlockingRuleByCaseId.has(finding.caseId))
    .map((finding) => {
      const confirmedRule = confirmedBlockingRuleByCaseId.get(finding.caseId)!;
      return {
        caseId: finding.caseId,
        title: finding.title,
        result: 'passed' as const,
        expected: confirmedRule.expected,
        observed: confirmedRule.observed,
        recommendation: confirmedRule.recommendation,
        evidencePaths: evidencePathsFor(finding),
        evidenceHashes: finding.evidence.map((item) => item.sha256),
      };
    });
  const rebaselinedCases = findings
    .filter((finding) => rebaselinedPackageRuleByCaseId.has(finding.caseId))
    .map((finding) => {
      const rule = rebaselinedPackageRuleByCaseId.get(finding.caseId)!;
      return {
        caseId: finding.caseId,
        title: finding.title,
        result: 'rebaselined' as const,
        expected: rule.expected,
        observed: rule.observed,
        recommendation: rule.recommendation,
        evidencePaths: [...new Set([...evidencePathsFor(finding),
          'Merchant Center UITest/output/audit/product-center-group-combo-v2-audit.json',
          'Merchant Center UITest/output/audit/product-center-group-combo-v2-list-audit.json',
          'Merchant Center UITest/output/audit/product-center-group-combo-v2-detail-audit.json',
          'Merchant Center UITest/output/audit/product-center-group-combo-v2-rule-state-audit.json',
          'Merchant Center UITest/output/audit/product-center-group-combo-v2-empty-submit-audit.json',
        ])],
        evidenceHashes: finding.evidence.map((item) => item.sha256),
      };
    });
  const resolvedCases = [...passedCases, ...rebaselinedCases]
    .sort((left, right) => left.caseId.localeCompare(right.caseId));
  const cases = findings
    .filter((finding) => !confirmedBlockingRuleByCaseId.has(finding.caseId)
      && !rebaselinedPackageRuleByCaseId.has(finding.caseId))
    .map((finding) => {
      const decisionId = decisionFor(finding.caseId);
      return {
        caseId: finding.caseId,
        title: finding.title,
        decisionId,
        expected: finding.expectationReceipts.map((item) => item.expected),
        observed: finding.reason,
        recommendation: recommendationFor(decisionId),
        evidencePaths: evidencePathsFor(finding),
        evidenceHashes: finding.evidence.map((item) => item.sha256),
      };
    })
    .sort((left, right) => left.decisionId.localeCompare(right.decisionId) || left.caseId.localeCompare(right.caseId));
  const decisionPackageCandidates: ProductFindingFastReview['decisionPackages'] = [
    {
      decisionId: 'GRP-DEC-DATA',
      title: '按产品缺陷处理数据完整性与传播冲突',
      recommendation: recommendationFor('GRP-DEC-DATA'),
      approvalEffect: '保留原业务预期并进入产品修复队列；修复前这些用例保持产品偏差，不升级为当前行为规则。',
      caseIds: caseIdsFor(cases, 'GRP-DEC-DATA'),
    },
    {
      decisionId: 'GRP-DEC-PACKAGE',
      title: '确认套餐组编辑和双数量字段是否属于当前产品范围',
      recommendation: recommendationFor('GRP-DEC-PACKAGE'),
      approvalEffect: '选择“当前不支持”则关闭对应旧用例并形成当前 UI 范围规则；选择“应支持”则进入产品功能修复队列。',
      caseIds: caseIdsFor(cases, 'GRP-DEC-PACKAGE'),
    },
  ];
  const decisionPackages = decisionPackageCandidates.filter((item) => item.caseIds.length > 0);
  const pendingTotal = decisionPackages.reduce((sum, item) => sum + item.caseIds.length, 0);
  const allCaseIds = [...cases.map((item) => item.caseId), ...resolvedCases.map((item) => item.caseId)];
  if (pendingTotal !== cases.length || allCaseIds.length !== findings.length || new Set(allCaseIds).size !== findings.length) {
    throw new Error(`产品发现快速审核分组不完整：findings=${findings.length} pending=${pendingTotal} resolved=${resolvedCases.length}`);
  }
  return {
    schemaVersion: '1.0.0',
    generatedAt: new Date().toISOString(),
    summary: {
      sourceFindings: findings.length,
      total: cases.length,
      resolvedPassed: passedCases.length,
      resolvedRebaselined: rebaselinedCases.length,
      decisionPackages: decisionPackages.length,
      acceptCurrentUiContract: caseIdsFor(cases, 'GRP-DEC-UI').length,
      acceptCurrentBlockingFeedback: 0,
      productFixRecommended: caseIdsFor(cases, 'GRP-DEC-DATA').length,
      packageScopeDecision: caseIdsFor(cases, 'GRP-DEC-PACKAGE').length,
    },
    decisionPackages,
    cases,
    resolvedCases,
  };
}

function evidencePathsFor(finding: ProductFindingReviewInput): string[] {
  return [...new Set([
    ...finding.evidence.map((item) => item.path),
    ...finding.expectationReceipts.flatMap((item) => item.evidencePaths),
  ])];
}

function decisionFor(caseId: string): ProductFindingFastReview['cases'][number]['decisionId'] {
  if (packageScopeDecision.has(caseId)) return 'GRP-DEC-PACKAGE';
  return 'GRP-DEC-DATA';
}

function recommendationFor(decisionId: ProductFindingFastReview['cases'][number]['decisionId']): string {
  if (decisionId === 'GRP-DEC-UI') return '建议批准当前 UI 合同。';
  if (decisionId === 'GRP-DEC-DATA') return '建议保持原预期并登记产品缺陷。';
  return '需要确认范围；若没有套餐编辑与双数量字段需求，建议批准当前不支持。';
}

function caseIdsFor(
  cases: ProductFindingFastReview['cases'],
  decisionId: ProductFindingFastReview['cases'][number]['decisionId'],
): string[] {
  return cases.filter((item) => item.decisionId === decisionId).map((item) => item.caseId);
}
