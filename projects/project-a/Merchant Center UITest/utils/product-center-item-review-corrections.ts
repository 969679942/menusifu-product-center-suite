import type { ProductCenterItemRebuiltCase } from './product-center-item-xmind-rebuild';

export const productCenterItemFullReviewCorrectionCaseIds = [
  'TC-ITEM-STD-037', 'TC-ITEM-STD-036', 'TC-ITEM-STD-038', 'TC-ITEM-ADD-005', 'TC-ITEM-PKG-009',
  'TC-ITEM-STD-039', 'TC-ITEM-STD-010', 'TC-ITEM-STD-016', 'TC-ITEM-STD-017',
  'TC-ITEM-STD-018', 'TC-ITEM-STD-021', 'TC-ITEM-STD-022', 'TC-ITEM-STD-040',
  'TC-ITEM-STD-047', 'TC-ITEM-ADD-001', 'TC-ITEM-ADD-010', 'TC-ITEM-PKG-015',
  'TC-ITEM-PKG-019', 'TC-ITEM-PKG-001', 'TC-ITEM-PKG-006', 'TC-ITEM-PKG-007',
  'TC-ITEM-PKG-026', 'TC-ITEM-PKG-035', 'TC-ITEM-STD-067', 'TC-ITEM-PKG-039',
  'TC-ITEM-PKG-037', 'TC-ITEM-PKG-008', 'TC-ITEM-ADD-024', 'TC-ITEM-STD-066',
  'TC-ITEM-ADD-042', 'TC-ITEM-ADD-043', 'TC-ITEM-ADD-044', 'TC-ITEM-STD-068',
  'TC-ITEM-ADD-026', 'TC-ITEM-STD-043', 'TC-ITEM-ADD-016', 'TC-ITEM-STD-001',
  'TC-ITEM-STD-002', 'TC-ITEM-STD-094', 'TC-ITEM-STD-015', 'TC-ITEM-STD-020',
  'TC-ITEM-STD-050', 'TC-ITEM-STD-051', 'TC-ITEM-ADD-011', 'TC-ITEM-PKG-005',
  'TC-ITEM-PKG-023', 'TC-ITEM-PKG-044', 'TC-ITEM-PKG-056', 'TC-ITEM-PKG-061',
  'TC-ITEM-PKG-062', 'TC-ITEM-STD-064', 'TC-ITEM-STD-065', 'TC-ITEM-STD-055',
  'TC-ITEM-STD-046', 'TC-ITEM-ADD-002', 'TC-ITEM-STD-004', 'TC-ITEM-STD-063',
  'TC-ITEM-STD-086',
] as const;

const correctionIds = new Set<string>(productCenterItemFullReviewCorrectionCaseIds);

export const productCenterItemEvidencePromotedCaseIds = [
  'TC-ITEM-PKG-010', 'TC-ITEM-PKG-075', 'TC-ITEM-STD-092', 'TC-ITEM-STD-096',
  'TC-ITEM-ADD-045', 'TC-ITEM-ADD-046',
  'TC-ITEM-UI-001', 'TC-ITEM-UI-002', 'TC-ITEM-UI-003', 'TC-ITEM-UI-004',
  'TC-ITEM-UI-005', 'TC-ITEM-UI-006', 'TC-ITEM-UI-007', 'TC-ITEM-UI-008',
] as const;

export const productCenterItemProductDecisionCaseIds = [
] as const;

const evidencePromotedIds = new Set<string>(productCenterItemEvidencePromotedCaseIds);

export function applyProductCenterItemFullReviewCorrections(
  cases: readonly ProductCenterItemRebuiltCase[],
): {
  cases: ProductCenterItemRebuiltCase[];
  correctedSourceCaseIds: string[];
  splitCaseIds: string[];
} {
  const correctedSourceCaseIds = cases
    .filter((item) => correctionIds.has(item.id) && item.changeType !== 'product-corrected')
    .map((item) => item.id);
  const correctedSourceIds = new Set(correctedSourceCaseIds);
  const corrected = cases.map((item) => correctedSourceIds.has(item.id) ? correctCase(item) : structuredClone(item));
  const byId = new Map(corrected.map((item) => [item.id, item]));
  const splitCases = buildSplitCases(byId);
  const allCases = [...corrected, ...splitCases];
  const duplicate = allCases.find((item, index) => allCases.findIndex((candidate) => candidate.id === item.id) !== index);
  if (duplicate) throw new Error(`全审修订产生重复用例：${duplicate.id}`);
  if (productCenterItemFullReviewCorrectionCaseIds.some((caseId) => !byId.has(caseId))) {
    throw new Error('全审修订目标与当前重建计划不一致');
  }
  return {
    cases: allCases,
    correctedSourceCaseIds,
    splitCaseIds: splitCases.map((item) => item.id),
  };
}

export function applyProductCenterItemEvidenceReview(
  cases: readonly ProductCenterItemRebuiltCase[],
): {
  cases: ProductCenterItemRebuiltCase[];
  evidencePromotedCaseIds: string[];
  productDecisionCaseIds: string[];
} {
  const byId = new Map(cases.map((item) => [item.id, item]));
  const expectedIds = [...productCenterItemEvidencePromotedCaseIds, ...productCenterItemProductDecisionCaseIds];
  const missingIds = expectedIds.filter((caseId) => !byId.has(caseId));
  if (missingIds.length > 0) {
    throw new Error(`证据审核目标与当前重建计划不一致：${missingIds.join(',')}`);
  }
  return {
    cases: cases.map((item) => evidencePromotedIds.has(item.id)
      ? promoteEvidenceCase(item)
      : structuredClone(item)),
    evidencePromotedCaseIds: [...productCenterItemEvidencePromotedCaseIds],
    productDecisionCaseIds: [...productCenterItemProductDecisionCaseIds],
  };
}

function promoteEvidenceCase(source: ProductCenterItemRebuiltCase): ProductCenterItemRebuiltCase {
  let item = structuredClone(source);
  item.status = 'pending-full-review';
  item.changeType = 'expert-reviewed-corrected';
  item.diagnostics = item.diagnostics.filter((code) =>
    code !== 'UNSUPPORTED_SOURCE_FORMAT' && code !== 'PAGE_ONLY_BUSINESS_OUTCOME_REVIEW_REQUIRED');
  item.diagnostics.push(item.origin === 'page-supplement'
    ? 'PAGE_CAPABILITY_EXPERT_REVIEWED'
    : 'FORMAL_EVIDENCE_EXPERT_REVIEWED');

  if (item.id === 'TC-ITEM-PKG-010') {
    return {
      ...item,
      source: '业务规则明确 ← BR-ITEM-010 商品名称对标准/套餐/加料统一必填；PRD明确 ← 5.1.1 套餐商品新增/编辑',
      expectedResults: [
        '页面仍停留在套餐商品创建页，未出现「提交成功」提示。',
        '商品名称字段提示「请输入商品名称」。',
      ],
    };
  }
  if (item.id === 'TC-ITEM-PKG-075') {
    return {
      ...item,
      source: '业务规则明确 ← 商品中心业务规则 §1 商品角标数量 0-1；PRD明确 ← 5.1.1 套餐商品其他设置',
      expectedResults: [
        '选择角标A和改选角标B后均展示「提交成功」提示。',
        '再次进入编辑页时仅回显角标B，未同时保留角标A。',
      ],
    };
  }
  if (item.id === 'TC-ITEM-ADD-045') {
    return {
      ...item,
      source: '业务规则明确 ← 商品中心业务规则 §1 商品角标数量 0-1；PRD明确 ← 5.1.1 加料商品其他设置',
      expectedResults: [
        '选择角标A和改选角标B后均展示「提交成功」提示。',
        '再次进入编辑页时仅回显角标B，未同时保留角标A。',
      ],
    };
  }
  if (item.id === 'TC-ITEM-ADD-046') {
    return {
      ...item,
      title: '加料商品不能同时保留超过 5 个描述标签',
      source: '业务规则明确 ← 商品中心业务规则 §1 描述标签数量 0-5；PRD明确 ← 5.1.1 加料商品其他设置',
      actions: [
        '在描述标签区域依次选择 5 个不同描述标签。',
        '尝试选择第 6 个描述标签。',
        '查看当前已选描述标签。',
      ],
      expectedResults: [
        '第 6 个描述标签不能与前 5 个同时保持选中。',
        '当前已选描述标签数量不超过 5 个。',
      ],
    };
  }
  if (item.id === 'TC-ITEM-STD-092') {
    return {
      ...item,
      source: 'PRD明确 ← 5.1.1 品牌商品 / 商品新增、编辑页面 / 标准商品新增编辑；XMind已有 ← 标准商品 / 编辑 / 编辑页加载',
      actions: [
        '通过侧边栏进入商品列表页。',
        '按商品名称「标准商品-编辑加载测试」和商品类型「标准商品」筛选。',
        '点击查询到的目标商品名称进入编辑页。',
        '查看页面标题、左侧导航和基础信息区域。',
      ],
      expectedResults: [
        '页面进入标准商品编辑页，页面标题或面包屑体现编辑状态。',
        '商品名称回显「标准商品-编辑加载测试」，标准价回显 `9.99`，商品规格回显单规格。',
        '页面展示基本信息、商品价格、商品属性和其他信息模块入口。',
      ],
    };
  }
  if (item.id === 'TC-ITEM-STD-096') {
    return {
      ...item,
      source: 'PRD明确 ← 5.1.1 标准商品新增编辑及主图本地上传；业务规则明确 ← BR-ITEM-005',
      actions: [
        '通过侧边栏进入商品列表页。',
        '按商品名称「标准商品-主图上传测试」和商品类型「标准商品」筛选。',
        '点击查询到的目标商品名称进入编辑页。',
        '在基本信息区域打开上传图片入口。',
        '选择本地上传并上传前置条件中的合规图片。',
        '点击保存。',
        '在商品列表按商品名称查询目标商品并再次进入编辑页。',
      ],
      expectedResults: [
        '上传后主图预览区展示本次上传的图片缩略图。',
        '保存后页面展示「提交成功」提示。',
        '商品列表主图列展示本次上传的图片缩略图。',
        '再次进入编辑页时主图仍回显为本次上传的图片。',
        '商品名称和标准价回显与保存前一致。',
      ],
    };
  }
  return item;
}

function correctCase(source: ProductCenterItemRebuiltCase): ProductCenterItemRebuiltCase {
  let item = structuredClone(source);
  item.actions = item.actions.flatMap(correctAction).map(rewriteBrittleTarget);
  item.expectedResults = item.expectedResults.flatMap((value) => correctExpectation(item.id, value));
  item = applySourceAndTitleCorrections(item);
  item = applySpecificCorrections(item);
  item.changeType = 'expert-reviewed-corrected';
  item.diagnostics = [...new Set([
    ...item.diagnostics.filter((code) => code !== 'UNSUPPORTED_SOURCE_FORMAT'
      || !/^(业务规则明确|PRD明确|XMind已有)/.test(item.source)),
    'FULL_REVIEW_CORRECTED',
  ])];
  return item;
}

function correctAction(value: string): string[] {
  const normalized = value.trim();
  if (/^页面自动返回.*等待列表数据刷新/.test(normalized)) return [];
  if (/^等待页面提示消失及列表数据自动刷新/.test(normalized)) return [];
  if (/^等待列表数据自动刷新[。，]?$/.test(normalized)) return [];
  if (/^等待列表数据自动刷新[，,]按商品名称查询该商品/.test(normalized)) {
    return ['在商品列表按本次商品名称查询该商品'];
  }
  if (/^等待列表数据自动刷新[，,]按名称查询该商品/.test(normalized)) {
    return ['在商品列表按本次商品名称查询该商品'];
  }
  if (/^等待列表数据自动刷新[，,]查看列表中该商品标准价\/规格价展示/.test(normalized)) {
    return ['在商品列表按本次商品名称查询并查看规格价格'];
  }
  if (/^页面返回商品列表，等待列表刷新；再次按名称\+类型查询该商品/.test(normalized)) {
    return ['在商品列表按商品名称和商品类型查询该商品'];
  }
  return [normalized];
}

function rewriteBrittleTarget(value: string): string {
  return value
    .replace(/点击列表第一行（([^）]+)）操作列/g, '点击目标商品（$1）操作列')
    .replace(/点击列表第一行操作列/g, '点击目标商品操作列')
    .replace(/点击列表第一行商品名称/g, '点击查询到的目标商品名称');
}

function correctExpectation(caseId: string, value: string): string[] {
  let normalized = value.trim();
  if (caseId !== 'TC-ITEM-STD-006' && /^排序校验：/.test(normalized)) return [];
  if (caseId !== 'TC-ITEM-STD-006' && /对应分类下新增一条商品记录，展示在该分类商品列表最上方/.test(normalized)) {
    return ['商品列表按本次商品名称查询到新增记录。'];
  }
  if (caseId !== 'TC-ITEM-STD-006' && /第一条展示的商品必须同时满足/.test(normalized)) {
    normalized = normalized
      .replace(/列表数据校验：列表自动刷新，第一条展示的商品必须同时满足：/, '列表按本次商品名称查询到的记录满足：')
      .replace(/商品状态为「启用」/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }
  if (/未产生不符合预期的数据变更/.test(normalized)) {
    return ['商品列表按本次测试商品名称查询不到新增记录。'];
  }
  if (/编码已存在于数据库中/.test(normalized)) {
    return ['页面提示 `BITEM-7003`，商品编码已存在。'];
  }
  return [normalized];
}

function applySourceAndTitleCorrections(item: ProductCenterItemRebuiltCase): ProductCenterItemRebuiltCase {
  const sourceOverrides: Record<string, string> = {
    'TC-ITEM-STD-021': '业务规则明确 ← BR-FMT-005',
    'TC-ITEM-ADD-010': '业务规则明确 ← BR-FMT-005',
    'TC-ITEM-PKG-019': '业务规则明确 ← BR-FMT-005',
    'TC-ITEM-ADD-001': 'PRD明确 ← 5.1.1 加料商品基础字段范围；业务规则明确 ← BR-ITEM-003',
    'TC-ITEM-PKG-001': 'PRD明确 ← 5.1.1 套餐商品基础字段范围',
    'TC-ITEM-PKG-035': 'PRD明确 ← 5.1.1 套餐商品新增编辑字段',
    'TC-ITEM-PKG-008': 'PRD明确 ← 5.1.1 标准商品与套餐商品字段范围；套餐特有为添加套餐分组',
    'TC-ITEM-PKG-005': '业务规则明确 ← BR-ITEM-005 / BR-ITEM-006 / BR-MAT-002；XMind已有 ← 套餐商品其他设置与标准商品一致',
    'TC-ITEM-ADD-002': '业务规则明确 ← BR-ITEM-005 / BR-ITEM-006 / BR-MAT-002；XMind已有 ← 加料商品其他设置与标准商品一致',
  };
  const titleOverrides: Record<string, string> = {
    'TC-ITEM-STD-001': '标准商品创建页展示商品类型入口与核心配置模块',
    'TC-ITEM-STD-002': '商品列表展示分类树、核心字段、分页和查询入口',
    'TC-ITEM-PKG-008': '套餐商品创建页展示基础信息与套餐组配置入口',
    'TC-ITEM-STD-004': '切换中英文后商品页面文案随系统语言切换',
    'TC-ITEM-STD-063': '商品列表分页支持切换 10/20/50/100 条',
    'TC-ITEM-STD-086': '移除已引用口味组子项后详情不再展示该子项',
  };
  return {
    ...item,
    source: sourceOverrides[item.id] ?? item.source,
    title: titleOverrides[item.id] ?? item.title,
  };
}

function applySpecificCorrections(item: ProductCenterItemRebuiltCase): ProductCenterItemRebuiltCase {
  if (item.id === 'TC-ITEM-STD-040') {
    return {
      ...item,
      title: '【已废弃 v3.3】起售数量为 0 时保存失败并提示 SYSTEM-0001（与 TC-ITEM-STD-022 重复）',
      status: 'deprecated',
    };
  }
  if (item.id === 'TC-ITEM-STD-001') {
    return {
      ...item,
      source: 'ui-observed ← 认证只读页面审计 2026-07-30 ← /pp/brand/create/standard',
      actions: [
        '点击侧边栏【商品管理】-【商品】，进入商品列表页',
        '点击【新增商品】，进入商品类型选择页',
        '选择【标准商品】，进入标准商品创建页',
        '查看基础信息、价格、打印设置、商品属性和更多设置模块',
        '展开高级设置，查看 Industry Goods 字段',
        '打开商品属性添加菜单和更多设置模块',
      ],
      expectedResults: [
        '商品类型选择页展示标准商品、套餐商品和配菜/加料入口。',
        '标准商品创建页展示 Basic Info、Price、Print Settings、Attribute 和 More Settings 模块。',
        '高级设置展示 Industry Goods 字段。',
        '商品属性添加菜单展示 Flavor、Recipe、Additives 入口，更多设置展示描述标签、角标、统计标签和材料信息入口。',
      ],
      diagnostics: [...new Set([...item.diagnostics, 'PAGE_CAPABILITY_EXPERT_REVIEWED'])],
    };
  }
  if (item.id === 'TC-ITEM-STD-038') {
    return {
      ...item,
      expectedResults: [
        '页面仍停留在标准商品创建页，未出现「提交成功」提示。',
        '点击保存后未发出标准商品创建请求。',
        '商品列表按本次测试商品名称查询不到新增记录。',
      ],
      diagnostics: [...new Set([...item.diagnostics, 'PAGE_CAPABILITY_EXPERT_REVIEWED'])],
    };
  }
  if (item.id === 'TC-ITEM-STD-002') {
    return {
      ...item,
      expectedResults: item.expectedResults.filter((value) => !/^排序校验：/.test(value)),
    };
  }
  if (item.id === 'TC-ITEM-STD-004') {
    return {
      ...item,
      expectedResults: [
        '中文模式下，商品页面标题、字段标签和操作按钮显示中文文案。',
        '英文模式下，同一页面标题、字段标签和操作按钮切换为英文文案。',
      ],
    };
  }
  if (item.id === 'TC-ITEM-STD-016') {
    return {
      ...item,
      actions: [
        ...item.actions,
        '在商品列表按本次商品名称查询新建记录',
      ],
      expectedResults: [
        '页面展示「提交成功」的 Toast 提示。',
        '列表按本次商品名称查询到唯一记录，规格展示「大」「小」，对应价格分别为 `12.00` 和 `9.99`。',
      ],
    };
  }
  if (item.id === 'TC-ITEM-STD-018') {
    return {
      ...item,
      actions: [
        ...item.actions.filter((value) => !/点击查询到的目标商品名称进入编辑页/.test(value)),
        '在商品列表按本次商品名称查询并进入编辑页',
      ],
      expectedResults: [
        '页面展示「提交成功」的 Toast 提示。',
        '列表按本次商品名称查询到唯一记录，商品类型为标准商品，标准价为 `10.00`。',
        '编辑页中「是否称重商品」为「是」，销售单位为 `g`。',
      ],
    };
  }
  if (['TC-ITEM-STD-036', 'TC-ITEM-ADD-005', 'TC-ITEM-PKG-006', 'TC-ITEM-PKG-007', 'TC-ITEM-PKG-009']
    .includes(item.id) && !item.actions.some((value) => /按本次商品名称查询/.test(value))) {
    const openDetail = item.id === 'TC-ITEM-PKG-006' || item.id === 'TC-ITEM-PKG-007';
    return {
      ...item,
      actions: [
        ...item.actions,
        openDetail
          ? '在商品列表按本次商品名称查询并进入编辑页'
          : '在商品列表按本次商品名称查询新建记录',
      ],
    };
  }
  if (item.id === 'TC-ITEM-STD-021') {
    return replaceCaseText({ ...item, title: '标准价输入负数时创建失败' }, [
      ['负数或非数字', '负数'],
    ]);
  }
  if (item.id === 'TC-ITEM-ADD-010') {
    return replaceCaseText({ ...item, title: '加料商品标准价输入负数时创建失败' }, [
      ['价格输入负数或非数字', '标准价输入负数'],
      ['标准价输入负数或非数字内容', '标准价输入 `-1`'],
    ]);
  }
  if (item.id === 'TC-ITEM-PKG-019') {
    return replaceCaseText({ ...item, title: '套餐商品标准价输入负数时创建失败' }, [
      ['价格输入负数或非数字', '标准价输入负数'],
    ]);
  }
  if (item.id === 'TC-ITEM-STD-050') {
    return {
      ...replaceCaseText(item, [['包装费与成本', '包装费']]),
      title: '单规格商品包装费合法输入时保存成功',
      actions: item.actions
        .map((value) => value.replace('「包装费」填写 `1.00`；「成本」填写 `5.00`', '「包装费」填写 `1.00`'))
        .concat('在商品列表按本次商品名称查询并进入编辑页'),
      expectedResults: ['页面展示「提交成功」的 Toast 提示。', '编辑页中包装费回显为 `1.00`。'],
    };
  }
  if (item.id === 'TC-ITEM-ADD-011') {
    return {
      ...replaceCaseText(item, [['包装费与成本', '包装费']]),
      title: '加料商品包装费合法输入时保存成功',
      actions: item.actions
        .filter((value) => !/^成本填写/.test(value))
        .concat('在商品列表按本次商品名称查询并进入编辑页'),
      expectedResults: ['页面展示「提交成功」的 Toast 提示。', '编辑页中包装费回显为 `1.00`。'],
    };
  }
  if (item.id === 'TC-ITEM-STD-055') {
    return {
      ...item,
      title: '标准商品选择多个描述标签后保存成功',
      actions: ['描述标签选择 2 项。', '点击保存。', '重新打开商品编辑页。'],
      expectedResults: ['页面展示「提交成功」的 Toast 提示。', '描述标签回显为本次选择的 2 项。'],
    };
  }
  if (item.id === 'TC-ITEM-STD-046') {
    return {
      ...replaceCaseText(item, [['助记码或设备编码', '助记码']]),
      title: '助记码超过 20 字符时保存失败',
      actions: item.actions.filter((value) => !/^设备编码输入/.test(value)),
      expectedResults: [
        '页面仍停留在当前页，未出现保存成功提示。',
        '助记码字段出现超过 20 字符的格式校验提示。',
        '商品列表按本次测试商品名称查询不到新增记录。',
      ],
    };
  }
  return item;
}

function buildSplitCases(
  byId: ReadonlyMap<string, ProductCenterItemRebuiltCase>,
): ProductCenterItemRebuiltCase[] {
  const splitCases: ProductCenterItemRebuiltCase[] = [];
  splitCases.push(splitFrom(byId, 'TC-ITEM-STD-021', 'TC-ITEM-STD-097', '标准价输入非数字时创建失败', [
    ['负数', '非数字'], ['`-1`', '`abc`'],
  ]));
  splitCases.push(splitFrom(byId, 'TC-ITEM-ADD-010', 'TC-ITEM-ADD-048', '加料商品标准价输入非数字时创建失败', [
    ['负数', '非数字'], ['`-1`', '`abc`'],
  ]));
  splitCases.push(splitFrom(byId, 'TC-ITEM-PKG-019', 'TC-ITEM-PKG-077', '套餐商品标准价输入非数字时创建失败', [
    ['负数', '非数字'], ['`-1`', '`abc`'],
  ]));

  const standardCost = splitFrom(byId, 'TC-ITEM-STD-050', 'TC-ITEM-STD-098', '单规格商品成本合法输入时保存成功', [
    ['包装费', '成本'], ['成本与成本', '成本'], ['`1.00`', '`5.00`'],
  ]);
  standardCost.expectedResults = ['页面展示「提交成功」的 Toast 提示。', '编辑页中成本回显为 `5.00`。'];
  splitCases.push(standardCost);

  const addonCost = splitFrom(byId, 'TC-ITEM-ADD-011', 'TC-ITEM-ADD-049', '加料商品成本合法输入时保存成功', [
    ['包装费', '成本'], ['成本与成本', '成本'], ['`1.00`', '`3.50`'],
  ]);
  addonCost.expectedResults = ['页面展示「提交成功」的 Toast 提示。', '编辑页中成本回显为 `3.50`。'];
  splitCases.push(addonCost);

  const badge = splitFrom(byId, 'TC-ITEM-STD-055', 'TC-ITEM-STD-099', '标准商品选择一个商品角标后保存成功', [
    ['描述标签', '商品角标'], ['多个', '一个'], ['2 项', '1 项'],
  ]);
  badge.actions = ['商品角标选择 1 项。', '点击保存。', '重新打开商品编辑页。'];
  badge.expectedResults = ['页面展示「提交成功」的 Toast 提示。', '商品角标回显为本次选择的 1 项。'];
  splitCases.push(badge);

  const statistic = splitFrom(byId, 'TC-ITEM-STD-055', 'TC-ITEM-STD-100', '标准商品选择多个统计标签后保存成功', [
    ['描述标签', '统计标签'],
  ]);
  statistic.actions = ['统计标签选择 2 项。', '点击保存。', '重新打开商品编辑页。'];
  statistic.expectedResults = ['页面展示「提交成功」的 Toast 提示。', '统计标签回显为本次选择的 2 项。'];
  splitCases.push(statistic);

  const deviceCode = splitFrom(byId, 'TC-ITEM-STD-046', 'TC-ITEM-STD-101', '设备编码超过 20 字符时保存失败', [
    ['助记码', '设备编码'], ['设备编码或设备编码', '设备编码'],
  ]);
  deviceCode.actions = deviceCode.actions.map((value) =>
    value.replace('设备编码输入超过 20 字符的内容。', '设备编码输入超过 20 字符的内容。'));
  deviceCode.expectedResults = [
    '页面仍停留在当前页，未出现保存成功提示。',
    '设备编码字段出现超过 20 字符的格式校验提示。',
    '商品列表按本次测试商品名称查询不到新增记录。',
  ];
  splitCases.push(deviceCode);
  return splitCases;
}

function splitFrom(
  byId: ReadonlyMap<string, ProductCenterItemRebuiltCase>,
  sourceId: string,
  id: string,
  title: string,
  replacements: ReadonlyArray<readonly [string, string]>,
): ProductCenterItemRebuiltCase {
  const source = byId.get(sourceId);
  if (!source) throw new Error(`拆分用例缺少来源：${sourceId}`);
  const split = replaceCaseText(structuredClone(source), replacements);
  return {
    ...split,
    id,
    title,
    status: 'pending-full-review',
    changeType: 'expert-reviewed-corrected',
    diagnostics: [...new Set([...split.diagnostics, `FULL_REVIEW_SPLIT_FROM:${sourceId}`])],
  };
}

function replaceCaseText(
  item: ProductCenterItemRebuiltCase,
  replacements: ReadonlyArray<readonly [string, string]>,
): ProductCenterItemRebuiltCase {
  const replace = (value: string) => replacements.reduce(
    (current, [from, to]) => current.split(from).join(to),
    value,
  );
  return {
    ...item,
    title: replace(item.title),
    preconditions: item.preconditions.map(replace),
    actions: item.actions.map(replace),
    expectedResults: item.expectedResults.map(replace),
  };
}
