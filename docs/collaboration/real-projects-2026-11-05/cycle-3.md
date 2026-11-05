# 第3轮：封存真实项目与复杂需求迁移检验

- 日期：2026-11-05
- 起始：主站v71，源码b2b75b7bfa4ad0928fe15a8ef121c522f3c3fe67；后续每轮准确树hash在实际freeze记录。
- 差距ID：REAL-3
- 参照：PHAROS_INC，IBM Bob2026 August Challenge 1st；Agent Receipt，August Most Innovative。
- 官方来源：[获奖公告](https://www.bemyapp.com/insights/ai-builders-challenge-with-ibm-bob-2026-winners.html)；2026-11-05搜索索引重新读取，直接抓取一次超时；观察层级为官方描述，不是竞品源码或同条件运行测试。

## 修改前比较

| 同一维度 | 官方可观察强项 | 我们起点 | 本轮门槛 |
| --- | --- | --- | --- |
| 数据/规则与可读结果、证据回查 | PHAROS_INC结合数据与确定规则；Agent Receipt证据关联可回查 | 此前28/28只有已知合成案例。新首次结果：Modern/Corona raw16/16，应用12/16，四项明确source labels/notice被错误unknown；Personal raw7/8，应用6/8，HTMLtitle文字被误unknown，回复时限缺失的参考存在动态来源歧义；另见缺少所有事实引用及由#!断言不收费的整答问题。Business Casual在调用后溯源发现历史家族已见，保留但剔出未见统计。两新留出项目由另一agent先封存。 | R1/R2完成并裁定后，针对真实首答发现的有限source-label/notice及HTMLtitle文字边界做通用修正，保留runtime/title/追加义务veto；收紧引用事实与placeholder运行推断提示。修正前不读封存留出要求，修正后固定请求再首答；首次/已知回归/未答/结构/引用/语义分别统计。 |

## DeepSeek讨论与独立裁定

计划审协议有效，采纳有限source labels/notice准入、#!不能证明不收费、引用需覆盖所有声称事实；原raw报告不重写。驳回其Corona manual5也被覆盖unknown（实际原始和应用均changes），不按AI错误定位修代码；固定不同runtime reason的断言亦与实际API记录不符。placeholder token只支持源码字符串，不能证明后端失败，采纳边界；不增加宽泛风险关键字过滤。

## 实现与验证

新增有限 source label/list/notice 与 HTML title 识别器，失败候选不回退为普通 copy；新增实际扣款、保证送信、跨重启持久化动作反例。44 项相关测试通过。真实开源源码与新增验收研究要求分列；新需求不是原客户合同。对照下一节保留本轮未解决的长清单误降未知与结构失败，后续分别进入第4、5轮。

## 修改后同维度比较

| 差距 | 修改前 | 修改后证据 | 门槛 | 剩余 |
| --- | --- | --- | --- | --- |
| REAL-3 | 见起点 | 同一原答受控回放 19/24→24/24、Personal 6/8→7/8；新调用原3项目23/24，Personal应用7/8，长清单6/16 | 有限标签边界达到；复杂属性和时间单位边界未达到，转第4轮 | 竞品同条件表现、外部真人/卖家采用、复杂运行功能未证明；Devpost/视频继续暂缓。 |


### 第三轮真实回归后的保留问题

原3响应受控0网络回放19/24→24/24，仅证明应用guard变化；Personal实际Modern字面误判补修后0网络回放6/8→7/8，剩余参考范围歧义保留。新真实回归并未全对：原3 raw/app23/24（FAQ缺句本次模型unknown），Personal raw8/8/app7/8（two working days误触发working运行词）。16项真实源码长清单raw16/16、app6/16，揭示10项明确静态源码/属性被保守层误改unknown。不是漏答：16项完整有答，但答案类别不正确。

最终DeepSeek followup格式无效且所列policy复合与colon/arrow候选互相矛盾；root逐条实际执行两种id的复合policy、保证邮件title、colon/arrow list，全部requires_observation或解析undefined，未按假漏洞再改代码。独立真实的三种动作synonym受控反例已加入44项测试。第三轮完成的是有限源标签/notice/标题与安全边界，复杂源码结构/时间措辞进入第4轮。

第三轮稳定后才释放两份封存真实项目，corpus a7ca63...字节不变，先freeze0789d600...再首答；后续修复不能把这些结果重新称首次未见。
