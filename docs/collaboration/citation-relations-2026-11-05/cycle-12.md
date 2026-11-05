# 第12轮：逐个锁定页面/字段的引文见证

修改前对照：PHAROS_INC（IBM Bob2026 August Challenge第一名）的确定规则与清晰报告维度，Agent Receipt（August Most Innovative）的证据关联维度。官方证据 https://www.bemyapp.com/insights/ai-builders-challenge-with-ibm-bob-2026-winners.html ，本批11-05重读；没有对手源码或同条件测评。

起点差距CR-2：第11轮ID可确保出处准确，不能保证所选出处属于锁定要求。只读控制复现：menu.html Tea AUD18正确、about.html同值，模型只引about仍可supported；menu16/about18已有mismatch override且必须保留。跨卡片拼价和跨form拼标签旧guard已unknown，不将它们误报为刚发现falsepass。

本轮门槛：raw supported仅当每个买家确认businessCheck对应同file、完整源owner span都在模型引用中时保留；错页/同页错block/只引页头/多个check漏一均unknown并说明未建立证据关联，不宣称交付缺失。rawunknown/changes不升级，已证实错误仍changes。独立DeepSeek计划评审见第11轮同批三步计划；修改后再提交对应源码评审、裁定及复验。

## 修改后独立裁定与对照

98/98针对性控制通过；真实DeepSeek scope3次，原始/应用状态3/3与事先参考一致，3份准入、无自动重试，usage估算USD0.0056322。错页/错字段/漏页面/页头的forced-false-supported由独立V2controls验证，并非声称真实模型每次都产生这些错误。

DeepSeek修改后评审确认negative-only及完整同页span关系，另报两条问题。独立核对均未确认成真实漏洞：所谓“长路径截断”实际已使用固定标签；所谓合法输入超600，真实生产maxPathLength160/label80/MAX_SAFE_INTEGER原解释为English567/中文370，未越界。仍对旧mismatch解释做长路径显示省略的可读性改进，不能冒称已复现bug修复。原评审、反证、前后日志都保留。

PHAROS_INC确定检查维度：从“源码某处正确就可保留supported”，收紧到每个锁定file+owner均须见证，真实错误仍明确changes。Agent Receipt关联维度：ID合法与对应要求的关联现在分开判断。剩余差距是复杂结构家族有限、自由语义仍需独立复核和外部实际使用；没有对手同条件测量，不宣称整体等同或超过。第13轮只新增明确两单元格表格行，复杂/不明确保持unknown。
