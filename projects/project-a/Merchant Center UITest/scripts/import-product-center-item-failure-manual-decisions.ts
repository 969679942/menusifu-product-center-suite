import fs from 'node:fs';
import path from 'node:path';

type DecisionDisposition = 'accepted-observed' | 'product-defect' | 'automation-remediation' | 'skip-deferred';
type AuditContract = {
  evidenceId: string;
  canonicalId: string;
  ruleId: string;
  irId: string;
  recipeId: string;
  route: string;
  state: string;
  action: string;
  overlay: string[];
  uiAssertion: string;
  apiAssertion: string;
  safetyLevel: 'L0' | 'L1' | 'L2' | 'L3';
  evidenceRefs: string[];
  freshObservationRequired: true;
};
type ManualDecision = {
  caseId: string;
  title: string;
  directive: string;
  disposition: DecisionDisposition;
  priority: 'P0' | 'P1' | 'P2';
  updatedTitle?: string;
  acceptedDiagnosticPatterns?: string[];
  auditContract?: AuditContract;
  canonicalActions?: string[];
  canonicalExpectedResults?: string[];
  sourceType: 'direct-user-confirmation' | 'runtime-analysis';
  confirmedBy?: '金将军';
};

const projectRoot = path.resolve(__dirname, '..');
const sourcePath = path.resolve(process.argv[2] || path.join(projectRoot, 'output/product-center-item-213-failures/failure-pack.md'));
const outputPath = path.resolve(process.argv[3] || path.join(projectRoot, 'contracts/product-center/reviews/product-center-item-failure-manual-decisions.json'));
const ruleConfirmationPath = path.join(projectRoot, 'contracts/product-center/reviews/product-center-item-rule-confirmations.json');
const source = fs.readFileSync(sourcePath, 'utf8');
const parsed = source.split(/^# (?=TC-ITEM-)/m).slice(1).map((section) => {
  const heading = section.match(/^(TC-ITEM-[A-Z]+-\d{3}) (.+?)\r?\n/);
  return {
    caseId: heading?.[1] ?? '',
    title: heading?.[2]?.trim() ?? '',
    directive: section.match(/^##人工处理：(.+)$/m)?.[1]?.trim() ?? '',
  };
});
if (parsed.length === 0) {
  throw new Error(`人工处理意见解析不完整：cases=${parsed.length} missing=${parsed.filter((item) => !item.directive).length}`);
}

const skipCases = new Set([
  'TC-ITEM-PKG-039', 'TC-ITEM-PKG-060', 'TC-ITEM-PKG-070',
  'TC-ITEM-STD-025', 'TC-ITEM-STD-026', 'TC-ITEM-STD-027', 'TC-ITEM-STD-067',
  'TC-ITEM-STD-070', 'TC-ITEM-STD-077', 'TC-ITEM-STD-080', 'TC-ITEM-STD-083',
]);
const productDefectCases = new Set<string>();
const canonicalExpectations = new Map<string, string[]>([
  ['TC-ITEM-PKG-006', ['套餐商品页通过“选择固定搭配”引用已存在的固定搭配组，选中后页面回显唯一组卡片。']],
  ['TC-ITEM-PKG-049', ['套餐商品可同时通过选择入口引用已存在的固定搭配组和可选搭配组，保存后编辑页回显两个组卡片。']],
  ['TC-ITEM-PKG-057', ['“选择可选搭配”弹窗支持筛选并选择已存在的可选搭配组；商品页不提供内嵌新建可选搭配入口。']],
  ['TC-ITEM-PKG-058', ['选择已有可选搭配组后，套餐商品页回显该组当前规则摘要，不在商品页重新配置组规则。']],
  ['TC-ITEM-PKG-059', ['套餐商品编辑页可选择已有可选搭配组；组卡片提供组级编辑和删除，商品行不提供单项移除入口。']],
  ['TC-ITEM-ADD-010', ['点击保存后价格归一化为 0.00，加料商品保存成功且列表显示 0.00。']],
  ['TC-ITEM-ADD-044', ['出现停用二次确认弹窗；点击确认后菜单已引用的加料商品停用成功。']],
  ['TC-ITEM-ADD-012', ['商品名称达到页面最大长度后不可继续输入；按最大长度值保存成功。']],
  ['TC-ITEM-ADD-015', ['加料商品允许与其他商品类型使用相同商品名称；保存成功后同名标准商品和加料商品均保留。']],
  ['TC-ITEM-ADD-037', ['加料商品状态变更后，需重新下发到门店终端才生效。']],
  ['TC-ITEM-PKG-019', ['点击保存后价格归一化为 0.00，套餐商品保存成功且列表显示 0.00。']],
  ['TC-ITEM-PKG-021', ['商品名称首尾有空格时显示红色提示且无法保存；非首尾空格场景达到 100 字符后不可继续输入，按 100 字符保存成功。']],
  ['TC-ITEM-PKG-022', ['套餐商品 POS 名称和送厨名称达到页面最大长度后不可继续输入；按最大长度值保存成功。']],
  ['TC-ITEM-PKG-023', ['助记码达到 20 字符后不可继续输入；按 20 字符值保存成功。']],
  ['TC-ITEM-PKG-028', ['使用可预览的有效 PNG，前 10 张详情图片均形成页面预览，第 11 张不可新增。']],
  ['TC-ITEM-PKG-035', ['编辑页更新基础信息并删除原主图、不新增图片，可以保存；重新进入编辑页名称回显且商品无图。更换主图由 TC-ITEM-PKG-068 覆盖。']],
  ['TC-ITEM-PKG-050', ['套餐分组为必填；删除全部套餐分组后点击保存提示 BITEM-6003，原套餐保持不变。']],
  ['TC-ITEM-PKG-052', ['套餐商品不提供口味组、做法组和加料组引用入口。']],
  ['TC-ITEM-PKG-053', ['套餐和加料商品不提供互斥规则，只有标准商品支持互斥规则。']],
  ['TC-ITEM-PKG-054', ['所有商品类型在商品列表中的主图均不支持点击查看大图。']],
  ['TC-ITEM-PKG-067', ['本地上传主图后页面图片位置回显可预览图片；点击右上角保存后套餐创建成功。']],
  ['TC-ITEM-PKG-068', ['编辑页先删除第一张主图，再从图片库或本地上传第二张并保存；第二张替换第一张。']],
  ['TC-ITEM-STD-008', ['商品名称达到页面最大长度后不可继续输入；按最大长度值保存成功。']],
  ['TC-ITEM-STD-012', ['同一一级分类下，不同二级分类的标准商品同名保存返回 BITEM-7010，UI/API 均不新增重复记录。']],
  ['TC-ITEM-STD-021', ['点击保存后价格归一化为 0.00，标准商品保存成功且列表显示 0.00。']],
  ['TC-ITEM-STD-023', ['点击保存后起售数量归一化为 1，保存成功且编辑页回显 1。']],
  ['TC-ITEM-STD-039', ['起售数量默认值为 1；清空后页面不得保留空值并提交。']],
  ['TC-ITEM-STD-045', ['商品描述最多输入 250 字符，达到 250 字符后不可继续录入。']],
  ['TC-ITEM-STD-046', ['助记码或设备编码达到页面最大长度后不可继续输入；按最大长度值保存成功。']],
  ['TC-ITEM-STD-048', ['点击添加规格组后弹出规格组选择页；点击去创建可跳转规格组新增页。']],
  ['TC-ITEM-STD-051', ['输入 1000000.00 后点击保存成功；商品列表价格显示 999999.99。']],
  ['TC-ITEM-STD-056', ['选择原料、过敏原和营养成分并保存成功；重新进入编辑页三类材料信息均回显。']],
]);
const canonicalTitles = new Map<string, string>([
  ['TC-ITEM-PKG-006', '套餐商品选择并引用已有固定搭配组'],
  ['TC-ITEM-PKG-049', '套餐商品同时引用已有固定搭配与可选搭配组'],
  ['TC-ITEM-PKG-057', '套餐商品通过选择入口引用已有可选搭配组'],
  ['TC-ITEM-PKG-058', '套餐商品回显已有可选搭配组规则摘要'],
  ['TC-ITEM-PKG-059', '套餐商品编辑页可选搭配组仅支持组级操作'],
  ['TC-ITEM-ADD-010', '加料商品非法价格保存时归一化为 0.00'],
  ['TC-ITEM-ADD-015', '加料商品允许与其他商品类型同名'],
  ['TC-ITEM-ADD-044', '菜单已引用的加料商品二次确认后停用成功'],
  ['TC-ITEM-PKG-019', '套餐商品非法价格保存时归一化为 0.00'],
  ['TC-ITEM-PKG-021', '套餐商品名称首尾空格校验及 100 字符上限'],
  ['TC-ITEM-PKG-028', '套餐商品最多保存 10 张有效详情图片'],
  ['TC-ITEM-PKG-035', '套餐编辑基础信息并删除主图后允许无图'],
  ['TC-ITEM-PKG-050', '删除全部套餐分组后因分组必填无法保存'],
  ['TC-ITEM-PKG-052', '套餐商品不支持引用口味做法加料组'],
  ['TC-ITEM-PKG-053', '套餐和加料商品不支持互斥规则'],
  ['TC-ITEM-PKG-054', '商品列表主图不支持点击查看大图'],
  ['TC-ITEM-PKG-067', '套餐商品本地上传主图回显后保存成功'],
  ['TC-ITEM-PKG-068', '套餐商品先删原图再上传第二张主图替换成功'],
  ['TC-ITEM-STD-012', '同一一级分类不同二级分类的标准商品同名提示 BITEM-7010'],
  ['TC-ITEM-STD-021', '标准商品非法价格保存时归一化为 0.00'],
  ['TC-ITEM-STD-023', '标准商品非法起售数量保存时归一化为 1'],
  ['TC-ITEM-STD-045', '商品描述达到 250 字符后不可继续输入'],
  ['TC-ITEM-STD-051', '超限价格保存成功并按 999999.99 展示'],
  ['TC-ITEM-STD-056', '原料过敏原营养成分保存后编辑回显'],
]);
const canonicalActions = new Map<string, string[]>([
  ['TC-ITEM-PKG-006', ['进入套餐商品创建页。', '打开套餐分组菜单并点击“选择固定搭配”。', '筛选并选择一个受控固定搭配组。', '核对页面回显唯一固定搭配组卡片。']],
  ['TC-ITEM-PKG-049', ['准备已存在的固定搭配组和可选搭配组。', '进入套餐商品创建页并分别通过选择入口引用两个组。', '保存套餐并重新进入编辑页。', '核对两个组卡片均回显。']],
  ['TC-ITEM-PKG-057', ['进入套餐商品创建页。', '打开套餐分组菜单并点击“选择可选搭配”。', '筛选并选择一个受控可选搭配组。', '核对页面回显唯一可选搭配组卡片。']],
  ['TC-ITEM-PKG-058', ['选择一个已存在的受控可选搭配组。', '展开已选组卡片。', '核对组内商品重复选择和选择数量规则摘要。']],
  ['TC-ITEM-PKG-059', ['创建引用固定搭配组的套餐并进入编辑页。', '通过“选择可选搭配”引用已存在的受控可选搭配组。', '展开组卡片并核对组级操作和商品行操作边界。']],
  ['TC-ITEM-ADD-010', ['进入加料商品创建页并填写唯一名称。', '输入负数或非数字标准价并点击保存。', '在商品列表搜索该商品并读取价格。']],
  ['TC-ITEM-ADD-015', ['创建一个唯一名称的标准商品。', '进入加料商品创建页并填写相同商品名称。', '点击保存。', '核对同名标准商品和加料商品均存在。']],
  ['TC-ITEM-ADD-044', ['创建加料商品并加入受控菜单。', '在商品列表点击停用。', '在二次确认弹窗点击 Disable/停用。', '核对品牌商品状态为 Disabled。']],
  ['TC-ITEM-PKG-019', ['进入套餐创建页并填写必填信息及套餐分组。', '输入负数或非数字标准价并点击保存。', '在商品列表搜索该套餐并读取价格。']],
  ['TC-ITEM-PKG-021', ['输入首尾空格名称并确认红色提示阻止保存。', '输入超过 100 字符且首尾无空格的名称。', '确认只能保留前 100 字符并保存。']],
  ['TC-ITEM-PKG-028', ['准备 11 张可预览且校验通过的 PNG。', '依次上传前 10 张并逐张确认新增预览。', '上传第 11 张并确认预览数量不再增加。', '保存套餐。']],
  ['TC-ITEM-PKG-035', ['创建带主图的套餐并进入编辑页。', '更新套餐基础信息并点击原图右上角删除图标。', '不新增图片，点击右上角保存。', '重新进入编辑页确认名称回显且商品无图。']],
  ['TC-ITEM-PKG-050', ['创建含一个套餐分组的套餐并进入编辑页。', '点击套餐分组级删除按钮删除全部分组。', '点击保存并读取错误提示。', '核对原套餐记录未变化。']],
  ['TC-ITEM-PKG-052', ['进入套餐商品创建页并展开商品属性。', '打开添加菜单并检查口味、做法、加料组入口。']],
  ['TC-ITEM-PKG-053', ['进入套餐商品创建页并展开商品属性。', '检查互斥规则入口及可配置对象。']],
  ['TC-ITEM-PKG-054', ['创建带主图套餐并返回商品列表。', '搜索套餐并尝试点击列表主图。', '检查没有形成图片预览弹层。']],
  ['TC-ITEM-PKG-067', ['进入套餐创建页并从本地选择有效图片。', '确认主图区域回显可预览图片。', '点击右上角保存并在列表核对套餐。']],
  ['TC-ITEM-PKG-068', ['创建带第一张主图的套餐并进入编辑页。', '删除第一张主图。', '上传第二张主图并点击保存。', '重新进入编辑页确认仅回显第二张主图。']],
  ['TC-ITEM-STD-012', ['在一级分类 A 的二级分类 A/a 创建唯一名称的标准商品。', '在同一一级分类 A 的二级分类 A/b 创建相同名称的标准商品。', '点击保存，读取 BITEM-7010 并核对重复记录数未增加。']],
  ['TC-ITEM-STD-021', ['进入标准商品创建页并填写必填信息。', '输入负数或非数字标准价并点击保存。', '在商品列表读取保存后的价格。']],
  ['TC-ITEM-STD-023', ['进入标准商品创建页并填写必填信息。', '输入负数或非数字起售数量并点击保存。', '重新进入编辑页读取起售数量。']],
  ['TC-ITEM-STD-045', ['在商品描述输入 250 字符。', '继续输入第 251 个字符。', '读取输入框 maxlength、计数器和实际长度。']],
  ['TC-ITEM-STD-051', ['输入标准价 1000000.00。', '点击保存并捕获成功创建 operation。', '在商品列表搜索并读取价格。']],
  ['TC-ITEM-STD-056', ['准备受控原料并读取可用过敏原和营养成分。', '在材料信息中分别选择原料、过敏原和营养成分。', '点击保存并重新进入编辑页。', '核对三类材料信息均回显。']],
]);
const acceptedObserved = new Map<string, Pick<ManualDecision, 'updatedTitle' | 'priority' | 'acceptedDiagnosticPatterns' | 'auditContract'>>([
  ['TC-ITEM-PKG-006', accepted('TC-ITEM-PKG-006', '套餐商品选择并引用已有固定搭配组', 'P1', ['Add Fixed Combo 菜单项未稳定进入视口'], '/pp/brand/create/combo', 'combo-group-menu-open', 'select-fixed-combo', ['select-fixed-combo-dialog'], '菜单仅提供 Select Fixed Combo、Select Custom Combo、Select Pick & Mix，固定搭配通过选择已有组引用', 'N/A:控件审计 mutationRequestsObserved=0', 'L1', 'package-item-216.flow.ts')],
  ['TC-ITEM-PKG-049', accepted('TC-ITEM-PKG-049', '套餐商品同时引用已有固定搭配与可选搭配组', 'P1', ['Add Custom Combo 菜单项未稳定进入视口'], '/pp/brand/create/combo', 'combo-group-menu-open', 'select-fixed-and-custom-combo', ['combo-selection-dialogs'], '固定搭配和可选搭配均通过选择已有组入口引用', 'N/A:控件审计 mutationRequestsObserved=0', 'L1', 'package-item-216.flow.ts')],
  ['TC-ITEM-PKG-057', accepted('TC-ITEM-PKG-057', '套餐商品通过选择入口引用已有可选搭配组', 'P1', ['Add Custom Combo 菜单项未稳定进入视口'], '/pp/brand/create/combo', 'combo-group-menu-open', 'select-custom-combo', ['select-custom-combo-dialog'], '商品页不提供内嵌新建可选搭配，仅支持选择已有可选搭配组', 'N/A:控件审计 mutationRequestsObserved=0', 'L1', 'package-item-216.flow.ts')],
  ['TC-ITEM-PKG-058', accepted('TC-ITEM-PKG-058', '套餐商品回显已有可选搭配组规则摘要', 'P1', ['Add Custom Combo 菜单项未稳定进入视口'], '/pp/brand/create/combo', 'custom-combo-selected', 'inspect-custom-combo-card', ['N/A:no-overlay'], '选择已有可选搭配组后回显组规则摘要', '受控可选搭配组按服务器 ID 清理', 'L1', 'package-item-216.flow.ts')],
  ['TC-ITEM-PKG-059', accepted('TC-ITEM-PKG-059', '套餐商品编辑页可选搭配组仅支持组级操作', 'P1', ['Add Custom Combo 菜单项未稳定进入视口'], '/pp/brand/edit/combo', 'custom-combo-selected', 'inspect-custom-combo-operation-boundary', ['N/A:no-overlay'], '组卡片有组级编辑和删除，商品行无单项移除入口', '受控套餐和可选搭配组按服务器 ID 清理', 'L3', 'package-item-216.flow.ts')],
  ['TC-ITEM-ADD-035', accepted('TC-ITEM-ADD-035', '加料商品列表主图不支持点击查看大图', 'P2', ['MAIN_IMAGE_CLICK_TARGET_NOT_OBSERVED', '没有观察到可点击主图'], '/pp/brand/list', 'addon-list-filtered-with-controlled-image-item', 'click-main-image', ['N/A:no-preview-overlay'], '列表行不存在可点击主图目标', '受控主图商品创建成功；观察后按服务器 ID 清理且 UI/API count=0', 'L3', 'addon-item-216.flow.ts')],
  ['TC-ITEM-ADD-041', accepted('TC-ITEM-ADD-041', '切换页面返回加料商品列表时不保留查询条件', 'P1', ['查询条件未保留'], '/pp/brand/list', 'addon-list-returned-after-route-switch', 'navigate-away-and-return', ['N/A:no-overlay'], '返回列表后查询条件为空', '受控加料商品创建成功；观察后按服务器 ID 清理且 UI/API count=0', 'L3', 'addon-item-216.flow.ts')],
  ['TC-ITEM-PKG-013', accepted('TC-ITEM-PKG-013', '存在二级分类时未选二级分类不影响套餐商品提交', 'P2', ['负向条件未阻止服务器创建'], '/pp/brand/create/combo', 'parent-category-selected-without-child', 'save-combo-item', ['category-selector-closed'], '页面允许提交并返回列表终态', 'POST 创建成功；按服务器 ID 清理且 UI/API count=0', 'L3', 'package-item-216.flow.ts')],
  ['TC-ITEM-PKG-048', accepted('TC-ITEM-PKG-048', '切换页面返回套餐商品列表时不保留查询条件', 'P1', ['查询条件未保留'], '/pp/brand/list', 'combo-list-returned-after-route-switch', 'navigate-away-and-return', ['N/A:no-overlay'], '返回列表后查询条件为空', 'N/A:只读状态观察', 'L1', 'package-item-216.flow.ts')],
  ['TC-ITEM-PKG-050', accepted('TC-ITEM-PKG-050', '删除全部套餐分组后因分组必填无法保存', 'P1', ['BITEM-6003'], '/pp/brand/edit/combo', 'all-combo-groups-removed', 'save-combo-item', ['error-toast:BITEM-6003'], '删除全部套餐分组后保存提示 BITEM-6003', '原套餐 API 记录保持 1；清理后 UI/API count=0', 'L3', 'package-item-216.flow.ts')],
  ['TC-ITEM-PKG-052', accepted('TC-ITEM-PKG-052', '套餐商品不支持引用口味做法加料组', 'P1', ['未展示 flavor 组引用入口'], '/pp/brand/create/combo', 'combo-attribute-section-open', 'probe-attribute-group-entry', ['attribute-reference-menu'], '没有口味、做法和加料组引用入口', 'N/A:未触发属性组引用请求', 'L0', 'package-item-216.flow.ts')],
  ['TC-ITEM-PKG-054', accepted('TC-ITEM-PKG-054', '套餐商品列表主图不支持点击查看大图', 'P2', ['套餐商品列表主图已回显但不可点击'], '/pp/brand/list', 'combo-list-filtered-with-controlled-image-item', 'click-main-image', ['N/A:no-preview-overlay'], '列表主图已回显但不存在可点击目标', '受控主图套餐商品创建成功；观察后按服务器 ID 清理且 UI/API count=0', 'L3', 'package-item-216.flow.ts')],
  ['TC-ITEM-PKG-063', accepted('TC-ITEM-PKG-063', '套餐商品创建页不提供做法组引用入口', 'P1', ['未展示 recipe 组引用入口'], '/pp/brand/create/combo', 'combo-attribute-section-open', 'probe-recipe-group-entry', ['attribute-reference-menu'], 'Attribute 区域没有做法组引用入口', 'N/A:未触发属性组引用请求', 'L0', 'package-item-216.flow.ts')],
  ['TC-ITEM-PKG-064', accepted('TC-ITEM-PKG-064', '套餐商品创建页不提供加料组引用入口', 'P1', ['未展示 additives 组引用入口'], '/pp/brand/create/combo', 'combo-attribute-section-open', 'probe-additives-group-entry', ['attribute-reference-menu'], 'Attribute 区域没有加料组引用入口', 'N/A:未触发属性组引用请求', 'L0', 'package-item-216.flow.ts')],
  ['TC-ITEM-PKG-065', accepted('TC-ITEM-PKG-065', '套餐商品创建页没有加料组子项编辑能力', 'P1', ['未展示 additives 组引用入口'], '/pp/brand/create/combo', 'combo-attribute-section-open', 'probe-additives-child-edit-entry', ['attribute-reference-menu'], '没有加料组入口，因此不存在组内子项编辑能力', 'N/A:未触发属性组引用请求', 'L0', 'package-item-216.flow.ts')],
  ['TC-ITEM-PKG-069', accepted('TC-ITEM-PKG-069', '套餐商品内不提供口味组加价和默认选中编辑', 'P1', ['未展示 flavor 组引用入口'], '/pp/brand/create/combo', 'combo-attribute-section-open', 'probe-flavor-option-override', ['attribute-reference-menu'], '没有口味组引用和选项覆盖入口', 'N/A:未触发属性组引用请求', 'L0', 'package-item-216.flow.ts')],
  ['TC-ITEM-PKG-071', accepted('TC-ITEM-PKG-071', '套餐商品内不提供做法组加价和默认选中编辑', 'P1', ['未展示 recipe 组引用入口'], '/pp/brand/create/combo', 'combo-attribute-section-open', 'probe-recipe-option-override', ['attribute-reference-menu'], '没有做法组引用和选项覆盖入口', 'N/A:未触发属性组引用请求', 'L0', 'package-item-216.flow.ts')],
  ['TC-ITEM-PKG-072', accepted('TC-ITEM-PKG-072', '套餐商品内不提供加料组加价和默认选中编辑', 'P1', ['未展示 additives 组引用入口'], '/pp/brand/create/combo', 'combo-attribute-section-open', 'probe-additives-option-override', ['attribute-reference-menu'], '没有加料组引用和选项覆盖入口', 'N/A:未触发属性组引用请求', 'L0', 'package-item-216.flow.ts')],
  ['TC-ITEM-PKG-073', accepted('TC-ITEM-PKG-073', '套餐商品内没有选项组默认选中子项配置入口', 'P1', ['未展示 flavor 组引用入口'], '/pp/brand/create/combo', 'combo-attribute-section-open', 'probe-single-default-option', ['attribute-reference-menu'], '没有选项组默认选中配置入口', 'N/A:未触发属性组引用请求', 'L0', 'package-item-216.flow.ts')],
  ['TC-ITEM-PKG-053', accepted('TC-ITEM-PKG-053', '套餐和加料商品不支持互斥规则', 'P1', ['未展示 Flavor 组引用入口'], '/pp/brand/create/combo', 'combo-attribute-section-open', 'probe-mutually-exclusive-rule-entry', ['attribute-reference-menu'], '套餐商品没有互斥规则入口', 'N/A:未触发互斥规则或套餐保存请求', 'L0', 'package-item-216.flow.ts')],
  ['TC-ITEM-STD-030', accepted('TC-ITEM-STD-030', '切换页面返回标准商品列表时不保留查询条件', 'P1', ['筛选条件未保留'], '/pp/brand/list', 'standard-list-returned-after-route-switch', 'navigate-away-and-return', ['N/A:no-overlay'], '返回列表后类型筛选条件为空', 'N/A:只读状态观察', 'L1', 'standard-item-216.flow.ts')],
  ['TC-ITEM-STD-071', accepted('TC-ITEM-STD-071', '标准商品列表主图不支持点击查看大图', 'P2', ['没有形成可点击的业务主图目标', '未形成预览 overlay'], '/pp/brand/list', 'standard-list-filtered-with-controlled-image-item', 'click-main-image', ['N/A:no-preview-overlay'], '列表主图不存在可点击目标且不形成预览 overlay', '受控主图商品创建成功；观察后按服务器 ID 清理且 UI/API count=0', 'L3', 'standard-item-216.flow.ts')],
  ['TC-ITEM-STD-078', accepted('TC-ITEM-STD-078', '标准商品主图上传后不提供第二次本地上传入口', 'P1', ['仅展示预览和删除入口', '没有第二次本地上传入口'], '/pp/brand/create/standard', 'standard-main-image-populated', 'probe-second-main-image-upload', ['N/A:no-secondary-upload-overlay'], '首张主图上传后仅展示预览和删除，不提供第二次本地上传入口', '受控品牌图片按服务器 ID 清理且 UI/API count=0', 'L3', 'standard-item-216.flow.ts')],
]);

const currentDecisions: ManualDecision[] = parsed.map((item) => {
  const accepted = acceptedObserved.get(item.caseId);
  const disposition: DecisionDisposition = skipCases.has(item.caseId)
    ? 'skip-deferred'
    : productDefectCases.has(item.caseId)
      ? 'product-defect'
      : accepted ? 'accepted-observed' : 'automation-remediation';
  return {
    ...item,
    disposition,
    priority: accepted?.priority ?? (disposition === 'product-defect' ? 'P0' : disposition === 'skip-deferred' ? 'P2' : 'P1'),
    ...(canonicalTitles.has(item.caseId)
      ? { updatedTitle: canonicalTitles.get(item.caseId) }
      : accepted?.updatedTitle
        ? { updatedTitle: accepted.updatedTitle }
        : {}),
    ...(accepted?.acceptedDiagnosticPatterns ? { acceptedDiagnosticPatterns: accepted.acceptedDiagnosticPatterns } : {}),
    ...(accepted?.auditContract ? { auditContract: accepted.auditContract } : {}),
    ...(canonicalActions.has(item.caseId) ? { canonicalActions: canonicalActions.get(item.caseId) } : {}),
    ...(accepted?.canonicalExpectedResults
      ? { canonicalExpectedResults: accepted.canonicalExpectedResults }
      : canonicalExpectations.has(item.caseId)
        ? { canonicalExpectedResults: canonicalExpectations.get(item.caseId) }
        : {}),
    sourceType: item.directive ? 'direct-user-confirmation' : 'runtime-analysis',
    ...(item.directive ? { confirmedBy: '金将军' as const } : {}),
  };
});

const priorDecisions = fs.existsSync(outputPath)
  ? (JSON.parse(fs.readFileSync(outputPath, 'utf8')) as { decisions?: ManualDecision[] }).decisions ?? []
  : [];
const currentCaseIds = new Set(currentDecisions.map((item) => item.caseId));
const decisions: ManualDecision[] = [
  ...priorDecisions.filter((item) => !currentCaseIds.has(item.caseId)),
  ...currentDecisions,
].sort((left, right) => left.caseId.localeCompare(right.caseId));

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify({
  schemaVersion: '1.0.0',
  collectionId: 'product-center-item-failure-manual-decisions',
  generatedAt: new Date().toISOString(),
  source: path.relative(projectRoot, sourcePath),
  summary: countBy(decisions, (item) => item.disposition),
  decisions,
}, null, 2)}\n`, 'utf8');

const confirmations = JSON.parse(fs.readFileSync(ruleConfirmationPath, 'utf8')) as { confirmations: Array<Record<string, unknown>> };
const authoritativeCorrectionCaseIds = new Set(currentDecisions
  .filter((item) => (item.sourceType === 'direct-user-confirmation' || item.disposition === 'accepted-observed')
    && item.canonicalExpectedResults?.length)
  .map((item) => item.caseId));
for (const caseId of acceptedObserved.keys()) authoritativeCorrectionCaseIds.add(caseId);
const generatedConfirmations = currentDecisions
  .filter((item) => (item.sourceType === 'direct-user-confirmation' || item.disposition === 'accepted-observed')
    && item.canonicalExpectedResults?.length)
  .map((item) => ({
    confirmationId: `product-confirmation:failure-pack:${item.caseId}`,
    ruleId: `BR-${item.caseId}`,
    ruleGroupId: 'item-failure-manual-review',
    confirmedBy: item.confirmedBy ?? '运行审计与人工评审',
    sourceType: item.sourceType,
    statement: item.directive ?? item.reason,
    linkedCanonicalIds: [item.caseId],
    canonicalCorrections: [{
      canonicalId: item.caseId,
      priority: item.priority,
      title: canonicalTitles.get(item.caseId) ?? item.updatedTitle ?? item.title,
      source: item.sourceType === 'direct-user-confirmation'
        ? `金将军人工处理确认 ← ${path.relative(projectRoot, sourcePath)}#${item.caseId.toLowerCase()}`
        : `运行审计接受 ← ${item.auditContract?.evidenceRefs.join('；') ?? path.relative(projectRoot, sourcePath)}`,
      ...(item.canonicalActions?.length ? { actions: item.canonicalActions } : {}),
      expectedResults: item.canonicalExpectedResults,
      supersededDiagnostics: [
        'RUNTIME_RULE_CONFLICT',
        'PRODUCT_RULE_CONFIRMATION_REQUIRED',
        'UNSUPPORTED_SOURCE_FORMAT',
      ],
    }],
  }));
const generatedCaseIds = new Set(generatedConfirmations.flatMap((item) => item.linkedCanonicalIds));
const acceptedObservationConfirmations = [...acceptedObserved.entries()]
  .filter(([caseId]) => !generatedCaseIds.has(caseId))
  .map(([caseId, acceptedDecision]) => ({
    confirmationId: `product-confirmation:accepted-observed:${caseId}`,
    ruleId: `BR-${caseId}`,
    ruleGroupId: 'item-runtime-observation-review',
    confirmedBy: '运行审计与人工评审',
    sourceType: 'runtime-analysis',
    statement: acceptedDecision.updatedTitle,
    linkedCanonicalIds: [caseId],
    canonicalCorrections: [{
      canonicalId: caseId,
      priority: acceptedDecision.priority,
      title: acceptedDecision.updatedTitle,
      source: `运行审计接受 ← ${acceptedDecision.auditContract?.evidenceRefs.join('；') ?? '运行证据账本'}`,
      actions: canonicalActions.get(caseId) ?? [
        `进入已审计路由 ${acceptedDecision.auditContract?.route ?? 'N/A'} 并准备受控状态 ${acceptedDecision.auditContract?.state ?? 'N/A'}。`,
        `执行页面动作 ${acceptedDecision.auditContract?.action ?? 'N/A'}。`,
        `核对页面结果：${acceptedDecision.auditContract?.uiAssertion ?? acceptedDecision.updatedTitle}。`,
      ],
      expectedResults: acceptedDecision.canonicalExpectedResults ?? [acceptedDecision.updatedTitle],
      supersededDiagnostics: acceptedDecision.acceptedDiagnosticPatterns ?? [],
    }],
  }));
const retainedConfirmations = confirmations.confirmations.flatMap((item) => {
    const confirmationId = String(item.confirmationId ?? '');
    if (confirmationId.startsWith('product-confirmation:failure-pack:')) {
      const linkedCanonicalIds = item.linkedCanonicalIds;
      const caseId = Array.isArray(linkedCanonicalIds)
        ? String(linkedCanonicalIds[0] ?? '')
        : '';
      return currentCaseIds.has(caseId) ? [] : [item];
    }
    const canonicalCorrections = Array.isArray(item.canonicalCorrections)
      ? item.canonicalCorrections.filter((correction) => !authoritativeCorrectionCaseIds.has(
        String((correction as Record<string, unknown>).canonicalId ?? ''),
      ))
      : undefined;
    const linkedCanonicalIds = item.linkedCanonicalIds;
    const retainedLinkedCanonicalIds = Array.isArray(linkedCanonicalIds)
      ? linkedCanonicalIds.filter((caseId) => !authoritativeCorrectionCaseIds.has(String(caseId)))
      : linkedCanonicalIds;
    if (Array.isArray(item.canonicalCorrections) && canonicalCorrections?.length === 0) return [];
    return [{
      ...item,
      ...(canonicalCorrections ? { canonicalCorrections } : {}),
      ...(Array.isArray(retainedLinkedCanonicalIds) ? { linkedCanonicalIds: retainedLinkedCanonicalIds } : {}),
    }];
  });
const mergedConfirmations = [
  ...retainedConfirmations,
  ...generatedConfirmations,
  ...acceptedObservationConfirmations,
];
confirmations.confirmations = [...new Map(mergedConfirmations.map((item) => [
  String(item.confirmationId ?? ''),
  item,
])).values()];
fs.writeFileSync(ruleConfirmationPath, `${JSON.stringify(confirmations, null, 2)}\n`, 'utf8');
process.stdout.write(`${JSON.stringify({
  decisions: decisions.length,
  summary: countBy(decisions, (item) => item.disposition),
  confirmations: generatedConfirmations.length + acceptedObservationConfirmations.length,
})}\n`);

function countBy<T>(items: T[], keyOf: (item: T) => string): Record<string, number> {
  return items.reduce<Record<string, number>>((counts, item) => {
    const key = keyOf(item);
    counts[key] = (counts[key] ?? 0) + 1;
    return counts;
  }, {});
}

function accepted(
  caseId: string,
  updatedTitle: string,
  priority: 'P1' | 'P2',
  acceptedDiagnosticPatterns: string[],
  route: string,
  state: string,
  action: string,
  overlay: string[],
  uiAssertion: string,
  apiAssertion: string,
  safetyLevel: AuditContract['safetyLevel'],
  flowFile: string,
): Pick<ManualDecision, 'updatedTitle' | 'priority' | 'acceptedDiagnosticPatterns' | 'auditContract' | 'canonicalExpectedResults'> {
  return {
    updatedTitle,
    priority,
    acceptedDiagnosticPatterns,
    auditContract: {
      evidenceId: `audit:item-213:${caseId.toLowerCase()}:${action}`,
      canonicalId: caseId,
      ruleId: `BR-${caseId}`,
      irId: caseId,
      recipeId: `generated:${caseId}`,
      route,
      state,
      action,
      overlay,
      uiAssertion,
      apiAssertion,
      safetyLevel,
      evidenceRefs: [
        `flows/product-center/item-216/${flowFile}`,
        'output/product-center-item-213-failures/failure-pack.md',
      ],
      freshObservationRequired: true,
    },
    canonicalExpectedResults: [uiAssertion],
  };
}
