# 第3轮：已确认业务数值的源码反证

日期2026-11-05 Australia/Melbourne。

## 修改前比较

参照[PHAROS_INC，IBM Bob2026 August Challenge1st Place](https://www.bemyapp.com/insights/ai-builders-challenge-with-ibm-bob-2026-winners.html)，2026-11-05重新读取官方：数据＋确定规则＋清楚报告。

| 可核实强项 | 修改前差距 | 本轮可检验门槛 |
| --- | --- | --- |
| 原始数据＋确定规则＋清楚报告 | 引用存在不代表AI判断满足确认价格；受控18/16负例得到supported且解释自己说不符。这是mock，不伪装真实模型首答 | 仅消费已确认businessChecks；指定页面唯一简单块明确币种/金额不符才否定supported，附真实自有引用；正确不提升。动态/复杂/多义为unknown，无确认计划不猜新义务。 |

## DeepSeek与独立裁定

首次round-3-plan不是合法JSON，仅作rawadvice。followup协议有效但两条均独立驳回：NFKC实测把￥５９９转成¥599，现price规则返回unavailable，非其声称falsepass；原需求source span是provenance，并不声称它必然蕴涵已另行确认的expected值。采纳防SKU归属、多金额/重复块、完整自有引文的有限规则方案；不加入风险标题/否定词通用语义匹配。后审round-3-post缺limitations且含额外字段，不是有效批准；raw三项均驳回：完整锚定政策句不允许其执行前缀（实际financial_action）；status已变unknown时下一段supported分支不能运行（有真实集成负例）；附带描述重复label按声明保守unknown而非误判mismatch。followup仍非合法JSON，提出raw changes_suggested不被负向guard覆写；这不是新授权/正式返工漏洞，unknown也不能证明原模型建议错，保留为一般false-change/语义矛盾尚未解决，不自动提升正例或覆盖复合义务。

## 实现与验证

本轮还以纯本地准入预检发现一类明确中文取消政策文案被误归unclassified：新增完整有限指令语法只允许source review，不自动支持。附加实际退款、记录、点击和运行标题仍优先veto；未知复合句不借用允许。新增2个语法测试与既有3项共5/5通过。这是调用前的开发修复，不宣称该新样本为严格heldout。业务数值反证实现完成：同criterion所有已确认检查；唯一简单text-only p/li中的显式大写ISO币种/金额不符，使用parse5原始UTF16引用修正supported；重复/复杂/脚本/不支持格式/无引用为unknown。正确值不提升任何模型结果，runtime/rules优先。源码/assessor/逐字/业务计划相关102/102通过，全仓类型与相关lint通过；测试未调用真实模型。

## 修改后同维度比较

| 同一维度/参照 | 修改前 | 修改后 | 门槛与剩余 |
| --- | --- | --- | --- |
| 数据/规则/报告 / PHAROS_INC | 结构化确认价格与明确源码差异仍可能跟随AI supported | 有限原文块反证可独立否定，引用自有定位，歧义保留unknown；明确中文政策不再无端拒绝源码评估 | 本轮受控门槛满足；没有结构化业务检查的一般文本、false-change建议及语义矛盾仍待核对，不能宣称全语义已解决。 |

竞品准确率未知；真实卖家/陌生人/客户泛化仍未验证。Devpost和视频暂缓。
