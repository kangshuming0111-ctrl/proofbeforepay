# 第4轮：AI复核、返工状态一致与准确补证上下文

日期：2026-11-05（墨尔本）。修改前主站v65、源码`d15f13352d686fdc9eb405efd7af011d5b48dedd`，Lab19不变。第3轮真实4次调用保留完整审阅与质量限定，不因8/8主状态吻合关闭所有差距。

## 修改前同维度冠军差距

| 参照与已核实强项 | 当前证据 | 本轮用户任务门槛 |
| --- | --- | --- |
| Jayu，Google Gemini 2024 Best Overall App；视觉理解推动界面动作。[Google官方公告](https://developers.googleblog.com/en/announcing-the-winners-of-the-gemini-api-developer-competition/) | AI item已有草稿入口与真实退回，不能报不存在。但saveRiskReview迟到响应会把先到返工结果覆盖回旧目录；真实page函数抽取调度已复现，root lock为true也无效。服务器任务未丢，界面随后会旧catalog/409。 | 人工复核和返工并发时，两个已保存结果收敛到最新服务器状态；旧响应不能倒退当前视图或记录列表，换项目/版本/角色不恢复旧视图。成功保存与随后刷新失败分开表达，不自动重发写请求。 |
| The Green Room，IBM Bob 2026 Grand Prize；输入产出清楚。[主办方公告](https://www.bemyapp.com/insights/ai-builders-challenge-with-ibm-bob-2026-winners.html) | 第3轮月木实际退款的unknown状态正确，但通用解释丢掉24小时/原卡/记录细节。 | 用户可直接查看准确锁定要求，补证草稿保留这一要求；不把不可信模型运行断言重新当事实，不添加合同义务。 |

独立只读审查：`outputs/award-gap-cycles-2026-11-05/ai-to-repair-readonly-audit.md`及可重跑`ai-risk-late-response-probe.mjs/.json`。已模型化交错顺序，尚不冒充浏览器/D1并发实测。

## 先讨论、独立裁定

`outputs/award-gap-cycles-2026-11-05/round4-plan-review.json`协议有效。传入有限组件/测试及带当前page SHA的实际函数片段。采纳：两种响应顺序都要覆盖，独立子组件响应需要携带原请求视图/revision，成功保存与读取最新失败分开反馈，草稿携带准确要求。

独立裁定：其建议“成功POST应在任何视图apply”会恢复已切走的项目/角色，驳回；服务端成功可以返回true但不能强行导航旧视图。把独立risk没有草稿入口当本轮criterion-source的阻断混淆了两个功能；现有criterion item已有draft入口，本轮在该入口补原文，独立risk结构化草稿仍是后续候选。其称boolean签名不能表达成功后refresh失败也不成立：内部返回明确状态，保存boolean与页面notice分别表达即可。风险等级按已复现影响裁定为UI状态P2，不升级为财务/权限问题。

现有context/revision guard可复用；不得取消确认、自动重试POST或合并两个可能不一致的quote对象。刷新也要有独立revision与上下文边界；失败保留最新已显示状态及明确后续动作。

## 实施与再次比较待补

成功结果、源证据、旧/新版本、未解决项和可重跑验证必须补齐，未填不算本轮完成。独立risk到结构化返工入口作为明确后续候选保留，不以“新版本没同名风险”自动当修复。

## 实际实施与固定源码验证

新增小型response-fence：请求保留原视图/revision，冲突时只读一次完整最新投影，不合并quote、不重发POST。同步live view覆盖apply、restore、open/clear和角色切换；独立子组件callback保留开始该请求的render票据。保存成功与随后读取失败分开反馈。单人工具工作台视角与服务端会员身份分开，owner角色切换只接收正确目标投影；跨角色晚写通知可受保护地刷新当前投影，不能恢复旧角色payload。

独立交错检验实际又找到角色切换GET倒退（中间11/12），已修并保留原失败；主代理指出并修正单人工具role契约与openCase同步ref。最终固定page SHA256 `624a1e7352ed6c1f3c0f938efa9cb991b88e47e5731503b1b40d671c4a6d3d2a`，helper `fcf32cd9ee4749d25f4de059ad0a1c34078fa4aa4766f24630c8d1472b217921`。独立同快照17个真实page函数调度、3个实际server resolver+page role契约、12个helper场景全部通过。它们不是浏览器/React/DB并发实测。

每项AI建议新增完整锁定原文，草稿保留准确要求与标明来源的已保存说明；补证/修改草稿分开。1000限制下显式节选、完整原文保留、不断surrogate。原始模型运行断言、验收和付款规则未改。11个新UI/helper/SSR反例通过，相关69项通过。

全套固定源码**1073/1073**、TypeScript、build前差异检查通过。新增helper/tests及UI focused ESLint通过；整页ESLint继承31errors/8warnings，与修改前相同，不能称全仓库lint清零。两份响应切片DS及最终UI DS协议有效、findings0，仍只当静态建议；逐条独立裁定见`round4-response-review-adjudication.md`与`round4-ui-review-adjudication.md`。

| 同一参照维度 | 修改前 | 修改后已执行证据 | 差距与边界 |
| --- | --- | --- | --- |
| Jayu：理解推进到可行动结果 | 已保存返工目录会被较旧复核/角色读取覆盖，用户需手刷或遇409 | 双向响应、换上下文、保存成功读失败、目标投影等实际函数17场景及实际角色3场景通过；旧失败保留 | 特定状态倒退缺陷关闭；未据离线调度声称所有React/网络/DB并发完美。 |
| The Green Room：清楚输入产出 | AI unknown草稿只有泛化说明，24小时/原卡/记录原文在较远的核查区 | 每项旁完整原文；短草稿完整携带要求；长草稿明确节选并可展开全文 | 本轮行动上下文门槛满足；上线后需核对实际回填和未自动提交。 |

真实v65浏览器另建虚构项目`8f8c70c1-da86-4735-9572-dd9abe43a99d`：锁定2句要求→卖家上传4文件→按需真实AI报告保存→卖家提交→买家旧草稿只含通用说明。此应用调用与第3轮四例freeze分开记录，不混成同一评测分母。上线新版后会用同项目核对新增原文、可编辑草稿、人工复核保存/刷新与离线证据包，再补发布台账。

## v66线上验收与最终前后对照（本轮完成）

实测发布v66，来源`b26837733defdc347f18abeae6f7180655f1985e`，部署`appgdep_6aeb487f7788819183c269cf472422f1` succeeded，环境版本6、custom audience保持。真实页面恢复相同虚构项目及已保存AI报告，未重新运行模型。选择第6项并展开新原文，完整保留“24小时内实际自动退款至原支付卡并保存可查询记录”；点击补证后，可编辑草稿包含同一全文、标明来源的当前说明与未发送/非验收提示。前后实际草稿JSON与截图留存。切成英文再切回中文，DOM原文逐字相同。

买家实际保存`needs_evidence`复核，返回保存成功；点击刷新项目后仍显示1条买家待补证记录。页面仍等待买家验收、正式反馈0条；未退回、未接受交付、未付款。独立从服务器下载统一证据包：4个文件、6条已保存AI评估、1条riskReview，acceptanceReferences为空；CLI与Lab19实际浏览器都显示记录内部一致。导出包含的本次应用调用usage为3436输入/728输出，按已核价格保守估计USD0.0019044；与第3轮4调用分开，五次合计估计USD0.0071685，均非账单核验。

| 对照的同一强项 | 线上修改前 | 线上修改后 | 判定 |
| --- | --- | --- | --- |
| The Green Room：输入与产出清楚 | 相同退款项目的补证草稿没有24小时/原卡/记录 | 原文就在该条旁，草稿完整带入三项限制，语言切换不改原文，未自动提交 | 本轮可行动上下文差距关闭。长原文节选由11项回归验证，不冒充本例浏览器已输入3000字。 |
| Jayu：操作得到可靠可见结果 | 已复现旧响应能回退quote与records | 固定源码交错17+3+12场景通过；线上正常复核保存、重新读取、服务器导出与独立核对器均成功 | 已复现状态倒退关闭；线上正常链路补验，不冒充已人为操纵真实网络先后顺序。 |

公开可复查的虚构导出及CLI结论见`public/benchmarks/award-gap-cycles-2026-11-05/ui-evidence-bundle.json`与`ui-evidence-verification.json`。最后一次文档/证据发布保持上述产品代码哈希不变，其准确source/version以独立release ledger和公开SOURCE-MANIFEST为准。

仍未关闭的总体差距：外部真实卖家独立接入与陌生用户完成率；任意网站框架/后台/动态行为范围；独立risk与准确标准绑定的结构化返工入口；已有页级lint技术债；更多真实客户AI整答泛化。媒体/Devpost按用户要求暂缓。四轮已关闭当前执行范围内的可复现缺陷，不能由此给整体冠军差距百分比或宣布所有维度零差距。
