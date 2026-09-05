# 商品中心 API 自动化架构

## 完成口径

- `Playwright passed`：脚本完成请求、获得响应并完成结果分类。
- `success`：接口返回成功响应，但不自动等同于业务字段和持久化规则已通过。
- `validation-response`：接口按当前请求返回参数校验结果，属于合同观测，不是正向 CRUD 通过。
- `fixture-required`：缺少可创建、可查询、可清理的前置业务数据。
- `context-required`：缺少门店、任务、菜单或其他运行上下文。
- 只有端点专属断言、数据持久化验证和清理验证全部通过，才能记为业务合同通过。

`output/brand-menu-api-tests.json` 的 `completion` 字段是正式完成口径。生成接口脚本当前属于 `request-observation`，不得表述为活动接口已完成业务 CRUD。

## 分层

1. 接口来源：`../contracts/api/operations/brand-menu.operations.json` 保存应用生命周期过滤后的活动品牌接口；原始 API 文档和生命周期登记表分别保留来源与状态。
2. 生成器：`scripts/generate-brand-menu-api-tests.ts` 优先按接口文档标签划分业务域。
3. 业务分片：`tests/api/endpoints/brand-menu/generated/group-01.spec.ts` 至 `group-17.spec.ts`，共 17 个文件。
4. 账号上下文：`api/core/merchant-center-account-context.ts` 统一环境、品牌、门店和凭据来源。
5. 令牌管理：`api/core/merchant-center-token-provider.ts` 提供 worker 级缓存、并发登录去重、过期判断和脱敏证据。
6. API 夹具：`fixtures/product-center-api.fixture.ts` 按需认证；生成接口显式获取认证证据。
7. 商品中心组合根：`fixtures/product-center.fixture.ts` 让既有 CRUD 和 UI 前后置 API 共用令牌提供器，纯 UI 用例不触发 API 登录。
8. 运行准备：`scripts/prepare-brand-menu-api-test-run.ts` 清除陈旧分片和聚合结果。
9. 结果聚合：`scripts/aggregate-brand-menu-api-tests.ts` 校验活动 operation key 无缺失、无新增、无重复，并将历史报告中的生命周期废弃接口单独记录。
10. 资源治理：`api/core/api-test-resource-registry.ts` 要求写操作使用真实服务端 ID 登记资源，并按清理优先级分层、同层并发清理。
11. 阻断治理：`scripts/build-brand-menu-api-blocker-plan.ts` 将授权边界、文档先于部署、请求合同冲突、实体夹具和上传夹具分开处理，禁止把所有 `403/404/500` 统称为缺少夹具。
12. 请求格式门禁：OpenAPI 声明 `multipart/form-data` 时，通用探测器在文件夹具缺失时于请求前阻断；`api/operation-client.ts` 只有收到明确 multipart 数据后才发送请求，禁止降级为 JSON。

## 并发策略

- 借鉴 POS2.0 的 `pendingToken` 模式：同一 worker 内并发请求令牌时只允许一次登录，其余调用复用同一个 Promise。
- API 资源清理按依赖优先级倒序执行；同一优先级使用并发清理，不同优先级不得越级并发。
- Playwright 业务执行保持 `workers=1`，直到数据工厂、服务端资源 ID 和清理结果证明用例间完全隔离；令牌和清理并发不等于业务用例可并发。

## 账号配置

- 直接令牌：`MC_ACCESS_TOKEN`。
- 账号登录：`MC_USERNAME` 和 `MC_PASSWORD`。
- 业务上下文：`MC_BRAND_ID`；门店接口还需要 `MC_POI_ID`。
- 环境与地址：`MC_ENVIRONMENT`、`MC_AUTH_API_BASE_URL`、`MC_ITEM_API_BASE_URL`、`MC_PLATFORM_ITEM_API_BASE_URL`。
- 凭据可来自进程环境或 `.secrets/runtime.env`，不得写入测试文件、报告或检查点。
- 报告只保存凭据来源、认证时间和不可逆令牌指纹，不保存令牌、密码、Cookie 或浏览器存储。

## 执行命令

```powershell
npm run test:product-center:api:brand-all
```

命令按顺序执行生成、陈旧结果清理、单 worker 批量运行和聚合。单独执行 `npm run aggregate:product-center:api:brand-all` 只重新聚合现有分片，不发起接口请求。

```powershell
npm run build:product-center:api:brand-blockers
```

该命令根据最近一次活动接口结果生成阻断治理计划，不发起接口请求。任何 `POST`、`PUT`、`DELETE` 阻断复核必须先通过资源注册器登记真实服务端 ID。

当前接口生命周期登记已将 `/ops-brand/menu-import/upload` 标记为 `deprecated`，不进入活动目录、生成脚本或活动阻断清单；历史结果只保留生命周期排除记录。替代接口和证据见 `Merchant Center API/api-lifecycle-registry.json`。

## 后续建设

下一阶段按业务域建设端点专属客户端、数据工厂、资源登记和清理，并优先闭环 `fixture-required` 与 `context-required`。完成后再将通用请求观测脚本逐步升级为可证明业务语义的正向 CRUD、负向校验和幂等性测试。
