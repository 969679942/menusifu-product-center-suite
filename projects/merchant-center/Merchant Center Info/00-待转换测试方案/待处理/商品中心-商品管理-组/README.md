# 商品管理-组处置入口

| 目录 | 数量 | 当前动作 |
|---|---:|---|
| `产品偏差/` | 0 | 当前无待处理产品偏差；保留人工确认决策记录 |
| `明确延期/` | 10 | 本轮跳过，满足恢复条件后再执行 |
| `历史归档/` | 1 | 保留历史审计材料，不作为当前处理入口 |

不要在本目录复制或修改正式用例正文。处理完成后，统一回写：

1. `D:\Menusifu\Merchant Center\Merchant Center Info\00-待转换测试方案\用例库\商品中心-商品管理-组\2.商品中心-商品管理-组-正式测试用例.md`
2. `D:\Menusifu\Merchant Center\Merchant Center UITest\contracts\product-center\group\product-center-group-drift-decisions.json`
3. 自动化运行账本和 `已完成/index.json`、`未落地/index.json`

历史迁移审核文件如果已明确废止，应删除；仍有证据价值的历史确认材料放入 `历史归档/`，不得与当前待处理清单混用。
