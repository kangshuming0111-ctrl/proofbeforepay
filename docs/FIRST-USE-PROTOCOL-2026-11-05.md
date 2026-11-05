# 首次使用与外部卖家接入：可执行记录协议

日期：2026-11-05。当前状态：**工具和任务已准备；此文档不包含真实参与者结果。**

本协议服务于小店网站外包验收：买家定义要求，卖家提交网站，双方查看证据、返工及复测。它分别检验不熟悉项目的买家能否使用产品，以及外部技术卖家能否接入自己的授权测试网站。开发者走查、AI 评审、两个由同一人操作的账号和命令行测试都不能替代这些观察。

参照仅使用主办方可核实的描述：[The Green Room（IBM Bob 2026 Grand Prize）](https://www.bemyapp.com/insights/ai-builders-challenge-with-ibm-bob-2026-winners.html) 展示了明确的作者输入和角色交互产出；[Jayu（Gemini API Developer Competition 2024 Best Overall App）](https://developers.googleblog.com/en/announcing-the-winners-of-the-gemini-api-developer-competition/) 展示视觉理解和跨应用操作。我们的本项门槛是陌生用户完成具体任务和外部开发者实际接入的观察记录。官方介绍不证明它们零配置、没有失败或经过与我们相同的人类测试，本协议也不据此宣称超过它们。

## 招募与准备

- 买家：不参与本项目开发、此前没有看过演示或走查的人。给出一个虚构小店网站需求，不要求其懂编程。建议每人约 15–20 分钟。
- 技术卖家：不参与本项目开发、此前未接入本产品的开发者，使用自己已有、明确授权且可丢弃的 staging 网站。建议每人约 30–45 分钟。若暂时没有授权 staging，可将接入任务记为阻塞；不能拿预设样例当作独立接入成功。
- 不预先解释按钮顺序，不先播放产品演示。说明研究只观察工具易用性，参加、自愿退出或拒答不影响任何权益；在开始前征求记录这些去标识观察的同意。
- 分配随机 `p-xxxxxx` 形式的参与者代号和 `session-xxxxxx` 会话号。记录文件不放姓名、邮箱、账号 ID、邀请链接、密码、API key、合同、真实客户资料或付款资料。不要保存代号和真实身份的对应表。
- 仅使用虚构要求和测试网站；不进行真实收费，不发送邮件给实际他人，不把测试网站开放为任意目标扫描器。卖家测试使用现有服务器授权和独立回读机制，不绕开运营方审批。
- 记录准确线上版本或源码短 SHA。测试前说明哪些数据是演示、哪些操作真的保存。若版本中途改变，结束本会话，另开后续记录；不能将熟悉后的重试算新的首次使用者。

## 三个买家任务

按顺序给出以下任务。观察者只读任务，先让参与者尝试；需要帮助时记录发生次数、问题和阻塞代码，然后提供最少帮助。

1. `create-requirements`：你是一家虚构面馆的店主，外包一个信息网站。写清营业时间、菜单价格和一项需要实际提交并保存的询价功能；不上传合同也能继续。请创建并确认验收标准。观察其是否理解“锁定要求”、可选合同及文本与运行要求的区别。
2. `interpret-evidence`：卖家已提交一版文件。请找出一项未满足的内容和一项还缺运行证据的能力，并说明你认为下一步应该做什么。观察其是否把“源码建议符合”误当功能全通过、把 AI 风险误当合同义务，或以为必须由买家提供卖家交付文件。
3. `request-revision`：针对确实在约定范围内的问题，准备并发送一条修改／补证请求。请找到它绑定的版本和标准，再查看卖家换版后的证据。观察其是否能区分保存个人意见、编辑草稿和正式退回；不要求接受或付款。

## 三个技术卖家任务

1. `integrate-staging`：从自己的授权可丢弃 staging 开始，按页面接入说明完成字段映射、执行适配、独立回读及所需授权。记录实际改动文件数量、是否需要运营方协助、主要阻塞。仓库／域名不用写入本记录；仅写不含身份的数量和现象。没有独立回读时不能记完成。
2. `submit-delivery`：用卖家身份提交网站文件及本版适用证据，执行一个虚构业务任务；检查在完成提示之外能否独立读回对应记录。模拟“只显示成功但未写记录”的版本时，应该能指出无法证实，而不是据提示通过。
3. `repair-and-retest`：读取买家一条已绑定标准／版本的正式请求，提交修正版并重新检测。指出旧报告为什么没有自动变成本版已通过，找到新版本的原始观察及待买家复核状态。不要求真实资金或自动验收。

完成的定义是该任务的可观察结果已经实现。因不会操作而未完成记 `blocked`；主动退出或时间结束记 `abandoned`。有帮助后完成仍记 `completed`，同时保留 `helpCount > 0` 及遇到的阻塞。不能把观察者代替参与者操作后产生的结果当作参与者独立完成。

## 记录格式和命令

记录器：`scripts/record-first-use-session.mjs`。它只验证输入和汇总手工观察，无法确认身份、同意或会话真的发生。输入文件本身也不要含私人资料。每个 persona 都必须包含三个任务，包括未完成项；时间必须是实际观察记录并转换成 ISO UTC 毫秒格式。任务时间不能重叠，应在会话范围内。

以下是**不可直接当结果使用的填写模板**，替换全部占位符后才能通过校验。不要为测试工具而填写虚构的 `human_first_use` 会话；工具测试应使用 `synthetic`。

```json
{
  "schema": "proofbeforepay-first-use-session-v1",
  "sessionId": "session-REPLACE",
  "mode": "human_first_use",
  "persona": "buyer",
  "participantCode": "p-REPLACE",
  "unfamiliarWithProject": true,
  "externalParticipant": true,
  "consent": {"status": "granted", "recordedAt": "ACTUAL-UTC-ISO-TIMESTAMP"},
  "buildTag": "ACTUAL-VERSION-OR-COMMIT",
  "startedAt": "ACTUAL-UTC-ISO-TIMESTAMP",
  "endedAt": "ACTUAL-UTC-ISO-TIMESTAMP",
  "tasks": [
    {"id":"create-requirements","startedAt":"ACTUAL-UTC-ISO-TIMESTAMP","endedAt":"ACTUAL-UTC-ISO-TIMESTAMP","outcome":"completed","helpCount":0,"blockerCode":"none","note":"ACTUAL-OBSERVATION-WITHOUT-PII"},
    {"id":"interpret-evidence","startedAt":"ACTUAL-UTC-ISO-TIMESTAMP","endedAt":"ACTUAL-UTC-ISO-TIMESTAMP","outcome":"blocked","helpCount":0,"blockerCode":"unclear_evidence","note":"ACTUAL-OBSERVATION-WITHOUT-PII"},
    {"id":"request-revision","startedAt":"ACTUAL-UTC-ISO-TIMESTAMP","endedAt":"ACTUAL-UTC-ISO-TIMESTAMP","outcome":"abandoned","helpCount":0,"blockerCode":"other","note":"ACTUAL-OBSERVATION-WITHOUT-PII"}
  ]
}
```

`persona` 可为 `buyer`、`technical_seller`；技术卖家的任务 ID 使用上一节的三个值。`mode` 可为 `human_first_use`、`operator_walkthrough`、`synthetic`。只有提前同意、外部参与者且此前不熟悉本项目的 `human_first_use` 才有资格进入人类首次使用汇总；其他模式永远被排除。拒绝同意者不进行人类测试，也不创建人类观察记录。

```sh
node scripts/record-first-use-session.mjs --input /absolute/path/to/entered-session.json --output /absolute/path/to/private-records/session-record.json
node scripts/record-first-use-session.mjs --summarize /absolute/path/to/private-records
```

输出文件必须位于现有目录，使用排他创建和仅当前用户读写权限，不覆盖旧记录。汇总目录仅放会话 JSON，最多 200 个；相同会话 ID 被拒绝，相同参与者的后续会话不再算新首次使用者。私密原始记录应留在本机被忽略的 `outputs/` 子目录或另一个受控本机位置，不能混进公开源码包。汇总也需人工检查隐私后才能公开。

`blockerCode` 为 `none`、`unclear_next_step`、`unclear_evidence`、`setup`、`authorization`、`runtime_failure`、`other`。备注最多 300 字符；工具拒绝控制字符、邮箱、HTTP 链接及常见凭据文本，仍不能保证能自动发现所有私人资料，观察者须先去标识。技术细节应描述“需运营方批准一次”“修改两个适配文件”，不要填写账号或网址。

## 如何判读而不夸大

- 没有合格真实会话时，`--summarize` 以 `NO_HUMAN_FIRST_USE_SESSIONS` 失败且不输出成功报告。准备好的任务、记录器测试和 AI 走查都不能据此生成用户分数。
- 汇总仅给出观察过的任务数、完成／阻塞／放弃数、无帮助完成数、帮助次数、累计耗时和阻塞分类；不生成冠军差距评分、客户成功率或获奖概率。
- 不同版本、persona、测试网站和参与者经验会影响结果。小型便利样本的结果只能支持本次任务的观察，不能推导所有客户都能操作或外部接入普遍无需协助。
- `human_first_use` 是观察者的声明，工具不会把它认证成真实独立研究。若参与者撤回同意，应删除对应本机记录并重新生成汇总；已经公开的材料需按实际去标识记录重新审查。
- 当前必须继续保留“陌生买家观察待验证”“外部技术卖家独立接入待验证”。完成工具不能关闭这两个证据缺口。

## 新 AI 迁移样本的独立判读

`scripts/assessment-project-corpus-five-remediation-2026-11-05.json` 是本轮新作者样本，8 项目、每项两条标准。开始真实调用前，由主代理独立核对标准、源码、期望状态和风险范围，冻结原始文件及实现依赖闭包。`reference` 下的内容只能供事后裁定，不能进入模型请求。

必须分别保存原始模型输出和应用结果，对每条状态、解释、引文、风险标题、风险解释、建议和局限进行整答裁定。准确引用不等于推断成立，状态一致不等于整答正确；文案同义不能替代明确要求的逐字匹配，静态表单和成功提示不能证明持久存储／退款／邮件，省略图片像素不能变成“图片交付缺失”的风险。

新样本不能覆盖旧基线、失败或 qualified 结果。未调用的准备、零网络 dry run、真实 API 结果和真实陌生人操作分别报告，不能混为同一个成功分母。
