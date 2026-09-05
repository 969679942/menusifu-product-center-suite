# 商品中心自动化基线 v1.0.0

冻结时间：2026-07-22
环境：balamxqa
商户：Menusifu SCH Restaurant
Brand ID：000407

## 覆盖摘要
- 路由：34
- 控件：221
- 字段：222
- 弹窗：82
- 必填验证：18
- API 操作：656
- UI/API 映射：566
- 状态矩阵：850
- 五实体 CRUD 试点：通过

## 使用规则
- 只允许 `AUTO_AUDIT_*` 测试数据。
- 禁止把 provisional、blocked、unresolved 记录生成测试断言。
- 所有删除必须同时完成 API 与 UI 缺失校验。
