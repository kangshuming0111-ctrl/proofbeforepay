# F1：面馆要求的独立源码结论

起点 c01044 / v86；固定范围见 acceptance.md。本轮实现之前记录。

参照为 PHAROS_INC（IBM Bob 2026 August 1st Place）的“数据、规则和可读报告”，及 Agent Receipt（同赛事 August Most Innovative）的证据关联与权限记录。官方来源：https://www.bemyapp.com/insights/ai-builders-challenge-with-ibm-bob-2026-winners.html ，root 于 2026-11-06 核实。本表只对照公开描述，不是同条件竞品测试或得奖概率。

| 维度 | 修改前 | 本轮门槛 | 修改后 |
| --- | --- | --- | --- |
| 用户价值 | 原 AI 未知会遮住实际可证的价格/标签事实 | 源码主结论和原 AI 分开，下一步明确 | 分别保存 modelJudgment/sourceFinding；实际首答与零调用回放可查 |
| 功能深度 | 语义等价、错误对象和页面范围可能保守未知 | 同对象价格等价/真实错值/错误页字段/真正不足各正确有据 | 4虚构变体9条：首次source有效8/9，受控修复零调用回放9/9；运行仍unknown |
| AI 实际贡献 | 已见批次12/14，raw误判仍保留 | 不改 raw；独立源码结论可核验；raw准确率单列 | 首次raw状态9/9，整答仍分qualified；不宣称模型准确率提高 |
| 完整流程 | 未绑定双方澄清决定 | 按 F2 当前有效确认限定范围，换版须复核 | 实际隔离HTTP双方确认第三case；历史prefix离线重算测试通过；上线实际UI由root验证 |
| 可信度 | source/model 解释尚未结构化分层 | 有界字段、精确引文及离线重算；旧报告不回写 | 精确引用、导出tamper、历史确认前缀、原答不变测试通过 |
| 易用性 | 用户可能只看到未知 | F4 显示源码结果/原 AI/下个处理人 | 已接三层字段及record_readback；真实生产UI由root验收 |

本轮不实现通用 HTML 语义引擎、新认证族、新平台适配、自动验收或支付。DeepSeek 计划/后审均独立裁定，不以两个 AI 同意代替真实操作。新增封存样例在模型调用前固定，不发给计划审阅器；固定8个场景和两旧案例是已知回归。

## 固定门槛内的受控修正

首次4次真实调用已全部保留：raw状态9/9，published7/9，sourceFinding优先的有效结果8/9；13个provider ID无遗漏，不能把这13个ID当9条语义准确率。实质未通过是普通inert template误触发全页不确定，导致活跃唯一错价暂缓；中文重启回读未知的下一步材料分类也不准确。以同一PHAROS_INC“规则与可读结果”参照，这两项仍为“部分缩小”，不是已关闭。限定修复独立源码价格事实的template策略及明确中文持久回读分类；既有published保守业务checker不放松、不开新协议。用原首答逐字零调用回放验证，不重新花模型token刷结果。

## 结账证据与边界

- `public/benchmarks/noodle-core-2026-11-06/latest.json` 指向完整首次4答、原始请求/封存参考、整体逐答审阅及后续零调用回放。原始首答有效8/9未被覆盖。四个是新编写虚构变体，0真实客户，0新增独立第三方仓库，不称通用准确率。
- 首次4次真实调用，9条语义参考/13个provider IDs，0遗漏/重复/解析拒报，估USD0.0129225。第三项实际隔离HTTP买卖双方分别确认scope，附加4个机械/mobile IDs不混入语义分母。
- 最后受控修复只允许独立price源码事实排除plain inert template；旧published checker保守不变，active脚本/handler、generated CSS、已报告parse错误、shadowrootmode、重复active对象均unknown。该源码关系检查不是完整HTML conformance或浏览器检验。
- 明确中文持久保存/重启独立回读被分类为`durable_record`并要求`record_readback`；只有HTML不成为通过。quoted文本仍是数据。
- 当前53项相关focused、type0；root完整1844测试与13项打包检查通过，原生产Earth解释保持不变；旁支关系helper仅保留ignored草稿，不发布。
- 有效计划与前后审均留存，DeepSeek提出的每个finding由Codex执行/独立裁定，未机械采纳推理错误。最后doctype建议实函数表明其strict-vs-fact差异来自template，实际active价并未被丢失；不扩本轮为HTML标准认证。

同一获奖对照下，固定面馆的“可读规则事实”和“证据与范围关联”门槛在上述受控输入已满足；不推断参照项目较弱、获奖概率或所有AI语义问题已解决。线上界面、持久化和同项换版复检由root的最终F2/F3/F4验证记录分别证明，不能用本地模型回放替代。
