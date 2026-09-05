# Merchant Center 文件治理结果

## 结论

- 治理日期：2026-08-22
- 商品中心目录：`D:\Menusifu\Merchant Center\Merchant Center UITest`
- 公共流程目录：`D:\Menusifu\Test Automation Platform`
- 结论：二次扫描发现并迁出验收与流程治理公共实现；最终迁移闭环门禁已覆盖公共平台和整个 Merchant Center 工作区。已剔除可证明无运行、无追溯、无证据价值的临时文件，正式方案、领域适配器、业务脚本、测试数据、运行账本和历史证据均保留。
- 业务影响：未重跑任何已通过业务 UI 用例，正式用例数量、已完成/未落地索引和历史裁决未改变。

## 删除判定标准

文件只有同时满足以下条件才删除：

1. 已有权威替代或从未被任何入口引用；
2. 不属于正式方案、运行账本、审计证据、清理证据或决策记录；
3. 删除后类型检查、公共边界门禁和定向合同保持通过。

## 本轮剔除

| 文件或目录 | 数量 | 原因 | 影响 |
| --- | ---: | --- | --- |
| 项目根目录 `product-center-group-human-rules*.json` | 4 | Playwright JSON 只记录“保存商户中心登录态” setup 通过；业务 rebaseline 证据已在 `output` 中正式保存 | 无业务证据损失，释放 650,452 字节并消除误读 |
| `.skill-staging/test-case-generator` | 13 | 无任何项目引用；全局 `C:\Users\Administrator\.codex\skills\test-case-generator` 已安装且版本更新 | 不影响新任务自动发现；避免项目内旧技能漂移 |
| `utils/input-stability.ts` | 1 | 全仓零引用、无包命令入口 | 无运行影响 |
| 商品中心通用验收合同副本 | 2 | 公共平台已有模块无关合同 | 商品中心保留接入合同，不再双维护公共规则 |
| 商品中心与公共平台 `test-results/.last-run.json` | 2 | Playwright 每次合同运行生成的瞬态状态 | 不影响 Allure、账本或历史结果 |

## 迁出但保留兼容路径

以下 12 个商品中心文件已从“本地实现”改为“一行公共导出”，所以历史导入路径不变：

- `utils/acceptance` 下 6 个验收内核文件；
- `utils/allure-result-retention.ts`；
- `utils/contract-change-impact.ts`；
- `utils/incremental-test-plan.ts`；
- `utils/review-batch.ts`；
- `utils/runtime-audit-correction-from-receipt.ts`；
- `acceptance/projects/acceptance-project.ts` 改为公共泛型端口的本地 Playwright 类型绑定。

公共权威实现位于：

- `D:\Menusifu\Test Automation Platform\src\acceptance`
- `D:\Menusifu\Test Automation Platform\src\utils`

## 明确保留

| 资产 | 保留原因 | 删除影响 |
| --- | --- | --- |
| `output` | 正式运行收据、审计、清理和历史状态来源 | 破坏用例裁决和结果复用 |
| `allure-results` | Allure 报告原始结果 | 无法重建对应历史报告 |
| `contracts/product-center` | 商品中心合同、绑定、规则和指纹 | 破坏方案生成与执行门禁 |
| `pages`、`flows`、`api`、`test-data`、`adapters/product-center` | 商品中心领域实现 | 公共平台不应承接业务细节 |
| `acceptance/projects` | Merchant Center 路由、认证和依赖类型适配 | 公共验收内核无法直接登录目标系统 |
| `docs/history`、`docs/superpowers` | 历史决策和设计追溯 | 删除后无法解释既有实现来源 |
| `.claude`、`.codex` | 项目代理和命令配置 | 影响项目内辅助工具工作流 |
| `node_modules` | 当前本地执行依赖 | 删除后命令立即不可运行，可重装但不属于冗余治理 |

### Merchant Center Info 核查

| 资产 | 结论 | 依据 |
| --- | --- | --- |
| `00-待转换测试方案` | 保留，权威方案入口 | 注册表 5 个方案；索引为 624 条，其中已完成 352、未落地 272 |
| `PRD与对应测试用例` | 保留，现役来源 | 多个构建脚本和 `product-center-test-contract.json` 直接引用 |
| `商品中心业务规则.md`、`B端产品设计规范.md` | 保留，现役规则来源 | 正式方案、来源追溯和构建脚本直接引用 |
| `坎昆商品中心PRD测试方案` | 保留，原始 XMind 来源 | 菜单、门店商品和税种合同及基线直接引用 |
| `99-待废弃` | 暂不可删除 | 当前合同仍引用 7 个文件；224 个历史用例编号中有 8 个 `TC-ITEM-UI-*` 未进入正式 216 条，尚无逐条处置决策 |

`99-待废弃` 的 README 已改为“暂不可删除”，并列明来源迁移、8 条场景决策、合同重建和数量守恒四项退出条件。直接删除会破坏现有追溯，因此不属于本轮可证明冗余文件。

无 `product-center` 前缀的剩余本地工具已逐个分类：一行公共桥保留兼容；`async-table`、文件选择、输入稳定、步骤包装等属于商品中心测试运行时辅助；`audit-script-runner` 明确绑定 TestOps 和 MenuSifu 凭据适配。该结论现由迁移闭环清单和公共负向合同持续验证，不再依赖人工扫描声明。

## 最终迁移闭环

- 公共审计实现：`D:\Menusifu\Test Automation Platform\src\governance\migration-closure.ts`。
- Merchant Center 适配清单：`D:\Menusifu\Merchant Center\Merchant Center UITest\adapters\test-automation-platform\migration-closure.manifest.json`。
- 执行入口：`npm run audit:test-platform:migration-closure`，并已接入 `test:system-platform:gates`。
- 当前扫描 10,412 个文件，6 类归属数量守恒：公共核心 83、项目适配 101、领域资产 1,038、生成证据 9,138、历史资产 50、瞬态文件 2；全部阻断项为 0。
- 当前合同来源引用已刷新；冻结历史基线的 21 条旧路径单列为非阻断诊断。
- 连续两次执行输入指纹一致；新增未知文件、重复公共实现、断裂引用或错误历史声明会自动将状态改为 `incomplete`。

## 第三轮反向审计

- 触发原因：上一轮只校验公共源码无领域硬编码，同时将公共平台 `deliverables/**` 统一归类为生成证据，商品中心专属执行索引、成熟度结果和迁移报告因此被错误视为合法公共资产。
- 整改结果：10 个商品中心平台状态文件已迁入 `Merchant Center UITest/deliverables/system-test-platform`，5 个接入与迁移报告已迁入 `Merchant Center UITest/adapters/test-automation-platform/reports`。
- 公共平台现有项目状态文件 0 个、项目命名文件 0 个；项目适配器必须显式提供产物根，公共实现无默认项目输出路径并拒绝目录越界。
- 新增 `publicBoundary` 门禁，公共目录出现项目身份、业务词或项目专属输出路径时直接判定 `incomplete`，不能再通过生成证据分类掩盖。

## 第四轮完整性与身份治理

- 新增迁移完整性基线，按公共核心、项目适配和历史资产保存逐文件 SHA-256；缺失、内容变化或基线缺失都会把迁移状态改为 `incomplete`。
- 新增 `project-adapter.json` 与项目级 `artifact-manifest.json`，应用 ID、项目 ID、产物根目录或路径越界任一不一致都会在写入产物前失败。
- 正常 readiness、评审队列和迁移收口只允许校验身份，不再静默创建身份清单；首次创建只能通过显式项目脚手架完成。
- 项目脚手架改为幂等且禁止覆盖不同身份的已有描述。本轮负向合同已证明冲突时描述文件保持不变。
- 统一收口命令 `npm run close:test-platform:migration` 会刷新 readiness、评审队列、最终裁决、外部依赖检查点和迁移报告，但不会重跑商品中心业务 UI 用例。
- 旧基线准确拦截本轮 8 个受管代码文件变化；定向合同通过后才使用 `--write-baseline` 显式接受。当前基线指纹与扫描指纹一致。
- 连续两次迁移审计输入指纹一致，证明生成报告和瞬态文件未造成漂移。精确哈希只保存在机器报告中，避免治理文档与自身基线形成自引用。

## 验证结果

- 公共平台 TypeScript：通过。
- 商品中心 TypeScript：通过。
- 公共平台边界门禁：通过，无商品中心硬编码。
- 公共平台合同：101 条通过，其中迁移闭环合同 11 条、产物身份合同 3 条、项目脚手架合同 4 条、独立项目生命周期合同 3 条。
- 商品中心平台适配与迁移合同批次：24 条；来源、闭环审计、证据协调、执行治理和历史对账合同：20 条。最终全量门禁结果见本轮统一收口和严格最终目标裁决。
- 商品中心 `package.json`：扫描 227 个 TypeScript/JavaScript 命令目标，缺失 0 个。
- 平台最终目标门禁按设计保持 `incomplete`，仅剩已暂停的跨应用和跨业务域真实试点；`moduleDeliveryBlocked=false`，不影响商品中心交付。
- 未执行已通过业务 UI 用例，未修改正式方案数量和运行状态。

## 复盘后的剩余优化

| 优先级 | 事项 | 目的 | 预期结果 | 后续影响 |
| --- | --- | --- | --- | --- |
| 已完成 | 将新项目的 readiness、评审、最终裁决和迁移收口生命周期抽成描述驱动的公共命令 | 消除新系统首次接入时手工复制项目收口脚本 | 新项目脚手架除身份和迁移清单外，还生成可执行生命周期描述；公共命令可仅凭项目根目录完成收口 | 商品中心现有结果不失效、不重跑；已删除 4 个本地通用编排脚本。真实第二系统缺失时仍只能合同验证，不能宣称跨系统定版 |
| 已完成 | 为 `--write-baseline` 增加批准人、原因和变更摘要收据 | 防止有权限的操作者在无说明情况下接受受管文件漂移 | 每次基线更新都有独立收据、前后指纹、增删改清单和哈希链 | 不改变商品中心业务结果；仅在有意接受迁移变化时增加一次显式参数填写 |
| 暂不建议 | 改写冻结快照中的 21 条历史旧路径 | 当前旧路径已按 `historical-diagnostic` 单列，不影响当前合同 | 保持历史事实和诊断价值 | 现在改写会污染冻结历史且不能提升当前交付质量 |
| 已暂停 | 跨业务域和不同应用真实试点 | 满足平台通用化最终定版门槛 | readiness 从 `candidate` 进入可评审状态 | 不影响商品中心交付；没有真实目标系统时不得伪造执行 |

## 后续门禁

- 公共验收或治理能力新增时，必须写入 `D:\Menusifu\Test Automation Platform\src` 并添加模块无关合同。
- 商品中心对应路径只能保留兼容导出、本地依赖类型绑定或明确的领域适配器。
- 根目录生成 Playwright JSON、`.skill-staging` 或未登记通用实现时，文件治理门禁应判定未完成。
- 新方案、新应用和目录迁移必须提供应用级迁移闭环清单；没有全文件归属和适配合同只能声明未完成。
