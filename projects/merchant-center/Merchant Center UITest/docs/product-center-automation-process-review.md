# 商品中心自动化流程整改评审

更新时间：2026-08-17

## 结论

当前流程已达到“证据消费和异常拦截可自动化”的成熟度，但还没有达到“所有变化都由页面观测自动更新正式合同”的成熟度。正式合同继续采用只读基线、提案、门禁、回归、晋级五段式流程。

## 1. 审计触发条件

| 触发条件 | 是否自动触发 | 处置 |
| --- | --- | --- |
| 测试方案或 Recipe 进入生成/执行入口 | 是 | 必须消费对应运行时审计合同；无合同不得生成 |
| 应用版本、环境、角色、语言发生变化 | 是 | 证据上下文不匹配，重新采集；旧证据不得套用 |
| 页面路由、可见控件、必填字段、对话框、按钮状态发生变化 | 是 | 页面合同 Probe、Diff、影响集 |
| API 方法、路径、响应形状发生变化 | 是 | 页面网络观测提案；冲突进入异常队列 |
| 精确中文提示、提交按钮状态、是否发送写请求、UI/API 终态变化 | 是 | 运行收据进入审计校正候选 |
| 写入后清理、API 零残留、UI 零残留未完成 | 是 | 自动裁决拒绝，转人工异常队列 |
| 仅发生可重试的网络抖动或同一测试重试 | 否 | 按瞬时失败恢复，不生成业务审计差异 |

### 成熟度判断

- **消费门禁：成熟。** 已有方案指纹、证据哈希、有效期、上下文、精确提示、写入安全和清理校验。
- **主动触发：较成熟。** 页面合同 Probe 可主动发现页面和 API 技术漂移；仍需在 CI 发布事件中统一调用 Probe，避免只依赖人工启动命令。
- **证据闭环：已补齐。** `runtime-audit-correction-from-receipt.ts` 将运行收据统一转换为 V2 合同；没有 AI 批准或证据不完整时仍然自动转人工。

## 2. 用例更新触发条件

用例只有在以下条件全部满足时才允许自动更新：

1. 运行收据的 `caseId` 在当前方案中存在，或明确声明 `add-case`。
2. 当前用例指纹与收据生成时的 `reviewedCaseFingerprint` 一致。
3. 证据文件存在、哈希一致、未过期、已登记且状态为 `consumed`。
4. 应用版本、环境、角色、语言与当前执行上下文一致。
5. 精确提示使用实际观测的中文文本逐字绑定，不能用英文切换结果替代。
6. UI 终态、API 终态、写请求和清理结果与校正断言一致。
7. 更新动作在 `autoApprovalPolicy.allowedActions` 内，且业务规则、技术绑定、覆盖项变更均有对应变更记录。

以下情况不自动改用例：来源与运行事实冲突、需要删除/拆分/合并但策略未授权、写入证据不完整、API operationKey 与页面签名冲突、证据无法证明业务结论。它们进入人工异常队列，而不是降低断言精度。

## 3. 自动化脚本评审

### 已落地的通用能力

- `build:product-center:runtime-audit-correction-from-receipts`：运行收据 → V2 审计校正合同。
- `build:product-center:api-observation-proposal`：页面网络证据 → API operation 对比提案。
- `audit:product-center:maintainability`：统计大文件、直接身份模板和拆分建议。
- `createAuditIdentity` 已统一为短审计身份；`createAuditFieldValue` 支持按字段最大长度分配身份。

### 实用性与复用率评审结果

维护性报告显示当前扫描 204 个 TypeScript 文件，其中 3 个核心文件超过 2000 行：组 runner、标准商品 flow、组 page object；另有多个 900 至 2000 行的页面、flow 和数据工厂。它们可以运行，但复用率和变更隔离性不足，后续拆分顺序为：

1. 组 runner 按新增、编辑、删除、引用关系、校验、查询六类业务编排拆分。
2. 组 page object 按列表、表单、明细、商品选择弹层拆分；页面类只保留 DOM 动作和读取。
3. item-216 三个 factory 抽取商品、SKU、图片、清理登记公共模块；场景差异只保留配置。
4. 生成 spec 继续视为产物，评审生成器和 Recipe，不手改生成文件。

维护性报告路径：`output/quality/product-center-maintainability-report.json`。报告中的 `directIdentityTemplates` 是待迁移项，不代表已自动修复；新增代码应禁止继续拼接长身份字符串。

### 数据工厂整改规则

- 展示字段只保存短身份；场景说明、caseId、长标签放入 fixture metadata 或 cleanup ledger。
- 名称、第二名称、选项名、图片名和编码分别声明最大长度，不再复用一个长字符串。
- 所有创建操作必须立即登记 serverId、身份变体和依赖关系；重试前按 serverId 或唯一身份查询，禁止盲目重放写请求。
- 只读查询、写入响应、UI/API 清理校验统一复用现有 API adapter 和 cleanup registry。

## 4. API 文档自动维护

可以通过 AI 辅助页面抓取更新 API，但更新对象应先是“观测提案”，不能直接覆盖正式 API 文档。流程为：

1. 页面 Probe 用 `startProductCenterPageApiCapture` 监听真实 request/response。
2. 采集器只保留方法、路径、状态、请求/响应字段形状和用例上下文；自动删除 token、cookie、密码、authorization 等敏感字段。
3. `build:product-center:api-observation-proposal` 将观测路径归一化后与现有 `all.operations.json` 对比。
4. 已匹配 operation 只更新运行证据；新路径生成 operation 候选；operationKey 冲突、同路径多服务、响应不完整进入人工异常队列。
5. 只有经过重复观测、服务归属、请求/响应 schema、认证方式和回归用例验证后，才允许生成正式 API 合同变更并走审批。

因此，AI 可以完成页面抓取、脱敏、归一化、比对、候选文档和测试绑定；不能仅凭一次页面请求自动把不确定接口写入正式 API 目录。
