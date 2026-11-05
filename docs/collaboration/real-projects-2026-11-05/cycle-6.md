# 第6轮：结构约束取代仅靠提示的风险漏字段

日期2026-11-05；R5批次已完整保留，当前未部署。

## 修改前对照

| 差距/维度 | 官方参照与可观察强项 | 我们起点 | 门槛 |
| --- | --- | --- | --- |
| REAL-6 完整结构/可回查报告 | Agent Receipt IBM Bob2026 August Most Innovative（证据关联）、PHAROS_INC August1st（数据规则清楚报告）。官方 https://www.bemyapp.com/insights/ai-builders-challenge-with-ibm-bob-2026-winners.html 11-05官方索引复核，非竞品同条件测试。 | CleanBlog两次真实回复都8要求齐全但risk2缺suggestion，均已拒绝；prompt提醒后仍失败 | 用官方strict函数返回结构，保持本地所有字数/条数/引文/覆盖/来源及权限验证；不执行工具、不自动retry/fallback；兼容历史JSON全校验回放；先review再实做和新真实已知回归。 |

## API依据与边界

11-05重读 https://api-docs.deepseek.com/guides/tool_calls/ 与 https://api-docs.deepseek.com/api/create-chat-completion/ 。strict是Beta工具参数结构约束，base=/beta；每object全部required+additionalProperties:false，非thinking可强制唯一命名tool。不支持数组min/maxItems与字符串min/maxLength，因此这些继续应用层强校验。结构正确不等于语义、引文、条目完整或验收正确。调用只读取arguments作为数据，绝不执行外部函数。

## DeepSeek独立裁定、实现与再次对照

待计划/修改/验证完成；所有首次和R5失败保留，最终同案例只记已知回归。


### 真实异常与独立裁定

首次strict正确返回tool_calls和必填suggestion，但多出suggestionsNote:null，原始risk_fields拒绝保留。下次旧budget版本多出孤立闭合符，structure拒绝保留。再试达到旧1980tokens上限，usage实际prompt13631/completion1980，finishlength正确拒绝，均不是补成成功。

与DeepSeek讨论后仅实现有界无语义规范化：(1)每风险4必填own data字段全在且原值、字数、引文全部合法时，最多2个额外own null注释可忽略，系统计数备注不回显名字；任何非null/第三个extra/缺suggestion/访问器仍拒绝。(2)仅strict完整tool参数，在原JSON.parse失败后去掉最后一个孤立闭合符，只有前缀本身能解析成完整object才可规范化；不修legacy、截断、数组/字符串、多对象/更多符号；保留原envelope/originalContentText/originalJsonValid，规范文本另列。控制回放Beta原答app8/16→16/16，不是新模型准确率。

规范化后sourcepost有效；DeepSeek称JSON.parse会忽略多余}是错误，root实际含多余闭合符+换行的JSON.parse抛错，而严格helper显式标repaired=true，驳回。采纳其度量来源更清楚的建议，新增profileSource及original/normalized ID profile分计；完整完成总数包含有标记的normalized profile，不声称原JSON合规。

观察到8项旧预算1980不足后，改为min6400(3200+count*160)：8=4480、16=5760，输入与各字段尺寸/输出6400上限不变；unused allowance不作为实际费用，真实usage单列。测试保留length拒绝、费用reservation与共享actualbudget，未恢复截断数据。DeepSeek预算post称“若未来resume可能忽略unknownreserved”不是当前可达问题（当前unknown即break），不虚构新bug；不增加仅复刻公式的测试，现有意义测试验证headroom/cap/actual usage/错误count。

| 同参照/维度 | 修改前 | 修改后证据 | 门槛及剩余 |
| --- | --- | --- | --- |
| REAL-6 完整结构与回查 / AgentReceipt、PHAROS_INC | JSON提醒仍漏建议，strict仍额外null/孤立}、1980截断 | strict结构请求+本地必填/覆盖/引文校验；原异常均保留；有标记无字段修改兼容；更足输出余量；headroom7份64项全部准入、其中63状态匹配 | 结构门槛满足，APIstrict不是保证；发现1项逗号语义误报进入REAL-7，不能称整体完美。 |
