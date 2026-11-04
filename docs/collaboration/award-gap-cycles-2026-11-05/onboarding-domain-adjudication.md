# 第2轮：本地控件发现领域实现与独立裁定

日期：2026-11-05（墨尔本）。此文件记录纯领域实现；页面操作、发布和最终全量检查由根代理分别记录。没有在此把本地测试写成线上验证或陌生卖家研究。

## 同一冠军维度的修改前后

| 参照强项／工程门槛 | 修改前 | 本次实际实现与证据 | 仍未关闭的差距 |
| --- | --- | --- | --- |
| The Green Room：自己的输入与清楚的产出；普通卖家的实际HTML应先推动准备任务。[官方获奖描述](https://www.bemyapp.com/insights/ai-builders-challenge-with-ibm-bob-2026-winners.html) | 已有13字段配置、静态预检和四文件下载；用户仍须先手填selector。 | 新HTML得到有原标签、aria、name／id、form上下文、行号及准确source hash的候选。独立新命名的虚构HTML有13个唯一候选，手动应用后原预检通过。 | 没有独立外部卖家的完成时间或理解成功率证据；来源明确的候选并非自动正确映射。 |
| Jayu：输入推动具体可见动作；建议应能衔接下一步。[Google官方描述](https://developers.googleblog.com/en/announcing-the-winners-of-the-gemini-api-developer-competition/) | 配置错误可被指出，但准备层不能利用现有HTML提供映射起点。 | 候选selector严格复用原预检子集；实际独立HTML建议可组成旧schema并静态通过，之后仍使用原四文件生成器。UI必须逐项确认，领域层不自动赋予权限。 | 纯静态处理，没有新增真实AI调用、浏览器业务执行、后端验证或自动审批；不能推断整体效果优于参照。 |

## 实施范围

- `lib/onboarding-document.ts`：共享256KiB、4096节点、64层有界活动树解析；迭代遍历，不遍历惰性template内容。整个文档超限时失败，不返回部分候选。
- `lib/seller-onboarding.ts`：原递归walk改用共享文档解析；旧配置schema、现有四文件生成器和native completion逻辑保持原样。
- `lib/seller-control-discovery.ts`：13字段候选、歧义、缺失和不支持状态。每字段最多8候选，超限保留明确原因；来源摘要绑定当前HTML。
- 只生成能在当前文档唯一匹配的稳定ID／name／data属性或稳定form作用域selector。重复ID和无法稳定选择的控件不被任意选为首项。
- 密码、隐藏、禁用、只读、inert及明确静态隐藏的控件不推荐；input值、textarea文本、客户option内容不用于语义。
- requestOperation仅在同一select存在全部固定协议值时建议，不能用任意input或描述文字伪造协议覆盖。

## 已复现并修复的缺陷

1. **现有预检栈溢出。** 8192层div及一个input共90,133bytes，小于文件上限，却使原递归walk抛RangeError。共享迭代遍历现在返回`html_depth_limit`，原预检和候选发现均保留整体失败；4100个宽节点返回`html_node_limit`。
2. **中文过宽匹配。** 首次测试发现“到店人数”会因“到店”被当作时段语义。已移除这个过宽token，中文aria-labelledby／人数／时段各自正常识别。
3. **form覆盖相反语义。** DeepSeek指出预约form内“改期时间”仍可能作为create.slot候选，独立执行反例证实。现在控件自身明确的cancel／move／retry语义优先拒绝相反角色，不受form上下文覆盖；reset按钮也不作为提交动作候选。

## DeepSeek审阅裁定

第一次审阅：`outputs/award-gap-cycles-2026-11-05/round2-domain-review-1.json`协议有效。其第一、第二条finding在各自evidence／reproduction中已明确承认“不构成缺陷”，分别来自不存在的option文本拼接和已被catch／按字段保留的配额路径，独立驳回，没有为这些指控改变实现。第三条如上复现、采纳并修复，新增确切反例。

针对该真实修复的最后审阅`round2-domain-review-final.json`已完成、协议有效，`findings=[]`；明确只复核角色冲突和reset排除。所有AI意见均属只读源码判断；实际执行结果来自下面的测试，不把AI审阅描述为已运行程序。

## 领域验证

`tests/seller-control-discovery.test.ts`新增11项；与原9项`seller-onboarding.test.ts`合跑20/20通过。包含独立正常HTML→13唯一候选→原预检、同名多form作用域、重复ID与多候选、中文及aria-labelledby、协议选项缺失、客户输入值不泄漏、脚本／外链／template不执行、深树／宽树、编码／大小上限、source hash变化、候选配额与语义冲突。

正常fixture：`tests/fixtures/seller-onboarding-independent.html`，不沿用原示例字段名，可供UI状态组合测试。对应浏览器输入副本保存在`outputs/award-gap-cycles-2026-11-05/round2-independent-booking.html`。原CLI、SDK实际click与native completion的旧测试继续通过。

本轮判定为准备层门槛已实现，冠军相关的易用性差距**部分缩小**。固定后端协议、原生处理器接入、批准目标、运行时DOM与真正外部卖家使用效果，仍由后续实际证据决定。
