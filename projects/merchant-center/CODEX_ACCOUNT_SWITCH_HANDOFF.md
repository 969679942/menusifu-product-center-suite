# Codex 账号切换交接记录

> 创建时间：2026-08-18（Asia/Shanghai）
> 目的：在切换回 Codex 账号登录前，保留当前任务上下文、工作区状态和本地会话备份。

## 当前工作区

- 工作区：`D:\Menusifu\Merchant Center`
- Git 分支：`master`
- 当前 HEAD：`870ddf3201f867392b4339762caf8a080aa76975`
- 备份时工作区状态：`577` 项既有未提交或未跟踪改动
- 重要约束：不要执行 `git reset`、`git clean`、批量删除或覆盖现有改动；本次账号切换不应改变代码工作区。

## 项目恢复入口

1. 先阅读 `MEMORY.md`。
2. 再阅读 `.memory/product-center-current-state.md` 和 `.memory/product-center-recovery-point.md`。
3. 当前长期恢复点的最后一节是“2026-07-29 TC-ITEM-STD-007 只读 UI Probe 最终恢复点”。
4. 该恢复点明确：不要重放已完成的 `TC-ITEM-STD-007` UI Probe、Gold、主 46 条或 full；下一优先级是把已接受的 runtime evidence 精确回绑到 canonical/规则证据账本，并保持不自动改写正式业务规则。
5. `Merchant Center UITest\AGENTS.md` 包含该测试目录的页面对象、Flow、认证上下文、数据清理和禁止幻读等规则；修改该目录前先阅读。

## 当前 Codex 会话备份

- 当前会话 ID：`01a01299-9940-7311-9eef-1bedcc6925fa`
- 原始本地会话文件：`C:\Users\Administrator\.codex\sessions\2026\08\18\rollout-2026-08-18T10-00-51-01a01299-9940-7311-9eef-1bedcc6925fa.jsonl`
- 独立备份目录：`C:\Users\Administrator\Documents\Codex Account Backups\2026-08-18_101935`
- 压缩备份：`C:\Users\Administrator\Documents\Codex Account Backups\2026-08-18_101935.zip`
- 备份清单：`C:\Users\Administrator\Documents\Codex Account Backups\2026-08-18_101935\manifest.json`
- 当前会话备份 SHA-256：`80D448176F64BA2985EEE54CC18CA2D65BC4754B4663B212D78B5F91E4DCB968`

备份包含当前会话 JSONL、项目 `MEMORY.md` 和 `.memory` 目录；没有复制登录凭据、Cookie、Token、浏览器存储、`.secrets` 或 `.env` 文件。

## 切换后恢复步骤

1. 切换并登录目标 Codex 账号后，重新打开工作区 `D:\Menusifu\Merchant Center`。
2. 如果历史任务没有显示，打开本文件，把本文件内容作为新任务的第一条上下文；必要时附上压缩备份路径。
3. 优先从 `MEMORY.md` 和 `.memory\product-center-recovery-point.md` 恢复项目上下文，不要从旧聊天记忆推断业务规则。
4. 继续工作前先执行 `git status --short --branch`，确认现有 `577` 项改动仍在；不要为了“整理工作区”而重置它们。
5. 若需要审阅历史聊天原文，使用备份中的 `current-session.jsonl`，不要把其中可能包含的敏感数据复制进源码、报告或提交。

## 本次用户请求

用户准备切换回 Codex 账号登录，担心历史上下文丢失；已先完成本地交接和会话备份，再进行账号切换。

