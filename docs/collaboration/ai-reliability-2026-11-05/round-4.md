# 第4轮：较长清单与真实模型复核

日期2026-11-05 Australia/Melbourne。起点主站v70 /83faec103a49fe45acc68e126d93c50fafa284da；后续每轮以实际累计工作树为起点，最终提交另记。

## 修改前比较

| 参照与准确奖项 | 官方可观察强项 | 我们当前差距 | 本轮门槛 |
| --- | --- | --- | --- |
| [The Green Room，IBM Bob2026 Grand Prize](https://www.bemyapp.com/insights/ai-builders-challenge-with-ibm-bob-2026-winners.html)，2026-11-05重新读取官方公告 | 明确用户输入到可用输出 | 现项目评测工具只允许每项目2标准，不能验证实际较长清单漏答 | 冻结新的多标准样本及参考；保留首答及失败原因；实际调用后独立整答裁定 |

这不是竞品私有代码审查、同条件准确率比较或整体优越性结论。外部卖家采用、陌生人使用和真实客户泛化继续未验证；Devpost及视频暂缓。

## DeepSeek讨论与独立裁定

DeepSeek计划round-4-plan协议有效。采纳真实parse派生mixed IDs、实际输出预算、单独结构诊断与固定失败reason。驳回file-count必须提高（新样本最多6文件，条款数不决定文件数）；不新增不存在的mobile-suppression标志；corpusText现有canonical绑定和orphan/newoutput/wx保护已在，未当新缺陷重写。所有页/手机基础标准不进入本次自定义标准隔离评测的限制明确写出，不声称完整产品端到端或全33项能力。

## 实现与验证

4个新合成项目已按真实生产parseStaticProject/summaryCoverageUnits核对。生产manual上限5、coverage上限12均不改；16条由4manual+12coverage组成，8条全coverage；另两个各2manual。只隔离评测2/8/16/2custom条款，完整生产项目另有page/mobile。runner支持真实derivedmixed清单，新增safe raw ID/typedfailure诊断，主完整率以所有attempts作分母；条件指标明确AmongParsedIdProfiles。测试发现coverage确认时间变化导致freeze不稳定，synthetic-only FIXTURE_TIME归一修复。34/34专项、全仓1222/1222、类型和相关lint通过。DeepSeek后审/最终followup均为非JSONraw建议，已通过sorted-key冻结、413前拒和network attempted计数测试驳回假前提；最后提出未来assessor变异/unknownusage语义不构成现码可达错误，未为其削弱guard或猜费用。设计者/本地准入预检已见样本，不称严格heldout。

首次实测freeze99d7ff994d8b22ca40778c6b5b2e16c7ff74c1765b0cdf890faff8c56942e911，23个实施源/依赖文件哈希；4次实际模型请求、无自动重试，保守usage估计USD0.0120591，非账单。2/8/16/2共28项全部返回，4/4stop+完整itemprofile，0missing/duplicate/unknown ID。4份通过应用结构/引文准入（不等于买家接受）；原始与应用状态27/28。coverage-10静态必需警示缺失却unknown，并与同答风险冲突；首次失败完整保留。整答独立审阅另记。

## 修改后同维度比较

| 同一维度/参照 | 修改前 | 修改后 | 门槛与剩余 |
| --- | --- | --- | --- |
| 清楚输入/产出 / The Green Room | 仅2标准样本，无法检验较长清单是否漏答 | 真实入口derived8/16清单，冻结四项目，首答28项完整且能分离结构/引用/语义指标 | 结构与取证门槛满足；27/28状态，不是通用准确率。缺失静态文案的unknown/风险不一致进入第5轮已知回归，首答不重写。 |

外部采用、陌生人、真实客户泛化仍未验证；Devpost和视频暂缓。
