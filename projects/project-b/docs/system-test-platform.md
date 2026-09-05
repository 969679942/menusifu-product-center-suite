# 跨系统测试落地平台（候选）

## 最终目标

测试方案进入任意新系统后，平台复用统一的合同编译、预检、执行监控、断言收据、清理门禁、失败分类和规则治理；新系统只提供认证、页面/API 能力及数据生命周期适配器。商品中心保持原入口和运行实现，不作为新系统的隐式依赖。

当前通用层是由商品中心实战抽取的候选平台，不代表流程已经定版。商品中心仍是主验证场，后续发现的流程缺陷必须优先在商品中心闭环，再回灌通用层。

标准化测试方案由 `system-test-plan-compiler.ts` 一次生成 Recipe、provisional 规则和 case 绑定；三者不再分别手工维护。PRD、XMind 或既有用例只需先转换为该标准化输入，来源缺失时编译器会阻断。

## 接入层级

- `contract-ready`：测试方案、候选规则、Recipe、数据档案和 adapter 声明可编译，未启动浏览器。
- `read-only-ready`：认证与只读 Probe 可用，可立即执行路由、页面和查询类测试。
- `mutation-ready`：写入用例同时具备 seed、operation、assertion、cleanup、API residue 和 UI residue adapter，才允许执行 CRUD。

不存在“零领域信息即可自动测试业务”的可靠方案。平台保证新系统无需重写流程，但认证方式、业务控件和可清理测试数据仍必须由该系统的 adapter 提供。

## 强制合同

1. 每条用例唯一绑定 `caseId/ruleId/recipeId/dataProfileId`。
2. 每个预期 Claim 必须唯一绑定 assertion adapter；执行成功后才产生 Claim 收据。
3. 只读用例禁止声明 seed、mutation 和 cleanup。
4. 写入用例禁止自动重试，并强制 API/UI 零残留。
5. 用例不得依赖环境中预先存在的共享业务数据；需要非空列表或特定状态时，`dataProfile` 必须声明可清理的自建夹具，无法自建时必须在预检阶段按外部能力阻断。
6. 定向运行只生成所选用例的执行与清理证据，不得套用全量分母生成正式报告；正式报告只能由无筛选全量运行产生。
7. 安全通道必须由实际证据合同判定：任何声明 `api-mutation` 或 `cleanup` 的用例都进入写通道，即使业务操作本身预期不落库。
8. 恢复运行必须继承首次启动时间，并分别维护全量与定向 latest 指针；CI 或代理外层超时不得短于调度预算，停滞终止只能由有检查点感知的 watchdog 执行。
9. 业务执行指纹与编排指纹必须分离：页面、API、工厂、runner、断言和清理变化使业务证据失效；调度、watchdog 和心跳变化只使编排计划重新校验，不得强制重跑已完成业务证据。
10. 写入用例必须提供合同中每个 operationKey 的真实运行收据。
11. 运行证据不得自动将候选规则升级为正式规则。
12. 失败固定分为产品失败、自动化缺口、环境故障和外部依赖。
13. 用例筛选参数必须校验名称、取值和目标集合；无效或冲突时立即失败，禁止静默退化为全量执行。
14. 每个运行中状态必须记录监控进程和业务子进程身份；进程消失后由下一次启动自动归档为环境故障下的执行平台中断。
15. 外层编排超时必须覆盖内部最长运行、清理和报告时间；外部强制终止不得计为产品失败。
16. 适配器入口及声明的导入依赖必须同时参与指纹校验，证据执行器、评估器和 reporter 使用独立证据语义指纹。
17. 写入失败或熔断后必须执行系统恢复适配器；下一次 setup 还必须先恢复历史未完成检查点。
18. 试点运行合同必须与当前系统身份、Recipe、规则、适配器和证据运行时指纹完全一致；清单或实现变更后禁止复用旧运行证据。
19. 平台成熟度只承认 `validationAuthority: target-system` 的真实目标系统证据；自建参考系统必须声明 `self-controlled-reference`，只能验证框架机制，不能触发正式定版门禁。
20. 新方案必须使用 `runtimeAudit` V2：符合 `autoApprovalPolicy` 的 AI 校正直接更新用例和 Recipe；审计证据目录内任何未登记文件、过期证据、上下文不一致、方案/用例指纹变化、覆盖缺口、写请求安全缺口或规则/绑定冲突，都必须在生成 Recipe 前阻断并转人工异常队列。
21. 审计校正支持用例新增、删除、拆分、合并和修改；业务规则、技术绑定和覆盖发生变化时必须提供机器可执行的同步变更，不能只改预期文案。
22. 每条用例必须声明平台语义合同；语义相同的用例必须合并，或使用不同变体 ID 和独立来源证明差异。
23. 每条预期必须绑定字段 ID 和权威 assertion surface；surface 必须与路由、观察通道和验证权威一致。
24. 精确反馈必须绑定 UI 审计或运行证据；操作后反馈必须关联 operation key，提交前禁用态不得声明操作收据。
25. 每条 Recipe 必须在业务动作前和断言前执行 context guard，并将两阶段守卫收据纳入证据完整性裁决。
26. 平台成熟度使用系统无关的参考基线，强制校验计划总量、执行资格、分类排除、实际执行、通过和失败之间的数量守恒；具体基线来源由系统适配构建器提供。
27. 每次重建平台评审队列时自动复核现有发布；候选或治理指纹变化会把旧 `formal` 发布降级为 `not-approved`。
28. 平台参考基线必须按 `caseId + 用例指纹` 解析当前标准收据，逐条验证 API/UI 清理和证据文件指纹；旧的全局 `verifiedZero` 汇总不能授权平台晋级。
29. `product-defect`、`source-blocked`、`technical-blocked`、`environment-blocked` 和 `revalidation-required` 必须使用不同责任分类；超时、认证、定位、下游能力缺失不得自动归为产品失败。

## 常态化原则

后续任何方案暴露出的流程问题，默认先判断是否属于公共平台缺口。公共缺口必须在 `D:\Menusifu\Test Automation Platform\src` 修复并增加模块无关负向合同；具体字段、提示、路由、身份读取和清理方式由系统 adapter 提供。项目目录中的同名文件只能是兼容导出或本地类型绑定，用户无需在每个任务或新对话中再次要求“抽成通用流程”。

## 规则审核触发

默认需要至少 3 个独立数据变体、2 个版本指纹、正向/负向/边界/范围四个维度、UI/API 证据、清理通过且没有反证，才进入 `ready-for-human-review`。即使满足条件，仍必须由人工提交匹配候选指纹的 `approve` 决策，才能形成 formal 规则。

该人工门禁仅用于跨版本 `formal` 规则晋级和平台定版，不用于证据充分的当前版本用例、精确提示、路由、控件、断言适配器或 API 技术绑定校正；后者默认由 AI 自动裁决。

## 新系统使用

```powershell
npm run scaffold:system-test -- --system-id=my-system --base-url=https://example.test --application-id=my-application --business-domain-id=my-domain --authentication-family-id=my-auth --validation-authority=target-system
npm run compile:system-test-plan -- --plan=systems/my-system/test-plan.json --manifest=systems/my-system/manifest.json
npm run build:system-test -- --manifest=systems/my-system/manifest.json
npm run test:system -- --manifest=systems/my-system/manifest.json
```

脚手架默认生成一条真实只读根页面测试和可编辑的 `test-plan.json`。方案编译命令会原子更新 Recipe、provisional 规则、指纹和 case 绑定；随后合同编译会在浏览器启动前检查 adapter 完整性与实现漂移。登录系统需替换 `setup.spec.ts` 和 auth adapter；开始 CRUD 前必须补齐数据与清理 adapter。通用 Runner 负责认证规格、在线预检、业务规格、JSONL 心跳、熔断、证据账本和安全扫描。商品中心已验证的筛选失败关闭、进程身份和中断状态回收是通用 Runner 的必备能力，未实现前不得宣称可立即切换任意系统。

真实试点通过脚手架参数一次声明 `applicationId`、`businessDomainId`、`authenticationFamilyId` 和 `validationAuthority`；参数缺失或非法会在创建目录前失败。运行完成后，`npm run build:system-test:readiness` 会自动扫描 `systems/*/manifest.json` 及对应的 `output/system-test/<systemId>/latest-run-state.json`，无需再修改成熟度构建代码。缺失、损坏或过期证据会进入 `pilotDiagnostics`，不会被静默忽略或误算为合格试点。

## 商品中心兼容

商品中心继续使用 `test:product-center:item-practice`，不切换通用 Runner。`product-center-system-test-compatibility.ts` 只生成只读兼容投影，用于证明 case、rule、dataProfile 和门禁策略可以映射到通用模型，不改变现有脚本行为。

## 当前实战状态

- 当前参考基线使用商品中心组闭环审计：144 条正式用例 = 129 条执行资格 + 15 条已分类排除；129 条均有完整通过证据，automation-gap 为 0，API/UI 零残留通过。
- `merchant-center-store-operations-tax` 已具备真实非商品业务域适配器，但当前标准运行证据缺少 `evidence-ledger.json`，未被 readiness 认定为合格跨业务域试点；该试点已暂停，不在本轮重复运行。
- 当前跨业务域和跨应用试点均未满足，因此平台保持 `candidate`；该状态不阻断商品中心模块交付。
- `npm run build:system-test:readiness` 会生成机器可读定版门禁；参考基线、跨业务域试点和跨应用真实可逆 CRUD 试点同时通过后，状态才进入 `eligible-for-human-platform-review`。
- `npm run build:system-test:review-queue` 会生成平台人工评审队列和候选指纹，自动复核并撤销过期平台发布；队列默认 `approved=false`，不能由运行结果自动批准。
- `npm run verify:system-test-platform` 是统一平台校验入口，依次刷新参考基线、复核发布状态并运行公共及领域兼容门禁。
- 人工批准可填写当前项目 `deliverables/system-test-platform/platform-review-decision.template.json`，再执行 `npm run approve:system-test:platform -- --decision=<决定文件路径>`；候选或治理指纹变化后旧决定和旧 `formal` 发布自动失效。
- 成熟度构建已改为自动发现全部标准试点，并校验当前运行合同指纹；自建参考系统即使运行通过也不能替代真实目标系统实战。

## 迁移收口

- 项目适配身份：`adapters/test-automation-platform/project-adapter.json`。
- 项目生命周期：`project-adapter.json.lifecycle`，声明业务域、参考闭环审计、参考模块、系统目录和治理文件。
- 项目产物身份：`deliverables/system-test-platform/artifact-manifest.json`。
- 迁移完整性基线：`adapters/test-automation-platform/reports/migration-inventory.baseline.json`。
- `npm run close:test-platform:migration` 直接调用公共 `run-project-lifecycle.ts`，依次刷新就绪状态、评审队列、最终裁决、外部依赖检查点并运行迁移闭环审计，不执行业务 UI 用例。
- 公共生命周期在任何派生状态写入前先执行迁移预检；存在未接受漂移时只更新迁移失败报告，不刷新 readiness、评审、裁决或外部依赖状态。
- 公共核心、项目适配器或历史资产发生有意变更时，先通过其他迁移门禁，再显式执行 `npm run audit:test-platform:migration-closure -- --write-baseline --approved-by=<操作者> --reason=<接受原因>` 接受新基线；不得在门禁失败时自动覆盖基线。
- 基线接受收据写入 `deliverables/system-test-platform/migration-baseline-acceptance.jsonl`，保存前后指纹、增删改清单和哈希链。重复接受、收据缺失或篡改都会阻断迁移完成。

## 正式定版门禁

1. 商品中心当前测试范围和用例分母冻结，全部用例都有唯一责任分类。
2. 所有无需人工处理的商品中心用例完成自动化落地，且不存在 automation-gap 遗留。
3. 可执行用例通过逐 Claim 断言、真实 operation、清理和 API/UI 零残留审计，不存在假通过。
4. 商品中心原入口完成完整回归，运行监控可识别停滞、重复失败和环境异常。
5. 至少一套不同 `applicationId`、不同业务域、需要登录且包含可逆 CRUD 的真实目标系统通过同一流程。
6. 上述条件满足后只进入人工平台定版评审，不得由运行结果自动标记正式版本；不同 `applicationId` 的真实试点是当前平台通用化定版硬门禁。
7. 人工平台评审通过后才能冻结正式版本；运行结果不能替代人工批准。
