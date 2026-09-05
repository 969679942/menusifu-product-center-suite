# 商品中心测试用例命名规范

## Canonical ID

对外测试方案使用：`TC-PC-<MODULE>-<ACTION>-<NNN>`。

- `MODULE` 使用固定模块代码，例如 `ITEM`、`GROUP`、`SEASON`、`TAG`、`RECIPE`、`PRINT`、`MENU`、`STOREOPS`、`STOREPROD`。
- `ACTION` 使用固定动作代码：`CREATE`、`EDIT`、`DELETE`、`NEG`、`BOUNDARY`、`READ`。
- `NNN` 是同一模块与动作下的三位序号，从 `001` 开始。
- 已发布 canonical ID 必须复用，不因新增用例重新编号。

现有内部 caseId（例如 `create:seasoning`）继续作为 Recipe、Claim 和运行证据的稳定主键，不批量重命名。canonical ID 只用于正式测试方案交付层。

## 标题

- 标题必须包含明确对象、条件或动作以及可观察结果。
- 禁止只写“验证”“检查”“正常”“功能测试”“页面正常”。
- 不得根据标题、现有自动化脚本或行业惯例反推业务规则。
- 业务含义不明确时保持 blocked，不通过改标题制造可执行性。

## 来源与步骤

- 每条正式生成用例必须具备 PRD明确、XMind已有、BR明确或符合单步规则的可推导来源。
- 前置、操作和预期使用单层 `1.` 编号，禁止 `1. 1`、`7~8` 或 `====` 残留。
- 预期必须是 UI、API、网络、下载或后台任务的可观察终态，禁止使用“正常”“成功展示”等空泛描述。
