import fs from 'node:fs';
import path from 'node:path';
import {
  parseProductCenterXmindItemPlan,
} from '../utils/product-center-canonical-item-test-plan';
import {
  buildProductCenterItemPageGapReport,
  renderProductCenterItemPageGapMarkdown,
  type ProductCenterItemPageCapability,
  type ProductCenterItemPageObservation,
  type ProductCenterItemPageSupplementCase,
} from '../utils/product-center-item-page-gap';
import { scanGeneratedArtifacts } from '../utils/product-center-run-safety';

const listRoute = '/pp/brand/list';
const standardRoute = '/pp/brand/create/standard';
const comboRoute = '/pp/brand/create/combo';
const observationCitation = '只读页面审计 2026-07-30';

export function buildProductCenterItemPageGapArtifacts(options: {
  projectRoot?: string;
  outputRoot?: string;
  generatedAt?: string;
} = {}): { reportPath: string; markdownPath: string; sourceReviewPath: string } {
  const projectRoot = path.resolve(options.projectRoot ?? path.resolve(__dirname, '..'));
  const outputRoot = path.resolve(options.outputRoot ?? projectRoot);
  const infoRoot = path.resolve(projectRoot, '..', 'Merchant Center Info');
  const formalPath = path.join(
    infoRoot,
    '00-待转换测试方案',
    '用例库',
    '商品中心-商品管理-商品',
    '1.商品中心-商品管理-商品-正式测试用例.md',
  );
  const xmindPath = path.join(
    infoRoot,
    '00-待转换测试方案',
    '用例库',
    '商品中心-商品管理-商品',
    '1.商品中心-商品管理-商品.xmind',
  );
  const report = buildProductCenterItemPageGapReport({
    formalMarkdown: fs.readFileSync(formalPath, 'utf8'),
    xmindPlan: parseProductCenterXmindItemPlan(fs.readFileSync(xmindPath)),
    observation: productCenterItemPageObservation20260730,
    generatedAt: options.generatedAt,
  });
  const reportPath = path.join(
    outputRoot,
    'contracts/product-center/test-cases/canonical/product-center-item-page-gap.json',
  );
  const markdownPath = path.join(
    outputRoot,
    'contracts/product-center/test-cases/canonical/product-center-item-page-gap.md',
  );
  const sourceReviewPath = markdownPath;
  const markdown = renderProductCenterItemPageGapMarkdown(report);
  writeJson(reportPath, report);
  writeText(markdownPath, markdown);
  if (sourceReviewPath !== markdownPath) writeText(sourceReviewPath, markdown);
  const findings = scanGeneratedArtifacts(path.dirname(reportPath));
  if (findings.length > 0) {
    throw new Error(`商品页面差距产物安全扫描未通过：${findings.length}`);
  }
  return { reportPath, markdownPath, sourceReviewPath };
}

export const productCenterItemPageObservation20260730: ProductCenterItemPageObservation = {
  observationId: 'ui-observed:product-center-item:2026-07-30',
  observedAt: '2026-07-30',
  mode: 'read-only',
  routes: [listRoute, '/pp/brand/create', standardRoute, comboRoute, '/pp/brand/edit/standard?id={id}'],
  screenshots: [
    {
      path: 'output/page-audit/product-center-item-2026-07-30/item-list.png',
      status: 'verified-current-page',
      note: '商品列表、查询、操作入口、分页和列配置按钮可见。',
    },
    {
      path: 'output/page-audit/product-center-item-2026-07-30/item-create-standard.png',
      status: 'verified-current-page',
      note: '已在 2026-07-30 重新截取标准商品创建页，替换原权限加载态截图。',
    },
    {
      path: 'output/page-audit/product-center-item-2026-07-30/item-create-combo.png',
      status: 'verified-current-page',
      note: '已在 2026-07-30 重新截取添加可选搭配弹窗，替换原权限加载态截图。',
    },
  ],
  capabilities: capabilities(),
  supplementCases: supplementCases(),
  conflicts: [],
};

function capabilities(): ProductCenterItemPageCapability[] {
  return [
    covered('item.list.search-filter', listRoute, '商品名称、类型、分类、状态查询', ['商品名称搜索框与三类筛选入口可见'], ['TC-ITEM-STD-028', 'TC-ITEM-PKG-034', 'TC-ITEM-ADD-023']),
    covered('item.list.reset', listRoute, '重置查询条件', ['重置按钮可见'], ['TC-ITEM-STD-029', 'TC-ITEM-PKG-047', 'TC-ITEM-ADD-040']),
    supplement('item.list.import-records', listRoute, '导入记录入口', ['导入记录按钮可见'], 'TC-ITEM-UI-001'),
    supplement('item.list.import-actions', listRoute, '图片导入与商品导入入口', ['操作菜单展示图片导入、商品导入'], 'TC-ITEM-UI-002'),
    covered('item.list.column-config', listRoute, '列表列配置', ['列配置图标按钮可见'], ['TC-ITEM-STD-003', 'TC-ITEM-STD-072', 'TC-ITEM-STD-073']),
    covered('item.list.pagination', listRoute, '分页与每页条数', ['分页器与 50 条/页选择器可见'], ['TC-ITEM-STD-063']),
    covered('item.list.lifecycle', listRoute, '行级启用与停用', ['启用商品菜单展示停用，停用商品菜单展示启用'], ['TC-ITEM-STD-065', 'TC-ITEM-STD-066', 'TC-ITEM-PKG-061', 'TC-ITEM-PKG-062', 'TC-ITEM-ADD-042', 'TC-ITEM-ADD-043']),
    supplement('item.list.copy', listRoute, '行级复制', ['行操作菜单展示复制'], 'TC-ITEM-UI-003'),
    covered('item.list.delete', listRoute, '行级删除', ['行操作菜单展示删除'], ['TC-ITEM-STD-068', 'TC-ITEM-STD-069', 'TC-ITEM-STD-070', 'TC-ITEM-STD-075']),
    supplement('item.list.batch-fields', listRoute, '批量编辑基础字段', ['批量菜单展示图片、名称、第二语言、分类、POS名称、送厨名称、助记码、编码、单位、设备编码、描述'], 'TC-ITEM-UI-004'),
    supplement('item.list.batch-commerce', listRoute, '批量修改销售信息、价格与属性', ['批量菜单展示修改销售信息、修改价格、修改属性'], 'TC-ITEM-UI-005'),
    supplement('item.list.batch-menu-delete', listRoute, '批量添加至菜单与删除', ['批量菜单展示添加至菜单、删除'], 'TC-ITEM-UI-006'),
    covered('item.create.type-selection', '/pp/brand/create', '标准、套餐、加料三类商品入口', ['商品类型选择页展示三类商品'], ['TC-ITEM-STD-001', 'TC-ITEM-PKG-008', 'TC-ITEM-ADD-005']),
    supplement('item.standard.save-and-new', standardRoute, '标准商品保存并新建入口', ['标准商品创建页展示保存并新建按钮'], 'TC-ITEM-UI-007'),
    covered('item.standard.required-fields', standardRoute, '标准商品必填字段', ['商品名称与标准价显示必填标记'], ['TC-ITEM-STD-005', 'TC-ITEM-STD-038']),
    covered('item.standard.advanced-fields', standardRoute, '标准商品高级字段与长度', ['高级设置包含 POS名称、送厨名称、助记码、编码、单位、设备编码、描述与起售数量'], ['TC-ITEM-STD-042', 'TC-ITEM-STD-045', 'TC-ITEM-STD-046']),
    covered('item.standard.spec-modes', standardRoute, '称重、单规格与多规格', ['单规格、多规格和称重控件可见'], ['TC-ITEM-STD-047', 'TC-ITEM-STD-049', 'TC-ITEM-STD-050']),
    covered('item.standard.print-stall', standardRoute, '打印档口搜索与多选', ['打印设置展示档口名称搜索框和档口复选框'], ['TC-ITEM-STD-082']),
    covered('item.standard.attributes', standardRoute, '商品属性与互斥规则', ['商品属性添加入口和属性互斥规则区域可见'], ['TC-ITEM-STD-057', 'TC-ITEM-STD-058', 'TC-ITEM-STD-061']),
    covered('item.standard.more-settings', standardRoute, '详情图片、标签、角标、统计标签与材料信息', ['更多设置入口可见'], ['TC-ITEM-STD-054', 'TC-ITEM-STD-055', 'TC-ITEM-STD-056']),
    supplement('item.combo.save-and-new', comboRoute, '套餐商品保存并新建入口', ['套餐商品创建页展示保存并新建按钮'], 'TC-ITEM-UI-008'),
    covered('item.combo.required-fields', comboRoute, '套餐商品必填字段', ['商品名称、标准价和添加套餐分组显示必填标记'], ['TC-ITEM-PKG-010', 'TC-ITEM-PKG-017', 'TC-ITEM-PKG-046']),
    covered('item.combo.fixed-group', comboRoute, '固定搭配新增、选择、搜索与确认', ['套餐分组菜单展示添加固定搭配、选择固定搭配'], ['TC-ITEM-PKG-002', 'TC-ITEM-PKG-003', 'TC-ITEM-PKG-006', 'TC-ITEM-PKG-040', 'TC-ITEM-PKG-041', 'TC-ITEM-PKG-042']),
    covered('item.combo.optional-select', comboRoute, '可选搭配选择、搜索、移除与确认', ['选择可选搭配弹窗展示套餐组名称搜索、列表、已选区域，未选择时确认禁用'], ['TC-ITEM-PKG-004', 'TC-ITEM-PKG-040', 'TC-ITEM-PKG-041', 'TC-ITEM-PKG-043', 'TC-ITEM-PKG-044', 'TC-ITEM-PKG-045', 'TC-ITEM-PKG-056']),
    covered('item.combo.optional-add', comboRoute, '新增可选搭配字段、规则与组卡片边界', [
      '弹窗展示组名称、第二语言、选择数量、相同商品合并展示、组内商品是否可重复选中、商品名称与分类筛选',
      '添加后的组卡片展示规则摘要和组级编辑、删除入口，商品行无单项移除入口',
    ], ['TC-ITEM-PKG-007', 'TC-ITEM-PKG-057', 'TC-ITEM-PKG-058', 'TC-ITEM-PKG-059']),
    covered('item.edit.standard', '/pp/brand/edit/standard?id={id}', '标准商品编辑页', ['编辑页结构与创建页一致'], ['TC-ITEM-STD-031', 'TC-ITEM-STD-033', 'TC-ITEM-STD-092', 'TC-ITEM-STD-096']),
  ];
}

function supplementCases(): ProductCenterItemPageSupplementCase[] {
  return [
    technicalCase('TC-ITEM-UI-001', '商品列表提供导入记录入口', 'P2', listRoute, 'item.list.import-records', ['查看列表顶部工具栏。'], ['导入记录按钮可见且处于可点击状态。'], ['导入记录目标页面和记录字段尚未在本轮只读审计中验证。']),
    technicalCase('TC-ITEM-UI-002', '商品列表操作菜单提供图片导入与商品导入入口', 'P2', listRoute, 'item.list.import-actions', ['点击列表顶部「操作」。'], ['操作菜单同时展示「图片导入」「商品导入」。'], ['导入模板、校验规则、失败处理和导入结果需正式来源确认。']),
    {
      id: 'TC-ITEM-UI-003',
      title: '复制商品时打印档口信息随商品复制',
      proposedPriority: 'P1',
      module: '商品管理 → 商品 → 列表操作 → 复制',
      route: listRoute,
      sourceCitations: [
        uiSource(`${observationCitation} ← ${listRoute} 行操作菜单展示“复制”`),
        { kind: 'business-rule-explicit', citation: '商品中心业务规则 §22：商品复制时，档口信息随商品复制', acceptanceEligible: true },
      ],
      preconditions: ['已登录且有商品管理权限。', '存在已绑定打印档口的 AUTO_AUDIT 标准商品。'],
      actions: ['通过侧边栏进入商品列表。', '打开 AUTO_AUDIT 商品行操作菜单并点击「复制」。', '为复制商品设置唯一名称并保存。', '在列表搜索复制后的商品并打开编辑页。'],
      expectedResults: ['复制流程可进入新增商品编辑状态。', '复制商品保存成功。', '复制商品的打印档口与原商品一致。'],
      status: 'review-required',
      generationAllowed: false,
      capabilityIds: ['navigation.sidebar.open', 'item.list.copy'],
      reviewRequired: ['复制流程的其他继承字段范围未有正式规则，本候选只验证打印档口。', '自动化前需定义按服务端 ID 清理复制商品。'],
    },
    technicalCase('TC-ITEM-UI-004', '勾选商品后批量操作菜单提供基础字段编辑入口', 'P1', listRoute, 'item.list.batch-fields', ['勾选一条 AUTO_AUDIT 商品。', '打开「批量操作(1)」。'], ['菜单展示图片、商品名称、第二语言、商品分类、POS名称、送厨名称、助记码、商品编码、单位、设备编码、商品描述编辑入口。'], ['各字段批量更新范围、覆盖策略和校验规则缺少正式业务来源。']),
    technicalCase('TC-ITEM-UI-005', '勾选商品后批量操作菜单提供销售信息价格与属性入口', 'P1', listRoute, 'item.list.batch-commerce', ['勾选一条 AUTO_AUDIT 商品。', '打开「批量操作(1)」。'], ['菜单展示「修改销售信息」「修改价格」「修改属性」。'], ['品牌商品批量改价和批量属性规则不能沿用门店商品规则，需产品确认。']),
    technicalCase('TC-ITEM-UI-006', '勾选商品后批量操作菜单提供添加至菜单与删除入口', 'P1', listRoute, 'item.list.batch-menu-delete', ['勾选一条 AUTO_AUDIT 商品。', '打开「批量操作(1)」。'], ['菜单展示「添加至菜单」「删除」。'], ['批量添加菜单范围、删除前置限制、确认弹窗和部分失败策略缺少正式业务来源。']),
    technicalCase('TC-ITEM-UI-007', '标准商品创建页提供保存并新建入口', 'P1', standardRoute, 'item.standard.save-and-new', ['进入标准商品创建页。', '查看页面顶部保存操作区。'], ['「保存并新建」按钮可见且处于可点击状态。'], ['保存成功后的留页、清空字段、默认值和失败处理未验证。']),
    technicalCase('TC-ITEM-UI-008', '套餐商品创建页提供保存并新建入口', 'P1', comboRoute, 'item.combo.save-and-new', ['进入套餐商品创建页。', '查看页面顶部保存操作区。'], ['「保存并新建」按钮可见且处于可点击状态。'], ['保存成功后的留页、清空字段、默认值和失败处理未验证。']),
  ];
}

function technicalCase(
  id: string,
  title: string,
  proposedPriority: 'P1' | 'P2',
  route: string,
  capabilityId: string,
  actions: string[],
  expectedResults: string[],
  reviewRequired: string[],
): ProductCenterItemPageSupplementCase {
  return {
    id,
    title,
    proposedPriority,
    module: '商品管理 → 商品 → 页面补充候选',
    route,
    sourceCitations: [uiSource(`${observationCitation} ← ${route}`)],
    preconditions: ['已登录且有商品管理权限。', '通过侧边栏进入商品列表。'],
    actions,
    expectedResults,
    status: 'review-required',
    generationAllowed: false,
    capabilityIds: ['navigation.sidebar.open', capabilityId],
    reviewRequired,
  };
}

function uiSource(citation: string): ProductCenterItemPageSupplementCase['sourceCitations'][number] {
  return { kind: 'ui-observed', citation, acceptanceEligible: false };
}

function covered(
  id: string,
  route: string,
  label: string,
  observedFacts: string[],
  formalCaseIds: string[],
): ProductCenterItemPageCapability {
  return { id, route, label, observedFacts, formalCaseIds, disposition: 'covered' };
}

function supplement(
  id: string,
  route: string,
  label: string,
  observedFacts: string[],
  supplementCaseId: string,
): ProductCenterItemPageCapability {
  return {
    id,
    route,
    label,
    observedFacts,
    formalCaseIds: [],
    disposition: 'supplement-required',
    supplementCaseId,
  };
}

function writeJson(filePath: string, value: unknown): void {
  writeText(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function writeText(filePath: string, value: string): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.tmp`;
  fs.writeFileSync(temporaryPath, value, 'utf8');
  fs.renameSync(temporaryPath, filePath);
}

if (require.main === module) {
  try {
    const paths = buildProductCenterItemPageGapArtifacts();
    process.stdout.write(`商品页面能力差距产物已生成：\n${paths.reportPath}\n${paths.markdownPath}\n${paths.sourceReviewPath}\n`);
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
