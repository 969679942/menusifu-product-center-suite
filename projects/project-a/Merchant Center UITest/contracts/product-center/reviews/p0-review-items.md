# 商品中心 P0 人工审核清单

> 更新时间：2026-07-24  
> 当前待审核：94 条。原 98 条中已有 4 条获得人工结论并移出 P0。  
> 原始机器清单：[p0-review-items.json](./p0-review-items.json)

## 已确认并移出 P0

| 原序号 | P0 ID | 人工结论 | 合同处理 |
|---:|---|---|---|
| 1 | `api-unresolved:7155f5639efe` | 开通 OMS 不支持自动化调用 | 转为已确认自动化排除规则 |
| 2 | `api-unresolved:840e59962052` | 开通 AD 不支持自动化调用 | 转为已确认自动化排除规则 |
| 3 | `field-boundary-drift:3346748f34ca` | 统计标签第二语言字段存在；标签名称最大 50，标签组名称最大 10 | 更新字段合同并允许生成边界用例 |
| 4 | `field-boundary-drift:a0757da39219` | 描述标签第二语言字段存在；标签名称最大 50，标签组名称最大 10 | 更新字段合同并允许生成边界用例 |

## 当前分类

| 类型 | 数量 | 主要确认人 | 是否需要产品 |
|---|---:|---|---|
| Postman URL 不完整 | 2 | Postman维护人 + 测试 | 通常不需要 |
| 鉴权定义缺失 | 2 | 后端/鉴权维护人 + 测试 | 通常不需要 |
| 服务地址未定 | 2 | 后端/API维护人 + 测试 | 通常不需要 |
| 接口用途摘要缺失 | 88 | 后端/API文档维护人；业务用途不明时产品参与 | 仅业务用途不明时 |

## 建议优先审核的 6 条

| 序号 | P0 ID | 类型 | 接口 | 需要确认 | 确认人 | 建议处理 |
|---:|---|---|---|---|---|---|
| 1 | `api-unresolved:0fdcc6d32203` | Postman URL 不完整 | `GET New Request` | 补全请求“New Request”的完整 URL、变量来源及用途；无效样例则删除 | Postman维护人 + 测试 | 补齐或删除无效请求 |
| 2 | `api-unresolved:7132a66c02d7` | 服务地址未定 | `brand-menu (MC_ITEM_API_BASE_URL)` | 确认 MC_ITEM_API_BASE_URL 的完整域名、公共前缀及环境差异 | 后端/API维护人 + 测试 | 写入环境合同后自动复验 |
| 3 | `api-unresolved:a100d7a97ea7` | 鉴权定义缺失 | `industry-item ()` | 确认实际鉴权方式、Token 来源、BrandId 等必需请求头及失效规则 | 后端/鉴权维护人 + 测试 | 补充安全方案并用只读接口验证 |
| 4 | `api-unresolved:af7db39a193d` | 鉴权定义缺失 | `brand-menu ()` | 确认实际鉴权方式、Token 来源、BrandId 等必需请求头及失效规则 | 后端/鉴权维护人 + 测试 | 补充安全方案并用只读接口验证 |
| 5 | `api-unresolved:bb746730fb74` | 服务地址未定 | `industry-item (MC_PLATFORM_ITEM_API_BASE_URL)` | 确认 MC_PLATFORM_ITEM_API_BASE_URL 的完整域名、公共前缀及环境差异 | 后端/API维护人 + 测试 | 写入环境合同后自动复验 |
| 6 | `api-unresolved:f9a630670fc6` | Postman URL 不完整 | `POST 创建商品 ?Token` | 补全请求“创建商品”的完整 URL、变量来源及用途；无效样例则删除 | Postman维护人 + 测试 | 补齐或删除无效请求 |

## 接口用途摘要缺失 88 条

这些条目不是已发现的产品逻辑冲突，而是 OpenAPI 缺少 summary。建议由接口文档维护人批量补齐，测试根据真实网络请求/API 探测抽样确认；只有无法判断业务归属时才升级给产品。

| 序号 | P0 ID | 接口 | 需要确认 | 确认人 | 建议处理 |
|---:|---|---|---|---|---|
| 7 | `api-unresolved:0137b81ca216` | `industry-item:DELETE /ops/platform-allergen/{id}` | 确认接口业务用途、是否属于商品中心自动化范围，并补充准确 summary | 后端/API文档维护人；业务用途不明时产品参与 | 建议接口负责人批量补文档，测试按网络证据抽样验签 |
| 8 | `api-unresolved:075bf7518c39` | `industry-item:GET /ops/platform-ingredient-nutrition/{id}` | 确认接口业务用途、是否属于商品中心自动化范围，并补充准确 summary | 后端/API文档维护人；业务用途不明时产品参与 | 建议接口负责人批量补文档，测试按网络证据抽样验签 |
| 9 | `api-unresolved:083dddf73d36` | `industry-item:DELETE /internal/platform-nutrition/{id}` | 确认接口业务用途、是否属于商品中心自动化范围，并补充准确 summary | 后端/API文档维护人；业务用途不明时产品参与 | 建议接口负责人批量补文档，测试按网络证据抽样验签 |
| 10 | `api-unresolved:08f106ede220` | `industry-item:GET /ops/platform-unit/search` | 确认接口业务用途、是否属于商品中心自动化范围，并补充准确 summary | 后端/API文档维护人；业务用途不明时产品参与 | 建议接口负责人批量补文档，测试按网络证据抽样验签 |
| 11 | `api-unresolved:0a4eafdf926b` | `industry-item:POST /ops/platform-unit` | 确认接口业务用途、是否属于商品中心自动化范围，并补充准确 summary | 后端/API文档维护人；业务用途不明时产品参与 | 建议接口负责人批量补文档，测试按网络证据抽样验签 |
| 12 | `api-unresolved:15cdb1cdbedb` | `industry-item:DELETE /internal/platform-allergen/{id}` | 确认接口业务用途、是否属于商品中心自动化范围，并补充准确 summary | 后端/API文档维护人；业务用途不明时产品参与 | 建议接口负责人批量补文档，测试按网络证据抽样验签 |
| 13 | `api-unresolved:167413c2ba80` | `industry-item:POST /ops/platform-allergen` | 确认接口业务用途、是否属于商品中心自动化范围，并补充准确 summary | 后端/API文档维护人；业务用途不明时产品参与 | 建议接口负责人批量补文档，测试按网络证据抽样验签 |
| 14 | `api-unresolved:17a80c063e32` | `industry-item:DELETE /ops/platform-modifiers/{id}` | 确认接口业务用途、是否属于商品中心自动化范围，并补充准确 summary | 后端/API文档维护人；业务用途不明时产品参与 | 建议接口负责人批量补文档，测试按网络证据抽样验签 |
| 15 | `api-unresolved:17c75208e0a5` | `industry-item:GET /ops/platform-category/treeList` | 确认接口业务用途、是否属于商品中心自动化范围，并补充准确 summary | 后端/API文档维护人；业务用途不明时产品参与 | 建议接口负责人批量补文档，测试按网络证据抽样验签 |
| 16 | `api-unresolved:1a52a6c04139` | `industry-item:GET /ops/platform-ingredient-allergen/all` | 确认接口业务用途、是否属于商品中心自动化范围，并补充准确 summary | 后端/API文档维护人；业务用途不明时产品参与 | 建议接口负责人批量补文档，测试按网络证据抽样验签 |
| 17 | `api-unresolved:1b0014e978f3` | `industry-item:GET /ops/platform-ingredient-nutrition/all` | 确认接口业务用途、是否属于商品中心自动化范围，并补充准确 summary | 后端/API文档维护人；业务用途不明时产品参与 | 建议接口负责人批量补文档，测试按网络证据抽样验签 |
| 18 | `api-unresolved:1b397b912749` | `industry-item:PUT /ops/platform-ingredient/{id}` | 确认接口业务用途、是否属于商品中心自动化范围，并补充准确 summary | 后端/API文档维护人；业务用途不明时产品参与 | 建议接口负责人批量补文档，测试按网络证据抽样验签 |
| 19 | `api-unresolved:1daadc401594` | `industry-item:DELETE /ops/platform-unit/{id}` | 确认接口业务用途、是否属于商品中心自动化范围，并补充准确 summary | 后端/API文档维护人；业务用途不明时产品参与 | 建议接口负责人批量补文档，测试按网络证据抽样验签 |
| 20 | `api-unresolved:21c3c93e3c3b` | `industry-item:POST /ops/platform-ingredient-nutrition` | 确认接口业务用途、是否属于商品中心自动化范围，并补充准确 summary | 后端/API文档维护人；业务用途不明时产品参与 | 建议接口负责人批量补文档，测试按网络证据抽样验签 |
| 21 | `api-unresolved:2548d63b75ff` | `industry-item:GET /ops/platform-modifiers/list` | 确认接口业务用途、是否属于商品中心自动化范围，并补充准确 summary | 后端/API文档维护人；业务用途不明时产品参与 | 建议接口负责人批量补文档，测试按网络证据抽样验签 |
| 22 | `api-unresolved:26820229eeec` | `industry-item:PUT /ops/tags/{id}` | 确认接口业务用途、是否属于商品中心自动化范围，并补充准确 summary | 后端/API文档维护人；业务用途不明时产品参与 | 建议接口负责人批量补文档，测试按网络证据抽样验签 |
| 23 | `api-unresolved:271777cfdb02` | `industry-item:GET /ops/platform-unit/{id}` | 确认接口业务用途、是否属于商品中心自动化范围，并补充准确 summary | 后端/API文档维护人；业务用途不明时产品参与 | 建议接口负责人批量补文档，测试按网络证据抽样验签 |
| 24 | `api-unresolved:2ac267225b86` | `industry-item:DELETE /ops/platform-ingredient-nutrition/{id}` | 确认接口业务用途、是否属于商品中心自动化范围，并补充准确 summary | 后端/API文档维护人；业务用途不明时产品参与 | 建议接口负责人批量补文档，测试按网络证据抽样验签 |
| 25 | `api-unresolved:2f37e26f1f03` | `industry-item:GET /ops/tags/list` | 确认接口业务用途、是否属于商品中心自动化范围，并补充准确 summary | 后端/API文档维护人；业务用途不明时产品参与 | 建议接口负责人批量补文档，测试按网络证据抽样验签 |
| 26 | `api-unresolved:30ed70afac0d` | `industry-item:DELETE /ops/platform-ingredient-allergen/{id}` | 确认接口业务用途、是否属于商品中心自动化范围，并补充准确 summary | 后端/API文档维护人；业务用途不明时产品参与 | 建议接口负责人批量补文档，测试按网络证据抽样验签 |
| 27 | `api-unresolved:31c234eb7821` | `industry-item:POST /ops/platform-specifications` | 确认接口业务用途、是否属于商品中心自动化范围，并补充准确 summary | 后端/API文档维护人；业务用途不明时产品参与 | 建议接口负责人批量补文档，测试按网络证据抽样验签 |
| 28 | `api-unresolved:341f7d21f172` | `industry-item:POST /ops/platform-nutrition` | 确认接口业务用途、是否属于商品中心自动化范围，并补充准确 summary | 后端/API文档维护人；业务用途不明时产品参与 | 建议接口负责人批量补文档，测试按网络证据抽样验签 |
| 29 | `api-unresolved:3575fdc624bb` | `industry-item:POST /ops/platform-nutrition/suggest` | 确认接口业务用途、是否属于商品中心自动化范围，并补充准确 summary | 后端/API文档维护人；业务用途不明时产品参与 | 建议接口负责人批量补文档，测试按网络证据抽样验签 |
| 30 | `api-unresolved:35813e0fdfb8` | `industry-item:POST /ops/platform-allergen/suggest` | 确认接口业务用途、是否属于商品中心自动化范围，并补充准确 summary | 后端/API文档维护人；业务用途不明时产品参与 | 建议接口负责人批量补文档，测试按网络证据抽样验签 |
| 31 | `api-unresolved:35fc77c66936` | `industry-item:DELETE /ops/platform-nutrition/{id}` | 确认接口业务用途、是否属于商品中心自动化范围，并补充准确 summary | 后端/API文档维护人；业务用途不明时产品参与 | 建议接口负责人批量补文档，测试按网络证据抽样验签 |
| 32 | `api-unresolved:36bbf55de3ff` | `industry-item:POST /ops/platform-ingredient-allergen` | 确认接口业务用途、是否属于商品中心自动化范围，并补充准确 summary | 后端/API文档维护人；业务用途不明时产品参与 | 建议接口负责人批量补文档，测试按网络证据抽样验签 |
| 33 | `api-unresolved:373a6cbf0afc` | `brand-menu:GET /ops-brand/brand-allergens/list` | 确认接口业务用途、是否属于商品中心自动化范围，并补充准确 summary | 后端/API文档维护人；业务用途不明时产品参与 | 建议接口负责人批量补文档，测试按网络证据抽样验签 |
| 34 | `api-unresolved:387fb9f54a57` | `industry-item:PUT /ops/platform-category/{id}` | 确认接口业务用途、是否属于商品中心自动化范围，并补充准确 summary | 后端/API文档维护人；业务用途不明时产品参与 | 建议接口负责人批量补文档，测试按网络证据抽样验签 |
| 35 | `api-unresolved:38f33a78b816` | `industry-item:POST /internal/platform-nutrition` | 确认接口业务用途、是否属于商品中心自动化范围，并补充准确 summary | 后端/API文档维护人；业务用途不明时产品参与 | 建议接口负责人批量补文档，测试按网络证据抽样验签 |
| 36 | `api-unresolved:39ad248dc5a9` | `industry-item:GET /internal/platform-nutrition/all` | 确认接口业务用途、是否属于商品中心自动化范围，并补充准确 summary | 后端/API文档维护人；业务用途不明时产品参与 | 建议接口负责人批量补文档，测试按网络证据抽样验签 |
| 37 | `api-unresolved:3c4d42ffdb8e` | `industry-item:GET /health` | 确认接口业务用途、是否属于商品中心自动化范围，并补充准确 summary | 后端/API文档维护人；业务用途不明时产品参与 | 建议接口负责人批量补文档，测试按网络证据抽样验签 |
| 38 | `api-unresolved:3d6a4e91c6d4` | `industry-item:POST /ops/platform-modifiers` | 确认接口业务用途、是否属于商品中心自动化范围，并补充准确 summary | 后端/API文档维护人；业务用途不明时产品参与 | 建议接口负责人批量补文档，测试按网络证据抽样验签 |
| 39 | `api-unresolved:4017e2c774dd` | `industry-item:DELETE /ops/tags/{id}` | 确认接口业务用途、是否属于商品中心自动化范围，并补充准确 summary | 后端/API文档维护人；业务用途不明时产品参与 | 建议接口负责人批量补文档，测试按网络证据抽样验签 |
| 40 | `api-unresolved:40e5542652d7` | `industry-item:GET /ops/platform-unit/all` | 确认接口业务用途、是否属于商品中心自动化范围，并补充准确 summary | 后端/API文档维护人；业务用途不明时产品参与 | 建议接口负责人批量补文档，测试按网络证据抽样验签 |
| 41 | `api-unresolved:47971c757d25` | `industry-item:PUT /ops/platform-allergen/{id}` | 确认接口业务用途、是否属于商品中心自动化范围，并补充准确 summary | 后端/API文档维护人；业务用途不明时产品参与 | 建议接口负责人批量补文档，测试按网络证据抽样验签 |
| 42 | `api-unresolved:489eab12abb7` | `industry-item:GET /ops/platform-ingredient/{id}` | 确认接口业务用途、是否属于商品中心自动化范围，并补充准确 summary | 后端/API文档维护人；业务用途不明时产品参与 | 建议接口负责人批量补文档，测试按网络证据抽样验签 |
| 43 | `api-unresolved:4b1c5c4af494` | `industry-item:GET /ops/platform-allergen/list` | 确认接口业务用途、是否属于商品中心自动化范围，并补充准确 summary | 后端/API文档维护人；业务用途不明时产品参与 | 建议接口负责人批量补文档，测试按网络证据抽样验签 |
| 44 | `api-unresolved:4ddf4c3c91c1` | `industry-item:PUT /ops/platform-nutrition/{id}` | 确认接口业务用途、是否属于商品中心自动化范围，并补充准确 summary | 后端/API文档维护人；业务用途不明时产品参与 | 建议接口负责人批量补文档，测试按网络证据抽样验签 |
| 45 | `api-unresolved:549e59255cd2` | `industry-item:POST /ops/tags` | 确认接口业务用途、是否属于商品中心自动化范围，并补充准确 summary | 后端/API文档维护人；业务用途不明时产品参与 | 建议接口负责人批量补文档，测试按网络证据抽样验签 |
| 46 | `api-unresolved:58f60f0beea7` | `industry-item:GET /internal/platform-allergen/{id}` | 确认接口业务用途、是否属于商品中心自动化范围，并补充准确 summary | 后端/API文档维护人；业务用途不明时产品参与 | 建议接口负责人批量补文档，测试按网络证据抽样验签 |
| 47 | `api-unresolved:592f8ffc56d8` | `industry-item:GET /ops/platform-ingredient-allergen/{id}` | 确认接口业务用途、是否属于商品中心自动化范围，并补充准确 summary | 后端/API文档维护人；业务用途不明时产品参与 | 建议接口负责人批量补文档，测试按网络证据抽样验签 |
| 48 | `api-unresolved:593b8e2eb649` | `industry-item:DELETE /ops/platform-category/{id}` | 确认接口业务用途、是否属于商品中心自动化范围，并补充准确 summary | 后端/API文档维护人；业务用途不明时产品参与 | 建议接口负责人批量补文档，测试按网络证据抽样验签 |
| 49 | `api-unresolved:620a2e842ee3` | `industry-item:PUT /ops/platform-unit/{id}` | 确认接口业务用途、是否属于商品中心自动化范围，并补充准确 summary | 后端/API文档维护人；业务用途不明时产品参与 | 建议接口负责人批量补文档，测试按网络证据抽样验签 |
| 50 | `api-unresolved:66ace968d179` | `brand-menu:GET /ops-brand/brand-categories/search` | 确认接口业务用途、是否属于商品中心自动化范围，并补充准确 summary | 后端/API文档维护人；业务用途不明时产品参与 | 建议接口负责人批量补文档，测试按网络证据抽样验签 |
| 51 | `api-unresolved:698b64fad6d2` | `industry-item:GET /internal/platform-nutrition/{id}` | 确认接口业务用途、是否属于商品中心自动化范围，并补充准确 summary | 后端/API文档维护人；业务用途不明时产品参与 | 建议接口负责人批量补文档，测试按网络证据抽样验签 |
| 52 | `api-unresolved:700ac6cd1633` | `industry-item:POST /internal/platform-allergen` | 确认接口业务用途、是否属于商品中心自动化范围，并补充准确 summary | 后端/API文档维护人；业务用途不明时产品参与 | 建议接口负责人批量补文档，测试按网络证据抽样验签 |
| 53 | `api-unresolved:70217de97815` | `industry-item:GET /ops/platform-ingredient-nutrition/list` | 确认接口业务用途、是否属于商品中心自动化范围，并补充准确 summary | 后端/API文档维护人；业务用途不明时产品参与 | 建议接口负责人批量补文档，测试按网络证据抽样验签 |
| 54 | `api-unresolved:730f79551043` | `industry-item:POST /internal/platform-nutrition/suggest` | 确认接口业务用途、是否属于商品中心自动化范围，并补充准确 summary | 后端/API文档维护人；业务用途不明时产品参与 | 建议接口负责人批量补文档，测试按网络证据抽样验签 |
| 55 | `api-unresolved:749993e6a515` | `industry-item:GET /internal/platform-nutrition/search` | 确认接口业务用途、是否属于商品中心自动化范围，并补充准确 summary | 后端/API文档维护人；业务用途不明时产品参与 | 建议接口负责人批量补文档，测试按网络证据抽样验签 |
| 56 | `api-unresolved:7673665ed898` | `brand-menu:GET /ops-poi/brand-categories/search` | 确认接口业务用途、是否属于商品中心自动化范围，并补充准确 summary | 后端/API文档维护人；业务用途不明时产品参与 | 建议接口负责人批量补文档，测试按网络证据抽样验签 |
| 57 | `api-unresolved:796e77f8c866` | `industry-item:GET /ops/platform-specifications/{id}` | 确认接口业务用途、是否属于商品中心自动化范围，并补充准确 summary | 后端/API文档维护人；业务用途不明时产品参与 | 建议接口负责人批量补文档，测试按网络证据抽样验签 |
| 58 | `api-unresolved:7c29cf2ba297` | `brand-menu:GET /ops-brand/brand-allergens/all` | 确认接口业务用途、是否属于商品中心自动化范围，并补充准确 summary | 后端/API文档维护人；业务用途不明时产品参与 | 建议接口负责人批量补文档，测试按网络证据抽样验签 |
| 59 | `api-unresolved:81781177e954` | `industry-item:DELETE /ops/platform-specifications/{id}` | 确认接口业务用途、是否属于商品中心自动化范围，并补充准确 summary | 后端/API文档维护人；业务用途不明时产品参与 | 建议接口负责人批量补文档，测试按网络证据抽样验签 |
| 60 | `api-unresolved:8203f9c8ff39` | `industry-item:GET /ops/platform-specifications/list` | 确认接口业务用途、是否属于商品中心自动化范围，并补充准确 summary | 后端/API文档维护人；业务用途不明时产品参与 | 建议接口负责人批量补文档，测试按网络证据抽样验签 |
| 61 | `api-unresolved:887611306849` | `industry-item:GET /ops/platform-allergen/search` | 确认接口业务用途、是否属于商品中心自动化范围，并补充准确 summary | 后端/API文档维护人；业务用途不明时产品参与 | 建议接口负责人批量补文档，测试按网络证据抽样验签 |
| 62 | `api-unresolved:89ffd7334e3c` | `industry-item:GET /internal/platform-nutrition/list` | 确认接口业务用途、是否属于商品中心自动化范围，并补充准确 summary | 后端/API文档维护人；业务用途不明时产品参与 | 建议接口负责人批量补文档，测试按网络证据抽样验签 |
| 63 | `api-unresolved:8c102ebcb9a3` | `industry-item:PUT /ops/platform-specifications/{id}` | 确认接口业务用途、是否属于商品中心自动化范围，并补充准确 summary | 后端/API文档维护人；业务用途不明时产品参与 | 建议接口负责人批量补文档，测试按网络证据抽样验签 |
| 64 | `api-unresolved:8d766fcd3dd8` | `industry-item:PUT /ops/platform-ingredient-nutrition/{id}` | 确认接口业务用途、是否属于商品中心自动化范围，并补充准确 summary | 后端/API文档维护人；业务用途不明时产品参与 | 建议接口负责人批量补文档，测试按网络证据抽样验签 |
| 65 | `api-unresolved:91b4d0260011` | `industry-item:PUT /ops/platform-modifiers/{id}` | 确认接口业务用途、是否属于商品中心自动化范围，并补充准确 summary | 后端/API文档维护人；业务用途不明时产品参与 | 建议接口负责人批量补文档，测试按网络证据抽样验签 |
| 66 | `api-unresolved:9a27a19b3e91` | `industry-item:GET /ops/platform-allergen/{id}` | 确认接口业务用途、是否属于商品中心自动化范围，并补充准确 summary | 后端/API文档维护人；业务用途不明时产品参与 | 建议接口负责人批量补文档，测试按网络证据抽样验签 |
| 67 | `api-unresolved:9afe840c6fd8` | `brand-menu:GET /ops-brand/brand-categories/test-stackoverflow` | 确认接口业务用途、是否属于商品中心自动化范围，并补充准确 summary | 后端/API文档维护人；业务用途不明时产品参与 | 建议接口负责人批量补文档，测试按网络证据抽样验签 |
| 68 | `api-unresolved:a27c0cdbe677` | `industry-item:PUT /internal/platform-allergen/{id}` | 确认接口业务用途、是否属于商品中心自动化范围，并补充准确 summary | 后端/API文档维护人；业务用途不明时产品参与 | 建议接口负责人批量补文档，测试按网络证据抽样验签 |
| 69 | `api-unresolved:a8a990486ae1` | `industry-item:PUT /ops/platform-ingredient-allergen/{id}` | 确认接口业务用途、是否属于商品中心自动化范围，并补充准确 summary | 后端/API文档维护人；业务用途不明时产品参与 | 建议接口负责人批量补文档，测试按网络证据抽样验签 |
| 70 | `api-unresolved:a95badf87ed4` | `industry-item:GET /internal/platform-allergen/all` | 确认接口业务用途、是否属于商品中心自动化范围，并补充准确 summary | 后端/API文档维护人；业务用途不明时产品参与 | 建议接口负责人批量补文档，测试按网络证据抽样验签 |
| 71 | `api-unresolved:ad4899e18f4c` | `industry-item:POST /ops/platform-ingredient` | 确认接口业务用途、是否属于商品中心自动化范围，并补充准确 summary | 后端/API文档维护人；业务用途不明时产品参与 | 建议接口负责人批量补文档，测试按网络证据抽样验签 |
| 72 | `api-unresolved:b2251d4e7f06` | `industry-item:GET /ops/platform-ingredient-allergen/search` | 确认接口业务用途、是否属于商品中心自动化范围，并补充准确 summary | 后端/API文档维护人；业务用途不明时产品参与 | 建议接口负责人批量补文档，测试按网络证据抽样验签 |
| 73 | `api-unresolved:b476e3cb373a` | `industry-item:GET /ops/platform-modifiers/{id}` | 确认接口业务用途、是否属于商品中心自动化范围，并补充准确 summary | 后端/API文档维护人；业务用途不明时产品参与 | 建议接口负责人批量补文档，测试按网络证据抽样验签 |
| 74 | `api-unresolved:bc69f0994b54` | `brand-menu:GET /ops-poi/brand-categories/test-stackoverflow` | 确认接口业务用途、是否属于商品中心自动化范围，并补充准确 summary | 后端/API文档维护人；业务用途不明时产品参与 | 建议接口负责人批量补文档，测试按网络证据抽样验签 |
| 75 | `api-unresolved:c83dd883c490` | `industry-item:GET /ops/platform-ingredient-allergen/list` | 确认接口业务用途、是否属于商品中心自动化范围，并补充准确 summary | 后端/API文档维护人；业务用途不明时产品参与 | 建议接口负责人批量补文档，测试按网络证据抽样验签 |
| 76 | `api-unresolved:cae89bd9a093` | `industry-item:POST /ops/platform-category` | 确认接口业务用途、是否属于商品中心自动化范围，并补充准确 summary | 后端/API文档维护人；业务用途不明时产品参与 | 建议接口负责人批量补文档，测试按网络证据抽样验签 |
| 77 | `api-unresolved:d5e0206ce222` | `industry-item:GET /ops/platform-regulation/all` | 确认接口业务用途、是否属于商品中心自动化范围，并补充准确 summary | 后端/API文档维护人；业务用途不明时产品参与 | 建议接口负责人批量补文档，测试按网络证据抽样验签 |
| 78 | `api-unresolved:d708f130a487` | `industry-item:GET /ops/platform-nutrition/all` | 确认接口业务用途、是否属于商品中心自动化范围，并补充准确 summary | 后端/API文档维护人；业务用途不明时产品参与 | 建议接口负责人批量补文档，测试按网络证据抽样验签 |
| 79 | `api-unresolved:d73f3ba07568` | `industry-item:GET /ops/platform-allergen/all` | 确认接口业务用途、是否属于商品中心自动化范围，并补充准确 summary | 后端/API文档维护人；业务用途不明时产品参与 | 建议接口负责人批量补文档，测试按网络证据抽样验签 |
| 80 | `api-unresolved:d8a91ef2cfa1` | `industry-item:DELETE /ops/platform-ingredient/{id}` | 确认接口业务用途、是否属于商品中心自动化范围，并补充准确 summary | 后端/API文档维护人；业务用途不明时产品参与 | 建议接口负责人批量补文档，测试按网络证据抽样验签 |
| 81 | `api-unresolved:d9c6da24affb` | `industry-item:POST /internal/platform-allergen/suggest` | 确认接口业务用途、是否属于商品中心自动化范围，并补充准确 summary | 后端/API文档维护人；业务用途不明时产品参与 | 建议接口负责人批量补文档，测试按网络证据抽样验签 |
| 82 | `api-unresolved:db7029daca33` | `industry-item:GET /ops/platform-ingredient/list` | 确认接口业务用途、是否属于商品中心自动化范围，并补充准确 summary | 后端/API文档维护人；业务用途不明时产品参与 | 建议接口负责人批量补文档，测试按网络证据抽样验签 |
| 83 | `api-unresolved:df0a6d90020c` | `industry-item:GET /ops/platform-category/{id}` | 确认接口业务用途、是否属于商品中心自动化范围，并补充准确 summary | 后端/API文档维护人；业务用途不明时产品参与 | 建议接口负责人批量补文档，测试按网络证据抽样验签 |
| 84 | `api-unresolved:e6a8b64991e8` | `industry-item:PUT /internal/platform-nutrition/{id}` | 确认接口业务用途、是否属于商品中心自动化范围，并补充准确 summary | 后端/API文档维护人；业务用途不明时产品参与 | 建议接口负责人批量补文档，测试按网络证据抽样验签 |
| 85 | `api-unresolved:e9457da55370` | `industry-item:GET /ops/tags/{id}` | 确认接口业务用途、是否属于商品中心自动化范围，并补充准确 summary | 后端/API文档维护人；业务用途不明时产品参与 | 建议接口负责人批量补文档，测试按网络证据抽样验签 |
| 86 | `api-unresolved:ec0714115c37` | `industry-item:GET /ops/platform-ingredient/all` | 确认接口业务用途、是否属于商品中心自动化范围，并补充准确 summary | 后端/API文档维护人；业务用途不明时产品参与 | 建议接口负责人批量补文档，测试按网络证据抽样验签 |
| 87 | `api-unresolved:ed869adf48b7` | `industry-item:GET /ops/platform-nutrition/{id}` | 确认接口业务用途、是否属于商品中心自动化范围，并补充准确 summary | 后端/API文档维护人；业务用途不明时产品参与 | 建议接口负责人批量补文档，测试按网络证据抽样验签 |
| 88 | `api-unresolved:ee5ed3f65609` | `industry-item:GET /ops/platform-unit/list` | 确认接口业务用途、是否属于商品中心自动化范围，并补充准确 summary | 后端/API文档维护人；业务用途不明时产品参与 | 建议接口负责人批量补文档，测试按网络证据抽样验签 |
| 89 | `api-unresolved:f166d8c9e587` | `industry-item:GET /ops/platform-nutrition/list` | 确认接口业务用途、是否属于商品中心自动化范围，并补充准确 summary | 后端/API文档维护人；业务用途不明时产品参与 | 建议接口负责人批量补文档，测试按网络证据抽样验签 |
| 90 | `api-unresolved:f5b40e9fd411` | `industry-item:GET /ops/platform-ingredient-nutrition/search` | 确认接口业务用途、是否属于商品中心自动化范围，并补充准确 summary | 后端/API文档维护人；业务用途不明时产品参与 | 建议接口负责人批量补文档，测试按网络证据抽样验签 |
| 91 | `api-unresolved:fbc2a114dbde` | `industry-item:GET /internal/platform-allergen/search` | 确认接口业务用途、是否属于商品中心自动化范围，并补充准确 summary | 后端/API文档维护人；业务用途不明时产品参与 | 建议接口负责人批量补文档，测试按网络证据抽样验签 |
| 92 | `api-unresolved:fc29512823a8` | `industry-item:GET /internal/platform-allergen/list` | 确认接口业务用途、是否属于商品中心自动化范围，并补充准确 summary | 后端/API文档维护人；业务用途不明时产品参与 | 建议接口负责人批量补文档，测试按网络证据抽样验签 |
| 93 | `api-unresolved:fcc186e7832c` | `industry-item:GET /ops/platform-nutrition/search` | 确认接口业务用途、是否属于商品中心自动化范围，并补充准确 summary | 后端/API文档维护人；业务用途不明时产品参与 | 建议接口负责人批量补文档，测试按网络证据抽样验签 |
| 94 | `api-unresolved:ffe67980abcd` | `industry-item:GET /ops/platform-ingredient/search` | 确认接口业务用途、是否属于商品中心自动化范围，并补充准确 summary | 后端/API文档维护人；业务用途不明时产品参与 | 建议接口负责人批量补文档，测试按网络证据抽样验签 |

## 审核口径

- 通过：补充可追溯证据，明确生成或禁止生成自动化操作/断言。
- 驳回：确认不属于商品中心范围，合同中保留排除原因。
- 待定：缺少责任人或环境不可验证，继续保持 `generationAllowed=false`。
- 发布：必须由真实审核人签名执行 `contract:promote --reviewed-by <审核人>`，Codex 不代签。
