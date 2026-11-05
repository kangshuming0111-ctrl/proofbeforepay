# 第23轮：陌生任务的可检验使用路径

- 日期：2026-11-06 Melbourne；起点 v76 / dfe974ab0c6aa82bd258e66efcd55a7da9c8a631。后续来源以本批发布台账为准。
- 官方来源（2026-11-06重新核实）：https://www.bemyapp.com/insights/ai-builders-challenge-with-ibm-bob-2026-winners.html ；https://developers.googleblog.com/en/announcing-the-winners-of-the-gemini-api-developer-competition/ 。仅官方介绍层级，没有同条件竞品测试。
- PHAROS_INC 为 IBM Bob2026 August Challenge 1st Place；Agent Receipt 为 August Most Innovative；The Green Room 为 Grand Prize；Jayu 为 Gemini2024 Best Overall App。精确奖项不能互换。
- 比较是自有工程门槛，不是官方额外评分规则，不推断对手不存在同类问题。Devpost、视频继续暂缓。

## 修改前对照

主差距 G23：首次用户与独立卖家无新增实际结果，不能由AI填充。参照 The Green Room / Jayu。本轮门槛：复用既有真实首次使用记录器；补新动态任务说明、未完成基线和操作者演练；真实参与仍待验证。

| 维度 | 修改前与本轮检验重点 |
| --- | --- |
| 用户价值 | 店主是否知道具体结果与下一步，保留未知状态 |
| 功能深度 | 复用既有真实首次使用记录器；补新动态任务说明、未完成基线和操作者演练；真实参与仍待验证 |
| AI贡献 | 原文、判断、确定规则和执行观察分别记录，不让一项代表全部 |
| 完整流程 | 原始约定、卖家证据、版本、返工和人工决定保持绑定 |
| 可信度 | exact来源、当前/历史、可重放、错误记录不得隐藏 |
| 易用/真实接入 | 陌生用户和外部卖家结果待验证，作者走查另记 |

## DeepSeek与独立裁定

对应审阅、裁定及源码哈希保留在 outputs/full-gap-remediation-2026-11-06；有效与无效工具回复分别记录。实施后补充同维度对照，未完成不能标为关闭。

## 已实现与待最终核验

新主站折叠引导复用main v1真实会话协议；每角色三个任务，当前任务计时、帮助、受阻/放弃原因、完成列表与重做上一项。单次wallanchor加monotonicelapsed，完成后长期闲置不虚增会话或使已完成记录失效。共享纯validator从原CLI等值提取，CLI仍重导出同一函数；不改原真人聚合门槛。

| 同一差距/参照 | 修改前 | 修改后 | 状态与剩余 |
| --- | --- | --- | --- |
| G23 / The Green Room清晰输入输出、Jayu具体任务 | 本机记录器已有但主站无任务式引导 | 新双语主站三任务引导、可见步骤/结果/阻塞、局部重做与记录导出 | 17项domain/SSR+旧CLI测试通过；浏览器实操另记 |
| 可信度 | 陌生真人数据为空 | 新UI固定operator_walkthrough、无人类模式，unfamiliar/external均false，不上传/不收合同或身份信息 | 真人/外部卖家效果仍未验证，不能用新代码关闭数据缺口 |
| 易用/完整流程 | 不清楚如何记录卡点 | helpcap20明确、受阻vs放弃解释、下载前可核对任务列表；不自动触发业务决定 | 作者/自动化走查不是独立用户研究 |

有效post的两项提示易用性建议采纳；其严重度是reviewer标注，不当作资金/权限缺陷。无效首次post另存未使用。修正后的followup与最终测试记录会并入摘要。
