# 第20轮：复合要求逐义务补证

- 日期：2026-11-06 Melbourne；起点 v76 / dfe974ab0c6aa82bd258e66efcd55a7da9c8a631。后续来源以本批发布台账为准。
- 官方来源（2026-11-06重新核实）：https://www.bemyapp.com/insights/ai-builders-challenge-with-ibm-bob-2026-winners.html ；https://developers.googleblog.com/en/announcing-the-winners-of-the-gemini-api-developer-competition/ 。仅官方介绍层级，没有同条件竞品测试。
- PHAROS_INC 为 IBM Bob2026 August Challenge 1st Place；Agent Receipt 为 August Most Innovative；The Green Room 为 Grand Prize；Jayu 为 Gemini2024 Best Overall App。精确奖项不能互换。
- 比较是自有工程门槛，不是官方额外评分规则，不推断对手不存在同类问题。Devpost、视频继续暂缓。

## 修改前对照

主差距 G20：一个父项状态和一个主要补证原因遮住多动作。参照 Jayu / PHAROS_INC。本轮门槛：原文父项不变，有限子义务精确分句、各自未验证状态和补证步骤，不能从源码给执行成功。

| 维度 | 修改前与本轮检验重点 |
| --- | --- |
| 用户价值 | 店主是否知道具体结果与下一步，保留未知状态 |
| 功能深度 | 原文父项不变，有限子义务精确分句、各自未验证状态和补证步骤，不能从源码给执行成功 |
| AI贡献 | 原文、判断、确定规则和执行观察分别记录，不让一项代表全部 |
| 完整流程 | 原始约定、卖家证据、版本、返工和人工决定保持绑定 |
| 可信度 | exact来源、当前/历史、可重放、错误记录不得隐藏 |
| 易用/真实接入 | 陌生用户和外部卖家结果待验证，作者走查另记 |

## DeepSeek与独立裁定

对应审阅、裁定及源码哈希保留在 outputs/full-gap-remediation-2026-11-06；有效与无效工具回复分别记录。实施后补充同维度对照，未完成不能标为关闭。

## 修改后同维度对照

| 同一差距/参照 | 修改前 | 修改后 | 状态与剩余 |
| --- | --- | --- | --- |
| G20 / Jayu具体任务、PHAROS可读结果 | 一个主要补证原因 | 新V3保存source-obligations-v1分项，提交/邮件/持久写入/回读/重启后回读分别保持未验证，引用完整原始分句 | 有限拆解门槛已满足；不是自然语言全覆盖 |
| 功能/可信度 | 隐藏未识别的英文前句风险 | 后审真实P2已修复；引号数据不会虚构操作；当前与冻结验收metadata篡改拒绝 | 58项集成测试通过后另有一个possessive测试，最终测试另记 |
| 完整流程 | 旧报告无分项 | 旧V2/legacy保持无字段；新报告可保存/导出/逐条核对，不改变父项或付款 | 上线持久化/可见性在最终浏览器核验 |
| 易用/真实接入 | 尚无陌生试用 | 折叠中英检查方向和下一步 | 真人缺口继续G23 |

DeepSeekpost有效，采纳英文多句遗漏；其prototype finding自己论证无缺陷，独立驳回。Followup无P1/P2，P3全引号执行义务会待澄清保留。最终冻结前一行possessive边界及测试较followup选定packet有漂移，裁定明确记录，不能称评审了完全相同的最终字节。
