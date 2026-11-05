# 第16轮：让证据不足成为可执行的补证任务

- 日期：2026-11-06 Melbourne
- 起始：b21031d / v75
- 主差距：E16 未知结论只有一般说明和通用草稿，不能稳定区分缺引文、跨页范围、字段关联与运行证据。
- 参照：PHAROS_INC，IBM Bob 2026 August Challenge 1st Place；Agent Receipt，同月 Most Innovative。官方描述分别强调规则与清晰报告、证据关联及可回放记录。
- 官方来源：https://www.bemyapp.com/insights/ai-builders-challenge-with-ibm-bob-2026-winners.html （2026-11-06重新读取；只知官方描述，没有对手代码/同任务实测）。Grand Prize为The Green Room，不混同奖项。

| 起点差距 | 本轮门槛 | 修改前证据 | 状态 |
| --- | --- | --- | --- |
| E16 可解释未知/用户下一步 | 原因由服务器实际guard赋值；显示准确补证类型、相关文件与有边界的行动；生成可编辑草稿；保持状态和原文 | delivery-assessment.ts各guard只替换说明；assessment-feedback.ts末尾通用补证句 | 待实现 |
| 完整流程 | 只创建草稿，不代买家接受、发反馈或付款；旧报告不得捏造原因 | 当前历史报告无结构化reason | 待验证 |
| 可信度 | 新元数据与保存/导出/历史/字节预算相容，不按AI解释正则猜原因 | evidence-export.ts为显式字段allowlist | 待验证 |

DeepSeek计划、主代理裁定、实现与前后对照将在验证后补充。后续仍需保留E17暂缓风险原件和E18复核/换版问题。Devpost与视频继续暂缓。

## 实现、独立反馈与修改后对照

DeepSeek计划与post评审均有效。采纳实际guard赋reason、精确target、共用导出验证与草稿预算控制；post指出长文件清单指向折叠面板的P3，已改为明确“短草稿未含完整清单，请核对同版本提示并编辑补全后再发送”。没有按其criterion namespace误解改写要求ID，也没有声称unsigned元数据证明模型执行。

| 同一维度/参照 | 修改前 | 修改后证据 | 门槛/残余 |
| --- | --- | --- | --- |
| 用户价值/PHAROS清晰报告 | 通用补证请求 | 12有限原因、共享中英下一步、完整目标清单和可编辑1000UTF16草稿 | 源码/渲染测试20/20；真实新手效果待验 |
| 功能深度/AgentReceipt证据关联 | 原因被压成自由说明 | 实际guard同分支产生新metadata，未知才保存；旧报告不猜补 | 原15答82项回放、25/25未知有原因；0网络/API |
| AI贡献 | 原始误判/保守未知边界 | 全部原状态/说明/引用/请求逐字保持，只加metadata | 不当作模型准确率提高；仍有3保守未知 |
| 完整流程 | 草稿不发送 | 原readonly/busy/缺锁定原文和角色入口保留；不接受/付款 | 本地测试通过；最终线上验证待发布 |
| 可信度 | 导出拒新增字段 | current/history共用严格可选结构校验，31/31含旧报告/篡改/40目标 | binding不证明原因真实或模型执行；Lab将在最终阶段重编译 |
| 易用性/真实接入 | 无真人研究 | 文件清单折叠，未定位文件明确提示，旧格式明确未记录 | 真人/外部卖家差距仍保留 |

记录：outputs/evidence-actions-2026-11-06/cycle-16-final-replay.json；cycle-16-core-final.log；cycle-16-export-needs-green.log；cycle-16-post-adjudication.json。静态/受控回放没有浏览器或后台执行，没有修改资金和验收。主源及线上版本在三轮整合发布后由台账记录。下一轮E17仍是风险原件丢失；E18仍需独立来源批注和换版控制。Devpost/视频暂缓。
