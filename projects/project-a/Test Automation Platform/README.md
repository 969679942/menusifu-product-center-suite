# MenuSifu Test Platform

这是跨测试方案、跨应用的公共测试流程核心。它不保存任何接入项目的页面、API、业务规则、测试方案或产品数据。

## 公共职责

- 编译来源可追溯的测试方案和 Recipe。
- 校验上下文、断言面、精确提示、清理证据和运行授权。
- 生成运行收据、执行账本、实现指纹和状态裁决。
- 处理幂等检查点、失败分类、重试边界和平台级就绪度。
- 编排项目验收清单、路由残留扫描、检查点恢复和诊断脱敏。
- 统一 Allure 保留、合同变更影响、增量执行计划和审核批次治理。

## 推荐决策契约

公共流程输出的每一项推荐必须同时说明：

- 目的：为什么现在执行或暂缓。
- 预期结果：完成后应产生哪些可验证的资产、状态或证据。
- 后续影响：对当前方案、其他方案、后续运行和接入成本的影响。

推荐必须明确标记为 `必须`、`可选` 或 `暂不建议`。缺少这三问或缺少优先级标记时，流程不得把建议当作已完成的执行结论。

## 项目接入

项目只能通过项目适配器中的 `systems/<system-id>/manifest.json` 声明系统身份，并在适配器中提供认证、上下文、业务能力、断言和清理实现。项目级 readiness、执行账本、评审结果和迁移审计必须由接入项目提供输出根目录，公共平台不设置项目默认输出目录。

新项目先建立独立适配描述和项目产物身份：

```powershell
npm run scaffold:project-adapter -- --project-root=<项目自动化根目录> --application-id=<应用ID> --project-id=<测试项目ID> --business-domain-id=<业务域ID> --reference-closure-audit=<闭环审计相对路径> --reference-module=<参考模块>
```

命令生成 `adapters/test-automation-platform/project-adapter.json`、迁移清单和 `deliverables/system-test-platform/artifact-manifest.json`。项目补齐迁移清单后，只有其他迁移门禁全部通过才允许执行以下命令建立或接受迁移哈希基线：

```powershell
npm run audit:migration-closure -- --manifest=<项目迁移清单> --write-baseline --approved-by=<操作者> --reason=<接受原因>
```

批准人、原因、前后基线指纹、增删改文件和收据哈希链会写入项目产物目录。缺少批准参数、收据缺失、收据被修改、基线与最后收据不匹配或重复接受同一基线都会失败。

脚手架可以幂等重跑，但已有描述或产物身份与本次参数不一致时会在写入前停止。正常构建、评审和迁移收口只能校验身份清单，不会在身份清单缺失时静默重建；身份缺失必须回到显式接入或恢复流程处理。

项目生命周期配置完成后，公共命令仅凭项目根目录执行派生状态刷新：

```powershell
npm run lifecycle:project -- --project-root=<项目自动化根目录> --action=readiness
npm run lifecycle:project -- --project-root=<项目自动化根目录> --action=review
npm run lifecycle:project -- --project-root=<项目自动化根目录> --action=strict
npm run lifecycle:project -- --project-root=<项目自动化根目录> --action=close
```

`close` 统一刷新 readiness、评审队列、最终裁决、外部依赖检查点和迁移报告；它不注册或运行项目业务用例。
所有生命周期动作都会先执行迁移完整性预检。受管文件存在未接受的新增、删除或修改时，`readiness`、`review`、`strict` 不写入任何派生状态；`close` 只更新迁移失败报告并以非零状态结束。
`review`、`verdict`、`strict` 即使被单独调用，也会先刷新当前 readiness，再生成或消费评审、裁决状态；不会沿用旧的 readiness 文件。
治理文件指纹使用 `platform/`、`project/`、`workspace/` 等逻辑身份和文件内容哈希，不使用盘符或绝对路径；跨磁盘部署只要逻辑身份和内容不变，指纹保持稳定。
迁移基线接受采用可恢复事务文件。基线或收据写入中断时，审计会阻断并保留事务，下一次带批准参数的基线命令会校验当前资产和哈希链后恢复；当前资产再次变化时必须人工处理，不能静默覆盖。

## 隔离规则

- 公共平台源码禁止引用具体项目、系统和业务域名称；具体项目身份由项目适配清单治理。
- 项目方案、审计数据、页面对象、API 合同、数据工厂、业务运行报告和业务资产索引必须留在项目适配器目录。
- 平台级算法和合同留在公共平台；readiness、review queue、release、跨方案基线、运行账本和迁移报告写入当前项目提供的输出根目录。
- 平台完成门禁与项目交付门禁分离；缺少第二系统不能否定已经闭环的接入项目方案。
- 新项目必须通过公共编译器、语义重复、断言面、上下文、证据、清理和执行账本门禁。

## 目录职责

- `src`：公共合同、执行器、证据和治理实现。
- `scripts`：公共编译、脚手架、运行和门禁命令。
- `tests`：不依赖具体业务域的公共契约测试。
- `deliverables`：仅保存公共模板或测试产生的瞬态状态；项目治理状态由项目适配器保存。
- 项目目录：只保存项目适配器、业务测试方案、业务数据、页面/API 证据和项目交付物。
