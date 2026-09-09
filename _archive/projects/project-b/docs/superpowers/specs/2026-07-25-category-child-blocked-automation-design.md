# TC-ITEM-STD-035 自动化晋级设计

## 目标

将正式用例 `TC-ITEM-STD-035 分类下已有商品时不可继续新增子分类` 从人工执行晋级为合同驱动 Recipe，并保持 API Seed、UI Action、API/UI Verify、API Cleanup 的完整生命周期。

## 证据边界

- 来源为正式测试用例 `TC-ITEM-STD-035` 与统一合同规则 `rule:category-child-blocked-by-product`。
- 已确认条件：一级分类下存在商品。
- 已确认操作：在该一级分类下新增子分类、填写名称并尝试保存。
- 已确认结果：子分类不能创建，一级分类下不产生子分类数据。
- 不断言固定错误文案、HTTP 状态码或零变更请求，因为正式来源未确认这些细节。

## 方案

### Recipe 晋级

- 新增正式 Recipe caseId：`negative:category-child-blocked-by-product`。
- 动作为 `negative`，路由为 `/pp/brand/category`。
- 显式覆盖 `coverage:control:category-add-child`。
- Recipe 总数由 45 增至 46，分类试点由 6 条自动化增至 7 条自动化。

### API Seed

新增专用 Seed 适配器 `productCenter.seedCategoryWithProduct`：

1. 创建唯一审计一级分类并立即登记服务端 ID。
2. 使用现有标准商品创建接口，在该一级分类下创建唯一审计商品并立即登记服务端 ID。
3. 生成计划新增的子分类唯一名称。
4. 注册潜在子分类、商品、一级分类的清理任务。

Seed 记录保存父分类 ID、父分类名称、商品 ID、商品名称和子分类候选名称，不保存认证信息。

### UI Action

页面对象新增以下低层能力：

- 打开商品分类页面并等待分类树接口完成。
- 通过精确可访问名称 `添加分类 到 {父分类名称}` 定位父分类新增子分类入口，要求唯一、可见、可用。
- 填写子分类名称。
- 输入后等待至少 200ms，再点击保存。

Flow/Capability 负责组合上述动作，不在 Page 中放置业务判断或清理策略。

### 终态验证

API 终态：

- 分类树中仍存在父分类。
- 标准商品查询仍能找到 Seed 商品。
- 父分类下不存在候选子分类；同时全树不存在同名候选子分类。

UI 终态：

- 重新进入分类页面并按父分类名称定位。
- 父分类区域不显示候选子分类名称。

API 与 UI 终态都满足后，Recipe 才通过。

### 异常创建恢复

保存动作不得自动重放。如果候选子分类异常创建成功：

1. 通过分类树查询服务端 ID。
2. 立即写入执行台账。
3. 将用例判定为产品行为失败。
4. `finally` 清理候选子分类、商品和父分类，并验证零残留。

### 清理顺序

清理任务按依赖逆序执行：

1. 候选子分类（若存在）。
2. Seed 标准商品。
3. Seed 一级分类。

每个实体通过服务端 ID 和唯一业务名称双重核对。任何清理失败保留 checkpoint，不得把平台重连或 429 归类为产品失败。

## 合同变化

- 负向正式 Recipe 总数增加 1。
- 自动化 Recipe 总数从 45 增至 46。
- 分类试点变为 7 executable、0 manual、7/7 覆盖。
- 生产验收合同同步更新 Recipe 数量、分类试点结果和零残留证据。

## 测试策略

1. API 合同测试：Seed 创建父分类和商品，清理顺序与残留验证正确。
2. Page/Capability 合同测试：只使用精确父分类语义定位器，不使用 `.first()`、`.nth()`、`.or()` 或固定等待。
3. Recipe 编译测试：新增 case 唯一编译并绑定正式规则及 `category-add-child` 覆盖 ID。
4. 分类试点审计：7 条全部 executable，覆盖缺口为 0。
5. UI 试点：7 条分类业务用例全部通过，4 workers，未完成 checkpoint 为 0。
6. 全量合同：TypeScript、Recipe、统一合同、安全扫描和差异检查全部通过。

## 验收标准

- `TC-ITEM-STD-035` 不再标记为 manual。
- API Seed、UI Action、API/UI Verify、API Cleanup 均有可执行合同。
- UI 保存动作不盲目重试。
- 产品不符合规则时用例失败，但清理仍完成且残留为 0。
- 生成报告不包含密码、Token、Cookie、Authorization 或 Fill 输入值。
