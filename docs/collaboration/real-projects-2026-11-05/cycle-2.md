# 第2轮：指定页面证据不受无关页面污染

- 日期：2026-11-05
- 起始：主站v71，源码b2b75b7bfa4ad0928fe15a8ef121c522f3c3fe67；后续每轮准确树hash在实际freeze记录。
- 差距ID：REAL-2
- 参照：PHAROS_INC，IBM Bob2026 August Challenge 1st；Agent Receipt，August Most Innovative。
- 官方来源：[获奖公告](https://www.bemyapp.com/insights/ai-builders-challenge-with-ibm-bob-2026-winners.html)；2026-11-05搜索索引重新读取，直接抓取一次超时；观察层级为官方描述，不是竞品源码或同条件运行测试。

## 修改前比较

| 同一维度 | 官方可观察强项 | 我们起点 | 本轮门槛 |
| --- | --- | --- | --- |
| 数据/规则与可读结果、证据回查 | PHAROS_INC结合数据与确定规则；Agent Receipt证据关联可回查 | 已确认价格的指定页面纯静态，但无关页面的input placeholder或脚本导致全局unknown；当前源码直接复现，不冒充真实模型误判。 | 仅在可证明安全的页面及相关CSS依赖范围检查；同criterion多个约定全覆盖；脚本/模板/缺失CSS/复杂格式仍unknown；不得自动提升模型结论。 |

## DeepSeek讨论与独立裁定

计划审协议有效，采纳目标CSS内容/缺失外链unknown和parse5 rel token解析提醒；不递归猜测@import，直接unknown。实现后审格式无效，保留raw advice；唯一“parse errors被忽略”错误，helper末尾bodyCopy会以onParseError再次解析；root实际畸形title和NUL输入均返回uncertain:true，驳回。

## 实现与验证

hasUncertainSourceBodyCopyAtFile仅绑定HTML及直接本地CSS；<base href>、目标脚本/template/input、解析边界、外部缺失CSS和import/content/escape仍unknown。每file缓存、不改generic全源exactcopy；同criterion多checks保留mismatch及unknown。新5测试1绿4红→全绿；33相关项通过、typecheck/相关lint exit0。实际assessDelivery受控provider证明无关contact页不吞菜单错价，原quote/付款不变；不是一次真实模型准确率结果。

## 修改后同维度比较

| 差距 | 修改前 | 修改后证据 | 门槛 | 剩余 |
| --- | --- | --- | --- | --- |
| REAL-2 | 无关页面表单使菜单错价unknown | 精确绑定的菜单反证可保留，目标动态/缺样式仍unknown，33项受控测试 | 确定的文件范围污染已修；复杂DOM和新模型语义尚未证明 | 竞品同条件表现、外部真人/卖家采用、复杂运行功能未证明；Devpost/视频继续暂缓。 |
