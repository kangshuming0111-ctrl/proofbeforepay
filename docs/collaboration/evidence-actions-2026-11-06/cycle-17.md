# 第17轮：保存并展示暂缓线索原件

- 日期：2026-11-06 Melbourne；起始为v75/b21031d加第16轮已保存的工作树与其冻结哈希。第16轮当前15份原答回放82项不变、25项未知都有原因；UI待线上验。
- 参照：Agent Receipt，IBM Bob2026 August Most Innovative。官方描述证据关联、可回放收据；PHAROS_INC为该月第一名，规则与清晰报告。Grand Prize是The Green Room。本轮只比较可核实维度。
- 主办方：https://www.bemyapp.com/insights/ai-builders-challenge-with-ibm-bob-2026-winners.html ，2026-11-06重新读取；无对手源码或同条件实测。

| 维度/主差距 | 修改前 | 本轮门槛 | 初始状态 |
| --- | --- | --- | --- |
| E17证据可追溯 | 整组风险暂缓仅保存数量，线上风险原话已丢失 | 合法原风险在独立只读隔离区完整保留，带原index/引文/触发的状态调整；active risks语义不变 | 待实现 |
| 用户价值/流程 | 0条已发布风险可能不够解释暂缓情况 | 在风险区直接给数量、原因、查看入口；旧无元数据报告明确不可恢复 | 待实现 |
| 功能深度/可信度 | 旧报告和快照不能猜补原件 | 旧格式兼容，current/history共用严格校验，假引用仍先整份拒绝，容量超限不截断 | 待验证 |
| 易用/真实接入 | 仍缺陌生卖家/真人研究 | 本轮不冒充真人验证，不自动付款/接受/返工 | 保留 |

拟新增withheldRisks v1独立对象，保存唯一调整项和0..N-1原risk位置；最大5risk，每risk原有120/600/400文字与1–3引用限制不变。它不是坏响应收容区。第18轮再加入明确风险来源的人工批注，不复用active riskIndex假装同一风险。

DeepSeek独立意见、裁定和同维度修改后证据待填写。Devpost、视频仍暂缓。

## 实现与同维度复核

DeepSeek post和followup均有效。其最初3条指控经当前反例复测不成立：6risk被assessor提前拒绝、矛盾disposition原已拒绝、24种真实文案组合最小框架最高650字符且草稿均不超1000UTF16。另将publisher自身5risk上限改为所有分支都执行，作为防御性接口约束；没有采用放宽导出上限的建议。followup无剩余findings，审阅自身未执行测试，个别叙述仍不准确；主代理以源码和测试裁定。

| 同一维度/参照 | 前 | 后 | 门槛与剩余 |
| --- | --- | --- | --- |
| E17可信度/AgentReceipt可追溯 | 线上仅暂缓数量，原件不可复查 | 独立v1池保存原位置、完整已校验文字/引文、全量from/to调整；active风险不变 | 原15答回放6条/15引用逐值原wire一致；15/15完整状态ledger，共4调整 |
| 用户价值/PHAROS清楚报告 | 无法区分未暂缓、0原件、未记录 | 新V3显式not_withheld或item_status_adjusted；独立默认收起，直接可见数量与统一暂缓原因 | UI16/16，浏览器最终发布后核对 |
| 功能深度 | 历史/坏risk边界未涵盖新池 | 新5risk×3cite、120/600/400、500UTF16、33状态转移；current/history共用严格验证 | core67/67；追加反例30/30；旧无元数据不补写 |
| AI贡献 | 安全弃权却丢可用线索 | 原状态/说明/引文/limitations/请求保持，仅增加可追溯保存 | 不提高模型状态分数；不知道风险实际是否成立 |
| 完整流程 | 暂缓池不能批注 | 本轮只读原件，无确认/驳回/返工，资金与验收不变 | E18独立origin人工批注待实现 |
| 易用与真实接入 | 无陌生真人/外部卖家 | 版本归属和完整原话可查；与已发布池分开 | 真人效果继续未验证；不宣称整体超过获奖项目 |

新disposition为所有新V3保存（包括未暂缓），避免无字段被误认为旧报告。旧legacy/V2仍无新字段。原始risk验证和输出预算在隔离之前执行；此池不是坏回答收容区。unsigned离线验证只证明结构/引用/绑定自洽，原模型lineage由受控原HTTP回放另验。可选线索仍整组暂缓，可能一并暂缓与调整项无关的有用线索；本轮保存并展示它们，不猜语义依赖。

记录见outputs/evidence-actions-2026-11-06/cycle-17-refined-replay.json、cycle-17-adjudication.json、cycle-17-withheld-green.log、cycle-17-withheld-ui-focused.log和cycle-17-final-counter-regressions.log。没有浏览器/第三方后台执行或真人研究；当前工作树待三轮整合发布。Devpost/视频暂缓。
