# 第22轮：旧新源码同包独立重放

- 日期：2026-11-06 Melbourne；起点 v76 / dfe974ab0c6aa82bd258e66efcd55a7da9c8a631。后续来源以本批发布台账为准。
- 官方来源（2026-11-06重新核实）：https://www.bemyapp.com/insights/ai-builders-challenge-with-ibm-bob-2026-winners.html ；https://developers.googleblog.com/en/announcing-the-winners-of-the-gemini-api-developer-competition/ 。仅官方介绍层级，没有同条件竞品测试。
- PHAROS_INC 为 IBM Bob2026 August Challenge 1st Place；Agent Receipt 为 August Most Innovative；The Green Room 为 Grand Prize；Jayu 为 Gemini2024 Best Overall App。精确奖项不能互换。
- 比较是自有工程门槛，不是官方额外评分规则，不推断对手不存在同类问题。Devpost、视频继续暂缓。

## 修改前对照

主差距 G22：当前版证据包不含全部旧源码，修订链离线重放有限。参照 Agent Receipt。本轮门槛：2至5选定版本完整原始源码与保存报告、逐版规则重放、派生文件差异，缺失和超限明确拒绝，真实性边界保留。

| 维度 | 修改前与本轮检验重点 |
| --- | --- |
| 用户价值 | 店主是否知道具体结果与下一步，保留未知状态 |
| 功能深度 | 2至5选定版本完整原始源码与保存报告、逐版规则重放、派生文件差异，缺失和超限明确拒绝，真实性边界保留 |
| AI贡献 | 原文、判断、确定规则和执行观察分别记录，不让一项代表全部 |
| 完整流程 | 原始约定、卖家证据、版本、返工和人工决定保持绑定 |
| 可信度 | exact来源、当前/历史、可重放、错误记录不得隐藏 |
| 易用/真实接入 | 陌生用户和外部卖家结果待验证，作者走查另记 |

## DeepSeek与独立裁定

对应审阅、裁定及源码哈希保留在 outputs/full-gap-remediation-2026-11-06；有效与无效工具回复分别记录。实施后补充同维度对照，未完成不能标为关闭。

## 修改后同维度对照

| 同一差距/参照 | 修改前 | 修改后与准确证据 | 状态与剩余 |
| --- | --- | --- | --- |
| G22 / Agent Receipt可回放关联 | 离线只含当前交付源码 | 2至5选定版本完整保存源码+逐版原报告，重新算每版规则及文件增删改 | 选定旧源码重放已实现；不是全部历史目录 |
| 可信度 | 未签名内部自洽 | 源码固定公钥校验官方应用签发，私钥只在Sites秘密环境；错误签名无unsignedfallback | 证明应用签发该导出，内容事实/后台执行/人员身份/付款仍不证明 |
| 功能/权限 | 无旧新同包接口 | 认证与成员、quote/version和目录/返工头末尾CAS；缺源/超限/变更整体拒绝 | 25项联合领域/真实Request+SQLite(既有存储controlledadapter)测试通过，非D1/线上结果 |
| 完整流程 | 当前验收上下文不能移到旧版 | archived-core保留实际旧source/acceptanceEvidence；不引入当前quotelevel资金同意/返工事件/补充目录 | 原始未保留历史字段明确不可还原 |
| 用户/易用 | 单包当前文件 | 下载前后两版，Lab签发与版本选择后续浏览器验证 | 真人效果待验证 |

DeepSeek第一次corepost格式无效保留；有效post无findings。Issuer有效post无生产正确性问题；两个P3通过新增延迟密钥导入测试和真实签发公有凭据fixture独立验证强化，7项issuer测试通过。私钥预检输入关闭echo且不持久化，写Sites secret envrevision8后已清空session store，不进入源/前端/Git/聊天。公钥随官方验证器分发，不能用包内自报公钥替换。
## CLI 签发包接通补检

集成时发现真实工具缺口：下载界面产出正式签发 envelope，但原 `verify-revision-audit.mjs` 只接受 unsigned audit core。已将同一 CLI 接通 `verifyIssuedRevisionAudit`；可辨认的 audit／receipt 包在签发失败、缺 receipt、未知 key 或 schema 伪装时均不退回未签名核对。原 unsigned core 仍能核对内部一致性，并明确标记 `issuance.status=unproven`。

相关领域／Request-handler／CLI 测试新增后 **15/15**；新增子进程测试实际禁用网络 API，覆盖 raw core exit 0，以及未知 key、假签名、缺 receipt、伪装 schema 各 exit 1。没有读取生产私钥；正式站点签发包的实际 CLI 读取由 root 在上线后另记。修正记录：`outputs/full-gap-remediation-2026-11-06/cycle-22-cli-adjudication.json`。这项工具补检不改变 AI 评估或旧版证据规则。

一次有限 DeepSeek 后审产生一项 P3，独立执行后部分采纳：内层审计不一致时，签发验证器没有运行，原先却显示 `digest_mismatch`。root 已将这一路径改为准确的 `audit_inconsistent`。审阅中的“未知 key／假签名都会变成 invalid_receipt”推断经实测不成立：三种情况分别保留 `unknown_key`、`signature_invalid`、`invalid_receipt`。缺失和结构错误的 receipt 共享结构性错误代码符合本接口约定，没有为区分它们而放宽失败边界。

永久测试既检查 verifier spy 未被调用，也在真实 CLI 子进程核对错误原因和拒绝码；所有无效包继续拒绝、无 unsigned fallback、无未验证 audit 暴露。详见 `cycle-22-cli-post-adjudication.json` 与 `cycle22-cli-post-correction-tests.log`。这是诊断准确性修正，不改变 AI 判断、验收或付款。旧 Lab v24 对应的原始记录保持原样，修正版本另行构建和登记。
