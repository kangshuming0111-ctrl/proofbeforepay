# 第5轮：风险字段漏答的明确诊断与真实回归

日期2026-11-05。起点：R3稳定后封存集第一次调用，holdoutfreeze0789...。R4修复完成后按序实施本轮。

## 修改前对照

| 差距ID/维度 | 参照/强项/来源 | 我们起点 | 门槛 |
| --- | --- | --- | --- |
| REAL-5 失败分支与报告可复查 | Agent Receipt IBM Bob2026 August Most Innovative，证据关联回查；PHAROS_INC August1st，清楚报告。官方 https://www.bemyapp.com/insights/ai-builders-challenge-with-ibm-bob-2026-winners.html ，11-05官方索引复核；非竞品同条件实测。 | 两份留出首答全部16项回答正确且引用存在，但Clean Blog一张risk卡漏suggestion，整份严格拒绝，只提示structure。首答app8/16不掩盖；不是requirements漏答。 | 保持完整报告failclosed、不造补答/不静默删除risk；增加risk_fields安全双语诊断；prompt要求每张risk字段完整；真实API已知回归另计，首次不重写。 |

## DeepSeek与独立裁定

已发送真实有限源码与原始Clean Blog结果，待评审返回。

## 实现验证与再次对照

待R4结束后实施。无自动重试、无自动验收/付款；首次异常不从统计中消失。


## 实际裁定和前后对照

计划审格式无效，原始建议中“所有risk字段同类失败归risk_fields”采纳；limitation坏字段继续structure，actual坏quote仍citation。建议显式Record类型采纳，但其“TS不会提示漏map字段”不准确，不据此声称发现编译漏检。实现后DeepSeek有效、findings空，局限为源码审阅。

新增risk_fields枚举、双语安全文案、风险解析局部完整catch、评测失败分类；不补造或删risk，不保存partial。2新增实际assessor测试红灯1/2→通过，新增实际action route反例确认502/1request/0saves/quote不变；与覆盖/路由等相关集通过。prompt强调4risk字段和limitation原文、无虚构raster/type显示观察。

| 同维度/参照 | 修改前 | 修改后 | 门槛/剩余 |
| --- | --- | --- | --- |
| REAL-5 清楚报告/证据回查，AgentReceipt/PHAROS_INC | CleanBlog风险漏suggestion仅structure | 实际已知回归再次漏同字段，已精确risk_fields；仍整份拒绝，未伪补/静默丢风险 | 安全诊断门槛满足，prompt本身不能保证字段完整；真实失败保留，转第6轮严格输出结构。 |

真实R5完整批次原开发3 raw/app23/24、Personal raw/app7/8、long raw/app16/16、heldout raw16/16 app8/16且1 risk_fields。不能写回归全通过或删除失败；两处合理未知/原参考歧义单列。
