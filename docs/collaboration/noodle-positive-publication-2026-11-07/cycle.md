# 面馆修正版价格：有限正向发布核对

- 日期：2026-11-07，Australia/Melbourne。
- 起点：native af8d576ffa0bee43af40cff4c9d7e6832ba546be / 线上v90。
- 主差距 NP-2：相同修正版的模型原答和独立源码事实都支持AUD18，但旧发布仍因纯未启用模板暂缓。
- 参照：PHAROS_INC，IBM Bob2026 August Challenge 1st Place；Agent Receipt，同赛August Challenge Most Innovative。来源为[主办方公告](https://www.bemyapp.com/insights/ai-builders-challenge-with-ibm-bob-2026-winners.html)，本轮重新读取。观察层级仅官方描述，没有同条件运行竞品，不称总冠军或总体胜出。

## 动手前的差距

| 差距／维度 | 官方可核实参照强项 | 本项目起点 | 本轮可检验门槛 |
| --- | --- | --- | --- |
| NP-2 / 规则与可读报告 | PHAROS_INC的确定性规则与清楚报告 | 保存的v90修正版原答supported、sourceFinding supported、published insufficient_evidence；实际网页重开复现 | 全部锁定价一致、原引用完整覆盖每个同页对象、安全静态owner和全源条件满足后，有限发布supported；其余未知继续挡住 |
| NP-2 / 证据与范围 | Agent Receipt的证据关联及回放记录 | 正例未采用已完整验证的源码事实；原答和旧报告已经独立保存 | 新positive reason可由原要求、原引用、源文件重算；旧v90未知报告保持原样可核对，不能逆改旧记录 |

## DeepSeek意见与独立裁定

本轮有限方案、反例及审阅结果另存在新目录，不发送凭据或客户材料。根要求新正例必须核对原模型引用完整覆盖每个锁定字段，并在原positive guard分支处理，使后续检查继续执行。独立审查实际发现：仅凭声明值一致会漏掉style/class隐藏，因此必须加更严格的positive-only安全来源条件；既有sourceFinding声明层、负例规则与parser不改。有效最终评审及逐项裁定已保留。DeepSeek最后的P2经真实反例否定：删除第二价格时source与published均为未知，exact-copy分支不适用；没有为此猜测改码。

## 实施与验证边界

只增加既有面馆锁定菜品价格的有限正向发布，不扩表单正例、不扩市场或通用渲染引擎，不修改原要求。模型未知、错价、字段对应不全、动态/隐藏/样式不确定、无引用、引用超预算和真实运行要求不能靠此门槛通过。源码支持不自动验收或付款。

既有v90实际原始HTTP答复未完整留存；如果用其保存的modelJudgment重建受控工具答复，应明确称服务器pipeline测试，不能冒充逐字节provider首答重放。新增网页测试另行记录真实点击与保存报告，并与离线检查分开。最终代码测试和实际上线结果以本轮执行收据为准，不预先填通过。

## 修改后再次对照

| 同一差距与参照 | 修改前 | 修改后及证据 | 达标状态与边界 |
| --- | --- | --- | --- |
| NP-2 / PHAROS_INC规则与报告 | 纯静态修正版的价格声明已核对仍被模板暂缓 | 新有限价格正向门槛；1883/1883、type0、packager13/13；保存的原模型条目在明确合成的工具回复中通过完整server流程 | 代码门槛满足，实际网页另记发布后收据；没有给竞品总体分数 |
| NP-2 / Agent Receipt证据与范围 | 正向发布缺采用依据 | 新locked_price_match marker重算原文、typed值、安全owner和原始引用；旧v90报告继续原样consistent；旧负例原答精确回放9/9状态仍保持 | 内部一致性已验证；模型身份、渲染、运行、人工验收和付款仍不是源码证明 |

这轮独立反例先后发现native隐藏容器、popover属性及额外营业时间义务误放，并在positive-only有限tag/attribute/whole-clause门槛封住，原事实parser、负例与历史记录未改。后续guard继续执行，改变结论或规范证据时不能保留正向marker；已有后续exact-copy未知控制证明未跳过。

实际网页将沿同一项目执行隐藏反例与逐byte相同修正版，各次首答与导出分别记录；本文不预先宣告现场成功。Devpost、视频、真实商户研究与业务扩张继续暂缓。
