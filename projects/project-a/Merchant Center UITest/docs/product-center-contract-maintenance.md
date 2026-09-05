# 商品中心合同维护

## 谁维护什么

Codex 维护 `contracts/product-center/modules/*.module.ts`、`*.curation.ts`、证据导入和构建结果。人工只审核合同差异、规则评审队列和发布记录，不直接编辑聚合 JSON。

九个模块源文件覆盖 34 条页面路由：

| 模块 | 一级模块 | 主要内容 |
| --- | --- | --- |
| `brand-item` | 商品管理 | 商品、分类、多语言、图片 |
| `brand-group` | 商品管理 | 规格、口味、做法、加料、套餐 |
| `brand-seasoning` | 商品管理 | 品牌调味及下发记录 |
| `brand-tag` | 商品管理 | 描述标签、角标、统计标签 |
| `brand-material-recipe` | 商品管理 | 原料、配方和记录中心 |
| `brand-print` | 商品管理 | 品牌打印档口 |
| `menu` | 菜单管理 | 菜单及下发记录 |
| `store-product` | 门店商品管理 | 门店商品、菜单、调味、库存 |
| `store-operations` | 门店商品管理 | 税种、配方、打印档口 |

模块文件中的 `curations` 仅允许有来源的覆盖、补充和墓碑删除。覆盖必须写明原因和来源；墓碑删除必须写明审核人。

跨模块人工结论统一写入 `contracts/product-center/reviews/human-review-decisions.json`，由 `human-review-decisions.curation.ts` 调用通用编译器生成策展。页面字段覆盖仍按路由进入所属模块视图；无页面归属的自动化排除规则进入共享视图，不污染九个业务模块的职责边界。

## Codex 工作流

```text
读取 manifest/索引
→ 修改目标模块文件或导入证据
→ npm run build:product-center:contract
→ npm run verify:product-center:contract
→ npm run diff:product-center:contract
→ npm run plan:product-center:incremental
→ npm run test:product-center:incremental
→ npm run test:product-center:sop:all:contracts
→ npm run accept:product-center
```

合同差异优先通过 traceability 的 `sourceIds` 精确定位用例；无精确引用时才按路由降级。生成型 traceability 变化不计入业务受影响路由，字段、接口、未决项等真实业务集合仍保留路由影响。增量计划与结果分别写入 `reviews/current-incremental-test-plan.json` 和 `reviews/current-incremental-test-result.json`，可直接供其他项目复用通用影响分析和计划构建器。

## 精确读取

```bash
npm run contract:query -- --route /pp/brand/category
npm run contract:query -- --module brand-seasoning
npm run contract:query -- --entity 商品分类
npm run contract:query -- --operation "brand-menu:GET /ops-brand/brand-categories/treeList"
npm run contract:review -- --priority P0
npm run contract:impact -- --route /pp/brand/category
```

默认读取索引引用；增加 `--full` 才读取目标模块中的完整记录。

## P0 审核批次

```bash
npm run build:product-center:review-batches
```

命令读取当前 `p0-review-items.json` 和统一合同，将未决项按 OpenAPI 中可证实的 `service + controller tag` 分组，每包最多 20 条。当前 94 条生成 19 包，输出到 `contracts/product-center/reviews/batches/`。无法从证据定位 operation 的记录进入 shared 分组，不猜测所属 UI 业务模块。

人工只审核批次并把结论写入 `human-review-decisions.json`；批次生成器不修改合同、不发布版本，也不会把 `confirm/exclude/defer` 之外的待确认信息转成自动化断言。

## 可复用验收

项目无关的 manifest、检查点、扫描、脱敏和编排内核位于 `D:\Menusifu\Test Automation Platform\src\acceptance`。商品中心的 `utils/acceptance/` 只保留一行兼容导出；项目路由、认证和本地 Playwright 类型绑定位于 `acceptance/projects/`。商品中心清单覆盖 34 路，门店商品管理试点清单覆盖 10 路，两者共享公共内核和 Merchant Center 认证适配器。

```bash
npm run accept:product-center
npm run accept:product-center:scan
npm run accept:product-center:scan:fresh
npm run accept:store-product:scan
```

新增项目时只增加 `AcceptanceProject` 适配器，不在公共内核中写入项目路由、实体名、Brand ID 或凭据。默认扫描会复用同指纹下通过路由的 checkpoint；路由集合变化导致指纹变化时自动重建。

## 人工审核发布

审核后才能执行：

```bash
npm run contract:promote -- --version 1.0.0 --reviewed-by 审核人 --note "审核说明"
```

命令会再次校验合同和追溯，复制当前合同为基线，并写入 `reviews/product-center-release-history.json`。缺少审核人、版本不匹配、追溯缺口或合同错误时会阻断。
