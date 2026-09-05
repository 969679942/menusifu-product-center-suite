# Merchant Center 接入公共测试平台

## 目录职责

- 公共流程：`D:\Menusifu\Test Automation Platform`
- 商品中心代码、适配器、测试数据和运行证据：`D:\Menusifu\Merchant Center\Merchant Center UITest`
- 商品中心正式方案、来源资料和资产索引：`D:\Menusifu\Merchant Center\Merchant Center Info\00-待转换测试方案`
- 商品中心平台成熟度和评审交付物：`D:\Menusifu\Merchant Center\Merchant Center UITest\deliverables\system-test-platform`
- 迁移闭环适配清单：`D:\Menusifu\Merchant Center\Merchant Center UITest\adapters\test-automation-platform\migration-closure.manifest.json`
- 迁移闭环报告：`D:\Menusifu\Merchant Center\Merchant Center UITest\adapters\test-automation-platform\reports\merchant-center-migration-closure.md`

公共平台不得依赖商品中心目录。商品中心可以通过兼容导出、包命令和系统清单依赖公共平台。

## 商品中心关联点

1. `Merchant Center UITest/package.json` 的 `scaffold:system-test`、`compile:system-test-plan`、`build:system-test`、`test:system`、`flow:system-test` 和 `verify:system-test-reference` 直接调用公共平台脚本。
2. `Merchant Center UITest/automation/system-test` 只保留一行兼容导出，实际实现位于公共平台。
3. `Merchant Center UITest/automation/recipe` 的通用 Recipe 类型、校验、反馈和能力注册委托公共平台；商品中心编译器和能力适配器仍保留在商品中心。
4. `Merchant Center UITest/utils/acceptance`、Allure 保留、合同影响、增量计划、运行审计和审核批次文件只保留公共实现兼容导出。
5. `Merchant Center UITest/acceptance/projects` 保留 Merchant Center 路由、认证和本地 Playwright 类型绑定。
6. `Merchant Center UITest/utils/system-test-platform-paths.ts` 将平台成熟度交付物解析到商品中心项目目录；公共平台不保存项目状态。
7. `Merchant Center UITest/systems/*/manifest.json` 是具体 Merchant Center 业务域接入公共平台的系统清单。
8. `Merchant Center UITest/contracts/product-center/test-plan-registry.json` 是商品中心方案清单；新增方案不得再写入脚本硬编码数组。
9. `Merchant Center UITest/package.json` 的 `audit:test-platform:migration-closure` 调用公共审计器；平台目录或 Merchant Center 工作区新增文件后必须重新通过。
10. `adapters/test-automation-platform/project-adapter.json.lifecycle` 是公共生命周期唯一配置；readiness、review、strict 和 close 四个包命令均直接调用公共 `run-project-lifecycle.ts`，项目不再保留对应编排实现。

## 迁移闭环门禁

执行：

```powershell
cd "D:\Menusifu\Merchant Center\Merchant Center UITest"
npm run audit:test-platform:migration-closure
```

门禁统一检查：

- 所有在管文件必须归属为公共核心、项目适配器、领域资产、生成证据、历史资产或瞬态文件；
- 商品项目中的公共同名文件必须是一行兼容导出或登记过的应用适配器；
- 精确重复的公共实现、断裂的真实 TypeScript 导入和包命令目标会阻断；
- 当前合同中的结构化来源路径不存在会阻断；冻结历史快照的旧路径单独报告，不冒充当前合同失败；
- 历史目录仍被机器引用时，文档必须明确“暂不可删除”；
- `.last-run.json`、`.tmp`、`.skill-staging` 和根目录调试 JSON 只能出现在批准的瞬态位置；
- 审计器自身输出和第三方依赖被显式排除，连续执行输入指纹必须一致。

该门禁只证明流程抽取和文件治理闭环，不替代 `verify:system-test-platform` 的跨方案、跨应用最终目标门禁。

迁移基线只能通过 `--approved-by` 和 `--reason` 显式接受；接受收据保存在项目 `deliverables/system-test-platform`，缺失、篡改、与当前基线不一致或无变化重复接受都会失败。

## 新增商品中心测试方案

1. 将唯一正式 Markdown 放入 `Merchant Center Info\00-待转换测试方案\用例库\<方案目录>`。
2. 将 XMind 或其他正式来源放入 `Merchant Center Info\00-待转换测试方案\来源资料\<方案目录>`。
3. 在 `contracts/product-center/test-plan-registry.json` 注册方案、来源文件、绑定提供者和执行通道。
4. 运行审计并生成来源治理决策。没有来源证据时不得生成精确字段、提示、接口或业务规则。
5. 生成商品中心页面对象、业务 Flow、数据工厂和自动化脚本。
6. 将用例绑定写入既有领域绑定，或写入 `test-plan-additional-automation-bindings.json`。
7. 构建资产索引和来源治理执行计划，只执行新增或指纹变化的用例。
8. 聚合 UI/API/下游/清理证据，更新运行账本、正式状态和已完成/未落地索引。

注册表合同已用模拟第六方案验证：新增方案无需修改资产索引代码即可进入流程。自动化脚本、适配器和证据仍必须按用例实际行为生成，注册本身不等于通过。

## 接入其他系统

首次接入时，仅提供代码目录不够。至少需要：

- 系统根目录和 `manifest.json` 目标路径；
- 应用身份、环境和基础 URL；
- 认证、租户/角色、路由上下文适配器；
- 正式来源和审计证据；
- UI/API/下游断言适配器；
- 写入用例的数据准备、服务端 ID、清理和零残留验证；
- Playwright 配置、执行 Spec 和恢复入口。

可先用公共 `scaffold-system-test.ts` 生成只读骨架，再补齐目标系统适配器。首次适配通过后，编译和执行只需要该系统的 `manifest.json` 路径，不需要复制公共流程代码。
