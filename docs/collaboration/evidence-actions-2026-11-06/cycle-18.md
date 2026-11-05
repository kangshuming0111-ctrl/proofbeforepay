# 第18轮：分开记录人工意见并检验完整链条

- 日期：2026-11-06 Melbourne。起始为v75/b21031d加第16/17轮冻结工作树，准确实现SHA由对应replay/tool记录。
- 主差距E18：新增独立隔离池尚不能沿用active riskIndex批注，否则同index会指错对象。复杂边界、换版和离线验证还需单独证据。
- 参照：Agent Receipt（IBM Bob2026 August Most Innovative，证据关联/权限范围/可回放收据），PHAROS_INC（同月第一名，确定规则/清晰报告）；Grand Prize为The Green Room，不推断对手内部测试/可靠性。
- 主办方：https://www.bemyapp.com/insights/ai-builders-challenge-with-ibm-bob-2026-winners.html ，2026-11-06核实，观察仅官方描述。

| 维度/起点差距 | 本轮具体门槛 | 状态 |
| --- | --- | --- |
| 用户价值 | 双方能对具体暂缓线索记录核实/驳回/待补证的理由，刷新可读 | 待实现 |
| 功能深度 | optional riskOrigin=withheld独立命名空间；缺省published；相同index、幂等、换版/旧report/越界均正确 | 待验证 |
| AI贡献 | 8封存synthetic新边界首答，原model与app状态/准入/引文分别记录；原15答82项回放不偷升状态 | 待执行 |
| 完整流程 | 批注只追加意见，不移动隔离/不改变items、验收快照、付款、sourceVisibility/riskRepair映射 | 待验证 |
| 可信度 | current+history+CLI+Lab使用相同最终验证器；新可选记录不补写旧报告 | 待验证 |
| 易用/真实接入 | 中英提示和补证草稿可观察；真用户与外部卖家仍未验证 | 保留 |

8边界在任何这些场景的模型首答前封存于scripts/evidence-actions-boundary-corpus-2026-11-06.json和独立references。它们是0第三方仓库/0客户样本，源码真值与故意部分引用的受控预期分别定义。不得改参考凑分、重试择优或掩盖首次失败。

DeepSeek将就第17轮post与第18轮方案独立评审，主代理裁定后实现和复测。最终版本/来源/浏览器/API/导出证据另由发布台账回填。Devpost与视频暂缓。

## 最终实现、实际发现和再次对照

DeepSeek17post的namespace规划建议落实后，18post把0>=0错误写为false，其复现自己随后承认无生产路径可达；主代理以14来源测试及全索引控制驳回。独立followup有效并撤回该finding。没有为迎合错误算术放宽或重写已通过的pool门槛。

真实首答8例揭露实际P2：模型把full menu自行映射menu.html后提出修改，负向建议未经过仅用于supported的scope gate。DeepSeek与独立整答AI分别确认；新增窄门槛只在rawchanges、最终仍changes、明确unconfirmed_page_scope且无已确认业务差异时降unknown/page_scope/空targets。新7例红灯中3红4绿；修复后相关51/51。规则fail、typed价格差异、明确文件错标签/文件缺失优先级保留；不把其它unknown理由一律降级。scope后审有效，余P3示例contact/booking本身不满足tag candidate且booking会先需观察，不据此扩展解析器。

独立复核还指出复合邮件/回读的补证提示不够具体，已在共享readback下一步加入“若同项含邮件/其他执行，分别核对”的条件说明，UI/草稿均复用并保持1000UTF16；不宣称完整复合义务分类器。

| 同维度/参照 | 修改前 | 修改后证据 | 结果/剩余 |
| --- | --- | --- | --- |
| 用户价值/PHAROS可读报告 | 通用补证与仅数量暂缓 | 原因/精确文件/可编辑草稿；q原件和独立人工意见 | 新手真人效果未测 |
| 功能深度/AgentReceipt关联范围 | 相同riskIndex不能复用 | origin缺省published、显式withheld，两角色/两来源/过期/幂等/历史容量控制 | server81/81；UI22/22；实际浏览器与DB由发布后证据另记 |
| AI贡献 | 首答8例raw5/8 app6/8；app整答1拒 | 原8body唯一alias整改，其余7完整不变；known复测raw6/8 app7/8；app整答6接受2保留0拒 | 第一次与已知重测不合并为新项目或通用准确率 |
| 完整流程 | 暂缓池只读 | 追加人工意见，原风险/逐项/隔离/已冻结验收及capture不变，旧版不继承 | 真实资金动作未执行；Devpost/视频暂缓 |
| 可信度 | 安全门槛旧集仍有同族隐含映射 | 旧15严格不变回归真实失败后独立逐份诊断：14相同，仅Tavola c3同族澄清 | 固定参考79→78/82、未知25→26，原参考不改，不放宽为保分 |
| 易用/真实接入 | 旧无metadata不能恢复原件 | 新V3显式disposition，旧记录保持原样，CLI/Lab共享最终验证器 | 陌生真人/外部卖家差距仍未验证，无整体超过对手声明 |

16真实项目评估调用（8first+8knownrepair），usage估计USD0.0369498，不是invoice。首次CLI误传maxUsd2被工具上限1拒绝，0API/0attempts，原preparing文件保留；改用新output首次真正发送8，不是模型重试择优。8场景均自撰synthetic/0第三方仓库/0客户。原首次35条引文、修复复测29条原始引文均精确；item/active/q分层见独立整答审计与summary。

15旧答最终有26项unknown、5项原wire到发布状态变化，6条隔离风险/15引用原话保持。旧严格gate失败明确保留；新的白名单诊断只允许Tavola c3状态/说明/原因及系统计数2→3，所有其余数据不变。60个本地域双角色批注及60幂等通过、68错pool/120过期拒绝；这些不是数据库持久化或真人试用。

最终全套1478/1478与type0；本地Lab8/8、built ESM验证0、viewer/bundle22/22。精确源码、first/repair原答、各次有效/无效评审、独立裁定保留；具体主站/Lab发布版本与hosted操作在最终台账报告，不能用本机通过代替上线。剩余两项qualified是显式缺文件的保守参考政策差异和双价rowspan自由说明不够精确；模型不是终审。
