# TC-GRP-SPEC-021 商品侧观测能力缺口

- 状态：`blocked-technical`
- 业务规则：编辑被引用规格明细的规格名称、第二语言、规格值、规格图标、设备编码后，五个字段同步至引用商品。
- 已确认：截图和重放 API 均显示商品侧规格名称、第二语言、规格值已同步；商品列表显示新规格名称，商品详情的 `skuSpecList.specOptionName` 也为新值。
- 当前缺口：商品侧 API 仅返回 `name`、`secondName`、`value`，没有返回规格图标引用和设备编码；商品编辑页当前自动化只具备规格名称观测。
- 处理方式：不登记为产品偏差，不要求金将军处理业务规则；补齐商品侧图标/设备编码 API 或页面观测后，再完成五字段闭环。
- 证据：`Merchant Center UITest/output/product-center-group-spec021-product-defect-evidence-v1.json`
