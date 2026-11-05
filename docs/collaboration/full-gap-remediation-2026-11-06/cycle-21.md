# 第21轮：动态网站分层实际检验

- 日期：2026-11-06 Melbourne；起点 v76 / dfe974ab0c6aa82bd258e66efcd55a7da9c8a631。后续来源以本批发布台账为准。
- 官方来源（2026-11-06重新核实）：https://www.bemyapp.com/insights/ai-builders-challenge-with-ibm-bob-2026-winners.html ；https://developers.googleblog.com/en/announcing-the-winners-of-the-gemini-api-developer-competition/ 。仅官方介绍层级，没有同条件竞品测试。
- PHAROS_INC 为 IBM Bob2026 August Challenge 1st Place；Agent Receipt 为 August Most Innovative；The Green Room 为 Grand Prize；Jayu 为 Gemini2024 Best Overall App。精确奖项不能互换。
- 比较是自有工程门槛，不是官方额外评分规则，不推断对手不存在同类问题。Devpost、视频继续暂缓。

## 修改前对照

主差距 G21：现有固定预约协议强，但一般提交、存储、回读与邮件适配不明。参照 Jayu / PHAROS_INC。本轮门槛：明确适配器执行四层，真实本机请求/SQLite新连接/测试收件箱，故障各层可辨别，任意网站和外部收件不伪称支持。

| 维度 | 修改前与本轮检验重点 |
| --- | --- |
| 用户价值 | 店主是否知道具体结果与下一步，保留未知状态 |
| 功能深度 | 明确适配器执行四层，真实本机请求/SQLite新连接/测试收件箱，故障各层可辨别，任意网站和外部收件不伪称支持 |
| AI贡献 | 原文、判断、确定规则和执行观察分别记录，不让一项代表全部 |
| 完整流程 | 原始约定、卖家证据、版本、返工和人工决定保持绑定 |
| 可信度 | exact来源、当前/历史、可重放、错误记录不得隐藏 |
| 易用/真实接入 | 陌生用户和外部卖家结果待验证，作者走查另记 |

## DeepSeek与独立裁定

对应审阅、裁定及源码哈希保留在 outputs/full-gap-remediation-2026-11-06；有效与无效工具回复分别记录。实施后补充同维度对照，未完成不能标为关闭。

## 实现后的同维度对照

DeepSeek 方案与有效 post-review 分别保留在本批公开证据的
`cycle-21-plan-deepseek.json` 和 `cycle-21-post-deepseek.json`。有效 post
返回 `findings: []`；主代理确认无需依照未复现推测追加代码。AI 审阅只作
源码建议，不代替下面的实际运行。

| 原维度／同一参照 | 修改前 | 修改后与实际证据 | 本轮门槛／保留差距 |
| --- | --- | --- | --- |
| 用户价值／PHAROS 可读报告 | 一般提交、存储、回读、邮件是否适配不清楚 | 四阶段各自显示记录相符、不符、未知、未适配；可在现有接入指南选择本地 JSON | 有具体下一步；陌生店主能否理解仍未真人测量 |
| 功能深度／PHAROS 确定规则 | 固定预约检验较深，一般业务阶段没有独立适配器接口 | 显式本地 adapter、完整四阶段、身份／内容摘要／新连接声明、异常脱敏、超时与并发控制；未知不自动重试 | 22/22 相关测试；仅支持明确适配的阶段，不能自动扫描任意网站 |
| AI 贡献／Jayu 完成可观察任务 | 源码说明容易与实际执行混淆 | 本轮探针不调用 AI；实际原生 HTTP、SQLite 和测试收件记录与模型说明分开 | 0 新模型调用；运行结果不得冒充 AI 自动完成全部检验 |
| 完整流程／Jayu 具体用户任务 | 一次提交成功不能说明整条复合要求成功 | 正确版与不落库、错回读、无邮件三种故障版分别运行，单层差异保留 | 四个自建合成 profile 均与运行前 oracle 相符；导入报告尚未绑定为当前项目验收证据 |
| 可信度／Agent Receipt 可回放证据 | 声明结果缺少逐阶段来源 | 同一报告保留 plan、scope、run、版本和阶段原记录，按固定规则重算摘要；真实 runtime 源码和 hash 封存 | 合作方记录内部一致性，仍非独立后台真实性或身份认证 |
| 易用／真实接入／Jayu | 陌生卖家接入固定预约协议，外部验证缺失 | 公布可复用普通 HTTP/SQLite adapter，另跑原始官方 Flask tutorial：3 阶段相符、邮件未适配 | 新第三方项目 1 个；外部卖家独立接入与真人首次使用仍未验证 |

### 实际运行边界

- 相关测试为 `tests/delivery-stage-evidence.test.ts`、
  `tests/delivery-stage-probe.test.ts` 和现有接入 UI 测试，总计 22/22。
  测试包含实际 loopback 请求、SQLite 写入及新连接读取，并非只检查静态文字。
- 自建参考站四个 profile 的封存预期分别是：4 相符；2 相符＋2 不符；
  3 相符＋1 不符；3 相符＋1 不符。它们不是四个第三方或客户项目。
- 第三方是官方 Pallets/Flask `3.1.2` tutorial，固定上游提交
  `2c1b30d0503cfb064f1cb252e6614a06915a362a`。22 个原始文件运行前后全部不变。
  执行前封存的六项 baseline 预期全部符合；baseline 有 6 个逻辑 HTTP 操作、
  10 次实际 HTTP 请求（含重定向），其后公开 adapter 运行有 5 次原生请求、
  2 次数据库读取和 1 次应用重启。它们是同一个第三方项目的不同受控运行。
- 首次本地 adapter 语法错误发生在工厂运行前，空输出保留、0 HTTP；首次真正执行时
  adapter 错找 `div.body`，而上游使用 `p.body`，报告真实保留不符。修正 adapter 后
  另存新报告，上游源码与封存 plan 没有改动，不能把重测算成新的盲测或新项目。
- 本地 test sink 只用于自建参考站。Flask 原始项目没有邮件能力，因此其邮件阶段明确
  为 unsupported。没有真实外部收件、浏览器按钮操作、模型调用或真人试用。
- 相同 plan/run ID 在不同隔离数据库中可以生成相同的确定性报告摘要；摘要本身不能
  证明新鲜度、独立执行或签发者身份。导入 UI 只做本地记录核对，不改变验收或付款。

可复用源码见 `examples/delivery-stage-staging/README.md` 和
`examples/delivery-stage-flask/README.md`。原始测试记录、实际 stage 报告、源码归档和
来源清单见本批公开 benchmark；最终部署版本以发布台账为准，不用本机通过代替上线。
