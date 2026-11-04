# 第4轮：复核与返工响应顺序的实现、复核裁定

代码与测试冻结于2026-11-05（墨尔本）。`app/page.tsx` SHA256：`624a1e7352ed6c1f3c0f938efa9cb991b88e47e5731503b1b40d671c4a6d3d2a`；`lib/quote-response-fence.ts` SHA256：`fcf32cd9ee4749d25f4de059ad0a1c34078fa4aa4766f24630c8d1472b217921`。文档不代表网站已经发布；上线与浏览器验证由主代理记录。

## 同维度前后比较

参照已核实的 Jayu（Google Gemini 2024 Best Overall App）把理解推进为用户界面行动的可观察强项，[Google主办方公告](https://developers.googleblog.com/en/announcing-the-winners-of-the-gemini-api-developer-competition/)。这里比较的是我们的“AI风险→人工复核／返工任务→当前保存结果可见”的用户任务；不推断Jayu的内部一致性协议、测试覆盖或财务行为。

修改前真实page函数的有限调度已复现：返工任务响应先显示，迟到的risk-review响应又把当前quote及记录列表覆盖成旧catalog。反方向旧task响应也会覆盖先显示的复核结果。服务端数据并未证明丢失；用户界面会短暂呈现旧结果并可能在下一步遇到旧目录冲突。这是实现层P2，不是已经发生资金或权限丢失。

修改后，原render的project/delivery/perspective/revision随独立回调保留；首次响应完整替换，迟到但仍同view的响应只发一次现有`GET /api/quotes/:id`读取最新完整记录。不会拼接两个quote或重发POST。GET也验证其开始时的view、revision及刷新序号；更晚的apply或GET使旧读取失效。人工复核POST成功与随后读取失败分开，前者仍返回true，页面明确“已保存，需刷新，无需重复提交”；网络不确定时复核表单保留理由并提醒先核对，不断言未保存。

本轮发现并补齐了两个不能忽略的集成反例：单人工具的seller工作台合法地收到server buyer角色，不能把工作台视角等同成员身份；openCase也同步发布真实workspace角色。owner demo切换角色的旧GET不能覆盖期间已到达的任务响应，需以目标角色重读一次并在同调用栈apply及提交切换。若切换先成功、旧buyer任务响应随后到达，只对同项目同版本的owner demo读取当前seller投影，不恢复buyer对象；已换项目／版本仍直接忽略。

因此，这一具体用户任务已从可复现倒退改为受上述反例验证的收敛／安全忽略。它补足了行动后结果可靠可见的差距；不能据此声称整体超过Jayu或冠军。真实浏览器并发、真实D1竞争和陌生用户上手仍不在下述离线证据范围内。

## DeepSeek独立复核与裁定

保留输出：

- `outputs/award-gap-cycles-2026-11-05/round4-response-review.json`：协议有效，findings=0。输入为helper、相关tests、RiskReviewPanel、服务器角色解析与带源码SHA/准确行号的实际page有限片段。没有发送整个大page、环境文件、凭据或私人材料。
- `outputs/award-gap-cycles-2026-11-05/round4-response-context-supplement-review.json`：协议有效，findings=0。只补首个packet明确省略的完整openCase/startCase/switch guard、render revision与mutate delivery allowlist，未重复泛化审查。

独立裁定：接受两次审查的来源与执行限制；审查并未自行运行测试、浏览器或网络。0 findings表示这些packet未找到可复现新增缺陷，不能代替整体通过证明。第一个回复提到的`refreshSingleFlight`并不存在，本实现是每个迟到response至多一次读取、序号使旧GET失效，不据此新增所谓缺失功能。第二个回复推测有“setQuote(null)时重置fence的effect”，源码没有该effect；fence为唯一useRef，首次事件lazy创建，不因render或clear重建。其“roleplay先发布新role再写ticket revision”的表述也不准确：原render ticket在发起读取前捕获，只有有效目标投影返回后afterApply才同步提交切换。这些推测没有作为已验证事实或整改需求。

没有接受“所有成功POST都应恢复旧view”“boolean无法表达保存成功但读取失败”“view角色必须等于任何server成员角色”等扩大／错误方案。真实权限仍由服务器解析，本次协调器只管客户端响应顺序。

## 验证与局限

新增／适配的21个定向test通过，执行命令：

```
node --experimental-strip-types --test tests/quote-response-fence.test.ts tests/evidence-catalog-refresh.test.ts tests/risk-review-save-feedback.test.ts
```

其中实际page有限函数通过`stripTypeScriptTypes`与deferred request测试调度，包含双向risk/task、stale GET、合法新delivery、同步project/version/role/clear、两种owner-demo切换顺序、单人工具成员角色差异、保存成功读取失败、错误endpoint变异及记录列表。RiskReviewPanel实际submit处理器验证false／throw保留理由并先核对，SSR验证中英文正常／只读边界。它们没有运行React DOM的完整事件／effect调度。

独立代理在同一冻结SHA完成：helper 12/12、真实page函数17/17、实际`resolveProofRole`与page expectedRole回调3/3。证据分别为`round4-independent-fence-probe-after.json`、`round4-independent-page-probe-final.json`、`round4-independent-role-contract-final.json`；保留原roleplay 11/12失败的before版本，不覆盖历史失败。有限page调度将React state commit延后，以验证同步ref保护；这仍不是登录浏览器／D1实测。

`tsc --noEmit`通过；helper与相关测试ESLint为0，`git diff --check`通过。全page ESLint没有声称通过：当前31 errors／8 warnings，与HEAD同为31／8，基线与当前JSON均保留于outputs。本轮没有引入新的page lint错误，也没有为通过检查关闭规则。整套／build／发布／在线动作由主代理独立记录，不能用上述定向结果替代。

后续候选保持明确：单条独立risk生成结构化返工请求、真实浏览器下并发回归及外部用户首次使用证据；原有criterion item草稿入口已存在，本轮其他切片补准确锁定原文，不能重复报成没有功能。
