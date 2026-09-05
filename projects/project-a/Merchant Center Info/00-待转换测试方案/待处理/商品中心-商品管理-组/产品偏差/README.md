# 组方案产品偏差待处理

本目录保存商品管理-组中已经通过运行证据确认存在产品行为偏差、需要产品规则确认或研发修复的用例。

## 处理规则

1. 不将产品偏差直接判定为通过，也不从正式测试方案删除。
2. 产品规则仍有效：登记产品缺陷，修复后按原用例重跑。
3. 实际行为被确认是新规则：更新正式用例预期、精确提示和审计依据，再重跑。
4. 每条用例闭环后，必须同步更新正式用例、自动化绑定、运行账本和资产索引。

## 权威关联文件

- 正式用例：`D:\Menusifu\Merchant Center\Merchant Center Info\00-待转换测试方案\用例库\商品中心-商品管理-组\2.商品中心-商品管理-组-正式测试用例.md`
- 产品偏差登记：`D:\Menusifu\Merchant Center\Merchant Center UITest\contracts\product-center\group\product-center-group-drift-decisions.json`
- 未落地索引：`D:\Menusifu\Merchant Center\Merchant Center Info\00-待转换测试方案\未落地\index.json`
- 当前清单：`index.md`

