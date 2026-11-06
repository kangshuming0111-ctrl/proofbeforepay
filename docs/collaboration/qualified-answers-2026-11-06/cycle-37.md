# 第 37 轮：可选模型提议不能自行授权返工

- 日期：2026-11-06。
- 起点：v85 的三个 qualified 回答；本轮具体代码以 `outputs/three-gaps-2026-11-06/cycle37-risk-owned-source-freeze.json` 为准。该子任务没有提交或发布；后续 C38 修改同一组件的反馈按钮，不能把本轮组件 SHA 冒充后续整站 SHA。
- 主差距：`C37-OPTIONAL-LEAD-AUTHORITY`。逐项状态可以正确，可选风险仍可能把未经观察的 visible、未确认的 Signup 页面身份及新增字段命令当成用户下一步。
- 参照：Agent Receipt，IBM Bob 2026 **August Challenge Most Innovative**；PHAROS_INC，同赛事 **August Challenge 1st Place**。均不是该赛事 Grand Prize。
- 官方来源：[BeMyApp 获奖公告](https://www.bemyapp.com/insights/ai-builders-challenge-with-ibm-bob-2026-winners.html)，本轮于 2026-11-06 直接重新读取。公告分别描述 evidence-linked authority receipts，以及 deterministic rules 与 reporting。观察层级仅为主办方描述，没有操作、源码审计或同条件可靠性比较。

## 动手前的差距

v85 的原始首答及原发布结果未被改写。保留证据包括：

- `outputs/three-gaps-2026-11-06/ai-prospective/cycle35/root-independent-whole-answer-review.json`：12 项目中，应用整答仍有三个 qualified。
- 同目录 `known-final-live.json` 与 `fresh-first-live.json`：完整原 HTTP 捕获、严格工具回答和当时应用报告。
- `outputs/three-gaps-2026-11-06/cycle37-risk-before.json`：动手前六维对照、源文件 SHA、三个原答输入及 raw body SHA。

其中两个跨页回答的风险标题使用 visible 或将 index.html 片段称为 Signup；建议即使包含 if/confirm，仍在提出具体加字段或删除片段。另一个 qualified 是逐项可见性措辞。C37 只解决**可选风险的权限与呈现**；逐项源码事实由 C36 另行处理，不将其成果冒充本轮模型能力提升。

| 差距 ID／维度 | 同一参照可观察强项 | 我们动手前的证据 | 本轮可检验门槛 |
| --- | --- | --- | --- |
| C37／用户价值 | Agent Receipt 将动作与权限依据区分 | 用户可能把 Signup 风险标题当成已确认页面身份 | 公共标题仅用中性编号；具体断言位于未核验原文折叠 |
| C37／功能深度 | PHAROS_INC 将规则与报告相连 | 稳定 item 状态及混合要求可能绕过 v1–v3 暂缓 | 非空、其余未绑定的源码提议进入明确 v4；旧优先级不变 |
| C37／AI 实际贡献 | Agent Receipt 将 AI 行为关联到权限证据 | 有效引文不证明可见性，也不建立新义务 | 保留有用 item 判断及全部原提议，不把 if/confirm 当授权 |
| C37／完整产品流程 | Agent Receipt 强调权限复核 | active risk 可以被复制为关联返工来源 | v4 在界面及服务器均不能成为 linked repair；人评不解除暂缓 |
| C37／可信度与说服力 | Agent Receipt 描述可导出、可回放的证据 | 新发布池确实变化，旧全等回放不能声称未变 | 完整原风险 1:1 保留，严格导出；显式核算迁移并标记 changed |
| C37／易用性与真实接入 | PHAROS_INC 描述 clear reporting | 非开发者可能把条件性的模型命令当成订单要求 | 双语中性提示、原文披露、意见与动作分开；不声称真人上手已验证 |

这些是本项目的工程门槛，不是对参照作品未公开实现的推测，也不是新的官方评分规则。

## DeepSeek 方案意见与独立裁定

只发送显式列出的相关源码、公共／虚构测试材料及上述有限参照事实，不发送凭据或私人合同。

1. 首份方案评审 `outputs/three-gaps-2026-11-06/cycle36-risk-plan-deepseek.json` 因额外 JSON 字段不满足评审 schema，原件保留，没有冒充有效评审。文件名属于早期准备阶段，不代表另完成一轮。
2. 有效方案评审：`outputs/three-gaps-2026-11-06/cycle37-risk-plan-deepseek-valid.json`。
3. 独立方案裁定：`outputs/three-gaps-2026-11-06/cycle37-risk-plan-adjudication.json`。

采纳严格的 v4 判别及排他 metadata，并将原措辞和引文放在同一个未核验披露中。驳回“pool-less v4 report”的伪状态：当前版本存在于 disposition 中，没有额外的 report-level v4 身份；删除 provenance 不能由验证器凭空识别，更不能为了猜测它而破坏旧导入。旧 v1 `not_withheld` 被放行的说法也与实际判断式及评审自身推演相矛盾。

实现后有效评审在 `outputs/three-gaps-2026-11-06/cycle37-risk-post-deepseek.json`。唯一 P2 认为确认人评后可以建立任意 criterion 的返工，但它自己的复现描述承认 v4 marker 会拒绝。独立增加了买家／卖家确认意见后向两个不同普通 criterion 调用 `requestChanges` 的反例，均被拒绝；因此驳回。结果和保留限制见 `cycle37-risk-final-adjudication.json`。

## 实际实现与用户结果

新增 `{version:4, reason:"optional_source_leads_unverified"}`，其优先顺序为：

1. v1 真实 item 状态调整；
2. v2 有限电话／邮箱文字范围；
3. v3 自定义要求待观察；
4. v4 非空、其余尚未独立绑定的源码模型提议；
5. 无风险时维持原来的 v1 `not_withheld`。

v4 将 active risks 清空，将**全部经过现有结构与引用校验的原 risk 对象**按原索引保留在 withheld entries。title、explanation、suggestion、citations 均不由 v4 改写；原始 HTTP 捕获另行完整保留。`adjustedCriteria=[]`，禁止伪造 scope IDs，不改变任何 item 状态、说明、引文或义务记录。

这不是逐条验证风险，也没有判断每一条风险为真或为假。它是权限边界：当前可选 risk 结构没有独立锁定的 criterion、owner 或 observation 绑定，因此不能自行授权返工。原模型并未因为移池而“修好”。即使其中某条提议看起来合理、使用 if/confirm 或引用真实源码，也仍保留为未核验提议。

改动范围：`lib/contracts.ts`、`lib/assessment-publication-policy.ts`、`lib/evidence-export.ts`、`lib/risk-reviews.ts`、`lib/risk-repairs.ts`、`app/components/DeliveryAssessment.tsx`，以及对应测试。最终 SHA 和大小记录在 `outputs/three-gaps-2026-11-06/cycle37-risk-owned-source-freeze.json`。

实际用户看到中性的“未核验模型提议 N”。原始断言、建议及完整引文在明确标注未核验的原文折叠中。人评单独追加到精确 delivery／assessment／origin／original index，不会释放 v4、认定问题已解决、自动验收或付款。该区没有关联返工操作；服务器对 v4 version 或 reason marker 也明确拒绝 linked repair，即使畸形记录同时放入 active risk。

导出验证拒绝错误 version/reason、active 与 withheld 并存、scope metadata、伪造调整、空／超量条目、错索引、缺少 risk 字段及不匹配引文。旧 v1–v3 和显式 legacy 导入语义保留。验证一致性不能证明原 provider 身份、原模型语义正确或观察确实执行。

## 验证与单独的历史回放迁移

| 验证层 | 实际结果 | 证据与限制 |
| --- | --- | --- |
| C37 生产相关 focused | 37/37，TypeScript 0，diff check 通过 | `cycle37-risk-final-adjudication.json`；本地受控领域／导出／真实组件 SSR，不是线上 HTTP 或真人测试 |
| 三个旧首答精确回放 | 3 项目、5 条原风险逐一进入 v4；item 状态不变，原回答不变，网络 0 | `outputs/three-gaps-2026-11-06/cycle37-risk-retained-replay.json`；明确 `publishedPoolChanged=true`、`publishedFieldsUnchanged=false`，不是新推理 |
| 双语组件 SSR | 原标题／说明／建议／引用都在未核验折叠内；无 linked repair；畸形 active-v4 不展示为可执行风险 | 实际 `DeliveryAssessment` 编译与 DOM 结构断言；没有把 SSR 等同浏览器交互或真人上手 |
| 人评／返工领域 API | 双方人评不改 report、gate、acceptance、payment；确认意见后仍不能为任意 criterion 生成 v4 linked repair | `recordRiskReview`、`snapshotRiskFeedbackSource`、`requestChanges` 反例；未声称执行真实认证 HTTP 请求 |
| 历史 replay 工具修正 | 11/11，TypeScript 0；导出源码树 6 项目／6 criteria 中 3 报告、3 原 active 风险发生显式迁移 | `cycle37-replay-exported-tree/replay-result.json` 与 `validation-summary.json`；网络 0 |
| 后续旧测试兼容修正 | 指定六文件 65/65，TypeScript 0，diff check 通过 | `outputs/qualified-answers-2026-11-06/cycle37-test-compat-adjudication.json`；只改测试，不改生产、closure、fixture 或 gold |

v4 是真实的发布池变化。旧 historical replay 最初正确拒绝整份 published core 全等；没有通过改历史 baseline 或假称原结果未变来抹掉这一点。主线程单独授权的工具修正，只允许原 active 风险完整、原序、原引用进入 v4，加上一条精确固定系统提示。其余 core 字段继续严格比较。缺旧 disposition 明记为 `legacy_without_disposition`，不补造历史 ledger。

迁移行强制 `publishedFieldsUnchanged=false`，另存完整 `originalActiveRisks`、`newWithheldEntries`、原索引与数量；风险 lineage 另从保留的原 provider body／catalog slots 还原核对。system 文本兼容仍仅允许 `messages[0].content`，其余请求字节、用户 packet、model、token limit、工具 schema 均严格不变。删除／调序／改写风险或引文、添加 item 字段、改变状态或其他 limitations 均有拒绝反例。

工具有效 DeepSeek postreview 为零 findings：`outputs/three-gaps-2026-11-06/cycle37-replay-post-deepseek.json`。独立执行与裁定在 `cycle37-replay-final-adjudication.json`，两文件冻结在 `cycle37-replay-owned-source-freeze.json`。测试兼容修正的有效零 findings 评审为 `outputs/qualified-answers-2026-11-06/cycle37-test-compat-post-deepseek.json`，六文件冻结为 `cycle37-test-compat-source-freeze.json`。

## 修改后再次对照同一参照

| 原维度与同一参照 | 修改前 | 修改后及证据 | 门槛状态 | 仍需保留的差距 |
| --- | --- | --- | --- | --- |
| 用户价值／Agent Receipt | 风险标题可能替用户决定 Signup 身份 | 中性编号＋明确的未核验原文，真实组件双语 SSR 已验 | 本地门槛满足 | 真人是否理解两类结果仍未验证 |
| 功能深度／PHAROS_INC | 只在部分状态／范围组合暂缓风险 | v1–v3 后有 v4 统一 fallback，zero-risk／legacy 兼容保留 | 本地门槛满足 | 不等于覆盖任意自然语言或浏览器行为 |
| AI 实际贡献／Agent Receipt | 可选模型文字可能越过约定授权 | informative item 保留，全部原风险保留且非 actionable | 权限门槛满足 | 原模型整答质量仍须独立审阅，移池不提高原答准确率 |
| 完整流程／Agent Receipt | active 来源可形成关联返工 | 人评不释放，界面与领域 API 都拒绝 v4 repair source | 本地门槛满足 | 最终线上认证路由／版本回读由主线程另验 |
| 可信度／Agent Receipt | 新旧发布变化容易被概括为“仍不变” | 严格导出＋显式 changed 迁移账本＋完整原首答保留 | 本地门槛满足 | 一致性不是 provider authenticity 或真实客户有效性 |
| 易用性／PHAROS_INC | 条件命令可能让买家误加字段 | 风险本身不再提供执行入口；C38 另补范围澄清下一步 | 部分缩小 | 人类参与者为 0，陌生商家首次使用仍未验证 |

本轮缩小的是**提议、证据、约定权限与可执行动作的混淆**，并保留完整可回放原件；不能据此声称整体超过获奖作品。没有对参照应用作同条件实测，也没有竞品准确率、获奖概率或整体优越性结论。

后续只读 C36/C38 adversarial 检查又发现 implicit 外部 form owner 的真实 P2，已由 C39 另行修复；它不应被隐去或冒充 C37 的成果。其后独立原反例、正常／异常 owner、v4 namespace 和 C38 映射复核在 `outputs/qualified-answers-2026-11-06/root-ro-owner-recheck.json`。其中初次尝试导出 evaluator-only 记录被严格 source-rule replay 正确拒绝；没有修补该历史记录，正式导出反例使用完整受控 fixture。

用户暂缓的 Devpost 与视频继续暂缓。新模型轮次、最终发布、真实浏览器检查和全套回归属于主线程的后续集成台账，不能从本轮本地通过数推断完成。
