# 变更事件采集

用例、业务规则、API/UI 脚本和绑定的受管保存/提交入口统一调用公共 `recordChangeEvent`；命令行也可用于人工保存后的登记：

```powershell
npm run record:product-center:change -- `
  --object-type=business-rule `
  --object-id=BR-ITEM-010 `
  --after-file=contracts/product-center/business-rules/generated/current.json `
  --before-file=contracts/product-center/business-rules/generated/previous.json `
  --changed-by=<操作者> --change-source=manual-save --change-reason=<原因>
```

事件会追加到 `output/audit/product-center-events.jsonl`，内容经过脱敏并包含前后快照、字段差异、指纹和影响用例。报告生成时只读取显式事件和证据引用，不扫描历史测试目录。

支持的对象类型：`test-case`、`business-rule`、`api-script`、`ui-script`、`binding`、`test-plan`。

历史记录没有快照时只显示指纹证据；从本功能启用后产生的保存/提交事件才具备可读原文和差异。
