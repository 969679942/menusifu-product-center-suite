# 商品中心技术绑定候选与审批

## 目的

将已确认的测试方案与 clean 页面合同观测组合为技术绑定候选。候选只复用已通过 runtime acceptance 的 Gold Recipe，不从标题、步骤、行业惯例或自动化失败推导业务规则。

## 生成候选

```powershell
npm run build:product-center:technical-binding-candidates
```

候选和审批请求输出到：

- `output/test-case-audit/product-center/technical-binding-candidates-latest.json`
- `output/test-case-audit/product-center/technical-binding-approval-request-latest.json`
- `output/test-case-audit/product-center/technical-binding-approval-request-latest.md`

候选记录 route、capability、assertion、Claim、seed、cleanup 和 Recipe 模板各自的证据来源。第一项 capability 必须是 `navigation.sidebar.open`。

## 人工审批

审核人基于审批请求另存正式审批文件，将逐条 `decision` 改为 `approved` 或 `rejected`，并填写 `reviewedBy`、`reviewedAt` 和 `reason`。不得修改 `candidateFingerprint`、`pageObservationFingerprint` 或 `candidateHash`。

审批缺失、拒绝、候选变化、页面观测变化或审核信息不完整时，编译必须失败。

正式审批文件固定保存为：

- `contracts/product-center/reviews/product-center-technical-binding-approvals.json`

该文件存在后，普通候选构建和本地质量流水线会自动加载并校验审批，不需要重复传入 `--approvals`。候选或页面观测变化时构建会先刷新审批请求，再因旧审批指纹失效而失败；必须重新审核，不得复用旧决定。

## 编译已审批产物

```powershell
npm run build:product-center:technical-binding-candidates -- --approvals <approval.json>
```

审批全部通过后才生成：

- `contracts/product-center/test-cases/generated/product-center-approved-technical-bindings.json`
- `contracts/product-center/recipes/product-center-approved-technical-bindings-recipes.json`
- `tests/generated/product-center-approved-technical-bindings.generated.spec.ts`

生成的 bindings 可作为 `build:product-center:test-plan-intake-v1 -- --bindings <path>` 输入。生成的 Recipe 和 spec 仍必须经过真实 UI、Evidence、Runtime Acceptance 与零残留门禁，静态审批本身不能晋级运行通过。

## 独立运行验收

审批和静态合同通过后，执行一次完整 approved 套件：

```powershell
npm run test:product-center:approved-technical-bindings
```

runner 会在 `output/recipes/runs/product-center-approved-technical-bindings/<runId>/` 写入不可变 `selection / feedback / evidence / performance / acceptance` 五件套，并在 full 通过时发布 approved 集合 latest 反馈、证据和验收。

日常只读维护使用：

```powershell
npm run maintain:local
```

该入口不会重复 approved UI，但会重新校验审批指纹、独立 runtime acceptance、Claim、侧边栏、安全扫描和零残留。`pipeline:product-center:full` 才会将 approved UI 作为 `state-verification-required` 阶段执行。
