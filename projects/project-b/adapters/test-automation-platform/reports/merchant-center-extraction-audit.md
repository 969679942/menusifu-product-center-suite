# Merchant Center 公共流程抽取审计

## 结论

- 审计日期：2026-08-22
- 公共流程目录：`D:\Menusifu\Test Automation Platform`
- 商品中心项目目录：`D:\Menusifu\Merchant Center\Merchant Center UITest`
- 迁移结论：公共 `system-test`、通用 Recipe、验收编排、流程治理及迁移闭环核心已迁出；商品中心保留兼容桥、本地 Playwright 类型绑定、领域适配器、业务脚本、测试数据、运行证据和应用级归属清单。
- 当前方案资产：5 个正式方案，共 624 条；352 条已有自动化绑定，272 条未落地或非适用。
- 当前来源治理执行计划：392 条，分类总数守恒；本次迁移未执行已通过业务 UI 用例。
- 通用平台结论：公共实现和商品中心适配已通过静态合同；因用户暂停跨域和跨系统运行试点，平台通用定版仍保持未完成，但不阻断商品中心模块交付。
- Windows 命令入口：公共目录含空格，商品中心 `package.json` 中所有公共 `tsx` 脚本路径已强制加引号并纳入适配合同。

## 已迁移能力

| 能力 | 公共位置 | 商品中心保留内容 |
| --- | --- | --- |
| system-test 合同、编译、执行、证据、状态裁决 | `Test Automation Platform/src/automation/system-test` | 一行兼容导出 |
| 通用 Recipe 类型、校验、反馈、能力注册 | `Test Automation Platform/src/automation/recipe` | 商品中心 Recipe 编译器和能力适配器 |
| 通用运行器、脚手架、方案编译器 | `Test Automation Platform/scripts` | `package.json` 直接调用和领域参数适配脚本 |
| 通用 Reporter | `Test Automation Platform/src/reporters` | 商品中心专用 Reporter |
| 验收清单、检查点、残留扫描、脱敏和编排 | `Test Automation Platform/src/acceptance` | 路由、认证、本地 Playwright 类型绑定和运行入口 |
| Allure 保留、合同影响、增量计划、运行审计和审核批次 | `Test Automation Platform/src/utils` | 一行兼容导出和商品中心参数适配脚本 |
| 平台成熟度交付物 | `Merchant Center UITest/deliverables/system-test-platform` | 项目路径解析适配器；公共平台只提供算法 |
| 全文件迁移闭环 | `Test Automation Platform/src/governance/migration-closure.ts` | `adapters/test-automation-platform/migration-closure.manifest.json` |

## 迁移闭环结果

- 扫描公共平台和整个 Merchant Center 工作区共 10,363 个在管文件。
- 文件归属：公共核心 78、项目适配器 98、领域资产 1,038、生成证据 9,097、历史资产 50、瞬态文件 2。
- 阻断项全部清零：未归属 0、桥接违规 0、重复公共实现 0、当前断裂引用 0、文档冲突 0、错位瞬态文件 0。
- 首次机器审计发现当前合同仍引用迁移前来源路径；已通过静态合同重建刷新到 `来源资料` 和正式 `用例库` 路径。
- 冻结基线保留 21 条旧路径诊断，明确标记为历史快照，不参与当前执行合同判定，也未被静默删除。
- `99-待废弃` 仍被 3 个当前合同文件引用 7 个来源目标，继续保持“暂不可删除”。
- 连续两次审计输入指纹一致，证明报告自身和瞬态结果不会造成重复构建漂移。
- 权威报告：`D:\Menusifu\Merchant Center\Merchant Center UITest\adapters\test-automation-platform\reports\merchant-center-migration-closure.md`。

## 已删除冗余文件

| 文件 | 删除原因 | 影响 |
| --- | --- | --- |
| `scripts/build-system-test-contract.ts` | 公共平台已有实现，包命令已直接调用公共入口 | 无运行影响，减少一份桥文件 |
| `scripts/compile-system-test-plan.ts` | 同上 | 无运行影响 |
| `scripts/run-system-test-flow.ts` | 同上 | 无运行影响 |
| `scripts/run-system-test.ts` | 同上 | 无运行影响 |
| `scripts/scaffold-system-test.ts` | 同上 | 无运行影响 |
| `scripts/verify-system-test-reference.ts` | 同上 | 无运行影响 |
| `reporters/system-test-evidence.reporter.ts` | 公共运行器只使用公共 Reporter | 无证据语义影响，避免双份实现漂移 |
| `tests/api/system-test-platform.contract.spec.ts` | 公共平台已承接完整合同 | 公共合同仍执行，商品中心改测适配边界 |
| `tests/api/test-platform-flow.contract.spec.ts` | 公共平台已承接完整合同 | 同上 |
| `tests/api/system-test-governance.contract.spec.ts` | 公共平台已承接完整合同 | 同上 |
| `tests/api/reusable-acceptance-core.contract.spec.ts` | 公共平台已承接验收清单与检查点合同 | 商品中心只保留适配合同 |
| `tests/api/reusable-route-residue-scanner.contract.spec.ts` | 公共平台已承接路由扫描合同 | 商品中心只保留适配合同 |
| `product-center-group-human-rules*.json` 4 个根目录文件 | 仅包含登录 setup 结果，业务运行证据已由正式 rebaseline 产物承接 | 不影响任何用例裁决或 Allure 报告 |
| `.skill-staging/test-case-generator` 13 个文件 | 无代码引用，已由更新后的全局技能目录取代 | 不影响新任务自动发现技能 |
| `utils/input-stability.ts` | 全仓零引用且无命令入口 | 不影响编译和运行 |
| `test-results/.last-run.json` | 本轮静态测试生成的瞬态状态 | 不影响 Allure、运行账本或历史证据 |

## 明确保留文件

| 目录或文件 | 保留原因 | 删除影响 |
| --- | --- | --- |
| `automation/system-test/*.ts` | 既有商品中心代码大量引用的兼容导出 | 直接删除会造成大范围导入断裂 |
| `automation/recipe/product-center-*` | 商品中心领域编译和证据逻辑 | 会丢失商品中心业务能力 |
| `adapters/product-center`、`pages`、`flows`、`test-data` | 商品中心领域适配层 | 公共平台无法替代 |
| `systems/merchant-center-store-operations-tax` | Merchant Center 真实系统清单和适配试点 | 会丢失当前目标系统接入样例 |
| `contracts/product-center` | 正式合同、审计、绑定和状态来源 | 会破坏追溯和执行计划 |
| `output`（约 173.51 MB） | 历史执行收据、清理证据和账本来源 | 无保留策略前删除会破坏历史裁决 |
| `allure-results`（约 45.83 MB） | 历史 Allure 原始报告数据 | 删除后无法重建对应历史报告 |
| `.claude`、`.codex` | 工作区代理和命令配置 | 删除会影响项目内自动化辅助工作流 |
| `docs/history`、`docs/superpowers` | 决策、设计和历史迁移追溯 | 删除会失去架构决策依据；不属于运行时临时文件 |
| `Merchant Center Info/99-待废弃` | 当前合同仍引用 7 个文件，且含 8 个正式商品方案未覆盖的历史 UI 场景 | 直接删除会破坏来源追溯并丢失未决场景 |
| `node_modules` | 当前本地执行依赖 | 可重装但删除后当前命令立即不可用 |

## 新方案扩展验证

- 方案清单已统一到 `contracts/product-center/test-plan-registry.json`。
- 附加自动化绑定已统一到 `contracts/product-center/test-plan-additional-automation-bindings.json`。
- 模拟第六方案已验证：正式文件、来源资料和脚本齐全时可进入同一资产索引；来源或脚本缺失时必须阻断。
- 完成来源审计后，附加绑定可复用 `item`、`group` 或 `remaining` 增量执行通道；绑定脚本不匹配、文件不存在或未获得运行资格时进入技术阻断。
- 注册成功不等于运行通过。只有当前执行收据覆盖用例要求的 UI/API/下游/清理断言面后才能判定 passed。

## 验证结果

- 公共平台 TypeScript：通过。
- 公共平台边界检查：通过，未发现商品中心硬编码。
- 公共平台合同：86 条通过，其中迁移闭环合同 7 条、项目产物根隔离合同 1 条；覆盖全文件归属、桥接边界、重复实现、当前与历史引用分流、临时文件和项目输出隔离。
- 商品中心 TypeScript：通过。
- 商品中心来源、目录、注册、适配和迁移闭环定向合同：19 条通过；完整平台适配与治理门禁批次：21 条通过。
- 商品中心平台适配器：`adapterImplementationReady=true`，税务试点合同为 `mutation-ready`。
- 商品中心资产索引：`624 = 352 landed + 272 unlanded`。
- 最终目标门禁：按设计返回未完成，仅剩 `CROSS_DOMAIN_PILOT_REQUIRED` 和 `CROSS_APPLICATION_PILOT_REQUIRED`；`moduleDeliveryBlocked=false`。
