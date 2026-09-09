# 商品中心商品测试用例逐条全审报告

- 审核方式：证据约束的逐条静态专家审核
- 总数：232
- 已逐条审核：232
- 审核通过：225
- 需要修订：0
- 来源/规则待确认：0
- 已废弃：7
- 待审核：0
- 下游生成允许：是
- 发布原则：不抽审、不部分放行；全部活动用例通过前禁止进入技术绑定或 Recipe。

## 问题分布


## source-confirmation-required（0）

## revision-required（0）

## approved（225）

### TC-ITEM-STD-037 不选择商品分类时标准商品创建成功

- 优先级：P0
- 来源：业务规则明确 ← BR-ITEM-022
- 审核结论：approved
- 自动化处置：technical-contract-required
- 维度：来源=pass；目标=pass；步骤=pass；预期=pass；重复=pass；当前规则=pass
- 问题：无
- 自动化前置：需要唯一测试数据、服务端 ID、清理适配器和零残留验证

### TC-ITEM-STD-036 标准商品仅填写必填项时创建成功

- 优先级：P0
- 来源：业务规则明确 ← BR-ITEM-028 / BR-ITEM-022 / BR-ITEM-027
- 审核结论：approved
- 自动化处置：technical-contract-required
- 维度：来源=pass；目标=pass；步骤=pass；预期=pass；重复=pass；当前规则=pass
- 问题：无
- 自动化前置：需要唯一测试数据、服务端 ID、清理适配器和零残留验证

### TC-ITEM-ADD-005 加料商品仅填写必填项时创建成功

- 优先级：P0
- 来源：业务规则明确 ← BR-ITEM-028 / BR-ITEM-022 / BR-ITEM-027
- 审核结论：approved
- 自动化处置：technical-contract-required
- 维度：来源=pass；目标=pass；步骤=pass；预期=pass；重复=pass；当前规则=pass
- 问题：无
- 自动化前置：需要唯一测试数据、服务端 ID、清理适配器和零残留验证

### TC-ITEM-PKG-009 套餐商品仅填写必填项时创建成功

- 优先级：P0
- 来源：业务规则明确 ← BR-ITEM-028 / BR-ITEM-022 / BR-ITEM-027
- 审核结论：approved
- 自动化处置：technical-contract-required
- 维度：来源=pass；目标=pass；步骤=pass；预期=pass；重复=pass；当前规则=pass
- 问题：无
- 自动化前置：需要唯一测试数据、服务端 ID、清理适配器和零残留验证

### TC-ITEM-STD-005 标准商品必填项缺失时创建失败

- 优先级：P0
- 来源：XMind已有 ← 标准商品 / 新增 / 必填项缺失 / 新建标准商品，必填项缺失，新建失败
- 审核结论：approved
- 自动化处置：technical-contract-required
- 维度：来源=pass；目标=pass；步骤=pass；预期=pass；重复=pass；当前规则=pass
- 问题：无
- 自动化前置：需要唯一测试数据、服务端 ID、清理适配器和零残留验证

### TC-ITEM-STD-038 标准价缺失时创建失败

- 优先级：P0
- 来源：业务规则明确 ← BR-ITEM-027
- 审核结论：approved
- 自动化处置：technical-contract-required
- 维度：来源=pass；目标=pass；步骤=pass；预期=pass；重复=pass；当前规则=pass
- 问题：无
- 自动化前置：需要唯一测试数据、服务端 ID、清理适配器和零残留验证

### TC-ITEM-STD-039 起售数量为空时保存失败

- 优先级：P0
- 来源：BR-ITEM-014
- 审核结论：approved
- 自动化处置：technical-contract-required
- 维度：来源=pass；目标=pass；步骤=pass；预期=pass；重复=pass；当前规则=pass
- 问题：无
- 自动化前置：需要唯一测试数据、服务端 ID、清理适配器和零残留验证

### TC-ITEM-ADD-006 加料商品必填项缺失时创建失败

- 优先级：P0
- 来源：业务规则明确 ← BR-ITEM-027
- 审核结论：approved
- 自动化处置：technical-contract-required
- 维度：来源=pass；目标=pass；步骤=pass；预期=pass；重复=pass；当前规则=pass
- 问题：无
- 自动化前置：需要唯一测试数据、服务端 ID、清理适配器和零残留验证

### TC-ITEM-ADD-008 加料商品标准价缺失时创建失败

- 优先级：P0
- 来源：业务规则明确 ← BR-ITEM-027
- 审核结论：approved
- 自动化处置：technical-contract-required
- 维度：来源=pass；目标=pass；步骤=pass；预期=pass；重复=pass；当前规则=pass
- 问题：无
- 自动化前置：需要唯一测试数据、服务端 ID、清理适配器和零残留验证

### TC-ITEM-PKG-010 套餐商品必填项缺失时创建失败

- 优先级：P0
- 来源：业务规则明确 ← BR-ITEM-010 商品名称对标准/套餐/加料统一必填；PRD明确 ← 5.1.1 套餐商品新增/编辑
- 审核结论：approved
- 自动化处置：technical-contract-required
- 维度：来源=pass；目标=pass；步骤=pass；预期=pass；重复=pass；当前规则=pass
- 问题：无
- 自动化前置：需要唯一测试数据、服务端 ID、清理适配器和零残留验证

### TC-ITEM-PKG-017 套餐商品标准价缺失时创建失败

- 优先级：P0
- 来源：业务规则明确 ← BR-ITEM-027
- 审核结论：approved
- 自动化处置：technical-contract-required
- 维度：来源=pass；目标=pass；步骤=pass；预期=pass；重复=pass；当前规则=pass
- 问题：无
- 自动化前置：需要唯一测试数据、服务端 ID、清理适配器和零残留验证

### TC-ITEM-STD-010 商品编码重复时创建失败并提示 BITEM-7003

- 优先级：P0
- 来源：BR-ITEM-013
- 审核结论：approved
- 自动化处置：technical-contract-required
- 维度：来源=pass；目标=pass；步骤=pass；预期=pass；重复=pass；当前规则=pass
- 问题：无
- 自动化前置：需要唯一测试数据、服务端 ID、清理适配器和零残留验证

### TC-ITEM-STD-011 同一一级分类下新建同名商品创建失败

- 优先级：P0
- 来源：XMind已有 ← 标准商品 / 新增 / 唯一性校验 / 同一个一级分类下，新建相同商品名称的商品，创建失败
- 审核结论：approved
- 自动化处置：technical-contract-required
- 维度：来源=pass；目标=pass；步骤=pass；预期=pass；重复=pass；当前规则=pass
- 问题：无
- 自动化前置：需要唯一测试数据、服务端 ID、清理适配器和零残留验证

### TC-ITEM-STD-013 同一二级分类下新建同名商品创建失败

- 优先级：P0
- 来源：XMind已有 ← 标准商品 / 新增 / 唯一性校验 / 同一个二级分类下，新建相同商品名称的商品，创建失败
- 审核结论：approved
- 自动化处置：technical-contract-required
- 维度：来源=pass；目标=pass；步骤=pass；预期=pass；重复=pass；当前规则=pass
- 问题：无
- 自动化前置：需要唯一测试数据、服务端 ID、清理适配器和零残留验证

### TC-ITEM-STD-014 同一商户下不同一级分类仍不可创建同名商品

- 优先级：P0
- 来源：BR-ITEM-010
- 审核结论：approved
- 自动化处置：technical-contract-required
- 维度：来源=pass；目标=pass；步骤=pass；预期=pass；重复=pass；当前规则=pass
- 问题：无
- 自动化前置：需要唯一测试数据、服务端 ID、清理适配器和零残留验证

### TC-ITEM-STD-093 商品名称首尾含空格时保存失败

- 优先级：P0
- 来源：BR-FMT-001、BR-ITEM-010
- 审核结论：approved
- 自动化处置：technical-contract-required
- 维度：来源=pass；目标=pass；步骤=pass；预期=pass；重复=pass；当前规则=pass
- 问题：无
- 自动化前置：需要唯一测试数据、服务端 ID、清理适配器和零残留验证

### TC-ITEM-ADD-014 加料商品同一一级分类下同名创建失败

- 优先级：P0
- 来源：BR-ITEM-010、BR-CAT-005
- 审核结论：approved
- 自动化处置：technical-contract-required
- 维度：来源=pass；目标=pass；步骤=pass；预期=pass；重复=pass；当前规则=pass
- 问题：无
- 自动化前置：需要唯一测试数据、服务端 ID、清理适配器和零残留验证

### TC-ITEM-ADD-047 加料商品名称首尾含空格时保存失败

- 优先级：P0
- 来源：BR-FMT-001、BR-ITEM-010
- 审核结论：approved
- 自动化处置：technical-contract-required
- 维度：来源=pass；目标=pass；步骤=pass；预期=pass；重复=pass；当前规则=pass
- 问题：无
- 自动化前置：需要唯一测试数据、服务端 ID、清理适配器和零残留验证

### TC-ITEM-STD-044 品牌内商品名称重复时创建失败

- 优先级：P0
- 来源：BR-ITEM-010、BR-CAT-005
- 审核结论：approved
- 自动化处置：technical-contract-required
- 维度：来源=pass；目标=pass；步骤=pass；预期=pass；重复=pass；当前规则=pass
- 问题：无
- 自动化前置：需要唯一测试数据、服务端 ID、清理适配器和零残留验证

### TC-ITEM-PKG-024 套餐商品同一一级分类下同名创建失败

- 优先级：P0
- 来源：BR-ITEM-010、BR-CAT-005
- 审核结论：approved
- 自动化处置：technical-contract-required
- 维度：来源=pass；目标=pass；步骤=pass；预期=pass；重复=pass；当前规则=pass
- 问题：无
- 自动化前置：需要唯一测试数据、服务端 ID、清理适配器和零残留验证

### TC-ITEM-PKG-025 套餐商品同商户同类型同名创建失败

- 优先级：P0
- 来源：BR-ITEM-010、BR-CAT-005
- 审核结论：approved
- 自动化处置：technical-contract-required
- 维度：来源=pass；目标=pass；步骤=pass；预期=pass；重复=pass；当前规则=pass
- 问题：无
- 自动化前置：需要唯一测试数据、服务端 ID、清理适配器和零残留验证

### TC-ITEM-PKG-076 套餐商品名称首尾含空格时保存失败

- 优先级：P0
- 来源：BR-FMT-001、BR-ITEM-010
- 审核结论：approved
- 自动化处置：technical-contract-required
- 维度：来源=pass；目标=pass；步骤=pass；预期=pass；重复=pass；当前规则=pass
- 问题：无
- 自动化前置：需要唯一测试数据、服务端 ID、清理适配器和零残留验证

### TC-ITEM-STD-016 多规格商品选择默认规格后创建成功且列表展示所有规格价格

- 优先级：P0
- 来源：XMind已有 ← 商品中心-商品管理测试用例 / 标准商品 / 新增 / 不同规格商品新建 / 新建价格为多规格商品，新建成功
- 审核结论：approved
- 自动化处置：technical-contract-required
- 维度：来源=pass；目标=pass；步骤=pass；预期=pass；重复=pass；当前规则=pass
- 问题：无
- 自动化前置：需要唯一测试数据、服务端 ID、清理适配器和零残留验证

### TC-ITEM-STD-017 多规格商品未选择默认规格时列表仍展示所有规格价格

- 优先级：P0
- 来源：XMind已有 ← 商品中心-商品管理测试用例 / 标准商品 / 新增 / 不同规格商品新建 / 新建价格为多规格商品，未选默认规格，新建成功
- 审核结论：approved
- 自动化处置：technical-contract-required
- 维度：来源=pass；目标=pass；步骤=pass；预期=pass；重复=pass；当前规则=pass
- 问题：无
- 自动化前置：需要唯一测试数据、服务端 ID、清理适配器和零残留验证

### TC-ITEM-STD-018 称重商品创建成功

- 优先级：P0
- 来源：XMind已有 ← 标准商品 / 新增 / 不同规格商品新建 / 新建称重商品，新建成功
- 审核结论：approved
- 自动化处置：technical-contract-required
- 维度：来源=pass；目标=pass；步骤=pass；预期=pass；重复=pass；当前规则=pass
- 问题：无
- 自动化前置：需要唯一测试数据、服务端 ID、清理适配器和零残留验证

### TC-ITEM-STD-022 起售数量输入0时保存失败并提示 SYSTEM-0001

- 优先级：P0
- 来源：BR-ITEM-014
- 审核结论：approved
- 自动化处置：technical-contract-required
- 维度：来源=pass；目标=pass；步骤=pass；预期=pass；重复=pass；当前规则=pass
- 问题：无
- 自动化前置：需要唯一测试数据、服务端 ID、清理适配器和零残留验证

### TC-ITEM-STD-047 多规格商品选择已有规格组后创建成功

- 优先级：P0
- 来源：业务规则明确 ← BR-ITEM-016
- 审核结论：approved
- 自动化处置：technical-contract-required
- 维度：来源=pass；目标=pass；步骤=pass；预期=pass；重复=pass；当前规则=pass
- 问题：无
- 自动化前置：需要唯一测试数据、服务端 ID、清理适配器和零残留验证

### TC-ITEM-STD-080 称重商品购买重量小于皮重时终端价格为 0

- 优先级：P0
- 来源：业务规则明确 ← BR-ITEM-015
- 审核结论：approved
- 自动化处置：technical-contract-required
- 维度：来源=pass；目标=pass；步骤=pass；预期=pass；重复=pass；当前规则=pass
- 问题：无
- 自动化前置：需要跨系统页面/API 证据和独立运行合同

### TC-ITEM-ADD-001 加料商品基础字段与标准商品一致且无起售数量

- 优先级：P0
- 来源：PRD明确 ← 5.1.1 加料商品基础字段范围；业务规则明确 ← BR-ITEM-003
- 审核结论：approved
- 自动化处置：technical-contract-required
- 维度：来源=pass；目标=pass；步骤=pass；预期=pass；重复=pass；当前规则=pass
- 问题：无
- 自动化前置：需要跨系统页面/API 证据和独立运行合同
- 自动化前置：需要唯一测试数据、服务端 ID、清理适配器和零残留验证

### TC-ITEM-ADD-029 加料商品创建页不展示多规格入口

- 优先级：P0
- 来源：BR-ITEM-003
- 审核结论：approved
- 自动化处置：technical-contract-required
- 维度：来源=pass；目标=pass；步骤=pass；预期=pass；重复=pass；当前规则=pass
- 问题：无
- 自动化前置：需要唯一测试数据、服务端 ID、清理适配器和零残留验证

### TC-ITEM-ADD-030 加料商品创建页不展示是否称重商品选项

- 优先级：P0
- 来源：BR-ITEM-003
- 审核结论：approved
- 自动化处置：technical-contract-required
- 维度：来源=pass；目标=pass；步骤=pass；预期=pass；重复=pass；当前规则=pass
- 问题：无
- 自动化前置：需要唯一测试数据、服务端 ID、清理适配器和零残留验证

### TC-ITEM-PKG-015 套餐商品起售数量为 0 时保存失败

- 优先级：P0
- 来源：BR-ITEM-014
- 审核结论：approved
- 自动化处置：technical-contract-required
- 维度：来源=pass；目标=pass；步骤=pass；预期=pass；重复=pass；当前规则=pass
- 问题：无
- 自动化前置：需要唯一测试数据、服务端 ID、清理适配器和零残留验证

### TC-ITEM-ADD-031 加料商品创建页不展示套餐组入口

- 优先级：P0
- 来源：BR-ITEM-003、BR-ITEM-004
- 审核结论：approved
- 自动化处置：technical-contract-required
- 维度：来源=pass；目标=pass；步骤=pass；预期=pass；重复=pass；当前规则=pass
- 问题：无
- 自动化前置：需要唯一测试数据、服务端 ID、清理适配器和零残留验证

### TC-ITEM-PKG-001 套餐商品基础字段与标准商品保持一致

- 优先级：P0
- 来源：PRD明确 ← 5.1.1 套餐商品基础字段范围
- 审核结论：approved
- 自动化处置：technical-contract-required
- 维度：来源=pass；目标=pass；步骤=pass；预期=pass；重复=pass；当前规则=pass
- 问题：无
- 自动化前置：需要跨系统页面/API 证据和独立运行合同
- 自动化前置：需要唯一测试数据、服务端 ID、清理适配器和零残留验证

### TC-ITEM-PKG-002 套餐商品可选择已有固定搭配套餐组

- 优先级：P0
- 来源：XMind已有 ← 套餐商品 / 套餐商品特有：添加套餐分组 / 选择已有套餐组 / 选择固定搭配
- 审核结论：approved
- 自动化处置：technical-contract-required
- 维度：来源=pass；目标=pass；步骤=pass；预期=pass；重复=pass；当前规则=pass
- 问题：无
- 自动化前置：需要唯一测试数据、服务端 ID、清理适配器和零残留验证

### TC-ITEM-PKG-004 套餐商品可选择已有组合搭配套餐组

- 优先级：P0
- 来源：XMind已有 ← 套餐商品 / 套餐商品特有：添加套餐分组 / 选择已有套餐组 / 选择组合搭配（可选搭配）
- 审核结论：approved
- 自动化处置：technical-contract-required
- 维度：来源=pass；目标=pass；步骤=pass；预期=pass；重复=pass；当前规则=pass
- 问题：无
- 自动化前置：需要唯一测试数据、服务端 ID、清理适配器和零残留验证

### TC-ITEM-PKG-007 套餐商品可新增可选搭配套餐组

- 优先级：P0
- 来源：PRD明确 ← 5.1.1 品牌商品 / 新增套餐 2、4；套餐组&加料组编辑 1、4、5；XMind已有 ← 套餐商品 / 新增套餐组 / 添加可选搭配
- 审核结论：approved
- 自动化处置：technical-contract-required
- 维度：来源=pass；目标=pass；步骤=pass；预期=pass；重复=pass；当前规则=pass
- 问题：无
- 自动化前置：需要唯一测试数据、服务端 ID、清理适配器和零残留验证

### TC-ITEM-PKG-026 套餐商品商品第二名称与商品名称互相不可重复

- 优先级：P0
- 来源：BR-ITEM-010、BR-ITEM-021、BR-CAT-005
- 审核结论：approved
- 自动化处置：technical-contract-required
- 维度：来源=pass；目标=pass；步骤=pass；预期=pass；重复=pass；当前规则=pass
- 问题：无
- 自动化前置：需要唯一测试数据、服务端 ID、清理适配器和零残留验证

### TC-ITEM-PKG-040 未选择套餐组时确认按钮不可点击

- 优先级：P0
- 来源：XMind已有 ← 套餐商品 / 选择已有套餐组
- 审核结论：approved
- 自动化处置：eligible-for-technical-binding-review
- 维度：来源=pass；目标=pass；步骤=pass；预期=pass；重复=pass；当前规则=pass
- 问题：无

### TC-ITEM-PKG-041 选择套餐组后确认按钮可点击并返回创建页

- 优先级：P0
- 来源：XMind已有 ← 套餐商品 / 选择已有套餐组
- 审核结论：approved
- 自动化处置：technical-contract-required
- 维度：来源=pass；目标=pass；步骤=pass；预期=pass；重复=pass；当前规则=pass
- 问题：无
- 自动化前置：需要唯一测试数据、服务端 ID、清理适配器和零残留验证

### TC-ITEM-PKG-046 套餐商品未添加套餐分组时保存与保存并新建均失败

- 优先级：P0
- 来源：产品确认明确 ← BR-ITEM-COMBO-GROUP-REQUIRED；页面截图证据 ← BITEM-6003：套餐中未找到区块
- 审核结论：approved
- 自动化处置：technical-contract-required
- 维度：来源=pass；目标=pass；步骤=pass；预期=pass；重复=pass；当前规则=pass
- 问题：无
- 自动化前置：需要唯一测试数据、服务端 ID、清理适配器和零残留验证

### TC-ITEM-PKG-074 套餐商品引用描述标签达 5 个后第 6 个不可选（本用例验证拦截场景）

- 优先级：P0
- 来源：业务规则明确 ← BR-ITEM-006
- 审核结论：approved
- 自动化处置：technical-contract-required
- 维度：来源=pass；目标=pass；步骤=pass；预期=pass；重复=pass；当前规则=pass
- 问题：无
- 自动化前置：需要唯一测试数据、服务端 ID、清理适配器和零残留验证

### TC-ITEM-PKG-075 套餐商品角标切换选择后仅保留最新一个角标

- 优先级：P0
- 来源：业务规则明确 ← 商品中心业务规则 §1 商品角标数量 0-1；PRD明确 ← 5.1.1 套餐商品其他设置
- 审核结论：approved
- 自动化处置：technical-contract-required
- 维度：来源=pass；目标=pass；步骤=pass；预期=pass；重复=pass；当前规则=pass
- 问题：无
- 自动化前置：需要唯一测试数据、服务端 ID、清理适配器和零残留验证

### TC-ITEM-PKG-039 菜单引用中的套餐商品不可停用

- 优先级：P0
- 来源：产品确认明确 ← BR-ITEM-MENU-REFERENCE-DISABLE-BLOCK；实时证据 ← output/audit/product-center-item-p0-remaining-w8-AUTO_AUDIT_P0_REMAINING_W8_20260731_05.json
- 审核结论：approved
- 自动化处置：technical-contract-required
- 维度：来源=pass；目标=pass；步骤=pass；预期=pass；重复=pass；当前规则=pass
- 问题：无
- 自动化前置：需要跨系统页面/API 证据和独立运行合同
- 自动化前置：需要唯一测试数据、服务端 ID、清理适配器和零残留验证

### TC-ITEM-PKG-047 套餐商品重置查询后页面恢复初始状态

- 优先级：P0
- 来源：BR-FMT-009
- 审核结论：approved
- 自动化处置：technical-contract-required
- 维度：来源=pass；目标=pass；步骤=pass；预期=pass；重复=pass；当前规则=pass
- 问题：无
- 自动化前置：需要唯一测试数据、服务端 ID、清理适配器和零残留验证

### TC-ITEM-STD-069 被套餐组引用的标准商品不可删除

- 优先级：P0
- 来源：BR-DEL-002
- 审核结论：approved
- 自动化处置：technical-contract-required
- 维度：来源=pass；目标=pass；步骤=pass；预期=pass；重复=pass；当前规则=pass
- 问题：无
- 自动化前置：需要唯一测试数据、服务端 ID、清理适配器和零残留验证

### TC-ITEM-PKG-037 套餐商品无引用时删除成功

- 优先级：P0
- 来源：BR-DEL-002 / BR-DEL-003 / BR-DEL-006、BR-DEL-011
- 审核结论：approved
- 自动化处置：technical-contract-required
- 维度：来源=pass；目标=pass；步骤=pass；预期=pass；重复=pass；当前规则=pass
- 问题：无
- 自动化前置：需要唯一测试数据、服务端 ID、清理适配器和零残留验证

### TC-ITEM-PKG-038 套餐商品被菜单引用时不可删除

- 优先级：P0
- 来源：BR-DEL-002 / BR-DEL-003
- 审核结论：approved
- 自动化处置：technical-contract-required
- 维度：来源=pass；目标=pass；步骤=pass；预期=pass；重复=pass；当前规则=pass
- 问题：无
- 自动化前置：需要唯一测试数据、服务端 ID、清理适配器和零残留验证

### TC-ITEM-PKG-008 套餐商品创建页展示基础信息与套餐组配置入口

- 优先级：P0
- 来源：PRD明确 ← 5.1.1 标准商品与套餐商品字段范围；套餐特有为添加套餐分组
- 审核结论：approved
- 自动化处置：technical-contract-required
- 维度：来源=pass；目标=pass；步骤=pass；预期=pass；重复=pass；当前规则=pass
- 问题：无
- 自动化前置：需要唯一测试数据、服务端 ID、清理适配器和零残留验证

### TC-ITEM-STD-002 商品列表展示当前筛选、核心字段和分页入口

- 优先级：P0
- 来源：产品确认明确 ← BR-ITEM-LIST-CURRENT-STRUCTURE；实时证据 ← output/audit/product-center-item-p0-w1-20260731/audit.json
- 审核结论：approved
- 自动化处置：technical-contract-required
- 维度：来源=pass；目标=pass；步骤=pass；预期=pass；重复=pass；当前规则=pass
- 问题：无
- 自动化前置：需要唯一测试数据、服务端 ID、清理适配器和零残留验证

### TC-ITEM-STD-028 商品列表支持按名称、类型、分类、状态组合查询

- 优先级：P0
- 来源：PRD明确 ← 5.1.1 品牌商品 / 商品列表页 / 查询条件；XMind已有 ← 标准商品 / 查询
- 审核结论：approved
- 自动化处置：technical-contract-required
- 维度：来源=pass；目标=pass；步骤=pass；预期=pass；重复=pass；当前规则=pass
- 问题：无
- 自动化前置：需要唯一测试数据、服务端 ID、清理适配器和零残留验证

### TC-ITEM-STD-029 重置查询后页面恢复初始状态

- 优先级：P0
- 来源：PRD明确 ← 5.1.1 品牌商品 / 商品列表页 / 查询条件 8-10；XMind已有 ← 标准商品 / 查询
- 审核结论：approved
- 自动化处置：technical-contract-required
- 维度：来源=pass；目标=pass；步骤=pass；预期=pass；重复=pass；当前规则=pass
- 问题：无
- 自动化前置：需要唯一测试数据、服务端 ID、清理适配器和零残留验证

### TC-ITEM-ADD-023 加料商品列表按名称类型分类状态组合查询成功

- 优先级：P0
- 来源：BR-FMT-009
- 审核结论：approved
- 自动化处置：technical-contract-required
- 维度：来源=pass；目标=pass；步骤=pass；预期=pass；重复=pass；当前规则=pass
- 问题：无
- 自动化前置：需要唯一测试数据、服务端 ID、清理适配器和零残留验证

### TC-ITEM-ADD-040 加料商品重置查询后页面恢复初始状态

- 优先级：P0
- 来源：BR-FMT-009
- 审核结论：approved
- 自动化处置：technical-contract-required
- 维度：来源=pass；目标=pass；步骤=pass；预期=pass；重复=pass；当前规则=pass
- 问题：无
- 自动化前置：需要唯一测试数据、服务端 ID、清理适配器和零残留验证

### TC-ITEM-STD-031 标准商品编辑基础信息后保存成功

- 优先级：P0
- 来源：PRD明确 ← 5.1.1 品牌商品 / 商品新增、编辑页面 / 标准商品新增编辑；XMind已有 ← 标准商品 / 编辑 / 基础信息编辑
- 审核结论：approved
- 自动化处置：technical-contract-required
- 维度：来源=pass；目标=pass；步骤=pass；预期=pass；重复=pass；当前规则=pass
- 问题：无
- 自动化前置：需要唯一测试数据、服务端 ID、清理适配器和零残留验证

### TC-ITEM-STD-032 标准商品内编辑口味组加价和默认选中仅对当前商品生效

- 优先级：P0
- 来源：BR-ITEM-031
- 审核结论：approved
- 自动化处置：technical-contract-required
- 维度：来源=pass；目标=pass；步骤=pass；预期=pass；重复=pass；当前规则=pass
- 问题：无
- 自动化前置：需要唯一测试数据、服务端 ID、清理适配器和零残留验证

### TC-ITEM-STD-087 标准商品内编辑做法组加价和默认选中仅对当前商品生效

- 优先级：P0
- 来源：BR-ITEM-031
- 审核结论：approved
- 自动化处置：technical-contract-required
- 维度：来源=pass；目标=pass；步骤=pass；预期=pass；重复=pass；当前规则=pass
- 问题：无
- 自动化前置：需要唯一测试数据、服务端 ID、清理适配器和零残留验证

### TC-ITEM-STD-088 标准商品内编辑加料组单次加价和默认选中仅对当前商品生效

- 优先级：P0
- 来源：BR-ITEM-031
- 审核结论：approved
- 自动化处置：technical-contract-required
- 维度：来源=pass；目标=pass；步骤=pass；预期=pass；重复=pass；当前规则=pass
- 问题：无
- 自动化前置：需要唯一测试数据、服务端 ID、清理适配器和零残留验证

### TC-ITEM-STD-092 点击商品名称进入编辑标准商品页加载成功

- 优先级：P0
- 来源：PRD明确 ← 5.1.1 品牌商品 / 商品新增、编辑页面 / 标准商品新增编辑；XMind已有 ← 标准商品 / 编辑 / 编辑页加载
- 审核结论：approved
- 自动化处置：technical-contract-required
- 维度：来源=pass；目标=pass；步骤=pass；预期=pass；重复=pass；当前规则=pass
- 问题：无
- 自动化前置：需要唯一测试数据、服务端 ID、清理适配器和零残留验证

### TC-ITEM-STD-096 编辑标准商品本地上传主图成功

- 优先级：P0
- 来源：PRD明确 ← 5.1.1 标准商品新增编辑及主图本地上传；业务规则明确 ← BR-ITEM-005
- 审核结论：approved
- 自动化处置：technical-contract-required
- 维度：来源=pass；目标=pass；步骤=pass；预期=pass；重复=pass；当前规则=pass
- 问题：无
- 自动化前置：需要唯一测试数据、服务端 ID、清理适配器和零残留验证

### TC-ITEM-ADD-024 加料商品编辑基础信息后保存成功

- 优先级：P0
- 来源：BR-ITEM-003
- 审核结论：approved
- 自动化处置：technical-contract-required
- 维度：来源=pass；目标=pass；步骤=pass；预期=pass；重复=pass；当前规则=pass
- 问题：无
- 自动化前置：需要唯一测试数据、服务端 ID、清理适配器和零残留验证

### TC-ITEM-ADD-032 加料商品创建页不展示商品属性编辑区

- 优先级：P0
- 来源：BR-ITEM-003、BR-ITEM-045
- 审核结论：approved
- 自动化处置：technical-contract-required
- 维度：来源=pass；目标=pass；步骤=pass；预期=pass；重复=pass；当前规则=pass
- 问题：无
- 自动化前置：需要唯一测试数据、服务端 ID、清理适配器和零残留验证

### TC-ITEM-STD-066 列表停用未被菜单引用的商品操作成功

- 优先级：P0
- 来源：BR-ITEM-050
- 审核结论：approved
- 自动化处置：technical-contract-required
- 维度：来源=pass；目标=pass；步骤=pass；预期=pass；重复=pass；当前规则=pass
- 问题：无
- 自动化前置：需要唯一测试数据、服务端 ID、清理适配器和零残留验证

### TC-ITEM-STD-067 菜单引用中的标准商品不可停用

- 优先级：P0
- 来源：产品确认明确 ← BR-ITEM-MENU-REFERENCE-DISABLE-BLOCK；实时证据 ← output/audit/product-center-item-p0-remaining-w8-AUTO_AUDIT_P0_REMAINING_W8_20260731_05.json
- 审核结论：approved
- 自动化处置：technical-contract-required
- 维度：来源=pass；目标=pass；步骤=pass；预期=pass；重复=pass；当前规则=pass
- 问题：无
- 自动化前置：需要跨系统页面/API 证据和独立运行合同
- 自动化前置：需要唯一测试数据、服务端 ID、清理适配器和零残留验证

### TC-ITEM-ADD-042 加料商品列表启用商品操作成功

- 优先级：P0
- 来源：BR-ITEM-050
- 审核结论：approved
- 自动化处置：technical-contract-required
- 维度：来源=pass；目标=pass；步骤=pass；预期=pass；重复=pass；当前规则=pass
- 问题：无
- 自动化前置：需要唯一测试数据、服务端 ID、清理适配器和零残留验证

### TC-ITEM-ADD-043 加料商品列表停用商品操作成功

- 优先级：P0
- 来源：BR-ITEM-050
- 审核结论：approved
- 自动化处置：technical-contract-required
- 维度：来源=pass；目标=pass；步骤=pass；预期=pass；重复=pass；当前规则=pass
- 问题：无
- 自动化前置：需要唯一测试数据、服务端 ID、清理适配器和零残留验证

### TC-ITEM-STD-068 无引用关系的标准商品删除成功

- 优先级：P0
- 来源：BR-DEL-002 / BR-DEL-003 / BR-DEL-006、BR-DEL-011
- 审核结论：approved
- 自动化处置：technical-contract-required
- 维度：来源=pass；目标=pass；步骤=pass；预期=pass；重复=pass；当前规则=pass
- 问题：无
- 自动化前置：需要唯一测试数据、服务端 ID、清理适配器和零残留验证

### TC-ITEM-STD-070 被菜单引用的标准商品不可删除

- 优先级：P0
- 来源：BR-DEL-002 / BR-DEL-003
- 审核结论：approved
- 自动化处置：technical-contract-required
- 维度：来源=pass；目标=pass；步骤=pass；预期=pass；重复=pass；当前规则=pass
- 问题：无
- 自动化前置：需要唯一测试数据、服务端 ID、清理适配器和零残留验证

### TC-ITEM-STD-075 商品列表删除操作展示确认文案

- 优先级：P0
- 来源：BR-DEL-011
- 审核结论：approved
- 自动化处置：technical-contract-required
- 维度：来源=pass；目标=pass；步骤=pass；预期=pass；重复=pass；当前规则=pass
- 问题：无
- 自动化前置：需要唯一测试数据、服务端 ID、清理适配器和零残留验证

### TC-ITEM-ADD-026 加料商品无引用时删除成功

- 优先级：P0
- 来源：BR-DEL-002 / BR-DEL-003 / BR-DEL-006、BR-DEL-011
- 审核结论：approved
- 自动化处置：technical-contract-required
- 维度：来源=pass；目标=pass；步骤=pass；预期=pass；重复=pass；当前规则=pass
- 问题：无
- 自动化前置：需要唯一测试数据、服务端 ID、清理适配器和零残留验证

### TC-ITEM-ADD-027 加料商品被加料组引用且组被商品引用时不可删除

- 优先级：P0
- 来源：BR-DEL-006
- 审核结论：approved
- 自动化处置：technical-contract-required
- 维度：来源=pass；目标=pass；步骤=pass；预期=pass；重复=pass；当前规则=pass
- 问题：无
- 自动化前置：需要唯一测试数据、服务端 ID、清理适配器和零残留验证

### TC-ITEM-ADD-028 加料商品被菜单引用时不可删除

- 优先级：P0
- 来源：BR-DEL-002 / BR-DEL-003
- 审核结论：approved
- 自动化处置：technical-contract-required
- 维度：来源=pass；目标=pass；步骤=pass；预期=pass；重复=pass；当前规则=pass
- 问题：无
- 自动化前置：需要唯一测试数据、服务端 ID、清理适配器和零残留验证

### TC-ITEM-ADD-034 标准商品引用含该加料的加料组后加料商品不可删除

- 优先级：P0
- 来源：BR-DEL-006
- 审核结论：approved
- 自动化处置：technical-contract-required
- 维度：来源=pass；目标=pass；步骤=pass；预期=pass；重复=pass；当前规则=pass
- 问题：无
- 自动化前置：需要唯一测试数据、服务端 ID、清理适配器和零残留验证

### TC-ITEM-ADD-036 加料商品列表删除操作展示确认文案

- 优先级：P0
- 来源：BR-DEL-011
- 审核结论：approved
- 自动化处置：technical-contract-required
- 维度：来源=pass；目标=pass；步骤=pass；预期=pass；重复=pass；当前规则=pass
- 问题：无
- 自动化前置：需要唯一测试数据、服务端 ID、清理适配器和零残留验证

### TC-ITEM-STD-081 详情图重复引用同一张图片保存失败并提示 BITEM-3006

- 优先级：P0
- 来源：业务规则明确 ← BR-ITEM-005
- 审核结论：approved
- 自动化处置：technical-contract-required
- 维度：来源=pass；目标=pass；步骤=pass；预期=pass；重复=pass；当前规则=pass
- 问题：无
- 自动化前置：需要唯一测试数据、服务端 ID、清理适配器和零残留验证

### TC-ITEM-STD-082 标准商品绑定多个打印档口保存成功

- 优先级：P0
- 来源：业务规则明确 ← 商品中心业务规则 §1、§22 打印档口
- 审核结论：approved
- 自动化处置：technical-contract-required
- 维度：来源=pass；目标=pass；步骤=pass；预期=pass；重复=pass；当前规则=pass
- 问题：无
- 自动化前置：需要唯一测试数据、服务端 ID、清理适配器和零残留验证

### TC-ITEM-STD-090 标准商品引用描述标签达 5 个后第 6 个不可选（本用例验证拦截场景）

- 优先级：P0
- 来源：业务规则明确 ← BR-ITEM-006
- 审核结论：approved
- 自动化处置：technical-contract-required
- 维度：来源=pass；目标=pass；步骤=pass；预期=pass；重复=pass；当前规则=pass
- 问题：无
- 自动化前置：需要唯一测试数据、服务端 ID、清理适配器和零残留验证

### TC-ITEM-STD-091 标准商品商品角标切换选择后仅保留最新一个角标

- 优先级：P0
- 来源：业务规则明确 ← 可推导 ← 商品中心业务规则 §1 商品角标 0-1；PRD 5.1.1 角标单选；标签管理待补充跨模块 v1.1
- 审核结论：approved
- 自动化处置：technical-contract-required
- 维度：来源=pass；目标=pass；步骤=pass；预期=pass；重复=pass；当前规则=pass
- 问题：无
- 自动化前置：需要唯一测试数据、服务端 ID、清理适配器和零残留验证

### TC-ITEM-ADD-046 加料商品不能同时保留超过 5 个描述标签

- 优先级：P0
- 来源：业务规则明确 ← 商品中心业务规则 §1 描述标签数量 0-5；PRD明确 ← 5.1.1 加料商品其他设置
- 审核结论：approved
- 自动化处置：eligible-for-technical-binding-review
- 维度：来源=pass；目标=pass；步骤=pass；预期=pass；重复=pass；当前规则=pass
- 问题：无

### TC-ITEM-STD-008 商品名称最多 100 字符且连续空格不可保存

- 优先级：P0
- 来源：产品确认明确 ← BR-ITEM-NAME-CURRENT-BOUNDARY；实时证据 ← output/audit/product-center-item-p0-remaining-w4-AUTO_AUDIT_P0_REMAINING_W4_20260731_09.json
- 审核结论：approved
- 自动化处置：technical-contract-required
- 维度：来源=pass；目标=pass；步骤=pass；预期=pass；重复=pass；当前规则=pass
- 问题：无
- 自动化前置：需要唯一测试数据、服务端 ID、清理适配器和零残留验证

### TC-ITEM-STD-057 标准商品引用口味组整组后保存成功

- 优先级：P0
- 来源：BR-ITEM-030
- 审核结论：approved
- 自动化处置：technical-contract-required
- 维度：来源=pass；目标=pass；步骤=pass；预期=pass；重复=pass；当前规则=pass
- 问题：无
- 自动化前置：需要唯一测试数据、服务端 ID、清理适配器和零残留验证

### TC-ITEM-STD-058 标准商品引用做法组与加料组整组后保存成功

- 优先级：P0
- 来源：BR-ITEM-030
- 审核结论：approved
- 自动化处置：technical-contract-required
- 维度：来源=pass；目标=pass；步骤=pass；预期=pass；重复=pass；当前规则=pass
- 问题：无
- 自动化前置：需要唯一测试数据、服务端 ID、清理适配器和零残留验证

### TC-ITEM-STD-043 商品第二名称与商品名称互相不可重复

- 优先级：P0
- 来源：BR-ITEM-010、BR-ITEM-021、BR-CAT-005
- 审核结论：approved
- 自动化处置：technical-contract-required
- 维度：来源=pass；目标=pass；步骤=pass；预期=pass；重复=pass；当前规则=pass
- 问题：无
- 自动化前置：需要唯一测试数据、服务端 ID、清理适配器和零残留验证

### TC-ITEM-STD-089 标准商品内同一选项组仅允许一个默认选中子项

- 优先级：P0
- 来源：BR-ITEM-031
- 审核结论：approved
- 自动化处置：technical-contract-required
- 维度：来源=pass；目标=pass；步骤=pass；预期=pass；重复=pass；当前规则=pass
- 问题：无
- 自动化前置：需要唯一测试数据、服务端 ID、清理适配器和零残留验证

### TC-ITEM-ADD-016 加料商品商品第二名称与商品名称互相不可重复

- 优先级：P0
- 来源：BR-ITEM-010、BR-ITEM-021、BR-CAT-005
- 审核结论：approved
- 自动化处置：technical-contract-required
- 维度：来源=pass；目标=pass；步骤=pass；预期=pass；重复=pass；当前规则=pass
- 问题：无
- 自动化前置：需要唯一测试数据、服务端 ID、清理适配器和零残留验证

### TC-ITEM-STD-001 标准商品创建页展示商品类型入口与核心配置模块

- 优先级：P0
- 来源：ui-observed ← 认证只读页面审计 2026-07-30 ← /pp/brand/create/standard
- 审核结论：approved
- 自动化处置：technical-contract-required
- 维度：来源=pass；目标=pass；步骤=pass；预期=pass；重复=pass；当前规则=pass
- 问题：无
- 自动化前置：需要唯一测试数据、服务端 ID、清理适配器和零残留验证

### TC-ITEM-STD-094 POS名称首尾含空格时保存失败

- 优先级：P1
- 来源：BR-FMT-001
- 审核结论：approved
- 自动化处置：technical-contract-required
- 维度：来源=pass；目标=pass；步骤=pass；预期=pass；重复=pass；当前规则=pass
- 问题：无
- 自动化前置：需要跨系统页面/API 证据和独立运行合同
- 自动化前置：需要唯一测试数据、服务端 ID、清理适配器和零残留验证

### TC-ITEM-STD-015 单规格商品标准价为0时创建成功

- 优先级：P1
- 来源：XMind已有 ← 标准商品 / 新增 / 不同规格商品新建 / 新建价格为0的单规格商品，新建成功
- 审核结论：approved
- 自动化处置：technical-contract-required
- 维度：来源=pass；目标=pass；步骤=pass；预期=pass；重复=pass；当前规则=pass
- 问题：无
- 自动化前置：需要唯一测试数据、服务端 ID、清理适配器和零残留验证

### TC-ITEM-STD-019 称重商品销售单位下拉展示 g、kg、ml

- 优先级：P1
- 来源：BR-ITEM-015
- 审核结论：approved
- 自动化处置：eligible-for-technical-binding-review
- 维度：来源=pass；目标=pass；步骤=pass；预期=pass；重复=pass；当前规则=pass
- 问题：无

### TC-ITEM-STD-020 单规格商品标准价为1.99时创建成功

- 优先级：P1
- 来源：XMind已有 ← 标准商品 / 新增 / 默认值，输入框验证 / 新建价格为1.99的单规格商品，新建成功
- 审核结论：approved
- 自动化处置：technical-contract-required
- 维度：来源=pass；目标=pass；步骤=pass；预期=pass；重复=pass；当前规则=pass
- 问题：无
- 自动化前置：需要唯一测试数据、服务端 ID、清理适配器和零残留验证

### TC-ITEM-STD-024 起售数量大于1时创建成功且C端默认点单数量为起售数量

- 优先级：P1
- 来源：XMind已有 ← 标准商品 / 新增 / 默认值，输入框验证 / 新建起售数量大于1的商品，新建成功，在C端的点单页面，默认的数量为起售数量
- 审核结论：approved
- 自动化处置：technical-contract-required
- 维度：来源=pass；目标=pass；步骤=pass；预期=pass；重复=pass；当前规则=pass
- 问题：无
- 自动化前置：需要跨系统页面/API 证据和独立运行合同
- 自动化前置：需要唯一测试数据、服务端 ID、清理适配器和零残留验证

### TC-ITEM-STD-048 多规格商品点击去创建可跳转规格组新增页

- 优先级：P1
- 来源：BR-ITEM-016、BR-ITEM-041
- 审核结论：approved
- 自动化处置：technical-contract-required
- 维度：来源=pass；目标=pass；步骤=pass；预期=pass；重复=pass；当前规则=pass
- 问题：无
- 自动化前置：需要唯一测试数据、服务端 ID、清理适配器和零残留验证

### TC-ITEM-STD-049 选择多规格后是否称重商品置灰不可选

- 优先级：P1
- 来源：BR-ITEM-016、BR-ITEM-042
- 审核结论：approved
- 自动化处置：eligible-for-technical-binding-review
- 维度：来源=pass；目标=pass；步骤=pass；预期=pass；重复=pass；当前规则=pass
- 问题：无

### TC-ITEM-STD-050 单规格商品包装费合法输入时保存成功

- 优先级：P1
- 来源：BR-FMT-005
- 审核结论：approved
- 自动化处置：technical-contract-required
- 维度：来源=pass；目标=pass；步骤=pass；预期=pass；重复=pass；当前规则=pass
- 问题：无
- 自动化前置：需要唯一测试数据、服务端 ID、清理适配器和零残留验证

### TC-ITEM-STD-083 多规格商品默认规格下发后终端点餐默认选中该规格

- 优先级：P1
- 来源：业务规则明确 ← BR-ITEM-016
- 审核结论：approved
- 自动化处置：technical-contract-required
- 维度：来源=pass；目标=pass；步骤=pass；预期=pass；重复=pass；当前规则=pass
- 问题：无
- 自动化前置：需要跨系统页面/API 证据和独立运行合同

### TC-ITEM-STD-084 称重商品销售单位切换 g、kg、ml 后保存成功

- 优先级：P1
- 来源：BR-ITEM-015
- 审核结论：approved
- 自动化处置：technical-contract-required
- 维度：来源=pass；目标=pass；步骤=pass；预期=pass；重复=pass；当前规则=pass
- 问题：无
- 自动化前置：需要唯一测试数据、服务端 ID、清理适配器和零残留验证

### TC-ITEM-STD-085 多规格商品拖动调整规格顺序后保存成功

- 优先级：P1
- 来源：业务规则明确 ← BR-ITEM-016
- 审核结论：approved
- 自动化处置：technical-contract-required
- 维度：来源=pass；目标=pass；步骤=pass；预期=pass；重复=pass；当前规则=pass
- 问题：无
- 自动化前置：需要唯一测试数据、服务端 ID、清理适配器和零残留验证

### TC-ITEM-STD-098 单规格商品成本合法输入时保存成功

- 优先级：P1
- 来源：BR-FMT-005
- 审核结论：approved
- 自动化处置：technical-contract-required
- 维度：来源=pass；目标=pass；步骤=pass；预期=pass；重复=pass；当前规则=pass
- 问题：无
- 自动化前置：需要唯一测试数据、服务端 ID、清理适配器和零残留验证

### TC-ITEM-ADD-011 加料商品包装费合法输入时保存成功

- 优先级：P1
- 来源：BR-FMT-005
- 审核结论：approved
- 自动化处置：technical-contract-required
- 维度：来源=pass；目标=pass；步骤=pass；预期=pass；重复=pass；当前规则=pass
- 问题：无
- 自动化前置：需要唯一测试数据、服务端 ID、清理适配器和零残留验证

### TC-ITEM-ADD-049 加料商品成本合法输入时保存成功

- 优先级：P1
- 来源：BR-FMT-005
- 审核结论：approved
- 自动化处置：technical-contract-required
- 维度：来源=pass；目标=pass；步骤=pass；预期=pass；重复=pass；当前规则=pass
- 问题：无
- 自动化前置：需要唯一测试数据、服务端 ID、清理适配器和零残留验证

### TC-ITEM-PKG-014 套餐商品起售数量默认值为 1

- 优先级：P1
- 来源：BR-ITEM-014
- 审核结论：approved
- 自动化处置：eligible-for-technical-binding-review
- 维度：来源=pass；目标=pass；步骤=pass；预期=pass；重复=pass；当前规则=pass
- 问题：无

### TC-ITEM-PKG-016 套餐商品起售数量大于 1 时创建成功

- 优先级：P1
- 来源：BR-ITEM-014
- 审核结论：approved
- 自动化处置：technical-contract-required
- 维度：来源=pass；目标=pass；步骤=pass；预期=pass；重复=pass；当前规则=pass
- 问题：无
- 自动化前置：需要唯一测试数据、服务端 ID、清理适配器和零残留验证

### TC-ITEM-PKG-020 套餐商品包装费合法输入时保存成功

- 优先级：P1
- 来源：BR-FMT-005
- 审核结论：approved
- 自动化处置：technical-contract-required
- 维度：来源=pass；目标=pass；步骤=pass；预期=pass；重复=pass；当前规则=pass
- 问题：无
- 自动化前置：需要唯一测试数据、服务端 ID、清理适配器和零残留验证

### TC-ITEM-PKG-051 套餐商品创建页不展示多规格与称重相关入口

- 优先级：P1
- 来源：PRD明确 ← 5.1.1 套餐商品字段范围
- 审核结论：approved
- 自动化处置：technical-contract-required
- 维度：来源=pass；目标=pass；步骤=pass；预期=pass；重复=pass；当前规则=pass
- 问题：无
- 自动化前置：需要唯一测试数据、服务端 ID、清理适配器和零残留验证

### TC-ITEM-UI-005 勾选商品后批量操作菜单提供销售信息价格与属性入口

- 优先级：P1
- 来源：ui-observed ← 只读页面审计 2026-07-30 ← /pp/brand/list
- 审核结论：approved
- 自动化处置：technical-contract-required
- 维度：来源=pass；目标=pass；步骤=pass；预期=pass；重复=pass；当前规则=pass
- 问题：无
- 自动化前置：需要唯一测试数据、服务端 ID、清理适配器和零残留验证

### TC-ITEM-PKG-077 套餐商品标准价输入非数字时创建失败

- 优先级：P1
- 来源：业务规则明确 ← BR-FMT-005
- 审核结论：approved
- 自动化处置：technical-contract-required
- 维度：来源=pass；目标=pass；步骤=pass；预期=pass；重复=pass；当前规则=pass
- 问题：无
- 自动化前置：需要唯一测试数据、服务端 ID、清理适配器和零残留验证

### TC-ITEM-STD-079 标准商品创建页不支持添加套餐组

- 优先级：P1
- 来源：业务规则明确 ← BR-ITEM-004
- 审核结论：approved
- 自动化处置：technical-contract-required
- 维度：来源=pass；目标=pass；步骤=pass；预期=pass；重复=pass；当前规则=pass
- 问题：无
- 自动化前置：需要唯一测试数据、服务端 ID、清理适配器和零残留验证

### TC-ITEM-PKG-005 套餐商品其他设置与标准商品一致

- 优先级：P1
- 来源：业务规则明确 ← BR-ITEM-005 / BR-ITEM-006 / BR-MAT-002；XMind已有 ← 套餐商品其他设置与标准商品一致
- 审核结论：approved
- 自动化处置：eligible-for-technical-binding-review
- 维度：来源=pass；目标=pass；步骤=pass；预期=pass；重复=pass；当前规则=pass
- 问题：无

### TC-ITEM-PKG-011 套餐商品不选择分类时创建成功

- 优先级：P1
- 来源：业务规则明确 ← BR-ITEM-022
- 审核结论：approved
- 自动化处置：technical-contract-required
- 维度：来源=pass；目标=pass；步骤=pass；预期=pass；重复=pass；当前规则=pass
- 问题：无
- 自动化前置：需要唯一测试数据、服务端 ID、清理适配器和零残留验证

### TC-ITEM-PKG-012 一级分类下无二级分类时套餐可直接创建成功

- 优先级：P1
- 来源：业务规则明确 ← BR-ITEM-022 / BR-CAT-006
- 审核结论：approved
- 自动化处置：technical-contract-required
- 维度：来源=pass；目标=pass；步骤=pass；预期=pass；重复=pass；当前规则=pass
- 问题：无
- 自动化前置：需要唯一测试数据、服务端 ID、清理适配器和零残留验证

### TC-ITEM-PKG-018 套餐商品标准价为 0 时创建成功

- 优先级：P1
- 来源：BR-FMT-005
- 审核结论：approved
- 自动化处置：technical-contract-required
- 维度：来源=pass；目标=pass；步骤=pass；预期=pass；重复=pass；当前规则=pass
- 问题：无
- 自动化前置：需要唯一测试数据、服务端 ID、清理适配器和零残留验证

### TC-ITEM-PKG-022 套餐商品 POS 名称和送厨名称超长及特殊字符保存后自动格式化

- 优先级：P1
- 来源：BR-FMT-001、BR-ITEM-010
- 审核结论：approved
- 自动化处置：technical-contract-required
- 维度：来源=pass；目标=pass；步骤=pass；预期=pass；重复=pass；当前规则=pass
- 问题：无
- 自动化前置：需要跨系统页面/API 证据和独立运行合同
- 自动化前置：需要唯一测试数据、服务端 ID、清理适配器和零残留验证

### TC-ITEM-PKG-027 套餐商品描述达到500字符后输入框不可继续录入

- 优先级：P1
- 来源：BR-FMT-003
- 审核结论：approved
- 自动化处置：technical-contract-required
- 维度：来源=pass；目标=pass；步骤=pass；预期=pass；重复=pass；当前规则=pass
- 问题：无
- 自动化前置：需要唯一测试数据、服务端 ID、清理适配器和零残留验证

### TC-ITEM-PKG-029 套餐商品描述标签多选保存成功

- 优先级：P1
- 来源：业务规则明确 ← BR-ITEM-006
- 审核结论：approved
- 自动化处置：technical-contract-required
- 维度：来源=pass；目标=pass；步骤=pass；预期=pass；重复=pass；当前规则=pass
- 问题：无
- 自动化前置：需要唯一测试数据、服务端 ID、清理适配器和零残留验证

### TC-ITEM-PKG-030 套餐商品商品角标单选保存成功

- 优先级：P1
- 来源：业务规则明确 ← BR-ITEM-006
- 审核结论：approved
- 自动化处置：technical-contract-required
- 维度：来源=pass；目标=pass；步骤=pass；预期=pass；重复=pass；当前规则=pass
- 问题：无
- 自动化前置：需要唯一测试数据、服务端 ID、清理适配器和零残留验证

### TC-ITEM-PKG-031 套餐商品统计标签多选保存成功

- 优先级：P1
- 来源：业务规则明确 ← BR-ITEM-006
- 审核结论：approved
- 自动化处置：technical-contract-required
- 维度：来源=pass；目标=pass；步骤=pass；预期=pass；重复=pass；当前规则=pass
- 问题：无
- 自动化前置：需要唯一测试数据、服务端 ID、清理适配器和零残留验证

### TC-ITEM-PKG-032 套餐商品配置材料信息后保存成功

- 优先级：P1
- 来源：业务规则明确 ← BR-MAT-002
- 审核结论：approved
- 自动化处置：technical-contract-required
- 维度：来源=pass；目标=pass；步骤=pass；预期=pass；重复=pass；当前规则=pass
- 问题：无
- 自动化前置：需要唯一测试数据、服务端 ID、清理适配器和零残留验证

### TC-ITEM-PKG-033 套餐商品从图片库选择主图后创建成功

- 优先级：P1
- 来源：业务规则明确 ← BR-ITEM-005
- 审核结论：approved
- 自动化处置：technical-contract-required
- 维度：来源=pass；目标=pass；步骤=pass；预期=pass；重复=pass；当前规则=pass
- 问题：无
- 自动化前置：需要唯一测试数据、服务端 ID、清理适配器和零残留验证

### TC-ITEM-PKG-042 已选固定搭配套餐组可从右侧移除

- 优先级：P1
- 来源：XMind已有 ← 套餐商品 / 选择已有套餐组 / 选择固定搭配
- 审核结论：approved
- 自动化处置：eligible-for-technical-binding-review
- 维度：来源=pass；目标=pass；步骤=pass；预期=pass；重复=pass；当前规则=pass
- 问题：无

### TC-ITEM-PKG-043 已选组合搭配套餐组可从右侧移除

- 优先级：P1
- 来源：XMind已有 ← 套餐商品 / 选择已有套餐组 / 选择组合搭配
- 审核结论：approved
- 自动化处置：eligible-for-technical-binding-review
- 维度：来源=pass；目标=pass；步骤=pass；预期=pass；重复=pass；当前规则=pass
- 问题：无

### TC-ITEM-PKG-049 套餐商品同时引用已有固定搭配与可选搭配组

- 优先级：P1
- 来源：PRD明确 ← 新增套餐
- 审核结论：approved
- 自动化处置：technical-contract-required
- 维度：来源=pass；目标=pass；步骤=pass；预期=pass；重复=pass；当前规则=pass
- 问题：无
- 自动化前置：需要唯一测试数据、服务端 ID、清理适配器和零残留验证

### TC-ITEM-PKG-057 套餐商品通过选择入口引用已有可选搭配组

- 优先级：P1
- 来源：运行审计接受 ← flows/product-center/item-216/package-item-216.flow.ts；output/product-center-item-213-failures/failure-pack.md
- 审核结论：approved
- 自动化处置：technical-contract-required
- 维度：来源=pass；目标=pass；步骤=pass；预期=pass；重复=pass；当前规则=pass
- 问题：无
- 自动化前置：需要唯一测试数据、服务端 ID、清理适配器和零残留验证

### TC-ITEM-PKG-058 套餐商品回显已有可选搭配组规则摘要

- 优先级：P1
- 来源：运行审计接受 ← flows/product-center/item-216/package-item-216.flow.ts；output/product-center-item-213-failures/failure-pack.md
- 审核结论：approved
- 自动化处置：eligible-for-technical-binding-review
- 维度：来源=pass；目标=pass；步骤=pass；预期=pass；重复=pass；当前规则=pass
- 问题：无

### TC-ITEM-PKG-073 套餐商品内没有选项组默认选中子项配置入口

- 优先级：P1
- 来源：金将军人工处理确认 ← output\product-center-item-213-failures\failure-pack.md#tc-item-pkg-073
- 审核结论：approved
- 自动化处置：technical-contract-required
- 维度：来源=pass；目标=pass；步骤=pass；预期=pass；重复=pass；当前规则=pass
- 问题：无
- 自动化前置：需要唯一测试数据、服务端 ID、清理适配器和零残留验证

### TC-ITEM-PKG-003 套餐商品可按名称搜索固定搭配套餐组

- 优先级：P1
- 来源：XMind已有 ← 套餐商品 / 套餐商品特有：添加套餐分组 / 选择已有套餐组 / 选择固定搭配 / 按套餐组名称搜索
- 审核结论：approved
- 自动化处置：eligible-for-technical-binding-review
- 维度：来源=pass；目标=pass；步骤=pass；预期=pass；重复=pass；当前规则=pass
- 问题：无

### TC-ITEM-PKG-044 组合搭配套餐组按名称模糊搜索成功

- 优先级：P1
- 来源：XMind已有 ← 套餐商品 / 选择已有套餐组 / 选择组合搭配 / 搜索
- 审核结论：approved
- 自动化处置：eligible-for-technical-binding-review
- 维度：来源=pass；目标=pass；步骤=pass；预期=pass；重复=pass；当前规则=pass
- 问题：无

### TC-ITEM-PKG-045 组合搭配套餐组清空搜索条件后恢复默认列表

- 优先级：P1
- 来源：XMind已有 ← 套餐商品 / 选择已有套餐组 / 选择组合搭配 / 搜索
- 审核结论：approved
- 自动化处置：eligible-for-technical-binding-review
- 维度：来源=pass；目标=pass；步骤=pass；预期=pass；重复=pass；当前规则=pass
- 问题：无

### TC-ITEM-PKG-056 组合搭配套餐组按名称精确搜索成功

- 优先级：P1
- 来源：XMind已有 ← 套餐商品 / 选择已有套餐组 / 选择组合搭配 / 搜索
- 审核结论：approved
- 自动化处置：eligible-for-technical-binding-review
- 维度：来源=pass；目标=pass；步骤=pass；预期=pass；重复=pass；当前规则=pass
- 问题：无

### TC-ITEM-PKG-036 套餐商品编辑其他信息后保存成功

- 优先级：P1
- 来源：业务规则明确 ← BR-ITEM-005 / BR-ITEM-006
- 审核结论：approved
- 自动化处置：technical-contract-required
- 维度：来源=pass；目标=pass；步骤=pass；预期=pass；重复=pass；当前规则=pass
- 问题：无
- 自动化前置：需要唯一测试数据、服务端 ID、清理适配器和零残留验证

### TC-ITEM-PKG-059 套餐商品编辑页可选搭配组仅支持组级操作

- 优先级：P1
- 来源：运行审计接受 ← flows/product-center/item-216/package-item-216.flow.ts；output/product-center-item-213-failures/failure-pack.md
- 审核结论：approved
- 自动化处置：technical-contract-required
- 维度：来源=pass；目标=pass；步骤=pass；预期=pass；重复=pass；当前规则=pass
- 问题：无
- 自动化前置：需要唯一测试数据、服务端 ID、清理适配器和零残留验证

### TC-ITEM-PKG-069 套餐商品内不提供口味组加价和默认选中编辑

- 优先级：P1
- 来源：金将军人工处理确认 ← output\product-center-item-213-failures\failure-pack.md#tc-item-pkg-069
- 审核结论：approved
- 自动化处置：technical-contract-required
- 维度：来源=pass；目标=pass；步骤=pass；预期=pass；重复=pass；当前规则=pass
- 问题：无
- 自动化前置：需要唯一测试数据、服务端 ID、清理适配器和零残留验证

### TC-ITEM-PKG-071 套餐商品内不提供做法组加价和默认选中编辑

- 优先级：P1
- 来源：金将军人工处理确认 ← output\product-center-item-213-failures\failure-pack.md#tc-item-pkg-071
- 审核结论：approved
- 自动化处置：technical-contract-required
- 维度：来源=pass；目标=pass；步骤=pass；预期=pass；重复=pass；当前规则=pass
- 问题：无
- 自动化前置：需要唯一测试数据、服务端 ID、清理适配器和零残留验证

### TC-ITEM-PKG-072 套餐商品内不提供加料组加价和默认选中编辑

- 优先级：P1
- 来源：金将军人工处理确认 ← output\product-center-item-213-failures\failure-pack.md#tc-item-pkg-072
- 审核结论：approved
- 自动化处置：technical-contract-required
- 维度：来源=pass；目标=pass；步骤=pass；预期=pass；重复=pass；当前规则=pass
- 问题：无
- 自动化前置：需要唯一测试数据、服务端 ID、清理适配器和零残留验证

### TC-ITEM-PKG-034 套餐商品列表按名称类型分类状态组合查询成功

- 优先级：P1
- 来源：BR-FMT-009
- 审核结论：approved
- 自动化处置：technical-contract-required
- 维度：来源=pass；目标=pass；步骤=pass；预期=pass；重复=pass；当前规则=pass
- 问题：无
- 自动化前置：需要唯一测试数据、服务端 ID、清理适配器和零残留验证

### TC-ITEM-PKG-060 套餐商品状态变更后需下发到门店终端才生效

- 优先级：P1
- 来源：BR-ARCH-004、BR-ITEM-050
- 审核结论：approved
- 自动化处置：technical-contract-required
- 维度：来源=pass；目标=pass；步骤=pass；预期=pass；重复=pass；当前规则=pass
- 问题：无
- 自动化前置：需要跨系统页面/API 证据和独立运行合同

### TC-ITEM-PKG-061 套餐商品列表启用商品操作成功

- 优先级：P1
- 来源：BR-ITEM-050
- 审核结论：approved
- 自动化处置：technical-contract-required
- 维度：来源=pass；目标=pass；步骤=pass；预期=pass；重复=pass；当前规则=pass
- 问题：无
- 自动化前置：需要唯一测试数据、服务端 ID、清理适配器和零残留验证

### TC-ITEM-PKG-062 套餐商品列表停用未被菜单引用的商品操作成功

- 优先级：P1
- 来源：BR-ITEM-050
- 审核结论：approved
- 自动化处置：technical-contract-required
- 维度：来源=pass；目标=pass；步骤=pass；预期=pass；重复=pass；当前规则=pass
- 问题：无
- 自动化前置：需要唯一测试数据、服务端 ID、清理适配器和零残留验证

### TC-ITEM-PKG-070 套餐必选子项停用后终端不可正常点单

- 优先级：P1
- 来源：业务规则明确 ← BR-POS-003
- 审核结论：approved
- 自动化处置：technical-contract-required
- 维度：来源=pass；目标=pass；步骤=pass；预期=pass；重复=pass；当前规则=pass
- 问题：无
- 自动化前置：需要跨系统页面/API 证据和独立运行合同
- 自动化前置：需要唯一测试数据、服务端 ID、清理适配器和零残留验证

### TC-ITEM-PKG-055 套餐商品列表删除操作展示确认文案

- 优先级：P1
- 来源：BR-DEL-011
- 审核结论：approved
- 自动化处置：technical-contract-required
- 维度：来源=pass；目标=pass；步骤=pass；预期=pass；重复=pass；当前规则=pass
- 问题：无
- 自动化前置：需要唯一测试数据、服务端 ID、清理适配器和零残留验证

### TC-ITEM-UI-008 套餐商品创建页提供保存并新建入口

- 优先级：P1
- 来源：ui-observed ← 只读页面审计 2026-07-30 ← /pp/brand/create/combo
- 审核结论：approved
- 自动化处置：technical-contract-required
- 维度：来源=pass；目标=pass；步骤=pass；预期=pass；重复=pass；当前规则=pass
- 问题：无
- 自动化前置：需要唯一测试数据、服务端 ID、清理适配器和零残留验证

### TC-ITEM-STD-064 商品列表按商品名称第二语言模糊查询成功

- 优先级：P1
- 来源：BR-FMT-009
- 审核结论：approved
- 自动化处置：eligible-for-technical-binding-review
- 维度：来源=pass；目标=pass；步骤=pass；预期=pass；重复=pass；当前规则=pass
- 问题：无

### TC-ITEM-ADD-033 加料组新增时可搜索并选择该加料商品

- 优先级：P1
- 来源：PRD明确 ← 5.1.1 加料组新增时选择商品
- 审核结论：approved
- 自动化处置：technical-contract-required
- 维度：来源=pass；目标=pass；步骤=pass；预期=pass；重复=pass；当前规则=pass
- 问题：无
- 自动化前置：需要唯一测试数据、服务端 ID、清理适配器和零残留验证

### TC-ITEM-STD-033 标准商品编辑其他信息后保存成功

- 优先级：P1
- 来源：PRD明确 ← 5.1.1 品牌商品 / 商品新增、编辑页面 / 标准商品新增编辑；XMind已有 ← 标准商品 / 编辑 / 其他信息编辑
- 审核结论：approved
- 自动化处置：technical-contract-required
- 维度：来源=pass；目标=pass；步骤=pass；预期=pass；重复=pass；当前规则=pass
- 问题：无
- 自动化前置：需要唯一测试数据、服务端 ID、清理适配器和零残留验证

### TC-ITEM-STD-061 配置互斥规则后冲突项在编辑页置灰不可同时选中

- 优先级：P1
- 来源：BR-ITEM-040、BR-POS-007
- 审核结论：approved
- 自动化处置：technical-contract-required
- 维度：来源=pass；目标=pass；步骤=pass；预期=pass；重复=pass；当前规则=pass
- 问题：无
- 自动化前置：需要唯一测试数据、服务端 ID、清理适配器和零残留验证

### TC-ITEM-ADD-025 加料商品编辑其他信息后保存成功

- 优先级：P1
- 来源：业务规则明确 ← BR-ITEM-005 / BR-ITEM-006
- 审核结论：approved
- 自动化处置：technical-contract-required
- 维度：来源=pass；目标=pass；步骤=pass；预期=pass；重复=pass；当前规则=pass
- 问题：无
- 自动化前置：需要唯一测试数据、服务端 ID、清理适配器和零残留验证

### TC-ITEM-UI-004 勾选商品后批量操作菜单提供基础字段编辑入口

- 优先级：P1
- 来源：ui-observed ← 只读页面审计 2026-07-30 ← /pp/brand/list
- 审核结论：approved
- 自动化处置：technical-contract-required
- 维度：来源=pass；目标=pass；步骤=pass；预期=pass；重复=pass；当前规则=pass
- 问题：无
- 自动化前置：需要跨系统页面/API 证据和独立运行合同
- 自动化前置：需要唯一测试数据、服务端 ID、清理适配器和零残留验证

### TC-ITEM-STD-065 列表启用商品操作成功

- 优先级：P1
- 来源：BR-ITEM-050
- 审核结论：approved
- 自动化处置：technical-contract-required
- 维度：来源=pass；目标=pass；步骤=pass；预期=pass；重复=pass；当前规则=pass
- 问题：无
- 自动化前置：需要唯一测试数据、服务端 ID、清理适配器和零残留验证

### TC-ITEM-STD-077 商品状态变更后需下发到门店终端才生效

- 优先级：P1
- 来源：BR-ARCH-004、BR-ITEM-050
- 审核结论：approved
- 自动化处置：technical-contract-required
- 维度：来源=pass；目标=pass；步骤=pass；预期=pass；重复=pass；当前规则=pass
- 问题：无
- 自动化前置：需要跨系统页面/API 证据和独立运行合同

### TC-ITEM-ADD-044 菜单已引用的加料商品二次确认后停用成功

- 优先级：P1
- 来源：金将军人工处理确认 ← output\product-center-item-213-failures\failure-pack.md#tc-item-add-044
- 审核结论：approved
- 自动化处置：technical-contract-required
- 维度：来源=pass；目标=pass；步骤=pass；预期=pass；重复=pass；当前规则=pass
- 问题：无
- 自动化前置：需要唯一测试数据、服务端 ID、清理适配器和零残留验证

### TC-ITEM-UI-006 勾选商品后批量操作菜单提供添加至菜单与删除入口

- 优先级：P1
- 来源：ui-observed ← 只读页面审计 2026-07-30 ← /pp/brand/list
- 审核结论：approved
- 自动化处置：technical-contract-required
- 维度：来源=pass；目标=pass；步骤=pass；预期=pass；重复=pass；当前规则=pass
- 问题：无
- 自动化前置：需要唯一测试数据、服务端 ID、清理适配器和零残留验证

### TC-ITEM-UI-003 复制商品时打印档口信息随商品复制

- 优先级：P1
- 来源：ui-observed ← 只读页面审计 2026-07-30 ← /pp/brand/list 行操作菜单展示“复制”；business-rule-explicit ← 商品中心业务规则 §22：商品复制时，档口信息随商品复制
- 审核结论：approved
- 自动化处置：technical-contract-required
- 维度：来源=pass；目标=pass；步骤=pass；预期=pass；重复=pass；当前规则=pass
- 问题：无
- 自动化前置：需要唯一测试数据、服务端 ID、清理适配器和零残留验证

### TC-ITEM-STD-052 从图片库选择主图后创建成功

- 优先级：P1
- 来源：业务规则明确 ← BR-ITEM-005
- 审核结论：approved
- 自动化处置：technical-contract-required
- 维度：来源=pass；目标=pass；步骤=pass；预期=pass；重复=pass；当前规则=pass
- 问题：无
- 自动化前置：需要唯一测试数据、服务端 ID、清理适配器和零残留验证

### TC-ITEM-STD-055 标准商品选择多个描述标签后保存成功

- 优先级：P1
- 来源：BR-ITEM-006
- 审核结论：approved
- 自动化处置：technical-contract-required
- 维度：来源=pass；目标=pass；步骤=pass；预期=pass；重复=pass；当前规则=pass
- 问题：无
- 自动化前置：需要唯一测试数据、服务端 ID、清理适配器和零残留验证

### TC-ITEM-STD-099 标准商品选择一个商品角标后保存成功

- 优先级：P1
- 来源：BR-ITEM-006
- 审核结论：approved
- 自动化处置：technical-contract-required
- 维度：来源=pass；目标=pass；步骤=pass；预期=pass；重复=pass；当前规则=pass
- 问题：无
- 自动化前置：需要唯一测试数据、服务端 ID、清理适配器和零残留验证

### TC-ITEM-STD-100 标准商品选择多个统计标签后保存成功

- 优先级：P1
- 来源：BR-ITEM-006
- 审核结论：approved
- 自动化处置：technical-contract-required
- 维度：来源=pass；目标=pass；步骤=pass；预期=pass；重复=pass；当前规则=pass
- 问题：无
- 自动化前置：需要唯一测试数据、服务端 ID、清理适配器和零残留验证

### TC-ITEM-ADD-018 加料商品描述标签多选保存成功

- 优先级：P1
- 来源：业务规则明确 ← BR-ITEM-006
- 审核结论：approved
- 自动化处置：technical-contract-required
- 维度：来源=pass；目标=pass；步骤=pass；预期=pass；重复=pass；当前规则=pass
- 问题：无
- 自动化前置：需要唯一测试数据、服务端 ID、清理适配器和零残留验证

### TC-ITEM-ADD-019 加料商品商品角标单选保存成功

- 优先级：P1
- 来源：业务规则明确 ← BR-ITEM-006
- 审核结论：approved
- 自动化处置：technical-contract-required
- 维度：来源=pass；目标=pass；步骤=pass；预期=pass；重复=pass；当前规则=pass
- 问题：无
- 自动化前置：需要唯一测试数据、服务端 ID、清理适配器和零残留验证

### TC-ITEM-ADD-020 加料商品统计标签多选保存成功

- 优先级：P1
- 来源：业务规则明确 ← BR-ITEM-006
- 审核结论：approved
- 自动化处置：technical-contract-required
- 维度：来源=pass；目标=pass；步骤=pass；预期=pass；重复=pass；当前规则=pass
- 问题：无
- 自动化前置：需要唯一测试数据、服务端 ID、清理适配器和零残留验证

### TC-ITEM-ADD-021 加料商品配置材料信息中原料、过敏原和营养成分后保存成功

- 优先级：P1
- 来源：业务规则明确 ← BR-MAT-002
- 审核结论：approved
- 自动化处置：technical-contract-required
- 维度：来源=pass；目标=pass；步骤=pass；预期=pass；重复=pass；当前规则=pass
- 问题：无
- 自动化前置：需要唯一测试数据、服务端 ID、清理适配器和零残留验证

### TC-ITEM-ADD-039 加料商品从图片库选择主图后创建成功

- 优先级：P1
- 来源：业务规则明确 ← BR-ITEM-005
- 审核结论：approved
- 自动化处置：technical-contract-required
- 维度：来源=pass；目标=pass；步骤=pass；预期=pass；重复=pass；当前规则=pass
- 问题：无
- 自动化前置：需要唯一测试数据、服务端 ID、清理适配器和零残留验证

### TC-ITEM-ADD-017 加料商品添加详情图片不超过 10 张

- 优先级：P1
- 来源：BR-ITEM-005
- 审核结论：approved
- 自动化处置：technical-contract-required
- 维度：来源=pass；目标=pass；步骤=pass；预期=pass；重复=pass；当前规则=pass
- 问题：无
- 自动化前置：需要唯一测试数据、服务端 ID、清理适配器和零残留验证

### TC-ITEM-ADD-045 加料商品角标切换选择后仅保留最新一个角标

- 优先级：P1
- 来源：业务规则明确 ← 商品中心业务规则 §1 商品角标数量 0-1；PRD明确 ← 5.1.1 加料商品其他设置
- 审核结论：approved
- 自动化处置：technical-contract-required
- 维度：来源=pass；目标=pass；步骤=pass；预期=pass；重复=pass；当前规则=pass
- 问题：无
- 自动化前置：需要唯一测试数据、服务端 ID、清理适配器和零残留验证

### TC-ITEM-STD-006 一级分类下无二级分类，可新增商品成功

- 优先级：P1
- 来源：产品确认明确 ← BR-ITEM-CATEGORY-DIRECT-PARENT-CREATE；XMind已有 ← 标准商品 / 新增 / 分类相关校验 / 一级分类下无二级分类，可新增商品成功
- 审核结论：approved
- 自动化处置：technical-contract-required
- 维度：来源=pass；目标=pass；步骤=pass；预期=pass；重复=pass；当前规则=pass
- 问题：无
- 自动化前置：需要唯一测试数据、服务端 ID、清理适配器和零残留验证

### TC-ITEM-STD-009 POS名称和送厨名称超长及特殊字符保存后自动格式化

- 优先级：P1
- 来源：XMind已有 ← 标准商品 / 新增 / 商品属性各字段字符格式化校验 / 新增标准商品，POS名称/送厨名称超过20个字符...；BR-FMT-001
- 审核结论：approved
- 自动化处置：technical-contract-required
- 维度：来源=pass；目标=pass；步骤=pass；预期=pass；重复=pass；当前规则=pass
- 问题：无
- 自动化前置：需要跨系统页面/API 证据和独立运行合同
- 自动化前置：需要唯一测试数据、服务端 ID、清理适配器和零残留验证

### TC-ITEM-STD-035 分类下已有商品时不可继续新增子分类

- 优先级：P1
- 来源：PRD明确 ← 5.1.1 品牌商品 / 商品分类 3；XMind已有 ← 标准商品 / 新增 / 分类相关校验 / 一级分类下有商品，不可创建二级分类
- 审核结论：approved
- 自动化处置：technical-contract-required
- 维度：来源=pass；目标=pass；步骤=pass；预期=pass；重复=pass；当前规则=pass
- 问题：无
- 自动化前置：需要唯一测试数据、服务端 ID、清理适配器和零残留验证

### TC-ITEM-STD-041 标准商品创建页高级设置区域默认不展开

- 优先级：P1
- 来源：BR-ITEM-008、BR-ITEM-009
- 审核结论：approved
- 自动化处置：technical-contract-required
- 维度：来源=pass；目标=pass；步骤=pass；预期=pass；重复=pass；当前规则=pass
- 问题：无
- 自动化前置：需要跨系统页面/API 证据和独立运行合同
- 自动化前置：需要唯一测试数据、服务端 ID、清理适配器和零残留验证

### TC-ITEM-STD-046 助记码超过 20 字符时保存失败

- 优先级：P1
- 来源：BR-ITEM-012、BR-ITEM-026、BR-FMT-002
- 审核结论：approved
- 自动化处置：technical-contract-required
- 维度：来源=pass；目标=pass；步骤=pass；预期=pass；重复=pass；当前规则=pass
- 问题：无
- 自动化前置：需要唯一测试数据、服务端 ID、清理适配器和零残留验证

### TC-ITEM-STD-053 本地上传主图后创建成功

- 优先级：P1
- 来源：业务规则明确 ← BR-ITEM-005
- 审核结论：approved
- 自动化处置：technical-contract-required
- 维度：来源=pass；目标=pass；步骤=pass；预期=pass；重复=pass；当前规则=pass
- 问题：无
- 自动化前置：需要唯一测试数据、服务端 ID、清理适配器和零残留验证

### TC-ITEM-STD-101 设备编码超过 20 字符时保存失败

- 优先级：P1
- 来源：BR-ITEM-012、BR-ITEM-026、BR-FMT-002
- 审核结论：approved
- 自动化处置：technical-contract-required
- 维度：来源=pass；目标=pass；步骤=pass；预期=pass；重复=pass；当前规则=pass
- 问题：无
- 自动化前置：需要唯一测试数据、服务端 ID、清理适配器和零残留验证

### TC-ITEM-ADD-007 加料商品不选择分类时创建成功

- 优先级：P1
- 来源：业务规则明确 ← BR-ITEM-022
- 审核结论：approved
- 自动化处置：technical-contract-required
- 维度：来源=pass；目标=pass；步骤=pass；预期=pass；重复=pass；当前规则=pass
- 问题：无
- 自动化前置：需要唯一测试数据、服务端 ID、清理适配器和零残留验证

### TC-ITEM-ADD-009 加料商品标准价为 0 时创建成功

- 优先级：P1
- 来源：BR-FMT-005
- 审核结论：approved
- 自动化处置：technical-contract-required
- 维度：来源=pass；目标=pass；步骤=pass；预期=pass；重复=pass；当前规则=pass
- 问题：无
- 自动化前置：需要唯一测试数据、服务端 ID、清理适配器和零残留验证

### TC-ITEM-ADD-012 加料商品名称超长及特殊字符保存后自动格式化

- 优先级：P1
- 来源：BR-FMT-001、BR-ITEM-010
- 审核结论：approved
- 自动化处置：technical-contract-required
- 维度：来源=pass；目标=pass；步骤=pass；预期=pass；重复=pass；当前规则=pass
- 问题：无
- 自动化前置：需要唯一测试数据、服务端 ID、清理适配器和零残留验证

### TC-ITEM-ADD-013 加料商品 POS 名称和送厨名称超长及特殊字符保存后自动格式化

- 优先级：P1
- 来源：BR-FMT-001、BR-ITEM-010
- 审核结论：approved
- 自动化处置：technical-contract-required
- 维度：来源=pass；目标=pass；步骤=pass；预期=pass；重复=pass；当前规则=pass
- 问题：无
- 自动化前置：需要跨系统页面/API 证据和独立运行合同
- 自动化前置：需要唯一测试数据、服务端 ID、清理适配器和零残留验证

### TC-ITEM-ADD-022 加料商品本地上传主图后创建成功

- 优先级：P1
- 来源：业务规则明确 ← BR-ITEM-005
- 审核结论：approved
- 自动化处置：technical-contract-required
- 维度：来源=pass；目标=pass；步骤=pass；预期=pass；重复=pass；当前规则=pass
- 问题：无
- 自动化前置：需要唯一测试数据、服务端 ID、清理适配器和零残留验证

### TC-ITEM-STD-097 标准价输入非数字时创建失败

- 优先级：P1
- 来源：业务规则明确 ← BR-FMT-005
- 审核结论：approved
- 自动化处置：technical-contract-required
- 维度：来源=pass；目标=pass；步骤=pass；预期=pass；重复=pass；当前规则=pass
- 问题：无
- 自动化前置：需要唯一测试数据、服务端 ID、清理适配器和零残留验证

### TC-ITEM-ADD-048 加料商品标准价输入非数字时创建失败

- 优先级：P1
- 来源：业务规则明确 ← BR-FMT-005
- 审核结论：approved
- 自动化处置：technical-contract-required
- 维度：来源=pass；目标=pass；步骤=pass；预期=pass；重复=pass；当前规则=pass
- 问题：无
- 自动化前置：需要唯一测试数据、服务端 ID、清理适配器和零残留验证

### TC-ITEM-STD-004 切换中英文后商品页面文案随系统语言切换

- 优先级：P1
- 来源：XMind已有 ← 标准商品 / 展示 / 页面展示 / 中英文切换
- 审核结论：approved
- 自动化处置：eligible-for-technical-binding-review
- 维度：来源=pass；目标=pass；步骤=pass；预期=pass；重复=pass；当前规则=pass
- 问题：无

### TC-ITEM-STD-007 一级分类存在二级分类时必须选择二级分类才能完成商品分类选择

- 优先级：P1
- 来源：XMind已有 ← 标准商品 / 新增 / 分类相关校验 / 一级分类下有二级分类，必须选择到二级分类，才能新增成功
- 审核结论：approved
- 自动化处置：technical-contract-required
- 维度：来源=pass；目标=pass；步骤=pass；预期=pass；重复=pass；当前规则=pass
- 问题：无
- 自动化前置：需要唯一测试数据、服务端 ID、清理适配器和零残留验证

### TC-ITEM-STD-045 商品描述达到 250 字符后不可继续输入

- 优先级：P1
- 来源：BR-FMT-003
- 审核结论：approved
- 自动化处置：eligible-for-technical-binding-review
- 维度：来源=pass；目标=pass；步骤=pass；预期=pass；重复=pass；当前规则=pass
- 问题：无

### TC-ITEM-STD-054 详情图超过 10 张时不可继续添加

- 优先级：P1
- 来源：BR-ITEM-005
- 审核结论：approved
- 自动化处置：technical-contract-required
- 维度：来源=pass；目标=pass；步骤=pass；预期=pass；重复=pass；当前规则=pass
- 问题：无
- 自动化前置：需要唯一测试数据、服务端 ID、清理适配器和零残留验证

### TC-ITEM-STD-059 商品内不可单独添加组子项仅可移除已引用子项

- 优先级：P1
- 来源：BR-ITEM-030、BR-ITEM-033
- 审核结论：approved
- 自动化处置：technical-contract-required
- 维度：来源=pass；目标=pass；步骤=pass；预期=pass；重复=pass；当前规则=pass
- 问题：无
- 自动化前置：需要唯一测试数据、服务端 ID、清理适配器和零残留验证

### TC-ITEM-STD-063 商品列表分页支持切换 10/20/50/100 条

- 优先级：P1
- 来源：BR-FMT-008
- 审核结论：approved
- 自动化处置：eligible-for-technical-binding-review
- 维度：来源=pass；目标=pass；步骤=pass；预期=pass；重复=pass；当前规则=pass
- 问题：无

### TC-ITEM-ADD-002 加料商品其他设置与标准商品一致

- 优先级：P1
- 来源：业务规则明确 ← BR-ITEM-005 / BR-ITEM-006 / BR-MAT-002；XMind已有 ← 加料商品其他设置与标准商品一致
- 审核结论：approved
- 自动化处置：eligible-for-technical-binding-review
- 维度：来源=pass；目标=pass；步骤=pass；预期=pass；重复=pass；当前规则=pass
- 问题：无

### TC-ITEM-ADD-038 加料商品继续上传第 2 张主图时覆盖第 1 张主图

- 优先级：P1
- 来源：BR-ITEM-005
- 审核结论：approved
- 自动化处置：technical-contract-required
- 维度：来源=pass；目标=pass；步骤=pass；预期=pass；重复=pass；当前规则=pass
- 问题：无
- 自动化前置：需要唯一测试数据、服务端 ID、清理适配器和零残留验证

### TC-ITEM-STD-003 商品展示列设置后列表仅展示所选列

- 优先级：P1
- 来源：XMind已有 ← 标准商品 / 展示 / 页面展示 / 商品展示列设置，商品列表只展示选择的列
- 审核结论：approved
- 自动化处置：eligible-for-technical-binding-review
- 维度：来源=pass；目标=pass；步骤=pass；预期=pass；重复=pass；当前规则=pass
- 问题：无

### TC-ITEM-STD-042 点击展开高级设置后展示 POS 名称等 8 个字段

- 优先级：P1
- 来源：BR-ITEM-008、BR-ITEM-009
- 审核结论：approved
- 自动化处置：technical-contract-required
- 维度：来源=pass；目标=pass；步骤=pass；预期=pass；重复=pass；当前规则=pass
- 问题：无
- 自动化前置：需要跨系统页面/API 证据和独立运行合同

### TC-ITEM-STD-072 商品列表默认展示字段与默认收起字段正确

- 优先级：P1
- 来源：PRD明确 ← 5.1.1 列表 3、4
- 审核结论：approved
- 自动化处置：eligible-for-technical-binding-review
- 维度：来源=pass；目标=pass；步骤=pass；预期=pass；重复=pass；当前规则=pass
- 问题：无

### TC-ITEM-STD-073 商品列表支持还原默认展示列

- 优先级：P1
- 来源：PRD明确 ← 5.1.1 列表 5
- 审核结论：approved
- 自动化处置：technical-contract-required
- 维度：来源=pass；目标=pass；步骤=pass；预期=pass；重复=pass；当前规则=pass
- 问题：无
- 自动化前置：需要唯一测试数据、服务端 ID、清理适配器和零残留验证

### TC-ITEM-STD-074 商品列表展示总商品数量且不展示总金额

- 优先级：P1
- 来源：PRD明确 ← 5.1.1 列表 13
- 审核结论：approved
- 自动化处置：eligible-for-technical-binding-review
- 维度：来源=pass；目标=pass；步骤=pass；预期=pass；重复=pass；当前规则=pass
- 问题：无

### TC-ITEM-STD-076 商品列表空值字段展示空而非“-”

- 优先级：P1
- 来源：BR-FMT-010
- 审核结论：approved
- 自动化处置：eligible-for-technical-binding-review
- 维度：来源=pass；目标=pass；步骤=pass；预期=pass；重复=pass；当前规则=pass
- 问题：无

### TC-ITEM-STD-086 移除已引用口味组子项后详情不再展示该子项

- 优先级：P1
- 来源：BR-ITEM-033
- 审核结论：approved
- 自动化处置：technical-contract-required
- 维度：来源=pass；目标=pass；步骤=pass；预期=pass；重复=pass；当前规则=pass
- 问题：无
- 自动化前置：需要唯一测试数据、服务端 ID、清理适配器和零残留验证

### TC-ITEM-UI-007 标准商品创建页提供保存并新建入口

- 优先级：P1
- 来源：ui-observed ← 只读页面审计 2026-07-30 ← /pp/brand/create/standard
- 审核结论：approved
- 自动化处置：technical-contract-required
- 维度：来源=pass；目标=pass；步骤=pass；预期=pass；重复=pass；当前规则=pass
- 问题：无
- 自动化前置：需要唯一测试数据、服务端 ID、清理适配器和零残留验证

### TC-ITEM-STD-012 同一一级分类不同二级分类的标准商品同名提示 BITEM-7010

- 优先级：P1
- 来源：金将军人工处理确认 ← output\product-center-item-213-failures\failure-pack.md#tc-item-std-012
- 审核结论：approved
- 自动化处置：technical-contract-required
- 维度：来源=pass；目标=pass；步骤=pass；预期=pass；重复=pass；当前规则=pass
- 问题：无
- 自动化前置：需要唯一测试数据、服务端 ID、清理适配器和零残留验证

### TC-ITEM-ADD-015 加料商品允许与其他商品类型同名

- 优先级：P1
- 来源：金将军人工处理确认 ← output\product-center-item-213-failures\failure-pack.md#tc-item-add-015
- 审核结论：approved
- 自动化处置：technical-contract-required
- 维度：来源=pass；目标=pass；步骤=pass；预期=pass；重复=pass；当前规则=pass
- 问题：无
- 自动化前置：需要唯一测试数据、服务端 ID、清理适配器和零残留验证

### TC-ITEM-STD-023 标准商品非法起售数量保存时归一化为 1

- 优先级：P1
- 来源：金将军人工处理确认 ← output\product-center-item-213-failures\failure-pack.md#tc-item-std-023
- 审核结论：approved
- 自动化处置：technical-contract-required
- 维度：来源=pass；目标=pass；步骤=pass；预期=pass；重复=pass；当前规则=pass
- 问题：无
- 自动化前置：需要唯一测试数据、服务端 ID、清理适配器和零残留验证

### TC-ITEM-STD-051 超限价格保存成功并按 999999.99 展示

- 优先级：P1
- 来源：金将军人工处理确认 ← output\product-center-item-213-failures\failure-pack.md#tc-item-std-051
- 审核结论：approved
- 自动化处置：technical-contract-required
- 维度：来源=pass；目标=pass；步骤=pass；预期=pass；重复=pass；当前规则=pass
- 问题：无
- 自动化前置：需要唯一测试数据、服务端 ID、清理适配器和零残留验证

### TC-ITEM-PKG-050 删除全部套餐分组后因分组必填无法保存

- 优先级：P1
- 来源：金将军人工处理确认 ← output\product-center-item-213-failures\failure-pack.md#tc-item-pkg-050
- 审核结论：approved
- 自动化处置：technical-contract-required
- 维度：来源=pass；目标=pass；步骤=pass；预期=pass；重复=pass；当前规则=pass
- 问题：无
- 自动化前置：需要唯一测试数据、服务端 ID、清理适配器和零残留验证

### TC-ITEM-PKG-019 套餐商品标准价输入负数时创建失败

- 优先级：P1
- 来源：业务规则明确 ← BR-FMT-005
- 审核结论：approved
- 自动化处置：technical-contract-required
- 维度：来源=pass；目标=pass；步骤=pass；预期=pass；重复=pass；当前规则=pass
- 问题：无
- 自动化前置：需要唯一测试数据、服务端 ID、清理适配器和零残留验证

### TC-ITEM-PKG-006 套餐商品选择并引用已有固定搭配组

- 优先级：P1
- 来源：运行审计接受 ← flows/product-center/item-216/package-item-216.flow.ts；output/product-center-item-213-failures/failure-pack.md
- 审核结论：approved
- 自动化处置：technical-contract-required
- 维度：来源=pass；目标=pass；步骤=pass；预期=pass；重复=pass；当前规则=pass
- 问题：无
- 自动化前置：需要唯一测试数据、服务端 ID、清理适配器和零残留验证

### TC-ITEM-PKG-021 套餐商品名称首尾空格校验及 100 字符上限

- 优先级：P1
- 来源：金将军人工处理确认 ← output\product-center-item-213-failures\failure-pack.md#tc-item-pkg-021
- 审核结论：approved
- 自动化处置：technical-contract-required
- 维度：来源=pass；目标=pass；步骤=pass；预期=pass；重复=pass；当前规则=pass
- 问题：无
- 自动化前置：需要唯一测试数据、服务端 ID、清理适配器和零残留验证

### TC-ITEM-PKG-023 套餐商品助记码超过 20 字符时保存失败

- 优先级：P1
- 来源：金将军人工处理确认 ← output\product-center-item-213-failures\failure-pack.md#tc-item-pkg-023
- 审核结论：approved
- 自动化处置：technical-contract-required
- 维度：来源=pass；目标=pass；步骤=pass；预期=pass；重复=pass；当前规则=pass
- 问题：无
- 自动化前置：需要唯一测试数据、服务端 ID、清理适配器和零残留验证

### TC-ITEM-PKG-028 套餐商品最多保存 10 张有效详情图片

- 优先级：P1
- 来源：金将军人工处理确认 ← output\product-center-item-213-failures\failure-pack.md#tc-item-pkg-028
- 审核结论：approved
- 自动化处置：technical-contract-required
- 维度：来源=pass；目标=pass；步骤=pass；预期=pass；重复=pass；当前规则=pass
- 问题：无
- 自动化前置：需要唯一测试数据、服务端 ID、清理适配器和零残留验证

### TC-ITEM-PKG-052 套餐商品不支持引用口味做法加料组

- 优先级：P1
- 来源：金将军人工处理确认 ← output\product-center-item-213-failures\failure-pack.md#tc-item-pkg-052
- 审核结论：approved
- 自动化处置：technical-contract-required
- 维度：来源=pass；目标=pass；步骤=pass；预期=pass；重复=pass；当前规则=pass
- 问题：无
- 自动化前置：需要唯一测试数据、服务端 ID、清理适配器和零残留验证

### TC-ITEM-PKG-053 套餐和加料商品不支持互斥规则

- 优先级：P1
- 来源：金将军人工处理确认 ← output\product-center-item-213-failures\failure-pack.md#tc-item-pkg-053
- 审核结论：approved
- 自动化处置：technical-contract-required
- 维度：来源=pass；目标=pass；步骤=pass；预期=pass；重复=pass；当前规则=pass
- 问题：无
- 自动化前置：需要唯一测试数据、服务端 ID、清理适配器和零残留验证

### TC-ITEM-PKG-067 套餐商品本地上传主图回显后保存成功

- 优先级：P1
- 来源：金将军人工处理确认 ← output\product-center-item-213-failures\failure-pack.md#tc-item-pkg-067
- 审核结论：approved
- 自动化处置：technical-contract-required
- 维度：来源=pass；目标=pass；步骤=pass；预期=pass；重复=pass；当前规则=pass
- 问题：无
- 自动化前置：需要唯一测试数据、服务端 ID、清理适配器和零残留验证

### TC-ITEM-PKG-068 套餐商品先删原图再上传第二张主图替换成功

- 优先级：P1
- 来源：金将军人工处理确认 ← output\product-center-item-213-failures\failure-pack.md#tc-item-pkg-068
- 审核结论：approved
- 自动化处置：technical-contract-required
- 维度：来源=pass；目标=pass；步骤=pass；预期=pass；重复=pass；当前规则=pass
- 问题：无
- 自动化前置：需要唯一测试数据、服务端 ID、清理适配器和零残留验证

### TC-ITEM-PKG-048 切换页面返回套餐商品列表时不保留查询条件

- 优先级：P1
- 来源：金将军人工处理确认 ← output\product-center-item-213-failures\failure-pack.md#tc-item-pkg-048
- 审核结论：approved
- 自动化处置：eligible-for-technical-binding-review
- 维度：来源=pass；目标=pass；步骤=pass；预期=pass；重复=pass；当前规则=pass
- 问题：无

### TC-ITEM-PKG-065 套餐商品创建页没有加料组子项编辑能力

- 优先级：P1
- 来源：金将军人工处理确认 ← output\product-center-item-213-failures\failure-pack.md#tc-item-pkg-065
- 审核结论：approved
- 自动化处置：technical-contract-required
- 维度：来源=pass；目标=pass；步骤=pass；预期=pass；重复=pass；当前规则=pass
- 问题：无
- 自动化前置：需要唯一测试数据、服务端 ID、清理适配器和零残留验证

### TC-ITEM-PKG-035 套餐编辑基础信息并删除主图后允许无图

- 优先级：P1
- 来源：PRD明确 ← 5.1.1 套餐商品新增编辑字段
- 审核结论：approved
- 自动化处置：technical-contract-required
- 维度：来源=pass；目标=pass；步骤=pass；预期=pass；重复=pass；当前规则=pass
- 问题：无
- 自动化前置：需要唯一测试数据、服务端 ID、清理适配器和零残留验证

### TC-ITEM-PKG-063 套餐商品创建页不提供做法组引用入口

- 优先级：P1
- 来源：金将军人工处理确认 ← output\product-center-item-213-failures\failure-pack.md#tc-item-pkg-063
- 审核结论：approved
- 自动化处置：technical-contract-required
- 维度：来源=pass；目标=pass；步骤=pass；预期=pass；重复=pass；当前规则=pass
- 问题：无
- 自动化前置：需要唯一测试数据、服务端 ID、清理适配器和零残留验证

### TC-ITEM-PKG-064 套餐商品创建页不提供加料组引用入口

- 优先级：P1
- 来源：金将军人工处理确认 ← output\product-center-item-213-failures\failure-pack.md#tc-item-pkg-064
- 审核结论：approved
- 自动化处置：technical-contract-required
- 维度：来源=pass；目标=pass；步骤=pass；预期=pass；重复=pass；当前规则=pass
- 问题：无
- 自动化前置：需要唯一测试数据、服务端 ID、清理适配器和零残留验证

### TC-ITEM-STD-030 切换页面返回标准商品列表时不保留查询条件

- 优先级：P1
- 来源：运行审计接受 ← flows/product-center/item-216/standard-item-216.flow.ts；output/product-center-item-213-failures/failure-pack.md
- 审核结论：approved
- 自动化处置：eligible-for-technical-binding-review
- 维度：来源=pass；目标=pass；步骤=pass；预期=pass；重复=pass；当前规则=pass
- 问题：无

### TC-ITEM-ADD-041 切换页面返回加料商品列表时不保留查询条件

- 优先级：P1
- 来源：金将军人工处理确认 ← output\product-center-item-213-failures\failure-pack.md#tc-item-add-041
- 审核结论：approved
- 自动化处置：eligible-for-technical-binding-review
- 维度：来源=pass；目标=pass；步骤=pass；预期=pass；重复=pass；当前规则=pass
- 问题：无

### TC-ITEM-STD-056 原料过敏原营养成分保存后编辑回显

- 优先级：P1
- 来源：金将军人工处理确认 ← output\product-center-item-213-failures\failure-pack.md#tc-item-std-056
- 审核结论：approved
- 自动化处置：technical-contract-required
- 维度：来源=pass；目标=pass；步骤=pass；预期=pass；重复=pass；当前规则=pass
- 问题：无
- 自动化前置：需要唯一测试数据、服务端 ID、清理适配器和零残留验证

### TC-ITEM-ADD-037 加料商品状态变更后需下发到门店终端才生效

- 优先级：P1
- 来源：金将军人工处理确认 ← output\product-center-item-213-failures\failure-pack.md#tc-item-add-037
- 审核结论：approved
- 自动化处置：technical-contract-required
- 维度：来源=pass；目标=pass；步骤=pass；预期=pass；重复=pass；当前规则=pass
- 问题：无
- 自动化前置：需要跨系统页面/API 证据和独立运行合同

### TC-ITEM-STD-021 标准价输入负数时创建失败

- 优先级：P1
- 来源：业务规则明确 ← BR-FMT-005
- 审核结论：approved
- 自动化处置：technical-contract-required
- 维度：来源=pass；目标=pass；步骤=pass；预期=pass；重复=pass；当前规则=pass
- 问题：无
- 自动化前置：需要唯一测试数据、服务端 ID、清理适配器和零残留验证

### TC-ITEM-ADD-010 加料商品标准价输入负数时创建失败

- 优先级：P1
- 来源：业务规则明确 ← BR-FMT-005
- 审核结论：approved
- 自动化处置：technical-contract-required
- 维度：来源=pass；目标=pass；步骤=pass；预期=pass；重复=pass；当前规则=pass
- 问题：无
- 自动化前置：需要唯一测试数据、服务端 ID、清理适配器和零残留验证

### TC-ITEM-STD-078 标准商品主图上传后不提供第二次本地上传入口

- 优先级：P1
- 来源：运行审计接受 ← flows/product-center/item-216/standard-item-216.flow.ts；output/product-center-item-213-failures/failure-pack.md
- 审核结论：approved
- 自动化处置：technical-contract-required
- 维度：来源=pass；目标=pass；步骤=pass；预期=pass；重复=pass；当前规则=pass
- 问题：无
- 自动化前置：需要唯一测试数据、服务端 ID、清理适配器和零残留验证

### TC-ITEM-UI-001 商品列表提供导入记录入口

- 优先级：P2
- 来源：ui-observed ← 只读页面审计 2026-07-30 ← /pp/brand/list
- 审核结论：approved
- 自动化处置：eligible-for-technical-binding-review
- 维度：来源=pass；目标=pass；步骤=pass；预期=pass；重复=pass；当前规则=pass
- 问题：无

### TC-ITEM-UI-002 商品列表操作菜单提供图片导入与商品导入入口

- 优先级：P2
- 来源：ui-observed ← 只读页面审计 2026-07-30 ← /pp/brand/list
- 审核结论：approved
- 自动化处置：eligible-for-technical-binding-review
- 维度：来源=pass；目标=pass；步骤=pass；预期=pass；重复=pass；当前规则=pass
- 问题：无

### TC-ITEM-STD-095 商品标准价输入超过两位小数保存时四舍五入为两位

- 优先级：P2
- 来源：BR-FMT-005
- 审核结论：approved
- 自动化处置：technical-contract-required
- 维度：来源=pass；目标=pass；步骤=pass；预期=pass；重复=pass；当前规则=pass
- 问题：无
- 自动化前置：需要唯一测试数据、服务端 ID、清理适配器和零残留验证

### TC-ITEM-PKG-013 存在二级分类时未选二级分类不影响套餐商品提交

- 优先级：P2
- 来源：金将军人工处理确认 ← output\product-center-item-213-failures\failure-pack.md#tc-item-pkg-013
- 审核结论：approved
- 自动化处置：technical-contract-required
- 维度：来源=pass；目标=pass；步骤=pass；预期=pass；重复=pass；当前规则=pass
- 问题：无
- 自动化前置：需要唯一测试数据、服务端 ID、清理适配器和零残留验证

### TC-ITEM-STD-071 标准商品列表主图不支持点击查看大图

- 优先级：P2
- 来源：运行审计接受 ← flows/product-center/item-216/standard-item-216.flow.ts；output/product-center-item-213-failures/failure-pack.md
- 审核结论：approved
- 自动化处置：eligible-for-technical-binding-review
- 维度：来源=pass；目标=pass；步骤=pass；预期=pass；重复=pass；当前规则=pass
- 问题：无

### TC-ITEM-ADD-035 加料商品列表主图不支持点击查看大图

- 优先级：P2
- 来源：金将军人工处理确认 ← output\product-center-item-213-failures\failure-pack.md#tc-item-add-035
- 审核结论：approved
- 自动化处置：eligible-for-technical-binding-review
- 维度：来源=pass；目标=pass；步骤=pass；预期=pass；重复=pass；当前规则=pass
- 问题：无

### TC-ITEM-PKG-054 商品列表主图不支持点击查看大图

- 优先级：P2
- 来源：金将军人工处理确认 ← output\product-center-item-213-failures\failure-pack.md#tc-item-pkg-054
- 审核结论：approved
- 自动化处置：technical-contract-required
- 维度：来源=pass；目标=pass；步骤=pass；预期=pass；重复=pass；当前规则=pass
- 问题：无
- 自动化前置：需要唯一测试数据、服务端 ID、清理适配器和零残留验证

## deprecated（7）

### TC-ITEM-STD-040 【已废弃 v3.3】起售数量为 0 时保存失败并提示 SYSTEM-0001（与 TC-ITEM-STD-022 重复）

- 优先级：P0
- 来源：BR-ITEM-014
- 审核结论：deprecated
- 自动化处置：not-applicable
- 维度：来源=pass；目标=pass；步骤=pass；预期=pass；重复=pass；当前规则=pass
- 问题：无

### TC-ITEM-STD-025 【已废弃】从行业商品库选择单规格商品时可继承行业商品信息

- 优先级：P1
- 来源：XMind已有 ← 标准商品 / 新增 / 从行业商品库选择商品可继承行业商品库的信息 / 从行业商品库选择商品，可以继承行业商品的信息到品牌商品
- 审核结论：deprecated
- 自动化处置：not-applicable
- 维度：来源=pass；目标=pass；步骤=pass；预期=pass；重复=pass；当前规则=pass
- 问题：无

### TC-ITEM-STD-026 【已废弃】从行业商品库选择多规格商品时可继承多规格及图库信息

- 优先级：P1
- 来源：XMind已有 ← 标准商品 / 新增 / 从行业商品库选择商品可继承行业商品库的信息 / 从行业商品库选择多规格商品，可以继承行业商品的信息到品牌商品
- 审核结论：deprecated
- 自动化处置：not-applicable
- 维度：来源=pass；目标=pass；步骤=pass；预期=pass；重复=pass；当前规则=pass
- 问题：无

### TC-ITEM-STD-027 【已废弃】从行业商品库选择多规格商品时仅勾选部分规格可成功继承所选规格

- 优先级：P1
- 来源：XMind已有 ← 标准商品 / 新增 / 从行业商品库选择商品可继承行业商品库的信息 / 从行业商品库选择多规格商品，不选全部规格，可继承行业商品的信息到品牌
- 审核结论：deprecated
- 自动化处置：not-applicable
- 维度：来源=pass；目标=pass；步骤=pass；预期=pass；重复=pass；当前规则=pass
- 问题：无

### TC-ITEM-STD-034 【已废弃】继承到商品中的口味组基础信息变更后可同步到已关联商品

- 优先级：P1
- 来源：PRD明确 ← 5.1.1 品牌商品 / 选择行业商品；5.1.1 商品引用组时同步组字段信息；XMind已有 ← 标准商品 / 从行业商品库选择商品可继承行业商品库的信息，后进行编辑，继承过来的口味/口味等信息同步更新
- 审核结论：deprecated
- 自动化处置：not-applicable
- 维度：来源=pass；目标=pass；步骤=pass；预期=pass；重复=pass；当前规则=pass
- 问题：无

### TC-ITEM-PKG-066 【已废弃 v3.2】套餐商品内不可修改已引用口味组加价与默认选中

- 优先级：P2
- 来源：业务规则明确 ← BR-ITEM-031
- 审核结论：deprecated
- 自动化处置：not-applicable
- 维度：来源=pass；目标=pass；步骤=pass；预期=pass；重复=pass；当前规则=pass
- 问题：无

### TC-ITEM-STD-060 【已废弃 v3.2】商品内不可修改已引用口味组加价与默认选中

- 优先级：P2
- 来源：业务规则明确 ← BR-ITEM-031
- 审核结论：deprecated
- 自动化处置：not-applicable
- 维度：来源=pass；目标=pass；步骤=pass；预期=pass；重复=pass；当前规则=pass
- 问题：无
