# 商品中心自动化覆盖矩阵

生成时间：2026-07-24T04:17:16.916Z

实体总数：18；UI + API：17；API-only 动作：12；不适用动作：5；评审项：1。

| 实体 | 路由 | UI动作 | API生命周期 | 反向场景 | 覆盖结论 | 缺口 |
| --- | --- | --- | --- | --- | --- | --- |
| 商品分类 | `/pp/brand/category` | create, edit, delete | seed, verify, cleanup | required, max-length, cancel-delete | ui-and-api | - |
| 打印档口（品牌） | `/pp/printer-stall/list` | delete | seed, verify, cleanup | - | ui-and-api | 创建场景使用 API Seed，尚无 UI 创建用例；部分动作经运行时证据标记为不适用 |
| 规格组 | `/pp/brand/spec` | edit, delete | seed, verify, cleanup | - | ui-and-api | 创建场景使用 API Seed，尚无 UI 创建用例 |
| 税种 | `/poi/tax/tax-types` | edit, delete | seed, verify, cleanup | - | ui-and-api | 创建场景使用 API Seed，尚无 UI 创建用例 |
| 口味组 | `/pp/brand/option-group/taste` | edit, delete | seed, verify, cleanup | - | ui-and-api | 创建场景使用 API Seed，尚无 UI 创建用例 |
| 做法组 | `/pp/brand/option-group/method` | create, edit, delete | seed, verify, cleanup | required, max-length | ui-and-api | - |
| 加料组 | `/pp/brand/option-group/additional` | edit, delete | seed, verify, cleanup | prerequisite-disabled | ui-and-api | 创建场景使用 API Seed，尚无 UI 创建用例 |
| 套餐组 | `/pp/brand/combo` | delete | seed, verify, cleanup | - | ui-and-api | 创建场景使用 API Seed，尚无 UI 创建用例；部分动作经运行时证据标记为不适用 |
| 描述标签 | `/pp/brand/tag/description` | delete | seed, verify, cleanup | - | ui-and-api | 创建场景使用 API Seed，尚无 UI 创建用例；部分动作经运行时证据标记为不适用 |
| 统计标签 | `/pp/brand/tag/statistic` | delete | seed, verify, cleanup | - | ui-and-api | 创建场景使用 API Seed，尚无 UI 创建用例；部分动作经运行时证据标记为不适用 |
| 原料 | `/pp/brandMaterial` | create, edit, delete | seed, verify, cleanup | - | ui-and-api | - |
| 原料分类 | `/pp/brandMaterialCategory` | edit, delete | seed, verify, cleanup | - | ui-and-api | 创建场景使用 API Seed，尚无 UI 创建用例 |
| 配方原料 | `/pp/bom/ingredient` | edit, delete | seed, verify, cleanup | - | ui-and-api | 创建场景使用 API Seed，尚无 UI 创建用例 |
| 配方单 | `/pp/bom/list` | create, edit, delete | seed, verify, cleanup | - | ui-and-api | - |
| 菜单 | `/bm/menu/list` | edit, delete | seed, verify, cleanup | - | ui-and-api | 创建场景使用 API Seed，尚无 UI 创建用例 |
| 打印机 | `/poi/printer-stall/list` | edit | seed, verify, cleanup | required | ui-and-api | 创建场景使用 API Seed，尚无 UI 创建用例；部分动作经运行时证据标记为不适用 |
| 品牌调味 | `/pp/brand/seasoning/list` | create, edit, delete | seed, verify, cleanup | - | ui-and-api | - |
| 门店调味 | `/poi/location/seasoning` | - | - | - | review-required | 当前 API/UI 证据不足，保留评审项 |
