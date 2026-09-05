# 商品中心生产级 API/UI 混合 SOP

## 当前范围

- 核心五实体 UI Create/Edit/Delete：15 条。
- 八个低依赖实体适用 Edit/Delete：13 条。
- 四个高依赖实体适用 Edit/Delete：6 条。
- 必填、最大长度、前置禁用、取消删除：11 条。
- 可执行描述符合计 45 条；UI 证据确认不适用 5 条；缺少可靠业务来源、只进入评审 4 条。

机器可读验收门槛位于 `contracts/product-center/product-center-production-sop-acceptance.json`。

## 标准作业流程

### UI 创建

1. API Seed Dependencies，只创建 UI 主实体所需依赖。
2. UI Create，并等待最终 POST 响应。
3. 立即按审计身份查询并记录服务端 ID。
4. API Verify 与 UI Verify 双终态。
5. fixture `finally` 按依赖逆序 API Cleanup，并验证零残留。

### UI 编辑

1. API Seed 主实体与依赖，并立即登记服务端 ID。
2. UI Action 完成编辑，输入后提交前至少等待 200ms。
3. API Verify 编辑身份存在、原身份不存在。
4. UI Verify 重新打开页面后只显示编辑身份。
5. fixture `finally` API Cleanup，验证原始、编辑和依赖身份均不存在。

### UI 删除

1. API Seed 待删除主实体与依赖，并立即登记服务端 ID。
2. UI Action 打开唯一记录菜单并确认删除。
3. API Verify 原始和编辑身份均不存在。
4. UI Verify 重新打开页面后记录不存在。
5. fixture `finally` 仍执行 API Cleanup：先查询 prior DELETE 是否已生效；已不存在则只完成残留验证，仍存在才按服务端 ID 删除。

### 反向 SOP

- 空提交必须显示已证实的校验状态，且 mutation 请求数为 0。
- 最大长度按真实输入值断言，不推测未证实的字符业务规则。
- 描述标签和统计标签第二语言边界由人工确认合同驱动：标签名称 50/51、标签组名称 10/11；只填充读取，不提交 mutation。
- 前置条件不足时验证提交按钮禁用。
- 取消删除时 DELETE 请求数为 0，API 查询确认记录保留，finally 再清理审计数据。
- duplicate、whitespace、relation-blocked、backend-error 缺少可靠来源或受控故障注入，标记 review-required，不生成幻读断言。

## 检查点与恢复

- 阶段：`seeded → ui-triggered → mutation-observed → api-verified → ui-verified → cleaning → cleaned → residue-verified`。
- 检查点只保存 `AUTO_AUDIT_*` 身份、服务端 ID、依赖顺序和脱敏诊断。
- 429、超时、重连后从第一个未完成单元恢复；非幂等操作先按服务端 ID 与审计身份对账，禁止盲目重放。
- 独立恢复命令扫描 `output/checkpoints`，只处理未达到 `residue-verified` 的审计数据。

## Recipe 半生成式编译

- Recipe 只描述来源、路由、数据绑定、能力 ID、mutation、断言和清理，不保存 selector。
- Flow 统一解释 Recipe，执行 `API Seed → UI Action → API Verify → UI Verify → API Cleanup`；删除失败后不自动重放 UI 删除。
- Page 仍是唯一 DOM 合同所有者，能力注册表只把 `category.editIdentity` 等稳定 ID 映射到现有 Page 方法。
- 编译器只处理白名单 case ID；来源重复、缺失、能力未知或合同不合法时写入 `product-center-recipe-unresolved.json`，禁止猜测生成。
- 当前 45 条合同 SOP 已全部正式迁移：五实体创建、核心 CRUD、低/高依赖 CRUD 与 11 条负向/边界场景。
- 每条 Recipe 使用 `traceabilityId` 定位合同追溯根，`sourceIds` 只保存真实存在的 route、field、rule、control 和 API mapping ID。
- 旧 `field-constraint:` 别名自动归一为 field ID；无法对应真实记录的 runtime 别名只保留迁移诊断，不进入 Recipe 来源。
- 合同差异优先按 source ID 精确选择 Recipe；route fallback 只记录不执行，防止同路由扩散。
- Reporter 按 Recipe ID 输出状态、耗时和脱敏失败分类；反馈不会自动修改合同、业务规则或 locator。

可复用边界：其他项目替换 catalog、能力适配器和 seed/assert/cleanup 端口即可复用 Recipe 类型、校验器、注册表、值绑定、生成器模式与反馈模型。

## 定位规则

- 优先稳定 `data-testid`；当前无 test id 时使用页面真实暴露的唯一语义或 DOM owner 契约。
- 定位必须唯一、可见、可用；发生漂移立即停止并报告。
- 禁止 `.first()`、`.last()`、`nth()`、`.or()`、候选选择器遍历和 `waitForTimeout` 掩盖歧义。
- 页面结构与低层动作放在 `pages/`，跨步骤业务编排放在 `flows/`。

## 执行命令

```powershell
npm run test:product-center:sop:contracts
npm run test:product-center:sop:fast
npm run test:product-center:sop:full
npm run test:product-center:sop:core:create
npm run test:product-center:sop:core:hybrid
npm run test:product-center:sop:low
npm run test:product-center:sop:high
npm run test:product-center:sop:negative
npm run test:product-center:sop:all
npm run test:product-center:sop:stability
npm run test:product-center:sop:stability:soak
npm run test:product-center:sop:stability:serial
npm run test:product-center:sop:rerun
npm run recover:product-center
npm run plan:product-center:incremental
npm run test:product-center:incremental
npm run accept:product-center
npm run accept:product-center:scan
npm run accept:product-center:scan:fresh
npm run accept:store-product:scan
npm run build:product-center:review-batches
npm run build:product-center:recipes
npm run build:product-center:recipes:incremental
npm run build:product-center:test-case-ir
npm run audit:product-center:test-case-input -- --input <用例IR.json> --bindings <来源绑定.json>
npm run test:product-center:recipes:contracts
npm run test:product-center:recipes
npm run promote:product-center:recipes
npm run build:product-center:recipes:metrics
```

生成器输出的 `sourceIds`、`specFile`、`testTitle` 与 `rerunGrep` 可用于按合同记录、实体或失败单元精确执行。影响分析优先按 `sourceIds` 精确选择；只有没有精确来源时才按路由降级，`unresolved` 等治理集合不触发路由扩散。当前不接入 CI，但 `playwright.config.ts` 保留 CI 下 headless、单 worker、重试和 `forbidOnly` 能力。

## 项目内验收

- `accept:product-center` 依次执行合同测试、全量 Recipe 正式回归、34 路残留扫描和前后安全门禁。
- 路由扫描使用项目 manifest、同一认证 BrowserContext 和逐路原子 checkpoint；默认从未通过路由恢复，增加 `:fresh` 才重建扫描检查点。
- 页面达到业务响应稳定终态后立即继续，不使用固定等待；只读网络故障执行 5、15、30、60 秒有界退避。
- `accept:store-product:scan` 使用同一内核扫描门店商品管理 10 路，用于验证清单和认证适配器可替换。
- 结果位于 `output/acceptance/<projectId>/latest.json`、`route-scan.json` 和 `route-checkpoint.json`，不保存响应体、Cookie、Token 或 storage state。

## 最终验收

- TypeScript 与生产验收聚合按计时 Reporter 口径的 135 条商品中心 API/治理合同通过；完整 `tests/api` 清单另含通用合同、直连 CRUD 和数据工厂测试，不混入该门禁计数。
- TestCase IR 入口合同 7 条，覆盖结构校验、来源绑定、重复与未知来源阻断、人工分类和 45 条存量 SOP 回填。
- Recipe 合同共 54 条，覆盖来源索引、覆盖矩阵、编译、增量、执行、反馈、晋级和指标。
- Recipe UI：45/45 通过，4 workers 独立运行墙钟 206 秒；单条累计耗时 745,415ms，unresolved 0。
- Recipe 覆盖现有 45 条 SOP 的 100%，来源绑定率 100%，人工修正率 0，locator drift 0。
- 正式 full：46/46，4 workers，206 秒；业务用例仍为 45 条，无重复迁移场景。
- Recipe 反馈证据：`output/recipes/product-center-pilot-feedback.json`。
- 最新 full 回归：46/46（45 条业务 + 1 条登录态 setup）通过，总耗时 3.44 分钟，4 workers。
- 最新合同增量计划：4 条标签第二语言边界按字段来源 ID 精确选择，unsupported 为 0。
- 最新一键验收：合同、full UI、fresh 34 路扫描三阶段通过，总耗时 3.92 分钟。
- 门店商品管理第二清单试点：10/10 路通过，0 命中、0 路由错误。
- fast 分层：全量 Recipe 中带 `@fast` 的业务用例；stability 分层：45 条 Recipe × 3，1 worker。
- 登录态通过 `output/auth-state.json` 复用；失效时才重建，最终验收必须删除该文件。
- 日常 stability：核心 15 条一轮、4 workers；发布前 soak：核心 15 条 × 3；顺序依赖排查使用 serial。
- 34/34 路由残留扫描：0 命中、0 路由错误。
- 检查点未完成条目：0。
- 敏感信息扫描：0 finding。
- `output/auth-state.json` 与其他持久化浏览器认证文件：0。
