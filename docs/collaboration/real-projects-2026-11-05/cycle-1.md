# 第1轮：逐字文案与运行能力分开

- 日期：2026-11-05
- 起始：主站v71，源码b2b75b7bfa4ad0928fe15a8ef121c522f3c3fe67；后续每轮准确树hash在实际freeze记录。
- 差距ID：REAL-1
- 参照：PHAROS_INC，IBM Bob2026 August Challenge 1st；Agent Receipt，August Most Innovative。
- 官方来源：[获奖公告](https://www.bemyapp.com/insights/ai-builders-challenge-with-ibm-bob-2026-winners.html)；2026-11-05搜索索引重新读取，直接抓取一次超时；观察层级为官方描述，不是竞品源码或同条件运行测试。

## 修改前比较

| 同一维度 | 官方可观察强项 | 我们起点 | 本轮门槛 |
| --- | --- | --- | --- |
| 数据/规则与可读结果、证据回查 | PHAROS_INC结合数据与确定规则；Agent Receipt证据关联可回查 | 完整逐字文案指令的引号数据包含 payment/预约 时，范围分类错误地将纯文字要求设为运行未知；源码与真实模型基线待取得。 | 完整directive共享解析；引号字面内容不扩大成运行承诺；标题和追加义务仍veto；真实项目原件和首答均保留。 |

## DeepSeek讨论与独立裁定

计划审为malformed JSON，按原始建议裁定：确认quoted literal误触发运行veto及共享完整parser方向，采纳；其policy path缺失结论自相矛盾、无实际实例，驳回。实现后审协议有效；其唯一P3称中文ASCII引号不支持，实际regex第一分支已支持，root执行literal=预约成功且scope=source_text反证，驳回。没有因AI反馈重复修改已有正确逻辑。

## 实现与验证

提取exact-copy-directive共享finiteparser，scope只把完整指令的quoted literal当数据；runtime title、mobile、追加义务仍veto。新4项测试修改前1绿3红，修改后相关32/32，typecheck和相关lint均exit0。实际assessDelivery受控回复路径证明纯字面Payment可保留支持；原quote/付款不变。0新模型调用归属于此独立规则测试。旧v71的23源在改代码前逐known-freeze哈希复制，真实新语料首次调用使用该副本，不冒充新实现baseline。

## 修改后同维度比较

| 差距 | 修改前 | 修改后证据 | 门槛 | 剩余 |
| --- | --- | --- | --- | --- |
| REAL-1 | quoted literal中的支付/预约被误判运行要求 | 完整逐字directive现可source检查，32项受控反例通过；真实新语料自然labels语法仍有过度unknown，转REAL-3 | 有限逐字边界门槛满足；不是所有文字误判已解决 | 竞品同条件表现、外部真人/卖家采用、复杂运行功能未证明；Devpost/视频继续暂缓。 |
