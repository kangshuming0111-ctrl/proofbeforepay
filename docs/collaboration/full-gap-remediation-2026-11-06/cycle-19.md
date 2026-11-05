# 第19轮：负向建议的独立源码依据

- 日期：2026-11-06 Melbourne；起点 v76 / dfe974ab0c6aa82bd258e66efcd55a7da9c8a631。后续来源以本批发布台账为准。
- 官方来源（2026-11-06重新核实）：https://www.bemyapp.com/insights/ai-builders-challenge-with-ibm-bob-2026-winners.html ；https://developers.googleblog.com/en/announcing-the-winners-of-the-gemini-api-developer-competition/ 。仅官方介绍层级，没有同条件竞品测试。
- PHAROS_INC 为 IBM Bob2026 August Challenge 1st Place；Agent Receipt 为 August Most Innovative；The Green Room 为 Grand Prize；Jayu 为 Gemini2024 Best Overall App。精确奖项不能互换。
- 比较是自有工程门槛，不是官方额外评分规则，不推断对手不存在同类问题。Devpost、视频继续暂缓。

## 修改前对照

主差距 G19：完整引用仍允许相反的缺失建议；已保存电话受控反例。参照 PHAROS_INC。本轮门槛：有限完整分句识别，AST精确正向依据挑战错误缺失建议，未知不放行，规则/业务不符和旧协议保持优先。

| 维度 | 修改前与本轮检验重点 |
| --- | --- |
| 用户价值 | 店主是否知道具体结果与下一步，保留未知状态 |
| 功能深度 | 有限完整分句识别，AST精确正向依据挑战错误缺失建议，未知不放行，规则/业务不符和旧协议保持优先 |
| AI贡献 | 原文、判断、确定规则和执行观察分别记录，不让一项代表全部 |
| 完整流程 | 原始约定、卖家证据、版本、返工和人工决定保持绑定 |
| 可信度 | exact来源、当前/历史、可重放、错误记录不得隐藏 |
| 易用/真实接入 | 陌生用户和外部卖家结果待验证，作者走查另记 |

## DeepSeek与独立裁定

对应审阅、裁定及源码哈希保留在 outputs/full-gap-remediation-2026-11-06；有效与无效工具回复分别记录。实施后补充同维度对照，未完成不能标为关闭。

## 修改后同维度对照

| 同一差距/参照 | 修改前 | 修改后证据 | 状态与剩余 |
| --- | --- | --- | --- |
| G19 / PHAROS确定检查与可读报告 | 电话已在精确引文里仍发布缺失建议 | 新有限phone/email完整分句解析与AST原文依据，changes转unknown，固定中英说明；原风险暂缓 | 已复现边界修复；通用语义判断未证明 |
| 功能/可信度 | 无此独立护栏 | 24/24相关测试，type0；明确实际缺失和失败规则保留，V2/legacy不变 | 0模型/网络的受控测试，不是新真实模型成绩 |
| 易用/真实接入 | 无独立用户结果 | 仍无独立真人结果 | 继续保留G23 |

DeepSeek有效plan建议采纳有限grammar、完整owner、固定双语和规则优先；post误读显式encoding===catalog_slots条件，独立V2/legacy回放证伪并驳回。两次无效初始审阅保留，未冒充有效反馈。测试夹具曾缺manual intake标准title，修正夹具后24/24；不将夹具准入失败称作生产缺陷。
