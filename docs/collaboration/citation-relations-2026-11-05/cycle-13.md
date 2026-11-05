# 第13轮：有限结构关联、未见项目首测与回归

修改前对照：PHAROS_INC（IBM Bob2026 August Challenge第一名）的确定数据规则及清晰报告、Agent Receipt（August Most Innovative）的可复核证据链；官方 https://www.bemyapp.com/insights/ai-builders-challenge-with-ibm-bob-2026-winners.html 。只比较官方描述可见维度，没有对手源码或相同任务实测。

起点CR-3：前两轮解决可精确寻址及已锁定简单块的逐项引用，但<table><tr><td>菜名</td><td>AUD金额</td></tr>仍保守未知，不能靠散落字段的存在建立商品-金额关系。

范围：仅买家已确认文件/唯一label/精确ISO币种金额的两直接纯文本cell表格row；无nested/rowspan/colspan/隐藏/动态/CSS缺失不确定；保留p/li限制，不能开放table内任意p。原文tr完整span定位、每个file/check的model引文见证均保留。对复杂未知不自动升级，source事实不能自动验收或付款。

计划DeepSeek已审本批三步方案，独立接受明确owner和锁定file的有限recognizer、拒绝过度推广。完成后送实际源码post-review与独立裁定，然后固定实现跑原有回归及两个不同发布者的新项目首答。语料参考预封存，首次结果/失败不覆盖；新任务来自公开模板原件，非真实客户合同，也不代表训练集未知。

整答复核新增问题：第11/12轮11条主状态虽全参考一致，4整答仍全部qualified。BC风险对footer缺句却只引产品段，额外footer名字/页外断言过宽；三个scope报告都把已由businessChecks指定的两页说成未确定，其中一份与自己后一句冲突。保留原答，不将状态正确当整答完美。第13轮同时强化“已知锁定file与未运行页面的不同”“每个位置断言需要该位置源码”的指令，新增展开引文长度预算提示；重新真实调用检查效果，不声称仅改提示就已消除错误。

## 实测后的差距复查

112/112focused、全套1341/1341、package11/11、tsc通过。DeepSeek首post不是有效JSON，三条源码推理未由20+1真实入口控制复现；原答保留且无approval。带反证的followup有效JSON，未建立当前窄结构缺陷，也明确不作模型效果/冠军结论。

然而实际新项目首答暴露了更高层问题：new2/12 raw11、app6，整答2拒；known7/64 raw64、app56（6准入），整答1接受/5qualified/1拒。原始工具JSON均有效、目录精确，仍发生GF两页falsepass和静态关系误伤。scope6实测完整保留，不能把源码定位可靠等同完整语义。

同维度后对照：Agent Receipt式原文定位/可复查性改善，但“结论与跨字段事实一致”仍有实际缺口；PHAROS式确定检查扩了2cellrow，但范围分类还会过度阻断可检查静态事实。需要追加第14轮，不宣称完成整体追平。
