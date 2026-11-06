# 第40轮：在有限源码证据足够时明确诊断标签缺口

- 日期：2026-11-06 Melbourne；起点：C39的7个已见回归，原始/应用13/14，一项跨页假通过安全降未知。
- 主差距G40：服务器已能独立完整检查有限标签分组，但原raw supported被引用守卫挡下后只说“补引用”，未用足够的全源码事实诊断缺口。
- 参照：IBM Bob 2026 August Challenge 1st Place **PHAROS_INC**，官方描述的规则与清楚报告；August Most Innovative **Agent Receipt**，官方描述的证据和所授权限。[主办方公告](https://www.bemyapp.com/insights/ai-builders-challenge-with-ibm-bob-2026-winners.html)，2026-11-06核实。只是官方描述，未同条件测量，不声称整体超过或总冠军身份。

## 动手前的六维对照

|维度|当前实际差距|本轮门槛|
|---|---|---|
|用户价值|跨页source labels假通过只被暂缓，用户无法区分确切分组缺口与单纯引用不足|证据足够时明确“没有任一page/form具备完整声明标签集合”，不指派猜测页面去加字段|
|功能深度|有限描述符、完整输入与独立负向扫描已存在，但未用于原supported纠错|只有先被标签引用守卫降未知的raw supported可进入独立源码证伪；任何不完整/歧义继续未知|
|AI实际贡献|最新7答原始1假通过，应用保护但未正确诊断该项；13/14不能算全正确|原始与应用分别计数，独立server诊断不能归功于模型；raw unknown绝不晋升|
|完整流程|标签变化仍不能决定业务页面身份或验收付款|既有status-adjusted审计保留原supported，反馈仍按C38先澄清范围，不授权改猜测页|
|可信度|前17答、首次Google拒报及后续7答均已见|所有原答/封存/参考保留；此次是后续已见回归，不制造新首测或改gold|
|易用与真实接入|正确静态差异应可读，失败与未知仍需明确|增加一个有界诊断路径，用户不增加技术输入；真人与商户验证仍未建立|

## 待讨论方案与否决条件

不从“少一个引用”推断“少一个字段”。候选必须是原始raw supported、当前source-only有限`html_labels`族、标签引用守卫确实将其降未知、仍有合法原引用，且无关联锁定业务检查。独立复用完整sent HTML/coverage/解析/owner检查，只有`no_complete_group`才发布有限源码`changes_suggested`。原始raw unknown、未命中标签守卫、空引用、完整group但缺引用、HTML遗漏/截断、解析/foreign/implicit owner不确定、runtime条件及既有业务目标均不能借此升级。

PAGE依旧按页面分组，FORM依旧按有限已建立owner；“Contact/Signup/Flight”不变成file authority。原始supported与应用changes的差异进入既有status-adjusted审计，不新增自动验收/付款，不伪造原模型认为有缺口。DeepSeek方案与主代理独立裁定完成前不改生产；修改后精确回放已知false-positive、正常、缺引用与各类未知边界，再冻结复测。

## After

实现、反例、模型评测、同一G40前后对照与保留项在完成后补记；本节目前不表示任何已实施效果。

## 实际after与明确保留

实现用了真实`labelCitationAdjusted`触发标记、原raw supported、当前未知、合法非空原引文、实际交付HTML与sent逐字双向一致、无关联业务检查，以及独立全源`no_complete_group`的全部条件。原raw unknown、仅缺引用但源码完整、foreign/implicit owner或输入/解析不完整均不升级。所有supported→changes用既有v1状态审计保留原值，原风险原序暂缓；canonical只说有限源码差异，不给role文件修改命令。

|同一G40/官方参照|修改前|实际after|本轮结论与未解决项|
|---|---|---|---|
|PHAROS_INC清楚诊断/用户价值|两份真实旧raw false-positive只能显示引用不足|两个旧答完整catalog零网络回放现在独立诊断源码changes，原引文不变；外部12个实际函数控制无成立P1/P2|有限功能门槛满足；这是server证伪，不归功于模型，也不是新增真实调用|
|Agent Receipt证据/权限|不应从引用缺口或模型自述推缺字段/页面任务|全源覆盖/解析/owner证明与原supported→published changes审计齐备；C38仍先问页面归属|不确认业务role映射，不自动改代码、验收或付款；原unknown不升级|
|AI实际贡献/可信度|C39已见7应用13/14，原报告保留|C40再次7已见各一次，raw/app12/14、38/38引用、14 IDs齐、0拒报；父级全文raw3接受/3保留/1拒绝，应用5接受/2保守未知|没有用后答替换旧答。此批无raw supported假通过发生，新增证伪的直接证据来自上行两个真实旧答受控回放，而非虚构本批修正计数|

两个真实残余仍公开：Earth表格关系被模型误加逐字条件，应用仅保护为人工解释；Google跨页原始unknown明确role范围不清，按边界继续未知。两者都不是正确诊断或通过，12/14不写成“全部修完”。本批USD0.0352599；本资料阶段24次调用估算USD0.1244316，连同链接的前44次共68次估算USD0.389745，只是这些记录，非项目生命周期用量或账单。全部原始报告、源码/参考、冻结、独立全文评审及Apache2许可在新公开记录，旧three-gaps记录不覆盖。

源码相关父级全局1783/1783、type0；资料完整性/链接静态审阅和最终浏览器/公开源码核验另行记录。没有继续扩大表格语义引擎、放宽strict解码或追加调用；真人效果和独立商户验证仍未建立，Devpost/视频继续暂缓。
