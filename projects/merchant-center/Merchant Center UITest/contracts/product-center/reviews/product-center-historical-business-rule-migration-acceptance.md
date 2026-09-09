# 商品中心历史业务规则迁移接受收据

- 接受编号：product-center-historical-business-rule-migration-acceptance-20260831
- 接受人：金将军
- 接受时间：2026-08-31T00:00:00+08:00
- 收据指纹：4d40da57fca0913565cc1de033c12faefe3a02c591c800c09b9f9258787e9300

| 历史绑定 | 处置 | 替代规则 | 关联用例 |
|---|---|---|---|
| BR-ITEM-CATEGORY-LEAF | resolved-by-formal-rule | BR-ITEM-CATEGORY-LEAF-SELECTION、BR-ITEM-CATEGORY-DIRECT-PARENT-CREATE | TC-ITEM-STD-006、TC-ITEM-STD-007 |
| BR-ITEM-010 | resolved-by-formal-rule | BR-ITEM-010 | TC-ITEM-ADD-014、TC-ITEM-ADD-015、TC-ITEM-PKG-024、TC-ITEM-PKG-025、TC-ITEM-STD-011、TC-ITEM-STD-012、TC-ITEM-STD-013、TC-ITEM-STD-014、TC-ITEM-STD-044 |
| BR-ITEM-INDUSTRY-INHERITANCE | deprecated-by-product-confirmation | 无 | 无 |

说明：该收据只接受历史来源处置，不授权历史规则直接执行或覆盖正式规则。
