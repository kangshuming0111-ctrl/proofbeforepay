# 第2轮：业务AI解释的覆盖缺口

日期2026-11-05 Australia/Melbourne。起点主站v70 /83faec103a49fe45acc68e126d93c50fafa284da；后续每轮以实际累计工作树为起点，最终提交另记。

## 修改前比较

| 参照与准确奖项 | 官方可观察强项 | 我们当前差距 | 本轮门槛 |
| --- | --- | --- | --- |
| [PHAROS_INC，IBM Bob2026 August Challenge1st Place](https://www.bemyapp.com/insights/ai-builders-challenge-with-ibm-bob-2026-winners.html)，2026-11-05重新读取官方公告 | 实际数据、确定性规则、可读报告结合 | 受控有效双问题报告，AI只解释一项仍正常保存；页面未指出其余关键诊断未解释 | 逐问题显示已引用/模型未解释/输入上限未发送/无可用解释，保留原确定性事实和历史可读 |

这不是竞品私有代码审查、同条件准确率比较或整体优越性结论。外部卖家采用、陌生人使用和真实客户泛化继续未验证；Devpost及视频暂缓。

## DeepSeek讨论与独立裁定

DeepSeek计划round-2-plan协议有效：采纳派生覆盖、8条packet cap区分、两个UI位置一致呈现；驳回“旧解释无法从原报告重建覆盖”（保留exact report/revision可确定派生），也不将非空单组称作零诊断。旧partial历史保持可读；新provider只增加明确cover已发送关键ID的提示，不伪造覆盖，不影响确定性结论。后审round-2-post协议有效。驳回P2：checking时diagnosis/packet均不存在，coverage组件不渲染，新增可见行为SSR通过。驳回P3："无AI解释"并非"模型漏答"，整体及逐行已区分未发送/无可用结果，不需将未发生的状态改成pending。

## 实现与验证

新增共享modelExplanationCoverage及紧凑UI，当前/历史两个位置一致。关键项按已引用诊断ID计数，不冒充语义正确；缺失行展开后显示原报告预期/实际/复测并标明非AI补答。无新schema、额外调用或判断变动。真实provider/save受控复现仍保存partial，原预约问题现在明确provider_omission。新8项coverage/SSR加既有15项共23/23通过；checking状态真实调用点回归证实不显示覆盖计数或旧解释。新文件与provider相关lint0；两个旧UI基线lint数目保持不变（3errors/3warnings合计），未称全仓lint清零。

## 修改后同维度比较

| 同一维度/参照 | 修改前 | 修改后 | 门槛/剩余 |
| --- | --- | --- | --- |
| 规则事实与清楚解释 / PHAROS_INC | AI仅解释部分issue，用户无显式覆盖提示 | 同源逐问题覆盖；未答不会消失，原规则事实可展开，不伪造补答 | 本地真实组件SSR预览还通过CUA桌面、375px、中英与展开核查；窄屏body/root宽均375，viewport已复原。页面明确合成/0真实模型，不冒充线上客户项目。本轮门槛满足；覆盖只说明ID引用，不能证明自然语言解释正确，也未新增真正补答。 |

外部采用、陌生人和一般语义正确性继续保留；下一轮仅处理已确认业务数据的有限源码反证。
