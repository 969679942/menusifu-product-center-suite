# 商品测试方案最终目标执行记忆

更新时间：2026-08-03 23:25 CST

## 最终目标

- 将原始商品 XMind 转换为来源可追溯、业务规则不幻读、技术绑定可执行的 canonical 测试方案。
- 对 229 条基线用例完成全量人工语义审核与风险优先的真实运行验证。
- 页面观察只能形成技术证据；与 canonical 不一致时进入 reconciliation，禁止自动改写业务规则。
- 所有真实 mutation 使用唯一身份、即时记录服务端 ID、非幂等重放前对账、finally 清理及 UI/API 双零残留。
- 原始 XMind 永不覆盖；重建版单独输出。

## 当前技术状态

- 36 条风险 Holdout 已真实验证，结果仅代表该 Holdout，禁止宣称泛化准确率。
- 运行覆盖来源已由状态构建器去重聚合：既有基线 5 条、P0 四波 36 条、W1-W8 决策后有效 54 条，合计 95 条，无重叠。
- W1：5 accepted，2 canonical-conflict，0 mutation。
- W1 冲突：TC-ITEM-STD-002、TC-ITEM-ADD-001。
- W2 runId：AUTO_AUDIT_P0_REMAINING_W2_20260731_02。
- W2：14 accepted，5 canonical-conflict，0 harness-error。
- W2 冲突：TC-ITEM-STD-021、TC-ITEM-STD-023、TC-ITEM-ADD-010、TC-ITEM-PKG-019、TC-ITEM-PKG-013。
- W2 清理：12/12 ledger residue-verified；19/19 身份 UI=0、API=0。
- W2 报告：output/audit/product-center-item-p0-remaining-w2-AUTO_AUDIT_P0_REMAINING_W2_20260731_02.json。
- W3 runId：AUTO_AUDIT_P0_REMAINING_W3_20260731_03。
- W3：5 accepted，1 canonical-conflict，0 harness-error。
- W3 冲突：TC-ITEM-ADD-015；当前页面允许加料商品与标准商品跨类型同名创建。
- W3 清理：14/14 ledger residue-verified；全部审计身份 UI=0、API=0。
- W3 报告：output/audit/product-center-item-p0-remaining-w3-AUTO_AUDIT_P0_REMAINING_W3_20260731_03.json。
- W4 runId：AUTO_AUDIT_P0_REMAINING_W4_20260731_09。
- W4：5 accepted，1 canonical-conflict，0 harness-error。
- W4 冲突：TC-ITEM-STD-008；当前页面将名称截断到 100 字符，并以“字符之间只允许单空格”阻止提交，未自动格式化后落库。
- W4 清理：6/6 ledger residue-verified；商品与规格全部 UI=0、API=0。
- W4 报告：output/audit/product-center-item-p0-remaining-w4-AUTO_AUDIT_P0_REMAINING_W4_20260731_09.json。
- W5 runId：AUTO_AUDIT_P0_REMAINING_W5_20260731_06。
- W5：6 accepted，2 canonical-conflict，0 harness-error。
- W5 冲突：TC-ITEM-STD-081 当前重复详情图上传两次均提示 BITEM-3006，但商品仍以空详情图成功创建；TC-ITEM-PKG-073 当前套餐页只有套餐组入口，不存在口味/做法/加料共享 Attribute 添加入口。
- W5 清理：15/15 ledger residue-verified；商品、套餐依赖、描述标签、角标与口味组全部 UI=0、API=0。
- W5 报告：output/audit/product-center-item-p0-remaining-w5-AUTO_AUDIT_P0_REMAINING_W5_20260731_06.json。
- W6 runId：AUTO_AUDIT_P0_REMAINING_W6_20260731_05。
- W6：3 accepted，5 canonical-conflict，0 harness-error。
- W6 accepted：TC-ITEM-STD-032、TC-ITEM-STD-087、TC-ITEM-STD-088；商品内口味/做法/加料默认项与加价保存回读正确，三类主数据 SHA-256 前后一致。
- W6 冲突：TC-ITEM-ADD-024、TC-ITEM-PKG-035 的更新接口返回 200，但名称/价格或主图未按 canonical 落库；TC-ITEM-PKG-069、TC-ITEM-PKG-071、TC-ITEM-PKG-072 的套餐编辑页不存在共享 Attribute 添加入口。
- W6 清理：10/10 ledger residue-verified；商品、套餐依赖、口味组、做法组、加料组与选项商品全部 UI/API=0。
- W6 报告：output/audit/product-center-item-p0-remaining-w6-AUTO_AUDIT_P0_REMAINING_W6_20260731_05.json。
- W7 runId：AUTO_AUDIT_P0_REMAINING_W7_20260731_03。
- W7：7 accepted，0 canonical-conflict，0 harness-error。
- W7 证据：无引用加料/套餐 DELETE 为 HTTP 200、code=0、success=true、UI/API 1→0；加料组引用阻断为 HTTP 400、BITEM-2014；菜单引用阻断为 HTTP 400、BITEM-2013；所有 DELETE 均按目标 deleteId 捕获并核对引用对象。
- W7 确认弹窗：同一加料商品连续两次打开并取消，文案稳定且包含唯一商品身份；随后复用该商品完成无引用删除。
- W7 清理：13/13 ledger residue-verified；7 个 mutation intent 全部 cleanup-complete；商品、套餐依赖、套餐组、加料组、菜单和菜单区块全部 UI/API=0。
- W7 报告：output/audit/product-center-item-p0-remaining-w7-AUTO_AUDIT_P0_REMAINING_W7_20260731_03.json。
- W8 runId：AUTO_AUDIT_P0_REMAINING_W8_20260731_05。
- W8：0 accepted，3 canonical-conflict，0 harness-error。
- W8 冲突：TC-ITEM-STD-067、TC-ITEM-ADD-044、TC-ITEM-PKG-039；三类菜单引用商品的停用请求均精确命中目标 ID，返回 HTTP 400、BITEM-2013、`item is been used in menu`，详情 API、列表 API 与 UI 均保持 Enabled。
- W8 下发：因三类商品均被当前 canonical 菜单引用规则阻断停用，`publishSkippedDueToLifecycleConflict=true`，未创建无意义的菜单下发作业。
- W8 清理：7/7 ledger residue-verified；Merchant Center API、UI 与渠道查询全部为 0，无 execution/cleanup diagnostic。
- W8 报告：output/audit/product-center-item-p0-remaining-w8-AUTO_AUDIT_P0_REMAINING_W8_20260731_05.json。

## 2026-07-31 全量重建结果

- Canonical 活动用例：229 条。
- C01-C09 已由金将军批量确认并写入机器可读决策：9 条 update-canonical、6 条 retain-canonical-file-bug、4 条 needs-prd。
- 严格 runtime accepted：95/229（41.5%）；剩余非 accepted：134 条。
- 基线兼容且可进入生成：90 条；另有 5 条旧 runtime accepted 仍需 canonical source reconciliation。
- P0：93/104 runtime accepted（89.4%）；剩余 11 条为 6 条产品缺陷、4 条待 PRD 和 1 条外部终端阻断。
- W1-W9 原始观察分母：65/65 disposition 完整，45 accepted、19 canonical-conflict、1 external-terminal-blocked、0 harness-error。
- 决策后 W1-W8：54 条 effective accepted，其中 9 条为 accepted-after-canonical-reconciliation；10 条 unresolved conflict 精确拆分为 6 条产品缺陷和 4 条待 PRD。
- 9 条产品确认校正已写入重建 canonical，旧专家修订不得覆盖产品确认；229 条全审结果保持通过=229、修订=0、来源确认=0。
- 当前技术状态：contracts/product-center/test-cases/canonical/product-center-item-current-technical-status.json。
- P0 波次 manifest：contracts/product-center/test-manifests/product-center-item-p0-remaining-waves.json；状态为 executed-with-reconciled-conflicts-and-terminal-gate。

## 90 条准确用例生成结果

- 已按当前技术状态精确选择 90 条 `generationAllowed=true` 且 `runtime-accepted`、`baseline-compatible`、全审 `approved` 的用例完成批量生成。
- 分母：P0=88、P1=2、P2=0；标准商品=39、加料商品=22、套餐商品=29；保留原 canonical ID，不另造编号。
- 来源：既有基线 runtime=5、P0 四波 runtime=31、W1-W8 原始 accepted=45、canonical reconciliation 后 accepted=9。
- 内容质量：90 条 ID 与标题均唯一；来源、前置、动作、预期全部非空；双重编号=0；禁止分隔符=0；模糊动作和空泛“正常/正确”预期=0。
- 产品规则：11 条 product-corrected 用例进入生成，其中包括本轮 9 条 C01/C05/C07/C09 校正及此前 2 条套餐规则校正。
- 排除门禁：139 条未生成，包括 123 条尚未 runtime accepted、5 条旧 canonical source reconciliation、6 条产品缺陷、4 条待 PRD、1 条 W9 外部终端阻断。
- JSON：contracts/product-center/test-cases/generated/product-center-item-generation-ready-v1.json。
- Markdown：contracts/product-center/test-cases/generated/product-center-item-generation-ready-v1.md。
- XMind：Merchant Center Info/坎昆商品中心PRD测试方案/商品管理/1.商品中心-商品管理-商品-准确生成90条.xmind；原始 XMind 未覆盖。
- 准确性边界：当前发布内容与冻结全审标签一致性 229/229；独立 human-reviewed Holdout 判定 36/36；不得据此宣称未见场景泛化准确率 100%。

## 139 条自动化快车道结果

- 139 条不再进入逐条人工审核：123 条进入自动技术流水线，9 条进入人工规则决策，6 条进入产品缺陷队列，1 条保持环境阻断。
- 123 条自动技术流水线已压缩为 54 个共享执行模板组：绿色 65 条/20 组，黄色 58 条/34 组；静态语义重新审核=0。
- 绿色策略：复用已通过的同类型、同场景、同操作、同风险样板生成草案，不需要人工语义审核；但同类样板不等于精确能力绑定，未绑定前禁止 runtime。
- 黄色策略：34 组复用页面、数据与清理链，58 条用例全部独立断言、独立留证和独立判定；禁止代表证据继承，默认不要求人工语义审核。
- 真正人工规则审核从 139 条降为 9 条、6 个决策组：2 个 canonical 来源统一组和 4 个产品规则确认组。
- 6 条产品缺陷只进入研发修复与整批复测，不重新审核用例；W9 只等待可控终端能力，不重新审核用例。
- 快车道产物：contracts/product-center/reviews/automation-fast-lane/product-center-item-automation-fast-lane.json 和对应 Markdown。
- 边界：绿色/黄色表示可进入自动化生成或自动探测，不等同于已 runtime accepted；只有运行和清理证据通过后才能晋级准确发布。

## 黄色共享链 Recipe 编译结果

- 黄色 58 条已逐条生成结构 Recipe，并按 34 个执行组共享页面、数据与清理链；结构编译 58/58，通过，人工审核=0。
- Y1 只读：14 条/8 组；Y2 受控负向：1 条/1 组；Y3 mutation：37 条/19 组；Y4 跨渠道终端：6 条/6 组。
- Y1、Y2、Y3 已完成；Y3 37/37 条均有独立 runtime disposition；Y4 保持 blocked-until-controlled-channel，禁止缺少渠道或终端能力时猜测放行。
- Recipe 明确 `caseLevelEvidenceRequired=true`、`evidenceInheritanceAllowed=false`；共享的是执行资源，不共享用例结论。
- 产物：contracts/product-center/recipes/yellow-probes/product-center-item-yellow-representative-probe-recipes.json、compile-report.json、manifest.json。

## 绿色 Recipe 草案编译结果

- 绿色 65 条/20 组已全部生成结构草案，编译 65/65，通过；人工语义审核=0。
- 执行审计确认现有绿色依据只是粗粒度同类 runtime 样板，不能自动推导 65 条的精确 capability 和 assertion 绑定。
- 已完成 37 条精确绑定，当前 runtimeExecutable=37、exactBindingRequired=28；剩余草案保持 generationAllowed=false，已阻止假自动化进入运行。
- 产物：contracts/product-center/recipes/green-drafts/product-center-item-green-binding-draft-recipes.json、compile-report.json、manifest.json。

## 黄色 Y1 实时结果

- runId：AUTO_AUDIT_YELLOW_Y1_20260731_01；采用同一 runId 断点续跑，保留已完成证据，仅重试执行器错误和未完成单元。
- 14/14 用例均形成独立证据：12 accepted、2 canonical-conflict、0 environment-blocked、0 executor-error、0 mutation。
- 冲突用例：TC-ITEM-STD-071、TC-ITEM-ADD-035；实时页面点击标准商品/加料商品主图后均未打开大图预览。
- Y1 runtime 状态为 accepted-with-canonical-conflicts；该运行证据已接受，但精确 Recipe 绑定完成前 generationPromotable=0。
- 报告：output/audit/product-center-item-yellow-y1-runtime-AUTO_AUDIT_YELLOW_Y1_20260731_01.json；稳定验收：contracts/product-center/reviews/runtime/product-center-item-yellow-y1-runtime-acceptance.json。

## 优先级判断

- C01-C09 reconciliation 已完成，原先高于“测试方案生成准确用例”的主线阻断已解除。
- “测试方案生成准确的测试用例”第一阶段已完成：90 条符合资格的用例已批量生成并通过准确性门禁，6 条缺陷和 4 条待 PRD 未进入下游。
- 黄色 Y3 已达到 37/37 disposition；标准商品 mega wave 已完成，当前下一最高执行优先级为绿色剩余 28 条套餐商品精确 capability/assertion 按共享组一次性绑定和运行，这是关闭绿色精确绑定分母的直接主线。
- Y1/Y2/Y3 已完成共享执行；后续仍要求逐用例独立留证，继续禁止逐条人工验收和代表证据继承。
- 6 条产品缺陷应批量进入研发修复与复测队列；4 条 needs-prd 应一次性提交产品确认，不采用逐条人工验收。
- W9 仅影响 1 条 P0，且受外部终端能力阻断；在终端条件未具备时低于准确用例生成，不阻塞主线。
- 决策清单：docs/product-center-item-canonical-conflict-reconciliation-2026-07-31.md；机器记录：contracts/product-center/reviews/product-center-item-canonical-conflict-decisions.json。

## 最终验证状态

- W8 实时整波：2 passed；报告为 accepted-with-canonical-conflicts，3/3 完整冲突证据，7/7 ledger residue-verified。
- W2-W8、当前技术状态与 manifest 聚焦合同：14/14 passed。
- C01-C09 决策、XMind 重建、当前技术状态与 manifest 聚焦合同：7/7 passed。
- 90 条准确生成、229 条准确性基准、C01-C09、当前状态和 XMind 联合合同：8/8 passed。
- 准确生成内容检查：重复 ID=0、重复标题=0、模糊动作/空泛预期=0、双重编号=0、敏感信息扫描=0。
- 自动化快车道合同：2/2 passed；139/139 分流完整、重复=0、静态语义重新审核=0、安全扫描通过。
- 黄色共享链 Recipe 合同：2/2 passed；58/58 结构编译通过、34 个共享执行组、逐用例证据门禁开启、证据继承关闭。
- 绿色 Recipe 精确绑定合同：聚焦合同 passed；65/65 结构编译通过，runtimeExecutable=37，剩余精确绑定门禁 28/28 生效。
- Y1 共享执行器合同：2/2 passed；Y1 实时运行 2/2 passed；runtime acceptance 合同 1/1 passed。
- Y3 依赖矩阵、B1/B2/B3/B4 执行与稳定验收合同通过；Y3 已完成 37/37 独立 disposition。B4 实时运行最终 2/2 passed，2 条均为 canonical-conflict、0 executor-error，2/2 ledger residue-verified，3/3 mutation intent cleanup-complete。
- Product Center SOP 合同：通过。
- Product Center Recipe 合同：133/134 passed；唯一失败为另一并行页面审计改动中的套餐 Probe 源码字符串断言，涉及未提交的 item-create-combo 页面/flow/test 文件，本轮未覆盖或回滚。
- TypeScript typecheck：通过。
- 状态与 manifest 语义指纹、9 个 W1-W9 证据 SHA-256、memory 快照 SHA-256、计数一致性与敏感信息扫描：通过。

## 负责人改进项

- P0（已完成）：9 组 canonical conflict 已改为机器可读 review artifact，并接入 promotion/rebuild；下一步将这组命令封装为单一原子任务。
- P0：为并行 Codex 任务强制使用独立 worktree；当前共享脏工作树会让无关套餐审计改动影响全量合同结果。
- P1：统一 W1-W8 runtime report schema；当前 W1 使用数组 verdict，W2-W4 使用 conflictCaseIds，W5-W8 使用 canonicalConflictCaseIds，增加了聚合兼容成本。
- P1：建立 immutable evidence promotion index，替代状态构建器中固定的最终 run 路径，并要求 promotion 时验证清理和敏感信息门禁。
- P1：所有聚合合同默认启用 line/JSON reporter 并保存失败摘要，避免退出码为 1 但无失败用例输出。
- P1：将 memory snapshot 与 SHA256SUMS 生成/校验封装为单一脚本和合同，避免内容更新后手工刷新哈希。
- P2：补外部 POS 终端适配器、订单只读查询和取消能力，解除 W9 blocked；在此之前不允许通过远控信息猜测执行交易。

## 已完成的执行器修复

- 表单输入证据在提交前读取，输入值读取上限为 5 秒。
- 离开商品创建路由后停止读取已消失表单。
- Mutation Intent 允许首尾空格包裹的 AUTO_AUDIT 身份，同时继续拒绝非审计身份。
- W4 通用提交同时观察 POST、表单校验与页面消息，无 POST 时输出脱敏诊断。
- 称重商品严格按“单规格 → 启用称重 → 填写标准价”执行；编辑页使用幂等高级设置展开能力。
- 合同测试：tests/api/product-center-item-p0-remaining-w2.contract.spec.ts。

## 剩余波次

- W9：1 条，外部终端皮重边界；只读门禁检测已完成，状态保持 blocked-until-terminal-access。
- W9 检测：可观察到已连接且 POS 运行中的设备管理页面和远控入口，但没有 agent 可控的收银交易界面、终端交易适配器或交易环境配置。
- W9 安全结果：未创建称重商品、未发起终端交易、未创建订单，mutation=0，新增残留=0；脱敏报告为 output/audit/product-center-item-p0-remaining-w9-blocked.json。

## 2026-08-02 绿色首批精确绑定与图片复核

- 绿色 65 条中首批 3 条已完成真实 capability/assertion 精确绑定：TC-ITEM-STD-064、TC-ITEM-PKG-057、TC-ITEM-PKG-054；generationAllowed 仅对这 3 条开放，剩余 62 条继续禁止运行。
- 新增共享只读执行器 tests/generated/product-center-item-green-readonly-pilot.generated.spec.ts；runId=AUTO_AUDIT_GREEN_READONLY_20260802_01；5/5 独立留证、0 executor-error、0 mutation。
- 实时结果：TC-ITEM-PKG-057 accepted；TC-ITEM-STD-064 因当前商户无 taco 第二语言样本 environment-blocked；TC-ITEM-STD-071 与 TC-ITEM-PKG-054 因当前页无真实业务主图 environment-blocked。
- TC-ITEM-ADD-035 经二次深度复核仍为 canonical-conflict：真实 CDN 主图可点击且 cursor=pointer，但无预览图、无 dialog/modal、无新页面、URL 不变；建议进入产品缺陷队列。
- 首轮 10 分钟失败根因为查询结果单页时分页控件不渲染，执行器错误等待到总超时；已修复为“无分页控件即首页”，同一 runId 对账后仅重跑受影响条目，续跑 2/2 passed。
- 报告：output/audit/product-center-item-green-readonly-runtime-AUTO_AUDIT_GREEN_READONLY_20260802_01.json；绿色编译状态为 partially-bound，runtimeExecutable=3，exactBindingRequired=62。

## 2026-08-02 黄色 Y2 受控负向链

- Y2 用例 TC-ITEM-STD-061 已完成正式受控执行；runId=AUTO_AUDIT_YELLOW_Y2_20260802_03。
- 共享链创建 2 个双选项口味组和 1 个标准商品，全部身份以 AUTO_AUDIT_ 开头；服务端 ID 创建后立即登记。
- 商品编辑页可新增内联 Rule1，左右两侧均可从 Select Attribute 弹窗选择精确选项；PUT /ops-brand/brand-items/standard/{id} 返回 200。
- 重开编辑页后选择前置项，冲突项仍 checked=true、disabled=false、aria-disabled 为空，判定 canonical-conflict，不判执行器失败。
- finally 清理完成：2 个 taste + 1 个 item 共 3/3 ledger residue-verified；未发现残留。
- 首次发现链错误假设“新增规则打开弹窗”，实际为内联新增；该次也完成 3/3 零残留。修复后发现链 2/2 passed，正式链 2/2 passed。
- 稳定验收：contracts/product-center/reviews/runtime/product-center-item-yellow-y2-runtime-acceptance.json；状态 accepted-with-canonical-conflict，generationPromotable=0，仍需精确 Recipe 绑定。

## 2026-08-02 黄色 Y3 首批共享链

- Y3 37 条/19 组已生成机器可读依赖矩阵，完整分为：现有能力可直接执行 9 条、只缺适配器 11 条、缺受控数据 15 条、规则证据不足 2 条；人工逐条审核=0。
- 首批 Y3-B1 一次执行 6 组/9 条，runId=AUTO_AUDIT_YELLOW_Y3_20260802_02；结果 5 accepted、4 canonical-conflict、0 executor-error。
- accepted：TC-ITEM-UI-004、TC-ITEM-UI-005、TC-ITEM-UI-006、TC-ITEM-UI-007、TC-ITEM-UI-008；页面实际批量基础字段入口为扁平菜单，不是旧二级菜单假设。
- canonical-conflict：TC-ITEM-STD-030、TC-ITEM-ADD-041、TC-ITEM-PKG-048 返回列表后均清空名称与类型查询条件；TC-ITEM-ADD-002 的加料商品其他设置未观察到材料信息入口。
- 执行器新增整组断点恢复：只重跑未完成或显式复核的共享组，不重放已完成非幂等操作；批量菜单定位漂移修复后仅复跑 AT54，不重复执行前 6 条。
- 同一 run 历次 3 个临时标准商品均记录服务端 ID；3/3 mutation intent 为 present→cleanup-complete，3 个身份 API=0、UI=0。
- 矩阵：contracts/product-center/recipes/yellow-probes/product-center-item-yellow-y3-execution-matrix.json；报告：output/audit/product-center-item-yellow-y3-runtime-AUTO_AUDIT_YELLOW_Y3_20260802_02.json；稳定验收：contracts/product-center/reviews/runtime/product-center-item-yellow-y3-b1-runtime-acceptance.json。

## 2026-08-03 黄色 Y3 第二批适配器共享链

- Y3-B2 一次执行 6 个矩阵组/11 条适配器用例，runId=AUTO_AUDIT_YELLOW_Y3_B2_20260802_01；最终 5 accepted、6 canonical-conflict、0 executor-error、人工逐条审核=0。
- accepted：TC-ITEM-STD-019、TC-ITEM-STD-084、TC-ITEM-STD-085、TC-ITEM-ADD-007、TC-ITEM-ADD-009；称重销售单位 g/kg/ml、多规格拖拽顺序、无分类加料与零价格均按保存重开证据通过。
- canonical-conflict：TC-ITEM-STD-086 的口味子项开关实际只能保留最后一项；TC-ITEM-ADD-011/049 保存前包装费 1.00、成本 3.50，重开后均为空。
- 图片冲突：TC-ITEM-ADD-022/025/038 的上传接口均返回 HTTP 200、code=0、message=success 和完整 CDN URL，且无待确认弹窗，但表单未形成预览状态，保存后详情 API 无图片、列表仍为占位图；ADD-025 的描述与统计标签可正常持久化。
- 执行器已修复 Selling Unit 真实价格表格定位、图片响应级诊断、分组断点恢复和中断 mutation 启动对账；非幂等中断后先清理再恢复证据，禁止盲目重放。
- 累计 49 个 mutation intent 全部 cleanup-complete；40 个历史临时商品身份 API=0、UI=0，最终当前批 ledger 3/3 residue-verified，无 cleanup diagnostic。
- 报告：output/audit/product-center-item-yellow-y3-b2-runtime-AUTO_AUDIT_YELLOW_Y3_B2_20260802_01.json；稳定验收：contracts/product-center/reviews/runtime/product-center-item-yellow-y3-b2-runtime-acceptance.json。

## 2026-08-03 黄色 Y3 第三批受控数据共享链

- Y3-B3 一次处理 15 条受控数据用例，runId=AUTO_AUDIT_YELLOW_Y3_B3_20260803_01；最终 8 accepted、1 canonical-conflict、6 environment-blocked、0 executor-error、人工逐条审核=0。
- accepted：TC-ITEM-ADD-018/019/020/045、TC-ITEM-PKG-020/036/042/043；描述标签、角标、统计标签、套餐包装费、套餐其他信息及固定/可选套餐组移除均按保存重开或弹窗终态证据通过。
- canonical-conflict：TC-ITEM-UI-003 点击真实“复制”菜单后未进入新增商品编辑页，而是直接在列表生成同名副本；因此无法按 canonical 流程设置唯一名称并验证打印档口继承。
- environment-blocked：TC-ITEM-STD-025/026/027 缺可控行业商品库样本；TC-ITEM-ADD-033 缺加料组新增页唯一选择器合同；TC-ITEM-ADD-039 缺商品表单图库按图片身份唯一选择合同；TC-ITEM-ADD-021 缺可控过敏原与营养成分创建/清理适配器。
- 复制动作产生的 2 个未登记同名副本已通过 UI 精确行服务端 ID 补对账并清理；最终 45/45 ledger residue-verified，7/7 mutation intent cleanup-complete，4 个历史商品身份 API=0、UI=0。
- 执行器修复：描述标签未切换时进入用例证据而非 harness error；套餐依赖使用创建台账服务端 ID；SKU 按 skuList[].id 解析；UI 残留按唯一身份与 data-row-key 对账，不再以整表为空代替身份零残留。
- 报告：output/audit/product-center-item-yellow-y3-b3-runtime-AUTO_AUDIT_YELLOW_Y3_B3_20260803_01.json；稳定验收：contracts/product-center/reviews/runtime/product-center-item-yellow-y3-b3-runtime-acceptance.json。
- Y3-B1/B2/B3 累计：35/37 条已有独立 runtime disposition，其中 18 accepted、11 canonical-conflict、6 environment-blocked。

## 2026-08-03 黄色 Y3 第四批规则证据共享链

- Y3-B4 一次处理最后 2 条规则证据用例，runId=AUTO_AUDIT_YELLOW_Y3_B4_20260803_01；最终 0 accepted、2 canonical-conflict、0 executor-error、人工逐条审核=0。
- TC-ITEM-ADD-012：154 字符原始商品名在输入框被截断，但连续空格保留并触发“字符之间只允许单空格”；未发出保存请求、未创建记录，与“保存成功后自动格式化”不一致。
- TC-ITEM-ADD-013：POS/送厨名称的连续空格在提交前归一，POST 返回 HTTP 200、code=0、success；详情 API 回读时 emoji 被移除、`@#` 保留，但加料商品编辑页无法展示 POS/送厨字段，与 canonical 的编辑页回读流程不一致。
- 首次执行在编辑页高级字段读取处中止；同一 runId 先对账并清理 ID 261390 后仅复跑未完成用例。第二次已形成完整证据但被双空格搜索词的严格请求匹配阻断最终 UI 残留检查；修复后第三次只做恢复验收，未重放任何保存。
- 最终 3 个审计身份 API=0、UI=0；2/2 ledger residue-verified，3/3 mutation intent cleanup-complete，无 execution/cleanup diagnostic。
- 报告：output/audit/product-center-item-yellow-y3-b4-runtime-AUTO_AUDIT_YELLOW_Y3_B4_20260803_01.json；稳定验收：contracts/product-center/reviews/runtime/product-center-item-yellow-y3-b4-runtime-acceptance.json。
- Y3 最终累计：37/37 条已有独立 runtime disposition，其中 18 accepted、13 canonical-conflict、6 environment-blocked；Y3 无剩余未判定用例。

## 2026-08-03 绿色 AT15 主图替换共享链

- TC-ITEM-STD-078 已完成精确 capability/assertion 绑定并通过 GREEN-AT15 共享执行器运行；绿色分母更新为 runtimeExecutable=4、exactBindingRequired=61，人工逐条审核=0。
- runId=AUTO_AUDIT_GREEN_AT15_20260803_01；首张主图上传接口 HTTP 200、code=0，页面进入 preview-ready，保存 HTTP 200 且重开仍回显 1 张主图。
- 首图完成后页面真实交互面为：uploadArea=0、fileInput=0、Local=0，仅保留图片卡片和删除图标；无法继续选择第二张图片，因此与“第二张覆盖第一张” canonical 不一致，判定 canonical-conflict，不判执行器失败。
- 首次执行暴露旧适配器把原上传区当作替换入口并等待 60 秒；新增首图终态、控件面和有界请求诊断后，正式链 57 秒完成，0 executor-error。
- 创建商品 ID 30998 后立即登记；finally 清理完成，API=0、UI=0、ledger 1/1 residue-verified、mutation intent 1/1 cleanup-complete。
- 报告：output/audit/product-center-item-green-at15-runtime-AUTO_AUDIT_GREEN_AT15_20260803_01.json；稳定验收：contracts/product-center/reviews/runtime/product-center-item-green-at15-runtime-acceptance.json。

## 2026-08-03 绿色 AT39 套餐 MOQ 共享链

- TC-ITEM-PKG-016 已完成精确绑定并通过 GREEN-AT39 共享链；绿色分母更新为 runtimeExecutable=5、exactBindingRequired=60，人工逐条审核=0。
- runId=AUTO_AUDIT_GREEN_AT39_20260803_01；套餐创建保存前 MOQ=`2`，POST /ops-brand/brand-items/combo 返回 HTTP 200，成功提示=1，列表唯一记录=1、价格=10.00，编辑页回读 MOQ=`2`，结论 accepted。
- 精确绑定发现 fast-lane 将标题中的“大于 1”误归为 negative；为保持既有 54 组编号与审计产物稳定，在精确绑定层校正 action=create，未重排历史分组。
- 首次实跑因共享流错误假设浏览器已在商品列表而中止，未触发商品保存；2 个依赖对象均 residue-verified。修复为显式从列表进入后，同一 runId 先恢复对账再重跑。
- 正式链创建套餐商品 ID 261394 后立即登记；最终累计依赖商品、套餐组和商品 5/5 ledger residue-verified，mutation intent 1/1 cleanup-complete，API/UI 全零残留。
- 报告：output/audit/product-center-item-green-at39-runtime-AUTO_AUDIT_GREEN_AT39_20260803_01.json；稳定验收：contracts/product-center/reviews/runtime/product-center-item-green-at39-runtime-acceptance.json。

## 2026-08-03 绿色 AT09 标准商品价格规格共享链

- AT09 四条 P1 用例 TC-ITEM-STD-020/048/050/098 已完成精确 capability/assertion 绑定并通过同一共享波次运行；绿色分母更新为 runtimeExecutable=9、exactBindingRequired=56，人工逐条审核=0。
- runId=AUTO_AUDIT_GREEN_AT09_20260803_05；TC-ITEM-STD-020 保存前价格 1.99，POST standard 返回 HTTP 200，列表唯一记录价格 1.99，结论 accepted。
- TC-ITEM-STD-048 的真实入口为 Select Specification Group 弹窗内无 ARIA role 的 `span.gotocreate___*`；点击后新开 `/pp/brand/spec/create`，新页证据读取后受控关闭，结论 accepted。
- TC-ITEM-STD-050 保存前包装费 1.00，创建 HTTP 200，编辑页回读 1.00；TC-ITEM-STD-098 保存前成本 5.00，创建 HTTP 200，编辑页回读 5.00；两条均 accepted。
- 首轮诊断将两位小数回显错误按整数比较，并把 `Go Create` 错认成 `Create`；后续先稳定规格组列表、记录真实节点契约和新页路径。最终同一 runId 仅用已有证据重新分类并复核零残留，未重放三次非幂等创建。
- 三个标准商品创建后立即登记服务端 ID；最终 API/UI 全零，3/3 ledger residue-verified，3/3 mutation intent cleanup-complete，0 executor-error。
- 报告：output/audit/product-center-item-green-at09-runtime-AUTO_AUDIT_GREEN_AT09_20260803_05.json；稳定验收：contracts/product-center/reviews/runtime/product-center-item-green-at09-runtime-acceptance.json。

## 2026-08-05 绿色 GREEN-VALIDATION-01 十一条校验共享波

- AT06/AT10/AT16/AT18/AT20/AT23/AT24 的 11 条用例已一次性完成精确 capability/assertion 绑定和共享执行，不进行逐条人工验收；绿色分母由 runtimeExecutable=9、exactBindingRequired=56 更新为 runtimeExecutable=20、exactBindingRequired=45。
- runId=AUTO_AUDIT_GREEN_VALIDATION_01_20260805_01；11/11 均有独立运行证据，4 accepted、7 canonical-conflict、0 human-review、0 executor-error，稳定验收状态为 accepted-with-canonical-conflicts。
- accepted：TC-ITEM-STD-035（父分类删除后子分类不显示）、TC-ITEM-STD-049（多规格时称重开关禁用）、TC-ITEM-STD-059（已引用口味组不显示组内新增子项控件）、TC-ITEM-STD-095（价格第三位小数按页面规则四舍五入）。
- canonical-conflict：TC-ITEM-STD-046 与 TC-ITEM-STD-101 的 21 字符值被前端截断为 20 后成功保存；TC-ITEM-STD-094 的 POS 名称首尾空格可成功保存；TC-ITEM-STD-051 的 1000000.00 价格可成功保存；TC-ITEM-STD-045 的商品描述真实 maxlength=100 而非 500。
- 图片规则冲突：TC-ITEM-STD-054 的第 1 至 11 次上传接口均返回 HTTP 200/businessCode=0，但表单明细卡片数保持 0；TC-ITEM-ADD-017 的 10 次上传接口均成功，保存商品后重新打开明细图片仍为 0。两条均保留为产品/页面契约修订输入，禁止直接晋级 generationAllowed。
- 所有创建身份均以 AUTO_AUDIT_ 开头并立即登记服务端 ID；17/17 ledger residue-verified、10/10 mutation intent cleanup-complete，商品/分类/口味组 API 与 UI 残留均为 0；报告和验收产物未持久化密码、令牌、Cookie、Authorization 或浏览器存储状态。
- 报告：output/audit/product-center-item-green-validation-01-runtime-AUTO_AUDIT_GREEN_VALIDATION_01_20260805_01.json；稳定验收：contracts/product-center/reviews/runtime/product-center-item-green-validation-01-runtime-acceptance.json；报告 SHA-256=9b0e3d4b65d780850b74609a6391135165f143393a92928073330213d5fab84e。
- 7 条冲突不回退为人工逐条审核：统一进入 canonical repair/产品缺陷队列，按实际页面证据批量修订来源、用例和断言后再整波复测。

## 2026-08-05 绿色 GREEN-STANDARD-MEGA 十七条标准商品共享波

- AT01/AT05/AT08/AT19/AT21 的 17 条用例已一次性完成精确 capability/assertion 绑定和共享实时执行；绿色分母由 runtimeExecutable=20、exactBindingRequired=45 更新为 runtimeExecutable=37、exactBindingRequired=28，精确绑定完成度由 30.8% 提升至 56.9%。
- runId=AUTO_AUDIT_GREEN_STANDARD_MEGA_20260805_01；整波实时运行 2 passed、耗时约 4.7 分钟，17/17 独立留证，0 executor-error、0 人工逐条审核。
- generation-promotable 7 条：TC-ITEM-STD-006、042、053、055、063、065、100；覆盖无子级一级分类创建、本地主图创建、多个描述标签、分页 10/20/50/100、高级设置八字段、停用商品启用和多个统计标签持久化。
- canonical-conflict 7 条：TC-ITEM-STD-009 的 POS/送厨名称保存后仍保留超长与特殊字符；TC-ITEM-STD-099 商品角标选择成功且更新 HTTP 200，但重新打开未回显；TC-ITEM-STD-003/004/052/072/073 在已正常加载页面分别缺少展示列设置、语言切换、图片库主图入口和还原默认列能力，当前列表直接展示 18 个字段。
- 原始 runtime 将上述 5 个“页面正常但入口不存在”的用例暂记 environment-blocked；稳定验收按来源优先级机器重分类为 canonical-conflict，未重放任何创建、更新或状态切换操作，evidenceReclassifiedCaseIds=5。
- environment-blocked 3 条：TC-ITEM-STD-033、056 缺少可控过敏原与营养成分创建/定位/清理契约；TC-ITEM-STD-034 缺少可控行业商品库继承和同步范围适配器。页面入口已观测，不允许选择共享业务数据伪造通过。
- 受控资源全部以 AUTO_AUDIT_ 身份创建并立即登记；18/18 ledger residue-verified、13/13 mutation intent cleanup-complete，商品/分类 API 与 UI 均为 0 残留，列配置和语言偏好残留为 0。
- 报告：output/audit/product-center-item-green-standard-mega-runtime-AUTO_AUDIT_GREEN_STANDARD_MEGA_20260805_01.json，SHA-256=a4c285e0ced580b7efb72418dc724160e5fa5aa182653f500bc2370b4ea3b219；稳定验收：contracts/product-center/reviews/runtime/product-center-item-green-standard-mega-runtime-acceptance.json。
- 7 条冲突进入同一 canonical repair 批次，3 条阻断进入环境适配器队列；两类均不转回人工逐条审核，修订或解阻前禁止 generationAllowed 晋级。

## 下一恢复点

1. 下一批执行剩余套餐商品 mega wave：AT42 2 条、AT43 7 条、AT45 4 条、AT47 12 条、AT50 3 条，共 28 条一次性补精确绑定并共享运行；完成后绿色分母将从 37/28 推进到 65/0，精确绑定主线闭环。
2. 将 GREEN-VALIDATION-01 与 GREEN-STANDARD-MEGA 合计 14 条 canonical conflict 按页面规则、入口缺失、保存不持久化三类批量修订 canonical 来源、用例预期和自动化断言；禁止转回逐条人工审核。
3. 为 TC-ITEM-STD-033/034/056 补可控过敏原、营养成分、行业商品继承与同步适配器，解阻后作为一个 3 条共享波复测；不得使用共享业务数据绕过清理门禁。
4. 将 Y1/Y2/Y3 的历史 canonical conflict 与 B3 环境阻断批量进入缺陷、规则或适配器队列；blocked 用例继续禁止晋级 generationAllowed。
5. Y4 和 W9 独立等待外部渠道或终端能力，不阻塞剩余套餐绑定主线。
