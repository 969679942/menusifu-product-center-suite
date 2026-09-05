import { test as productCenterTest } from '../../fixtures/product-center.fixture';
import type { StandardItem216Action } from '../../flows/product-center/item-216/standard-item-216.runner';
import type { PackageItem216Flow } from '../../flows/product-center/item-216/package-item-216.flow';
import type { AddonItem216Flow } from '../../flows/product-center/item-216/addon-item-216.flow';
import { createItemListPage } from '../../pages/product-management/item/item-list.page';
import { acceptProductCenterItemManualOutcome, readProductCenterItemManualDecision } from '../../utils/product-center-item-manual-decisions';
import { writeProductCenterItemProgress } from '../../utils/product-center-item-progress';
import { classifyProductCenterFailure } from '../../utils/product-center-failure-classifier';
import { fingerprintFailureDiagnostic } from '../../utils/product-center-failure-analysis';
import type { CleanupRegistryEvidence } from '../../api/product-center/cleanup-registry';
import sourceDecisionsDocument from '../../contracts/product-center/reviews/unsupported-source-format-decisions.json';
import { loadProductCenterExecutionDecisions } from '../../utils/product-center-execution-decisions';
import { readProductCenterApplicationVersion } from '../../utils/product-center-application-version';
  import { fingerprintReceiptEvidence } from '../../utils/playwright-execution-receipt';
  import { assertObservedExecutableOperations, consumeExecutableOperationReceipts } from '../../utils/executable-operation-receipt';
  import { fingerprintProductCenterItemImplementation } from '../../adapters/product-center/product-center-item-implementation';
  import { appConfig } from '../../test-data/env';

type BusinessRuleReceiptMetadata = {
  businessRuleId: string;
  businessRuleFingerprint: string;
  businessRuleAssertionIdsRequired: string[];
  businessRuleAssertionIdsObserved: string[];
  businessRuleUiEvidenceIds: string[];
  businessRuleApiEvidenceIds: string[];
  businessRuleDownstreamEvidenceIds: string[];
  businessRuleCleanup: { required: boolean; apiZeroResidue: boolean; uiZeroResidue: boolean; uiVerificationObserved?: boolean };
  observedStatement: string;
};

type GeneratedCase = {
  [key: string]: unknown;
  caseId: string;
  title: string;
  automationClassification: 'strict-generatable' | 'blocked' | 'not-applicable';
  recipeId: string | null;
  blockingReasons: string[];
  family: 'standard' | 'package' | 'addon';
  action: StandardItem216Action | null;
  runtimeReadiness: 'ready' | 'environment-blocked';
  runtimeStatus: 'runtime-passed' | 'deferred' | 'unresolved' | 'not-run';
  handlerId: string;
  bindingFingerprint: string;
  semanticCaseFingerprint: string;
  implementationFingerprint: string;
  assertionIds: string[];
  businessRule?: BusinessRuleReceiptMetadata;
};

export const item216FormalCaseInventory = [
  {
    "caseId": "TC-ITEM-STD-001",
    "title": "标准商品创建页展示商品类型入口与核心配置模块",
    "conversionScope": "executable"
  },
  {
    "caseId": "TC-ITEM-STD-002",
    "title": "商品列表展示当前筛选、核心字段和分页入口",
    "conversionScope": "executable"
  },
  {
    "caseId": "TC-ITEM-STD-003",
    "title": "商品展示列设置后列表仅展示所选列",
    "conversionScope": "executable"
  },
  {
    "caseId": "TC-ITEM-STD-004",
    "title": "切换中英文后商品页面文案随系统语言切换",
    "conversionScope": "executable"
  },
  {
    "caseId": "TC-ITEM-STD-005",
    "title": "标准商品必填项缺失时创建失败",
    "conversionScope": "executable"
  },
  {
    "caseId": "TC-ITEM-STD-006",
    "title": "一级分类下无二级分类，可新增商品成功",
    "conversionScope": "executable"
  },
  {
    "caseId": "TC-ITEM-STD-007",
    "title": "一级分类存在二级分类时必须选择二级分类才能完成商品分类选择",
    "conversionScope": "executable"
  },
  {
    "caseId": "TC-ITEM-STD-008",
    "title": "商品名称最多 100 字符且连续空格不可保存",
    "conversionScope": "executable"
  },
  {
    "caseId": "TC-ITEM-STD-093",
    "title": "商品名称首尾含空格时保存失败",
    "conversionScope": "executable"
  },
  {
    "caseId": "TC-ITEM-STD-009",
    "title": "POS名称和送厨名称超长及特殊字符保存后自动格式化",
    "conversionScope": "executable"
  },
  {
    "caseId": "TC-ITEM-STD-094",
    "title": "POS名称首尾含空格时保存失败",
    "conversionScope": "executable"
  },
  {
    "caseId": "TC-ITEM-STD-010",
    "title": "商品编码重复时创建失败并提示 BITEM-7003",
    "conversionScope": "executable"
  },
  {
    "caseId": "TC-ITEM-STD-011",
    "title": "同一一级分类下新建同名商品创建失败",
    "conversionScope": "executable"
  },
  {
    "caseId": "TC-ITEM-STD-012",
    "title": "同一一级分类不同二级分类的标准商品同名提示 BITEM-7010",
    "conversionScope": "executable"
  },
  {
    "caseId": "TC-ITEM-STD-013",
    "title": "同一二级分类下新建同名商品创建失败",
    "conversionScope": "executable"
  },
  {
    "caseId": "TC-ITEM-STD-014",
    "title": "同一商户下不同一级分类仍不可创建同名商品",
    "conversionScope": "executable"
  },
  {
    "caseId": "TC-ITEM-STD-015",
    "title": "单规格商品标准价为0时创建成功",
    "conversionScope": "executable"
  },
  {
    "caseId": "TC-ITEM-STD-016",
    "title": "多规格商品选择默认规格后创建成功且列表展示所有规格价格",
    "conversionScope": "executable"
  },
  {
    "caseId": "TC-ITEM-STD-017",
    "title": "多规格商品未选择默认规格时列表仍展示所有规格价格",
    "conversionScope": "executable"
  },
  {
    "caseId": "TC-ITEM-STD-018",
    "title": "称重商品创建成功",
    "conversionScope": "executable"
  },
  {
    "caseId": "TC-ITEM-STD-019",
    "title": "称重商品销售单位下拉展示 g、kg、ml",
    "conversionScope": "executable"
  },
  {
    "caseId": "TC-ITEM-STD-020",
    "title": "单规格商品标准价为1.99时创建成功",
    "conversionScope": "executable"
  },
  {
    "caseId": "TC-ITEM-STD-021",
    "title": "标准价输入负数时创建失败",
    "conversionScope": "executable"
  },
  {
    "caseId": "TC-ITEM-STD-022",
    "title": "起售数量输入0时保存失败并提示 SYSTEM-0001",
    "conversionScope": "executable"
  },
  {
    "caseId": "TC-ITEM-STD-023",
    "title": "标准商品非法起售数量保存时归一化为 1",
    "conversionScope": "executable"
  },
  {
    "caseId": "TC-ITEM-STD-024",
    "title": "起售数量大于1时创建成功且C端默认点单数量为起售数量",
    "conversionScope": "executable"
  },
  {
    "caseId": "TC-ITEM-STD-025",
    "title": "【已废弃】从行业商品库选择单规格商品时可继承行业商品信息",
    "conversionScope": "not-applicable"
  },
  {
    "caseId": "TC-ITEM-STD-026",
    "title": "【已废弃】从行业商品库选择多规格商品时可继承多规格及图库信息",
    "conversionScope": "not-applicable"
  },
  {
    "caseId": "TC-ITEM-STD-027",
    "title": "【已废弃】从行业商品库选择多规格商品时仅勾选部分规格可成功继承所选规格",
    "conversionScope": "not-applicable"
  },
  {
    "caseId": "TC-ITEM-STD-028",
    "title": "商品列表支持按名称、类型、分类、状态组合查询",
    "conversionScope": "executable"
  },
  {
    "caseId": "TC-ITEM-STD-029",
    "title": "重置查询后页面恢复初始状态",
    "conversionScope": "executable"
  },
  {
    "caseId": "TC-ITEM-STD-030",
    "title": "切换页面返回标准商品列表时不保留查询条件",
    "conversionScope": "executable"
  },
  {
    "caseId": "TC-ITEM-STD-031",
    "title": "标准商品编辑基础信息后保存成功",
    "conversionScope": "executable"
  },
  {
    "caseId": "TC-ITEM-STD-032",
    "title": "标准商品内编辑口味组加价和默认选中仅对当前商品生效",
    "conversionScope": "executable"
  },
  {
    "caseId": "TC-ITEM-STD-033",
    "title": "标准商品编辑其他信息后保存成功",
    "conversionScope": "executable"
  },
  {
    "caseId": "TC-ITEM-STD-034",
    "title": "【已废弃】继承到商品中的口味组基础信息变更后可同步到已关联商品",
    "conversionScope": "not-applicable"
  },
  {
    "caseId": "TC-ITEM-STD-035",
    "title": "分类下已有商品时不可继续新增子分类",
    "conversionScope": "executable"
  },
  {
    "caseId": "TC-ITEM-STD-036",
    "title": "标准商品仅填写必填项时创建成功",
    "conversionScope": "executable"
  },
  {
    "caseId": "TC-ITEM-STD-037",
    "title": "不选择商品分类时标准商品创建成功",
    "conversionScope": "executable"
  },
  {
    "caseId": "TC-ITEM-STD-038",
    "title": "标准价缺失时创建失败",
    "conversionScope": "executable"
  },
  {
    "caseId": "TC-ITEM-STD-039",
    "title": "起售数量为空时保存失败",
    "conversionScope": "executable"
  },
  {
    "caseId": "TC-ITEM-STD-040",
    "title": "【已废弃 v3.3】起售数量为 0 时保存失败并提示 SYSTEM-0001（与 TC-ITEM-STD-022 重复）",
    "conversionScope": "not-applicable"
  },
  {
    "caseId": "TC-ITEM-STD-041",
    "title": "标准商品创建页高级设置区域默认不展开",
    "conversionScope": "executable"
  },
  {
    "caseId": "TC-ITEM-STD-042",
    "title": "点击展开高级设置后展示 POS 名称等 8 个字段",
    "conversionScope": "executable"
  },
  {
    "caseId": "TC-ITEM-STD-043",
    "title": "商品第二名称与商品名称互相不可重复",
    "conversionScope": "executable"
  },
  {
    "caseId": "TC-ITEM-STD-044",
    "title": "品牌内商品名称重复时创建失败",
    "conversionScope": "executable"
  },
  {
    "caseId": "TC-ITEM-STD-045",
    "title": "商品描述达到 250 字符后不可继续输入",
    "conversionScope": "executable"
  },
  {
    "caseId": "TC-ITEM-STD-046",
    "title": "助记码超过 20 字符时保存失败",
    "conversionScope": "executable"
  },
  {
    "caseId": "TC-ITEM-STD-047",
    "title": "多规格商品选择已有规格组后创建成功",
    "conversionScope": "executable"
  },
  {
    "caseId": "TC-ITEM-STD-048",
    "title": "多规格商品点击去创建可跳转规格组新增页",
    "conversionScope": "executable"
  },
  {
    "caseId": "TC-ITEM-STD-049",
    "title": "选择多规格后是否称重商品置灰不可选",
    "conversionScope": "executable"
  },
  {
    "caseId": "TC-ITEM-STD-050",
    "title": "单规格商品包装费合法输入时保存成功",
    "conversionScope": "executable"
  },
  {
    "caseId": "TC-ITEM-STD-051",
    "title": "超限价格保存成功并按 999999.99 展示",
    "conversionScope": "executable"
  },
  {
    "caseId": "TC-ITEM-STD-052",
    "title": "从图片库选择主图后创建成功",
    "conversionScope": "executable"
  },
  {
    "caseId": "TC-ITEM-STD-053",
    "title": "本地上传主图后创建成功",
    "conversionScope": "executable"
  },
  {
    "caseId": "TC-ITEM-STD-054",
    "title": "详情图超过 10 张时不可继续添加",
    "conversionScope": "executable"
  },
  {
    "caseId": "TC-ITEM-STD-055",
    "title": "标准商品选择多个描述标签后保存成功",
    "conversionScope": "executable"
  },
  {
    "caseId": "TC-ITEM-STD-056",
    "title": "原料过敏原营养成分保存后编辑回显",
    "conversionScope": "executable"
  },
  {
    "caseId": "TC-ITEM-STD-057",
    "title": "标准商品引用口味组整组后保存成功",
    "conversionScope": "executable"
  },
  {
    "caseId": "TC-ITEM-STD-058",
    "title": "标准商品引用做法组与加料组整组后保存成功",
    "conversionScope": "executable"
  },
  {
    "caseId": "TC-ITEM-STD-059",
    "title": "商品内不可单独添加组子项仅可移除已引用子项",
    "conversionScope": "executable"
  },
  {
    "caseId": "TC-ITEM-STD-060",
    "title": "【已废弃 v3.2】商品内不可修改已引用口味组加价与默认选中",
    "conversionScope": "not-applicable"
  },
  {
    "caseId": "TC-ITEM-STD-061",
    "title": "配置互斥规则后冲突项在编辑页置灰不可同时选中",
    "conversionScope": "executable"
  },
  {
    "caseId": "TC-ITEM-STD-063",
    "title": "商品列表分页支持切换 10/20/50/100 条",
    "conversionScope": "executable"
  },
  {
    "caseId": "TC-ITEM-STD-064",
    "title": "商品列表按商品名称第二语言模糊查询成功",
    "conversionScope": "executable"
  },
  {
    "caseId": "TC-ITEM-STD-065",
    "title": "列表启用商品操作成功",
    "conversionScope": "executable"
  },
  {
    "caseId": "TC-ITEM-STD-066",
    "title": "列表停用未被菜单引用的商品操作成功",
    "conversionScope": "executable"
  },
  {
    "caseId": "TC-ITEM-STD-067",
    "title": "菜单引用中的标准商品不可停用",
    "conversionScope": "executable"
  },
  {
    "caseId": "TC-ITEM-STD-068",
    "title": "无引用关系的标准商品删除成功",
    "conversionScope": "executable"
  },
  {
    "caseId": "TC-ITEM-STD-069",
    "title": "被套餐组引用的标准商品不可删除",
    "conversionScope": "executable"
  },
  {
    "caseId": "TC-ITEM-STD-070",
    "title": "被菜单引用的标准商品不可删除",
    "conversionScope": "executable"
  },
  {
    "caseId": "TC-ITEM-STD-071",
    "title": "标准商品列表主图不支持点击查看大图",
    "conversionScope": "executable"
  },
  {
    "caseId": "TC-ITEM-STD-072",
    "title": "商品列表默认展示字段与默认收起字段正确",
    "conversionScope": "executable"
  },
  {
    "caseId": "TC-ITEM-STD-073",
    "title": "商品列表支持还原默认展示列",
    "conversionScope": "executable"
  },
  {
    "caseId": "TC-ITEM-STD-074",
    "title": "商品列表展示总商品数量且不展示总金额",
    "conversionScope": "executable"
  },
  {
    "caseId": "TC-ITEM-STD-075",
    "title": "商品列表删除操作展示确认文案",
    "conversionScope": "executable"
  },
  {
    "caseId": "TC-ITEM-STD-076",
    "title": "商品列表空值字段展示空而非“-”",
    "conversionScope": "executable"
  },
  {
    "caseId": "TC-ITEM-STD-077",
    "title": "商品状态变更后需下发到门店终端才生效",
    "conversionScope": "executable"
  },
  {
    "caseId": "TC-ITEM-STD-078",
    "title": "标准商品主图上传后不提供第二次本地上传入口",
    "conversionScope": "executable"
  },
  {
    "caseId": "TC-ITEM-STD-079",
    "title": "标准商品创建页不支持添加套餐组",
    "conversionScope": "executable"
  },
  {
    "caseId": "TC-ITEM-PKG-001",
    "title": "套餐商品基础字段与标准商品保持一致",
    "conversionScope": "executable"
  },
  {
    "caseId": "TC-ITEM-PKG-002",
    "title": "套餐商品可选择已有固定搭配套餐组",
    "conversionScope": "executable"
  },
  {
    "caseId": "TC-ITEM-PKG-003",
    "title": "套餐商品可按名称搜索固定搭配套餐组",
    "conversionScope": "executable"
  },
  {
    "caseId": "TC-ITEM-PKG-004",
    "title": "套餐商品可选择已有组合搭配套餐组",
    "conversionScope": "executable"
  },
  {
    "caseId": "TC-ITEM-PKG-005",
    "title": "套餐商品其他设置与标准商品一致",
    "conversionScope": "executable"
  },
  {
    "caseId": "TC-ITEM-PKG-006",
    "title": "套餐商品选择并引用已有固定搭配组",
    "conversionScope": "executable"
  },
  {
    "caseId": "TC-ITEM-PKG-007",
    "title": "套餐商品可新增可选搭配套餐组",
    "conversionScope": "executable"
  },
  {
    "caseId": "TC-ITEM-PKG-008",
    "title": "套餐商品创建页展示基础信息与套餐组配置入口",
    "conversionScope": "executable"
  },
  {
    "caseId": "TC-ITEM-PKG-009",
    "title": "套餐商品仅填写必填项时创建成功",
    "conversionScope": "executable"
  },
  {
    "caseId": "TC-ITEM-PKG-010",
    "title": "套餐商品必填项缺失时创建失败",
    "conversionScope": "executable"
  },
  {
    "caseId": "TC-ITEM-PKG-011",
    "title": "套餐商品不选择分类时创建成功",
    "conversionScope": "executable"
  },
  {
    "caseId": "TC-ITEM-PKG-012",
    "title": "一级分类下无二级分类时套餐可直接创建成功",
    "conversionScope": "executable"
  },
  {
    "caseId": "TC-ITEM-PKG-013",
    "title": "存在二级分类时未选二级分类不影响套餐商品提交",
    "conversionScope": "executable"
  },
  {
    "caseId": "TC-ITEM-PKG-014",
    "title": "套餐商品起售数量默认值为 1",
    "conversionScope": "executable"
  },
  {
    "caseId": "TC-ITEM-PKG-015",
    "title": "套餐商品起售数量为 0 时保存失败",
    "conversionScope": "executable"
  },
  {
    "caseId": "TC-ITEM-PKG-016",
    "title": "套餐商品起售数量大于 1 时创建成功",
    "conversionScope": "executable"
  },
  {
    "caseId": "TC-ITEM-PKG-017",
    "title": "套餐商品标准价缺失时创建失败",
    "conversionScope": "executable"
  },
  {
    "caseId": "TC-ITEM-PKG-018",
    "title": "套餐商品标准价为 0 时创建成功",
    "conversionScope": "executable"
  },
  {
    "caseId": "TC-ITEM-PKG-019",
    "title": "套餐商品标准价输入负数时创建失败",
    "conversionScope": "executable"
  },
  {
    "caseId": "TC-ITEM-PKG-020",
    "title": "套餐商品包装费合法输入时保存成功",
    "conversionScope": "executable"
  },
  {
    "caseId": "TC-ITEM-PKG-021",
    "title": "套餐商品名称首尾空格校验及 100 字符上限",
    "conversionScope": "executable"
  },
  {
    "caseId": "TC-ITEM-PKG-076",
    "title": "套餐商品名称首尾含空格时保存失败",
    "conversionScope": "executable"
  },
  {
    "caseId": "TC-ITEM-PKG-022",
    "title": "套餐商品 POS 名称和送厨名称超长及特殊字符保存后自动格式化",
    "conversionScope": "executable"
  },
  {
    "caseId": "TC-ITEM-PKG-023",
    "title": "套餐商品助记码超过 20 字符时保存失败",
    "conversionScope": "executable"
  },
  {
    "caseId": "TC-ITEM-PKG-024",
    "title": "套餐商品同一一级分类下同名创建失败",
    "conversionScope": "executable"
  },
  {
    "caseId": "TC-ITEM-PKG-025",
    "title": "套餐商品同商户同类型同名创建失败",
    "conversionScope": "executable"
  },
  {
    "caseId": "TC-ITEM-PKG-026",
    "title": "套餐商品商品第二名称与商品名称互相不可重复",
    "conversionScope": "executable"
  },
  {
    "caseId": "TC-ITEM-PKG-027",
    "title": "套餐商品描述达到500字符后输入框不可继续录入",
    "conversionScope": "executable"
  },
  {
    "caseId": "TC-ITEM-PKG-028",
    "title": "套餐商品最多保存 10 张有效详情图片",
    "conversionScope": "executable"
  },
  {
    "caseId": "TC-ITEM-PKG-029",
    "title": "套餐商品描述标签多选保存成功",
    "conversionScope": "executable"
  },
  {
    "caseId": "TC-ITEM-PKG-030",
    "title": "套餐商品商品角标单选保存成功",
    "conversionScope": "executable"
  },
  {
    "caseId": "TC-ITEM-PKG-031",
    "title": "套餐商品统计标签多选保存成功",
    "conversionScope": "executable"
  },
  {
    "caseId": "TC-ITEM-PKG-032",
    "title": "套餐商品配置材料信息后保存成功",
    "conversionScope": "executable"
  },
  {
    "caseId": "TC-ITEM-PKG-033",
    "title": "套餐商品从图片库选择主图后创建成功",
    "conversionScope": "executable"
  },
  {
    "caseId": "TC-ITEM-PKG-034",
    "title": "套餐商品列表按名称类型分类状态组合查询成功",
    "conversionScope": "executable"
  },
  {
    "caseId": "TC-ITEM-PKG-035",
    "title": "套餐编辑基础信息并删除主图后允许无图",
    "conversionScope": "executable"
  },
  {
    "caseId": "TC-ITEM-PKG-036",
    "title": "套餐商品编辑其他信息后保存成功",
    "conversionScope": "executable"
  },
  {
    "caseId": "TC-ITEM-PKG-037",
    "title": "套餐商品无引用时删除成功",
    "conversionScope": "executable"
  },
  {
    "caseId": "TC-ITEM-PKG-038",
    "title": "套餐商品被菜单引用时不可删除",
    "conversionScope": "executable"
  },
  {
    "caseId": "TC-ITEM-PKG-039",
    "title": "菜单引用中的套餐商品不可停用",
    "conversionScope": "executable"
  },
  {
    "caseId": "TC-ITEM-PKG-040",
    "title": "未选择套餐组时确认按钮不可点击",
    "conversionScope": "executable"
  },
  {
    "caseId": "TC-ITEM-PKG-041",
    "title": "选择套餐组后确认按钮可点击并返回创建页",
    "conversionScope": "executable"
  },
  {
    "caseId": "TC-ITEM-PKG-042",
    "title": "已选固定搭配套餐组可从右侧移除",
    "conversionScope": "executable"
  },
  {
    "caseId": "TC-ITEM-PKG-043",
    "title": "已选组合搭配套餐组可从右侧移除",
    "conversionScope": "executable"
  },
  {
    "caseId": "TC-ITEM-PKG-044",
    "title": "组合搭配套餐组按名称模糊搜索成功",
    "conversionScope": "executable"
  },
  {
    "caseId": "TC-ITEM-PKG-045",
    "title": "组合搭配套餐组清空搜索条件后恢复默认列表",
    "conversionScope": "executable"
  },
  {
    "caseId": "TC-ITEM-PKG-046",
    "title": "套餐商品未添加套餐分组时保存与保存并新建均失败",
    "conversionScope": "executable"
  },
  {
    "caseId": "TC-ITEM-PKG-047",
    "title": "套餐商品重置查询后页面恢复初始状态",
    "conversionScope": "executable"
  },
  {
    "caseId": "TC-ITEM-PKG-048",
    "title": "切换页面返回套餐商品列表时不保留查询条件",
    "conversionScope": "executable"
  },
  {
    "caseId": "TC-ITEM-PKG-049",
    "title": "套餐商品同时引用已有固定搭配与可选搭配组",
    "conversionScope": "executable"
  },
  {
    "caseId": "TC-ITEM-PKG-050",
    "title": "删除全部套餐分组后因分组必填无法保存",
    "conversionScope": "executable"
  },
  {
    "caseId": "TC-ITEM-PKG-051",
    "title": "套餐商品创建页不展示多规格与称重相关入口",
    "conversionScope": "executable"
  },
  {
    "caseId": "TC-ITEM-PKG-052",
    "title": "套餐商品不支持引用口味做法加料组",
    "conversionScope": "executable"
  },
  {
    "caseId": "TC-ITEM-PKG-053",
    "title": "套餐和加料商品不支持互斥规则",
    "conversionScope": "executable"
  },
  {
    "caseId": "TC-ITEM-PKG-054",
    "title": "商品列表主图不支持点击查看大图",
    "conversionScope": "executable"
  },
  {
    "caseId": "TC-ITEM-PKG-055",
    "title": "套餐商品列表删除操作展示确认文案",
    "conversionScope": "executable"
  },
  {
    "caseId": "TC-ITEM-PKG-056",
    "title": "组合搭配套餐组按名称精确搜索成功",
    "conversionScope": "executable"
  },
  {
    "caseId": "TC-ITEM-PKG-057",
    "title": "套餐商品通过选择入口引用已有可选搭配组",
    "conversionScope": "executable"
  },
  {
    "caseId": "TC-ITEM-PKG-058",
    "title": "套餐商品回显已有可选搭配组规则摘要",
    "conversionScope": "executable"
  },
  {
    "caseId": "TC-ITEM-PKG-059",
    "title": "套餐商品编辑页可选搭配组仅支持组级操作",
    "conversionScope": "executable"
  },
  {
    "caseId": "TC-ITEM-PKG-060",
    "title": "套餐商品状态变更后需下发到门店终端才生效",
    "conversionScope": "executable"
  },
  {
    "caseId": "TC-ITEM-PKG-061",
    "title": "套餐商品列表启用商品操作成功",
    "conversionScope": "executable"
  },
  {
    "caseId": "TC-ITEM-PKG-062",
    "title": "套餐商品列表停用未被菜单引用的商品操作成功",
    "conversionScope": "executable"
  },
  {
    "caseId": "TC-ITEM-PKG-063",
    "title": "套餐商品创建页不提供做法组引用入口",
    "conversionScope": "executable"
  },
  {
    "caseId": "TC-ITEM-PKG-064",
    "title": "套餐商品创建页不提供加料组引用入口",
    "conversionScope": "executable"
  },
  {
    "caseId": "TC-ITEM-PKG-065",
    "title": "套餐商品创建页没有加料组子项编辑能力",
    "conversionScope": "executable"
  },
  {
    "caseId": "TC-ITEM-PKG-066",
    "title": "【已废弃 v3.2】套餐商品内不可修改已引用口味组加价与默认选中",
    "conversionScope": "not-applicable"
  },
  {
    "caseId": "TC-ITEM-PKG-067",
    "title": "套餐商品本地上传主图回显后保存成功",
    "conversionScope": "executable"
  },
  {
    "caseId": "TC-ITEM-PKG-068",
    "title": "套餐商品先删原图再上传第二张主图替换成功",
    "conversionScope": "executable"
  },
  {
    "caseId": "TC-ITEM-ADD-001",
    "title": "加料商品基础字段与标准商品一致且无起售数量",
    "conversionScope": "executable"
  },
  {
    "caseId": "TC-ITEM-ADD-002",
    "title": "加料商品其他设置与标准商品一致",
    "conversionScope": "executable"
  },
  {
    "caseId": "TC-ITEM-ADD-005",
    "title": "加料商品仅填写必填项时创建成功",
    "conversionScope": "executable"
  },
  {
    "caseId": "TC-ITEM-ADD-006",
    "title": "加料商品必填项缺失时创建失败",
    "conversionScope": "executable"
  },
  {
    "caseId": "TC-ITEM-ADD-007",
    "title": "加料商品不选择分类时创建成功",
    "conversionScope": "executable"
  },
  {
    "caseId": "TC-ITEM-ADD-008",
    "title": "加料商品标准价缺失时创建失败",
    "conversionScope": "executable"
  },
  {
    "caseId": "TC-ITEM-ADD-009",
    "title": "加料商品标准价为 0 时创建成功",
    "conversionScope": "executable"
  },
  {
    "caseId": "TC-ITEM-ADD-010",
    "title": "加料商品标准价输入负数时创建失败",
    "conversionScope": "executable"
  },
  {
    "caseId": "TC-ITEM-ADD-011",
    "title": "加料商品包装费合法输入时保存成功",
    "conversionScope": "executable"
  },
  {
    "caseId": "TC-ITEM-ADD-012",
    "title": "加料商品名称超长及特殊字符保存后自动格式化",
    "conversionScope": "executable"
  },
  {
    "caseId": "TC-ITEM-ADD-047",
    "title": "加料商品名称首尾含空格时保存失败",
    "conversionScope": "executable"
  },
  {
    "caseId": "TC-ITEM-ADD-013",
    "title": "加料商品 POS 名称和送厨名称超长及特殊字符保存后自动格式化",
    "conversionScope": "executable"
  },
  {
    "caseId": "TC-ITEM-ADD-014",
    "title": "加料商品同一一级分类下同名创建失败",
    "conversionScope": "executable"
  },
  {
    "caseId": "TC-ITEM-ADD-015",
    "title": "加料商品允许与其他商品类型同名",
    "conversionScope": "executable"
  },
  {
    "caseId": "TC-ITEM-ADD-016",
    "title": "加料商品商品第二名称与商品名称互相不可重复",
    "conversionScope": "executable"
  },
  {
    "caseId": "TC-ITEM-ADD-017",
    "title": "加料商品添加详情图片不超过 10 张",
    "conversionScope": "executable"
  },
  {
    "caseId": "TC-ITEM-ADD-018",
    "title": "加料商品描述标签多选保存成功",
    "conversionScope": "executable"
  },
  {
    "caseId": "TC-ITEM-ADD-019",
    "title": "加料商品商品角标单选保存成功",
    "conversionScope": "executable"
  },
  {
    "caseId": "TC-ITEM-ADD-020",
    "title": "加料商品统计标签多选保存成功",
    "conversionScope": "executable"
  },
  {
    "caseId": "TC-ITEM-ADD-021",
    "title": "加料商品配置材料信息中原料、过敏原和营养成分后保存成功",
    "conversionScope": "executable"
  },
  {
    "caseId": "TC-ITEM-ADD-022",
    "title": "加料商品本地上传主图后创建成功",
    "conversionScope": "executable"
  },
  {
    "caseId": "TC-ITEM-ADD-023",
    "title": "加料商品列表按名称类型分类状态组合查询成功",
    "conversionScope": "executable"
  },
  {
    "caseId": "TC-ITEM-ADD-024",
    "title": "加料商品编辑基础信息后保存成功",
    "conversionScope": "executable"
  },
  {
    "caseId": "TC-ITEM-ADD-025",
    "title": "加料商品编辑其他信息后保存成功",
    "conversionScope": "executable"
  },
  {
    "caseId": "TC-ITEM-ADD-026",
    "title": "加料商品无引用时删除成功",
    "conversionScope": "executable"
  },
  {
    "caseId": "TC-ITEM-ADD-027",
    "title": "加料商品被加料组引用且组被商品引用时不可删除",
    "conversionScope": "executable"
  },
  {
    "caseId": "TC-ITEM-ADD-028",
    "title": "加料商品被菜单引用时不可删除",
    "conversionScope": "executable"
  },
  {
    "caseId": "TC-ITEM-ADD-029",
    "title": "加料商品创建页不展示多规格入口",
    "conversionScope": "executable"
  },
  {
    "caseId": "TC-ITEM-ADD-030",
    "title": "加料商品创建页不展示是否称重商品选项",
    "conversionScope": "executable"
  },
  {
    "caseId": "TC-ITEM-ADD-031",
    "title": "加料商品创建页不展示套餐组入口",
    "conversionScope": "executable"
  },
  {
    "caseId": "TC-ITEM-ADD-032",
    "title": "加料商品创建页不展示商品属性编辑区",
    "conversionScope": "executable"
  },
  {
    "caseId": "TC-ITEM-ADD-033",
    "title": "加料组新增时可搜索并选择该加料商品",
    "conversionScope": "executable"
  },
  {
    "caseId": "TC-ITEM-ADD-034",
    "title": "标准商品引用含该加料的加料组后加料商品不可删除",
    "conversionScope": "executable"
  },
  {
    "caseId": "TC-ITEM-ADD-035",
    "title": "加料商品列表主图不支持点击查看大图",
    "conversionScope": "executable"
  },
  {
    "caseId": "TC-ITEM-ADD-036",
    "title": "加料商品列表删除操作展示确认文案",
    "conversionScope": "executable"
  },
  {
    "caseId": "TC-ITEM-ADD-037",
    "title": "加料商品状态变更后需下发到门店终端才生效",
    "conversionScope": "executable"
  },
  {
    "caseId": "TC-ITEM-ADD-038",
    "title": "加料商品继续上传第 2 张主图时覆盖第 1 张主图",
    "conversionScope": "executable"
  },
  {
    "caseId": "TC-ITEM-ADD-039",
    "title": "加料商品从图片库选择主图后创建成功",
    "conversionScope": "executable"
  },
  {
    "caseId": "TC-ITEM-ADD-040",
    "title": "加料商品重置查询后页面恢复初始状态",
    "conversionScope": "executable"
  },
  {
    "caseId": "TC-ITEM-ADD-041",
    "title": "切换页面返回加料商品列表时不保留查询条件",
    "conversionScope": "executable"
  },
  {
    "caseId": "TC-ITEM-ADD-042",
    "title": "加料商品列表启用商品操作成功",
    "conversionScope": "executable"
  },
  {
    "caseId": "TC-ITEM-ADD-043",
    "title": "加料商品列表停用商品操作成功",
    "conversionScope": "executable"
  },
  {
    "caseId": "TC-ITEM-ADD-044",
    "title": "菜单已引用的加料商品二次确认后停用成功",
    "conversionScope": "executable"
  },
  {
    "caseId": "TC-ITEM-STD-080",
    "title": "称重商品购买重量小于皮重时终端价格为 0",
    "conversionScope": "executable"
  },
  {
    "caseId": "TC-ITEM-STD-081",
    "title": "详情图重复引用同一张图片保存失败并提示 BITEM-3006",
    "conversionScope": "executable"
  },
  {
    "caseId": "TC-ITEM-STD-082",
    "title": "标准商品绑定多个打印档口保存成功",
    "conversionScope": "executable"
  },
  {
    "caseId": "TC-ITEM-PKG-069",
    "title": "套餐商品内不提供口味组加价和默认选中编辑",
    "conversionScope": "executable"
  },
  {
    "caseId": "TC-ITEM-STD-083",
    "title": "多规格商品默认规格下发后终端点餐默认选中该规格",
    "conversionScope": "executable"
  },
  {
    "caseId": "TC-ITEM-PKG-070",
    "title": "套餐必选子项停用后终端不可正常点单",
    "conversionScope": "executable"
  },
  {
    "caseId": "TC-ITEM-STD-084",
    "title": "称重商品销售单位切换 g、kg、ml 后保存成功",
    "conversionScope": "executable"
  },
  {
    "caseId": "TC-ITEM-STD-085",
    "title": "多规格商品拖动调整规格顺序后保存成功",
    "conversionScope": "executable"
  },
  {
    "caseId": "TC-ITEM-STD-086",
    "title": "移除已引用口味组子项后详情不再展示该子项",
    "conversionScope": "executable"
  },
  {
    "caseId": "TC-ITEM-STD-087",
    "title": "标准商品内编辑做法组加价和默认选中仅对当前商品生效",
    "conversionScope": "executable"
  },
  {
    "caseId": "TC-ITEM-STD-088",
    "title": "标准商品内编辑加料组单次加价和默认选中仅对当前商品生效",
    "conversionScope": "executable"
  },
  {
    "caseId": "TC-ITEM-STD-089",
    "title": "标准商品内同一选项组仅允许一个默认选中子项",
    "conversionScope": "executable"
  },
  {
    "caseId": "TC-ITEM-PKG-071",
    "title": "套餐商品内不提供做法组加价和默认选中编辑",
    "conversionScope": "executable"
  },
  {
    "caseId": "TC-ITEM-PKG-072",
    "title": "套餐商品内不提供加料组加价和默认选中编辑",
    "conversionScope": "executable"
  },
  {
    "caseId": "TC-ITEM-PKG-073",
    "title": "套餐商品内没有选项组默认选中子项配置入口",
    "conversionScope": "executable"
  },
  {
    "caseId": "TC-ITEM-STD-090",
    "title": "标准商品引用描述标签达 5 个后第 6 个不可选（本用例验证拦截场景）",
    "conversionScope": "executable"
  },
  {
    "caseId": "TC-ITEM-STD-091",
    "title": "标准商品商品角标切换选择后仅保留最新一个角标",
    "conversionScope": "executable"
  },
  {
    "caseId": "TC-ITEM-STD-092",
    "title": "点击商品名称进入编辑标准商品页加载成功",
    "conversionScope": "executable"
  },
  {
    "caseId": "TC-ITEM-STD-096",
    "title": "编辑标准商品本地上传主图成功",
    "conversionScope": "executable"
  },
  {
    "caseId": "TC-ITEM-STD-095",
    "title": "商品标准价输入超过两位小数保存时四舍五入为两位",
    "conversionScope": "executable"
  },
  {
    "caseId": "TC-ITEM-PKG-074",
    "title": "套餐商品引用描述标签达 5 个后第 6 个不可选（本用例验证拦截场景）",
    "conversionScope": "executable"
  },
  {
    "caseId": "TC-ITEM-ADD-045",
    "title": "加料商品角标切换选择后仅保留最新一个角标",
    "conversionScope": "executable"
  },
  {
    "caseId": "TC-ITEM-PKG-075",
    "title": "套餐商品角标切换选择后仅保留最新一个角标",
    "conversionScope": "executable"
  },
  {
    "caseId": "TC-ITEM-ADD-046",
    "title": "加料商品不能同时保留超过 5 个描述标签",
    "conversionScope": "executable"
  }
] as const;
const allCases = [
  {
    "caseId": "TC-ITEM-STD-001",
    "title": "标准商品创建页展示商品类型入口与核心配置模块",
    "irConverted": true,
    "reviewDecision": "approved",
    "automationClassification": "blocked",
    "recipeId": "product-center:item-p0-wave-c:TC-ITEM-STD-001",
    "recipeInventory": {
      "any": 1,
      "enabled": 1,
      "semanticComplete": 0,
      "files": [
        "contracts/product-center/recipes/product-center-item-p0-wave-c-recipes.json"
      ]
    },
    "blockingReasons": [
      "ASSERTION_CONTRACT_REQUIRED",
      "RUNTIME_EVIDENCE_REQUIRED"
    ],
    "family": "standard",
    "action": "create-page",
    "runtimeReadiness": "ready",
    "runtimeStatus": "runtime-passed",
    "handlerId": "product-center:item-p0-wave-c:TC-ITEM-STD-001",
    "bindingFingerprint": "fa126b1f6dd0304ce090f706dda4f8d87816fb6144bd36910696ab443c0a606b",
    "implementationFingerprint": "5967bb7f95556a9775c7c163d540dd7f7576f60cb511116657eec1e34eb14f12",
    "assertionIds": [
      "TC-ITEM-STD-001:expectation-1",
      "TC-ITEM-STD-001:expectation-2",
      "TC-ITEM-STD-001:expectation-3"
    ],
    "semanticCaseFingerprint": "8b2a3e43bcbac125a7f2f93997460123d77b7a7233bd34bf1975a80de9b4ae18"
  },
  {
    "caseId": "TC-ITEM-STD-002",
    "title": "商品列表展示当前筛选、核心字段和分页入口",
    "irConverted": true,
    "reviewDecision": "approved",
    "automationClassification": "blocked",
    "recipeId": null,
    "recipeInventory": {
      "any": 0,
      "enabled": 0,
      "semanticComplete": 0,
      "files": []
    },
    "blockingReasons": [
      "RECIPE_REQUIRED"
    ],
    "family": "standard",
    "action": "list-page",
    "runtimeReadiness": "ready",
    "runtimeStatus": "runtime-passed",
    "handlerId": "item-216:TC-ITEM-STD-002",
    "bindingFingerprint": "fa126b1f6dd0304ce090f706dda4f8d87816fb6144bd36910696ab443c0a606b",
    "implementationFingerprint": "5967bb7f95556a9775c7c163d540dd7f7576f60cb511116657eec1e34eb14f12",
    "assertionIds": [
      "TC-ITEM-STD-002:expectation-1",
      "TC-ITEM-STD-002:expectation-2",
      "TC-ITEM-STD-002:expectation-3",
      "TC-ITEM-STD-002:expectation-4"
    ],
    "semanticCaseFingerprint": "af177a42e15f0c5dddc8ba441e1ce9e59077a782427453d09f89cbed5c7be2f5"
  },
  {
    "caseId": "TC-ITEM-STD-003",
    "title": "商品展示列设置后列表仅展示所选列",
    "irConverted": true,
    "reviewDecision": "approved",
    "automationClassification": "blocked",
    "recipeId": "product-center:green-draft:at19:tc-item-std-003",
    "recipeInventory": {
      "any": 1,
      "enabled": 1,
      "semanticComplete": 0,
      "files": [
        "contracts/product-center/recipes/green-drafts/product-center-item-green-binding-draft-recipes.json"
      ]
    },
    "blockingReasons": [
      "ASSERTION_CONTRACT_REQUIRED",
      "RUNTIME_EVIDENCE_REQUIRED"
    ],
    "family": "standard",
    "action": "list-evidence",
    "runtimeReadiness": "ready",
    "runtimeStatus": "runtime-passed",
    "handlerId": "product-center:green-draft:at19:tc-item-std-003",
    "bindingFingerprint": "fa126b1f6dd0304ce090f706dda4f8d87816fb6144bd36910696ab443c0a606b",
    "implementationFingerprint": "5967bb7f95556a9775c7c163d540dd7f7576f60cb511116657eec1e34eb14f12",
    "assertionIds": [
      "TC-ITEM-STD-003:expectation-1",
      "TC-ITEM-STD-003:expectation-2",
      "TC-ITEM-STD-003:expectation-3"
    ],
    "semanticCaseFingerprint": "ecde543d7a8b695e8a3f305389e19d26b9c2f0b8864a1926dbd47677ecd74fdc"
  },
  {
    "caseId": "TC-ITEM-STD-004",
    "title": "切换中英文后商品页面文案随系统语言切换",
    "irConverted": true,
    "reviewDecision": "approved",
    "automationClassification": "blocked",
    "recipeId": "product-center:green-draft:at19:tc-item-std-004",
    "recipeInventory": {
      "any": 1,
      "enabled": 1,
      "semanticComplete": 0,
      "files": [
        "contracts/product-center/recipes/green-drafts/product-center-item-green-binding-draft-recipes.json"
      ]
    },
    "blockingReasons": [
      "ASSERTION_CONTRACT_REQUIRED",
      "RUNTIME_EVIDENCE_REQUIRED"
    ],
    "family": "standard",
    "action": "list-evidence",
    "runtimeReadiness": "ready",
    "runtimeStatus": "runtime-passed",
    "handlerId": "product-center:green-draft:at19:tc-item-std-004",
    "bindingFingerprint": "fa126b1f6dd0304ce090f706dda4f8d87816fb6144bd36910696ab443c0a606b",
    "implementationFingerprint": "5967bb7f95556a9775c7c163d540dd7f7576f60cb511116657eec1e34eb14f12",
    "assertionIds": [
      "TC-ITEM-STD-004:expectation-1",
      "TC-ITEM-STD-004:expectation-2"
    ],
    "semanticCaseFingerprint": "f393927749096c33a44f7a368fd73c332f1190d500bc3710717494c7907a5874"
  },
  {
    "caseId": "TC-ITEM-STD-005",
    "title": "标准商品必填项缺失时创建失败",
    "irConverted": true,
    "reviewDecision": "approved",
    "automationClassification": "blocked",
    "recipeId": "product-center:item-required-name:negative",
    "recipeInventory": {
      "any": 1,
      "enabled": 1,
      "semanticComplete": 0,
      "files": [
        "contracts/product-center/recipes/product-center-item-intake-pilot-recipes.json"
      ]
    },
    "blockingReasons": [
      "RUNTIME_EVIDENCE_REQUIRED"
    ],
    "family": "standard",
    "action": "required",
    "runtimeReadiness": "ready",
    "runtimeStatus": "runtime-passed",
    "handlerId": "product-center:item-required-name:negative",
    "bindingFingerprint": "fa126b1f6dd0304ce090f706dda4f8d87816fb6144bd36910696ab443c0a606b",
    "implementationFingerprint": "5967bb7f95556a9775c7c163d540dd7f7576f60cb511116657eec1e34eb14f12",
    "assertionIds": [
      "TC-ITEM-STD-005:expectation-1",
      "TC-ITEM-STD-005:expectation-2",
      "TC-ITEM-STD-005:expectation-3"
    ],
    "semanticCaseFingerprint": "270a8a1439505b1f91b4b27e0e118eab40791403d656ebe48f5c2846a9b5a014"
  },
  {
    "caseId": "TC-ITEM-STD-006",
    "title": "一级分类下无二级分类，可新增商品成功",
    "irConverted": true,
    "reviewDecision": "approved",
    "automationClassification": "blocked",
    "recipeId": "product-center:green-draft:at05:tc-item-std-006",
    "recipeInventory": {
      "any": 1,
      "enabled": 1,
      "semanticComplete": 0,
      "files": [
        "contracts/product-center/recipes/green-drafts/product-center-item-green-binding-draft-recipes.json"
      ]
    },
    "blockingReasons": [
      "ASSERTION_CONTRACT_REQUIRED",
      "RUNTIME_EVIDENCE_REQUIRED"
    ],
    "family": "standard",
    "action": "leaf-category-create",
    "runtimeReadiness": "ready",
    "runtimeStatus": "runtime-passed",
    "handlerId": "product-center:green-draft:at05:tc-item-std-006",
    "bindingFingerprint": "fa126b1f6dd0304ce090f706dda4f8d87816fb6144bd36910696ab443c0a606b",
    "implementationFingerprint": "5967bb7f95556a9775c7c163d540dd7f7576f60cb511116657eec1e34eb14f12",
    "assertionIds": [
      "TC-ITEM-STD-006:expectation-1",
      "TC-ITEM-STD-006:expectation-2",
      "TC-ITEM-STD-006:expectation-3",
      "TC-ITEM-STD-006:expectation-4",
      "TC-ITEM-STD-006:expectation-5"
    ],
    "businessRule": {
      "businessRuleId": "BR-ITEM-CATEGORY-DIRECT-PARENT-CREATE",
      "businessRuleFingerprint": "b86bad2004e144ffc19611dbff68b860c55ca4312c9b04a83408207a1e819759",
      "businessRuleAssertionIdsRequired": [
        "category-parent:create-feedback",
        "category-parent:create-response",
        "category-parent:detail-category",
        "category-parent:first-row",
        "category-parent:list-fields",
        "category-parent:selected",
        "category-parent:status-persistence"
      ],
      "businessRuleAssertionIdsObserved": [
        "category-parent:create-feedback",
        "category-parent:create-response",
        "category-parent:detail-category",
        "category-parent:first-row",
        "category-parent:list-fields",
        "category-parent:selected",
        "category-parent:status-persistence"
      ],
      "businessRuleUiEvidenceIds": [
        "TC-ITEM-STD-006-runtime-evidence"
      ],
      "businessRuleApiEvidenceIds": [
        "TC-ITEM-STD-006-runtime-evidence"
      ],
      "businessRuleDownstreamEvidenceIds": [],
      "businessRuleCleanup": {
        "required": true,
        "apiZeroResidue": false,
        "uiZeroResidue": false
      },
      "observedStatement": "一级分类下无二级分类时，可以直接选择该一级分类并成功创建商品；编辑时一级分类正确回显，可修改或清空，保存后分类持久化且商品状态保持原状态"
    },
    "semanticCaseFingerprint": "023406575cc6baec090e1166f05a72b8ecfee9212b8e85ef49b180008ece2611"
  },
  {
    "caseId": "TC-ITEM-STD-007",
    "title": "一级分类存在二级分类时必须选择二级分类才能完成商品分类选择",
    "irConverted": true,
    "reviewDecision": "approved",
    "automationClassification": "strict-generatable",
    "recipeId": "product-center:item-category-leaf:TC-ITEM-STD-007",
    "recipeInventory": {
      "any": 2,
      "enabled": 2,
      "semanticComplete": 0,
      "files": [
        "contracts/product-center/recipes/product-center-item-category-leaf-probe-recipes.json",
        "contracts/product-center/recipes/product-center-item-p0-wave-d-recipes.json"
      ]
    },
    "blockingReasons": [],
    "family": "standard",
    "action": "category-leaf",
    "runtimeReadiness": "ready",
    "runtimeStatus": "runtime-passed",
    "handlerId": "product-center:item-category-leaf:TC-ITEM-STD-007",
    "bindingFingerprint": "fa126b1f6dd0304ce090f706dda4f8d87816fb6144bd36910696ab443c0a606b",
    "implementationFingerprint": "5967bb7f95556a9775c7c163d540dd7f7576f60cb511116657eec1e34eb14f12",
    "assertionIds": [
      "TC-ITEM-STD-007:expectation-1",
      "TC-ITEM-STD-007:expectation-2",
      "TC-ITEM-STD-007:expectation-3",
      "TC-ITEM-STD-007:expectation-4",
      "TC-ITEM-STD-007:expectation-5",
      "TC-ITEM-STD-007:expectation-6"
    ],
    "businessRule": {
      "businessRuleId": "BR-ITEM-CATEGORY-LEAF-SELECTION",
      "businessRuleFingerprint": "a40486b4403f8290ad5cc6e2b51c4655dc58e953416c8e22b984adefd2438d79",
      "businessRuleAssertionIdsRequired": [
        "category-leaf:edit-persistence",
        "category-leaf:leaf-committed",
        "category-leaf:list-filter",
        "category-leaf:parent-not-committed",
        "category-leaf:parent-rejected"
      ],
      "businessRuleAssertionIdsObserved": [
        "category-leaf:edit-persistence",
        "category-leaf:leaf-committed",
        "category-leaf:list-filter",
        "category-leaf:parent-not-committed",
        "category-leaf:parent-rejected"
      ],
      "businessRuleUiEvidenceIds": [
        "TC-ITEM-STD-007-runtime-evidence"
      ],
      "businessRuleApiEvidenceIds": [],
      "businessRuleDownstreamEvidenceIds": [],
      "businessRuleCleanup": {
        "required": false,
        "apiZeroResidue": false,
        "uiZeroResidue": false
      },
      "observedStatement": "商品分类非必填；创建或编辑时若选择的一级分类存在二级分类，必须选择到叶子分类；编辑可以重新选择一级/二级分类，但不能把有子分类的一级分类保存为最终分类（即不能从叶子分类改回其父级一级分类）；保存后列表可按分类过滤，重新进入编辑详情应回显最终分类"
    },
    "semanticCaseFingerprint": "780c44e60750526a88cd2a12851623a3b6d50aaa369dba1d33e02b9cc804b695"
  },
  {
    "caseId": "TC-ITEM-STD-008",
    "title": "商品名称最多 100 字符且连续空格不可保存",
    "irConverted": true,
    "reviewDecision": "approved",
    "automationClassification": "blocked",
    "recipeId": null,
    "recipeInventory": {
      "any": 0,
      "enabled": 0,
      "semanticComplete": 0,
      "files": []
    },
    "blockingReasons": [
      "RECIPE_REQUIRED"
    ],
    "family": "standard",
    "action": "contract-resolution",
    "runtimeReadiness": "ready",
    "runtimeStatus": "runtime-passed",
    "handlerId": "item-216:TC-ITEM-STD-008",
    "bindingFingerprint": "fa126b1f6dd0304ce090f706dda4f8d87816fb6144bd36910696ab443c0a606b",
    "implementationFingerprint": "5967bb7f95556a9775c7c163d540dd7f7576f60cb511116657eec1e34eb14f12",
    "assertionIds": [
      "TC-ITEM-STD-008:expectation-1",
      "TC-ITEM-STD-008:expectation-2",
      "TC-ITEM-STD-008:expectation-3"
    ],
    "semanticCaseFingerprint": "742e5592be577a73ee0260f97a8a89f03e685e1b95b1e07fb14bf70944e70fda"
  },
  {
    "caseId": "TC-ITEM-STD-093",
    "title": "商品名称首尾含空格时保存失败",
    "irConverted": true,
    "reviewDecision": "approved",
    "automationClassification": "blocked",
    "recipeId": null,
    "recipeInventory": {
      "any": 0,
      "enabled": 0,
      "semanticComplete": 0,
      "files": []
    },
    "blockingReasons": [
      "RECIPE_REQUIRED"
    ],
    "family": "standard",
    "action": "name-whitespace",
    "runtimeReadiness": "ready",
    "runtimeStatus": "runtime-passed",
    "handlerId": "item-216:TC-ITEM-STD-093",
    "bindingFingerprint": "fa126b1f6dd0304ce090f706dda4f8d87816fb6144bd36910696ab443c0a606b",
    "implementationFingerprint": "5967bb7f95556a9775c7c163d540dd7f7576f60cb511116657eec1e34eb14f12",
    "assertionIds": [
      "TC-ITEM-STD-093:expectation-1",
      "TC-ITEM-STD-093:expectation-2",
      "TC-ITEM-STD-093:expectation-3"
    ],
    "businessRule": {
      "businessRuleId": "BR-FMT-001",
      "businessRuleFingerprint": "3b20ee48b6365d4bb0ca2d084c6d1e4d7325cfccba705e5ec456c80fbb6aaa7f",
      "businessRuleAssertionIdsRequired": [
        "br-fmt-001:canonical-outcome-1",
        "br-fmt-001:canonical-outcome-10",
        "br-fmt-001:canonical-outcome-11",
        "br-fmt-001:canonical-outcome-12",
        "br-fmt-001:canonical-outcome-13",
        "br-fmt-001:canonical-outcome-14",
        "br-fmt-001:canonical-outcome-15",
        "br-fmt-001:canonical-outcome-16",
        "br-fmt-001:canonical-outcome-17",
        "br-fmt-001:canonical-outcome-18",
        "br-fmt-001:canonical-outcome-19",
        "br-fmt-001:canonical-outcome-2",
        "br-fmt-001:canonical-outcome-20",
        "br-fmt-001:canonical-outcome-21",
        "br-fmt-001:canonical-outcome-3",
        "br-fmt-001:canonical-outcome-4",
        "br-fmt-001:canonical-outcome-5",
        "br-fmt-001:canonical-outcome-6",
        "br-fmt-001:canonical-outcome-7",
        "br-fmt-001:canonical-outcome-8",
        "br-fmt-001:canonical-outcome-9"
      ],
      "businessRuleAssertionIdsObserved": [
        "br-fmt-001:canonical-outcome-1",
        "br-fmt-001:canonical-outcome-10",
        "br-fmt-001:canonical-outcome-11",
        "br-fmt-001:canonical-outcome-12",
        "br-fmt-001:canonical-outcome-13",
        "br-fmt-001:canonical-outcome-14",
        "br-fmt-001:canonical-outcome-15",
        "br-fmt-001:canonical-outcome-16",
        "br-fmt-001:canonical-outcome-17",
        "br-fmt-001:canonical-outcome-18",
        "br-fmt-001:canonical-outcome-19",
        "br-fmt-001:canonical-outcome-2",
        "br-fmt-001:canonical-outcome-20",
        "br-fmt-001:canonical-outcome-21",
        "br-fmt-001:canonical-outcome-3",
        "br-fmt-001:canonical-outcome-4",
        "br-fmt-001:canonical-outcome-5",
        "br-fmt-001:canonical-outcome-6",
        "br-fmt-001:canonical-outcome-7",
        "br-fmt-001:canonical-outcome-8",
        "br-fmt-001:canonical-outcome-9"
      ],
      "businessRuleUiEvidenceIds": [
        "TC-ITEM-STD-093-runtime-evidence"
      ],
      "businessRuleApiEvidenceIds": [],
      "businessRuleDownstreamEvidenceIds": [],
      "businessRuleCleanup": {
        "required": false,
        "apiZeroResidue": false,
        "uiZeroResidue": false
      },
      "observedStatement": "标签名称最长 20 字符；当前确认按 100 字符校验的名称字段为商品名、组名和菜单名；上述字段首尾含空格时保存失败，字符间允许单空格，禁止 emoji；超限失焦飘红“内容超出限制，请重新输入”"
    },
    "semanticCaseFingerprint": "719f23b4c0f3618b98ed24fa57c7e62b7faedc25a267ccb32f136fffb30429cb"
  },
  {
    "caseId": "TC-ITEM-STD-009",
    "title": "POS名称和送厨名称超长及特殊字符保存后自动格式化",
    "irConverted": true,
    "reviewDecision": "approved",
    "automationClassification": "blocked",
    "recipeId": "product-center:green-draft:at08:tc-item-std-009",
    "recipeInventory": {
      "any": 1,
      "enabled": 1,
      "semanticComplete": 0,
      "files": [
        "contracts/product-center/recipes/green-drafts/product-center-item-green-binding-draft-recipes.json"
      ]
    },
    "blockingReasons": [
      "ASSERTION_CONTRACT_REQUIRED",
      "RUNTIME_EVIDENCE_REQUIRED"
    ],
    "family": "standard",
    "action": "contract-resolution",
    "runtimeReadiness": "ready",
    "runtimeStatus": "runtime-passed",
    "handlerId": "product-center:green-draft:at08:tc-item-std-009",
    "bindingFingerprint": "fa126b1f6dd0304ce090f706dda4f8d87816fb6144bd36910696ab443c0a606b",
    "implementationFingerprint": "5967bb7f95556a9775c7c163d540dd7f7576f60cb511116657eec1e34eb14f12",
    "assertionIds": [
      "TC-ITEM-STD-009:expectation-1",
      "TC-ITEM-STD-009:expectation-2",
      "TC-ITEM-STD-009:expectation-3"
    ],
    "semanticCaseFingerprint": "f0cad029ce5c21e5bb247c92ba2ab31969445d8ea7b609b5603b2ca8974c0659"
  },
  {
    "caseId": "TC-ITEM-STD-094",
    "title": "POS名称首尾含空格时保存失败",
    "irConverted": true,
    "reviewDecision": "approved",
    "automationClassification": "blocked",
    "recipeId": "product-center:green-draft:at06:tc-item-std-094",
    "recipeInventory": {
      "any": 1,
      "enabled": 1,
      "semanticComplete": 0,
      "files": [
        "contracts/product-center/recipes/green-drafts/product-center-item-green-binding-draft-recipes.json"
      ]
    },
    "blockingReasons": [
      "ASSERTION_CONTRACT_REQUIRED",
      "RUNTIME_EVIDENCE_REQUIRED"
    ],
    "family": "standard",
    "action": "pos-whitespace",
    "runtimeReadiness": "ready",
    "runtimeStatus": "runtime-passed",
    "handlerId": "product-center:green-draft:at06:tc-item-std-094",
    "bindingFingerprint": "fa126b1f6dd0304ce090f706dda4f8d87816fb6144bd36910696ab443c0a606b",
    "implementationFingerprint": "5967bb7f95556a9775c7c163d540dd7f7576f60cb511116657eec1e34eb14f12",
    "assertionIds": [
      "TC-ITEM-STD-094:expectation-1",
      "TC-ITEM-STD-094:expectation-2",
      "TC-ITEM-STD-094:expectation-3"
    ],
    "businessRule": {
      "businessRuleId": "BR-FMT-001",
      "businessRuleFingerprint": "3b20ee48b6365d4bb0ca2d084c6d1e4d7325cfccba705e5ec456c80fbb6aaa7f",
      "businessRuleAssertionIdsRequired": [
        "br-fmt-001:canonical-outcome-1",
        "br-fmt-001:canonical-outcome-10",
        "br-fmt-001:canonical-outcome-11",
        "br-fmt-001:canonical-outcome-12",
        "br-fmt-001:canonical-outcome-13",
        "br-fmt-001:canonical-outcome-14",
        "br-fmt-001:canonical-outcome-15",
        "br-fmt-001:canonical-outcome-16",
        "br-fmt-001:canonical-outcome-17",
        "br-fmt-001:canonical-outcome-18",
        "br-fmt-001:canonical-outcome-19",
        "br-fmt-001:canonical-outcome-2",
        "br-fmt-001:canonical-outcome-20",
        "br-fmt-001:canonical-outcome-21",
        "br-fmt-001:canonical-outcome-3",
        "br-fmt-001:canonical-outcome-4",
        "br-fmt-001:canonical-outcome-5",
        "br-fmt-001:canonical-outcome-6",
        "br-fmt-001:canonical-outcome-7",
        "br-fmt-001:canonical-outcome-8",
        "br-fmt-001:canonical-outcome-9"
      ],
      "businessRuleAssertionIdsObserved": [
        "br-fmt-001:canonical-outcome-1",
        "br-fmt-001:canonical-outcome-10",
        "br-fmt-001:canonical-outcome-11",
        "br-fmt-001:canonical-outcome-12",
        "br-fmt-001:canonical-outcome-13",
        "br-fmt-001:canonical-outcome-14",
        "br-fmt-001:canonical-outcome-15",
        "br-fmt-001:canonical-outcome-16",
        "br-fmt-001:canonical-outcome-17",
        "br-fmt-001:canonical-outcome-18",
        "br-fmt-001:canonical-outcome-19",
        "br-fmt-001:canonical-outcome-2",
        "br-fmt-001:canonical-outcome-20",
        "br-fmt-001:canonical-outcome-21",
        "br-fmt-001:canonical-outcome-3",
        "br-fmt-001:canonical-outcome-4",
        "br-fmt-001:canonical-outcome-5",
        "br-fmt-001:canonical-outcome-6",
        "br-fmt-001:canonical-outcome-7",
        "br-fmt-001:canonical-outcome-8",
        "br-fmt-001:canonical-outcome-9"
      ],
      "businessRuleUiEvidenceIds": [
        "TC-ITEM-STD-094-runtime-evidence"
      ],
      "businessRuleApiEvidenceIds": [],
      "businessRuleDownstreamEvidenceIds": [],
      "businessRuleCleanup": {
        "required": false,
        "apiZeroResidue": false,
        "uiZeroResidue": false
      },
      "observedStatement": "标签名称最长 20 字符；当前确认按 100 字符校验的名称字段为商品名、组名和菜单名；上述字段首尾含空格时保存失败，字符间允许单空格，禁止 emoji；超限失焦飘红“内容超出限制，请重新输入”"
    },
    "semanticCaseFingerprint": "475455ef6848cc991ef8b0e519a3c82e29c32944c4bc0889b99d36f19fc92280"
  },
  {
    "caseId": "TC-ITEM-STD-010",
    "title": "商品编码重复时创建失败并提示 BITEM-7003",
    "irConverted": true,
    "reviewDecision": "approved",
    "automationClassification": "blocked",
    "recipeId": null,
    "recipeInventory": {
      "any": 0,
      "enabled": 0,
      "semanticComplete": 0,
      "files": []
    },
    "blockingReasons": [
      "RECIPE_REQUIRED"
    ],
    "family": "standard",
    "action": "contract-resolution",
    "runtimeReadiness": "ready",
    "runtimeStatus": "runtime-passed",
    "handlerId": "item-216:TC-ITEM-STD-010",
    "bindingFingerprint": "fa126b1f6dd0304ce090f706dda4f8d87816fb6144bd36910696ab443c0a606b",
    "implementationFingerprint": "5967bb7f95556a9775c7c163d540dd7f7576f60cb511116657eec1e34eb14f12",
    "assertionIds": [
      "TC-ITEM-STD-010:expectation-1",
      "TC-ITEM-STD-010:expectation-2"
    ],
    "semanticCaseFingerprint": "5b033917e1d6263ca34e685bd227c221ab87c6c8d2d3bca2fece002eff364dac"
  },
  {
    "caseId": "TC-ITEM-STD-011",
    "title": "同一一级分类下新建同名商品创建失败",
    "irConverted": true,
    "reviewDecision": "approved",
    "automationClassification": "blocked",
    "recipeId": "product-center:item-p0-wave-d:TC-ITEM-STD-011",
    "recipeInventory": {
      "any": 1,
      "enabled": 1,
      "semanticComplete": 0,
      "files": [
        "contracts/product-center/recipes/product-center-item-p0-wave-d-recipes.json"
      ]
    },
    "blockingReasons": [
      "ASSERTION_CONTRACT_REQUIRED"
    ],
    "family": "standard",
    "action": "contract-resolution",
    "runtimeReadiness": "ready",
    "runtimeStatus": "runtime-passed",
    "handlerId": "product-center:item-p0-wave-d:TC-ITEM-STD-011",
    "bindingFingerprint": "fa126b1f6dd0304ce090f706dda4f8d87816fb6144bd36910696ab443c0a606b",
    "implementationFingerprint": "5967bb7f95556a9775c7c163d540dd7f7576f60cb511116657eec1e34eb14f12",
    "assertionIds": [
      "TC-ITEM-STD-011:expectation-1",
      "TC-ITEM-STD-011:expectation-2"
    ],
    "businessRule": {
      "businessRuleId": "BR-ITEM-010",
      "businessRuleFingerprint": "4398349399b4362b465c6b296e9728fe8b915410ead525fe230de611aa3e0462",
      "businessRuleAssertionIdsRequired": [
        "item-name-duplicate:api-error",
        "item-name-duplicate:category-independence",
        "item-name-duplicate:cross-type-rename",
        "item-name-duplicate:list-persistence",
        "item-name-duplicate:record-count",
        "item-name-duplicate:save-feedback",
        "item-name-duplicate:standard-package-cross-type"
      ],
      "businessRuleAssertionIdsObserved": [
        "item-name-duplicate:api-error",
        "item-name-duplicate:category-independence",
        "item-name-duplicate:cross-type-rename",
        "item-name-duplicate:list-persistence",
        "item-name-duplicate:record-count",
        "item-name-duplicate:save-feedback",
        "item-name-duplicate:standard-package-cross-type"
      ],
      "businessRuleUiEvidenceIds": [
        "TC-ITEM-STD-011-runtime-evidence"
      ],
      "businessRuleApiEvidenceIds": [
        "TC-ITEM-STD-011-runtime-evidence"
      ],
      "businessRuleDownstreamEvidenceIds": [],
      "businessRuleCleanup": {
        "required": true,
        "apiZeroResidue": false,
        "uiZeroResidue": false
      },
      "observedStatement": "同一商户内标准商品与套餐商品共享名称唯一性空间，彼此及各自同类型创建或编辑同名均失败并提示 BITEM-7014：商品名称与其它类型商品名称重复；加料商品使用独立名称空间，标准商品或套餐商品在创建及编辑改名时均可与加料商品同名，但加料商品之间创建或编辑同名均失败；分类不参与判重；同类型无重复时允许改名，编辑失败原名称保持不变"
    },
    "semanticCaseFingerprint": "4da7a24da9c31778af6120b3960bab1f741f86e425a833ccab9e8b8d324ca197"
  },
  {
    "caseId": "TC-ITEM-STD-012",
    "title": "同一一级分类不同二级分类的标准商品同名提示 BITEM-7010",
    "irConverted": true,
    "reviewDecision": "approved",
    "automationClassification": "blocked",
    "recipeId": "product-center:item-p0-wave-d:TC-ITEM-STD-012",
    "recipeInventory": {
      "any": 1,
      "enabled": 1,
      "semanticComplete": 0,
      "files": [
        "contracts/product-center/recipes/product-center-item-p0-wave-d-recipes.json"
      ]
    },
    "blockingReasons": [
      "ASSERTION_CONTRACT_REQUIRED"
    ],
    "family": "standard",
    "action": "contract-resolution",
    "runtimeReadiness": "ready",
    "runtimeStatus": "runtime-passed",
    "handlerId": "product-center:item-p0-wave-d:TC-ITEM-STD-012",
    "bindingFingerprint": "fa126b1f6dd0304ce090f706dda4f8d87816fb6144bd36910696ab443c0a606b",
    "implementationFingerprint": "5967bb7f95556a9775c7c163d540dd7f7576f60cb511116657eec1e34eb14f12",
    "assertionIds": [
      "TC-ITEM-STD-012:expectation-1"
    ],
    "businessRule": {
      "businessRuleId": "BR-ITEM-010",
      "businessRuleFingerprint": "4398349399b4362b465c6b296e9728fe8b915410ead525fe230de611aa3e0462",
      "businessRuleAssertionIdsRequired": [
        "item-name-duplicate:api-error",
        "item-name-duplicate:category-independence",
        "item-name-duplicate:cross-type-rename",
        "item-name-duplicate:list-persistence",
        "item-name-duplicate:record-count",
        "item-name-duplicate:save-feedback",
        "item-name-duplicate:standard-package-cross-type"
      ],
      "businessRuleAssertionIdsObserved": [
        "item-name-duplicate:api-error",
        "item-name-duplicate:category-independence",
        "item-name-duplicate:cross-type-rename",
        "item-name-duplicate:list-persistence",
        "item-name-duplicate:record-count",
        "item-name-duplicate:save-feedback",
        "item-name-duplicate:standard-package-cross-type"
      ],
      "businessRuleUiEvidenceIds": [
        "TC-ITEM-STD-012-runtime-evidence"
      ],
      "businessRuleApiEvidenceIds": [
        "TC-ITEM-STD-012-runtime-evidence"
      ],
      "businessRuleDownstreamEvidenceIds": [],
      "businessRuleCleanup": {
        "required": true,
        "apiZeroResidue": false,
        "uiZeroResidue": false
      },
      "observedStatement": "同一商户内标准商品与套餐商品共享名称唯一性空间，彼此及各自同类型创建或编辑同名均失败并提示 BITEM-7014：商品名称与其它类型商品名称重复；加料商品使用独立名称空间，标准商品或套餐商品在创建及编辑改名时均可与加料商品同名，但加料商品之间创建或编辑同名均失败；分类不参与判重；同类型无重复时允许改名，编辑失败原名称保持不变"
    },
    "semanticCaseFingerprint": "5ddc0d6888a84c4b3b0032106b0b54652ddfba6bc75dcdb02b299934be90a42a"
  },
  {
    "caseId": "TC-ITEM-STD-013",
    "title": "同一二级分类下新建同名商品创建失败",
    "irConverted": true,
    "reviewDecision": "approved",
    "automationClassification": "blocked",
    "recipeId": "product-center:item-p0-wave-d:TC-ITEM-STD-013",
    "recipeInventory": {
      "any": 1,
      "enabled": 1,
      "semanticComplete": 0,
      "files": [
        "contracts/product-center/recipes/product-center-item-p0-wave-d-recipes.json"
      ]
    },
    "blockingReasons": [
      "ASSERTION_CONTRACT_REQUIRED"
    ],
    "family": "standard",
    "action": "contract-resolution",
    "runtimeReadiness": "ready",
    "runtimeStatus": "runtime-passed",
    "handlerId": "product-center:item-p0-wave-d:TC-ITEM-STD-013",
    "bindingFingerprint": "fa126b1f6dd0304ce090f706dda4f8d87816fb6144bd36910696ab443c0a606b",
    "implementationFingerprint": "5967bb7f95556a9775c7c163d540dd7f7576f60cb511116657eec1e34eb14f12",
    "assertionIds": [
      "TC-ITEM-STD-013:expectation-1",
      "TC-ITEM-STD-013:expectation-2"
    ],
    "businessRule": {
      "businessRuleId": "BR-ITEM-010",
      "businessRuleFingerprint": "4398349399b4362b465c6b296e9728fe8b915410ead525fe230de611aa3e0462",
      "businessRuleAssertionIdsRequired": [
        "item-name-duplicate:api-error",
        "item-name-duplicate:category-independence",
        "item-name-duplicate:cross-type-rename",
        "item-name-duplicate:list-persistence",
        "item-name-duplicate:record-count",
        "item-name-duplicate:save-feedback",
        "item-name-duplicate:standard-package-cross-type"
      ],
      "businessRuleAssertionIdsObserved": [
        "item-name-duplicate:api-error",
        "item-name-duplicate:category-independence",
        "item-name-duplicate:cross-type-rename",
        "item-name-duplicate:list-persistence",
        "item-name-duplicate:record-count",
        "item-name-duplicate:save-feedback",
        "item-name-duplicate:standard-package-cross-type"
      ],
      "businessRuleUiEvidenceIds": [
        "TC-ITEM-STD-013-runtime-evidence"
      ],
      "businessRuleApiEvidenceIds": [
        "TC-ITEM-STD-013-runtime-evidence"
      ],
      "businessRuleDownstreamEvidenceIds": [],
      "businessRuleCleanup": {
        "required": true,
        "apiZeroResidue": false,
        "uiZeroResidue": false
      },
      "observedStatement": "同一商户内标准商品与套餐商品共享名称唯一性空间，彼此及各自同类型创建或编辑同名均失败并提示 BITEM-7014：商品名称与其它类型商品名称重复；加料商品使用独立名称空间，标准商品或套餐商品在创建及编辑改名时均可与加料商品同名，但加料商品之间创建或编辑同名均失败；分类不参与判重；同类型无重复时允许改名，编辑失败原名称保持不变"
    },
    "semanticCaseFingerprint": "3617c60067bd90a104feb20fbcee4a492d11cf4a81c38095c47dc83b2a437aa4"
  },
  {
    "caseId": "TC-ITEM-STD-014",
    "title": "同一商户下不同一级分类仍不可创建同名商品",
    "irConverted": true,
    "reviewDecision": "approved",
    "automationClassification": "blocked",
    "recipeId": "product-center:item-p0-wave-d:TC-ITEM-STD-014",
    "recipeInventory": {
      "any": 1,
      "enabled": 1,
      "semanticComplete": 0,
      "files": [
        "contracts/product-center/recipes/product-center-item-p0-wave-d-recipes.json"
      ]
    },
    "blockingReasons": [
      "ASSERTION_CONTRACT_REQUIRED"
    ],
    "family": "standard",
    "action": "contract-resolution",
    "runtimeReadiness": "ready",
    "runtimeStatus": "runtime-passed",
    "handlerId": "product-center:item-p0-wave-d:TC-ITEM-STD-014",
    "bindingFingerprint": "fa126b1f6dd0304ce090f706dda4f8d87816fb6144bd36910696ab443c0a606b",
    "implementationFingerprint": "5967bb7f95556a9775c7c163d540dd7f7576f60cb511116657eec1e34eb14f12",
    "assertionIds": [
      "TC-ITEM-STD-014:expectation-1",
      "TC-ITEM-STD-014:expectation-2"
    ],
    "businessRule": {
      "businessRuleId": "BR-ITEM-010",
      "businessRuleFingerprint": "4398349399b4362b465c6b296e9728fe8b915410ead525fe230de611aa3e0462",
      "businessRuleAssertionIdsRequired": [
        "item-name-duplicate:api-error",
        "item-name-duplicate:category-independence",
        "item-name-duplicate:cross-type-rename",
        "item-name-duplicate:list-persistence",
        "item-name-duplicate:record-count",
        "item-name-duplicate:save-feedback",
        "item-name-duplicate:standard-package-cross-type"
      ],
      "businessRuleAssertionIdsObserved": [
        "item-name-duplicate:api-error",
        "item-name-duplicate:category-independence",
        "item-name-duplicate:cross-type-rename",
        "item-name-duplicate:list-persistence",
        "item-name-duplicate:record-count",
        "item-name-duplicate:save-feedback",
        "item-name-duplicate:standard-package-cross-type"
      ],
      "businessRuleUiEvidenceIds": [
        "TC-ITEM-STD-014-runtime-evidence"
      ],
      "businessRuleApiEvidenceIds": [
        "TC-ITEM-STD-014-runtime-evidence"
      ],
      "businessRuleDownstreamEvidenceIds": [],
      "businessRuleCleanup": {
        "required": true,
        "apiZeroResidue": false,
        "uiZeroResidue": false
      },
      "observedStatement": "同一商户内标准商品与套餐商品共享名称唯一性空间，彼此及各自同类型创建或编辑同名均失败并提示 BITEM-7014：商品名称与其它类型商品名称重复；加料商品使用独立名称空间，标准商品或套餐商品在创建及编辑改名时均可与加料商品同名，但加料商品之间创建或编辑同名均失败；分类不参与判重；同类型无重复时允许改名，编辑失败原名称保持不变"
    },
    "semanticCaseFingerprint": "7759638d3beab2d522d37b9f02f8fdd1d91740b4a03f4fe398bf1455630c3bf7"
  },
  {
    "caseId": "TC-ITEM-STD-015",
    "title": "单规格商品标准价为0时创建成功",
    "irConverted": true,
    "reviewDecision": "approved",
    "automationClassification": "blocked",
    "recipeId": null,
    "recipeInventory": {
      "any": 0,
      "enabled": 0,
      "semanticComplete": 0,
      "files": []
    },
    "blockingReasons": [
      "RECIPE_REQUIRED"
    ],
    "family": "standard",
    "action": "create-zero",
    "runtimeReadiness": "ready",
    "runtimeStatus": "runtime-passed",
    "handlerId": "item-216:TC-ITEM-STD-015",
    "bindingFingerprint": "fa126b1f6dd0304ce090f706dda4f8d87816fb6144bd36910696ab443c0a606b",
    "implementationFingerprint": "5967bb7f95556a9775c7c163d540dd7f7576f60cb511116657eec1e34eb14f12",
    "assertionIds": [
      "TC-ITEM-STD-015:expectation-1",
      "TC-ITEM-STD-015:expectation-2",
      "TC-ITEM-STD-015:expectation-3"
    ],
    "semanticCaseFingerprint": "bb0aac15beef996f8febb8a9cd6aa5d3b91226ee8e506f2ac07a00eda28e1e7e"
  },
  {
    "caseId": "TC-ITEM-STD-016",
    "title": "多规格商品选择默认规格后创建成功且列表展示所有规格价格",
    "irConverted": true,
    "reviewDecision": "approved",
    "automationClassification": "blocked",
    "recipeId": null,
    "recipeInventory": {
      "any": 0,
      "enabled": 0,
      "semanticComplete": 0,
      "files": []
    },
    "blockingReasons": [
      "RECIPE_REQUIRED"
    ],
    "family": "standard",
    "action": "create-multi-default",
    "runtimeReadiness": "ready",
    "runtimeStatus": "runtime-passed",
    "handlerId": "item-216:TC-ITEM-STD-016",
    "bindingFingerprint": "fa126b1f6dd0304ce090f706dda4f8d87816fb6144bd36910696ab443c0a606b",
    "implementationFingerprint": "5967bb7f95556a9775c7c163d540dd7f7576f60cb511116657eec1e34eb14f12",
    "assertionIds": [
      "TC-ITEM-STD-016:expectation-1",
      "TC-ITEM-STD-016:expectation-2",
      "TC-ITEM-STD-016:expectation-3"
    ],
    "semanticCaseFingerprint": "39dd70bcbc37e37151e5c8c657e7bfa561706782cb8999c40a0510f7e9e5c04f"
  },
  {
    "caseId": "TC-ITEM-STD-017",
    "title": "多规格商品未选择默认规格时列表仍展示所有规格价格",
    "irConverted": true,
    "reviewDecision": "approved",
    "automationClassification": "blocked",
    "recipeId": null,
    "recipeInventory": {
      "any": 0,
      "enabled": 0,
      "semanticComplete": 0,
      "files": []
    },
    "blockingReasons": [
      "RECIPE_REQUIRED"
    ],
    "family": "standard",
    "action": "create-multi-no-default",
    "runtimeReadiness": "ready",
    "runtimeStatus": "runtime-passed",
    "handlerId": "item-216:TC-ITEM-STD-017",
    "bindingFingerprint": "fa126b1f6dd0304ce090f706dda4f8d87816fb6144bd36910696ab443c0a606b",
    "implementationFingerprint": "5967bb7f95556a9775c7c163d540dd7f7576f60cb511116657eec1e34eb14f12",
    "assertionIds": [
      "TC-ITEM-STD-017:expectation-1",
      "TC-ITEM-STD-017:expectation-2"
    ],
    "semanticCaseFingerprint": "08fd15b89e0fc18ce3bb616e1bc68dd5a936aca09e12df2940b1052d85f95089"
  },
  {
    "caseId": "TC-ITEM-STD-018",
    "title": "称重商品创建成功",
    "irConverted": true,
    "reviewDecision": "approved",
    "automationClassification": "blocked",
    "recipeId": null,
    "recipeInventory": {
      "any": 0,
      "enabled": 0,
      "semanticComplete": 0,
      "files": []
    },
    "blockingReasons": [
      "RECIPE_REQUIRED"
    ],
    "family": "standard",
    "action": "create-weight",
    "runtimeReadiness": "ready",
    "runtimeStatus": "runtime-passed",
    "handlerId": "item-216:TC-ITEM-STD-018",
    "bindingFingerprint": "fa126b1f6dd0304ce090f706dda4f8d87816fb6144bd36910696ab443c0a606b",
    "implementationFingerprint": "5967bb7f95556a9775c7c163d540dd7f7576f60cb511116657eec1e34eb14f12",
    "assertionIds": [
      "TC-ITEM-STD-018:expectation-1",
      "TC-ITEM-STD-018:expectation-2",
      "TC-ITEM-STD-018:expectation-3",
      "TC-ITEM-STD-018:expectation-4"
    ],
    "semanticCaseFingerprint": "bcd6dcc32bf03b1a51c7d6887df1689298b4419a750ce28339fd9390bd22cb9d"
  },
  {
    "caseId": "TC-ITEM-STD-019",
    "title": "称重商品销售单位下拉展示 g、kg、ml",
    "irConverted": true,
    "reviewDecision": "approved",
    "automationClassification": "blocked",
    "recipeId": "product-center:yellow-probe:at13:tc-item-std-019",
    "recipeInventory": {
      "any": 1,
      "enabled": 0,
      "semanticComplete": 0,
      "files": [
        "contracts/product-center/recipes/yellow-probes/product-center-item-yellow-representative-probe-recipes.json"
      ]
    },
    "blockingReasons": [
      "RECIPE_GENERATION_DISABLED",
      "ASSERTION_CONTRACT_REQUIRED",
      "RUNTIME_EVIDENCE_REQUIRED"
    ],
    "family": "standard",
    "action": "weight-units",
    "runtimeReadiness": "ready",
    "runtimeStatus": "runtime-passed",
    "handlerId": "product-center:yellow-probe:at13:tc-item-std-019",
    "bindingFingerprint": "fa126b1f6dd0304ce090f706dda4f8d87816fb6144bd36910696ab443c0a606b",
    "implementationFingerprint": "5967bb7f95556a9775c7c163d540dd7f7576f60cb511116657eec1e34eb14f12",
    "assertionIds": [
      "TC-ITEM-STD-019:expectation-1"
    ],
    "semanticCaseFingerprint": "757d8f92040465264685ce676dda4eb86a4666ed71c2ea49c33fdc0ce80a0a0a"
  },
  {
    "caseId": "TC-ITEM-STD-020",
    "title": "单规格商品标准价为1.99时创建成功",
    "irConverted": true,
    "reviewDecision": "approved",
    "automationClassification": "blocked",
    "recipeId": "product-center:green-draft:at09:tc-item-std-020",
    "recipeInventory": {
      "any": 1,
      "enabled": 1,
      "semanticComplete": 0,
      "files": [
        "contracts/product-center/recipes/green-drafts/product-center-item-green-binding-draft-recipes.json"
      ]
    },
    "blockingReasons": [
      "ASSERTION_CONTRACT_REQUIRED",
      "RUNTIME_EVIDENCE_REQUIRED"
    ],
    "family": "standard",
    "action": "create-price",
    "runtimeReadiness": "ready",
    "runtimeStatus": "runtime-passed",
    "handlerId": "product-center:green-draft:at09:tc-item-std-020",
    "bindingFingerprint": "fa126b1f6dd0304ce090f706dda4f8d87816fb6144bd36910696ab443c0a606b",
    "implementationFingerprint": "5967bb7f95556a9775c7c163d540dd7f7576f60cb511116657eec1e34eb14f12",
    "assertionIds": [
      "TC-ITEM-STD-020:expectation-1",
      "TC-ITEM-STD-020:expectation-2"
    ],
    "semanticCaseFingerprint": "d5197764aeb9cbe43633eb2ec491a30d88626642390df9f8f1915913e614f8d8"
  },
  {
    "caseId": "TC-ITEM-STD-021",
    "title": "标准价输入负数时创建失败",
    "irConverted": true,
    "reviewDecision": "approved",
    "automationClassification": "blocked",
    "recipeId": null,
    "recipeInventory": {
      "any": 0,
      "enabled": 0,
      "semanticComplete": 0,
      "files": []
    },
    "blockingReasons": [
      "RECIPE_REQUIRED"
    ],
    "family": "standard",
    "action": "price-negative",
    "runtimeReadiness": "ready",
    "runtimeStatus": "runtime-passed",
    "handlerId": "item-216:TC-ITEM-STD-021",
    "bindingFingerprint": "fa126b1f6dd0304ce090f706dda4f8d87816fb6144bd36910696ab443c0a606b",
    "implementationFingerprint": "5967bb7f95556a9775c7c163d540dd7f7576f60cb511116657eec1e34eb14f12",
    "assertionIds": [
      "TC-ITEM-STD-021:expectation-1"
    ],
    "businessRule": {
      "businessRuleId": "BR-FMT-005",
      "businessRuleFingerprint": "68a2895221c4d12b84412f80c9371e3051c97fdd50d2e909bb0a00d39ce4f89e",
      "businessRuleAssertionIdsRequired": [
        "br-fmt-005:canonical-outcome-1",
        "br-fmt-005:canonical-outcome-10",
        "br-fmt-005:canonical-outcome-11",
        "br-fmt-005:canonical-outcome-12",
        "br-fmt-005:canonical-outcome-13",
        "br-fmt-005:canonical-outcome-14",
        "br-fmt-005:canonical-outcome-2",
        "br-fmt-005:canonical-outcome-3",
        "br-fmt-005:canonical-outcome-4",
        "br-fmt-005:canonical-outcome-5",
        "br-fmt-005:canonical-outcome-6",
        "br-fmt-005:canonical-outcome-7",
        "br-fmt-005:canonical-outcome-8",
        "br-fmt-005:canonical-outcome-9"
      ],
      "businessRuleAssertionIdsObserved": [
        "br-fmt-005:canonical-outcome-1",
        "br-fmt-005:canonical-outcome-10",
        "br-fmt-005:canonical-outcome-11",
        "br-fmt-005:canonical-outcome-12",
        "br-fmt-005:canonical-outcome-13",
        "br-fmt-005:canonical-outcome-14",
        "br-fmt-005:canonical-outcome-2",
        "br-fmt-005:canonical-outcome-3",
        "br-fmt-005:canonical-outcome-4",
        "br-fmt-005:canonical-outcome-5",
        "br-fmt-005:canonical-outcome-6",
        "br-fmt-005:canonical-outcome-7",
        "br-fmt-005:canonical-outcome-8",
        "br-fmt-005:canonical-outcome-9"
      ],
      "businessRuleUiEvidenceIds": [
        "TC-ITEM-STD-021-runtime-evidence"
      ],
      "businessRuleApiEvidenceIds": [],
      "businessRuleDownstreamEvidenceIds": [],
      "businessRuleCleanup": {
        "required": false,
        "apiZeroResidue": false,
        "uiZeroResidue": false
      },
      "observedStatement": "价格 0.00 可保存并展示 2 位小数；超过 2 位小数按四舍五入保存，API 与重新进入页面回显舍入后的金额"
    },
    "semanticCaseFingerprint": "5de5006167d35c5ac3732176e059dd5e570d59cd42fe1a728583c5279bf4f1cb"
  },
  {
    "caseId": "TC-ITEM-STD-022",
    "title": "起售数量输入0时保存失败并提示 SYSTEM-0001",
    "irConverted": true,
    "reviewDecision": "approved",
    "automationClassification": "blocked",
    "recipeId": null,
    "recipeInventory": {
      "any": 0,
      "enabled": 0,
      "semanticComplete": 0,
      "files": []
    },
    "blockingReasons": [
      "RECIPE_REQUIRED"
    ],
    "family": "standard",
    "action": "minimum-zero",
    "runtimeReadiness": "ready",
    "runtimeStatus": "runtime-passed",
    "handlerId": "item-216:TC-ITEM-STD-022",
    "bindingFingerprint": "fa126b1f6dd0304ce090f706dda4f8d87816fb6144bd36910696ab443c0a606b",
    "implementationFingerprint": "5967bb7f95556a9775c7c163d540dd7f7576f60cb511116657eec1e34eb14f12",
    "assertionIds": [
      "TC-ITEM-STD-022:expectation-1",
      "TC-ITEM-STD-022:expectation-2"
    ],
    "semanticCaseFingerprint": "c1a3cfff583a505f29ee4f3a86bbc69271832eeadd7da7f9bc4f49340598ff75"
  },
  {
    "caseId": "TC-ITEM-STD-023",
    "title": "标准商品非法起售数量保存时归一化为 1",
    "irConverted": true,
    "reviewDecision": "approved",
    "automationClassification": "blocked",
    "recipeId": null,
    "recipeInventory": {
      "any": 0,
      "enabled": 0,
      "semanticComplete": 0,
      "files": []
    },
    "blockingReasons": [
      "RECIPE_REQUIRED"
    ],
    "family": "standard",
    "action": "minimum-invalid",
    "runtimeReadiness": "ready",
    "runtimeStatus": "runtime-passed",
    "handlerId": "item-216:TC-ITEM-STD-023",
    "bindingFingerprint": "fa126b1f6dd0304ce090f706dda4f8d87816fb6144bd36910696ab443c0a606b",
    "implementationFingerprint": "5967bb7f95556a9775c7c163d540dd7f7576f60cb511116657eec1e34eb14f12",
    "assertionIds": [
      "TC-ITEM-STD-023:expectation-1"
    ],
    "semanticCaseFingerprint": "a3b3d604861a87f24349d8c659a757d9a9cb73d9336f94c8033caebd0b2793fd"
  },
  {
    "caseId": "TC-ITEM-STD-024",
    "title": "起售数量大于1时创建成功且C端默认点单数量为起售数量",
    "irConverted": true,
    "reviewDecision": "approved",
    "automationClassification": "blocked",
    "recipeId": "product-center:yellow-probe:at11:tc-item-std-024",
    "recipeInventory": {
      "any": 1,
      "enabled": 0,
      "semanticComplete": 0,
      "files": [
        "contracts/product-center/recipes/yellow-probes/product-center-item-yellow-representative-probe-recipes.json"
      ]
    },
    "blockingReasons": [
      "RECIPE_GENERATION_DISABLED",
      "ASSERTION_CONTRACT_REQUIRED",
      "RUNTIME_EVIDENCE_REQUIRED"
    ],
    "family": "standard",
    "action": "minimum-replay",
    "runtimeReadiness": "ready",
    "runtimeStatus": "runtime-passed",
    "handlerId": "product-center:yellow-probe:at11:tc-item-std-024",
    "bindingFingerprint": "fa126b1f6dd0304ce090f706dda4f8d87816fb6144bd36910696ab443c0a606b",
    "implementationFingerprint": "5967bb7f95556a9775c7c163d540dd7f7576f60cb511116657eec1e34eb14f12",
    "assertionIds": [
      "TC-ITEM-STD-024:expectation-1",
      "TC-ITEM-STD-024:expectation-2"
    ],
    "semanticCaseFingerprint": "4f29f07891cde8d8b1c60900dbb1720a079335abbb54d7cedff82e39981a170e"
  },
  {
    "caseId": "TC-ITEM-STD-028",
    "title": "商品列表支持按名称、类型、分类、状态组合查询",
    "irConverted": true,
    "reviewDecision": "approved",
    "automationClassification": "blocked",
    "recipeId": "product-center:item-p0-wave-b:TC-ITEM-STD-028",
    "recipeInventory": {
      "any": 1,
      "enabled": 1,
      "semanticComplete": 0,
      "files": [
        "contracts/product-center/recipes/product-center-item-p0-wave-b-recipes.json"
      ]
    },
    "blockingReasons": [
      "ASSERTION_CONTRACT_REQUIRED",
      "RUNTIME_EVIDENCE_REQUIRED"
    ],
    "family": "standard",
    "action": "type-filter",
    "runtimeReadiness": "ready",
    "runtimeStatus": "runtime-passed",
    "handlerId": "product-center:item-p0-wave-b:TC-ITEM-STD-028",
    "bindingFingerprint": "fa126b1f6dd0304ce090f706dda4f8d87816fb6144bd36910696ab443c0a606b",
    "implementationFingerprint": "5967bb7f95556a9775c7c163d540dd7f7576f60cb511116657eec1e34eb14f12",
    "assertionIds": [
      "TC-ITEM-STD-028:expectation-1",
      "TC-ITEM-STD-028:expectation-2",
      "TC-ITEM-STD-028:expectation-3",
      "TC-ITEM-STD-028:expectation-4"
    ],
    "semanticCaseFingerprint": "321f6c83ce0b0125c4b2be9c25c5401010613dafa4d70832514417c2387e8168"
  },
  {
    "caseId": "TC-ITEM-STD-029",
    "title": "重置查询后页面恢复初始状态",
    "irConverted": true,
    "reviewDecision": "approved",
    "automationClassification": "blocked",
    "recipeId": "product-center:item-p0-wave-b:TC-ITEM-STD-029",
    "recipeInventory": {
      "any": 1,
      "enabled": 1,
      "semanticComplete": 0,
      "files": [
        "contracts/product-center/recipes/product-center-item-p0-wave-b-recipes.json"
      ]
    },
    "blockingReasons": [
      "ASSERTION_CONTRACT_REQUIRED",
      "RUNTIME_EVIDENCE_REQUIRED"
    ],
    "family": "standard",
    "action": "filter-reset",
    "runtimeReadiness": "ready",
    "runtimeStatus": "runtime-passed",
    "handlerId": "product-center:item-p0-wave-b:TC-ITEM-STD-029",
    "bindingFingerprint": "fa126b1f6dd0304ce090f706dda4f8d87816fb6144bd36910696ab443c0a606b",
    "implementationFingerprint": "5967bb7f95556a9775c7c163d540dd7f7576f60cb511116657eec1e34eb14f12",
    "assertionIds": [
      "TC-ITEM-STD-029:expectation-1",
      "TC-ITEM-STD-029:expectation-2",
      "TC-ITEM-STD-029:expectation-3",
      "TC-ITEM-STD-029:expectation-4",
      "TC-ITEM-STD-029:expectation-5"
    ],
    "semanticCaseFingerprint": "13b108dc8267c6e37dc686ba0fe387d5618f1493300740f138be637a4eb2cbc1"
  },
  {
    "caseId": "TC-ITEM-STD-030",
    "title": "切换页面返回标准商品列表时不保留查询条件",
    "irConverted": true,
    "reviewDecision": "approved",
    "automationClassification": "blocked",
    "recipeId": "product-center:yellow-probe:at04:tc-item-std-030",
    "recipeInventory": {
      "any": 1,
      "enabled": 0,
      "semanticComplete": 0,
      "files": [
        "contracts/product-center/recipes/yellow-probes/product-center-item-yellow-representative-probe-recipes.json"
      ]
    },
    "blockingReasons": [
      "RECIPE_GENERATION_DISABLED",
      "ASSERTION_CONTRACT_REQUIRED",
      "RUNTIME_EVIDENCE_REQUIRED"
    ],
    "family": "standard",
    "action": "filter-memory",
    "runtimeReadiness": "ready",
    "runtimeStatus": "runtime-passed",
    "handlerId": "product-center:yellow-probe:at04:tc-item-std-030",
    "bindingFingerprint": "fa126b1f6dd0304ce090f706dda4f8d87816fb6144bd36910696ab443c0a606b",
    "implementationFingerprint": "5967bb7f95556a9775c7c163d540dd7f7576f60cb511116657eec1e34eb14f12",
    "assertionIds": [
      "TC-ITEM-STD-030:expectation-1"
    ],
    "semanticCaseFingerprint": "c21baa9d5f1e461a6793ae1b76096d5382a8ea238c1edddbd8e9c91b3463ac8a"
  },
  {
    "caseId": "TC-ITEM-STD-031",
    "title": "标准商品编辑基础信息后保存成功",
    "irConverted": true,
    "reviewDecision": "approved",
    "automationClassification": "blocked",
    "recipeId": "product-center:item-p0-wave-d:TC-ITEM-STD-031",
    "recipeInventory": {
      "any": 1,
      "enabled": 1,
      "semanticComplete": 0,
      "files": [
        "contracts/product-center/recipes/product-center-item-p0-wave-d-recipes.json"
      ]
    },
    "blockingReasons": [
      "ASSERTION_CONTRACT_REQUIRED"
    ],
    "family": "standard",
    "action": "edit-basic",
    "runtimeReadiness": "ready",
    "runtimeStatus": "runtime-passed",
    "handlerId": "product-center:item-p0-wave-d:TC-ITEM-STD-031",
    "bindingFingerprint": "fa126b1f6dd0304ce090f706dda4f8d87816fb6144bd36910696ab443c0a606b",
    "implementationFingerprint": "5967bb7f95556a9775c7c163d540dd7f7576f60cb511116657eec1e34eb14f12",
    "assertionIds": [
      "TC-ITEM-STD-031:expectation-1",
      "TC-ITEM-STD-031:expectation-2",
      "TC-ITEM-STD-031:expectation-3"
    ],
    "semanticCaseFingerprint": "89308be22fd980470baf3e425c2fe92694027146e0dec2cf8889452e764daa1f"
  },
  {
    "caseId": "TC-ITEM-STD-032",
    "title": "标准商品内编辑口味组加价和默认选中仅对当前商品生效",
    "irConverted": true,
    "reviewDecision": "approved",
    "automationClassification": "blocked",
    "recipeId": null,
    "recipeInventory": {
      "any": 0,
      "enabled": 0,
      "semanticComplete": 0,
      "files": []
    },
    "blockingReasons": [
      "RECIPE_REQUIRED"
    ],
    "family": "standard",
    "action": "contract-resolution",
    "runtimeReadiness": "ready",
    "runtimeStatus": "runtime-passed",
    "handlerId": "item-216:TC-ITEM-STD-032",
    "bindingFingerprint": "fa126b1f6dd0304ce090f706dda4f8d87816fb6144bd36910696ab443c0a606b",
    "implementationFingerprint": "5967bb7f95556a9775c7c163d540dd7f7576f60cb511116657eec1e34eb14f12",
    "assertionIds": [
      "TC-ITEM-STD-032:expectation-1",
      "TC-ITEM-STD-032:expectation-2",
      "TC-ITEM-STD-032:expectation-3"
    ],
    "semanticCaseFingerprint": "3361d5d01236867fe98bf37f3850aa0486955217d429c0f577909f84a7e2e6dd"
  },
  {
    "caseId": "TC-ITEM-STD-033",
    "title": "标准商品编辑其他信息后保存成功",
    "irConverted": true,
    "reviewDecision": "approved",
    "automationClassification": "blocked",
    "recipeId": "product-center:green-draft:at01:tc-item-std-033",
    "recipeInventory": {
      "any": 1,
      "enabled": 1,
      "semanticComplete": 0,
      "files": [
        "contracts/product-center/recipes/green-drafts/product-center-item-green-binding-draft-recipes.json"
      ]
    },
    "blockingReasons": [
      "ASSERTION_CONTRACT_REQUIRED",
      "RUNTIME_EVIDENCE_REQUIRED"
    ],
    "family": "standard",
    "action": "edit-other",
    "runtimeReadiness": "ready",
    "runtimeStatus": "runtime-passed",
    "handlerId": "product-center:green-draft:at01:tc-item-std-033",
    "bindingFingerprint": "fa126b1f6dd0304ce090f706dda4f8d87816fb6144bd36910696ab443c0a606b",
    "implementationFingerprint": "5967bb7f95556a9775c7c163d540dd7f7576f60cb511116657eec1e34eb14f12",
    "assertionIds": [
      "TC-ITEM-STD-033:expectation-1",
      "TC-ITEM-STD-033:expectation-2"
    ],
    "semanticCaseFingerprint": "bc155074b4f16b1afc8f39063843755643c0b883fc6474ec2a6dc6e9f0c0c63e"
  },
  {
    "caseId": "TC-ITEM-STD-035",
    "title": "分类下已有商品时不可继续新增子分类",
    "irConverted": true,
    "reviewDecision": "approved",
    "automationClassification": "blocked",
    "recipeId": "product-center:green-draft:at06:tc-item-std-035",
    "recipeInventory": {
      "any": 1,
      "enabled": 1,
      "semanticComplete": 0,
      "files": [
        "contracts/product-center/recipes/green-drafts/product-center-item-green-binding-draft-recipes.json"
      ]
    },
    "blockingReasons": [
      "ASSERTION_CONTRACT_REQUIRED",
      "RUNTIME_EVIDENCE_REQUIRED"
    ],
    "family": "standard",
    "action": "category-with-product",
    "runtimeReadiness": "ready",
    "runtimeStatus": "runtime-passed",
    "handlerId": "product-center:green-draft:at06:tc-item-std-035",
    "bindingFingerprint": "fa126b1f6dd0304ce090f706dda4f8d87816fb6144bd36910696ab443c0a606b",
    "implementationFingerprint": "5967bb7f95556a9775c7c163d540dd7f7576f60cb511116657eec1e34eb14f12",
    "assertionIds": [
      "TC-ITEM-STD-035:expectation-1",
      "TC-ITEM-STD-035:expectation-2"
    ],
    "semanticCaseFingerprint": "e8496f49217e9842a8e81f734721d2593b11d16cd25d6bbb3b96ca4a50d09936"
  },
  {
    "caseId": "TC-ITEM-STD-036",
    "title": "标准商品仅填写必填项时创建成功",
    "irConverted": true,
    "reviewDecision": "approved",
    "automationClassification": "blocked",
    "recipeId": null,
    "recipeInventory": {
      "any": 0,
      "enabled": 0,
      "semanticComplete": 0,
      "files": []
    },
    "blockingReasons": [
      "RECIPE_REQUIRED"
    ],
    "family": "standard",
    "action": "create-required",
    "runtimeReadiness": "ready",
    "runtimeStatus": "runtime-passed",
    "handlerId": "item-216:TC-ITEM-STD-036",
    "bindingFingerprint": "fa126b1f6dd0304ce090f706dda4f8d87816fb6144bd36910696ab443c0a606b",
    "implementationFingerprint": "5967bb7f95556a9775c7c163d540dd7f7576f60cb511116657eec1e34eb14f12",
    "assertionIds": [
      "TC-ITEM-STD-036:expectation-1",
      "TC-ITEM-STD-036:expectation-2",
      "TC-ITEM-STD-036:expectation-3"
    ],
    "semanticCaseFingerprint": "cf036438ea9acb1c5612d00504743fa96e3f9c715e5290e2927121ea2eb28bb7"
  },
  {
    "caseId": "TC-ITEM-STD-037",
    "title": "不选择商品分类时标准商品创建成功",
    "irConverted": true,
    "reviewDecision": "approved",
    "automationClassification": "blocked",
    "recipeId": null,
    "recipeInventory": {
      "any": 0,
      "enabled": 0,
      "semanticComplete": 0,
      "files": []
    },
    "blockingReasons": [
      "RECIPE_REQUIRED"
    ],
    "family": "standard",
    "action": "create-no-category",
    "runtimeReadiness": "ready",
    "runtimeStatus": "runtime-passed",
    "handlerId": "item-216:TC-ITEM-STD-037",
    "bindingFingerprint": "fa126b1f6dd0304ce090f706dda4f8d87816fb6144bd36910696ab443c0a606b",
    "implementationFingerprint": "5967bb7f95556a9775c7c163d540dd7f7576f60cb511116657eec1e34eb14f12",
    "assertionIds": [
      "TC-ITEM-STD-037:expectation-1",
      "TC-ITEM-STD-037:expectation-2",
      "TC-ITEM-STD-037:expectation-3",
      "TC-ITEM-STD-037:expectation-4",
      "TC-ITEM-STD-037:expectation-5",
      "TC-ITEM-STD-037:expectation-6"
    ],
    "businessRule": {
      "businessRuleId": "BR-ITEM-CATEGORY-OPTIONAL",
      "businessRuleFingerprint": "7c96ee1ab12058a8cd88c1c2ba11d62a68c07fed7bb9f2c18a79d8b59d0c626e",
      "businessRuleAssertionIdsRequired": [
        "category-optional:create-feedback",
        "category-optional:edit-persistence",
        "category-optional:list-filter",
        "category-optional:list-identity",
        "category-optional:list-price"
      ],
      "businessRuleAssertionIdsObserved": [
        "category-optional:create-feedback",
        "category-optional:edit-persistence",
        "category-optional:list-filter",
        "category-optional:list-identity",
        "category-optional:list-price"
      ],
      "businessRuleUiEvidenceIds": [
        "TC-ITEM-STD-037-runtime-evidence"
      ],
      "businessRuleApiEvidenceIds": [],
      "businessRuleDownstreamEvidenceIds": [],
      "businessRuleCleanup": {
        "required": true,
        "apiZeroResidue": false,
        "uiZeroResidue": false
      },
      "observedStatement": "商品分类非必填：创建或编辑时可以不选择分类；编辑时不修改分类则保留原分类，主动清空分类可以保存为空；保存后列表可按商品分类过滤，重新进入编辑详情应回显最后一次保存结果"
    },
    "semanticCaseFingerprint": "b503475a52eaecc88a19c46336ef121dce2e45cf62bca65298ed527af7989f71"
  },
  {
    "caseId": "TC-ITEM-STD-038",
    "title": "标准价缺失时创建失败",
    "irConverted": true,
    "reviewDecision": "approved",
    "automationClassification": "blocked",
    "recipeId": "product-center:item-p0-wave-c:TC-ITEM-STD-038",
    "recipeInventory": {
      "any": 1,
      "enabled": 1,
      "semanticComplete": 0,
      "files": [
        "contracts/product-center/recipes/product-center-item-p0-wave-c-recipes.json"
      ]
    },
    "blockingReasons": [
      "ASSERTION_CONTRACT_REQUIRED",
      "RUNTIME_EVIDENCE_REQUIRED"
    ],
    "family": "standard",
    "action": "price-missing",
    "runtimeReadiness": "ready",
    "runtimeStatus": "runtime-passed",
    "handlerId": "product-center:item-p0-wave-c:TC-ITEM-STD-038",
    "bindingFingerprint": "fa126b1f6dd0304ce090f706dda4f8d87816fb6144bd36910696ab443c0a606b",
    "implementationFingerprint": "5967bb7f95556a9775c7c163d540dd7f7576f60cb511116657eec1e34eb14f12",
    "assertionIds": [
      "TC-ITEM-STD-038:expectation-1",
      "TC-ITEM-STD-038:expectation-2",
      "TC-ITEM-STD-038:expectation-3"
    ],
    "semanticCaseFingerprint": "e0df327a44a6311b98547c983f29d9b2128b9e39ce7987d32700f05f5d10c924"
  },
  {
    "caseId": "TC-ITEM-STD-039",
    "title": "起售数量为空时保存失败",
    "irConverted": true,
    "reviewDecision": "approved",
    "automationClassification": "blocked",
    "recipeId": null,
    "recipeInventory": {
      "any": 0,
      "enabled": 0,
      "semanticComplete": 0,
      "files": []
    },
    "blockingReasons": [
      "RECIPE_REQUIRED"
    ],
    "family": "standard",
    "action": "minimum-missing",
    "runtimeReadiness": "ready",
    "runtimeStatus": "runtime-passed",
    "handlerId": "item-216:TC-ITEM-STD-039",
    "bindingFingerprint": "fa126b1f6dd0304ce090f706dda4f8d87816fb6144bd36910696ab443c0a606b",
    "implementationFingerprint": "5967bb7f95556a9775c7c163d540dd7f7576f60cb511116657eec1e34eb14f12",
    "assertionIds": [
      "TC-ITEM-STD-039:expectation-1",
      "TC-ITEM-STD-039:expectation-2",
      "TC-ITEM-STD-039:expectation-3"
    ],
    "semanticCaseFingerprint": "7bfcf43391ccf471ce60acb81f81a311f6f06378d3c0896a3c45bddfd27abd0b"
  },
  {
    "caseId": "TC-ITEM-STD-041",
    "title": "标准商品创建页高级设置区域默认不展开",
    "irConverted": true,
    "reviewDecision": "approved",
    "automationClassification": "blocked",
    "recipeId": "product-center:yellow-probe:at07:tc-item-std-041",
    "recipeInventory": {
      "any": 1,
      "enabled": 0,
      "semanticComplete": 0,
      "files": [
        "contracts/product-center/recipes/yellow-probes/product-center-item-yellow-representative-probe-recipes.json"
      ]
    },
    "blockingReasons": [
      "RECIPE_GENERATION_DISABLED",
      "ASSERTION_CONTRACT_REQUIRED",
      "RUNTIME_EVIDENCE_REQUIRED"
    ],
    "family": "standard",
    "action": "advanced-collapsed",
    "runtimeReadiness": "ready",
    "runtimeStatus": "runtime-passed",
    "handlerId": "product-center:yellow-probe:at07:tc-item-std-041",
    "bindingFingerprint": "fa126b1f6dd0304ce090f706dda4f8d87816fb6144bd36910696ab443c0a606b",
    "implementationFingerprint": "5967bb7f95556a9775c7c163d540dd7f7576f60cb511116657eec1e34eb14f12",
    "assertionIds": [
      "TC-ITEM-STD-041:expectation-1",
      "TC-ITEM-STD-041:expectation-2"
    ],
    "semanticCaseFingerprint": "466d3d560e5f28d5b34a697c65469a29a86ceec038fb547a68d46c032a98a03f"
  },
  {
    "caseId": "TC-ITEM-STD-042",
    "title": "点击展开高级设置后展示 POS 名称等 8 个字段",
    "irConverted": true,
    "reviewDecision": "approved",
    "automationClassification": "blocked",
    "recipeId": "product-center:green-draft:at19:tc-item-std-042",
    "recipeInventory": {
      "any": 1,
      "enabled": 1,
      "semanticComplete": 0,
      "files": [
        "contracts/product-center/recipes/green-drafts/product-center-item-green-binding-draft-recipes.json"
      ]
    },
    "blockingReasons": [
      "ASSERTION_CONTRACT_REQUIRED",
      "RUNTIME_EVIDENCE_REQUIRED"
    ],
    "family": "standard",
    "action": "advanced-fields",
    "runtimeReadiness": "ready",
    "runtimeStatus": "runtime-passed",
    "handlerId": "product-center:green-draft:at19:tc-item-std-042",
    "bindingFingerprint": "fa126b1f6dd0304ce090f706dda4f8d87816fb6144bd36910696ab443c0a606b",
    "implementationFingerprint": "5967bb7f95556a9775c7c163d540dd7f7576f60cb511116657eec1e34eb14f12",
    "assertionIds": [
      "TC-ITEM-STD-042:expectation-1",
      "TC-ITEM-STD-042:expectation-2"
    ],
    "semanticCaseFingerprint": "8fbf38f9e35ec87a7babb291e70535c09428be643553a3328a79a1f3735e3b2b"
  },
  {
    "caseId": "TC-ITEM-STD-043",
    "title": "商品第二名称与商品名称互相不可重复",
    "irConverted": true,
    "reviewDecision": "approved",
    "automationClassification": "blocked",
    "recipeId": null,
    "recipeInventory": {
      "any": 0,
      "enabled": 0,
      "semanticComplete": 0,
      "files": []
    },
    "blockingReasons": [
      "RECIPE_REQUIRED"
    ],
    "family": "standard",
    "action": "duplicate-alt-name",
    "runtimeReadiness": "ready",
    "runtimeStatus": "runtime-passed",
    "handlerId": "item-216:TC-ITEM-STD-043",
    "bindingFingerprint": "fa126b1f6dd0304ce090f706dda4f8d87816fb6144bd36910696ab443c0a606b",
    "implementationFingerprint": "5967bb7f95556a9775c7c163d540dd7f7576f60cb511116657eec1e34eb14f12",
    "assertionIds": [
      "TC-ITEM-STD-043:expectation-1",
      "TC-ITEM-STD-043:expectation-2",
      "TC-ITEM-STD-043:expectation-3"
    ],
    "semanticCaseFingerprint": "9df737fcd9db509a2cc5e56e13d4614f63bb72c7a925ed0d5d60f73b02e8d4d7"
  },
  {
    "caseId": "TC-ITEM-STD-044",
    "title": "品牌内商品名称重复时创建失败",
    "irConverted": true,
    "reviewDecision": "approved",
    "automationClassification": "blocked",
    "recipeId": null,
    "recipeInventory": {
      "any": 0,
      "enabled": 0,
      "semanticComplete": 0,
      "files": []
    },
    "blockingReasons": [
      "RECIPE_REQUIRED"
    ],
    "family": "standard",
    "action": "contract-resolution",
    "runtimeReadiness": "ready",
    "runtimeStatus": "runtime-passed",
    "handlerId": "item-216:TC-ITEM-STD-044",
    "bindingFingerprint": "fa126b1f6dd0304ce090f706dda4f8d87816fb6144bd36910696ab443c0a606b",
    "implementationFingerprint": "5967bb7f95556a9775c7c163d540dd7f7576f60cb511116657eec1e34eb14f12",
    "assertionIds": [
      "TC-ITEM-STD-044:expectation-1",
      "TC-ITEM-STD-044:expectation-2",
      "TC-ITEM-STD-044:expectation-3"
    ],
    "businessRule": {
      "businessRuleId": "BR-ITEM-010",
      "businessRuleFingerprint": "4398349399b4362b465c6b296e9728fe8b915410ead525fe230de611aa3e0462",
      "businessRuleAssertionIdsRequired": [
        "item-name-duplicate:api-error",
        "item-name-duplicate:category-independence",
        "item-name-duplicate:cross-type-rename",
        "item-name-duplicate:list-persistence",
        "item-name-duplicate:record-count",
        "item-name-duplicate:save-feedback",
        "item-name-duplicate:standard-package-cross-type"
      ],
      "businessRuleAssertionIdsObserved": [
        "item-name-duplicate:api-error",
        "item-name-duplicate:category-independence",
        "item-name-duplicate:cross-type-rename",
        "item-name-duplicate:list-persistence",
        "item-name-duplicate:record-count",
        "item-name-duplicate:save-feedback",
        "item-name-duplicate:standard-package-cross-type"
      ],
      "businessRuleUiEvidenceIds": [
        "TC-ITEM-STD-044-runtime-evidence"
      ],
      "businessRuleApiEvidenceIds": [
        "TC-ITEM-STD-044-runtime-evidence"
      ],
      "businessRuleDownstreamEvidenceIds": [],
      "businessRuleCleanup": {
        "required": true,
        "apiZeroResidue": false,
        "uiZeroResidue": false
      },
      "observedStatement": "同一商户内标准商品与套餐商品共享名称唯一性空间，彼此及各自同类型创建或编辑同名均失败并提示 BITEM-7014：商品名称与其它类型商品名称重复；加料商品使用独立名称空间，标准商品或套餐商品在创建及编辑改名时均可与加料商品同名，但加料商品之间创建或编辑同名均失败；分类不参与判重；同类型无重复时允许改名，编辑失败原名称保持不变"
    },
    "semanticCaseFingerprint": "c5695a4172f3fc9fe8cf66b5d9fabec3f163feb867a8bfb9db9444dd21d12620"
  },
  {
    "caseId": "TC-ITEM-STD-045",
    "title": "商品描述达到 250 字符后不可继续输入",
    "irConverted": true,
    "reviewDecision": "approved",
    "automationClassification": "blocked",
    "recipeId": "product-center:green-draft:at17:tc-item-std-045",
    "recipeInventory": {
      "any": 1,
      "enabled": 1,
      "semanticComplete": 0,
      "files": [
        "contracts/product-center/recipes/green-drafts/product-center-item-green-binding-draft-recipes.json"
      ]
    },
    "blockingReasons": [
      "ASSERTION_CONTRACT_REQUIRED",
      "RUNTIME_EVIDENCE_REQUIRED"
    ],
    "family": "standard",
    "action": "description-capacity",
    "runtimeReadiness": "ready",
    "runtimeStatus": "runtime-passed",
    "handlerId": "product-center:green-draft:at17:tc-item-std-045",
    "bindingFingerprint": "fa126b1f6dd0304ce090f706dda4f8d87816fb6144bd36910696ab443c0a606b",
    "implementationFingerprint": "5967bb7f95556a9775c7c163d540dd7f7576f60cb511116657eec1e34eb14f12",
    "assertionIds": [
      "TC-ITEM-STD-045:expectation-1"
    ],
    "semanticCaseFingerprint": "190a03eec5e9e71056a0e4107c9deeaa48c83f66b70f4994819e258c0c01962c"
  },
  {
    "caseId": "TC-ITEM-STD-046",
    "title": "助记码超过 20 字符时保存失败",
    "irConverted": true,
    "reviewDecision": "approved",
    "automationClassification": "blocked",
    "recipeId": "product-center:green-draft:at06:tc-item-std-046",
    "recipeInventory": {
      "any": 1,
      "enabled": 1,
      "semanticComplete": 0,
      "files": [
        "contracts/product-center/recipes/green-drafts/product-center-item-green-binding-draft-recipes.json"
      ]
    },
    "blockingReasons": [
      "ASSERTION_CONTRACT_REQUIRED",
      "RUNTIME_EVIDENCE_REQUIRED"
    ],
    "family": "standard",
    "action": "field-overflow",
    "runtimeReadiness": "ready",
    "runtimeStatus": "runtime-passed",
    "handlerId": "product-center:green-draft:at06:tc-item-std-046",
    "bindingFingerprint": "fa126b1f6dd0304ce090f706dda4f8d87816fb6144bd36910696ab443c0a606b",
    "implementationFingerprint": "5967bb7f95556a9775c7c163d540dd7f7576f60cb511116657eec1e34eb14f12",
    "assertionIds": [
      "TC-ITEM-STD-046:expectation-1",
      "TC-ITEM-STD-046:expectation-2",
      "TC-ITEM-STD-046:expectation-3"
    ],
    "businessRule": {
      "businessRuleId": "BR-FMT-002",
      "businessRuleFingerprint": "7673cffbf649ec625d1d3fc24cb6068e6f1a14ebf3d55b608558d21c4bdb0c61",
      "businessRuleAssertionIdsRequired": [
        "br-fmt-002:canonical-outcome-1",
        "br-fmt-002:canonical-outcome-2",
        "br-fmt-002:canonical-outcome-3",
        "br-fmt-002:canonical-outcome-4",
        "br-fmt-002:canonical-outcome-5"
      ],
      "businessRuleAssertionIdsObserved": [
        "br-fmt-002:canonical-outcome-1",
        "br-fmt-002:canonical-outcome-2",
        "br-fmt-002:canonical-outcome-3",
        "br-fmt-002:canonical-outcome-4",
        "br-fmt-002:canonical-outcome-5"
      ],
      "businessRuleUiEvidenceIds": [
        "TC-ITEM-STD-046-runtime-evidence"
      ],
      "businessRuleApiEvidenceIds": [],
      "businessRuleDownstreamEvidenceIds": [],
      "businessRuleCleanup": {
        "required": false,
        "apiZeroResidue": false,
        "uiZeroResidue": false
      },
      "observedStatement": "助记码、规格值、设备编码最长 20 字符"
    },
    "semanticCaseFingerprint": "cd83b0bd8c99f19caa6434cec933c17a5c526303cb6b7a3024f0b22fa3bd3a6a"
  },
  {
    "caseId": "TC-ITEM-STD-047",
    "title": "多规格商品选择已有规格组后创建成功",
    "irConverted": true,
    "reviewDecision": "approved",
    "automationClassification": "blocked",
    "recipeId": "product-center:item-p0-wave-c:TC-ITEM-STD-047",
    "recipeInventory": {
      "any": 1,
      "enabled": 1,
      "semanticComplete": 0,
      "files": [
        "contracts/product-center/recipes/product-center-item-p0-wave-c-recipes.json"
      ]
    },
    "blockingReasons": [
      "ASSERTION_CONTRACT_REQUIRED",
      "RUNTIME_EVIDENCE_REQUIRED"
    ],
    "family": "standard",
    "action": "existing-spec-group",
    "runtimeReadiness": "ready",
    "runtimeStatus": "runtime-passed",
    "handlerId": "product-center:item-p0-wave-c:TC-ITEM-STD-047",
    "bindingFingerprint": "fa126b1f6dd0304ce090f706dda4f8d87816fb6144bd36910696ab443c0a606b",
    "implementationFingerprint": "5967bb7f95556a9775c7c163d540dd7f7576f60cb511116657eec1e34eb14f12",
    "assertionIds": [
      "TC-ITEM-STD-047:expectation-1",
      "TC-ITEM-STD-047:expectation-2"
    ],
    "semanticCaseFingerprint": "5ea7151075882b2cd06f6685b4010643810fcc96573f9da8dc83e8f273625bb8"
  },
  {
    "caseId": "TC-ITEM-STD-048",
    "title": "多规格商品点击去创建可跳转规格组新增页",
    "irConverted": true,
    "reviewDecision": "approved",
    "automationClassification": "blocked",
    "recipeId": "product-center:green-draft:at09:tc-item-std-048",
    "recipeInventory": {
      "any": 1,
      "enabled": 1,
      "semanticComplete": 0,
      "files": [
        "contracts/product-center/recipes/green-drafts/product-center-item-green-binding-draft-recipes.json"
      ]
    },
    "blockingReasons": [
      "ASSERTION_CONTRACT_REQUIRED",
      "RUNTIME_EVIDENCE_REQUIRED"
    ],
    "family": "standard",
    "action": "spec-group-navigation",
    "runtimeReadiness": "ready",
    "runtimeStatus": "runtime-passed",
    "handlerId": "product-center:green-draft:at09:tc-item-std-048",
    "bindingFingerprint": "fa126b1f6dd0304ce090f706dda4f8d87816fb6144bd36910696ab443c0a606b",
    "implementationFingerprint": "5967bb7f95556a9775c7c163d540dd7f7576f60cb511116657eec1e34eb14f12",
    "assertionIds": [
      "TC-ITEM-STD-048:expectation-2"
    ],
    "semanticCaseFingerprint": "28196ae289a223891b530c9ab819ed9b0c50fb59f44b28dc91146e85fa237f4e"
  },
  {
    "caseId": "TC-ITEM-STD-049",
    "title": "选择多规格后是否称重商品置灰不可选",
    "irConverted": true,
    "reviewDecision": "approved",
    "automationClassification": "blocked",
    "recipeId": "product-center:green-draft:at10:tc-item-std-049",
    "recipeInventory": {
      "any": 1,
      "enabled": 1,
      "semanticComplete": 0,
      "files": [
        "contracts/product-center/recipes/green-drafts/product-center-item-green-binding-draft-recipes.json"
      ]
    },
    "blockingReasons": [
      "ASSERTION_CONTRACT_REQUIRED",
      "RUNTIME_EVIDENCE_REQUIRED"
    ],
    "family": "standard",
    "action": "multi-weight-disabled",
    "runtimeReadiness": "ready",
    "runtimeStatus": "runtime-passed",
    "handlerId": "product-center:green-draft:at10:tc-item-std-049",
    "bindingFingerprint": "fa126b1f6dd0304ce090f706dda4f8d87816fb6144bd36910696ab443c0a606b",
    "implementationFingerprint": "5967bb7f95556a9775c7c163d540dd7f7576f60cb511116657eec1e34eb14f12",
    "assertionIds": [
      "TC-ITEM-STD-049:expectation-2"
    ],
    "semanticCaseFingerprint": "949a4acbc277634f666c6845f1b202fa474854d5e608ecd6dd84cfb20078dff5"
  },
  {
    "caseId": "TC-ITEM-STD-050",
    "title": "单规格商品包装费合法输入时保存成功",
    "irConverted": true,
    "reviewDecision": "approved",
    "automationClassification": "blocked",
    "recipeId": "product-center:green-draft:at09:tc-item-std-050",
    "recipeInventory": {
      "any": 1,
      "enabled": 1,
      "semanticComplete": 0,
      "files": [
        "contracts/product-center/recipes/green-drafts/product-center-item-green-binding-draft-recipes.json"
      ]
    },
    "blockingReasons": [
      "ASSERTION_CONTRACT_REQUIRED",
      "RUNTIME_EVIDENCE_REQUIRED"
    ],
    "family": "standard",
    "action": "packaging-cost",
    "runtimeReadiness": "ready",
    "runtimeStatus": "runtime-passed",
    "handlerId": "product-center:green-draft:at09:tc-item-std-050",
    "bindingFingerprint": "fa126b1f6dd0304ce090f706dda4f8d87816fb6144bd36910696ab443c0a606b",
    "implementationFingerprint": "5967bb7f95556a9775c7c163d540dd7f7576f60cb511116657eec1e34eb14f12",
    "assertionIds": [
      "TC-ITEM-STD-050:expectation-1",
      "TC-ITEM-STD-050:expectation-2"
    ],
    "businessRule": {
      "businessRuleId": "BR-FMT-005",
      "businessRuleFingerprint": "68a2895221c4d12b84412f80c9371e3051c97fdd50d2e909bb0a00d39ce4f89e",
      "businessRuleAssertionIdsRequired": [
        "br-fmt-005:canonical-outcome-1",
        "br-fmt-005:canonical-outcome-10",
        "br-fmt-005:canonical-outcome-11",
        "br-fmt-005:canonical-outcome-12",
        "br-fmt-005:canonical-outcome-13",
        "br-fmt-005:canonical-outcome-14",
        "br-fmt-005:canonical-outcome-2",
        "br-fmt-005:canonical-outcome-3",
        "br-fmt-005:canonical-outcome-4",
        "br-fmt-005:canonical-outcome-5",
        "br-fmt-005:canonical-outcome-6",
        "br-fmt-005:canonical-outcome-7",
        "br-fmt-005:canonical-outcome-8",
        "br-fmt-005:canonical-outcome-9"
      ],
      "businessRuleAssertionIdsObserved": [
        "br-fmt-005:canonical-outcome-1",
        "br-fmt-005:canonical-outcome-10",
        "br-fmt-005:canonical-outcome-11",
        "br-fmt-005:canonical-outcome-12",
        "br-fmt-005:canonical-outcome-13",
        "br-fmt-005:canonical-outcome-14",
        "br-fmt-005:canonical-outcome-2",
        "br-fmt-005:canonical-outcome-3",
        "br-fmt-005:canonical-outcome-4",
        "br-fmt-005:canonical-outcome-5",
        "br-fmt-005:canonical-outcome-6",
        "br-fmt-005:canonical-outcome-7",
        "br-fmt-005:canonical-outcome-8",
        "br-fmt-005:canonical-outcome-9"
      ],
      "businessRuleUiEvidenceIds": [
        "TC-ITEM-STD-050-runtime-evidence"
      ],
      "businessRuleApiEvidenceIds": [],
      "businessRuleDownstreamEvidenceIds": [],
      "businessRuleCleanup": {
        "required": false,
        "apiZeroResidue": false,
        "uiZeroResidue": false
      },
      "observedStatement": "价格 0.00 可保存并展示 2 位小数；超过 2 位小数按四舍五入保存，API 与重新进入页面回显舍入后的金额"
    },
    "semanticCaseFingerprint": "233790865b70cec105137495cd234466797df5d41e4be627a8148858b48be43e"
  },
  {
    "caseId": "TC-ITEM-STD-051",
    "title": "超限价格保存成功并按 999999.99 展示",
    "irConverted": true,
    "reviewDecision": "approved",
    "automationClassification": "blocked",
    "recipeId": "product-center:green-draft:at10:tc-item-std-051",
    "recipeInventory": {
      "any": 1,
      "enabled": 1,
      "semanticComplete": 0,
      "files": [
        "contracts/product-center/recipes/green-drafts/product-center-item-green-binding-draft-recipes.json"
      ]
    },
    "blockingReasons": [
      "ASSERTION_CONTRACT_REQUIRED",
      "RUNTIME_EVIDENCE_REQUIRED"
    ],
    "family": "standard",
    "action": "price-over-max",
    "runtimeReadiness": "ready",
    "runtimeStatus": "runtime-passed",
    "handlerId": "product-center:green-draft:at10:tc-item-std-051",
    "bindingFingerprint": "fa126b1f6dd0304ce090f706dda4f8d87816fb6144bd36910696ab443c0a606b",
    "implementationFingerprint": "5967bb7f95556a9775c7c163d540dd7f7576f60cb511116657eec1e34eb14f12",
    "assertionIds": [
      "TC-ITEM-STD-051:expectation-1"
    ],
    "semanticCaseFingerprint": "ef4c4cf799ff39c6a6cfc357ff884945b7244dc044fa1ccd44a802fef8b5533e"
  },
  {
    "caseId": "TC-ITEM-STD-052",
    "title": "从图片库选择主图后创建成功",
    "irConverted": true,
    "reviewDecision": "approved",
    "automationClassification": "blocked",
    "recipeId": "product-center:green-draft:at05:tc-item-std-052",
    "recipeInventory": {
      "any": 1,
      "enabled": 1,
      "semanticComplete": 0,
      "files": [
        "contracts/product-center/recipes/green-drafts/product-center-item-green-binding-draft-recipes.json"
      ]
    },
    "blockingReasons": [
      "ASSERTION_CONTRACT_REQUIRED",
      "RUNTIME_EVIDENCE_REQUIRED"
    ],
    "family": "standard",
    "action": "library-image",
    "runtimeReadiness": "ready",
    "runtimeStatus": "runtime-passed",
    "handlerId": "product-center:green-draft:at05:tc-item-std-052",
    "bindingFingerprint": "fa126b1f6dd0304ce090f706dda4f8d87816fb6144bd36910696ab443c0a606b",
    "implementationFingerprint": "5967bb7f95556a9775c7c163d540dd7f7576f60cb511116657eec1e34eb14f12",
    "assertionIds": [
      "TC-ITEM-STD-052:expectation-1",
      "TC-ITEM-STD-052:expectation-2",
      "TC-ITEM-STD-052:expectation-3"
    ],
    "semanticCaseFingerprint": "b59e9797a20465995fb8fa0e64ffffeb8417a7472472a72897cc26bab60d6ca9"
  },
  {
    "caseId": "TC-ITEM-STD-053",
    "title": "本地上传主图后创建成功",
    "irConverted": true,
    "reviewDecision": "approved",
    "automationClassification": "blocked",
    "recipeId": "product-center:green-draft:at05:tc-item-std-053",
    "recipeInventory": {
      "any": 1,
      "enabled": 1,
      "semanticComplete": 0,
      "files": [
        "contracts/product-center/recipes/green-drafts/product-center-item-green-binding-draft-recipes.json"
      ]
    },
    "blockingReasons": [
      "ASSERTION_CONTRACT_REQUIRED",
      "RUNTIME_EVIDENCE_REQUIRED"
    ],
    "family": "standard",
    "action": "local-image",
    "runtimeReadiness": "ready",
    "runtimeStatus": "runtime-passed",
    "handlerId": "product-center:green-draft:at05:tc-item-std-053",
    "bindingFingerprint": "fa126b1f6dd0304ce090f706dda4f8d87816fb6144bd36910696ab443c0a606b",
    "implementationFingerprint": "5967bb7f95556a9775c7c163d540dd7f7576f60cb511116657eec1e34eb14f12",
    "assertionIds": [
      "TC-ITEM-STD-053:expectation-1",
      "TC-ITEM-STD-053:expectation-2",
      "TC-ITEM-STD-053:expectation-3"
    ],
    "semanticCaseFingerprint": "3234dc22a166e917850cd86d11fa5b4b954275176238574cecf2c12e808f85b2"
  },
  {
    "caseId": "TC-ITEM-STD-054",
    "title": "详情图超过 10 张时不可继续添加",
    "irConverted": true,
    "reviewDecision": "approved",
    "automationClassification": "blocked",
    "recipeId": "product-center:green-draft:at17:tc-item-std-054",
    "recipeInventory": {
      "any": 1,
      "enabled": 1,
      "semanticComplete": 0,
      "files": [
        "contracts/product-center/recipes/green-drafts/product-center-item-green-binding-draft-recipes.json"
      ]
    },
    "blockingReasons": [
      "ASSERTION_CONTRACT_REQUIRED",
      "RUNTIME_EVIDENCE_REQUIRED"
    ],
    "family": "standard",
    "action": "contract-resolution",
    "runtimeReadiness": "ready",
    "runtimeStatus": "runtime-passed",
    "handlerId": "product-center:green-draft:at17:tc-item-std-054",
    "bindingFingerprint": "fa126b1f6dd0304ce090f706dda4f8d87816fb6144bd36910696ab443c0a606b",
    "implementationFingerprint": "5967bb7f95556a9775c7c163d540dd7f7576f60cb511116657eec1e34eb14f12",
    "assertionIds": [
      "TC-ITEM-STD-054:expectation-1",
      "TC-ITEM-STD-054:expectation-2"
    ],
    "semanticCaseFingerprint": "0063f8d8b425caa86327734e4526c00171c64c57986999a2688f3d9f55dde5d4"
  },
  {
    "caseId": "TC-ITEM-STD-055",
    "title": "标准商品选择多个描述标签后保存成功",
    "irConverted": true,
    "reviewDecision": "approved",
    "automationClassification": "blocked",
    "recipeId": "product-center:green-draft:at08:tc-item-std-055",
    "recipeInventory": {
      "any": 1,
      "enabled": 1,
      "semanticComplete": 0,
      "files": [
        "contracts/product-center/recipes/green-drafts/product-center-item-green-binding-draft-recipes.json"
      ]
    },
    "blockingReasons": [
      "ASSERTION_CONTRACT_REQUIRED",
      "RUNTIME_EVIDENCE_REQUIRED"
    ],
    "family": "standard",
    "action": "contract-resolution",
    "runtimeReadiness": "ready",
    "runtimeStatus": "runtime-passed",
    "handlerId": "product-center:green-draft:at08:tc-item-std-055",
    "bindingFingerprint": "fa126b1f6dd0304ce090f706dda4f8d87816fb6144bd36910696ab443c0a606b",
    "implementationFingerprint": "5967bb7f95556a9775c7c163d540dd7f7576f60cb511116657eec1e34eb14f12",
    "assertionIds": [
      "TC-ITEM-STD-055:expectation-1",
      "TC-ITEM-STD-055:expectation-2"
    ],
    "semanticCaseFingerprint": "f31f7478d529e94d70ed7c2b67f4a495c487aedde00d1bea42b03159b5f693a4"
  },
  {
    "caseId": "TC-ITEM-STD-056",
    "title": "原料过敏原营养成分保存后编辑回显",
    "irConverted": true,
    "reviewDecision": "approved",
    "automationClassification": "blocked",
    "recipeId": "product-center:green-draft:at08:tc-item-std-056",
    "recipeInventory": {
      "any": 1,
      "enabled": 1,
      "semanticComplete": 0,
      "files": [
        "contracts/product-center/recipes/green-drafts/product-center-item-green-binding-draft-recipes.json"
      ]
    },
    "blockingReasons": [
      "ASSERTION_CONTRACT_REQUIRED",
      "RUNTIME_EVIDENCE_REQUIRED"
    ],
    "family": "standard",
    "action": "contract-resolution",
    "runtimeReadiness": "ready",
    "runtimeStatus": "runtime-passed",
    "handlerId": "product-center:green-draft:at08:tc-item-std-056",
    "bindingFingerprint": "fa126b1f6dd0304ce090f706dda4f8d87816fb6144bd36910696ab443c0a606b",
    "implementationFingerprint": "5967bb7f95556a9775c7c163d540dd7f7576f60cb511116657eec1e34eb14f12",
    "assertionIds": [
      "TC-ITEM-STD-056:expectation-1"
    ],
    "semanticCaseFingerprint": "5ab7a0bcb4ec51e94a7f4f4bdc7c711c15fe986ee7d6a847a1247c7b9f43313f"
  },
  {
    "caseId": "TC-ITEM-STD-057",
    "title": "标准商品引用口味组整组后保存成功",
    "irConverted": true,
    "reviewDecision": "approved",
    "automationClassification": "blocked",
    "recipeId": "product-center:item-p0-wave-c:TC-ITEM-STD-057",
    "recipeInventory": {
      "any": 1,
      "enabled": 1,
      "semanticComplete": 0,
      "files": [
        "contracts/product-center/recipes/product-center-item-p0-wave-c-recipes.json"
      ]
    },
    "blockingReasons": [
      "ASSERTION_CONTRACT_REQUIRED",
      "RUNTIME_EVIDENCE_REQUIRED"
    ],
    "family": "standard",
    "action": "contract-resolution",
    "runtimeReadiness": "ready",
    "runtimeStatus": "runtime-passed",
    "handlerId": "product-center:item-p0-wave-c:TC-ITEM-STD-057",
    "bindingFingerprint": "fa126b1f6dd0304ce090f706dda4f8d87816fb6144bd36910696ab443c0a606b",
    "implementationFingerprint": "5967bb7f95556a9775c7c163d540dd7f7576f60cb511116657eec1e34eb14f12",
    "assertionIds": [
      "TC-ITEM-STD-057:expectation-1",
      "TC-ITEM-STD-057:expectation-2"
    ],
    "semanticCaseFingerprint": "7b75bb412abbf69826d7ea68faac28935ed1d607f8ea490103f7440a5861e01d"
  },
  {
    "caseId": "TC-ITEM-STD-058",
    "title": "标准商品引用做法组与加料组整组后保存成功",
    "irConverted": true,
    "reviewDecision": "approved",
    "automationClassification": "blocked",
    "recipeId": "product-center:item-p0-wave-c:TC-ITEM-STD-058",
    "recipeInventory": {
      "any": 1,
      "enabled": 1,
      "semanticComplete": 0,
      "files": [
        "contracts/product-center/recipes/product-center-item-p0-wave-c-recipes.json"
      ]
    },
    "blockingReasons": [
      "ASSERTION_CONTRACT_REQUIRED",
      "RUNTIME_EVIDENCE_REQUIRED"
    ],
    "family": "standard",
    "action": "contract-resolution",
    "runtimeReadiness": "ready",
    "runtimeStatus": "runtime-passed",
    "handlerId": "product-center:item-p0-wave-c:TC-ITEM-STD-058",
    "bindingFingerprint": "fa126b1f6dd0304ce090f706dda4f8d87816fb6144bd36910696ab443c0a606b",
    "implementationFingerprint": "5967bb7f95556a9775c7c163d540dd7f7576f60cb511116657eec1e34eb14f12",
    "assertionIds": [
      "TC-ITEM-STD-058:expectation-1",
      "TC-ITEM-STD-058:expectation-2"
    ],
    "semanticCaseFingerprint": "dc2988c34c71b8f7473ada506e4a66fca3f434b32737eeef09bccdf6f8ca26a7"
  },
  {
    "caseId": "TC-ITEM-STD-059",
    "title": "商品内不可单独添加组子项仅可移除已引用子项",
    "irConverted": true,
    "reviewDecision": "approved",
    "automationClassification": "blocked",
    "recipeId": "product-center:green-draft:at17:tc-item-std-059",
    "recipeInventory": {
      "any": 1,
      "enabled": 1,
      "semanticComplete": 0,
      "files": [
        "contracts/product-center/recipes/green-drafts/product-center-item-green-binding-draft-recipes.json"
      ]
    },
    "blockingReasons": [
      "ASSERTION_CONTRACT_REQUIRED",
      "RUNTIME_EVIDENCE_REQUIRED"
    ],
    "family": "standard",
    "action": "contract-resolution",
    "runtimeReadiness": "ready",
    "runtimeStatus": "runtime-passed",
    "handlerId": "product-center:green-draft:at17:tc-item-std-059",
    "bindingFingerprint": "fa126b1f6dd0304ce090f706dda4f8d87816fb6144bd36910696ab443c0a606b",
    "implementationFingerprint": "5967bb7f95556a9775c7c163d540dd7f7576f60cb511116657eec1e34eb14f12",
    "assertionIds": [
      "TC-ITEM-STD-059:expectation-1",
      "TC-ITEM-STD-059:expectation-2"
    ],
    "semanticCaseFingerprint": "2ba361e72d59724f8bfae0096a85bf5437d4d57731160467d8306928f59b53d4"
  },
  {
    "caseId": "TC-ITEM-STD-061",
    "title": "配置互斥规则后冲突项在编辑页置灰不可同时选中",
    "irConverted": true,
    "reviewDecision": "approved",
    "automationClassification": "blocked",
    "recipeId": "product-center:yellow-probe:at02:tc-item-std-061",
    "recipeInventory": {
      "any": 1,
      "enabled": 0,
      "semanticComplete": 0,
      "files": [
        "contracts/product-center/recipes/yellow-probes/product-center-item-yellow-representative-probe-recipes.json"
      ]
    },
    "blockingReasons": [
      "RECIPE_GENERATION_DISABLED",
      "ASSERTION_CONTRACT_REQUIRED",
      "RUNTIME_EVIDENCE_REQUIRED"
    ],
    "family": "standard",
    "action": "contract-resolution",
    "runtimeReadiness": "ready",
    "runtimeStatus": "runtime-passed",
    "handlerId": "product-center:yellow-probe:at02:tc-item-std-061",
    "bindingFingerprint": "fa126b1f6dd0304ce090f706dda4f8d87816fb6144bd36910696ab443c0a606b",
    "implementationFingerprint": "5967bb7f95556a9775c7c163d540dd7f7576f60cb511116657eec1e34eb14f12",
    "assertionIds": [
      "TC-ITEM-STD-061:expectation-1",
      "TC-ITEM-STD-061:expectation-2"
    ],
    "semanticCaseFingerprint": "abe097ff18fb9a3d9e4b68717590d755db6b757a0d82e898592b88d4970127a0"
  },
  {
    "caseId": "TC-ITEM-STD-063",
    "title": "商品列表分页支持切换 10/20/50/100 条",
    "irConverted": true,
    "reviewDecision": "approved",
    "automationClassification": "blocked",
    "recipeId": "product-center:green-draft:at19:tc-item-std-063",
    "recipeInventory": {
      "any": 1,
      "enabled": 1,
      "semanticComplete": 0,
      "files": [
        "contracts/product-center/recipes/green-drafts/product-center-item-green-binding-draft-recipes.json"
      ]
    },
    "blockingReasons": [
      "ASSERTION_CONTRACT_REQUIRED",
      "RUNTIME_EVIDENCE_REQUIRED"
    ],
    "family": "standard",
    "action": "list-evidence",
    "runtimeReadiness": "ready",
    "runtimeStatus": "runtime-passed",
    "handlerId": "product-center:green-draft:at19:tc-item-std-063",
    "bindingFingerprint": "fa126b1f6dd0304ce090f706dda4f8d87816fb6144bd36910696ab443c0a606b",
    "implementationFingerprint": "5967bb7f95556a9775c7c163d540dd7f7576f60cb511116657eec1e34eb14f12",
    "assertionIds": [
      "TC-ITEM-STD-063:expectation-1",
      "TC-ITEM-STD-063:expectation-2"
    ],
    "semanticCaseFingerprint": "91c3e8992a3bd1477d42b02292e6804fb9434b79ed87123341c189da907d50b7"
  },
  {
    "caseId": "TC-ITEM-STD-064",
    "title": "商品列表按商品名称第二语言模糊查询成功",
    "irConverted": true,
    "reviewDecision": "approved",
    "automationClassification": "blocked",
    "recipeId": "product-center:green-draft:at03:tc-item-std-064",
    "recipeInventory": {
      "any": 1,
      "enabled": 1,
      "semanticComplete": 0,
      "files": [
        "contracts/product-center/recipes/green-drafts/product-center-item-green-binding-draft-recipes.json"
      ]
    },
    "blockingReasons": [
      "ASSERTION_CONTRACT_REQUIRED",
      "RUNTIME_EVIDENCE_REQUIRED"
    ],
    "family": "standard",
    "action": "second-language-search",
    "runtimeReadiness": "ready",
    "runtimeStatus": "runtime-passed",
    "handlerId": "product-center:green-draft:at03:tc-item-std-064",
    "bindingFingerprint": "fa126b1f6dd0304ce090f706dda4f8d87816fb6144bd36910696ab443c0a606b",
    "implementationFingerprint": "5967bb7f95556a9775c7c163d540dd7f7576f60cb511116657eec1e34eb14f12",
    "assertionIds": [
      "TC-ITEM-STD-064:expectation-1",
      "TC-ITEM-STD-064:expectation-2"
    ],
    "businessRule": {
      "businessRuleId": "BR-FMT-009",
      "businessRuleFingerprint": "7a0672cb003cac8cfdf537cfdf0e5233ad5acbedf28c14561f6d763608da99d2",
      "businessRuleAssertionIdsRequired": [
        "br-fmt-009:canonical-outcome-1",
        "br-fmt-009:canonical-outcome-10",
        "br-fmt-009:canonical-outcome-11",
        "br-fmt-009:canonical-outcome-12",
        "br-fmt-009:canonical-outcome-13",
        "br-fmt-009:canonical-outcome-2",
        "br-fmt-009:canonical-outcome-3",
        "br-fmt-009:canonical-outcome-4",
        "br-fmt-009:canonical-outcome-5",
        "br-fmt-009:canonical-outcome-6",
        "br-fmt-009:canonical-outcome-7",
        "br-fmt-009:canonical-outcome-8",
        "br-fmt-009:canonical-outcome-9"
      ],
      "businessRuleAssertionIdsObserved": [
        "br-fmt-009:canonical-outcome-1",
        "br-fmt-009:canonical-outcome-10",
        "br-fmt-009:canonical-outcome-11",
        "br-fmt-009:canonical-outcome-12",
        "br-fmt-009:canonical-outcome-13",
        "br-fmt-009:canonical-outcome-2",
        "br-fmt-009:canonical-outcome-3",
        "br-fmt-009:canonical-outcome-4",
        "br-fmt-009:canonical-outcome-5",
        "br-fmt-009:canonical-outcome-6",
        "br-fmt-009:canonical-outcome-7",
        "br-fmt-009:canonical-outcome-8",
        "br-fmt-009:canonical-outcome-9"
      ],
      "businessRuleUiEvidenceIds": [
        "TC-ITEM-STD-064-runtime-evidence"
      ],
      "businessRuleApiEvidenceIds": [],
      "businessRuleDownstreamEvidenceIds": [],
      "businessRuleCleanup": {
        "required": false,
        "apiZeroResidue": false,
        "uiZeroResidue": false
      },
      "observedStatement": "查询、筛选或重置后列表回到第 1 页；筛选项变更自动刷新；重置清空条件并恢复全量结果"
    },
    "semanticCaseFingerprint": "cc9839f72f54105bbdbd39f85a1bf37f4b7fc20bfcf7148b9daf39042d0623ed"
  },
  {
    "caseId": "TC-ITEM-STD-065",
    "title": "列表启用商品操作成功",
    "irConverted": true,
    "reviewDecision": "approved",
    "automationClassification": "blocked",
    "recipeId": "product-center:green-draft:at21:tc-item-std-065",
    "recipeInventory": {
      "any": 1,
      "enabled": 1,
      "semanticComplete": 0,
      "files": [
        "contracts/product-center/recipes/green-drafts/product-center-item-green-binding-draft-recipes.json"
      ]
    },
    "blockingReasons": [
      "ASSERTION_CONTRACT_REQUIRED",
      "RUNTIME_EVIDENCE_REQUIRED"
    ],
    "family": "standard",
    "action": "lifecycle",
    "runtimeReadiness": "ready",
    "runtimeStatus": "runtime-passed",
    "handlerId": "product-center:green-draft:at21:tc-item-std-065",
    "bindingFingerprint": "fa126b1f6dd0304ce090f706dda4f8d87816fb6144bd36910696ab443c0a606b",
    "implementationFingerprint": "5967bb7f95556a9775c7c163d540dd7f7576f60cb511116657eec1e34eb14f12",
    "assertionIds": [
      "TC-ITEM-STD-065:expectation-1",
      "TC-ITEM-STD-065:expectation-2"
    ],
    "semanticCaseFingerprint": "f9d1181798b462a0c2f822a1480cc11b0761505379e93c0f29dd81442506c41c"
  },
  {
    "caseId": "TC-ITEM-STD-066",
    "title": "列表停用未被菜单引用的商品操作成功",
    "irConverted": true,
    "reviewDecision": "approved",
    "automationClassification": "blocked",
    "recipeId": "product-center:item-p0-wave-b:TC-ITEM-STD-066",
    "recipeInventory": {
      "any": 1,
      "enabled": 1,
      "semanticComplete": 0,
      "files": [
        "contracts/product-center/recipes/product-center-item-p0-wave-b-recipes.json"
      ]
    },
    "blockingReasons": [
      "ASSERTION_CONTRACT_REQUIRED",
      "RUNTIME_EVIDENCE_REQUIRED"
    ],
    "family": "standard",
    "action": "lifecycle",
    "runtimeReadiness": "ready",
    "runtimeStatus": "runtime-passed",
    "handlerId": "product-center:item-p0-wave-b:TC-ITEM-STD-066",
    "bindingFingerprint": "fa126b1f6dd0304ce090f706dda4f8d87816fb6144bd36910696ab443c0a606b",
    "implementationFingerprint": "5967bb7f95556a9775c7c163d540dd7f7576f60cb511116657eec1e34eb14f12",
    "assertionIds": [
      "TC-ITEM-STD-066:expectation-1",
      "TC-ITEM-STD-066:expectation-2"
    ],
    "semanticCaseFingerprint": "de98963f1deffadaf650e093bca97f26051a675c531997fe87d22632f7364b2e"
  },
  {
    "caseId": "TC-ITEM-STD-067",
    "title": "菜单引用中的标准商品不可停用",
    "irConverted": true,
    "reviewDecision": "approved",
    "automationClassification": "blocked",
    "recipeId": null,
    "recipeInventory": {
      "any": 0,
      "enabled": 0,
      "semanticComplete": 0,
      "files": []
    },
    "blockingReasons": [
      "RECIPE_REQUIRED"
    ],
    "family": "standard",
    "action": "lifecycle",
    "runtimeReadiness": "ready",
    "runtimeStatus": "deferred",
    "handlerId": "item-216:TC-ITEM-STD-067",
    "bindingFingerprint": "fa126b1f6dd0304ce090f706dda4f8d87816fb6144bd36910696ab443c0a606b",
    "implementationFingerprint": "5967bb7f95556a9775c7c163d540dd7f7576f60cb511116657eec1e34eb14f12",
    "assertionIds": [
      "TC-ITEM-STD-067:expectation-1",
      "TC-ITEM-STD-067:expectation-2",
      "TC-ITEM-STD-067:expectation-3"
    ],
    "semanticCaseFingerprint": "1cd344d474687bc27a2ec937ebd4bce4f64927d3ce2de03bbf2cbd2b63e9a8fc"
  },
  {
    "caseId": "TC-ITEM-STD-068",
    "title": "无引用关系的标准商品删除成功",
    "irConverted": true,
    "reviewDecision": "approved",
    "automationClassification": "blocked",
    "recipeId": "product-center:item-p0-wave-b:TC-ITEM-STD-068",
    "recipeInventory": {
      "any": 1,
      "enabled": 1,
      "semanticComplete": 0,
      "files": [
        "contracts/product-center/recipes/product-center-item-p0-wave-b-recipes.json"
      ]
    },
    "blockingReasons": [
      "ASSERTION_CONTRACT_REQUIRED",
      "RUNTIME_EVIDENCE_REQUIRED"
    ],
    "family": "standard",
    "action": "delete-lifecycle",
    "runtimeReadiness": "ready",
    "runtimeStatus": "runtime-passed",
    "handlerId": "product-center:item-p0-wave-b:TC-ITEM-STD-068",
    "bindingFingerprint": "fa126b1f6dd0304ce090f706dda4f8d87816fb6144bd36910696ab443c0a606b",
    "implementationFingerprint": "5967bb7f95556a9775c7c163d540dd7f7576f60cb511116657eec1e34eb14f12",
    "assertionIds": [
      "TC-ITEM-STD-068:expectation-1",
      "TC-ITEM-STD-068:expectation-2",
      "TC-ITEM-STD-068:expectation-3"
    ],
    "semanticCaseFingerprint": "a1b4c7776784c9232ce6fed9a6502b623570bc987a8d44261f083abc26f591ac"
  },
  {
    "caseId": "TC-ITEM-STD-069",
    "title": "被套餐组引用的标准商品不可删除",
    "irConverted": true,
    "reviewDecision": "approved",
    "automationClassification": "blocked",
    "recipeId": "product-center:item-p0-wave-b:TC-ITEM-STD-069",
    "recipeInventory": {
      "any": 1,
      "enabled": 1,
      "semanticComplete": 0,
      "files": [
        "contracts/product-center/recipes/product-center-item-p0-wave-b-recipes.json"
      ]
    },
    "blockingReasons": [
      "ASSERTION_CONTRACT_REQUIRED",
      "RUNTIME_EVIDENCE_REQUIRED"
    ],
    "family": "standard",
    "action": "contract-resolution",
    "runtimeReadiness": "ready",
    "runtimeStatus": "runtime-passed",
    "handlerId": "product-center:item-p0-wave-b:TC-ITEM-STD-069",
    "bindingFingerprint": "fa126b1f6dd0304ce090f706dda4f8d87816fb6144bd36910696ab443c0a606b",
    "implementationFingerprint": "5967bb7f95556a9775c7c163d540dd7f7576f60cb511116657eec1e34eb14f12",
    "assertionIds": [
      "TC-ITEM-STD-069:expectation-1",
      "TC-ITEM-STD-069:expectation-2"
    ],
    "semanticCaseFingerprint": "837161cbf22b89d7649629aec6cd641818110776a524ae8c33cd60dbad55cdc2"
  },
  {
    "caseId": "TC-ITEM-STD-070",
    "title": "被菜单引用的标准商品不可删除",
    "irConverted": true,
    "reviewDecision": "approved",
    "automationClassification": "blocked",
    "recipeId": "product-center:item-p0-wave-b:TC-ITEM-STD-070",
    "recipeInventory": {
      "any": 1,
      "enabled": 1,
      "semanticComplete": 0,
      "files": [
        "contracts/product-center/recipes/product-center-item-p0-wave-b-recipes.json"
      ]
    },
    "blockingReasons": [
      "ASSERTION_CONTRACT_REQUIRED",
      "RUNTIME_EVIDENCE_REQUIRED"
    ],
    "family": "standard",
    "action": "contract-resolution",
    "runtimeReadiness": "environment-blocked",
    "runtimeStatus": "deferred",
    "handlerId": "product-center:item-p0-wave-b:TC-ITEM-STD-070",
    "bindingFingerprint": "fa126b1f6dd0304ce090f706dda4f8d87816fb6144bd36910696ab443c0a606b",
    "implementationFingerprint": "5967bb7f95556a9775c7c163d540dd7f7576f60cb511116657eec1e34eb14f12",
    "assertionIds": [
      "TC-ITEM-STD-070:expectation-1",
      "TC-ITEM-STD-070:expectation-2"
    ],
    "semanticCaseFingerprint": "5d3cede71a82fed8ff2c99d9c123e7bdab859559caa5e566c51bf37ae0130a07"
  },
  {
    "caseId": "TC-ITEM-STD-071",
    "title": "标准商品列表主图不支持点击查看大图",
    "irConverted": true,
    "reviewDecision": "approved",
    "automationClassification": "blocked",
    "recipeId": "product-center:yellow-probe:at18:tc-item-std-071",
    "recipeInventory": {
      "any": 1,
      "enabled": 0,
      "semanticComplete": 0,
      "files": [
        "contracts/product-center/recipes/yellow-probes/product-center-item-yellow-representative-probe-recipes.json"
      ]
    },
    "blockingReasons": [
      "RECIPE_GENERATION_DISABLED",
      "ASSERTION_CONTRACT_REQUIRED",
      "RUNTIME_EVIDENCE_REQUIRED"
    ],
    "family": "standard",
    "action": "image-preview",
    "runtimeReadiness": "ready",
    "runtimeStatus": "runtime-passed",
    "handlerId": "product-center:yellow-probe:at18:tc-item-std-071",
    "bindingFingerprint": "fa126b1f6dd0304ce090f706dda4f8d87816fb6144bd36910696ab443c0a606b",
    "implementationFingerprint": "5967bb7f95556a9775c7c163d540dd7f7576f60cb511116657eec1e34eb14f12",
    "assertionIds": [
      "TC-ITEM-STD-071:expectation-1"
    ],
    "semanticCaseFingerprint": "21221be7b73e586ec1f17bf16baf8cad76410203e20cc8bd0bbc9d4ce460ae03"
  },
  {
    "caseId": "TC-ITEM-STD-072",
    "title": "商品列表默认展示字段与默认收起字段正确",
    "irConverted": true,
    "reviewDecision": "approved",
    "automationClassification": "blocked",
    "recipeId": "product-center:green-draft:at19:tc-item-std-072",
    "recipeInventory": {
      "any": 1,
      "enabled": 1,
      "semanticComplete": 0,
      "files": [
        "contracts/product-center/recipes/green-drafts/product-center-item-green-binding-draft-recipes.json"
      ]
    },
    "blockingReasons": [
      "ASSERTION_CONTRACT_REQUIRED",
      "RUNTIME_EVIDENCE_REQUIRED"
    ],
    "family": "standard",
    "action": "list-evidence",
    "runtimeReadiness": "ready",
    "runtimeStatus": "runtime-passed",
    "handlerId": "product-center:green-draft:at19:tc-item-std-072",
    "bindingFingerprint": "fa126b1f6dd0304ce090f706dda4f8d87816fb6144bd36910696ab443c0a606b",
    "implementationFingerprint": "5967bb7f95556a9775c7c163d540dd7f7576f60cb511116657eec1e34eb14f12",
    "assertionIds": [
      "TC-ITEM-STD-072:expectation-1",
      "TC-ITEM-STD-072:expectation-2"
    ],
    "semanticCaseFingerprint": "705f5df3f2bd09988cc760281e50690454a00953f14fd5fd5ce9e0d4e159a7f8"
  },
  {
    "caseId": "TC-ITEM-STD-073",
    "title": "商品列表支持还原默认展示列",
    "irConverted": true,
    "reviewDecision": "approved",
    "automationClassification": "blocked",
    "recipeId": "product-center:green-draft:at19:tc-item-std-073",
    "recipeInventory": {
      "any": 1,
      "enabled": 1,
      "semanticComplete": 0,
      "files": [
        "contracts/product-center/recipes/green-drafts/product-center-item-green-binding-draft-recipes.json"
      ]
    },
    "blockingReasons": [
      "ASSERTION_CONTRACT_REQUIRED",
      "RUNTIME_EVIDENCE_REQUIRED"
    ],
    "family": "standard",
    "action": "list-evidence",
    "runtimeReadiness": "ready",
    "runtimeStatus": "runtime-passed",
    "handlerId": "product-center:green-draft:at19:tc-item-std-073",
    "bindingFingerprint": "fa126b1f6dd0304ce090f706dda4f8d87816fb6144bd36910696ab443c0a606b",
    "implementationFingerprint": "5967bb7f95556a9775c7c163d540dd7f7576f60cb511116657eec1e34eb14f12",
    "assertionIds": [
      "TC-ITEM-STD-073:expectation-1",
      "TC-ITEM-STD-073:expectation-2"
    ],
    "semanticCaseFingerprint": "9ceb618472fc1f7f7f3ce0e988ed8679986e78ffa7106c0bfc3bd445e77c5a7e"
  },
  {
    "caseId": "TC-ITEM-STD-074",
    "title": "商品列表展示总商品数量且不展示总金额",
    "irConverted": true,
    "reviewDecision": "approved",
    "automationClassification": "blocked",
    "recipeId": "product-center:yellow-probe:at18:tc-item-std-074",
    "recipeInventory": {
      "any": 1,
      "enabled": 0,
      "semanticComplete": 0,
      "files": [
        "contracts/product-center/recipes/yellow-probes/product-center-item-yellow-representative-probe-recipes.json"
      ]
    },
    "blockingReasons": [
      "RECIPE_GENERATION_DISABLED",
      "ASSERTION_CONTRACT_REQUIRED",
      "RUNTIME_EVIDENCE_REQUIRED"
    ],
    "family": "standard",
    "action": "list-evidence",
    "runtimeReadiness": "ready",
    "runtimeStatus": "runtime-passed",
    "handlerId": "product-center:yellow-probe:at18:tc-item-std-074",
    "bindingFingerprint": "fa126b1f6dd0304ce090f706dda4f8d87816fb6144bd36910696ab443c0a606b",
    "implementationFingerprint": "5967bb7f95556a9775c7c163d540dd7f7576f60cb511116657eec1e34eb14f12",
    "assertionIds": [
      "TC-ITEM-STD-074:expectation-1",
      "TC-ITEM-STD-074:expectation-2"
    ],
    "semanticCaseFingerprint": "b4e8136779d6404ad9df34c3930b18757256cf0b942a9b530104ec32db5cb127"
  },
  {
    "caseId": "TC-ITEM-STD-075",
    "title": "商品列表删除操作展示确认文案",
    "irConverted": true,
    "reviewDecision": "approved",
    "automationClassification": "blocked",
    "recipeId": "product-center:item-p0-wave-b:TC-ITEM-STD-075",
    "recipeInventory": {
      "any": 1,
      "enabled": 1,
      "semanticComplete": 0,
      "files": [
        "contracts/product-center/recipes/product-center-item-p0-wave-b-recipes.json"
      ]
    },
    "blockingReasons": [
      "ASSERTION_CONTRACT_REQUIRED",
      "RUNTIME_EVIDENCE_REQUIRED"
    ],
    "family": "standard",
    "action": "delete-confirmation",
    "runtimeReadiness": "ready",
    "runtimeStatus": "runtime-passed",
    "handlerId": "product-center:item-p0-wave-b:TC-ITEM-STD-075",
    "bindingFingerprint": "fa126b1f6dd0304ce090f706dda4f8d87816fb6144bd36910696ab443c0a606b",
    "implementationFingerprint": "5967bb7f95556a9775c7c163d540dd7f7576f60cb511116657eec1e34eb14f12",
    "assertionIds": [
      "TC-ITEM-STD-075:expectation-1",
      "TC-ITEM-STD-075:expectation-2",
      "TC-ITEM-STD-075:expectation-3"
    ],
    "semanticCaseFingerprint": "4592159c701344dd5f2a0b712c5a94a4eb17b508216b2d30eea2bd367f2a139b"
  },
  {
    "caseId": "TC-ITEM-STD-076",
    "title": "商品列表空值字段展示空而非“-”",
    "irConverted": true,
    "reviewDecision": "approved",
    "automationClassification": "blocked",
    "recipeId": "product-center:yellow-probe:at18:tc-item-std-076",
    "recipeInventory": {
      "any": 1,
      "enabled": 0,
      "semanticComplete": 0,
      "files": [
        "contracts/product-center/recipes/yellow-probes/product-center-item-yellow-representative-probe-recipes.json"
      ]
    },
    "blockingReasons": [
      "RECIPE_GENERATION_DISABLED",
      "ASSERTION_CONTRACT_REQUIRED",
      "RUNTIME_EVIDENCE_REQUIRED"
    ],
    "family": "standard",
    "action": "empty-category-cell",
    "runtimeReadiness": "ready",
    "runtimeStatus": "runtime-passed",
    "handlerId": "product-center:yellow-probe:at18:tc-item-std-076",
    "bindingFingerprint": "fa126b1f6dd0304ce090f706dda4f8d87816fb6144bd36910696ab443c0a606b",
    "implementationFingerprint": "5967bb7f95556a9775c7c163d540dd7f7576f60cb511116657eec1e34eb14f12",
    "assertionIds": [
      "TC-ITEM-STD-076:expectation-1",
      "TC-ITEM-STD-076:expectation-2"
    ],
    "semanticCaseFingerprint": "1516e7be2c2914eee6af75cab4971c3319f0e2e2bdb02c6eaa5594e37daa7886"
  },
  {
    "caseId": "TC-ITEM-STD-077",
    "title": "商品状态变更后需下发到门店终端才生效",
    "irConverted": true,
    "reviewDecision": "approved",
    "automationClassification": "blocked",
    "recipeId": "product-center:yellow-probe:at20:tc-item-std-077",
    "recipeInventory": {
      "any": 1,
      "enabled": 0,
      "semanticComplete": 0,
      "files": [
        "contracts/product-center/recipes/yellow-probes/product-center-item-yellow-representative-probe-recipes.json"
      ]
    },
    "blockingReasons": [
      "RECIPE_GENERATION_DISABLED",
      "ASSERTION_CONTRACT_REQUIRED",
      "RUNTIME_EVIDENCE_REQUIRED"
    ],
    "family": "standard",
    "action": "lifecycle",
    "runtimeReadiness": "ready",
    "runtimeStatus": "deferred",
    "handlerId": "product-center:yellow-probe:at20:tc-item-std-077",
    "bindingFingerprint": "fa126b1f6dd0304ce090f706dda4f8d87816fb6144bd36910696ab443c0a606b",
    "implementationFingerprint": "5967bb7f95556a9775c7c163d540dd7f7576f60cb511116657eec1e34eb14f12",
    "assertionIds": [
      "TC-ITEM-STD-077:expectation-1",
      "TC-ITEM-STD-077:expectation-2"
    ],
    "semanticCaseFingerprint": "699002711fcef6c5a3bb458de1e9ec04ea373f2c1948d4a093eb8f5dc5c3139c"
  },
  {
    "caseId": "TC-ITEM-STD-078",
    "title": "标准商品主图上传后不提供第二次本地上传入口",
    "irConverted": true,
    "reviewDecision": "approved",
    "automationClassification": "blocked",
    "recipeId": "product-center:green-draft:at15:tc-item-std-078",
    "recipeInventory": {
      "any": 1,
      "enabled": 1,
      "semanticComplete": 0,
      "files": [
        "contracts/product-center/recipes/green-drafts/product-center-item-green-binding-draft-recipes.json"
      ]
    },
    "blockingReasons": [
      "ASSERTION_CONTRACT_REQUIRED",
      "RUNTIME_EVIDENCE_REQUIRED"
    ],
    "family": "standard",
    "action": "replace-main-image",
    "runtimeReadiness": "ready",
    "runtimeStatus": "runtime-passed",
    "handlerId": "product-center:green-draft:at15:tc-item-std-078",
    "bindingFingerprint": "fa126b1f6dd0304ce090f706dda4f8d87816fb6144bd36910696ab443c0a606b",
    "implementationFingerprint": "5967bb7f95556a9775c7c163d540dd7f7576f60cb511116657eec1e34eb14f12",
    "assertionIds": [
      "TC-ITEM-STD-078:expectation-1"
    ],
    "semanticCaseFingerprint": "74958d8bb754b1f13cde6cb3873180c75f2a72076fde3b823bae1124fe5e399d"
  },
  {
    "caseId": "TC-ITEM-STD-079",
    "title": "标准商品创建页不支持添加套餐组",
    "irConverted": true,
    "reviewDecision": "approved",
    "automationClassification": "blocked",
    "recipeId": "product-center:yellow-probe:at14:tc-item-std-079",
    "recipeInventory": {
      "any": 1,
      "enabled": 0,
      "semanticComplete": 0,
      "files": [
        "contracts/product-center/recipes/yellow-probes/product-center-item-yellow-representative-probe-recipes.json"
      ]
    },
    "blockingReasons": [
      "RECIPE_GENERATION_DISABLED",
      "ASSERTION_CONTRACT_REQUIRED",
      "RUNTIME_EVIDENCE_REQUIRED"
    ],
    "family": "standard",
    "action": "no-combo-group",
    "runtimeReadiness": "ready",
    "runtimeStatus": "runtime-passed",
    "handlerId": "product-center:yellow-probe:at14:tc-item-std-079",
    "bindingFingerprint": "fa126b1f6dd0304ce090f706dda4f8d87816fb6144bd36910696ab443c0a606b",
    "implementationFingerprint": "5967bb7f95556a9775c7c163d540dd7f7576f60cb511116657eec1e34eb14f12",
    "assertionIds": [
      "TC-ITEM-STD-079:expectation-1",
      "TC-ITEM-STD-079:expectation-2"
    ],
    "semanticCaseFingerprint": "66bf3524415dbbbf6eb2385842e882913c5b9c3639797e598611a4f0520ddcfc"
  },
  {
    "caseId": "TC-ITEM-PKG-001",
    "title": "套餐商品基础字段与标准商品保持一致",
    "irConverted": true,
    "reviewDecision": "approved",
    "automationClassification": "blocked",
    "recipeId": null,
    "recipeInventory": {
      "any": 0,
      "enabled": 0,
      "semanticComplete": 0,
      "files": []
    },
    "blockingReasons": [
      "RECIPE_REQUIRED"
    ],
    "family": "package",
    "action": null,
    "runtimeReadiness": "ready",
    "runtimeStatus": "runtime-passed",
    "handlerId": "item-216:TC-ITEM-PKG-001",
    "bindingFingerprint": "fa126b1f6dd0304ce090f706dda4f8d87816fb6144bd36910696ab443c0a606b",
    "implementationFingerprint": "fa5fc5479f8a2f92491688f1591270bd3f12e29eb3fe37172bb54403ab09cd70",
    "assertionIds": [
      "TC-ITEM-PKG-001:expectation-1",
      "TC-ITEM-PKG-001:expectation-2"
    ],
    "semanticCaseFingerprint": "9e612dcba17da2635defe399322e2093c4390f3c987da30207bc22e3ecf5dc43"
  },
  {
    "caseId": "TC-ITEM-PKG-002",
    "title": "套餐商品可选择已有固定搭配套餐组",
    "irConverted": true,
    "reviewDecision": "approved",
    "automationClassification": "strict-generatable",
    "recipeId": "product-center:item-combo-api-closure:TC-ITEM-PKG-002",
    "recipeInventory": {
      "any": 2,
      "enabled": 2,
      "semanticComplete": 1,
      "files": [
        "contracts/product-center/recipes/product-center-item-combo-api-closure-recipes.json",
        "contracts/product-center/recipes/product-center-item-p0-wave-a-recipes.json"
      ]
    },
    "blockingReasons": [],
    "family": "package",
    "action": null,
    "runtimeReadiness": "ready",
    "runtimeStatus": "runtime-passed",
    "handlerId": "product-center:item-combo-api-closure:TC-ITEM-PKG-002",
    "bindingFingerprint": "fa126b1f6dd0304ce090f706dda4f8d87816fb6144bd36910696ab443c0a606b",
    "implementationFingerprint": "fa5fc5479f8a2f92491688f1591270bd3f12e29eb3fe37172bb54403ab09cd70",
    "assertionIds": [
      "TC-ITEM-PKG-002:expectation-1",
      "TC-ITEM-PKG-002:expectation-2",
      "TC-ITEM-PKG-002:expectation-3",
      "TC-ITEM-PKG-002:expectation-4"
    ],
    "semanticCaseFingerprint": "1ab8cefabadb0cfca39dc3fd6516a1dbe405f8e012b046b39131f7940317d53c"
  },
  {
    "caseId": "TC-ITEM-PKG-003",
    "title": "套餐商品可按名称搜索固定搭配套餐组",
    "irConverted": true,
    "reviewDecision": "approved",
    "automationClassification": "blocked",
    "recipeId": "product-center:yellow-probe:at37:tc-item-pkg-003",
    "recipeInventory": {
      "any": 1,
      "enabled": 0,
      "semanticComplete": 0,
      "files": [
        "contracts/product-center/recipes/yellow-probes/product-center-item-yellow-representative-probe-recipes.json"
      ]
    },
    "blockingReasons": [
      "RECIPE_GENERATION_DISABLED",
      "ASSERTION_CONTRACT_REQUIRED",
      "RUNTIME_EVIDENCE_REQUIRED"
    ],
    "family": "package",
    "action": null,
    "runtimeReadiness": "ready",
    "runtimeStatus": "runtime-passed",
    "handlerId": "product-center:yellow-probe:at37:tc-item-pkg-003",
    "bindingFingerprint": "fa126b1f6dd0304ce090f706dda4f8d87816fb6144bd36910696ab443c0a606b",
    "implementationFingerprint": "fa5fc5479f8a2f92491688f1591270bd3f12e29eb3fe37172bb54403ab09cd70",
    "assertionIds": [
      "TC-ITEM-PKG-003:expectation-1",
      "TC-ITEM-PKG-003:expectation-2"
    ],
    "semanticCaseFingerprint": "e22e702d11d4fef94ad1e8b502d1f45b045a01709004fc2b4fa62be286004764"
  },
  {
    "caseId": "TC-ITEM-PKG-004",
    "title": "套餐商品可选择已有组合搭配套餐组",
    "irConverted": true,
    "reviewDecision": "approved",
    "automationClassification": "strict-generatable",
    "recipeId": "product-center:item-combo-api-closure:TC-ITEM-PKG-004",
    "recipeInventory": {
      "any": 2,
      "enabled": 2,
      "semanticComplete": 1,
      "files": [
        "contracts/product-center/recipes/product-center-item-combo-api-closure-recipes.json",
        "contracts/product-center/recipes/product-center-item-p0-wave-a-recipes.json"
      ]
    },
    "blockingReasons": [],
    "family": "package",
    "action": null,
    "runtimeReadiness": "ready",
    "runtimeStatus": "runtime-passed",
    "handlerId": "product-center:item-combo-api-closure:TC-ITEM-PKG-004",
    "bindingFingerprint": "fa126b1f6dd0304ce090f706dda4f8d87816fb6144bd36910696ab443c0a606b",
    "implementationFingerprint": "fa5fc5479f8a2f92491688f1591270bd3f12e29eb3fe37172bb54403ab09cd70",
    "assertionIds": [
      "TC-ITEM-PKG-004:expectation-1",
      "TC-ITEM-PKG-004:expectation-2",
      "TC-ITEM-PKG-004:expectation-3",
      "TC-ITEM-PKG-004:expectation-4"
    ],
    "semanticCaseFingerprint": "bb7b0456c516799bd67e6e31a92957eca4913e0fecf3d406d6b9b61d87912761"
  },
  {
    "caseId": "TC-ITEM-PKG-005",
    "title": "套餐商品其他设置与标准商品一致",
    "irConverted": true,
    "reviewDecision": "approved",
    "automationClassification": "blocked",
    "recipeId": "product-center:green-draft:at47:tc-item-pkg-005",
    "recipeInventory": {
      "any": 1,
      "enabled": 1,
      "semanticComplete": 0,
      "files": [
        "contracts/product-center/recipes/green-drafts/product-center-item-green-binding-draft-recipes.json"
      ]
    },
    "blockingReasons": [
      "ASSERTION_CONTRACT_REQUIRED",
      "RUNTIME_EVIDENCE_REQUIRED"
    ],
    "family": "package",
    "action": null,
    "runtimeReadiness": "ready",
    "runtimeStatus": "runtime-passed",
    "handlerId": "product-center:green-draft:at47:tc-item-pkg-005",
    "bindingFingerprint": "fa126b1f6dd0304ce090f706dda4f8d87816fb6144bd36910696ab443c0a606b",
    "implementationFingerprint": "fa5fc5479f8a2f92491688f1591270bd3f12e29eb3fe37172bb54403ab09cd70",
    "assertionIds": [
      "TC-ITEM-PKG-005:expectation-1"
    ],
    "semanticCaseFingerprint": "ef342916c9d94412d3708d484787e407f031d7511a7bb53138664960b3062385"
  },
  {
    "caseId": "TC-ITEM-PKG-006",
    "title": "套餐商品选择并引用已有固定搭配组",
    "irConverted": true,
    "reviewDecision": "approved",
    "automationClassification": "strict-generatable",
    "recipeId": "product-center:item-combo-api-closure:TC-ITEM-PKG-006",
    "recipeInventory": {
      "any": 2,
      "enabled": 2,
      "semanticComplete": 1,
      "files": [
        "contracts/product-center/recipes/product-center-item-combo-api-closure-recipes.json",
        "contracts/product-center/recipes/product-center-item-p0-wave-a-recipes.json"
      ]
    },
    "blockingReasons": [],
    "family": "package",
    "action": null,
    "runtimeReadiness": "ready",
    "runtimeStatus": "runtime-passed",
    "handlerId": "product-center:item-combo-api-closure:TC-ITEM-PKG-006",
    "bindingFingerprint": "fa126b1f6dd0304ce090f706dda4f8d87816fb6144bd36910696ab443c0a606b",
    "implementationFingerprint": "fa5fc5479f8a2f92491688f1591270bd3f12e29eb3fe37172bb54403ab09cd70",
    "assertionIds": [
      "TC-ITEM-PKG-006:expectation-1"
    ],
    "semanticCaseFingerprint": "f255ccb7e52b9db3a0ea4692a24567c2309e8fa58f47bda97476c6237813dc68"
  },
  {
    "caseId": "TC-ITEM-PKG-007",
    "title": "套餐商品可新增可选搭配套餐组",
    "irConverted": true,
    "reviewDecision": "approved",
    "automationClassification": "strict-generatable",
    "recipeId": "product-center:item-combo-api-closure:TC-ITEM-PKG-007",
    "recipeInventory": {
      "any": 2,
      "enabled": 2,
      "semanticComplete": 1,
      "files": [
        "contracts/product-center/recipes/product-center-item-combo-api-closure-recipes.json",
        "contracts/product-center/recipes/product-center-item-p0-wave-a-recipes.json"
      ]
    },
    "blockingReasons": [],
    "family": "package",
    "action": null,
    "runtimeReadiness": "ready",
    "runtimeStatus": "runtime-passed",
    "handlerId": "item-216:TC-ITEM-PKG-007",
    "bindingFingerprint": "fa126b1f6dd0304ce090f706dda4f8d87816fb6144bd36910696ab443c0a606b",
    "implementationFingerprint": "fa5fc5479f8a2f92491688f1591270bd3f12e29eb3fe37172bb54403ab09cd70",
    "assertionIds": [
      "TC-ITEM-PKG-007:expectation-1",
      "TC-ITEM-PKG-007:expectation-2",
      "TC-ITEM-PKG-007:expectation-3",
      "TC-ITEM-PKG-007:expectation-4"
    ],
    "semanticCaseFingerprint": "6d58efbb6b9cd98bd412d42136a83a698e39f86c424cdbae10be84ac9e6c5878"
  },
  {
    "caseId": "TC-ITEM-PKG-008",
    "title": "套餐商品创建页展示基础信息与套餐组配置入口",
    "irConverted": true,
    "reviewDecision": "approved",
    "automationClassification": "blocked",
    "recipeId": "product-center:item-p0-wave-c:TC-ITEM-PKG-008",
    "recipeInventory": {
      "any": 1,
      "enabled": 1,
      "semanticComplete": 0,
      "files": [
        "contracts/product-center/recipes/product-center-item-p0-wave-c-recipes.json"
      ]
    },
    "blockingReasons": [
      "ASSERTION_CONTRACT_REQUIRED",
      "RUNTIME_EVIDENCE_REQUIRED"
    ],
    "family": "package",
    "action": null,
    "runtimeReadiness": "ready",
    "runtimeStatus": "runtime-passed",
    "handlerId": "product-center:item-p0-wave-c:TC-ITEM-PKG-008",
    "bindingFingerprint": "fa126b1f6dd0304ce090f706dda4f8d87816fb6144bd36910696ab443c0a606b",
    "implementationFingerprint": "fa5fc5479f8a2f92491688f1591270bd3f12e29eb3fe37172bb54403ab09cd70",
    "assertionIds": [
      "TC-ITEM-PKG-008:expectation-1",
      "TC-ITEM-PKG-008:expectation-2"
    ],
    "semanticCaseFingerprint": "f28b9fe685b9a2ec4327e5da5b496b4e1c685d6862b5edb0df874e9b17f6a0c1"
  },
  {
    "caseId": "TC-ITEM-PKG-009",
    "title": "套餐商品仅填写必填项时创建成功",
    "irConverted": true,
    "reviewDecision": "approved",
    "automationClassification": "blocked",
    "recipeId": null,
    "recipeInventory": {
      "any": 0,
      "enabled": 0,
      "semanticComplete": 0,
      "files": []
    },
    "blockingReasons": [
      "RECIPE_REQUIRED"
    ],
    "family": "package",
    "action": null,
    "runtimeReadiness": "ready",
    "runtimeStatus": "runtime-passed",
    "handlerId": "item-216:TC-ITEM-PKG-009",
    "bindingFingerprint": "fa126b1f6dd0304ce090f706dda4f8d87816fb6144bd36910696ab443c0a606b",
    "implementationFingerprint": "fa5fc5479f8a2f92491688f1591270bd3f12e29eb3fe37172bb54403ab09cd70",
    "assertionIds": [
      "TC-ITEM-PKG-009:expectation-1",
      "TC-ITEM-PKG-009:expectation-2",
      "TC-ITEM-PKG-009:expectation-3"
    ],
    "semanticCaseFingerprint": "030b8479b447320ff9e353de228f622e67ebcb13d560a79046d047cb2080cf28"
  },
  {
    "caseId": "TC-ITEM-PKG-010",
    "title": "套餐商品必填项缺失时创建失败",
    "irConverted": true,
    "reviewDecision": "approved",
    "automationClassification": "strict-generatable",
    "recipeId": "product-center:item-combo-api-closure:TC-ITEM-PKG-010",
    "recipeInventory": {
      "any": 2,
      "enabled": 2,
      "semanticComplete": 1,
      "files": [
        "contracts/product-center/recipes/product-center-item-combo-api-closure-recipes.json",
        "contracts/product-center/recipes/product-center-item-p0-wave-a-recipes.json"
      ]
    },
    "blockingReasons": [],
    "family": "package",
    "action": null,
    "runtimeReadiness": "ready",
    "runtimeStatus": "runtime-passed",
    "handlerId": "product-center:item-combo-api-closure:TC-ITEM-PKG-010",
    "bindingFingerprint": "fa126b1f6dd0304ce090f706dda4f8d87816fb6144bd36910696ab443c0a606b",
    "implementationFingerprint": "fa5fc5479f8a2f92491688f1591270bd3f12e29eb3fe37172bb54403ab09cd70",
    "assertionIds": [
      "TC-ITEM-PKG-010:expectation-1",
      "TC-ITEM-PKG-010:expectation-2"
    ],
    "semanticCaseFingerprint": "04dd2504bbdf12b3ac6f54ad2c852847021a8494e7041cd06bb8e35e09ef8cce"
  },
  {
    "caseId": "TC-ITEM-PKG-011",
    "title": "套餐商品不选择分类时创建成功",
    "irConverted": true,
    "reviewDecision": "approved",
    "automationClassification": "blocked",
    "recipeId": "product-center:green-draft:at43:tc-item-pkg-011",
    "recipeInventory": {
      "any": 1,
      "enabled": 1,
      "semanticComplete": 0,
      "files": [
        "contracts/product-center/recipes/green-drafts/product-center-item-green-binding-draft-recipes.json"
      ]
    },
    "blockingReasons": [
      "ASSERTION_CONTRACT_REQUIRED",
      "RUNTIME_EVIDENCE_REQUIRED"
    ],
    "family": "package",
    "action": null,
    "runtimeReadiness": "ready",
    "runtimeStatus": "runtime-passed",
    "handlerId": "product-center:green-draft:at43:tc-item-pkg-011",
    "bindingFingerprint": "fa126b1f6dd0304ce090f706dda4f8d87816fb6144bd36910696ab443c0a606b",
    "implementationFingerprint": "fa5fc5479f8a2f92491688f1591270bd3f12e29eb3fe37172bb54403ab09cd70",
    "assertionIds": [
      "TC-ITEM-PKG-011:expectation-1",
      "TC-ITEM-PKG-011:expectation-2",
      "TC-ITEM-PKG-011:expectation-3"
    ],
    "semanticCaseFingerprint": "52b56690b8503d70d26bb7bf8fd4f6b7d3e1295211a8524b74fe10a71151eac2"
  },
  {
    "caseId": "TC-ITEM-PKG-012",
    "title": "一级分类下无二级分类时套餐可直接创建成功",
    "irConverted": true,
    "reviewDecision": "approved",
    "automationClassification": "blocked",
    "recipeId": "product-center:green-draft:at43:tc-item-pkg-012",
    "recipeInventory": {
      "any": 1,
      "enabled": 1,
      "semanticComplete": 0,
      "files": [
        "contracts/product-center/recipes/green-drafts/product-center-item-green-binding-draft-recipes.json"
      ]
    },
    "blockingReasons": [
      "ASSERTION_CONTRACT_REQUIRED",
      "RUNTIME_EVIDENCE_REQUIRED"
    ],
    "family": "package",
    "action": null,
    "runtimeReadiness": "ready",
    "runtimeStatus": "runtime-passed",
    "handlerId": "product-center:green-draft:at43:tc-item-pkg-012",
    "bindingFingerprint": "fa126b1f6dd0304ce090f706dda4f8d87816fb6144bd36910696ab443c0a606b",
    "implementationFingerprint": "fa5fc5479f8a2f92491688f1591270bd3f12e29eb3fe37172bb54403ab09cd70",
    "assertionIds": [
      "TC-ITEM-PKG-012:expectation-1",
      "TC-ITEM-PKG-012:expectation-2"
    ],
    "semanticCaseFingerprint": "bbc1e27592846f96e8c67bac72ccec8c2c8794d452cfc8c8a152b672168229aa"
  },
  {
    "caseId": "TC-ITEM-PKG-013",
    "title": "存在二级分类时未选二级分类不影响套餐商品提交",
    "irConverted": true,
    "reviewDecision": "approved",
    "automationClassification": "blocked",
    "recipeId": null,
    "recipeInventory": {
      "any": 0,
      "enabled": 0,
      "semanticComplete": 0,
      "files": []
    },
    "blockingReasons": [
      "RECIPE_REQUIRED"
    ],
    "family": "package",
    "action": null,
    "runtimeReadiness": "ready",
    "runtimeStatus": "runtime-passed",
    "handlerId": "item-216:TC-ITEM-PKG-013",
    "bindingFingerprint": "fa126b1f6dd0304ce090f706dda4f8d87816fb6144bd36910696ab443c0a606b",
    "implementationFingerprint": "fa5fc5479f8a2f92491688f1591270bd3f12e29eb3fe37172bb54403ab09cd70",
    "assertionIds": [
      "TC-ITEM-PKG-013:expectation-1"
    ],
    "semanticCaseFingerprint": "4070e1ed502dc3afefdba4b4c4fd61db00ffbad2cbdd6f87b2f3efa084f11d15"
  },
  {
    "caseId": "TC-ITEM-PKG-014",
    "title": "套餐商品起售数量默认值为 1",
    "irConverted": true,
    "reviewDecision": "approved",
    "automationClassification": "blocked",
    "recipeId": "product-center:yellow-probe:at40:tc-item-pkg-014",
    "recipeInventory": {
      "any": 1,
      "enabled": 0,
      "semanticComplete": 0,
      "files": [
        "contracts/product-center/recipes/yellow-probes/product-center-item-yellow-representative-probe-recipes.json"
      ]
    },
    "blockingReasons": [
      "RECIPE_GENERATION_DISABLED",
      "ASSERTION_CONTRACT_REQUIRED",
      "RUNTIME_EVIDENCE_REQUIRED"
    ],
    "family": "package",
    "action": null,
    "runtimeReadiness": "ready",
    "runtimeStatus": "runtime-passed",
    "handlerId": "product-center:yellow-probe:at40:tc-item-pkg-014",
    "bindingFingerprint": "fa126b1f6dd0304ce090f706dda4f8d87816fb6144bd36910696ab443c0a606b",
    "implementationFingerprint": "fa5fc5479f8a2f92491688f1591270bd3f12e29eb3fe37172bb54403ab09cd70",
    "assertionIds": [
      "TC-ITEM-PKG-014:expectation-1"
    ],
    "semanticCaseFingerprint": "826e88826ba8480915f0ad0980b9cf2393c3edd6a078a36b52308ee0b9953723"
  },
  {
    "caseId": "TC-ITEM-PKG-015",
    "title": "套餐商品起售数量为 0 时保存失败",
    "irConverted": true,
    "reviewDecision": "approved",
    "automationClassification": "blocked",
    "recipeId": null,
    "recipeInventory": {
      "any": 0,
      "enabled": 0,
      "semanticComplete": 0,
      "files": []
    },
    "blockingReasons": [
      "RECIPE_REQUIRED"
    ],
    "family": "package",
    "action": null,
    "runtimeReadiness": "ready",
    "runtimeStatus": "runtime-passed",
    "handlerId": "item-216:TC-ITEM-PKG-015",
    "bindingFingerprint": "fa126b1f6dd0304ce090f706dda4f8d87816fb6144bd36910696ab443c0a606b",
    "implementationFingerprint": "fa5fc5479f8a2f92491688f1591270bd3f12e29eb3fe37172bb54403ab09cd70",
    "assertionIds": [
      "TC-ITEM-PKG-015:expectation-1",
      "TC-ITEM-PKG-015:expectation-2",
      "TC-ITEM-PKG-015:expectation-3"
    ],
    "semanticCaseFingerprint": "fabbd0b7ebe9acab00acbff75d3ae236e234792473f87261a1dc5aee65f57b8d"
  },
  {
    "caseId": "TC-ITEM-PKG-016",
    "title": "套餐商品起售数量大于 1 时创建成功",
    "irConverted": true,
    "reviewDecision": "approved",
    "automationClassification": "blocked",
    "recipeId": "product-center:green-draft:at39:tc-item-pkg-016",
    "recipeInventory": {
      "any": 1,
      "enabled": 1,
      "semanticComplete": 0,
      "files": [
        "contracts/product-center/recipes/green-drafts/product-center-item-green-binding-draft-recipes.json"
      ]
    },
    "blockingReasons": [
      "ASSERTION_CONTRACT_REQUIRED",
      "RUNTIME_EVIDENCE_REQUIRED"
    ],
    "family": "package",
    "action": null,
    "runtimeReadiness": "ready",
    "runtimeStatus": "runtime-passed",
    "handlerId": "product-center:green-draft:at39:tc-item-pkg-016",
    "bindingFingerprint": "fa126b1f6dd0304ce090f706dda4f8d87816fb6144bd36910696ab443c0a606b",
    "implementationFingerprint": "fa5fc5479f8a2f92491688f1591270bd3f12e29eb3fe37172bb54403ab09cd70",
    "assertionIds": [
      "TC-ITEM-PKG-016:expectation-1",
      "TC-ITEM-PKG-016:expectation-2",
      "TC-ITEM-PKG-016:expectation-3"
    ],
    "semanticCaseFingerprint": "1aab90ab216949c80873f3e65e47558e5d04325aea3754a4738e5d684e181ba8"
  },
  {
    "caseId": "TC-ITEM-PKG-017",
    "title": "套餐商品标准价缺失时创建失败",
    "irConverted": true,
    "reviewDecision": "approved",
    "automationClassification": "strict-generatable",
    "recipeId": "product-center:item-combo-api-closure:TC-ITEM-PKG-017",
    "recipeInventory": {
      "any": 2,
      "enabled": 2,
      "semanticComplete": 1,
      "files": [
        "contracts/product-center/recipes/product-center-item-combo-api-closure-recipes.json",
        "contracts/product-center/recipes/product-center-item-p0-wave-a-recipes.json"
      ]
    },
    "blockingReasons": [],
    "family": "package",
    "action": null,
    "runtimeReadiness": "ready",
    "runtimeStatus": "runtime-passed",
    "handlerId": "product-center:item-combo-api-closure:TC-ITEM-PKG-017",
    "bindingFingerprint": "fa126b1f6dd0304ce090f706dda4f8d87816fb6144bd36910696ab443c0a606b",
    "implementationFingerprint": "fa5fc5479f8a2f92491688f1591270bd3f12e29eb3fe37172bb54403ab09cd70",
    "assertionIds": [
      "TC-ITEM-PKG-017:expectation-1",
      "TC-ITEM-PKG-017:expectation-2",
      "TC-ITEM-PKG-017:expectation-3"
    ],
    "semanticCaseFingerprint": "d1111f3e44ddc0dfcaa445d400a2dce7ca78b7d18994dd43cb000be3e28ef116"
  },
  {
    "caseId": "TC-ITEM-PKG-018",
    "title": "套餐商品标准价为 0 时创建成功",
    "irConverted": true,
    "reviewDecision": "approved",
    "automationClassification": "blocked",
    "recipeId": "product-center:green-draft:at43:tc-item-pkg-018",
    "recipeInventory": {
      "any": 1,
      "enabled": 1,
      "semanticComplete": 0,
      "files": [
        "contracts/product-center/recipes/green-drafts/product-center-item-green-binding-draft-recipes.json"
      ]
    },
    "blockingReasons": [
      "ASSERTION_CONTRACT_REQUIRED",
      "RUNTIME_EVIDENCE_REQUIRED"
    ],
    "family": "package",
    "action": null,
    "runtimeReadiness": "ready",
    "runtimeStatus": "runtime-passed",
    "handlerId": "product-center:green-draft:at43:tc-item-pkg-018",
    "bindingFingerprint": "fa126b1f6dd0304ce090f706dda4f8d87816fb6144bd36910696ab443c0a606b",
    "implementationFingerprint": "fa5fc5479f8a2f92491688f1591270bd3f12e29eb3fe37172bb54403ab09cd70",
    "assertionIds": [
      "TC-ITEM-PKG-018:expectation-1",
      "TC-ITEM-PKG-018:expectation-2",
      "TC-ITEM-PKG-018:expectation-3"
    ],
    "businessRule": {
      "businessRuleId": "BR-FMT-005",
      "businessRuleFingerprint": "68a2895221c4d12b84412f80c9371e3051c97fdd50d2e909bb0a00d39ce4f89e",
      "businessRuleAssertionIdsRequired": [
        "br-fmt-005:canonical-outcome-1",
        "br-fmt-005:canonical-outcome-10",
        "br-fmt-005:canonical-outcome-11",
        "br-fmt-005:canonical-outcome-12",
        "br-fmt-005:canonical-outcome-13",
        "br-fmt-005:canonical-outcome-14",
        "br-fmt-005:canonical-outcome-2",
        "br-fmt-005:canonical-outcome-3",
        "br-fmt-005:canonical-outcome-4",
        "br-fmt-005:canonical-outcome-5",
        "br-fmt-005:canonical-outcome-6",
        "br-fmt-005:canonical-outcome-7",
        "br-fmt-005:canonical-outcome-8",
        "br-fmt-005:canonical-outcome-9"
      ],
      "businessRuleAssertionIdsObserved": [
        "br-fmt-005:canonical-outcome-1",
        "br-fmt-005:canonical-outcome-10",
        "br-fmt-005:canonical-outcome-11",
        "br-fmt-005:canonical-outcome-12",
        "br-fmt-005:canonical-outcome-13",
        "br-fmt-005:canonical-outcome-14",
        "br-fmt-005:canonical-outcome-2",
        "br-fmt-005:canonical-outcome-3",
        "br-fmt-005:canonical-outcome-4",
        "br-fmt-005:canonical-outcome-5",
        "br-fmt-005:canonical-outcome-6",
        "br-fmt-005:canonical-outcome-7",
        "br-fmt-005:canonical-outcome-8",
        "br-fmt-005:canonical-outcome-9"
      ],
      "businessRuleUiEvidenceIds": [
        "TC-ITEM-PKG-018-runtime-evidence"
      ],
      "businessRuleApiEvidenceIds": [],
      "businessRuleDownstreamEvidenceIds": [],
      "businessRuleCleanup": {
        "required": false,
        "apiZeroResidue": false,
        "uiZeroResidue": false
      },
      "observedStatement": "价格 0.00 可保存并展示 2 位小数；超过 2 位小数按四舍五入保存，API 与重新进入页面回显舍入后的金额"
    },
    "semanticCaseFingerprint": "d32086a491037882e836b06199f6acb7df0852a3845fa6d14f316d755980da32"
  },
  {
    "caseId": "TC-ITEM-PKG-019",
    "title": "套餐商品标准价输入负数时创建失败",
    "irConverted": true,
    "reviewDecision": "approved",
    "automationClassification": "blocked",
    "recipeId": null,
    "recipeInventory": {
      "any": 0,
      "enabled": 0,
      "semanticComplete": 0,
      "files": []
    },
    "blockingReasons": [
      "RECIPE_REQUIRED"
    ],
    "family": "package",
    "action": null,
    "runtimeReadiness": "ready",
    "runtimeStatus": "runtime-passed",
    "handlerId": "item-216:TC-ITEM-PKG-019",
    "bindingFingerprint": "fa126b1f6dd0304ce090f706dda4f8d87816fb6144bd36910696ab443c0a606b",
    "implementationFingerprint": "fa5fc5479f8a2f92491688f1591270bd3f12e29eb3fe37172bb54403ab09cd70",
    "assertionIds": [
      "TC-ITEM-PKG-019:expectation-1"
    ],
    "businessRule": {
      "businessRuleId": "BR-FMT-005",
      "businessRuleFingerprint": "68a2895221c4d12b84412f80c9371e3051c97fdd50d2e909bb0a00d39ce4f89e",
      "businessRuleAssertionIdsRequired": [
        "br-fmt-005:canonical-outcome-1",
        "br-fmt-005:canonical-outcome-10",
        "br-fmt-005:canonical-outcome-11",
        "br-fmt-005:canonical-outcome-12",
        "br-fmt-005:canonical-outcome-13",
        "br-fmt-005:canonical-outcome-14",
        "br-fmt-005:canonical-outcome-2",
        "br-fmt-005:canonical-outcome-3",
        "br-fmt-005:canonical-outcome-4",
        "br-fmt-005:canonical-outcome-5",
        "br-fmt-005:canonical-outcome-6",
        "br-fmt-005:canonical-outcome-7",
        "br-fmt-005:canonical-outcome-8",
        "br-fmt-005:canonical-outcome-9"
      ],
      "businessRuleAssertionIdsObserved": [
        "br-fmt-005:canonical-outcome-1",
        "br-fmt-005:canonical-outcome-10",
        "br-fmt-005:canonical-outcome-11",
        "br-fmt-005:canonical-outcome-12",
        "br-fmt-005:canonical-outcome-13",
        "br-fmt-005:canonical-outcome-14",
        "br-fmt-005:canonical-outcome-2",
        "br-fmt-005:canonical-outcome-3",
        "br-fmt-005:canonical-outcome-4",
        "br-fmt-005:canonical-outcome-5",
        "br-fmt-005:canonical-outcome-6",
        "br-fmt-005:canonical-outcome-7",
        "br-fmt-005:canonical-outcome-8",
        "br-fmt-005:canonical-outcome-9"
      ],
      "businessRuleUiEvidenceIds": [
        "TC-ITEM-PKG-019-runtime-evidence"
      ],
      "businessRuleApiEvidenceIds": [],
      "businessRuleDownstreamEvidenceIds": [],
      "businessRuleCleanup": {
        "required": false,
        "apiZeroResidue": false,
        "uiZeroResidue": false
      },
      "observedStatement": "价格 0.00 可保存并展示 2 位小数；超过 2 位小数按四舍五入保存，API 与重新进入页面回显舍入后的金额"
    },
    "semanticCaseFingerprint": "1389a2460c1054d7bba5429f4d955e689d9326a23601ab7a90030dba198fc5c2"
  },
  {
    "caseId": "TC-ITEM-PKG-020",
    "title": "套餐商品包装费合法输入时保存成功",
    "irConverted": true,
    "reviewDecision": "approved",
    "automationClassification": "blocked",
    "recipeId": "product-center:yellow-probe:at41:tc-item-pkg-020",
    "recipeInventory": {
      "any": 1,
      "enabled": 0,
      "semanticComplete": 0,
      "files": [
        "contracts/product-center/recipes/yellow-probes/product-center-item-yellow-representative-probe-recipes.json"
      ]
    },
    "blockingReasons": [
      "RECIPE_GENERATION_DISABLED",
      "ASSERTION_CONTRACT_REQUIRED"
    ],
    "family": "package",
    "action": null,
    "runtimeReadiness": "ready",
    "runtimeStatus": "runtime-passed",
    "handlerId": "product-center:yellow-probe:at41:tc-item-pkg-020",
    "bindingFingerprint": "fa126b1f6dd0304ce090f706dda4f8d87816fb6144bd36910696ab443c0a606b",
    "implementationFingerprint": "fa5fc5479f8a2f92491688f1591270bd3f12e29eb3fe37172bb54403ab09cd70",
    "assertionIds": [
      "TC-ITEM-PKG-020:expectation-1",
      "TC-ITEM-PKG-020:expectation-2"
    ],
    "businessRule": {
      "businessRuleId": "BR-FMT-005",
      "businessRuleFingerprint": "68a2895221c4d12b84412f80c9371e3051c97fdd50d2e909bb0a00d39ce4f89e",
      "businessRuleAssertionIdsRequired": [
        "br-fmt-005:canonical-outcome-1",
        "br-fmt-005:canonical-outcome-10",
        "br-fmt-005:canonical-outcome-11",
        "br-fmt-005:canonical-outcome-12",
        "br-fmt-005:canonical-outcome-13",
        "br-fmt-005:canonical-outcome-14",
        "br-fmt-005:canonical-outcome-2",
        "br-fmt-005:canonical-outcome-3",
        "br-fmt-005:canonical-outcome-4",
        "br-fmt-005:canonical-outcome-5",
        "br-fmt-005:canonical-outcome-6",
        "br-fmt-005:canonical-outcome-7",
        "br-fmt-005:canonical-outcome-8",
        "br-fmt-005:canonical-outcome-9"
      ],
      "businessRuleAssertionIdsObserved": [
        "br-fmt-005:canonical-outcome-1",
        "br-fmt-005:canonical-outcome-10",
        "br-fmt-005:canonical-outcome-11",
        "br-fmt-005:canonical-outcome-12",
        "br-fmt-005:canonical-outcome-13",
        "br-fmt-005:canonical-outcome-14",
        "br-fmt-005:canonical-outcome-2",
        "br-fmt-005:canonical-outcome-3",
        "br-fmt-005:canonical-outcome-4",
        "br-fmt-005:canonical-outcome-5",
        "br-fmt-005:canonical-outcome-6",
        "br-fmt-005:canonical-outcome-7",
        "br-fmt-005:canonical-outcome-8",
        "br-fmt-005:canonical-outcome-9"
      ],
      "businessRuleUiEvidenceIds": [
        "TC-ITEM-PKG-020-runtime-evidence"
      ],
      "businessRuleApiEvidenceIds": [],
      "businessRuleDownstreamEvidenceIds": [],
      "businessRuleCleanup": {
        "required": false,
        "apiZeroResidue": false,
        "uiZeroResidue": false
      },
      "observedStatement": "价格 0.00 可保存并展示 2 位小数；超过 2 位小数按四舍五入保存，API 与重新进入页面回显舍入后的金额"
    },
    "semanticCaseFingerprint": "0a1a9b6347bd0bf0e3008baa795d2943aa07d5e2a0547ab869ebd9c9a3d920de"
  },
  {
    "caseId": "TC-ITEM-PKG-021",
    "title": "套餐商品名称首尾空格校验及 100 字符上限",
    "irConverted": true,
    "reviewDecision": "approved",
    "automationClassification": "blocked",
    "recipeId": "product-center:green-draft:at47:tc-item-pkg-021",
    "recipeInventory": {
      "any": 1,
      "enabled": 1,
      "semanticComplete": 0,
      "files": [
        "contracts/product-center/recipes/green-drafts/product-center-item-green-binding-draft-recipes.json"
      ]
    },
    "blockingReasons": [
      "ASSERTION_CONTRACT_REQUIRED",
      "RUNTIME_EVIDENCE_REQUIRED"
    ],
    "family": "package",
    "action": null,
    "runtimeReadiness": "ready",
    "runtimeStatus": "runtime-passed",
    "handlerId": "product-center:green-draft:at47:tc-item-pkg-021",
    "bindingFingerprint": "fa126b1f6dd0304ce090f706dda4f8d87816fb6144bd36910696ab443c0a606b",
    "implementationFingerprint": "fa5fc5479f8a2f92491688f1591270bd3f12e29eb3fe37172bb54403ab09cd70",
    "assertionIds": [
      "TC-ITEM-PKG-021:expectation-1"
    ],
    "semanticCaseFingerprint": "ff43e248ea2e7bf1b3d7cf6952d16a033cd5fffbca0f4ae093fec8614a85bbb1"
  },
  {
    "caseId": "TC-ITEM-PKG-076",
    "title": "套餐商品名称首尾含空格时保存失败",
    "irConverted": true,
    "reviewDecision": "approved",
    "automationClassification": "blocked",
    "recipeId": null,
    "recipeInventory": {
      "any": 0,
      "enabled": 0,
      "semanticComplete": 0,
      "files": []
    },
    "blockingReasons": [
      "RECIPE_REQUIRED"
    ],
    "family": "package",
    "action": null,
    "runtimeReadiness": "ready",
    "runtimeStatus": "runtime-passed",
    "handlerId": "item-216:TC-ITEM-PKG-076",
    "bindingFingerprint": "fa126b1f6dd0304ce090f706dda4f8d87816fb6144bd36910696ab443c0a606b",
    "implementationFingerprint": "fa5fc5479f8a2f92491688f1591270bd3f12e29eb3fe37172bb54403ab09cd70",
    "assertionIds": [
      "TC-ITEM-PKG-076:expectation-1",
      "TC-ITEM-PKG-076:expectation-2",
      "TC-ITEM-PKG-076:expectation-3"
    ],
    "semanticCaseFingerprint": "33e18bfd08dc0e775af4cb446a3081c26449e42f5f6eec82c680748feb08706a"
  },
  {
    "caseId": "TC-ITEM-PKG-022",
    "title": "套餐商品 POS 名称和送厨名称超长及特殊字符保存后自动格式化",
    "irConverted": true,
    "reviewDecision": "approved",
    "automationClassification": "blocked",
    "recipeId": "product-center:green-draft:at47:tc-item-pkg-022",
    "recipeInventory": {
      "any": 1,
      "enabled": 1,
      "semanticComplete": 0,
      "files": [
        "contracts/product-center/recipes/green-drafts/product-center-item-green-binding-draft-recipes.json"
      ]
    },
    "blockingReasons": [
      "ASSERTION_CONTRACT_REQUIRED",
      "RUNTIME_EVIDENCE_REQUIRED"
    ],
    "family": "package",
    "action": null,
    "runtimeReadiness": "ready",
    "runtimeStatus": "runtime-passed",
    "handlerId": "product-center:green-draft:at47:tc-item-pkg-022",
    "bindingFingerprint": "fa126b1f6dd0304ce090f706dda4f8d87816fb6144bd36910696ab443c0a606b",
    "implementationFingerprint": "fa5fc5479f8a2f92491688f1591270bd3f12e29eb3fe37172bb54403ab09cd70",
    "assertionIds": [
      "TC-ITEM-PKG-022:expectation-1",
      "TC-ITEM-PKG-022:expectation-2",
      "TC-ITEM-PKG-022:expectation-3"
    ],
    "semanticCaseFingerprint": "2d8cf7cfd0bd8ab28e478fecadeddea6b1ac0db437b3c64f03792f8142fa4a5c"
  },
  {
    "caseId": "TC-ITEM-PKG-023",
    "title": "套餐商品助记码超过 20 字符时保存失败",
    "irConverted": true,
    "reviewDecision": "approved",
    "automationClassification": "blocked",
    "recipeId": "product-center:green-draft:at45:tc-item-pkg-023",
    "recipeInventory": {
      "any": 1,
      "enabled": 1,
      "semanticComplete": 0,
      "files": [
        "contracts/product-center/recipes/green-drafts/product-center-item-green-binding-draft-recipes.json"
      ]
    },
    "blockingReasons": [
      "ASSERTION_CONTRACT_REQUIRED",
      "RUNTIME_EVIDENCE_REQUIRED"
    ],
    "family": "package",
    "action": null,
    "runtimeReadiness": "ready",
    "runtimeStatus": "runtime-passed",
    "handlerId": "product-center:green-draft:at45:tc-item-pkg-023",
    "bindingFingerprint": "fa126b1f6dd0304ce090f706dda4f8d87816fb6144bd36910696ab443c0a606b",
    "implementationFingerprint": "fa5fc5479f8a2f92491688f1591270bd3f12e29eb3fe37172bb54403ab09cd70",
    "assertionIds": [
      "TC-ITEM-PKG-023:expectation-1"
    ],
    "semanticCaseFingerprint": "172e878b87f9b640d31626512179b5cef5b3c74397e48616232b5c81a21894e5"
  },
  {
    "caseId": "TC-ITEM-PKG-024",
    "title": "套餐商品同一一级分类下同名创建失败",
    "irConverted": true,
    "reviewDecision": "approved",
    "automationClassification": "blocked",
    "recipeId": null,
    "recipeInventory": {
      "any": 0,
      "enabled": 0,
      "semanticComplete": 0,
      "files": []
    },
    "blockingReasons": [
      "RECIPE_REQUIRED"
    ],
    "family": "package",
    "action": null,
    "runtimeReadiness": "ready",
    "runtimeStatus": "runtime-passed",
    "handlerId": "item-216:TC-ITEM-PKG-024",
    "bindingFingerprint": "fa126b1f6dd0304ce090f706dda4f8d87816fb6144bd36910696ab443c0a606b",
    "implementationFingerprint": "fa5fc5479f8a2f92491688f1591270bd3f12e29eb3fe37172bb54403ab09cd70",
    "assertionIds": [
      "TC-ITEM-PKG-024:expectation-1",
      "TC-ITEM-PKG-024:expectation-2"
    ],
    "businessRule": {
      "businessRuleId": "BR-ITEM-010",
      "businessRuleFingerprint": "4398349399b4362b465c6b296e9728fe8b915410ead525fe230de611aa3e0462",
      "businessRuleAssertionIdsRequired": [
        "item-name-duplicate:api-error",
        "item-name-duplicate:category-independence",
        "item-name-duplicate:cross-type-rename",
        "item-name-duplicate:list-persistence",
        "item-name-duplicate:record-count",
        "item-name-duplicate:save-feedback",
        "item-name-duplicate:standard-package-cross-type"
      ],
      "businessRuleAssertionIdsObserved": [
        "item-name-duplicate:api-error",
        "item-name-duplicate:category-independence",
        "item-name-duplicate:cross-type-rename",
        "item-name-duplicate:list-persistence",
        "item-name-duplicate:record-count",
        "item-name-duplicate:save-feedback",
        "item-name-duplicate:standard-package-cross-type"
      ],
      "businessRuleUiEvidenceIds": [
        "TC-ITEM-PKG-024-runtime-evidence"
      ],
      "businessRuleApiEvidenceIds": [
        "TC-ITEM-PKG-024-runtime-evidence"
      ],
      "businessRuleDownstreamEvidenceIds": [],
      "businessRuleCleanup": {
        "required": true,
        "apiZeroResidue": false,
        "uiZeroResidue": false
      },
      "observedStatement": "同一商户内标准商品与套餐商品共享名称唯一性空间，彼此及各自同类型创建或编辑同名均失败并提示 BITEM-7014：商品名称与其它类型商品名称重复；加料商品使用独立名称空间，标准商品或套餐商品在创建及编辑改名时均可与加料商品同名，但加料商品之间创建或编辑同名均失败；分类不参与判重；同类型无重复时允许改名，编辑失败原名称保持不变"
    },
    "semanticCaseFingerprint": "13abf30d05cf533d290b2530519946bb93d8c6573afc67276085956fd331ecd8"
  },
  {
    "caseId": "TC-ITEM-PKG-025",
    "title": "套餐商品同商户同类型同名创建失败",
    "irConverted": true,
    "reviewDecision": "approved",
    "automationClassification": "blocked",
    "recipeId": null,
    "recipeInventory": {
      "any": 0,
      "enabled": 0,
      "semanticComplete": 0,
      "files": []
    },
    "blockingReasons": [
      "RECIPE_REQUIRED"
    ],
    "family": "package",
    "action": null,
    "runtimeReadiness": "ready",
    "runtimeStatus": "runtime-passed",
    "handlerId": "item-216:TC-ITEM-PKG-025",
    "bindingFingerprint": "fa126b1f6dd0304ce090f706dda4f8d87816fb6144bd36910696ab443c0a606b",
    "implementationFingerprint": "fa5fc5479f8a2f92491688f1591270bd3f12e29eb3fe37172bb54403ab09cd70",
    "assertionIds": [
      "TC-ITEM-PKG-025:expectation-1",
      "TC-ITEM-PKG-025:expectation-2",
      "TC-ITEM-PKG-025:expectation-3"
    ],
    "businessRule": {
      "businessRuleId": "BR-ITEM-010",
      "businessRuleFingerprint": "4398349399b4362b465c6b296e9728fe8b915410ead525fe230de611aa3e0462",
      "businessRuleAssertionIdsRequired": [
        "item-name-duplicate:api-error",
        "item-name-duplicate:category-independence",
        "item-name-duplicate:cross-type-rename",
        "item-name-duplicate:list-persistence",
        "item-name-duplicate:record-count",
        "item-name-duplicate:save-feedback",
        "item-name-duplicate:standard-package-cross-type"
      ],
      "businessRuleAssertionIdsObserved": [
        "item-name-duplicate:api-error",
        "item-name-duplicate:category-independence",
        "item-name-duplicate:cross-type-rename",
        "item-name-duplicate:list-persistence",
        "item-name-duplicate:record-count",
        "item-name-duplicate:save-feedback",
        "item-name-duplicate:standard-package-cross-type"
      ],
      "businessRuleUiEvidenceIds": [
        "TC-ITEM-PKG-025-runtime-evidence"
      ],
      "businessRuleApiEvidenceIds": [
        "TC-ITEM-PKG-025-runtime-evidence"
      ],
      "businessRuleDownstreamEvidenceIds": [],
      "businessRuleCleanup": {
        "required": true,
        "apiZeroResidue": false,
        "uiZeroResidue": false
      },
      "observedStatement": "同一商户内标准商品与套餐商品共享名称唯一性空间，彼此及各自同类型创建或编辑同名均失败并提示 BITEM-7014：商品名称与其它类型商品名称重复；加料商品使用独立名称空间，标准商品或套餐商品在创建及编辑改名时均可与加料商品同名，但加料商品之间创建或编辑同名均失败；分类不参与判重；同类型无重复时允许改名，编辑失败原名称保持不变"
    },
    "semanticCaseFingerprint": "c2820f3835a0b33bc4815a036378169e9d6b19990925d1ddd228a38548c85091"
  },
  {
    "caseId": "TC-ITEM-PKG-026",
    "title": "套餐商品商品第二名称与商品名称互相不可重复",
    "irConverted": true,
    "reviewDecision": "approved",
    "automationClassification": "blocked",
    "recipeId": null,
    "recipeInventory": {
      "any": 0,
      "enabled": 0,
      "semanticComplete": 0,
      "files": []
    },
    "blockingReasons": [
      "RECIPE_REQUIRED"
    ],
    "family": "package",
    "action": null,
    "runtimeReadiness": "ready",
    "runtimeStatus": "runtime-passed",
    "handlerId": "item-216:TC-ITEM-PKG-026",
    "bindingFingerprint": "fa126b1f6dd0304ce090f706dda4f8d87816fb6144bd36910696ab443c0a606b",
    "implementationFingerprint": "fa5fc5479f8a2f92491688f1591270bd3f12e29eb3fe37172bb54403ab09cd70",
    "assertionIds": [
      "TC-ITEM-PKG-026:expectation-1",
      "TC-ITEM-PKG-026:expectation-2",
      "TC-ITEM-PKG-026:expectation-3"
    ],
    "semanticCaseFingerprint": "41cce378a969d1a22e0644338bfdf74b2866c3c6f86e634e675b3a9a9b0d49a0"
  },
  {
    "caseId": "TC-ITEM-PKG-027",
    "title": "套餐商品描述达到500字符后输入框不可继续录入",
    "irConverted": true,
    "reviewDecision": "approved",
    "automationClassification": "blocked",
    "recipeId": "product-center:green-draft:at45:tc-item-pkg-027",
    "recipeInventory": {
      "any": 1,
      "enabled": 1,
      "semanticComplete": 0,
      "files": [
        "contracts/product-center/recipes/green-drafts/product-center-item-green-binding-draft-recipes.json"
      ]
    },
    "blockingReasons": [
      "ASSERTION_CONTRACT_REQUIRED",
      "RUNTIME_EVIDENCE_REQUIRED"
    ],
    "family": "package",
    "action": null,
    "runtimeReadiness": "ready",
    "runtimeStatus": "runtime-passed",
    "handlerId": "product-center:green-draft:at45:tc-item-pkg-027",
    "bindingFingerprint": "fa126b1f6dd0304ce090f706dda4f8d87816fb6144bd36910696ab443c0a606b",
    "implementationFingerprint": "fa5fc5479f8a2f92491688f1591270bd3f12e29eb3fe37172bb54403ab09cd70",
    "assertionIds": [
      "TC-ITEM-PKG-027:expectation-1"
    ],
    "semanticCaseFingerprint": "b30706ec4df2bde106747e3481fe24d96d4a218be1cdd49d4240994fa76fde2c"
  },
  {
    "caseId": "TC-ITEM-PKG-028",
    "title": "套餐商品最多保存 10 张有效详情图片",
    "irConverted": true,
    "reviewDecision": "approved",
    "automationClassification": "blocked",
    "recipeId": "product-center:green-draft:at45:tc-item-pkg-028",
    "recipeInventory": {
      "any": 1,
      "enabled": 1,
      "semanticComplete": 0,
      "files": [
        "contracts/product-center/recipes/green-drafts/product-center-item-green-binding-draft-recipes.json"
      ]
    },
    "blockingReasons": [
      "ASSERTION_CONTRACT_REQUIRED",
      "RUNTIME_EVIDENCE_REQUIRED"
    ],
    "family": "package",
    "action": null,
    "runtimeReadiness": "ready",
    "runtimeStatus": "runtime-passed",
    "handlerId": "product-center:green-draft:at45:tc-item-pkg-028",
    "bindingFingerprint": "fa126b1f6dd0304ce090f706dda4f8d87816fb6144bd36910696ab443c0a606b",
    "implementationFingerprint": "fa5fc5479f8a2f92491688f1591270bd3f12e29eb3fe37172bb54403ab09cd70",
    "assertionIds": [
      "TC-ITEM-PKG-028:expectation-1"
    ],
    "semanticCaseFingerprint": "44f360f7b4e5d5fe7d1ed139e5620bc519969febda355a4b925f8564b52e8c1f"
  },
  {
    "caseId": "TC-ITEM-PKG-029",
    "title": "套餐商品描述标签多选保存成功",
    "irConverted": true,
    "reviewDecision": "approved",
    "automationClassification": "blocked",
    "recipeId": "product-center:green-draft:at47:tc-item-pkg-029",
    "recipeInventory": {
      "any": 1,
      "enabled": 1,
      "semanticComplete": 0,
      "files": [
        "contracts/product-center/recipes/green-drafts/product-center-item-green-binding-draft-recipes.json"
      ]
    },
    "blockingReasons": [
      "ASSERTION_CONTRACT_REQUIRED",
      "RUNTIME_EVIDENCE_REQUIRED"
    ],
    "family": "package",
    "action": null,
    "runtimeReadiness": "ready",
    "runtimeStatus": "runtime-passed",
    "handlerId": "product-center:green-draft:at47:tc-item-pkg-029",
    "bindingFingerprint": "fa126b1f6dd0304ce090f706dda4f8d87816fb6144bd36910696ab443c0a606b",
    "implementationFingerprint": "fa5fc5479f8a2f92491688f1591270bd3f12e29eb3fe37172bb54403ab09cd70",
    "assertionIds": [
      "TC-ITEM-PKG-029:expectation-1",
      "TC-ITEM-PKG-029:expectation-2"
    ],
    "semanticCaseFingerprint": "7a0cc0a8f497f41cc787b0dc5b4d927c4608e2217925332042c7de03f33fb651"
  },
  {
    "caseId": "TC-ITEM-PKG-030",
    "title": "套餐商品商品角标单选保存成功",
    "irConverted": true,
    "reviewDecision": "approved",
    "automationClassification": "blocked",
    "recipeId": "product-center:green-draft:at47:tc-item-pkg-030",
    "recipeInventory": {
      "any": 1,
      "enabled": 1,
      "semanticComplete": 0,
      "files": [
        "contracts/product-center/recipes/green-drafts/product-center-item-green-binding-draft-recipes.json"
      ]
    },
    "blockingReasons": [
      "ASSERTION_CONTRACT_REQUIRED",
      "RUNTIME_EVIDENCE_REQUIRED"
    ],
    "family": "package",
    "action": null,
    "runtimeReadiness": "ready",
    "runtimeStatus": "runtime-passed",
    "handlerId": "product-center:green-draft:at47:tc-item-pkg-030",
    "bindingFingerprint": "fa126b1f6dd0304ce090f706dda4f8d87816fb6144bd36910696ab443c0a606b",
    "implementationFingerprint": "fa5fc5479f8a2f92491688f1591270bd3f12e29eb3fe37172bb54403ab09cd70",
    "assertionIds": [
      "TC-ITEM-PKG-030:expectation-1",
      "TC-ITEM-PKG-030:expectation-2"
    ],
    "semanticCaseFingerprint": "0cf9a8bca93c503eb9c6c394275aa31e679441f8ffe4b0e13b44e33db4c94e1a"
  },
  {
    "caseId": "TC-ITEM-PKG-031",
    "title": "套餐商品统计标签多选保存成功",
    "irConverted": true,
    "reviewDecision": "approved",
    "automationClassification": "blocked",
    "recipeId": "product-center:green-draft:at47:tc-item-pkg-031",
    "recipeInventory": {
      "any": 1,
      "enabled": 1,
      "semanticComplete": 0,
      "files": [
        "contracts/product-center/recipes/green-drafts/product-center-item-green-binding-draft-recipes.json"
      ]
    },
    "blockingReasons": [
      "ASSERTION_CONTRACT_REQUIRED",
      "RUNTIME_EVIDENCE_REQUIRED"
    ],
    "family": "package",
    "action": null,
    "runtimeReadiness": "ready",
    "runtimeStatus": "runtime-passed",
    "handlerId": "product-center:green-draft:at47:tc-item-pkg-031",
    "bindingFingerprint": "fa126b1f6dd0304ce090f706dda4f8d87816fb6144bd36910696ab443c0a606b",
    "implementationFingerprint": "fa5fc5479f8a2f92491688f1591270bd3f12e29eb3fe37172bb54403ab09cd70",
    "assertionIds": [
      "TC-ITEM-PKG-031:expectation-1",
      "TC-ITEM-PKG-031:expectation-2"
    ],
    "semanticCaseFingerprint": "ceccd0936aa4b77c89837db7280cae1f4752c7890ec973c0278319efc5ec45cc"
  },
  {
    "caseId": "TC-ITEM-PKG-032",
    "title": "套餐商品配置材料信息后保存成功",
    "irConverted": true,
    "reviewDecision": "approved",
    "automationClassification": "blocked",
    "recipeId": "product-center:green-draft:at47:tc-item-pkg-032",
    "recipeInventory": {
      "any": 1,
      "enabled": 1,
      "semanticComplete": 0,
      "files": [
        "contracts/product-center/recipes/green-drafts/product-center-item-green-binding-draft-recipes.json"
      ]
    },
    "blockingReasons": [
      "ASSERTION_CONTRACT_REQUIRED",
      "RUNTIME_EVIDENCE_REQUIRED"
    ],
    "family": "package",
    "action": null,
    "runtimeReadiness": "ready",
    "runtimeStatus": "runtime-passed",
    "handlerId": "product-center:green-draft:at47:tc-item-pkg-032",
    "bindingFingerprint": "fa126b1f6dd0304ce090f706dda4f8d87816fb6144bd36910696ab443c0a606b",
    "implementationFingerprint": "fa5fc5479f8a2f92491688f1591270bd3f12e29eb3fe37172bb54403ab09cd70",
    "assertionIds": [
      "TC-ITEM-PKG-032:expectation-1",
      "TC-ITEM-PKG-032:expectation-2"
    ],
    "semanticCaseFingerprint": "5101983f8216e228f8cdfa2fbd0e6d79b6f65d366edeedb783c001b07e0d8bfc"
  },
  {
    "caseId": "TC-ITEM-PKG-033",
    "title": "套餐商品从图片库选择主图后创建成功",
    "irConverted": true,
    "reviewDecision": "approved",
    "automationClassification": "blocked",
    "recipeId": "product-center:green-draft:at43:tc-item-pkg-033",
    "recipeInventory": {
      "any": 1,
      "enabled": 1,
      "semanticComplete": 0,
      "files": [
        "contracts/product-center/recipes/green-drafts/product-center-item-green-binding-draft-recipes.json"
      ]
    },
    "blockingReasons": [
      "ASSERTION_CONTRACT_REQUIRED",
      "RUNTIME_EVIDENCE_REQUIRED"
    ],
    "family": "package",
    "action": null,
    "runtimeReadiness": "ready",
    "runtimeStatus": "runtime-passed",
    "handlerId": "product-center:green-draft:at43:tc-item-pkg-033",
    "bindingFingerprint": "fa126b1f6dd0304ce090f706dda4f8d87816fb6144bd36910696ab443c0a606b",
    "implementationFingerprint": "fa5fc5479f8a2f92491688f1591270bd3f12e29eb3fe37172bb54403ab09cd70",
    "assertionIds": [
      "TC-ITEM-PKG-033:expectation-1",
      "TC-ITEM-PKG-033:expectation-2",
      "TC-ITEM-PKG-033:expectation-3"
    ],
    "semanticCaseFingerprint": "102096ad6a481b349025af16f83195ef18465449c3495b1b97e0f2c40dfe0714"
  },
  {
    "caseId": "TC-ITEM-PKG-034",
    "title": "套餐商品列表按名称类型分类状态组合查询成功",
    "irConverted": true,
    "reviewDecision": "approved",
    "automationClassification": "blocked",
    "recipeId": "product-center:green-draft:at50:tc-item-pkg-034",
    "recipeInventory": {
      "any": 1,
      "enabled": 1,
      "semanticComplete": 0,
      "files": [
        "contracts/product-center/recipes/green-drafts/product-center-item-green-binding-draft-recipes.json"
      ]
    },
    "blockingReasons": [
      "ASSERTION_CONTRACT_REQUIRED",
      "RUNTIME_EVIDENCE_REQUIRED"
    ],
    "family": "package",
    "action": null,
    "runtimeReadiness": "ready",
    "runtimeStatus": "runtime-passed",
    "handlerId": "product-center:green-draft:at50:tc-item-pkg-034",
    "bindingFingerprint": "fa126b1f6dd0304ce090f706dda4f8d87816fb6144bd36910696ab443c0a606b",
    "implementationFingerprint": "fa5fc5479f8a2f92491688f1591270bd3f12e29eb3fe37172bb54403ab09cd70",
    "assertionIds": [
      "TC-ITEM-PKG-034:expectation-1",
      "TC-ITEM-PKG-034:expectation-2"
    ],
    "businessRule": {
      "businessRuleId": "BR-FMT-009",
      "businessRuleFingerprint": "7a0672cb003cac8cfdf537cfdf0e5233ad5acbedf28c14561f6d763608da99d2",
      "businessRuleAssertionIdsRequired": [
        "br-fmt-009:canonical-outcome-1",
        "br-fmt-009:canonical-outcome-10",
        "br-fmt-009:canonical-outcome-11",
        "br-fmt-009:canonical-outcome-12",
        "br-fmt-009:canonical-outcome-13",
        "br-fmt-009:canonical-outcome-2",
        "br-fmt-009:canonical-outcome-3",
        "br-fmt-009:canonical-outcome-4",
        "br-fmt-009:canonical-outcome-5",
        "br-fmt-009:canonical-outcome-6",
        "br-fmt-009:canonical-outcome-7",
        "br-fmt-009:canonical-outcome-8",
        "br-fmt-009:canonical-outcome-9"
      ],
      "businessRuleAssertionIdsObserved": [
        "br-fmt-009:canonical-outcome-1",
        "br-fmt-009:canonical-outcome-10",
        "br-fmt-009:canonical-outcome-11",
        "br-fmt-009:canonical-outcome-12",
        "br-fmt-009:canonical-outcome-13",
        "br-fmt-009:canonical-outcome-2",
        "br-fmt-009:canonical-outcome-3",
        "br-fmt-009:canonical-outcome-4",
        "br-fmt-009:canonical-outcome-5",
        "br-fmt-009:canonical-outcome-6",
        "br-fmt-009:canonical-outcome-7",
        "br-fmt-009:canonical-outcome-8",
        "br-fmt-009:canonical-outcome-9"
      ],
      "businessRuleUiEvidenceIds": [
        "TC-ITEM-PKG-034-runtime-evidence"
      ],
      "businessRuleApiEvidenceIds": [],
      "businessRuleDownstreamEvidenceIds": [],
      "businessRuleCleanup": {
        "required": false,
        "apiZeroResidue": false,
        "uiZeroResidue": false
      },
      "observedStatement": "查询、筛选或重置后列表回到第 1 页；筛选项变更自动刷新；重置清空条件并恢复全量结果"
    },
    "semanticCaseFingerprint": "795f53666906f7bb116e3188629a6ab5dd5e0742012f897fc10569ccfc95fdab"
  },
  {
    "caseId": "TC-ITEM-PKG-035",
    "title": "套餐编辑基础信息并删除主图后允许无图",
    "irConverted": true,
    "reviewDecision": "approved",
    "automationClassification": "blocked",
    "recipeId": null,
    "recipeInventory": {
      "any": 0,
      "enabled": 0,
      "semanticComplete": 0,
      "files": []
    },
    "blockingReasons": [
      "RECIPE_REQUIRED"
    ],
    "family": "package",
    "action": null,
    "runtimeReadiness": "ready",
    "runtimeStatus": "runtime-passed",
    "handlerId": "item-216:TC-ITEM-PKG-035",
    "bindingFingerprint": "fa126b1f6dd0304ce090f706dda4f8d87816fb6144bd36910696ab443c0a606b",
    "implementationFingerprint": "fa5fc5479f8a2f92491688f1591270bd3f12e29eb3fe37172bb54403ab09cd70",
    "assertionIds": [
      "TC-ITEM-PKG-035:expectation-1"
    ],
    "semanticCaseFingerprint": "9496bf8b225fa18d77fc4e2e42ffec045b9bab4b3be033596c6659aeb0195e08"
  },
  {
    "caseId": "TC-ITEM-PKG-036",
    "title": "套餐商品编辑其他信息后保存成功",
    "irConverted": true,
    "reviewDecision": "approved",
    "automationClassification": "blocked",
    "recipeId": "product-center:yellow-probe:at35:tc-item-pkg-036",
    "recipeInventory": {
      "any": 1,
      "enabled": 0,
      "semanticComplete": 0,
      "files": [
        "contracts/product-center/recipes/yellow-probes/product-center-item-yellow-representative-probe-recipes.json"
      ]
    },
    "blockingReasons": [
      "RECIPE_GENERATION_DISABLED",
      "ASSERTION_CONTRACT_REQUIRED"
    ],
    "family": "package",
    "action": null,
    "runtimeReadiness": "ready",
    "runtimeStatus": "runtime-passed",
    "handlerId": "product-center:yellow-probe:at35:tc-item-pkg-036",
    "bindingFingerprint": "fa126b1f6dd0304ce090f706dda4f8d87816fb6144bd36910696ab443c0a606b",
    "implementationFingerprint": "fa5fc5479f8a2f92491688f1591270bd3f12e29eb3fe37172bb54403ab09cd70",
    "assertionIds": [
      "TC-ITEM-PKG-036:expectation-1",
      "TC-ITEM-PKG-036:expectation-2"
    ],
    "semanticCaseFingerprint": "e804e3853adeb29bd71749d1f0148196e826ab15c61ec50bde5abf46265d44dc"
  },
  {
    "caseId": "TC-ITEM-PKG-037",
    "title": "套餐商品无引用时删除成功",
    "irConverted": true,
    "reviewDecision": "approved",
    "automationClassification": "blocked",
    "recipeId": null,
    "recipeInventory": {
      "any": 0,
      "enabled": 0,
      "semanticComplete": 0,
      "files": []
    },
    "blockingReasons": [
      "RECIPE_REQUIRED"
    ],
    "family": "package",
    "action": null,
    "runtimeReadiness": "ready",
    "runtimeStatus": "runtime-passed",
    "handlerId": "item-216:TC-ITEM-PKG-037",
    "bindingFingerprint": "fa126b1f6dd0304ce090f706dda4f8d87816fb6144bd36910696ab443c0a606b",
    "implementationFingerprint": "fa5fc5479f8a2f92491688f1591270bd3f12e29eb3fe37172bb54403ab09cd70",
    "assertionIds": [
      "TC-ITEM-PKG-037:expectation-1",
      "TC-ITEM-PKG-037:expectation-2",
      "TC-ITEM-PKG-037:expectation-3"
    ],
    "semanticCaseFingerprint": "b220575f695d61ebd9f78058e3dab90c3e48c18635503603c6acf5a3f76267b6"
  },
  {
    "caseId": "TC-ITEM-PKG-038",
    "title": "套餐商品被菜单引用时不可删除",
    "irConverted": true,
    "reviewDecision": "approved",
    "automationClassification": "blocked",
    "recipeId": null,
    "recipeInventory": {
      "any": 0,
      "enabled": 0,
      "semanticComplete": 0,
      "files": []
    },
    "blockingReasons": [
      "RECIPE_REQUIRED"
    ],
    "family": "package",
    "action": null,
    "runtimeReadiness": "ready",
    "runtimeStatus": "runtime-passed",
    "handlerId": "item-216:TC-ITEM-PKG-038",
    "bindingFingerprint": "fa126b1f6dd0304ce090f706dda4f8d87816fb6144bd36910696ab443c0a606b",
    "implementationFingerprint": "fa5fc5479f8a2f92491688f1591270bd3f12e29eb3fe37172bb54403ab09cd70",
    "assertionIds": [
      "TC-ITEM-PKG-038:expectation-1",
      "TC-ITEM-PKG-038:expectation-2"
    ],
    "semanticCaseFingerprint": "80f8249862f7996b7192aac484458e179f3975d8d45652d81208942064e901bc"
  },
  {
    "caseId": "TC-ITEM-PKG-039",
    "title": "菜单引用中的套餐商品不可停用",
    "irConverted": true,
    "reviewDecision": "approved",
    "automationClassification": "blocked",
    "recipeId": null,
    "recipeInventory": {
      "any": 0,
      "enabled": 0,
      "semanticComplete": 0,
      "files": []
    },
    "blockingReasons": [
      "RECIPE_REQUIRED"
    ],
    "family": "package",
    "action": null,
    "runtimeReadiness": "ready",
    "runtimeStatus": "deferred",
    "handlerId": "item-216:TC-ITEM-PKG-039",
    "bindingFingerprint": "fa126b1f6dd0304ce090f706dda4f8d87816fb6144bd36910696ab443c0a606b",
    "implementationFingerprint": "fa5fc5479f8a2f92491688f1591270bd3f12e29eb3fe37172bb54403ab09cd70",
    "assertionIds": [
      "TC-ITEM-PKG-039:expectation-1",
      "TC-ITEM-PKG-039:expectation-2",
      "TC-ITEM-PKG-039:expectation-3"
    ],
    "semanticCaseFingerprint": "ab8aee8a60d0e19c0ca7ad2453ba35d8d35b44212dd9a20a3232ef039795e9f8"
  },
  {
    "caseId": "TC-ITEM-PKG-040",
    "title": "未选择套餐组时确认按钮不可点击",
    "irConverted": true,
    "reviewDecision": "approved",
    "automationClassification": "strict-generatable",
    "recipeId": "product-center:item-combo-api-closure:TC-ITEM-PKG-040",
    "recipeInventory": {
      "any": 2,
      "enabled": 2,
      "semanticComplete": 1,
      "files": [
        "contracts/product-center/recipes/product-center-item-combo-api-closure-recipes.json",
        "contracts/product-center/recipes/product-center-item-p0-wave-a-recipes.json"
      ]
    },
    "blockingReasons": [],
    "family": "package",
    "action": null,
    "runtimeReadiness": "ready",
    "runtimeStatus": "runtime-passed",
    "handlerId": "product-center:item-combo-api-closure:TC-ITEM-PKG-040",
    "bindingFingerprint": "fa126b1f6dd0304ce090f706dda4f8d87816fb6144bd36910696ab443c0a606b",
    "implementationFingerprint": "fa5fc5479f8a2f92491688f1591270bd3f12e29eb3fe37172bb54403ab09cd70",
    "assertionIds": [
      "TC-ITEM-PKG-040:expectation-1"
    ],
    "semanticCaseFingerprint": "47b231e8274cc61ad7012df6c4fd65c80b7f369c9190386f96b8e4ca36e0640a"
  },
  {
    "caseId": "TC-ITEM-PKG-041",
    "title": "选择套餐组后确认按钮可点击并返回创建页",
    "irConverted": true,
    "reviewDecision": "approved",
    "automationClassification": "strict-generatable",
    "recipeId": "product-center:item-combo-api-closure:TC-ITEM-PKG-041",
    "recipeInventory": {
      "any": 2,
      "enabled": 2,
      "semanticComplete": 1,
      "files": [
        "contracts/product-center/recipes/product-center-item-combo-api-closure-recipes.json",
        "contracts/product-center/recipes/product-center-item-p0-wave-a-recipes.json"
      ]
    },
    "blockingReasons": [],
    "family": "package",
    "action": null,
    "runtimeReadiness": "ready",
    "runtimeStatus": "runtime-passed",
    "handlerId": "product-center:item-combo-api-closure:TC-ITEM-PKG-041",
    "bindingFingerprint": "fa126b1f6dd0304ce090f706dda4f8d87816fb6144bd36910696ab443c0a606b",
    "implementationFingerprint": "fa5fc5479f8a2f92491688f1591270bd3f12e29eb3fe37172bb54403ab09cd70",
    "assertionIds": [
      "TC-ITEM-PKG-041:expectation-1",
      "TC-ITEM-PKG-041:expectation-2"
    ],
    "semanticCaseFingerprint": "386ab238a38c16adbb434796ab820dfa91fe107f2163dca03b5e60cf73893d7d"
  },
  {
    "caseId": "TC-ITEM-PKG-042",
    "title": "已选固定搭配套餐组可从右侧移除",
    "irConverted": true,
    "reviewDecision": "approved",
    "automationClassification": "blocked",
    "recipeId": "product-center:yellow-probe:at44:tc-item-pkg-042",
    "recipeInventory": {
      "any": 1,
      "enabled": 0,
      "semanticComplete": 0,
      "files": [
        "contracts/product-center/recipes/yellow-probes/product-center-item-yellow-representative-probe-recipes.json"
      ]
    },
    "blockingReasons": [
      "RECIPE_GENERATION_DISABLED",
      "ASSERTION_CONTRACT_REQUIRED"
    ],
    "family": "package",
    "action": null,
    "runtimeReadiness": "ready",
    "runtimeStatus": "runtime-passed",
    "handlerId": "product-center:yellow-probe:at44:tc-item-pkg-042",
    "bindingFingerprint": "fa126b1f6dd0304ce090f706dda4f8d87816fb6144bd36910696ab443c0a606b",
    "implementationFingerprint": "fa5fc5479f8a2f92491688f1591270bd3f12e29eb3fe37172bb54403ab09cd70",
    "assertionIds": [
      "TC-ITEM-PKG-042:expectation-1",
      "TC-ITEM-PKG-042:expectation-2"
    ],
    "semanticCaseFingerprint": "55ff9a7dd21755eb686c04f15a04c88cfdccbc624bb3683f7d80d94e7e2afa3d"
  },
  {
    "caseId": "TC-ITEM-PKG-043",
    "title": "已选组合搭配套餐组可从右侧移除",
    "irConverted": true,
    "reviewDecision": "approved",
    "automationClassification": "blocked",
    "recipeId": "product-center:yellow-probe:at44:tc-item-pkg-043",
    "recipeInventory": {
      "any": 1,
      "enabled": 0,
      "semanticComplete": 0,
      "files": [
        "contracts/product-center/recipes/yellow-probes/product-center-item-yellow-representative-probe-recipes.json"
      ]
    },
    "blockingReasons": [
      "RECIPE_GENERATION_DISABLED",
      "ASSERTION_CONTRACT_REQUIRED"
    ],
    "family": "package",
    "action": null,
    "runtimeReadiness": "ready",
    "runtimeStatus": "runtime-passed",
    "handlerId": "product-center:yellow-probe:at44:tc-item-pkg-043",
    "bindingFingerprint": "fa126b1f6dd0304ce090f706dda4f8d87816fb6144bd36910696ab443c0a606b",
    "implementationFingerprint": "fa5fc5479f8a2f92491688f1591270bd3f12e29eb3fe37172bb54403ab09cd70",
    "assertionIds": [
      "TC-ITEM-PKG-043:expectation-1",
      "TC-ITEM-PKG-043:expectation-2"
    ],
    "semanticCaseFingerprint": "0266c491c1fbeff1889eb741892c907bb0a2d64b81c34227487db7e458e76a5d"
  },
  {
    "caseId": "TC-ITEM-PKG-044",
    "title": "组合搭配套餐组按名称模糊搜索成功",
    "irConverted": true,
    "reviewDecision": "approved",
    "automationClassification": "blocked",
    "recipeId": "product-center:yellow-probe:at36:tc-item-pkg-044",
    "recipeInventory": {
      "any": 1,
      "enabled": 0,
      "semanticComplete": 0,
      "files": [
        "contracts/product-center/recipes/yellow-probes/product-center-item-yellow-representative-probe-recipes.json"
      ]
    },
    "blockingReasons": [
      "RECIPE_GENERATION_DISABLED",
      "ASSERTION_CONTRACT_REQUIRED",
      "RUNTIME_EVIDENCE_REQUIRED"
    ],
    "family": "package",
    "action": null,
    "runtimeReadiness": "ready",
    "runtimeStatus": "runtime-passed",
    "handlerId": "product-center:yellow-probe:at36:tc-item-pkg-044",
    "bindingFingerprint": "fa126b1f6dd0304ce090f706dda4f8d87816fb6144bd36910696ab443c0a606b",
    "implementationFingerprint": "fa5fc5479f8a2f92491688f1591270bd3f12e29eb3fe37172bb54403ab09cd70",
    "assertionIds": [
      "TC-ITEM-PKG-044:expectation-1",
      "TC-ITEM-PKG-044:expectation-2"
    ],
    "semanticCaseFingerprint": "a4ade70a60e19819d3cce3bbf25cdab8df30dde7e2255614f5defde09219bedc"
  },
  {
    "caseId": "TC-ITEM-PKG-045",
    "title": "组合搭配套餐组清空搜索条件后恢复默认列表",
    "irConverted": true,
    "reviewDecision": "approved",
    "automationClassification": "blocked",
    "recipeId": "product-center:yellow-probe:at37:tc-item-pkg-045",
    "recipeInventory": {
      "any": 1,
      "enabled": 0,
      "semanticComplete": 0,
      "files": [
        "contracts/product-center/recipes/yellow-probes/product-center-item-yellow-representative-probe-recipes.json"
      ]
    },
    "blockingReasons": [
      "RECIPE_GENERATION_DISABLED",
      "ASSERTION_CONTRACT_REQUIRED",
      "RUNTIME_EVIDENCE_REQUIRED"
    ],
    "family": "package",
    "action": null,
    "runtimeReadiness": "ready",
    "runtimeStatus": "runtime-passed",
    "handlerId": "product-center:yellow-probe:at37:tc-item-pkg-045",
    "bindingFingerprint": "fa126b1f6dd0304ce090f706dda4f8d87816fb6144bd36910696ab443c0a606b",
    "implementationFingerprint": "fa5fc5479f8a2f92491688f1591270bd3f12e29eb3fe37172bb54403ab09cd70",
    "assertionIds": [
      "TC-ITEM-PKG-045:expectation-1",
      "TC-ITEM-PKG-045:expectation-2"
    ],
    "semanticCaseFingerprint": "4ddedf45411b2023a50153df2cf2ff5d046764a5bcfadd6ca6fbb16d22c2cb26"
  },
  {
    "caseId": "TC-ITEM-PKG-046",
    "title": "套餐商品未添加套餐分组时保存与保存并新建均失败",
    "irConverted": true,
    "reviewDecision": "approved",
    "automationClassification": "strict-generatable",
    "recipeId": "product-center:item-combo-audit:TC-ITEM-PKG-046",
    "recipeInventory": {
      "any": 1,
      "enabled": 1,
      "semanticComplete": 0,
      "files": [
        "contracts/product-center/recipes/product-center-item-combo-audit-probe-recipes.json"
      ]
    },
    "blockingReasons": [],
    "family": "package",
    "action": null,
    "runtimeReadiness": "ready",
    "runtimeStatus": "runtime-passed",
    "handlerId": "product-center:item-combo-audit:TC-ITEM-PKG-046",
    "bindingFingerprint": "fa126b1f6dd0304ce090f706dda4f8d87816fb6144bd36910696ab443c0a606b",
    "implementationFingerprint": "fa5fc5479f8a2f92491688f1591270bd3f12e29eb3fe37172bb54403ab09cd70",
    "assertionIds": [
      "TC-ITEM-PKG-046:expectation-1",
      "TC-ITEM-PKG-046:expectation-2",
      "TC-ITEM-PKG-046:expectation-3",
      "TC-ITEM-PKG-046:expectation-4",
      "TC-ITEM-PKG-046:expectation-5"
    ],
    "businessRule": {
      "businessRuleId": "BR-ITEM-COMBO-GROUP-REQUIRED",
      "businessRuleFingerprint": "f276a75dbc608e47fe3d3e85a32ca34cd2d94a5ebd122a3e6e3470e103576e1f",
      "businessRuleAssertionIdsRequired": [
        "combo-group-required:edit-error",
        "combo-group-required:edit-no-save-and-new",
        "combo-group-required:edit-rollback",
        "combo-group-required:save-and-new-feedback",
        "combo-group-required:save-feedback",
        "combo-group-required:zero-record"
      ],
      "businessRuleAssertionIdsObserved": [
        "combo-group-required:edit-error",
        "combo-group-required:edit-no-save-and-new",
        "combo-group-required:edit-rollback",
        "combo-group-required:save-and-new-feedback",
        "combo-group-required:save-feedback",
        "combo-group-required:zero-record"
      ],
      "businessRuleUiEvidenceIds": [
        "TC-ITEM-PKG-046-runtime-evidence"
      ],
      "businessRuleApiEvidenceIds": [
        "TC-ITEM-PKG-046-runtime-evidence"
      ],
      "businessRuleDownstreamEvidenceIds": [],
      "businessRuleCleanup": {
        "required": false,
        "apiZeroResidue": false,
        "uiZeroResidue": false
      },
      "observedStatement": "创建套餐商品未添加任何套餐分组时，点击保存或保存并新建均不可提交并提示 BITEM-6003：套餐中未找到区块；编辑套餐商品删除全部套餐分组后点击保存同样失败并提示 BITEM-6003，编辑页不提供保存并新建，返回后原商品数据保持不变"
    },
    "semanticCaseFingerprint": "ec0741b514c440ba20ede1a26275390dcd833dcf43318edcfa4ba6af02b5c743"
  },
  {
    "caseId": "TC-ITEM-PKG-047",
    "title": "套餐商品重置查询后页面恢复初始状态",
    "irConverted": true,
    "reviewDecision": "approved",
    "automationClassification": "blocked",
    "recipeId": "product-center:item-p0-wave-b:TC-ITEM-PKG-047",
    "recipeInventory": {
      "any": 1,
      "enabled": 1,
      "semanticComplete": 0,
      "files": [
        "contracts/product-center/recipes/product-center-item-p0-wave-b-recipes.json"
      ]
    },
    "blockingReasons": [
      "ASSERTION_CONTRACT_REQUIRED",
      "RUNTIME_EVIDENCE_REQUIRED"
    ],
    "family": "package",
    "action": null,
    "runtimeReadiness": "ready",
    "runtimeStatus": "runtime-passed",
    "handlerId": "product-center:item-p0-wave-b:TC-ITEM-PKG-047",
    "bindingFingerprint": "fa126b1f6dd0304ce090f706dda4f8d87816fb6144bd36910696ab443c0a606b",
    "implementationFingerprint": "fa5fc5479f8a2f92491688f1591270bd3f12e29eb3fe37172bb54403ab09cd70",
    "assertionIds": [
      "TC-ITEM-PKG-047:expectation-1",
      "TC-ITEM-PKG-047:expectation-2",
      "TC-ITEM-PKG-047:expectation-3"
    ],
    "businessRule": {
      "businessRuleId": "BR-FMT-009",
      "businessRuleFingerprint": "7a0672cb003cac8cfdf537cfdf0e5233ad5acbedf28c14561f6d763608da99d2",
      "businessRuleAssertionIdsRequired": [
        "br-fmt-009:canonical-outcome-1",
        "br-fmt-009:canonical-outcome-10",
        "br-fmt-009:canonical-outcome-11",
        "br-fmt-009:canonical-outcome-12",
        "br-fmt-009:canonical-outcome-13",
        "br-fmt-009:canonical-outcome-2",
        "br-fmt-009:canonical-outcome-3",
        "br-fmt-009:canonical-outcome-4",
        "br-fmt-009:canonical-outcome-5",
        "br-fmt-009:canonical-outcome-6",
        "br-fmt-009:canonical-outcome-7",
        "br-fmt-009:canonical-outcome-8",
        "br-fmt-009:canonical-outcome-9"
      ],
      "businessRuleAssertionIdsObserved": [
        "br-fmt-009:canonical-outcome-1",
        "br-fmt-009:canonical-outcome-10",
        "br-fmt-009:canonical-outcome-11",
        "br-fmt-009:canonical-outcome-12",
        "br-fmt-009:canonical-outcome-13",
        "br-fmt-009:canonical-outcome-2",
        "br-fmt-009:canonical-outcome-3",
        "br-fmt-009:canonical-outcome-4",
        "br-fmt-009:canonical-outcome-5",
        "br-fmt-009:canonical-outcome-6",
        "br-fmt-009:canonical-outcome-7",
        "br-fmt-009:canonical-outcome-8",
        "br-fmt-009:canonical-outcome-9"
      ],
      "businessRuleUiEvidenceIds": [
        "TC-ITEM-PKG-047-runtime-evidence"
      ],
      "businessRuleApiEvidenceIds": [],
      "businessRuleDownstreamEvidenceIds": [],
      "businessRuleCleanup": {
        "required": false,
        "apiZeroResidue": false,
        "uiZeroResidue": false
      },
      "observedStatement": "查询、筛选或重置后列表回到第 1 页；筛选项变更自动刷新；重置清空条件并恢复全量结果"
    },
    "semanticCaseFingerprint": "13ec2a52b99e5de111f5d87cde330449fb8cf26e612d4dbe1bbe9fca7c0d8585"
  },
  {
    "caseId": "TC-ITEM-PKG-048",
    "title": "切换页面返回套餐商品列表时不保留查询条件",
    "irConverted": true,
    "reviewDecision": "approved",
    "automationClassification": "blocked",
    "recipeId": "product-center:yellow-probe:at38:tc-item-pkg-048",
    "recipeInventory": {
      "any": 1,
      "enabled": 0,
      "semanticComplete": 0,
      "files": [
        "contracts/product-center/recipes/yellow-probes/product-center-item-yellow-representative-probe-recipes.json"
      ]
    },
    "blockingReasons": [
      "RECIPE_GENERATION_DISABLED",
      "ASSERTION_CONTRACT_REQUIRED",
      "RUNTIME_EVIDENCE_REQUIRED"
    ],
    "family": "package",
    "action": null,
    "runtimeReadiness": "ready",
    "runtimeStatus": "runtime-passed",
    "handlerId": "product-center:yellow-probe:at38:tc-item-pkg-048",
    "bindingFingerprint": "fa126b1f6dd0304ce090f706dda4f8d87816fb6144bd36910696ab443c0a606b",
    "implementationFingerprint": "fa5fc5479f8a2f92491688f1591270bd3f12e29eb3fe37172bb54403ab09cd70",
    "assertionIds": [
      "TC-ITEM-PKG-048:expectation-1"
    ],
    "semanticCaseFingerprint": "09fee326ea5aff4df65867ceb6dbfec92d850a587366bebb5d049ce08a4d6615"
  },
  {
    "caseId": "TC-ITEM-PKG-049",
    "title": "套餐商品同时引用已有固定搭配与可选搭配组",
    "irConverted": true,
    "reviewDecision": "approved",
    "automationClassification": "blocked",
    "recipeId": "product-center:green-draft:at47:tc-item-pkg-049",
    "recipeInventory": {
      "any": 1,
      "enabled": 1,
      "semanticComplete": 0,
      "files": [
        "contracts/product-center/recipes/green-drafts/product-center-item-green-binding-draft-recipes.json"
      ]
    },
    "blockingReasons": [
      "ASSERTION_CONTRACT_REQUIRED",
      "RUNTIME_EVIDENCE_REQUIRED"
    ],
    "family": "package",
    "action": null,
    "runtimeReadiness": "ready",
    "runtimeStatus": "runtime-passed",
    "handlerId": "product-center:green-draft:at47:tc-item-pkg-049",
    "bindingFingerprint": "fa126b1f6dd0304ce090f706dda4f8d87816fb6144bd36910696ab443c0a606b",
    "implementationFingerprint": "fa5fc5479f8a2f92491688f1591270bd3f12e29eb3fe37172bb54403ab09cd70",
    "assertionIds": [
      "TC-ITEM-PKG-049:expectation-1"
    ],
    "semanticCaseFingerprint": "c9432a7dadd1dd5de6fc696ab0ae772c5620aa12418159f6bc4d7361ea3cd2f0"
  },
  {
    "caseId": "TC-ITEM-PKG-050",
    "title": "删除全部套餐分组后因分组必填无法保存",
    "irConverted": true,
    "reviewDecision": "approved",
    "automationClassification": "blocked",
    "recipeId": "product-center:green-draft:at42:tc-item-pkg-050",
    "recipeInventory": {
      "any": 1,
      "enabled": 1,
      "semanticComplete": 0,
      "files": [
        "contracts/product-center/recipes/green-drafts/product-center-item-green-binding-draft-recipes.json"
      ]
    },
    "blockingReasons": [
      "ASSERTION_CONTRACT_REQUIRED",
      "RUNTIME_EVIDENCE_REQUIRED"
    ],
    "family": "package",
    "action": null,
    "runtimeReadiness": "ready",
    "runtimeStatus": "runtime-passed",
    "handlerId": "product-center:green-draft:at42:tc-item-pkg-050",
    "bindingFingerprint": "fa126b1f6dd0304ce090f706dda4f8d87816fb6144bd36910696ab443c0a606b",
    "implementationFingerprint": "fa5fc5479f8a2f92491688f1591270bd3f12e29eb3fe37172bb54403ab09cd70",
    "assertionIds": [
      "TC-ITEM-PKG-050:expectation-1"
    ],
    "semanticCaseFingerprint": "cb10e7e81693cb8b34ad2597826e3bb44620fd402275281f6b51e27bfeaebe8d"
  },
  {
    "caseId": "TC-ITEM-PKG-051",
    "title": "套餐商品创建页不展示多规格与称重相关入口",
    "irConverted": true,
    "reviewDecision": "approved",
    "automationClassification": "blocked",
    "recipeId": "product-center:yellow-probe:at40:tc-item-pkg-051",
    "recipeInventory": {
      "any": 1,
      "enabled": 0,
      "semanticComplete": 0,
      "files": [
        "contracts/product-center/recipes/yellow-probes/product-center-item-yellow-representative-probe-recipes.json"
      ]
    },
    "blockingReasons": [
      "RECIPE_GENERATION_DISABLED",
      "ASSERTION_CONTRACT_REQUIRED",
      "RUNTIME_EVIDENCE_REQUIRED"
    ],
    "family": "package",
    "action": null,
    "runtimeReadiness": "ready",
    "runtimeStatus": "runtime-passed",
    "handlerId": "product-center:yellow-probe:at40:tc-item-pkg-051",
    "bindingFingerprint": "fa126b1f6dd0304ce090f706dda4f8d87816fb6144bd36910696ab443c0a606b",
    "implementationFingerprint": "fa5fc5479f8a2f92491688f1591270bd3f12e29eb3fe37172bb54403ab09cd70",
    "assertionIds": [
      "TC-ITEM-PKG-051:expectation-1",
      "TC-ITEM-PKG-051:expectation-2"
    ],
    "semanticCaseFingerprint": "7f66969dc448015d3f556644659cf9818f3237be7005c884973baf6434e131e8"
  },
  {
    "caseId": "TC-ITEM-PKG-052",
    "title": "套餐商品不支持引用口味做法加料组",
    "irConverted": true,
    "reviewDecision": "approved",
    "automationClassification": "blocked",
    "recipeId": "product-center:green-draft:at47:tc-item-pkg-052",
    "recipeInventory": {
      "any": 1,
      "enabled": 1,
      "semanticComplete": 0,
      "files": [
        "contracts/product-center/recipes/green-drafts/product-center-item-green-binding-draft-recipes.json"
      ]
    },
    "blockingReasons": [
      "ASSERTION_CONTRACT_REQUIRED",
      "RUNTIME_EVIDENCE_REQUIRED"
    ],
    "family": "package",
    "action": null,
    "runtimeReadiness": "ready",
    "runtimeStatus": "runtime-passed",
    "handlerId": "product-center:green-draft:at47:tc-item-pkg-052",
    "bindingFingerprint": "fa126b1f6dd0304ce090f706dda4f8d87816fb6144bd36910696ab443c0a606b",
    "implementationFingerprint": "fa5fc5479f8a2f92491688f1591270bd3f12e29eb3fe37172bb54403ab09cd70",
    "assertionIds": [
      "TC-ITEM-PKG-052:expectation-1"
    ],
    "semanticCaseFingerprint": "00b2cb666189be5eac1c698fe213af313dee326ca43317b69a9ba6c0e5688faa"
  },
  {
    "caseId": "TC-ITEM-PKG-053",
    "title": "套餐和加料商品不支持互斥规则",
    "irConverted": true,
    "reviewDecision": "approved",
    "automationClassification": "blocked",
    "recipeId": "product-center:green-draft:at47:tc-item-pkg-053",
    "recipeInventory": {
      "any": 1,
      "enabled": 1,
      "semanticComplete": 0,
      "files": [
        "contracts/product-center/recipes/green-drafts/product-center-item-green-binding-draft-recipes.json"
      ]
    },
    "blockingReasons": [
      "ASSERTION_CONTRACT_REQUIRED",
      "RUNTIME_EVIDENCE_REQUIRED"
    ],
    "family": "package",
    "action": null,
    "runtimeReadiness": "ready",
    "runtimeStatus": "runtime-passed",
    "handlerId": "product-center:green-draft:at47:tc-item-pkg-053",
    "bindingFingerprint": "fa126b1f6dd0304ce090f706dda4f8d87816fb6144bd36910696ab443c0a606b",
    "implementationFingerprint": "fa5fc5479f8a2f92491688f1591270bd3f12e29eb3fe37172bb54403ab09cd70",
    "assertionIds": [
      "TC-ITEM-PKG-053:expectation-1"
    ],
    "semanticCaseFingerprint": "650f124ad02f6f2cc3ad0a10c5da748a213b176c30d07dd974ee0b96d584ff06"
  },
  {
    "caseId": "TC-ITEM-PKG-054",
    "title": "商品列表主图不支持点击查看大图",
    "irConverted": true,
    "reviewDecision": "approved",
    "automationClassification": "blocked",
    "recipeId": "product-center:green-draft:at46:tc-item-pkg-054",
    "recipeInventory": {
      "any": 1,
      "enabled": 1,
      "semanticComplete": 0,
      "files": [
        "contracts/product-center/recipes/green-drafts/product-center-item-green-binding-draft-recipes.json"
      ]
    },
    "blockingReasons": [
      "ASSERTION_CONTRACT_REQUIRED",
      "RUNTIME_EVIDENCE_REQUIRED"
    ],
    "family": "package",
    "action": null,
    "runtimeReadiness": "ready",
    "runtimeStatus": "runtime-passed",
    "handlerId": "product-center:green-draft:at46:tc-item-pkg-054",
    "bindingFingerprint": "fa126b1f6dd0304ce090f706dda4f8d87816fb6144bd36910696ab443c0a606b",
    "implementationFingerprint": "fa5fc5479f8a2f92491688f1591270bd3f12e29eb3fe37172bb54403ab09cd70",
    "assertionIds": [
      "TC-ITEM-PKG-054:expectation-1"
    ],
    "semanticCaseFingerprint": "3d1a84af26522be9cdaa4c4f070c547f8d74cd446bdc616cfdf33470f9db95c8"
  },
  {
    "caseId": "TC-ITEM-PKG-055",
    "title": "套餐商品列表删除操作展示确认文案",
    "irConverted": true,
    "reviewDecision": "approved",
    "automationClassification": "blocked",
    "recipeId": "product-center:green-draft:at42:tc-item-pkg-055",
    "recipeInventory": {
      "any": 1,
      "enabled": 1,
      "semanticComplete": 0,
      "files": [
        "contracts/product-center/recipes/green-drafts/product-center-item-green-binding-draft-recipes.json"
      ]
    },
    "blockingReasons": [
      "ASSERTION_CONTRACT_REQUIRED",
      "RUNTIME_EVIDENCE_REQUIRED"
    ],
    "family": "package",
    "action": null,
    "runtimeReadiness": "ready",
    "runtimeStatus": "runtime-passed",
    "handlerId": "product-center:green-draft:at42:tc-item-pkg-055",
    "bindingFingerprint": "fa126b1f6dd0304ce090f706dda4f8d87816fb6144bd36910696ab443c0a606b",
    "implementationFingerprint": "fa5fc5479f8a2f92491688f1591270bd3f12e29eb3fe37172bb54403ab09cd70",
    "assertionIds": [
      "TC-ITEM-PKG-055:expectation-1",
      "TC-ITEM-PKG-055:expectation-2"
    ],
    "semanticCaseFingerprint": "986c877354d9b2a4fb4f4d6fd5d62fd6da925fb6a067b5dc1d609aef597ad526"
  },
  {
    "caseId": "TC-ITEM-PKG-056",
    "title": "组合搭配套餐组按名称精确搜索成功",
    "irConverted": true,
    "reviewDecision": "approved",
    "automationClassification": "blocked",
    "recipeId": "product-center:yellow-probe:at36:tc-item-pkg-056",
    "recipeInventory": {
      "any": 1,
      "enabled": 0,
      "semanticComplete": 0,
      "files": [
        "contracts/product-center/recipes/yellow-probes/product-center-item-yellow-representative-probe-recipes.json"
      ]
    },
    "blockingReasons": [
      "RECIPE_GENERATION_DISABLED",
      "ASSERTION_CONTRACT_REQUIRED",
      "RUNTIME_EVIDENCE_REQUIRED"
    ],
    "family": "package",
    "action": null,
    "runtimeReadiness": "ready",
    "runtimeStatus": "runtime-passed",
    "handlerId": "product-center:yellow-probe:at36:tc-item-pkg-056",
    "bindingFingerprint": "fa126b1f6dd0304ce090f706dda4f8d87816fb6144bd36910696ab443c0a606b",
    "implementationFingerprint": "fa5fc5479f8a2f92491688f1591270bd3f12e29eb3fe37172bb54403ab09cd70",
    "assertionIds": [
      "TC-ITEM-PKG-056:expectation-1",
      "TC-ITEM-PKG-056:expectation-2"
    ],
    "semanticCaseFingerprint": "120b88a4bb5ef9e5c3bedd9bbc1eca27d97229ba06081c3119603508408def34"
  },
  {
    "caseId": "TC-ITEM-PKG-057",
    "title": "套餐商品通过选择入口引用已有可选搭配组",
    "irConverted": true,
    "reviewDecision": "approved",
    "automationClassification": "blocked",
    "recipeId": "product-center:green-draft:at34:tc-item-pkg-057",
    "recipeInventory": {
      "any": 1,
      "enabled": 1,
      "semanticComplete": 0,
      "files": [
        "contracts/product-center/recipes/green-drafts/product-center-item-green-binding-draft-recipes.json"
      ]
    },
    "blockingReasons": [
      "ASSERTION_CONTRACT_REQUIRED",
      "RUNTIME_EVIDENCE_REQUIRED"
    ],
    "family": "package",
    "action": null,
    "runtimeReadiness": "ready",
    "runtimeStatus": "runtime-passed",
    "handlerId": "product-center:green-draft:at34:tc-item-pkg-057",
    "bindingFingerprint": "fa126b1f6dd0304ce090f706dda4f8d87816fb6144bd36910696ab443c0a606b",
    "implementationFingerprint": "fa5fc5479f8a2f92491688f1591270bd3f12e29eb3fe37172bb54403ab09cd70",
    "assertionIds": [
      "TC-ITEM-PKG-057:expectation-1"
    ],
    "businessRule": {
      "businessRuleId": "BR-GRP-020",
      "businessRuleFingerprint": "eb755f69c41e4a6c17bd84f77d4ecc5685667ca8a7cd8138b6ed7919c1702320",
      "businessRuleAssertionIdsRequired": [
        "br-grp-020:canonical-outcome-1",
        "br-grp-020:canonical-outcome-10",
        "br-grp-020:canonical-outcome-11",
        "br-grp-020:canonical-outcome-12",
        "br-grp-020:canonical-outcome-13",
        "br-grp-020:canonical-outcome-14",
        "br-grp-020:canonical-outcome-15",
        "br-grp-020:canonical-outcome-16",
        "br-grp-020:canonical-outcome-17",
        "br-grp-020:canonical-outcome-18",
        "br-grp-020:canonical-outcome-19",
        "br-grp-020:canonical-outcome-2",
        "br-grp-020:canonical-outcome-20",
        "br-grp-020:canonical-outcome-21",
        "br-grp-020:canonical-outcome-22",
        "br-grp-020:canonical-outcome-23",
        "br-grp-020:canonical-outcome-24",
        "br-grp-020:canonical-outcome-25",
        "br-grp-020:canonical-outcome-26",
        "br-grp-020:canonical-outcome-27",
        "br-grp-020:canonical-outcome-28",
        "br-grp-020:canonical-outcome-29",
        "br-grp-020:canonical-outcome-3",
        "br-grp-020:canonical-outcome-30",
        "br-grp-020:canonical-outcome-31",
        "br-grp-020:canonical-outcome-32",
        "br-grp-020:canonical-outcome-33",
        "br-grp-020:canonical-outcome-34",
        "br-grp-020:canonical-outcome-35",
        "br-grp-020:canonical-outcome-36",
        "br-grp-020:canonical-outcome-37",
        "br-grp-020:canonical-outcome-38",
        "br-grp-020:canonical-outcome-39",
        "br-grp-020:canonical-outcome-4",
        "br-grp-020:canonical-outcome-40",
        "br-grp-020:canonical-outcome-41",
        "br-grp-020:canonical-outcome-42",
        "br-grp-020:canonical-outcome-43",
        "br-grp-020:canonical-outcome-44",
        "br-grp-020:canonical-outcome-5",
        "br-grp-020:canonical-outcome-6",
        "br-grp-020:canonical-outcome-7",
        "br-grp-020:canonical-outcome-8",
        "br-grp-020:canonical-outcome-9"
      ],
      "businessRuleAssertionIdsObserved": [
        "br-grp-020:canonical-outcome-1",
        "br-grp-020:canonical-outcome-10",
        "br-grp-020:canonical-outcome-11",
        "br-grp-020:canonical-outcome-12",
        "br-grp-020:canonical-outcome-13",
        "br-grp-020:canonical-outcome-14",
        "br-grp-020:canonical-outcome-15",
        "br-grp-020:canonical-outcome-16",
        "br-grp-020:canonical-outcome-17",
        "br-grp-020:canonical-outcome-18",
        "br-grp-020:canonical-outcome-19",
        "br-grp-020:canonical-outcome-2",
        "br-grp-020:canonical-outcome-20",
        "br-grp-020:canonical-outcome-21",
        "br-grp-020:canonical-outcome-22",
        "br-grp-020:canonical-outcome-23",
        "br-grp-020:canonical-outcome-24",
        "br-grp-020:canonical-outcome-25",
        "br-grp-020:canonical-outcome-26",
        "br-grp-020:canonical-outcome-27",
        "br-grp-020:canonical-outcome-28",
        "br-grp-020:canonical-outcome-29",
        "br-grp-020:canonical-outcome-3",
        "br-grp-020:canonical-outcome-30",
        "br-grp-020:canonical-outcome-31",
        "br-grp-020:canonical-outcome-32",
        "br-grp-020:canonical-outcome-33",
        "br-grp-020:canonical-outcome-34",
        "br-grp-020:canonical-outcome-35",
        "br-grp-020:canonical-outcome-36",
        "br-grp-020:canonical-outcome-37",
        "br-grp-020:canonical-outcome-38",
        "br-grp-020:canonical-outcome-39",
        "br-grp-020:canonical-outcome-4",
        "br-grp-020:canonical-outcome-40",
        "br-grp-020:canonical-outcome-41",
        "br-grp-020:canonical-outcome-42",
        "br-grp-020:canonical-outcome-43",
        "br-grp-020:canonical-outcome-44",
        "br-grp-020:canonical-outcome-5",
        "br-grp-020:canonical-outcome-6",
        "br-grp-020:canonical-outcome-7",
        "br-grp-020:canonical-outcome-8",
        "br-grp-020:canonical-outcome-9"
      ],
      "businessRuleUiEvidenceIds": [
        "TC-ITEM-PKG-057-runtime-evidence"
      ],
      "businessRuleApiEvidenceIds": [],
      "businessRuleDownstreamEvidenceIds": [],
      "businessRuleCleanup": {
        "required": false,
        "apiZeroResidue": false,
        "uiZeroResidue": false
      },
      "observedStatement": "加料、可选搭配和随心配按各自组级与商品行数量规则校验；随心配最多数量不得小于最少数量"
    },
    "semanticCaseFingerprint": "0df5087a8f1df765e09b77653eb76251ee2a21cd53a8a551388ad8e5fa1e4bb4"
  },
  {
    "caseId": "TC-ITEM-PKG-058",
    "title": "套餐商品回显已有可选搭配组规则摘要",
    "irConverted": true,
    "reviewDecision": "approved",
    "automationClassification": "blocked",
    "recipeId": "product-center:green-draft:at43:tc-item-pkg-058",
    "recipeInventory": {
      "any": 1,
      "enabled": 1,
      "semanticComplete": 0,
      "files": [
        "contracts/product-center/recipes/green-drafts/product-center-item-green-binding-draft-recipes.json"
      ]
    },
    "blockingReasons": [
      "ASSERTION_CONTRACT_REQUIRED",
      "RUNTIME_EVIDENCE_REQUIRED"
    ],
    "family": "package",
    "action": null,
    "runtimeReadiness": "ready",
    "runtimeStatus": "runtime-passed",
    "handlerId": "product-center:green-draft:at43:tc-item-pkg-058",
    "bindingFingerprint": "fa126b1f6dd0304ce090f706dda4f8d87816fb6144bd36910696ab443c0a606b",
    "implementationFingerprint": "fa5fc5479f8a2f92491688f1591270bd3f12e29eb3fe37172bb54403ab09cd70",
    "assertionIds": [
      "TC-ITEM-PKG-058:expectation-1"
    ],
    "businessRule": {
      "businessRuleId": "BR-GRP-020",
      "businessRuleFingerprint": "eb755f69c41e4a6c17bd84f77d4ecc5685667ca8a7cd8138b6ed7919c1702320",
      "businessRuleAssertionIdsRequired": [
        "br-grp-020:canonical-outcome-1",
        "br-grp-020:canonical-outcome-10",
        "br-grp-020:canonical-outcome-11",
        "br-grp-020:canonical-outcome-12",
        "br-grp-020:canonical-outcome-13",
        "br-grp-020:canonical-outcome-14",
        "br-grp-020:canonical-outcome-15",
        "br-grp-020:canonical-outcome-16",
        "br-grp-020:canonical-outcome-17",
        "br-grp-020:canonical-outcome-18",
        "br-grp-020:canonical-outcome-19",
        "br-grp-020:canonical-outcome-2",
        "br-grp-020:canonical-outcome-20",
        "br-grp-020:canonical-outcome-21",
        "br-grp-020:canonical-outcome-22",
        "br-grp-020:canonical-outcome-23",
        "br-grp-020:canonical-outcome-24",
        "br-grp-020:canonical-outcome-25",
        "br-grp-020:canonical-outcome-26",
        "br-grp-020:canonical-outcome-27",
        "br-grp-020:canonical-outcome-28",
        "br-grp-020:canonical-outcome-29",
        "br-grp-020:canonical-outcome-3",
        "br-grp-020:canonical-outcome-30",
        "br-grp-020:canonical-outcome-31",
        "br-grp-020:canonical-outcome-32",
        "br-grp-020:canonical-outcome-33",
        "br-grp-020:canonical-outcome-34",
        "br-grp-020:canonical-outcome-35",
        "br-grp-020:canonical-outcome-36",
        "br-grp-020:canonical-outcome-37",
        "br-grp-020:canonical-outcome-38",
        "br-grp-020:canonical-outcome-39",
        "br-grp-020:canonical-outcome-4",
        "br-grp-020:canonical-outcome-40",
        "br-grp-020:canonical-outcome-41",
        "br-grp-020:canonical-outcome-42",
        "br-grp-020:canonical-outcome-43",
        "br-grp-020:canonical-outcome-44",
        "br-grp-020:canonical-outcome-5",
        "br-grp-020:canonical-outcome-6",
        "br-grp-020:canonical-outcome-7",
        "br-grp-020:canonical-outcome-8",
        "br-grp-020:canonical-outcome-9"
      ],
      "businessRuleAssertionIdsObserved": [
        "br-grp-020:canonical-outcome-1",
        "br-grp-020:canonical-outcome-10",
        "br-grp-020:canonical-outcome-11",
        "br-grp-020:canonical-outcome-12",
        "br-grp-020:canonical-outcome-13",
        "br-grp-020:canonical-outcome-14",
        "br-grp-020:canonical-outcome-15",
        "br-grp-020:canonical-outcome-16",
        "br-grp-020:canonical-outcome-17",
        "br-grp-020:canonical-outcome-18",
        "br-grp-020:canonical-outcome-19",
        "br-grp-020:canonical-outcome-2",
        "br-grp-020:canonical-outcome-20",
        "br-grp-020:canonical-outcome-21",
        "br-grp-020:canonical-outcome-22",
        "br-grp-020:canonical-outcome-23",
        "br-grp-020:canonical-outcome-24",
        "br-grp-020:canonical-outcome-25",
        "br-grp-020:canonical-outcome-26",
        "br-grp-020:canonical-outcome-27",
        "br-grp-020:canonical-outcome-28",
        "br-grp-020:canonical-outcome-29",
        "br-grp-020:canonical-outcome-3",
        "br-grp-020:canonical-outcome-30",
        "br-grp-020:canonical-outcome-31",
        "br-grp-020:canonical-outcome-32",
        "br-grp-020:canonical-outcome-33",
        "br-grp-020:canonical-outcome-34",
        "br-grp-020:canonical-outcome-35",
        "br-grp-020:canonical-outcome-36",
        "br-grp-020:canonical-outcome-37",
        "br-grp-020:canonical-outcome-38",
        "br-grp-020:canonical-outcome-39",
        "br-grp-020:canonical-outcome-4",
        "br-grp-020:canonical-outcome-40",
        "br-grp-020:canonical-outcome-41",
        "br-grp-020:canonical-outcome-42",
        "br-grp-020:canonical-outcome-43",
        "br-grp-020:canonical-outcome-44",
        "br-grp-020:canonical-outcome-5",
        "br-grp-020:canonical-outcome-6",
        "br-grp-020:canonical-outcome-7",
        "br-grp-020:canonical-outcome-8",
        "br-grp-020:canonical-outcome-9"
      ],
      "businessRuleUiEvidenceIds": [
        "TC-ITEM-PKG-058-runtime-evidence"
      ],
      "businessRuleApiEvidenceIds": [],
      "businessRuleDownstreamEvidenceIds": [],
      "businessRuleCleanup": {
        "required": false,
        "apiZeroResidue": false,
        "uiZeroResidue": false
      },
      "observedStatement": "加料、可选搭配和随心配按各自组级与商品行数量规则校验；随心配最多数量不得小于最少数量"
    },
    "semanticCaseFingerprint": "ce060d0c1e6cfa64263ddc84570e81b1c172cf1b5533eb79eb89389821743d5a"
  },
  {
    "caseId": "TC-ITEM-PKG-059",
    "title": "套餐商品编辑页可选搭配组仅支持组级操作",
    "irConverted": true,
    "reviewDecision": "approved",
    "automationClassification": "strict-generatable",
    "recipeId": "product-center:item-combo-audit:TC-ITEM-PKG-059",
    "recipeInventory": {
      "any": 1,
      "enabled": 1,
      "semanticComplete": 0,
      "files": [
        "contracts/product-center/recipes/product-center-item-combo-audit-probe-recipes.json"
      ]
    },
    "blockingReasons": [],
    "family": "package",
    "action": null,
    "runtimeReadiness": "ready",
    "runtimeStatus": "runtime-passed",
    "handlerId": "product-center:item-combo-audit:TC-ITEM-PKG-059",
    "bindingFingerprint": "fa126b1f6dd0304ce090f706dda4f8d87816fb6144bd36910696ab443c0a606b",
    "implementationFingerprint": "fa5fc5479f8a2f92491688f1591270bd3f12e29eb3fe37172bb54403ab09cd70",
    "assertionIds": [
      "TC-ITEM-PKG-059:expectation-1",
      "TC-ITEM-PKG-059:expectation-2",
      "TC-ITEM-PKG-059:expectation-3",
      "TC-ITEM-PKG-059:expectation-4",
      "TC-ITEM-PKG-059:expectation-5",
      "TC-ITEM-PKG-059:expectation-6",
      "TC-ITEM-PKG-059:expectation-7",
      "TC-ITEM-PKG-059:expectation-8",
      "TC-ITEM-PKG-059:expectation-9",
      "TC-ITEM-PKG-059:expectation-10",
      "TC-ITEM-PKG-059:expectation-11",
      "TC-ITEM-PKG-059:expectation-12",
      "TC-ITEM-PKG-059:expectation-13",
      "TC-ITEM-PKG-059:expectation-14"
    ],
    "businessRule": {
      "businessRuleId": "BR-ITEM-COMBO-OPTIONAL-EDIT-BOUNDARY",
      "businessRuleFingerprint": "c36b37b078cfb16c02fa8ee54ee48aae844a856c8183588d879df05b00b58d9b",
      "businessRuleAssertionIdsRequired": [
        "combo-optional:associated-item-sync",
        "combo-optional:group-actions",
        "combo-optional:group-delete-cleanup",
        "combo-optional:group-delete-confirm",
        "combo-optional:group-edit-persistence",
        "combo-optional:no-row-remove",
        "combo-optional:row-fields",
        "combo-optional:rule-summary",
        "combo-optional:store-menu-publish",
        "combo-optional:terminal-store-sync"
      ],
      "businessRuleAssertionIdsObserved": [
        "combo-optional:associated-item-sync",
        "combo-optional:group-actions",
        "combo-optional:group-delete-cleanup",
        "combo-optional:group-delete-confirm",
        "combo-optional:group-edit-persistence",
        "combo-optional:no-row-remove",
        "combo-optional:row-fields",
        "combo-optional:rule-summary",
        "combo-optional:store-menu-publish",
        "combo-optional:terminal-store-sync"
      ],
      "businessRuleUiEvidenceIds": [
        "TC-ITEM-PKG-059-runtime-evidence"
      ],
      "businessRuleApiEvidenceIds": [
        "TC-ITEM-PKG-059-runtime-evidence"
      ],
      "businessRuleDownstreamEvidenceIds": [
        "TC-ITEM-PKG-059-runtime-evidence"
      ],
      "businessRuleCleanup": {
        "required": true,
        "apiZeroResidue": false,
        "uiZeroResidue": false
      },
      "observedStatement": "套餐商品可选搭配组编辑页展示重复选择和选择数量规则；右上角只提供组级编辑、删除入口，商品行展示名称、规格、最小/最大数量和默认选中状态且不提供单项移除；组级编辑或删除点击确定后同步关联套餐商品，品牌侧须重新下发菜单或点击“同步到门店”，所有门店数据仅在菜单重新下发/同步到门店后更新，终端再由“门店商品管理”同步，禁止从品牌商品管理直接同步终端；删除需确认，取消保持原数据，确认删除后移除该组并更新组卡片、商品行、套餐详情和列表，清理通过接口验证"
    },
    "semanticCaseFingerprint": "11c66a25198df2edf657af7da83cf110c6fe13641b9d9a311174cea1c302ce1b"
  },
  {
    "caseId": "TC-ITEM-PKG-060",
    "title": "套餐商品状态变更后需下发到门店终端才生效",
    "irConverted": true,
    "reviewDecision": "approved",
    "automationClassification": "blocked",
    "recipeId": "product-center:yellow-probe:at49:tc-item-pkg-060",
    "recipeInventory": {
      "any": 1,
      "enabled": 0,
      "semanticComplete": 0,
      "files": [
        "contracts/product-center/recipes/yellow-probes/product-center-item-yellow-representative-probe-recipes.json"
      ]
    },
    "blockingReasons": [
      "RECIPE_GENERATION_DISABLED",
      "ASSERTION_CONTRACT_REQUIRED",
      "RUNTIME_EVIDENCE_REQUIRED"
    ],
    "family": "package",
    "action": null,
    "runtimeReadiness": "ready",
    "runtimeStatus": "deferred",
    "handlerId": "product-center:yellow-probe:at49:tc-item-pkg-060",
    "bindingFingerprint": "fa126b1f6dd0304ce090f706dda4f8d87816fb6144bd36910696ab443c0a606b",
    "implementationFingerprint": "fa5fc5479f8a2f92491688f1591270bd3f12e29eb3fe37172bb54403ab09cd70",
    "assertionIds": [
      "TC-ITEM-PKG-060:expectation-1",
      "TC-ITEM-PKG-060:expectation-2"
    ],
    "semanticCaseFingerprint": "fc23d9012c1fcf57d15d14661f92b503ee20f3d33f706628e618f1493d89cf6b"
  },
  {
    "caseId": "TC-ITEM-PKG-061",
    "title": "套餐商品列表启用商品操作成功",
    "irConverted": true,
    "reviewDecision": "approved",
    "automationClassification": "blocked",
    "recipeId": "product-center:green-draft:at50:tc-item-pkg-061",
    "recipeInventory": {
      "any": 1,
      "enabled": 1,
      "semanticComplete": 0,
      "files": [
        "contracts/product-center/recipes/green-drafts/product-center-item-green-binding-draft-recipes.json"
      ]
    },
    "blockingReasons": [
      "ASSERTION_CONTRACT_REQUIRED",
      "RUNTIME_EVIDENCE_REQUIRED"
    ],
    "family": "package",
    "action": null,
    "runtimeReadiness": "ready",
    "runtimeStatus": "runtime-passed",
    "handlerId": "product-center:green-draft:at50:tc-item-pkg-061",
    "bindingFingerprint": "fa126b1f6dd0304ce090f706dda4f8d87816fb6144bd36910696ab443c0a606b",
    "implementationFingerprint": "fa5fc5479f8a2f92491688f1591270bd3f12e29eb3fe37172bb54403ab09cd70",
    "assertionIds": [
      "TC-ITEM-PKG-061:expectation-1",
      "TC-ITEM-PKG-061:expectation-2"
    ],
    "semanticCaseFingerprint": "39546c4ffa93e2c7bd9f54f9767adac35940f290b8097e34fde0422b65c7368b"
  },
  {
    "caseId": "TC-ITEM-PKG-062",
    "title": "套餐商品列表停用未被菜单引用的商品操作成功",
    "irConverted": true,
    "reviewDecision": "approved",
    "automationClassification": "blocked",
    "recipeId": "product-center:green-draft:at50:tc-item-pkg-062",
    "recipeInventory": {
      "any": 1,
      "enabled": 1,
      "semanticComplete": 0,
      "files": [
        "contracts/product-center/recipes/green-drafts/product-center-item-green-binding-draft-recipes.json"
      ]
    },
    "blockingReasons": [
      "ASSERTION_CONTRACT_REQUIRED",
      "RUNTIME_EVIDENCE_REQUIRED"
    ],
    "family": "package",
    "action": null,
    "runtimeReadiness": "ready",
    "runtimeStatus": "runtime-passed",
    "handlerId": "product-center:green-draft:at50:tc-item-pkg-062",
    "bindingFingerprint": "fa126b1f6dd0304ce090f706dda4f8d87816fb6144bd36910696ab443c0a606b",
    "implementationFingerprint": "fa5fc5479f8a2f92491688f1591270bd3f12e29eb3fe37172bb54403ab09cd70",
    "assertionIds": [
      "TC-ITEM-PKG-062:expectation-1",
      "TC-ITEM-PKG-062:expectation-2"
    ],
    "semanticCaseFingerprint": "5af3950ac8aa754ed518694308313984cd4dab5dbf07e8bf01dd0e095b0a5260"
  },
  {
    "caseId": "TC-ITEM-PKG-063",
    "title": "套餐商品创建页不提供做法组引用入口",
    "irConverted": true,
    "reviewDecision": "approved",
    "automationClassification": "blocked",
    "recipeId": "product-center:green-draft:at47:tc-item-pkg-063",
    "recipeInventory": {
      "any": 1,
      "enabled": 1,
      "semanticComplete": 0,
      "files": [
        "contracts/product-center/recipes/green-drafts/product-center-item-green-binding-draft-recipes.json"
      ]
    },
    "blockingReasons": [
      "ASSERTION_CONTRACT_REQUIRED",
      "RUNTIME_EVIDENCE_REQUIRED"
    ],
    "family": "package",
    "action": null,
    "runtimeReadiness": "ready",
    "runtimeStatus": "runtime-passed",
    "handlerId": "product-center:green-draft:at47:tc-item-pkg-063",
    "bindingFingerprint": "fa126b1f6dd0304ce090f706dda4f8d87816fb6144bd36910696ab443c0a606b",
    "implementationFingerprint": "fa5fc5479f8a2f92491688f1591270bd3f12e29eb3fe37172bb54403ab09cd70",
    "assertionIds": [
      "TC-ITEM-PKG-063:expectation-1"
    ],
    "semanticCaseFingerprint": "ab6d238b5a14268147dace4590d7b5bc6831c85e212fdeb4e6f4e175bbc8969d"
  },
  {
    "caseId": "TC-ITEM-PKG-064",
    "title": "套餐商品创建页不提供加料组引用入口",
    "irConverted": true,
    "reviewDecision": "approved",
    "automationClassification": "blocked",
    "recipeId": "product-center:green-draft:at47:tc-item-pkg-064",
    "recipeInventory": {
      "any": 1,
      "enabled": 1,
      "semanticComplete": 0,
      "files": [
        "contracts/product-center/recipes/green-drafts/product-center-item-green-binding-draft-recipes.json"
      ]
    },
    "blockingReasons": [
      "ASSERTION_CONTRACT_REQUIRED",
      "RUNTIME_EVIDENCE_REQUIRED"
    ],
    "family": "package",
    "action": null,
    "runtimeReadiness": "ready",
    "runtimeStatus": "runtime-passed",
    "handlerId": "product-center:green-draft:at47:tc-item-pkg-064",
    "bindingFingerprint": "fa126b1f6dd0304ce090f706dda4f8d87816fb6144bd36910696ab443c0a606b",
    "implementationFingerprint": "fa5fc5479f8a2f92491688f1591270bd3f12e29eb3fe37172bb54403ab09cd70",
    "assertionIds": [
      "TC-ITEM-PKG-064:expectation-1"
    ],
    "semanticCaseFingerprint": "67073ef3ed44dbab9387ebe91460a1da3b3b82eafd6f93d45103946965bccd2b"
  },
  {
    "caseId": "TC-ITEM-PKG-065",
    "title": "套餐商品创建页没有加料组子项编辑能力",
    "irConverted": true,
    "reviewDecision": "approved",
    "automationClassification": "blocked",
    "recipeId": "product-center:green-draft:at45:tc-item-pkg-065",
    "recipeInventory": {
      "any": 1,
      "enabled": 1,
      "semanticComplete": 0,
      "files": [
        "contracts/product-center/recipes/green-drafts/product-center-item-green-binding-draft-recipes.json"
      ]
    },
    "blockingReasons": [
      "ASSERTION_CONTRACT_REQUIRED",
      "RUNTIME_EVIDENCE_REQUIRED"
    ],
    "family": "package",
    "action": null,
    "runtimeReadiness": "ready",
    "runtimeStatus": "runtime-passed",
    "handlerId": "product-center:green-draft:at45:tc-item-pkg-065",
    "bindingFingerprint": "fa126b1f6dd0304ce090f706dda4f8d87816fb6144bd36910696ab443c0a606b",
    "implementationFingerprint": "fa5fc5479f8a2f92491688f1591270bd3f12e29eb3fe37172bb54403ab09cd70",
    "assertionIds": [
      "TC-ITEM-PKG-065:expectation-1"
    ],
    "semanticCaseFingerprint": "03f10e69efc26b008cc86a5406df3f88252177fa54003cf3484459272d79a9b7"
  },
  {
    "caseId": "TC-ITEM-PKG-067",
    "title": "套餐商品本地上传主图回显后保存成功",
    "irConverted": true,
    "reviewDecision": "approved",
    "automationClassification": "blocked",
    "recipeId": "product-center:green-draft:at43:tc-item-pkg-067",
    "recipeInventory": {
      "any": 1,
      "enabled": 1,
      "semanticComplete": 0,
      "files": [
        "contracts/product-center/recipes/green-drafts/product-center-item-green-binding-draft-recipes.json"
      ]
    },
    "blockingReasons": [
      "ASSERTION_CONTRACT_REQUIRED",
      "RUNTIME_EVIDENCE_REQUIRED"
    ],
    "family": "package",
    "action": null,
    "runtimeReadiness": "ready",
    "runtimeStatus": "runtime-passed",
    "handlerId": "product-center:green-draft:at43:tc-item-pkg-067",
    "bindingFingerprint": "fa126b1f6dd0304ce090f706dda4f8d87816fb6144bd36910696ab443c0a606b",
    "implementationFingerprint": "fa5fc5479f8a2f92491688f1591270bd3f12e29eb3fe37172bb54403ab09cd70",
    "assertionIds": [
      "TC-ITEM-PKG-067:expectation-1"
    ],
    "semanticCaseFingerprint": "03fc73c90b4da52ba731d71296a263147520f93f6a820df8a21b7120ac845474"
  },
  {
    "caseId": "TC-ITEM-PKG-068",
    "title": "套餐商品先删原图再上传第二张主图替换成功",
    "irConverted": true,
    "reviewDecision": "approved",
    "automationClassification": "blocked",
    "recipeId": "product-center:green-draft:at43:tc-item-pkg-068",
    "recipeInventory": {
      "any": 1,
      "enabled": 1,
      "semanticComplete": 0,
      "files": [
        "contracts/product-center/recipes/green-drafts/product-center-item-green-binding-draft-recipes.json"
      ]
    },
    "blockingReasons": [
      "ASSERTION_CONTRACT_REQUIRED",
      "RUNTIME_EVIDENCE_REQUIRED"
    ],
    "family": "package",
    "action": null,
    "runtimeReadiness": "ready",
    "runtimeStatus": "runtime-passed",
    "handlerId": "product-center:green-draft:at43:tc-item-pkg-068",
    "bindingFingerprint": "fa126b1f6dd0304ce090f706dda4f8d87816fb6144bd36910696ab443c0a606b",
    "implementationFingerprint": "fa5fc5479f8a2f92491688f1591270bd3f12e29eb3fe37172bb54403ab09cd70",
    "assertionIds": [
      "TC-ITEM-PKG-068:expectation-1"
    ],
    "semanticCaseFingerprint": "2db4bac58793871c34a1c6df054a3a62d6f56ed8d6273e14cfe71161489c641c"
  },
  {
    "caseId": "TC-ITEM-ADD-001",
    "title": "加料商品基础字段与标准商品一致且无起售数量",
    "irConverted": true,
    "reviewDecision": "approved",
    "automationClassification": "blocked",
    "recipeId": null,
    "recipeInventory": {
      "any": 0,
      "enabled": 0,
      "semanticComplete": 0,
      "files": []
    },
    "blockingReasons": [
      "RECIPE_REQUIRED"
    ],
    "family": "addon",
    "action": null,
    "runtimeReadiness": "ready",
    "runtimeStatus": "runtime-passed",
    "handlerId": "item-216:TC-ITEM-ADD-001",
    "bindingFingerprint": "fa126b1f6dd0304ce090f706dda4f8d87816fb6144bd36910696ab443c0a606b",
    "implementationFingerprint": "5b2f6ff4f8cfbcb8bea9f0d7919439faa34bc92815b79bb52e1ffb0ba6323471",
    "assertionIds": [
      "TC-ITEM-ADD-001:expectation-1",
      "TC-ITEM-ADD-001:expectation-2"
    ],
    "semanticCaseFingerprint": "de06c55076c06c056f0799f0003646055152fce7c6026efc50802da6f2542d91"
  },
  {
    "caseId": "TC-ITEM-ADD-002",
    "title": "加料商品其他设置与标准商品一致",
    "irConverted": true,
    "reviewDecision": "approved",
    "automationClassification": "blocked",
    "recipeId": "product-center:yellow-probe:at32:tc-item-add-002",
    "recipeInventory": {
      "any": 1,
      "enabled": 0,
      "semanticComplete": 0,
      "files": [
        "contracts/product-center/recipes/yellow-probes/product-center-item-yellow-representative-probe-recipes.json"
      ]
    },
    "blockingReasons": [
      "RECIPE_GENERATION_DISABLED",
      "ASSERTION_CONTRACT_REQUIRED",
      "RUNTIME_EVIDENCE_REQUIRED"
    ],
    "family": "addon",
    "action": null,
    "runtimeReadiness": "ready",
    "runtimeStatus": "runtime-passed",
    "handlerId": "product-center:yellow-probe:at32:tc-item-add-002",
    "bindingFingerprint": "fa126b1f6dd0304ce090f706dda4f8d87816fb6144bd36910696ab443c0a606b",
    "implementationFingerprint": "5b2f6ff4f8cfbcb8bea9f0d7919439faa34bc92815b79bb52e1ffb0ba6323471",
    "assertionIds": [
      "TC-ITEM-ADD-002:expectation-1"
    ],
    "semanticCaseFingerprint": "09e865c48f67b93b8ccc727a950a4caaf6b81a2a29d5ffd25b0f94691f8c8163"
  },
  {
    "caseId": "TC-ITEM-ADD-005",
    "title": "加料商品仅填写必填项时创建成功",
    "irConverted": true,
    "reviewDecision": "approved",
    "automationClassification": "blocked",
    "recipeId": "product-center:item-p0-wave-c:TC-ITEM-ADD-005",
    "recipeInventory": {
      "any": 1,
      "enabled": 1,
      "semanticComplete": 0,
      "files": [
        "contracts/product-center/recipes/product-center-item-p0-wave-c-recipes.json"
      ]
    },
    "blockingReasons": [
      "ASSERTION_CONTRACT_REQUIRED",
      "RUNTIME_EVIDENCE_REQUIRED"
    ],
    "family": "addon",
    "action": null,
    "runtimeReadiness": "ready",
    "runtimeStatus": "runtime-passed",
    "handlerId": "product-center:item-p0-wave-c:TC-ITEM-ADD-005",
    "bindingFingerprint": "fa126b1f6dd0304ce090f706dda4f8d87816fb6144bd36910696ab443c0a606b",
    "implementationFingerprint": "5b2f6ff4f8cfbcb8bea9f0d7919439faa34bc92815b79bb52e1ffb0ba6323471",
    "assertionIds": [
      "TC-ITEM-ADD-005:expectation-1",
      "TC-ITEM-ADD-005:expectation-2",
      "TC-ITEM-ADD-005:expectation-3"
    ],
    "semanticCaseFingerprint": "3a0893dd15e92aa41adb80746404119a8a260500ad93d9df605f6568be88dde1"
  },
  {
    "caseId": "TC-ITEM-ADD-006",
    "title": "加料商品必填项缺失时创建失败",
    "irConverted": true,
    "reviewDecision": "approved",
    "automationClassification": "blocked",
    "recipeId": null,
    "recipeInventory": {
      "any": 0,
      "enabled": 0,
      "semanticComplete": 0,
      "files": []
    },
    "blockingReasons": [
      "RECIPE_REQUIRED"
    ],
    "family": "addon",
    "action": null,
    "runtimeReadiness": "ready",
    "runtimeStatus": "runtime-passed",
    "handlerId": "item-216:TC-ITEM-ADD-006",
    "bindingFingerprint": "fa126b1f6dd0304ce090f706dda4f8d87816fb6144bd36910696ab443c0a606b",
    "implementationFingerprint": "5b2f6ff4f8cfbcb8bea9f0d7919439faa34bc92815b79bb52e1ffb0ba6323471",
    "assertionIds": [
      "TC-ITEM-ADD-006:expectation-1",
      "TC-ITEM-ADD-006:expectation-2"
    ],
    "semanticCaseFingerprint": "57634c39e430c04bc77b01a6873c174d288ede955d525ca91961044b5bbfb36d"
  },
  {
    "caseId": "TC-ITEM-ADD-007",
    "title": "加料商品不选择分类时创建成功",
    "irConverted": true,
    "reviewDecision": "approved",
    "automationClassification": "blocked",
    "recipeId": "product-center:yellow-probe:at25:tc-item-add-007",
    "recipeInventory": {
      "any": 1,
      "enabled": 0,
      "semanticComplete": 0,
      "files": [
        "contracts/product-center/recipes/yellow-probes/product-center-item-yellow-representative-probe-recipes.json"
      ]
    },
    "blockingReasons": [
      "RECIPE_GENERATION_DISABLED",
      "ASSERTION_CONTRACT_REQUIRED",
      "RUNTIME_EVIDENCE_REQUIRED"
    ],
    "family": "addon",
    "action": null,
    "runtimeReadiness": "ready",
    "runtimeStatus": "runtime-passed",
    "handlerId": "product-center:yellow-probe:at25:tc-item-add-007",
    "bindingFingerprint": "fa126b1f6dd0304ce090f706dda4f8d87816fb6144bd36910696ab443c0a606b",
    "implementationFingerprint": "5b2f6ff4f8cfbcb8bea9f0d7919439faa34bc92815b79bb52e1ffb0ba6323471",
    "assertionIds": [
      "TC-ITEM-ADD-007:expectation-1",
      "TC-ITEM-ADD-007:expectation-2"
    ],
    "semanticCaseFingerprint": "8db1b2d0885d00545ff80d49b4d330e05982677e175ce073780179647a615681"
  },
  {
    "caseId": "TC-ITEM-ADD-008",
    "title": "加料商品标准价缺失时创建失败",
    "irConverted": true,
    "reviewDecision": "approved",
    "automationClassification": "blocked",
    "recipeId": null,
    "recipeInventory": {
      "any": 0,
      "enabled": 0,
      "semanticComplete": 0,
      "files": []
    },
    "blockingReasons": [
      "RECIPE_REQUIRED"
    ],
    "family": "addon",
    "action": null,
    "runtimeReadiness": "ready",
    "runtimeStatus": "runtime-passed",
    "handlerId": "item-216:TC-ITEM-ADD-008",
    "bindingFingerprint": "fa126b1f6dd0304ce090f706dda4f8d87816fb6144bd36910696ab443c0a606b",
    "implementationFingerprint": "5b2f6ff4f8cfbcb8bea9f0d7919439faa34bc92815b79bb52e1ffb0ba6323471",
    "assertionIds": [
      "TC-ITEM-ADD-008:expectation-1",
      "TC-ITEM-ADD-008:expectation-2",
      "TC-ITEM-ADD-008:expectation-3"
    ],
    "semanticCaseFingerprint": "2d2413e6b69c3a294dc20314cb51e066e9cd59fb0315c3b1107f0780fb830908"
  },
  {
    "caseId": "TC-ITEM-ADD-009",
    "title": "加料商品标准价为 0 时创建成功",
    "irConverted": true,
    "reviewDecision": "approved",
    "automationClassification": "blocked",
    "recipeId": "product-center:yellow-probe:at25:tc-item-add-009",
    "recipeInventory": {
      "any": 1,
      "enabled": 0,
      "semanticComplete": 0,
      "files": [
        "contracts/product-center/recipes/yellow-probes/product-center-item-yellow-representative-probe-recipes.json"
      ]
    },
    "blockingReasons": [
      "RECIPE_GENERATION_DISABLED",
      "ASSERTION_CONTRACT_REQUIRED",
      "RUNTIME_EVIDENCE_REQUIRED"
    ],
    "family": "addon",
    "action": null,
    "runtimeReadiness": "ready",
    "runtimeStatus": "runtime-passed",
    "handlerId": "product-center:yellow-probe:at25:tc-item-add-009",
    "bindingFingerprint": "fa126b1f6dd0304ce090f706dda4f8d87816fb6144bd36910696ab443c0a606b",
    "implementationFingerprint": "5b2f6ff4f8cfbcb8bea9f0d7919439faa34bc92815b79bb52e1ffb0ba6323471",
    "assertionIds": [
      "TC-ITEM-ADD-009:expectation-1",
      "TC-ITEM-ADD-009:expectation-2"
    ],
    "businessRule": {
      "businessRuleId": "BR-FMT-005",
      "businessRuleFingerprint": "68a2895221c4d12b84412f80c9371e3051c97fdd50d2e909bb0a00d39ce4f89e",
      "businessRuleAssertionIdsRequired": [
        "br-fmt-005:canonical-outcome-1",
        "br-fmt-005:canonical-outcome-10",
        "br-fmt-005:canonical-outcome-11",
        "br-fmt-005:canonical-outcome-12",
        "br-fmt-005:canonical-outcome-13",
        "br-fmt-005:canonical-outcome-14",
        "br-fmt-005:canonical-outcome-2",
        "br-fmt-005:canonical-outcome-3",
        "br-fmt-005:canonical-outcome-4",
        "br-fmt-005:canonical-outcome-5",
        "br-fmt-005:canonical-outcome-6",
        "br-fmt-005:canonical-outcome-7",
        "br-fmt-005:canonical-outcome-8",
        "br-fmt-005:canonical-outcome-9"
      ],
      "businessRuleAssertionIdsObserved": [
        "br-fmt-005:canonical-outcome-1",
        "br-fmt-005:canonical-outcome-10",
        "br-fmt-005:canonical-outcome-11",
        "br-fmt-005:canonical-outcome-12",
        "br-fmt-005:canonical-outcome-13",
        "br-fmt-005:canonical-outcome-14",
        "br-fmt-005:canonical-outcome-2",
        "br-fmt-005:canonical-outcome-3",
        "br-fmt-005:canonical-outcome-4",
        "br-fmt-005:canonical-outcome-5",
        "br-fmt-005:canonical-outcome-6",
        "br-fmt-005:canonical-outcome-7",
        "br-fmt-005:canonical-outcome-8",
        "br-fmt-005:canonical-outcome-9"
      ],
      "businessRuleUiEvidenceIds": [
        "TC-ITEM-ADD-009-runtime-evidence"
      ],
      "businessRuleApiEvidenceIds": [],
      "businessRuleDownstreamEvidenceIds": [],
      "businessRuleCleanup": {
        "required": false,
        "apiZeroResidue": false,
        "uiZeroResidue": false
      },
      "observedStatement": "价格 0.00 可保存并展示 2 位小数；超过 2 位小数按四舍五入保存，API 与重新进入页面回显舍入后的金额"
    },
    "semanticCaseFingerprint": "515ffe52f870f4ad38910c3bf4368e0a61567aac0269ab1e1b717b822e18828b"
  },
  {
    "caseId": "TC-ITEM-ADD-010",
    "title": "加料商品标准价输入负数时创建失败",
    "irConverted": true,
    "reviewDecision": "approved",
    "automationClassification": "blocked",
    "recipeId": null,
    "recipeInventory": {
      "any": 0,
      "enabled": 0,
      "semanticComplete": 0,
      "files": []
    },
    "blockingReasons": [
      "RECIPE_REQUIRED"
    ],
    "family": "addon",
    "action": null,
    "runtimeReadiness": "ready",
    "runtimeStatus": "runtime-passed",
    "handlerId": "item-216:TC-ITEM-ADD-010",
    "bindingFingerprint": "fa126b1f6dd0304ce090f706dda4f8d87816fb6144bd36910696ab443c0a606b",
    "implementationFingerprint": "5b2f6ff4f8cfbcb8bea9f0d7919439faa34bc92815b79bb52e1ffb0ba6323471",
    "assertionIds": [
      "TC-ITEM-ADD-010:expectation-1"
    ],
    "businessRule": {
      "businessRuleId": "BR-FMT-005",
      "businessRuleFingerprint": "68a2895221c4d12b84412f80c9371e3051c97fdd50d2e909bb0a00d39ce4f89e",
      "businessRuleAssertionIdsRequired": [
        "br-fmt-005:canonical-outcome-1",
        "br-fmt-005:canonical-outcome-10",
        "br-fmt-005:canonical-outcome-11",
        "br-fmt-005:canonical-outcome-12",
        "br-fmt-005:canonical-outcome-13",
        "br-fmt-005:canonical-outcome-14",
        "br-fmt-005:canonical-outcome-2",
        "br-fmt-005:canonical-outcome-3",
        "br-fmt-005:canonical-outcome-4",
        "br-fmt-005:canonical-outcome-5",
        "br-fmt-005:canonical-outcome-6",
        "br-fmt-005:canonical-outcome-7",
        "br-fmt-005:canonical-outcome-8",
        "br-fmt-005:canonical-outcome-9"
      ],
      "businessRuleAssertionIdsObserved": [
        "br-fmt-005:canonical-outcome-1",
        "br-fmt-005:canonical-outcome-10",
        "br-fmt-005:canonical-outcome-11",
        "br-fmt-005:canonical-outcome-12",
        "br-fmt-005:canonical-outcome-13",
        "br-fmt-005:canonical-outcome-14",
        "br-fmt-005:canonical-outcome-2",
        "br-fmt-005:canonical-outcome-3",
        "br-fmt-005:canonical-outcome-4",
        "br-fmt-005:canonical-outcome-5",
        "br-fmt-005:canonical-outcome-6",
        "br-fmt-005:canonical-outcome-7",
        "br-fmt-005:canonical-outcome-8",
        "br-fmt-005:canonical-outcome-9"
      ],
      "businessRuleUiEvidenceIds": [
        "TC-ITEM-ADD-010-runtime-evidence"
      ],
      "businessRuleApiEvidenceIds": [],
      "businessRuleDownstreamEvidenceIds": [],
      "businessRuleCleanup": {
        "required": false,
        "apiZeroResidue": false,
        "uiZeroResidue": false
      },
      "observedStatement": "价格 0.00 可保存并展示 2 位小数；超过 2 位小数按四舍五入保存，API 与重新进入页面回显舍入后的金额"
    },
    "semanticCaseFingerprint": "124821f828a29af319a79d33242fe1bfe571907b24020bd084e9e6c4ca811d87"
  },
  {
    "caseId": "TC-ITEM-ADD-011",
    "title": "加料商品包装费合法输入时保存成功",
    "irConverted": true,
    "reviewDecision": "approved",
    "automationClassification": "blocked",
    "recipeId": "product-center:yellow-probe:at27:tc-item-add-011",
    "recipeInventory": {
      "any": 1,
      "enabled": 0,
      "semanticComplete": 0,
      "files": [
        "contracts/product-center/recipes/yellow-probes/product-center-item-yellow-representative-probe-recipes.json"
      ]
    },
    "blockingReasons": [
      "RECIPE_GENERATION_DISABLED",
      "ASSERTION_CONTRACT_REQUIRED",
      "RUNTIME_EVIDENCE_REQUIRED"
    ],
    "family": "addon",
    "action": null,
    "runtimeReadiness": "ready",
    "runtimeStatus": "runtime-passed",
    "handlerId": "product-center:yellow-probe:at27:tc-item-add-011",
    "bindingFingerprint": "fa126b1f6dd0304ce090f706dda4f8d87816fb6144bd36910696ab443c0a606b",
    "implementationFingerprint": "5b2f6ff4f8cfbcb8bea9f0d7919439faa34bc92815b79bb52e1ffb0ba6323471",
    "assertionIds": [
      "TC-ITEM-ADD-011:expectation-1",
      "TC-ITEM-ADD-011:expectation-2"
    ],
    "businessRule": {
      "businessRuleId": "BR-FMT-005",
      "businessRuleFingerprint": "68a2895221c4d12b84412f80c9371e3051c97fdd50d2e909bb0a00d39ce4f89e",
      "businessRuleAssertionIdsRequired": [
        "br-fmt-005:canonical-outcome-1",
        "br-fmt-005:canonical-outcome-10",
        "br-fmt-005:canonical-outcome-11",
        "br-fmt-005:canonical-outcome-12",
        "br-fmt-005:canonical-outcome-13",
        "br-fmt-005:canonical-outcome-14",
        "br-fmt-005:canonical-outcome-2",
        "br-fmt-005:canonical-outcome-3",
        "br-fmt-005:canonical-outcome-4",
        "br-fmt-005:canonical-outcome-5",
        "br-fmt-005:canonical-outcome-6",
        "br-fmt-005:canonical-outcome-7",
        "br-fmt-005:canonical-outcome-8",
        "br-fmt-005:canonical-outcome-9"
      ],
      "businessRuleAssertionIdsObserved": [
        "br-fmt-005:canonical-outcome-1",
        "br-fmt-005:canonical-outcome-10",
        "br-fmt-005:canonical-outcome-11",
        "br-fmt-005:canonical-outcome-12",
        "br-fmt-005:canonical-outcome-13",
        "br-fmt-005:canonical-outcome-14",
        "br-fmt-005:canonical-outcome-2",
        "br-fmt-005:canonical-outcome-3",
        "br-fmt-005:canonical-outcome-4",
        "br-fmt-005:canonical-outcome-5",
        "br-fmt-005:canonical-outcome-6",
        "br-fmt-005:canonical-outcome-7",
        "br-fmt-005:canonical-outcome-8",
        "br-fmt-005:canonical-outcome-9"
      ],
      "businessRuleUiEvidenceIds": [
        "TC-ITEM-ADD-011-runtime-evidence"
      ],
      "businessRuleApiEvidenceIds": [],
      "businessRuleDownstreamEvidenceIds": [],
      "businessRuleCleanup": {
        "required": false,
        "apiZeroResidue": false,
        "uiZeroResidue": false
      },
      "observedStatement": "价格 0.00 可保存并展示 2 位小数；超过 2 位小数按四舍五入保存，API 与重新进入页面回显舍入后的金额"
    },
    "semanticCaseFingerprint": "2b92b2e04e934c498c9ca523f18b2420210a0c7f3c87a0f75422303f7d16b7bd"
  },
  {
    "caseId": "TC-ITEM-ADD-012",
    "title": "加料商品名称超长及特殊字符保存后自动格式化",
    "irConverted": true,
    "reviewDecision": "approved",
    "automationClassification": "blocked",
    "recipeId": "product-center:yellow-probe:at26:tc-item-add-012",
    "recipeInventory": {
      "any": 1,
      "enabled": 0,
      "semanticComplete": 0,
      "files": [
        "contracts/product-center/recipes/yellow-probes/product-center-item-yellow-representative-probe-recipes.json"
      ]
    },
    "blockingReasons": [
      "RECIPE_GENERATION_DISABLED",
      "ASSERTION_CONTRACT_REQUIRED",
      "RUNTIME_EVIDENCE_REQUIRED"
    ],
    "family": "addon",
    "action": null,
    "runtimeReadiness": "ready",
    "runtimeStatus": "runtime-passed",
    "handlerId": "product-center:yellow-probe:at26:tc-item-add-012",
    "bindingFingerprint": "fa126b1f6dd0304ce090f706dda4f8d87816fb6144bd36910696ab443c0a606b",
    "implementationFingerprint": "5b2f6ff4f8cfbcb8bea9f0d7919439faa34bc92815b79bb52e1ffb0ba6323471",
    "assertionIds": [
      "TC-ITEM-ADD-012:expectation-1",
      "TC-ITEM-ADD-012:expectation-2",
      "TC-ITEM-ADD-012:expectation-3"
    ],
    "semanticCaseFingerprint": "986d66eae222611bc34b679a02bd801bd929c3249ab2fa9a19efa9bb2e3b7b35"
  },
  {
    "caseId": "TC-ITEM-ADD-047",
    "title": "加料商品名称首尾含空格时保存失败",
    "irConverted": true,
    "reviewDecision": "approved",
    "automationClassification": "blocked",
    "recipeId": null,
    "recipeInventory": {
      "any": 0,
      "enabled": 0,
      "semanticComplete": 0,
      "files": []
    },
    "blockingReasons": [
      "RECIPE_REQUIRED"
    ],
    "family": "addon",
    "action": null,
    "runtimeReadiness": "ready",
    "runtimeStatus": "runtime-passed",
    "handlerId": "item-216:TC-ITEM-ADD-047",
    "bindingFingerprint": "fa126b1f6dd0304ce090f706dda4f8d87816fb6144bd36910696ab443c0a606b",
    "implementationFingerprint": "5b2f6ff4f8cfbcb8bea9f0d7919439faa34bc92815b79bb52e1ffb0ba6323471",
    "assertionIds": [
      "TC-ITEM-ADD-047:expectation-1",
      "TC-ITEM-ADD-047:expectation-2",
      "TC-ITEM-ADD-047:expectation-3"
    ],
    "semanticCaseFingerprint": "f079322d1e85564dc654ac686b2a5cf0d91de6290976614fc9f2ee92d65ba638"
  },
  {
    "caseId": "TC-ITEM-ADD-013",
    "title": "加料商品 POS 名称和送厨名称超长及特殊字符保存后自动格式化",
    "irConverted": true,
    "reviewDecision": "approved",
    "automationClassification": "blocked",
    "recipeId": "product-center:yellow-probe:at26:tc-item-add-013",
    "recipeInventory": {
      "any": 1,
      "enabled": 0,
      "semanticComplete": 0,
      "files": [
        "contracts/product-center/recipes/yellow-probes/product-center-item-yellow-representative-probe-recipes.json"
      ]
    },
    "blockingReasons": [
      "RECIPE_GENERATION_DISABLED",
      "ASSERTION_CONTRACT_REQUIRED",
      "RUNTIME_EVIDENCE_REQUIRED"
    ],
    "family": "addon",
    "action": null,
    "runtimeReadiness": "ready",
    "runtimeStatus": "runtime-passed",
    "handlerId": "product-center:yellow-probe:at26:tc-item-add-013",
    "bindingFingerprint": "fa126b1f6dd0304ce090f706dda4f8d87816fb6144bd36910696ab443c0a606b",
    "implementationFingerprint": "5b2f6ff4f8cfbcb8bea9f0d7919439faa34bc92815b79bb52e1ffb0ba6323471",
    "assertionIds": [
      "TC-ITEM-ADD-013:expectation-1",
      "TC-ITEM-ADD-013:expectation-2",
      "TC-ITEM-ADD-013:expectation-3"
    ],
    "semanticCaseFingerprint": "e248bd3a78dbb1c68c94bdc9be858d4eae20b92c3bc7cc0169cea73bb427b7c7"
  },
  {
    "caseId": "TC-ITEM-ADD-014",
    "title": "加料商品同一一级分类下同名创建失败",
    "irConverted": true,
    "reviewDecision": "approved",
    "automationClassification": "blocked",
    "recipeId": null,
    "recipeInventory": {
      "any": 0,
      "enabled": 0,
      "semanticComplete": 0,
      "files": []
    },
    "blockingReasons": [
      "RECIPE_REQUIRED"
    ],
    "family": "addon",
    "action": null,
    "runtimeReadiness": "ready",
    "runtimeStatus": "runtime-passed",
    "handlerId": "item-216:TC-ITEM-ADD-014",
    "bindingFingerprint": "fa126b1f6dd0304ce090f706dda4f8d87816fb6144bd36910696ab443c0a606b",
    "implementationFingerprint": "5b2f6ff4f8cfbcb8bea9f0d7919439faa34bc92815b79bb52e1ffb0ba6323471",
    "assertionIds": [
      "TC-ITEM-ADD-014:expectation-1",
      "TC-ITEM-ADD-014:expectation-2",
      "TC-ITEM-ADD-014:expectation-3"
    ],
    "businessRule": {
      "businessRuleId": "BR-ITEM-010",
      "businessRuleFingerprint": "4398349399b4362b465c6b296e9728fe8b915410ead525fe230de611aa3e0462",
      "businessRuleAssertionIdsRequired": [
        "item-name-duplicate:api-error",
        "item-name-duplicate:category-independence",
        "item-name-duplicate:cross-type-rename",
        "item-name-duplicate:list-persistence",
        "item-name-duplicate:record-count",
        "item-name-duplicate:save-feedback",
        "item-name-duplicate:standard-package-cross-type"
      ],
      "businessRuleAssertionIdsObserved": [
        "item-name-duplicate:api-error",
        "item-name-duplicate:category-independence",
        "item-name-duplicate:cross-type-rename",
        "item-name-duplicate:list-persistence",
        "item-name-duplicate:record-count",
        "item-name-duplicate:save-feedback",
        "item-name-duplicate:standard-package-cross-type"
      ],
      "businessRuleUiEvidenceIds": [
        "TC-ITEM-ADD-014-runtime-evidence"
      ],
      "businessRuleApiEvidenceIds": [
        "TC-ITEM-ADD-014-runtime-evidence"
      ],
      "businessRuleDownstreamEvidenceIds": [],
      "businessRuleCleanup": {
        "required": true,
        "apiZeroResidue": false,
        "uiZeroResidue": false
      },
      "observedStatement": "同一商户内标准商品与套餐商品共享名称唯一性空间，彼此及各自同类型创建或编辑同名均失败并提示 BITEM-7014：商品名称与其它类型商品名称重复；加料商品使用独立名称空间，标准商品或套餐商品在创建及编辑改名时均可与加料商品同名，但加料商品之间创建或编辑同名均失败；分类不参与判重；同类型无重复时允许改名，编辑失败原名称保持不变"
    },
    "semanticCaseFingerprint": "af0488cafc60432adb66969fe7f90db1b79e55f4697f9d16e1f451d7869a1780"
  },
  {
    "caseId": "TC-ITEM-ADD-015",
    "title": "加料商品允许与其他商品类型同名",
    "irConverted": true,
    "reviewDecision": "approved",
    "automationClassification": "blocked",
    "recipeId": null,
    "recipeInventory": {
      "any": 0,
      "enabled": 0,
      "semanticComplete": 0,
      "files": []
    },
    "blockingReasons": [
      "RECIPE_REQUIRED"
    ],
    "family": "addon",
    "action": null,
    "runtimeReadiness": "ready",
    "runtimeStatus": "runtime-passed",
    "handlerId": "item-216:TC-ITEM-ADD-015",
    "bindingFingerprint": "fa126b1f6dd0304ce090f706dda4f8d87816fb6144bd36910696ab443c0a606b",
    "implementationFingerprint": "5b2f6ff4f8cfbcb8bea9f0d7919439faa34bc92815b79bb52e1ffb0ba6323471",
    "assertionIds": [
      "TC-ITEM-ADD-015:expectation-1",
      "TC-ITEM-ADD-015:expectation-2",
      "TC-ITEM-ADD-015:expectation-3"
    ],
    "businessRule": {
      "businessRuleId": "BR-ITEM-010",
      "businessRuleFingerprint": "4398349399b4362b465c6b296e9728fe8b915410ead525fe230de611aa3e0462",
      "businessRuleAssertionIdsRequired": [
        "item-name-duplicate:api-error",
        "item-name-duplicate:category-independence",
        "item-name-duplicate:cross-type-rename",
        "item-name-duplicate:list-persistence",
        "item-name-duplicate:record-count",
        "item-name-duplicate:save-feedback",
        "item-name-duplicate:standard-package-cross-type"
      ],
      "businessRuleAssertionIdsObserved": [
        "item-name-duplicate:api-error",
        "item-name-duplicate:category-independence",
        "item-name-duplicate:cross-type-rename",
        "item-name-duplicate:list-persistence",
        "item-name-duplicate:record-count",
        "item-name-duplicate:save-feedback",
        "item-name-duplicate:standard-package-cross-type"
      ],
      "businessRuleUiEvidenceIds": [
        "TC-ITEM-ADD-015-runtime-evidence"
      ],
      "businessRuleApiEvidenceIds": [
        "TC-ITEM-ADD-015-runtime-evidence"
      ],
      "businessRuleDownstreamEvidenceIds": [],
      "businessRuleCleanup": {
        "required": true,
        "apiZeroResidue": false,
        "uiZeroResidue": false
      },
      "observedStatement": "同一商户内标准商品与套餐商品共享名称唯一性空间，彼此及各自同类型创建或编辑同名均失败并提示 BITEM-7014：商品名称与其它类型商品名称重复；加料商品使用独立名称空间，标准商品或套餐商品在创建及编辑改名时均可与加料商品同名，但加料商品之间创建或编辑同名均失败；分类不参与判重；同类型无重复时允许改名，编辑失败原名称保持不变"
    },
    "semanticCaseFingerprint": "30b0847cbcd8c0570d7bb8fa3f68778b86487a4184ae0d8739dcb4c3b42b7971"
  },
  {
    "caseId": "TC-ITEM-ADD-016",
    "title": "加料商品商品第二名称与商品名称互相不可重复",
    "irConverted": true,
    "reviewDecision": "approved",
    "automationClassification": "blocked",
    "recipeId": null,
    "recipeInventory": {
      "any": 0,
      "enabled": 0,
      "semanticComplete": 0,
      "files": []
    },
    "blockingReasons": [
      "RECIPE_REQUIRED"
    ],
    "family": "addon",
    "action": null,
    "runtimeReadiness": "ready",
    "runtimeStatus": "runtime-passed",
    "handlerId": "item-216:TC-ITEM-ADD-016",
    "bindingFingerprint": "fa126b1f6dd0304ce090f706dda4f8d87816fb6144bd36910696ab443c0a606b",
    "implementationFingerprint": "5b2f6ff4f8cfbcb8bea9f0d7919439faa34bc92815b79bb52e1ffb0ba6323471",
    "assertionIds": [
      "TC-ITEM-ADD-016:expectation-1",
      "TC-ITEM-ADD-016:expectation-2",
      "TC-ITEM-ADD-016:expectation-3"
    ],
    "semanticCaseFingerprint": "f8e179f01f673e38b64394f636aa2f1baeea3905297721d117478831a06f2f08"
  },
  {
    "caseId": "TC-ITEM-ADD-017",
    "title": "加料商品添加详情图片不超过 10 张",
    "irConverted": true,
    "reviewDecision": "approved",
    "automationClassification": "blocked",
    "recipeId": "product-center:green-draft:at28:tc-item-add-017",
    "recipeInventory": {
      "any": 1,
      "enabled": 1,
      "semanticComplete": 0,
      "files": [
        "contracts/product-center/recipes/green-drafts/product-center-item-green-binding-draft-recipes.json"
      ]
    },
    "blockingReasons": [
      "ASSERTION_CONTRACT_REQUIRED",
      "RUNTIME_EVIDENCE_REQUIRED"
    ],
    "family": "addon",
    "action": null,
    "runtimeReadiness": "ready",
    "runtimeStatus": "runtime-passed",
    "handlerId": "product-center:green-draft:at28:tc-item-add-017",
    "bindingFingerprint": "fa126b1f6dd0304ce090f706dda4f8d87816fb6144bd36910696ab443c0a606b",
    "implementationFingerprint": "5b2f6ff4f8cfbcb8bea9f0d7919439faa34bc92815b79bb52e1ffb0ba6323471",
    "assertionIds": [
      "TC-ITEM-ADD-017:expectation-1",
      "TC-ITEM-ADD-017:expectation-2"
    ],
    "semanticCaseFingerprint": "535a3aebc6d49f38f683735d00226c223a2e9bb37bf4a0c0a5e527da2797b8e6"
  },
  {
    "caseId": "TC-ITEM-ADD-018",
    "title": "加料商品描述标签多选保存成功",
    "irConverted": true,
    "reviewDecision": "approved",
    "automationClassification": "blocked",
    "recipeId": "product-center:yellow-probe:at26:tc-item-add-018",
    "recipeInventory": {
      "any": 1,
      "enabled": 0,
      "semanticComplete": 0,
      "files": [
        "contracts/product-center/recipes/yellow-probes/product-center-item-yellow-representative-probe-recipes.json"
      ]
    },
    "blockingReasons": [
      "RECIPE_GENERATION_DISABLED",
      "ASSERTION_CONTRACT_REQUIRED"
    ],
    "family": "addon",
    "action": null,
    "runtimeReadiness": "ready",
    "runtimeStatus": "runtime-passed",
    "handlerId": "product-center:yellow-probe:at26:tc-item-add-018",
    "bindingFingerprint": "fa126b1f6dd0304ce090f706dda4f8d87816fb6144bd36910696ab443c0a606b",
    "implementationFingerprint": "5b2f6ff4f8cfbcb8bea9f0d7919439faa34bc92815b79bb52e1ffb0ba6323471",
    "assertionIds": [
      "TC-ITEM-ADD-018:expectation-1",
      "TC-ITEM-ADD-018:expectation-2"
    ],
    "semanticCaseFingerprint": "a5ecf5de65d3f1585fd938f36083dd239ddcd0d39c8060bf7b594fc88d013097"
  },
  {
    "caseId": "TC-ITEM-ADD-019",
    "title": "加料商品商品角标单选保存成功",
    "irConverted": true,
    "reviewDecision": "approved",
    "automationClassification": "blocked",
    "recipeId": "product-center:yellow-probe:at26:tc-item-add-019",
    "recipeInventory": {
      "any": 1,
      "enabled": 0,
      "semanticComplete": 0,
      "files": [
        "contracts/product-center/recipes/yellow-probes/product-center-item-yellow-representative-probe-recipes.json"
      ]
    },
    "blockingReasons": [
      "RECIPE_GENERATION_DISABLED",
      "ASSERTION_CONTRACT_REQUIRED"
    ],
    "family": "addon",
    "action": null,
    "runtimeReadiness": "ready",
    "runtimeStatus": "runtime-passed",
    "handlerId": "product-center:yellow-probe:at26:tc-item-add-019",
    "bindingFingerprint": "fa126b1f6dd0304ce090f706dda4f8d87816fb6144bd36910696ab443c0a606b",
    "implementationFingerprint": "5b2f6ff4f8cfbcb8bea9f0d7919439faa34bc92815b79bb52e1ffb0ba6323471",
    "assertionIds": [
      "TC-ITEM-ADD-019:expectation-1",
      "TC-ITEM-ADD-019:expectation-2"
    ],
    "semanticCaseFingerprint": "2457c6f9dafb47033fcd5dc96d3d995c9cdad5bfee62e979cb18af1a8fa6699b"
  },
  {
    "caseId": "TC-ITEM-ADD-020",
    "title": "加料商品统计标签多选保存成功",
    "irConverted": true,
    "reviewDecision": "approved",
    "automationClassification": "blocked",
    "recipeId": "product-center:yellow-probe:at26:tc-item-add-020",
    "recipeInventory": {
      "any": 1,
      "enabled": 0,
      "semanticComplete": 0,
      "files": [
        "contracts/product-center/recipes/yellow-probes/product-center-item-yellow-representative-probe-recipes.json"
      ]
    },
    "blockingReasons": [
      "RECIPE_GENERATION_DISABLED",
      "ASSERTION_CONTRACT_REQUIRED"
    ],
    "family": "addon",
    "action": null,
    "runtimeReadiness": "ready",
    "runtimeStatus": "runtime-passed",
    "handlerId": "product-center:yellow-probe:at26:tc-item-add-020",
    "bindingFingerprint": "fa126b1f6dd0304ce090f706dda4f8d87816fb6144bd36910696ab443c0a606b",
    "implementationFingerprint": "5b2f6ff4f8cfbcb8bea9f0d7919439faa34bc92815b79bb52e1ffb0ba6323471",
    "assertionIds": [
      "TC-ITEM-ADD-020:expectation-1",
      "TC-ITEM-ADD-020:expectation-2"
    ],
    "semanticCaseFingerprint": "465f4783c1a4ceb1fcbeed5efa2b55fc8755dafb2b2e57164f5666ad6839d898"
  },
  {
    "caseId": "TC-ITEM-ADD-021",
    "title": "加料商品配置材料信息中原料、过敏原和营养成分后保存成功",
    "irConverted": true,
    "reviewDecision": "approved",
    "automationClassification": "blocked",
    "recipeId": "product-center:yellow-probe:at26:tc-item-add-021",
    "recipeInventory": {
      "any": 1,
      "enabled": 0,
      "semanticComplete": 0,
      "files": [
        "contracts/product-center/recipes/yellow-probes/product-center-item-yellow-representative-probe-recipes.json"
      ]
    },
    "blockingReasons": [
      "RECIPE_GENERATION_DISABLED",
      "ASSERTION_CONTRACT_REQUIRED",
      "RUNTIME_EVIDENCE_REQUIRED"
    ],
    "family": "addon",
    "action": null,
    "runtimeReadiness": "ready",
    "runtimeStatus": "runtime-passed",
    "handlerId": "product-center:yellow-probe:at26:tc-item-add-021",
    "bindingFingerprint": "fa126b1f6dd0304ce090f706dda4f8d87816fb6144bd36910696ab443c0a606b",
    "implementationFingerprint": "5b2f6ff4f8cfbcb8bea9f0d7919439faa34bc92815b79bb52e1ffb0ba6323471",
    "assertionIds": [
      "TC-ITEM-ADD-021:expectation-1",
      "TC-ITEM-ADD-021:expectation-2"
    ],
    "semanticCaseFingerprint": "27d9ccd3327541a97af371edc64488728829bd21bb77aa9bd7bc06a33b1a040c"
  },
  {
    "caseId": "TC-ITEM-ADD-022",
    "title": "加料商品本地上传主图后创建成功",
    "irConverted": true,
    "reviewDecision": "approved",
    "automationClassification": "blocked",
    "recipeId": "product-center:yellow-probe:at25:tc-item-add-022",
    "recipeInventory": {
      "any": 1,
      "enabled": 0,
      "semanticComplete": 0,
      "files": [
        "contracts/product-center/recipes/yellow-probes/product-center-item-yellow-representative-probe-recipes.json"
      ]
    },
    "blockingReasons": [
      "RECIPE_GENERATION_DISABLED",
      "ASSERTION_CONTRACT_REQUIRED",
      "RUNTIME_EVIDENCE_REQUIRED"
    ],
    "family": "addon",
    "action": null,
    "runtimeReadiness": "ready",
    "runtimeStatus": "runtime-passed",
    "handlerId": "product-center:yellow-probe:at25:tc-item-add-022",
    "bindingFingerprint": "fa126b1f6dd0304ce090f706dda4f8d87816fb6144bd36910696ab443c0a606b",
    "implementationFingerprint": "5b2f6ff4f8cfbcb8bea9f0d7919439faa34bc92815b79bb52e1ffb0ba6323471",
    "assertionIds": [
      "TC-ITEM-ADD-022:expectation-1",
      "TC-ITEM-ADD-022:expectation-2",
      "TC-ITEM-ADD-022:expectation-3"
    ],
    "semanticCaseFingerprint": "92c2555c80884cebc77cb59a2715164634eb88c81d0aa538a1a587bd906f2797"
  },
  {
    "caseId": "TC-ITEM-ADD-023",
    "title": "加料商品列表按名称类型分类状态组合查询成功",
    "irConverted": true,
    "reviewDecision": "approved",
    "automationClassification": "blocked",
    "recipeId": "product-center:item-p0-wave-b:TC-ITEM-ADD-023",
    "recipeInventory": {
      "any": 1,
      "enabled": 1,
      "semanticComplete": 0,
      "files": [
        "contracts/product-center/recipes/product-center-item-p0-wave-b-recipes.json"
      ]
    },
    "blockingReasons": [
      "ASSERTION_CONTRACT_REQUIRED",
      "RUNTIME_EVIDENCE_REQUIRED"
    ],
    "family": "addon",
    "action": null,
    "runtimeReadiness": "ready",
    "runtimeStatus": "runtime-passed",
    "handlerId": "product-center:item-p0-wave-b:TC-ITEM-ADD-023",
    "bindingFingerprint": "fa126b1f6dd0304ce090f706dda4f8d87816fb6144bd36910696ab443c0a606b",
    "implementationFingerprint": "5b2f6ff4f8cfbcb8bea9f0d7919439faa34bc92815b79bb52e1ffb0ba6323471",
    "assertionIds": [
      "TC-ITEM-ADD-023:expectation-1",
      "TC-ITEM-ADD-023:expectation-2",
      "TC-ITEM-ADD-023:expectation-3",
      "TC-ITEM-ADD-023:expectation-4"
    ],
    "businessRule": {
      "businessRuleId": "BR-FMT-009",
      "businessRuleFingerprint": "7a0672cb003cac8cfdf537cfdf0e5233ad5acbedf28c14561f6d763608da99d2",
      "businessRuleAssertionIdsRequired": [
        "br-fmt-009:canonical-outcome-1",
        "br-fmt-009:canonical-outcome-10",
        "br-fmt-009:canonical-outcome-11",
        "br-fmt-009:canonical-outcome-12",
        "br-fmt-009:canonical-outcome-13",
        "br-fmt-009:canonical-outcome-2",
        "br-fmt-009:canonical-outcome-3",
        "br-fmt-009:canonical-outcome-4",
        "br-fmt-009:canonical-outcome-5",
        "br-fmt-009:canonical-outcome-6",
        "br-fmt-009:canonical-outcome-7",
        "br-fmt-009:canonical-outcome-8",
        "br-fmt-009:canonical-outcome-9"
      ],
      "businessRuleAssertionIdsObserved": [
        "br-fmt-009:canonical-outcome-1",
        "br-fmt-009:canonical-outcome-10",
        "br-fmt-009:canonical-outcome-11",
        "br-fmt-009:canonical-outcome-12",
        "br-fmt-009:canonical-outcome-13",
        "br-fmt-009:canonical-outcome-2",
        "br-fmt-009:canonical-outcome-3",
        "br-fmt-009:canonical-outcome-4",
        "br-fmt-009:canonical-outcome-5",
        "br-fmt-009:canonical-outcome-6",
        "br-fmt-009:canonical-outcome-7",
        "br-fmt-009:canonical-outcome-8",
        "br-fmt-009:canonical-outcome-9"
      ],
      "businessRuleUiEvidenceIds": [
        "TC-ITEM-ADD-023-runtime-evidence"
      ],
      "businessRuleApiEvidenceIds": [],
      "businessRuleDownstreamEvidenceIds": [],
      "businessRuleCleanup": {
        "required": false,
        "apiZeroResidue": false,
        "uiZeroResidue": false
      },
      "observedStatement": "查询、筛选或重置后列表回到第 1 页；筛选项变更自动刷新；重置清空条件并恢复全量结果"
    },
    "semanticCaseFingerprint": "6ac16fcc4a3e14ef7125437aa6d780fe52b50fa297adeb69c9c3b93fa4603d78"
  },
  {
    "caseId": "TC-ITEM-ADD-024",
    "title": "加料商品编辑基础信息后保存成功",
    "irConverted": true,
    "reviewDecision": "approved",
    "automationClassification": "blocked",
    "recipeId": null,
    "recipeInventory": {
      "any": 0,
      "enabled": 0,
      "semanticComplete": 0,
      "files": []
    },
    "blockingReasons": [
      "RECIPE_REQUIRED"
    ],
    "family": "addon",
    "action": null,
    "runtimeReadiness": "ready",
    "runtimeStatus": "runtime-passed",
    "handlerId": "item-216:TC-ITEM-ADD-024",
    "bindingFingerprint": "fa126b1f6dd0304ce090f706dda4f8d87816fb6144bd36910696ab443c0a606b",
    "implementationFingerprint": "5b2f6ff4f8cfbcb8bea9f0d7919439faa34bc92815b79bb52e1ffb0ba6323471",
    "assertionIds": [
      "TC-ITEM-ADD-024:expectation-1",
      "TC-ITEM-ADD-024:expectation-2",
      "TC-ITEM-ADD-024:expectation-3",
      "TC-ITEM-ADD-024:expectation-4"
    ],
    "semanticCaseFingerprint": "e349c8cce0f19683b3311799096d96f185586adf301dc6d77fa241ee34fb5ae9"
  },
  {
    "caseId": "TC-ITEM-ADD-025",
    "title": "加料商品编辑其他信息后保存成功",
    "irConverted": true,
    "reviewDecision": "approved",
    "automationClassification": "blocked",
    "recipeId": "product-center:yellow-probe:at22:tc-item-add-025",
    "recipeInventory": {
      "any": 1,
      "enabled": 0,
      "semanticComplete": 0,
      "files": [
        "contracts/product-center/recipes/yellow-probes/product-center-item-yellow-representative-probe-recipes.json"
      ]
    },
    "blockingReasons": [
      "RECIPE_GENERATION_DISABLED",
      "ASSERTION_CONTRACT_REQUIRED",
      "RUNTIME_EVIDENCE_REQUIRED"
    ],
    "family": "addon",
    "action": null,
    "runtimeReadiness": "ready",
    "runtimeStatus": "runtime-passed",
    "handlerId": "product-center:yellow-probe:at22:tc-item-add-025",
    "bindingFingerprint": "fa126b1f6dd0304ce090f706dda4f8d87816fb6144bd36910696ab443c0a606b",
    "implementationFingerprint": "5b2f6ff4f8cfbcb8bea9f0d7919439faa34bc92815b79bb52e1ffb0ba6323471",
    "assertionIds": [
      "TC-ITEM-ADD-025:expectation-1",
      "TC-ITEM-ADD-025:expectation-2"
    ],
    "semanticCaseFingerprint": "25083d130665820870843b3208dff8c372b06e4e83196b1421c3b417d9cde1c6"
  },
  {
    "caseId": "TC-ITEM-ADD-026",
    "title": "加料商品无引用时删除成功",
    "irConverted": true,
    "reviewDecision": "approved",
    "automationClassification": "blocked",
    "recipeId": null,
    "recipeInventory": {
      "any": 0,
      "enabled": 0,
      "semanticComplete": 0,
      "files": []
    },
    "blockingReasons": [
      "RECIPE_REQUIRED"
    ],
    "family": "addon",
    "action": null,
    "runtimeReadiness": "ready",
    "runtimeStatus": "runtime-passed",
    "handlerId": "item-216:TC-ITEM-ADD-026",
    "bindingFingerprint": "fa126b1f6dd0304ce090f706dda4f8d87816fb6144bd36910696ab443c0a606b",
    "implementationFingerprint": "5b2f6ff4f8cfbcb8bea9f0d7919439faa34bc92815b79bb52e1ffb0ba6323471",
    "assertionIds": [
      "TC-ITEM-ADD-026:expectation-1",
      "TC-ITEM-ADD-026:expectation-2",
      "TC-ITEM-ADD-026:expectation-3"
    ],
    "semanticCaseFingerprint": "d171df236490c8cd6938b08dfd2eb6cf7c1af3d95fe903deecec12164e1470a2"
  },
  {
    "caseId": "TC-ITEM-ADD-027",
    "title": "加料商品被加料组引用且组被商品引用时不可删除",
    "irConverted": true,
    "reviewDecision": "approved",
    "automationClassification": "blocked",
    "recipeId": null,
    "recipeInventory": {
      "any": 0,
      "enabled": 0,
      "semanticComplete": 0,
      "files": []
    },
    "blockingReasons": [
      "RECIPE_REQUIRED"
    ],
    "family": "addon",
    "action": null,
    "runtimeReadiness": "ready",
    "runtimeStatus": "runtime-passed",
    "handlerId": "item-216:TC-ITEM-ADD-027",
    "bindingFingerprint": "fa126b1f6dd0304ce090f706dda4f8d87816fb6144bd36910696ab443c0a606b",
    "implementationFingerprint": "5b2f6ff4f8cfbcb8bea9f0d7919439faa34bc92815b79bb52e1ffb0ba6323471",
    "assertionIds": [
      "TC-ITEM-ADD-027:expectation-1",
      "TC-ITEM-ADD-027:expectation-2"
    ],
    "semanticCaseFingerprint": "7eef0b110148675fe5990e089fa74e412c90fd04bf5ec25e85e25a3d31d71e37"
  },
  {
    "caseId": "TC-ITEM-ADD-028",
    "title": "加料商品被菜单引用时不可删除",
    "irConverted": true,
    "reviewDecision": "approved",
    "automationClassification": "blocked",
    "recipeId": null,
    "recipeInventory": {
      "any": 0,
      "enabled": 0,
      "semanticComplete": 0,
      "files": []
    },
    "blockingReasons": [
      "RECIPE_REQUIRED"
    ],
    "family": "addon",
    "action": null,
    "runtimeReadiness": "ready",
    "runtimeStatus": "runtime-passed",
    "handlerId": "item-216:TC-ITEM-ADD-028",
    "bindingFingerprint": "fa126b1f6dd0304ce090f706dda4f8d87816fb6144bd36910696ab443c0a606b",
    "implementationFingerprint": "5b2f6ff4f8cfbcb8bea9f0d7919439faa34bc92815b79bb52e1ffb0ba6323471",
    "assertionIds": [
      "TC-ITEM-ADD-028:expectation-1",
      "TC-ITEM-ADD-028:expectation-2"
    ],
    "semanticCaseFingerprint": "0ac59338b21e73077a2c1dbc6afc2ca2cded7921fd391086610d5db69df2416d"
  },
  {
    "caseId": "TC-ITEM-ADD-029",
    "title": "加料商品创建页不展示多规格入口",
    "irConverted": true,
    "reviewDecision": "approved",
    "automationClassification": "blocked",
    "recipeId": null,
    "recipeInventory": {
      "any": 0,
      "enabled": 0,
      "semanticComplete": 0,
      "files": []
    },
    "blockingReasons": [
      "RECIPE_REQUIRED"
    ],
    "family": "addon",
    "action": null,
    "runtimeReadiness": "ready",
    "runtimeStatus": "runtime-passed",
    "handlerId": "item-216:TC-ITEM-ADD-029",
    "bindingFingerprint": "fa126b1f6dd0304ce090f706dda4f8d87816fb6144bd36910696ab443c0a606b",
    "implementationFingerprint": "5b2f6ff4f8cfbcb8bea9f0d7919439faa34bc92815b79bb52e1ffb0ba6323471",
    "assertionIds": [
      "TC-ITEM-ADD-029:expectation-1"
    ],
    "semanticCaseFingerprint": "a5ae2c6ada66db69dd237f5a22be7b8f17f45f6da4dad2339aa4430bfbc8df8a"
  },
  {
    "caseId": "TC-ITEM-ADD-030",
    "title": "加料商品创建页不展示是否称重商品选项",
    "irConverted": true,
    "reviewDecision": "approved",
    "automationClassification": "blocked",
    "recipeId": null,
    "recipeInventory": {
      "any": 0,
      "enabled": 0,
      "semanticComplete": 0,
      "files": []
    },
    "blockingReasons": [
      "RECIPE_REQUIRED"
    ],
    "family": "addon",
    "action": null,
    "runtimeReadiness": "ready",
    "runtimeStatus": "runtime-passed",
    "handlerId": "item-216:TC-ITEM-ADD-030",
    "bindingFingerprint": "fa126b1f6dd0304ce090f706dda4f8d87816fb6144bd36910696ab443c0a606b",
    "implementationFingerprint": "5b2f6ff4f8cfbcb8bea9f0d7919439faa34bc92815b79bb52e1ffb0ba6323471",
    "assertionIds": [
      "TC-ITEM-ADD-030:expectation-1"
    ],
    "semanticCaseFingerprint": "a85967ae0b65e1d8a8224e56a6ea0d84d185a107d405b932ecf8a29ef1c104f5"
  },
  {
    "caseId": "TC-ITEM-ADD-031",
    "title": "加料商品创建页不展示套餐组入口",
    "irConverted": true,
    "reviewDecision": "approved",
    "automationClassification": "blocked",
    "recipeId": null,
    "recipeInventory": {
      "any": 0,
      "enabled": 0,
      "semanticComplete": 0,
      "files": []
    },
    "blockingReasons": [
      "RECIPE_REQUIRED"
    ],
    "family": "addon",
    "action": null,
    "runtimeReadiness": "ready",
    "runtimeStatus": "runtime-passed",
    "handlerId": "item-216:TC-ITEM-ADD-031",
    "bindingFingerprint": "fa126b1f6dd0304ce090f706dda4f8d87816fb6144bd36910696ab443c0a606b",
    "implementationFingerprint": "5b2f6ff4f8cfbcb8bea9f0d7919439faa34bc92815b79bb52e1ffb0ba6323471",
    "assertionIds": [
      "TC-ITEM-ADD-031:expectation-1"
    ],
    "semanticCaseFingerprint": "0e9fe4e309e0340e18d5f344cea7b5516e4135d10283a1b5a3caac81b070d236"
  },
  {
    "caseId": "TC-ITEM-ADD-032",
    "title": "加料商品创建页不展示商品属性编辑区",
    "irConverted": true,
    "reviewDecision": "approved",
    "automationClassification": "blocked",
    "recipeId": null,
    "recipeInventory": {
      "any": 0,
      "enabled": 0,
      "semanticComplete": 0,
      "files": []
    },
    "blockingReasons": [
      "RECIPE_REQUIRED"
    ],
    "family": "addon",
    "action": null,
    "runtimeReadiness": "ready",
    "runtimeStatus": "runtime-passed",
    "handlerId": "item-216:TC-ITEM-ADD-032",
    "bindingFingerprint": "fa126b1f6dd0304ce090f706dda4f8d87816fb6144bd36910696ab443c0a606b",
    "implementationFingerprint": "5b2f6ff4f8cfbcb8bea9f0d7919439faa34bc92815b79bb52e1ffb0ba6323471",
    "assertionIds": [
      "TC-ITEM-ADD-032:expectation-1"
    ],
    "semanticCaseFingerprint": "8e4fad970837975d8f1f218bc20e6a17361e0fda43c842cd1782af31df2b7f3b"
  },
  {
    "caseId": "TC-ITEM-ADD-033",
    "title": "加料组新增时可搜索并选择该加料商品",
    "irConverted": true,
    "reviewDecision": "approved",
    "automationClassification": "blocked",
    "recipeId": "product-center:yellow-probe:at23:tc-item-add-033",
    "recipeInventory": {
      "any": 1,
      "enabled": 0,
      "semanticComplete": 0,
      "files": [
        "contracts/product-center/recipes/yellow-probes/product-center-item-yellow-representative-probe-recipes.json"
      ]
    },
    "blockingReasons": [
      "RECIPE_GENERATION_DISABLED",
      "ASSERTION_CONTRACT_REQUIRED",
      "RUNTIME_EVIDENCE_REQUIRED"
    ],
    "family": "addon",
    "action": null,
    "runtimeReadiness": "ready",
    "runtimeStatus": "runtime-passed",
    "handlerId": "product-center:yellow-probe:at23:tc-item-add-033",
    "bindingFingerprint": "fa126b1f6dd0304ce090f706dda4f8d87816fb6144bd36910696ab443c0a606b",
    "implementationFingerprint": "5b2f6ff4f8cfbcb8bea9f0d7919439faa34bc92815b79bb52e1ffb0ba6323471",
    "assertionIds": [
      "TC-ITEM-ADD-033:expectation-1",
      "TC-ITEM-ADD-033:expectation-2"
    ],
    "semanticCaseFingerprint": "bf56ac60141533dbcb84b6e7974e79c25145d47e6f818e5c36ead0ab95032135"
  },
  {
    "caseId": "TC-ITEM-ADD-034",
    "title": "标准商品引用含该加料的加料组后加料商品不可删除",
    "irConverted": true,
    "reviewDecision": "approved",
    "automationClassification": "blocked",
    "recipeId": null,
    "recipeInventory": {
      "any": 0,
      "enabled": 0,
      "semanticComplete": 0,
      "files": []
    },
    "blockingReasons": [
      "RECIPE_REQUIRED"
    ],
    "family": "addon",
    "action": null,
    "runtimeReadiness": "ready",
    "runtimeStatus": "runtime-passed",
    "handlerId": "item-216:TC-ITEM-ADD-034",
    "bindingFingerprint": "fa126b1f6dd0304ce090f706dda4f8d87816fb6144bd36910696ab443c0a606b",
    "implementationFingerprint": "5b2f6ff4f8cfbcb8bea9f0d7919439faa34bc92815b79bb52e1ffb0ba6323471",
    "assertionIds": [
      "TC-ITEM-ADD-034:expectation-1",
      "TC-ITEM-ADD-034:expectation-2"
    ],
    "semanticCaseFingerprint": "1ccdf0d52d032394791343235f295db0a861c14d6f1016f680fb50613931c1b0"
  },
  {
    "caseId": "TC-ITEM-ADD-035",
    "title": "加料商品列表主图不支持点击查看大图",
    "irConverted": true,
    "reviewDecision": "approved",
    "automationClassification": "blocked",
    "recipeId": "product-center:yellow-probe:at31:tc-item-add-035",
    "recipeInventory": {
      "any": 1,
      "enabled": 0,
      "semanticComplete": 0,
      "files": [
        "contracts/product-center/recipes/yellow-probes/product-center-item-yellow-representative-probe-recipes.json"
      ]
    },
    "blockingReasons": [
      "RECIPE_GENERATION_DISABLED",
      "ASSERTION_CONTRACT_REQUIRED",
      "RUNTIME_EVIDENCE_REQUIRED"
    ],
    "family": "addon",
    "action": null,
    "runtimeReadiness": "ready",
    "runtimeStatus": "runtime-passed",
    "handlerId": "product-center:yellow-probe:at31:tc-item-add-035",
    "bindingFingerprint": "fa126b1f6dd0304ce090f706dda4f8d87816fb6144bd36910696ab443c0a606b",
    "implementationFingerprint": "5cbd878c8ed45b05580610b95807328111022d70fbbe82d3d92ab8cb8f49f28a",
    "assertionIds": [
      "TC-ITEM-ADD-035:expectation-1"
    ],
    "semanticCaseFingerprint": "5eceb60f701c54268ef2ed561b212574f500ae943178e93637229298450f35e5"
  },
  {
    "caseId": "TC-ITEM-ADD-036",
    "title": "加料商品列表删除操作展示确认文案",
    "irConverted": true,
    "reviewDecision": "approved",
    "automationClassification": "blocked",
    "recipeId": null,
    "recipeInventory": {
      "any": 0,
      "enabled": 0,
      "semanticComplete": 0,
      "files": []
    },
    "blockingReasons": [
      "RECIPE_REQUIRED"
    ],
    "family": "addon",
    "action": null,
    "runtimeReadiness": "ready",
    "runtimeStatus": "runtime-passed",
    "handlerId": "item-216:TC-ITEM-ADD-036",
    "bindingFingerprint": "fa126b1f6dd0304ce090f706dda4f8d87816fb6144bd36910696ab443c0a606b",
    "implementationFingerprint": "5b2f6ff4f8cfbcb8bea9f0d7919439faa34bc92815b79bb52e1ffb0ba6323471",
    "assertionIds": [
      "TC-ITEM-ADD-036:expectation-1",
      "TC-ITEM-ADD-036:expectation-2"
    ],
    "semanticCaseFingerprint": "b8f15fa35c15f3edec1bcf9747bd4748a6d4b293fe0446a80cfbb2dfb3cd1409"
  },
  {
    "caseId": "TC-ITEM-ADD-037",
    "title": "加料商品状态变更后需下发到门店终端才生效",
    "irConverted": true,
    "reviewDecision": "approved",
    "automationClassification": "blocked",
    "recipeId": "product-center:yellow-probe:at33:tc-item-add-037",
    "recipeInventory": {
      "any": 1,
      "enabled": 0,
      "semanticComplete": 0,
      "files": [
        "contracts/product-center/recipes/yellow-probes/product-center-item-yellow-representative-probe-recipes.json"
      ]
    },
    "blockingReasons": [
      "RECIPE_GENERATION_DISABLED",
      "ASSERTION_CONTRACT_REQUIRED",
      "RUNTIME_EVIDENCE_REQUIRED"
    ],
    "family": "addon",
    "action": null,
    "runtimeReadiness": "ready",
    "runtimeStatus": "runtime-passed",
    "handlerId": "product-center:yellow-probe:at33:tc-item-add-037",
    "bindingFingerprint": "fa126b1f6dd0304ce090f706dda4f8d87816fb6144bd36910696ab443c0a606b",
    "implementationFingerprint": "5b2f6ff4f8cfbcb8bea9f0d7919439faa34bc92815b79bb52e1ffb0ba6323471",
    "assertionIds": [
      "TC-ITEM-ADD-037:expectation-1"
    ],
    "semanticCaseFingerprint": "e6d3d2136f88b2a2a14d0e2359e196f0daa4ac330ece781ff4183b462df26f4e"
  },
  {
    "caseId": "TC-ITEM-ADD-038",
    "title": "加料商品继续上传第 2 张主图时覆盖第 1 张主图",
    "irConverted": true,
    "reviewDecision": "approved",
    "automationClassification": "blocked",
    "recipeId": "product-center:yellow-probe:at30:tc-item-add-038",
    "recipeInventory": {
      "any": 1,
      "enabled": 0,
      "semanticComplete": 0,
      "files": [
        "contracts/product-center/recipes/yellow-probes/product-center-item-yellow-representative-probe-recipes.json"
      ]
    },
    "blockingReasons": [
      "RECIPE_GENERATION_DISABLED",
      "ASSERTION_CONTRACT_REQUIRED",
      "RUNTIME_EVIDENCE_REQUIRED"
    ],
    "family": "addon",
    "action": null,
    "runtimeReadiness": "ready",
    "runtimeStatus": "runtime-passed",
    "handlerId": "product-center:yellow-probe:at30:tc-item-add-038",
    "bindingFingerprint": "fa126b1f6dd0304ce090f706dda4f8d87816fb6144bd36910696ab443c0a606b",
    "implementationFingerprint": "5b2f6ff4f8cfbcb8bea9f0d7919439faa34bc92815b79bb52e1ffb0ba6323471",
    "assertionIds": [
      "TC-ITEM-ADD-038:expectation-1",
      "TC-ITEM-ADD-038:expectation-2"
    ],
    "semanticCaseFingerprint": "8ed915cf7bd2ea2126dfa61a2e2916263e924e79252df245ebf314bd6ab87978"
  },
  {
    "caseId": "TC-ITEM-ADD-039",
    "title": "加料商品从图片库选择主图后创建成功",
    "irConverted": true,
    "reviewDecision": "approved",
    "automationClassification": "blocked",
    "recipeId": "product-center:yellow-probe:at25:tc-item-add-039",
    "recipeInventory": {
      "any": 1,
      "enabled": 0,
      "semanticComplete": 0,
      "files": [
        "contracts/product-center/recipes/yellow-probes/product-center-item-yellow-representative-probe-recipes.json"
      ]
    },
    "blockingReasons": [
      "RECIPE_GENERATION_DISABLED",
      "ASSERTION_CONTRACT_REQUIRED",
      "RUNTIME_EVIDENCE_REQUIRED"
    ],
    "family": "addon",
    "action": null,
    "runtimeReadiness": "ready",
    "runtimeStatus": "runtime-passed",
    "handlerId": "product-center:yellow-probe:at25:tc-item-add-039",
    "bindingFingerprint": "fa126b1f6dd0304ce090f706dda4f8d87816fb6144bd36910696ab443c0a606b",
    "implementationFingerprint": "5b2f6ff4f8cfbcb8bea9f0d7919439faa34bc92815b79bb52e1ffb0ba6323471",
    "assertionIds": [
      "TC-ITEM-ADD-039:expectation-1",
      "TC-ITEM-ADD-039:expectation-2",
      "TC-ITEM-ADD-039:expectation-3"
    ],
    "semanticCaseFingerprint": "ba08a492f94b4ddbe6e4caef720f0be16a4f2e87fbb5fbc080c9f72690d468b0"
  },
  {
    "caseId": "TC-ITEM-ADD-040",
    "title": "加料商品重置查询后页面恢复初始状态",
    "irConverted": true,
    "reviewDecision": "approved",
    "automationClassification": "blocked",
    "recipeId": "product-center:item-p0-wave-b:TC-ITEM-ADD-040",
    "recipeInventory": {
      "any": 1,
      "enabled": 1,
      "semanticComplete": 0,
      "files": [
        "contracts/product-center/recipes/product-center-item-p0-wave-b-recipes.json"
      ]
    },
    "blockingReasons": [
      "ASSERTION_CONTRACT_REQUIRED",
      "RUNTIME_EVIDENCE_REQUIRED"
    ],
    "family": "addon",
    "action": null,
    "runtimeReadiness": "ready",
    "runtimeStatus": "runtime-passed",
    "handlerId": "product-center:item-p0-wave-b:TC-ITEM-ADD-040",
    "bindingFingerprint": "fa126b1f6dd0304ce090f706dda4f8d87816fb6144bd36910696ab443c0a606b",
    "implementationFingerprint": "5b2f6ff4f8cfbcb8bea9f0d7919439faa34bc92815b79bb52e1ffb0ba6323471",
    "assertionIds": [
      "TC-ITEM-ADD-040:expectation-1",
      "TC-ITEM-ADD-040:expectation-2",
      "TC-ITEM-ADD-040:expectation-3"
    ],
    "businessRule": {
      "businessRuleId": "BR-FMT-009",
      "businessRuleFingerprint": "7a0672cb003cac8cfdf537cfdf0e5233ad5acbedf28c14561f6d763608da99d2",
      "businessRuleAssertionIdsRequired": [
        "br-fmt-009:canonical-outcome-1",
        "br-fmt-009:canonical-outcome-10",
        "br-fmt-009:canonical-outcome-11",
        "br-fmt-009:canonical-outcome-12",
        "br-fmt-009:canonical-outcome-13",
        "br-fmt-009:canonical-outcome-2",
        "br-fmt-009:canonical-outcome-3",
        "br-fmt-009:canonical-outcome-4",
        "br-fmt-009:canonical-outcome-5",
        "br-fmt-009:canonical-outcome-6",
        "br-fmt-009:canonical-outcome-7",
        "br-fmt-009:canonical-outcome-8",
        "br-fmt-009:canonical-outcome-9"
      ],
      "businessRuleAssertionIdsObserved": [
        "br-fmt-009:canonical-outcome-1",
        "br-fmt-009:canonical-outcome-10",
        "br-fmt-009:canonical-outcome-11",
        "br-fmt-009:canonical-outcome-12",
        "br-fmt-009:canonical-outcome-13",
        "br-fmt-009:canonical-outcome-2",
        "br-fmt-009:canonical-outcome-3",
        "br-fmt-009:canonical-outcome-4",
        "br-fmt-009:canonical-outcome-5",
        "br-fmt-009:canonical-outcome-6",
        "br-fmt-009:canonical-outcome-7",
        "br-fmt-009:canonical-outcome-8",
        "br-fmt-009:canonical-outcome-9"
      ],
      "businessRuleUiEvidenceIds": [
        "TC-ITEM-ADD-040-runtime-evidence"
      ],
      "businessRuleApiEvidenceIds": [],
      "businessRuleDownstreamEvidenceIds": [],
      "businessRuleCleanup": {
        "required": false,
        "apiZeroResidue": false,
        "uiZeroResidue": false
      },
      "observedStatement": "查询、筛选或重置后列表回到第 1 页；筛选项变更自动刷新；重置清空条件并恢复全量结果"
    },
    "semanticCaseFingerprint": "1fd48229900a6c015c6a99ad7b8266ad9c4c6b14546ef7e9da1ea6bb15baddef"
  },
  {
    "caseId": "TC-ITEM-ADD-041",
    "title": "切换页面返回加料商品列表时不保留查询条件",
    "irConverted": true,
    "reviewDecision": "approved",
    "automationClassification": "blocked",
    "recipeId": "product-center:yellow-probe:at24:tc-item-add-041",
    "recipeInventory": {
      "any": 1,
      "enabled": 0,
      "semanticComplete": 0,
      "files": [
        "contracts/product-center/recipes/yellow-probes/product-center-item-yellow-representative-probe-recipes.json"
      ]
    },
    "blockingReasons": [
      "RECIPE_GENERATION_DISABLED",
      "ASSERTION_CONTRACT_REQUIRED",
      "RUNTIME_EVIDENCE_REQUIRED"
    ],
    "family": "addon",
    "action": null,
    "runtimeReadiness": "ready",
    "runtimeStatus": "runtime-passed",
    "handlerId": "product-center:yellow-probe:at24:tc-item-add-041",
    "bindingFingerprint": "fa126b1f6dd0304ce090f706dda4f8d87816fb6144bd36910696ab443c0a606b",
    "implementationFingerprint": "5b2f6ff4f8cfbcb8bea9f0d7919439faa34bc92815b79bb52e1ffb0ba6323471",
    "assertionIds": [
      "TC-ITEM-ADD-041:expectation-1"
    ],
    "semanticCaseFingerprint": "db654ee5fb81ef282423c9262d9b68685ea91a504be71913d20354224a810950"
  },
  {
    "caseId": "TC-ITEM-ADD-042",
    "title": "加料商品列表启用商品操作成功",
    "irConverted": true,
    "reviewDecision": "approved",
    "automationClassification": "blocked",
    "recipeId": "product-center:item-p0-wave-b:TC-ITEM-ADD-042",
    "recipeInventory": {
      "any": 1,
      "enabled": 1,
      "semanticComplete": 0,
      "files": [
        "contracts/product-center/recipes/product-center-item-p0-wave-b-recipes.json"
      ]
    },
    "blockingReasons": [
      "ASSERTION_CONTRACT_REQUIRED",
      "RUNTIME_EVIDENCE_REQUIRED"
    ],
    "family": "addon",
    "action": null,
    "runtimeReadiness": "ready",
    "runtimeStatus": "runtime-passed",
    "handlerId": "product-center:item-p0-wave-b:TC-ITEM-ADD-042",
    "bindingFingerprint": "fa126b1f6dd0304ce090f706dda4f8d87816fb6144bd36910696ab443c0a606b",
    "implementationFingerprint": "5b2f6ff4f8cfbcb8bea9f0d7919439faa34bc92815b79bb52e1ffb0ba6323471",
    "assertionIds": [
      "TC-ITEM-ADD-042:expectation-1",
      "TC-ITEM-ADD-042:expectation-2"
    ],
    "semanticCaseFingerprint": "eade7626ea56adc4398fc86824ff0e624547310e9c1e8743cf4e0e28924741c6"
  },
  {
    "caseId": "TC-ITEM-ADD-043",
    "title": "加料商品列表停用商品操作成功",
    "irConverted": true,
    "reviewDecision": "approved",
    "automationClassification": "blocked",
    "recipeId": "product-center:item-p0-wave-b:TC-ITEM-ADD-043",
    "recipeInventory": {
      "any": 1,
      "enabled": 1,
      "semanticComplete": 0,
      "files": [
        "contracts/product-center/recipes/product-center-item-p0-wave-b-recipes.json"
      ]
    },
    "blockingReasons": [
      "ASSERTION_CONTRACT_REQUIRED",
      "RUNTIME_EVIDENCE_REQUIRED"
    ],
    "family": "addon",
    "action": null,
    "runtimeReadiness": "ready",
    "runtimeStatus": "runtime-passed",
    "handlerId": "product-center:item-p0-wave-b:TC-ITEM-ADD-043",
    "bindingFingerprint": "fa126b1f6dd0304ce090f706dda4f8d87816fb6144bd36910696ab443c0a606b",
    "implementationFingerprint": "5b2f6ff4f8cfbcb8bea9f0d7919439faa34bc92815b79bb52e1ffb0ba6323471",
    "assertionIds": [
      "TC-ITEM-ADD-043:expectation-1",
      "TC-ITEM-ADD-043:expectation-2"
    ],
    "semanticCaseFingerprint": "626343b00d1481f13746caa0b2b0488194a191d32f8d564b2b23e04417d600f7"
  },
  {
    "caseId": "TC-ITEM-ADD-044",
    "title": "菜单已引用的加料商品二次确认后停用成功",
    "irConverted": true,
    "reviewDecision": "approved",
    "automationClassification": "blocked",
    "recipeId": null,
    "recipeInventory": {
      "any": 0,
      "enabled": 0,
      "semanticComplete": 0,
      "files": []
    },
    "blockingReasons": [
      "RECIPE_REQUIRED"
    ],
    "family": "addon",
    "action": null,
    "runtimeReadiness": "ready",
    "runtimeStatus": "runtime-passed",
    "handlerId": "item-216:TC-ITEM-ADD-044",
    "bindingFingerprint": "fa126b1f6dd0304ce090f706dda4f8d87816fb6144bd36910696ab443c0a606b",
    "implementationFingerprint": "5b2f6ff4f8cfbcb8bea9f0d7919439faa34bc92815b79bb52e1ffb0ba6323471",
    "assertionIds": [
      "TC-ITEM-ADD-044:expectation-1"
    ],
    "semanticCaseFingerprint": "c69cee2c1cae3217744b27e656ccb6bf77426e00e9c9f0969a1ae21a43110291"
  },
  {
    "caseId": "TC-ITEM-STD-080",
    "title": "称重商品购买重量小于皮重时终端价格为 0",
    "irConverted": true,
    "reviewDecision": "approved",
    "automationClassification": "blocked",
    "recipeId": null,
    "recipeInventory": {
      "any": 0,
      "enabled": 0,
      "semanticComplete": 0,
      "files": []
    },
    "blockingReasons": [
      "RECIPE_REQUIRED"
    ],
    "family": "standard",
    "action": "contract-resolution",
    "runtimeReadiness": "environment-blocked",
    "runtimeStatus": "deferred",
    "handlerId": "item-216:TC-ITEM-STD-080",
    "bindingFingerprint": "fa126b1f6dd0304ce090f706dda4f8d87816fb6144bd36910696ab443c0a606b",
    "implementationFingerprint": "5967bb7f95556a9775c7c163d540dd7f7576f60cb511116657eec1e34eb14f12",
    "assertionIds": [
      "TC-ITEM-STD-080:expectation-1"
    ],
    "semanticCaseFingerprint": "68d4a543f2d5464bbe99a7059f107a0e0201b9e5a467523e5a8d26e8bf059722"
  },
  {
    "caseId": "TC-ITEM-STD-081",
    "title": "详情图重复引用同一张图片保存失败并提示 BITEM-3006",
    "irConverted": true,
    "reviewDecision": "approved",
    "automationClassification": "blocked",
    "recipeId": null,
    "recipeInventory": {
      "any": 0,
      "enabled": 0,
      "semanticComplete": 0,
      "files": []
    },
    "blockingReasons": [
      "RECIPE_REQUIRED"
    ],
    "family": "standard",
    "action": "contract-resolution",
    "runtimeReadiness": "ready",
    "runtimeStatus": "runtime-passed",
    "handlerId": "item-216:TC-ITEM-STD-081",
    "bindingFingerprint": "fa126b1f6dd0304ce090f706dda4f8d87816fb6144bd36910696ab443c0a606b",
    "implementationFingerprint": "5967bb7f95556a9775c7c163d540dd7f7576f60cb511116657eec1e34eb14f12",
    "assertionIds": [
      "TC-ITEM-STD-081:expectation-1",
      "TC-ITEM-STD-081:expectation-2"
    ],
    "semanticCaseFingerprint": "0d6ac7606147e6035aa401810bfc66ba3593374b49ff30605787045ebc58593d"
  },
  {
    "caseId": "TC-ITEM-STD-082",
    "title": "标准商品绑定多个打印档口保存成功",
    "irConverted": true,
    "reviewDecision": "approved",
    "automationClassification": "blocked",
    "recipeId": "product-center:item-p0-wave-c:TC-ITEM-STD-082",
    "recipeInventory": {
      "any": 1,
      "enabled": 1,
      "semanticComplete": 0,
      "files": [
        "contracts/product-center/recipes/product-center-item-p0-wave-c-recipes.json"
      ]
    },
    "blockingReasons": [
      "ASSERTION_CONTRACT_REQUIRED",
      "RUNTIME_EVIDENCE_REQUIRED"
    ],
    "family": "standard",
    "action": "contract-resolution",
    "runtimeReadiness": "ready",
    "runtimeStatus": "runtime-passed",
    "handlerId": "product-center:item-p0-wave-c:TC-ITEM-STD-082",
    "bindingFingerprint": "fa126b1f6dd0304ce090f706dda4f8d87816fb6144bd36910696ab443c0a606b",
    "implementationFingerprint": "5967bb7f95556a9775c7c163d540dd7f7576f60cb511116657eec1e34eb14f12",
    "assertionIds": [
      "TC-ITEM-STD-082:expectation-1",
      "TC-ITEM-STD-082:expectation-2"
    ],
    "semanticCaseFingerprint": "7473c3c78cf67a085c29e50c839ed13d7467e23fdc84b266e21cb44958b97412"
  },
  {
    "caseId": "TC-ITEM-PKG-069",
    "title": "套餐商品内不提供口味组加价和默认选中编辑",
    "irConverted": true,
    "reviewDecision": "approved",
    "automationClassification": "blocked",
    "recipeId": null,
    "recipeInventory": {
      "any": 0,
      "enabled": 0,
      "semanticComplete": 0,
      "files": []
    },
    "blockingReasons": [
      "RECIPE_REQUIRED"
    ],
    "family": "package",
    "action": null,
    "runtimeReadiness": "ready",
    "runtimeStatus": "runtime-passed",
    "handlerId": "item-216:TC-ITEM-PKG-069",
    "bindingFingerprint": "fa126b1f6dd0304ce090f706dda4f8d87816fb6144bd36910696ab443c0a606b",
    "implementationFingerprint": "fa5fc5479f8a2f92491688f1591270bd3f12e29eb3fe37172bb54403ab09cd70",
    "assertionIds": [
      "TC-ITEM-PKG-069:expectation-1"
    ],
    "semanticCaseFingerprint": "a1bc5c3f01a96ab2699c14715f853b19be1422d431990dcaeacccac0384f7789"
  },
  {
    "caseId": "TC-ITEM-STD-083",
    "title": "多规格商品默认规格下发后终端点餐默认选中该规格",
    "irConverted": true,
    "reviewDecision": "approved",
    "automationClassification": "blocked",
    "recipeId": "product-center:yellow-probe:at12:tc-item-std-083",
    "recipeInventory": {
      "any": 1,
      "enabled": 0,
      "semanticComplete": 0,
      "files": [
        "contracts/product-center/recipes/yellow-probes/product-center-item-yellow-representative-probe-recipes.json"
      ]
    },
    "blockingReasons": [
      "RECIPE_GENERATION_DISABLED",
      "ASSERTION_CONTRACT_REQUIRED",
      "RUNTIME_EVIDENCE_REQUIRED"
    ],
    "family": "standard",
    "action": "contract-resolution",
    "runtimeReadiness": "environment-blocked",
    "runtimeStatus": "deferred",
    "handlerId": "product-center:yellow-probe:at12:tc-item-std-083",
    "bindingFingerprint": "fa126b1f6dd0304ce090f706dda4f8d87816fb6144bd36910696ab443c0a606b",
    "implementationFingerprint": "5967bb7f95556a9775c7c163d540dd7f7576f60cb511116657eec1e34eb14f12",
    "assertionIds": [
      "TC-ITEM-STD-083:expectation-1"
    ],
    "semanticCaseFingerprint": "f84356bf9856be456d8a6d66a068d54ddb29ae7502e37a53a2216cc70748f295"
  },
  {
    "caseId": "TC-ITEM-PKG-070",
    "title": "套餐必选子项停用后终端不可正常点单",
    "irConverted": true,
    "reviewDecision": "approved",
    "automationClassification": "blocked",
    "recipeId": "product-center:yellow-probe:at48:tc-item-pkg-070",
    "recipeInventory": {
      "any": 1,
      "enabled": 0,
      "semanticComplete": 0,
      "files": [
        "contracts/product-center/recipes/yellow-probes/product-center-item-yellow-representative-probe-recipes.json"
      ]
    },
    "blockingReasons": [
      "RECIPE_GENERATION_DISABLED",
      "ASSERTION_CONTRACT_REQUIRED",
      "RUNTIME_EVIDENCE_REQUIRED"
    ],
    "family": "package",
    "action": null,
    "runtimeReadiness": "ready",
    "runtimeStatus": "deferred",
    "handlerId": "product-center:yellow-probe:at48:tc-item-pkg-070",
    "bindingFingerprint": "fa126b1f6dd0304ce090f706dda4f8d87816fb6144bd36910696ab443c0a606b",
    "implementationFingerprint": "fa5fc5479f8a2f92491688f1591270bd3f12e29eb3fe37172bb54403ab09cd70",
    "assertionIds": [
      "TC-ITEM-PKG-070:expectation-1",
      "TC-ITEM-PKG-070:expectation-2"
    ],
    "semanticCaseFingerprint": "7573cf48202931d54a97dc30f894b7191b5415da69a17d222a8ba020f1dc735b"
  },
  {
    "caseId": "TC-ITEM-STD-084",
    "title": "称重商品销售单位切换 g、kg、ml 后保存成功",
    "irConverted": true,
    "reviewDecision": "approved",
    "automationClassification": "blocked",
    "recipeId": "product-center:yellow-probe:at13:tc-item-std-084",
    "recipeInventory": {
      "any": 1,
      "enabled": 0,
      "semanticComplete": 0,
      "files": [
        "contracts/product-center/recipes/yellow-probes/product-center-item-yellow-representative-probe-recipes.json"
      ]
    },
    "blockingReasons": [
      "RECIPE_GENERATION_DISABLED",
      "ASSERTION_CONTRACT_REQUIRED",
      "RUNTIME_EVIDENCE_REQUIRED"
    ],
    "family": "standard",
    "action": "weight-unit-edit",
    "runtimeReadiness": "ready",
    "runtimeStatus": "runtime-passed",
    "handlerId": "product-center:yellow-probe:at13:tc-item-std-084",
    "bindingFingerprint": "fa126b1f6dd0304ce090f706dda4f8d87816fb6144bd36910696ab443c0a606b",
    "implementationFingerprint": "5967bb7f95556a9775c7c163d540dd7f7576f60cb511116657eec1e34eb14f12",
    "assertionIds": [
      "TC-ITEM-STD-084:expectation-1",
      "TC-ITEM-STD-084:expectation-2"
    ],
    "semanticCaseFingerprint": "f7ff14c457ab71b3ff5df3b29421af07f3781bc290d36bd7e82bc0be15af1fc4"
  },
  {
    "caseId": "TC-ITEM-STD-085",
    "title": "多规格商品拖动调整规格顺序后保存成功",
    "irConverted": true,
    "reviewDecision": "approved",
    "automationClassification": "blocked",
    "recipeId": "product-center:yellow-probe:at13:tc-item-std-085",
    "recipeInventory": {
      "any": 1,
      "enabled": 0,
      "semanticComplete": 0,
      "files": [
        "contracts/product-center/recipes/yellow-probes/product-center-item-yellow-representative-probe-recipes.json"
      ]
    },
    "blockingReasons": [
      "RECIPE_GENERATION_DISABLED",
      "ASSERTION_CONTRACT_REQUIRED",
      "RUNTIME_EVIDENCE_REQUIRED"
    ],
    "family": "standard",
    "action": "multi-reorder",
    "runtimeReadiness": "ready",
    "runtimeStatus": "runtime-passed",
    "handlerId": "product-center:yellow-probe:at13:tc-item-std-085",
    "bindingFingerprint": "fa126b1f6dd0304ce090f706dda4f8d87816fb6144bd36910696ab443c0a606b",
    "implementationFingerprint": "5967bb7f95556a9775c7c163d540dd7f7576f60cb511116657eec1e34eb14f12",
    "assertionIds": [
      "TC-ITEM-STD-085:expectation-1",
      "TC-ITEM-STD-085:expectation-2"
    ],
    "semanticCaseFingerprint": "9979dc07df18100a8e7a45dd6e564a91a119ca3d6bda6c351ace36838ded2e1a"
  },
  {
    "caseId": "TC-ITEM-STD-086",
    "title": "移除已引用口味组子项后详情不再展示该子项",
    "irConverted": true,
    "reviewDecision": "approved",
    "automationClassification": "blocked",
    "recipeId": "product-center:yellow-probe:at16:tc-item-std-086",
    "recipeInventory": {
      "any": 1,
      "enabled": 0,
      "semanticComplete": 0,
      "files": [
        "contracts/product-center/recipes/yellow-probes/product-center-item-yellow-representative-probe-recipes.json"
      ]
    },
    "blockingReasons": [
      "RECIPE_GENERATION_DISABLED",
      "ASSERTION_CONTRACT_REQUIRED",
      "RUNTIME_EVIDENCE_REQUIRED"
    ],
    "family": "standard",
    "action": "contract-resolution",
    "runtimeReadiness": "ready",
    "runtimeStatus": "runtime-passed",
    "handlerId": "product-center:yellow-probe:at16:tc-item-std-086",
    "bindingFingerprint": "fa126b1f6dd0304ce090f706dda4f8d87816fb6144bd36910696ab443c0a606b",
    "implementationFingerprint": "5967bb7f95556a9775c7c163d540dd7f7576f60cb511116657eec1e34eb14f12",
    "assertionIds": [
      "TC-ITEM-STD-086:expectation-1",
      "TC-ITEM-STD-086:expectation-2"
    ],
    "semanticCaseFingerprint": "29a983d1066431da16ad3e055a57ae02cb77d7bdada6e1267bd755ccf3e3451c"
  },
  {
    "caseId": "TC-ITEM-STD-087",
    "title": "标准商品内编辑做法组加价和默认选中仅对当前商品生效",
    "irConverted": true,
    "reviewDecision": "approved",
    "automationClassification": "blocked",
    "recipeId": null,
    "recipeInventory": {
      "any": 0,
      "enabled": 0,
      "semanticComplete": 0,
      "files": []
    },
    "blockingReasons": [
      "RECIPE_REQUIRED"
    ],
    "family": "standard",
    "action": "contract-resolution",
    "runtimeReadiness": "ready",
    "runtimeStatus": "runtime-passed",
    "handlerId": "item-216:TC-ITEM-STD-087",
    "bindingFingerprint": "fa126b1f6dd0304ce090f706dda4f8d87816fb6144bd36910696ab443c0a606b",
    "implementationFingerprint": "5967bb7f95556a9775c7c163d540dd7f7576f60cb511116657eec1e34eb14f12",
    "assertionIds": [
      "TC-ITEM-STD-087:expectation-1",
      "TC-ITEM-STD-087:expectation-2",
      "TC-ITEM-STD-087:expectation-3"
    ],
    "semanticCaseFingerprint": "777a263f722cad7afd7e90748659bccf1652fcb6bf8c9fa433f89dccf800be9b"
  },
  {
    "caseId": "TC-ITEM-STD-088",
    "title": "标准商品内编辑加料组单次加价和默认选中仅对当前商品生效",
    "irConverted": true,
    "reviewDecision": "approved",
    "automationClassification": "blocked",
    "recipeId": null,
    "recipeInventory": {
      "any": 0,
      "enabled": 0,
      "semanticComplete": 0,
      "files": []
    },
    "blockingReasons": [
      "RECIPE_REQUIRED"
    ],
    "family": "standard",
    "action": "contract-resolution",
    "runtimeReadiness": "ready",
    "runtimeStatus": "runtime-passed",
    "handlerId": "item-216:TC-ITEM-STD-088",
    "bindingFingerprint": "fa126b1f6dd0304ce090f706dda4f8d87816fb6144bd36910696ab443c0a606b",
    "implementationFingerprint": "5967bb7f95556a9775c7c163d540dd7f7576f60cb511116657eec1e34eb14f12",
    "assertionIds": [
      "TC-ITEM-STD-088:expectation-1",
      "TC-ITEM-STD-088:expectation-2",
      "TC-ITEM-STD-088:expectation-3"
    ],
    "semanticCaseFingerprint": "2fba07a36ab616ed4416407c146c8b20d398237e911af74fd79f8a1c38f084ac"
  },
  {
    "caseId": "TC-ITEM-STD-089",
    "title": "标准商品内同一选项组仅允许一个默认选中子项",
    "irConverted": true,
    "reviewDecision": "approved",
    "automationClassification": "blocked",
    "recipeId": null,
    "recipeInventory": {
      "any": 0,
      "enabled": 0,
      "semanticComplete": 0,
      "files": []
    },
    "blockingReasons": [
      "RECIPE_REQUIRED"
    ],
    "family": "standard",
    "action": "contract-resolution",
    "runtimeReadiness": "ready",
    "runtimeStatus": "runtime-passed",
    "handlerId": "item-216:TC-ITEM-STD-089",
    "bindingFingerprint": "fa126b1f6dd0304ce090f706dda4f8d87816fb6144bd36910696ab443c0a606b",
    "implementationFingerprint": "5967bb7f95556a9775c7c163d540dd7f7576f60cb511116657eec1e34eb14f12",
    "assertionIds": [
      "TC-ITEM-STD-089:expectation-1",
      "TC-ITEM-STD-089:expectation-2"
    ],
    "semanticCaseFingerprint": "df79ef50e49cb697ad273f39619297159a38c76e1b0993b556287920b714b7a7"
  },
  {
    "caseId": "TC-ITEM-PKG-071",
    "title": "套餐商品内不提供做法组加价和默认选中编辑",
    "irConverted": true,
    "reviewDecision": "approved",
    "automationClassification": "blocked",
    "recipeId": null,
    "recipeInventory": {
      "any": 0,
      "enabled": 0,
      "semanticComplete": 0,
      "files": []
    },
    "blockingReasons": [
      "RECIPE_REQUIRED"
    ],
    "family": "package",
    "action": null,
    "runtimeReadiness": "ready",
    "runtimeStatus": "runtime-passed",
    "handlerId": "item-216:TC-ITEM-PKG-071",
    "bindingFingerprint": "fa126b1f6dd0304ce090f706dda4f8d87816fb6144bd36910696ab443c0a606b",
    "implementationFingerprint": "fa5fc5479f8a2f92491688f1591270bd3f12e29eb3fe37172bb54403ab09cd70",
    "assertionIds": [
      "TC-ITEM-PKG-071:expectation-1"
    ],
    "semanticCaseFingerprint": "8411663b2224585fdffd68eaceb56b14cba8352f947639e6e43948bf8d5a1234"
  },
  {
    "caseId": "TC-ITEM-PKG-072",
    "title": "套餐商品内不提供加料组加价和默认选中编辑",
    "irConverted": true,
    "reviewDecision": "approved",
    "automationClassification": "blocked",
    "recipeId": null,
    "recipeInventory": {
      "any": 0,
      "enabled": 0,
      "semanticComplete": 0,
      "files": []
    },
    "blockingReasons": [
      "RECIPE_REQUIRED"
    ],
    "family": "package",
    "action": null,
    "runtimeReadiness": "ready",
    "runtimeStatus": "runtime-passed",
    "handlerId": "item-216:TC-ITEM-PKG-072",
    "bindingFingerprint": "fa126b1f6dd0304ce090f706dda4f8d87816fb6144bd36910696ab443c0a606b",
    "implementationFingerprint": "fa5fc5479f8a2f92491688f1591270bd3f12e29eb3fe37172bb54403ab09cd70",
    "assertionIds": [
      "TC-ITEM-PKG-072:expectation-1"
    ],
    "semanticCaseFingerprint": "2b3ef9b8ad7b1ba152f3d0971ee24d5399775ab0b757387a0331ebcc53a7032e"
  },
  {
    "caseId": "TC-ITEM-PKG-073",
    "title": "套餐商品内没有选项组默认选中子项配置入口",
    "irConverted": true,
    "reviewDecision": "approved",
    "automationClassification": "blocked",
    "recipeId": null,
    "recipeInventory": {
      "any": 0,
      "enabled": 0,
      "semanticComplete": 0,
      "files": []
    },
    "blockingReasons": [
      "RECIPE_REQUIRED"
    ],
    "family": "package",
    "action": null,
    "runtimeReadiness": "ready",
    "runtimeStatus": "runtime-passed",
    "handlerId": "item-216:TC-ITEM-PKG-073",
    "bindingFingerprint": "fa126b1f6dd0304ce090f706dda4f8d87816fb6144bd36910696ab443c0a606b",
    "implementationFingerprint": "fa5fc5479f8a2f92491688f1591270bd3f12e29eb3fe37172bb54403ab09cd70",
    "assertionIds": [
      "TC-ITEM-PKG-073:expectation-1"
    ],
    "semanticCaseFingerprint": "964ae2434341a460f8893c5653a98afec3162ae1efe04fa356087272833552eb"
  },
  {
    "caseId": "TC-ITEM-STD-090",
    "title": "标准商品引用描述标签达 5 个后第 6 个不可选（本用例验证拦截场景）",
    "irConverted": true,
    "reviewDecision": "approved",
    "automationClassification": "blocked",
    "recipeId": null,
    "recipeInventory": {
      "any": 0,
      "enabled": 0,
      "semanticComplete": 0,
      "files": []
    },
    "blockingReasons": [
      "RECIPE_REQUIRED"
    ],
    "family": "standard",
    "action": "contract-resolution",
    "runtimeReadiness": "ready",
    "runtimeStatus": "runtime-passed",
    "handlerId": "item-216:TC-ITEM-STD-090",
    "bindingFingerprint": "fa126b1f6dd0304ce090f706dda4f8d87816fb6144bd36910696ab443c0a606b",
    "implementationFingerprint": "5967bb7f95556a9775c7c163d540dd7f7576f60cb511116657eec1e34eb14f12",
    "assertionIds": [
      "TC-ITEM-STD-090:expectation-1",
      "TC-ITEM-STD-090:expectation-2"
    ],
    "semanticCaseFingerprint": "10e16d008789c17812dbae59643cf6e53ecea68cec5d696d0c949649aaefa7ed"
  },
  {
    "caseId": "TC-ITEM-STD-091",
    "title": "标准商品商品角标切换选择后仅保留最新一个角标",
    "irConverted": true,
    "reviewDecision": "approved",
    "automationClassification": "blocked",
    "recipeId": null,
    "recipeInventory": {
      "any": 0,
      "enabled": 0,
      "semanticComplete": 0,
      "files": []
    },
    "blockingReasons": [
      "RECIPE_REQUIRED"
    ],
    "family": "standard",
    "action": "contract-resolution",
    "runtimeReadiness": "ready",
    "runtimeStatus": "runtime-passed",
    "handlerId": "item-216:TC-ITEM-STD-091",
    "bindingFingerprint": "fa126b1f6dd0304ce090f706dda4f8d87816fb6144bd36910696ab443c0a606b",
    "implementationFingerprint": "5967bb7f95556a9775c7c163d540dd7f7576f60cb511116657eec1e34eb14f12",
    "assertionIds": [
      "TC-ITEM-STD-091:expectation-1",
      "TC-ITEM-STD-091:expectation-2"
    ],
    "semanticCaseFingerprint": "24c3456ed38ab65ea701213676a7a990740ef74c1d4d3822fd6f5ae378983d77"
  },
  {
    "caseId": "TC-ITEM-STD-092",
    "title": "点击商品名称进入编辑标准商品页加载成功",
    "irConverted": true,
    "reviewDecision": "approved",
    "automationClassification": "blocked",
    "recipeId": "product-center:item-p0-wave-d:TC-ITEM-STD-092",
    "recipeInventory": {
      "any": 1,
      "enabled": 1,
      "semanticComplete": 0,
      "files": [
        "contracts/product-center/recipes/product-center-item-p0-wave-d-recipes.json"
      ]
    },
    "blockingReasons": [
      "ASSERTION_CONTRACT_REQUIRED"
    ],
    "family": "standard",
    "action": "edit-loaded",
    "runtimeReadiness": "ready",
    "runtimeStatus": "runtime-passed",
    "handlerId": "product-center:item-p0-wave-d:TC-ITEM-STD-092",
    "bindingFingerprint": "fa126b1f6dd0304ce090f706dda4f8d87816fb6144bd36910696ab443c0a606b",
    "implementationFingerprint": "5967bb7f95556a9775c7c163d540dd7f7576f60cb511116657eec1e34eb14f12",
    "assertionIds": [
      "TC-ITEM-STD-092:expectation-1",
      "TC-ITEM-STD-092:expectation-2",
      "TC-ITEM-STD-092:expectation-3",
      "TC-ITEM-STD-092:expectation-4"
    ],
    "semanticCaseFingerprint": "ff961d2a460520612505524ea39912e3c5595cf8e8a424bb2d5611db26bd94e1"
  },
  {
    "caseId": "TC-ITEM-STD-096",
    "title": "编辑标准商品本地上传主图成功",
    "irConverted": true,
    "reviewDecision": "approved",
    "automationClassification": "blocked",
    "recipeId": "product-center:item-p0-wave-d:TC-ITEM-STD-096",
    "recipeInventory": {
      "any": 1,
      "enabled": 1,
      "semanticComplete": 0,
      "files": [
        "contracts/product-center/recipes/product-center-item-p0-wave-d-recipes.json"
      ]
    },
    "blockingReasons": [
      "ASSERTION_CONTRACT_REQUIRED"
    ],
    "family": "standard",
    "action": "contract-resolution",
    "runtimeReadiness": "ready",
    "runtimeStatus": "runtime-passed",
    "handlerId": "product-center:item-p0-wave-d:TC-ITEM-STD-096",
    "bindingFingerprint": "fa126b1f6dd0304ce090f706dda4f8d87816fb6144bd36910696ab443c0a606b",
    "implementationFingerprint": "5967bb7f95556a9775c7c163d540dd7f7576f60cb511116657eec1e34eb14f12",
    "assertionIds": [
      "TC-ITEM-STD-096:expectation-1",
      "TC-ITEM-STD-096:expectation-2",
      "TC-ITEM-STD-096:expectation-3",
      "TC-ITEM-STD-096:expectation-4"
    ],
    "semanticCaseFingerprint": "341a252ee854832ac3bfed7b30d009ab417dcee92920a4ac65b86630c98250f9"
  },
  {
    "caseId": "TC-ITEM-STD-095",
    "title": "商品标准价输入超过两位小数保存时四舍五入为两位",
    "irConverted": true,
    "reviewDecision": "approved",
    "automationClassification": "blocked",
    "recipeId": "product-center:green-draft:at06:tc-item-std-095",
    "recipeInventory": {
      "any": 1,
      "enabled": 1,
      "semanticComplete": 0,
      "files": [
        "contracts/product-center/recipes/green-drafts/product-center-item-green-binding-draft-recipes.json"
      ]
    },
    "blockingReasons": [
      "ASSERTION_CONTRACT_REQUIRED",
      "RUNTIME_EVIDENCE_REQUIRED"
    ],
    "family": "standard",
    "action": "price-rounding",
    "runtimeReadiness": "ready",
    "runtimeStatus": "runtime-passed",
    "handlerId": "product-center:green-draft:at06:tc-item-std-095",
    "bindingFingerprint": "fa126b1f6dd0304ce090f706dda4f8d87816fb6144bd36910696ab443c0a606b",
    "implementationFingerprint": "5967bb7f95556a9775c7c163d540dd7f7576f60cb511116657eec1e34eb14f12",
    "assertionIds": [
      "TC-ITEM-STD-095:expectation-1",
      "TC-ITEM-STD-095:expectation-2",
      "TC-ITEM-STD-095:expectation-3"
    ],
    "businessRule": {
      "businessRuleId": "BR-FMT-005",
      "businessRuleFingerprint": "68a2895221c4d12b84412f80c9371e3051c97fdd50d2e909bb0a00d39ce4f89e",
      "businessRuleAssertionIdsRequired": [
        "br-fmt-005:canonical-outcome-1",
        "br-fmt-005:canonical-outcome-10",
        "br-fmt-005:canonical-outcome-11",
        "br-fmt-005:canonical-outcome-12",
        "br-fmt-005:canonical-outcome-13",
        "br-fmt-005:canonical-outcome-14",
        "br-fmt-005:canonical-outcome-2",
        "br-fmt-005:canonical-outcome-3",
        "br-fmt-005:canonical-outcome-4",
        "br-fmt-005:canonical-outcome-5",
        "br-fmt-005:canonical-outcome-6",
        "br-fmt-005:canonical-outcome-7",
        "br-fmt-005:canonical-outcome-8",
        "br-fmt-005:canonical-outcome-9"
      ],
      "businessRuleAssertionIdsObserved": [
        "br-fmt-005:canonical-outcome-1",
        "br-fmt-005:canonical-outcome-10",
        "br-fmt-005:canonical-outcome-11",
        "br-fmt-005:canonical-outcome-12",
        "br-fmt-005:canonical-outcome-13",
        "br-fmt-005:canonical-outcome-14",
        "br-fmt-005:canonical-outcome-2",
        "br-fmt-005:canonical-outcome-3",
        "br-fmt-005:canonical-outcome-4",
        "br-fmt-005:canonical-outcome-5",
        "br-fmt-005:canonical-outcome-6",
        "br-fmt-005:canonical-outcome-7",
        "br-fmt-005:canonical-outcome-8",
        "br-fmt-005:canonical-outcome-9"
      ],
      "businessRuleUiEvidenceIds": [
        "TC-ITEM-STD-095-runtime-evidence"
      ],
      "businessRuleApiEvidenceIds": [],
      "businessRuleDownstreamEvidenceIds": [],
      "businessRuleCleanup": {
        "required": false,
        "apiZeroResidue": false,
        "uiZeroResidue": false
      },
      "observedStatement": "价格 0.00 可保存并展示 2 位小数；超过 2 位小数按四舍五入保存，API 与重新进入页面回显舍入后的金额"
    },
    "semanticCaseFingerprint": "95630ff19c7ca9d61a612861ddd9cb2c590ce9ff54e92b559646f19f734b4d7a"
  },
  {
    "caseId": "TC-ITEM-PKG-074",
    "title": "套餐商品引用描述标签达 5 个后第 6 个不可选（本用例验证拦截场景）",
    "irConverted": true,
    "reviewDecision": "approved",
    "automationClassification": "blocked",
    "recipeId": null,
    "recipeInventory": {
      "any": 0,
      "enabled": 0,
      "semanticComplete": 0,
      "files": []
    },
    "blockingReasons": [
      "RECIPE_REQUIRED"
    ],
    "family": "package",
    "action": null,
    "runtimeReadiness": "ready",
    "runtimeStatus": "runtime-passed",
    "handlerId": "item-216:TC-ITEM-PKG-074",
    "bindingFingerprint": "fa126b1f6dd0304ce090f706dda4f8d87816fb6144bd36910696ab443c0a606b",
    "implementationFingerprint": "fa5fc5479f8a2f92491688f1591270bd3f12e29eb3fe37172bb54403ab09cd70",
    "assertionIds": [
      "TC-ITEM-PKG-074:expectation-1",
      "TC-ITEM-PKG-074:expectation-2"
    ],
    "semanticCaseFingerprint": "feef7e76aa2679e709b404e85fe7bde035cf048469122ac2340df83fb3206be2"
  },
  {
    "caseId": "TC-ITEM-ADD-045",
    "title": "加料商品角标切换选择后仅保留最新一个角标",
    "irConverted": true,
    "reviewDecision": "approved",
    "automationClassification": "blocked",
    "recipeId": "product-center:yellow-probe:at29:tc-item-add-045",
    "recipeInventory": {
      "any": 1,
      "enabled": 0,
      "semanticComplete": 0,
      "files": [
        "contracts/product-center/recipes/yellow-probes/product-center-item-yellow-representative-probe-recipes.json"
      ]
    },
    "blockingReasons": [
      "RECIPE_GENERATION_DISABLED",
      "ASSERTION_CONTRACT_REQUIRED"
    ],
    "family": "addon",
    "action": null,
    "runtimeReadiness": "ready",
    "runtimeStatus": "runtime-passed",
    "handlerId": "product-center:yellow-probe:at29:tc-item-add-045",
    "bindingFingerprint": "fa126b1f6dd0304ce090f706dda4f8d87816fb6144bd36910696ab443c0a606b",
    "implementationFingerprint": "5b2f6ff4f8cfbcb8bea9f0d7919439faa34bc92815b79bb52e1ffb0ba6323471",
    "assertionIds": [
      "TC-ITEM-ADD-045:expectation-1",
      "TC-ITEM-ADD-045:expectation-2"
    ],
    "semanticCaseFingerprint": "17dc18d7e9c9dcf2f452fa94d10dfc809096553eb0cb61b17aa93f72f5bec30a"
  },
  {
    "caseId": "TC-ITEM-PKG-075",
    "title": "套餐商品角标切换选择后仅保留最新一个角标",
    "irConverted": true,
    "reviewDecision": "approved",
    "automationClassification": "blocked",
    "recipeId": null,
    "recipeInventory": {
      "any": 0,
      "enabled": 0,
      "semanticComplete": 0,
      "files": []
    },
    "blockingReasons": [
      "RECIPE_REQUIRED"
    ],
    "family": "package",
    "action": null,
    "runtimeReadiness": "ready",
    "runtimeStatus": "runtime-passed",
    "handlerId": "item-216:TC-ITEM-PKG-075",
    "bindingFingerprint": "fa126b1f6dd0304ce090f706dda4f8d87816fb6144bd36910696ab443c0a606b",
    "implementationFingerprint": "fa5fc5479f8a2f92491688f1591270bd3f12e29eb3fe37172bb54403ab09cd70",
    "assertionIds": [
      "TC-ITEM-PKG-075:expectation-1",
      "TC-ITEM-PKG-075:expectation-2"
    ],
    "semanticCaseFingerprint": "a82614987f09eddc4d48189a34e244c794dc5a92ac2dc5ff4b30af5d2bd838e8"
  },
  {
    "caseId": "TC-ITEM-ADD-046",
    "title": "加料商品不能同时保留超过 5 个描述标签",
    "irConverted": true,
    "reviewDecision": "approved",
    "automationClassification": "blocked",
    "recipeId": null,
    "recipeInventory": {
      "any": 0,
      "enabled": 0,
      "semanticComplete": 0,
      "files": []
    },
    "blockingReasons": [
      "RECIPE_REQUIRED"
    ],
    "family": "addon",
    "action": null,
    "runtimeReadiness": "ready",
    "runtimeStatus": "runtime-passed",
    "handlerId": "item-216:TC-ITEM-ADD-046",
    "bindingFingerprint": "fa126b1f6dd0304ce090f706dda4f8d87816fb6144bd36910696ab443c0a606b",
    "implementationFingerprint": "5b2f6ff4f8cfbcb8bea9f0d7919439faa34bc92815b79bb52e1ffb0ba6323471",
    "assertionIds": [
      "TC-ITEM-ADD-046:expectation-1",
      "TC-ITEM-ADD-046:expectation-2"
    ],
    "semanticCaseFingerprint": "415a0c3c4eb74dbfaaeba5066557ea6719c0bc24f36c1a41174a76928658eda0"
  },
  {
    "caseId": "TC-ITEM-PKG-078",
    "title": "套餐商品与加料商品允许同名并同时保留",
    "automationClassification": "strict-generatable",
    "recipeId": null,
    "blockingReasons": [],
    "family": "package",
    "action": null,
    "runtimeReadiness": "ready",
    "runtimeStatus": "not-run",
    "handlerId": "item-216:TC-ITEM-PKG-078",
    "bindingFingerprint": "sha256:0e1b49ed142ed8655b04fe062318ca86aefaf14bf68f5667e3685ef2871eb38a",
    "implementationFingerprint": "fa5fc5479f8a2f92491688f1591270bd3f12e29eb3fe37172bb54403ab09cd70",
    "assertionIds": [
      "TC-ITEM-PKG-078:expectation-1",
      "TC-ITEM-PKG-078:expectation-2",
      "TC-ITEM-PKG-078:expectation-3",
      "TC-ITEM-PKG-078:expectation-4"
    ],
    "businessRule": {
      "businessRuleId": "BR-ITEM-010",
      "businessRuleFingerprint": "4398349399b4362b465c6b296e9728fe8b915410ead525fe230de611aa3e0462",
      "businessRuleAssertionIdsRequired": [
        "item-name-duplicate:api-error",
        "item-name-duplicate:category-independence",
        "item-name-duplicate:cross-type-rename",
        "item-name-duplicate:list-persistence",
        "item-name-duplicate:record-count",
        "item-name-duplicate:save-feedback",
        "item-name-duplicate:standard-package-cross-type"
      ],
      "businessRuleAssertionIdsObserved": [
        "item-name-duplicate:api-error",
        "item-name-duplicate:category-independence",
        "item-name-duplicate:cross-type-rename",
        "item-name-duplicate:list-persistence",
        "item-name-duplicate:record-count",
        "item-name-duplicate:save-feedback",
        "item-name-duplicate:standard-package-cross-type"
      ],
      "businessRuleUiEvidenceIds": [
        "TC-ITEM-PKG-078-runtime-evidence"
      ],
      "businessRuleApiEvidenceIds": [
        "TC-ITEM-PKG-078-runtime-evidence"
      ],
      "businessRuleDownstreamEvidenceIds": [],
      "businessRuleCleanup": {
        "required": true,
        "apiZeroResidue": false,
        "uiZeroResidue": false
      },
      "observedStatement": "同一商户内标准商品与套餐商品共享名称唯一性空间，彼此及各自同类型创建或编辑同名均失败并提示 BITEM-7014：商品名称与其它类型商品名称重复；加料商品使用独立名称空间，标准商品或套餐商品在创建及编辑改名时均可与加料商品同名，但加料商品之间创建或编辑同名均失败；分类不参与判重；同类型无重复时允许改名，编辑失败原名称保持不变"
    },
    "semanticCaseFingerprint": "8f07192cccaeeb722712b8c2175a92cc3679aee6c3fd49168689573977305599"
  },
  {
    "caseId": "TC-ITEM-PKG-079",
    "title": "标准商品与套餐商品跨类型同名创建或编辑失败",
    "automationClassification": "strict-generatable",
    "recipeId": null,
    "blockingReasons": [],
    "family": "package",
    "action": null,
    "runtimeReadiness": "ready",
    "runtimeStatus": "not-run",
    "handlerId": "item-216:TC-ITEM-PKG-079",
    "bindingFingerprint": "sha256:6d56bac65543a2154343f66d1eb9eafe77b605a890ce63e81f3ae7ad4de4d0e1",
    "implementationFingerprint": "fa5fc5479f8a2f92491688f1591270bd3f12e29eb3fe37172bb54403ab09cd70",
    "assertionIds": [
      "TC-ITEM-PKG-079:expectation-1",
      "TC-ITEM-PKG-079:expectation-2",
      "TC-ITEM-PKG-079:expectation-3",
      "TC-ITEM-PKG-079:expectation-4",
      "TC-ITEM-PKG-079:expectation-5"
    ],
    "businessRule": {
      "businessRuleId": "BR-ITEM-010",
      "businessRuleFingerprint": "4398349399b4362b465c6b296e9728fe8b915410ead525fe230de611aa3e0462",
      "businessRuleAssertionIdsRequired": [
        "item-name-duplicate:api-error",
        "item-name-duplicate:category-independence",
        "item-name-duplicate:cross-type-rename",
        "item-name-duplicate:list-persistence",
        "item-name-duplicate:record-count",
        "item-name-duplicate:save-feedback",
        "item-name-duplicate:standard-package-cross-type"
      ],
      "businessRuleAssertionIdsObserved": [
        "item-name-duplicate:api-error",
        "item-name-duplicate:category-independence",
        "item-name-duplicate:cross-type-rename",
        "item-name-duplicate:list-persistence",
        "item-name-duplicate:record-count",
        "item-name-duplicate:save-feedback",
        "item-name-duplicate:standard-package-cross-type"
      ],
      "businessRuleUiEvidenceIds": [
        "TC-ITEM-PKG-079-runtime-evidence"
      ],
      "businessRuleApiEvidenceIds": [
        "TC-ITEM-PKG-079-runtime-evidence"
      ],
      "businessRuleDownstreamEvidenceIds": [],
      "businessRuleCleanup": {
        "required": true,
        "apiZeroResidue": false,
        "uiZeroResidue": false
      },
      "observedStatement": "同一商户内标准商品与套餐商品共享名称唯一性空间，彼此及各自同类型创建或编辑同名均失败并提示 BITEM-7014：商品名称与其它类型商品名称重复；加料商品使用独立名称空间，标准商品或套餐商品在创建及编辑改名时均可与加料商品同名，但加料商品之间创建或编辑同名均失败；分类不参与判重；同类型无重复时允许改名，编辑失败原名称保持不变"
    },
    "semanticCaseFingerprint": "48f400c3fc6de7bea63d00bee2d7bf0e2c515f5c9edb49a796d8211435f8d74c"
  }
] as readonly GeneratedCase[];
const supplementalCaseIds = new Set(["TC-ITEM-PKG-078","TC-ITEM-PKG-079"]);
const conversionNotApplicableCaseIds = new Set<string>(item216FormalCaseInventory
  .filter((item) => item.conversionScope === 'not-applicable')
  .map((item) => item.caseId));
const sourceBlockedCaseIds = new Set(sourceDecisionsDocument.cases
  .filter((item) => item.currentGoalBlocking === true)
  .map((item) => item.caseId));
const deferredCaseIds = new Set([...loadProductCenterExecutionDecisions(process.cwd()).values()]
  .filter((item) => item.module === 'brand-item' && item.status === 'deferred')
  .map((item) => item.caseId));
const notApplicableCaseIds = new Set([...loadProductCenterExecutionDecisions(process.cwd()).values()]
  .filter((item) => item.module === 'brand-item' && item.status === 'not-applicable')
  .map((item) => item.caseId));
const selectedCaseIds = new Set((process.env.PC_ITEM_SELECTED_CASE_IDS ?? '')
  .split(',')
  .map((caseId) => caseId.trim().toUpperCase())
  .filter(Boolean));
const unknownCaseIds = [...selectedCaseIds]
  .filter((caseId) => !item216FormalCaseInventory.some((item) => item.caseId === caseId)
    && !supplementalCaseIds.has(caseId));
if (unknownCaseIds.length > 0) throw new Error('商品 216 正式范围包含未知用例：' + unknownCaseIds.join(','));
const selectedConversionNotApplicableCaseIds = [...selectedCaseIds]
  .filter((caseId) => conversionNotApplicableCaseIds.has(caseId));
if (selectedConversionNotApplicableCaseIds.length > 0) {
  throw new Error('商品执行计划包含转换期不适用用例：' + selectedConversionNotApplicableCaseIds.join(','));
}
const selectedSourceBlockedCaseIds = [...selectedCaseIds].filter((caseId) => sourceBlockedCaseIds.has(caseId));
if (selectedSourceBlockedCaseIds.length > 0) {
  throw new Error('商品用例来源证据仍处于阻断状态：' + selectedSourceBlockedCaseIds.join(','));
}
const selectedDeferredCaseIds = [...selectedCaseIds].filter((caseId) => deferredCaseIds.has(caseId));
if (selectedDeferredCaseIds.length > 0) {
  throw new Error('商品执行计划包含当前延期用例：' + selectedDeferredCaseIds.join(','));
}
const selectedNotApplicableCaseIds = [...selectedCaseIds].filter((caseId) => notApplicableCaseIds.has(caseId));
if (selectedNotApplicableCaseIds.length > 0) {
  throw new Error('商品执行计划包含当前版本不适用用例：' + selectedNotApplicableCaseIds.join(','));
}
const cases = selectedCaseIds.size > 0
  ? allCases.filter((item) => selectedCaseIds.has(item.caseId)
    && !sourceBlockedCaseIds.has(item.caseId)
    && !deferredCaseIds.has(item.caseId)
    && !notApplicableCaseIds.has(item.caseId))
  : allCases.filter((item) => !sourceBlockedCaseIds.has(item.caseId)
    && !deferredCaseIds.has(item.caseId)
    && !notApplicableCaseIds.has(item.caseId));
const embeddedImplementationFingerprintDrift = cases.filter((item) => (
  fingerprintProductCenterItemImplementation(process.cwd(), item.caseId) !== item.implementationFingerprint
));
if (embeddedImplementationFingerprintDrift.length > 0) {
  throw new Error('商品执行脚本嵌入实现指纹已过期，请先重新生成：'
    + embeddedImplementationFingerprintDrift.map((item) => item.caseId).join(','));
}
const progressRunId = process.env.PC_ITEM_RUN_ID;

productCenterTest.describe('商品管理-商品自动化入口', () => {
  productCenterTest.describe.configure({ mode: 'parallel', timeout: 120_000 });

  productCenterTest.beforeEach(async ({}, testInfo) => {
    const caseId = readCanonicalCaseId(testInfo);
    if (progressRunId && caseId) writeProductCenterItemProgress({ runId: progressRunId, caseId, phase: 'started' });
  });

  productCenterTest.afterEach(async ({}, testInfo) => {
    const caseId = readCanonicalCaseId(testInfo);
    if (!progressRunId || !caseId) return;
    const diagnostic = testInfo.errors.map((error) => error.message ?? '').filter(Boolean).join('\n');
    const classified = diagnostic
      ? classifyProductCenterFailure({ message: diagnostic, assertion: /expect\(|expected .* received/i.test(diagnostic) })
      : undefined;
    writeProductCenterItemProgress({
      runId: progressRunId,
      caseId,
      phase: testInfo.status === testInfo.expectedStatus ? 'completed' : 'failed',
      status: testInfo.status,
      ...(classified ? {
        failureCategory: classified.category,
        diagnosticFingerprint: fingerprintFailureDiagnostic(classified.diagnostic),
      } : {}),
    });
  });

  for (const item of cases) {
    const manualDecision = readProductCenterItemManualDecision(item.caseId);
    productCenterTest(manualDecision?.updatedTitle ?? item.title, {
      tag: ['@product-center-item', `@case-${item.caseId}`],
      annotation: [
        { type: 'canonical-case-id', description: item.caseId },
        { type: 'conversion-status', description: item.action ? 'flow-bound' : 'contract-unresolved' },
        { type: 'runtime-readiness', description: item.runtimeReadiness },
        ...(manualDecision ? [{ type: 'manual-decision', description: manualDecision.disposition }] : []),
      ],
    }, async ({ page, cleanupRegistry, standardItem216Flow, standardItem216CaseRunner, packageItem216Flow, addonItem216Flow }, testInfo) => {
      if (item.caseId === 'TC-ITEM-PKG-078' || item.caseId === 'TC-ITEM-PKG-079') {
        testInfo.setTimeout(240_000);
      }
      if (manualDecision?.disposition === 'skip-deferred') {
        productCenterTest.skip(true, manualDecision.directive);
      }
      try {
      if (item.family === 'standard') {
        const flow = standardItem216Flow;
        if (!item.action) {
          await attachUnresolved(testInfo, item);
          assertRuntimeImplemented(item.caseId, 'unresolved', item.blockingReasons);
          return;
        }
        let cleanupCompleted = false;
        try {
          const result = await standardItem216CaseRunner.execute(item.caseId, item.action);
          const cleanup = await cleanupRegistry.cleanupAll();
          cleanupCompleted = true;
          const identities = Object.keys(cleanup.apiIdentityCounts);
          const uiResidue = identities.length > 0 ? await flow.verifyZeroResidue(identities) : {};
          const finalizedResult = withCleanupAuditEvidence(result, cleanup, uiResidue);
          const runtimeEnvelope = {
            caseId: item.caseId,
            status: result.status === 'environment-blocked' ? 'environment-blocked' : runtimeStatusFromEvidence(finalizedResult),
            evidence: finalizedResult,
          };
          await attachStandardExecutionReceipt({
            testInfo, page, item, evidence: finalizedResult, cleanup, uiResidue,
          });
          await testInfo.attach(item.caseId + '-runtime-evidence', {
            body: Buffer.from(JSON.stringify(runtimeEnvelope, null, 2), 'utf8'),
            contentType: 'application/json',
          });
          if (await attachManualAcceptedOutcome(testInfo, item.caseId, runtimeEnvelope, new URL(page.url()).pathname)) return;
          assertRuntimeImplemented(item.caseId, runtimeStatusFromEvidence(finalizedResult), finalizedResult);
          return;
        } finally {
          if (!cleanupCompleted) {
            const cleanup = await cleanupRegistry.cleanupAll();
            const identities = Object.keys(cleanup.apiIdentityCounts);
            const uiIdentityCounts = identities.length > 0 ? await flow.verifyZeroResidue(identities) : {};
            await testInfo.attach(item.caseId + '-cleanup-evidence', {
              body: Buffer.from(JSON.stringify({ ...cleanup, uiIdentityCounts }, null, 2), 'utf8'),
              contentType: 'application/json',
            });
          }
        }
      }

      if (item.family === 'package') {
        const flow = packageItem216Flow;
        let result: Awaited<ReturnType<PackageItem216Flow['execute']>> | undefined;
        let cleanupEvidence: CleanupRegistryEvidence | undefined;
        let cleanupCompleted = false;
        try {
          result = await flow.execute(item.caseId);
          cleanupEvidence = await cleanupRegistry.cleanupAll();
          const uiResidue = await verifyPackageUiResidue(page, cleanupEvidence);
          cleanupCompleted = true;
          const finalizedResult = withCleanupAuditEvidence(result, cleanupEvidence, uiResidue);
          await attachStandardExecutionReceipt({
            testInfo, page, item, evidence: finalizedResult, cleanup: cleanupEvidence, uiResidue,
          });
          await testInfo.attach(item.caseId + '-runtime-evidence', {
            body: Buffer.from(JSON.stringify(finalizedResult, null, 2), 'utf8'),
            contentType: 'application/json',
          });
          if (await attachManualAcceptedOutcome(testInfo, item.caseId, finalizedResult, new URL(page.url()).pathname)) return;
          assertRuntimeImplemented(item.caseId, finalizedResult.status, finalizedResult);
          return;
        } finally {
          if (!cleanupCompleted) {
            const cleanup = cleanupEvidence ?? await cleanupRegistry.cleanupAll();
            const uiIdentityCounts = await verifyPackageUiResidue(page, cleanup);
            await testInfo.attach(item.caseId + '-cleanup-evidence', {
              body: Buffer.from(JSON.stringify({ ...cleanup, uiIdentityCounts }, null, 2), 'utf8'),
              contentType: 'application/json',
            });
          }
        }
      }

      const flow = addonItem216Flow;
      let result: Awaited<ReturnType<AddonItem216Flow['execute']>> | undefined;
      let cleanupCompleted = false;
      try {
        result = await flow.execute(item.caseId);
        const cleanup = await cleanupRegistry.cleanupAll();
        const identities = result?.identities ?? await flow.readTrackedIdentities();
        const uiResidue = identities.length > 0 ? await flow.verifyZeroResidue(identities) : {};
        cleanupCompleted = true;
        const finalizedResult = withCleanupAuditEvidence(result, cleanup, uiResidue);
        await attachStandardExecutionReceipt({
          testInfo, page, item, evidence: finalizedResult, cleanup, uiResidue,
        });
        await testInfo.attach(item.caseId + '-runtime-evidence', {
          body: Buffer.from(JSON.stringify(finalizedResult, null, 2), 'utf8'),
          contentType: 'application/json',
        });
        if (await attachManualAcceptedOutcome(testInfo, item.caseId, finalizedResult, new URL(page.url()).pathname)) return;
        assertRuntimeImplemented(item.caseId, finalizedResult.status, finalizedResult);
      } finally {
        if (!cleanupCompleted) {
          const cleanup = await cleanupRegistry.cleanupAll();
          const identities = result?.identities ?? await flow.readTrackedIdentities();
          const uiIdentityCounts = identities.length > 0 ? await flow.verifyZeroResidue(identities) : {};
          await testInfo.attach(item.caseId + '-cleanup-evidence', {
            body: Buffer.from(JSON.stringify({ ...cleanup, uiIdentityCounts }, null, 2), 'utf8'),
            contentType: 'application/json',
          });
        }
      }
      } catch (error) {
        if (error instanceof Error && error.message.includes('FORMAL_CASE_EXECUTABLE_OPERATION')) throw error;
        if (!await attachManualAcceptedOutcome(testInfo, item.caseId, error, new URL(page.url()).pathname)) throw error;
      }
    });
  }
});

function readCanonicalCaseId(testInfo: import('@playwright/test').TestInfo): string | undefined {
  return testInfo.annotations.find((annotation) => annotation.type === 'canonical-case-id')?.description;
}

async function attachStandardExecutionReceipt(input: {
  testInfo: import('@playwright/test').TestInfo;
  page: import('@playwright/test').Page;
  item: GeneratedCase;
  evidence: unknown;
  cleanup: CleanupRegistryEvidence;
  uiResidue: Record<string, 0 | 'ui-verification-unavailable:403'>;
}): Promise<void> {
  const operationReceipts = consumeExecutableOperationReceipts(input.testInfo.testId);
  assertObservedExecutableOperations(operationReceipts, input.item.caseId);
  const applicationVersion = await readProductCenterApplicationVersion(input.page);
  const locale = await input.page.evaluate(() => document.documentElement.lang || 'und');
  const apiZeroResidue = Object.values(input.cleanup.apiIdentityCounts).every((count) => count === 0);
  const uiZeroResidue = Object.values(input.uiResidue).every((count) => count === 0);
  const uiVerificationObserved = !Object.values(input.uiResidue)
    .some((count) => count === 'ui-verification-unavailable:403');
  const assertionReceipts = findRuntimeAssertionReceipts(input.evidence);
  const observedAssertionIds = assertionReceipts.length > 0
    ? input.item.assertionIds.filter((claimId) => assertionReceipts.some((receipt) => receipt.claimId === claimId))
    : input.item.assertionIds;
  const verifiedAssertionIds = assertionReceipts.length > 0
    ? input.item.assertionIds.filter((claimId) => assertionReceipts.some((receipt) => receipt.claimId === claimId && receipt.status === 'verified'))
    : input.item.assertionIds;
  const currentImplementationFingerprint = fingerprintProductCenterItemImplementation(process.cwd(), input.item.caseId);
  if (currentImplementationFingerprint !== input.item.implementationFingerprint) {
    throw new Error(input.item.caseId + ':EMBEDDED_IMPLEMENTATION_FINGERPRINT_STALE');
  }
  const receipt = {
    receiptVersion: '4.0.0' as const,
    caseId: input.item.caseId,
    caseFingerprint: input.item.bindingFingerprint,
    semanticCaseFingerprint: input.item.semanticCaseFingerprint,
    implementationFingerprint: currentImplementationFingerprint,
    executionContext: {
      applicationVersionFingerprint: applicationVersion.fingerprint ?? undefined,
      environmentId: appConfig.environmentId,
      tenantScope: appConfig.brandId,
      locale,
      roleId: process.env.MC_TEST_ROLE ?? 'merchant-operator',
      route: findRuntimeRoute(input.evidence) ?? new URL(input.page.url()).pathname,
    },
    releaseObservation: {
      status: applicationVersion.status,
      fingerprint: applicationVersion.fingerprint,
      source: applicationVersion.source,
      stable: applicationVersion.stable,
      observedAt: new Date().toISOString(),
    },
    executionEpochId: progressRunId ?? ['playwright', input.testInfo.project.name, input.testInfo.workerIndex].join('-'),
    claims: {
      required: input.item.assertionIds,
      observed: observedAssertionIds,
      verified: verifiedAssertionIds,
    },
    assertionReceipts,
    operationReceipts,
    cleanup: { apiZeroResidue, uiZeroResidue, uiVerificationObserved },
    handlerId: input.item.handlerId,
    ...(input.item.businessRule ? {
      businessRuleId: input.item.businessRule.businessRuleId,
      businessRuleFingerprint: input.item.businessRule.businessRuleFingerprint,
      businessRuleAssertionIdsRequired: input.item.businessRule.businessRuleAssertionIdsRequired,
      businessRuleAssertionIdsObserved: input.item.businessRule.businessRuleAssertionIdsObserved,
      businessRuleUiEvidenceIds: input.item.businessRule.businessRuleUiEvidenceIds,
      businessRuleApiEvidenceIds: input.item.businessRule.businessRuleApiEvidenceIds,
      businessRuleDownstreamEvidenceIds: input.item.businessRule.businessRuleDownstreamEvidenceIds,
      businessRuleCleanup: input.item.businessRule.businessRuleCleanup,
      observedStatement: input.item.businessRule.observedStatement,
    } : {}),
  };
  if (input.item.businessRule && receipt.businessRuleCleanup) {
    receipt.businessRuleCleanup.apiZeroResidue = apiZeroResidue;
    receipt.businessRuleCleanup.uiZeroResidue = uiZeroResidue;
    receipt.businessRuleCleanup.uiVerificationObserved = uiVerificationObserved;
  }
  await input.testInfo.attach('test-execution-receipt', {
    body: Buffer.from(JSON.stringify({
      ...receipt,
      evidenceFingerprint: fingerprintReceiptEvidence(receipt),
    }, null, 2), 'utf8'),
    contentType: 'application/json',
  });
  const mismatchedAssertions = assertionReceipts.filter((receipt) => receipt.status === 'observed-mismatch');
  if (mismatchedAssertions.length > 0) {
    const route = findRuntimeRoute(input.evidence) ?? new URL(input.page.url()).pathname;
    const productDifference = {
      caseId: input.item.caseId,
      evidenceComplete: apiZeroResidue && uiZeroResidue && uiVerificationObserved && mismatchedAssertions.every((receipt) => (
        receipt.expectedValue !== undefined
        && receipt.actualValue !== undefined
        && receipt.actualStatus === 'observed'
        && receipt.comparison === 'mismatched'
      )),
      productMismatchConfirmed: mismatchedAssertions.every((receipt) => receipt.comparison === 'mismatched'),
      executionPathEquivalent: Boolean(route && operationReceipts.length > 0
        && operationReceipts.every((receipt) => receipt.observed === true && receipt.status === 'passed')),
      route,
      assertionReceipts: mismatchedAssertions,
      cleanup: { apiZeroResidue, uiZeroResidue, uiVerificationObserved },
    };
    await input.testInfo.attach('product-center-product-difference-evidence', {
      body: Buffer.from(JSON.stringify(productDifference, null, 2), 'utf8'),
      contentType: 'application/json',
    });
  }
}

function findRuntimeAssertionReceipts(value: unknown, depth = 0): Array<Record<string, unknown> & { claimId: string; status: 'verified' | 'observed-mismatch' }> {
  if (!value || typeof value !== 'object' || depth > 6) return [];
  const record = value as Record<string, unknown>;
  if (Array.isArray(record.assertionReceipts)) {
    return record.assertionReceipts.filter((item): item is Record<string, unknown> & { claimId: string; status: 'verified' | 'observed-mismatch' } => {
      if (!item || typeof item !== 'object') return false;
      const receipt = item as Record<string, unknown>;
      return typeof receipt.claimId === 'string'
        && (receipt.status === 'verified' || receipt.status === 'observed-mismatch');
    });
  }
  for (const child of Object.values(record)) {
    const receipts = findRuntimeAssertionReceipts(child, depth + 1);
    if (receipts.length > 0) return receipts;
  }
  return [];
}

function findRuntimeRoute(value: unknown, depth = 0): string | null {
  if (!value || typeof value !== 'object' || depth > 6) return null;
  const record = value as Record<string, unknown>;
  if (typeof record.route === 'string' && record.route.trim()) return record.route.trim();
  for (const child of Object.values(record)) {
    const route = findRuntimeRoute(child, depth + 1);
    if (route) return route;
  }
  return null;
}

async function attachUnresolved(testInfo: import('@playwright/test').TestInfo, item: GeneratedCase): Promise<void> {
  const record = {
    caseId: item.caseId,
    title: item.title,
    status: 'unresolved',
    blockingReasons: item.blockingReasons,
    generation: 'script-registered-contract-blocked',
  };
  await testInfo.attach(item.caseId + '-unresolved-contract', {
    body: Buffer.from(JSON.stringify(record, null, 2), 'utf8'),
    contentType: 'application/json',
  });
}

async function verifyPackageUiResidue(
  page: import('@playwright/test').Page,
  cleanup: CleanupRegistryEvidence,
): Promise<Record<string, 0 | 'ui-verification-unavailable:403'>> {
  const identities = Object.keys(cleanup.apiIdentityCounts)
    .filter((identity) => cleanup.apiIdentityKinds[identity] === 'item');
  if (identities.length === 0) return {};
  const list = createItemListPage(page);
  try {
    await list.openForResidueCheck();
    const residue: Record<string, 0 | 'ui-verification-unavailable:403'> = {};
    for (const identity of identities) {
      await list.fillSearchForResidueCheck(identity);
      const count = await list.readVisibleIdentityCount(identity);
      if (count !== 0) throw new Error(`套餐商品 UI 残留：${identity} count=${count}`);
      residue[identity] = 0;
    }
    return residue;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/403|forbidden|authentication-required|merchant-selection-required/i.test(message)) {
      return Object.fromEntries(identities.map((identity) => [identity, 'ui-verification-unavailable:403'])) as Record<string, 0 | 'ui-verification-unavailable:403'>;
    }
    throw error;
  }
}

async function attachManualAcceptedOutcome(
  testInfo: import('@playwright/test').TestInfo,
  caseId: string,
  evidence: unknown,
  runtimeRoute: string,
): Promise<boolean> {
  if (runtimeStatusFromEvidence(evidence) === 'product-defect') return false;
  const evidenceRecord = evidence && typeof evidence === 'object' && !(evidence instanceof Error)
    ? evidence as Record<string, unknown>
    : undefined;
  const nestedEvidence = evidenceRecord?.evidence && typeof evidenceRecord.evidence === 'object'
    ? evidenceRecord.evidence as Record<string, unknown>
    : undefined;
  const observedRoute = typeof evidenceRecord?.route === 'string'
    ? evidenceRecord.route
    : typeof nestedEvidence?.route === 'string'
      ? nestedEvidence.route
      : runtimeRoute;
  const runtimeEvidence = evidence instanceof Error
    ? {
        caseId,
        runtimeRoute: observedRoute,
        runtimeEvidenceKind: 'error',
        error: { name: evidence.name, message: evidence.message, stack: evidence.stack },
      }
    : { caseId, runtimeRoute: observedRoute, runtimeEvidenceKind: 'structured', evidence };
  const accepted = acceptProductCenterItemManualOutcome(caseId, runtimeEvidence);
  if (!accepted) return false;
  await testInfo.attach(caseId + '-manual-accepted-evidence', {
    body: Buffer.from(JSON.stringify(accepted, null, 2), 'utf8'),
    contentType: 'application/json',
  });
  return true;
}

function assertRuntimeImplemented(caseId: string, status: string, evidence: unknown): void {
  if (status === 'implemented') return;
  const record = evidence && typeof evidence === 'object' ? evidence as Record<string, unknown> : {};
  const diagnostic = typeof record.reason === 'string'
    ? record.reason
    : typeof record.message === 'string'
      ? record.message
      : JSON.stringify(evidence);
  throw new Error(`${caseId} ${status.toUpperCase()}: ${diagnostic}`);
}

function runtimeStatusFromEvidence(evidence: unknown): string {
  if (!evidence || typeof evidence !== 'object') return 'implemented';
  const record = evidence as Record<string, unknown>;
  const status = typeof record.status === 'string' ? record.status : undefined;
  if (status && status !== 'implemented') return status;
  const classification = typeof record.classification === 'string' ? record.classification : undefined;
  return classification && classification !== 'implemented' ? classification : 'implemented';
}

function withCleanupAuditEvidence<T>(
  evidence: T,
  cleanup: CleanupRegistryEvidence,
  uiResidue: Record<string, 0 | 'ui-verification-unavailable:403'>,
): T {
  const uiValues = Object.values(uiResidue);
  const apiZero = Object.values(cleanup.apiIdentityCounts).every((count) => count === 0);
  const uiZero = uiValues.every((count) => count === 0);
  if (!evidence || typeof evidence !== 'object') return evidence;
  const clone = JSON.parse(JSON.stringify(evidence)) as Record<string, unknown>;
  clone.cleanupEvidence = { ...cleanup, uiIdentityCounts: uiResidue };
  if (!apiZero || !uiZero) return clone as T;
  const observation = findAuditObservationForCleanup(clone);
  if (!observation) return clone as T;
  const existingServerIds = Array.isArray(observation.serverIds)
    ? observation.serverIds.filter((value): value is string | number => typeof value === 'string' || typeof value === 'number')
    : [];
  observation.serverIds = [...new Set([...existingServerIds.map(String), ...cleanup.serverIds.map(String)])];
  observation.cleanup = { uiCount: uiValues.reduce<number>((sum, value) => sum + (typeof value === 'number' ? value : 1), 0), apiCount: Object.values(cleanup.apiIdentityCounts).reduce((sum, count) => sum + count, 0), verifiedAt: new Date().toISOString() };
  return clone as T;
}

function findAuditObservationForCleanup(value: Record<string, unknown>, depth = 0): Record<string, unknown> | undefined {
  if (depth > 5) return undefined;
  if (value.auditObservation && typeof value.auditObservation === 'object') return value.auditObservation as Record<string, unknown>;
  for (const key of ['evidence', 'result', 'runtimeEvidence']) {
    const nested = value[key];
    if (nested && typeof nested === 'object') {
      const found = findAuditObservationForCleanup(nested as Record<string, unknown>, depth + 1);
      if (found) return found;
    }
  }
  return undefined;
}

export const item213GenerationSummary = {
  total: 209,
  standard: 89,
  package: 75,
  addon: 45,
  standardFlowBound: 89,
  contractUnresolved: 0,
};

export const item216ScopeSummary = {
  formal: item216FormalCaseInventory.length,
  executable: item213GenerationSummary.total,
  conversionNotApplicable: conversionNotApplicableCaseIds.size,
};
