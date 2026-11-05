# 第9轮：用确定性negative guard限制纯逗号返工

同维度参照仍为官方PHAROS_INC August第一名的数据/规则/可读报告、Agent Receipt MostInnovative的证据回查：[获奖公告](https://www.bemyapp.com/insights/ai-builders-challenge-with-ibm-bob-2026-winners.html)，11-05重新读取。只是官方功能层比较，无竞品源码、同条件测试或得分。

起点是第8轮真实回退：非逐字标题仅在and前多逗号，模型又判changes；先前prompt的64/64不能证明稳定修复。BC两条把原始&写成&amp;导致整报告citation拒绝，也完整保留，不模糊改引文或重复抽样挑绿。

DeepSeek plan返回额外schema字段而协议无效，不能称批准；原finalAssistantText可复核。采纳它与实际反例一致的有限negative guard和明确排除条件，拒绝strip spaces/dots、lowercase/acronym等无必要泛化。post有效且findings空，仍只是选定源码只读AI建议，不是独立执行或获奖实力认证。

实现仅承认完整的The <pageSlug> page content must contain the article title <ASCII words>有限语法、真实中英生成metadata标题、source_text范围、无买家业务检查。对应basename唯一、直接text h1唯一且唯一引文完整覆盖原始h1元素，完整词序仅多一处`, and `时，rawchanges改证据不足并解释不能单凭逗号要求返工。绝不自动supported；rawunknown、逐字/数字/inline/实体/多标题/错页/多引文/其他词差/追加运行义务都不继承。规则失败和运行边界优先；原始模型响应、风险、引文、合同与付款不改。

8项测试先7绿1红，修改后关联120/120；当前/历史item6、item7/risk4拒绝与18项label路径亦通过。最后完整1291/1291，类型0，选定新源码与测试lint0，打包11/11。精确计数以最终日志和发布ledger为准。

对保留R8两份留出原答做零网络回放16项：仅CleanBlog coverage8从changes变unknown，所有其他条目/引用/风险/限制保持不变，quote/付款不变。参考希望supported，仍保留15/16一致，**不为了绿色分数自动宣称合格**。这是应用规则行为，不是新模型准确率；新增模型/网络均0。R9冻结31实现文件，完整文本与freeze/control均公开。

再次比较：纯逗号返工这一窄、可证明误建议已有源码规则兜底；证据链支持追溯原答、规则更正和原始上下文。剩余真实差距包括模型生成精确引文的稳定性、指定完整句缺失的保守unknown、跨字段/跨页语义与动态来源范围，以及未新增的真实客户/真人验证。R8原始62/64模型、55/64应用、6/7报告与2接受3保留2拒绝仍显示，不用早先最好分数替代。不能声称全面超过获奖作品。
